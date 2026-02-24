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

export interface EnvGeneratorResult {
  envContent: string;
  envExampleContent: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a key holds a secret value that should be masked
 * in .env.example.
 */
function isSecretKey(key: string): boolean {
  return (
    key.includes('PASSWORD') ||
    key.includes('SECRET') ||
    key.includes('TOKEN')
  );
}

/**
 * Return a masked placeholder for a given key.
 */
function maskValue(key: string): string {
  if (key.includes('PASSWORD')) return '<your-password>';
  if (key.includes('SECRET')) return '<your-secret>';
  if (key.includes('TOKEN')) return '<your-token>';
  return '<your-value>';
}

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
  }

  // ── 5. Domain ──────────────────────────────────────────────────────
  entries['BREWNET_DOMAIN'] = state.domain.name || 'brewnet.local';

  // ── 6. Ensure all secret entries have non-empty values ─────────────
  for (const key of Object.keys(entries)) {
    if (isSecretKey(key) && !entries[key]) {
      entries[key] = generatePassword(16);
    }
  }

  // ── Build output ───────────────────────────────────────────────────
  const envContent = serializeEnv(entries, false);
  const envExampleContent = serializeEnv(entries, true);

  return { envContent, envExampleContent };
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
