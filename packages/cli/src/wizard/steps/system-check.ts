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
import { confirm, select, input } from '@inquirer/prompts';
import { execa } from 'execa';
import Table from 'cli-table3';
import { runAllChecks } from '../../services/system-checker.js';
import type { CheckResult } from '../../services/system-checker.js';
import {
  isDockerInstalled,
  isDaemonRunning,
  installDocker,
  waitForDockerDaemon,
  getDaemonDiagnostics,
  launchDockerDesktop,
} from '../../services/docker-installer.js';
import { suggestAlternativePorts, getPortOccupant } from '../../utils/port-utils.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SystemCheckStepResult {
  /** true if all critical checks pass and user confirms any warnings */
  passed: boolean;
  /** Individual check results */
  results: CheckResult[];
  /** Port remapping chosen during conflict resolution */
  portRemapping: Record<number, number>;
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
// Docker manual start guide
// ---------------------------------------------------------------------------

function showDockerStartGuide(plat: string): void {
  console.log();
  console.log(chalk.bold('  How to start Docker manually:'));
  if (plat === 'darwin') {
    console.log(chalk.dim('    1. Open the "Docker" app from Dock or Applications folder'));
    console.log(chalk.dim('    2. Wait for the whale (🐳) icon to appear in the menu bar (~30s)'));
    console.log(chalk.dim('    3. Select "Wait 60 more seconds" from the menu above'));
  } else {
    console.log(chalk.dim('    sudo systemctl start docker   # systemd (Ubuntu/Debian/CentOS)'));
    console.log(chalk.dim('    sudo service docker start     # SysV (older Ubuntu)'));
    console.log(chalk.dim('    sudo dockerd &                # Manual start (last resort)'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Docker Desktop first launch guide (right after fresh install)
// ---------------------------------------------------------------------------

function showDockerFirstLaunchGuide(): void {
  console.log();
  console.log(chalk.bold('  Please start Docker Desktop:'));
  console.log(chalk.dim('    1. Click the "Docker" app from Dock or Applications folder'));
  console.log(chalk.dim('    2. Accept the license and complete initial setup (~1 min)'));
  console.log(chalk.dim('    3. Ready when the whale (🐳) icon appears in the menu bar'));
  console.log();
}

// ---------------------------------------------------------------------------
// Docker manual install guide
// ---------------------------------------------------------------------------

function showDockerInstallGuide(plat: string): void {
  console.log();
  console.log(chalk.bold('  How to install Docker manually:'));
  if (plat === 'darwin') {
    console.log(chalk.dim('    1. Download Docker Desktop from https://docs.docker.com/desktop/mac/'));
    console.log(chalk.dim('    2. Open Docker.dmg and drag to Applications folder'));
    console.log(chalk.dim('    3. Launch Docker app → verify whale icon in menu bar'));
    console.log(chalk.dim('    4. When done: brewnet init'));
  } else {
    console.log(chalk.dim('    1. curl -fsSL https://get.docker.com | sudo sh'));
    console.log(chalk.dim('    2. sudo systemctl start docker'));
    console.log(chalk.dim('    3. sudo usermod -aG docker $USER && newgrp docker'));
    console.log(chalk.dim('    4. docker info   (verify it responds)'));
    console.log(chalk.dim('    5. When done: brewnet init'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Docker daemon wait — retry menu on timeout
// ---------------------------------------------------------------------------

async function waitForDaemonWithRetry(plat: string): Promise<boolean> {
  const INITIAL_MS = plat === 'darwin' ? 90_000 : 30_000;
  const RETRY_MS   = 60_000;

  const daemonSpinner = ora({
    text: `Waiting for Docker daemon... (up to ${INITIAL_MS / 1000}s)`,
    indent: 2,
  }).start();

  let ready = await waitForDockerDaemon(INITIAL_MS);
  if (ready) {
    daemonSpinner.succeed('Docker daemon is ready.');
    return true;
  }

  // Timeout → interactive loop
  while (true) {
    daemonSpinner.stop();
    console.log();
    console.log(chalk.red('  ✖ Docker daemon is not responding.'));
    console.log(chalk.dim('    Docker is installed but not yet running.'));

    // Show actual error cause (docker info stderr)
    const diagInfo = await getDaemonDiagnostics();
    if (diagInfo) {
      console.log();
      console.log(chalk.yellow('  Cause (docker info):'));
      const lines = diagInfo.split('\n').filter((l) => l.trim()).slice(0, 6);
      for (const line of lines) {
        console.log(chalk.dim(`    ${line.trim()}`));
      }
    }
    console.log();

    const choices: Array<{ value: string; name: string }> = [
      { value: 'retry',  name: `⏱  Wait 60 more seconds` },
    ];
    if (plat === 'darwin') {
      choices.push({ value: 'open', name: '🔧  Open Docker Desktop directly' });
    }
    choices.push(
      { value: 'manual', name: '📋  Show manual start instructions' },
      { value: 'quit',   name: '✗   Quit' },
    );

    const action = await select({ message: 'How would you like to proceed?', choices });

    if (action === 'retry') {
      daemonSpinner.start('Waiting for Docker daemon...');
      ready = await waitForDockerDaemon(RETRY_MS);
      if (ready) {
        daemonSpinner.succeed('Docker daemon is ready.');
        return true;
      }
      // Continue loop

    } else if (action === 'open') {
      console.log();
      console.log(chalk.dim('  Launching Docker Desktop...'));
      const lr = await launchDockerDesktop();
      if (!lr.success) {
        console.log(chalk.red(`  Failed to launch Docker Desktop: ${lr.error ?? 'unknown error'}`));
        console.log(chalk.dim('  Please open it manually from Dock or Applications folder.'));
        console.log();
      }
      daemonSpinner.start('Waiting for Docker Desktop to start...');
      ready = await waitForDockerDaemon(RETRY_MS);
      if (ready) {
        daemonSpinner.succeed('Docker daemon is ready.');
        return true;
      }
      // Continue loop

    } else if (action === 'manual') {
      showDockerStartGuide(plat);
      // Loop continues — show choices again

    } else {
      // quit
      console.log();
      console.log(chalk.dim('  Please start Docker and try brewnet init again.'));
      console.log();
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Main Step Function
// ---------------------------------------------------------------------------

/**
 * Run Step 1: System Check.
 * This function never throws.
 */
export async function runSystemCheckStep(): Promise<SystemCheckStepResult> {
  const portRemapping: Record<number, number> = {};

  try {
    // -----------------------------------------------------------------------
    // 1. Display header
    // -----------------------------------------------------------------------
    console.log();
    console.log(chalk.bold.cyan('  Step 1/8') + chalk.bold(' — System Check'));
    console.log(chalk.dim('  Verifying that your system meets the requirements for Brewnet'));
    console.log();

    // -----------------------------------------------------------------------
    // 2. Docker pre-install (auto-install if missing — with retry loop)
    // -----------------------------------------------------------------------
    const dockerInstalled = await isDockerInstalled();

    if (dockerInstalled) {
      const daemonRunning = await isDaemonRunning();
      if (daemonRunning) {
        // Docker is already running — use existing installation
        console.log(chalk.green('  ✓  Docker is running. Using existing installation.'));
        console.log();
      } else {
        // Docker CLI exists but daemon is not running — start guide
        const plat = process.platform;
        console.log(chalk.yellow('  ⚠  Docker is installed but not running.'));
        console.log(chalk.dim(
          plat === 'darwin'
            ? '  Launching Docker Desktop automatically...'
            : '  Starting Docker daemon. (may require sudo)',
        ));
        console.log();

        if (plat === 'darwin') {
          const lr = await launchDockerDesktop();
          if (!lr.success) {
            console.log(chalk.red(`  Failed to launch Docker Desktop: ${lr.error ?? 'unknown error'}`));
            console.log(chalk.dim('  Please open it manually from Dock or Applications folder.'));
            console.log();
          }
        } else {
          await execa('sudo', ['systemctl', 'start', 'docker'], {
            stdio: 'inherit',
            reject: false,
          });
        }

        const daemonReady = await waitForDaemonWithRetry(plat);
        if (!daemonReady) {
          return { passed: false, results: [], portRemapping };
        }
        console.log();
      }
    }

    if (!dockerInstalled) {
      const plat = process.platform;

      console.log(chalk.yellow('  ⚠  Docker is not installed. Installing automatically.'));
      console.log(chalk.dim(
        plat === 'darwin'
          ? '  [macOS] Installing Docker Desktop via Homebrew.'
          : '  [Linux] Running the official Docker install script. (sudo required)',
      ));
      console.log();

      // Install attempt — retry/manual/quit menu on failure
      let requiresRelogin = false;
      while (true) {
        const installResult = await installDocker();

        if (installResult.success) {
          console.log();
          const platformLabel = plat === 'darwin' ? 'macOS' : 'Linux';
          console.log(chalk.green(`  ✓  Docker installation complete (${platformLabel})`));
          requiresRelogin = installResult.requiresRelogin ?? false;
          break;
        }

        // Install failed
        console.log(chalk.red(`  ✗  Docker auto-install failed: ${installResult.message}`));
        console.log();

        const action = await select({
          message: 'How would you like to proceed?',
          choices: [
            { value: 'retry',  name: '🔄  Retry installation' },
            { value: 'manual', name: '📋  Show manual install instructions' },
            { value: 'quit',   name: '✗   Quit' },
          ],
        });

        if (action === 'retry') {
          console.log();
          continue;
        }
        if (action === 'manual') {
          showDockerInstallGuide(plat);
        }
        return { passed: false, results: [], portRemapping };
      }

      // Docker installed — macOS: guide user to launch manually, then wait for confirmation
      // (no auto-launch — first run requires license agreement and user interaction)
      if (plat === 'darwin') {
        showDockerFirstLaunchGuide();
        await confirm({
          message: 'Have you launched Docker Desktop and see the whale (🐳) icon in the menu bar?',
          default: true,
        });
        console.log();
      }

      // Docker installed — wait for daemon to start (with retry loop)
      const daemonReady = await waitForDaemonWithRetry(process.platform);
      if (!daemonReady) {
        return { passed: false, results: [], portRemapping };
      }

      if (requiresRelogin) {
        console.log();
        console.log(chalk.dim(
          '  ℹ  docker group added. Open a new terminal session to use Docker without sudo.',
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
    console.log();

    // -----------------------------------------------------------------------
    // 4. Display results table
    // -----------------------------------------------------------------------
    const table = new Table({
      head: [chalk.bold('Check'), chalk.bold('Result'), chalk.bold('Details')],
      colWidths: [35, 40, 26],
      style: { head: [], border: ['dim'] },
      wordWrap: true,
    });

    for (const result of results) {
      table.push([
        `${statusIcon(result.status)} ${formatName(result.name, result.status)}`,
        formatMessage(result.message, result.status),
        result.details ? chalk.dim(result.details) : chalk.dim('—'),
      ]);
    }

    console.log(table.toString());
    console.log();

    // -----------------------------------------------------------------------
    // 4a. Port conflict resolution — suggest alternatives and collect remapping
    // -----------------------------------------------------------------------
    const portConflicts = results.filter(
      (r) => r.status === 'warn' && r.name.startsWith('Port '),
    );

    if (portConflicts.length > 0) {
      console.log(chalk.yellow(
        `  ${portConflicts.length} port conflict(s) detected. Select an alternative for each.`,
      ));
      console.log();

      for (const conflict of portConflicts) {
        // name format: "Port 80 — Traefik (Web Server)" or legacy "Port 80"
        const portMatch = conflict.name.match(/^Port (\d+)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : 0;
        const serviceMatch = conflict.name.match(/— (.+)$/);
        const serviceName = serviceMatch ? serviceMatch[1] : null;
        const occupant = getPortOccupant(port);
        const alternatives = suggestAlternativePorts(port);

        const choices: Array<{ value: number | 'keep' | 'custom'; name: string }> = alternatives.map((p) => ({
          value: p as number | 'keep' | 'custom',
          name: `Port ${p}`,
        }));
        choices.push({ value: 'custom', name: 'Enter custom port number' });
        choices.push({ value: 'keep', name: `Keep port ${port} (conflict will persist)` });

        const occupantHint = occupant ? `, used by ${occupant}` : '';
        const serviceHint = serviceName ? ` [${serviceName}]` : '';
        const choice = await select({
          message: `Port ${port}${serviceHint} is in use${occupantHint}. Choose an alternative:`,
          choices,
        });

        if (choice === 'custom') {
          const raw = await input({
            message: 'Enter port number (1024-65535)',
            validate: (v) => {
              const n = parseInt(v, 10);
              if (isNaN(n) || n < 1024 || n > 65535) return 'Enter a number between 1024 and 65535';
              return true;
            },
          });
          const customPort = parseInt(raw, 10);
          portRemapping[port] = customPort;
          console.log(chalk.dim(`    → Port ${port} remapped to ${customPort}`));
        } else if (choice !== 'keep') {
          portRemapping[port] = choice as number;
          console.log(chalk.dim(`    → Port ${port} remapped to ${choice as number}`));
        } else {
          console.log(chalk.dim(`    → Keeping port ${port} (may cause issues)`));
        }
        console.log();
      }
    }

    // -----------------------------------------------------------------------
    // 5. Critical failures → remediation hints + context-specific resolution menu
    // -----------------------------------------------------------------------
    if (hasCriticalFailure) {
      const criticalFailures = results.filter((r) => r.status === 'fail' && r.critical);

      console.log(chalk.red.bold('  Required components are missing:'));
      console.log();
      for (const f of criticalFailures) {
        console.log(chalk.red(`    ✗  ${f.name}: ${f.message}`));
        if (f.remediation) {
          console.log(chalk.dim(`       → ${f.remediation}`));
        }
      }
      console.log();

      // Check if Docker daemon not running (BN001) — offer dedicated retry menu
      const isDockerDaemonFailure = criticalFailures.some(
        (f) => f.name === 'Docker' && f.message.includes('BN001'),
      );

      if (isDockerDaemonFailure) {
        const plat = process.platform;
        const choices: Array<{ value: string; name: string }> = [
          { value: 'wait', name: '⏱  Wait for Docker to start (60s)' },
        ];
        if (plat === 'darwin') {
          choices.push({ value: 'open', name: '🐳  Open Docker Desktop and wait' });
        }
        choices.push(
          { value: 'manual', name: '📋  Show manual start instructions' },
          { value: 'recheck', name: '🔄  Re-check (if Docker is already running)' },
          { value: 'quit',   name: '✗   Quit' },
        );

        while (true) {
          const action = await select({ message: 'How would you like to proceed?', choices });
          console.log();

          if (action === 'wait') {
            const ready = await waitForDaemonWithRetry(plat);
            if (ready) return runSystemCheckStep();
            // Continue loop

          } else if (action === 'open') {
            console.log(chalk.dim('  Launching Docker Desktop...'));
            const lr = await launchDockerDesktop();
            if (!lr.success) {
              console.log(chalk.red(`  Failed to launch Docker Desktop: ${lr.error ?? 'unknown error'}`));
              console.log(chalk.dim('  Please open it manually from Dock or Applications folder.'));
              console.log();
            }
            const ready = await waitForDaemonWithRetry(plat);
            if (ready) return runSystemCheckStep();
            // Continue loop

          } else if (action === 'manual') {
            showDockerStartGuide(plat);
            // Continue loop

          } else if (action === 'recheck') {
            return runSystemCheckStep();

          } else {
            return { passed: false, results, portRemapping };
          }
        }
      }

      // Non-Docker critical failure → resolve manually, then re-check
      const action = await select({
        message: 'How would you like to proceed?',
        choices: [
          { value: 'retry', name: '🔄  Re-check after resolving the issue' },
          { value: 'quit',  name: '✗   Quit' },
        ],
      });

      console.log();

      if (action === 'retry') {
        return runSystemCheckStep();
      }

      return { passed: false, results, portRemapping };
    }

    // -----------------------------------------------------------------------
    // 6. Non-port warnings → remediation hints + confirm to continue
    // -----------------------------------------------------------------------
    const nonPortWarnings = warnings.filter((w) => !w.name.startsWith('Port '));

    if (nonPortWarnings.length > 0) {
      console.log(chalk.yellow(
        `  ${nonPortWarnings.length} warning(s) found. Not critical, but may affect some features.`,
      ));
      console.log();
      for (const w of nonPortWarnings) {
        console.log(chalk.yellow(`    ⚠  ${w.name}: ${w.message}`));
        if (w.remediation) {
          console.log(chalk.dim(`       → ${w.remediation}`));
        }
      }
      console.log();

      const shouldContinue = await confirm({
        message: 'Ignore warnings and continue?',
        default: true,
      });

      console.log();
      return { passed: shouldContinue, results, portRemapping };
    }

    // -----------------------------------------------------------------------
    // 7. All pass
    // -----------------------------------------------------------------------
    console.log(chalk.green.bold('  All system checks passed!'));
    console.log();

    return { passed: true, results, portRemapping };

  } catch (err) {
    console.log();
    console.log(chalk.red('  An unexpected error occurred during system check.'));
    if (err instanceof Error) {
      console.log(chalk.dim(`  ${err.message}`));
    }
    console.log();
    return { passed: false, results: [], portRemapping };
  }
}
