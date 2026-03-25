/**
 * brewnet update — Pull latest images and restart services
 *
 * Pulls the latest Docker images for all services and optionally
 * restarts them with the updated images.
 *
 * @module commands/update
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { checkDockerAvailability } from '../services/docker-manager.js';
import { BrewnetError } from '../utils/errors.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Pull latest images and restart services')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--no-restart', 'Pull images only, skip restarting services')
    .action(async (options: { path: string; restart: boolean }) => {
      try {
        // Step 1: Check Docker availability
        await checkDockerAvailability();

        // Step 2: Pull latest images
        const pullSpinner = ora('Pulling latest images...').start();
        try {
          const { stdout, stderr } = await execa(
            'docker',
            ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'pull'],
            { cwd: options.path },
          );

          pullSpinner.succeed(chalk.green('All images pulled successfully.'));

          if (stdout) {
            console.log(chalk.dim(stdout));
          }
          if (stderr) {
            console.log(chalk.dim(stderr));
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          if (message.includes('no configuration file') || message.includes('No such file')) {
            pullSpinner.fail(
              chalk.red(
                `No docker-compose file found in ${options.path}. Run ${chalk.cyan('brewnet init')} first.`,
              ),
            );
            process.exitCode = 1;
            return;
          }
          throw error;
        }

        // Step 3: Restart services (unless --no-restart)
        if (options.restart) {
          const restartSpinner = ora('Restarting services with new images...').start();
          try {
            await execa(
              'docker',
              [
                'compose',
                '-f',
                DOCKER_COMPOSE_FILENAME,
                'up',
                '-d',
                '--force-recreate',
                '--remove-orphans',
              ],
              { cwd: options.path },
            );

            restartSpinner.succeed(chalk.green('Services restarted with new images.'));
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            restartSpinner.fail(chalk.red(`Failed to restart services: ${message}`));
            process.exitCode = 1;
            return;
          }
        } else {
          console.log(
            chalk.yellow('\nSkipped restart (--no-restart). Run ') +
              chalk.cyan('brewnet up') +
              chalk.yellow(' to apply the new images.'),
          );
        }

        // Step 4: Quick health summary
        try {
          const { stdout: psOutput } = await execa(
            'docker',
            ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'ps', '--format', 'json'],
            { cwd: options.path },
          );

          if (psOutput.trim()) {
            // docker compose ps --format json outputs one JSON object per line
            const lines = psOutput.trim().split('\n');
            const containers = lines.flatMap((line) => {
              try { return [JSON.parse(line) as { State?: string }]; } catch { return []; }
            });
            const running = containers.filter(
              (c: { State?: string }) => c.State === 'running',
            ).length;
            const total = containers.length;

            console.log(
              chalk.cyan(`\n  Containers: ${running}/${total} running`),
            );
          }
        } catch {
          // Health summary is best-effort; don't fail the command
        }
      } catch (error: unknown) {
        if (error instanceof BrewnetError) {
          console.error(chalk.red(`\n${error.message}`));
        } else {
          const message =
            error instanceof Error ? error.message : 'Unknown error updating services';
          console.error(chalk.red(`\nFailed to update services: ${message}`));
        }
        process.exitCode = 1;
      }
    });
}
