/**
 * brewnet start — Start all services and the admin panel in one command
 *
 * Equivalent to running:
 *   1. docker compose up -d   (all managed services)
 *   2. brewnet admin           (admin panel daemon)
 *
 * This is the recommended command after a system reboot.
 * Named Tunnel and Docker services with restart:unless-stopped
 * will already be running if Docker daemon started automatically,
 * but this command ensures everything is up regardless.
 *
 * @module commands/start
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { launchAdminDaemon } from '../services/admin-launcher.js';
import { discoverProjectPath } from '../wizard/state.js';

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start all services and admin panel (use after reboot)')
    .option('-p, --path <path>', 'Project path (defaults to last init project)', '')
    .option('--port <port>', 'Admin panel port (default: 8088)', '8088')
    .option('--no-open', 'Do not automatically open browser')
    .action(async (options: { path: string; port: string; open: boolean }) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Invalid port number.'));
        process.exitCode = 1;
        return;
      }

      // Resolve project path: explicit --path > discovered > cwd
      const resolvedPath =
        options.path ||
        discoverProjectPath(options.path || undefined) ||
        process.cwd();

      // ── Step 1: Docker compose up ──────────────────────────────────────
      const composeSpinner = ora('Starting Docker services...').start();
      try {
        const { stdout, stderr } = await execa(
          'docker',
          ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'up', '-d'],
          { cwd: resolvedPath },
        );
        composeSpinner.succeed(chalk.green('Docker services started.'));
        if (stdout) console.log(chalk.dim(stdout));
        if (stderr) console.log(chalk.dim(stderr));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        composeSpinner.fail(chalk.red(`Failed to start Docker services: ${msg}`));
        process.exitCode = 1;
        return;
      }

      // ── Step 2: Admin server ───────────────────────────────────────────
      const adminSpinner = ora('Starting admin panel...').start();
      try {
        const result = await launchAdminDaemon({ port, projectPath: resolvedPath });

        adminSpinner.succeed(
          chalk.green('Admin panel running at ') +
          chalk.cyan(`http://localhost:${port}`) +
          chalk.dim(` (PID ${result.pid})`),
        );
        console.log(chalk.dim(`  Log: ${result.logFile}`));
        console.log();

        if (options.open) {
          try {
            const cmd =
              process.platform === 'darwin'
                ? 'open'
                : process.platform === 'linux'
                  ? 'xdg-open'
                  : 'cmd';
            const args =
              process.platform === 'win32'
                ? ['/c', 'start', `http://localhost:${port}`]
                : [`http://localhost:${port}`];
            await execa(cmd, args);
          } catch { /* best-effort */ }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        adminSpinner.fail(chalk.red(`Failed to start admin panel: ${msg}`));
        process.exitCode = 1;
      }
    });
}
