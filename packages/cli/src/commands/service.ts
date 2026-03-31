/**
 * brewnet service — OS-level auto-start service management
 *
 * Subcommands:
 *   install    Register admin server as a boot-time OS service
 *   uninstall  Remove the OS service
 *   status     Show whether the service is installed
 *
 * Supports:
 *   macOS  ~/Library/LaunchAgents/com.brewnet.admin.plist
 *   Linux  ~/.config/systemd/user/brewnet-admin.service
 *
 * @module commands/service
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  installBrewnetService,
  uninstallBrewnetService,
  isBrewnetServiceInstalled,
} from '../services/system-service.js';

/** Resolve the absolute path to the running brewnet binary. */
function getBrewnetBin(): string {
  return process.argv[1] ?? 'brewnet';
}

export function registerServiceCommand(program: Command): void {
  const service = program
    .command('service')
    .description('Manage the brewnet admin server OS service (auto-start on boot)');

  // ── install ──────────────────────────────────────────────────────────────
  service
    .command('install')
    .description('Register admin server as a boot-time OS service')
    .option('-p, --path <path>', 'Project path forwarded to the service', '')
    .option('--port <port>', 'Admin panel port (default: 8088)', '8088')
    .action(async (options: { path: string; port: string }) => {
      if (isBrewnetServiceInstalled()) {
        console.log(chalk.yellow('  Brewnet service is already installed.'));
        console.log(chalk.dim('  Run "brewnet service uninstall" to remove it first.'));
        return;
      }

      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Invalid port number.'));
        process.exitCode = 1;
        return;
      }

      console.log(chalk.dim('  Installing brewnet admin service...'));
      try {
        await installBrewnetService({
          brewnetBin: getBrewnetBin(),
          port,
          projectPath: options.path || undefined,
        });
        console.log(chalk.green('  ✓ Brewnet admin service installed.'));
        console.log(chalk.dim('    The admin server will start automatically on login/boot.'));
        console.log(chalk.dim('    Run "brewnet service uninstall" to remove.'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  Failed to install service: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── uninstall ─────────────────────────────────────────────────────────────
  service
    .command('uninstall')
    .description('Remove the brewnet admin server OS service')
    .action(async () => {
      try {
        const removed = await uninstallBrewnetService();
        if (!removed) {
          console.log(chalk.dim('  No service installed — nothing to remove.'));
          return;
        }
        console.log(chalk.green('  ✓ Brewnet admin service removed.'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  Failed to uninstall service: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── status ────────────────────────────────────────────────────────────────
  service
    .command('status')
    .description('Show whether the brewnet admin server OS service is installed')
    .action(() => {
      const installed = isBrewnetServiceInstalled();
      if (installed) {
        console.log(chalk.green('  ✓ Brewnet admin service is installed and enabled.'));
      } else {
        console.log(chalk.dim('  Brewnet admin service is not installed.'));
        console.log(chalk.dim('    Run "brewnet service install" to set up auto-start.'));
      }
    });
}
