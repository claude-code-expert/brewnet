/**
 * DomainManager — Core lifecycle service for domain external access.
 *
 * Orchestrates connect / disconnect / list / status operations for mapping
 * local Brewnet services to external domains via Cloudflare Tunnel.
 *
 * Shared by both CLI commands and Admin Server REST API.
 *
 * @module services/domain-manager
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import type { WizardState, DomainConnection, DomainScenario } from '@brewnet/shared';
import {
  getDnsRecords,
  deleteDnsRecord,
  createDnsRecord,
  configureTunnelIngress,
  getTunnelHealth,
  getActiveServiceRoutes,
  type ServiceRoute,
} from './cloudflare-client.js';
import { addExternalLabels, removeExternalLabels } from './compose-generator.js';
import { loadState, saveState } from '../wizard/state.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectOptions {
  /** Overwrite existing CNAME record if conflict detected */
  force?: boolean;
  /** Scenario override (auto-detected if omitted) */
  scenario?: DomainScenario;
}

export interface StepResult {
  step: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

export interface ConnectResult {
  success: boolean;
  hostname: string;
  externalUrl: string;
  steps: StepResult[];
  error?: string;
}

export interface DisconnectResult {
  success: boolean;
  appName: string;
  removedHostname: string;
  steps: StepResult[];
  error?: string;
}

export interface AppInfo {
  name: string;
  containerName: string;
  port: number;
  running: boolean;
  alreadyConnected: boolean;
  hostname?: string;
}

export interface DomainStatusInfo {
  appName: string;
  local: { url: string; healthy: boolean };
  external: { url: string; dnsResolved: boolean; httpsReachable: boolean };
  tunnel: { status: 'healthy' | 'degraded' | 'inactive'; connectorCount: number };
  dns: { type: string; name: string; content: string; proxied: boolean } | null;
}

// ---------------------------------------------------------------------------
// DomainManager
// ---------------------------------------------------------------------------

export class DomainManager {
  private projectName: string;
  private state: WizardState;

  constructor(projectName: string) {
    this.projectName = projectName;
    const loaded = loadState(projectName);
    if (!loaded) {
      throw new Error(`Project "${projectName}" not found. Run \`brewnet init\` first.`);
    }
    this.state = loaded;
  }

  /** Reload state from disk */
  reload(): void {
    const loaded = loadState(this.projectName);
    if (loaded) this.state = loaded;
  }

  /** Get a copy of the current state */
  getState(): WizardState {
    return structuredClone(this.state);
  }

  // ── connect ──────────────────────────────────────────────────────────────

  /**
   * Connect a local app to an external domain via Cloudflare Tunnel.
   *
   * Steps: health check → ingress update → DNS create → Traefik labels → persist → poll DNS
   * Rolls back on failure.
   */
  async connect(
    appName: string,
    subdomain: string,
    domain: string,
    options: ConnectOptions = {},
  ): Promise<ConnectResult> {
    const hostname = `${subdomain}.${domain}`;
    const steps: StepResult[] = [];
    const cf = this.state.domain.cloudflare;

    if (!cf.tunnelId || !cf.apiToken) {
      return {
        success: false,
        hostname,
        externalUrl: `https://${hostname}`,
        steps,
        error: 'Cloudflare credentials not configured. Set API token and tunnel ID first.',
      };
    }

    // Determine container port for the app
    const containerPort = this.resolveContainerPort(appName);
    if (!containerPort) {
      return {
        success: false,
        hostname,
        externalUrl: `https://${hostname}`,
        steps,
        error: `Cannot determine container port for app "${appName}".`,
      };
    }

    // Determine scenario
    const scenario = options.scenario ?? this.detectScenario();

    // Step 1: Health check (local)
    const healthStart = Date.now();
    try {
      const healthy = await this.checkLocalHealth(appName, containerPort);
      if (!healthy) {
        steps.push({ step: 'health_check', status: 'failed', error: `App "${appName}" not responding on port ${containerPort}` });
        return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `APP_NOT_RUNNING: Local health check failed for ${appName} on port ${containerPort}` };
      }
      steps.push({ step: 'health_check', status: 'completed', durationMs: Date.now() - healthStart });
    } catch (err) {
      steps.push({ step: 'health_check', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `Health check failed: ${err}` };
    }

    // Step 2: Update tunnel ingress
    const ingressStart = Date.now();
    let previousIngress: ServiceRoute[] | null = null;
    try {
      previousIngress = getActiveServiceRoutes(this.state);
      const projectDomain = this.state.domain.zoneName;
      const builtinRoutes = previousIngress.map((r) => ({ ...r, domain: projectDomain }));
      const existingExtRoutes = (this.state.domainConnections ?? [])
        .filter((c) => c.appName !== appName)
        .map((c) => ({ subdomain: c.subdomain, containerName: this.resolveContainerName(c.appName), port: c.containerPort, domain: c.domain }));
      const newRoute: ServiceRoute = { subdomain, containerName: this.resolveContainerName(appName), port: containerPort, domain };
      const allRoutes = [...builtinRoutes, ...existingExtRoutes, newRoute];
      await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, domain, allRoutes);
      steps.push({ step: 'ingress_update', status: 'completed', durationMs: Date.now() - ingressStart });
    } catch (err) {
      steps.push({ step: 'ingress_update', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `Ingress update failed: ${err}` };
    }

    // Step 3: Create DNS CNAME record
    const dnsStart = Date.now();
    let cnameRecordId = '';
    try {
      // Check for existing CNAME
      const existing = await getDnsRecords(cf.apiToken, cf.zoneId, hostname);
      if (existing.length > 0 && !options.force) {
        // Rollback ingress
        await this.rollbackIngress(cf, previousIngress, domain);
        steps.push({ step: 'dns_creation', status: 'failed', error: `CNAME_CONFLICT: A CNAME record already exists for ${hostname}` });
        return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `CNAME_CONFLICT` };
      }
      if (existing.length > 0 && options.force) {
        // Delete existing before creating
        for (const rec of existing) {
          await deleteDnsRecord(cf.apiToken, cf.zoneId, rec.id);
        }
      }
      await createDnsRecord(cf.apiToken, cf.zoneId, cf.tunnelId, subdomain, domain);
      // Fetch the record ID for future deletion
      const created = await getDnsRecords(cf.apiToken, cf.zoneId, hostname);
      cnameRecordId = created[0]?.id ?? '';
      steps.push({ step: 'dns_creation', status: 'completed', durationMs: Date.now() - dnsStart });
    } catch (err) {
      // Rollback ingress
      await this.rollbackIngress(cf, previousIngress, domain);
      steps.push({ step: 'dns_creation', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `DNS creation failed: ${err}` };
    }

    // Step 4: Add Traefik external labels
    try {
      const composePath = this.getComposePath();
      if (fs.existsSync(composePath)) {
        addExternalLabels(composePath, appName, hostname, containerPort);
      }
      steps.push({ step: 'traefik_labels', status: 'completed' });
    } catch (err) {
      // Non-fatal — labels can be added manually
      steps.push({ step: 'traefik_labels', status: 'failed', error: String(err) });
    }

    // Step 5: Persist connection to state
    const connection: DomainConnection = {
      appName,
      subdomain,
      domain,
      hostname,
      tunnelId: cf.tunnelId,
      cnameRecordId,
      containerPort,
      connectedAt: new Date().toISOString(),
      scenario,
    };

    if (!this.state.domainConnections) {
      this.state.domainConnections = [];
    }
    // Remove existing connection for same app if any
    this.state.domainConnections = this.state.domainConnections.filter((c) => c.appName !== appName);
    this.state.domainConnections.push(connection);
    saveState(this.state);

    // Step 6: Poll DNS propagation
    const pollStart = Date.now();
    try {
      await this.pollDnsPropagation(hostname, 30_000);
      steps.push({ step: 'dns_propagation', status: 'completed', durationMs: Date.now() - pollStart });
    } catch {
      steps.push({ step: 'dns_propagation', status: 'skipped', durationMs: Date.now() - pollStart });
    }

    return {
      success: true,
      hostname,
      externalUrl: `https://${hostname}`,
      steps,
    };
  }

  // ── disconnect ───────────────────────────────────────────────────────────

  /**
   * Disconnect an app from its external domain.
   *
   * Steps: remove ingress → delete DNS → remove Traefik labels → update state
   * Atomic rollback on failure.
   */
  async disconnect(appName: string): Promise<DisconnectResult> {
    const steps: StepResult[] = [];
    const connections = this.state.domainConnections ?? [];
    const conn = connections.find((c) => c.appName === appName);

    if (!conn) {
      return {
        success: false,
        appName,
        removedHostname: '',
        steps,
        error: `NOT_CONNECTED: No external domain connection found for app: ${appName}`,
      };
    }

    const cf = this.state.domain.cloudflare;

    // Step 1: Remove ingress rule
    try {
      const remainingRoutes = getActiveServiceRoutes(this.state);
      const projectDomain = this.state.domain.zoneName;
      const builtinRoutes = remainingRoutes
        .filter((r) => r.subdomain !== conn.subdomain)
        .map((r) => ({ ...r, domain: projectDomain }));
      const remainingExtRoutes = (this.state.domainConnections ?? [])
        .filter((c) => c.appName !== appName)
        .map((c) => ({ subdomain: c.subdomain, containerName: this.resolveContainerName(c.appName), port: c.containerPort, domain: c.domain }));
      const filteredRoutes = [...builtinRoutes, ...remainingExtRoutes];
      if (cf.apiToken && cf.accountId && cf.tunnelId) {
        await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, conn.domain, filteredRoutes);
      }
      steps.push({ step: 'ingress_removal', status: 'completed' });
    } catch (err) {
      steps.push({ step: 'ingress_removal', status: 'failed', error: String(err) });
      return { success: false, appName, removedHostname: conn.hostname, steps, error: `Ingress removal failed: ${err}` };
    }

    // Step 2: Delete DNS CNAME record
    try {
      if (cf.apiToken && cf.zoneId) {
        if (conn.cnameRecordId) {
          await deleteDnsRecord(cf.apiToken, cf.zoneId, conn.cnameRecordId);
        } else {
          // Fallback: lookup by hostname
          const records = await getDnsRecords(cf.apiToken, cf.zoneId, conn.hostname);
          for (const rec of records) {
            await deleteDnsRecord(cf.apiToken, cf.zoneId, rec.id);
          }
        }
      }
      steps.push({ step: 'dns_deletion', status: 'completed' });
    } catch (err) {
      // Rollback: re-add ingress rule (restore all routes including the one being disconnected)
      try {
        const routes = getActiveServiceRoutes(this.state);
        const projectDomain = this.state.domain.zoneName;
        const allBuiltin = routes.map((r) => ({ ...r, domain: projectDomain }));
        const allExt = (this.state.domainConnections ?? [])
          .map((c) => ({ subdomain: c.subdomain, containerName: this.resolveContainerName(c.appName), port: c.containerPort, domain: c.domain }));
        const allRoutes = [...allBuiltin, ...allExt];
        if (cf.apiToken && cf.accountId && cf.tunnelId) {
          await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, conn.domain, allRoutes);
        }
      } catch { /* best-effort rollback */ }
      steps.push({ step: 'dns_deletion', status: 'failed', error: String(err) });
      return { success: false, appName, removedHostname: conn.hostname, steps, error: `DNS deletion failed: ${err}` };
    }

    // Step 3: Remove Traefik external labels
    try {
      const composePath = this.getComposePath();
      if (fs.existsSync(composePath)) {
        removeExternalLabels(composePath, appName);
      }
      steps.push({ step: 'traefik_cleanup', status: 'completed' });
    } catch (err) {
      steps.push({ step: 'traefik_cleanup', status: 'failed', error: String(err) });
    }

    // Step 4: Update state
    this.state.domainConnections = connections.filter((c) => c.appName !== appName);
    saveState(this.state);

    return {
      success: true,
      appName,
      removedHostname: conn.hostname,
      steps,
    };
  }

  // ── list ─────────────────────────────────────────────────────────────────

  /** Returns all active domain connections. */
  list(): DomainConnection[] {
    return this.state.domainConnections ?? [];
  }

  // ── status ───────────────────────────────────────────────────────────────

  /**
   * Get detailed status for a specific app's domain connection,
   * or all connections if appName is omitted.
   */
  async status(appName?: string): Promise<DomainStatusInfo[]> {
    const connections = this.state.domainConnections ?? [];
    const targets = appName
      ? connections.filter((c) => c.appName === appName)
      : connections;

    const cf = this.state.domain.cloudflare;
    const results: DomainStatusInfo[] = [];

    for (const conn of targets) {
      const info: DomainStatusInfo = {
        appName: conn.appName,
        local: { url: `http://localhost:${conn.containerPort}`, healthy: false },
        external: { url: `https://${conn.hostname}`, dnsResolved: false, httpsReachable: false },
        tunnel: { status: 'inactive', connectorCount: 0 },
        dns: null,
      };

      // Local health
      try {
        info.local.healthy = await this.checkLocalHealth(conn.appName, conn.containerPort);
      } catch { /* leave false */ }

      // Tunnel health
      if (cf.apiToken && cf.accountId && cf.tunnelId) {
        try {
          const health = await getTunnelHealth(cf.apiToken, cf.accountId, cf.tunnelId);
          info.tunnel = health;
        } catch { /* leave inactive */ }
      }

      // DNS verification
      if (cf.apiToken && cf.zoneId) {
        try {
          const records = await getDnsRecords(cf.apiToken, cf.zoneId, conn.hostname);
          if (records.length > 0) {
            info.dns = {
              type: 'CNAME',
              name: records[0].name,
              content: records[0].content,
              proxied: records[0].proxied,
            };
            info.external.dnsResolved = true;
          }
        } catch { /* leave null */ }
      }

      // External reachability (use dig as fallback)
      try {
        const resolved = await this.checkDnsResolution(conn.hostname);
        info.external.dnsResolved = info.external.dnsResolved || resolved;
      } catch { /* leave false */ }

      // HTTPS reachability
      try {
        info.external.httpsReachable = await this.checkHttpsReachable(conn.hostname);
      } catch { /* leave false */ }

      results.push(info);
    }

    return results;
  }

  // ── getConnectableApps ───────────────────────────────────────────────────

  /** Returns apps that can be connected to domains (running services not yet connected). */
  getConnectableApps(): AppInfo[] {
    const routes = getActiveServiceRoutes(this.state);
    const connections = this.state.domainConnections ?? [];

    return routes.map((route) => {
      const existing = connections.find((c) => c.subdomain === route.subdomain);
      return {
        name: route.subdomain,
        containerName: route.containerName,
        port: route.port,
        running: true, // We assume routes represent running services
        alreadyConnected: !!existing,
        hostname: existing?.hostname,
      };
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private detectScenario(): DomainScenario {
    const cf = this.state.domain.cloudflare;
    // Scenario A: Zone is managed by Cloudflare (zoneId is set and active)
    // Scenario B: Zone transferred to CF NS
    // Scenario C: CNAME-only (no NS delegation)
    // For now, default to 'A' — can be refined with zone status check
    if (cf.zoneId) return 'A';
    return 'C';
  }

  private resolveContainerPort(appName: string): number | null {
    const routes = getActiveServiceRoutes(this.state);
    const route = routes.find((r) => r.subdomain === appName || r.containerName === appName);
    return route?.port ?? null;
  }

  private resolveContainerName(appName: string): string {
    const routes = getActiveServiceRoutes(this.state);
    const route = routes.find((r) => r.subdomain === appName || r.containerName === appName);
    return route?.containerName ?? appName;
  }

  private getComposePath(): string {
    const projectPath = this.state.projectPath.startsWith('~')
      ? path.join(os.homedir(), this.state.projectPath.slice(1))
      : this.state.projectPath;
    return path.join(projectPath, 'docker-compose.yml');
  }

  private async checkLocalHealth(appName: string, port: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const resp = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
      clearTimeout(timeout);
      return resp.ok || resp.status < 500;
    } catch {
      return false;
    }
  }

  private async checkDnsResolution(hostname: string): Promise<boolean> {
    try {
      const result = await execa('dig', ['+short', 'CNAME', hostname, '@1.1.1.1'], { timeout: 10_000 });
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async checkHttpsReachable(hostname: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(`https://${hostname}/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return resp.ok || resp.status < 500;
    } catch {
      return false;
    }
  }

  private async rollbackIngress(
    cf: WizardState['domain']['cloudflare'],
    previousRoutes: ServiceRoute[] | null,
    domain: string,
  ): Promise<void> {
    if (!previousRoutes || !cf.apiToken || !cf.accountId || !cf.tunnelId) return;
    try {
      await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, domain, previousRoutes);
    } catch { /* best-effort rollback */ }
  }

  private async pollDnsPropagation(hostname: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const resolved = await this.checkDnsResolution(hostname);
      if (resolved) return;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error('DNS propagation timeout');
  }
}
