/**
 * T022 — WizardState Management
 *
 * Handles create/load/save/reset of wizard state, schema migration,
 * resume detection, and persistence.
 *
 * State files: ~/.brewnet/projects/<name>/selections.json
 * Global config: ~/.brewnet/config.json (via conf package)
 *
 * @module wizard/state
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Conf from 'conf';
import { SCHEMA_VERSION } from '@brewnet/shared';
import type { WizardState } from '@brewnet/shared';
import { createDefaultWizardState } from '../config/defaults.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');
const PROJECTS_DIR = join(BREWNET_DIR, 'projects');

/**
 * Get the project directory for a given project name.
 */
export function getProjectDir(projectName: string): string {
  return join(PROJECTS_DIR, projectName);
}

/**
 * Get the state file path for a given project name.
 */
export function getStateFilePath(projectName: string): string {
  return join(getProjectDir(projectName), 'selections.json');
}

// ---------------------------------------------------------------------------
// Global Config (lazy-initialized)
// ---------------------------------------------------------------------------

interface GlobalConfig {
  lastProject: string;
}

let _globalConfig: Conf<GlobalConfig> | null = null;

function getGlobalConfig(): Conf<GlobalConfig> {
  if (!_globalConfig) {
    mkdirSync(BREWNET_DIR, { recursive: true });
    _globalConfig = new Conf<GlobalConfig>({
      cwd: BREWNET_DIR,
      configName: 'config',
      defaults: { lastProject: '' },
    });
  }
  return _globalConfig;
}

// ---------------------------------------------------------------------------
// State Operations
// ---------------------------------------------------------------------------

/**
 * Create a fresh default WizardState (schema v5).
 */
export function createState(): WizardState {
  return createDefaultWizardState();
}

/**
 * Check if a previous wizard session exists for the given project name.
 */
export function hasResumeState(projectName: string): boolean {
  return existsSync(getStateFilePath(projectName));
}

/**
 * Load wizard state from disk.
 *
 * Returns null if:
 * - No state file exists
 * - The state is corrupt/unparsable
 * - Schema version < current (migration = reset)
 *
 * NOTE: This performs lenient validation (schema version check only).
 * Full Zod validation happens at the Review step since in-progress
 * wizard states may have incomplete fields (e.g., empty passwords).
 */
export function loadState(projectName: string): WizardState | null {
  const filePath = getStateFilePath(projectName);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      logger.warn('wizard', 'Saved state is not an object', { projectName });
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    // Schema migration: v6 → v7 (frontend: array → single value | null)
    if (
      typeof obj.schemaVersion === 'number' &&
      obj.schemaVersion === 6
    ) {
      logger.warn(
        'wizard',
        `Schema version 6 detected — migrating to v7 (frontend array → single value)`,
        { projectName },
      );
      const devStack = obj.devStack as Record<string, unknown> | undefined;
      if (devStack && Array.isArray(devStack.frontend)) {
        const arr = devStack.frontend as string[];
        // Map old array values to new single values
        if (arr.includes('reactjs') || arr.includes('react')) {
          devStack.frontend = 'react';
        } else if (arr.includes('vuejs') || arr.includes('vue')) {
          devStack.frontend = 'vue';
        } else {
          devStack.frontend = null;
        }
      }
      obj.schemaVersion = SCHEMA_VERSION;
    }

    // Schema migration: version < current → reset
    if (
      typeof obj.schemaVersion === 'number' &&
      obj.schemaVersion < SCHEMA_VERSION
    ) {
      logger.warn(
        'wizard',
        `Schema version ${obj.schemaVersion} is outdated (current: ${SCHEMA_VERSION}). Resetting state.`,
        { projectName },
      );
      return null;
    }

    // Must have the current schema version
    if (obj.schemaVersion !== SCHEMA_VERSION) {
      logger.warn('wizard', 'Schema version mismatch', {
        projectName,
        found: obj.schemaVersion,
        expected: SCHEMA_VERSION,
      });
      return null;
    }

    // Backfill domainConnections for existing v7 state files (added in 003-domain-external-access)
    if (!Array.isArray(obj.domainConnections)) {
      obj.domainConnections = [];
    }

    return parsed as WizardState;
  } catch (err) {
    logger.warn('wizard', 'Failed to load saved state', {
      projectName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Save wizard state to disk.
 * Also updates the global config with the last active project name.
 */
export function saveState(state: WizardState): void {
  const dir = getProjectDir(state.projectName);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, 'selections.json');
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');

  try {
    getGlobalConfig().set('lastProject', state.projectName);
  } catch {
    // Non-critical: global config write failure doesn't block wizard
  }

  logger.info('wizard', 'State saved', { projectName: state.projectName });
}

/**
 * Reset state by creating a fresh default and saving it.
 */
export function resetState(projectName: string): WizardState {
  const state = createDefaultWizardState();
  const updated: WizardState = {
    ...state,
    projectName,
    projectPath: `~/brewnet/${projectName}`,
  };
  saveState(updated);
  return updated;
}

/**
 * Get the last active project name from global config.
 * Returns undefined if no project has been saved yet.
 */
export function getLastProject(): string | undefined {
  try {
    const last = getGlobalConfig().get('lastProject');
    return last || undefined;
  } catch {
    return undefined;
  }
}

/**
 * List all project names that have saved wizard state.
 */
export function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  try {
    return readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) =>
        existsSync(join(PROJECTS_DIR, entry.name, 'selections.json')),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Reset the global config singleton (for testing).
 * @internal
 */
export function _resetGlobalConfig(): void {
  _globalConfig = null;
}

// ---------------------------------------------------------------------------
// Project Auto-Discovery
// ---------------------------------------------------------------------------

function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Discover the project path without depending on ~/.brewnet/ files.
 *
 * Priority:
 *   1. Explicit CLI argument (highest)
 *   2. ~/.brewnet/config.json → lastProject → selections.json (legacy, best-effort)
 *   3. Filesystem scan: ~/brewnet/*\/.brewnet.db (most recently modified)
 *
 * Returns null only if no project can be found anywhere.
 */
export function discoverProjectPath(cliPath?: string): string | null {
  // 1. CLI argument
  if (cliPath) return expandTilde(cliPath);

  // 2. Legacy config.json → selections.json
  try {
    const last = getLastProject();
    if (last) {
      const state = loadState(last);
      if (state?.projectPath) {
        const pp = expandTilde(state.projectPath);
        if (existsSync(join(pp, '.brewnet.db'))) return pp;
        // DB doesn't exist yet but projectPath dir exists — still valid
        if (existsSync(pp)) return pp;
      }
    }
  } catch { /* config.json or selections.json missing — continue */ }

  // 3. Filesystem scan: ~/brewnet/*/.brewnet.db
  try {
    const brewnetRoot = join(homedir(), 'brewnet');
    if (existsSync(brewnetRoot)) {
      const entries = readdirSync(brewnetRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory());

      let bestPath: string | null = null;
      let bestMtime = 0;

      for (const entry of entries) {
        const dbPath = join(brewnetRoot, entry.name, '.brewnet.db');
        if (existsSync(dbPath)) {
          try {
            const stat = statSync(dbPath);
            if (stat.mtimeMs > bestMtime) {
              bestMtime = stat.mtimeMs;
              bestPath = join(brewnetRoot, entry.name);
            }
          } catch { /* skip unreadable */ }
        }
      }
      if (bestPath) return bestPath;

      // No DB files, but check for docker-compose.yml (pre-DB installations)
      for (const entry of entries) {
        const composePath = join(brewnetRoot, entry.name, 'docker-compose.yml');
        if (existsSync(composePath)) return join(brewnetRoot, entry.name);
      }
    }
  } catch { /* filesystem scan failed — continue */ }

  return null;
}
