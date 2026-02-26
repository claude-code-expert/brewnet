/**
 * T045-T046 — Step 1: Project Setup (Wizard UI)
 *
 * Collects project name, project path, and setup type (Full / Partial).
 * Applies the corresponding install defaults to the wizard state.
 *
 * Flow:
 *   1. Show header "Step 1/7 — Project Setup"
 *   2. Prompt for project name (validated)
 *   3. Prompt for project path (default: ~/brewnet/<name>)
 *   4. Prompt for setup type (Full / Partial)
 *   5. Create project directory if it does not exist
 *   6. Apply defaults based on setup type
 *   7. Return updated state
 *
 * @module wizard/steps/project-setup
 */

import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { validateProjectName } from '../../utils/validation.js';
import {
  applyFullInstallDefaults,
  applyPartialInstallDefaults,
} from '../../config/defaults.js';
import type { WizardState, SetupType } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProjectSetupResult {
  projectName: string;
  projectPath: string;
  setupType: SetupType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Expand a path that starts with `~` to the user's home directory.
 */
function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace(/^~/, homedir());
  }
  return p;
}

// ---------------------------------------------------------------------------
// Main Step Function
// ---------------------------------------------------------------------------

/**
 * Run Step 1: Project Setup.
 *
 * Collects project name, path, and setup type from the user.
 * Creates the project directory if needed, and applies the
 * Full/Partial install defaults to the state.
 *
 * Throws if the user presses Ctrl+C during a prompt (ExitPromptError
 * from @inquirer/prompts). The caller should catch this and handle
 * cancellation.
 */
export async function runProjectSetupStep(
  state: WizardState,
): Promise<WizardState> {
  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 1/7') + chalk.bold(' — Project Setup'),
  );
  console.log(
    chalk.dim(
      '  Configure your project name, location, and installation type',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Prompt for project name
  // -------------------------------------------------------------------------
  const projectName = await input({
    message: 'Project name',
    default: state.projectName || 'my-homeserver',
    validate: (value: string) => {
      const result = validateProjectName(value);
      return result.valid ? true : (result.error ?? 'Invalid project name');
    },
  });

  // -------------------------------------------------------------------------
  // 3. Prompt for project path
  // -------------------------------------------------------------------------
  const defaultPath = `~/brewnet/${projectName}`;

  const rawPath = await input({
    message: 'Project path',
    default: state.projectPath !== `~/brewnet/${state.projectName}`
      ? state.projectPath
      : defaultPath,
  });

  const projectPath = rawPath.startsWith('~') ? rawPath : rawPath;

  // -------------------------------------------------------------------------
  // 4. Prompt for setup type
  // -------------------------------------------------------------------------
  const setupType = await select<SetupType>({
    message: 'Installation type',
    choices: [
      {
        name: 'Full Install (recommended)',
        value: 'full',
        description: 'Web Server + Git Server + Database + Cache',
      },
      {
        name: 'Partial Install',
        value: 'partial',
        description: 'Web Server + Git Server only — add components later',
      },
    ],
    default: state.setupType || 'full',
  });

  // -------------------------------------------------------------------------
  // 5. Create project directory if needed
  // -------------------------------------------------------------------------
  const resolvedPath = expandTilde(projectPath);
  if (!existsSync(resolvedPath)) {
    mkdirSync(resolvedPath, { recursive: true });
    console.log();
    console.log(
      chalk.dim(`  Created directory: ${resolvedPath}`),
    );
  }

  // -------------------------------------------------------------------------
  // 6. Apply defaults based on setup type
  // -------------------------------------------------------------------------
  let updatedState: WizardState = {
    ...state,
    projectName,
    projectPath,
    setupType,
  };

  if (setupType === 'full') {
    updatedState = applyFullInstallDefaults(updatedState);
  } else {
    updatedState = applyPartialInstallDefaults(updatedState);
  }

  // -------------------------------------------------------------------------
  // 7. Summary
  // -------------------------------------------------------------------------
  console.log();
  console.log(chalk.green('  Project setup complete:'));
  console.log(chalk.dim(`    Name: ${projectName}`));
  console.log(chalk.dim(`    Path: ${resolvedPath}`));
  console.log(
    chalk.dim(
      `    Type: ${setupType === 'full' ? 'Full Install' : 'Partial Install'}`,
    ),
  );
  console.log();

  return updatedState;
}
