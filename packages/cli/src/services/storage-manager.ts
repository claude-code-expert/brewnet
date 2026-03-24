/**
 * Brewnet CLI — Storage Manager
 *
 * Provides `initStorage()` which adds a file-server backend (Nextcloud,
 * MinIO, Filebrowser, or Jellyfin) to an existing Brewnet project and
 * writes the required credentials to the project's .env file.
 *
 * Delegates compose mutation to service-manager.ts and keeps its own
 * responsibility to credential / env setup only.
 *
 * @module services/storage-manager
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { addService } from './service-manager.js';
import type { ServiceOperationResult } from './service-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorageBackend = 'nextcloud' | 'minio' | 'filebrowser' | 'jellyfin';

export const STORAGE_BACKENDS: StorageBackend[] = [
  'nextcloud',
  'minio',
  'filebrowser',
  'jellyfin',
];

export interface StorageInitOptions {
  projectPath: string;
  adminUsername?: string;
  adminPassword?: string;
  domain?: string;
}

export interface StorageInitResult extends ServiceOperationResult {
  backend: StorageBackend;
  envPatched: boolean;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

/**
 * Returns the environment variable map for a given storage backend.
 * Empty object = backend uses no credentials via .env (configured in-app).
 */
function buildEnvEntries(
  backend: StorageBackend,
  opts: StorageInitOptions,
): Record<string, string> {
  const username = opts.adminUsername ?? 'admin';
  const password = opts.adminPassword ?? '';
  const domain = opts.domain ?? 'localhost';

  switch (backend) {
    case 'nextcloud':
      return {
        NEXTCLOUD_ADMIN_USER: username,
        NEXTCLOUD_ADMIN_PASSWORD: password,
        NEXTCLOUD_TRUSTED_DOMAINS: `${domain} localhost`,
        NEXTCLOUD_TRUSTED_PROXIES: 'traefik',
      };

    case 'minio':
      return {
        MINIO_ROOT_USER: username,
        MINIO_ROOT_PASSWORD: password,
      };

    case 'filebrowser':
    case 'jellyfin':
      // Configured through first-run web UI — no .env credentials needed.
      return {};
  }
}

/**
 * Append or update key=value lines in a .env file.
 * Existing keys are updated in-place; new keys are appended.
 */
function patchEnvFile(envPath: string, entries: Record<string, string>): void {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  for (const [key, value] of Object.entries(entries)) {
    // Build regex with string constructor (no regex literal in template context)
    const regex = new RegExp('^' + key + '=.*$', 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.length === 0 || content.endsWith('\n') ? '' : '\n') + line + '\n';
    }
  }

  writeFileSync(envPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a storage backend to an existing Brewnet project.
 *
 * 1. Validates the project path has a docker-compose.yml.
 * 2. Adds the service via service-manager.addService().
 * 3. Patches the project .env with backend credentials.
 *
 * Throws on unrecoverable errors (e.g. no compose file found).
 */
export async function initStorage(
  backend: StorageBackend,
  opts: StorageInitOptions,
): Promise<StorageInitResult> {
  const composePath = join(opts.projectPath, DOCKER_COMPOSE_FILENAME);
  if (!existsSync(composePath)) {
    throw new Error(
      `No docker-compose.yml found at ${opts.projectPath}. Run \`brewnet init\` first.`,
    );
  }

  const result = await addService(backend, opts.projectPath);
  if (!result.success) {
    return { ...result, backend, envPatched: false };
  }

  const envEntries = buildEnvEntries(backend, opts);
  let envPatched = false;

  if (Object.keys(envEntries).length > 0) {
    patchEnvFile(join(opts.projectPath, '.env'), envEntries);
    envPatched = true;
  }

  return { ...result, backend, envPatched };
}

/**
 * Returns which storage backends are already present in the compose file.
 * A backend is "installed" if its service key exists in docker-compose.yml.
 */
export function getInstalledStorageBackends(projectPath: string): StorageBackend[] {
  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);
  if (!existsSync(composePath)) return [];

  // Read YAML as plain text and check for service keys (avoids a yaml dep import)
  const content = readFileSync(composePath, 'utf-8');
  return STORAGE_BACKENDS.filter((backend) =>
    // Service key appears as "  nextcloud:" at the start of a line
    new RegExp('^\\s{2}' + backend + ':', 'm').test(content),
  );
}
