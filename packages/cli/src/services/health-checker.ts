/**
 * T069 — Health Checker Service
 *
 * Provides service categorization, dependency-based sorting, Docker Compose
 * command builders, health check polling, endpoint generation, and external
 * access verification utilities for the Step 6 (Generate & Start) flow.
 *
 * Service startup order:
 *   infrastructure → database → cache → application → utility
 *
 * @module services/health-checker
 */

import type Dockerode from 'dockerode';
import type { WizardState } from '@brewnet/shared';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL_MS,
  DOCKER_COMPOSE_FILENAME,
} from '@brewnet/shared';
import { getCredentialTargets } from '../utils/resources.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export { DOCKER_COMPOSE_FILENAME };
export const HEALTH_CHECK_TIMEOUT = HEALTH_CHECK_TIMEOUT_MS;
export const HEALTH_CHECK_INTERVAL = HEALTH_CHECK_INTERVAL_MS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceCategory =
  | 'infrastructure'
  | 'database'
  | 'cache'
  | 'application'
  | 'utility';

export interface HealthCheckResult {
  service: string;
  healthy: boolean;
  elapsed: number;
  error?: string;
}

export interface EndpointInfo {
  service: string;
  url: string;
  credentials?: { username: string; password: string };
}

// ---------------------------------------------------------------------------
// Service Categorization
// ---------------------------------------------------------------------------

const INFRA_SERVICES = ['traefik', 'nginx', 'caddy', 'cloudflared'];
const DB_SERVICES = ['postgresql', 'mysql'];
const CACHE_SERVICES = ['redis', 'valkey', 'keydb'];
const UTILITY_SERVICES = [
  'pgadmin',
  'filebrowser',
  'openssh-server',
  'docker-mailserver',
];

/**
 * Categorize a service ID for dependency ordering.
 *
 * Infrastructure (web server, tunnel) → Database → Cache → Application → Utility
 */
export function categorizeService(serviceId: string): ServiceCategory {
  if (INFRA_SERVICES.includes(serviceId)) return 'infrastructure';
  if (DB_SERVICES.includes(serviceId)) return 'database';
  if (CACHE_SERVICES.includes(serviceId)) return 'cache';
  if (UTILITY_SERVICES.includes(serviceId)) return 'utility';
  return 'application';
}

// ---------------------------------------------------------------------------
// Dependency Sorting
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Record<ServiceCategory, number> = {
  infrastructure: 0,
  database: 1,
  cache: 2,
  application: 3,
  utility: 4,
};

/**
 * Sort services into dependency order for startup.
 * Order: infrastructure → database → cache → application → utility.
 *
 * Stable sort: services within the same category preserve their original order.
 */
export function sortByDependency(serviceIds: string[]): string[] {
  return [...serviceIds].sort((a, b) => {
    return CATEGORY_ORDER[categorizeService(a)] - CATEGORY_ORDER[categorizeService(b)];
  });
}

// ---------------------------------------------------------------------------
// Docker Compose Command Builders
// ---------------------------------------------------------------------------

/**
 * Build `docker compose pull` command arguments.
 */
export function buildPullCommand(
  composePath: string,
): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'pull'],
  };
}

/**
 * Build `docker compose up -d` command arguments.
 */
export function buildUpCommand(
  composePath: string,
): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'up', '-d'],
  };
}

/**
 * Build `docker compose down --remove-orphans` command for rollback.
 */
export function buildDownCommand(
  composePath: string,
): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'down', '--remove-orphans'],
  };
}

/**
 * Build `docker compose logs <service>` command for debugging failures.
 */
export function buildLogsCommand(
  composePath: string,
  service: string,
): { cmd: string; args: string[] } {
  return {
    cmd: 'docker',
    args: ['compose', '-f', composePath, 'logs', '--tail', '50', service],
  };
}

// ---------------------------------------------------------------------------
// Health Check Polling
// ---------------------------------------------------------------------------

/**
 * Poll a Docker container's health status until it becomes healthy or
 * the timeout is reached.
 *
 * @param service    - Service identifier for reporting
 * @param docker     - Dockerode instance
 * @param timeoutMs  - Maximum time to wait (default: HEALTH_CHECK_TIMEOUT)
 * @param intervalMs - Poll interval (default: HEALTH_CHECK_INTERVAL)
 * @returns Promise resolving to the final HealthCheckResult
 */
export async function pollHealthCheck(
  service: string,
  docker: Dockerode,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT,
  intervalMs: number = HEALTH_CHECK_INTERVAL,
): Promise<HealthCheckResult> {
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;

    if (elapsed >= timeoutMs) {
      return {
        service,
        healthy: false,
        elapsed,
        error: `Health check timeout after ${Math.round(elapsed / 1000)}s`,
      };
    }

    try {
      const containers = await docker.listContainers({
        filters: { name: [service] },
      });

      if (containers.length > 0) {
        const container = containers[0];
        const state = container.State;
        const status = container.Status || '';

        if (state === 'running' && status.includes('(healthy)')) {
          return {
            service,
            healthy: true,
            elapsed,
          };
        }

        // If the container has no healthcheck, consider "running" as healthy
        if (state === 'running' && !status.includes('(health:')) {
          return {
            service,
            healthy: true,
            elapsed,
          };
        }
      }
    } catch {
      // Docker API error — continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ---------------------------------------------------------------------------
// Endpoint Generation
// ---------------------------------------------------------------------------

/**
 * Mapping of service IDs to their subdomains and display names.
 */
const SUBDOMAIN_MAP: Record<string, { subdomain: string; name: string }> = {
  traefik: { subdomain: 'traefik', name: 'Traefik Dashboard' },
  gitea: { subdomain: 'git', name: 'Gitea' },
  nextcloud: { subdomain: 'cloud', name: 'Nextcloud' },
  minio: { subdomain: 'minio', name: 'MinIO Console' },
  jellyfin: { subdomain: 'jellyfin', name: 'Jellyfin' },
  pgadmin: { subdomain: 'pgadmin', name: 'pgAdmin' },
  filebrowser: { subdomain: 'files', name: 'File Browser' },
};

/**
 * Generate endpoint URLs for all services based on the wizard state.
 */
export function generateEndpoints(
  state: WizardState,
  services: string[],
): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  const domain = state.domain.name;
  const isLocal = state.domain.provider === 'local';
  const scheme = isLocal ? 'http' : 'https';

  const credTargets = getCredentialTargets(state as any);

  for (const svcId of services) {
    const mapping = SUBDOMAIN_MAP[svcId];
    if (!mapping) continue;

    const url = `${scheme}://${mapping.subdomain}.${domain}`;
    const endpoint: EndpointInfo = {
      service: svcId,
      url,
    };

    // Check if this service receives admin credentials
    const prettyName = mapping.name;
    if (credTargets.includes(prettyName) || credTargets.includes(svcId)) {
      endpoint.credentials = {
        username: state.admin.username,
        password: '(see .env file)',
      };
    }

    endpoints.push(endpoint);
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// DNS / Endpoint Verification
// ---------------------------------------------------------------------------

/**
 * Check whether DNS resolves for a given domain.
 * Uses Node.js dns module for actual resolution.
 */
export async function checkDnsResolution(domain: string): Promise<boolean> {
  try {
    const { promises: dns } = await import('node:dns');
    await dns.resolve4(domain);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether an HTTP(S) endpoint is reachable.
 * Returns true if the response status is 200-499 (server is responding).
 */
export async function checkEndpointReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}
