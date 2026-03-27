/**
 * brewnet export — Export project configuration as a portable archive
 *
 * Bundles the wizard state, docker-compose config, .env, and app registry
 * into a tar.gz archive for backup, migration, or sharing.
 *
 * Output: brewnet-export-<project>-<timestamp>.tar.gz
 *
 * @module commands/export
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  existsSync,
  mkdirSync,
  cpSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execa } from 'execa';
import { loadState, getLastProject, getStateFilePath } from '../wizard/state.js';
import { getDbPath } from '../services/db-manager.js';

// ---------------------------------------------------------------------------
// Core export logic
// ---------------------------------------------------------------------------

interface ExportResult {
  archivePath: string;
  sizeBytes: number;
  files: string[];
}

async function buildExport(projectName: string, outputDir: string): Promise<ExportResult> {
  const state = loadState(projectName);
  if (!state) {
    throw new Error(`No wizard state found for project "${projectName}". Run \`brewnet init\` first.`);
  }

  // Expand tilde in projectPath
  const projectPath = state.projectPath.replace(/^~/, homedir());

  // Prepare staging directory
  const stageDir = mkdtempSync(join(tmpdir(), 'brewnet-export-'));
  const configStage = join(stageDir, 'config');
  const composeStage = join(stageDir, 'compose');
  mkdirSync(configStage, { recursive: true });
  mkdirSync(composeStage, { recursive: true });

  const included: string[] = [];

  try {
    // --- config/ ---
    const stateFile = getStateFilePath(projectName);
    if (existsSync(stateFile)) {
      cpSync(stateFile, join(configStage, 'selections.json'));
      included.push('config/selections.json');
    }

    // Copy project SQLite DB (replaces legacy apps.json)
    const dbPath = getDbPath(projectPath);
    if (existsSync(dbPath)) {
      cpSync(dbPath, join(configStage, 'brewnet.db'));
      included.push('config/brewnet.db');
    }

    const boilerplateJson = join(projectPath, '.brewnet-boilerplate.json');
    if (existsSync(boilerplateJson)) {
      cpSync(boilerplateJson, join(configStage, 'boilerplate.json'));
      included.push('config/boilerplate.json');
    }

    // --- compose/ ---
    const composeFile = join(projectPath, 'docker-compose.yml');
    if (existsSync(composeFile)) {
      cpSync(composeFile, join(composeStage, 'docker-compose.yml'));
      included.push('compose/docker-compose.yml');
    }

    const envFile = join(projectPath, '.env');
    if (existsSync(envFile)) {
      cpSync(envFile, join(composeStage, '.env'));
      included.push('compose/.env');
    }

    // Build archive
    mkdirSync(outputDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `brewnet-export-${projectName}-${ts}.tar.gz`;
    const archivePath = join(outputDir, archiveName);

    await execa('tar', ['czf', archivePath, '-C', tmpdir(), basename(stageDir)]);

    const { size } = statSync(archivePath);
    return { archivePath, sizeBytes: size, files: included };
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export project configuration as a portable archive')
    .option('--project <name>', 'Project name to export (defaults to last project)')
    .option('-o, --output <dir>', 'Output directory for the archive', process.cwd())
    .action(async (options: { project?: string; output: string }) => {
      const projectName = options.project ?? getLastProject();
      if (!projectName) {
        console.error(chalk.red('No project found. Run `brewnet init` first or specify --project.'));
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Exporting project "${projectName}"...`).start();

      try {
        const result = await buildExport(projectName, options.output);
        const sizeMB = (result.sizeBytes / (1024 * 1024)).toFixed(2);

        spinner.succeed(`Export complete: ${chalk.cyan(basename(result.archivePath))}`);
        console.log(chalk.dim(`  Archive: ${result.archivePath}`));
        console.log(chalk.dim(`  Size:    ${sizeMB} MB`));
        console.log(chalk.dim(`  Files:   ${result.files.join(', ')}`));
      } catch (err) {
        spinner.fail('Export failed');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
}
