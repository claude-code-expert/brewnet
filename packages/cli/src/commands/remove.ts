/**
 * brewnet remove <service> — Remove a service
 *
 * Removes a managed service from docker-compose.yml.
 * Use --purge to also delete associated volumes and configuration data.
 * Prompts for confirmation unless --force is specified.
 *
 * @module commands/remove
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { removeService } from '../services/service-manager.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Remove a service')
    .argument('<service>', 'Name of the service to remove')
    .option('--purge', 'Also remove associated volumes and configuration data')
    .option('--force', 'Skip confirmation prompt')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .action(async (service: string, options: { purge?: boolean; force?: boolean; path: string }) => {
      // Confirmation prompt unless --force is provided
      if (!options.force) {
        const purgeWarning = options.purge
          ? chalk.red(' (including all associated data volumes)')
          : '';
        const confirmed = await confirm({
          message: `Remove service ${chalk.cyan(service)}${purgeWarning}?`,
          default: false,
        });
        if (!confirmed) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }
      }

      const spinner = ora(`Removing service ${chalk.cyan(service)}...`).start();

      const result = await removeService(service, options.path, {
        purge: options.purge,
      });

      if (result.success) {
        spinner.succeed(
          `Service ${chalk.cyan(service)} removed from ${chalk.dim(result.composePath!)}`,
        );
        if (result.backupPath) {
          console.log(chalk.dim(`  Backup: ${result.backupPath}`));
        }
        if (options.purge) {
          console.log(chalk.yellow('  Associated volume entries have been removed from compose.'));
          console.log(
            chalk.yellow('  Run ') +
              chalk.bold('docker volume prune') +
              chalk.yellow(' to reclaim disk space.'),
          );
        }
        console.log(
          chalk.yellow(`\n  Run ${chalk.bold('brewnet up')} to apply the updated configuration.`),
        );
      } else {
        spinner.fail(chalk.red(result.error ?? 'Failed to remove service'));
        process.exitCode = 1;
      }
    });
}
