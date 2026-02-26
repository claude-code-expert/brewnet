/**
 * brewnet admin — Start local admin panel
 *
 * Starts a localhost HTTP server with a terminal-style dashboard
 * and REST API for managing running services.
 *
 * Default port: 8088  (override with --port)
 *
 * @module commands/admin
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createAdminServer } from '../services/admin-server.js';

export function registerAdminCommand(program: Command): void {
  program
    .command('admin')
    .description('Start the local admin panel at http://localhost:8088')
    .option('--port <port>', 'Port to listen on (default: 8088)', '8088')
    .option('-p, --path <path>', 'Project path (defaults to last init project)', '')
    .option('--no-open', 'Do not automatically open in browser')
    .action(async (options: { port: string; path: string; open: boolean }) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Invalid port number.'));
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Starting admin panel on port ${port}...`).start();

      const { start } = createAdminServer({
        port,
        projectPath: options.path || undefined,
      });

      try {
        await start();
        spinner.succeed(
          chalk.green(`Admin panel running at `) + chalk.cyan(`http://localhost:${port}`),
        );
        console.log(chalk.dim('  Press Ctrl+C to stop.\n'));

        // Auto-open in default browser
        if (options.open) {
          const url = `http://localhost:${port}`;
          try {
            const { execa } = await import('execa');
            const platform = process.platform;
            if (platform === 'darwin') {
              await execa('open', [url]);
            } else if (platform === 'linux') {
              await execa('xdg-open', [url]);
            } else if (platform === 'win32') {
              await execa('cmd', ['/c', 'start', url]);
            }
          } catch {
            // Browser open failure is non-fatal
          }
        }

        // Keep alive until Ctrl+C
        await new Promise<void>((resolve) => {
          process.once('SIGINT', resolve);
          process.once('SIGTERM', resolve);
        });

        console.log(chalk.dim('\nShutting down admin panel...'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('EADDRINUSE')) {
          spinner.fail(chalk.red(`Port ${port} is already in use. Try --port <other>`));
        } else {
          spinner.fail(chalk.red(`Failed to start admin panel: ${msg}`));
        }
        process.exitCode = 1;
      }
    });
}
