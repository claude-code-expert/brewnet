/**
 * brewnet init — Interactive setup wizard (T047, T073, T074)
 *
 * Runs the 7-step wizard to initialize a new Brewnet project.
 * Supports --config for pre-populated config and --non-interactive
 * for CI/scripted usage.
 *
 * Steps:
 *   Step 0: System Check
 *   Step 1: Project Setup
 *   Step 2: Server Components (T052-T058)
 *   Step 3: Dev Stack & Runtime (placeholder — not yet implemented)
 *   Step 4: Domain & Network (placeholder — not yet implemented)
 *   Step 5: Review & Confirm (T070)
 *   Step 6: Generate & Start (T071)
 *   Step 7: Complete (T072)
 *
 * @module commands/init
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { runSystemCheckStep } from '../wizard/steps/system-check.js';
import { runProjectSetupStep } from '../wizard/steps/project-setup.js';
import { runServerComponentsStep } from '../wizard/steps/server-components.js';
import { runDevStackStep } from '../wizard/steps/dev-stack.js';
import { runDomainNetworkStep } from '../wizard/steps/domain-network.js';
import { runReviewStep, importConfig } from '../wizard/steps/review.js';
import { runGenerateStep } from '../wizard/steps/generate.js';
import { runCompleteStep } from '../wizard/steps/complete.js';
import {
  WizardNavigation,
  WizardStep,
  STEP_NAMES,
  setupCancelHandler,
} from '../wizard/navigation.js';
import {
  createState,
  saveState,
  loadState,
  hasResumeState,
} from '../wizard/state.js';
import type { WizardState } from '@brewnet/shared';
import { generatePassword } from '../utils/password.js';

// ---------------------------------------------------------------------------
// Command Registration
// ---------------------------------------------------------------------------

export interface InitOptions {
  config?: string;
  nonInteractive?: boolean;
  open?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactive setup wizard')
    .option('-c, --config <path>', 'Path to a JSON config file for pre-populated values')
    .option('--non-interactive', 'Run in non-interactive mode (requires --config)')
    .option('--no-open', 'Skip auto-opening the status page in browser after setup')
    .action(async (options: InitOptions) => {
      await runInitWizard(options);
    });
}

// ---------------------------------------------------------------------------
// Wizard Orchestrator
// ---------------------------------------------------------------------------

/**
 * Main wizard orchestrator.
 *
 * Manages step navigation, state persistence, resume, and cancellation.
 * Supports --config flag to pre-populate state and --non-interactive
 * to skip prompts.
 */
async function runInitWizard(options: InitOptions = {}): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. Display welcome banner
  // -----------------------------------------------------------------------
  console.log();
  console.log(chalk.bold.cyan('  Brewnet') + chalk.bold(' — Your Home Server, Brewed Fresh'));
  console.log(chalk.dim('  Interactive setup wizard'));
  console.log();

  // -----------------------------------------------------------------------
  // 2. Set up navigation and state
  // -----------------------------------------------------------------------
  const nav = new WizardNavigation(WizardStep.SystemCheck);
  let state: WizardState = createState();

  // -----------------------------------------------------------------------
  // 2a. Handle --config flag (T073)
  // -----------------------------------------------------------------------
  if (options.config) {
    const configPath = resolve(options.config);

    if (!existsSync(configPath)) {
      console.log(chalk.red(`  Config file not found: ${configPath}`));
      console.log();
      return;
    }

    try {
      state = importConfig(configPath);

      // Re-generate passwords that were stripped during export
      if (!state.admin.password) {
        state.admin.password = generatePassword(20);
      }
      if (state.servers.dbServer.enabled && !state.servers.dbServer.dbPassword) {
        state.servers.dbServer.dbPassword = generatePassword(16);
      }

      console.log(chalk.green(`  Loaded config from: ${configPath}`));
      console.log(chalk.dim('  Passwords have been auto-generated for missing secrets.'));
      console.log();
    } catch (err) {
      console.log(chalk.red(`  Failed to load config: ${configPath}`));
      if (err instanceof Error) {
        console.log(chalk.dim(`  ${err.message}`));
      }
      console.log();
      return;
    }
  }

  // -----------------------------------------------------------------------
  // 2b. Handle --non-interactive flag (T073)
  // -----------------------------------------------------------------------
  if (options.nonInteractive) {
    if (!options.config) {
      console.log(chalk.red('  --non-interactive requires --config'));
      console.log();
      return;
    }

    console.log(chalk.dim('  Running in non-interactive mode...'));
    console.log();

    // Skip directly to generate step
    const success = await runGenerateStep(state);
    if (success) {
      await runCompleteStep(state, { noOpen: options.open === false });
    }
    return;
  }

  // -----------------------------------------------------------------------
  // 3. Set up Ctrl+C cancel handler
  // -----------------------------------------------------------------------
  const cleanupCancel = setupCancelHandler(async () => {
    console.log();
    console.log(chalk.yellow('  Setup cancelled.'));

    // Save state so user can resume later
    try {
      saveState(state);
      console.log(chalk.dim('  Progress saved. Run `brewnet init` to resume.'));
    } catch {
      // Non-critical — just inform
      console.log(chalk.dim('  Could not save progress.'));
    }

    console.log();
    nav.cancel();
    process.exit(0);
  });

  // -----------------------------------------------------------------------
  // 4. Step loop (T074)
  // -----------------------------------------------------------------------
  try {
    while (!nav.isCancelled && nav.currentStep <= WizardStep.Complete) {
      switch (nav.currentStep) {
        // -----------------------------------------------------------------
        // Step 0: System Check
        // -----------------------------------------------------------------
        case WizardStep.SystemCheck: {
          const checkResult = await runSystemCheckStep();

          if (!checkResult.passed) {
            // Critical failure or user declined to continue
            console.log(
              chalk.red('  Setup cannot continue. Please resolve the issues above.'),
            );
            console.log();
            cleanupCancel();
            return;
          }

          nav.goForward();
          break;
        }

        // -----------------------------------------------------------------
        // Step 1: Project Setup
        // -----------------------------------------------------------------
        case WizardStep.ProjectSetup: {
          // Check for resume state before collecting input
          // We use the default project name for resume detection
          const defaultName = state.projectName || 'my-homeserver';

          if (hasResumeState(defaultName)) {
            const shouldResume = await confirm({
              message: `Resume previous setup for "${defaultName}"?`,
              default: true,
            });

            if (shouldResume) {
              const loaded = loadState(defaultName);
              if (loaded) {
                state = loaded;
                console.log();
                console.log(chalk.green('  Resumed previous session.'));
                console.log();
              }
            }
          }

          state = await runProjectSetupStep(state);

          // Save state after this step
          saveState(state);

          nav.goForward();
          break;
        }

        // -----------------------------------------------------------------
        // Step 2: Server Components
        // -----------------------------------------------------------------
        case WizardStep.ServerComponents: {
          state = await runServerComponentsStep(state);

          // Save state after this step
          saveState(state);

          nav.goForward();
          break;
        }

        // -----------------------------------------------------------------
        // Step 3: Dev Stack & Runtime (T078-T082)
        // -----------------------------------------------------------------
        case WizardStep.DevStack: {
          state = await runDevStackStep(state);

          // Save state after this step
          saveState(state);

          nav.goForward();
          break;
        }

        // -----------------------------------------------------------------
        // Step 4: Domain & Network (T085-T089)
        // -----------------------------------------------------------------
        case WizardStep.DomainNetwork: {
          state = await runDomainNetworkStep(state);

          // Save state after this step
          saveState(state);

          nav.goForward();
          break;
        }

        // -----------------------------------------------------------------
        // Step 5: Review & Confirm (T070)
        // -----------------------------------------------------------------
        case WizardStep.Review: {
          const reviewResult = await runReviewStep(state);

          saveState(state);

          if (reviewResult.action === 'generate') {
            nav.goForward();
          } else if (reviewResult.action === 'modify' && reviewResult.modifyStep !== undefined) {
            nav.goToStep(reviewResult.modifyStep);
          } else if (reviewResult.action === 'export') {
            // After export, stay on Review step so user can choose again
            // (do nothing — loop will re-run this step)
          }

          break;
        }

        // -----------------------------------------------------------------
        // Step 6: Generate & Start (T071)
        // -----------------------------------------------------------------
        case WizardStep.Generate: {
          const success = await runGenerateStep(state);

          if (success) {
            nav.goForward();
          } else {
            // On failure, go back to Review so user can modify or retry
            console.log(
              chalk.yellow('  Returning to Review step.'),
            );
            console.log();
            nav.goToStep(WizardStep.Review);
          }

          break;
        }

        // -----------------------------------------------------------------
        // Step 7: Complete (T072)
        // -----------------------------------------------------------------
        case WizardStep.Complete: {
          await runCompleteStep(state, { noOpen: options.open === false });

          // Exit the loop — wizard is finished
          cleanupCancel();
          return;
        }

        default: {
          // Should not reach here — exit loop
          break;
        }
      }
    }
  } catch (err) {
    // Handle @inquirer/prompts ExitPromptError (Ctrl+C during prompt)
    if (
      err instanceof Error &&
      err.constructor.name === 'ExitPromptError'
    ) {
      console.log();
      console.log(chalk.yellow('  Setup cancelled.'));

      try {
        saveState(state);
        console.log(chalk.dim('  Progress saved. Run `brewnet init` to resume.'));
      } catch {
        // Non-critical
      }

      console.log();
    } else {
      // Unexpected error
      console.log();
      console.log(chalk.red('  An unexpected error occurred during setup.'));
      if (err instanceof Error) {
        console.log(chalk.dim(`  ${err.message}`));
      }
      console.log();

      try {
        saveState(state);
        console.log(chalk.dim('  Progress saved. Run `brewnet init` to resume.'));
      } catch {
        // Non-critical
      }
    }
  } finally {
    cleanupCancel();
  }
}
