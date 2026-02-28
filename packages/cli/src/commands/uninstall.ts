/**
 * brewnet uninstall — Complete uninstall
 *
 * Removes all Brewnet services, volumes, networks, project files,
 * and ~/.brewnet metadata. Accepts --dry-run, --keep-data,
 * --keep-config, and --force flags.
 *
 * @module commands/uninstall
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import {
  buildUninstallTargets,
  listInstallations,
  runUninstall,
} from '../services/uninstall-manager.js';
import { getLastProject, loadState } from '../wizard/state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printTargets(
  targets: ReturnType<typeof buildUninstallTargets>,
): void {
  for (const t of targets) {
    const tag = t.skipped
      ? chalk.dim(`  [skip] ${t.label} (${t.skipReason ?? 'preserved'})`)
      : chalk.red(`  [remove] ${t.label}`);
    console.log(tag);
  }
}

// ---------------------------------------------------------------------------
// Command registration (T114 + T115)
// ---------------------------------------------------------------------------

export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('Remove all Brewnet services, volumes, and project files')
    .option('--dry-run', 'List what would be removed without making changes')
    .option('--keep-data', 'Preserve Docker volumes (database and file data)')
    .option('--keep-config', 'Preserve project directory (stop containers only)')
    .option('--force', 'Skip confirmation prompt')
    .action(
      async (options: {
        dryRun: boolean;
        keepData: boolean;
        keepConfig: boolean;
        force: boolean;
      }) => {
        // --- Gather project info ---
        const installations = listInstallations();
        const lastProject = getLastProject();
        const state = lastProject ? loadState(lastProject) : null;

        // --- Dry-run banner ---
        if (options.dryRun) {
          console.log(chalk.cyan('\nDry-run mode — no changes will be made.\n'));
        }

        // --- Show what is installed ---
        if (installations.length === 0) {
          console.log(chalk.yellow('No Brewnet installations found.'));
          console.log(chalk.dim(
            '  If Docker containers are still running, stop them manually:\n' +
            '  docker ps  →  docker compose down (in your project directory)',
          ));
          return;
        }

        console.log(chalk.bold('\nInstalled projects:'));
        for (const inst of installations) {
          const isCurrent = inst.name === lastProject;
          console.log(
            `  ${isCurrent ? chalk.green('▶') : ' '} ${chalk.cyan(inst.name)}  ${chalk.dim(inst.path ?? '(path unknown)')}`,
          );
        }

        // --- Build target list ---
        const projectPath = state?.projectPath ?? null;
        const targets = buildUninstallTargets(projectPath, {
          keepData: options.keepData,
          keepConfig: options.keepConfig,
        });

        console.log(chalk.bold('\nThe following will be removed:'));
        printTargets(targets);

        if (!options.keepData) {
          console.log(
            chalk.yellow(
              '\n  ⚠  WARNING: Database and file server data will be permanently deleted.',
            ),
          );
          console.log(chalk.dim('     Use --keep-data to preserve volumes.'));
        }

        // --- Dry-run: stop here ---
        if (options.dryRun) {
          console.log(chalk.dim('\nDry-run complete. No changes made.'));
          return;
        }

        // --- Confirmation prompt (skip with --force) ---
        if (!options.force) {
          let confirmed = false;
          try {
            confirmed = await confirm({
              message: chalk.red('Proceed with uninstall? This cannot be undone.'),
              default: false,
            });
          } catch {
            // Ctrl+C or non-interactive
            console.log(chalk.dim('\nAborted.'));
            return;
          }

          if (!confirmed) {
            console.log(chalk.dim('Aborted.'));
            return;
          }
        }

        // --- Run uninstall ---
        console.log('');
        const result = await runUninstall({
          keepData: options.keepData,
          keepConfig: options.keepConfig,
          force: options.force,
          projectPath: projectPath ?? undefined,
          projectName: lastProject,
        });

        // --- Display results ---
        for (const item of result.removed) {
          console.log(`  ${chalk.green('✓')} Removed: ${item}`);
        }
        for (const item of result.skipped) {
          console.log(`  ${chalk.dim('○')} Skipped: ${chalk.dim(item)}`);
        }
        for (const err of result.errors) {
          console.log(`  ${chalk.red('✗')} Error: ${chalk.red(err)}`);
        }

        if (result.success) {
          console.log(chalk.green('\n✓ Uninstall complete.\n'));
        } else {
          console.log(chalk.yellow('\n⚠  Uninstall completed with errors.\n'));
          process.exitCode = 1;
        }

        // --- Cloudflare notice ---
        console.log(
          chalk.dim(
            '  Note: Cloudflare Tunnel records are not automatically removed.\n' +
              '        Delete them manually at https://dash.cloudflare.com\n',
          ),
        );

        // --- Re-install hint ---
        console.log(
          chalk.dim(
            '  To reinstall, run:\n' +
              `  ${chalk.bold('curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash')}`,
          ),
        );
      },
    );
}
