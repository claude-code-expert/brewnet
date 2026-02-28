/**
 * T071 — Step 6: Generate & Start
 *
 * Orchestrates the full generation and startup flow:
 *   1. Generate docker-compose.yml, .env, infrastructure configs
 *   2. Write all files to the project directory
 *   3. Pull Docker images (with progress reporting)
 *   4. Start services (docker compose up -d)
 *   5. Health check all services
 *   6. Credential propagation verification
 *   7. Return result with recovery options on failure
 *
 * @module wizard/steps/generate
 */

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { confirm, select } from '@inquirer/prompts';
import type { WizardState } from '@brewnet/shared';
import {
  buildServiceUrlMap,
  buildServiceAccessGuide,
  verifyServiceAccess,
} from '../../utils/service-verifier.js';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import {
  generateComposeConfig,
  composeConfigToYaml,
} from '../../services/compose-generator.js';
import {
  generateEnvFiles,
  writeEnvFile,
} from '../../services/env-generator.js';
import { generateInfraConfigs } from '../../services/config-generator.js';
import {
  buildPullCommand,
  buildUpCommand,
  buildDownCommand,
  sortByDependency,
} from '../../services/health-checker.js';
import {
  collectAllServices,
  getCredentialTargets,
} from '../../utils/resources.js';

// ---------------------------------------------------------------------------
// Helper: execute a shell command
// ---------------------------------------------------------------------------

/**
 * Execute a command via execa. Imported dynamically to handle ESM.
 */
async function execCommand(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { execa } = await import('execa');
    const result = await execa(cmd, args);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const execaErr = err as { stdout: string; stderr: string; exitCode: number };
      return {
        stdout: execaErr.stdout ?? '',
        stderr: execaErr.stderr ?? '',
        exitCode: execaErr.exitCode ?? 1,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: capture Quick Tunnel URL from compose container logs
// ---------------------------------------------------------------------------

const QUICK_TUNNEL_CONTAINER = 'brewnet-cloudflared';
const TUNNEL_URL_REGEX = /https?:\/\/([\w]+-[\w][\w-]*\.trycloudflare\.com)/i;
const TUNNEL_URL_TIMEOUT_MS = 30_000;

/**
 * Read logs from the compose-managed cloudflared container and extract
 * the *.trycloudflare.com URL. Uses `docker logs --follow` with a 30s timeout.
 */
async function captureQuickTunnelUrl(): Promise<string> {
  const { execa: execaFn } = await import('execa');

  return new Promise((resolve, reject) => {
    const proc = execaFn('docker', [
      'logs', '--follow', '--tail', '50', QUICK_TUNNEL_CONTAINER,
    ]);

    // Suppress the expected rejection when we intentionally kill the process.
    // execa rejects with exit code 143 (SIGTERM) on proc.kill(), which would
    // otherwise become an unhandled promise rejection and crash Node.js.
    proc.catch(() => {});

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('30초 내에 Quick Tunnel URL을 얻지 못했습니다.'));
    }, TUNNEL_URL_TIMEOUT_MS);

    let resolved = false;
    const onData = (data: Buffer | string) => {
      if (resolved) return;
      const text = String(data);
      const match = TUNNEL_URL_REGEX.exec(text);
      if (match) {
        resolved = true;
        clearTimeout(timer);
        proc.kill();
        resolve(`https://${match[1]}`);
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of the generate step.
 * - 'success': proceed to Complete step (includes user choosing "continue")
 * - 'error': pre-startup failure, go back to Review step
 * - 'restart': restart wizard from AdminSetup (Step 0)
 * - 'clean-restart': cleanup then restart from AdminSetup
 */
export type GenerateResult = 'success' | 'error' | 'restart' | 'clean-restart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Display failure recovery options. Used by both docker compose up failure
 * and health check failure paths.
 */
async function promptFailureRecovery(context: string): Promise<GenerateResult> {
  console.log();
  console.log(chalk.dim('  Tip: view logs with  docker compose logs -f'));
  console.log(chalk.dim('  Per-service logs:    ls ~/.brewnet/*/logs/*.log'));
  console.log();

  const action = await select<'continue' | 'restart' | 'clean-restart'>({
    message: 'How would you like to proceed?',
    choices: [
      { value: 'continue' as const, name: `Continue — ${context}` },
      { value: 'restart' as const, name: 'Restart setup from the beginning' },
      { value: 'clean-restart' as const, name: 'Clean uninstall, then restart from scratch' },
    ],
  });

  return action === 'continue' ? 'success' : action;
}

// ---------------------------------------------------------------------------
// Helper: parse conflicting container names from docker compose stderr
// ---------------------------------------------------------------------------

/**
 * Parse "container name already in use" errors and extract container names.
 * Example stderr line:
 *   ... The container name "/brewnet-jellyfin" is already in use ...
 */
function parseConflictingNames(stderr: string): string[] {
  const re = /container name "\/([^"]+)" is already in use/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Helper: write per-service Docker logs to disk
// ---------------------------------------------------------------------------

/**
 * Capture Docker Compose service logs and write each service's log to a
 * separate file under `<projectPath>/logs/`. This enables the user to
 * debug individual services with `tail -f ~/.brewnet/<project>/logs/<service>.log`.
 */
async function writeServiceLogs(
  projectPath: string,
  composePath: string,
): Promise<void> {
  const logDir = join(projectPath, 'logs');
  mkdirSync(logDir, { recursive: true });

  try {
    // Get list of running service names from the compose file
    const psResult = await execCommand('docker', [
      'compose', '-f', composePath, 'ps', '--format', '{{.Service}}',
    ]);
    if (psResult.exitCode !== 0 || !psResult.stdout.trim()) return;

    const serviceNames = psResult.stdout.trim().split('\n').filter(Boolean);

    for (const svc of serviceNames) {
      try {
        const logsResult = await execCommand('docker', [
          'compose', '-f', composePath, 'logs', '--no-color', '--tail', '200', svc,
        ]);
        const logFile = join(logDir, `${svc}.log`);
        const content = [
          `# Brewnet service log: ${svc}`,
          `# Captured: ${new Date().toISOString()}`,
          `# Live logs: docker compose -f "${composePath}" logs -f ${svc}`,
          '',
          logsResult.stdout || logsResult.stderr || '(no output)',
          '',
        ].join('\n');
        writeFileSync(logFile, content, 'utf-8');
      } catch {
        // best-effort per service
      }
    }

    console.log(chalk.dim(`  Logs saved to ${logDir}/`));
    console.log(chalk.dim(`  Real-time: tail -f ${logDir}/*.log`));
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// runGenerateStep
// ---------------------------------------------------------------------------

/**
 * Run Step 6: Generate & Start.
 *
 * Generates all configuration files, pulls Docker images, starts services,
 * runs health checks, and verifies credential propagation.
 *
 * @param state - Completed wizard state
 * @returns GenerateResult indicating success or chosen recovery action
 */
export async function runGenerateStep(state: WizardState): Promise<GenerateResult> {
  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 7/8') + chalk.bold(' — Generate & Start'),
  );
  console.log(chalk.dim('  Generating configuration and starting services'));
  console.log();

  const projectPath = state.projectPath.startsWith('~')
    ? join(homedir(), state.projectPath.slice(1))
    : state.projectPath;
  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);

  // -------------------------------------------------------------------------
  // 2. Generate docker-compose.yml
  // -------------------------------------------------------------------------
  const composeSpinner = ora('  Generating docker-compose.yml').start();
  try {
    const composeConfig = generateComposeConfig(state);
    const yamlContent = composeConfigToYaml(composeConfig);

    mkdirSync(projectPath, { recursive: true });
    writeFileSync(composePath, yamlContent, 'utf-8');
    composeSpinner.succeed('  docker-compose.yml generated');
  } catch (err) {
    composeSpinner.fail('  Failed to generate docker-compose.yml');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return 'error';
  }

  // -------------------------------------------------------------------------
  // 3. Generate .env files
  // -------------------------------------------------------------------------
  const envSpinner = ora('  Generating .env files').start();
  try {
    const envResult = generateEnvFiles(state);
    writeEnvFile(projectPath, envResult.envContent);

    // Write .env.example (safe to share)
    const envExamplePath = join(projectPath, '.env.example');
    writeFileSync(envExamplePath, envResult.envExampleContent, 'utf-8');

    envSpinner.succeed('  .env files generated (chmod 600)');
  } catch (err) {
    envSpinner.fail('  Failed to generate .env files');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return 'error';
  }

  // -------------------------------------------------------------------------
  // 4. Generate infrastructure configs
  // -------------------------------------------------------------------------
  const infraSpinner = ora('  Generating infrastructure configs').start();
  try {
    const infraFiles = generateInfraConfigs(state);

    for (const file of infraFiles) {
      const filePath = join(projectPath, file.path);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content, 'utf-8');
    }

    infraSpinner.succeed(`  ${infraFiles.length} infrastructure config(s) generated`);
  } catch (err) {
    infraSpinner.fail('  Failed to generate infrastructure configs');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return 'error';
  }

  // -------------------------------------------------------------------------
  // 5. Pull Docker images
  // -------------------------------------------------------------------------
  console.log();
  const pullSpinner = ora('  Pulling Docker images...').start();
  try {
    const pullCmd = buildPullCommand(composePath);
    const pullResult = await execCommand(pullCmd.cmd, pullCmd.args);

    if (pullResult.exitCode !== 0) {
      pullSpinner.fail('  Failed to pull Docker images');
      console.log(chalk.dim(`    ${pullResult.stderr}`));

      // Offer to continue anyway
      const shouldContinue = await confirm({
        message: 'Continue without pulling images? (existing images will be used)',
        default: false,
      });

      if (!shouldContinue) {
        return 'error';
      }
    } else {
      pullSpinner.succeed('  Docker images pulled');
    }
  } catch (err) {
    pullSpinner.fail('  Failed to pull Docker images');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }

    const shouldContinue = await confirm({
      message: 'Continue without pulling images?',
      default: false,
    });

    if (!shouldContinue) {
      return 'error';
    }
  }

  // -------------------------------------------------------------------------
  // 6. Ensure Docker networks exist (external networks must be pre-created)
  // -------------------------------------------------------------------------
  // Only `brewnet` needs to be pre-created (it's marked `external: true` in compose).
  // `brewnet-internal` is managed by Docker Compose itself (internal: true, not external).
  try {
    await execCommand('docker', ['network', 'create', 'brewnet']);
  } catch {
    // Network already exists — that's fine
  }

  // -------------------------------------------------------------------------
  // 7. Start services
  // -------------------------------------------------------------------------
  const services = collectAllServices(state);
  const sorted = sortByDependency(services);

  console.log();
  console.log(chalk.dim(`  Starting ${sorted.length} services in dependency order...`));

  // 7-pre. Pre-cleanup: remove ALL brewnet-* containers (best-effort).
  // `docker compose down` only removes containers from the CURRENT compose file,
  // so containers from a previous run with different services would remain and
  // cause "container name already in use" conflicts. Instead, we find and remove
  // every container whose name starts with "brewnet-".
  const downCmd = buildDownCommand(composePath);
  await execCommand(downCmd.cmd, downCmd.args).catch(() => {});
  try {
    const psResult = await execCommand('docker', [
      'ps', '-a', '--filter', 'name=^brewnet-', '--format', '{{.Names}}',
    ]);
    if (psResult.exitCode === 0 && psResult.stdout.trim()) {
      const staleNames = psResult.stdout.trim().split('\n').filter(Boolean);
      for (const name of staleNames) {
        await execCommand('docker', ['rm', '-f', name]).catch(() => {});
      }
    }
  } catch {
    // best-effort — Docker may not be available yet
  }

  const upSpinner = ora('  Starting services (docker compose up -d)').start();
  try {
    const upCmd = buildUpCommand(composePath);
    let upResult = await execCommand(upCmd.cmd, upCmd.args);

    // 7-retry. Conflict recovery: remove clashing containers and retry once
    if (upResult.exitCode !== 0 && upResult.stderr?.includes('is already in use')) {
      upSpinner.text = '  Resolving container name conflicts...';
      const names = parseConflictingNames(upResult.stderr);
      for (const name of names) {
        await execCommand('docker', ['rm', '-f', name]).catch(() => {});
      }
      upResult = await execCommand(upCmd.cmd, upCmd.args);
    }

    if (upResult.exitCode !== 0) {
      upSpinner.fail('  Failed to start services');
      console.log();

      // Write full output to log file for debugging
      const logDir = join(projectPath, 'logs');
      mkdirSync(logDir, { recursive: true });
      const logFile = join(logDir, 'docker-compose-up.log');
      const logContent = [
        `[${new Date().toISOString()}] docker compose up -d`,
        '--- stdout ---',
        upResult.stdout || '(empty)',
        '--- stderr ---',
        upResult.stderr || '(empty)',
        `--- exit code: ${upResult.exitCode} ---`,
        '',
      ].join('\n');
      try { writeFileSync(logFile, logContent, 'utf-8'); } catch { /* best-effort */ }

      console.log(chalk.red('  Error details:'));
      if (upResult.stderr) {
        // Show LAST 30 lines (actual errors), not first lines (progress messages)
        const allLines = upResult.stderr.split('\n').filter(Boolean);
        const errorLines = allLines.slice(-30);
        if (allLines.length > 30) {
          console.log(chalk.dim('    ... (earlier output omitted)'));
        }
        for (const line of errorLines) {
          console.log(chalk.dim(`    ${line}`));
        }
      }
      console.log();
      console.log(chalk.dim(`  Full log: ${logFile}`));

      return promptFailureRecovery('some services may have started');
    }

    upSpinner.succeed('  Services started');

    // Write per-service logs to disk for debugging with tail -f
    await writeServiceLogs(projectPath, composePath);
  } catch (err) {
    upSpinner.fail('  Failed to start services');
    if (err instanceof Error) {
      console.log();
      console.log(chalk.red('  Error details:'));
      console.log(chalk.dim(`    ${err.message}`));
    }
    // Still try to capture whatever logs exist
    await writeServiceLogs(projectPath, composePath).catch(() => {});
    return promptFailureRecovery('Docker may need restarting');
  }

  // -------------------------------------------------------------------------
  // 7a. Quick Tunnel URL capture (after traefik + cloudflared are running)
  // -------------------------------------------------------------------------
  if (state.domain.cloudflare.tunnelMode === 'quick') {
    console.log();
    const tunnelSpinner = ora('  Quick Tunnel URL 캡처 중...').start();
    try {
      const tunnelUrl = await captureQuickTunnelUrl();
      state.domain.cloudflare.quickTunnelUrl = tunnelUrl;
      state.domain.name = new URL(tunnelUrl).hostname;
      tunnelSpinner.succeed(`  Quick Tunnel: ${tunnelUrl}`);
    } catch (err) {
      tunnelSpinner.fail('  Quick Tunnel URL 캡처 실패');
      if (err instanceof Error) {
        console.log(chalk.dim(`    ${err.message}`));
      }
      console.log(chalk.dim('  서비스는 정상 시작되었으나 외부 URL을 가져오지 못했습니다.'));
      console.log(chalk.dim('  `docker logs brewnet-cloudflared` 로 확인하세요.'));
    }
  }

  // -------------------------------------------------------------------------
  // 7b. Credential propagation summary
  // -------------------------------------------------------------------------
  console.log();
  const credTargets = getCredentialTargets(state);
  if (credTargets.length > 0) {
    console.log(chalk.bold('  Credential Propagation'));
    for (const target of credTargets) {
      console.log(
        chalk.dim(`    ${target}: `) +
          chalk.green(`${state.admin.username} → .env`),
      );
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // 8. Service access verification
  // -------------------------------------------------------------------------
  const urlMap = buildServiceUrlMap(state);

  if (urlMap.length > 0) {
    console.log(chalk.bold('  Service Verification'));
    console.log(chalk.dim('  Checking each service is reachable (retries: 2)...'));
    console.log();

    const verifySpinner = ora({ text: '  Verifying services...', indent: 2 }).start();
    const verifyResults = await Promise.all(
      urlMap.map((entry) => verifyServiceAccess(entry, { timeout: 5000, retries: 2 })),
    );
    verifySpinner.stop();

    const hasExternal = verifyResults.some((r) => r.externalUrl);
    const verifyTable = hasExternal
      ? new Table({
          head: [chalk.bold('Service'), chalk.bold('Local'), chalk.bold('External'), chalk.bold('Status')],
          colWidths: [18, 30, 36, 10],
          style: { head: [], border: ['dim'] },
          wordWrap: true,
        })
      : new Table({
          head: [chalk.bold('Service'), chalk.bold('Local URL'), chalk.bold('Status')],
          colWidths: [18, 32, 10],
          style: { head: [], border: ['dim'] },
          wordWrap: true,
        });

    for (const result of verifyResults) {
      const statusText =
        result.status === 'ok'
          ? chalk.green('✓  ok')
          : result.status === 'warn'
            ? chalk.yellow('⚠  warn')
            : result.status === 'fail'
              ? chalk.red('✗  fail')
              : chalk.dim('—  skip');

      if (hasExternal) {
        verifyTable.push([
          result.label,
          chalk.dim(result.localUrl),
          result.externalUrl ? chalk.cyan(result.externalUrl) : chalk.dim('—'),
          statusText,
        ]);
      } else {
        verifyTable.push([
          result.label,
          chalk.dim(result.localUrl),
          statusText,
        ]);
      }
    }

    console.log(verifyTable.toString());
    console.log();

    const failedServices = verifyResults.filter((r) => r.status === 'fail');
    if (failedServices.length > 0) {
      console.log(chalk.yellow(`  ${failedServices.length} service(s) did not respond.`));
      console.log();
      console.log(chalk.red('  Failed services:'));
      for (const svc of failedServices) {
        const reason = svc.error ?? 'unknown error';
        console.log(chalk.dim(`    • ${svc.label} — ${reason}`));
      }

      return promptFailureRecovery('services may still be starting up');
    }
  }

  // -------------------------------------------------------------------------
  // 9. Service access guide
  // -------------------------------------------------------------------------
  const accessGuide = buildServiceAccessGuide(state);
  if (accessGuide.length > 0) {
    console.log(chalk.bold('  How to access your services'));
    console.log(chalk.dim('  ─────────────────────────────────────────────────'));
    console.log();

    for (const info of accessGuide) {
      // Clickable URL via OSC 8 hyperlink
      const linkUrl = `\x1b]8;;${info.url}\x07${info.url}\x1b]8;;\x07`;
      console.log(
        `  ${chalk.bold.white(info.label.padEnd(26))}  ${chalk.cyan(linkUrl)}`,
      );
      console.log(`  ${chalk.dim('ℹ')}  ${chalk.dim(info.loginNote)}`);
      console.log();
    }
    console.log(chalk.dim('  ─────────────────────────────────────────────────'));
    console.log();
  }

  // -------------------------------------------------------------------------
  // 10. Success
  // -------------------------------------------------------------------------
  console.log(chalk.green('  All files generated and services started successfully.'));
  console.log();

  return 'success';
}
