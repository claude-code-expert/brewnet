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
  'SSH Server (OpenSSH)',
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
  console.log(chalk.yellow('  ⚠ Nextcloud, MinIO, pgAdmin, SSH Server를 사용할 경우'));
  console.log(chalk.yellow('    적용되는 로그인 계정이므로 신중하게 입력하세요.'));
  console.log();
  console.log(chalk.dim('  자동 적용 서비스:'));
  for (const svc of AUTO_PROPAGATED_SERVICES) {
    console.log(chalk.dim(`    • ${svc}`));
  }
  console.log();
  console.log(chalk.dim('  별도 설정 필요 서비스:'));
  for (const svc of MANUAL_SETUP_SERVICES) {
    console.log(chalk.dim(`    • ${svc}`) + chalk.dim.italic(' — 자체 초기 설정에서 계정 생성'));
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
  console.log(chalk.dim('  비밀번호는 모든 서비스에 동일하게 적용됩니다. 8자 이상.'));

  let adminPassword = '';
  while (true) {
    const pw = await password({
      message: 'Admin password',
      mask: '*',
      validate: (value: string) => {
        if (value.length < 8) return '8자 이상 입력하세요';
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

    console.log(chalk.red('  비밀번호가 일치하지 않습니다. 다시 입력하세요.'));
    console.log();
  }

  next.admin.password = adminPassword;
  next.admin.storage = 'local';

  console.log();
  console.log(chalk.green('  Admin account configured.'));
  console.log();

  return next;
}
