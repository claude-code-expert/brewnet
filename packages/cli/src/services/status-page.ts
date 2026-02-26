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
}

interface StatusPageData {
  projectName: string;
  generatedAt: string;
  services: StatusService[];
  credentials: {
    username: string;
    passwordHint: string;
  };
  network: {
    provider: 'local' | 'tunnel';
    domain: string;
    tunnelName?: string;
    tunnelId?: string;
    zoneName?: string;
  };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function collectStatusData(state: WizardState): StatusPageData {
  const services: StatusService[] = [];
  const isLocal = state.domain.provider === 'local';
  const domain = isLocal ? state.domain.name : state.domain.cloudflare.zoneName || state.domain.name;

  function makeExternalUrl(subdomain: string): string | undefined {
    if (isLocal) return undefined;
    return `https://${subdomain}.${domain}`;
  }

  // Web server (always present)
  services.push({
    name: state.servers.webServer.service,
    status: 'unknown',
    localUrl: 'http://localhost:80',
    externalUrl: makeExternalUrl('www'),
  });

  // Git server (always present)
  services.push({
    name: 'Gitea',
    status: 'unknown',
    localUrl: `http://localhost:${state.servers.gitServer.port}`,
    externalUrl: makeExternalUrl('git'),
  });

  // Database
  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    services.push({
      name: state.servers.dbServer.primary,
      status: 'unknown',
      localUrl: `localhost:${state.servers.dbServer.primary === 'postgresql' ? 5432 : 3306}`,
    });
    if (state.servers.dbServer.cache) {
      services.push({
        name: state.servers.dbServer.cache,
        status: 'unknown',
        localUrl: 'localhost:6379',
      });
    }
    if (state.servers.dbServer.adminUI && state.servers.dbServer.primary === 'postgresql') {
      services.push({
        name: 'pgAdmin',
        status: 'unknown',
        localUrl: 'http://localhost:5050',
        externalUrl: makeExternalUrl('pgadmin'),
      });
    }
  }

  // File server
  if (state.servers.fileServer.enabled && state.servers.fileServer.service) {
    if (state.servers.fileServer.service === 'nextcloud') {
      services.push({
        name: 'Nextcloud',
        status: 'unknown',
        localUrl: 'http://localhost:8080',
        externalUrl: makeExternalUrl('cloud'),
      });
    } else if (state.servers.fileServer.service === 'minio') {
      services.push({
        name: 'MinIO',
        status: 'unknown',
        localUrl: 'http://localhost:9001',
        externalUrl: makeExternalUrl('minio'),
      });
    }
  }

  // Media
  if (state.servers.media.enabled && state.servers.media.services.includes('jellyfin')) {
    services.push({
      name: 'Jellyfin',
      status: 'unknown',
      localUrl: 'http://localhost:8096',
      externalUrl: makeExternalUrl('media'),
    });
  }

  // SSH
  if (state.servers.sshServer.enabled) {
    services.push({
      name: 'SSH Server',
      status: 'unknown',
      localUrl: `ssh://localhost:${state.servers.sshServer.port}`,
    });
  }

  // Mail
  if (state.servers.mailServer.enabled) {
    services.push({
      name: 'Mail Server',
      status: 'unknown',
      localUrl: 'localhost:25 (SMTP), localhost:993 (IMAP)',
    });
  }

  // FileBrowser
  if (state.servers.fileBrowser.enabled) {
    services.push({
      name: 'FileBrowser',
      status: 'unknown',
      localUrl: 'http://localhost:8088',
      externalUrl: makeExternalUrl('files'),
    });
  }

  // Cloudflared
  if (state.domain.cloudflare.enabled) {
    services.push({
      name: 'Cloudflared',
      status: 'unknown',
      localUrl: 'internal',
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
  const serviceCards = data.services.map((svc) => `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:600;font-size:16px;color:#f1f5f9;">${svc.name}</span>
        ${statusBadge(svc.status)}
      </div>
      <div style="font-size:13px;color:#94a3b8;">
        <div>Local: <a href="${svc.localUrl}" style="color:#38bdf8;">${svc.localUrl}</a></div>
        ${svc.externalUrl ? `<div>External: <a href="${svc.externalUrl}" style="color:#38bdf8;">${svc.externalUrl}</a></div>` : ''}
      </div>
    </div>`).join('');

  const networkSection = data.network.provider === 'local'
    ? `<div style="color:#94a3b8;">
        <div><strong style="color:#f1f5f9;">Provider:</strong> Local (LAN only)</div>
        <div><strong style="color:#f1f5f9;">Host:</strong> ${data.network.domain}</div>
      </div>`
    : `<div style="color:#94a3b8;">
        <div><strong style="color:#f1f5f9;">Provider:</strong> Cloudflare Tunnel</div>
        ${data.network.zoneName ? `<div><strong style="color:#f1f5f9;">Domain:</strong> ${data.network.zoneName}</div>` : ''}
        ${data.network.tunnelName ? `<div><strong style="color:#f1f5f9;">Tunnel:</strong> ${data.network.tunnelName}</div>` : ''}
        ${data.network.tunnelId ? `<div><strong style="color:#f1f5f9;">Tunnel ID:</strong> <code style="font-size:12px;">${data.network.tunnelId}</code></div>` : ''}
        <div><strong style="color:#f1f5f9;">SSL:</strong> Managed by Cloudflare</div>
      </div>`;

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

    <footer>Brewnet &copy; ${new Date().getFullYear()} — BUSL-1.1</footer>
  </div>
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
