/**
 * Brewnet CLI — Uninstall Manager (T113)
 *
 * Handles complete removal of a Brewnet project:
 *   1. docker compose down (optionally --volumes)
 *   2. docker network rm brewnet brewnet-internal
 *   3. rm -rf {projectPath}  (unless --keep-config)
 *   4. rm -rf ~/.brewnet/status ~/.brewnet/state
 *
 * Supports --dry-run (no changes), --keep-data (preserve volumes),
 * --keep-config (preserve projectPath files), and --force (skip confirm).
 *
 * @module services/uninstall-manager
 */

import { existsSync, rmSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';

/**
 * Augment PATH with common Docker / Homebrew install locations.
 * Mirrors docker-installer.ts augmentedEnv() to fix PATH issues in uninstall.
 */
function augmentedEnv(): NodeJS.ProcessEnv {
  const base = process.env['PATH'] ?? '/usr/bin:/bin:/usr/sbin:/sbin';
  const extra = '/usr/local/bin:/opt/homebrew/bin';
  const combined = extra
    .split(':')
    .filter((p) => !base.split(':').includes(p))
    .concat(base.split(':'))
    .join(':');
  return { ...process.env, PATH: combined };
}

/**
 * Expand a leading `~` to the user's home directory.
 * All paths stored in WizardState use `~/...` for portability.
 * Node.js fs functions and execa do NOT expand `~` automatically.
 */
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}
import { getLastProject, loadState, getProjectDir } from '../wizard/state.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UninstallOptions {
  /** List targets but make no changes. */
  dryRun?: boolean;
  /** Preserve Docker named volumes (databases, file data). */
  keepData?: boolean;
  /** Preserve project directory (only stop containers). */
  keepConfig?: boolean;
  /** Skip confirmation prompt (for CLI --force flag). */
  force?: boolean;
  /** Override project path (defaults to last saved project). */
  projectPath?: string;
  /** Override project name (used to find wizard state). */
  projectName?: string;
}

export interface UninstallTarget {
  label: string;
  path: string;
  type: 'compose' | 'network' | 'directory' | 'brewnet-meta';
  skipped?: boolean;
  skipReason?: string;
}

export interface UninstallResult {
  success: boolean;
  removed: string[];
  skipped: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');

/**
 * Resolve project path + name from options or the last saved wizard state.
 * Always expands `~` so downstream fs / execa calls get an absolute path.
 */
function resolveProject(options: UninstallOptions): {
  projectPath: string | null;
  projectName: string | null;
} {
  if (options.projectPath) {
    return {
      projectPath: expandPath(options.projectPath),
      projectName: options.projectName ?? null,
    };
  }

  const lastProject = getLastProject();
  if (!lastProject) return { projectPath: null, projectName: null };

  const state = loadState(lastProject);
  if (!state) return { projectPath: null, projectName: lastProject };

  return {
    projectPath: expandPath(state.projectPath),
    projectName: state.projectName,
  };
}

/**
 * Build the list of targets that would be removed.
 */
export function buildUninstallTargets(
  projectPath: string | null,
  options: UninstallOptions,
): UninstallTarget[] {
  const targets: UninstallTarget[] = [];
  // Expand tilde so existsSync works on the real path
  if (projectPath) projectPath = expandPath(projectPath);

  // 1. Docker containers + optionally volumes
  if (projectPath && existsSync(join(projectPath, DOCKER_COMPOSE_FILENAME))) {
    targets.push({
      label: `Docker containers${options.keepData ? '' : ' + volumes + images'}`,
      path: join(projectPath, DOCKER_COMPOSE_FILENAME),
      type: 'compose',
    });
  }

  // 2. Docker networks
  targets.push({
    label: 'Docker networks: brewnet, brewnet-internal',
    path: 'docker network rm',
    type: 'network',
  });

  // 3. Project directory
  if (projectPath) {
    targets.push({
      label: `Project directory: ${projectPath}`,
      path: projectPath,
      type: 'directory',
      skipped: options.keepConfig,
      skipReason: options.keepConfig ? '--keep-config' : undefined,
    });
  }

  // 4. Entire ~/.brewnet/ directory
  if (existsSync(BREWNET_DIR)) {
    targets.push({
      label: '~/.brewnet/ (all data, source, config)',
      path: BREWNET_DIR,
      type: 'brewnet-meta',
    });
  }

  // 5. CLI binary (check all known install locations)
  const possibleBins = [
    join(homedir(), '.local', 'bin', 'brewnet'),
    '/usr/local/bin/brewnet',
    '/usr/bin/brewnet',
  ];
  for (const bin of possibleBins) {
    if (existsSync(bin)) {
      targets.push({ label: `CLI binary: ${bin}`, path: bin, type: 'brewnet-meta' });
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Main uninstall function
// ---------------------------------------------------------------------------

/**
 * Perform (or simulate) the full uninstall sequence.
 *
 * @param options - Control flags for dry-run, data/config preservation.
 * @returns UninstallResult with lists of removed, skipped, and errored items.
 */
export async function runUninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
  const result: UninstallResult = { success: true, removed: [], skipped: [], errors: [] };

  const { projectPath, projectName } = resolveProject(options);
  const targets = buildUninstallTargets(projectPath, options);

  // Dry-run: just return the target list without making changes
  if (options.dryRun) {
    for (const t of targets) {
      if (t.skipped) {
        result.skipped.push(`${t.label} (${t.skipReason ?? 'skipped'})`);
      } else {
        result.removed.push(t.label);
      }
    }
    return result;
  }

  // --- 1. docker compose down ---
  if (projectPath && existsSync(join(projectPath, DOCKER_COMPOSE_FILENAME))) {
    try {
      const downArgs = ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'down'];
      if (!options.keepData) {
        downArgs.push('--volumes', '--rmi', 'all');
      }

      await execa('docker', downArgs, { cwd: projectPath, env: augmentedEnv() });
      result.removed.push(`Docker containers${options.keepData ? '' : ' + volumes + images'}`);
      logger.info('uninstall', 'docker compose down succeeded', { projectPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Non-fatal: containers may already be stopped
      result.errors.push(`docker compose down: ${msg}`);
      logger.warn('uninstall', 'docker compose down failed (continuing)', { error: msg });
    }
  }

  // --- 2. docker network rm ---
  try {
    await execa('docker', ['network', 'rm', 'brewnet', 'brewnet-internal'], {
      reject: false,
      env: augmentedEnv(),
    });
    result.removed.push('Docker networks: brewnet, brewnet-internal');
  } catch {
    result.skipped.push('Docker networks (not found or already removed)');
  }

  // --- 3. project directory ---
  if (projectPath && !options.keepConfig) {
    if (existsSync(projectPath)) {
      try {
        rmSync(projectPath, { recursive: true, force: true });
        result.removed.push(`Project directory: ${projectPath}`);
        logger.info('uninstall', 'Project directory removed', { projectPath });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`rm ${projectPath}: ${msg}`);
        result.success = false;
      }
    } else {
      result.skipped.push(`Project directory not found: ${projectPath}`);
    }
  } else if (options.keepConfig) {
    result.skipped.push(`Project directory preserved (--keep-config): ${projectPath ?? 'n/a'}`);
  }

  // --- 4. Remove entire ~/.brewnet/ directory ---
  if (existsSync(BREWNET_DIR)) {
    try {
      rmSync(BREWNET_DIR, { recursive: true, force: true });
      result.removed.push('~/.brewnet/ (all data, source, config)');
      logger.info('uninstall', 'Brewnet data directory removed', { dir: BREWNET_DIR });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`rm ${BREWNET_DIR}: ${msg}`);
    }
  }

  // --- 5. Remove wizard state entry (fallback if ~/.brewnet/ was partially deleted) ---
  if (projectName) {
    const projectStateDir = getProjectDir(projectName);
    if (existsSync(projectStateDir)) {
      try {
        rmSync(projectStateDir, { recursive: true, force: true });
        result.removed.push(`Wizard state: ~/.brewnet/projects/${projectName}`);
      } catch {
        // non-critical
      }
    }
  }

  // --- 5.5. Remove CLI binary from all known install locations ---
  const possibleBins = [
    join(homedir(), '.local', 'bin', 'brewnet'),
    '/usr/local/bin/brewnet',
    '/usr/bin/brewnet',
  ];
  for (const bin of possibleBins) {
    if (existsSync(bin)) {
      try {
        rmSync(bin, { force: true });
        result.removed.push(`CLI binary: ${bin}`);
        logger.info('uninstall', 'CLI binary removed', { bin });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`rm ${bin}: ${msg} (may need sudo)`);
      }
    }
  }

  if (result.errors.length > 0) result.success = false;
  return result;
}

/**
 * Lightweight cleanup for wizard restart: stop containers, remove networks
 * and project directory. Does NOT remove ~/.brewnet/ metadata or CLI binary.
 */
export async function cleanupForRestart(projectPath: string): Promise<void> {
  const expanded = expandPath(projectPath);
  const composePath = join(expanded, DOCKER_COMPOSE_FILENAME);

  // 1. Docker compose down --volumes --remove-orphans
  if (existsSync(composePath)) {
    try {
      await execa('docker', [
        'compose', '-f', composePath, 'down', '--volumes', '--remove-orphans',
      ], { env: augmentedEnv() });
    } catch {
      // best effort — containers may already be stopped
    }
  }

  // 2. Remove docker networks
  for (const netName of ['brewnet', 'brewnet-internal']) {
    try {
      await execa('docker', ['network', 'rm', netName], { env: augmentedEnv() });
    } catch {
      // best effort — network may not exist
    }
  }

  // 3. Remove project directory
  if (existsSync(expanded)) {
    try {
      rmSync(expanded, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

/**
 * List all project names + paths that can be uninstalled.
 *
 * Discovery order (deduplicates by absolute path):
 *   1. Wizard state: ~/.brewnet/projects/
 *   2. Filesystem scan: ~/brewnet/* /docker-compose.yml
 *   3. Docker containers: running brewnet-* containers → label/compose project
 */
export function listInstallations(): { name: string; path: string | null }[] {
  const seen = new Set<string>(); // absolute paths already added
  const results: { name: string; path: string | null }[] = [];

  const addIfNew = (name: string, rawPath: string | null) => {
    const absPath = rawPath ? expandPath(rawPath) : null;
    const key = absPath ?? `__name__${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ name, path: rawPath });
  };

  // --- 1. Wizard state: ~/.brewnet/projects/ ---
  const projectsDir = join(BREWNET_DIR, 'projects');
  if (existsSync(projectsDir)) {
    try {
      for (const e of readdirSync(projectsDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const state = loadState(e.name);
        addIfNew(e.name, state?.projectPath ?? null);
      }
    } catch { /* best-effort */ }
  }

  // --- 2. Filesystem scan: ~/brewnet/*/docker-compose.yml ---
  const brewnetRoot = join(homedir(), 'brewnet');
  if (existsSync(brewnetRoot)) {
    try {
      for (const e of readdirSync(brewnetRoot, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const composePath = join(brewnetRoot, e.name, DOCKER_COMPOSE_FILENAME);
        if (existsSync(composePath)) {
          addIfNew(e.name, `~/brewnet/${e.name}`);
        }
      }
    } catch { /* best-effort */ }
  }

  return results;
}
