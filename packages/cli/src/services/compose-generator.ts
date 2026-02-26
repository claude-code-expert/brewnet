/**
 * Brewnet CLI — Docker Compose Generator (T066)
 *
 * Pure-function module that transforms a WizardState into a
 * docker-compose.yml configuration object (ComposeConfig) and
 * serializes it to YAML using js-yaml.
 *
 * @module services/compose-generator
 */

import yaml from 'js-yaml';
import type { WizardState } from '@brewnet/shared';
import { SERVICE_REGISTRY } from '../config/services.js';
import type { ServiceDefinition } from '../config/services.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeHealthcheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
}

export interface ComposeService {
  image: string;
  container_name: string;
  restart: 'unless-stopped';
  security_opt: string[];
  networks: string[];
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  labels?: Record<string, string>;
  depends_on?: string[];
  healthcheck?: ComposeHealthcheck;
  command?: string | string[];
}

export interface ComposeConfig {
  services: Record<string, ComposeService>;
  networks: Record<string, { external?: boolean; internal?: boolean }>;
  volumes?: Record<string, null>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_PREFIX = 'brewnet';

// ---------------------------------------------------------------------------
// Volume definitions per service
// ---------------------------------------------------------------------------

function getServiceVolumes(serviceId: string): string[] {
  switch (serviceId) {
    case 'traefik':
      return [
        '/var/run/docker.sock:/var/run/docker.sock:ro',
        `${BREWNET_PREFIX}_traefik_certs:/letsencrypt`,
      ];
    case 'gitea':
      return [`${BREWNET_PREFIX}_gitea_data:/data`];
    case 'postgresql':
      return [`${BREWNET_PREFIX}_postgres_data:/var/lib/postgresql/data`];
    case 'mysql':
      return [`${BREWNET_PREFIX}_mysql_data:/var/lib/mysql`];
    case 'redis':
      return [`${BREWNET_PREFIX}_redis_data:/data`];
    case 'valkey':
      return [`${BREWNET_PREFIX}_valkey_data:/data`];
    case 'keydb':
      return [`${BREWNET_PREFIX}_keydb_data:/data`];
    case 'nextcloud':
      return [
        `${BREWNET_PREFIX}_nextcloud_data:/var/www/html`,
      ];
    case 'minio':
      return [`${BREWNET_PREFIX}_minio_data:/data`];
    case 'jellyfin':
      return [
        `${BREWNET_PREFIX}_jellyfin_config:/config`,
        `${BREWNET_PREFIX}_jellyfin_media:/media`,
      ];
    case 'openssh-server':
      return [`${BREWNET_PREFIX}_ssh_config:/config`];
    case 'docker-mailserver':
      return [
        `${BREWNET_PREFIX}_mail_data:/var/mail`,
        `${BREWNET_PREFIX}_mail_state:/var/mail-state`,
        `${BREWNET_PREFIX}_mail_config:/tmp/docker-mailserver`,
      ];
    case 'pgadmin':
      return [`${BREWNET_PREFIX}_pgadmin_data:/var/lib/pgadmin`];
    case 'filebrowser':
      return [
        `${BREWNET_PREFIX}_filebrowser_data:/srv`,
        `${BREWNET_PREFIX}_filebrowser_db:/database`,
      ];
    case 'cloudflared':
      return [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Healthcheck builders
// ---------------------------------------------------------------------------

function getHealthcheck(serviceId: string, state: WizardState): ComposeHealthcheck | undefined {
  switch (serviceId) {
    case 'postgresql':
      return {
        test: ['CMD-SHELL', `pg_isready -U ${state.servers.dbServer.dbUser || 'brewnet'}`],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      };
    case 'mysql':
      return {
        test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      };
    case 'redis':
    case 'valkey':
    case 'keydb':
      return {
        test: ['CMD', 'redis-cli', 'ping'],
        interval: '10s',
        timeout: '3s',
        retries: 3,
      };
    case 'gitea':
      return {
        test: ['CMD-SHELL', 'curl -fsSL http://localhost:3000/api/healthz || exit 1'],
        interval: '30s',
        timeout: '10s',
        retries: 3,
      };
    case 'traefik':
      return {
        test: ['CMD-SHELL', 'wget --spider -q http://localhost:8080/api/health || exit 1'],
        interval: '30s',
        timeout: '5s',
        retries: 3,
      };
    case 'nextcloud':
      return {
        test: ['CMD-SHELL', 'curl -fsSL http://localhost/status.php || exit 1'],
        interval: '30s',
        timeout: '10s',
        retries: 5,
      };
    case 'jellyfin':
      return {
        test: ['CMD-SHELL', 'curl -fsSL http://localhost:8096/health || exit 1'],
        interval: '30s',
        timeout: '10s',
        retries: 3,
      };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Environment variable builders
// ---------------------------------------------------------------------------

function getPostgresqlEnv(state: WizardState): Record<string, string> {
  const db = state.servers.dbServer;
  return {
    POSTGRES_USER: db.dbUser || 'brewnet',
    POSTGRES_PASSWORD: db.dbPassword || '${DB_PASSWORD}',
    POSTGRES_DB: db.dbName || 'brewnet_db',
  };
}

function getMysqlEnv(state: WizardState): Record<string, string> {
  const db = state.servers.dbServer;
  return {
    MYSQL_ROOT_PASSWORD: db.dbPassword || '${DB_PASSWORD}',
    MYSQL_DATABASE: db.dbName || 'brewnet_db',
    MYSQL_USER: db.dbUser || 'brewnet',
    MYSQL_PASSWORD: db.dbPassword || '${DB_PASSWORD}',
  };
}

function getGiteaEnv(state: WizardState): Record<string, string> {
  const env: Record<string, string> = {
    USER_UID: '1000',
    USER_GID: '1000',
  };

  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    const dbType = state.servers.dbServer.primary === 'postgresql' ? 'postgres' : 'mysql';
    const dbHost = state.servers.dbServer.primary === 'postgresql' ? 'postgresql' : 'mysql';
    const dbPort = state.servers.dbServer.primary === 'postgresql' ? '5432' : '3306';

    env['GITEA__database__DB_TYPE'] = dbType;
    env['GITEA__database__HOST'] = `${dbHost}:${dbPort}`;
    env['GITEA__database__NAME'] = state.servers.dbServer.dbName || 'brewnet_db';
    env['GITEA__database__USER'] = state.servers.dbServer.dbUser || 'brewnet';
    env['GITEA__database__PASSWD'] = state.servers.dbServer.dbPassword || '${DB_PASSWORD}';
  }

  if (state.servers.dbServer.enabled && state.servers.dbServer.cache) {
    const cacheId = state.servers.dbServer.cache;
    env['GITEA__cache__ADAPTER'] = 'redis';
    env['GITEA__cache__HOST'] = `redis://${cacheId}:6379/0`;
  }

  return env;
}

function getNextcloudEnv(state: WizardState): Record<string, string> {
  const env: Record<string, string> = {
    NEXTCLOUD_ADMIN_USER: state.admin.username || 'admin',
    NEXTCLOUD_ADMIN_PASSWORD: state.admin.password || '${ADMIN_PASSWORD}',
    NEXTCLOUD_TRUSTED_DOMAINS: state.domain.name,
  };

  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    if (state.servers.dbServer.primary === 'postgresql') {
      env['POSTGRES_HOST'] = 'postgresql';
      env['POSTGRES_DB'] = state.servers.dbServer.dbName || 'brewnet_db';
      env['POSTGRES_USER'] = state.servers.dbServer.dbUser || 'brewnet';
      env['POSTGRES_PASSWORD'] = state.servers.dbServer.dbPassword || '${DB_PASSWORD}';
    } else if (state.servers.dbServer.primary === 'mysql') {
      env['MYSQL_HOST'] = 'mysql';
      env['MYSQL_DATABASE'] = state.servers.dbServer.dbName || 'brewnet_db';
      env['MYSQL_USER'] = state.servers.dbServer.dbUser || 'brewnet';
      env['MYSQL_PASSWORD'] = state.servers.dbServer.dbPassword || '${DB_PASSWORD}';
    }
  }

  return env;
}

function getMinioEnv(state: WizardState): Record<string, string> {
  return {
    MINIO_ROOT_USER: state.admin.username || 'admin',
    MINIO_ROOT_PASSWORD: state.admin.password || '${ADMIN_PASSWORD}',
  };
}

function getSshEnv(state: WizardState): Record<string, string> {
  return {
    PUID: '1000',
    PGID: '1000',
    TZ: 'UTC',
    PASSWORD_ACCESS: state.servers.sshServer.passwordAuth ? 'true' : 'false',
    USER_NAME: state.admin.username || 'admin',
  };
}

function getMailEnv(state: WizardState): Record<string, string> {
  const env: Record<string, string> = {
    OVERRIDE_HOSTNAME: `mail.${state.domain.name}`,
    ENABLE_CLAMAV: '0',
    ENABLE_FAIL2BAN: '1',
  };

  if (state.servers.mailServer.relayProvider) {
    env['DEFAULT_RELAY_HOST'] = `[${state.servers.mailServer.relayHost}]:${state.servers.mailServer.relayPort}`;
    env['RELAY_USER'] = '${SMTP_RELAY_USER}';
    env['RELAY_PASSWORD'] = '${SMTP_RELAY_PASSWORD}';
  }

  return env;
}

function getPgadminEnv(state: WizardState): Record<string, string> {
  return {
    PGADMIN_DEFAULT_EMAIL: `${state.admin.username || 'admin'}@${state.domain.name}`,
    PGADMIN_DEFAULT_PASSWORD: state.admin.password || '${ADMIN_PASSWORD}',
  };
}

function getCloudflaredEnv(state: WizardState): Record<string, string> {
  return {
    TUNNEL_TOKEN: state.domain.cloudflare.tunnelToken || '${TUNNEL_TOKEN}',
  };
}

// ---------------------------------------------------------------------------
// Label builders (Traefik routing)
// ---------------------------------------------------------------------------

function resolveTraefikLabels(
  def: ServiceDefinition,
  domain: string,
): Record<string, string> {
  if (!def.traefikLabels) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(def.traefikLabels)) {
    resolved[key] = value.replace(/\{\{DOMAIN\}\}/g, domain);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Port mapping builders
// ---------------------------------------------------------------------------

function getServicePorts(serviceId: string, state: WizardState): string[] {
  switch (serviceId) {
    case 'traefik':
      return ['80:80', '443:443', '8080:8080'];
    case 'nginx':
      return ['80:80', '443:443'];
    case 'caddy':
      return ['80:80', '443:443'];
    case 'gitea':
      return [
        `${state.servers.gitServer.port}:3000`,
        `${state.servers.gitServer.sshPort}:22`,
      ];
    case 'openssh-server':
      return [`${state.servers.sshServer.port}:2222`];
    case 'docker-mailserver':
      return ['25:25', '587:587', '993:993'];
    case 'cloudflared':
      return [];
    // DB/cache ports are NOT exposed externally
    case 'postgresql':
    case 'mysql':
    case 'redis':
    case 'valkey':
    case 'keydb':
      return [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// depends_on builder
// ---------------------------------------------------------------------------

function getDependsOn(serviceId: string, state: WizardState): string[] {
  const deps: string[] = [];

  const dbEnabled = state.servers.dbServer.enabled && state.servers.dbServer.primary;
  const cacheEnabled = state.servers.dbServer.enabled && state.servers.dbServer.cache;
  const primaryId = state.servers.dbServer.primary; // 'postgresql' | 'mysql' | ...
  const cacheId = state.servers.dbServer.cache;      // 'redis' | 'valkey' | 'keydb'

  switch (serviceId) {
    case 'gitea':
      if (dbEnabled) deps.push(primaryId);
      if (cacheEnabled) deps.push(cacheId);
      break;
    case 'nextcloud':
      if (dbEnabled) deps.push(primaryId);
      if (cacheEnabled) deps.push(cacheId);
      break;
    case 'pgadmin':
      deps.push('postgresql');
      break;
    default:
      break;
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Service environment dispatcher
// ---------------------------------------------------------------------------

function getServiceEnvironment(
  serviceId: string,
  state: WizardState,
): Record<string, string> | undefined {
  switch (serviceId) {
    case 'postgresql':
      return getPostgresqlEnv(state);
    case 'mysql':
      return getMysqlEnv(state);
    case 'gitea':
      return getGiteaEnv(state);
    case 'nextcloud':
      return getNextcloudEnv(state);
    case 'minio':
      return getMinioEnv(state);
    case 'openssh-server':
      return getSshEnv(state);
    case 'docker-mailserver':
      return getMailEnv(state);
    case 'pgadmin':
      return getPgadminEnv(state);
    case 'cloudflared':
      return getCloudflaredEnv(state);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Build a single ComposeService from a ServiceDefinition
// ---------------------------------------------------------------------------

function buildComposeService(
  def: ServiceDefinition,
  state: WizardState,
): ComposeService {
  const domain = state.domain.name;
  const webService = state.servers.webServer.service;

  // Base service scaffold (constitution requirements)
  const svc: ComposeService = {
    image: def.image,
    container_name: `${BREWNET_PREFIX}-${def.id}`,
    restart: 'unless-stopped',
    security_opt: ['no-new-privileges:true'],
    networks: [...def.networks],
  };

  // Ports
  const ports = getServicePorts(def.id, state);
  if (ports.length > 0) {
    svc.ports = ports;
  }

  // Volumes
  const volumes = getServiceVolumes(def.id);
  if (volumes.length > 0) {
    svc.volumes = volumes;
  }

  // Environment
  const environment = getServiceEnvironment(def.id, state);
  if (environment) {
    svc.environment = environment;
  }

  // Traefik labels — only when web server is traefik AND service has a subdomain
  if (webService === 'traefik' && def.traefikLabels) {
    svc.labels = resolveTraefikLabels(def, domain);
  }

  // depends_on
  const deps = getDependsOn(def.id, state);
  if (deps.length > 0) {
    svc.depends_on = deps;
  }

  // Healthcheck
  const hc = getHealthcheck(def.id, state);
  if (hc) {
    svc.healthcheck = hc;
  }

  // Cloudflared command
  if (def.id === 'cloudflared') {
    svc.command = ['tunnel', '--no-autoupdate', 'run'];
  }

  // MinIO command
  if (def.id === 'minio') {
    svc.command = ['server', '/data', '--console-address', ':9001'];
  }

  return svc;
}

// ---------------------------------------------------------------------------
// Named volume collector
// ---------------------------------------------------------------------------

/**
 * Extract all named (non-bind-mount) volumes from a services map.
 * Bind mounts start with '/' or '.'; everything else is a named volume.
 */
function collectNamedVolumes(
  services: Record<string, ComposeService>,
): Record<string, null> {
  const volumes: Record<string, null> = {};
  for (const svc of Object.values(services)) {
    for (const vol of svc.volumes ?? []) {
      const hostPart = vol.split(':')[0];
      if (!hostPart.startsWith('/') && !hostPart.startsWith('.')) {
        volumes[hostPart] = null;
      }
    }
  }
  return volumes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a ComposeConfig object from WizardState.
 *
 * The output can be serialized to YAML with `composeConfigToYaml()`.
 */
export function generateComposeConfig(state: WizardState): ComposeConfig {
  const services: Record<string, ComposeService> = {};

  // 1. Web server (required, always enabled)
  const webId = state.servers.webServer.service; // 'traefik' | 'nginx' | 'caddy'
  const webDef = SERVICE_REGISTRY.get(webId);
  if (webDef) {
    services[webId] = buildComposeService(webDef, state);
  }

  // 2. Git server (required, always enabled)
  const giteaDef = SERVICE_REGISTRY.get('gitea');
  if (giteaDef) {
    services['gitea'] = buildComposeService(giteaDef, state);
  }

  // 3. Database (optional)
  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    const dbId = state.servers.dbServer.primary; // 'postgresql' | 'mysql'
    const dbDef = SERVICE_REGISTRY.get(dbId);
    if (dbDef) {
      services[dbId] = buildComposeService(dbDef, state);
    }

    // Cache (optional, part of dbServer)
    if (state.servers.dbServer.cache) {
      const cacheId = state.servers.dbServer.cache; // 'redis' | 'valkey' | 'keydb'
      const cacheDef = SERVICE_REGISTRY.get(cacheId);
      if (cacheDef) {
        services[cacheId] = buildComposeService(cacheDef, state);
      }
    }

    // Admin UI (pgadmin only for postgresql)
    if (state.servers.dbServer.adminUI && dbId === 'postgresql') {
      const pgadminDef = SERVICE_REGISTRY.get('pgadmin');
      if (pgadminDef) {
        services['pgadmin'] = buildComposeService(pgadminDef, state);
      }
    }
  }

  // 4. File server (optional)
  if (state.servers.fileServer.enabled && state.servers.fileServer.service) {
    const fileId = state.servers.fileServer.service; // 'nextcloud' | 'minio'
    const fileDef = SERVICE_REGISTRY.get(fileId);
    if (fileDef) {
      services[fileId] = buildComposeService(fileDef, state);
    }
  }

  // 5. Media (optional)
  if (state.servers.media.enabled && state.servers.media.services.length > 0) {
    for (const mediaId of state.servers.media.services) {
      const mediaDef = SERVICE_REGISTRY.get(mediaId);
      if (mediaDef) {
        services[mediaId] = buildComposeService(mediaDef, state);
      }
    }
  }

  // 6. SSH server (optional)
  if (state.servers.sshServer.enabled) {
    const sshDef = SERVICE_REGISTRY.get('openssh-server');
    if (sshDef) {
      services['openssh-server'] = buildComposeService(sshDef, state);
    }
  }

  // 7. Mail server (optional)
  if (state.servers.mailServer.enabled) {
    const mailDef = SERVICE_REGISTRY.get('docker-mailserver');
    if (mailDef) {
      services['docker-mailserver'] = buildComposeService(mailDef, state);
    }
  }

  // 8. Cloudflare tunnel (optional)
  if (state.domain.cloudflare.enabled) {
    const cfDef = SERVICE_REGISTRY.get('cloudflared');
    if (cfDef) {
      services['cloudflared'] = buildComposeService(cfDef, state);
    }
  }

  // 9. FileBrowser (optional)
  if (state.servers.fileBrowser.enabled) {
    const fbDef = SERVICE_REGISTRY.get('filebrowser');
    if (fbDef) {
      services['filebrowser'] = buildComposeService(fbDef, state);
    }
  }

  const namedVolumes = collectNamedVolumes(services);

  return {
    services,
    networks: {
      brewnet: { external: true },
      'brewnet-internal': { internal: true },
    },
    ...(Object.keys(namedVolumes).length > 0 ? { volumes: namedVolumes } : {}),
  };
}

/**
 * Serialize a ComposeConfig to a YAML string suitable for writing to
 * docker-compose.yml.
 */
export function composeConfigToYaml(config: ComposeConfig): string {
  return yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}
