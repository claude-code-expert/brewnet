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
import { STACK_CATALOG } from '../config/stacks.js';
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
  tunnelMode: 'quick' | 'named' | 'none';
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
<div class="section-title">Services</div>
<table id="svc-table">
  <thead><tr><th>Service</th><th>Status</th><th>Port</th><th>Local</th><th>External</th><th>Actions</th></tr></thead>
  <tbody id="svc-body"><tr><td colspan="6" style="color:#8b949e">Loading...</td></tr></tbody>
</table>
<div id="bp-section"></div>
<div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Log<span style="color:#58a6ff;font-size:11px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0" onclick="document.getElementById('log').innerHTML=''">clear</span></div>
<div id="log"></div>
<script>
var SERVICE_DETAILS = ${JSON.stringify(SERVICE_DETAIL_MAP)};
var ADMIN_CREDS = ${JSON.stringify({ username: config.adminUsername, passwordHint: config.passwordHint })};
var DOMAIN_CONFIG = ${JSON.stringify({ provider: config.domainProvider, quickTunnelUrl: config.quickTunnelUrl, zoneName: config.zoneName, tunnelMode: config.tunnelMode })};
var NAME_ALIASES = ${JSON.stringify(NAME_ALIASES)};
var BOILERPLATE_STACKS = [];
var STACK_INFO = ${JSON.stringify(Object.fromEntries(STACK_CATALOG.map(s => [s.id, { lang: s.language, framework: s.framework, version: s.version, orm: s.orm, isUnified: s.isUnified }])))};
var EXT_PATHS = {traefik:{sub:'',path:''},nginx:{sub:'',path:''},caddy:{sub:'',path:''},gitea:{sub:'git',path:'/git'},nextcloud:{sub:'cloud',path:'/cloud'},pgadmin:{sub:'pgadmin',path:'/pgadmin'},jellyfin:{sub:'jellyfin',path:'/jellyfin'},filebrowser:{sub:'files',path:'/files'},minio:{sub:'minio',path:'/minio'}};
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
  var info=STACK_INFO[s.stackId]||{};
  var repoBase='https://github.com/claude-code-expert/brewnet-boilerplate';
  var branch=s.gitBranch||'stack/'+s.stackId;
  var readmeUrl=repoBase+'/tree/'+escapeHtml(branch);
  log('['+s.stackId+'] stack info — '+(info.lang||s.lang||'')+(info.framework?' / '+info.framework:'')+(s.backendUrl?' | '+s.backendUrl:'')+' | status: '+(s.status||'?'),'info');
  var ov=document.createElement('div');ov.className='modal-overlay';
  ov.onclick=function(e){if(e.target===ov)closeServiceModal();};
  // $ access
  var bu=s.backendUrl||'';var fu=s.frontendUrl||'';
  var extUrl=getBoilerplateExternalUrl(s.stackId);
  var accessHtml='';
  if(bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">Local (BE):</span> <a href="'+escapeHtml(bu)+'" target="_blank" class="modal-url-a">'+escapeHtml(bu)+'</a></div>';}
  if(!s.isUnified&&fu&&fu!==bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">Local (FE):</span> <a href="'+escapeHtml(fu)+'" target="_blank" class="modal-url-a">'+escapeHtml(fu)+'</a></div>';}
  if(extUrl){accessHtml+='<div class="modal-url"><span class="modal-url-label">External:</span> <a href="'+escapeHtml(extUrl)+'" target="_blank" class="modal-url-a">'+escapeHtml(extUrl)+'</a></div>';}
  if(bu){accessHtml+='<div class="modal-url"><span class="modal-url-label">API Docs:</span> <a href="'+escapeHtml(bu+'/docs')+'" target="_blank" class="modal-url-a">'+escapeHtml(bu)+'/docs</a></div>';}
  // $ tech stack
  var lang=info.lang||s.lang||'';var fw=info.framework||s.frameworkId||'';var ver=info.version||'';var orm=info.orm||'';
  var techHtml='<div class="modal-bullet">Language: '+escapeHtml(lang+(ver?' '+ver:''))+'</div>';
  if(fw){techHtml+='<div class="modal-bullet">Framework: '+escapeHtml(fw)+'</div>';}
  if(orm){techHtml+='<div class="modal-bullet">ORM: '+escapeHtml(orm)+'</div>';}
  techHtml+='<div class="modal-bullet">DB: '+escapeHtml((s.dbDriver||'sqlite3')+(s.dbName?' / '+s.dbName:''))+'</div>';
  // $ credentials
  var credHtml='<div class="modal-cred"><span class="modal-cred-l">DB User:</span> <span class="modal-cred-v">'+escapeHtml(s.dbUser||'brewnet')+'</span></div>';
  credHtml+='<div class="modal-cred"><span class="modal-cred-l">DB Name:</span> <span class="modal-cred-v">'+escapeHtml(s.dbName||'brewnet_db')+'</span></div>';
  credHtml+='<div class="modal-cred"><span class="modal-cred-l">Password:</span> <span class="modal-cred-v">'+escapeHtml(ADMIN_CREDS.passwordHint)+' (admin password)</span></div>';
  // $ git
  var gitHtml='<div class="modal-url"><span class="modal-url-label">Branch:</span> <code style="color:#58a6ff">'+escapeHtml(branch)+'</code></div>';
  gitHtml+='<div class="modal-url"><a href="'+readmeUrl+'" target="_blank" class="modal-url-a">'+readmeUrl+'</a></div>';
  // $ commands
  var cmdHtml='<div class="modal-cmd">cd '+escapeHtml(s.appDir||'.')+'</div>';
  cmdHtml+='<div style="margin-top:6px;color:#8b949e;font-size:12px">make logs &nbsp;&nbsp; # 컨테이너 로그 확인</div>';
  cmdHtml+='<div style="color:#8b949e;font-size:12px">make down &nbsp;&nbsp; # 서비스 중지</div>';
  cmdHtml+='<div style="color:#8b949e;font-size:12px">make validate # API 엔드포인트 검증</div>';
  var statusCls=s.status==='running'?'running':s.status==='timeout'?'error':'stopped';
  var descLine=escapeHtml(lang+(fw?' / '+fw:''))+' boilerplate stack';
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">'+escapeHtml(s.stackId)+' \\u2014 dev stack info</span>'+
      '<button class="modal-close" onclick="closeServiceModal()">\\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div class="modal-desc">'+descLine+'</div>'+
      '<div class="modal-license">Status: <span class="badge '+statusCls+'">'+escapeHtml(s.status||'unknown')+'</span></div>'+
      (accessHtml?'<div class="modal-sh">$ access</div>'+accessHtml:'')+
      '<div class="modal-sh">$ tech stack</div>'+techHtml+
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
    // For boilerplate containers (backend/frontend), look up URL and modal from BOILERPLATE_STACKS
    var bpIdx=-1;
    if(!localUrl&&(s.id==='backend'||s.id==='frontend')){
      bpIdx=findBoilerplateIdxByPort(s.port);
      if(bpIdx>=0){
        var bpStack=BOILERPLATE_STACKS[bpIdx];
        localUrl=s.id==='backend'?bpStack.backendUrl:(bpStack.frontendUrl||bpStack.backendUrl);
      }
    }
    var nameHtml=bpIdx>=0
      ?\`<b class="svc-link" onclick="showBoilerplateByPort(\${s.port})">\${s.name}</b>\`
      :hasDetail
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
function getBoilerplateExternalUrl(stackId){
  var c=DOMAIN_CONFIG;
  if(c.provider==='local')return null;
  if(c.quickTunnelUrl)return null;
  if(c.zoneName)return'https://'+stackId+'.'+c.zoneName;
  return null;
}
function findBoilerplateIdxByPort(port){
  if(!port||!BOILERPLATE_STACKS)return -1;
  var portStr=':'+port;
  for(var i=0;i<BOILERPLATE_STACKS.length;i++){
    var s=BOILERPLATE_STACKS[i];
    if((s.backendUrl&&s.backendUrl.indexOf(portStr)>=0)||(s.frontendUrl&&s.frontendUrl.indexOf(portStr)>=0))return i;
  }
  return -1;
}
function showBoilerplateByPort(port){
  var idx=findBoilerplateIdxByPort(port);
  if(idx>=0)showBoilerplateModal(idx);
}
function renderBoilerplateSection(){
  var bp=document.getElementById('bp-section');
  if(!bp)return;
  if(!BOILERPLATE_STACKS||BOILERPLATE_STACKS.length===0){bp.innerHTML='';return;}
  var rows=BOILERPLATE_STACKS.map(function(s,idx){
    var info=STACK_INFO[s.stackId]||{};
    var stackLabel=(info.lang||s.lang||'')+(info.framework?' / '+info.framework:s.frameworkId?' / '+s.frameworkId:'');
    var statusCls=s.status==='running'?'running':s.status==='timeout'?'error':'stopped';
    var nameHtml='<b class="svc-link" onclick="showBoilerplateModal('+idx+')">'+escapeHtml(s.stackId||'\\u2014')+'</b>';
    var localHtml='';
    if(s.backendUrl){localHtml+='<div><span style="color:#8b949e;font-size:11px">BE</span> <a href="'+escapeHtml(s.backendUrl)+'" target="_blank" style="color:#58a6ff">'+escapeHtml(s.backendUrl)+'</a></div>';}
    if(!s.isUnified&&s.frontendUrl&&s.frontendUrl!==s.backendUrl){localHtml+='<div><span style="color:#8b949e;font-size:11px">FE</span> <a href="'+escapeHtml(s.frontendUrl)+'" target="_blank" style="color:#58a6ff">'+escapeHtml(s.frontendUrl)+'</a></div>';}
    else if(s.isUnified&&s.backendUrl){localHtml+='<div style="color:#8b949e;font-size:11px">unified</div>';}
    if(!localHtml)localHtml='<span style="color:#8b949e">\\u2014</span>';
    var ext=getBoilerplateExternalUrl(s.stackId);
    var extHtml=ext?'<a href="'+escapeHtml(ext)+'" target="_blank" style="color:#58a6ff">'+escapeHtml(ext)+'</a>':'<span style="color:#8b949e">\\u2014</span>';
    var docsHtml=s.backendUrl?'<a href="'+escapeHtml(s.backendUrl+'/docs')+'" target="_blank" style="color:#58a6ff">'+escapeHtml(s.backendUrl)+'/docs</a>':'\\u2014';
    return'<tr>'+
      '<td>'+nameHtml+'<br><span style="color:#8b949e;font-size:11px">'+escapeHtml(stackLabel)+'</span></td>'+
      '<td><span class="badge '+statusCls+'">'+escapeHtml(s.status||'unknown')+'</span></td>'+
      '<td>'+localHtml+'</td>'+
      '<td>'+extHtml+'</td>'+
      '<td>'+docsHtml+'</td>'+
      '</tr>';
  }).join('');
  bp.innerHTML='<div class="section-title" style="margin-top:24px">Dev Stack Apps</div>'+
    '<table><thead><tr><th>Stack</th><th>Status</th><th>Local</th><th>External</th><th>API Docs</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table>';
}
async function loadBoilerplateStacks(){
  try{
    var r=await fetch('/api/boilerplate').then(function(r){return r.json();});
    BOILERPLATE_STACKS=r.stacks||[];
  }catch(e){BOILERPLATE_STACKS=[];}
  renderBoilerplateSection();
}
log('Brewnet admin panel connected — localhost:8088','ok');
log('Click a service name for details · Refresh to reload status','dim');
loadBoilerplateStacks();
loadServices(true);
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

const INTERNAL_SERVICES = new Set(['brewnet-welcome', 'brewnet-landing', 'cloudflared']);

const WEB_UI_SERVICES = new Set([
  'traefik', 'nginx', 'caddy', 'gitea', 'nextcloud', 'minio',
  'jellyfin', 'pgadmin', 'filebrowser',
]);

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
  urlMap: Record<string, string>,
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

function handleGetBoilerplate(
  _req: IncomingMessage,
  res: ServerResponse,
  projectPath: string,
): void {
  const readMeta = (dir: string): BoilerplateMeta[] => {
    try {
      const p = join(dir, '.brewnet-boilerplate.json');
      if (!existsSync(p)) return [];
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as BoilerplateMeta | BoilerplateMeta[];
      return Array.isArray(raw) ? raw : (raw.stackId ? [raw] : []);
    } catch { return []; }
  };
  const fromProjectPath = readMeta(projectPath);
  const cwd = process.cwd();
  const fromCwd = cwd !== projectPath ? readMeta(cwd) : [];
  // Merge: fromProjectPath takes precedence; fromCwd adds stacks not already present
  const seen = new Set(fromProjectPath.map((s) => s.stackId));
  const stacks = [...fromProjectPath, ...fromCwd.filter((s) => !seen.has(s.stackId))];
  json(res, 200, { stacks });
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
      // Only fall back to state.projectPath when caller didn't supply one.
      // Expand leading ~ since Node.js fs does not expand tilde automatically.
      if (!options.projectPath && state.projectPath) {
        projectPath = state.projectPath.startsWith('~/')
          ? join(homedir(), state.projectPath.slice(2))
          : state.projectPath;
      }
    }
  }

  // Build dashboard config from wizard state (credentials resolved lazily if needed)
  const username = wizardState?.admin?.username ?? '';
  const password = wizardState?.admin?.password ?? '';

  // Mask helpers
  const maskUser = (u: string) => (u.length > 2 ? u.slice(0, -2) + '**' : '**');
  const maskPass = (p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : '********');

  // Read boilerplate metadata if available (supports both array and legacy single object).
  // Table is rendered client-side via renderBoilerplateSection() using BOILERPLATE_STACKS.
  const dashConfig: DashboardConfig = {
    adminUsername: username ? maskUser(username) : '**',
    passwordHint: password ? maskPass(password) : '********',
    domainProvider: wizardState?.domain?.provider ?? 'local',
    quickTunnelUrl: wizardState?.domain?.cloudflare?.quickTunnelUrl ?? '',
    zoneName: wizardState?.domain?.cloudflare?.zoneName ?? '',
    tunnelMode: wizardState?.domain?.cloudflare?.tunnelMode ?? 'none',
  };

  // Build runtime URL map from current tunnel mode.
  // traefik: always /dashboard/ path (label-based routing, api.insecure=false).
  // jellyfin: always direct port 8096. Reason: Traefik's catch-all landing page
  // router returns HTTP 200 for /System/Info/Public, confusing Jellyfin SPA
  // auto-detection. Direct port lets Jellyfin redirect to /jellyfin/web/ correctly.
  // Quick Tunnel: gitea/nextcloud/filebrowser must use Traefik paths (direct port
  // access breaks CSS/login redirects due to OVERWRITEWEBROOT/SCRIPT_NAME settings).
  // Named/Local: getPrimaryPort fallback returns the correct Docker port — no map
  // entries needed; the port-based fallback (http://localhost:${port}) is correct.
  function buildRuntimeUrlMap(isQt: boolean): Record<string, string> {
    return {
      traefik: 'http://localhost/dashboard/',
      jellyfin: 'http://localhost:8096/jellyfin/web/',
      ...(isQt ? {
        gitea: 'http://localhost/git',
        nextcloud: 'http://localhost/cloud',
        filebrowser: 'http://localhost/files',
        pgadmin: 'http://localhost:5050/pgadmin',
      } : {}),
    };
  }
  let runtimeUrlMap = buildRuntimeUrlMap(dashConfig.tunnelMode === 'quick');

  // Cache for dashboard HTML (regenerated when Quick Tunnel URL is detected)
  let dashboardHtml = generateDashboardHtml(dashConfig);
  let quickTunnelDetected = !!dashConfig.quickTunnelUrl;

  /**
   * Ensure Nextcloud trusts the current Quick Tunnel hostname.
   * Sets a permanent *.trycloudflare.com regex (index 4) + the exact current
   * hostname (index 5) so tunnel URL changes don't require a wizard re-run.
   * Fire-and-forget — failures are non-critical (NC may not be installed/ready).
   */
  async function ensureNextcloudTrustedDomains(hostname: string): Promise<void> {
    try {
      const { execa } = await import('execa');
      const occ = (args: string[]) =>
        execa('docker', ['exec', '-u', 'www-data', 'brewnet-nextcloud', 'php', 'occ', ...args]);
      // Regex trusts ALL *.trycloudflare.com — survives future tunnel URL changes.
      await occ(['config:system:set', 'trusted_domains', '4', '--value=/.*\\.trycloudflare\\.com/']);
      await occ(['config:system:set', 'trusted_domains', '5', `--value=${hostname}`]);
      await occ(['config:system:set', 'trusted_proxies', '0', '--value=172.16.0.0/12']);
      logger.info('admin-server', `Nextcloud trusted_domains updated for ${hostname}`);
    } catch {
      // NC not installed, not running, or occ failed — non-critical
    }
  }

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
        const hostname = match[0].replace(/^https?:\/\//, '');
        dashConfig.quickTunnelUrl = match[0];
        dashConfig.tunnelMode = 'quick';
        dashConfig.domainProvider = 'quick-tunnel';
        runtimeUrlMap = buildRuntimeUrlMap(true);
        dashboardHtml = generateDashboardHtml(dashConfig);
        void ensureNextcloudTrustedDomains(hostname);
      }
    } catch {
      // Non-critical — just serve without external URLs
    }
  }

  // If the tunnel URL is already known from wizard state, ensure NC trusts it.
  // This covers the case where the wizard's occ step failed or the NC container
  // was recreated after initial setup.
  if (dashConfig.quickTunnelUrl) {
    const hn = dashConfig.quickTunnelUrl.replace(/^https?:\/\//, '');
    void ensureNextcloudTrustedDomains(hn);
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

        if (parts[1] === 'boilerplate' && req.method === 'GET') {
          handleGetBoilerplate(req, res, projectPath);
          return;
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
