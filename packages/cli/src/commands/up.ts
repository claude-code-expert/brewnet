/**
 * brewnet up — Start all services
 *
 * Starts all managed services via docker compose up -d.
 *
 * @module commands/up
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';

export function registerUpCommand(program: Command): void {
  program
    .command('up')
    .description('Start all services')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('-d, --detach', 'Run in detached mode (default)', true)
    .action(async (options: { path: string; detach: boolean }) => {
      const spinner = ora('Starting services...').start();

      try {
        const { stdout, stderr } = await execa(
          'docker',
          ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'up', '-d'],
          { cwd: options.path },
        );

        spinner.succeed(chalk.green('All services started.'));

        if (stdout) {
          console.log(chalk.dim(stdout));
        }
        if (stderr) {
          // docker compose often writes progress to stderr
          console.log(chalk.dim(stderr));
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error starting services';
        spinner.fail(chalk.red(`Failed to start services: ${message}`));
        process.exitCode = 1;
      }
    });
}
