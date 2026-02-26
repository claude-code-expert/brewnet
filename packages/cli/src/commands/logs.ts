/**
 * brewnet logs [service] — View service logs
 *
 * Displays logs for all services or a specific one via docker compose logs.
 * Use -f/--follow to stream logs in real time.
 * Use -n/--tail to limit the number of lines shown.
 *
 * @module commands/logs
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .description('View service logs')
    .argument('[service]', 'Name of a specific service (shows all if omitted)')
    .option('-f, --follow', 'Follow log output in real time')
    .option('-n, --tail <lines>', 'Number of lines to show from the end of the logs')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .action(async (service: string | undefined, options: { follow?: boolean; tail?: string; path: string }) => {
      try {
        const args = ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'logs'];

        if (options.follow) {
          args.push('--follow');
        }
        if (options.tail) {
          args.push('--tail', options.tail);
        }
        if (service) {
          args.push(service);
        }

        // Stream logs directly to stdout/stderr using inherit
        await execa('docker', args, {
          cwd: options.path,
          stdio: 'inherit',
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error fetching logs';
        console.error(chalk.red(`Failed to fetch logs: ${message}`));
        process.exitCode = 1;
      }
    });
}
