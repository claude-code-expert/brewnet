/**
 * T042 — Step 0: System Check (Wizard UI)
 *
 * Orchestrates the system pre-flight checks and displays results to the user.
 * Uses the system-checker service for the actual checks, and provides a
 * terminal UI with spinners, colored tables, and interactive prompts.
 *
 * Flow:
 *   1. Show header "Step 0/7 — System Check"
 *   2. If Docker not installed → auto-install with retry loop
 *   3. Run all checks with a spinner
 *   4. Display results in a formatted table
 *   5. Critical failures → show remediation hints + retry/quit prompt
 *   6. Warnings only → show remediation hints + confirm prompt
 *   7. All pass → proceed
 *
 * @module wizard/steps/system-check
 */

import chalk from 'chalk';
import ora from 'ora';
import { confirm, select } from '@inquirer/prompts';
import { execa } from 'execa';
import Table from 'cli-table3';
import { runAllChecks } from '../../services/system-checker.js';
import type { CheckResult } from '../../services/system-checker.js';
import {
  isDockerInstalled,
  isDaemonRunning,
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

function statusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass': return chalk.green('✓');
    case 'fail': return chalk.red('✗');
    case 'warn': return chalk.yellow('⚠');
  }
}

function formatName(name: string, status: CheckResult['status']): string {
  switch (status) {
    case 'pass': return name;
    case 'fail': return chalk.red(name);
    case 'warn': return chalk.yellow(name);
  }
}

function formatMessage(message: string, status: CheckResult['status']): string {
  switch (status) {
    case 'pass': return chalk.green(message);
    case 'fail': return chalk.red(message);
    case 'warn': return chalk.yellow(message);
  }
}

// ---------------------------------------------------------------------------
// Docker 수동 실행 안내
// ---------------------------------------------------------------------------

function showDockerStartGuide(plat: string): void {
  console.log();
  console.log(chalk.bold('  Docker 수동 실행 방법:'));
  if (plat === 'darwin') {
    console.log(chalk.dim('    1. Dock 또는 Applications 폴더에서 "Docker" 앱 실행'));
    console.log(chalk.dim('    2. 메뉴바 상단 고래(🐳) 아이콘이 나타날 때까지 대기 (~30초)'));
    console.log(chalk.dim('    3. 위 메뉴에서 "60초 더 대기"를 선택하세요'));
  } else {
    console.log(chalk.dim('    sudo systemctl start docker   # systemd (Ubuntu/Debian/CentOS)'));
    console.log(chalk.dim('    sudo service docker start     # SysV (구형 Ubuntu)'));
    console.log(chalk.dim('    sudo dockerd &                # 수동 기동 (최후 수단)'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Docker 수동 설치 안내
// ---------------------------------------------------------------------------

function showDockerInstallGuide(plat: string): void {
  console.log();
  console.log(chalk.bold('  Docker 수동 설치 방법:'));
  if (plat === 'darwin') {
    console.log(chalk.dim('    1. https://docs.docker.com/desktop/mac/ 에서 Docker Desktop 다운로드'));
    console.log(chalk.dim('    2. Docker.dmg 열고 Applications 폴더에 드래그'));
    console.log(chalk.dim('    3. Docker 앱 실행 → 메뉴바 고래 아이콘 확인'));
    console.log(chalk.dim('    4. 완료 후: brewnet init'));
  } else {
    console.log(chalk.dim('    1. curl -fsSL https://get.docker.com | sudo sh'));
    console.log(chalk.dim('    2. sudo systemctl start docker'));
    console.log(chalk.dim('    3. sudo usermod -aG docker $USER && newgrp docker'));
    console.log(chalk.dim('    4. docker info   (정상 응답 확인)'));
    console.log(chalk.dim('    5. 완료 후: brewnet init'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Docker 데몬 대기 — 타임아웃 시 재시도 메뉴
// ---------------------------------------------------------------------------

async function waitForDaemonWithRetry(plat: string): Promise<boolean> {
  const INITIAL_MS = plat === 'darwin' ? 90_000 : 30_000;
  const RETRY_MS   = 60_000;

  const daemonSpinner = ora({
    text: `Docker 데몬 시작 대기 중... (최대 ${INITIAL_MS / 1000}초)`,
    indent: 2,
  }).start();

  let ready = await waitForDockerDaemon(INITIAL_MS);
  if (ready) {
    daemonSpinner.succeed('Docker 데몬이 준비됐습니다.');
    return true;
  }

  // 타임아웃 → 인터랙티브 루프
  while (true) {
    daemonSpinner.stop();
    console.log();
    console.log(chalk.red('  ✖ Docker 데몬이 응답하지 않습니다.'));
    console.log(chalk.dim('    Docker는 설치됐지만 아직 실행되지 않았습니다.'));
    console.log();

    const choices: Array<{ value: string; name: string }> = [
      { value: 'retry',  name: `⏱  60초 더 대기` },
    ];
    if (plat === 'darwin') {
      choices.push({ value: 'open', name: '🔧  Docker Desktop 직접 열기' });
    }
    choices.push(
      { value: 'manual', name: '📋  수동 실행 방법 보기' },
      { value: 'quit',   name: '✗   종료' },
    );

    const action = await select({ message: '어떻게 하시겠습니까?', choices });

    if (action === 'retry') {
      daemonSpinner.start('Docker 데몬 대기 중...');
      ready = await waitForDockerDaemon(RETRY_MS);
      if (ready) {
        daemonSpinner.succeed('Docker 데몬이 준비됐습니다.');
        return true;
      }
      // 루프 계속

    } else if (action === 'open') {
      console.log();
      console.log(chalk.dim('  Docker Desktop을 실행합니다...'));
      await execa('open', ['-a', 'Docker'], { reject: false });
      daemonSpinner.start('Docker Desktop 기동 대기 중...');
      ready = await waitForDockerDaemon(RETRY_MS);
      if (ready) {
        daemonSpinner.succeed('Docker 데몬이 준비됐습니다.');
        return true;
      }
      // 루프 계속

    } else if (action === 'manual') {
      showDockerStartGuide(plat);
      // 루프 반복 → 다시 선택

    } else {
      // quit
      console.log();
      console.log(chalk.dim('  Docker 실행 후 brewnet init을 다시 시도하세요.'));
      console.log();
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Main Step Function
// ---------------------------------------------------------------------------

/**
 * Run Step 0: System Check.
 * This function never throws.
 */
export async function runSystemCheckStep(): Promise<SystemCheckStepResult> {
  try {
    // -----------------------------------------------------------------------
    // 1. Display header
    // -----------------------------------------------------------------------
    console.log();
    console.log(chalk.bold.cyan('  Step 0/7') + chalk.bold(' — System Check'));
    console.log(chalk.dim('  Verifying that your system meets the requirements for Brewnet'));
    console.log();

    // -----------------------------------------------------------------------
    // 2. Docker 사전 설치 (없는 경우 자동 설치 — 재시도 루프 포함)
    // -----------------------------------------------------------------------
    const dockerInstalled = await isDockerInstalled();

    if (dockerInstalled) {
      // Docker CLI는 있지만 데몬이 꺼진 경우 — 프로액티브 기동 시도
      const daemonRunning = await isDaemonRunning();
      if (!daemonRunning) {
        const plat = process.platform;
        console.log(chalk.yellow('  ⚠  Docker가 설치되어 있지만 실행되지 않았습니다.'));
        console.log(chalk.dim(
          plat === 'darwin'
            ? '  Docker Desktop을 자동으로 실행합니다...'
            : '  Docker 데몬을 시작합니다. (sudo 권한이 필요할 수 있습니다)',
        ));
        console.log();

        if (plat === 'darwin') {
          await execa('open', ['-a', 'Docker'], { reject: false });
        } else {
          await execa('sudo', ['systemctl', 'start', 'docker'], {
            stdio: 'inherit',
            reject: false,
          });
        }

        const daemonReady = await waitForDaemonWithRetry(plat);
        if (!daemonReady) {
          return { passed: false, results: [] };
        }
        console.log();
      }
    }

    if (!dockerInstalled) {
      const plat = process.platform;

      console.log(chalk.yellow('  ⚠  Docker가 설치되지 않았습니다. 자동으로 설치합니다.'));
      console.log(chalk.dim(
        plat === 'darwin'
          ? '  [macOS] Homebrew를 통해 Docker Desktop을 설치합니다.'
          : '  [Linux] 공식 Docker 설치 스크립트를 실행합니다. (sudo 권한 필요)',
      ));
      console.log();

      // 설치 시도 — 실패 시 재시도/수동안내/종료 메뉴
      let requiresRelogin = false;
      while (true) {
        const installResult = await installDocker();

        if (installResult.success) {
          console.log();
          const platformLabel = plat === 'darwin' ? 'macOS' : 'Linux';
          console.log(chalk.green(`  ✓  Docker 설치 완료 (${platformLabel})`));
          requiresRelogin = installResult.requiresRelogin ?? false;
          break;
        }

        // 설치 실패
        console.log(chalk.red(`  ✗  Docker 자동 설치 실패: ${installResult.message}`));
        console.log();

        const action = await select({
          message: '어떻게 하시겠습니까?',
          choices: [
            { value: 'retry',  name: '🔄  설치 다시 시도' },
            { value: 'manual', name: '📋  수동 설치 방법 보기' },
            { value: 'quit',   name: '✗   종료' },
          ],
        });

        if (action === 'retry') {
          console.log();
          continue;
        }
        if (action === 'manual') {
          showDockerInstallGuide(plat);
        }
        return { passed: false, results: [] };
      }

      // Docker 설치 완료 — 데몬 기동 대기 (재시도 루프 포함)
      const daemonReady = await waitForDaemonWithRetry(process.platform);
      if (!daemonReady) {
        return { passed: false, results: [] };
      }

      if (requiresRelogin) {
        console.log();
        console.log(chalk.dim(
          '  ℹ  docker 그룹이 추가됐습니다. sudo 없이 사용하려면 새 터미널 세션을 열어주세요.',
        ));
      }
      console.log();
    }

    // -----------------------------------------------------------------------
    // 3. Run all checks with spinner
    // -----------------------------------------------------------------------
    const spinner = ora({ text: 'Running system checks...', indent: 2 }).start();
    const { results, hasCriticalFailure, warnings } = await runAllChecks();
    spinner.stop();

    // -----------------------------------------------------------------------
    // 4. Display results table
    // -----------------------------------------------------------------------
    const table = new Table({
      head: [chalk.bold(''), chalk.bold('Check'), chalk.bold('Result'), chalk.bold('Details')],
      colWidths: [4, 14, 52, 30],
      style: { head: [], border: ['dim'] },
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
    // 5. Critical failures → remediation 힌트 + 컨텍스트별 해결 메뉴
    // -----------------------------------------------------------------------
    if (hasCriticalFailure) {
      const criticalFailures = results.filter((r) => r.status === 'fail' && r.critical);

      console.log(chalk.red.bold('  필수 요구사항을 충족하지 못했습니다:'));
      console.log();
      for (const f of criticalFailures) {
        console.log(chalk.red(`    ✗  ${f.name}: ${f.message}`));
        if (f.remediation) {
          console.log(chalk.dim(`       → ${f.remediation}`));
        }
      }
      console.log();

      // Docker 데몬 미실행(BN001) 여부 — 전용 재시도 메뉴 제공
      const isDockerDaemonFailure = criticalFailures.some(
        (f) => f.name === 'Docker' && f.message.includes('BN001'),
      );

      if (isDockerDaemonFailure) {
        const plat = process.platform;
        const choices: Array<{ value: string; name: string }> = [
          { value: 'wait', name: '⏱  Docker 기동 대기 (60초)' },
        ];
        if (plat === 'darwin') {
          choices.push({ value: 'open', name: '🐳  Docker Desktop 직접 열기 후 대기' });
        }
        choices.push(
          { value: 'manual', name: '📋  수동 실행 방법 보기' },
          { value: 'recheck', name: '🔄  다시 검사 (Docker 이미 실행 중인 경우)' },
          { value: 'quit',   name: '✗   종료' },
        );

        while (true) {
          const action = await select({ message: '어떻게 하시겠습니까?', choices });
          console.log();

          if (action === 'wait') {
            const ready = await waitForDaemonWithRetry(plat);
            if (ready) return runSystemCheckStep();
            // 루프 반복

          } else if (action === 'open') {
            console.log(chalk.dim('  Docker Desktop을 실행합니다...'));
            await execa('open', ['-a', 'Docker'], { reject: false });
            const ready = await waitForDaemonWithRetry(plat);
            if (ready) return runSystemCheckStep();
            // 루프 반복

          } else if (action === 'manual') {
            showDockerStartGuide(plat);
            // 루프 반복

          } else if (action === 'recheck') {
            return runSystemCheckStep();

          } else {
            return { passed: false, results };
          }
        }
      }

      // Docker 외 일반 critical failure → 직접 해결 후 재검사
      const action = await select({
        message: '어떻게 하시겠습니까?',
        choices: [
          { value: 'retry', name: '🔄  문제 해결 후 다시 검사' },
          { value: 'quit',  name: '✗   종료' },
        ],
      });

      console.log();

      if (action === 'retry') {
        return runSystemCheckStep();
      }

      return { passed: false, results };
    }

    // -----------------------------------------------------------------------
    // 6. Warnings → remediation 힌트 + 계속할지 확인
    // -----------------------------------------------------------------------
    if (warnings.length > 0) {
      console.log(chalk.yellow(
        `  ${warnings.length}개의 경고가 있습니다. 필수는 아니지만 일부 기능에 영향을 줄 수 있습니다.`,
      ));
      console.log();
      for (const w of warnings) {
        console.log(chalk.yellow(`    ⚠  ${w.name}: ${w.message}`));
        if (w.remediation) {
          console.log(chalk.dim(`       → ${w.remediation}`));
        }
      }
      console.log();

      const shouldContinue = await confirm({
        message: '경고를 무시하고 계속 진행하시겠습니까?',
        default: true,
      });

      console.log();
      return { passed: shouldContinue, results };
    }

    // -----------------------------------------------------------------------
    // 7. All pass
    // -----------------------------------------------------------------------
    console.log(chalk.green.bold('  모든 시스템 체크를 통과했습니다!'));
    console.log();

    return { passed: true, results };

  } catch (err) {
    console.log();
    console.log(chalk.red('  시스템 체크 중 예상치 못한 오류가 발생했습니다.'));
    if (err instanceof Error) {
      console.log(chalk.dim(`  ${err.message}`));
    }
    console.log();
    return { passed: false, results: [] };
  }
}
