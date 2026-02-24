/**
 * brewnet restore <backup-id> — Restore from backup
 *
 * Restores service configurations and data from a previously
 * created backup identified by its backup ID.
 *
 * @module commands/restore
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { restoreBackup, listBackups, checkDiskSpace } from '../services/backup-manager.js';
import { isBrewnetError } from '../utils/errors.js';

const DEFAULT_BACKUPS_DIR = join(homedir(), '.brewnet', 'backups');

export function registerRestoreCommand(program: Command): void {
  program
    .command('restore')
    .description('Restore from backup')
    .argument('<backup-id>', 'ID of the backup to restore')
    .option('-p, --path <path>', 'Target project path for restoration (defaults to current directory)', process.cwd())
    .option('--backups-dir <dir>', 'Directory where backups are stored', DEFAULT_BACKUPS_DIR)
    .option('--force', 'Skip confirmation prompt')
    .action(async (backupId: string, options: { path: string; backupsDir: string; force?: boolean }) => {
      try {
        // Validate backup ID format
        if (!backupId.startsWith('backup-')) {
          console.error(chalk.red(`Invalid backup ID format: ${backupId}`));
          console.error(chalk.dim('  Expected format: backup-<timestamp>-<random>'));
          console.error(chalk.dim('  List backups with: brewnet backup --list'));
          process.exitCode = 1;
          return;
        }

        // Check if backup exists by looking it up in the list
        const backups = listBackups(options.backupsDir);
        const backup = backups.find((b) => b.id === backupId);

        if (!backup) {
          console.error(chalk.red(`Backup not found: ${backupId}`));
          if (backups.length > 0) {
            console.error(chalk.dim('\nAvailable backups:'));
            for (const b of backups.slice(0, 5)) {
              console.error(chalk.dim(`  ${b.id}  ${b.projectName}`));
            }
          } else {
            console.error(chalk.dim('  No backups found in ' + options.backupsDir));
          }
          process.exitCode = 1;
          return;
        }

        // Check disk space
        const diskCheck = checkDiskSpace(options.path, backup.size);
        if (!diskCheck.sufficient) {
          console.error(chalk.red('Insufficient disk space for restore.'));
          const requiredMB = (backup.size / (1024 * 1024)).toFixed(2);
          const availableMB = (diskCheck.available / (1024 * 1024)).toFixed(2);
          console.error(chalk.dim(`  Required:  ${requiredMB} MB`));
          console.error(chalk.dim(`  Available: ${availableMB} MB`));
          process.exitCode = 1;
          return;
        }

        // Confirmation prompt unless --force is provided
        if (!options.force) {
          const date = new Date(backup.timestamp).toLocaleString();
          console.log('');
          console.log(chalk.bold('Restore details:'));
          console.log(chalk.dim(`  Backup:   ${backup.id}`));
          console.log(chalk.dim(`  Project:  ${backup.projectName}`));
          console.log(chalk.dim(`  Date:     ${date}`));
          console.log(chalk.dim(`  Target:   ${options.path}`));
          console.log('');

          const confirmed = await confirm({
            message: `Restore backup ${chalk.cyan(backupId)} to ${chalk.cyan(options.path)}?`,
            default: false,
          });
          if (!confirmed) {
            console.log(chalk.dim('Cancelled.'));
            return;
          }
        }

        const spinner = ora(`Restoring backup ${chalk.cyan(backupId)}...`).start();

        restoreBackup(backupId, options.backupsDir, options.path);

        spinner.succeed(`Backup ${chalk.cyan(backupId)} restored to ${chalk.dim(options.path)}`);
        console.log(
          chalk.yellow(`\n  Run ${chalk.bold('brewnet up')} to start services with the restored configuration.`),
        );
      } catch (err) {
        if (isBrewnetError(err)) {
          console.error(chalk.red(err.format()));
        } else {
          console.error(chalk.red('Restore failed:'), err instanceof Error ? err.message : err);
        }
        process.exitCode = 1;
      }
    });
}
