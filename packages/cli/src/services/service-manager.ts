/**
 * Brewnet CLI — Service Manager (T094)
 *
 * Provides functions to add and remove Docker services from an existing
 * Brewnet project's docker-compose.yml. All mutations create a backup of
 * the compose file before writing changes.
 *
 * @module services/service-manager
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { getServiceDefinition } from '../config/services.js';
import type { ServiceDefinition } from '../config/services.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceOperationResult {
  success: boolean;
  composePath?: string;
  backupPath?: string;
  error?: string;
}

interface ComposeService {
  image: string;
  container_name?: string;
  restart?: string;
  security_opt?: string[];
  networks?: string[];
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  labels?: Record<string, string>;
  depends_on?: string[];
  healthcheck?: Record<string, unknown>;
  command?: string | string[];
}

interface ComposeFile {
  version?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_PREFIX = 'brewnet';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse a docker-compose.yml file.
 */
function readComposeFile(composePath: string): ComposeFile {
  const content = readFileSync(composePath, 'utf-8');
  return yaml.load(content) as ComposeFile;
}

/**
 * Write a ComposeFile object as YAML to disk.
 */
function writeComposeFile(composePath: string, compose: ComposeFile): void {
  const yamlContent = yaml.dump(compose, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(composePath, yamlContent, 'utf-8');
}

/**
 * Create a timestamped backup of the compose file.
 * Returns the backup file path.
 */
function backupComposeFile(composePath: string): string {
  const timestamp = Date.now();
  let backupPath = `${composePath}.bak.${timestamp}`;

  // Avoid filename collisions when multiple backups happen in the same millisecond
  const dir = join(composePath, '..');
  const base = basename(composePath);
  const existing = readdirSync(dir).filter((f) => f.startsWith(`${base}.bak.`));
  let suffix = 0;
  while (existing.includes(basename(backupPath))) {
    suffix++;
    backupPath = `${composePath}.bak.${timestamp}.${suffix}`;
  }

  copyFileSync(composePath, backupPath);
  return backupPath;
}

/**
 * Volume definitions per service ID. Mirrors compose-generator.ts volume
 * mappings so that `addService` produces consistent compose output.
 */
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
      return [`${BREWNET_PREFIX}_nextcloud_data:/var/www/html`];
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

/**
 * Build a ComposeService block from a ServiceDefinition.
 * Used when adding a service to an existing compose file.
 */
function buildServiceBlock(def: ServiceDefinition): ComposeService {
  const svc: ComposeService = {
    image: def.image,
    container_name: `${BREWNET_PREFIX}-${def.id}`,
    restart: 'unless-stopped',
    security_opt: ['no-new-privileges:true'],
    networks: [...def.networks],
  };

  // Volumes
  const volumes = getServiceVolumes(def.id);
  if (volumes.length > 0) {
    svc.volumes = volumes;
  }

  // Traefik labels — only when service has a subdomain
  if (def.subdomain && def.traefikLabels) {
    svc.labels = { ...def.traefikLabels };
  }

  return svc;
}

/**
 * Extract named volume keys from a list of volume mount strings.
 * Named volumes are those that do NOT start with '/' or '.'.
 */
function extractNamedVolumes(volumeMounts: string[]): string[] {
  const names: string[] = [];
  for (const vol of volumeMounts) {
    const name = vol.split(':')[0];
    if (name && !name.startsWith('/') && !name.startsWith('.')) {
      names.push(name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a service to an existing docker-compose.yml.
 *
 * 1. Look up serviceId in SERVICE_REGISTRY
 * 2. Read existing compose file
 * 3. Check for duplicates
 * 4. Backup existing compose
 * 5. Add service block and named volumes
 * 6. Write updated YAML
 */
export async function addService(
  serviceId: string,
  projectPath: string,
): Promise<ServiceOperationResult> {
  // Validate service ID
  const def = getServiceDefinition(serviceId);
  if (!def) {
    return { success: false, error: `Unknown service: ${serviceId}` };
  }

  // Resolve compose file path
  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);
  if (!existsSync(composePath)) {
    return {
      success: false,
      error: `docker-compose.yml not found at ${composePath}`,
    };
  }

  // Read existing compose
  const compose = readComposeFile(composePath);

  // Check for duplicate
  if (compose.services && compose.services[serviceId]) {
    return {
      success: false,
      error: `Service "${serviceId}" already exists in compose`,
    };
  }

  // Backup before modification
  const backupPath = backupComposeFile(composePath);

  // Build and add service block
  const serviceBlock = buildServiceBlock(def);
  if (!compose.services) {
    compose.services = {};
  }
  compose.services[serviceId] = serviceBlock;

  // Register named volumes at the top level
  const volumes = getServiceVolumes(serviceId);
  const namedVolumes = extractNamedVolumes(volumes);
  if (namedVolumes.length > 0) {
    if (!compose.volumes) {
      compose.volumes = {};
    }
    for (const vol of namedVolumes) {
      if (!(vol in (compose.volumes as Record<string, unknown>))) {
        (compose.volumes as Record<string, unknown>)[vol] = null;
      }
    }
  }

  // Write updated compose
  writeComposeFile(composePath, compose);

  return { success: true, composePath, backupPath };
}

/**
 * Remove a service from an existing docker-compose.yml.
 *
 * 1. Read existing compose file
 * 2. Check service exists
 * 3. Backup existing compose
 * 4. Remove service from services section
 * 5. If purge: also remove associated named volumes
 * 6. Write updated YAML
 */
export async function removeService(
  serviceId: string,
  projectPath: string,
  options?: { purge?: boolean },
): Promise<ServiceOperationResult> {
  // Resolve compose file path
  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);
  if (!existsSync(composePath)) {
    return {
      success: false,
      error: `docker-compose.yml not found at ${composePath}`,
    };
  }

  // Read existing compose
  const compose = readComposeFile(composePath);

  // Check if service exists
  if (!compose.services || !compose.services[serviceId]) {
    return {
      success: false,
      error: `Service "${serviceId}" not found in compose`,
    };
  }

  // Backup before modification
  const backupPath = backupComposeFile(composePath);

  // Collect volume names before removing the service (for purge)
  const serviceEntry = compose.services[serviceId];
  const serviceVolumeMounts = serviceEntry.volumes || [];
  const namedVolumes = extractNamedVolumes(serviceVolumeMounts);

  // Remove service
  delete compose.services[serviceId];

  // If purge, also remove associated named volumes from top-level
  if (options?.purge && compose.volumes && namedVolumes.length > 0) {
    for (const vol of namedVolumes) {
      if (vol in (compose.volumes as Record<string, unknown>)) {
        delete (compose.volumes as Record<string, unknown>)[vol];
      }
    }
  }

  // Write updated compose
  writeComposeFile(composePath, compose);

  return { success: true, composePath, backupPath };
}

/**
 * Check whether a service exists in a docker-compose.yml file.
 */
export function isServiceInCompose(
  serviceId: string,
  composePath: string,
): boolean {
  if (!existsSync(composePath)) {
    return false;
  }

  try {
    const compose = readComposeFile(composePath);
    return !!(compose.services && compose.services[serviceId]);
  } catch {
    return false;
  }
}
