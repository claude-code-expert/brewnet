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
 */
function resolveProject(options: UninstallOptions): {
  projectPath: string | null;
  projectName: string | null;
} {
  if (options.projectPath) {
    return { projectPath: options.projectPath, projectName: options.projectName ?? null };
  }

  const lastProject = getLastProject();
  if (!lastProject) return { projectPath: null, projectName: null };

  const state = loadState(lastProject);
  if (!state) return { projectPath: null, projectName: lastProject };

  return { projectPath: state.projectPath, projectName: state.projectName };
}

/**
 * Build the list of targets that would be removed.
 */
export function buildUninstallTargets(
  projectPath: string | null,
  options: UninstallOptions,
): UninstallTarget[] {
  const targets: UninstallTarget[] = [];

  // 1. Docker containers + optionally volumes
  if (projectPath && existsSync(join(projectPath, DOCKER_COMPOSE_FILENAME))) {
    targets.push({
      label: `Docker containers${options.keepData ? '' : ' + volumes'}`,
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

  // 4. ~/.brewnet/status and ~/.brewnet/state
  const statusDir = join(BREWNET_DIR, 'status');
  const stateDir = join(BREWNET_DIR, 'state');

  for (const [label, dir] of [
    ['~/.brewnet/status', statusDir],
    ['~/.brewnet/state', stateDir],
  ] as [string, string][]) {
    if (existsSync(dir)) {
      targets.push({ label, path: dir, type: 'brewnet-meta' });
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
      if (!options.keepData) downArgs.push('--volumes');

      await execa('docker', downArgs, { cwd: projectPath });
      result.removed.push(`Docker containers${options.keepData ? '' : ' + volumes'}`);
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
      reject: false, // networks may not exist — ignore exit code
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

  // --- 4. ~/.brewnet/status + state ---
  for (const [label, dir] of [
    ['~/.brewnet/status', join(BREWNET_DIR, 'status')],
    ['~/.brewnet/state', join(BREWNET_DIR, 'state')],
  ] as [string, string][]) {
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        result.removed.push(label);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`rm ${dir}: ${msg}`);
      }
    }
  }

  // --- 5. Clean up wizard state entry ---
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

  if (result.errors.length > 0) result.success = false;
  return result;
}

/**
 * List all project names + paths that can be uninstalled,
 * by scanning ~/.brewnet/projects/.
 */
export function listInstallations(): { name: string; path: string | null }[] {
  const projectsDir = join(BREWNET_DIR, 'projects');
  if (!existsSync(projectsDir)) return [];

  try {
    return readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const state = loadState(e.name);
        return { name: e.name, path: state?.projectPath ?? null };
      });
  } catch {
    return [];
  }
}
