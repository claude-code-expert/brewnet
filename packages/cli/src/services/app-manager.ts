// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { GiteaClient } from './gitea-client.js';
import { addApp, updateApp, readApps, removeApp as registryRemoveApp } from './app-registry.js';
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions } from '../types/app-entry.js';

// ---------------------------------------------------------------------------
// Suppress unused-import warnings for future-use symbols.
// These are referenced by subsequent tasks that append code to this file.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = { randomBytes, execa, GiteaClient, addApp, updateApp, registryRemoveApp } as unknown;
// The types below are import-only; TypeScript will use them when the
// corresponding functions are added in later tasks.
type _AppJobStep = AppJobStep;
type _CreateAppOptions = CreateAppOptions;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GITEA_TOKEN_PATH = join(BREWNET_DIR, 'gitea-token');

// ---------------------------------------------------------------------------
// In-memory job store (ephemeral — cleared on server restart)
// ---------------------------------------------------------------------------

const jobs = new Map<string, AppJob>();

// ---------------------------------------------------------------------------
// Exported helpers (testable in isolation)
// ---------------------------------------------------------------------------

export function resolveAppsJsonPath(): string {
  return join(BREWNET_DIR, 'apps.json');
}

/** Parse a single KEY=VALUE line from a .env file. Returns '' if not found. */
export function readDotEnvValue(envPath: string, key: string): string {
  if (!existsSync(envPath)) return '';
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listApps(): Promise<AppEntry[]> {
  return readApps(resolveAppsJsonPath());
}

export function getJobStatus(jobId: string): AppJob | undefined {
  return jobs.get(jobId);
}
