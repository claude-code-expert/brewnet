/**
 * brewnet storage — File storage backend management
 *
 * Subcommands:
 *   init     — Add a storage backend (interactive or --service flag)
 *   status   — Show installed storage backends
 *
 * @module commands/storage
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm } from '@inquirer/prompts';
import { homedir } from 'node:os';
import {
  initStorage,
  getInstalledStorageBackends,
  STORAGE_BACKENDS,
  type StorageBackend,
} from '../services/storage-manager.js';
import { getLastProject, loadState } from '../wizard/state.js';

// ---------------------------------------------------------------------------
// Backend display metadata
// ---------------------------------------------------------------------------

const BACKEND_META: Record<StorageBackend, { label: string; desc: string }> = {
  nextcloud: { label: 'Nextcloud', desc: 'Self-hosted cloud storage, calendar, contacts' },
  minio: { label: 'MinIO', desc: 'S3-compatible object storage' },
  filebrowser: { label: 'Filebrowser', desc: 'Simple web-based file manager' },
  jellyfin: { label: 'Jellyfin', desc: 'Media server (movies, music, photos)' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveProjectPath(optPath?: string): { path: string; password: string } | null {
  if (optPath) return { path: optPath.replace(/^~/, homedir()), password: '' };

  const lastProject = getLastProject();
  if (!lastProject) return null;

  const state = loadState(lastProject);
  if (!state) return null;

  return {
    path: state.projectPath.replace(/^~/, homedir()),
    password: state.admin?.password ?? '',
  };
}

// ---------------------------------------------------------------------------
// storage init
// ---------------------------------------------------------------------------

async function runStorageInit(options: {
  path?: string;
  service?: string;
  yes?: boolean;
}): Promise<void> {
  const project = resolveProjectPath(options.path);
  if (!project) {
    console.error(chalk.red('No project found. Run `brewnet init` first or specify --path.'));
    process.exitCode = 1;
    return;
  }

  // Choose backend
  let backend: StorageBackend;

  if (options.service) {
    if (!STORAGE_BACKENDS.includes(options.service as StorageBackend)) {
      console.error(
        chalk.red(`Unknown storage backend: "${options.service}". Valid: ${STORAGE_BACKENDS.join(', ')}`),
      );
      process.exitCode = 1;
      return;
    }
    backend = options.service as StorageBackend;
  } else {
    backend = await select<StorageBackend>({
      message: 'Choose a storage backend:',
      choices: STORAGE_BACKENDS.map((id) => ({
        value: id,
        name: `${BACKEND_META[id]!.label.padEnd(14)} ${chalk.dim(BACKEND_META[id]!.desc)}`,
      })),
    });
  }

  const meta = BACKEND_META[backend]!;

  // Collect credentials for backends that need them
  let adminPassword = project.password;
  let adminUsername = 'admin';
  let domain: string | undefined;

  const needsCreds = backend === 'nextcloud' || backend === 'minio';

  if (needsCreds && !options.yes) {
    adminUsername = await input({
      message: `${meta.label} admin username:`,
      default: 'admin',
    });
    if (!adminPassword) {
      adminPassword = await input({
        message: `${meta.label} admin password:`,
      });
    }
    if (backend === 'nextcloud') {
      domain = await input({
        message: 'Domain / hostname (for trusted domains):',
        default: 'localhost',
      });
    }
  }

  if (!options.yes) {
    const ok = await confirm({
      message: `Add ${meta.label} to project at ${project.path}?`,
    });
    if (!ok) {
      console.log(chalk.dim('Cancelled.'));
      return;
    }
  }

  const spinner = ora(`Adding ${meta.label}...`).start();

  try {
    const result = await initStorage(backend, {
      projectPath: project.path,
      adminUsername,
      adminPassword,
      domain,
    });

    if (!result.success) {
      spinner.fail(`Failed to add ${meta.label}: ${result.error}`);
      process.exitCode = 1;
      return;
    }

    spinner.succeed(`${meta.label} added to docker-compose.yml`);
    if (result.backupPath) {
      console.log(chalk.dim(`  Backup: ${result.backupPath}`));
    }
    if (result.envPatched) {
      console.log(chalk.dim(`  Credentials written to .env`));
    }
    if (backend === 'filebrowser' || backend === 'jellyfin') {
      console.log(chalk.dim(`  Configure ${meta.label} on first login via the web UI.`));
    }
    console.log('');
    console.log(chalk.dim('  Run ') + chalk.bold('brewnet up') + chalk.dim(' to start the service.'));
  } catch (err) {
    spinner.fail('Storage init failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// storage status
// ---------------------------------------------------------------------------

function runStorageStatus(options: { path?: string }): void {
  const project = resolveProjectPath(options.path);
  if (!project) {
    console.error(chalk.red('No project found. Run `brewnet init` first or specify --path.'));
    process.exitCode = 1;
    return;
  }

  const installed = getInstalledStorageBackends(project.path);
  const bullet = '\u25CF';

  console.log(chalk.bold('\nStorage Backends\n'));
  for (const backend of STORAGE_BACKENDS) {
    const meta = BACKEND_META[backend]!;
    const isInstalled = installed.includes(backend);
    const status = isInstalled
      ? chalk.green(`${bullet} Installed`)
      : chalk.dim(`${bullet} Not installed`);
    console.log(`  ${chalk.cyan(meta.label.padEnd(14))} ${meta.desc.padEnd(46)} ${status}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerStorageCommand(program: Command): void {
  const storage = program
    .command('storage')
    .description('Manage file storage backends');

  storage
    .command('init')
    .description('Add a file storage backend to the project')
    .option('-p, --path <path>', 'Project path (defaults to last project)')
    .option('-s, --service <name>', `Backend to install (${STORAGE_BACKENDS.join('|')})`)
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(runStorageInit);

  storage
    .command('status')
    .description('Show installed storage backends')
    .option('-p, --path <path>', 'Project path (defaults to last project)')
    .action(runStorageStatus);
}
