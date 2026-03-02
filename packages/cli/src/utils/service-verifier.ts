/**
 * @module service-verifier
 * @description Service installation verification utilities.
 * After services start, verifies each service is accessible via HTTP health check.
 * Shows local URLs always; external URLs only when Cloudflare Tunnel is active.
 */

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceUrlEntry {
  serviceId: string;
  label: string;
  localUrl: string;
  externalUrl?: string;
  healthEndpoint?: string;
  /** Full URL for health check, overrides localUrl + healthEndpoint when set */
  healthUrl?: string;
  /** Milliseconds to wait before the first health check attempt (for slow-starting services) */
  startupDelay?: number;
}

export interface VerifyResult {
  serviceId: string;
  label: string;
  localUrl: string;
  externalUrl?: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  statusCode?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

/**
 * Build the service URL map from wizard state.
 * localUrl is always present; externalUrl is only set when a tunnel is configured.
 *
 * Quick Tunnel: path-based external URLs (single hostname, /path per service)
 * Named Tunnel: subdomain-based external URLs (subdomain.domain per service)
 */
export function buildServiceUrlMap(state: WizardState): ServiceUrlEntry[] {
  const entries: ServiceUrlEntry[] = [];
  const { servers, domain, portRemapping } = state;

  const hasTunnel =
    (domain.cloudflare.enabled || domain.provider === 'quick-tunnel') &&
    (domain.cloudflare.tunnelMode === 'quick' || domain.cloudflare.tunnelMode === 'named');
  const isQuickTunnel = domain.cloudflare.tunnelMode === 'quick';

  // Quick Tunnel base: already a full URL like "https://xxx.trycloudflare.com"
  const quickBase = (domain.cloudflare.quickTunnelUrl ?? '').replace(/\/$/, '');

  // Named Tunnel domain: plain hostname like "example.com" (strip protocol if present)
  const namedDomain = (domain.name ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  function effectivePort(defaultPort: number): number {
    return portRemapping[defaultPort] ?? defaultPort;
  }

  // Web server HTTP port
  const httpPort = effectivePort(80);

  /**
   * Build external URL for a service.
   * Quick Tunnel: path-based routing (all services supported).
   * Named Tunnel: subdomain-based routing.
   */
  function extUrl(quickPath: string, namedSubdomain: string): string | undefined {
    if (!hasTunnel) return undefined;
    if (isQuickTunnel) {
      return quickBase ? `${quickBase}${quickPath}` : undefined;
    }
    return namedDomain ? `https://${namedSubdomain}.${namedDomain}` : undefined;
  }

  // Web server entry (port 80 → HTTP landing page)
  const webService = state.servers.webServer.service;
  entries.push({
    serviceId: webService,
    label: webService === 'traefik'
      ? 'Web Server (Traefik)'
      : webService === 'nginx'
        ? 'Web Server (Nginx)'
        : 'Web Server (Caddy)',
    localUrl: `http://localhost:${httpPort}`,
    externalUrl: hasTunnel
      ? isQuickTunnel
        ? (quickBase || undefined)
        : (namedDomain ? `https://${namedDomain}` : undefined)
      : undefined,
    healthEndpoint: '/',
  });

  // Traefik Dashboard — routed through Traefik labels on the HTTP port (80).
  // Port 8080 is NOT host-exposed; dashboard is behind BasicAuth on /dashboard/.
  // Health check hits /api/overview which returns 401 (BasicAuth), treated as ok (< 500).
  if (webService === 'traefik') {
    entries.push({
      serviceId: 'traefik-dashboard',
      label: 'Traefik Dashboard',
      localUrl: `http://localhost:${httpPort}/dashboard/`,
      healthUrl: `http://localhost:${httpPort}/api/overview`,
    });
  }

  // Gitea — Quick Tunnel: port 3000 is not host-exposed; access via Traefik path /git
  //         Named Tunnel / no tunnel: direct host port (default 3000)
  // Ref: Gitea app.ini [server] HTTP_PORT = 3000
  const giteaPort = effectivePort(servers.gitServer.port);
  const giteaLocalUrl = isQuickTunnel
    ? `http://localhost:${httpPort}/git`
    : `http://localhost:${giteaPort}`;
  entries.push({
    serviceId: 'gitea',
    label: 'Gitea (Git)',
    localUrl: giteaLocalUrl,
    externalUrl: extUrl('/git', 'git'),
    healthEndpoint: '/',
  });

  // File Server — direct host port
  if (servers.fileServer.enabled) {
    if (servers.fileServer.service === 'nextcloud') {
      // Nextcloud: container port 80 → host 8443
      // Quick Tunnel: path /cloud with OVERWRITEWEBROOT env
      // Ref: https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/reverse_proxy_configuration.html
      entries.push({
        serviceId: 'nextcloud',
        label: 'Nextcloud',
        localUrl: `http://localhost:${effectivePort(8443)}`,
        externalUrl: extUrl('/cloud', 'cloud'),
        healthEndpoint: '/status.php',
        startupDelay: 30000,
      });
    } else if (servers.fileServer.service === 'minio') {
      // MinIO Console: port 9001, API: port 9000
      // Health /minio/health/live is on API port 9000, not console 9001
      // Ref: https://github.com/minio/docs
      entries.push({
        serviceId: 'minio',
        label: 'MinIO Console',
        localUrl: `http://localhost:${effectivePort(9001)}`,
        externalUrl: extUrl('/minio', 'minio'),
        healthEndpoint: '/',
      });
    }
  }

  // Media — Jellyfin: port 8096
  // Quick Tunnel: BaseUrl=/jellyfin → access via Traefik (port 80) so the web app
  //   auto-detects the server URL as http://localhost/jellyfin (matching BaseUrl).
  //   Direct port access (localhost:8096) causes the web app to detect http://localhost:8096
  //   as the server URL, which mismatches BaseUrl=/jellyfin → first-screen fails to load.
  //   Health check still uses the direct port (more reliable, bypasses Traefik startup timing).
  // Named Tunnel / no tunnel: BaseUrl not set; direct port access is correct.
  // Ref: https://jellyfin.org/docs/general/post-install/networking
  if (servers.media.enabled) {
    const jellyfinLocalUrl = isQuickTunnel
      ? `http://localhost:${httpPort}/jellyfin/web/#/wizard/start`
      : `http://localhost:${effectivePort(8096)}/web/#/wizard/start`;
    entries.push({
      serviceId: 'jellyfin',
      label: 'Jellyfin',
      localUrl: jellyfinLocalUrl,
      externalUrl: extUrl('/jellyfin', 'media'),
      healthUrl: isQuickTunnel
        ? `http://localhost:${effectivePort(8096)}/jellyfin/health`
        : `http://localhost:${effectivePort(8096)}/health`,
    });
  }

  // DB Admin UI — pgAdmin: container port 80 → host 5050
  // SCRIPT_NAME=/pgadmin requires all paths to include /pgadmin prefix.
  // Ref: https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment
  if (servers.dbServer.enabled && servers.dbServer.adminUI && servers.dbServer.primary === 'postgresql') {
    entries.push({
      serviceId: 'pgadmin',
      label: 'pgAdmin',
      localUrl: `http://localhost:${effectivePort(5050)}/pgadmin`,
      externalUrl: extUrl('/pgadmin', 'db'),
      healthEndpoint: '/misc/ping',
      startupDelay: 15000,
    });
  }

  // FileBrowser (standalone) — container port 80 → host 8085
  // Ref: https://github.com/gtsteffaniak/filebrowser
  if (servers.fileBrowser.enabled && servers.fileBrowser.mode === 'standalone') {
    entries.push({
      serviceId: 'filebrowser',
      label: 'FileBrowser',
      localUrl: `http://localhost:${effectivePort(8085)}`,
      externalUrl: extUrl('/files', 'fb'),
      healthEndpoint: '/health',
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Verify that a service is accessible at the given URL.
 * Uses Node.js built-in fetch (Node 18+).
 * Returns status 'skip' when the URL is empty.
 */
export async function verifyServiceAccess(
  entry: ServiceUrlEntry,
  options: { timeout?: number; retries?: number } = {},
): Promise<VerifyResult> {
  const { timeout = 5000, retries = 2 } = options;
  const url = entry.healthUrl ?? (entry.localUrl + (entry.healthEndpoint ?? '/'));

  if (entry.startupDelay) {
    await new Promise((r) => setTimeout(r, entry.startupDelay));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        // Accept any non-5xx response as "reachable"
        const status = res.status < 500 ? 'ok' : 'warn';
        return {
          serviceId: entry.serviceId,
          label: entry.label,
          localUrl: entry.localUrl,
          externalUrl: entry.externalUrl,
          status,
          statusCode: res.status,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (attempt === retries) {
        return {
          serviceId: entry.serviceId,
          label: entry.label,
          localUrl: entry.localUrl,
          externalUrl: entry.externalUrl,
          status: 'fail',
          error: err instanceof Error ? err.message : String(err),
        };
      }
      // Wait 2s before retry
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Should not be reached, but TypeScript requires a return
  return {
    serviceId: entry.serviceId,
    label: entry.label,
    localUrl: entry.localUrl,
    externalUrl: entry.externalUrl,
    status: 'fail',
  };
}

// ---------------------------------------------------------------------------
// Service access guide
// ---------------------------------------------------------------------------

export interface ServiceAccessInfo {
  serviceId: string;
  label: string;
  url: string;
  loginUser?: string;
  loginNote: string;
  homepage: string;
}

/**
 * Build a human-readable access guide for each installed service.
 * Shows the localhost URL and how to log in (or first-run instructions).
 * All URLs and notes are based on official documentation for each service.
 */
export function buildServiceAccessGuide(state: WizardState): ServiceAccessInfo[] {
  const portMap = state.portRemapping ?? {};
  const remap = (p: number): number => portMap[p] ?? p;
  const user = state.admin.username || 'admin';
  const entries: ServiceAccessInfo[] = [];
  const httpPort = remap(80);

  // Web server welcome page (port 80)
  const webService = state.servers.webServer.service;
  entries.push({
    serviceId: webService,
    label:
      webService === 'traefik'
        ? 'Web Server (Traefik)'
        : webService === 'nginx'
          ? 'Web Server (Nginx)'
          : 'Web Server (Caddy)',
    url: `http://localhost:${httpPort}`,
    loginNote: 'No login required — shows server info page',
    homepage: webService === 'traefik' ? 'https://traefik.io/traefik/' : webService === 'nginx' ? 'https://nginx.org/' : 'https://caddyserver.com/',
  });

  // Traefik Dashboard — routed through Traefik labels on port 80 with BasicAuth.
  if (webService === 'traefik') {
    entries.push({
      serviceId: 'traefik-dashboard',
      label: 'Traefik Dashboard',
      url: `http://localhost:${remap(80)}/dashboard/`,
      loginUser: user,
      loginNote: `Login: ${user} / <your password> (BasicAuth)`,
      homepage: 'https://doc.traefik.io/traefik/operations/dashboard/',
    });
  }

  // Gitea — Quick Tunnel: port 3000 not host-exposed, access via Traefik /git
  //         Named Tunnel / no tunnel: direct host port (default 3000)
  // First visit: installation wizard (DB, admin account, site settings)
  // Ref: Gitea docs [server] HTTP_PORT = 3000
  const isQuickTunnelGuide = state.domain.cloudflare.tunnelMode === 'quick';
  const giteaPort = remap(state.servers.gitServer.port);
  const giteaUrl = isQuickTunnelGuide
    ? `http://localhost:${httpPort}/git/`
    : `http://localhost:${giteaPort}`;
  entries.push({
    serviceId: 'gitea',
    label: 'Gitea (Git)',
    url: giteaUrl,
    loginUser: user,
    loginNote: `First visit: installation wizard → then login as ${user}`,
    homepage: 'https://about.gitea.com/',
  });

  // Nextcloud — container port 80 → host 8443
  // Admin account auto-configured via NEXTCLOUD_ADMIN_USER/PASSWORD env vars
  // Ref: https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/reverse_proxy_configuration.html
  if (state.servers.fileServer.enabled) {
    if (state.servers.fileServer.service === 'nextcloud') {
      entries.push({
        serviceId: 'nextcloud',
        label: 'Nextcloud',
        url: `http://localhost:${remap(8443)}`,
        loginUser: user,
        loginNote: `Login: ${user} / <your password>`,
        homepage: 'https://nextcloud.com/',
      });
    } else if (state.servers.fileServer.service === 'minio') {
      // MinIO Console: port 9001 (--console-address :9001)
      // MinIO API: port 9000 (S3-compatible)
      // Ref: https://github.com/minio/docs
      entries.push({
        serviceId: 'minio',
        label: 'MinIO Console',
        url: `http://localhost:${remap(9001)}`,
        loginUser: user,
        loginNote: `Login: ${user} / <your password> (API: localhost:${remap(9000)})`,
        homepage: 'https://min.io/',
      });
    }
  }

  // Jellyfin — port 8096
  // Quick Tunnel: BaseUrl=/jellyfin → web UI at /jellyfin/web/#/wizard/start (first visit)
  // /jellyfin/web/#/home causes "Server Mismatch" when localStorage has a different server URL.
  // Use /wizard/start to avoid mismatch and force fresh setup flow.
  // Ref: https://jellyfin.org/docs/general/post-install/networking
  if (state.servers.media.enabled) {
    const isQuickTunnelAccess = state.domain.cloudflare.tunnelMode === 'quick';
    const jellyfinLocalUrl = isQuickTunnelAccess
      ? `http://localhost:${remap(8096)}/jellyfin/web/#/wizard/start`
      : `http://localhost:${remap(8096)}/web/#/wizard/start`;
    entries.push({
      serviceId: 'jellyfin',
      label: 'Jellyfin (Media)',
      url: jellyfinLocalUrl,
      loginNote: 'First visit: setup wizard — choose language, create admin account',
      homepage: 'https://jellyfin.org/',
    });
  }

  // pgAdmin — container port 80 → host 5050
  // Login: email (PGADMIN_DEFAULT_EMAIL) + password
  // Ref: https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment
  if (
    state.servers.dbServer.enabled &&
    state.servers.dbServer.adminUI &&
    state.servers.dbServer.primary === 'postgresql'
  ) {
    entries.push({
      serviceId: 'pgadmin',
      label: 'pgAdmin (DB)',
      url: `http://localhost:${remap(5050)}/pgadmin`,
      loginUser: `${user}@brewnet.dev`,
      loginNote: `Login: ${user}@brewnet.dev / <your password>`,
      homepage: 'https://www.pgadmin.org/',
    });
  }

  // FileBrowser — container port 80 → host 8085
  // Login: configured admin username/password
  // Ref: https://github.com/gtsteffaniak/filebrowser
  if (state.servers.fileBrowser.enabled && state.servers.fileBrowser.mode === 'standalone') {
    entries.push({
      serviceId: 'filebrowser',
      label: 'FileBrowser',
      url: `http://localhost:${remap(8085)}`,
      loginUser: user,
      loginNote: `Login: ${user} / <your password>`,
      homepage: 'https://filebrowser.org/',
    });
  }

  return entries;
}
