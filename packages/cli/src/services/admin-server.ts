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
import type { WizardState, LogSource, UnifiedLogLevel } from '@brewnet/shared';
import { queryLogs, getLogStats } from '../utils/log-aggregator.js';
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

/** Minimal HTML entity escaping for server-side string injection. */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
.tab-bar{display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid #30363d}
.tab-btn{padding:8px 16px;cursor:pointer;color:#8b949e;background:transparent;border:none;border-bottom:2px solid transparent;font-family:inherit;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
.tab-btn.active{color:#f5a623;border-bottom-color:#f5a623}
.tab-btn:hover{color:#c9d1d9}
.tab-content{display:none}
.tab-content.active{display:block}
.log-filters{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center}
.log-filters select,.log-filters input{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-family:inherit;font-size:12px}
.log-level-btn{padding:3px 8px;border:1px solid #30363d;border-radius:4px;background:transparent;color:#8b949e;cursor:pointer;font-family:inherit;font-size:11px}
.log-level-btn.active{border-color:#f5a623;color:#f5a623}
#logs-table{width:100%;border-collapse:collapse;font-size:12px}
#logs-table td{padding:4px 8px;border-bottom:1px solid #21262d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#logs-table td:last-child{white-space:normal}
.log-src-cli{color:#58d1ff}.log-src-tunnel{color:#d2a8ff}.log-src-access{color:#79c0ff}.log-src-service{color:#c9d1d9}
.log-lvl-info{color:#3fb950}.log-lvl-warn{color:#e3b341}.log-lvl-error{color:#f85149}.log-lvl-debug{color:#8b949e}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.header{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
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
  <span class="refresh" onclick="loadServices(true)">&#8635; Refresh</span>
</div>
<div class="tab-bar">
  <button class="tab-btn active" onclick="switchTab('services')">Services</button>
  <button class="tab-btn" onclick="switchTab('logs')">Logs</button>
</div>
<div id="tab-services" class="tab-content active">
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

<div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Activity<span style="color:#58a6ff;font-size:11px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0" onclick="document.getElementById('log').innerHTML=''">clear</span></div>
<div id="log"></div>
</div><!-- /tab-services -->

<div id="tab-logs" class="tab-content">
<div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
  System Logs
  <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#8b949e;text-transform:none;letter-spacing:0;cursor:pointer">
    <input type="checkbox" id="logs-auto-refresh" checked style="accent-color:#f5a623"/> Auto-refresh (5s)
  </label>
</div>
<div class="log-filters">
  <select id="log-source" onchange="fetchLogs()">
    <option value="">All Sources</option>
    <option value="cli">CLI</option>
    <option value="tunnel">Tunnel</option>
    <option value="access">Access</option>
    <option value="service">Service</option>
  </select>
  <select id="log-level" onchange="fetchLogs()">
    <option value="">All Levels</option>
    <option value="error">Error</option>
    <option value="warn">Warn</option>
    <option value="info">Info</option>
    <option value="debug">Debug</option>
  </select>
  <select id="log-service-filter" onchange="fetchLogs()">
    <option value="">All Services</option>
  </select>
  <input type="text" id="log-search" placeholder="Search..." onkeyup="if(event.key==='Enter')fetchLogs()" style="width:140px"/>
  <span class="btn btn-start" style="font-size:11px" onclick="fetchLogs()">Search</span>
</div>
<div style="overflow-x:auto;max-height:500px;overflow-y:auto;border:1px solid #30363d;border-radius:4px">
  <table id="logs-table">
    <tbody id="logs-body"><tr><td colspan="5" style="color:#8b949e;padding:12px">Select the Logs tab to view system logs.</td></tr></tbody>
  </table>
</div>
<div id="logs-stats" style="margin-top:8px;font-size:11px;color:#8b949e"></div>
</div><!-- /tab-logs -->

<script>
var SERVICE_DETAILS = ${JSON.stringify(SERVICE_DETAIL_MAP)};
var ADMIN_CREDS = ${JSON.stringify({ username: config.adminUsername, passwordHint: config.passwordHint })};
var DOMAIN_CONFIG = ${JSON.stringify({ provider: config.domainProvider, quickTunnelUrl: config.quickTunnelUrl, zoneName: config.zoneName, tunnelId: config.tunnelId })};
var NAME_ALIASES = ${JSON.stringify(NAME_ALIASES)};
var BOILERPLATE_STACKS = ${config.boilerplateStacksJson};
var DOMAIN_CONNECTIONS = ${config.domainConnectionsJson};
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
  var s=BOILERPLATE_STACKS[idx];if(!s)return;
  log('['+s.stackId+'] stack info — '+(s.lang||'')+(s.frameworkId?'/'+s.frameworkId:'')+(s.backendUrl?' | '+s.backendUrl:'')+' | status: '+(s.status||'?'),'info');
  var repoBase='https://github.com/claude-code-expert/brewnet-boilerplate';
  var readmeUrl=repoBase+'/tree/'+escapeHtml(s.gitBranch||('stack/'+s.stackId));
  var ov=document.createElement('div');ov.className='modal-overlay';
  ov.onclick=function(e){if(e.target===ov)closeServiceModal();};
  var accessHtml='';
  var bu=s.backendUrl||'';
  var fu=s.frontendUrl||'';
  if(bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">Backend:</span> <a href="'+escapeHtml(bu)+'" target="_blank" class="modal-url-a">'+escapeHtml(bu)+'</a></div>';}
  if(!s.isUnified&&fu&&fu!==bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">Frontend:</span> <a href="'+escapeHtml(fu)+'" target="_blank" class="modal-url-a">'+escapeHtml(fu)+'</a></div>';}
  if(bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">API Docs:</span> <a href="'+escapeHtml(bu)+'/docs" target="_blank" class="modal-url-a">'+escapeHtml(bu)+'/docs</a></div>';}
  var stackLabel=(s.lang||'')+(s.frameworkId?' / '+s.frameworkId:'');
  var dbLabel=(s.dbDriver||'sqlite3')+(s.dbName?' / '+s.dbName:'');
  var statusCls=s.status==='running'?'running':s.status==='timeout'?'error':'stopped';
  var credHtml='<div class="modal-cred"><span class="modal-cred-l">DB User:</span> <span class="modal-cred-v">'+escapeHtml(s.dbUser||'brewnet')+'</span></div>';
  credHtml+='<div class="modal-cred"><span class="modal-cred-l">DB Name:</span> <span class="modal-cred-v">'+escapeHtml(s.dbName||'brewnet_db')+'</span></div>';
  credHtml+='<div class="modal-cred"><span class="modal-cred-l">Password:</span> <span class="modal-cred-v">'+escapeHtml(ADMIN_CREDS.passwordHint)+' (admin password)</span></div>';
  var gitHtml='<div class="modal-url"><span class="modal-url-label">Branch:</span> <code style="color:#58a6ff">'+escapeHtml(s.gitBranch||'stack/'+s.stackId)+'</code></div>';
  gitHtml+='<div class="modal-url"><a href="'+readmeUrl+'" target="_blank" class="modal-url-a">'+readmeUrl+'</a></div>';
  var cmdBase=s.appDir||'.';
  var cmdHtml='<div class="modal-cmd">cd '+escapeHtml(cmdBase)+'</div>';
  cmdHtml+='<div style="margin-top:6px;color:#8b949e;font-size:12px">make logs &nbsp;&nbsp; # 컨테이너 로그 확인</div>';
  cmdHtml+='<div style="color:#8b949e;font-size:12px">make down &nbsp;&nbsp; # 서비스 중지</div>';
  cmdHtml+='<div style="color:#8b949e;font-size:12px">make validate # API 엔드포인트 검증</div>';
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">'+escapeHtml(s.stackId)+' \\u2014 dev stack info</span>'+
      '<button class="modal-close" onclick="closeServiceModal()">\\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div class="modal-desc">'+escapeHtml(stackLabel)+' boilerplate stack</div>'+
      '<div class="modal-license">DB: '+escapeHtml(dbLabel)+' &nbsp;|&nbsp; Status: <span class="badge '+statusCls+'">'+escapeHtml(s.status||'unknown')+'</span></div>'+
      '<div class="modal-sh">$ access</div>'+accessHtml+
      '<div class="modal-sh">$ credentials</div>'+credHtml+
      '<div class="modal-sh">$ git</div>'+gitHtml+
      '<div class="modal-sh">$ commands</div>'+cmdHtml+
    '</div></div>';
  document.body.appendChild(ov);
  document.addEventListener('keydown',handleModalEsc);
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
  if(manual&&r.services){
    r.services.forEach(function(s){
      var ext=getExternalUrl(s.id);
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
async function saveCloudflareSettings(){
  var token=document.getElementById('cf-token').value.trim();
  var acct=document.getElementById('cf-account').value.trim();
  var zone=document.getElementById('cf-zone').value.trim();
  var tunnel=document.getElementById('cf-tunnel').value.trim();
  if(!token){document.getElementById('cf-result').innerHTML='<span style="color:#f85149">API Token required</span>';return;}
  document.getElementById('cf-result').innerHTML='<span style="color:#e3b341">Verifying...</span>';
  try{
    var r=await domainFetch('/api/settings/cloudflare',{method:'PUT',body:JSON.stringify({apiToken:token,accountId:acct,zoneId:zone,tunnelId:tunnel})});
    var d=await r.json();
    if(d.success){
      document.getElementById('cf-result').innerHTML='<span style="color:#3fb950">✅ Verified'+(d.email?' ('+d.email+')':'')+(d.zoneName?' — '+d.zoneName:'')+'</span>';
      log('Cloudflare settings saved ✓','ok');
      loadDomains();
    }else{
      document.getElementById('cf-result').innerHTML='<span style="color:#f85149">❌ '+(d.message||d.error)+'</span>';
    }
  }catch(e){document.getElementById('cf-result').innerHTML='<span style="color:#f85149">Error: '+e.message+'</span>';}
}
async function loadCloudflareStatus(){
  try{
    var r=await domainFetch('/api/settings/cloudflare');
    var d=await r.json();
    var el=document.getElementById('cf-status');
    if(d.configured){el.innerHTML='<span style="color:#3fb950">✅ Configured'+(d.zoneName?' ('+d.zoneName+')':'')+'</span>';}
    else{el.innerHTML='<span style="color:#e3b341">⚠️ Not configured</span>';}
  }catch(e){}
}
// ── Tab switching ──
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector('.tab-btn[onclick*="'+tab+'"]').classList.add('active');
  if(tab==='logs'&&!window._logsLoaded){window._logsLoaded=true;fetchLogs();fetchLogStats();}
}
// ── Logs tab ──
var _logsTimer=null;
function fetchLogs(){
  var src=document.getElementById('log-source').value;
  var lvl=document.getElementById('log-level').value;
  var svc=document.getElementById('log-service-filter').value;
  var search=document.getElementById('log-search').value.trim();
  var params=new URLSearchParams();
  if(src)params.set('source',src);
  if(lvl)params.set('level',lvl);
  if(svc)params.set('service',svc);
  if(search)params.set('search',search);
  params.set('limit','200');
  fetch('/api/logs?'+params.toString()).then(function(r){return r.json();}).then(function(d){
    var body=document.getElementById('logs-body');
    if(!d.entries||d.entries.length===0){body.innerHTML='<tr><td colspan="5" style="color:#8b949e;padding:12px">No log entries found.</td></tr>';return;}
    var html='';
    d.entries.forEach(function(e){
      var ts=e.timestamp.replace('T',' ').replace(/\\.\\d+Z$/,'').replace('Z','');
      var srcCls='log-src-'+(e.source||'service');
      var lvlCls='log-lvl-'+(e.level||'info');
      html+='<tr><td style="width:155px">'+escapeHtml(ts)+'</td><td class="'+srcCls+'" style="width:65px">'+escapeHtml((e.source||'').toUpperCase())+'</td><td class="'+lvlCls+'" style="width:50px">'+escapeHtml((e.level||'').toUpperCase())+'</td><td style="width:90px">'+escapeHtml(e.service||'')+'</td><td>'+escapeHtml(e.message)+'</td></tr>';
    });
    if(d.hasMore)html+='<tr><td colspan="5" style="color:#8b949e;font-style:italic">… '+(d.total-d.entries.length)+' more entries</td></tr>';
    body.innerHTML=html;
    // Populate service filter
    var svcFilter=document.getElementById('log-service-filter');
    var currentVal=svcFilter.value;
    var services=new Set();d.entries.forEach(function(e){if(e.service)services.add(e.service);});
    var opts='<option value="">All Services</option>';
    Array.from(services).sort().forEach(function(s){var es=escapeHtml(s);opts+='<option value="'+es+'"'+(s===currentVal?' selected':'')+'>'+es+'</option>';});
    svcFilter.innerHTML=opts;
  }).catch(function(){
    document.getElementById('logs-body').innerHTML='<tr><td colspan="5" style="color:#f85149;padding:12px">Failed to fetch logs.</td></tr>';
  });
}
function fetchLogStats(){
  fetch('/api/logs/stats').then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('logs-stats');
    var parts=['Total: '+d.total];
    if(d.bySource){Object.keys(d.bySource).forEach(function(k){if(d.bySource[k]>0)parts.push(k+': '+d.bySource[k]);});}
    if(d.byLevel&&d.byLevel.error>0)parts.push('<span style="color:#f85149">errors: '+d.byLevel.error+'</span>');
    el.innerHTML=parts.join(' &middot; ');
  }).catch(function(){});
}
// Auto-refresh logs every 5 seconds
function startLogsAutoRefresh(){
  if(_logsTimer)clearInterval(_logsTimer);
  _logsTimer=setInterval(function(){
    if(document.getElementById('logs-auto-refresh').checked&&document.getElementById('tab-logs').classList.contains('active')){
      fetchLogs();fetchLogStats();
    }
  },5000);
}
document.getElementById('logs-auto-refresh').addEventListener('change',function(){
  if(this.checked)startLogsAutoRefresh();else if(_logsTimer){clearInterval(_logsTimer);_logsTimer=null;}
});
startLogsAutoRefresh();

// Auto-load domains and settings status
setTimeout(function(){loadDomains();loadCloudflareStatus();},500);
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

  // Build dashboard config from wizard state (credentials resolved lazily if needed)
  const username = wizardState?.admin?.username ?? '';
  const password = wizardState?.admin?.password ?? '';

  // Mask helpers
  const maskUser = (u: string) => (u.length > 2 ? u.slice(0, -2) + '**' : '**');
  const maskPass = (p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : '********');

  // Read boilerplate metadata if available (supports both array and legacy single object)
  let boilerplateHtml = '';
  let boilerplateStacksJson = '[]';
  try {
    const bpMetaPath = join(projectPath, '.brewnet-boilerplate.json');
    if (existsSync(bpMetaPath)) {
      const raw = JSON.parse(readFileSync(bpMetaPath, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
      // Normalize: legacy single-object → array
      const stacks: BoilerplateMeta[] = Array.isArray(raw) ? raw : (raw.stackId ? [raw] : []);

      if (stacks.length > 0) {
        boilerplateStacksJson = JSON.stringify(stacks);

        // Build HTML table rows — each stack name is clickable (triggers modal)
        const rows = stacks.map((s, idx) => {
          const statusCls = s.status === 'running' ? 'running'
            : s.status === 'timeout' ? 'error' : 'stopped';
          const nameHtml = `<b class="svc-link" onclick="showBoilerplateModal(${idx})">${escHtml(s.stackId ?? '—')}</b>`;
          const backendLink = s.backendUrl
            ? `<a href="${escHtml(s.backendUrl)}" target="_blank" style="color:#58a6ff">${escHtml(s.backendUrl)}</a>`
            : '—';
          const frontendCell = (!s.isUnified && s.frontendUrl && s.frontendUrl !== s.backendUrl)
            ? `<a href="${escHtml(s.frontendUrl)}" target="_blank" style="color:#58a6ff">${escHtml(s.frontendUrl)}</a>`
            : (s.isUnified ? '<span style="color:#8b949e">unified</span>' : '—');
          const docsUrl = s.backendUrl ? `${s.backendUrl}/docs` : '';
          const docsCell = docsUrl
            ? `<a href="${escHtml(docsUrl)}" target="_blank" style="color:#58a6ff">${escHtml(docsUrl)}</a>`
            : '—';
          return `<tr>
    <td>${nameHtml}<br><span style="color:#8b949e;font-size:11px">${escHtml(s.lang ?? '')} / ${escHtml(s.frameworkId ?? '')}</span></td>
    <td><span class="badge ${statusCls}">${escHtml(s.status ?? 'unknown')}</span></td>
    <td>${backendLink}</td>
    <td>${frontendCell}</td>
    <td>${docsCell}</td>
    <td style="font-size:11px;color:#8b949e">${escHtml(s.appDir ?? '—')}</td>
  </tr>`;
        }).join('\n');

        boilerplateHtml = `
<div class="section-title" style="margin-top:24px">Dev Stack Apps</div>
<table>
  <thead><tr><th>Stack</th><th>Status</th><th>Backend</th><th>Frontend</th><th>API Docs</th><th>Source</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
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

    // Serve dashboard HTML (with lazy Quick Tunnel + credential detection)
    if ((req.method === 'GET' && url === '/') || url === '/index.html') {
      await detectQuickTunnelUrl();
      await detectCredentials();
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
          // Auth check for domain endpoints
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
