// packages/cli/src/services/apps-page.ts

/**
 * HTML template for the /apps page — App Build & Deploy (Phase 1).
 *
 * Intentionally self-contained: all CSS and JS inline, matching the
 * admin panel dark theme. Loaded once at server start; no file I/O at
 * request time.
 */

import { STACK_CATALOG } from '../config/stacks.js';

// Serialise catalog for embedded JS (language → frameworks list)
const LANGUAGE_MAP: Record<string, Array<{ id: string; label: string }>> = {};
for (const s of STACK_CATALOG) {
  if (!LANGUAGE_MAP[s.language]) LANGUAGE_MAP[s.language] = [];
  LANGUAGE_MAP[s.language]!.push({ id: s.id, label: s.framework });
}
const DEFAULT_PORTS: Record<string, number> = {
  Go: 8080, Python: 8000, Java: 8080, 'Node.js': 3000, Rust: 8080, Kotlin: 8080,
};

export function generateAppsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet — App Deploy</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#f5a623;font-size:20px;display:flex;align-items:center;gap:10px;margin-bottom:4px}
.sub{color:#8b949e;font-size:12px;margin-bottom:24px}
.header{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
.nav-link{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px;font-family:inherit}
.nav-link:hover{background:#21262d}
.btn-primary{padding:5px 14px;background:#f5a623;color:#0d1117;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700}
.btn-primary:hover{background:#e09420}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;padding:8px 12px;background:#161b22;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d}
td{padding:8px 12px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:hover td{background:#161b22}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}
.stopped{background:#3d1f1f;color:#f85149}
.creating{background:#2d2a1f;color:#e3b341}
.failed{background:#3d2b1f;color:#e3b341}
.btn{padding:4px 10px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent;margin-left:4px}
.btn-stop{border-color:#f85149;color:#f85149}.btn-stop:hover{background:#3d1f1f}
.btn-start{border-color:#3fb950;color:#3fb950}.btn-start:hover{background:#1a4731}
.btn-remove{border-color:#8b949e;color:#8b949e}.btn-remove:hover{background:#21262d}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
/* Modal */
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:100}
.modal-box{background:#161b22;border:1px solid #30363d;border-radius:10px;max-width:600px;width:92%;max-height:85vh;overflow-y:auto;font-family:'Courier New',monospace;font-size:14px}
.modal-titlebar{background:#0d1117;padding:10px 16px;display:flex;align-items:center;gap:8px;border-radius:10px 10px 0 0;position:sticky;top:0;z-index:1}
.modal-dot{width:12px;height:12px;border-radius:50%;display:inline-block}
.modal-dot.r{background:#f85149}.modal-dot.y{background:#e3b341}.modal-dot.g{background:#3fb950}
.modal-title{flex:1;color:#8b949e;font-size:13px;margin-left:4px}
.modal-close{background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;line-height:1}
.modal-close:hover{color:#c9d1d9}
.modal-body{padding:20px}
/* Form */
.mode-tabs{display:flex;gap:0;margin-bottom:20px;border:1px solid #30363d;border-radius:6px;overflow:hidden}
.mode-tab{flex:1;padding:8px;text-align:center;cursor:pointer;font-size:12px;color:#8b949e;background:#0d1117;border:none;font-family:inherit;transition:all .15s}
.mode-tab.active{background:#1c2128;color:#f5a623;font-weight:700}
.mode-tab:hover:not(.active){background:#161b22;color:#c9d1d9}
.form-group{margin-bottom:14px}
.form-label{display:block;color:#8b949e;font-size:12px;margin-bottom:5px}
.form-input{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:7px 10px;font-family:inherit;font-size:13px}
.form-input:focus{outline:none;border-color:#58a6ff}
.form-select{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:7px 10px;font-family:inherit;font-size:13px}
.lang-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}
.lang-card{padding:8px;text-align:center;border:1px solid #30363d;border-radius:6px;cursor:pointer;font-size:13px;transition:all .15s}
.lang-card:hover{border-color:#58a6ff;color:#58a6ff}
.lang-card.selected{border-color:#f5a623;color:#f5a623;background:#1c1a12}
.form-hint{color:#484f58;font-size:11px;margin-top:4px}
.form-row{display:flex;gap:10px}
.form-row .form-group{flex:1}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #30363d}
.btn-cancel{padding:6px 16px;background:transparent;border:1px solid #30363d;border-radius:4px;color:#8b949e;cursor:pointer;font-family:inherit;font-size:13px}
.btn-cancel:hover{border-color:#8b949e;color:#c9d1d9}
.btn-submit{padding:6px 16px;background:#f5a623;border:none;border-radius:4px;color:#0d1117;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700}
.btn-submit:hover{background:#e09420}
.btn-submit:disabled{opacity:.4;cursor:default}
/* Progress */
.progress-step{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px}
.step-icon{width:18px;text-align:center;flex-shrink:0}
.step-label{flex:1;color:#c9d1d9}
.step-msg{color:#8b949e;font-size:11px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #21262d;font-size:13px}
.info-key{color:#8b949e}
.info-val{color:#c9d1d9;font-family:monospace}
a.app-link{color:#58a6ff;text-decoration:none}
a.app-link:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="header">
  <h1>
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="#f5a623" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/>
      <path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/>
      <path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/>
      <path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/>
      <path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/>
    </svg>
    App Deploy
  </h1>
  <div style="display:flex;align-items:center;gap:10px;margin-left:auto">
    <a href="/" class="nav-link">\u2190 Admin</a>
    <button class="btn-primary" onclick="openNewAppModal()">+ New App</button>
  </div>
</div>

<div class="section-title">Managed Apps</div>
<table id="app-table">
  <thead><tr><th>Name</th><th>Mode</th><th>Stack / Source</th><th>Port</th><th>Status</th><th>Local URL</th><th>Actions</th><th></th></tr></thead>
  <tbody id="app-body"><tr><td colspan="7" style="color:#8b949e">Loading...</td></tr></tbody>
</table>

<script>
var LANGUAGE_MAP = ${JSON.stringify(LANGUAGE_MAP)};
var DEFAULT_PORTS = ${JSON.stringify(DEFAULT_PORTS)};
var BOILERPLATES = [];  // loaded from /api/apps/boilerplates on modal open

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function badge(status){var c={running:'running',stopped:'stopped',creating:'creating',failed:'failed'}[status]||'stopped';return '<span class="badge '+c+'">'+status+'</span>';}

// ---------------------------------------------------------------------------
// App table
// ---------------------------------------------------------------------------
function extractPort(url){var m=url&&url.match(/:([0-9]+)/);return m?parseInt(m[1],10):null;}

async function loadApps(){
  var r=await fetch('/api/apps').then(function(r){return r.json();}).catch(function(){return {apps:[]};});
  var tbody=document.getElementById('app-body');
  if(!r.apps||r.apps.length===0){
    // Check if there are unregistered boilerplates from brewnet init
    var bp=await fetch('/api/apps/boilerplates').then(function(r){return r.json();}).catch(function(){return {boilerplates:[]};});
    if(bp.boilerplates&&bp.boilerplates.length>0){
      tbody.innerHTML='<tr><td colspan="7" style="color:#8b949e">'+
        bp.boilerplates.length+' boilerplate(s) from <code>brewnet init</code> not yet registered.'+
        ' Click \u201c+ New App\u201d \u2192 \u201cInstalled Boilerplate\u201d tab to add them.'+
        '<br/><br/>'+
        bp.boilerplates.map(function(b){
          var port=b.port||extractPort(b.backendUrl)||'';
          return '\u2022 <b>'+escHtml(b.stackId)+'</b> (port '+port+') \u2014 <a href="'+escHtml(b.backendUrl||'')+'" target="_blank" class="app-link">'+escHtml(b.backendUrl||'')+'</a>';
        }).join('<br/>')+
        '</td></tr>';
    }else{
      tbody.innerHTML='<tr><td colspan="7" style="color:#8b949e">No apps yet \u2014 click "+ New App" to get started.</td></tr>';
    }
    return;
  }
  tbody.innerHTML=r.apps.map(function(a){
    var localUrl=a.port?'http://localhost:'+a.port:'';
    var stackLabel=a.stackId||a.sourceUrl||'\u2014';
    return '<tr>'+
      '<td><b>'+escHtml(a.name)+'</b></td>'+
      '<td><span style="color:#8b949e">'+escHtml(a.mode)+'</span></td>'+
      '<td style="font-size:12px;color:#8b949e">'+escHtml(stackLabel)+'</td>'+
      '<td>'+escHtml(String(a.port||'\u2014'))+'</td>'+
      '<td>'+badge(a.status)+'</td>'+
      '<td>'+(localUrl?'<a href="'+localUrl+'" target="_blank" class="app-link">'+localUrl+'</a>':'\u2014')+'</td>'+
      '<td>'+
        (a.status==='running'?'<button class="btn btn-stop" onclick="stopApp(\\''+escHtml(a.name)+'\\')">Stop</button>':'')+
        (a.status==='stopped'?'<button class="btn btn-start" onclick="startApp(\\''+escHtml(a.name)+'\\')">Start</button>':'')+
        '<button class="btn btn-remove" onclick="removeApp(\\''+escHtml(a.name)+'\\')">Remove</button>'+
      '</td>'+
      '<td><a href="/apps/'+encodeURIComponent(a.name)+'" class="btn btn-default" style="text-decoration:none;display:inline-block;margin-left:0">Details</a></td>'+
    '</tr>';
  }).join('');
}

async function stopApp(name){
  await fetch('/api/apps/'+encodeURIComponent(name)+'/stop',{method:'POST'});
  loadApps();
}
async function startApp(name){
  await fetch('/api/apps/'+encodeURIComponent(name)+'/start',{method:'POST'});
  loadApps();
}
async function removeApp(name){
  if(!confirm('Remove app "'+name+'"? The source files will NOT be deleted.'))return;
  await fetch('/api/apps/'+encodeURIComponent(name),{method:'DELETE'});
  loadApps();
}

// ---------------------------------------------------------------------------
// New App modal — 3 modes
// ---------------------------------------------------------------------------
var currentMode='boilerplate';
var selectedLang='';

async function openNewAppModal(){
  BOILERPLATES=await fetch('/api/apps/boilerplates').then(function(r){return r.json();}).then(function(r){return r.boilerplates||[];}).catch(function(){return [];});
  var ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.id='new-app-overlay';
  ov.onclick=function(e){if(e.target===ov)closeNewAppModal();};
  ov.innerHTML=buildNewAppModalHtml();
  document.body.appendChild(ov);
  document.addEventListener('keydown',handleEsc);
  switchMode('boilerplate');
}

function closeNewAppModal(){
  var o=document.getElementById('new-app-overlay');
  if(o)o.remove();
  document.removeEventListener('keydown',handleEsc);
}

function handleEsc(e){if(e.key==='Escape')closeNewAppModal();}

function buildNewAppModalHtml(){
  return '<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">New App</span>'+
      '<button class="modal-close" onclick="closeNewAppModal()">\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div class="mode-tabs">'+
        '<button class="mode-tab active" id="tab-boilerplate" onclick="switchMode(\\'boilerplate\\')">Installed Boilerplate</button>'+
        '<button class="mode-tab" id="tab-git-url" onclick="switchMode(\\'git-url\\')">Git URL</button>'+
        '<button class="mode-tab" id="tab-new-project" onclick="switchMode(\\'new-project\\')">New Project</button>'+
      '</div>'+
      '<div id="mode-fields"></div>'+
      '<div class="form-actions">'+
        '<button class="btn-cancel" onclick="closeNewAppModal()">Cancel</button>'+
        '<button class="btn-submit" id="submit-btn" onclick="submitNewApp()">Create App \u2192</button>'+
      '</div>'+
    '</div></div>';
}

function switchMode(mode){
  currentMode=mode;
  selectedLang='';
  ['boilerplate','git-url','new-project'].forEach(function(m){
    var tab=document.getElementById('tab-'+m);
    if(tab)tab.className='mode-tab'+(m===mode?' active':'');
  });
  var fields=document.getElementById('mode-fields');
  if(!fields)return;
  if(mode==='boilerplate'){
    var bpOpts=BOILERPLATES.length
      ?BOILERPLATES.map(function(b){
          var label=b.isUnified
            ?(extractPort(b.backendUrl)||'?')
            :'backend :'+(extractPort(b.backendUrl)||'?')+' + frontend :'+(extractPort(b.frontendUrl)||'?');
          return '<option value="'+escHtml(b.stackId)+'">'+escHtml(b.stackId)+' ('+label+')</option>';
        }).join('')
      :'<option disabled value="">No installed boilerplates</option>';
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Stack (installed)</label>'+
      '<select class="form-select" id="f-stackId" onchange="onStackChange()">'+bpOpts+'</select>'+
      '<p class="form-hint">Monorepo with backend + frontend. Creates one Gitea repo for the whole stack.</p></div>'+
      '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
      '<div id="f-ports-info" style="font-size:12px;color:#8b949e;margin-bottom:12px"></div>'+
      '<div class="form-group"><label class="form-label">Framework</label><input class="form-input" id="f-framework" readonly style="opacity:.5"/></div>'+
      '<div class="form-group"><label class="form-label">Local Path</label><input class="form-input" id="f-appDir" readonly style="opacity:.5"/></div>';
    if(BOILERPLATES.length)onStackChange();
  } else if(mode==='git-url'){
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Git URL</label>'+
      '<input class="form-input" id="f-gitUrl" placeholder="https://github.com/user/repo.git"/>'+
      '<p class="form-hint">Will be cloned, git history reset, and pushed to your local Gitea.</p></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
        '<div class="form-group"><label class="form-label">Port</label><input class="form-input" id="f-port" type="number" value="8080"/></div>'+
      '</div>';
  } else {
    var langCards=Object.keys(LANGUAGE_MAP).map(function(lang){
      return '<div class="lang-card" onclick="selectLang(\\''+lang+'\\')" id="lang-'+lang.replace(/[^a-z]/gi,'-')+'">'+lang+'</div>';
    }).join('');
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Language</label><div class="lang-grid" id="lang-grid">'+langCards+'</div></div>'+
      '<div class="form-group" id="fw-group" style="display:none"><label class="form-label">Framework</label>'+
        '<select class="form-select" id="f-frameworkId"></select></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
        '<div class="form-group"><label class="form-label">Port</label><input class="form-input" id="f-port" type="number" placeholder="8080"/></div>'+
      '</div>';
  }
}

function onStackChange(){
  var sel=document.getElementById('f-stackId');
  var stackId=sel?sel.value:'';
  var meta=BOILERPLATES.find(function(b){return b.stackId===stackId;});
  if(!meta)return;
  var portsEl=document.getElementById('f-ports-info');
  var fwEl=document.getElementById('f-framework');
  var dirEl=document.getElementById('f-appDir');
  if(portsEl){
    if(meta.isUnified){
      portsEl.innerHTML='Port: <b>'+(extractPort(meta.backendUrl)||'?')+'</b>';
    }else{
      portsEl.innerHTML=
        'Backend port: <b>'+(extractPort(meta.backendUrl)||'?')+'</b> &nbsp;|&nbsp; '+
        'Frontend port: <b>'+(extractPort(meta.frontendUrl)||'?')+'</b> &nbsp;&mdash;&nbsp; '+
        'one Gitea repo for both';
    }
  }
  if(fwEl)fwEl.value=meta.frameworkId||'';
  if(dirEl)dirEl.value=meta.appDir||'';
}

function selectLang(lang){
  selectedLang=lang;
  document.querySelectorAll('.lang-card').forEach(function(el){el.classList.remove('selected');});
  var card=document.getElementById('lang-'+lang.replace(/[^a-z]/gi,'-'));
  if(card)card.classList.add('selected');
  var fwGroup=document.getElementById('fw-group');
  var fwSel=document.getElementById('f-frameworkId');
  var portEl=document.getElementById('f-port');
  if(fwSel){
    fwSel.innerHTML=(LANGUAGE_MAP[lang]||[]).map(function(f){return '<option value="'+escHtml(f.id)+'">'+escHtml(f.label)+'</option>';}).join('');
  }
  if(fwGroup)fwGroup.style.display='';
  if(portEl)portEl.value=String(DEFAULT_PORTS[lang]||8080);
}

async function submitNewApp(){
  var appName=(document.getElementById('f-appName')||{}).value||'';
  if(!appName){alert('App name is required');return;}
  if(!/^[a-z0-9-]+$/.test(appName)){alert('App name must be lowercase letters, numbers, hyphens only');return;}

  var body={mode:currentMode,appName:appName};
  var portEl=document.getElementById('f-port');
  if(portEl&&portEl.value)body.port=parseInt(portEl.value,10);

  if(currentMode==='boilerplate'){
    var stackSel=document.getElementById('f-stackId');
    body.stackId=stackSel?stackSel.value:'';
  } else if(currentMode==='git-url'){
    var urlEl=document.getElementById('f-gitUrl');
    body.gitUrl=urlEl?urlEl.value:'';
    if(!body.gitUrl){alert('Git URL is required');return;}
  } else {
    if(!selectedLang){alert('Please select a language');return;}
    var fwSel=document.getElementById('f-frameworkId');
    var LANG_CODE_MAP={'Node.js':'nodejs','Go':'go','Python':'python','Java':'java','Rust':'rust','Kotlin':'kotlin'};
    body.language=LANG_CODE_MAP[selectedLang]||selectedLang.toLowerCase();
    body.frameworkId=fwSel?fwSel.value:'';
  }

  var submitBtn=document.getElementById('submit-btn');
  if(submitBtn)submitBtn.disabled=true;

  var r=await fetch('/api/apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).catch(function(e){return{error:e.message};});
  if(r.error){alert('Error: '+r.error);if(submitBtn)submitBtn.disabled=false;return;}

  closeNewAppModal();
  openProgressModal(appName,r.jobId);
}

// ---------------------------------------------------------------------------
// Progress modal (polls /api/apps/jobs/:jobId)
// ---------------------------------------------------------------------------
var progressTimer=null;

function openProgressModal(appName,jobId){
  var ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.id='progress-overlay';
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">Creating '+escHtml(appName)+'...</span>'+
      '<button class="modal-close" onclick="closeProgressModal()">\u00d7</button>'+
    '</div>'+
    '<div class="modal-body" id="progress-body"><p style="color:#8b949e">Starting...</p></div>'+
  '</div>';
  document.body.appendChild(ov);
  pollJob(appName,jobId);
}

function closeProgressModal(){
  var o=document.getElementById('progress-overlay');if(o)o.remove();
  if(progressTimer)clearTimeout(progressTimer);
}

function stepIcon(status){
  if(status==='done')return'<span style="color:#3fb950">\u2713</span>';
  if(status==='running')return'<span style="color:#e3b341">\u23f3</span>';
  if(status==='failed')return'<span style="color:#f85149">\u2717</span>';
  return'<span style="color:#484f58">\u25cb</span>';
}

async function pollJob(appName,jobId){
  var r=await fetch('/api/apps/jobs/'+encodeURIComponent(jobId)).then(function(r){return r.json();}).catch(function(){return null;});
  if(!r){progressTimer=setTimeout(function(){pollJob(appName,jobId);},2000);return;}
  var body=document.getElementById('progress-body');
  if(!body)return;
  var stepsHtml=(r.steps||[]).map(function(s){
    return '<div class="progress-step">'+stepIcon(s.status)+'<span class="step-label">'+escHtml(s.label)+'</span>'+(s.message?'<span class="step-msg">'+escHtml(s.message)+'</span>':'')+'</div>';
  }).join('');
  if(r.status==='done'){
    body.innerHTML=stepsHtml+'<div style="margin-top:16px;color:#3fb950;font-weight:700">\u2713 App created successfully</div>'+
      '<div style="margin-top:16px;text-align:right"><button class="btn-primary" onclick="closeProgressModal();loadApps()">Done</button></div>';
  } else if(r.status==='failed'){
    body.innerHTML=stepsHtml+'<div style="margin-top:12px;color:#f85149">\u2717 Failed: '+escHtml(r.error||'Unknown error')+'</div>'+
      '<div style="margin-top:16px;text-align:right"><button class="btn-cancel" onclick="closeProgressModal()">Close</button></div>';
  } else {
    body.innerHTML=stepsHtml;
    progressTimer=setTimeout(function(){pollJob(appName,jobId);},2000);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
loadApps();
setInterval(loadApps,15000);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// App Detail page (/apps/:name) — 4 tabs: Overview | Git | Deploy | Logs
// ---------------------------------------------------------------------------

export function generateAppDetailHtml(appName: string, opts?: { zoneName?: string; tunnelId?: string }): string {
  const esc = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet \u2014 ${esc(appName)}</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#f5a623;font-size:18px;display:flex;align-items:center;gap:10px;margin-bottom:2px}
.subtitle{color:#8b949e;font-size:12px;margin-bottom:20px}
.header-row{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
.nav-link{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px;font-family:inherit}
.nav-link:hover{background:#21262d}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}.stopped{background:#3d1f1f;color:#f85149}
.tabs{display:flex;border-bottom:1px solid #30363d;margin-bottom:20px}
.tab{padding:8px 18px;cursor:pointer;color:#8b949e;font-size:13px;background:none;border:none;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:#c9d1d9}.tab.active{color:#f5a623;border-bottom-color:#f5a623}
.tab-panel{display:none}.tab-panel.active{display:block}
.section{margin-bottom:20px}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #21262d;font-size:13px}
.info-key{color:#8b949e;min-width:120px}.info-val{color:#c9d1d9;font-family:monospace;word-break:break-all}
.btn{padding:4px 12px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent;margin-left:6px}
.btn-primary{background:#f5a623;color:#0d1117;border-color:#f5a623;font-weight:700}
.btn-primary:hover{background:#e09420}
.btn-stop{border-color:#f85149;color:#f85149}.btn-stop:hover{background:#3d1f1f}
.btn-start{border-color:#3fb950;color:#3fb950}.btn-start:hover{background:#1a4731}
.btn-default{border-color:#30363d;color:#8b949e}.btn-default:hover{background:#21262d}
.code-block{position:relative;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap;word-break:break-all;margin-bottom:8px}
.copy-btn{position:absolute;top:8px;right:8px;padding:2px 8px;border:1px solid #30363d;border-radius:4px;cursor:pointer;background:#0d1117;color:#8b949e;font-size:11px;font-family:inherit}
.copy-btn:hover{background:#21262d;color:#c9d1d9}
.history-row{display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #21262d;font-size:12px}
.history-hash{color:#58a6ff;font-family:monospace}.history-msg{flex:1;color:#c9d1d9}.history-time{color:#8b949e;white-space:nowrap}
.toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.toggle{position:relative;display:inline-block;width:38px;height:20px}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#30363d;border-radius:20px;transition:.2s}
.slider:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background:#c9d1d9;border-radius:50%;transition:.2s}
input:checked+.slider{background:#f5a623}
input:checked+.slider:before{transform:translateX(18px)}
#log-output{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:12px;height:420px;overflow-y:auto;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap}
.log-err{color:#f85149}.log-warn{color:#e3b341}
a.ext{color:#58a6ff;text-decoration:none}a.ext:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="header-row">
  <div>
    <h1 id="app-name">${esc(appName)} <span id="app-badge" class="badge stopped">loading</span></h1>
    <div class="subtitle" id="app-subtitle">loading...</div>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
    <a href="/apps" class="nav-link">\u2190 Apps</a>
    <button class="btn btn-default" id="btn-open" onclick="openApp()" style="display:none">Open \u2192</button>
    <button class="btn btn-stop" id="btn-stop" onclick="doStop()" style="display:none">Stop</button>
    <button class="btn btn-start" id="btn-start" onclick="doStart()" style="display:none">Start</button>
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('overview')" id="tabn-overview">Overview</button>
  <button class="tab" onclick="switchTab('git')" id="tabn-git">Git</button>
  <button class="tab" onclick="switchTab('deploy')" id="tabn-deploy">Deploy</button>
  <button class="tab" onclick="switchTab('logs')" id="tabn-logs">Logs</button>
  <button class="tab" onclick="switchTab('domain')" id="tabn-domain">Domain</button>
</div>

<!-- OVERVIEW -->
<div id="tab-overview" class="tab-panel active">
  <div class="section">
    <div class="section-title">App Info</div>
    <div class="info-row"><span class="info-key">Name</span><span class="info-val">${esc(appName)}</span></div>
    <div class="info-row"><span class="info-key">Mode</span><span class="info-val" id="ov-mode">\u2014</span></div>
    <div class="info-row"><span class="info-key">Stack</span><span class="info-val" id="ov-stack">\u2014</span></div>
    <div class="info-row"><span class="info-key">Port</span><span class="info-val" id="ov-port">\u2014</span></div>
    <div class="info-row"><span class="info-key">Status</span><span class="info-val" id="ov-status">\u2014</span></div>
    <div class="info-row"><span class="info-key">Local URL</span><span class="info-val" id="ov-url">\u2014</span></div>
    <div class="info-row"><span class="info-key">Created</span><span class="info-val" id="ov-created">\u2014</span></div>
  </div>
</div>

<!-- GIT -->
<div id="tab-git" class="tab-panel">
  <div class="section">
    <div class="section-title">Repository</div>
    <div class="info-row"><span class="info-key">Gitea URL</span><span class="info-val" id="git-url">\u2014</span></div>
    <div class="info-row"><span class="info-key">Branch</span><span class="info-val" id="git-branch">\u2014</span></div>
    <div class="info-row"><span class="info-key">Latest Commit</span><span class="info-val" id="git-commit">\u2014</span></div>
  </div>
  <div class="section">
    <div class="section-title">Clone (HTTP)</div>
    <div class="code-block" id="git-clone-http">loading...<button class="copy-btn" onclick="copyEl('git-clone-http')">Copy</button></div>
  </div>
  <div class="section">
    <div class="section-title">Clone (SSH)</div>
    <div class="code-block" id="git-clone-ssh">loading...<button class="copy-btn" onclick="copyEl('git-clone-ssh')">Copy</button></div>
  </div>
  <div class="section">
    <div class="section-title">Local Path</div>
    <div class="code-block" id="git-local-path">\u2014</div>
  </div>
  <div class="section">
    <div class="section-title">Quick Setup (run on your dev machine)</div>
    <div class="code-block" id="git-setup-cmds">loading...<button class="copy-btn" onclick="copyEl('git-setup-cmds')">Copy</button></div>
  </div>
</div>

<!-- DEPLOY -->
<div id="tab-deploy" class="tab-panel">
  <div class="section">
    <div class="section-title">Deploy Settings</div>
    <div class="toggle-row">
      <label class="toggle"><input type="checkbox" id="auto-deploy-toggle" onchange="saveSettings()"/><span class="slider"></span></label>
      <span style="font-size:13px">Auto Deploy (on git push to branch)</span>
    </div>
    <div class="info-row" style="margin-bottom:14px">
      <span class="info-key">Deploy Branch</span>
      <input id="deploy-branch-input" value="main" style="background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:160px" onchange="saveSettings()"/>
    </div>
    <button class="btn btn-primary" onclick="triggerDeploy()">Deploy Now</button>
    <span id="deploy-msg" style="margin-left:12px;font-size:12px;color:#8b949e"></span>
  </div>
  <div class="section" style="margin-top:20px">
    <div class="section-title">Deploy History</div>
    <div id="deploy-history"><span style="color:#8b949e;font-size:12px">Loading...</span></div>
  </div>
</div>

<!-- LOGS -->
<div id="tab-logs" class="tab-panel">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <span style="font-size:12px;color:#8b949e">Live container logs</span>
    <button class="btn btn-default" onclick="startLogs()" style="font-size:11px">Reconnect</button>
    <button class="btn btn-default" onclick="document.getElementById('log-output').innerHTML=''" style="font-size:11px">Clear</button>
  </div>
  <div id="log-output"></div>
</div>

<!-- DOMAIN -->
<div id="tab-domain" class="tab-panel">
  <div class="section">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      External Domain
      <span style="display:flex;gap:6px;align-items:center">
        <input id="dom-pw" type="password" placeholder="Admin password"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:4px 8px;
                 color:#c9d1d9;font-family:inherit;font-size:11px;width:140px"/>
        <button class="btn btn-default" onclick="loadDomain()" style="font-size:11px">Refresh</button>
      </span>
    </div>
    <div id="dom-status" style="padding:8px 0;font-size:13px;color:#8b949e">
      Enter admin password and click Refresh to check domain status.
    </div>
  </div>

  <!-- Connected state (shown when domain is connected) -->
  <div id="dom-connected-section" style="display:none">
    <div class="section">
      <div class="section-title">Connection</div>
      <div class="info-row">
        <span class="info-key">External URL</span>
        <span class="info-val" id="dom-ext-url">\u2014</span>
      </div>
      <div class="info-row">
        <span class="info-key">Connected</span>
        <span class="info-val" id="dom-connected-at">\u2014</span>
      </div>
      <button class="btn btn-stop" style="margin-top:12px" onclick="disconnectAppDomain()">Disconnect</button>
    </div>
  </div>

  <!-- Connect form (shown when no domain connected) -->
  <div id="dom-form-section" style="display:none">
    <div class="section">
      <div class="section-title">Connect Domain</div>
      <div class="info-row" style="margin-bottom:8px">
        <span class="info-key">Subdomain</span>
        <input id="dom-sub" type="text" placeholder="${esc(appName)}"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;
                 color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:200px"/>
      </div>
      <div class="info-row" style="margin-bottom:12px">
        <span class="info-key">Domain</span>
        <input id="dom-domain" type="text" placeholder="yourdomain.com"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;
                 color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:200px"/>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="connectAppDomain()">Connect</button>
        <button class="btn btn-default" style="font-size:11px" onclick="toggleCnameGuide()">CNAME Guide</button>
      </div>
      <div id="dom-steps" style="margin-top:12px;font-size:12px;color:#8b949e"></div>
    </div>

    <!-- CNAME Guide (collapsible) -->
    <div id="dom-cname-guide" style="display:none">
      <div class="section">
        <div class="section-title">CNAME Setup (Scenario C \u2014 NS \uc774\uc804 \ubd88\uac00)</div>
        <div class="code-block" id="dom-cname-val">
          \u2014 (tunnelId \ud544\uc694, admin CNAME Guide \ucc38\uc870)
        </div>
        <div style="font-size:12px;color:#8b949e;margin-top:8px">
          \uc704 CNAME \uac12\uc744 DNS \uc81c\uacf5\uc790(GoDaddy, Namecheap, \uac00\ube44\uc544 \ub4f1)\uc5d0\uc11c
          <code style="color:#f5a623">{subdomain}</code> \u2192 CNAME \u2192 <code style="color:#f5a623">{tunnelId}.cfargotunnel.com</code> \uc73c\ub85c \ub4f1\ub85d\ud558\uc138\uc694.
        </div>
      </div>
    </div>
  </div>
</div>

<script>
var APP=${JSON.stringify(appName)};
var DOMAIN_HINT=${JSON.stringify({ zoneName: opts?.zoneName ?? '', tunnelId: opts?.tunnelId ?? '' })};
var appData=null;
var gitData=null;
var logSrc=null;
var activeTab='overview';
var gitLoaded=false;
var domainLoaded=false;
var domainData=null;

function switchTab(tab){
  activeTab=tab;
  ['overview','git','deploy','logs','domain'].forEach(function(t){
    document.getElementById('tabn-'+t).className='tab'+(t===tab?' active':'');
    document.getElementById('tab-'+t).className='tab-panel'+(t===tab?' active':'');
  });
  if(tab==='git'&&!gitLoaded)loadGit();
  if(tab==='deploy'){loadSettings();loadHistory();}
  if(tab==='logs'&&!logSrc)startLogs();
  if(tab==='domain'&&!domainLoaded)loadDomain();
}

function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function loadApp(){
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return null;});
  if(!r||!r.app){document.getElementById('app-subtitle').textContent='App not found';return;}
  appData=r.app;var a=r.app;
  var badge=document.getElementById('app-badge');
  badge.textContent=a.status;badge.className='badge '+(a.status==='running'?'running':'stopped');
  document.getElementById('app-subtitle').textContent=(a.lang||'')+(a.framework?' \u00b7 '+a.framework:'')+(a.port?' \u00b7 Port '+a.port:'');
  document.getElementById('ov-mode').textContent=a.mode||'\u2014';
  document.getElementById('ov-stack').textContent=a.stackId||a.sourceUrl||'\u2014';
  document.getElementById('ov-port').textContent=a.port||'\u2014';
  document.getElementById('ov-status').textContent=a.status||'\u2014';
  var lu=a.port?'http://localhost:'+a.port:'';
  document.getElementById('ov-url').innerHTML=lu?'<a class="ext" href="'+lu+'" target="_blank">'+lu+'</a>':'\u2014';
  document.getElementById('ov-created').textContent=(a.createdAt||'\u2014').replace('T',' ').slice(0,16);
  document.getElementById('btn-open').style.display=lu?'':'none';
  document.getElementById('btn-stop').style.display=a.status==='running'?'':'none';
  document.getElementById('btn-start').style.display=a.status!=='running'?'':'none';
}
function openApp(){if(appData&&appData.port)window.open('http://localhost:'+appData.port,'_blank');}
async function doStop(){await fetch('/api/apps/'+encodeURIComponent(APP)+'/stop',{method:'POST'});loadApp();}
async function doStart(){await fetch('/api/apps/'+encodeURIComponent(APP)+'/start',{method:'POST'});loadApp();}

async function loadGit(){
  gitLoaded=true;
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/git').then(function(r){return r.json();}).catch(function(){return null;});
  if(!r||!r.git){document.getElementById('git-url').textContent='Gitea not available';return;}
  gitData=r.git;var g=r.git;
  document.getElementById('git-url').innerHTML='<a class="ext" href="'+escH(g.giteaUrl)+'" target="_blank">'+escH(g.giteaUrl)+' [Open]</a>';
  document.getElementById('git-branch').textContent=g.branch||'main';
  var c=g.latestCommit;
  document.getElementById('git-commit').textContent=c?(c.shortHash+' \u2014 '+c.message):'(empty repo)';
  setText('git-clone-http','git clone '+g.cloneUrlHttp);
  setText('git-clone-ssh','git clone '+g.cloneUrlSsh);
  setText('git-local-path',g.localPath);
  setText('git-setup-cmds','git remote add brewnet '+g.cloneUrlHttp+'\\ngit push brewnet '+(g.branch||'main'));
}
function setText(id,val){
  var el=document.getElementById(id);if(!el)return;
  var btn=el.querySelector('.copy-btn');
  var html=escH(val);
  el.innerHTML=html+(btn?'<button class="copy-btn" onclick="copyEl(\''+id+'\')">Copy</button>':'');
}
function copyEl(id){
  var el=document.getElementById(id);if(!el)return;
  var txt=el.textContent||el.innerText;
  navigator.clipboard.writeText(txt.replace(/Copy$/,'').trim());
  var btn=el.querySelector('.copy-btn');
  if(btn){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy';},1500);}
}

async function loadSettings(){
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy/settings').then(function(r){return r.json();}).catch(function(){return null;});
  if(!r)return;
  document.getElementById('auto-deploy-toggle').checked=!!r.autoDeploy;
  document.getElementById('deploy-branch-input').value=r.deployBranch||'main';
}
async function saveSettings(){
  var ad=document.getElementById('auto-deploy-toggle').checked;
  var br=(document.getElementById('deploy-branch-input').value||'main').trim();
  await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({autoDeploy:ad,deployBranch:br})});
}
async function triggerDeploy(){
  var msg=document.getElementById('deploy-msg');msg.textContent='Deploying...';
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy',{method:'POST'}).then(function(r){return r.json();}).catch(function(e){return{error:e.message};});
  if(r.error){msg.textContent='Error: '+r.error;return;}
  msg.textContent='Job '+r.jobId+' started...';
  var t=setInterval(async function(){
    var jr=await fetch('/api/apps/jobs/'+encodeURIComponent(r.jobId)).then(function(r){return r.json();}).catch(function(){return null;});
    if(!jr)return;
    if(jr.status==='done'){clearInterval(t);msg.textContent='\u2713 Deploy successful';loadHistory();loadApp();}
    else if(jr.status==='failed'){clearInterval(t);msg.textContent='\u2717 Failed: '+(jr.error||'');loadHistory();}
  },2000);
}
async function loadHistory(){
  var r=await fetch('/api/deploy/history?app='+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return{history:[]};});
  var entries=(r.history||[]).slice().reverse();
  var div=document.getElementById('deploy-history');
  if(!entries.length){div.innerHTML='<span style="color:#8b949e;font-size:12px">No deployments yet.</span>';return;}
  div.innerHTML=entries.map(function(e){
    var icon=e.status==='success'?'<span style="color:#3fb950">\u2705</span>':'<span style="color:#f85149">\u274c</span>';
    var t=(e.deployedAt||'').replace('T',' ').slice(0,16);
    return '<div class="history-row">'+icon+'<span class="history-hash">'+(e.commitHash?e.commitHash.slice(0,7):'\u2014')+'</span><span class="history-msg">'+escH(e.commitMessage||'deploy')+'</span><span class="history-time">'+t+'</span></div>';
  }).join('');
}

function startLogs(){
  if(logSrc)logSrc.close();
  var out=document.getElementById('log-output');
  out.innerHTML='<span style="color:#8b949e">Connecting...</span>\\n';
  logSrc=new EventSource('/api/apps/'+encodeURIComponent(APP)+'/logs');
  logSrc.onmessage=function(e){
    var div=document.createElement('div');
    div.className=/error|fatal/i.test(e.data)?'log-err':/warn/i.test(e.data)?'log-warn':'';
    div.textContent=e.data;out.appendChild(div);out.scrollTop=out.scrollHeight;
  };
  logSrc.onerror=function(){
    var div=document.createElement('div');div.textContent='[stream ended]';div.style.color='#8b949e';out.appendChild(div);
    logSrc=null;
  };
}

// ── Domain tab functions ──
function domainFetch(url,opts){
  var pw=document.getElementById('dom-pw').value||'';
  var h=Object.assign({'Content-Type':'application/json','X-Admin-Password':pw},(opts&&opts.headers)||{});
  return fetch(url,Object.assign({},opts,{headers:h}));
}
async function loadDomain(){
  domainLoaded=true;
  var statusEl=document.getElementById('dom-status');
  var connectedSec=document.getElementById('dom-connected-section');
  var formSec=document.getElementById('dom-form-section');
  statusEl.textContent='Loading...';
  var r=await domainFetch('/api/domain/status/'+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return null;});
  if(!r){statusEl.textContent='Failed to load \u2014 check admin password.';return;}
  if(r.message&&(r.message.includes('Unauthorized')||r.message.includes('nauthorized'))){
    statusEl.textContent='Unauthorized \u2014 check admin password.';return;
  }
  var ext=r.external||{};
  if(ext.connected){
    statusEl.textContent='';
    connectedSec.style.display='';formSec.style.display='none';
    var url='https://'+(ext.hostname||'');
    document.getElementById('dom-ext-url').innerHTML='<a class="ext" href="'+url+'" target="_blank">'+url+'</a>';
    document.getElementById('dom-connected-at').textContent=(ext.connectedAt||'\u2014').replace('T',' ').slice(0,16);
  }else{
    statusEl.textContent='No external domain connected.';
    connectedSec.style.display='none';formSec.style.display='';
    document.getElementById('dom-sub').value=APP;
    if(DOMAIN_HINT.zoneName)document.getElementById('dom-domain').value=DOMAIN_HINT.zoneName;
    if(DOMAIN_HINT.tunnelId){
      document.getElementById('dom-cname-val').textContent=DOMAIN_HINT.tunnelId+'.cfargotunnel.com';
    }
  }
}
async function connectAppDomain(){
  var sub=document.getElementById('dom-sub').value.trim();
  var dom=document.getElementById('dom-domain').value.trim();
  var stepsDiv=document.getElementById('dom-steps');
  if(!sub||!dom){stepsDiv.textContent='Subdomain and domain are required.';return;}
  stepsDiv.innerHTML='<span style="color:#e3b341">\u23f3 Connecting...</span>';
  try{
    var r=await domainFetch('/api/domain/connect',{method:'POST',body:JSON.stringify({appName:APP,subdomain:sub,domain:dom})});
    var d=await r.json();
    if(d.success){
      var html=(d.steps||[]).map(function(s){return '<div>'+(s.status==='completed'?'\u2705':'\u274c')+' '+escH(s.step)+'</div>';}).join('');
      stepsDiv.innerHTML=html+'<div style="color:#3fb950;margin-top:8px">\u2705 '+escH(d.externalUrl)+' is live!</div>';
      setTimeout(function(){domainLoaded=false;loadDomain();},1500);
    }else{
      stepsDiv.innerHTML='<span style="color:#f85149">\u274c '+escH(d.message||d.error||'Unknown error')+'</span>';
    }
  }catch(e){stepsDiv.innerHTML='<span style="color:#f85149">Error: '+escH(e.message)+'</span>';}
}
async function disconnectAppDomain(){
  if(!confirm('Disconnect '+APP+' from external domain?'))return;
  var r=await domainFetch('/api/domain/disconnect/'+encodeURIComponent(APP),{method:'DELETE'});
  var d=await r.json();
  if(d.success){domainLoaded=false;loadDomain();}
  else{alert('Disconnect failed: '+(d.message||d.error||'Unknown error'));}
}
function toggleCnameGuide(){
  var g=document.getElementById('dom-cname-guide');
  g.style.display=g.style.display==='none'?'':'none';
}

loadApp();setInterval(loadApp,15000);
</script>
</body>
</html>`;
}
