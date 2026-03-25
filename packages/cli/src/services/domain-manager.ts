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
import { readApps } from './app-registry.js';
import { getStackById } from '../config/stacks.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectOptions {
  /** Overwrite existing CNAME record if conflict detected */
  force?: boolean;
  /** Scenario override (auto-detected if omitted) */
  scenario?: DomainScenario;
  /** Optional line-by-line progress logger (e.g. to push into SSE stream) */
  onLog?: (line: string) => void;
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
    const isApex = subdomain === '@';
    const hostname = isApex ? domain : `${subdomain}.${domain}`;
    const wwwHostname = isApex ? `www.${domain}` : null;
    const steps: StepResult[] = [];
    const cf = this.state.domain.cloudflare;
    const log = (msg: string) => options.onLog?.(`[domain-connect] ${msg}`);

    log(`start: app=${appName} subdomain=${subdomain} domain=${domain}`);
    log(`cf state: tunnelId=${cf.tunnelId || '(empty)'} apiToken=${cf.apiToken ? '***' : '(empty)'} accountId=${cf.accountId || '(empty)'} zoneId=${cf.zoneId || '(empty)'}`);

    if (!cf.tunnelId || !cf.apiToken) {
      const err = 'Cloudflare credentials not configured. Set API token and tunnel ID first.';
      log(`FAIL: ${err}`);
      return {
        success: false,
        hostname,
        externalUrl: `https://${hostname}`,
        steps,
        error: err,
      };
    }

    // Determine container port for the app
    const containerPort = this.resolveContainerPort(appName);
    log(`resolveContainerPort(${appName}) → ${containerPort ?? 'null'}`);
    if (!containerPort) {
      const err = `Cannot determine container port for app "${appName}".`;
      log(`FAIL: ${err}`);
      return {
        success: false,
        hostname,
        externalUrl: `https://${hostname}`,
        steps,
        error: err,
      };
    }

    // Detect Next.js basePath for custom apps (needed for tunnel ingress URL)
    const appBasePath = this.resolveAppBasePath(appName);
    if (appBasePath) log(`detected basePath: ${appBasePath}`);

    // Determine scenario
    const scenario = options.scenario ?? this.detectScenario();
    log(`scenario: ${scenario}`);

    // Step 1: Health check (local)
    const healthUrl = `http://127.0.0.1:${containerPort}${appBasePath}/`;
    log(`step 1/6: health check → ${healthUrl}`);
    const healthStart = Date.now();
    try {
      const healthy = await this.checkLocalHealth(appName, containerPort, appBasePath);
      if (!healthy) {
        const err = `App "${appName}" not responding on port ${containerPort}`;
        log(`FAIL step 1: ${err}`);
        steps.push({ step: 'health_check', status: 'failed', error: err });
        return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `APP_NOT_RUNNING: Local health check failed for ${appName} on port ${containerPort}` };
      }
      steps.push({ step: 'health_check', status: 'completed', durationMs: Date.now() - healthStart });
      log(`step 1 OK (${Date.now() - healthStart}ms)`);
    } catch (err) {
      log(`FAIL step 1 exception: ${err}`);
      steps.push({ step: 'health_check', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `Health check failed: ${err}` };
    }

    // Step 2: Update tunnel ingress
    log(`step 2/6: configure tunnel ingress (accountId=${cf.accountId || '(empty)'}, tunnelId=${cf.tunnelId})`);
    const ingressStart = Date.now();
    let previousIngress: ServiceRoute[] | null = null;
    try {
      previousIngress = getActiveServiceRoutes(this.state);
      const projectDomain = this.state.domain.cloudflare?.zoneName || this.state.domain.name || domain;
      const builtinRoutes = previousIngress.map((r) => ({ ...r, domain: projectDomain }));
      const existingExtRoutes = (this.state.domainConnections ?? [])
        .filter((c) => c.appName !== appName)
        .flatMap((c) => this.connectionToRoutes(c));
      const newRoutes: ServiceRoute[] = isApex
        ? [
            { subdomain: '', containerName: this.resolveContainerName(appName), port: containerPort, domain, basePath: appBasePath || undefined },
            { subdomain: 'www', containerName: this.resolveContainerName(appName), port: containerPort, domain, basePath: appBasePath || undefined },
          ]
        : [{ subdomain, containerName: this.resolveContainerName(appName), port: containerPort, domain, basePath: appBasePath || undefined }];
      const allRoutes = [...builtinRoutes, ...existingExtRoutes, ...newRoutes];
      log(`ingress routes: ${JSON.stringify(allRoutes.map((r) => `${r.subdomain} → ${r.containerName}:${r.port}${r.basePath ?? ''}`))}`);
      await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, domain, allRoutes);
      steps.push({ step: 'ingress_update', status: 'completed', durationMs: Date.now() - ingressStart });
      log(`step 2 OK (${Date.now() - ingressStart}ms)`);
    } catch (err) {
      log(`FAIL step 2: ${err}`);
      steps.push({ step: 'ingress_update', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `Ingress update failed: ${err}` };
    }

    // Step 3: Create DNS CNAME record(s)
    log(`step 3/6: DNS CNAME check/create for ${hostname} (zoneId=${cf.zoneId || '(empty)'})`);
    const dnsStart = Date.now();
    let cnameRecordId = '';
    let wwwCnameRecordId: string | undefined;
    // Use '' as subdomain param for apex (createDnsRecord handles '' → name=domain)
    const apexSubdomainArg = isApex ? '' : subdomain;
    try {
      // Check for existing CNAME
      const existing = await getDnsRecords(cf.apiToken, cf.zoneId, hostname);
      log(`existing DNS records for ${hostname}: ${existing.length}`);
      if (existing.length > 0 && !options.force) {
        // Rollback ingress
        await this.rollbackIngress(cf, previousIngress, domain);
        const err = `CNAME_CONFLICT: A CNAME record already exists for ${hostname}`;
        log(`FAIL step 3: ${err}`);
        steps.push({ step: 'dns_creation', status: 'failed', error: err });
        return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `CNAME_CONFLICT` };
      }
      if (existing.length > 0 && options.force) {
        // Delete existing before creating
        for (const rec of existing) {
          await deleteDnsRecord(cf.apiToken, cf.zoneId, rec.id);
        }
        log(`deleted ${existing.length} existing CNAME record(s)`);
      }
      await createDnsRecord(cf.apiToken, cf.zoneId, cf.tunnelId, apexSubdomainArg, domain);
      // Fetch the record ID for future deletion
      const created = await getDnsRecords(cf.apiToken, cf.zoneId, hostname);
      cnameRecordId = created[0]?.id ?? '';
      log(`step 3 apex DNS OK — cnameRecordId=${cnameRecordId}`);

      // Apex: also create www CNAME
      if (isApex) {
        await createDnsRecord(cf.apiToken, cf.zoneId, cf.tunnelId, 'www', domain);
        const wwwCreated = await getDnsRecords(cf.apiToken, cf.zoneId, `www.${domain}`);
        wwwCnameRecordId = wwwCreated[0]?.id ?? '';
        log(`step 3 www DNS OK — wwwCnameRecordId=${wwwCnameRecordId}`);
      }

      steps.push({ step: 'dns_creation', status: 'completed', durationMs: Date.now() - dnsStart });
      log(`step 3 OK — cnameRecordId=${cnameRecordId} (${Date.now() - dnsStart}ms)`);
    } catch (err) {
      // Rollback ingress
      await this.rollbackIngress(cf, previousIngress, domain);
      log(`FAIL step 3: ${err}`);
      steps.push({ step: 'dns_creation', status: 'failed', error: String(err) });
      return { success: false, hostname, externalUrl: `https://${hostname}`, steps, error: `DNS creation failed: ${err}` };
    }

    // Step 4: Add Traefik external labels
    log(`step 4/6: Traefik labels for ${appName}`);
    try {
      const composePath = this.getComposePath();
      if (fs.existsSync(composePath)) {
        if (isApex) {
          addExternalLabels(composePath, appName, hostname, containerPort, [wwwHostname!]);
        } else {
          addExternalLabels(composePath, appName, hostname, containerPort);
        }
        log(`step 4 OK — labels added to ${composePath}`);
      } else {
        log(`step 4 SKIP — compose file not found at ${composePath}`);
      }
      steps.push({ step: 'traefik_labels', status: 'completed' });
    } catch (err) {
      // Non-fatal — labels can be added manually
      log(`step 4 WARN (non-fatal): ${err}`);
      steps.push({ step: 'traefik_labels', status: 'failed', error: String(err) });
    }

    // Step 5: Persist connection to state
    log(`step 5/6: persist connection to state`);
    const connection: DomainConnection = {
      appName,
      subdomain,
      domain,
      hostname,
      tunnelId: cf.tunnelId,
      cnameRecordId,
      ...(wwwCnameRecordId ? { wwwCnameRecordId } : {}),
      containerPort,
      connectedAt: new Date().toISOString(),
      scenario,
      ...(appBasePath ? { basePath: appBasePath } : {}),
    };

    if (!this.state.domainConnections) {
      this.state.domainConnections = [];
    }
    // Remove existing connection for same app if any
    this.state.domainConnections = this.state.domainConnections.filter((c) => c.appName !== appName);
    this.state.domainConnections.push(connection);
    saveState(this.state);
    log(`step 5 OK`);

    // Step 5.5: Nextcloud post-connect — fix overwritewebroot and trusted_domains
    if (this.resolveContainerName(appName) === 'nextcloud') {
      await this.fixNextcloudDomainConfig(hostname, log);
    }

    // Step 6: Poll DNS propagation
    log(`step 6/6: poll DNS propagation for ${hostname} (timeout 30s)`);
    const pollStart = Date.now();
    try {
      await this.pollDnsPropagation(hostname, 30_000);
      steps.push({ step: 'dns_propagation', status: 'completed', durationMs: Date.now() - pollStart });
      log(`step 6 OK (${Date.now() - pollStart}ms)`);
    } catch {
      steps.push({ step: 'dns_propagation', status: 'skipped', durationMs: Date.now() - pollStart });
      log(`step 6 SKIP — DNS not yet propagated (${Date.now() - pollStart}ms)`);
    }

    log(`SUCCESS: https://${hostname}`);
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
      const projectDomain = this.state.domain.cloudflare?.zoneName || this.state.domain.name || conn.domain;
      const builtinRoutes = remainingRoutes
        .filter((r) => r.subdomain !== conn.subdomain)
        .map((r) => ({ ...r, domain: projectDomain }));
      const remainingExtRoutes = (this.state.domainConnections ?? [])
        .filter((c) => c.appName !== appName)
        .flatMap((c) => this.connectionToRoutes(c));
      const filteredRoutes = [...builtinRoutes, ...remainingExtRoutes];
      if (cf.apiToken && cf.accountId && cf.tunnelId) {
        await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, conn.domain, filteredRoutes);
      }
      steps.push({ step: 'ingress_removal', status: 'completed' });
    } catch (err) {
      steps.push({ step: 'ingress_removal', status: 'failed', error: String(err) });
      return { success: false, appName, removedHostname: conn.hostname, steps, error: `Ingress removal failed: ${err}` };
    }

    // Step 2: Delete DNS CNAME record(s)
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
        // Apex: also delete www CNAME record
        if (conn.subdomain === '@' && conn.wwwCnameRecordId) {
          await deleteDnsRecord(cf.apiToken, cf.zoneId, conn.wwwCnameRecordId);
        }
      }
      steps.push({ step: 'dns_deletion', status: 'completed' });
    } catch (err) {
      // Rollback: re-add ingress rule (restore all routes including the one being disconnected)
      try {
        const routes = getActiveServiceRoutes(this.state);
        const projectDomain = this.state.domain.cloudflare?.zoneName || this.state.domain.name || conn.domain;
        const allBuiltin = routes.map((r) => ({ ...r, domain: projectDomain }));
        const allExt = (this.state.domainConnections ?? [])
          .flatMap((c) => this.connectionToRoutes(c));
        const allRoutes = [...allBuiltin, ...allExt];
        if (cf.apiToken && cf.accountId && cf.tunnelId) {
          await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, conn.domain, allRoutes);
        }
      } catch (rollbackErr: unknown) {
        console.warn('[domain-manager] Tunnel ingress rollback failed:', rollbackErr);
      }
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
      } catch (e) {
        console.warn('[domain-manager] checkLocalHealth failed:', e);
      }

      // Tunnel health
      if (cf.apiToken && cf.accountId && cf.tunnelId) {
        try {
          const health = await getTunnelHealth(cf.apiToken, cf.accountId, cf.tunnelId);
          info.tunnel = health;
        } catch (e) {
          console.warn('[domain-manager] getTunnelHealth failed:', e);
        }
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
        } catch (e) {
          console.warn('[domain-manager] getDnsRecords failed:', e);
        }
      }

      // External reachability (use dig as fallback)
      try {
        const resolved = await this.checkDnsResolution(conn.hostname);
        info.external.dnsResolved = info.external.dnsResolved || resolved;
      } catch (e) {
        console.warn('[domain-manager] checkDnsResolution failed:', e);
      }

      // HTTPS reachability
      try {
        info.external.httpsReachable = await this.checkHttpsReachable(conn.hostname);
      } catch (e) {
        console.warn('[domain-manager] checkHttpsReachable failed:', e);
      }

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
    if (route) return route.port;

    // Fallback: look up custom app created via `brewnet create-app`
    const appsJsonPath = path.join(os.homedir(), '.brewnet', 'apps.json');
    const apps = readApps(appsJsonPath);
    const found = apps.find((a) => a.name === appName);
    if (!found) return null;

    // Non-unified (split-stack) apps: connect to frontend port, not backend.
    // Frontend port is stored in appDir/.env as FRONTEND_PORT (default 3000).
    const stackEntry = found.stackId ? getStackById(found.stackId) : null;
    if (stackEntry?.isUnified === false && found.appDir) {
      let frontendPort = 3000;
      const envPath = path.join(found.appDir, '.env');
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^FRONTEND_PORT=(\d+)/m);
        if (match) frontendPort = parseInt(match[1]!, 10);
      } catch { /* use default 3000 */ }
      return frontendPort;
    }

    return found.port;
  }

  private resolveContainerName(appName: string): string {
    const routes = getActiveServiceRoutes(this.state);
    const route = routes.find((r) => r.subdomain === appName || r.containerName === appName);
    if (route) return route.containerName;

    // Custom create-app apps run in their own docker-compose network.
    // cloudflared reaches them via the host-mapped port using host.docker.internal.
    const appsJsonPath = path.join(os.homedir(), '.brewnet', 'apps.json');
    const apps = readApps(appsJsonPath);
    const found = apps.find((a) => a.name === appName);
    if (found) return 'host.docker.internal';

    return appName;
  }

  private resolveAppBasePath(appName: string): string {
    const appsJsonPath = path.join(os.homedir(), '.brewnet', 'apps.json');
    const apps = readApps(appsJsonPath);
    const found = apps.find((a) => a.name === appName);
    if (!found?.appDir) return '';

    // Inline basePath detection (same logic as app-manager.detectBasePath)
    for (const name of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
      const configPath = path.join(found.appDir, name);
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const match = content.match(/basePath\s*:\s*['"`]([^'"`]+)['"`]/);
        if (match) return match[1]!;
      } catch { /* file not found — try next */ }
    }
    return '';
  }

  private getComposePath(): string {
    const projectPath = this.state.projectPath.startsWith('~')
      ? path.join(os.homedir(), this.state.projectPath.slice(1))
      : this.state.projectPath;
    return path.join(projectPath, 'docker-compose.yml');
  }

  private async checkLocalHealth(_appName: string, port: number, basePath = ''): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const resp = await fetch(`http://127.0.0.1:${port}${basePath}/`, { signal: controller.signal });
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
    } catch (err: unknown) {
      console.warn('[domain-manager] Ingress rollback failed:', err);
    }
  }

  /**
   * Convert a stored DomainConnection to the ServiceRoute(s) needed for tunnel ingress.
   * Apex connections ("@") expand to two routes: apex + www.
   */
  private connectionToRoutes(conn: DomainConnection): ServiceRoute[] {
    const containerName = this.resolveContainerName(conn.appName);
    if (conn.subdomain === '@') {
      return [
        { subdomain: '', containerName, port: conn.containerPort, domain: conn.domain, basePath: conn.basePath },
        { subdomain: 'www', containerName, port: conn.containerPort, domain: conn.domain, basePath: conn.basePath },
      ];
    }
    return [{ subdomain: conn.subdomain, containerName, port: conn.containerPort, domain: conn.domain, basePath: conn.basePath }];
  }

  /**
   * Nextcloud requires occ config changes when connecting an external domain:
   * - Clear overwritewebroot (Quick Tunnel sets it to /cloud, but dedicated domain serves at /)
   * - Set overwrite.cli.url to the external URL
   * - Add hostname to trusted_domains
   */
  private async fixNextcloudDomainConfig(
    hostname: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const container = 'brewnet-nextcloud';
    const occ = (args: string[]) =>
      execa('docker', ['exec', '-u', '33', container, 'php', 'occ', ...args], { timeout: 15_000 });

    try {
      log(`nextcloud post-connect: fixing overwritewebroot and trusted_domains for ${hostname}`);
      await occ(['config:system:set', 'overwritewebroot', '--value=']);
      await occ(['config:system:set', 'overwrite.cli.url', `--value=https://${hostname}`]);
      await occ(['config:system:set', 'overwritehost', `--value=${hostname}`]);

      // Add to trusted_domains if not already present
      const { stdout: domainsStr } = await occ(['config:system:get', 'trusted_domains']);
      const existingDomains = domainsStr.trim().split('\n').map((d) => d.trim());
      if (!existingDomains.includes(hostname)) {
        const nextIdx = existingDomains.length;
        await occ(['config:system:set', 'trusted_domains', String(nextIdx), `--value=${hostname}`]);
      }

      log(`nextcloud post-connect OK`);
    } catch (err) {
      // Non-fatal — log warning but don't fail the connect
      log(`nextcloud post-connect WARN: ${err instanceof Error ? err.message : err}`);
      console.warn(`[domain-manager] Nextcloud occ config failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
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
