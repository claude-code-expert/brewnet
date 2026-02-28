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
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import Dockerode from 'dockerode';
import { addService, removeService } from './service-manager.js';
import { createBackup, listBackups } from './backup-manager.js';
import { getServiceDefinition, SERVICE_REGISTRY } from '../config/services.js';
import { SERVICE_DETAIL_MAP } from './status-page.js';
import { getLastProject, loadState } from '../wizard/state.js';
import { logger } from '../utils/logger.js';
import type { WizardState } from '@brewnet/shared';

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
  removable: boolean;
}

export interface AdminServerOptions {
  port?: number;
  projectPath?: string;
}

// ---------------------------------------------------------------------------
// HTML Dashboard (inline, dynamically generated with embedded config)
// ---------------------------------------------------------------------------

interface DashboardConfig {
  adminUsername: string;
  passwordHint: string;
  domainProvider: string;
  quickTunnelUrl: string;
  zoneName: string;
}

/**
 * Name alias map: SERVICE_REGISTRY display names → SERVICE_DETAIL_MAP keys.
 * Only entries that differ need to be listed here.
 */
const NAME_ALIASES: Record<string, string> = {
  'OpenSSH Server': 'SSH Server',
  'Docker Mailserver': 'Mail Server',
  'Cloudflare Tunnel': 'Cloudflared',
  'MinIO': 'MinIO Console',
};

function generateDashboardHtml(config: DashboardConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#58a6ff;margin-bottom:4px;font-size:20px;display:flex;align-items:center;gap:8px}
.sub{color:#8b949e;margin-bottom:24px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;padding:8px 12px;background:#161b22;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d}
td{padding:8px 12px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:hover td{background:#161b22}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}
.stopped{background:#3d1f1f;color:#f85149}
.error{background:#3d2b1f;color:#e3b341}
.btn{padding:4px 10px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent}
.btn-start{border-color:#3fb950;color:#3fb950}
.btn-start:hover{background:#1a4731}
.btn-stop{border-color:#f85149;color:#f85149}
.btn-stop:hover{background:#3d1f1f}
.btn-remove{border-color:#8b949e;color:#8b949e;margin-left:4px}
.btn-remove:hover{background:#21262d}
.actions{display:flex;gap:4px;align-items:center}
#log{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:12px;height:120px;overflow-y:auto;font-size:12px;color:#8b949e;margin-bottom:16px}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.header{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
.refresh{color:#58a6ff;cursor:pointer;font-size:12px;text-decoration:underline}
.svc-link{color:#c9d1d9;text-decoration:underline;text-decoration-color:#30363d;cursor:pointer;transition:color .15s}
.svc-link:hover{color:#58a6ff;text-decoration-color:#58a6ff}
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:100}
.modal-box{background:#161b22;border:1px solid #30363d;border-radius:10px;max-width:640px;width:90%;max-height:80vh;overflow-y:auto;font-family:'Courier New',monospace;font-size:14px;color:#c9d1d9}
.modal-titlebar{background:#0d1117;padding:10px 16px;display:flex;align-items:center;gap:8px;border-radius:10px 10px 0 0;position:sticky;top:0;z-index:1}
.modal-dot{width:12px;height:12px;border-radius:50%;display:inline-block}
.modal-dot.r{background:#f85149}.modal-dot.y{background:#e3b341}.modal-dot.g{background:#3fb950}
.modal-title{flex:1;color:#8b949e;font-size:13px;margin-left:4px}
.modal-close{background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;padding:0 4px;line-height:1}
.modal-close:hover{color:#c9d1d9}
.modal-body{padding:16px}
.modal-desc{color:#8b949e;margin-bottom:4px}
.modal-license{color:#484f58;font-size:12px;margin-bottom:16px}
.modal-sh{color:#58a6ff;font-weight:600;margin-bottom:8px;margin-top:16px}
.modal-sh:first-child{margin-top:0}
.modal-url{margin-bottom:6px}
.modal-url-label{color:#8b949e;font-size:13px}
.modal-url-a{color:#58a6ff;text-decoration:underline;text-decoration-color:#30363d}
.modal-url-a:hover{text-decoration-color:#58a6ff}
.modal-bullet{color:#8b949e;padding-left:16px;margin-bottom:4px;position:relative}
.modal-bullet::before{content:'> ';color:#3fb950;position:absolute;left:0}
.modal-cmd{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px 12px;color:#58a6ff;font-family:monospace;font-size:13px;margin-top:8px;word-break:break-all}
.modal-cred{margin-top:6px}
.modal-cred-l{color:#8b949e;font-size:13px}
.modal-cred-v{color:#c9d1d9;font-family:monospace}
.modal-tip{color:#8b949e;padding-left:16px;margin-bottom:4px;position:relative}
.modal-tip::before{content:'! ';color:#e3b341;font-weight:700;position:absolute;left:0}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1><svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="#58a6ff" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/><path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/><circle cx="20" cy="30" r="1.8" fill="#58a6ff" stroke="none"/><path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/><path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/><path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/></svg> Brewnet Admin</h1>
    <div class="sub" id="subtitle">Loading...</div>
  </div>
  <span class="refresh" onclick="loadServices()">&#8635; Refresh</span>
</div>
<div class="section-title">Services</div>
<table id="svc-table">
  <thead><tr><th>Service</th><th>Status</th><th>Port</th><th>Local</th><th>External</th><th>Actions</th></tr></thead>
  <tbody id="svc-body"><tr><td colspan="6" style="color:#8b949e">Loading...</td></tr></tbody>
</table>
<div class="section-title">Log</div>
<div id="log"></div>
<script>
var SERVICE_DETAILS = ${JSON.stringify(SERVICE_DETAIL_MAP)};
var ADMIN_CREDS = ${JSON.stringify({ username: config.adminUsername, passwordHint: config.passwordHint })};
var DOMAIN_CONFIG = ${JSON.stringify({ provider: config.domainProvider, quickTunnelUrl: config.quickTunnelUrl, zoneName: config.zoneName })};
var NAME_ALIASES = ${JSON.stringify(NAME_ALIASES)};
var EXT_PATHS = {traefik:{sub:'',path:''},nginx:{sub:'',path:''},caddy:{sub:'',path:''},gitea:{sub:'git',path:'/git'},nextcloud:{sub:'cloud',path:'/cloud'},pgadmin:{sub:'db',path:'/pgadmin'},jellyfin:{sub:'media',path:'/jellyfin'},filebrowser:{sub:'fb',path:'/files'},minio:{sub:'minio',path:'/minio'}};
function getExternalUrl(id){
  var c=DOMAIN_CONFIG;if(c.provider==='local')return null;
  var e=EXT_PATHS[id];if(!e)return null;
  if(c.quickTunnelUrl){var base=c.quickTunnelUrl.replace(/\\/$/,'');return base+e.path;}
  if(c.zoneName){return e.sub?'https://'+e.sub+'.'+c.zoneName:'https://'+c.zoneName;}
  return null;
}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function resolveDetailName(n){return NAME_ALIASES[n]||n;}
function showServiceModal(name,localUrl,externalUrl){
  var detailName=resolveDetailName(name);
  var info=SERVICE_DETAILS[detailName];
  if(!info)return;
  var ov=document.createElement('div');ov.className='modal-overlay';
  ov.onclick=function(e){if(e.target===ov)closeServiceModal();};
  var accessHtml='';
  if(localUrl&&localUrl.indexOf('http')===0){
    accessHtml+='<div class="modal-url"><span class="modal-url-label">Local:</span> <a href="'+escapeHtml(localUrl)+'" target="_blank" class="modal-url-a">'+escapeHtml(localUrl)+'</a></div>';
  }else if(localUrl){
    accessHtml+='<div class="modal-url"><span class="modal-url-label">Local:</span> <span style="color:#8b949e">'+escapeHtml(localUrl)+'</span></div>';
  }
  if(externalUrl){
    accessHtml+='<div class="modal-url"><span class="modal-url-label">External:</span> <a href="'+escapeHtml(externalUrl)+'" target="_blank" class="modal-url-a">'+escapeHtml(externalUrl)+'</a></div>';
  }
  var featHtml=info.features.map(function(f){return '<div class="modal-bullet">'+escapeHtml(f)+'</div>';}).join('');
  var credHtml='<div style="color:#8b949e">'+escapeHtml(info.credentials.summary)+'</div>';
  if(info.credentials.method==='env'||info.credentials.method==='basicauth'){
    credHtml+='<div class="modal-cred"><span class="modal-cred-l">Username:</span> <span class="modal-cred-v">'+escapeHtml(ADMIN_CREDS.username)+'</span></div>';
    credHtml+='<div class="modal-cred"><span class="modal-cred-l">Password:</span> <span class="modal-cred-v">'+escapeHtml(ADMIN_CREDS.passwordHint)+'</span></div>';
  }
  if(info.credentials.command){credHtml+='<div class="modal-cmd">'+escapeHtml(info.credentials.command)+'</div>';}
  var tipsHtml=info.tips.map(function(t){return '<div class="modal-tip">'+escapeHtml(t)+'</div>';}).join('');
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">'+escapeHtml(name)+' \\u2014 service info</span>'+
      '<button class="modal-close" onclick="closeServiceModal()">\\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div class="modal-desc">'+escapeHtml(info.description)+'</div>'+
      '<div class="modal-license">License: '+escapeHtml(info.license)+'</div>'+
      (accessHtml?'<div class="modal-sh">$ access</div>'+accessHtml:'')+
      '<div class="modal-sh">$ features</div>'+featHtml+
      '<div class="modal-sh">$ credentials</div>'+credHtml+
      '<div class="modal-sh">$ tips</div>'+tipsHtml+
    '</div></div>';
  document.body.appendChild(ov);
  document.addEventListener('keydown',handleModalEsc);
}
function closeServiceModal(){var o=document.querySelector('.modal-overlay');if(o)o.remove();document.removeEventListener('keydown',handleModalEsc);}
function handleModalEsc(e){if(e.key==='Escape')closeServiceModal();}
const log=(msg)=>{const d=document.getElementById('log');d.textContent=new Date().toLocaleTimeString()+' '+msg+'\\n'+d.textContent.slice(0,2000);}
const badge=(s)=>{const c=s==='running'?'running':s==='stopped'?'stopped':'error';return \`<span class="badge \${c}">\${s}</span>\`;}
const fmt=(s,r)=>\`<button class="btn btn-\${s==='running'?'stop':'start'}" onclick="toggle('\${r.id}','\${s}')">\${s==='running'?'Stop':'Start'}</button><button class="btn btn-remove" onclick="removeSvc('\${r.id}')">Remove</button>\`
async function loadServices(){
  const r=await fetch('/api/services').then(r=>r.json()).catch(()=>({services:[]}));
  const tbody=document.getElementById('svc-body');
  if(!r.services||r.services.length===0){tbody.innerHTML='<tr><td colspan="6" style="color:#8b949e">No services installed.</td></tr>';return;}
  tbody.innerHTML=r.services.map(s=>{
    var ext=getExternalUrl(s.id);
    var detailName=resolveDetailName(s.name);
    var hasDetail=!!SERVICE_DETAILS[detailName];
    var localUrl=s.url||null;
    var nameHtml=hasDetail
      ?\`<b class="svc-link" onclick="showServiceModal('\${s.name.replace(/'/g,"\\\\'")}','\${(localUrl||'').replace(/'/g,"\\\\'")}','\${(ext||'').replace(/'/g,"\\\\'")}')">\${s.name}</b>\`
      :\`<b>\${s.name}</b>\`;
    return \`<tr>
    <td>\${nameHtml}<br><span style="color:#8b949e;font-size:11px">\${s.id}</span></td>
    <td>\${badge(s.status)}</td>
    <td>\${s.port??'—'}</td>
    <td>\${localUrl?\`<a href="\${localUrl}" target="_blank" style="color:#58a6ff">\${localUrl}</a>\`:'<span style="color:#8b949e">—</span>'}</td>
    <td>\${ext?\`<a href="\${ext}" target="_blank" style="color:#58a6ff">\${ext}</a>\`:'<span style="color:#8b949e">—</span>'}</td>
    <td class="actions">\${s.removable?fmt(s.status,s):''}</td>
  </tr>\`;}).join('');
  const sum=r.summary;
  document.getElementById('subtitle').textContent=sum?\`\${sum.running}/\${sum.total} running\`:'';
}
async function toggle(id,cur){
  const action=cur==='running'?'stop':'start';
  log(\`\${action} \${id}...\`);
  const r=await fetch(\`/api/services/containers/\${id}/\${action}\`,{method:'POST'}).then(r=>r.json()).catch(e=>({success:false,error:e.message}));
  log(r.success?\`\${id} \${r.status||action+'ed'}\`:\`Error: \${r.error}\`);
  setTimeout(loadServices,800);
}
async function removeSvc(id){
  if(!confirm(\`Remove \${id}? Data will be preserved (use ?purge=true to delete).\`))return;
  log(\`Removing \${id}...\`);
  const r=await fetch(\`/api/services/containers/\${id}\`,{method:'DELETE'}).then(r=>r.json()).catch(e=>({success:false,error:e.message}));
  log(r.success?\`\${id} removed\`:\`Error: \${r.error}\`);
  setTimeout(loadServices,800);
}
loadServices();
setInterval(loadServices,15000);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

const docker = new Dockerode();

const REQUIRED_SERVICES = new Set(['traefik', 'nginx', 'caddy', 'gitea']);

const INTERNAL_SERVICES = new Set(['brewnet-welcome', 'cloudflared']);

const WEB_UI_SERVICES = new Set([
  'traefik', 'nginx', 'caddy', 'gitea', 'nextcloud', 'minio',
  'jellyfin', 'pgadmin', 'filebrowser',
]);

function getPrimaryPort(container: Dockerode.ContainerInfo): number | null {
  const tcp = (container.Ports ?? [])
    .filter((p) => p.Type === 'tcp' && p.PublicPort)
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
): Promise<void> {
  try {
    const allContainers = await docker.listContainers({ all: true });
    const services: ServiceStatus[] = [];

    for (const c of allContainers) {
      const composeService = c.Labels?.['com.docker.compose.service'];
      if (!composeService) continue;
      if (INTERNAL_SERVICES.has(composeService)) continue;

      const def = getServiceDefinition(composeService);
      const s = c.State as string;
      const status = s === 'running' ? 'running' : s === 'exited' ? 'stopped' : ('error' as const);
      const port = getPrimaryPort(c) ?? def?.ports?.[0] ?? null;

      services.push({
        id: composeService,
        name: def?.name ?? composeService,
        type: def ? inferType(composeService) : 'unknown',
        status,
        cpu: '—',
        memory: '—',
        uptime: c.Status?.startsWith('Up') ? c.Status.replace(/^Up /, '') : '—',
        port: port ?? null,
        url: WEB_UI_SERVICES.has(composeService) && port
          ? `http://localhost:${port}`
          : null,
        removable: !REQUIRED_SERVICES.has(composeService),
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
  if (['postgresql', 'mysql', 'redis', 'valkey', 'keydb'].includes(id)) return 'db';
  if (['nextcloud', 'minio', 'filebrowser'].includes(id)) return 'file';
  if (['jellyfin'].includes(id)) return 'media';
  if (['gitea'].includes(id)) return 'git';
  if (['openssh-server'].includes(id)) return 'ssh';
  if (['docker-mailserver'].includes(id)) return 'mail';
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
      .filter((def) => !REQUIRED_SERVICES.has(def.id))
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
// Server factory
// ---------------------------------------------------------------------------

export function createAdminServer(options: AdminServerOptions = {}): {
  server: Server;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  const port = options.port ?? 8088;

  // Resolve project path and wizard state
  let projectPath = options.projectPath ?? process.cwd();
  let wizardState: WizardState | null = null;
  if (!options.projectPath) {
    const last = getLastProject();
    if (last) {
      const state = loadState(last);
      if (state) {
        wizardState = state;
        if (state.projectPath) projectPath = state.projectPath;
      }
    }
  }

  // Build dashboard config from wizard state
  const password = wizardState?.admin?.password ?? '';
  const dashConfig: DashboardConfig = {
    adminUsername: wizardState?.admin?.username ?? 'admin',
    passwordHint: password.length > 4 ? '••••••' + password.slice(-4) : '••••••••',
    domainProvider: wizardState?.domain?.provider ?? 'local',
    quickTunnelUrl: wizardState?.domain?.cloudflare?.quickTunnelUrl ?? '',
    zoneName: wizardState?.domain?.cloudflare?.zoneName ?? '',
  };

  // Cache for dashboard HTML (regenerated when Quick Tunnel URL is detected)
  let dashboardHtml = generateDashboardHtml(dashConfig);
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
      const match = logStr.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        dashConfig.quickTunnelUrl = match[0];
        dashConfig.domainProvider = 'quick-tunnel';
        dashboardHtml = generateDashboardHtml(dashConfig);
      }
    } catch {
      // Non-critical — just serve without external URLs
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const body = await readBody(req);

    // CORS for dev convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve dashboard HTML (with lazy Quick Tunnel detection)
    if ((req.method === 'GET' && url === '/') || url === '/index.html') {
      await detectQuickTunnelUrl();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml);
      return;
    }

    // --- API routing ---
    if (parts[0] === 'api') {
      try {
        if (parts[1] === 'health' && req.method === 'GET') {
          json(res, 200, { status: 'ok', version: '1.0.1' });
          return;
        }

        if (parts[1] === 'services') {
          if (req.method === 'GET' && parts.length === 2) {
            await handleGetServices(req, res, parts, body, projectPath);
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
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
