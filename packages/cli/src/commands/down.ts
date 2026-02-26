/**
 * brewnet down — Stop all services
 *
 * Stops all managed services via docker compose down.
 * Use --volumes to also remove associated Docker volumes.
 *
 * @module commands/down
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';

export function registerDownCommand(program: Command): void {
  program
    .command('down')
    .description('Stop all services')
    .option('--volumes', 'Also remove associated Docker volumes')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .action(async (options: { volumes?: boolean; path: string }) => {
      const spinner = ora('Stopping services...').start();

      try {
        const args = ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'down'];
        if (options.volumes) {
          args.push('--volumes');
        }

        const { stdout, stderr } = await execa('docker', args, {
          cwd: options.path,
        });

        spinner.succeed(chalk.green('All services stopped.'));

        if (stdout) {
          console.log(chalk.dim(stdout));
        }
        if (stderr) {
          console.log(chalk.dim(stderr));
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error stopping services';
        spinner.fail(chalk.red(`Failed to stop services: ${message}`));
        process.exitCode = 1;
      }
    });
}
