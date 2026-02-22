/**
 * Brewnet CLI Demo — Wizard State Management (v4)
 * 7 server components + Admin + FreeDomain + Cloudflare Tunnel + SSH/SFTP + Mail
 */

const STORAGE_KEY = 'brewnet_wizard_state';

const DEFAULT_STATE = {
  schemaVersion: 4,
  projectName: 'my-homeserver',
  projectPath: '~/brewnet/my-homeserver',
  setupType: 'full', // 'full' | 'partial'

  // Step 2: Server Components + Admin Account
  admin: {
    username: 'admin',
    password: '',          // auto-generated on first load
    storage: 'local',      // 'local' (SQLite .env) — vault planned for future
  },

  servers: {
    fileServer: { enabled: false, service: '' },
    webServer: { enabled: true, service: 'traefik' },
    appServer: { enabled: false },
    dbServer: {
      enabled: false,
      primary: '',
      primaryVersion: '',
      dbName: 'brewnet_db',
      dbUser: 'brewnet',
      dbPassword: '',
      adminUI: true,
      cache: '',
    },
    media: { enabled: false, services: [] },
    sshServer: {
      enabled: false,
      port: 2222,
      passwordAuth: false,   // key-only by default
      sftp: false,           // SFTP subsystem — auto-suggested if fileServer/media enabled
    },
    mailServer: {
      enabled: false,
      service: 'docker-mailserver', // 'docker-mailserver'
    },
  },

  // Step 3: Runtime & Boilerplate
  devStack: { language: '', framework: '' },
  boilerplate: { generate: true, sampleData: true, devMode: 'hot-reload' },

  // Step 4: Domain & Network
  domain: {
    provider: 'local',      // 'local' | 'freedomain' | 'custom'
    freeDomainTld: '.dpdns.org',
    name: 'brewnet.local',
    ssl: 'none',            // 'none' | 'self-signed' | 'letsencrypt' | 'cloudflare'
    cloudflare: {
      enabled: false,       // auto-enabled when provider is 'freedomain' or 'custom'
      tunnelToken: '',
      tunnelName: '',
    },
  },
};

const WizardState = {
  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(stored);
      // Schema migration: reset if old format
      if (!parsed.schemaVersion || parsed.schemaVersion < 4) {
        this.reset();
        return structuredClone(DEFAULT_STATE);
      }
      return parsed;
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  },

  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
  },

  update(partial) {
    const state = this.load();
    Object.assign(state, partial);
    this.save(state);
    return state;
  },

  updateNested(key, partial) {
    const state = this.load();
    if (state[key] && typeof state[key] === 'object') {
      Object.assign(state[key], partial);
    }
    this.save(state);
    return state;
  },

  updateDeep(key, subKey, partial) {
    const state = this.load();
    if (state[key] && state[key][subKey] && typeof state[key][subKey] === 'object') {
      Object.assign(state[key][subKey], partial);
    }
    this.save(state);
    return state;
  },
};

/* ─── Service Registry (3 categories) ─── */
const SERVICE_REGISTRY = {
  fileServer: [
    { id: 'nextcloud', name: 'Nextcloud', desc: 'Full cloud suite (files, calendar, contacts)', license: 'AGPL-3.0', port: 443, subdomain: 'cloud', recommended: true },
    { id: 'minio', name: 'MinIO', desc: 'S3-compatible object storage', license: 'AGPL-3.0', port: 9000, subdomain: 'minio' },
  ],
  webServer: [
    { id: 'traefik', name: 'Traefik', desc: 'Cloud-native reverse proxy with auto-discovery', license: 'MIT', port: 80, subdomain: 'traefik', recommended: true },
    { id: 'nginx', name: 'Nginx', desc: 'High performance reverse proxy', license: 'BSD-2', port: 80, subdomain: 'nginx' },
    { id: 'caddy', name: 'Caddy', desc: 'Automatic HTTPS reverse proxy', license: 'Apache-2.0', port: 80, subdomain: 'caddy' },
  ],
  media: [
    { id: 'jellyfin', name: 'Jellyfin', desc: 'Media streaming server (movies, TV, music)', license: 'GPL-2.0', port: 8096, subdomain: 'jellyfin' },
  ],
};

const CATEGORY_LABELS = {
  fileServer: 'File Server',
  webServer: 'Web Server (Reverse Proxy)',
  media: 'Media Server',
};

/* ─── Free Domain Providers ─── */
const FREE_DOMAIN_PROVIDERS = [
  { tld: '.dpdns.org', name: 'DigitalPlat (.dpdns.org)', recommended: true, desc: 'Most stable, recommended' },
  { tld: '.qzz.io', name: 'DigitalPlat (.qzz.io)', desc: 'Short extension' },
  { tld: '.us.kg', name: 'DigitalPlat (.us.kg)', desc: 'Requires GitHub account approval' },
];

/* ─── Framework Registry ─── */
const FRAMEWORK_REGISTRY = {
  python: [
    { id: 'fastapi', name: 'FastAPI', desc: 'Modern async API framework', license: 'MIT', port: 8000 },
    { id: 'django', name: 'Django', desc: 'Full-featured web framework', license: 'BSD-3', port: 8000 },
    { id: 'flask', name: 'Flask', desc: 'Lightweight micro framework', license: 'BSD-3', port: 5000 },
  ],
  nodejs: [
    { id: 'nextjs', name: 'Next.js', desc: 'React full-stack framework', license: 'MIT', port: 3000 },
    { id: 'express', name: 'Express', desc: 'Minimal web framework', license: 'MIT', port: 3000 },
    { id: 'nestjs', name: 'NestJS', desc: 'Enterprise Node.js framework', license: 'MIT', port: 3000 },
    { id: 'fastify', name: 'Fastify', desc: 'Fast web framework', license: 'MIT', port: 3000 },
  ],
  java: [
    { id: 'spring', name: 'Spring Boot', desc: 'Enterprise Java framework', license: 'Apache-2.0', port: 8080 },
    { id: 'quarkus', name: 'Quarkus', desc: 'Cloud-native Java', license: 'Apache-2.0', port: 8080 },
    { id: 'micronaut', name: 'Micronaut', desc: 'Lightweight framework', license: 'Apache-2.0', port: 8080 },
  ],
  rust: [
    { id: 'actix', name: 'Actix Web', desc: 'High performance', license: 'MIT', port: 8080 },
    { id: 'axum', name: 'Axum', desc: 'Ergonomic framework', license: 'MIT', port: 8080 },
  ],
  go: [
    { id: 'gin', name: 'Gin', desc: 'HTTP web framework', license: 'MIT', port: 8080 },
    { id: 'echo', name: 'Echo', desc: 'High performance framework', license: 'MIT', port: 8080 },
    { id: 'fiber', name: 'Fiber', desc: 'Express-inspired framework', license: 'MIT', port: 8080 },
  ],
};

const LANGUAGE_LABELS = {
  python: 'Python 3.12',
  nodejs: 'Node.js 20 LTS',
  java: 'Java 21 (Eclipse Temurin)',
  rust: 'Rust (latest)',
  go: 'Go 1.22',
};

/* ─── Database Registry (2 categories) ─── */
const DATABASE_REGISTRY = {
  primary: [
    { id: 'postgresql', name: 'PostgreSQL', license: 'PostgreSQL License', versions: ['17', '16', '15'], recommended: true },
    { id: 'mysql', name: 'MySQL', license: 'GPL-2.0', versions: ['8.4', '8.0'] },
    { id: 'mariadb', name: 'MariaDB', license: 'GPL-2.0', versions: ['11', '10.11'] },
    { id: 'sqlite', name: 'SQLite', license: 'Public Domain', versions: ['3'] },
  ],
  cache: [
    { id: 'redis', name: 'Redis', license: 'BSD-3', recommended: true },
    { id: 'valkey', name: 'Valkey', license: 'BSD-3' },
    { id: 'keydb', name: 'KeyDB', license: 'BSD-3' },
  ],
};

/* ─── Resource Estimates (MB / GB) ─── */
const RESOURCE_ESTIMATES = {
  // Web Server
  traefik: { ram: 45, disk: 0.1 },
  caddy: { ram: 30, disk: 0.1 },
  nginx: { ram: 20, disk: 0.1 },
  // File Server
  nextcloud: { ram: 256, disk: 0.5 },
  minio: { ram: 256, disk: 0.5 },
  // Media
  jellyfin: { ram: 256, disk: 0.5 },
  // Database
  postgresql: { ram: 120, disk: 0.5 },
  mysql: { ram: 256, disk: 0.5 },
  mariadb: { ram: 200, disk: 0.5 },
  sqlite: { ram: 0, disk: 0.01 },
  redis: { ram: 12, disk: 0.1 },
  keydb: { ram: 16, disk: 0.1 },
  valkey: { ram: 12, disk: 0.1 },
  pgadmin: { ram: 128, disk: 0.2 },
  // App
  app: { ram: 85, disk: 0.2 },
  // SSH Server
  'openssh-server': { ram: 16, disk: 0.05 },
  // Mail Server
  'docker-mailserver': { ram: 256, disk: 0.5 },
  // Cloudflare Tunnel
  cloudflared: { ram: 32, disk: 0.05 },
};

/* ─── Utility: generate random password ─── */
function generatePassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pw = '';
  for (let i = 0; i < len; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

/* ─── Utility: count total containers ─── */
function countSelectedServices(state) {
  const s = state.servers;
  let count = 1; // web server always included
  if (s.fileServer.enabled && s.fileServer.service) count++;
  if (s.appServer.enabled && state.devStack.framework) count++;
  if (s.dbServer.enabled && s.dbServer.primary && s.dbServer.primary !== 'sqlite') count++;
  if (s.dbServer.enabled && s.dbServer.adminUI && s.dbServer.primary && s.dbServer.primary !== 'sqlite') count++;
  if (s.dbServer.enabled && s.dbServer.cache) count++;
  if (s.media.enabled) count += (s.media.services || []).length;
  if (s.sshServer && s.sshServer.enabled) count++;
  if (s.mailServer && s.mailServer.enabled) count++;
  return count;
}

/* ─── Utility: estimate resources ─── */
function estimateResources(state) {
  let ram = 0, disk = 0, containers = 0;
  const s = state.servers;

  // Web Server (always)
  const proxy = s.webServer.service || 'traefik';
  ram += (RESOURCE_ESTIMATES[proxy] || {}).ram || 40;
  disk += (RESOURCE_ESTIMATES[proxy] || {}).disk || 0.1;
  containers++;

  // File Server
  if (s.fileServer.enabled && s.fileServer.service) {
    ram += (RESOURCE_ESTIMATES[s.fileServer.service] || {}).ram || 128;
    disk += (RESOURCE_ESTIMATES[s.fileServer.service] || {}).disk || 0.5;
    containers++;
  }

  // Media
  if (s.media.enabled) {
    for (const svcId of (s.media.services || [])) {
      ram += (RESOURCE_ESTIMATES[svcId] || {}).ram || 128;
      disk += (RESOURCE_ESTIMATES[svcId] || {}).disk || 0.5;
      containers++;
    }
  }

  // Database
  if (s.dbServer.enabled && s.dbServer.primary) {
    if (s.dbServer.primary !== 'sqlite') {
      ram += (RESOURCE_ESTIMATES[s.dbServer.primary] || {}).ram || 120;
      disk += (RESOURCE_ESTIMATES[s.dbServer.primary] || {}).disk || 0.5;
      containers++;
      if (s.dbServer.adminUI) {
        ram += RESOURCE_ESTIMATES.pgadmin.ram;
        disk += RESOURCE_ESTIMATES.pgadmin.disk;
        containers++;
      }
    }
    if (s.dbServer.cache) {
      ram += (RESOURCE_ESTIMATES[s.dbServer.cache] || {}).ram || 12;
      disk += 0.1;
      containers++;
    }
  }

  // App
  if (s.appServer.enabled && state.devStack.framework) {
    ram += RESOURCE_ESTIMATES.app.ram;
    disk += RESOURCE_ESTIMATES.app.disk;
    containers++;
  }

  // SSH Server
  if (s.sshServer && s.sshServer.enabled) {
    ram += RESOURCE_ESTIMATES['openssh-server'].ram;
    disk += RESOURCE_ESTIMATES['openssh-server'].disk;
    containers++;
  }

  // Mail Server
  if (s.mailServer && s.mailServer.enabled) {
    var mailSvc = s.mailServer.service || 'docker-mailserver';
    ram += (RESOURCE_ESTIMATES[mailSvc] || {}).ram || 256;
    disk += (RESOURCE_ESTIMATES[mailSvc] || {}).disk || 0.5;
    containers++;
  }

  // Cloudflare Tunnel
  if (state.domain && state.domain.cloudflare && state.domain.cloudflare.enabled) {
    ram += RESOURCE_ESTIMATES.cloudflared.ram;
    disk += RESOURCE_ESTIMATES.cloudflared.disk;
    containers++;
  }

  return {
    containers,
    ramMB: Math.round(ram),
    ramGB: (ram / 1024).toFixed(1),
    diskGB: disk.toFixed(1),
  };
}

/* ─── Utility: find a service in SERVICE_REGISTRY ─── */
function findService(id) {
  for (const cat of Object.keys(SERVICE_REGISTRY)) {
    const found = SERVICE_REGISTRY[cat].find(function (s) { return s.id === id; });
    if (found) return found;
  }
  return null;
}

/* ─── Utility: find a database in DATABASE_REGISTRY ─── */
function findDatabase(type, id) {
  const list = DATABASE_REGISTRY[type];
  if (!list) return null;
  return list.find(function (d) { return d.id === id; }) || null;
}

/* ─── Utility: find a framework in FRAMEWORK_REGISTRY ─── */
function findFramework(lang, fwId) {
  const list = FRAMEWORK_REGISTRY[lang];
  if (!list) return null;
  return list.find(function (f) { return f.id === fwId; }) || null;
}

/* ─── Navigation: dynamic step flow ─── */
const ALL_WIZARD_STEPS = [
  'step0-system-check.html',
  'step1-project-setup.html',
  'step2-server-components.html',
  'step3-runtime.html',        // conditional: only if appServer enabled
  'step4-domain.html',
  'step5-review.html',
  'step6-generate.html',
  'step7-complete.html',
];

function getActiveSteps() {
  var state = WizardState.load();
  var steps = [];
  for (var i = 0; i < ALL_WIZARD_STEPS.length; i++) {
    var file = ALL_WIZARD_STEPS[i];
    // Skip step3-runtime if App Server is not enabled
    if (file === 'step3-runtime.html' && !state.servers.appServer.enabled) continue;
    steps.push(file);
  }
  return steps;
}

function getStepUrl(step) {
  var steps = getActiveSteps();
  var currentFile = window.location.pathname.split('/').pop();
  var currentIdx = steps.indexOf(currentFile);
  if (currentIdx === -1) return null;
  if (step === 'next' && currentIdx < steps.length - 1) return steps[currentIdx + 1];
  if (step === 'prev' && currentIdx > 0) return steps[currentIdx - 1];
  return null;
}

function navigateNext() {
  var url = getStepUrl('next');
  if (url) window.location.href = url;
}

function navigatePrev() {
  var url = getStepUrl('prev');
  if (url) window.location.href = url;
}

function navigateCancel() {
  if (confirm('Cancel wizard? All selections will be lost.')) {
    WizardState.reset();
    window.location.href = 'index.html';
  }
}

/* ─── Utility: escape HTML ─── */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ─── Utility: collect all service IDs for generation ─── */
function collectAllServices(state) {
  var ids = [];
  var s = state.servers;

  ids.push(s.webServer.service || 'traefik');
  if (s.fileServer.enabled && s.fileServer.service) ids.push(s.fileServer.service);
  if (s.media.enabled) {
    for (var m of (s.media.services || [])) ids.push(m);
  }
  if (s.dbServer.enabled && s.dbServer.primary && s.dbServer.primary !== 'sqlite') {
    ids.push(s.dbServer.primary);
    if (s.dbServer.adminUI) ids.push('pgadmin');
  }
  if (s.dbServer.enabled && s.dbServer.cache) ids.push(s.dbServer.cache);
  if (s.sshServer && s.sshServer.enabled) ids.push('openssh-server');
  if (s.mailServer && s.mailServer.enabled) ids.push(s.mailServer.service || 'docker-mailserver');
  if (state.domain && state.domain.cloudflare && state.domain.cloudflare.enabled) {
    ids.push('cloudflared');
  }

  return ids;
}

/* ─── Utility: list services using admin credentials ─── */
function getCredentialTargets(state) {
  var targets = [];
  var s = state.servers;
  if (s.fileServer.enabled && s.fileServer.service === 'nextcloud') targets.push('Nextcloud');
  if (s.fileServer.enabled && s.fileServer.service === 'minio') targets.push('MinIO');
  if (s.dbServer.enabled && s.dbServer.adminUI && s.dbServer.primary !== 'sqlite') targets.push('pgAdmin');
  if (s.media.enabled && s.media.services.indexOf('jellyfin') !== -1) targets.push('Jellyfin');
  if (s.sshServer && s.sshServer.enabled) targets.push('SSH Server');
  if (s.mailServer && s.mailServer.enabled) targets.push('Mail Server');
  return targets;
}

/* ─── Utility: get Docker image name ─── */
function getImageName(id) {
  var map = {
    traefik: 'traefik:v3.0',
    nginx: 'nginx:1.25-alpine',
    caddy: 'caddy:2-alpine',
    nextcloud: 'nextcloud:29-apache',
    minio: 'minio/minio:latest',
    jellyfin: 'jellyfin/jellyfin:latest',
    postgresql: 'postgres:17-alpine',
    mysql: 'mysql:8.4',
    mariadb: 'mariadb:11',
    redis: 'redis:7-alpine',
    valkey: 'valkey/valkey:7-alpine',
    keydb: 'eqalpha/keydb:latest',
    pgadmin: 'dpage/pgadmin4:latest',
    'openssh-server': 'linuxserver/openssh-server:latest',
    'docker-mailserver': 'ghcr.io/docker-mailserver/docker-mailserver:latest',
    cloudflared: 'cloudflare/cloudflared:latest',
  };
  return map[id] || id + ':latest';
}
