/**
 * T042 — Step 0: System Check (Wizard UI)
 *
 * Orchestrates the system pre-flight checks and displays results to the user.
 * Uses the system-checker service for the actual checks, and provides a
 * terminal UI with spinners, colored tables, and interactive prompts.
 *
 * Flow:
 *   1. Show header "Step 0/7 — System Check"
 *   2. Run all checks with a spinner
 *   3. Display results in a formatted table
 *   4. Critical failures → abort
 *   5. Warnings only → prompt user to continue
 *   6. All pass → proceed
 *
 * @module wizard/steps/system-check
 */

import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import Table from 'cli-table3';
import { runAllChecks } from '../../services/system-checker.js';
import type { CheckResult } from '../../services/system-checker.js';
import {
  isDockerInstalled,
  installDocker,
  waitForDockerDaemon,
} from '../../services/docker-installer.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SystemCheckStepResult {
  /** true if all critical checks pass and user confirms any warnings */
  passed: boolean;
  /** Individual check results */
  results: CheckResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a colored status icon for the given check status.
 */
function statusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return chalk.green('✓');
    case 'fail':
      return chalk.red('✗');
    case 'warn':
      return chalk.yellow('⚠');
  }
}

/**
 * Color-format the check name based on its status.
 */
function formatName(name: string, status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return name;
    case 'fail':
      return chalk.red(name);
    case 'warn':
      return chalk.yellow(name);
  }
}

/**
 * Color-format the result message based on its status.
 */
function formatMessage(message: string, status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return chalk.green(message);
    case 'fail':
      return chalk.red(message);
    case 'warn':
      return chalk.yellow(message);
  }
}

// ---------------------------------------------------------------------------
// Main Step Function
// ---------------------------------------------------------------------------

/**
 * Run Step 0: System Check.
 *
 * This function never throws. If an unexpected error occurs, it returns
 * `{ passed: false, results: [] }`.
 */
export async function runSystemCheckStep(): Promise<SystemCheckStepResult> {
  try {
    // -----------------------------------------------------------------------
    // 1. Display header
    // -----------------------------------------------------------------------
    console.log();
    console.log(
      chalk.bold.cyan('  Step 0/7') + chalk.bold(' — System Check'),
    );
    console.log(
      chalk.dim(
        '  Verifying that your system meets the requirements for Brewnet',
      ),
    );
    console.log();

    // -----------------------------------------------------------------------
    // 2. Docker 사전 설치 (없는 경우 자동 설치 후 진행)
    // -----------------------------------------------------------------------
    const dockerInstalled = await isDockerInstalled();

    if (!dockerInstalled) {
      const plat = process.platform;
      const platformLabel = plat === 'darwin' ? 'macOS' : 'Linux';

      console.log(chalk.yellow('  ⚠  Docker가 설치되지 않았습니다. 자동으로 설치합니다.'));
      console.log(
        chalk.dim(
          plat === 'darwin'
            ? '  [macOS] Homebrew를 통해 Docker Desktop을 설치합니다.'
            : '  [Linux] 공식 Docker 설치 스크립트를 실행합니다. (sudo 권한 필요)',
        ),
      );
      console.log();

      const installResult = await installDocker();

      if (!installResult.success) {
        console.log(chalk.red(`  ✗  Docker 자동 설치에 실패했습니다.`));
        console.log(chalk.red(`     ${installResult.message}`));
        console.log();
        console.log(chalk.dim('  수동으로 설치 후 brewnet init을 다시 실행하세요.'));
        console.log(chalk.dim('     macOS: https://docs.docker.com/desktop/mac/'));
        console.log(chalk.dim('     Linux: https://docs.docker.com/engine/install/'));
        console.log();
        return { passed: false, results: [] };
      }

      console.log();
      console.log(chalk.green(`  ✓  Docker 설치 완료 (${platformLabel})`));

      // 데몬 기동 대기
      const daemonTimeoutMs = plat === 'darwin' ? 90_000 : 30_000;
      const daemonSpinner = ora({
        text: 'Docker 데몬 시작 대기 중...',
        indent: 2,
      }).start();

      const daemonReady = await waitForDockerDaemon(daemonTimeoutMs);

      if (!daemonReady) {
        daemonSpinner.fail('Docker 데몬이 시간 내에 시작되지 않았습니다.');
        console.log();
        console.log(chalk.dim('  Docker를 수동으로 실행한 후 brewnet init을 다시 시도하세요.'));
        console.log(chalk.dim('     macOS: Docker Desktop 앱을 열어주세요.'));
        console.log(chalk.dim('     Linux: sudo systemctl start docker'));
        console.log();
        return { passed: false, results: [] };
      }

      daemonSpinner.succeed('Docker 데몬이 준비됐습니다.');

      if (installResult.requiresRelogin) {
        console.log();
        console.log(
          chalk.dim(
            '  ℹ  docker 그룹이 추가됐습니다. sudo 없이 사용하려면 새 터미널 세션을 열어주세요.',
          ),
        );
      }

      console.log();
    }

    // -----------------------------------------------------------------------
    // 3. Run all checks with spinner
    // -----------------------------------------------------------------------
    const spinner = ora({
      text: 'Running system checks...',
      indent: 2,
    }).start();

    const { results, hasCriticalFailure, warnings } = await runAllChecks();

    spinner.stop();

    // -----------------------------------------------------------------------
    // 4. Build and display results table
    // -----------------------------------------------------------------------
    const table = new Table({
      head: [
        chalk.bold(''),
        chalk.bold('Check'),
        chalk.bold('Result'),
        chalk.bold('Details'),
      ],
      colWidths: [4, 14, 52, 30],
      style: {
        head: [],
        border: ['dim'],
      },
      wordWrap: true,
    });

    for (const result of results) {
      table.push([
        statusIcon(result.status),
        formatName(result.name, result.status),
        formatMessage(result.message, result.status),
        result.details ? chalk.dim(result.details) : chalk.dim('—'),
      ]);
    }

    console.log(table.toString());
    console.log();

    // -----------------------------------------------------------------------
    // 5. Critical failures → abort
    // -----------------------------------------------------------------------
    if (hasCriticalFailure) {
      const criticalFailures = results.filter(
        (r) => r.status === 'fail' && r.critical,
      );

      console.log(chalk.red.bold('  Critical system requirements not met:'));
      console.log();
      for (const failure of criticalFailures) {
        console.log(chalk.red(`    ✗ ${failure.name}: ${failure.message}`));
      }
      console.log();
      console.log(
        chalk.dim(
          '  Please resolve the above issues and run `brewnet init` again.',
        ),
      );
      console.log();

      return { passed: false, results };
    }

    // -----------------------------------------------------------------------
    // 6. Warnings only → prompt user
    // -----------------------------------------------------------------------
    if (warnings.length > 0) {
      console.log(
        chalk.yellow(
          `  ${warnings.length} warning(s) found. These are not critical but may affect functionality.`,
        ),
      );
      console.log();

      const shouldContinue = await confirm({
        message: 'Continue despite warnings?',
        default: true,
      });

      console.log();

      return { passed: shouldContinue, results };
    }

    // -----------------------------------------------------------------------
    // 7. All pass → proceed
    // -----------------------------------------------------------------------
    console.log(chalk.green.bold('  All system checks passed!'));
    console.log();

    return { passed: true, results };
  } catch (err) {
    // Never throw — gracefully handle unexpected errors
    console.log();
    console.log(
      chalk.red(
        '  An unexpected error occurred during system checks.',
      ),
    );
    if (err instanceof Error) {
      console.log(chalk.dim(`  ${err.message}`));
    }
    console.log();

    return { passed: false, results: [] };
  }
}
