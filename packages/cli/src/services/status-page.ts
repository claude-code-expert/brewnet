/**
 * Post-Install Status Page Generator (REQ-1.15, REQ-1.16)
 *
 * Generates a static HTML status page summarizing the installed services,
 * credentials, and network configuration. Opens the page in the default
 * browser after installation completes.
 *
 * @module services/status-page
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusService {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  localUrl: string;
  externalUrl?: string;
  note?: string;
}

export interface ServiceDetailInfo {
  description: string;
  license: string;
  features: string[];
  credentials: {
    method: 'env' | 'wizard' | 'cli' | 'basicauth' | 'none';
    summary: string;
    command?: string;
  };
  tips: string[];
}

export const SERVICE_DETAIL_MAP: Record<string, ServiceDetailInfo> = {
  Traefik: {
    description: 'Go-based open-source reverse proxy and load balancer',
    license: 'MIT',
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
  },
  'Traefik Dashboard': {
    description: 'Built-in Traefik web UI for monitoring routes, services, and middleware',
    license: 'MIT',
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
    features: [
      'File sync, sharing, and collaboration',
      '200+ app extensions: calendar, contacts, notes, office docs',
      'WebDAV protocol support',
      'Desktop and mobile clients available',
    ],
    credentials: {
      method: 'env',
      summary: 'Admin account created via NEXTCLOUD_ADMIN_USER and NEXTCLOUD_ADMIN_PASSWORD environment variables.',
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
    tips: [
      'Internal network only (brewnet-internal) — no host port exposed',
      'Data persisted in named volume — safe across container restarts',
      'Use init SQL scripts in docker-entrypoint-initdb.d/ for multi-DB setup',
    ],
  },
  MySQL: {
    description: 'Popular open-source relational database',
    license: 'GPL-2.0',
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
    tips: [
      'Internal network only (brewnet-internal) — no host port exposed',
      'Root password required at first startup',
      'Init SQL scripts run once from docker-entrypoint-initdb.d/',
    ],
  },
  Redis: {
    description: 'In-memory key-value store for caching and message brokering',
    license: 'BSD-3',
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
    features: [
      'SQL editor with query execution and plan visualization',
      'Table, index, view, and function GUI management',
      'Backup and restore (pg_dump, pg_restore)',
      'Multi-server management via server groups',
    ],
    credentials: {
      method: 'env',
      summary: 'Login with PGADMIN_DEFAULT_EMAIL and PGADMIN_DEFAULT_PASSWORD. Register the DB server after first login.',
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
    features: [
      'Key-based authentication (more secure than passwords)',
      'Built-in SFTP — no separate FTP server needed',
      'Port forwarding and tunneling support',
      'Remote management entry point for Brewnet containers',
    ],
    credentials: {
      method: 'env',
      summary: 'User created via USER_NAME env var. Password auth controlled by PASSWORD_ACCESS flag.',
      command: 'ssh -p 2222 USER@localhost',
    },
    tips: [
      'Switch to key-only auth after initial setup: set PASSWORD_ACCESS=false',
      'Port 2222 avoids conflict with host SSH (port 22)',
      'SFTP runs as SSH subsystem — no separate container needed',
    ],
  },
  'Mail Server': {
    description: 'Full mail stack in a single container (Postfix + Dovecot + Rspamd)',
    license: 'MIT',
    features: [
      'SMTP (Postfix) + IMAP (Dovecot) + spam filter (Rspamd)',
      'DKIM, SPF, DMARC support',
      'Fail2Ban built-in (brute force protection)',
      'Let\'s Encrypt certificate integration',
    ],
    credentials: {
      method: 'cli',
      summary: 'No web UI. Create email accounts via CLI within 120 seconds of first start.',
      command: 'docker exec -it brewnet-docker-mailserver setup email add admin@your.domain',
    },
    tips: [
      'DNS records required: MX, SPF, DKIM, DMARC — without them mail delivery fails',
      'Many ISPs block port 25 — verify before setup',
      'ClamAV uses ~1 GB RAM; disable with ENABLE_CLAMAV=0 if resources are limited',
    ],
  },
  FileBrowser: {
    description: 'Lightweight web-based file manager written in Go',
    license: 'Apache-2.0',
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
    features: [
      'Amazon S3-compatible API',
      'Web console for bucket and object management',
      'Erasure coding and bitrot protection',
      'Multi-user IAM with policies',
    ],
    credentials: {
      method: 'env',
      summary: 'Login with MINIO_ROOT_USER and MINIO_ROOT_PASSWORD (propagated from admin credentials).',
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
};

interface StatusPageData {
  projectName: string;
  generatedAt: string;
  services: StatusService[];
  credentials: {
    username: string;
    passwordHint: string;
  };
  network: {
    provider: 'local' | 'tunnel' | 'quick-tunnel';
    domain: string;
    tunnelName?: string;
    tunnelId?: string;
    zoneName?: string;
    quickTunnelUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function collectStatusData(state: WizardState): StatusPageData {
  const services: StatusService[] = [];
  const portMap = state.portRemapping ?? {};
  const remap = (p: number): number => portMap[p] ?? p;
  const isLocal = state.domain.provider === 'local';
  const domain = isLocal ? state.domain.name : state.domain.cloudflare.zoneName || state.domain.name;
  const isQuickTunnel = state.domain.provider === 'quick-tunnel';
  const quickBase = (state.domain.cloudflare.quickTunnelUrl ?? '').replace(/\/$/, '');

  /**
   * Build external URL for a service.
   * Quick Tunnel: path-based routing (all services supported).
   * Named Tunnel: subdomain-based routing.
   */
  function makeExternalUrl(subdomain: string, quickPath?: string): string | undefined {
    if (isLocal) return undefined;
    if (isQuickTunnel) {
      return (quickBase && quickPath) ? `${quickBase}${quickPath}` : undefined;
    }
    if (domain) return `https://${subdomain}.${domain}`;
    return undefined;
  }

  // Web server (always present) — port 80
  const webService = state.servers.webServer.service;
  services.push({
    name: webService === 'traefik' ? 'Traefik' : webService === 'nginx' ? 'Nginx' : 'Caddy',
    status: 'unknown',
    localUrl: `http://localhost:${remap(80)}`,
    externalUrl: isQuickTunnel
      ? (quickBase || undefined)
      : (!isLocal && domain ? `https://${domain}` : undefined),
    note: 'Welcome page',
  });

  // Traefik Dashboard — port 8080, /dashboard/ (trailing slash required)
  // Ref: https://doc.traefik.io/traefik/getting-started/quick-start
  if (webService === 'traefik') {
    const httpHost = remap(80);
    const httpsHost = remap(443);
    let dashPort = 8080;
    while (dashPort === httpHost || dashPort === httpsHost) { dashPort++; }
    services.push({
      name: 'Traefik Dashboard',
      status: 'unknown',
      localUrl: `http://localhost:${dashPort}/dashboard/`,
      note: 'Routes, services, middleware (no auth)',
    });
  }

  // Gitea — default port 3000
  services.push({
    name: 'Gitea',
    status: 'unknown',
    localUrl: `http://localhost:${remap(state.servers.gitServer.port)}`,
    externalUrl: makeExternalUrl('git', '/git'),
    note: 'First visit: installation wizard',
  });

  // Database (internal only — no web UI)
  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    const dbPort = state.servers.dbServer.primary === 'postgresql' ? 5432 : 3306;
    services.push({
      name: state.servers.dbServer.primary === 'postgresql' ? 'PostgreSQL' : 'MySQL',
      status: 'unknown',
      localUrl: `localhost:${dbPort} (internal)`,
      note: 'No web UI — use psql / mysql client',
    });
    if (state.servers.dbServer.cache) {
      services.push({
        name: state.servers.dbServer.cache === 'redis' ? 'Redis' : state.servers.dbServer.cache,
        status: 'unknown',
        localUrl: 'localhost:6379 (internal)',
        note: 'No web UI — use redis-cli',
      });
    }
    // pgAdmin — container port 80 → host 5050
    // Ref: https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment
    if (state.servers.dbServer.adminUI && state.servers.dbServer.primary === 'postgresql') {
      services.push({
        name: 'pgAdmin',
        status: 'unknown',
        localUrl: `http://localhost:${remap(5050)}`,
        externalUrl: makeExternalUrl('db', '/pgadmin'),
        note: 'Login: email + password',
      });
    }
  }

  // Nextcloud — container port 80 → host 8443
  // Quick Tunnel: path /cloud with OVERWRITEWEBROOT env
  if (state.servers.fileServer.enabled && state.servers.fileServer.service) {
    if (state.servers.fileServer.service === 'nextcloud') {
      services.push({
        name: 'Nextcloud',
        status: 'unknown',
        localUrl: `http://localhost:${remap(8443)}`,
        externalUrl: makeExternalUrl('cloud', '/cloud'),
        note: 'Login: admin credentials',
      });
    } else if (state.servers.fileServer.service === 'minio') {
      // MinIO Console: port 9001, API: port 9000
      // Ref: https://github.com/minio/docs
      services.push({
        name: 'MinIO Console',
        status: 'unknown',
        localUrl: `http://localhost:${remap(9001)}`,
        externalUrl: makeExternalUrl('minio', '/minio'),
        note: `Login page (API: localhost:${remap(9000)})`,
      });
    }
  }

  // Jellyfin — port 8096
  // Quick Tunnel: path /jellyfin with Base URL config
  // Ref: https://jellyfin.org/docs/general/post-install/networking
  if (state.servers.media.enabled && state.servers.media.services.includes('jellyfin')) {
    services.push({
      name: 'Jellyfin',
      status: 'unknown',
      localUrl: `http://localhost:${remap(8096)}`,
      externalUrl: makeExternalUrl('media', '/jellyfin'),
      note: 'First visit: setup wizard',
    });
  }

  // SSH (no web UI)
  if (state.servers.sshServer.enabled) {
    services.push({
      name: 'SSH Server',
      status: 'unknown',
      localUrl: `ssh://localhost:${remap(state.servers.sshServer.port)}`,
      note: 'ssh -p PORT user@localhost',
    });
  }

  // Mail (no web UI)
  if (state.servers.mailServer.enabled) {
    services.push({
      name: 'Mail Server',
      status: 'unknown',
      localUrl: `localhost:${remap(25)} (SMTP), localhost:${remap(993)} (IMAP)`,
      note: 'Use mail client (Thunderbird, etc.)',
    });
  }

  // FileBrowser — container port 80 → host 8085
  // Ref: https://github.com/gtsteffaniak/filebrowser
  if (state.servers.fileBrowser.enabled) {
    services.push({
      name: 'FileBrowser',
      status: 'unknown',
      localUrl: `http://localhost:${remap(8085)}`,
      externalUrl: makeExternalUrl('fb', '/files'),
      note: 'Login page',
    });
  }

  // Cloudflared (internal daemon)
  if (state.domain.cloudflare.enabled || state.domain.provider === 'quick-tunnel') {
    services.push({
      name: 'Cloudflared',
      status: 'unknown',
      localUrl: 'internal',
      note: isQuickTunnel ? 'Quick Tunnel (*.trycloudflare.com)' : 'Named Tunnel',
    });
  }

  const password = state.admin.password;
  const passwordHint = password.length > 4
    ? '••••••' + password.slice(-4)
    : '••••••••';

  return {
    projectName: state.projectName,
    generatedAt: new Date().toISOString(),
    services,
    credentials: {
      username: state.admin.username,
      passwordHint,
    },
    network: {
      provider: state.domain.provider,
      domain,
      tunnelName: state.domain.cloudflare.tunnelName || undefined,
      tunnelId: state.domain.cloudflare.tunnelId || undefined,
      zoneName: state.domain.cloudflare.zoneName || undefined,
      quickTunnelUrl: quickBase || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function statusBadge(status: StatusService['status']): string {
  const color = status === 'running' ? '#22c55e' : status === 'stopped' ? '#ef4444' : '#f59e0b';
  const label = status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Unknown';
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;">${label}</span>`;
}

function generateStatusHtml(data: StatusPageData): string {
  const serviceCards = data.services.map((svc) => {
    const isLink = svc.localUrl.startsWith('http');
    const localDisplay = isLink
      ? `<a href="${svc.localUrl}" style="color:#38bdf8;">${svc.localUrl}</a>`
      : `<span style="color:#cbd5e1;">${svc.localUrl}</span>`;
    const escapedName = svc.name.replace(/'/g, "\\'");
    const hasDetail = svc.name in SERVICE_DETAIL_MAP;
    const nameSpan = hasDetail
      ? `<span class="svc-name-link" onclick="showServiceModal('${escapedName}')">${svc.name}</span>`
      : `<span style="font-weight:600;font-size:16px;color:#f1f5f9;">${svc.name}</span>`;
    return `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        ${nameSpan}
        ${statusBadge(svc.status)}
      </div>
      <div style="font-size:13px;color:#94a3b8;">
        <div>Local: ${localDisplay}</div>
        ${svc.externalUrl ? `<div>External: <a href="${svc.externalUrl}" style="color:#38bdf8;">${svc.externalUrl}</a></div>` : ''}
        ${svc.note ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${svc.note}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  let networkSection: string;
  if (data.network.provider === 'local') {
    networkSection = `<div style="color:#94a3b8;">
        <div><strong style="color:#f1f5f9;">Provider:</strong> Local (LAN only)</div>
        <div><strong style="color:#f1f5f9;">Host:</strong> ${data.network.domain}</div>
      </div>`;
  } else if (data.network.provider === 'quick-tunnel') {
    networkSection = `<div style="color:#94a3b8;">
        <div><strong style="color:#f1f5f9;">Provider:</strong> Cloudflare Quick Tunnel</div>
        ${data.network.quickTunnelUrl ? `<div><strong style="color:#f1f5f9;">URL:</strong> <a href="${data.network.quickTunnelUrl}" style="color:#38bdf8;">${data.network.quickTunnelUrl}</a></div>` : ''}
        <div><strong style="color:#f1f5f9;">SSL:</strong> Managed by Cloudflare</div>
      </div>`;
  } else {
    networkSection = `<div style="color:#94a3b8;">
        <div><strong style="color:#f1f5f9;">Provider:</strong> Cloudflare Named Tunnel</div>
        ${data.network.zoneName ? `<div><strong style="color:#f1f5f9;">Domain:</strong> ${data.network.zoneName}</div>` : ''}
        ${data.network.tunnelName ? `<div><strong style="color:#f1f5f9;">Tunnel:</strong> ${data.network.tunnelName}</div>` : ''}
        ${data.network.tunnelId ? `<div><strong style="color:#f1f5f9;">Tunnel ID:</strong> <code style="font-size:12px;">${data.network.tunnelId}</code></div>` : ''}
        <div><strong style="color:#f1f5f9;">SSL:</strong> Managed by Cloudflare</div>
      </div>`;
  }

  const generatedDate = new Date(data.generatedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Brewnet — ${data.projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px 16px; }
    h1 { font-size: 28px; font-weight: 700; color: #38bdf8; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 600; color: #f1f5f9; margin-bottom: 16px; margin-top: 32px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
    .badge { display: inline-block; background: #1e3a5f; color: #38bdf8; padding: 2px 10px; border-radius: 9999px; font-size: 13px; margin-left: 8px; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .cred-box { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
    .cred-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .cred-label { color: #94a3b8; width: 80px; flex-shrink: 0; }
    .cred-value { font-family: monospace; font-size: 15px; color: #f1f5f9; }
    .cmd-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; font-family: monospace; color: #a5f3fc; }
    footer { margin-top: 48px; text-align: center; color: #475569; font-size: 13px; }
    .svc-name-link { font-weight: 600; font-size: 16px; color: #f1f5f9; text-decoration: underline; text-decoration-color: #475569; cursor: pointer; transition: color 0.15s; }
    .svc-name-link:hover { color: #38bdf8; text-decoration-color: #38bdf8; }
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-terminal { background: #1e293b; border: 1px solid #334155; border-radius: 10px; max-width: 640px; width: 90%; max-height: 80vh; overflow-y: auto; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 14px; color: #e2e8f0; }
    .modal-titlebar { background: #0f172a; padding: 10px 16px; display: flex; align-items: center; gap: 8px; border-radius: 10px 10px 0 0; position: sticky; top: 0; z-index: 1; }
    .modal-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .modal-dot.red { background: #ef4444; }
    .modal-dot.yellow { background: #f59e0b; }
    .modal-dot.green { background: #22c55e; }
    .modal-title { flex: 1; color: #94a3b8; font-size: 13px; margin-left: 4px; }
    .modal-close { background: none; border: none; color: #64748b; font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1; }
    .modal-close:hover { color: #f1f5f9; }
    .modal-body { padding: 16px; }
    .modal-desc { color: #cbd5e1; margin-bottom: 4px; }
    .modal-license { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    .modal-section-header { color: #38bdf8; font-weight: 600; margin-bottom: 8px; margin-top: 16px; }
    .modal-section-header:first-child { margin-top: 0; }
    .modal-bullet { color: #cbd5e1; padding-left: 16px; margin-bottom: 4px; position: relative; }
    .modal-bullet::before { content: '> '; color: #22c55e; position: absolute; left: 0; }
    .modal-cmd { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; color: #38bdf8; font-family: monospace; font-size: 13px; margin-top: 8px; word-break: break-all; }
    .modal-url { margin-bottom: 6px; }
    .modal-url-label { color: #94a3b8; font-size: 13px; }
    .modal-url-link { color: #38bdf8; text-decoration: underline; text-decoration-color: #475569; transition: text-decoration-color 0.15s; }
    .modal-url-link:hover { text-decoration-color: #38bdf8; }
    .modal-cred-box { margin-top: 6px; }
    .modal-cred-label { color: #94a3b8; font-size: 13px; }
    .modal-cred-value { color: #f1f5f9; font-family: monospace; }
    .modal-tip { color: #cbd5e1; padding-left: 16px; margin-bottom: 4px; position: relative; }
    .modal-tip::before { content: '! '; color: #f59e0b; font-weight: 700; position: absolute; left: 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍺 Brewnet</h1>
    <div style="color:#94a3b8;margin-bottom:8px;">Your Home Server, Brewed Fresh</div>
    <div style="color:#64748b;font-size:13px;">Project: <strong style="color:#cbd5e1;">${data.projectName}</strong> &nbsp;•&nbsp; Generated: ${generatedDate}</div>

    <h2>Services</h2>
    ${serviceCards}

    <h2>Credentials</h2>
    <div class="cred-box">
      <div class="cred-row">
        <span class="cred-label">Username</span>
        <span class="cred-value" id="uname">${data.credentials.username}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Password</span>
        <span class="cred-value" id="pwd-masked">${data.credentials.passwordHint}</span>
        <button onclick="document.getElementById('pwd-note').style.display='inline'" style="background:#334155;color:#94a3b8;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;">Show hint</button>
      </div>
      <div id="pwd-note" style="display:none;color:#fbbf24;font-size:13px;margin-top:8px;">
        Full password is in <code>${data.network.domain.replace(/^[^/]+$/, '')}/.env</code>. Run: <code>grep ADMIN_PASSWORD .env</code>
      </div>
    </div>

    <h2>Network</h2>
    <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;">
      ${networkSection}
    </div>

    <h2>Next Steps</h2>
    <div class="cmd-card">brewnet status</div>
    <div class="cmd-card">brewnet logs [service]</div>
    <div class="cmd-card">brewnet backup</div>
    <div class="cmd-card">docker compose logs -f</div>

    <footer>Brewnet &copy; ${new Date().getFullYear()} — MIT License</footer>
  </div>
  <script>
    var SERVICE_DETAILS = ${JSON.stringify(SERVICE_DETAIL_MAP)};
    var SERVICE_URLS = ${JSON.stringify(
      Object.fromEntries(
        data.services.map((svc) => [
          svc.name,
          { localUrl: svc.localUrl, externalUrl: svc.externalUrl ?? null },
        ]),
      ),
    )};
    var ADMIN_CREDS = ${JSON.stringify({ username: data.credentials.username, passwordHint: data.credentials.passwordHint })};
    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function showServiceModal(name) {
      var info = SERVICE_DETAILS[name];
      if (!info) return;
      var urls = SERVICE_URLS[name] || {};
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.onclick = function(e) { if (e.target === overlay) closeServiceModal(); };
      var accessHtml = '';
      if (urls.localUrl) {
        var isHttpLink = urls.localUrl.indexOf('http') === 0;
        if (isHttpLink) {
          accessHtml += '<div class="modal-url"><span class="modal-url-label">Local:</span> <a href="' + escapeHtml(urls.localUrl) + '" target="_blank" class="modal-url-link">' + escapeHtml(urls.localUrl) + '</a></div>';
        } else {
          accessHtml += '<div class="modal-url"><span class="modal-url-label">Local:</span> <span style="color:#cbd5e1;">' + escapeHtml(urls.localUrl) + '</span></div>';
        }
      }
      if (urls.externalUrl) {
        accessHtml += '<div class="modal-url"><span class="modal-url-label">External:</span> <a href="' + escapeHtml(urls.externalUrl) + '" target="_blank" class="modal-url-link">' + escapeHtml(urls.externalUrl) + '</a></div>';
      }
      var featuresHtml = info.features.map(function(f) {
        return '<div class="modal-bullet">' + escapeHtml(f) + '</div>';
      }).join('');
      var credHtml = '<div style="color:#cbd5e1;">' + escapeHtml(info.credentials.summary) + '</div>';
      if (info.credentials.method === 'env' || info.credentials.method === 'basicauth') {
        credHtml += '<div class="modal-cred-box"><span class="modal-cred-label">Username:</span> <span class="modal-cred-value">' + escapeHtml(ADMIN_CREDS.username) + '</span></div>';
        credHtml += '<div class="modal-cred-box"><span class="modal-cred-label">Password:</span> <span class="modal-cred-value">' + escapeHtml(ADMIN_CREDS.passwordHint) + '</span></div>';
      }
      if (info.credentials.command) {
        credHtml += '<div class="modal-cmd">' + escapeHtml(info.credentials.command) + '</div>';
      }
      var tipsHtml = info.tips.map(function(t) {
        return '<div class="modal-tip">' + escapeHtml(t) + '</div>';
      }).join('');
      overlay.innerHTML =
        '<div class="modal-terminal">' +
          '<div class="modal-titlebar">' +
            '<span class="modal-dot red"></span>' +
            '<span class="modal-dot yellow"></span>' +
            '<span class="modal-dot green"></span>' +
            '<span class="modal-title">' + escapeHtml(name) + ' — service info</span>' +
            '<button class="modal-close" onclick="closeServiceModal()">&times;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="modal-desc">' + escapeHtml(info.description) + '</div>' +
            '<div class="modal-license">License: ' + escapeHtml(info.license) + '</div>' +
            (accessHtml ? '<div class="modal-section-header">$ access</div>' + accessHtml : '') +
            '<div class="modal-section-header">$ features</div>' + featuresHtml +
            '<div class="modal-section-header">$ credentials</div>' + credHtml +
            '<div class="modal-section-header">$ tips</div>' + tipsHtml +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      document.addEventListener('keydown', handleModalEsc);
    }
    function closeServiceModal() {
      var overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      document.removeEventListener('keydown', handleModalEsc);
    }
    function handleModalEsc(e) {
      if (e.key === 'Escape') closeServiceModal();
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the post-install status page and optionally open it in the browser.
 *
 * Writes to ~/.brewnet/status/index.html.
 *
 * @param state   - Completed wizard state
 * @param options - { noOpen: true } to suppress browser auto-open
 * @returns Absolute path to the generated HTML file
 */
export async function generateAndOpenStatusPage(
  state: WizardState,
  options?: { noOpen?: boolean },
): Promise<string> {
  const data = collectStatusData(state);
  const html = generateStatusHtml(data);

  const statusDir = join(homedir(), '.brewnet', 'status');
  mkdirSync(statusDir, { recursive: true });

  const filePath = join(statusDir, 'index.html');
  writeFileSync(filePath, html, 'utf-8');

  if (!options?.noOpen) {
    try {
      if (process.platform === 'darwin') {
        await execa('open', [`file://${filePath}`]);
      } else {
        await execa('xdg-open', [`file://${filePath}`]);
      }
    } catch {
      // Non-fatal — path is printed to console by caller
    }
  }

  return filePath;
}
