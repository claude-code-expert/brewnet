/**
 * Cloudflare API client for Brewnet tunnel automation.
 *
 * Covers the full tunnel setup flow:
 *   1. Token verification
 *   2. Account listing / auto-selection
 *   3. Zone (domain) listing / selection
 *   4. Tunnel creation
 *   5. Ingress rule configuration
 *   6. DNS CNAME record creation
 *
 * API reference:
 *   https://developers.cloudflare.com/api/
 *
 * @module services/cloudflare-client
 */

import crypto from 'node:crypto';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceRoute {
  subdomain: string;
  containerName: string;
  port: number;
}

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CF_BASE = 'https://api.cloudflare.com/client/v4';

function cfHeaders(apiToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

/**
 * Wrapper around `fetch` with exponential backoff retry logic.
 *
 * Retry conditions:
 *   - Network errors (fetch throws)
 *   - HTTP 5xx responses
 *   - HTTP 429 (rate limit)
 *
 * No retry conditions:
 *   - HTTP 400 / 401 / 403 (client errors — retrying won't help)
 *   - Other 4xx responses
 *
 * Backoff: baseDelay * 2^attempt ± 10% jitter (default: 1s → 2s → 4s)
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const maxRetries = config.maxRetries ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // No retry for auth/client errors
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return response;
      }

      // Retry on 5xx or 429
      if (response.status >= 500 || response.status === 429) {
        if (attempt < maxRetries) {
          await retryDelay(attempt, baseDelayMs);
          continue;
        }
        return response;
      }

      return response;
    } catch (err) {
      // Network error — retry
      lastError = err;
      if (attempt < maxRetries) {
        await retryDelay(attempt, baseDelayMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
}

function retryDelay(attempt: number, baseDelayMs: number): Promise<void> {
  const jitterFactor = 0.9 + Math.random() * 0.2; // ±10%
  const delay = baseDelayMs * Math.pow(2, attempt) * jitterFactor;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ---------------------------------------------------------------------------
// deleteTunnel
// ---------------------------------------------------------------------------

/**
 * Delete a Cloudflare Tunnel via the API.
 *
 * DELETE /client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}
 *
 * Throws with a descriptive error if the tunnel has active connections
 * (HTTP 400) or if the request fails for any other reason.
 *
 * Used during auto-rollback when tunnel setup fails partway through.
 */
export async function deleteTunnel(
  apiToken: string,
  accountId: string,
  tunnelId: string,
): Promise<void> {
  const url = `${CF_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}`;

  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers: cfHeaders(apiToken),
  });

  if (response.status === 404) {
    // Already deleted — treat as success
    return;
  }

  const data = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string; code?: number }>;
  };

  if (!response.ok || !data.success) {
    const errMsg = data.errors?.[0]?.message ?? `HTTP ${response.status}`;
    if (response.status === 400 && errMsg.toLowerCase().includes('active connection')) {
      throw new Error(
        `터널 삭제 실패: 활성 연결이 있습니다. cloudflared 컨테이너를 먼저 중지하세요. (${errMsg})`,
      );
    }
    throw new Error(`터널 삭제 실패: ${errMsg}`);
  }
}

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

/**
 * Verify a Cloudflare API token and retrieve the associated account email.
 *
 * GET /client/v4/user/tokens/verify
 * GET /client/v4/user  (to get email)
 */
export async function verifyToken(
  apiToken: string,
): Promise<{ valid: boolean; email?: string }> {
  const verifyResp = await fetch(`${CF_BASE}/user/tokens/verify`, {
    headers: cfHeaders(apiToken),
  });

  const verifyData = (await verifyResp.json()) as {
    success: boolean;
    result?: { status: string };
  };

  if (!verifyResp.ok || !verifyData.success || verifyData.result?.status !== 'active') {
    return { valid: false };
  }

  // Fetch email from /user endpoint
  const userResp = await fetch(`${CF_BASE}/user`, {
    headers: cfHeaders(apiToken),
  });
  const userData = (await userResp.json()) as {
    success: boolean;
    result?: { email: string };
  };

  const email = userData.success ? userData.result?.email : undefined;
  return { valid: true, email };
}

// ---------------------------------------------------------------------------
// getAccounts
// ---------------------------------------------------------------------------

/**
 * List all Cloudflare accounts accessible with the given token.
 *
 * GET /client/v4/accounts
 */
export async function getAccounts(
  apiToken: string,
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(`${CF_BASE}/accounts`, {
    headers: cfHeaders(apiToken),
  });

  const data = (await response.json()) as {
    success: boolean;
    result?: Array<{ id: string; name: string }>;
  };

  if (!response.ok || !data.success) return [];
  return data.result ?? [];
}

// ---------------------------------------------------------------------------
// getZones
// ---------------------------------------------------------------------------

/**
 * List all DNS zones (domains) accessible with the given token.
 *
 * GET /client/v4/zones
 */
export async function getZones(
  apiToken: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
  const response = await fetch(`${CF_BASE}/zones`, {
    headers: cfHeaders(apiToken),
  });

  const data = (await response.json()) as {
    success: boolean;
    result?: Array<{ id: string; name: string; status: string }>;
  };

  if (!response.ok || !data.success) return [];
  return data.result ?? [];
}

// ---------------------------------------------------------------------------
// createTunnel
// ---------------------------------------------------------------------------

/**
 * Create a Cloudflare Tunnel via the API.
 *
 * POST /client/v4/accounts/{accountId}/cfd_tunnel
 */
export async function createTunnel(
  apiToken: string,
  accountId: string,
  name: string,
): Promise<{ tunnelId: string; tunnelToken: string }> {
  const tunnelSecret = crypto.randomBytes(32).toString('base64');
  const url = `${CF_BASE}/accounts/${accountId}/cfd_tunnel`;

  const response = await fetch(url, {
    method: 'POST',
    headers: cfHeaders(apiToken),
    body: JSON.stringify({
      name,
      config_src: 'cloudflare',
      tunnel_secret: tunnelSecret,
    }),
  });

  const data = (await response.json()) as {
    success: boolean;
    result?: { id: string; token: string };
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(msg);
  }

  if (!data.result?.id || !data.result?.token) {
    throw new Error('Cloudflare API returned unexpected response (missing id or token)');
  }

  return {
    tunnelId: data.result.id,
    tunnelToken: data.result.token,
  };
}

// ---------------------------------------------------------------------------
// configureTunnelIngress
// ---------------------------------------------------------------------------

/**
 * Configure ingress rules for a Cloudflare Tunnel.
 *
 * PUT /client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations
 */
export async function configureTunnelIngress(
  apiToken: string,
  accountId: string,
  tunnelId: string,
  domain: string,
  routes: ServiceRoute[],
): Promise<void> {
  const url = `${CF_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`;

  const ingress = [
    ...routes.map((r) => ({
      hostname: `${r.subdomain}.${domain}`,
      service: `http://${r.containerName}:${r.port}`,
    })),
    { service: 'http_status:404' },
  ];

  const response = await fetch(url, {
    method: 'PUT',
    headers: cfHeaders(apiToken),
    body: JSON.stringify({ config: { ingress } }),
  });

  const data = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(`Failed to configure ingress: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// createDnsRecord
// ---------------------------------------------------------------------------

/**
 * Create a CNAME DNS record pointing to the Cloudflare Tunnel.
 *
 * POST /client/v4/zones/{zoneId}/dns_records
 * Record: {subdomain}.{domain} → {tunnelId}.cfargotunnel.com (proxied)
 */
export async function createDnsRecord(
  apiToken: string,
  zoneId: string,
  tunnelId: string,
  subdomain: string,
  domain: string,
): Promise<void> {
  const url = `${CF_BASE}/zones/${zoneId}/dns_records`;

  const response = await fetch(url, {
    method: 'POST',
    headers: cfHeaders(apiToken),
    body: JSON.stringify({
      type: 'CNAME',
      name: `${subdomain}.${domain}`,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
    }),
  });

  const data = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `HTTP ${response.status}`;
    // Non-fatal if record already exists
    if (!msg.toLowerCase().includes('already exists')) {
      throw new Error(`DNS record creation failed: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// getTunnelHealth
// ---------------------------------------------------------------------------

/**
 * Query the health of a Cloudflare Tunnel.
 *
 * GET /client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}
 *
 * Returns the tunnel status and number of active connectors.
 * Used for health verification after tunnel creation and for `brewnet domain tunnel status`.
 */
export async function getTunnelHealth(
  apiToken: string,
  accountId: string,
  tunnelId: string,
): Promise<{ status: 'healthy' | 'degraded' | 'inactive'; connectorCount: number }> {
  const url = `${CF_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}`;

  const response = await fetchWithRetry(url, {
    headers: cfHeaders(apiToken),
  });

  const data = (await response.json()) as {
    success: boolean;
    result?: {
      status: string;
      connections?: Array<unknown>;
    };
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(`Failed to get tunnel health: ${msg}`);
  }

  const rawStatus = data.result?.status ?? 'inactive';
  const connectorCount = data.result?.connections?.length ?? 0;

  const status: 'healthy' | 'degraded' | 'inactive' =
    rawStatus === 'healthy' ? 'healthy'
    : rawStatus === 'degraded' ? 'degraded'
    : 'inactive';

  return { status, connectorCount };
}

// ---------------------------------------------------------------------------
// buildTokenCreationUrl
// ---------------------------------------------------------------------------

/**
 * Build a pre-filled Cloudflare API Token creation URL.
 *
 * Sets permissions: Cloudflare Tunnel (Edit) + DNS (Edit)
 * Sets name: brewnet-{projectName}
 */
export function buildTokenCreationUrl(projectName: string): string {
  const perms = encodeURIComponent(
    JSON.stringify([
      { key: 'cloudflare_tunnel', type: 'edit' },
      { key: 'dns', type: 'edit' },
    ]),
  );
  return `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${perms}&name=brewnet-${projectName}`;
}

// ---------------------------------------------------------------------------
// getActiveServiceRoutes
// ---------------------------------------------------------------------------

/**
 * Build the list of service routes to expose through the Cloudflare Tunnel.
 * Called after server component selection to determine which ingress rules to create.
 */
export function getActiveServiceRoutes(state: WizardState): ServiceRoute[] {
  const routes: ServiceRoute[] = [];

  // Git server (always enabled)
  routes.push({ subdomain: 'git', containerName: 'gitea', port: 3000 });

  // File server
  if (state.servers.fileServer.enabled) {
    if (state.servers.fileServer.service === 'nextcloud') {
      routes.push({ subdomain: 'cloud', containerName: 'nextcloud', port: 80 });
    } else if (state.servers.fileServer.service === 'minio') {
      routes.push({ subdomain: 'minio', containerName: 'minio', port: 9001 });
    }
  }

  // Media
  if (state.servers.media.enabled && state.servers.media.services.includes('jellyfin')) {
    routes.push({ subdomain: 'media', containerName: 'jellyfin', port: 8096 });
  }

  // Database admin UI (pgAdmin for PostgreSQL)
  if (
    state.servers.dbServer.enabled &&
    state.servers.dbServer.adminUI &&
    state.servers.dbServer.primary === 'postgresql'
  ) {
    routes.push({ subdomain: 'pgadmin', containerName: 'pgadmin', port: 80 });
  }

  // FileBrowser
  if (state.servers.fileBrowser.enabled) {
    routes.push({ subdomain: 'files', containerName: 'filebrowser', port: 80 });
  }

  return routes;
}
