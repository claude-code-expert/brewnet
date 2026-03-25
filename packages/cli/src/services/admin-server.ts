/**
 * Brewnet CLI — Local Admin Panel Server (T101a)
 *
 * Node.js built-in HTTP server serving:
 *   - Static HTML dashboard at GET /
 *   - REST API per contracts/admin-api.md
 *
 * Port default: 8088 (localhost-only, no auth required)
 *
 * @module services/admin-server
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { createConnection } from 'node:net';
import { join, resolve, extname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir, cpus, totalmem, freemem, loadavg } from 'node:os';
import Dockerode from 'dockerode';
import { addService, removeService } from './service-manager.js';
import { createBackup, listBackups } from './backup-manager.js';
import { getServiceDefinition, SERVICE_REGISTRY } from '../config/services.js';
// SERVICE_DETAIL_MAP inlined from deleted status-page.ts (T044/T045)
import { getLastProject, loadState } from '../wizard/state.js';
import { logger } from '../utils/logger.js';
import { DomainManager } from './domain-manager.js';
import { verifyToken } from './cloudflare-client.js';
import { type WizardState, type LogSource, type UnifiedLogLevel } from '@brewnet/shared';
import { queryLogs, getLogStats } from '../utils/log-aggregator.js';
import { runRotation } from '../utils/log-rotation.js';
// apps-page.ts import removed — HTML generation replaced by React SPA (T044)
import { createApp, deployLocalApp, getJobStatus, listApps, startApp, stopApp, removeApp as appRemove, getDeployHistory, listGiteaRepos, deployApp, rollbackApp, getAppGitInfo, getAppBranches, updateDeploySettings, getDeploySettings, getAppDir, detectBasePath } from './app-manager.js';
import type { DeploySettings } from '../types/app-entry.js';
import type { CreateAppOptions } from '../types/app-entry.js';
import { getStackById } from '../config/stacks.js';

// ---------------------------------------------------------------------------
// Types (per admin-api.md)
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'error' | 'not_installed';
  cpu: string;
  memory: string;
  uptime: string;
  port: number | null;
  url: string | null;
  externalUrl: string | null;
  removable: boolean;
  stackId?: string;
}

export interface AdminServerOptions {
  port?: number;
  projectPath?: string;
}

// ---------------------------------------------------------------------------
// HTML Dashboard (inline, dynamically generated with embedded config)
// ---------------------------------------------------------------------------

/** Shape of a single stack entry in .brewnet-boilerplate.json */
interface BoilerplateMeta {
  stackId: string;
  appDir?: string;
  backendUrl?: string;
  frontendUrl?: string;
  isUnified?: boolean;
  lang?: string;
  frameworkId?: string;
  dbDriver?: string;
  dbUser?: string;
  dbName?: string;
  gitBranch?: string;
  status?: string;
}

interface DashboardConfig {
  adminUsername: string;
  passwordHint: string;
  domainProvider: string;
  quickTunnelUrl: string;
  zoneName: string;
  tunnelId: string;
}

// ---------------------------------------------------------------------------
// Static icon assets — resolved once at module load from public/images/
// ---------------------------------------------------------------------------

const PKG_ROOT = join(fileURLToPath(import.meta.url), '../../../..');

// ---------------------------------------------------------------------------
// Static file serving for React SPA (packages/admin-ui/dist)
// ---------------------------------------------------------------------------

// admin-ui is always at dist/admin-ui/ (bundled by tsup onSuccess).
// Works identically for npm install and curl install — no conditional paths.
const ADMIN_UI_DIST = join(fileURLToPath(import.meta.url), '../admin-ui');

const MIME_TYPES: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function serveStaticFile(filePath: string, res: ServerResponse, statusCode = 200): void {
  const stat = statSync(filePath);
  const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const isHashed = new RegExp('assets/[^/]+-[A-Za-z0-9]{8,}\\.[^.]+$').test(filePath);
  const cacheControl = isHashed ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate';
  res.writeHead(statusCode, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });
  createReadStream(filePath).pipe(res);
}

/** Brewnet SVG icon (inline string, served at /icon.svg) */
const ICON_SVG = (() => {
  const candidates = [
    join(PKG_ROOT, 'public/images/icon.svg'),
    join(PKG_ROOT, '../public/images/icon.svg'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  // Fallback: inline SVG (amber mug-wifi icon)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="4 6 38 38" fill="none" stroke="#f5a623" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.5" fill="none"/><path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.5" fill="none"/><circle cx="20" cy="30" r="2.2" fill="#f5a623" stroke="none"/><path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3.5" fill="none"/><path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3.5" fill="none"/><path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3.5" fill="none"/></svg>`;
})();

/** Brewnet favicon.ico (binary Buffer, served at /favicon.ico) */
const FAVICON_ICO = (() => {
  const candidates = [
    join(PKG_ROOT, 'public/images/favicon.ico'),
    join(PKG_ROOT, '../public/images/favicon.ico'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p);
  }
  return null;
})();

// ---------------------------------------------------------------------------
// Service catalog data — moved from deleted status-page.ts (T044/T045)
// ---------------------------------------------------------------------------

interface ServiceDetailInfo {
  description: string;
  license: string;
  docs: string;
  features: string[];
  credentials: {
    method: 'env' | 'wizard' | 'cli' | 'basicauth' | 'none';
    summary: string;
    command?: string;
  };
  connectionParams?: { label: string; value: string }[];
  tips: string[];
  securityNote?: string;
}

const SERVICE_DETAIL_MAP: Record<string, ServiceDetailInfo> = {
  Traefik: {
    description: 'Go-based open-source reverse proxy and load balancer',
    license: 'MIT',
    docs: 'https://traefik.io/traefik/',
    features: [
      'Docker label-based automatic service discovery',
      'Let\'s Encrypt certificate auto-renewal',
      'Built-in web dashboard for route monitoring',
      'Middleware chain: BasicAuth, Rate Limit, IP Whitelist',
      'HTTP to HTTPS automatic redirect',
    ],
    credentials: {
      method: 'basicauth',
      summary: 'No login in dev mode (--api.insecure=true). Use BasicAuth middleware for production.',
      command: 'htpasswd -nb admin YOUR_PASSWORD',
    },
    tips: [
      'Remove --api.insecure=true in production and add BasicAuth or Authelia',
      'Set exposedbydefault=false and explicitly enable each service with traefik.enable=true',
      'Add --certificatesresolvers.le.acme.email=YOUR_EMAIL for Let\'s Encrypt',
    ],
    securityNote: '보안상 외부 도메인으로 노출하지 않습니다. 서버 내부(localhost)에서만 접근 가능합니다.',
  },
  'Traefik Dashboard': {
    description: 'Built-in Traefik web UI for monitoring routes, services, and middleware',
    license: 'MIT',
    docs: 'https://doc.traefik.io/traefik/operations/dashboard/',
    features: [
      'Real-time view of HTTP/TCP routers',
      'Service health and load balancer status',
      'Middleware chain visualization',
    ],
    credentials: {
      method: 'none',
      summary: 'No authentication in dev mode (--api.insecure=true). Protected by BasicAuth in production.',
    },
    tips: [
      'Dashboard URL requires trailing slash: /dashboard/',
      'Secure with BasicAuth middleware before exposing externally',
    ],
  },
  Gitea: {
    description: 'Lightweight self-hosted Git service written in Go',
    license: 'MIT',
    docs: 'https://about.gitea.com/',
    features: [
      'GitHub-like web UI with issues, PRs, wiki, project boards',
      'Gitea Actions — GitHub Actions compatible CI/CD',
      'Low memory footprint (~200 MB)',
      'LDAP, OAuth2, SMTP authentication support',
      'PostgreSQL, MySQL, SQLite backend support',
    ],
    credentials: {
      method: 'wizard',
      summary: 'First visit shows Installation Wizard. Create admin account in "Administrator Account Settings" section.',
      command: 'docker exec -it brewnet-gitea gitea admin user create --username admin --password PASSWORD --email admin@brewnet.dev --admin',
    },
    tips: [
      'Set DISABLE_REGISTRATION=true to allow only admin-created accounts',
      'Set REQUIRE_SIGNIN_VIEW=true to prevent anonymous repo browsing',
      'SSH port mapped to 3022 to avoid conflict with host SSH (22)',
    ],
  },
  Nextcloud: {
    description: 'Self-hosted cloud storage platform (Google Drive/Dropbox alternative)',
    license: 'AGPL-3.0',
    docs: 'https://nextcloud.com/',
    features: [
      'File sync, sharing, and collaboration',
      '200+ app extensions: calendar, contacts, notes, office docs',
      'WebDAV protocol support',
      'Desktop and mobile clients available',
    ],
    credentials: {
      method: 'env',
      summary: 'Uses admin credentials set in Pre-Step of brewnet init wizard.',
      command: 'docker exec -u www-data brewnet-nextcloud php occ user:add USERNAME --display-name="Display Name"',
    },
    tips: [
      'Redis connection recommended for file locking and cache performance',
      'Add all access domains/IPs to NEXTCLOUD_TRUSTED_DOMAINS',
      'Switch background jobs to cron: docker exec -u www-data brewnet-nextcloud php occ background:cron',
    ],
  },
  PostgreSQL: {
    description: 'Advanced open-source relational database',
    license: 'PostgreSQL (BSD-like)',
    docs: 'https://www.postgresql.org/',
    features: [
      'Full ACID compliance with MVCC',
      'Native JSON/JSONB support',
      'Full-text search, PostGIS, time-series extensions',
      'Logical and physical replication',
    ],
    credentials: {
      method: 'env',
      summary: 'Configured via POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB environment variables.',
      command: 'docker exec -it brewnet-postgresql psql -U brewnet -d brewnet_db',
    },
    connectionParams: [
      { label: 'host', value: 'localhost' },
      { label: 'port', value: '5432' },
      { label: 'user', value: 'brewnet' },
      { label: 'db', value: 'brewnet_db' },
    ],
    tips: [
      'Internal network only (brewnet-internal) — no host port exposed',
      'Data persisted in named volume — safe across container restarts',
      'Use init SQL scripts in docker-entrypoint-initdb.d/ for multi-DB setup',
    ],
  },
  MySQL: {
    description: 'Popular open-source relational database',
    license: 'GPL-2.0',
    docs: 'https://www.mysql.com/',
    features: [
      'InnoDB storage engine with ACID transactions',
      'JSON support and document store',
      'Replication and clustering',
      'Widely supported by web applications',
    ],
    credentials: {
      method: 'env',
      summary: 'Configured via MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD environment variables.',
      command: 'docker exec -it brewnet-mysql mysql -u brewnet -p brewnet_db',
    },
    connectionParams: [
      { label: 'host', value: 'localhost' },
      { label: 'port', value: '3306' },
      { label: 'user', value: 'brewnet' },
      { label: 'db', value: 'brewnet_db' },
    ],
    tips: [
      'Internal network only (brewnet-internal) — no host port exposed',
      'Root password required at first startup',
      'Init SQL scripts run once from docker-entrypoint-initdb.d/',
    ],
  },
  Redis: {
    description: 'In-memory key-value store for caching and message brokering',
    license: 'BSD-3',
    docs: 'https://redis.io/',
    features: [
      'Session storage, cache, message queue, Pub/Sub',
      'Single-threaded event loop — 100K+ ops/sec',
      'RDB + AOF persistence support',
      'Used by Nextcloud file locking and Gitea caching',
    ],
    credentials: {
      method: 'env',
      summary: 'No traditional user accounts. Optionally secured with --requirepass flag.',
      command: 'docker exec -it brewnet-redis redis-cli ping',
    },
    tips: [
      'Set --maxmemory and --maxmemory-policy to prevent unbounded memory growth',
      'Internal network only — no host port exposed',
      'Redis 6+ supports ACL for multi-user access control',
    ],
  },
  pgAdmin: {
    description: 'Web-based administration tool for PostgreSQL',
    license: 'PostgreSQL (BSD-like)',
    docs: 'https://www.pgadmin.org/',
    features: [
      'SQL editor with query execution and plan visualization',
      'Table, index, view, and function GUI management',
      'Backup and restore (pg_dump, pg_restore)',
      'Multi-server management via server groups',
    ],
    credentials: {
      method: 'env',
      summary: 'Uses admin credentials set in Pre-Step. Email format: {username}@brewnet.dev. Register the DB server after first login.',
    },
    tips: [
      'Connect to PostgreSQL using hostname "postgresql" (Docker container name), port 5432',
      'Set PGADMIN_CONFIG_SERVER_MODE=False to skip login in dev mode',
      'Mount servers.json to auto-register DB servers on startup',
    ],
  },
  Jellyfin: {
    description: 'Open-source media server (Plex/Emby free alternative)',
    license: 'GPL-2.0',
    docs: 'https://jellyfin.org/',
    features: [
      'Movies, TV, music, photos, and live TV/DVR',
      'Hardware transcoding (Intel QSV, NVIDIA NVENC, VAAPI)',
      'Clients for web, Android, iOS, Roku, Fire TV, Kodi',
      'DLNA support',
    ],
    credentials: {
      method: 'wizard',
      summary: 'First visit shows Setup Wizard. Create admin account in step 2 (User).',
    },
    tips: [
      'Mount media folders as read-only (:ro) for safety',
      'Add --device=/dev/dri:/dev/dri for Intel GPU hardware transcoding',
      'DLNA requires --net=host (does not work in Docker bridge mode)',
    ],
  },
  'SSH Server': {
    description: 'Industry-standard remote access via OpenSSH in Docker',
    license: 'BSD',
    docs: 'https://www.openssh.com/',
    features: [
      'Key-based authentication (more secure than passwords)',
      'Built-in SFTP — no separate FTP server needed',
      'Port forwarding and tunneling support',
      'Remote management entry point for Brewnet containers',
    ],
    credentials: {
      method: 'env',
      summary: 'Uses admin username set in Pre-Step. Password auth enabled (PASSWORD_ACCESS=true); switch to key-only after setup.',
      command: 'ssh -p 2222 USER@localhost',
    },
    connectionParams: [
      { label: 'host', value: 'localhost' },
      { label: 'port', value: '2222' },
      { label: 'user', value: '<admin-username>' },
      { label: 'protocol', value: 'SSH / SFTP' },
    ],
    tips: [
      'Switch to key-only auth after initial setup: set PASSWORD_ACCESS=false',
      'Port 2222 avoids conflict with host SSH (port 22)',
      'SFTP runs as SSH subsystem — no separate container needed',
    ],
  },
  FileBrowser: {
    description: 'Lightweight web-based file manager written in Go',
    license: 'Apache-2.0',
    docs: 'https://filebrowser.org/',
    features: [
      'Upload, download, edit, and delete files via browser',
      'Multi-user support with per-user directory scoping',
      'Built-in code editor for text files',
      'Share link generation and shell command execution',
    ],
    credentials: {
      method: 'none',
      summary: 'Default user: admin. Random password printed to container logs on first start.',
      command: 'docker logs brewnet-filebrowser | grep "password"',
    },
    tips: [
      'Initial password is shown only once in logs — change it immediately',
      'Set per-user Scope to restrict directory access',
      'All settings and user data stored in filebrowser.db file',
    ],
  },
  'MinIO Console': {
    description: 'S3-compatible object storage with a web console',
    license: 'AGPL-3.0',
    docs: 'https://min.io/',
    features: [
      'Amazon S3-compatible API',
      'Web console for bucket and object management',
      'Erasure coding and bitrot protection',
      'Multi-user IAM with policies',
    ],
    credentials: {
      method: 'env',
      summary: 'Uses admin credentials set in Pre-Step of brewnet init wizard.',
    },
    tips: [
      'Console on port 9001, API on port 9000',
      'Create IAM users with limited policies for application access',
      'Use mc (MinIO Client) CLI for scripted bucket management',
    ],
  },
  Cloudflared: {
    description: 'Cloudflare Tunnel daemon — exposes local services to the internet securely',
    license: 'Apache-2.0',
    docs: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/',
    features: [
      'No port forwarding or public IP required',
      'Automatic SSL/TLS via Cloudflare',
      'Quick Tunnel (*.trycloudflare.com) or Named Tunnel with custom domain',
      'DDoS protection included',
    ],
    credentials: {
      method: 'none',
      summary: 'No login. Quick Tunnel needs no account. Named Tunnel uses TUNNEL_TOKEN from Cloudflare API.',
    },
    tips: [
      'Quick Tunnel URL changes on every restart — use Named Tunnel for permanent access',
      'Check tunnel status: brewnet domain tunnel status',
      'Audit logs saved to ~/.brewnet/logs/tunnel.log',
    ],
  },
  Nginx: {
    description: 'High-performance HTTP and reverse proxy server',
    license: 'BSD-2',
    docs: 'https://nginx.org/',
    features: [
      'Event-driven architecture — handles 10K+ concurrent connections',
      'Static file serving and reverse proxy',
      'Load balancing with multiple algorithms',
      'SSL/TLS termination',
    ],
    credentials: {
      method: 'none',
      summary: 'No built-in authentication. Use auth_basic module or upstream auth for protection.',
    },
    tips: [
      'Default config serves welcome page on port 80',
      'Use location blocks for path-based routing to upstream services',
      'Reload config without downtime: nginx -s reload',
    ],
  },
  Caddy: {
    description: 'Modern web server with automatic HTTPS',
    license: 'Apache-2.0',
    docs: 'https://caddyserver.com/',
    features: [
      'Automatic HTTPS with Let\'s Encrypt (zero config)',
      'HTTP/2 and HTTP/3 support out of the box',
      'Simple Caddyfile configuration',
      'Reverse proxy with health checks',
    ],
    credentials: {
      method: 'none',
      summary: 'No built-in authentication. Use basicauth directive in Caddyfile for protection.',
    },
    tips: [
      'Caddyfile syntax is simpler than Nginx — great for small setups',
      'Automatic certificate management requires ports 80 and 443',
      'Use caddy reload for config changes without downtime',
    ],
  },
  Valkey: {
    description: 'Open-source, high-performance Redis-compatible in-memory data store (Linux Foundation fork)',
    license: 'BSD-3',
    docs: 'https://valkey.io/',
    features: [
      'Drop-in Redis replacement — fully API compatible',
      'Session storage, cache, message queue, Pub/Sub',
      'RDB + AOF persistence support',
      'Active community-driven development post Redis license change',
    ],
    credentials: {
      method: 'env',
      summary: 'No traditional user accounts. Optionally secured with --requirepass flag.',
      command: 'docker exec -it brewnet-valkey valkey-cli ping',
    },
    tips: [
      'Set --maxmemory and --maxmemory-policy to prevent unbounded memory growth',
      'Internal network only — no host port exposed',
      'Use OBJECT ENCODING to inspect memory layout of individual keys',
    ],
  },
  KeyDB: {
    description: 'Multithreaded Redis-compatible in-memory database with higher throughput',
    license: 'BSD-3',
    docs: 'https://docs.keydb.dev/',
    features: [
      'Multi-threaded architecture — higher throughput than Redis on multi-core CPUs',
      'Active-Active replication for multi-master setups',
      'FLASH storage support for large datasets exceeding RAM',
      'Drop-in Redis replacement — fully API compatible',
    ],
    credentials: {
      method: 'env',
      summary: 'No traditional user accounts. Optionally secured with requirepass config.',
      command: 'docker exec -it brewnet-keydb keydb-cli ping',
    },
    tips: [
      'Set server-threads to number of CPU cores for best performance',
      'Internal network only — no host port exposed',
      'Use keydb-cli --stat to monitor live throughput',
    ],
  },
};

/**
 * Name alias map: SERVICE_REGISTRY display names → SERVICE_DETAIL_MAP keys.
 * Only entries that differ need to be listed here.
 */
const NAME_ALIASES: Record<string, string> = {
  'OpenSSH Server': 'SSH Server',
  'Cloudflare Tunnel': 'Cloudflared',
  'MinIO': 'MinIO Console',
};

// ---------------------------------------------------------------------------
// // Docker helpers
// ---------------------------------------------------------------------------

const docker = new Dockerode();

const REQUIRED_SERVICES = new Set(['traefik', 'nginx', 'caddy', 'gitea']);
// Services excluded from the Catalog UI (infrastructure-only, no user install/remove)
const CATALOG_EXCLUDED = new Set([...REQUIRED_SERVICES, 'openssh-server', 'cloudflared']);

const INTERNAL_SERVICES = new Set(['brewnet-welcome', 'brewnet-landing', 'cloudflared']);

// Non-HTTP services that should never show a clickable local URL.
// All other services with a public TCP port get http://localhost:<port>.
const NO_HTTP_SERVICES = new Set([
  'postgresql', 'mysql', 'mariadb',
  'openssh-server',
]);

// Services that must be accessed through Traefik path-prefix routing.
// Their OVERWRITEWEBROOT / SCRIPT_NAME settings make direct-port access broken.
const TRAEFIK_PATH_SERVICES: Record<string, string> = {
  traefik: 'http://localhost/dashboard/',
  gitea: 'http://localhost/git',
  nextcloud: 'http://localhost/cloud',
  pgadmin: 'http://localhost:5050/pgadmin',
};

// Known SSH ports that should never be used as the primary HTTP port.
const KNOWN_SSH_PORTS = new Set([22, 2222, 3022]);

function getPrimaryPort(container: Dockerode.ContainerInfo): number | null {
  const tcp = (container.Ports ?? [])
    .filter((p) => p.Type === 'tcp' && p.PublicPort && !KNOWN_SSH_PORTS.has(p.PublicPort))
    .sort((a, b) => a.PublicPort! - b.PublicPort!);
  return tcp[0]?.PublicPort ?? null;
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function handleGetServices(
  _req: IncomingMessage,
  res: ServerResponse,
  _parts: string[],
  _body: string,
  _projectPath: string,
  urlMap: Record<string, string> = TRAEFIK_PATH_SERVICES,
  quickTunnelUrl = '',
  allowedDirs?: Set<string>,
  wizardState?: WizardState | null,
): Promise<void> {
  // Named Tunnel subdomain map — composeService → fixed subdomain prefix
  const NAMED_SUBDOMAIN_MAP: Record<string, string> = {
    gitea: 'git',
    nextcloud: 'cloud',
    jellyfin: 'media',
    filebrowser: 'files',
    pgadmin: 'pgadmin',
    minio: 'minio',
  };
  try {
    const allContainers = await docker.listContainers({ all: true });
    const services: ServiceStatus[] = [];

    for (const c of allContainers) {
      const composeService = c.Labels?.['com.docker.compose.service'];
      if (!composeService) continue;
      if (INTERNAL_SERVICES.has(composeService)) continue;

      const workingDir = c.Labels?.['com.docker.compose.project.working_dir'] ?? '';

      // Skip containers from unselected boilerplate stacks.
      // A container whose working_dir is under projectPath but NOT in allowedDirs
      // is an unselected boilerplate stack that shouldn't appear in the dashboard.
      if (allowedDirs && allowedDirs.size > 0) {
        if (workingDir && workingDir.startsWith(_projectPath) && !allowedDirs.has(workingDir)) {
          continue;
        }
      }

      const def = getServiceDefinition(composeService);
      const s = c.State as string;
      const status = s === 'running' ? 'running' : s === 'exited' ? 'stopped' : ('error' as const);
      const port = getPrimaryPort(c) ?? def?.ports?.[0] ?? null;

      // Detect Traefik PathPrefix and strip-prefix from container labels.
      // A container may have multiple PathPrefix routers (e.g. FileBrowser has
      // /files as main route and /static as an extra asset route).  We need the
      // primary router whose name matches `quicktunnel-{serviceId}` exactly,
      // not auxiliary routers like `quicktunnel-{serviceId}-static`.
      const labels = c.Labels ?? {};
      const primaryRouterKey = `traefik.http.routers.quicktunnel-${composeService}.rule`;
      const routerRule: [string, string] | undefined =
        labels[primaryRouterKey] && String(labels[primaryRouterKey]).includes('PathPrefix')
          ? [primaryRouterKey, labels[primaryRouterKey]]
          : Object.entries(labels).find(
              ([k, v]) => k.includes('traefik.http.routers.') && k.endsWith('.rule') && String(v).includes('PathPrefix'),
            );
      let traefikPath = '';
      if (routerRule) {
        const pathMatch = String(routerRule[1]).match(/PathPrefix\(`([^`]+)`\)/);
        if (pathMatch) traefikPath = pathMatch[1]!;
      }
      // basePath stacks (e.g. Next.js): PathPrefix exists but no strip-prefix middleware.
      // The app serves content at the sub-path even on direct port access.
      const hasStripPrefix = Object.keys(labels).some(
        (k) => k.includes('.stripprefix.'),
      );
      const localBasePath = (traefikPath && !hasStripPrefix) ? traefikPath : '';

      // Compute external URL from Traefik PathPrefix labels on the container
      let externalUrl: string | null = null;
      const qtUrl = quickTunnelUrl;
      const tunnelMode = wizardState?.domain?.cloudflare?.tunnelMode ?? 'none';
      const namedDomain = wizardState?.domain?.cloudflare?.zoneName || wizardState?.domain?.name || '';

      if (tunnelMode === 'named' && namedDomain) {
        // Named Tunnel: built-in services use fixed subdomains
        const sub = NAMED_SUBDOMAIN_MAP[composeService];
        if (sub) {
          externalUrl = `https://${sub}.${namedDomain}`;
        }
        // User apps: look up in domainConnections by composeService name
        // (appName may match composeService directly, or be a brewnet- prefixed variant)
        if (!externalUrl) {
          const appNameVariants = [composeService, composeService.replace(/^brewnet-/, '')];
          const conn = (wizardState?.domainConnections ?? []).find(
            (c) => appNameVariants.includes(c.appName),
          );
          if (conn) externalUrl = `https://${conn.hostname}`;
        }
      } else if (qtUrl && traefikPath) {
        // Quick Tunnel: PathPrefix-based URL
        let extPath = traefikPath;
        // Unified API-only stacks (e.g. nextjs-app): append /api/hello
        // so the external URL points to the API endpoint, not the empty root
        const stackLabel = labels['com.brewnet.stack'] ?? '';
        if (stackLabel === 'nodejs-nextjs' || (composeService === 'backend' && extPath.includes('nextjs-app'))) {
          extPath += '/api/hello';
        }
        externalUrl = qtUrl.replace(/\/$/, '') + extPath;
      }
      if (!externalUrl && qtUrl && tunnelMode !== 'named') {
        // Fallback for known homeserver services (EXT_PATHS)
        const EXT_PATH_MAP: Record<string, string> = {
          traefik: '', gitea: '/git', nextcloud: '/cloud', pgadmin: '/pgadmin',
          jellyfin: '/jellyfin', filebrowser: '/files', minio: '/minio',
        };
        if (EXT_PATH_MAP[composeService] !== undefined) {
          externalUrl = qtUrl.replace(/\/$/, '') + EXT_PATH_MAP[composeService];
        }
      }

      // Extract stackId from working_dir relative to projectPath (e.g. ".../go-gin" → "go-gin")
      const stackId = (workingDir && workingDir.startsWith(_projectPath))
        ? workingDir.slice(_projectPath.length).replace(/^[/\\]/, '') || undefined
        : undefined;

      // For generic boilerplate service names (frontend/backend), prefix with the
      // compose project name so cards read "nodejs-express-front" instead of just "frontend".
      const GENERIC_BOILERPLATE_SERVICES = new Set(['frontend', 'backend']);
      const composeProject = c.Labels?.['com.docker.compose.project'] ?? '';
      const isGeneric = GENERIC_BOILERPLATE_SERVICES.has(composeService) && !!composeProject;
      const serviceId   = isGeneric ? `${composeProject}-${composeService}` : composeService;
      const serviceName = isGeneric
        ? `${composeProject}-${composeService === 'frontend' ? 'front' : 'back'}`
        : (def?.name ?? composeService);

      services.push({
        id: serviceId,
        name: serviceName,
        type: def ? inferType(composeService) : 'unknown',
        status,
        cpu: '—',
        memory: '—',
        uptime: c.Status?.startsWith('Up') ? c.Status.replace(/^Up /, '') : '—',
        port: port ?? null,
        // Show a local URL for any service with a public HTTP port.
        // Database/queue services (non-HTTP) are excluded via NO_HTTP_SERVICES.
        // urlMap overrides apply first (e.g. Traefik-path services like gitea → /git).
        // localBasePath: Next.js basePath stacks serve at /apps/{name} even locally.
        url: port && !NO_HTTP_SERVICES.has(composeService)
          ? urlMap[composeService] ?? `http://localhost:${port}${localBasePath}`
          : null,
        externalUrl,
        removable: !REQUIRED_SERVICES.has(composeService),
        stackId,
      });
    }

    const running = services.filter((s) => s.status === 'running').length;
    json(res, 200, {
      services,
      summary: { total: services.length, running, stopped: services.length - running },
    });
  } catch (err) {
    json(res, 500, { success: false, error: String(err), code: 'BN001' });
  }
}

function inferType(id: string): string {
  if (['traefik', 'nginx', 'caddy'].includes(id)) return 'web';
  if (['postgresql', 'mysql'].includes(id)) return 'db';
  if (['nextcloud', 'minio', 'filebrowser'].includes(id)) return 'file';
  if (['jellyfin'].includes(id)) return 'media';
  if (['gitea'].includes(id)) return 'git';
  if (['openssh-server'].includes(id)) return 'ssh';
  return 'app';
}

async function handleServiceAction(
  _req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  _body: string,
  _projectPath: string,
): Promise<void> {
  const serviceId = parts[3]; // /api/services/containers/:id/start|stop → parts[3]=id
  const action = parts[4] as 'start' | 'stop';

  if (!serviceId || !['start', 'stop'].includes(action)) {
    json(res, 400, { success: false, error: 'Invalid request' });
    return;
  }

  try {
    const containers = await docker.listContainers({ all: true });
    const match = containers.find(
      (c) => c.Labels?.['com.docker.compose.service'] === serviceId,
    );

    if (!match) {
      json(res, 404, { success: false, error: 'Service not found', code: 'BN008' });
      return;
    }

    if (action === 'start' && match.State === 'running') {
      json(res, 400, { success: false, error: 'Service is already running', code: 'ALREADY_RUNNING' });
      return;
    }
    if (action === 'stop' && match.State !== 'running') {
      json(res, 400, { success: false, error: 'Service is not running', code: 'NOT_RUNNING' });
      return;
    }

    const container = docker.getContainer(match.Id);
    if (action === 'start') {
      await container.start();
    } else {
      await container.stop();
    }

    const newStatus = action === 'start' ? 'running' : 'stopped';
    json(res, 200, { success: true, id: serviceId, status: newStatus });
  } catch (err) {
    json(res, 500, { success: false, error: String(err), code: 'BN001' });
  }
}

async function handleInstallService(
  _req: IncomingMessage,
  res: ServerResponse,
  _parts: string[],
  body: string,
  projectPath: string,
): Promise<void> {
  try {
    const { id } = JSON.parse(body) as { id: string };
    if (!id) { json(res, 400, { success: false, error: 'Missing service id' }); return; }

    const result = await addService(id, projectPath);
    if (result.success) {
      json(res, 202, { success: true, id, status: 'installed', message: `Service ${id} added` });
    } else {
      const code = result.error?.includes('already') ? 'ALREADY_EXISTS' : 'BN006';
      json(res, result.error?.includes('already') ? 409 : 500, { success: false, error: result.error, code });
    }
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleRemoveService(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  _body: string,
  projectPath: string,
): Promise<void> {
  const serviceId = parts[3]; // DELETE /api/services/containers/:id → parts[3]=id
  if (!serviceId) { json(res, 400, { success: false, error: 'Missing service id' }); return; }

  if (REQUIRED_SERVICES.has(serviceId)) {
    json(res, 400, { success: false, error: `Cannot remove required service: ${serviceId}`, code: 'REQUIRED_SERVICE' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost`);
  const purge = url.searchParams.get('purge') === 'true';

  try {
    const result = await removeService(serviceId, projectPath, { purge });
    if (result.success) {
      json(res, 200, { success: true, id: serviceId, dataPreserved: !purge });
    } else {
      json(res, result.error?.includes('not found') ? 404 : 500, { success: false, error: result.error, code: 'BN008' });
    }
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleGetCatalog(
  _req: IncomingMessage,
  res: ServerResponse,
  _parts: string[],
  _body: string,
  _projectPath: string,
): Promise<void> {
  try {
    const installed = new Set<string>();
    const containers = await docker.listContainers({ all: true });
    for (const c of containers) {
      const id = c.Labels?.['com.docker.compose.service'];
      if (id) installed.add(id);
    }

    const catalog = [...SERVICE_REGISTRY.values()]
      .filter((def) => !CATALOG_EXCLUDED.has(def.id))
      .map((def) => ({
        id: def.id,
        name: def.name,
        description: '',
        category: inferType(def.id),
        image: def.image,
        ramEstimateMB: def.ramMB,
        installed: installed.has(def.id),
      }));

    json(res, 200, { catalog });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleBackup(
  req: IncomingMessage,
  res: ServerResponse,
  _parts: string[],
  _body: string,
  projectPath: string,
): Promise<void> {
  const backupsDir = join(homedir(), '.brewnet', 'backups');

  if (req.method === 'GET') {
    try {
      const backups = listBackups(backupsDir);
      json(res, 200, { backups });
    } catch (err) {
      json(res, 500, { success: false, error: String(err) });
    }
    return;
  }

  // POST - create backup
  try {
    const record = createBackup(projectPath, backupsDir);
    json(res, 202, { success: true, backupId: record.id, status: 'completed' });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Per-app domain operation log buffer (feeds into SSE /logs stream)
// ---------------------------------------------------------------------------

/** In-memory ring buffer: appName → last 200 domain op log lines */
const domainOpLogs = new Map<string, Array<{ line: string; ts: number }>>();

/** Live listeners: SSE clients currently tailing logs for an app */
const domainOpListeners = new Map<string, Set<(line: string) => void>>();

function writeDomainLog(appName: string, line: string): void {
  const tagged = `[domain-connect] ${line}`;
  logger.info('domain', `[${appName}] ${line}`);
  if (!domainOpLogs.has(appName)) domainOpLogs.set(appName, []);
  const buf = domainOpLogs.get(appName)!;
  buf.push({ line: tagged, ts: Date.now() });
  if (buf.length > 200) buf.shift();
  domainOpListeners.get(appName)?.forEach((fn) => fn(tagged));
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createAdminServer(options: AdminServerOptions = {}): {
  server: Server;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  const port = options.port ?? 8088;

  // Resolve project path and wizard state.
  // Always load wizard state from the last project — options.projectPath only
  // overrides the filesystem path, not whether state is loaded.
  let projectPath = options.projectPath ?? process.cwd();
  let wizardState: WizardState | null = null;
  const last = getLastProject();
  if (last) {
    const state = loadState(last);
    if (state) {
      wizardState = state;
      // Only fall back to state.projectPath when caller didn't supply one
      if (!options.projectPath && state.projectPath) projectPath = state.projectPath;
    }
  }
  // Expand leading ~ — Node.js fs APIs do not interpret tilde as home directory
  if (projectPath.startsWith('~/') || projectPath === '~') {
    projectPath = join(homedir(), projectPath.slice(1));
  }

  // Run log rotation eagerly on server start, then every hour
  const _logsDir = join(homedir(), '.brewnet', 'logs');
  try { runRotation(_logsDir, projectPath); } catch { /* non-critical */ }
  const _rotationTimer = setInterval(() => {
    try { runRotation(_logsDir, projectPath); } catch { /* non-critical */ }
  }, 60 * 60 * 1000);

  // Build dashboard config from wizard state (credentials resolved lazily if needed)
  const username = wizardState?.admin?.username ?? '';
  const password = wizardState?.admin?.password ?? '';

  // Mask helpers
  const maskUser = (u: string) => (u.length > 2 ? u.slice(0, -2) + '**' : '**');
  const maskPass = (p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : '********');

  // Build set of allowed compose working dirs for service filtering.
  // Only containers from these directories are shown in the Services table.
  // This excludes unselected boilerplate stacks (e.g. test deployments of all 16 stacks).
  const allowedWorkingDirs = new Set<string>();
  allowedWorkingDirs.add(projectPath); // homeserver services (traefik, gitea, etc.)
  try {
    // Selected boilerplate stacks from wizard
    const bpMetaPath2 = join(projectPath, '.brewnet-boilerplate.json');
    if (existsSync(bpMetaPath2)) {
      const raw2 = JSON.parse(readFileSync(bpMetaPath2, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
      const stacks2: BoilerplateMeta[] = Array.isArray(raw2) ? raw2 : (raw2.stackId ? [raw2] : []);
      for (const s of stacks2) {
        if (s.appDir) allowedWorkingDirs.add(s.appDir);
      }
    }
    // Apps registered via `brewnet deploy` (app-manager) — ~/.brewnet/apps.json
    const appsJsonPath = join(homedir(), '.brewnet', 'apps.json');
    if (existsSync(appsJsonPath)) {
      const apps = JSON.parse(readFileSync(appsJsonPath, 'utf-8')) as Array<{ appDir?: string }>;
      for (const app of apps) {
        if (app.appDir) allowedWorkingDirs.add(app.appDir);
      }
    }
  } catch { /* non-fatal */ }

  const dashConfig: DashboardConfig = {
    adminUsername: username ? maskUser(username) : '**',
    passwordHint: password ? maskPass(password) : '********',
    domainProvider: wizardState?.domain?.provider ?? 'local',
    quickTunnelUrl: wizardState?.domain?.cloudflare?.quickTunnelUrl ?? '',
    zoneName: wizardState?.domain?.cloudflare?.zoneName ?? '',
    tunnelId: wizardState?.domain?.cloudflare?.tunnelId ?? '',
  };

  // Compute runtime URL map — extends static TRAEFIK_PATH_SERVICES.
  // Jellyfin local URL always uses direct port 8096 (bypasses Traefik).
  // Reason: Traefik's catch-all landing page router returns HTTP 200 for any
  // unmapped path (including /System/Info/Public), which confuses Jellyfin SPA's
  // server auto-detection. Direct port access lets Jellyfin redirect unmapped
  // paths to ../../jellyfin/web/, giving the SPA a correct base URL hint.
  const runtimeUrlMap: Record<string, string> = {
    ...TRAEFIK_PATH_SERVICES,
    jellyfin: 'http://localhost:8096/jellyfin/web/',
  };

  let quickTunnelDetected = !!dashConfig.quickTunnelUrl;

  /**
   * Detect Quick Tunnel URL from running cloudflared container logs.
   * Called once on first request if no tunnel URL is in the config.
   */
  async function detectQuickTunnelUrl(): Promise<void> {
    if (quickTunnelDetected) return;
    quickTunnelDetected = true; // prevent repeated attempts
    try {
      const containers = await docker.listContainers({ all: true });
      const cf = containers.find(
        (c) => c.Labels?.['com.docker.compose.service'] === 'cloudflared',
      );
      if (!cf || cf.State !== 'running') return;
      const container = docker.getContainer(cf.Id);
      const logBuf = await container.logs({ stdout: true, stderr: true, tail: 50 });
      const logStr = logBuf.toString('utf-8');
      const match = logStr.match(/https?:\/\/([\w]+-[\w][\w-]*\.trycloudflare\.com)/i);
      if (match) {
        dashConfig.quickTunnelUrl = `https://${match[1]}`;
        dashConfig.domainProvider = 'quick-tunnel';
      }
    } catch {
      // Non-critical — just serve without external URLs
    }
  }

  /**
   * Lazy credential detection from running Nextcloud container env vars.
   * Called once on first dashboard request when wizard state is unavailable.
   */
  let credentialsDetected = !!(username && password);
  async function detectCredentials(): Promise<void> {
    if (credentialsDetected) return;
    credentialsDetected = true; // prevent repeated attempts
    try {
      const containers = await docker.listContainers({ all: true });
      const nc = containers.find(
        (c) => c.Labels?.['com.docker.compose.service'] === 'nextcloud',
      );
      if (!nc) return;
      const info = await docker.getContainer(nc.Id).inspect();
      const envArr: string[] = info.Config?.Env ?? [];
      let u = '';
      let p = '';
      for (const entry of envArr) {
        if (!u && entry.startsWith('NEXTCLOUD_ADMIN_USER=')) {
          u = entry.split('=').slice(1).join('=');
        }
        if (!p && entry.startsWith('NEXTCLOUD_ADMIN_PASSWORD=')) {
          p = entry.split('=').slice(1).join('=');
        }
      }
      if (u || p) {
        dashConfig.adminUsername = maskUser(u || 'admin');
        dashConfig.passwordHint = maskPass(p);
      }
    } catch {
      // Non-critical — fall through to defaults
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const body = await readBody(req);

    // CORS for dev convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve Brewnet SVG icon
    if (req.method === 'GET' && url === '/icon.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      res.end(ICON_SVG);
      return;
    }

    // Serve favicon.ico (binary from disk; fallback: SVG with image/x-icon)
    if (req.method === 'GET' && url === '/favicon.ico') {
      if (FAVICON_ICO) {
        res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
        res.end(FAVICON_ICO);
      } else {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
        res.end(ICON_SVG);
      }
      return;
    }

    // Serve React SPA static assets (/assets/*)
    if (req.method === 'GET' && url.startsWith('/assets/')) {
      const pathname = url.split('?')[0];
      const safePath = resolve(ADMIN_UI_DIST, '.' + pathname);
      if (!safePath.startsWith(ADMIN_UI_DIST)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (existsSync(safePath) && statSync(safePath).isFile()) {
        serveStaticFile(safePath, res);
        return;
      }
      res.writeHead(404); res.end('Not Found');
      return;
    }

    // SPA fallback — serve index.html for all non-API GET requests
    if (req.method === 'GET' && !url.startsWith('/api/')) {
      const pathname = url.split('?')[0];
      // Exact static file (e.g. /vite.svg, /favicon.ico from dist/)
      const exactPath = resolve(ADMIN_UI_DIST, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (exactPath.startsWith(ADMIN_UI_DIST) && existsSync(exactPath) && statSync(exactPath).isFile()) {
        serveStaticFile(exactPath, res);
        return;
      }
      // SPA fallback: serve index.html
      const indexPath = join(ADMIN_UI_DIST, 'index.html');
      if (existsSync(indexPath)) {
        serveStaticFile(indexPath, res);
        return;
      }
      // admin-ui not built yet
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end(
        `Admin UI not found.\n\n` +
        `Expected: ${ADMIN_UI_DIST}/index.html\n\n` +
        `Reinstall: curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash`,
      );
      return;
    }


    // --- API routing ---
    if (parts[0] === 'api') {
      try {
        if (parts[1] === 'health' && req.method === 'GET') {
          // When a password is configured, validate it so PasswordGate can
          // use this endpoint as the real auth check.
          if (wizardState?.admin?.password) {
            const provided = req.headers['x-admin-password'] as string | undefined;
            if (!provided || provided !== wizardState.admin.password) {
              json(res, 401, { error: 'Unauthorized', message: 'Admin password required' });
              return;
            }
          }
          json(res, 200, { status: 'ok', version: '1.0.1' });
          return;
        }

        // GET /api/services/catalog — SERVICE_DETAIL_MAP + NAME_ALIASES for React SPA
        if (parts[1] === 'services' && parts[2] === 'catalog' && req.method === 'GET') {
          const adminUser = wizardState?.admin?.username ?? 'USER';
          const catalog = { ...SERVICE_DETAIL_MAP };
          if (catalog['SSH Server']) {
            catalog['SSH Server'] = {
              ...catalog['SSH Server'],
              credentials: {
                ...catalog['SSH Server'].credentials!,
                command: `ssh -p 2222 ${adminUser}@localhost`,
              },
              connectionParams: catalog['SSH Server'].connectionParams?.map((p) =>
                p.label === 'user' ? { ...p, value: adminUser } : p,
              ),
            };
          }
          json(res, 200, { catalog, aliases: NAME_ALIASES });
          return;
        }

        // GET /api/config — dashboard bootstrap data for React SPA
        if (parts[1] === 'config' && req.method === 'GET') {
          await detectQuickTunnelUrl();
          await detectCredentials();
          json(res, 200, {
            adminUsername: dashConfig.adminUsername,
            passwordHint: dashConfig.passwordHint,
            domainProvider: dashConfig.domainProvider,
            quickTunnelUrl: dashConfig.quickTunnelUrl,
            zoneName: dashConfig.zoneName,
            tunnelId: dashConfig.tunnelId,
          });
          return;
        }

        if (parts[1] === 'services') {
          if (req.method === 'GET' && parts.length === 2) {
            await handleGetServices(req, res, parts, body, projectPath, runtimeUrlMap, dashConfig.quickTunnelUrl, allowedWorkingDirs, wizardState);
            return;
          }
          if (req.method === 'POST' && parts[2] === 'install') {
            await handleInstallService(req, res, parts, body, projectPath);
            return;
          }

          // POST /api/services/containers/:id/start|stop → parts[3]=id, parts[4]=action
          if (req.method === 'POST' && parts[3] && ['start', 'stop'].includes(parts[4] ?? '')) {
            await handleServiceAction(req, res, parts, body, projectPath);
            return;
          }
          // DELETE /api/services/containers/:id → parts[3]=id
          if (req.method === 'DELETE' && parts[3]) {
            await handleRemoveService(req, res, parts, body, projectPath);
            return;
          }
        }

        if (parts[1] === 'catalog' && req.method === 'GET') {
          await handleGetCatalog(req, res, parts, body, projectPath);
          return;
        }

        if (parts[1] === 'backup') {
          await handleBackup(req, res, parts, body, projectPath);
          return;
        }

        // ── Metrics API ─────────────────────────────────────────────
        if (parts[1] === 'metrics' && req.method === 'GET') {
          if (parts[2] === 'system') {
            const totalMem = totalmem();
            const freeMem = freemem();
            const usedMem = totalMem - freeMem;
            const cpuCores = cpus();
            const load = loadavg();
            json(res, 200, {
              cpu: {
                cores: cpuCores.length,
                model: cpuCores[0]?.model ?? 'unknown',
                loadAvg: { '1m': load[0], '5m': load[1], '15m': load[2] },
                usagePercent: Math.min(100, (load[0]! / cpuCores.length) * 100),
              },
              memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                usagePercent: (usedMem / totalMem) * 100,
              },
              uptime: process.uptime(),
              timestamp: new Date().toISOString(),
            });
            return;
          }
          if (parts[2] === 'containers') {
            try {
              const containers = await docker.listContainers({ all: false });
              const metrics = await Promise.all(
                containers.map(async (c) => {
                  const name = (c.Names[0] ?? '').replace(/^\//, '');
                  try {
                    const container = docker.getContainer(c.Id);
                    const stats = await new Promise<Dockerode.ContainerStats>((resolve, reject) => {
                      container.stats({ stream: false }, (err, data) => {
                        if (err) reject(err);
                        else resolve(data!);
                      });
                    });
                    const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
                    const sysDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
                    const numCpus = stats.cpu_stats?.online_cpus ?? cpus().length;
                    const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * numCpus * 100 : 0;
                    const memUsage = stats.memory_stats?.usage ?? 0;
                    const memLimit = stats.memory_stats?.limit ?? 1;
                    const memCache = stats.memory_stats?.stats?.cache ?? 0;
                    const memActual = memUsage - memCache;
                    return {
                      name,
                      id: c.Id.slice(0, 12),
                      status: c.State,
                      cpu: Math.round(cpuPercent * 100) / 100,
                      memory: { usage: memActual, limit: memLimit, percent: (memActual / memLimit) * 100 },
                      network: {
                        rx: Object.values(stats.networks ?? {}).reduce((s, n) => s + (n.rx_bytes ?? 0), 0),
                        tx: Object.values(stats.networks ?? {}).reduce((s, n) => s + (n.tx_bytes ?? 0), 0),
                      },
                    };
                  } catch {
                    return { name, id: c.Id.slice(0, 12), status: c.State, cpu: 0, memory: { usage: 0, limit: 0, percent: 0 }, network: { rx: 0, tx: 0 } };
                  }
                }),
              );
              json(res, 200, { containers: metrics, timestamp: new Date().toISOString() });
            } catch (e) {
              json(res, 500, { error: `Docker metrics failed: ${e instanceof Error ? e.message : String(e)}` });
            }
            return;
          }
        }

        // ── Logs API (T021-T022) ────────────────────────────────────
        if (parts[1] === 'logs') {
          if (req.method === 'GET' && parts[2] === 'stats') {
            const stats = await getLogStats(projectPath);
            json(res, 200, stats);
            return;
          }
          if (req.method === 'GET') {
            const qUrl = new URL(url, 'http://localhost');
            const sources = qUrl.searchParams.get('source');
            const levels = qUrl.searchParams.get('level');
            const services = qUrl.searchParams.get('service');
            const since = qUrl.searchParams.get('since') ?? undefined;
            const until = qUrl.searchParams.get('until') ?? undefined;
            const search = qUrl.searchParams.get('search') ?? undefined;
            const limit = parseInt(qUrl.searchParams.get('limit') ?? '100', 10);
            const offset = parseInt(qUrl.searchParams.get('offset') ?? '0', 10);

            const result = await queryLogs(
              {
                sources: sources ? [sources as LogSource] : undefined,
                levels: levels ? [levels as UnifiedLogLevel] : undefined,
                services: services ? [services] : undefined,
                since,
                until,
                search,
                limit: isNaN(limit) ? 100 : limit,
                offset: isNaN(offset) ? 0 : offset,
              },
              projectPath,
            );
            json(res, 200, result);
            return;
          }
        }

        if (parts[1] === 'apps') {
          if (req.method === 'GET' && parts.length === 2) {
            const apps = await listApps();
            // Enrich with lastDeployedAt + localUrl (with basePath for Next.js)
            const history = getDeployHistory();
            const historyByApp = new Map<string, typeof history[0]>();
            for (const h of history) { if (h.status === 'success') historyByApp.set(h.appName, h); }
            // Load boilerplate meta once for frontend URL lookup
            const bpMetaPath = join(projectPath, '.brewnet-boilerplate.json');
            const bpMetaMap = new Map<string, BoilerplateMeta>();
            if (existsSync(bpMetaPath)) {
              try {
                const raw = JSON.parse(readFileSync(bpMetaPath, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
                const metas: BoilerplateMeta[] = Array.isArray(raw) ? raw : [raw];
                for (const m of metas) bpMetaMap.set(m.stackId, m);
              } catch { /* ignore parse errors */ }
            }
            const enrichedApps = apps.map((a) => {
              const lastDeploy = historyByApp.get(a.name) ?? null;
              const qt = dashConfig.quickTunnelUrl;
              // Non-unified: bpMeta says so, or fall back to stack catalog (for create-app apps)
              const bpMeta = a.mode === 'boilerplate' && a.stackId ? bpMetaMap.get(a.stackId) : undefined;
              const isNonUnified = bpMeta
                ? bpMeta.isUnified === false
                : !!(a.stackId && getStackById(a.stackId)?.isUnified === false);
              let localUrl: string | null;
              let externalUrl: string | null;
              let backendLocalUrl: string | null = null;
              let backendExternalUrl: string | null = null;
              // Check domainConnections for this app (Named Tunnel or any connected domain)
              const domainConn = (wizardState?.domainConnections ?? []).find((c) => c.appName === a.name);
              if (isNonUnified) {
                // Read actual FRONTEND_PORT from .env — meta may have stale default (3000)
                let frontendPort = 3000;
                const feEnvPath = join(a.appDir, '.env');
                if (existsSync(feEnvPath)) {
                  const feEnvContent = readFileSync(feEnvPath, 'utf-8');
                  const fePortMatch = feEnvContent.match(/^FRONTEND_PORT=(\d+)/m);
                  if (fePortMatch) frontendPort = parseInt(fePortMatch[1], 10);
                }
                localUrl = `http://127.0.0.1:${frontendPort}`;
                externalUrl = domainConn ? `https://${domainConn.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${a.name}-ui` : null);
                backendLocalUrl = a.port ? `http://127.0.0.1:${a.port}` : null;
                backendExternalUrl = domainConn ? `https://${domainConn.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${a.name}` : null);
              } else {
                // Compute localUrl with basePath (same logic as Dashboard services)
                localUrl = a.port ? `http://localhost:${a.port}` : null;
                if (a.appDir) {
                  const bp = detectBasePath(a.appDir);
                  if (bp && localUrl) localUrl += bp;
                }
                externalUrl = domainConn ? `https://${domainConn.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${a.name}` : null);
              }
              return { ...a, lastDeployedAt: lastDeploy?.deployedAt ?? null, localUrl, externalUrl, backendLocalUrl, backendExternalUrl };
            });
            logger.info('admin-server', `[GET /api/apps] returning ${apps.length} app(s): ${JSON.stringify(apps.map((a) => a.name))}`);
            json(res, 200, { apps: enrichedApps });
            return;
          }
          if (req.method === 'GET' && parts[2] === 'boilerplates') {
            const bpPath = join(projectPath, '.brewnet-boilerplate.json');
            const metas: BoilerplateMeta[] = [];
            // Wizard-era boilerplates (from .brewnet-boilerplate.json)
            if (existsSync(bpPath)) {
              const raw = JSON.parse(readFileSync(bpPath, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
              const wizardMetas = Array.isArray(raw) ? raw : [raw];
              metas.push(...wizardMetas);
            }
            // create-app boilerplate apps (from apps.json)
            const allApps = await listApps();
            for (const app of allApps) {
              if (app.mode !== 'boilerplate' || !app.stackId) continue;
              // Skip if already covered by wizard .brewnet-boilerplate.json (same appDir)
              if (metas.some((m) => m.appDir && app.appDir && m.appDir === app.appDir)) continue;
              const envPath = join(app.appDir, '.env');
              let frontendPort: number | undefined;
              let dbDriver: string | undefined;
              let dbUser: string | undefined;
              let dbName: string | undefined;
              if (existsSync(envPath)) {
                const envContent = readFileSync(envPath, 'utf-8');
                const fpMatch = envContent.match(/^FRONTEND_PORT=(\d+)/m);
                if (fpMatch) frontendPort = parseInt(fpMatch[1]!, 10);
                const ddMatch = envContent.match(/^DB_DRIVER=(.+)/m);
                if (ddMatch) dbDriver = ddMatch[1]!.trim();
                const duMatch = envContent.match(/^DB_USER=(.+)/m);
                if (duMatch) dbUser = duMatch[1]!.trim();
                const dnMatch = envContent.match(/^DB_NAME=(.+)/m);
                if (dnMatch) dbName = dnMatch[1]!.trim();
              }
              const stackEntry = getStackById(app.stackId);
              metas.push({
                stackId: app.stackId,
                appDir: app.appDir,
                backendUrl: `http://127.0.0.1:${app.port}`,
                frontendUrl: frontendPort ? `http://127.0.0.1:${frontendPort}` : undefined,
                isUnified: stackEntry?.isUnified ?? false,
                lang: app.lang,
                dbDriver,
                dbUser,
                dbName,
                status: app.status,
              });
            }
            logger.info('admin-server', `[GET /api/apps/boilerplates] returning ${metas.length} boilerplate(s) (wizard=${metas.length - allApps.filter((a) => a.mode === 'boilerplate' && a.stackId).length}, create-app=${allApps.filter((a) => a.mode === 'boilerplate' && a.stackId).length})`);
            json(res, 200, { boilerplates: metas });
            return;
          }
          // POST /api/apps/boilerplates/:stackId/stop — docker compose down
          // POST /api/apps/boilerplates/:stackId/start — docker compose up -d
          if (req.method === 'POST' && parts[2] === 'boilerplates' && parts[3] && (parts[4] === 'stop' || parts[4] === 'start')) {
            const stackId = decodeURIComponent(parts[3]);
            const action = parts[4] as 'stop' | 'start';
            const bpPath = join(projectPath, '.brewnet-boilerplate.json');
            if (!existsSync(bpPath)) { json(res, 404, { error: 'No boilerplates found' }); return; }
            const bpRaw = JSON.parse(readFileSync(bpPath, 'utf-8'));
            const bpMetas: BoilerplateMeta[] = Array.isArray(bpRaw) ? bpRaw : [bpRaw];
            const meta = bpMetas.find((m) => m.stackId === stackId);
            if (!meta) { json(res, 404, { error: `Boilerplate "${stackId}" not found` }); return; }
            const { execa: execaBp } = await import('execa');
            if (action === 'stop') {
              await execaBp('docker', ['compose', 'down'], { cwd: meta.appDir });
              meta.status = 'stopped';
            } else {
              await execaBp('docker', ['compose', 'up', '-d'], { cwd: meta.appDir });
              meta.status = 'running';
            }
            // Persist status update back to .brewnet-boilerplate.json
            const { writeFileSync } = await import('node:fs');
            writeFileSync(bpPath, JSON.stringify(bpMetas, null, 2), 'utf-8');
            json(res, 200, { success: true });
            return;
          }
          if (req.method === 'POST' && parts[2] === 'create') {
            const opts = JSON.parse(body) as CreateAppOptions;
            if (opts.mode === 'local-path') {
              if (!opts.localPath) { json(res, 400, { error: 'localPath is required for local-path mode' }); return; }
              const jobId = await deployLocalApp({ appName: opts.appName, localPath: opts.localPath, port: opts.port ?? 3000 });
              json(res, 202, { jobId });
            } else {
              const jobId = await createApp(opts);
              json(res, 202, { jobId });
            }
            return;
          }
          if (req.method === 'GET' && parts[2] === 'jobs' && parts[3]) {
            const job = getJobStatus(parts[3]);
            if (!job) { json(res, 404, { error: 'Job not found' }); return; }
            json(res, 200, job as unknown as Record<string, unknown>);
            return;
          }
          if (req.method === 'POST' && parts[3] === 'start') {
            await startApp(decodeURIComponent(parts[2] ?? ''));
            json(res, 200, { success: true });
            return;
          }
          if (req.method === 'POST' && parts[3] === 'stop') {
            await stopApp(decodeURIComponent(parts[2] ?? ''));
            json(res, 200, { success: true });
            return;
          }
          if (req.method === 'DELETE' && parts[2]) {
            await appRemove(parts[2]);
            json(res, 200, { success: true });
            return;
          }

          // GET /api/apps/:name — single app detail (enriched with lastDeployedAt + URLs)
          if (req.method === 'GET' && parts[2] && !['boilerplates', 'jobs', 'check-port'].includes(parts[2]) && parts.length === 3) {
            const apps = await listApps();
            const found = apps.find((a) => a.name === decodeURIComponent(parts[2]!));
            if (!found) { json(res, 404, { error: 'App not found' }); return; }
            const history = getDeployHistory();
            const lastDeploy = history.filter((h) => h.appName === found.name && h.status === 'success').pop() ?? null;
            const qt = dashConfig.quickTunnelUrl;
            const bpMetaSingle = found.mode === 'boilerplate' && found.stackId
              ? (() => {
                  const p = join(projectPath, '.brewnet-boilerplate.json');
                  if (!existsSync(p)) return undefined;
                  try {
                    const raw = JSON.parse(readFileSync(p, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
                    const list = Array.isArray(raw) ? raw : [raw];
                    return list.find((m) => m.stackId === found.stackId);
                  } catch { return undefined; }
                })()
              : undefined;
            // Non-unified: bpMeta says so, or fall back to stack catalog (for create-app apps)
            const isNonUnified = bpMetaSingle
              ? bpMetaSingle.isUnified === false
              : !!(found.stackId && getStackById(found.stackId)?.isUnified === false);
            let localUrlSingle: string | null;
            let externalUrlSingle: string | null;
            let backendLocalUrlSingle: string | null = null;
            let backendExternalUrlSingle: string | null = null;
            const domainConnSingle = (wizardState?.domainConnections ?? []).find((c) => c.appName === found.name);
            if (isNonUnified) {
              let frontendPort = 3000;
              const feEnvPath = join(found.appDir, '.env');
              if (existsSync(feEnvPath)) {
                const m = readFileSync(feEnvPath, 'utf-8').match(/^FRONTEND_PORT=(\d+)/m);
                if (m) frontendPort = parseInt(m[1], 10);
              }
              localUrlSingle = `http://127.0.0.1:${frontendPort}`;
              externalUrlSingle = domainConnSingle ? `https://${domainConnSingle.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${found.name}-ui` : null);
              backendLocalUrlSingle = found.port ? `http://127.0.0.1:${found.port}` : null;
              backendExternalUrlSingle = domainConnSingle ? `https://${domainConnSingle.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${found.name}` : null);
            } else {
              localUrlSingle = found.port ? `http://localhost:${found.port}` : null;
              if (found.appDir) {
                const bp = detectBasePath(found.appDir);
                if (bp && localUrlSingle) localUrlSingle += bp;
              }
              externalUrlSingle = domainConnSingle ? `https://${domainConnSingle.hostname}` : (qt ? `${qt.replace(/\/$/, '')}/apps/${found.name}` : null);
            }
            const app = { ...found, lastDeployedAt: lastDeploy?.deployedAt ?? null, localUrl: localUrlSingle, externalUrl: externalUrlSingle, backendLocalUrl: backendLocalUrlSingle, backendExternalUrl: backendExternalUrlSingle };
            json(res, 200, { app });
            return;
          }

          // GET /api/apps/:name/git
          if (req.method === 'GET' && parts[3] === 'git' && parts.length === 4) {
            try {
              const git = await getAppGitInfo(decodeURIComponent(parts[2] ?? ''));
              json(res, 200, { git });
            } catch (err) {
              json(res, 502, { error: String(err) });
            }
            return;
          }

          // GET /api/apps/:name/branches
          if (req.method === 'GET' && parts[3] === 'branches' && parts.length === 4) {
            try {
              const branches = await getAppBranches(decodeURIComponent(parts[2] ?? ''));
              json(res, 200, { branches });
            } catch (_err) {
              json(res, 200, { branches: [] });
            }
            return;
          }

          // GET /api/apps/:name/deploy/settings
          if (req.method === 'GET' && parts[3] === 'deploy' && parts[4] === 'settings') {
            const settings = getDeploySettings(decodeURIComponent(parts[2] ?? ''));
            json(res, 200, settings);
            return;
          }

          // PUT /api/apps/:name/deploy/settings
          if (req.method === 'PUT' && parts[3] === 'deploy' && parts[4] === 'settings') {
            const opts = JSON.parse(body) as Partial<DeploySettings>;
            updateDeploySettings(decodeURIComponent(parts[2] ?? ''), opts);
            json(res, 200, { success: true });
            return;
          }

          // POST /api/apps/:name/deploy — manual deploy trigger
          if (req.method === 'POST' && parts[3] === 'deploy' && !parts[4]) {
            const jobId = await deployApp(decodeURIComponent(parts[2] ?? ''));
            json(res, 202, { jobId });
            return;
          }

          // POST /api/apps/:name/rollback — rollback to a specific commit
          if (req.method === 'POST' && parts[3] === 'rollback' && !parts[4]) {
            let parsed: { commitHash?: string } = {};
            try { parsed = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
            if (!parsed.commitHash) { json(res, 400, { error: 'commitHash is required' }); return; }
            const jobId = await rollbackApp(decodeURIComponent(parts[2] ?? ''), parsed.commitHash);
            json(res, 202, { jobId });
            return;
          }

          // GET /api/apps/:name/logs — SSE stream (auth: X-Admin-Password header or ?token query)
          if (req.method === 'GET' && parts[3] === 'logs') {
            const appDir = getAppDir(decodeURIComponent(parts[2] ?? ''));
            if (!appDir) { json(res, 404, { error: 'App not found' }); return; }
            // SSE: EventSource cannot send custom headers so this endpoint is
            // intentionally unauthenticated (log data is read-only, non-sensitive).
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            // Flush headers immediately so EventSource fires 'open' even before
            // docker compose logs produces its first output line.
            res.flushHeaders();
            const { execa: execaLocal } = await import('execa');
            const proc = execaLocal('docker', ['compose', 'logs', '--follow', '--tail', '50'], {
              cwd: appDir,
              reject: false,
              stdout: 'pipe',
              stderr: 'pipe',
            });
            const sendLine = (line: string) => {
              if (line.trim()) res.write(`data: ${line.replace(/\r?\n/g, ' ')}\n\n`);
            };
            proc.stdout?.on('data', (chunk: Buffer) => {
              for (const line of chunk.toString().split('\n')) sendLine(line);
            });
            proc.stderr?.on('data', (chunk: Buffer) => {
              for (const line of chunk.toString().split('\n')) sendLine(line);
            });

            // Also stream domain operation logs (domain connect/disconnect events)
            const sseAppName = decodeURIComponent(parts[2] ?? '');
            const domainListener = (line: string) => sendLine(line);
            if (!domainOpListeners.has(sseAppName)) domainOpListeners.set(sseAppName, new Set());
            domainOpListeners.get(sseAppName)!.add(domainListener);
            // Flush recent domain op logs on connect
            for (const entry of domainOpLogs.get(sseAppName) ?? []) sendLine(entry.line);

            req.on('close', () => {
              try { proc.kill(); } catch { /* ignore */ }
              domainOpListeners.get(sseAppName)?.delete(domainListener);
            });
            return;
          }
        }

        // ── Gitea auto-login proxy ──────────────────────────────────
        // GET /api/gitea/autologin?redirect=<gitea-internal-path>
        // Server-side: log into Gitea with admin creds, forward session cookie,
        // redirect browser to the target Gitea page — no plaintext creds in client.
        if (parts[1] === 'gitea' && parts[2] === 'autologin' && req.method === 'GET') {
          const reqUrl = new URL(req.url ?? '/', 'http://localhost');
          const redirectPath = reqUrl.searchParams.get('redirect') ?? '/git';
          const giteaBase = 'http://localhost/git';
          const targetUrl = `http://localhost${redirectPath.startsWith('/') ? redirectPath : '/' + redirectPath}`;
          try {
            // Step 1: GET login page to obtain CSRF cookie + form token
            const loginPageRes = await fetch(`${giteaBase}/user/login`, {
              redirect: 'manual',
              headers: { 'User-Agent': 'brewnet-admin' },
              signal: AbortSignal.timeout(5000),
            });
            const rawSetCookies: string[] = [];
            loginPageRes.headers.forEach((val, key) => {
              if (key.toLowerCase() === 'set-cookie') rawSetCookies.push(val);
            });
            const csrfCookieFull = rawSetCookies.find((c) => c.startsWith('_csrf=')) ?? '';
            const csrfCookieVal = csrfCookieFull.split(';')[0] ?? '';
            const pageHtml = await loginPageRes.text();
            const csrfField = pageHtml.match(/name="_csrf"\s+value="([^"]+)"/)?.[1]
              ?? pageHtml.match(/value="([^"]+)"\s+name="_csrf"/)?.[1]
              ?? csrfCookieVal.replace('_csrf=', '');
            if (!csrfField) {
              // CSRF unavailable — redirect without login (Gitea will show login page)
              res.writeHead(302, { Location: targetUrl });
              res.end();
              return;
            }
            // Step 2: POST login form with admin credentials
            const formBody = new URLSearchParams({
              _csrf: csrfField,
              user_name: username,
              password: password,
              remember: 'on',
            });
            const loginRes = await fetch(`${giteaBase}/user/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': csrfCookieVal,
                'User-Agent': 'brewnet-admin',
              },
              body: formBody.toString(),
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            });
            // Step 3: Extract ALL Gitea cookies from login response and forward them.
            // Gitea sets cookies with Path=/git (matching its ROOT_URL sub-path).
            // We must preserve the original Path so the browser sends them to Gitea.
            const respCookies: string[] = [];
            loginRes.headers.forEach((val, key) => {
              if (key.toLowerCase() === 'set-cookie') respCookies.push(val);
            });
            // Forward all non-empty, non-delete cookies (skip Max-Age=0 deletion entries)
            const forwardCookies = respCookies.filter((c) => !c.includes('Max-Age=0') && !c.match(/=;\s/));
            const responseHeaders: Record<string, string | string[]> = { Location: targetUrl };
            if (forwardCookies.length > 0) {
              responseHeaders['Set-Cookie'] = forwardCookies;
            } else {
              logger.warn('admin-server', '[gitea/autologin] login POST did not return session cookies');
            }
            res.writeHead(302, responseHeaders);
            res.end();
          } catch (err) {
            logger.warn('admin-server', `[gitea/autologin] failed: ${String(err)}`);
            res.writeHead(302, { Location: targetUrl });
            res.end();
          }
          return;
        }

        // ── Deploy history, Git repos & Webhook ────────────────────
        if (parts[1] === 'deploy' && parts[2] === 'history' && req.method === 'GET') {
          const reqUrl = new URL(req.url ?? '/', 'http://localhost');
          const appFilter = reqUrl.searchParams.get('app') ?? undefined;
          const entries = getDeployHistory(appFilter);
          json(res, 200, { history: entries });
          return;
        }

        if (parts[1] === 'git' && parts[2] === 'repos' && req.method === 'GET') {
          try {
            const repos = await listGiteaRepos();
            const appsForEnrich = await listApps();
            // Enrich repos: map Gitea field names + attach connected appName
            const enriched = repos.map((repo) => {
              const r = repo as unknown as Record<string, unknown>;
              const connectedApp = appsForEnrich.find((app) =>
                app.giteaRepoUrl && (
                  app.giteaRepoUrl.endsWith('/' + repo.name) ||
                  app.giteaRepoUrl.includes('/' + repo.name + '.')
                ),
              );
              return {
                ...repo,
                language: (r['language'] as string | undefined) ?? '',
                stars: (r['stars_count'] as number | undefined) ?? 0,
                updatedAt: (r['updated'] as string | undefined) ?? '',
                appName: connectedApp?.name,
              };
            });
            json(res, 200, { repos: enriched });
          } catch (err) {
            json(res, 502, { success: false, error: String(err) });
          }
          return;
        }

        // POST /api/git/repos/:name/connect — Associate repo with an app
        if (parts[1] === 'git' && parts[2] === 'repos' && parts[3] && parts[4] === 'connect' && req.method === 'POST') {
          const repoName = decodeURIComponent(parts[3]);
          let parsed: { appName?: string } = {};
          try { parsed = JSON.parse(body); } catch { json(res, 400, { error: 'Invalid JSON' }); return; }
          const appName = parsed.appName?.trim();
          if (!appName) { json(res, 400, { error: 'appName required' }); return; }
          try {
            const appsPath = join(homedir(), '.brewnet', 'apps.json');
            let existing = existsSync(appsPath) ? JSON.parse(readFileSync(appsPath, 'utf-8')) : [];
            const repos = await listGiteaRepos();
            const repo = repos.find(r => r.name === repoName);
            if (!repo) { json(res, 404, { error: `Repo '${repoName}' not found in Gitea` }); return; }
            const repoUrl = repo.clone_url.replace(/\.git$/, '');
            // Check not already connected to a different app
            const conflict = Array.isArray(existing) ? existing.find((a: { name: string; giteaRepoUrl?: string }) =>
              a.name !== appName && a.giteaRepoUrl && (a.giteaRepoUrl.endsWith('/' + repoName) || a.giteaRepoUrl.includes('/' + repoName + '.'))) : null;
            if (conflict) { json(res, 409, { error: `Repo already connected to app '${conflict.name}'` }); return; }
            let app = Array.isArray(existing) ? existing.find((a: { name: string }) => a.name === appName) : null;
            if (!app) {
              // Auto-create app entry for orphaned containers (e.g. wizard boilerplate
              // where health check failed but Gitea repo + Docker containers exist)
              const docker = new (await import('dockerode')).default();
              const containers = await docker.listContainers({ all: true });
              const matchedContainer = containers.find((c) => {
                const svc = c.Labels?.['com.docker.compose.service'] ?? '';
                const proj = c.Labels?.['com.docker.compose.project'] ?? '';
                return proj.includes(repoName) || proj.includes(appName) || svc === appName;
              });
              const port = matchedContainer
                ? parseInt(String(matchedContainer.Ports?.[0]?.PublicPort ?? 0), 10) || 8080
                : 8080;
              const lang = (repo as unknown as Record<string, unknown>)['language'] as string || '';
              app = {
                name: appName,
                mode: 'boilerplate' as const,
                appDir: join(projectPath, repoName),
                lang,
                port,
                giteaRepoUrl: repoUrl,
                status: matchedContainer?.State === 'running' ? 'running' : 'stopped',
                createdAt: new Date().toISOString(),
              };
              if (Array.isArray(existing)) { existing.push(app); } else { existing = [app]; }
            } else {
              app.giteaRepoUrl = repoUrl;
            }
            writeFileSync(appsPath, JSON.stringify(existing, null, 2));
            json(res, 200, { ok: true });
          } catch (err) {
            json(res, 500, { error: String(err) });
          }
          return;
        }

        // GET /api/apps/check-port?port=N — Check if a local port is available
        if (parts[1] === 'apps' && parts[2] === 'check-port' && req.method === 'GET') {
          const reqUrl = new URL(req.url ?? '/', 'http://localhost');
          const portStr = reqUrl.searchParams.get('port') ?? '';
          const port = parseInt(portStr, 10);
          if (!port || port < 1 || port > 65535) {
            json(res, 400, { error: 'Invalid port' });
            return;
          }
          const available = await new Promise<boolean>(resolve => {
            const sock = createConnection({ port, host: '127.0.0.1' });
            sock.once('connect', () => { sock.destroy(); resolve(false); });
            sock.once('error', () => resolve(true));
            sock.setTimeout(400, () => { sock.destroy(); resolve(true); });
          });
          json(res, 200, { port, available });
          return;
        }

        // POST /api/deploy/hook — Gitea push webhook for auto-deploy
        if (parts[1] === 'deploy' && parts[2] === 'hook' && req.method === 'POST') {
          try {
            const payload = JSON.parse(body) as {
              repository?: { name?: string };
              ref?: string;
            };
            const appName = payload.repository?.name;
            const branch = (payload.ref ?? '').replace('refs/heads/', '');
            if (appName) {
              const settings = getDeploySettings(appName);
              if (settings.autoDeploy && branch === settings.deployBranch) {
                void deployApp(appName);
              }
            }
          } catch { /* ignore parse errors */ }
          json(res, 200, { status: 'accepted' }); // always 200 to Gitea
          return;
        }

        // ── Domain API (T031-T036) ──────────────────────────────────
        if (parts[1] === 'domain') {
          // GET /api/domain/list — read-only, no auth needed (local admin server)
          if (req.method === 'GET' && parts[2] === 'list') {
            await handleDomainList(res, wizardState);
            return;
          }
          if (req.method === 'GET' && parts[2] === 'apps') {
            handleDomainApps(res, wizardState);
            return;
          }
          if (req.method === 'POST' && parts[2] === 'connect') {
            if (!checkAdminAuth(req, res, wizardState)) return;
            await handleDomainConnect(res, body, wizardState);
            return;
          }
          // Auth-gated mutating operations
          if (!checkAdminAuth(req, res, wizardState)) return;
          if (req.method === 'DELETE' && parts[2] === 'disconnect' && parts[3]) {
            await handleDomainDisconnect(res, parts[3], wizardState);
            return;
          }
          if (req.method === 'GET' && parts[2] === 'status' && parts[3]) {
            await handleDomainStatus(res, parts[3], wizardState);
            return;
          }
        }

        // ── Cloudflare API (006-domain-settings) ───────────────────
        if (parts[1] === 'cloudflare') {
          if (!checkAdminAuth(req, res, wizardState)) return;
          if (req.method === 'GET' && parts[2] === 'zones') {
            await handleCloudflareZones(res, wizardState);
            return;
          }
          if (req.method === 'POST' && parts[2] === 'tunnel') {
            await handleCreateTunnel(res, body, wizardState, projectPath);
            return;
          }
        }

        // ── Settings API (T037-T038) ────────────────────────────────
        if (parts[1] === 'settings') {
          if (!checkAdminAuth(req, res, wizardState)) return;

          if (req.method === 'GET' && parts[2] === 'cloudflare') {
            handleSettingsCloudflareGet(res, wizardState);
            return;
          }
          if (req.method === 'PUT' && parts[2] === 'cloudflare') {
            await handleSettingsCloudflarePut(res, body, wizardState);
            return;
          }
        }

        json(res, 404, { success: false, error: 'Not found' });
      } catch (err) {
        logger.error('admin-server', 'Unhandled error', { error: String(err) });
        json(res, 500, { success: false, error: 'Internal server error' });
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return {
    server,
    start: () =>
      new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
          logger.info('admin-server', `Listening on http://localhost:${port}`, { port });
          resolve(port);
        });
        server.once('error', reject);
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        clearInterval(_rotationTimer);
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// ---------------------------------------------------------------------------
// Admin password middleware (T031)
// ---------------------------------------------------------------------------

function checkAdminAuth(
  req: IncomingMessage,
  res: ServerResponse,
  state: WizardState | null,
): boolean {
  if (!state?.admin?.password) {
    json(res, 401, { error: 'Unauthorized', message: 'Admin password not configured' });
    return false;
  }
  const provided = req.headers['x-admin-password'] as string | undefined;
  if (!provided || provided !== state.admin.password) {
    json(res, 401, { error: 'Unauthorized', message: 'Admin password required for this operation' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Domain API handlers (T032-T036)
// ---------------------------------------------------------------------------

async function handleDomainList(
  res: ServerResponse,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 200, { connections: [], tunnel: null, credentialsConfigured: false });
    return;
  }

  try {
    const mgr = new DomainManager(state.projectName);
    const connections = mgr.list().map((c) => ({
      ...c,
      externalUrl: `https://${c.hostname}`,
    }));

    let tunnel = null;
    const cf = state.domain.cloudflare;
    if (cf.tunnelId && cf.apiToken && cf.accountId) {
      try {
        const { getTunnelHealth } = await import('./cloudflare-client.js');
        const health = await getTunnelHealth(cf.apiToken, cf.accountId, cf.tunnelId);
        tunnel = { ...health, tunnelName: cf.tunnelName, tunnelId: cf.tunnelId };
      } catch { /* leave null */ }
    }

    const credentialsConfigured = !!(cf.apiToken && cf.accountId && cf.zoneId && cf.tunnelId);

    json(res, 200, { connections, tunnel, credentialsConfigured });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

function handleDomainApps(
  res: ServerResponse,
  state: WizardState | null,
): void {
  if (!state) {
    json(res, 200, { apps: [] });
    return;
  }

  try {
    const mgr = new DomainManager(state.projectName);
    const apps = mgr.getConnectableApps();
    json(res, 200, { apps });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleDomainConnect(
  res: ServerResponse,
  body: string,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 500, { success: false, error: 'No project state' });
    return;
  }

  let parsed: { appName?: string; subdomain?: string; domain?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' });
    return;
  }

  const { appName, subdomain, domain } = parsed;
  if (!appName || !subdomain || !domain) {
    json(res, 400, { success: false, error: 'MISSING_FIELDS', message: 'appName, subdomain, and domain are required' });
    return;
  }

  // Validate subdomain format
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    json(res, 400, { success: false, error: 'INVALID_SUBDOMAIN', message: 'Subdomain must be a valid DNS label' });
    return;
  }

  // Phase 1: local conflict check — fast, no API call needed
  const localConflict = (state.domainConnections ?? []).find(
    (c) => c.subdomain === subdomain && c.domain === domain && c.appName !== appName,
  );
  if (localConflict) {
    json(res, 409, {
      success: false,
      error: 'SUBDOMAIN_CONFLICT_LOCAL',
      message: `Subdomain "${subdomain}.${domain}" is already connected to app "${localConflict.appName}"`,
      conflictingApp: localConflict.appName,
    });
    return;
  }

  try {
    const mgr = new DomainManager(state.projectName);
    const result = await mgr.connect(appName, subdomain, domain, {
      onLog: (line) => writeDomainLog(appName, line.replace('[domain-connect] ', '')),
    });

    if (!result.success) {
      // Map CNAME_CONFLICT (from Cloudflare DNS check) to SUBDOMAIN_CONFLICT_EXTERNAL
      if (result.error === 'CNAME_CONFLICT') {
        json(res, 409, {
          success: false,
          error: 'SUBDOMAIN_CONFLICT_EXTERNAL',
          message: `Subdomain "${subdomain}.${domain}" already has a DNS record in Cloudflare (not created by Brewnet)`,
          steps: result.steps,
        });
        return;
      }
      const statusCode = result.error?.startsWith('APP_NOT_RUNNING') ? 503 : 400;
      json(res, statusCode, { success: false, error: result.error, message: result.error, steps: result.steps });
      return;
    }

    // Refresh in-memory wizardState so GET /api/apps sees updated domainConnections immediately
    const freshStateAfterConnect = loadState(state.projectName);
    if (freshStateAfterConnect?.domainConnections) {
      state.domainConnections = freshStateAfterConnect.domainConnections;
    }

    json(res, 200, {
      success: true,
      hostname: result.hostname,
      externalUrl: result.externalUrl,
      steps: result.steps,
    });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleDomainDisconnect(
  res: ServerResponse,
  appName: string,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 500, { success: false, error: 'No project state' });
    return;
  }

  try {
    const mgr = new DomainManager(state.projectName);
    const result = await mgr.disconnect(appName);

    if (!result.success) {
      const statusCode = result.error?.startsWith('NOT_CONNECTED') ? 404 : 500;
      json(res, statusCode, { success: false, error: result.error?.split(':')[0], message: result.error });
      return;
    }

    // Refresh in-memory wizardState so GET /api/apps reflects the removed connection immediately
    const freshStateAfterDisconnect = loadState(state.projectName);
    if (freshStateAfterDisconnect) {
      state.domainConnections = freshStateAfterDisconnect.domainConnections ?? [];
    }

    json(res, 200, {
      success: true,
      appName: result.appName,
      removedHostname: result.removedHostname,
      steps: result.steps,
    });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

async function handleDomainStatus(
  res: ServerResponse,
  appName: string,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 404, { success: false, error: 'No project state' });
    return;
  }

  try {
    const mgr = new DomainManager(state.projectName);
    const statuses = await mgr.status(appName);

    if (statuses.length === 0) {
      json(res, 404, { success: false, error: 'NOT_CONNECTED', message: `No domain connection for app: ${appName}` });
      return;
    }

    json(res, 200, statuses[0]);
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Cloudflare API handlers (006-domain-settings)
// ---------------------------------------------------------------------------

async function handleCloudflareZones(
  res: ServerResponse,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 400, { success: false, error: 'NO_TOKEN', message: 'Cloudflare API token not configured. Complete Step 1 first.' });
    return;
  }

  const apiToken = state.domain.cloudflare.apiToken;
  if (!apiToken) {
    json(res, 400, { success: false, error: 'NO_TOKEN', message: 'Cloudflare API token not configured. Complete Step 1 first.' });
    return;
  }

  try {
    const { getZones } = await import('./cloudflare-client.js');
    const zones = await getZones(apiToken);

    // Extract accountId from the first zone (requires only Zone:Read).
    // This ensures accountId is set before tunnel creation even when
    // Account:Read permission is absent and getAccounts() returns [].
    if (!state.domain.cloudflare.accountId && zones.length > 0) {
      const firstAccountId = zones[0]?.accountId;
      if (firstAccountId) {
        state.domain.cloudflare.accountId = firstAccountId;
        const { saveState: save } = await import('../wizard/state.js');
        save(state);
      }
    }

    if (zones.length === 0) {
      json(res, 200, {
        success: true,
        zones: [],
        warning: 'No domains found. Ensure the token has Zone:Read permission and at least one domain is registered in your Cloudflare account.',
      });
      return;
    }

    json(res, 200, { success: true, zones });
  } catch (_err) {
    json(res, 400, {
      success: false,
      error: 'TOKEN_INVALID',
      message: 'Stored API token is no longer valid. Please re-enter your token.',
    });
  }
}

async function handleCreateTunnel(
  res: ServerResponse,
  body: string,
  state: WizardState | null,
  projectPath: string,
): Promise<void> {
  if (!state) {
    json(res, 400, { success: false, error: 'CREDENTIALS_INCOMPLETE', message: 'API token and zone must be configured before creating a tunnel.' });
    return;
  }

  let parsed: { tunnelName?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' });
    return;
  }

  const { tunnelName } = parsed;
  if (!tunnelName || !tunnelName.trim()) {
    json(res, 400, { success: false, error: 'MISSING_TUNNEL_NAME', message: 'tunnelName is required' });
    return;
  }

  const cf = state.domain.cloudflare;
  if (!cf.apiToken || !cf.accountId || !cf.zoneId) {
    json(res, 400, { success: false, error: 'CREDENTIALS_INCOMPLETE', message: 'API token and zone must be configured before creating a tunnel.' });
    return;
  }

  try {
    const { createTunnel: cfCreateTunnel } = await import('./cloudflare-client.js');
    const result = await cfCreateTunnel(cf.apiToken, cf.accountId, tunnelName.trim());

    const { saveState: save } = await import('../wizard/state.js');
    state.domain.cloudflare.tunnelId = result.tunnelId;
    state.domain.cloudflare.tunnelToken = result.tunnelToken;
    state.domain.cloudflare.tunnelName = tunnelName.trim();
    state.domain.cloudflare.tunnelMode = 'named';
    state.domain.cloudflare.enabled = true;
    save(state);

    // Also update state.domain.name to the zone name so Named Tunnel subdomain
    // URLs (git.<zone>, cloud.<zone>, etc.) are derived from the correct base domain.
    if (cf.zoneName) {
      state.domain.name = cf.zoneName;
      save(state);
    }

    const zoneName = cf.zoneName;

    // Normalize gitea-config.json to local URL — admin server always uses Traefik proxy,
    // not the external Named Tunnel URL which is unavailable until tunnel is fully active.
    try {
      const { saveGiteaConfig } = await import('./app-manager.js');
      const adminUsername = (state.admin as { username?: string } | undefined)?.username ?? 'admin';
      saveGiteaConfig('http://localhost/git', adminUsername);
      logger.info('tunnel', `[${tunnelName}] gitea-config.json normalized → http://localhost/git`);
    } catch (e) {
      logger.warn('tunnel', `[${tunnelName}] gitea-config.json update failed: ${e instanceof Error ? e.message : e}`);
    }

    const steps: Array<{ step: string; success: boolean; detail?: string; services?: string[] }> = [];

    // Auto-patch docker-compose.yml and recreate cloudflared container so the
    // new named tunnel takes effect without manual intervention.
    let composeUpdated = false;
    let containerRestarted = false;

    const composePath = join(projectPath, 'docker-compose.yml');
    const { existsSync: fsExists } = await import('node:fs');
    if (fsExists(composePath)) {
      try {
        const { patchCloudflaredToNamedTunnel } = await import('./compose-generator.js');
        composeUpdated = patchCloudflaredToNamedTunnel(composePath, result.tunnelToken);
        logger.info('tunnel', `[${tunnelName}] compose patch: composeUpdated=${composeUpdated}`);
      } catch (e) {
        logger.warn('tunnel', `[${tunnelName}] compose patch failed: ${e instanceof Error ? e.message : e}`);
      }

      if (composeUpdated) {
        try {
          const { execa: execaTunnel } = await import('execa');
          const up = await execaTunnel(
            'docker',
            ['compose', '-f', composePath, 'up', '-d', '--force-recreate', 'cloudflared'],
            { cwd: projectPath, reject: false },
          );
          containerRestarted = up.exitCode === 0;
          if (!containerRestarted) {
            logger.warn('tunnel', `[${tunnelName}] cloudflared recreate failed (exit ${up.exitCode}): ${up.stderr}`);
          } else {
            logger.info('tunnel', `[${tunnelName}] cloudflared container recreated`);
          }
        } catch (e) {
          logger.warn('tunnel', `[${tunnelName}] cloudflared recreate exception: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Configure Cloudflare ingress rules for all active built-in services
      if (cf.apiToken && cf.accountId && cf.tunnelId && zoneName) {
        try {
          const { configureTunnelIngress, getActiveServiceRoutes } = await import('./cloudflare-client.js');
          const routes = getActiveServiceRoutes(state).map((r) => ({ ...r, domain: zoneName }));
          await configureTunnelIngress(cf.apiToken, cf.accountId, cf.tunnelId, zoneName, routes);
          steps.push({ step: 'ingress_configured', success: true, services: routes.map((r) => r.subdomain) });
          logger.info('tunnel', `[${tunnelName}] ingress configured for: ${routes.map((r) => r.subdomain).join(', ')}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          steps.push({ step: 'ingress_configured', success: false, detail: msg });
          logger.warn('tunnel', `[${tunnelName}] ingress configure failed (non-fatal): ${msg}`);
        }

        // Create DNS CNAME records for each active built-in service (per-service, non-fatal)
        const { createDnsRecord, getActiveServiceRoutes: getRoutes } = await import('./cloudflare-client.js');
        const dnsRoutes = getRoutes(state);
        const dnsResults: string[] = [];
        const dnsFailed: string[] = [];
        for (const route of dnsRoutes) {
          try {
            await createDnsRecord(cf.apiToken, cf.zoneId, cf.tunnelId, route.subdomain, zoneName);
            dnsResults.push(route.subdomain);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn('tunnel', `[${tunnelName}] DNS CNAME for ${route.subdomain} failed (non-fatal): ${msg}`);
            dnsFailed.push(route.subdomain);
          }
        }
        steps.push({ step: 'dns_created', success: dnsFailed.length === 0, services: dnsResults, ...(dnsFailed.length > 0 ? { detail: `skipped: ${dnsFailed.join(', ')}` } : {}) });
      }

      // Patch built-in service env vars for subdomain routing (Gitea, Nextcloud, pgAdmin, FileBrowser)
      if (zoneName) {
        try {
          const { patchBuiltinServicesForNamedTunnel } = await import('./compose-generator.js');
          const patchedServices = patchBuiltinServicesForNamedTunnel(composePath, zoneName);
          steps.push({ step: 'services_env_patched', success: true, services: patchedServices });
          logger.info('tunnel', `[${tunnelName}] env patched for: ${patchedServices.join(', ') || 'none'}`);

          // Restart services whose env vars changed
          if (patchedServices.length > 0) {
            try {
              const { execa: execaSvc } = await import('execa');
              const restart = await execaSvc(
                'docker',
                ['compose', '-f', composePath, 'up', '-d', '--force-recreate', ...patchedServices],
                { cwd: projectPath, reject: false },
              );
              const restarted = restart.exitCode === 0;
              steps.push({ step: 'services_restarted', success: restarted, services: patchedServices });
              if (!restarted) {
                logger.warn('tunnel', `[${tunnelName}] service restart failed (exit ${restart.exitCode}): ${restart.stderr}`);
              } else {
                logger.info('tunnel', `[${tunnelName}] restarted: ${patchedServices.join(', ')}`);
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              steps.push({ step: 'services_restarted', success: false, detail: msg });
              logger.warn('tunnel', `[${tunnelName}] service restart exception: ${msg}`);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          steps.push({ step: 'services_env_patched', success: false, detail: msg });
          logger.warn('tunnel', `[${tunnelName}] env patch failed (non-fatal): ${msg}`);
        }
      }
    } else {
      logger.warn('tunnel', `[${tunnelName}] compose file not found at ${composePath} — cloudflared must be updated manually`);
    }

    json(res, 200, {
      success: true,
      tunnelId: result.tunnelId,
      tunnelName: tunnelName.trim(),
      composeUpdated,
      containerRestarted,
      steps,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('already exists')) {
      json(res, 400, {
        success: false,
        error: 'TUNNEL_NAME_CONFLICT',
        message: `A tunnel named "${tunnelName}" already exists in your Cloudflare account. Choose a different name.`,
      });
    } else {
      json(res, 400, {
        success: false,
        error: 'TUNNEL_CREATE_FAILED',
        message: msg,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Settings API handlers (T037-T038)
// ---------------------------------------------------------------------------

function handleSettingsCloudflareGet(
  res: ServerResponse,
  state: WizardState | null,
): void {
  if (!state) {
    json(res, 200, { configured: false });
    return;
  }

  const cf = state.domain.cloudflare;
  const mask = (s: string | undefined) => !s ? 'not set' : s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : '***set***';

  json(res, 200, {
    configured: !!(cf.apiToken && cf.accountId && cf.zoneId),
    accountId: mask(cf.accountId),
    zoneId: mask(cf.zoneId),
    zoneName: cf.zoneName || '',
    tunnelId: mask(cf.tunnelId),
    tunnelName: cf.tunnelName || '',
    apiTokenSet: !!cf.apiToken,
    apiTokenValid: !!cf.apiToken, // Validated on save, assumed valid if set
    projectName: state.projectName || '',
  });
}

async function handleSettingsCloudflarePut(
  res: ServerResponse,
  body: string,
  state: WizardState | null,
): Promise<void> {
  if (!state) {
    json(res, 500, { success: false, error: 'No project state' });
    return;
  }

  let parsed: { apiToken?: string; accountId?: string; zoneId?: string; tunnelId?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' });
    return;
  }

  const { accountId, zoneId, tunnelId } = parsed;
  // Allow zone/tunnel saves without re-sending the token when it's already stored in memory
  const apiToken = parsed.apiToken || state.domain.cloudflare.apiToken;
  if (!apiToken) {
    json(res, 400, { success: false, error: 'MISSING_TOKEN', message: 'apiToken is required' });
    return;
  }

  // Verify the token
  try {
    const result = await verifyToken(apiToken);
    if (!result.valid) {
      json(res, 400, {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'API token verification failed. Ensure the token has Tunnel:Edit, DNS:Edit, Zone:Read permissions.',
      });
      return;
    }

    // Update state in-place so in-memory wizardState is also updated immediately
    const { saveState: save } = await import('../wizard/state.js');
    state.domain.cloudflare.apiToken = apiToken;

    // Prefer explicit accountId param, then existing stored value, then getAccounts() (requires Account:Read)
    let resolvedAccountId = accountId || state.domain.cloudflare.accountId
      || await (await import('./cloudflare-client.js')).getAccounts(apiToken)
          .then((a) => a[0]?.id ?? '').catch((err: unknown) => {
            console.warn('[admin-server] getAccounts() failed (requires Account:Read permission):', err);
            return '';
          });

    if (zoneId) state.domain.cloudflare.zoneId = zoneId;
    if (tunnelId) state.domain.cloudflare.tunnelId = tunnelId;

    // Get zone name for response and extract accountId from zone when getAccounts() returned nothing
    let zoneName = state.domain.cloudflare.zoneName;
    if (zoneId) {
      try {
        const { getZones } = await import('./cloudflare-client.js');
        const zones = await getZones(apiToken);
        const found = zones.find((z) => z.id === zoneId);
        if (found) {
          zoneName = found.name;
          state.domain.cloudflare.zoneName = zoneName;
          // accountId from zone (requires only Zone:Read — always works)
          if (!resolvedAccountId && found.accountId) {
            resolvedAccountId = found.accountId;
          }
        }
      } catch { /* non-critical */ }
    }

    if (resolvedAccountId) state.domain.cloudflare.accountId = resolvedAccountId;
    save(state);

    json(res, 200, {
      success: true,
      verified: true,
      email: result.email ?? '',
      zoneName,
    });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}
