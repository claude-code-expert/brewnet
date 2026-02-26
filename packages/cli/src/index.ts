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
import { registerUninstallCommand } from './commands/uninstall.js';

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
    .version('1.0.1')
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
  registerUninstallCommand(program);

  return program;
}

// ---------------------------------------------------------------------------
// Direct execution (not imported as a module)
// ---------------------------------------------------------------------------

// Detect if this file is being run directly (not imported by tests).
// Using import.meta.url to check if this is the entry point.
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  const program = createProgram();
  program.parse(process.argv);
}
