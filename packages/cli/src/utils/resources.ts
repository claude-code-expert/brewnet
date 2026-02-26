/**
 * Brewnet CLI — Resource Estimation & Service Collection (T018)
 *
 * Computes container counts, RAM/disk estimates, service lists,
 * credential propagation targets, and Docker image names from
 * the wizard state.
 *
 * All RAM/disk values are sourced from the canonical RESOURCE_ESTIMATES
 * table (see docs/IMPLEMENT_SPEC.md and public/demo/js/wizard.js).
 *
 * @module utils/resources
 */

// ---------------------------------------------------------------------------
// WizardState type (inline)
// TODO: Import from @brewnet/shared once shared types are published
// ---------------------------------------------------------------------------

export interface WizardState {
  schemaVersion: number;
  projectName: string;
  projectPath: string;
  setupType: 'full' | 'partial';

  admin: {
    username: string;
    password: string;
    storage: 'local';
  };

  servers: {
    webServer: { enabled: true; service: string };
    gitServer: { enabled: true };
    fileServer: { enabled: boolean; service: string };
    appServer: { enabled: boolean };
    dbServer: {
      enabled: boolean;
      primary: string;
      primaryVersion: string;
      dbName: string;
      dbUser: string;
      dbPassword: string;
      adminUI: boolean;
      cache: string;
    };
    media: { enabled: boolean; services: string[] };
    sshServer: {
      enabled: boolean;
      port: number;
      passwordAuth: boolean;
      sftp: boolean;
    };
    mailServer: {
      enabled: boolean;
      service: string;
    };
    fileBrowser: {
      enabled: boolean;
      mode: 'directory' | 'standalone' | '';
    };
  };

  devStack: {
    languages: string[];
    frameworks: Record<string, string>;
    frontend: string[];
  };

  boilerplate: {
    generate: boolean;
    sampleData: boolean;
    devMode: 'hot-reload' | 'production';
  };

  domain: {
    provider: 'local' | 'freedomain' | 'custom';
    freeDomainTld: string;
    name: string;
    ssl: 'none' | 'self-signed' | 'letsencrypt' | 'cloudflare';
    cloudflare: {
      enabled: boolean;
      tunnelToken: string;
      tunnelName: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Resource estimate maps (canonical values from data-model / IMPLEMENT_SPEC)
// ---------------------------------------------------------------------------

/**
 * Estimated RAM usage per service (in MB).
 */
export const SERVICE_RAM_MAP: Readonly<Record<string, number>> = {
  // Web Servers
  traefik: 45,
  nginx: 20,
  caddy: 30,

  // File Servers
  nextcloud: 256,
  minio: 256,

  // Media
  jellyfin: 256,

  // Databases
  postgresql: 120,
  mysql: 256,
  sqlite: 0,

  // Cache
  redis: 12,
  valkey: 12,
  keydb: 16,

  // DB Admin
  pgadmin: 128,

  // App Server (generic user-app container)
  app: 85,

  // SSH Server
  'openssh-server': 16,

  // Mail Server
  'docker-mailserver': 256,

  // FileBrowser
  filebrowser: 32,

  // Cloudflare Tunnel
  cloudflared: 32,

  // Git Server
  gitea: 256,
};

/**
 * Estimated disk usage per service (in GB).
 */
export const SERVICE_DISK_MAP: Readonly<Record<string, number>> = {
  // Web Servers
  traefik: 0.1,
  nginx: 0.1,
  caddy: 0.1,

  // File Servers
  nextcloud: 0.5,
  minio: 0.5,

  // Media
  jellyfin: 0.5,

  // Databases
  postgresql: 0.5,
  mysql: 0.5,
  sqlite: 0.01,

  // Cache
  redis: 0.1,
  valkey: 0.1,
  keydb: 0.1,

  // DB Admin
  pgadmin: 0.2,

  // App
  app: 0.2,

  // SSH Server
  'openssh-server': 0.05,

  // Mail Server
  'docker-mailserver': 0.5,

  // FileBrowser
  filebrowser: 0.1,

  // Cloudflare Tunnel
  cloudflared: 0.05,

  // Git Server
  gitea: 1.0,
};

/**
 * Maps service IDs to their canonical Docker image references.
 */
const DOCKER_IMAGE_MAP: Readonly<Record<string, string>> = {
  traefik: 'traefik:v3.0',
  nginx: 'nginx:1.25-alpine',
  caddy: 'caddy:2-alpine',
  nextcloud: 'nextcloud:29-apache',
  minio: 'minio/minio:latest',
  jellyfin: 'jellyfin/jellyfin:latest',
  postgresql: 'postgres:17-alpine',
  mysql: 'mysql:8.4',
  redis: 'redis:7-alpine',
  valkey: 'valkey/valkey:7-alpine',
  keydb: 'eqalpha/keydb:latest',
  pgadmin: 'dpage/pgadmin4:latest',
  'openssh-server': 'linuxserver/openssh-server:latest',
  'docker-mailserver': 'ghcr.io/docker-mailserver/docker-mailserver:latest',
  filebrowser: 'filebrowser/filebrowser:latest',
  cloudflared: 'cloudflare/cloudflared:latest',
  gitea: 'gitea/gitea:latest',
};

// ---------------------------------------------------------------------------
// Resource estimate result
// ---------------------------------------------------------------------------

export interface ResourceEstimate {
  /** Total number of Docker containers. */
  containers: number;
  /** Estimated total RAM in MB. */
  ramMB: number;
  /** Formatted RAM string (e.g. "1.2 GB"). */
  ramGB: string;
  /** Estimated total disk in GB. */
  diskGB: number;
}

// ---------------------------------------------------------------------------
// Helper: safe map lookups
// ---------------------------------------------------------------------------

function ramFor(serviceId: string): number {
  return SERVICE_RAM_MAP[serviceId] ?? 0;
}

function diskFor(serviceId: string): number {
  return SERVICE_DISK_MAP[serviceId] ?? 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Count the number of Docker containers that will be created
 * for the given wizard state. Does not include Cloudflare Tunnel
 * or Gitea (use `collectAllServices` for the full list).
 *
 * Note: Gitea is always counted. Cloudflare Tunnel is counted
 * in `estimateResources` but not here — this mirrors the demo
 * wizard's `countSelectedServices` behaviour.
 */
export function countSelectedServices(state: WizardState): number {
  const s = state.servers;
  const ds = state.devStack;
  let count = 1; // Web server is always included

  // Gitea (required)
  count++;

  // File Server
  if (s.fileServer.enabled && s.fileServer.service) count++;

  // App Server (only counts if languages selected)
  if (s.appServer.enabled && (ds?.languages ?? []).length > 0) count++;

  // Database (non-sqlite)
  if (s.dbServer.enabled && s.dbServer.primary && s.dbServer.primary !== 'sqlite') {
    count++;
    // Admin UI (pgAdmin)
    if (s.dbServer.adminUI) count++;
  }

  // Cache
  if (s.dbServer.enabled && s.dbServer.cache) count++;

  // Media
  if (s.media.enabled) count += (s.media.services ?? []).length;

  // SSH Server
  if (s.sshServer?.enabled) count++;

  // Mail Server
  if (s.mailServer?.enabled) count++;

  // FileBrowser (standalone mode only — directory mode is served by the web server)
  if (s.fileBrowser?.enabled && s.fileBrowser.mode === 'standalone') count++;

  return count;
}

/**
 * Estimate total RAM and disk usage for all selected services.
 * Includes Cloudflare Tunnel and Gitea.
 */
export function estimateResources(state: WizardState): ResourceEstimate {
  let ram = 0;
  let disk = 0;
  let containers = 0;
  const s = state.servers;

  // Web Server (always present)
  const proxy = s.webServer.service || 'traefik';
  ram += ramFor(proxy) || 40; // fallback 40 MB
  disk += diskFor(proxy) || 0.1;
  containers++;

  // Gitea (required)
  ram += ramFor('gitea');
  disk += diskFor('gitea');
  containers++;

  // File Server
  if (s.fileServer.enabled && s.fileServer.service) {
    ram += ramFor(s.fileServer.service) || 128;
    disk += diskFor(s.fileServer.service) || 0.5;
    containers++;
  }

  // Media
  if (s.media.enabled) {
    for (const svcId of s.media.services ?? []) {
      ram += ramFor(svcId) || 128;
      disk += diskFor(svcId) || 0.5;
      containers++;
    }
  }

  // Database
  if (s.dbServer.enabled && s.dbServer.primary) {
    if (s.dbServer.primary !== 'sqlite') {
      ram += ramFor(s.dbServer.primary) || 120;
      disk += diskFor(s.dbServer.primary) || 0.5;
      containers++;

      // Admin UI
      if (s.dbServer.adminUI) {
        ram += ramFor('pgadmin');
        disk += diskFor('pgadmin');
        containers++;
      }
    }

    // Cache
    if (s.dbServer.cache) {
      ram += ramFor(s.dbServer.cache) || 12;
      disk += 0.1;
      containers++;
    }
  }

  // App Server
  if (s.appServer.enabled && (state.devStack?.languages ?? []).length > 0) {
    ram += ramFor('app');
    disk += diskFor('app');
    containers++;
  }

  // FileBrowser (standalone mode)
  if (s.fileBrowser?.enabled && s.fileBrowser.mode === 'standalone') {
    ram += ramFor('filebrowser');
    disk += diskFor('filebrowser');
    containers++;
  }

  // SSH Server
  if (s.sshServer?.enabled) {
    ram += ramFor('openssh-server');
    disk += diskFor('openssh-server');
    containers++;
  }

  // Mail Server
  if (s.mailServer?.enabled) {
    const mailSvc = s.mailServer.service || 'docker-mailserver';
    ram += ramFor(mailSvc) || 256;
    disk += diskFor(mailSvc) || 0.5;
    containers++;
  }

  // Cloudflare Tunnel
  if (state.domain?.cloudflare?.enabled) {
    ram += ramFor('cloudflared');
    disk += diskFor('cloudflared');
    containers++;
  }

  return {
    containers,
    ramMB: Math.round(ram),
    ramGB: `${(ram / 1024).toFixed(1)} GB`,
    diskGB: parseFloat(disk.toFixed(1)),
  };
}

/**
 * Collect all service IDs that should appear in docker-compose.yml.
 * Returns an array of service ID strings in deterministic order.
 */
export function collectAllServices(state: WizardState): string[] {
  const ids: string[] = [];
  const s = state.servers;

  // Web server (always)
  ids.push(s.webServer.service || 'traefik');

  // Gitea (required)
  ids.push('gitea');

  // File server
  if (s.fileServer.enabled && s.fileServer.service) {
    ids.push(s.fileServer.service);
  }

  // Media
  if (s.media.enabled) {
    for (const m of s.media.services ?? []) {
      ids.push(m);
    }
  }

  // Database (non-sqlite)
  if (s.dbServer.enabled && s.dbServer.primary && s.dbServer.primary !== 'sqlite') {
    ids.push(s.dbServer.primary);
    if (s.dbServer.adminUI) {
      ids.push('pgadmin');
    }
  }

  // Cache
  if (s.dbServer.enabled && s.dbServer.cache) {
    ids.push(s.dbServer.cache);
  }

  // SSH Server
  if (s.sshServer?.enabled) {
    ids.push('openssh-server');
  }

  // Mail Server
  if (s.mailServer?.enabled) {
    ids.push(s.mailServer.service || 'docker-mailserver');
  }

  // FileBrowser (standalone)
  if (s.fileBrowser?.enabled && s.fileBrowser.mode === 'standalone') {
    ids.push('filebrowser');
  }

  // Cloudflare Tunnel
  if (state.domain?.cloudflare?.enabled) {
    ids.push('cloudflared');
  }

  return ids;
}

/**
 * List services that receive the admin credentials during setup.
 *
 * These services have their own user/admin accounts that Brewnet
 * will auto-configure with the same username/password from Step 2.
 */
export function getCredentialTargets(state: WizardState): string[] {
  const targets: string[] = [];
  const s = state.servers;

  // Gitea always receives admin credentials
  targets.push('Gitea');

  if (s.fileServer.enabled && s.fileServer.service === 'nextcloud') {
    targets.push('Nextcloud');
  }
  if (s.fileServer.enabled && s.fileServer.service === 'minio') {
    targets.push('MinIO');
  }
  if (s.dbServer.enabled && s.dbServer.adminUI && s.dbServer.primary !== 'sqlite') {
    targets.push('pgAdmin');
  }
  if (s.media.enabled && (s.media.services ?? []).includes('jellyfin')) {
    targets.push('Jellyfin');
  }
  if (s.sshServer?.enabled) {
    targets.push('SSH Server');
  }
  if (s.mailServer?.enabled) {
    targets.push('Mail Server');
  }
  if (s.fileBrowser?.enabled) {
    targets.push('FileBrowser');
  }

  return targets;
}

/**
 * Get the canonical Docker image reference for a given service ID.
 *
 * @param serviceId - A service identifier (e.g. 'traefik', 'postgresql', 'gitea').
 * @returns The Docker image string (e.g. 'traefik:v3.0').
 *          Falls back to `<serviceId>:latest` for unknown services.
 */
export function getImageName(serviceId: string): string {
  return DOCKER_IMAGE_MAP[serviceId] ?? `${serviceId}:latest`;
}
