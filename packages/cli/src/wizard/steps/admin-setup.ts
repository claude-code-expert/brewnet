/**
 * Pre-Step: Admin Account Setup
 *
 * Collects admin username and password before any Docker installation.
 * The single credential set is propagated to all enabled services.
 *
 * @module wizard/steps/admin-setup
 */

import { input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Credential propagation targets (informational display)
// ---------------------------------------------------------------------------

// Services that receive admin credentials via docker-compose environment variables.
const AUTO_PROPAGATED_SERVICES = [
  'Nextcloud (File Server)',
  'MinIO (Object Storage)',
  'pgAdmin (DB Admin UI)',
];

// Services that require separate account setup through their own UI/CLI.
const MANUAL_SETUP_SERVICES = [
  'Gitea (Git server)',
  'Jellyfin (Media server)',
  'Mail Server (docker-mailserver)',
  'FileBrowser',
];

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

/**
 * Run Pre-Step: Admin Account Setup.
 *
 * Prompts for admin username and password.
 * Password is auto-generated (20 chars); user can accept or enter custom.
 * Shows which services will receive these credentials.
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with admin credentials set
 */
export async function runAdminSetupStep(state: WizardState): Promise<WizardState> {
  const next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Header
  // -------------------------------------------------------------------------
  console.log();
  console.log(chalk.bold.cyan('  Pre-Step') + chalk.bold(' — Admin Account'));
  console.log(chalk.dim('  Set credentials before Docker installation'));
  console.log(chalk.dim('  These credentials are propagated to all enabled services'));
  console.log();

  // -------------------------------------------------------------------------
  // 2. Show credential propagation info
  // -------------------------------------------------------------------------
  console.log(chalk.yellow('  ⚠ If you use Nextcloud, MinIO, pgAdmin, or SSH Server,'));
  console.log(chalk.yellow('    these credentials will be applied as the login account. Please choose carefully.'));
  console.log();
  console.log(chalk.dim('  Auto-configured services:'));
  for (const svc of AUTO_PROPAGATED_SERVICES) {
    console.log(chalk.dim(`    • ${svc}`));
  }
  console.log();
  console.log(chalk.dim('  Services requiring separate setup:'));
  for (const svc of MANUAL_SETUP_SERVICES) {
    console.log(chalk.dim(`    • ${svc}`) + chalk.dim.italic(' — Account created during its own initial setup'));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 3. Username
  // -------------------------------------------------------------------------
  const adminUsername = await input({
    message: 'Admin username',
    default: next.admin.username || 'admin',
  });
  next.admin.username = adminUsername;

  // -------------------------------------------------------------------------
  // 4. Password — direct input (masked)
  // -------------------------------------------------------------------------
  console.log();
  console.log(chalk.dim('  This password will be applied to all services. Must be at least 8 characters.'));

  let adminPassword = '';
  while (true) {
    const pw = await password({
      message: 'Admin password',
      mask: '*',
      validate: (value: string) => {
        if (value.length < 8) return 'Must be at least 8 characters';
        return true;
      },
    });

    const pw2 = await password({
      message: 'Confirm password',
      mask: '*',
    });

    if (pw === pw2) {
      adminPassword = pw;
      break;
    }

    console.log(chalk.red('  Passwords do not match. Please try again.'));
    console.log();
  }

  next.admin.password = adminPassword;
  next.admin.storage = 'local';

  console.log();
  console.log(chalk.green('  Admin account configured.'));
  console.log();

  return next;
}
