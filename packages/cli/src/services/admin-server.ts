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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import Dockerode from 'dockerode';
import { addService, removeService } from './service-manager.js';
import { createBackup, listBackups } from './backup-manager.js';
import { getServiceDefinition, SERVICE_REGISTRY } from '../config/services.js';
import { SERVICE_DETAIL_MAP } from './status-page.js';
import { getLastProject, loadState } from '../wizard/state.js';
import { logger } from '../utils/logger.js';
import { DomainManager } from './domain-manager.js';
import { verifyToken } from './cloudflare-client.js';
import type { WizardState } from '@brewnet/shared';
import { generateAppsPageHtml, generateAppDetailHtml } from './apps-page.js';
import { createApp, getJobStatus, listApps, startApp, stopApp, removeApp as appRemove, getDeployHistory, listGiteaRepos, deployApp, getAppGitInfo, setupWebhook as appSetupWebhook, updateDeploySettings, getDeploySettings, getAppDir } from './app-manager.js';
import type { DeploySettings } from '../types/app-entry.js';
import type { CreateAppOptions } from '../types/app-entry.js';

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
  /** docker compose project name — used to identify which boilerplate stack this container belongs to */
  project?: string;
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
  tunnelId: string;
  /** Pre-rendered HTML for the boilerplate Dev Stack App section (empty string when no app) */
  boilerplateHtml: string;
  /** JSON-serialised array of BoilerplateMeta for JS embedding */
  boilerplateStacksJson: string;
  /** JSON-serialised array of DomainConnection for JS embedding */
  domainConnectionsJson: string;
}

// ---------------------------------------------------------------------------
// Static icon assets — resolved once at module load from public/images/
// ---------------------------------------------------------------------------

const PKG_ROOT = join(fileURLToPath(import.meta.url), '../../../../..');

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


/**
 * Name alias map: SERVICE_REGISTRY display names → SERVICE_DETAIL_MAP keys.
 * Only entries that differ need to be listed here.
 */
const NAME_ALIASES: Record<string, string> = {
  'OpenSSH Server': 'SSH Server',
  'Docker Mailserver': 'Mail Server',
  'Cloudflare Tunnel': 'Cloudflared',
  'MinIO': 'MinIO Console',
  'valkey': 'Valkey',
  'keydb': 'KeyDB',
};

function generateDashboardHtml(config: DashboardConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet Admin</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<link rel="alternate icon" href="/favicon.ico"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#f5a623;margin-bottom:4px;font-size:20px;display:flex;align-items:center;gap:10px}
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
#log{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:8px 12px;height:200px;overflow-y:auto;font-size:12px;color:#8b949e;margin-bottom:16px}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.header{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
.nav-link{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px;font-family:inherit}
.nav-link:hover{background:#21262d}
.refresh{color:#58a6ff;cursor:pointer;font-size:12px;text-decoration:underline}
.svc-link{color:#c9d1d9;text-decoration:underline;text-decoration-color:#30363d;cursor:pointer;transition:color .15s}
.svc-link:hover{color:#58a6ff;text-decoration-color:#58a6ff}
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:100}
.modal-box{background:#161b22;border:1px solid #30363d;border-radius:10px;max-width:740px;width:90%;max-height:80vh;overflow-y:auto;font-family:'Courier New',monospace;font-size:14px;color:#c9d1d9}
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
    <h1><svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="#f5a623" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/><path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/><circle cx="20" cy="30" r="1.8" fill="#f5a623" stroke="none"/><path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/><path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/><path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/></svg><span style="display:flex;flex-direction:column;line-height:1.3"><span>Brewnet</span><span style="color:#ffffff;font-size:10px;font-weight:400;opacity:.8">Your server on tap. Just brew it.</span></span></h1>
    <div class="sub" id="subtitle">Loading...</div>
  </div>
  <span class="refresh" onclick="loadServices(true)" style="margin-left:12px">&#8635; Refresh</span>
  <a href="/apps" class="nav-link" style="margin-left:auto">🚀 App Deploy</a>
</div>
<div class="section-title">Services</div>
<table id="svc-table">
  <thead><tr><th>Service</th><th>Status</th><th>Port</th><th>Local</th><th>External</th><th>Actions</th></tr></thead>
  <tbody id="svc-body"><tr><td colspan="6" style="color:#8b949e">Loading...</td></tr></tbody>
</table>
${config.boilerplateHtml}

${config.domainProvider === 'tunnel' ? `
<!-- ── Domains Section (T039) ── -->
<div class="section-title" style="margin-top:24px;display:flex;justify-content:space-between;align-items:center">
  External Domains
  <span style="display:flex;gap:8px;align-items:center">
    <input id="admin-pw" type="password" placeholder="Admin password" style="background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:4px 8px;color:#c9d1d9;font-family:inherit;font-size:11px;width:140px"/>
    <span class="btn" style="font-size:11px;border-color:#58a6ff;color:#58a6ff" onclick="showCnameGuide()">CNAME Guide</span>
  </span>
</div>
<table id="domain-table">
  <thead><tr><th>App</th><th>External URL</th><th>Status</th><th>Connected</th><th>Actions</th></tr></thead>
  <tbody id="domain-body"><tr><td colspan="5" style="color:#8b949e">Loading...</td></tr></tbody>
</table>` : ''}

<!-- ── CNAME Guide Modal (T041) ── -->
<div id="cname-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)this.style.display='none'">
  <div class="modal-box" style="max-width:600px">
    <div class="modal-titlebar"><span class="modal-dot" style="background:#ff5f57"></span><span class="modal-dot" style="background:#febc2e"></span><span class="modal-dot" style="background:#28c840"></span><span style="flex:1;text-align:center;color:#8b949e;font-size:13px">CNAME Setup Guide (Scenario C)</span></div>
    <div style="padding:16px">
      <p style="color:#c9d1d9;margin-bottom:12px">도메인 네임서버를 Cloudflare로 이전하지 않고, CNAME 레코드만으로 연결하는 방법입니다.</p>
      <div style="background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:12px;margin-bottom:16px">
        <p style="font-size:11px;color:#8b949e;margin-bottom:4px">CNAME 값 (터널 UUID):</p>
        <div style="display:flex;align-items:center;gap:8px">
          <code id="cname-value" style="color:#f5a623;font-size:13px;flex:1;word-break:break-all"></code>
          <span class="btn" style="border-color:#58a6ff;color:#58a6ff;font-size:11px;white-space:nowrap" onclick="navigator.clipboard.writeText(document.getElementById('cname-value').textContent)">Copy</span>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <p style="font-weight:bold;color:#c9d1d9;margin-bottom:8px">DNS 제공자별 설정 방법:</p>
        <table style="width:100%;font-size:12px">
          <tr><td style="padding:4px 8px;color:#f5a623">GoDaddy</td><td style="padding:4px 8px">DNS 관리 → 레코드 추가 → 유형: CNAME → 이름: {subdomain} → 값: {tunnelId}.cfargotunnel.com</td></tr>
          <tr><td style="padding:4px 8px;color:#f5a623">Namecheap</td><td style="padding:4px 8px">고급 DNS → 새 레코드 추가 → Type: CNAME → Host: {subdomain} → Value: {tunnelId}.cfargotunnel.com</td></tr>
          <tr><td style="padding:4px 8px;color:#f5a623">가비아</td><td style="padding:4px 8px">DNS 관리 → 레코드 추가 → 타입: CNAME → 호스트: {subdomain} → 값: {tunnelId}.cfargotunnel.com</td></tr>
          <tr><td style="padding:4px 8px;color:#f5a623">Cafe24</td><td style="padding:4px 8px">DNS 관리 → CNAME 추가 → 호스트: {subdomain} → 값: {tunnelId}.cfargotunnel.com</td></tr>
        </table>
      </div>
      <div style="margin-bottom:16px">
        <p style="font-weight:bold;color:#c9d1d9;margin-bottom:8px">CLI 명령어:</p>
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:8px 12px;font-size:12px">
          <code style="color:#3fb950">brewnet domain connect &lt;app&gt; --domain &lt;subdomain&gt;.yourdomain.com</code>
        </div>
      </div>
      <span class="btn btn-stop" onclick="document.getElementById('cname-modal').style.display='none'">Close</span>
    </div>
  </div>
</div>

<div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Log<span style="color:#58a6ff;font-size:11px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0" onclick="document.getElementById('log').innerHTML=''">clear</span></div>
<div id="log"></div>
<script>
var SERVICE_DETAILS = ${JSON.stringify(SERVICE_DETAIL_MAP)};
var ADMIN_CREDS = ${JSON.stringify({ username: config.adminUsername, passwordHint: config.passwordHint })};
var DOMAIN_CONFIG = ${JSON.stringify({ provider: config.domainProvider, quickTunnelUrl: config.quickTunnelUrl, zoneName: config.zoneName, tunnelId: config.tunnelId })};
var NAME_ALIASES = ${JSON.stringify(NAME_ALIASES)};
var BOILERPLATE_STACKS = ${config.boilerplateStacksJson};
var DOMAIN_CONNECTIONS = ${config.domainConnectionsJson};
var EXT_PATHS = {traefik:{sub:'',path:''},nginx:{sub:'',path:''},caddy:{sub:'',path:''},gitea:{sub:'git',path:'/git'},nextcloud:{sub:'cloud',path:'/cloud'},pgadmin:{sub:'db',path:'/pgadmin'},jellyfin:{sub:'media',path:'/jellyfin'},filebrowser:{sub:'fb',path:'/files'},minio:{sub:'minio',path:'/minio'}};
function getExternalUrl(id,port,project){
  var c=DOMAIN_CONFIG;if(c.provider==='local')return null;
  var base=c.quickTunnelUrl?c.quickTunnelUrl.replace(/\\/$/,''):(c.zoneName?'https://'+c.zoneName:'');
  if(!base)return null;
  // 1. Static known services (EXT_PATHS lookup by service ID)
  var e=EXT_PATHS[id];
  if(e){return base+e.path;}
  // 2. Boilerplate containers — project label = compose project dir name (= stackId)
  if(project&&id==='backend')return base+'/apps/'+project;
  if(project&&id==='frontend')return base+'/apps/'+project+'-ui';
  return null;
}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function resolveDetailName(n){return NAME_ALIASES[n]||n;}
function showServiceModal(name,localUrl,externalUrl){
  log('['+name+'] info'+(localUrl?' — local: '+localUrl:'')+(externalUrl?' | ext: '+externalUrl:''),'info');
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
      (info.homepage?'<div class="modal-sh">$ homepage</div><div class="modal-url"><a href="'+escapeHtml(info.homepage)+'" target="_blank" class="modal-url-a">'+escapeHtml(info.homepage)+'</a> — Refer to the official documentation for usage manual</div>':'')+
    '</div></div>';
  document.body.appendChild(ov);
  document.addEventListener('keydown',handleModalEsc);
}
function closeServiceModal(){var o=document.querySelector('.modal-overlay');if(o)o.remove();document.removeEventListener('keydown',handleModalEsc);}
function handleModalEsc(e){if(e.key==='Escape')closeServiceModal();}
function showBoilerplateModal(idx){
  var stack=BOILERPLATE_STACKS[idx];if(!stack)return;
  var ov=document.createElement('div');ov.className='modal-overlay';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  var endpoints=(stack.endpoints||[]).map(function(ep){return '<div class="modal-url"><span class="modal-url-label">'+escapeHtml(ep.label||ep.url)+':</span> <a href="'+escapeHtml(ep.url)+'" target="_blank" class="modal-url-a">'+escapeHtml(ep.url)+'</a></div>';}).join('');
  var credHtml='';
  if(stack.dbUser){credHtml+='<div class="modal-cred"><span class="modal-cred-l">DB User:</span> <span class="modal-cred-v">'+escapeHtml(stack.dbUser)+'</span></div>';}
  if(stack.dbName){credHtml+='<div class="modal-cred"><span class="modal-cred-l">DB Name:</span> <span class="modal-cred-v">'+escapeHtml(stack.dbName)+'</span></div>';}
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">'+escapeHtml(stack.stackId||'boilerplate')+' \\u2014 app info</span>'+
      '<button class="modal-close">\\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      (stack.branch?'<div class="modal-cred"><span class="modal-cred-l">Branch:</span> <span class="modal-cred-v">'+escapeHtml(stack.branch)+'</span></div>':'')+
      credHtml+
      (endpoints?'<div class="modal-sh">$ endpoints</div>'+endpoints:'')+
      (stack.readme?'<div class="modal-sh">$ readme</div><div class="modal-url"><a href="'+escapeHtml(stack.readme)+'" target="_blank" class="modal-url-a">View README on GitHub</a></div>':'')+
    '</div></div>';
  var cb=ov.querySelector('.modal-close');if(cb)cb.onclick=function(){ov.remove();};
  document.body.appendChild(ov);
}
const LOG_COL={info:'#58a6ff',ok:'#3fb950',warn:'#e3b341',error:'#f85149',dim:'#484f58'};
const log=(msg,lv)=>{lv=lv||'info';const d=document.getElementById('log');const row=document.createElement('div');row.style.cssText='padding:1px 0;line-height:1.6';row.innerHTML='<span style="color:#30363d;user-select:none">'+new Date().toLocaleTimeString()+'</span> <span style="color:'+(LOG_COL[lv]||LOG_COL.info)+'">'+escapeHtml(String(msg))+'</span>';d.insertBefore(row,d.firstChild);while(d.children.length>80)d.removeChild(d.lastChild);};
const badge=(s)=>{const c=s==='running'?'running':s==='stopped'?'stopped':'error';return \`<span class="badge \${c}">\${s}</span>\`;}
const fmt=(s,r)=>\`<button class="btn btn-\${s==='running'?'stop':'start'}" onclick="toggle('\${r.id}','\${s}')">\${s==='running'?'Stop':'Start'}</button><button class="btn btn-remove" onclick="removeSvc('\${r.id}')">Remove</button>\`
async function loadServices(manual){
  if(manual)log('Refreshing service list...','dim');
  const r=await fetch('/api/services').then(r=>r.json()).catch(()=>{log('API error: failed to reach admin server','error');return{services:[]};});
  const tbody=document.getElementById('svc-body');
  if(!r.services||r.services.length===0){tbody.innerHTML='<tr><td colspan="6" style="color:#8b949e">No services installed.</td></tr>';return;}
  tbody.innerHTML=r.services.map(s=>{
    var ext=getExternalUrl(s.id,s.port,s.project);
    var detailName=resolveDetailName(s.name);
    var hasDetail=!!SERVICE_DETAILS[detailName];
    var localUrl=s.url||null;
    var isUnifiedNext=(s.project||'').startsWith('nodejs-nextjs');
    var localCellHtml;
    if(!localUrl){localCellHtml='<span style="color:#8b949e">—</span>';}
    else if(isUnifiedNext){var apiUrl=localUrl+'/api/hello';var frontLabel=s.project==='nodejs-nextjs-full'?'Frontend':'App';localCellHtml='<a href="'+localUrl+'" target="_blank" style="color:#58a6ff">'+localUrl+'</a> <span style="color:#8b949e;font-size:11px">'+frontLabel+'</span><br><a href="'+apiUrl+'" target="_blank" style="color:#58a6ff">'+apiUrl+'</a> <span style="color:#8b949e;font-size:11px">API</span>';}
    else{localCellHtml='<a href="'+localUrl+'" target="_blank" style="color:#58a6ff">'+localUrl+'</a>';}
    var nameHtml=hasDetail
      ?\`<b class="svc-link" onclick="showServiceModal('\${s.name.replace(/'/g,"\\\\'")}','\${(localUrl||'').replace(/'/g,"\\\\'")}','\${(ext||'').replace(/'/g,"\\\\'")}')">\${s.name}</b>\`
      :\`<b>\${s.name}</b>\`;
    return \`<tr>
    <td>\${nameHtml}<br><span style="color:#8b949e;font-size:11px">\${s.id}</span></td>
    <td>\${badge(s.status)}</td>
    <td>\${s.port??'—'}</td>
    <td>\${localCellHtml}</td>
    <td>\${ext?\`<a href="\${ext}" target="_blank" style="color:#58a6ff">\${ext}</a>\`:'<span style="color:#8b949e">—</span>'}</td>
    <td class="actions">\${s.removable?fmt(s.status,s):''}</td>
  </tr>\`;}).join('');
  const sum=r.summary;
  document.getElementById('subtitle').textContent=sum?\`\${sum.running}/\${sum.total} running\`:'';
  if(manual&&r.services){
    r.services.forEach(function(s){
      var ext=getExternalUrl(s.id,s.port,s.project);
      var lv=s.status==='running'?'ok':s.status==='error'?'error':'dim';
      var detail='['+s.id+'] '+s.status+(s.port?' port='+s.port:'')+(s.url?' — '+s.url:'')+(ext?' | ext: '+ext:'');
      log(detail,lv);
    });
    if(sum)log(sum.running+'/'+sum.total+' services running · cpu: '+(sum.cpu||'—')+' · mem: '+(sum.memory||'—'),'info');
  }
}
async function toggle(id,cur){
  const action=cur==='running'?'stop':'start';
  log(\`[\${id}] \${action} requested...\`,'dim');
  const t0=Date.now();
  const r=await fetch(\`/api/services/containers/\${id}/\${action}\`,{method:'POST'}).then(r=>r.json()).catch(e=>({success:false,error:e.message}));
  const ms=Date.now()-t0;
  if(r.success){
    log(\`[\${id}] \${action==='start'?'started ✓':'stopped ✓'} (\${ms}ms)\`+(r.status?' — status: '+r.status:''),'ok');
  }else{
    log(\`[\${id}] \${action} failed (\${ms}ms) — \${r.error||'unknown error'}\`,'error');
  }
  setTimeout(loadServices,800);
}
async function removeSvc(id){
  if(!confirm(\`Remove \${id}? Data will be preserved (use purge=true to delete).\`))return;
  log(\`[\${id}] remove requested — stopping container...\`,'warn');
  const t0=Date.now();
  const r=await fetch(\`/api/services/containers/\${id}\`,{method:'DELETE'}).then(r=>r.json()).catch(e=>({success:false,error:e.message}));
  const ms=Date.now()-t0;
  if(r.success){
    log(\`[\${id}] removed ✓ (\${ms}ms)\`,'ok');
  }else{
    log(\`[\${id}] remove failed (\${ms}ms) — \${r.error||'unknown error'}\`,'error');
  }
  setTimeout(loadServices,800);
}
log('Brewnet admin panel connected — localhost:8088','ok');
log('Click a service name for details · Refresh to reload status','dim');
loadServices(true);
setInterval(loadServices,15000);

// ── Domain management JS (T042, T044) ──
function getAdminPw(){return document.getElementById('admin-pw').value||'';}
function domainFetch(url,opts){
  var h=Object.assign({'Content-Type':'application/json','X-Admin-Password':getAdminPw()},opts&&opts.headers||{});
  return fetch(url,Object.assign({},opts,{headers:h}));
}
async function loadDomains(){
  try{
    var r=await domainFetch('/api/domain/list');
    var d=await r.json();
    if(!r.ok){document.getElementById('domain-body').innerHTML='<tr><td colspan="5" style="color:#f85149">'+((d&&d.message)||'Auth required — enter admin password')+'</td></tr>';return;}
    var conns=d.connections||[];
    if(conns.length===0){document.getElementById('domain-body').innerHTML='<tr><td colspan="5" style="color:#8b949e">No external domain connections</td></tr>';return;}
    var rows=conns.map(function(c){
      var url='https://'+c.hostname;
      return '<tr><td>'+c.appName+'</td><td><a href="'+url+'" target="_blank" style="color:#58a6ff">'+url+'</a></td><td><span class="badge running">connected</span></td><td style="font-size:11px;color:#8b949e">'+(c.connectedAt||'').slice(0,16).replace('T',' ')+'</td><td><a href="/apps/'+encodeURIComponent(c.appName)+'?tab=domain" style="color:#58a6ff;font-size:11px">Manage \u2192</a></td></tr>';
    }).join('');
    document.getElementById('domain-body').innerHTML=rows;
  }catch(e){document.getElementById('domain-body').innerHTML='<tr><td colspan="5" style="color:#8b949e">Enter admin password to view domains</td></tr>';}
}
function showCnameGuide(){
  document.getElementById('cname-modal').style.display='flex';
  var tid=DOMAIN_CONFIG.tunnelId||DOMAIN_CONFIG.zoneName||'(configure tunnel first)';
  document.getElementById('cname-value').textContent=tid+'.cfargotunnel.com';
}
// Auto-load domains
setTimeout(function(){loadDomains();},500);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

const docker = new Dockerode();

const REQUIRED_SERVICES = new Set(['traefik', 'nginx', 'caddy', 'gitea']);

const INTERNAL_SERVICES = new Set(['brewnet-welcome', 'brewnet-landing', 'cloudflared']);

const WEB_UI_SERVICES = new Set([
  'traefik', 'nginx', 'caddy', 'gitea', 'nextcloud', 'minio',
  'jellyfin', 'pgadmin', 'filebrowser',
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

      const projectLabel = c.Labels?.['com.docker.compose.project'] ?? undefined;
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
          ? urlMap[composeService] ?? `http://localhost:${port}`
          : (!def && port ? `http://localhost:${port}` : null),
        removable: !REQUIRED_SERVICES.has(composeService),
        project: projectLabel,
      });

      // Debug: log boilerplate container identifiers for external URL diagnosis
      if (composeService === 'backend' || composeService === 'frontend') {
        logger.info('admin-server', `[diag:docker] ${composeService}: project=${projectLabel ?? 'MISSING'} port=${port ?? '—'} name=${c.Names?.[0] ?? '?'} state=${s}`);
      }
    }

    // Deduplicate: if the main 'postgresql' service exists, hide the
    // boilerplate's 'postgres' container to avoid duplicate dashboard entries.
    const hasPostgresql = services.some((s) => s.id === 'postgresql');
    const deduped = hasPostgresql ? services.filter((s) => s.id !== 'postgres') : services;

    const running = deduped.filter((s) => s.status === 'running').length;
    json(res, 200, {
      services: deduped,
      summary: { total: deduped.length, running, stopped: deduped.length - running },
    });
  } catch (err) {
    json(res, 500, { success: false, error: String(err), code: 'BN001' });
  }
}

function inferType(id: string): string {
  if (['traefik', 'nginx', 'caddy'].includes(id)) return 'web';
  if (['postgresql', 'postgres', 'mysql', 'redis', 'valkey', 'keydb'].includes(id)) return 'db';
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

  // Resolve project path and wizard state.
  // Always load wizard state from the last project — options.projectPath only
  // overrides the filesystem path, not whether state is loaded.
  // Expand leading ~ — Node.js fs functions don't resolve shell tilde notation.
  // Apply unconditionally so callers passing state.projectPath directly are also covered.
  const rawPath = options.projectPath ?? process.cwd();
  let projectPath = rawPath.startsWith('~') ? join(homedir(), rawPath.slice(1)) : rawPath;
  let wizardState: WizardState | null = null;
  const last = getLastProject();
  logger.info('admin-server', `[init] lastProject=${JSON.stringify(last)} rawPath=${rawPath} projectPath=${projectPath}`);
  if (last) {
    const state = loadState(last);
    if (state) {
      wizardState = state;
      // Only fall back to state.projectPath when caller didn't supply one
      if (!options.projectPath && state.projectPath) {
        const raw = state.projectPath;
        projectPath = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
        logger.info('admin-server', `[init] projectPath resolved from state: ${projectPath}`);
      }
    } else {
      logger.warn('admin-server', `[init] loadState("${last}") returned null — state file missing?`);
    }
  } else {
    logger.warn('admin-server', '[init] lastProject is empty — no wizard state loaded, projectPath fallback to cwd');
  }

  // Build dashboard config from wizard state (credentials resolved lazily if needed)
  const username = wizardState?.admin?.username ?? '';
  const password = wizardState?.admin?.password ?? '';

  // Mask helpers
  const maskUser = (u: string) => (u.length > 2 ? u.slice(0, -2) + '**' : '**');
  const maskPass = (p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : '********');

  const dashConfig: DashboardConfig = {
    adminUsername: username ? maskUser(username) : '**',
    passwordHint: password ? maskPass(password) : '********',
    domainProvider: wizardState?.domain?.provider ?? 'local',
    quickTunnelUrl: wizardState?.domain?.cloudflare?.quickTunnelUrl ?? '',
    zoneName: wizardState?.domain?.cloudflare?.zoneName ?? '',
    tunnelId: wizardState?.domain?.cloudflare?.tunnelId ?? '',
    boilerplateHtml: '',
    boilerplateStacksJson: '[]',
    domainConnectionsJson: JSON.stringify(wizardState?.domainConnections ?? []),
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
        dashboardHtml = generateDashboardHtml(dashConfig);
      }
    } catch {
      // Non-critical — fall through to defaults
    }
  }

  /**
   * Lazy-load boilerplate metadata from .brewnet-boilerplate.json.
   * Re-checks on every GET / until the file appears.
   */
  let boilerplateLoaded = false;
  function refreshBoilerplateMeta(): void {
    if (boilerplateLoaded) return;
    const bpPath = join(projectPath, '.brewnet-boilerplate.json');
    if (!existsSync(bpPath)) return;
    try {
      const raw = JSON.parse(readFileSync(bpPath, 'utf-8'));
      dashConfig.boilerplateStacksJson = JSON.stringify(Array.isArray(raw) ? raw : [raw]);
      boilerplateLoaded = true;
      dashboardHtml = generateDashboardHtml(dashConfig);
    } catch {
      // Non-critical — keep empty array
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

    // Serve dashboard HTML (with lazy Quick Tunnel + credential + boilerplate detection)
    if ((req.method === 'GET' && url === '/') || url === '/index.html') {
      await detectQuickTunnelUrl();
      await detectCredentials();
      refreshBoilerplateMeta();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml);
      return;
    }

    // Serve Apps page
    if (req.method === 'GET' && (url === '/apps' || url === '/apps/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateAppsPageHtml());
      return;
    }

    // Serve App Detail page at /apps/:name
    if (req.method === 'GET' && parts.length === 2 && parts[0] === 'apps') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateAppDetailHtml(decodeURIComponent(parts[1]!), {
        zoneName: dashConfig.zoneName ?? undefined,
        tunnelId: dashConfig.tunnelId ?? undefined,
      }));
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
            await handleGetServices(req, res, parts, body, projectPath, runtimeUrlMap);
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

        if (parts[1] === 'apps') {
          if (req.method === 'GET' && parts.length === 2) {
            const apps = await listApps();
            logger.info('admin-server', `[GET /api/apps] returning ${apps.length} app(s): ${JSON.stringify(apps.map((a) => a.name))}`);
            json(res, 200, { apps });
            return;
          }
          if (req.method === 'GET' && parts[2] === 'boilerplates') {
            const bpPath = join(projectPath, '.brewnet-boilerplate.json');
            logger.info('admin-server', `[GET /api/apps/boilerplates] projectPath=${projectPath} bpPath=${bpPath} exists=${existsSync(bpPath)}`);
            if (existsSync(bpPath)) {
              const raw = JSON.parse(readFileSync(bpPath, 'utf-8'));
              const metas = Array.isArray(raw) ? raw : [raw];
              logger.info('admin-server', `[GET /api/apps/boilerplates] returning ${metas.length} boilerplate(s)`);
              json(res, 200, { boilerplates: metas });
            } else {
              logger.warn('admin-server', `[GET /api/apps/boilerplates] file not found at ${bpPath}`);
              json(res, 200, { boilerplates: [] });
            }
            return;
          }
          if (req.method === 'POST' && parts[2] === 'create') {
            const opts = JSON.parse(body) as CreateAppOptions;
            const jobId = await createApp(opts);
            json(res, 202, { jobId });
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

          // GET /api/apps/:name — single app detail
          if (req.method === 'GET' && parts[2] && !['boilerplates', 'jobs'].includes(parts[2]) && parts.length === 3) {
            const apps = await listApps();
            const app = apps.find((a) => a.name === decodeURIComponent(parts[2]!));
            if (!app) { json(res, 404, { error: 'App not found' }); return; }
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

          // GET /api/apps/:name/logs — SSE stream
          if (req.method === 'GET' && parts[3] === 'logs') {
            const appDir = getAppDir(decodeURIComponent(parts[2] ?? ''));
            if (!appDir) { json(res, 404, { error: 'App not found' }); return; }
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
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
            req.on('close', () => { try { proc.kill(); } catch { /* ignore */ } });
            return;
          }
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
            json(res, 200, { repos });
          } catch (err) {
            json(res, 502, { success: false, error: String(err) });
          }
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
          if (!checkAdminAuth(req, res, wizardState)) return;

          if (req.method === 'GET' && parts[2] === 'list') {
            await handleDomainList(res, wizardState);
            return;
          }
          if (req.method === 'GET' && parts[2] === 'apps') {
            handleDomainApps(res, wizardState);
            return;
          }
          if (req.method === 'POST' && parts[2] === 'connect') {
            await handleDomainConnect(res, body, wizardState);
            return;
          }
          if (req.method === 'DELETE' && parts[2] === 'disconnect' && parts[3]) {
            await handleDomainDisconnect(res, parts[3], wizardState);
            return;
          }
          if (req.method === 'GET' && parts[2] === 'status' && parts[3]) {
            await handleDomainStatus(res, parts[3], wizardState);
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
        tunnel = { ...health, tunnelName: cf.tunnelName };
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

  try {
    const mgr = new DomainManager(state.projectName);
    const result = await mgr.connect(appName, subdomain, domain);

    if (!result.success) {
      const statusCode = result.error === 'CNAME_CONFLICT' ? 409
        : result.error?.startsWith('APP_NOT_RUNNING') ? 503
        : 400;
      json(res, statusCode, { success: false, error: result.error, message: result.error, steps: result.steps });
      return;
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
  const mask = (s: string) => s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : s ? '***set***' : 'not set';

  json(res, 200, {
    configured: !!(cf.apiToken && cf.accountId && cf.zoneId),
    accountId: mask(cf.accountId),
    zoneId: mask(cf.zoneId),
    zoneName: cf.zoneName || '',
    tunnelId: mask(cf.tunnelId),
    tunnelName: cf.tunnelName || '',
    apiTokenSet: !!cf.apiToken,
    apiTokenValid: !!cf.apiToken, // Validated on save, assumed valid if set
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

  const { apiToken, accountId, zoneId, tunnelId } = parsed;
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

    // Update state
    const { saveState: save } = await import('../wizard/state.js');
    const updated = structuredClone(state);
    updated.domain.cloudflare.apiToken = apiToken;
    if (accountId) updated.domain.cloudflare.accountId = accountId;
    if (zoneId) updated.domain.cloudflare.zoneId = zoneId;
    if (tunnelId) updated.domain.cloudflare.tunnelId = tunnelId;
    save(updated);

    // Get zone name for response
    let zoneName = updated.domain.cloudflare.zoneName;
    if (zoneId && !zoneName) {
      try {
        const { getZones } = await import('./cloudflare-client.js');
        const zones = await getZones(apiToken);
        const found = zones.find((z) => z.id === zoneId);
        if (found) {
          zoneName = found.name;
          updated.domain.cloudflare.zoneName = zoneName;
          save(updated);
        }
      } catch { /* non-critical */ }
    }

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
