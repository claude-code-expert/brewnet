/**
 * brewnet backup — Create a backup
 *
 * Creates a backup of the project directory as a .tar.gz archive.
 * Includes service configurations, data, and the local SQLite database.
 *
 * @module commands/backup
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createBackup, listBackups, checkDiskSpace } from '../services/backup-manager.js';
import { isBrewnetError } from '../utils/errors.js';

const DEFAULT_BACKUPS_DIR = join(homedir(), '.brewnet', 'backups');

export function registerBackupCommand(program: Command): void {
  program
    .command('backup')
    .description('Create a backup')
    .option('-p, --path <path>', 'Project path to back up (defaults to current directory)', process.cwd())
    .option('--backups-dir <dir>', 'Directory to store backups', DEFAULT_BACKUPS_DIR)
    .option('--list', 'List existing backups instead of creating one')
    .action(async (options: { path: string; backupsDir: string; list?: boolean }) => {
      try {
        // List mode: display existing backups
        if (options.list) {
          const backups = listBackups(options.backupsDir);

          if (backups.length === 0) {
            console.log(chalk.yellow('No backups found.'));
            return;
          }

          console.log(chalk.bold(`\nBackups (${backups.length}):\n`));
          for (const backup of backups) {
            const date = new Date(backup.timestamp).toLocaleString();
            const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
            console.log(
              `  ${chalk.cyan(backup.id)}  ${chalk.dim(date)}  ${chalk.dim(sizeMB + ' MB')}  ${backup.projectName}`,
            );
          }
          console.log('');
          return;
        }

        // Check disk space before creating backup
        const diskCheck = checkDiskSpace(options.path);
        if (!diskCheck.sufficient) {
          console.log(chalk.red('Insufficient disk space for backup.'));
          process.exitCode = 1;
          return;
        }

        const spinner = ora('Creating backup...').start();

        const record = createBackup(options.path, options.backupsDir);

        const sizeMB = (record.size / (1024 * 1024)).toFixed(2);
        spinner.succeed(
          `Backup created: ${chalk.cyan(record.id)}`,
        );
        console.log(chalk.dim(`  Project:  ${record.projectName}`));
        console.log(chalk.dim(`  Archive:  ${record.path}`));
        console.log(chalk.dim(`  Size:     ${sizeMB} MB`));
        console.log('');
        console.log(
          chalk.dim(`  Restore with: `) +
            chalk.bold(`brewnet restore ${record.id}`),
        );
      } catch (err) {
        if (isBrewnetError(err)) {
          console.error(chalk.red(err.format()));
        } else {
          console.error(chalk.red('Backup failed:'), err instanceof Error ? err.message : err);
        }
        process.exitCode = 1;
      }
    });
}
