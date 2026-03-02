// T013 — Shared constants used across the Brewnet CLI and Dashboard

// ─── Schema & Versioning ────────────────────────────────────────────────────

/** Current wizard state schema version */
export const SCHEMA_VERSION = 7 as const;

/** Minimum schema version that can be migrated (older versions are reset) */
export const MIN_MIGRATABLE_SCHEMA_VERSION = 3;

// ─── Project Defaults ────────────────────────────────────────────────────────

export const DEFAULT_PROJECT_NAME = 'my-homeserver';
export const DEFAULT_PROJECT_PATH_PREFIX = '~/brewnet';
export const DEFAULT_DATA_DIR = '~/.brewnet';
export const DEFAULT_CONFIG_FILENAME = 'brewnet.config.json';

// ─── Admin & Credentials ────────────────────────────────────────────────────

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD_LENGTH = 20;
export const DEFAULT_SERVICE_PASSWORD_LENGTH = 16;
export const DEFAULT_DB_NAME = 'brewnet';
export const DEFAULT_DB_USER = 'brewnet';

// ─── Port Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_SSH_PORT = 2222;
export const DEFAULT_GIT_WEB_PORT = 3000;
export const DEFAULT_GIT_SSH_PORT = 3022;
export const DEFAULT_HTTP_PORT = 80;
export const DEFAULT_HTTPS_PORT = 443;
export const DEFAULT_TRAEFIK_DASHBOARD_PORT = 8080;
export const DEFAULT_SMTP_PORT = 25;
export const DEFAULT_IMAP_PORT = 143;
export const DEFAULT_SMTP_SUBMISSION_PORT = 587;
export const DEFAULT_IMAPS_PORT = 993;

// ─── Health Check ────────────────────────────────────────────────────────────

/** Maximum time to wait for all health checks to pass (ms) */
export const HEALTH_CHECK_TIMEOUT_MS = 120_000;

/** Interval between health check polls (ms) */
export const HEALTH_CHECK_INTERVAL_MS = 2_000;

/** Number of consecutive successes required to consider a service healthy */
export const HEALTH_CHECK_SUCCESS_THRESHOLD = 3;

/** Number of consecutive failures before marking a service as unhealthy */
export const HEALTH_CHECK_FAILURE_THRESHOLD = 5;

// ─── Docker ──────────────────────────────────────────────────────────────────

export const DOCKER_COMPOSE_FILENAME = 'docker-compose.yml';
export const DOCKER_NETWORK_EXTERNAL = 'brewnet';
export const DOCKER_NETWORK_INTERNAL = 'brewnet-internal';
export const DOCKER_RESTART_POLICY = 'unless-stopped';
export const DOCKER_COMPOSE_VERSION = '3.8';

// ─── File Permissions ────────────────────────────────────────────────────────

/** Permission for .env files containing secrets (owner read/write only) */
export const ENV_FILE_PERMISSIONS = 0o600;

/** Permission for SSH private keys (owner read only) */
export const SSH_KEY_PERMISSIONS = 0o600;

/** Permission for SSH authorized_keys (owner read/write only) */
export const SSH_AUTHORIZED_KEYS_PERMISSIONS = 0o600;

/** Permission for directories (owner rwx, group rx, others rx) */
export const DEFAULT_DIR_PERMISSIONS = 0o755;

// ─── Storage Keys ────────────────────────────────────────────────────────────

/** localStorage key for wizard state (used by demo and dashboard) */
export const WIZARD_STATE_STORAGE_KEY = 'brewnet_wizard_state';

// ─── Service Images ─────────────────────────────────────────────────────────

export const SERVICE_IMAGES = {
  traefik: 'traefik:v3.1',
  nginx: 'nginx:1.27-alpine',
  caddy: 'caddy:2-alpine',
  nextcloud: 'nextcloud:29-apache',
  minio: 'minio/minio:latest',
  gitea: 'gitea/gitea:1.22',
  postgresql: 'postgres:16-alpine',
  mysql: 'mysql:8.4',
  sqlite: '',
  redis: 'redis:7-alpine',
  valkey: 'valkey/valkey:8-alpine',
  keydb: 'eqalpha/keydb:latest',
  jellyfin: 'jellyfin/jellyfin:latest',
  dockerMailserver: 'ghcr.io/docker-mailserver/docker-mailserver:latest',
  filebrowser: 'filebrowser/filebrowser:latest',
  pgadmin: 'dpage/pgadmin4:latest',
  phpmyadmin: 'phpmyadmin:latest',
} as const;

// ─── Database Versions ───────────────────────────────────────────────────────

export const DB_VERSIONS: Record<string, string[]> = {
  postgresql: ['16', '15', '14', '13'],
  mysql: ['8.4', '8.0', '5.7'],
  sqlite: ['3'],
};

// ─── Default Web Server ──────────────────────────────────────────────────────

export const DEFAULT_WEB_SERVER = 'traefik' as const;

// ─── Domain Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_DOMAIN_PROVIDER = 'local' as const;
export const DEFAULT_SSL_MODE = 'self-signed' as const;

// ─── Boilerplate Defaults ────────────────────────────────────────────────────

export const DEFAULT_DEV_MODE = 'hot-reload' as const;

/** Git repository URL for Brewnet boilerplate templates (not yet populated) */
export const BOILERPLATE_REPO_URL = 'https://github.com/claude-code-expert/brewnet-boilerplate.git';

// ─── CLI Metadata ────────────────────────────────────────────────────────────

export const CLI_NAME = 'brewnet';
export const CLI_DESCRIPTION = 'Your Home Server, Brewed Fresh';

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Maximum API requests per minute for free tier */
export const RATE_LIMIT_FREE = 60;

/** Maximum API requests per minute for Pro tier */
export const RATE_LIMIT_PRO = 300;

// ─── Backup ──────────────────────────────────────────────────────────────────

/** Maximum number of backup archives to retain */
export const MAX_BACKUP_RETENTION = 10;

/** Default backup directory name within ~/.brewnet */
export const BACKUP_DIR_NAME = 'backups';

// ─── Timeouts ────────────────────────────────────────────────────────────────

/** Timeout for Docker image pull operations (ms) */
export const DOCKER_PULL_TIMEOUT_MS = 300_000;

/** Timeout for Docker container start operations (ms) */
export const DOCKER_START_TIMEOUT_MS = 60_000;

/** Timeout for SSL certificate issuance (ms) */
export const SSL_ISSUANCE_TIMEOUT_MS = 120_000;

/** Timeout for DNS propagation check (ms) */
export const DNS_PROPAGATION_TIMEOUT_MS = 300_000;
