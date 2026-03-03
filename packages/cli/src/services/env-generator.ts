/**
 * T062 — .env / .env.example File Generator
 *
 * Generates environment files from the wizard state:
 *   - `.env` — contains all secret keys and configuration values
 *   - `.env.example` — same keys with masked/placeholder values (safe to share)
 *
 * Uses credential-manager for admin credential propagation and
 * password generator for any missing secrets.
 *
 * @module services/env-generator
 */

import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WizardState } from '@brewnet/shared';
import { generateCredentialEnvEntries } from './credential-manager.js';
import { generatePassword } from '../utils/password.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecretFile {
  /** Relative path from project root, e.g. 'secrets/admin_password' */
  relativePath: string;
  /** File content — NO trailing newline (some Docker images include whitespace) */
  content: string;
}

export interface EnvGeneratorResult {
  envContent: string;
  envExampleContent: string;
  secretFiles: SecretFile[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/**
 * Generate an htpasswd-compatible apr1 hash string for BasicAuth.
 *
 * Tries `htpasswd -nb` first (most reliable), falls back to `openssl passwd -apr1`,
 * and finally falls back to a Node.js MD5-crypt implementation.
 *
 * The output is written to a secret file (secrets/traefik_dashboard_auth) and
 * read by Traefik via basicauth.usersfile — no `$$` escaping needed.
 *
 * @param username - The BasicAuth username
 * @param password - The BasicAuth password
 * @returns htpasswd string (e.g. `admin:$apr1$...`)
 */
function generateHtpasswd(username: string, password: string): string {
  if (!password) return `${username}:<generate-password>`;

  let hash = '';

  // Try htpasswd
  try {
    const result = execSync(
      `htpasswd -nb ${shellEscape(username)} ${shellEscape(password)}`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (result.includes(':$')) hash = result;
  } catch { /* fallback */ }

  // Try openssl
  if (!hash) {
    try {
      const raw = execSync(
        `openssl passwd -apr1 ${shellEscape(password)}`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      if (raw.startsWith('$apr1$')) hash = `${username}:${raw}`;
    } catch { /* fallback */ }
  }

  // Node.js fallback: simple MD5 hash (not apr1, but works with Traefik)
  if (!hash) {
    const md5 = createHash('md5').update(password).digest('hex');
    hash = `${username}:{MD5}${Buffer.from(md5).toString('base64')}`;
  }

  // File-based secret: no $$ escaping needed (Traefik reads usersfile directly)
  return hash;
}

/** Escape a string for safe use in a shell command. */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Determine whether a key holds a secret value that should be masked
 * in .env.example.
 */
function isSecretKey(key: string): boolean {
  return (
    key.includes('PASSWORD') ||
    key.includes('SECRET') ||
    key.includes('TOKEN') ||
    key === 'TRAEFIK_DASHBOARD_AUTH'
  );
}

/**
 * Return a masked placeholder for a given key.
 */
function maskValue(key: string): string {
  if (key === 'TRAEFIK_DASHBOARD_AUTH') return '<htpasswd-hash>';
  if (key.includes('PASSWORD')) return '<your-password>';
  if (key.includes('SECRET')) return '<your-secret>';
  if (key.includes('TOKEN')) return '<your-token>';
  return '<your-value>';
}

/**
 * Map env var key → secret file relative path.
 * Keys not listed here stay in .env. MINIO_ROOT_PASSWORD and
 * CLOUDFLARE_TUNNEL_TOKEN stay in .env because their images don't
 * support _FILE convention.
 */
const ENV_TO_SECRET_FILE: Record<string, string> = {
  BREWNET_ADMIN_PASSWORD:         'secrets/admin_password',
  POSTGRES_PASSWORD:              'secrets/db_password',
  MYSQL_ROOT_PASSWORD:            'secrets/db_password',
  MYSQL_PASSWORD:                 'secrets/db_password',
  REDIS_PASSWORD:                 'secrets/cache_password',
  VALKEY_PASSWORD:                'secrets/cache_password',
  KEYDB_PASSWORD:                 'secrets/cache_password',
  'GITEA__security__SECRET_KEY':  'secrets/gitea_secret_key',
  GITEA_ADMIN_PASSWORD:           'secrets/admin_password',
  NEXTCLOUD_ADMIN_PASSWORD:       'secrets/admin_password',
  PGADMIN_DEFAULT_PASSWORD:       'secrets/admin_password',
  SMTP_RELAY_PASSWORD:            'secrets/smtp_relay_password',
  TRAEFIK_DASHBOARD_AUTH:         'secrets/traefik_dashboard_auth',
  // CLOUDFLARE_TUNNEL_TOKEN stays in .env — cloudflared image does not support _FILE convention
  // MINIO_ROOT_PASSWORD stays in .env (_FILE not supported)
};

/**
 * Serialize a key-value record into .env file format.
 * Entries are grouped by section with comment headers.
 */
function serializeEnv(
  entries: Record<string, string>,
  mask: boolean,
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(entries)) {
    if (mask && isSecretKey(key)) {
      lines.push(`${key}=${maskValue(key)}`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate .env and .env.example file contents from the wizard state.
 *
 * Collects entries from:
 *   1. Admin credentials + credential propagation (credential-manager)
 *   2. Database-specific configuration (PostgreSQL / MySQL)
 *   3. Cache layer passwords (Redis / Valkey / KeyDB)
 *   4. Cloudflare Tunnel token
 *   5. Mail server configuration
 *   6. Domain configuration
 *   7. Generated secret keys (Gitea secret, etc.)
 *
 * Any PASSWORD/SECRET/TOKEN entry that is empty will be filled with a
 * generated random password.
 */
export function generateEnvFiles(state: WizardState): EnvGeneratorResult {
  const entries: Record<string, string> = {};

  // ── 1. Admin credentials + credential propagation ──────────────────
  const credentialEntries = generateCredentialEnvEntries(state);
  Object.assign(entries, credentialEntries);

  // ── 2. Cache layer passwords ───────────────────────────────────────
  const { dbServer } = state.servers;
  if (dbServer.enabled && dbServer.cache) {
    const cache = dbServer.cache; // 'redis' | 'valkey' | 'keydb'
    const cachePasswordKey =
      cache === 'valkey'
        ? 'VALKEY_PASSWORD'
        : cache === 'keydb'
          ? 'KEYDB_PASSWORD'
          : 'REDIS_PASSWORD';

    if (!entries[cachePasswordKey]) {
      entries[cachePasswordKey] = generatePassword(16);
    }
  }

  // ── 3. Cloudflare Tunnel ───────────────────────────────────────────
  if (state.domain.cloudflare.enabled && state.domain.cloudflare.tunnelToken) {
    entries['CLOUDFLARE_TUNNEL_TOKEN'] = state.domain.cloudflare.tunnelToken;
  }

  // ── 4. Mail Server ─────────────────────────────────────────────────
  if (state.servers.mailServer.enabled) {
    const domainName = state.domain.name || 'brewnet.local';
    entries['MAIL_DOMAIN'] = domainName;
    entries['MAIL_HOSTNAME'] = `mail.${domainName}`;
    entries['POSTMASTER_ADDRESS'] = `postmaster@${domainName}`;
    entries['SMTP_PORT'] = '25';

    // SMTP relay credentials (when port 25 is blocked)
    if (state.servers.mailServer.relayProvider && state.servers.mailServer.relayUser) {
      entries['SMTP_RELAY_USER'] = state.servers.mailServer.relayUser;
      entries['SMTP_RELAY_PASSWORD'] = state.servers.mailServer.relayPassword || generatePassword(16);
    }
  }

  // ── 5. Traefik Dashboard BasicAuth ─────────────────────────────────
  // htpasswd format with $$ escaping for docker-compose interpolation.
  // Generated at install time via openssl; falls back to a placeholder.
  entries['TRAEFIK_DASHBOARD_AUTH'] = generateHtpasswd(
    state.admin.username || 'admin',
    state.admin.password || '',
  );

  // ── 6. Domain ──────────────────────────────────────────────────────
  entries['BREWNET_DOMAIN'] = state.domain.name || 'brewnet.local';

  // ── 7. Ensure all secret entries have non-empty values ─────────────
  for (const key of Object.keys(entries)) {
    if (isSecretKey(key) && !entries[key]) {
      entries[key] = generatePassword(16);
    }
  }

  // ── Split entries into .env (non-secret) and secret files ──────────
  // Cache passwords (REDIS_PASSWORD / VALKEY_PASSWORD / KEYDB_PASSWORD) are
  // dual-written: to .env (for Docker Compose ${VAR} interpolation in Gitea's
  // redis:// URL) AND to secrets/cache_password (for the Redis container's
  // --requirepass startup override via Docker secrets).
  const CACHE_PASSWORD_KEYS = new Set(['REDIS_PASSWORD', 'VALKEY_PASSWORD', 'KEYDB_PASSWORD']);

  const envEntries: Record<string, string> = {};
  const secretFileMap = new Map<string, string>(); // relativePath → content

  for (const [key, value] of Object.entries(entries)) {
    const secretPath = ENV_TO_SECRET_FILE[key];
    if (secretPath) {
      // Deduplicate: multiple env vars may map to the same secret file
      // (e.g. GITEA_ADMIN_PASSWORD, NEXTCLOUD_ADMIN_PASSWORD → admin_password)
      if (!secretFileMap.has(secretPath)) {
        secretFileMap.set(secretPath, value);
      }
      // Cache passwords also go into .env so Docker Compose can interpolate
      // ${REDIS_PASSWORD} in the Gitea redis:// connection URL.
      if (CACHE_PASSWORD_KEYS.has(key)) {
        envEntries[key] = value;
      }
    } else {
      envEntries[key] = value;
    }
  }

  const secretFiles: SecretFile[] = Array.from(secretFileMap.entries()).map(
    ([relativePath, content]) => ({ relativePath, content }),
  );

  // ── Build output ───────────────────────────────────────────────────
  const envContent = serializeEnv(envEntries, false);
  const envExampleContent = serializeEnv(entries, true);

  return { envContent, envExampleContent, secretFiles };
}

/**
 * Write the .env file to disk with restrictive permissions (chmod 600).
 *
 * Creates the parent directory if it does not exist.
 *
 * @param projectPath - Absolute path to the project directory
 * @param content - The .env file content to write
 */
export function writeEnvFile(projectPath: string, content: string): void {
  const filePath = join(projectPath, '.env');
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });
  chmodSync(filePath, 0o600);
}

/**
 * Write the .env.example file to disk.
 *
 * This file contains masked/placeholder values and is safe to commit
 * to version control.
 *
 * @param projectPath - Absolute path to the project directory
 * @param content - The .env.example file content to write
 */
export function writeEnvExampleFile(projectPath: string, content: string): void {
  const filePath = join(projectPath, '.env.example');
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf-8' });
}

/**
 * Write secret files to disk with restrictive permissions.
 *
 * Creates the `secrets/` directory (chmod 700) and writes each secret
 * file (chmod 600). No trailing newline in file content — some Docker
 * images include whitespace when reading secrets.
 *
 * @param projectPath - Absolute path to the project directory
 * @param secretFiles - Array of SecretFile objects to write
 */
export function writeSecretFiles(projectPath: string, secretFiles: SecretFile[]): void {
  if (secretFiles.length === 0) return;

  const secretsDir = join(projectPath, 'secrets');
  mkdirSync(secretsDir, { recursive: true });
  chmodSync(secretsDir, 0o700);

  for (const sf of secretFiles) {
    const filePath = join(projectPath, sf.relativePath);
    writeFileSync(filePath, sf.content, { encoding: 'utf-8', mode: 0o600 });
    chmodSync(filePath, 0o600);
  }
}
