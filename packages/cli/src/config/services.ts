/**
 * @module services
 * @description Service registry for all Docker services managed by Brewnet.
 * Each entry defines the container image, resource requirements, networking,
 * health checks, required environment variables, and Traefik routing labels.
 *
 * Task: T019 — Phase 2 Config Registries
 */

export interface ServiceDefinition {
  id: string;
  name: string;
  image: string;
  ports: number[];
  subdomain: string;
  ramMB: number;
  diskGB: number;
  networks: ('brewnet' | 'brewnet-internal')[];
  healthCheck?: {
    endpoint: string;
    interval: number;
    timeout: number;
    retries: number;
  };
  requiredEnvVars: string[];
  traefikLabels?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helper to build Traefik HTTP router labels for a given subdomain.
// The domain placeholder `{{DOMAIN}}` is resolved at compose-generation time.
// ---------------------------------------------------------------------------
function traefikRouterLabels(
  serviceId: string,
  subdomain: string,
  port: number,
): Record<string, string> {
  return {
    'traefik.enable': 'true',
    [`traefik.http.routers.${serviceId}.rule`]: `Host(\`${subdomain}.{{DOMAIN}}\`)`,
    [`traefik.http.routers.${serviceId}.entrypoints`]: 'websecure',
    [`traefik.http.routers.${serviceId}.tls.certresolver`]: 'letsencrypt',
    [`traefik.http.services.${serviceId}.loadbalancer.server.port`]: String(port),
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SERVICE_REGISTRY: Map<string, ServiceDefinition> = new Map([
  // -- Web servers ----------------------------------------------------------
  [
    'traefik',
    {
      id: 'traefik',
      name: 'Traefik',
      image: 'traefik:v2.11',
      ports: [80, 443, 8080],
      subdomain: 'traefik',
      ramMB: 64,
      diskGB: 0.1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '/api/health',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: [],
      traefikLabels: {
        'traefik.enable': 'true',
        'traefik.http.routers.traefik-dashboard.rule': 'Host(`traefik.{{DOMAIN}}`)',
        'traefik.http.routers.traefik-dashboard.entrypoints': 'websecure',
        'traefik.http.routers.traefik-dashboard.tls.certresolver': 'letsencrypt',
        'traefik.http.routers.traefik-dashboard.service': 'api@internal',
      },
    },
  ],
  [
    'nginx',
    {
      id: 'nginx',
      name: 'Nginx',
      image: 'nginx:1.25-alpine',
      ports: [80, 443],
      subdomain: '',
      ramMB: 32,
      diskGB: 0.1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '/',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: [],
    },
  ],
  [
    'caddy',
    {
      id: 'caddy',
      name: 'Caddy',
      image: 'caddy:2-alpine',
      ports: [80, 443],
      subdomain: '',
      ramMB: 32,
      diskGB: 0.1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '/',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: [],
    },
  ],

  // -- Git server -----------------------------------------------------------
  [
    'gitea',
    {
      id: 'gitea',
      name: 'Gitea',
      image: 'gitea/gitea:latest',
      ports: [3000, 3022],
      subdomain: 'git',
      ramMB: 256,
      diskGB: 1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '/api/healthz',
        interval: 30,
        timeout: 10,
        retries: 3,
      },
      requiredEnvVars: [
        'GITEA__database__DB_TYPE',
        'GITEA__database__HOST',
        'GITEA__database__NAME',
        'GITEA__database__USER',
        'GITEA__database__PASSWD',
      ],
      traefikLabels: traefikRouterLabels('gitea', 'git', 3000),
    },
  ],

  // -- File browser ---------------------------------------------------------
  [
    'filebrowser',
    {
      id: 'filebrowser',
      name: 'FileBrowser',
      image: 'filebrowser/filebrowser:latest',
      ports: [80],
      subdomain: 'files',
      ramMB: 50,
      diskGB: 0.1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '/health',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: [],
      traefikLabels: traefikRouterLabels('filebrowser', 'files', 80),
    },
  ],

  // -- File servers ---------------------------------------------------------
  [
    'nextcloud',
    {
      id: 'nextcloud',
      name: 'Nextcloud',
      image: 'nextcloud:29-apache',
      ports: [443],
      subdomain: 'cloud',
      ramMB: 256,
      diskGB: 2,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '/status.php',
        interval: 30,
        timeout: 10,
        retries: 5,
      },
      requiredEnvVars: [
        'NEXTCLOUD_ADMIN_USER',
        'NEXTCLOUD_ADMIN_PASSWORD',
        'NEXTCLOUD_TRUSTED_DOMAINS',
      ],
      traefikLabels: traefikRouterLabels('nextcloud', 'cloud', 443),
    },
  ],
  [
    'minio',
    {
      id: 'minio',
      name: 'MinIO',
      image: 'minio/minio:latest',
      ports: [9000],
      subdomain: 'minio',
      ramMB: 128,
      diskGB: 1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '/minio/health/live',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'],
      traefikLabels: traefikRouterLabels('minio', 'minio', 9001),
    },
  ],

  // -- Media ----------------------------------------------------------------
  [
    'jellyfin',
    {
      id: 'jellyfin',
      name: 'Jellyfin',
      image: 'jellyfin/jellyfin:latest',
      ports: [8096],
      subdomain: 'jellyfin',
      ramMB: 256,
      diskGB: 2,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '/health',
        interval: 30,
        timeout: 10,
        retries: 3,
      },
      requiredEnvVars: [],
      traefikLabels: traefikRouterLabels('jellyfin', 'jellyfin', 8096),
    },
  ],

  // -- Databases ------------------------------------------------------------
  [
    'postgresql',
    {
      id: 'postgresql',
      name: 'PostgreSQL',
      image: 'postgres:17-alpine',
      ports: [5432],
      subdomain: '',
      ramMB: 120,
      diskGB: 1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '',
        interval: 10,
        timeout: 5,
        retries: 5,
      },
      requiredEnvVars: ['POSTGRES_PASSWORD', 'POSTGRES_USER', 'POSTGRES_DB'],
    },
  ],
  [
    'mysql',
    {
      id: 'mysql',
      name: 'MySQL',
      image: 'mysql:8.4',
      ports: [3306],
      subdomain: '',
      ramMB: 256,
      diskGB: 1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '',
        interval: 10,
        timeout: 5,
        retries: 5,
      },
      requiredEnvVars: [
        'MYSQL_ROOT_PASSWORD',
        'MYSQL_DATABASE',
        'MYSQL_USER',
        'MYSQL_PASSWORD',
      ],
    },
  ],

  // -- Caches ---------------------------------------------------------------
  [
    'redis',
    {
      id: 'redis',
      name: 'Redis',
      image: 'redis:7-alpine',
      ports: [6379],
      subdomain: '',
      ramMB: 12,
      diskGB: 0.1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '',
        interval: 10,
        timeout: 3,
        retries: 3,
      },
      requiredEnvVars: [],
    },
  ],
  [
    'valkey',
    {
      id: 'valkey',
      name: 'Valkey',
      image: 'valkey/valkey:7-alpine',
      ports: [6379],
      subdomain: '',
      ramMB: 12,
      diskGB: 0.1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '',
        interval: 10,
        timeout: 3,
        retries: 3,
      },
      requiredEnvVars: [],
    },
  ],
  [
    'keydb',
    {
      id: 'keydb',
      name: 'KeyDB',
      image: 'eqalpha/keydb:latest',
      ports: [6379],
      subdomain: '',
      ramMB: 16,
      diskGB: 0.1,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '',
        interval: 10,
        timeout: 3,
        retries: 3,
      },
      requiredEnvVars: [],
    },
  ],

  // -- Admin UI -------------------------------------------------------------
  [
    'pgadmin',
    {
      id: 'pgadmin',
      name: 'pgAdmin',
      image: 'dpage/pgadmin4:latest',
      ports: [5050],
      subdomain: 'pgadmin',
      ramMB: 128,
      diskGB: 0.5,
      networks: ['brewnet', 'brewnet-internal'],
      healthCheck: {
        endpoint: '/misc/ping',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: [
        'PGADMIN_DEFAULT_EMAIL',
        'PGADMIN_DEFAULT_PASSWORD',
      ],
      traefikLabels: traefikRouterLabels('pgadmin', 'pgadmin', 80),
    },
  ],

  // -- SSH ------------------------------------------------------------------
  [
    'openssh-server',
    {
      id: 'openssh-server',
      name: 'OpenSSH Server',
      image: 'linuxserver/openssh-server:latest',
      ports: [2222],
      subdomain: '',
      ramMB: 16,
      diskGB: 0.1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
      requiredEnvVars: ['PUID', 'PGID', 'TZ', 'PASSWORD_ACCESS', 'USER_NAME'],
    },
  ],

  // -- Mail -----------------------------------------------------------------
  [
    'docker-mailserver',
    {
      id: 'docker-mailserver',
      name: 'Docker Mailserver',
      image: 'ghcr.io/docker-mailserver/docker-mailserver:latest',
      ports: [25, 587, 993],
      subdomain: 'mail',
      ramMB: 256,
      diskGB: 1,
      networks: ['brewnet'],
      healthCheck: {
        endpoint: '',
        interval: 60,
        timeout: 10,
        retries: 5,
      },
      requiredEnvVars: ['OVERRIDE_HOSTNAME', 'ENABLE_CLAMAV', 'ENABLE_FAIL2BAN'],
      traefikLabels: traefikRouterLabels('docker-mailserver', 'mail', 443),
    },
  ],

  // -- Tunnel ---------------------------------------------------------------
  [
    'cloudflared',
    {
      id: 'cloudflared',
      name: 'Cloudflare Tunnel',
      image: 'cloudflare/cloudflared:latest',
      ports: [],
      subdomain: '',
      ramMB: 32,
      diskGB: 0.1,
      networks: ['brewnet'],
      requiredEnvVars: ['TUNNEL_TOKEN'],
    },
  ],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve a single service definition by its unique ID.
 */
export function getServiceDefinition(id: string): ServiceDefinition | undefined {
  return SERVICE_REGISTRY.get(id);
}

/**
 * Return a sorted array of every registered service ID.
 */
export function getAllServiceIds(): string[] {
  return [...SERVICE_REGISTRY.keys()];
}
