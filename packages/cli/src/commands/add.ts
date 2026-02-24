/**
 * brewnet add <service> — Add a service
 *
 * Adds a Docker-based service (e.g., jellyfin, nextcloud) to the project.
 * Looks up the service in SERVICE_REGISTRY, updates docker-compose.yml,
 * and creates a backup before any modification.
 *
 * @module commands/add
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { addService } from '../services/service-manager.js';

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Add a service')
    .argument('<service>', 'Name of the service to add (e.g., jellyfin, nextcloud)')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .action(async (service: string, options: { path: string }) => {
      const spinner = ora(`Adding service ${chalk.cyan(service)}...`).start();

      const result = await addService(service, options.path);

      if (result.success) {
        spinner.succeed(
          `Service ${chalk.cyan(service)} added to ${chalk.dim(result.composePath!)}`,
        );
        if (result.backupPath) {
          console.log(chalk.dim(`  Backup: ${result.backupPath}`));
        }
        console.log(
          chalk.yellow(`\n  Run ${chalk.bold('brewnet up')} to start the updated services.`),
        );
      } else {
        spinner.fail(chalk.red(result.error ?? 'Failed to add service'));
        process.exitCode = 1;
      }
    });
}
