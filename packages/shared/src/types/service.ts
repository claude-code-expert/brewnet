// T009 — Service definition types
// Describes the shape of a service that can be managed by Brewnet.

export type { Language, FrontendTech } from './wizard-state.js';

// ─── Health Check ────────────────────────────────────────────────────────────

export interface HealthCheckConfig {
  /** URL path or command used to determine health (e.g., "/healthz") */
  endpoint: string;
  /** Interval between health checks in milliseconds */
  interval: number;
  /** Timeout for a single health check in milliseconds */
  timeout: number;
  /** Number of consecutive failures before marking unhealthy */
  retries: number;
}

// ─── Network Types ───────────────────────────────────────────────────────────

export type BrewnetNetwork = 'brewnet' | 'brewnet-internal';

// ─── Service Definition ──────────────────────────────────────────────────────

export interface ServiceDefinition {
  /** Unique service identifier (e.g., "jellyfin", "nextcloud") */
  id: string;
  /** Human-readable service name */
  name: string;
  /** Docker image reference (e.g., "jellyfin/jellyfin:latest") */
  image: string;
  /** Exposed port numbers */
  ports: number[];
  /** Subdomain prefix for reverse proxy routing (e.g., "media" -> media.example.com) */
  subdomain: string;
  /** Estimated minimum RAM requirement in megabytes */
  ramMB: number;
  /** Estimated minimum disk requirement in gigabytes */
  diskGB: number;
  /** Docker networks this service should be attached to */
  networks: BrewnetNetwork[];
  /** Optional health check configuration */
  healthCheck?: HealthCheckConfig;
  /** Environment variables required for this service */
  requiredEnvVars: string[];
  /** Traefik reverse proxy labels for automatic routing */
  traefikLabels?: Record<string, string>;
}

// ─── Service Status ──────────────────────────────────────────────────────────

export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'error' | 'unknown';

export interface ServiceInstance {
  /** References ServiceDefinition.id */
  serviceId: string;
  /** Docker container ID */
  containerId: string;
  /** Current status of the service */
  status: ServiceStatus;
  /** Port mappings (host:container) */
  portMappings: Record<number, number>;
  /** ISO timestamp of when the container was started */
  startedAt: string | null;
  /** Container uptime in seconds, null if not running */
  uptimeSeconds: number | null;
  /** CPU usage percentage (0-100), null if not available */
  cpuPercent: number | null;
  /** Memory usage in megabytes, null if not available */
  memoryMB: number | null;
}

// ─── Service Registry Entry ──────────────────────────────────────────────────

export interface ServiceRegistryEntry {
  /** The full service definition */
  definition: ServiceDefinition;
  /** Category for grouping in the UI */
  category: 'web' | 'file' | 'git' | 'database' | 'cache' | 'media' | 'ssh' | 'mail' | 'app' | 'browser';
  /** Whether this service requires a Pro license */
  requiresPro: boolean;
  /** Services that this service depends on (by service id) */
  dependencies: string[];
  /** Services that conflict with this one (by service id) */
  conflicts: string[];
}
