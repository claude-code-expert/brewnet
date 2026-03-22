/**
 * Brewnet CLI — Entry Point
 *
 * Exports `createProgram()` which builds and returns the Commander.js
 * program with all subcommands registered. The program is NOT parsed
 * here so that tests can inspect it without triggering side effects.
 *
 * @module cli/index
 */

import { Command } from 'commander';

declare const __CLI_VERSION__: string;
import { registerInitCommand } from './commands/init.js';
import { registerStatusCommand } from './commands/status.js';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerUpCommand } from './commands/up.js';
import { registerDownCommand } from './commands/down.js';
import { registerLogsCommand } from './commands/logs.js';
import { registerBackupCommand } from './commands/backup.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerAdminCommand } from './commands/admin.js';
import { registerShutdownCommand } from './commands/shutdown.js';
import { registerUninstallCommand } from './commands/uninstall.js';
import { registerDomainCommand } from './commands/domain.js';
import { registerCreateAppCommand } from './commands/create-app.js';

/**
 * Build and return a fully configured Commander.js program with all
 * Brewnet CLI subcommands registered.
 *
 * The caller is responsible for invoking `program.parse()` when ready
 * to execute (this keeps the function pure and testable).
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('brewnet')
    .description('Your Home Server, Brewed Fresh')
    .version(__CLI_VERSION__)
    .showHelpAfterError('(run "brewnet --help" for usage information)');

  // Register all subcommands
  registerInitCommand(program);
  registerStatusCommand(program);
  registerAddCommand(program);
  registerRemoveCommand(program);
  registerUpCommand(program);
  registerDownCommand(program);
  registerLogsCommand(program);
  registerBackupCommand(program);
  registerRestoreCommand(program);
  registerAdminCommand(program);
  registerShutdownCommand(program);
  registerUninstallCommand(program);
  registerDomainCommand(program);
  registerCreateAppCommand(program);

  return program;
}

// ---------------------------------------------------------------------------
// Direct execution (not imported as a module)
// ---------------------------------------------------------------------------

// Detect if this file is being run directly (not imported by tests).
// In test environments, NODE_ENV or VITEST/JEST globals are set.
// For all other cases (npm global, npx, direct node invocation), parse immediately.
const isTestEnv =
  typeof process !== 'undefined' &&
  (process.env['NODE_ENV'] === 'test' ||
   process.env['JEST_WORKER_ID'] !== undefined ||
   process.env['VITEST'] !== undefined);

if (!isTestEnv) {
  (async () => {
    const program = createProgram();
    // No subcommand + fresh install → auto-start init wizard
    const userArgs = process.argv.slice(2);
    if (userArgs.length === 0) {
      const { getLastProject } = await import('./wizard/state.js');
      const last = getLastProject();
      if (!last) {
        process.argv.push('init');
      }
    }
    await program.parseAsync(process.argv);
  })();
}
