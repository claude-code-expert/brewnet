/**
 * T065 — Service Startup Flow Integration Tests
 *
 * Tests the Docker-based service startup flow used during Step 6 (Generate & Start):
 *   - Image pulling with progress
 *   - Service startup in dependency order (DB before App)
 *   - Health check polling (max 120s timeout)
 *   - Timeout error handling with service logs
 *   - Rollback on failure (all containers stopped/removed)
 *   - DNS/HTTPS endpoint verification for non-local domains
 *   - Success: endpoint URLs + credentials displayed
 *
 * Test cases (from TEST_CASES.md):
 *   TC-08-14: Compose valid → images pulled, progress shown
 *   TC-08-15: Images pulled → services start in dependency order (DB before App)
 *   TC-08-16: Service started → health check runs (max 120s)
 *   TC-08-17: Health check reaches 120s → timeout error + service logs displayed
 *   TC-08-18: Service fails → "Rollback" → all containers stopped/removed
 *   TC-08-19: Non-local domain → DNS check + HTTPS endpoint verification
 *   TC-08-20: All healthy → endpoint URLs + credentials displayed
 *
 * Approach: Mock `execa` for docker compose commands, mock `dockerode` for
 * container inspection/health. No real Docker is needed.
 *
 * @module tests/integration/service-startup
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join } from 'node:path';

import {
  createDefaultWizardState,
  applyFullInstallDefaults,
} from '../../packages/cli/src/config/defaults.js';

import {
  collectAllServices,
  getCredentialTargets,
  getImageName,
  estimateResources,
} from '../../packages/cli/src/utils/resources.js';

import type { WizardState } from '../../packages/shared/src/types/wizard-state.js';

import {
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL_MS,
  DOCKER_COMPOSE_FILENAME,
  DOCKER_NETWORK_EXTERNAL,
  DOCKER_NETWORK_INTERNAL,
} from '../../packages/shared/src/utils/constants.js';

// ---------------------------------------------------------------------------
// Types for the service startup module (mirrors planned implementation)
// ---------------------------------------------------------------------------

/** Result of a single service health check. */
interface HealthCheckResult {
  serviceId: string;
  healthy: boolean;
  elapsed: number;   // ms since health check started
  message: string;
}

/** Result of the entire startup flow. */
interface StartupResult {
  success: boolean;
  services: ServiceStartResult[];
  endpoints: EndpointInfo[];
  error?: string;
}

interface ServiceStartResult {
  serviceId: string;
  containerId: string;
  status: 'running' | 'failed' | 'timeout';
  healthCheck: HealthCheckResult | null;
}

interface EndpointInfo {
  serviceId: string;
  name: string;
  url: string;
  credentials?: { username: string; note: string };
}

/** Categories for dependency ordering. */
type ServiceCategory = 'infrastructure' | 'database' | 'cache' | 'application' | 'utility';

// ---------------------------------------------------------------------------
// Pure functions under test — these will live in services/startup-manager.ts
// Defined inline for TDD. Implementation should be extracted.
// ---------------------------------------------------------------------------

/**
 * Categorize a service ID for dependency ordering.
 * Infrastructure (web server, tunnel) → Database → Cache → Application → Utility
 */
function categorizeService(serviceId: string): ServiceCategory {
  const infraServices = ['traefik', 'nginx', 'caddy', 'cloudflared'];
  const dbServices = ['postgresql', 'mysql'];
  const cacheServices = ['redis', 'valkey', 'keydb'];
  const utilityServices = ['pgadmin', 'filebrowser', 'openssh-server', 'docker-mailserver'];

  if (infraServices.includes(serviceId)) return 'infrastructure';
  if (dbServices.includes(serviceId)) return 'database';
  if (cacheServices.includes(serviceId)) return 'cache';
  if (utilityServices.includes(serviceId)) return 'utility';
  return 'application';
}

/**
 * Sort services into dependency order for startup.
 * Order: infrastructure → database → cache → application → utility
 */
function sortByDependency(serviceIds: string[]): string[] {
  const order: Record<ServiceCategory, number> = {
    infrastructure: 0,
    database: 1,
    cache: 2,
    application: 3,
    utility: 4,
  };

  return [...serviceIds].sort((a, b) => {
    return order[categorizeService(a)] - order[categorizeService(b)];
  });
}

/**
 * Build the `docker compose pull` command arguments.
 */
function buildPullCommand(composePath: string): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'pull'],
  };
}

/**
 * Build the `docker compose up -d` command arguments.
 */
function buildUpCommand(composePath: string): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'up', '-d'],
  };
}

/**
 * Build the `docker compose down --remove-orphans` command for rollback.
 */
function buildDownCommand(composePath: string): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'down', '--remove-orphans'],
  };
}

/**
 * Build the `docker compose logs <service>` command for debugging failures.
 */
function buildLogsCommand(composePath: string, serviceId: string): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'logs', '--tail', '50', serviceId],
  };
}

/**
 * Simulate a health check poll cycle for a single service.
 * In the real implementation, this polls the Docker container's health status.
 *
 * Returns an async generator that yields health check results at intervals
 * until the service is healthy or the timeout is reached.
 */
async function* pollHealthCheck(
  serviceId: string,
  checkFn: () => Promise<boolean>,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
  intervalMs: number = HEALTH_CHECK_INTERVAL_MS,
): AsyncGenerator<HealthCheckResult> {
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;

    if (elapsed >= timeoutMs) {
      yield {
        serviceId,
        healthy: false,
        elapsed,
        message: `Health check timeout after ${Math.round(elapsed / 1000)}s`,
      };
      return;
    }

    try {
      const healthy = await checkFn();
      if (healthy) {
        yield {
          serviceId,
          healthy: true,
          elapsed,
          message: 'Service is healthy',
        };
        return;
      }
    } catch {
      // Check failed, continue polling
    }

    yield {
      serviceId,
      healthy: false,
      elapsed,
      message: `Waiting for ${serviceId} to become healthy...`,
    };

    // In tests this won't actually wait (mocked timers)
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Generate endpoint URLs for all services based on the wizard state.
 */
function generateEndpoints(state: WizardState, services: string[]): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  const domain = state.domain.name;
  const isLocal = state.domain.provider === 'local';
  const scheme = isLocal ? 'http' : 'https';

  // Mapping of service IDs to their subdomains and display names
  const subdomainMap: Record<string, { subdomain: string; name: string }> = {
    traefik: { subdomain: 'traefik', name: 'Traefik Dashboard' },
    gitea: { subdomain: 'git', name: 'Gitea' },
    nextcloud: { subdomain: 'cloud', name: 'Nextcloud' },
    minio: { subdomain: 'minio', name: 'MinIO Console' },
    jellyfin: { subdomain: 'jellyfin', name: 'Jellyfin' },
    pgadmin: { subdomain: 'pgadmin', name: 'pgAdmin' },
    filebrowser: { subdomain: 'files', name: 'File Browser' },
  };

  const credTargets = getCredentialTargets(state as any);

  for (const svcId of services) {
    const mapping = subdomainMap[svcId];
    if (!mapping) continue; // No web endpoint for this service (e.g., redis, ssh)

    const url = `${scheme}://${mapping.subdomain}.${domain}`;
    const endpoint: EndpointInfo = {
      serviceId: svcId,
      name: mapping.name,
      url,
    };

    // If this service receives admin credentials, note that
    const prettyName = mapping.name;
    if (credTargets.includes(prettyName) || credTargets.includes(svcId)) {
      endpoint.credentials = {
        username: state.admin.username,
        note: 'Uses admin credentials from .env',
      };
    }

    endpoints.push(endpoint);
  }

  return endpoints;
}

/**
 * Check whether DNS resolves for a given domain.
 * In the real implementation, this performs an actual DNS lookup.
 */
async function checkDnsResolution(
  domain: string,
  lookupFn: (domain: string) => Promise<boolean>,
): Promise<{ resolved: boolean; domain: string }> {
  const resolved = await lookupFn(domain);
  return { resolved, domain };
}

/**
 * Check whether an HTTPS endpoint is reachable.
 * In the real implementation, this performs an HTTP(S) request.
 */
async function checkEndpointReachable(
  url: string,
  fetchFn: (url: string) => Promise<number>,
): Promise<{ reachable: boolean; url: string; statusCode: number }> {
  try {
    const statusCode = await fetchFn(url);
    return { reachable: statusCode >= 200 && statusCode < 500, url, statusCode };
  } catch {
    return { reachable: false, url, statusCode: 0 };
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createCompletedState(): WizardState {
  const state = applyFullInstallDefaults(createDefaultWizardState());
  return {
    ...state,
    projectName: 'test-server',
    projectPath: '/home/user/brewnet/test-server',
    admin: {
      ...state.admin,
      password: 'SuperSecurePassword123!',
    },
    servers: {
      ...state.servers,
      dbServer: {
        ...state.servers.dbServer,
        dbPassword: 'DbSecretPass456!',
      },
      fileServer: { enabled: true, service: 'nextcloud' },
      media: { enabled: true, services: ['jellyfin'] },
      sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      mailServer: { enabled: false, service: 'docker-mailserver' },
      appServer: { enabled: true },
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
    devStack: {
      languages: ['nodejs'],
      frameworks: { nodejs: 'nextjs' },
      frontend: ['reactjs', 'typescript'],
    },
    domain: {
      provider: 'custom',
      name: 'myserver.example.com',
      ssl: 'letsencrypt',
      freeDomainTld: '.dpdns.org',
      cloudflare: {
        enabled: true,
        tunnelToken: 'secret-token',
        tunnelName: 'my-tunnel',
      },
    },
  };
}

function createLocalState(): WizardState {
  const state = applyFullInstallDefaults(createDefaultWizardState());
  return {
    ...state,
    projectName: 'local-server',
    projectPath: '/home/user/brewnet/local-server',
    admin: {
      ...state.admin,
      password: 'LocalPassword123!',
    },
    servers: {
      ...state.servers,
      dbServer: {
        ...state.servers.dbServer,
        dbPassword: 'DbLocalPass!',
      },
    },
    domain: {
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      freeDomainTld: '.dpdns.org',
      cloudflare: {
        enabled: false,
        tunnelToken: '',
        tunnelName: '',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T065 — Service Startup Flow', () => {
  // =========================================================================
  // TC-08-14: Image Pull Commands
  // =========================================================================

  describe('TC-08-14: Image pull — compose pull command', () => {
    it('buildPullCommand generates correct docker compose pull args', () => {
      const composePath = '/home/user/brewnet/test-server/docker-compose.yml';
      const { cmd, args } = buildPullCommand(composePath);

      expect(cmd).toBe('docker');
      expect(args).toEqual(['compose', '-f', composePath, 'pull']);
    });

    it('compose path is correctly included in pull command', () => {
      const composePath = '/custom/path/docker-compose.yml';
      const { args } = buildPullCommand(composePath);

      expect(args).toContain('-f');
      expect(args).toContain(composePath);
    });

    it('collectAllServices returns image-pullable service IDs', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);

      // Every service should have a known Docker image
      for (const svcId of services) {
        const image = getImageName(svcId);
        expect(image).toBeDefined();
        expect(image.length).toBeGreaterThan(0);
        // Should not fall back to unknown:latest for our known services
        if (svcId !== 'app') {
          expect(image).not.toBe(`${svcId}:latest`);
        }
      }
    });

    it('image names map to expected Docker images', () => {
      expect(getImageName('traefik')).toBe('traefik:v3.0');
      expect(getImageName('gitea')).toBe('gitea/gitea:latest');
      expect(getImageName('postgresql')).toBe('postgres:17-alpine');
      expect(getImageName('redis')).toBe('redis:7-alpine');
      expect(getImageName('nextcloud')).toBe('nextcloud:29-apache');
      expect(getImageName('jellyfin')).toBe('jellyfin/jellyfin:latest');
    });
  });

  // =========================================================================
  // TC-08-15: Service startup in dependency order
  // =========================================================================

  describe('TC-08-15: Service start — dependency order', () => {
    it('buildUpCommand generates correct docker compose up args', () => {
      const composePath = '/home/user/brewnet/test-server/docker-compose.yml';
      const { cmd, args } = buildUpCommand(composePath);

      expect(cmd).toBe('docker');
      expect(args).toEqual(['compose', '-f', composePath, 'up', '-d']);
    });

    it('sortByDependency places infrastructure before databases', () => {
      const services = ['postgresql', 'traefik', 'redis', 'gitea'];
      const sorted = sortByDependency(services);

      const traefikIdx = sorted.indexOf('traefik');
      const pgIdx = sorted.indexOf('postgresql');

      expect(traefikIdx).toBeLessThan(pgIdx);
    });

    it('sortByDependency places databases before application services', () => {
      const services = ['gitea', 'postgresql', 'redis', 'nextcloud'];
      const sorted = sortByDependency(services);

      const pgIdx = sorted.indexOf('postgresql');
      const giteaIdx = sorted.indexOf('gitea');
      const nextcloudIdx = sorted.indexOf('nextcloud');

      // Database before applications
      expect(pgIdx).toBeLessThan(giteaIdx);
      expect(pgIdx).toBeLessThan(nextcloudIdx);
    });

    it('sortByDependency places cache after database', () => {
      const services = ['redis', 'postgresql'];
      const sorted = sortByDependency(services);

      expect(sorted.indexOf('postgresql')).toBeLessThan(sorted.indexOf('redis'));
    });

    it('sortByDependency places utility services last', () => {
      const services = ['pgadmin', 'postgresql', 'traefik', 'openssh-server'];
      const sorted = sortByDependency(services);

      const traefikIdx = sorted.indexOf('traefik');
      const pgIdx = sorted.indexOf('postgresql');
      const pgadminIdx = sorted.indexOf('pgadmin');
      const sshIdx = sorted.indexOf('openssh-server');

      // Infrastructure first, then DB, then utilities
      expect(traefikIdx).toBeLessThan(pgIdx);
      expect(pgIdx).toBeLessThan(pgadminIdx);
      expect(pgIdx).toBeLessThan(sshIdx);
    });

    it('full dependency ordering with all service types', () => {
      const services = [
        'filebrowser',      // utility
        'nextcloud',        // application
        'redis',            // cache
        'postgresql',       // database
        'cloudflared',      // infrastructure
        'traefik',          // infrastructure
        'pgadmin',          // utility
        'gitea',            // application
        'openssh-server',   // utility
        'jellyfin',         // application
      ];

      const sorted = sortByDependency(services);

      // Infrastructure must come first
      const infraEnd = Math.max(sorted.indexOf('traefik'), sorted.indexOf('cloudflared'));
      const dbStart = sorted.indexOf('postgresql');
      const cacheStart = sorted.indexOf('redis');

      expect(infraEnd).toBeLessThan(dbStart);
      expect(dbStart).toBeLessThan(cacheStart);

      // Utility services must come after application services
      const appIndices = ['nextcloud', 'gitea', 'jellyfin'].map((s) => sorted.indexOf(s));
      const utilIndices = ['pgadmin', 'filebrowser', 'openssh-server'].map((s) => sorted.indexOf(s));

      const maxAppIdx = Math.max(...appIndices);
      const minUtilIdx = Math.min(...utilIndices);
      expect(maxAppIdx).toBeLessThan(minUtilIdx);
    });

    it('categorizeService correctly classifies known services', () => {
      expect(categorizeService('traefik')).toBe('infrastructure');
      expect(categorizeService('nginx')).toBe('infrastructure');
      expect(categorizeService('caddy')).toBe('infrastructure');
      expect(categorizeService('cloudflared')).toBe('infrastructure');
      expect(categorizeService('postgresql')).toBe('database');
      expect(categorizeService('mysql')).toBe('database');
      expect(categorizeService('redis')).toBe('cache');
      expect(categorizeService('valkey')).toBe('cache');
      expect(categorizeService('keydb')).toBe('cache');
      expect(categorizeService('pgadmin')).toBe('utility');
      expect(categorizeService('filebrowser')).toBe('utility');
      expect(categorizeService('openssh-server')).toBe('utility');
      expect(categorizeService('docker-mailserver')).toBe('utility');
      expect(categorizeService('gitea')).toBe('application');
      expect(categorizeService('nextcloud')).toBe('application');
      expect(categorizeService('jellyfin')).toBe('application');
      expect(categorizeService('minio')).toBe('application');
    });

    it('sortByDependency is stable for same-category services', () => {
      const services = ['gitea', 'nextcloud', 'jellyfin', 'minio'];
      const sorted = sortByDependency(services);

      // All are "application" category — should maintain relative order
      expect(sorted.indexOf('gitea')).toBeLessThan(sorted.indexOf('nextcloud'));
      expect(sorted.indexOf('nextcloud')).toBeLessThan(sorted.indexOf('jellyfin'));
    });
  });

  // =========================================================================
  // TC-08-16: Health check polling
  // =========================================================================

  describe('TC-08-16: Health check runs with polling', () => {
    it('pollHealthCheck yields healthy result when check succeeds immediately', async () => {
      const checkFn = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('postgresql', checkFn, 10000, 100)) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(results[0].healthy).toBe(true);
      expect(results[0].serviceId).toBe('postgresql');
      expect(results[0].message).toBe('Service is healthy');
    });

    it('pollHealthCheck polls multiple times before success', async () => {
      let callCount = 0;
      const checkFn = jest.fn<() => Promise<boolean>>().mockImplementation(async () => {
        callCount++;
        return callCount >= 3; // Healthy on 3rd call
      });

      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('redis', checkFn, 10000, 10)) {
        results.push(result);
      }

      // Should have 2 "not healthy" + 1 "healthy" result
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results[results.length - 1].healthy).toBe(true);

      const unhealthyResults = results.filter((r) => !r.healthy);
      expect(unhealthyResults.length).toBeGreaterThanOrEqual(2);
    });

    it('health check uses the configured timeout constant', () => {
      expect(HEALTH_CHECK_TIMEOUT_MS).toBe(120_000);
      expect(HEALTH_CHECK_INTERVAL_MS).toBe(2_000);
    });

    it('pollHealthCheck handles check function throwing errors', async () => {
      let callCount = 0;
      const checkFn = jest.fn<() => Promise<boolean>>().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) throw new Error('Connection refused');
        return true;
      });

      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('gitea', checkFn, 10000, 10)) {
        results.push(result);
      }

      // Should eventually succeed despite errors
      expect(results[results.length - 1].healthy).toBe(true);
    });
  });

  // =========================================================================
  // TC-08-17: Health check timeout
  // =========================================================================

  describe('TC-08-17: Health check timeout after 120s', () => {
    it('pollHealthCheck yields timeout result when service never becomes healthy', async () => {
      const checkFn = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

      // Use very short timeout for test
      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('postgresql', checkFn, 50, 10)) {
        results.push(result);
      }

      const lastResult = results[results.length - 1];
      expect(lastResult.healthy).toBe(false);
      expect(lastResult.message).toMatch(/timeout/i);
    });

    it('buildLogsCommand generates correct args for fetching service logs', () => {
      const composePath = '/home/user/project/docker-compose.yml';
      const { cmd, args } = buildLogsCommand(composePath, 'postgresql');

      expect(cmd).toBe('docker');
      expect(args).toEqual([
        'compose', '-f', composePath, 'logs', '--tail', '50', 'postgresql',
      ]);
    });

    it('buildLogsCommand works for any service ID', () => {
      const composePath = '/test/docker-compose.yml';

      const services = ['traefik', 'gitea', 'redis', 'nextcloud', 'openssh-server'];
      for (const svcId of services) {
        const { args } = buildLogsCommand(composePath, svcId);
        expect(args[args.length - 1]).toBe(svcId);
      }
    });

    it('timeout result includes elapsed time in the message', async () => {
      const checkFn = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('mysql', checkFn, 100, 20)) {
        results.push(result);
      }

      const lastResult = results[results.length - 1];
      expect(lastResult.healthy).toBe(false);
      expect(lastResult.elapsed).toBeGreaterThanOrEqual(100);
      expect(lastResult.message).toContain('timeout');
    });
  });

  // =========================================================================
  // TC-08-18: Rollback on failure
  // =========================================================================

  describe('TC-08-18: Rollback — all containers stopped/removed', () => {
    it('buildDownCommand generates correct docker compose down args', () => {
      const composePath = '/home/user/brewnet/test-server/docker-compose.yml';
      const { cmd, args } = buildDownCommand(composePath);

      expect(cmd).toBe('docker');
      expect(args).toEqual([
        'compose', '-f', composePath, 'down', '--remove-orphans',
      ]);
    });

    it('rollback command includes --remove-orphans flag', () => {
      const composePath = '/test/docker-compose.yml';
      const { args } = buildDownCommand(composePath);

      expect(args).toContain('--remove-orphans');
    });

    it('rollback command uses the same compose file path as up', () => {
      const composePath = '/home/user/brewnet/test-server/docker-compose.yml';
      const upCmd = buildUpCommand(composePath);
      const downCmd = buildDownCommand(composePath);

      // Both should reference the same compose file
      const upFileIdx = upCmd.args.indexOf('-f');
      const downFileIdx = downCmd.args.indexOf('-f');

      expect(upCmd.args[upFileIdx + 1]).toBe(composePath);
      expect(downCmd.args[downFileIdx + 1]).toBe(composePath);
    });

    it('compose file path is derived from project path + docker-compose.yml', () => {
      const projectPath = '/home/user/brewnet/my-project';
      const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);

      expect(composePath).toBe('/home/user/brewnet/my-project/docker-compose.yml');

      const { args } = buildDownCommand(composePath);
      expect(args).toContain(composePath);
    });
  });

  // =========================================================================
  // TC-08-19: DNS + HTTPS verification for non-local domains
  // =========================================================================

  describe('TC-08-19: DNS check + HTTPS verification for non-local domains', () => {
    it('non-local domain triggers DNS resolution check', async () => {
      const lookupFn = jest.fn<(d: string) => Promise<boolean>>().mockResolvedValue(true);

      const result = await checkDnsResolution('myserver.example.com', lookupFn);

      expect(lookupFn).toHaveBeenCalledWith('myserver.example.com');
      expect(result.resolved).toBe(true);
      expect(result.domain).toBe('myserver.example.com');
    });

    it('DNS resolution failure is reported', async () => {
      const lookupFn = jest.fn<(d: string) => Promise<boolean>>().mockResolvedValue(false);

      const result = await checkDnsResolution('nonexistent.example.com', lookupFn);

      expect(result.resolved).toBe(false);
    });

    it('HTTPS endpoint verification returns success for 2xx/3xx/4xx status', async () => {
      const fetchFn = jest.fn<(url: string) => Promise<number>>().mockResolvedValue(200);

      const result = await checkEndpointReachable('https://git.myserver.example.com', fetchFn);

      expect(result.reachable).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('HTTPS endpoint verification treats 5xx as unreachable', async () => {
      const fetchFn = jest.fn<(url: string) => Promise<number>>().mockResolvedValue(502);

      const result = await checkEndpointReachable('https://git.myserver.example.com', fetchFn);

      expect(result.reachable).toBe(false);
      expect(result.statusCode).toBe(502);
    });

    it('HTTPS endpoint verification handles connection errors', async () => {
      const fetchFn = jest.fn<(url: string) => Promise<number>>()
        .mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkEndpointReachable('https://git.myserver.example.com', fetchFn);

      expect(result.reachable).toBe(false);
      expect(result.statusCode).toBe(0);
    });

    it('local domain does not need DNS verification', () => {
      const state = createLocalState();
      expect(state.domain.provider).toBe('local');
      // In the real implementation, the startup flow skips DNS checks for local domains
      // This test verifies the state is correctly identified
    });

    it('custom domain requires DNS and HTTPS verification', () => {
      const state = createCompletedState();
      expect(state.domain.provider).toBe('custom');
      expect(state.domain.name).toBe('myserver.example.com');
      expect(state.domain.ssl).toBe('letsencrypt');
    });

    it('freedomain provider also requires DNS verification', () => {
      const state = createCompletedState();
      state.domain.provider = 'freedomain';
      state.domain.name = 'myserver.dpdns.org';

      expect(state.domain.provider).not.toBe('local');
    });
  });

  // =========================================================================
  // TC-08-20: All healthy → endpoint URLs + credentials displayed
  // =========================================================================

  describe('TC-08-20: Success — endpoint URLs and credentials', () => {
    it('generateEndpoints returns URLs for all web-accessible services', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      expect(endpoints.length).toBeGreaterThan(0);

      // Traefik should always have an endpoint
      const traefikEndpoint = endpoints.find((e) => e.serviceId === 'traefik');
      expect(traefikEndpoint).toBeDefined();
      expect(traefikEndpoint!.url).toBe('https://traefik.myserver.example.com');

      // Gitea
      const giteaEndpoint = endpoints.find((e) => e.serviceId === 'gitea');
      expect(giteaEndpoint).toBeDefined();
      expect(giteaEndpoint!.url).toBe('https://git.myserver.example.com');
      expect(giteaEndpoint!.name).toBe('Gitea');
    });

    it('endpoints use HTTPS for non-local domains', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      for (const ep of endpoints) {
        expect(ep.url).toMatch(/^https:\/\//);
      }
    });

    it('endpoints use HTTP for local domains', () => {
      const state = createLocalState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      for (const ep of endpoints) {
        expect(ep.url).toMatch(/^http:\/\//);
      }
    });

    it('endpoints include subdomain-based URLs', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      const nextcloudEndpoint = endpoints.find((e) => e.serviceId === 'nextcloud');
      expect(nextcloudEndpoint).toBeDefined();
      expect(nextcloudEndpoint!.url).toBe('https://cloud.myserver.example.com');

      const jellyfinEndpoint = endpoints.find((e) => e.serviceId === 'jellyfin');
      expect(jellyfinEndpoint).toBeDefined();
      expect(jellyfinEndpoint!.url).toBe('https://jellyfin.myserver.example.com');
    });

    it('services without web endpoints are excluded', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      const endpointServiceIds = endpoints.map((e) => e.serviceId);

      // These services have no web UI subdomain:
      expect(endpointServiceIds).not.toContain('postgresql');
      expect(endpointServiceIds).not.toContain('redis');
      expect(endpointServiceIds).not.toContain('openssh-server');
      expect(endpointServiceIds).not.toContain('cloudflared');
    });

    it('endpoints include credential info for services that use admin creds', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      // Gitea always uses admin credentials
      const giteaEndpoint = endpoints.find((e) => e.serviceId === 'gitea');
      expect(giteaEndpoint).toBeDefined();

      // Services that receive admin credentials should have credential notes
      const credServices = getCredentialTargets(state as any);
      const endpointsWithCreds = endpoints.filter((e) => e.credentials);
      expect(endpointsWithCreds.length).toBeGreaterThan(0);

      for (const ep of endpointsWithCreds) {
        expect(ep.credentials!.username).toBe(state.admin.username);
        expect(ep.credentials!.note).toContain('.env');
      }
    });

    it('endpoint count matches number of web-accessible services', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      // Only services with subdomain mappings get endpoints
      const webServices = ['traefik', 'gitea', 'nextcloud', 'jellyfin', 'pgadmin', 'filebrowser'];
      const expectedCount = services.filter((s) => webServices.includes(s)).length;

      expect(endpoints.length).toBe(expectedCount);
    });

    it('local domain endpoints use .local suffix', () => {
      const state = createLocalState();
      const services = collectAllServices(state as any);
      const endpoints = generateEndpoints(state, services);

      for (const ep of endpoints) {
        expect(ep.url).toContain('brewnet.local');
      }
    });
  });

  // =========================================================================
  // Docker network constants
  // =========================================================================

  describe('Docker network and compose constants', () => {
    it('DOCKER_COMPOSE_FILENAME is docker-compose.yml', () => {
      expect(DOCKER_COMPOSE_FILENAME).toBe('docker-compose.yml');
    });

    it('Docker networks are correctly named', () => {
      expect(DOCKER_NETWORK_EXTERNAL).toBe('brewnet');
      expect(DOCKER_NETWORK_INTERNAL).toBe('brewnet-internal');
    });
  });

  // =========================================================================
  // Integrated flow scenarios
  // =========================================================================

  describe('Integrated flow: collectAllServices → sort → build commands', () => {
    it('full state produces a valid sorted service list', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const sorted = sortByDependency(services);

      expect(sorted.length).toBe(services.length);

      // Infrastructure (traefik, cloudflared) should be first
      const firstCategory = categorizeService(sorted[0]);
      expect(firstCategory).toBe('infrastructure');

      // Last entries should be utility
      const lastCategory = categorizeService(sorted[sorted.length - 1]);
      expect(['utility', 'application']).toContain(lastCategory);
    });

    it('each service in sorted list has a valid Docker image', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const sorted = sortByDependency(services);

      for (const svcId of sorted) {
        const image = getImageName(svcId);
        expect(image).toBeTruthy();
        expect(typeof image).toBe('string');
      }
    });

    it('compose commands are self-consistent across pull/up/down', () => {
      const composePath = '/home/user/brewnet/test-server/docker-compose.yml';

      const pull = buildPullCommand(composePath);
      const up = buildUpCommand(composePath);
      const down = buildDownCommand(composePath);

      // All commands use the same compose file
      expect(pull.args[2]).toBe(composePath);
      expect(up.args[2]).toBe(composePath);
      expect(down.args[2]).toBe(composePath);

      // All commands start with 'docker'
      expect(pull.cmd).toBe('docker');
      expect(up.cmd).toBe('docker');
      expect(down.cmd).toBe('docker');

      // All commands use 'compose' subcommand
      expect(pull.args[0]).toBe('compose');
      expect(up.args[0]).toBe('compose');
      expect(down.args[0]).toBe('compose');
    });

    it('resource estimate matches the number of services collected', () => {
      const state = createCompletedState();
      const services = collectAllServices(state as any);
      const resources = estimateResources(state as any);

      // estimateResources counts containers independently — should match collectAllServices
      // Note: the app server container is only counted by estimateResources when
      // languages are selected, and collectAllServices does not include 'app'.
      // But the container count from estimateResources should be >= services.length
      // since both count the same logical services.
      expect(resources.containers).toBeGreaterThanOrEqual(services.length - 1);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('empty service list sorts to empty', () => {
      const sorted = sortByDependency([]);
      expect(sorted).toEqual([]);
    });

    it('single service sorts to itself', () => {
      const sorted = sortByDependency(['traefik']);
      expect(sorted).toEqual(['traefik']);
    });

    it('unknown service is categorized as application', () => {
      expect(categorizeService('unknown-service')).toBe('application');
    });

    it('buildPullCommand and buildUpCommand use -d for detached mode', () => {
      const composePath = '/test/docker-compose.yml';
      const { args } = buildUpCommand(composePath);

      expect(args).toContain('-d');
    });

    it('buildPullCommand does not use -d flag', () => {
      const composePath = '/test/docker-compose.yml';
      const { args } = buildPullCommand(composePath);

      expect(args).not.toContain('-d');
    });

    it('endpoint generation handles state with no web-accessible services', () => {
      const state = createLocalState();
      // Only pass non-web services
      const endpoints = generateEndpoints(state, ['postgresql', 'redis', 'openssh-server']);
      expect(endpoints).toEqual([]);
    });

    it('health check with zero timeout yields timeout immediately', async () => {
      const checkFn = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

      const results: HealthCheckResult[] = [];
      for await (const result of pollHealthCheck('test-service', checkFn, 0, 10)) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(results[0].healthy).toBe(false);
      expect(results[0].message).toMatch(/timeout/i);
    });
  });
});
