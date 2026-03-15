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

import { writeFileSync, mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { confirm, select } from '@inquirer/prompts';
import type { WizardState, InstallManifest, InstallManifestStack } from '@brewnet/shared';
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
  writeSecretFiles,
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

  // Manifest collectors — populated throughout generation, written at the end.
  const manifestFiles: string[] = [DOCKER_COMPOSE_FILENAME, '.env', '.env.example', '.gitignore'];
  const manifestDirs: string[] = ['secrets', 'logs'];
  const manifestStacks: InstallManifestStack[] = [];

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

    // Write secret files to secrets/ directory (chmod 700 dir, 600 files)
    writeSecretFiles(projectPath, envResult.secretFiles);

    // Record secret file paths for the install manifest
    for (const sf of envResult.secretFiles) {
      manifestFiles.push(sf.relativePath);
    }

    const secretCount = envResult.secretFiles.length;
    envSpinner.succeed(
      `  .env + ${secretCount} secret file(s) generated (chmod 600)`,
    );
  } catch (err) {
    envSpinner.fail('  Failed to generate .env / secret files');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return 'error';
  }

  // -------------------------------------------------------------------------
  // 3b. Generate .gitignore
  // -------------------------------------------------------------------------
  try {
    const gitignorePath = join(projectPath, '.gitignore');
    const gitignoreContent = [
      '.env',
      '.env.*',
      '!.env.example',
      'secrets/',
      'data/',
      'backups/',
      '*.db',
      '*.sqlite',
      '*.log',
      'docker-compose.override.yml',
      '',
    ].join('\n');
    writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  } catch {
    // Non-critical — best-effort
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
      manifestFiles.push(file.path);
      // Track top-level generated config directories (e.g. 'configs', 'letsencrypt')
      const topDir = file.path.split('/')[0];
      if (topDir && topDir !== '.' && !manifestDirs.includes(topDir)) {
        manifestDirs.push(topDir);
      }
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

  // -------------------------------------------------------------------------
  // 7-pre-db. If Gitea + PostgreSQL: start PostgreSQL first, wait for ready,
  // then create gitea_db BEFORE starting all services.
  // (docker compose up starts Gitea immediately, which needs gitea_db to exist)
  // -------------------------------------------------------------------------
  const needsGiteaDb =
    state.servers.gitServer?.enabled &&
    state.servers.dbServer.enabled &&
    state.servers.dbServer.primary === 'postgresql';

  if (needsGiteaDb) {
    const pgPreSpinner = ora('  Starting PostgreSQL (pre-init for gitea_db)...').start();
    try {
      const { execa: execaFn } = await import('execa');

      // 1. Start only PostgreSQL
      await execaFn('docker', [
        'compose', '-f', composePath, 'up', '-d', '--force-recreate', 'postgresql',
      ]);
      pgPreSpinner.text = '  Waiting for PostgreSQL to be ready...';

      // 2. Poll pg_isready — max 30 seconds (TCP listener only)
      const dbUser = state.servers.dbServer.dbUser || 'brewnet';
      let pgListening = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const result = await execaFn('docker', [
            'exec', 'brewnet-postgresql',
            'pg_isready', '-U', dbUser,
          ]);
          if (result.exitCode === 0) { pgListening = true; break; }
        } catch { /* not ready yet */ }
      }

      if (!pgListening) {
        pgPreSpinner.warn('  PostgreSQL did not become ready in 30s — gitea_db may not be created');
      } else {
        // 2b. pg_isready returns 0 when PostgreSQL first accepts connections, but the
        // Docker init scripts (create POSTGRES_USER, POSTGRES_DB) may still be running.
        // Poll psql until the user actually exists and can connect — max 30s more.
        pgPreSpinner.text = '  Waiting for PostgreSQL user initialization...';
        let userReady = false;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const res = await execaFn('docker', [
              'exec', 'brewnet-postgresql',
              'psql', '-U', dbUser, '-d', 'postgres', '-c', 'SELECT 1',
            ]);
            if (res.exitCode === 0) { userReady = true; break; }
          } catch { /* user not created yet by init scripts */ }
        }

        if (!userReady) {
          pgPreSpinner.warn('  PostgreSQL user not ready in 60s — gitea_db may not be created');
        } else {
          // 3. Check if gitea_db already exists
          // NOTE: CREATE DATABASE cannot run inside a transaction block (DO $$...$$),
          // so we use a two-step approach: check existence, then create outside a transaction.
          const checkResult = await execaFn('docker', [
            'exec', 'brewnet-postgresql',
            'psql', '-U', dbUser, '-d', 'postgres',
            '-tAc', `SELECT 1 FROM pg_database WHERE datname = 'gitea_db'`,
          ]);
          if (checkResult.stdout.trim() !== '1') {
            // 4. Create gitea_db — must run outside a transaction block
            await execaFn('docker', [
              'exec', 'brewnet-postgresql',
              'psql', '-U', dbUser, '-d', 'postgres',
              '-c', `CREATE DATABASE gitea_db OWNER ${dbUser}`,
            ]);
          }
          pgPreSpinner.succeed('  gitea_db ready');
        }
      }
    } catch (err) {
      pgPreSpinner.warn('  gitea_db pre-creation failed — Gitea may prompt for manual DB setup');
      if (err instanceof Error) {
        console.log(chalk.dim(`    ${err.message}`));
      }
    }
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

      // Register Nextcloud trusted_domains/proxies after Nextcloud is ready.
      // IMPORTANT: env var NEXTCLOUD_TRUSTED_DOMAINS only applies on first boot.
      // After that, Nextcloud reads config.php — all changes require occ.
      // We set three things atomically once NC is confirmed ready:
      //   index 0: localhost  (local Traefik access)
      //   index 4: regex      (all *.trycloudflare.com URLs, survives tunnel restarts)
      //   index 5: exact URL  (current tunnel hostname for this session)
      //   trusted_proxies: Traefik bridge range (for X-Forwarded-Proto)
      if (
        state.servers.fileServer.enabled &&
        state.servers.fileServer.service === 'nextcloud'
      ) {
        try {
          const { execa: execaFn } = await import('execa');
          const occQuick = (args: string[]) =>
            execaFn('docker', ['exec', '-u', 'www-data', 'brewnet-nextcloud', 'php', 'occ', ...args]);
          let registered = false;
          // Check NC health first (no initial wait); retry with 5s delay on failure.
          for (let attempt = 0; attempt < 18 && !registered; attempt++) {
            try {
              // Register exact tunnel URL (index 5) — if this succeeds, NC is ready.
              await occQuick(['config:system:set', 'trusted_domains', '5',
                `--value=${state.domain.name}`,
              ]);
              // NC is ready — set persistent config while we have it:
              await occQuick(['config:system:set', 'trusted_domains', '0', '--value=localhost']);
              // Regex pattern trusts ALL *.trycloudflare.com URLs permanently.
              // Quick Tunnel URL changes on every cloudflared restart; this prevents
              // the "untrusted domain" error without needing another occ run each time.
              await occQuick(['config:system:set', 'trusted_domains', '4',
                '--value=/.*\\.trycloudflare\\.com/',
              ]);
              // Trust Traefik's bridge range so Nextcloud reads X-Forwarded-Proto.
              await occQuick(['config:system:set', 'trusted_proxies', '0', '--value=172.16.0.0/12']);
              registered = true;
            } catch {
              // Nextcloud still initializing — wait before retry (skip after last attempt)
              if (attempt < 17) await new Promise((r) => setTimeout(r, 5000));
            }
          }
          if (!registered) {
            console.log(chalk.yellow('\n  ⚠ Nextcloud: occ 설정 실패 (90s 대기 초과). 수동으로 실행하세요:'));
            const d = state.domain.name || '<tunnel-url>';
            console.log(chalk.dim(`    docker exec -u www-data brewnet-nextcloud php occ config:system:set trusted_domains 0 --value=localhost`));
            console.log(chalk.dim(`    docker exec -u www-data brewnet-nextcloud php occ config:system:set trusted_domains 4 --value='/.*.trycloudflare.com/'`));
            console.log(chalk.dim(`    docker exec -u www-data brewnet-nextcloud php occ config:system:set trusted_domains 5 --value=${d}`));
            console.log(chalk.dim(`    docker exec -u www-data brewnet-nextcloud php occ config:system:set trusted_proxies 0 --value=172.16.0.0/12`));
          }
        } catch {
          // Non-critical — user can run occ manually
        }
      }
    } catch (err) {
      tunnelSpinner.fail('  Quick Tunnel URL 캡처 실패');
      if (err instanceof Error) {
        console.log(chalk.dim(`    ${err.message}`));
      }
      console.log(chalk.dim('  서비스는 정상 시작되었으나 외부 URL을 가져오지 못했습니다.'));
      console.log(chalk.dim('  `docker logs brewnet-cloudflared` 로 확인하세요.'));
    }

    // Post-install FileBrowser: force credentials to wizard admin values.
    // FB_USERNAME/FB_PASSWORD only apply on first boot (no DB).
    // When DB already exists, the running process holds an exclusive BoltDB lock —
    // docker exec will always timeout. Fix: stop container, run one-off command
    // against the DB volume, then restart.
    if (state.servers.fileBrowser.enabled) {
      const fbSpinner = ora({ text: '  Applying FileBrowser credentials...', indent: 2 }).start();
      try {
        const { execa: execaFn } = await import('execa');

        // Find the DB and config volume names from the running container
        const { stdout } = await execaFn('docker', [
          'inspect', 'brewnet-filebrowser',
          '--format',
          '{{range .Mounts}}{{.Destination}}={{.Name}}\n{{end}}',
        ]);
        const mountMap: Record<string, string> = {};
        for (const line of stdout.trim().split('\n')) {
          const [dest, name] = line.split('=');
          if (dest && name) mountMap[dest.trim()] = name.trim();
        }
        const dbVolume = mountMap['/database'];
        const configVolume = mountMap['/config'];

        if (dbVolume) {
          // Stop to release DB lock, update via temp container, restart
          await execaFn('docker', ['stop', 'brewnet-filebrowser']);

          // In Quick Tunnel mode, write settings.json with baseURL=/files into the /config volume.
          // settings.json takes priority over DB values — the DB config set alone is not enough.
          // Without baseURL in settings.json, window.FileBrowser.BaseURL="" → post-login redirect to / → 404.
          if (state.domain.cloudflare.tunnelMode === 'quick' && configVolume) {
            const settingsJson = JSON.stringify({
              port: 80,
              baseURL: '/files',
              address: '',
              log: 'stdout',
              database: '/database/filebrowser.db',
              root: '/srv',
            });
            await execaFn('docker', [
              'run', '--rm',
              '-v', `${configVolume}:/config`,
              'busybox',
              'sh', '-c', `printf '%s' '${settingsJson}' > /config/settings.json`,
            ]);
          }

          // Relax minimum password length (default 12) to match brewnet admin password
          await execaFn('docker', [
            'run', '--rm',
            '-v', `${dbVolume}:/database`,
            'filebrowser/filebrowser:latest',
            '--database', '/database/filebrowser.db',
            'config', 'set', '--minimumPasswordLength', '6',
          ]);
          await execaFn('docker', [
            'run', '--rm',
            '-v', `${dbVolume}:/database`,
            'filebrowser/filebrowser:latest',
            '--database', '/database/filebrowser.db',
            'users', 'update', '1',
            '--username', state.admin.username || 'admin',
            '--password', state.admin.password || '',
          ]);
          await execaFn('docker', ['start', 'brewnet-filebrowser']);
          fbSpinner.succeed('  FileBrowser credentials applied');
        } else {
          fbSpinner.warn('  FileBrowser: DB volume not found — change password via UI');
        }
      } catch (err) {
        fbSpinner.warn('  FileBrowser credentials not applied — change password via UI');
        if (err instanceof Error) console.log(chalk.dim(`    ${err.message}`));
      }
    }

  }

  // -------------------------------------------------------------------------
  // 7b. Boilerplate project: clone from GitHub, configure, build, verify
  // -------------------------------------------------------------------------
  if (state.boilerplate.generate && state.devStack.languages.length > 0) {
    const { resolveStackId } = await import('../../config/frameworks.js');
    const {
      cloneStack,
      generateEnv: boilerplateGenerateEnv,
      startContainers: boilerplateStartContainers,
      pollHealth: boilerplatePollHealth,
      verifyEndpoints: boilerplateVerifyEndpoints,
      findFreePort,
    } = await import('../../services/boilerplate-manager.js');

    // Map wizard DB selection to boilerplate DB_DRIVER value
    const dbPrimary = state.servers.dbServer.primary;
    const dbDriver = dbPrimary === 'postgresql' ? 'postgres'
      : dbPrimary === 'mysql' ? 'mysql'
      : 'sqlite3';

    // DB credentials from wizard settings (with safe fallbacks)
    const dbOpts = {
      dbUser: state.servers.dbServer.dbUser || 'brewnet',
      dbPassword: state.admin.password || undefined,
      dbName: state.servers.dbServer.dbName || 'brewnet_db',
    };

    type StackStatus = 'running' | 'failed' | 'timeout';
    const stackMetas: Array<{
      stackId: string;
      appDir: string;
      backendUrl: string;
      frontendUrl: string;
      isUnified: boolean;
      lang: string;
      frameworkId: string;
      dbDriver: string;
      dbUser: string;
      dbName: string;
      gitBranch: string;
      status: StackStatus;
    }> = [];

    // Load previous boilerplate metadata to clean up stale containers before starting new ones.
    // This prevents "port already in use" errors when re-running the wizard.
    const boilerplateMetaPath = join(projectPath, '.brewnet-boilerplate.json');
    let prevStackMetas: Array<{ stackId: string; appDir: string }> = [];
    try {
      const prevRaw = JSON.parse(readFileSync(boilerplateMetaPath, 'utf-8'));
      prevStackMetas = Array.isArray(prevRaw) ? prevRaw : [prevRaw];
    } catch { /* no previous run — fine */ }

    // Process each selected language/framework combination
    for (const lang of state.devStack.languages) {
      const frameworkId = state.devStack.frameworks[lang] ?? '';
      const stackId = resolveStackId(lang, frameworkId);

      if (!stackId) {
        console.log(chalk.dim(`  보일러플레이트 건너뜀: ${lang}/${frameworkId}에 대한 스택 없음`));
        continue;
      }

      // Clone directly under projectPath (no 'apps/' prefix)
      const appDir = join(projectPath, stackId);
      const isUnified = stackId.startsWith('nodejs-nextjs');
      const defaultPort = isUnified ? 3000 : 8080;
      // Auto-select free ports so concurrent stacks or existing processes don't conflict.
      const backendPort = await findFreePort(defaultPort);
      if (backendPort !== defaultPort) {
        console.log(chalk.dim(`  [${stackId}] 백엔드 포트 ${defaultPort} 사용 중 → ${backendPort} 자동 선택`));
      }
      // Non-unified stacks have a separate frontend container (default port 3000).
      const frontendPort = isUnified ? undefined : await findFreePort(3000);
      if (!isUnified && frontendPort !== 3000) {
        console.log(chalk.dim(`  [${stackId}] 프론트 포트 3000 사용 중 → ${frontendPort} 자동 선택`));
      }
      const baseUrl = `http://127.0.0.1:${backendPort}`;
      const isRust = stackId.startsWith('rust-');
      const isJavaOrKotlin = stackId.startsWith('java-') || stackId.startsWith('kotlin-');
      const healthTimeoutMs = isRust ? 600_000 : (isJavaOrKotlin ? 300_000 : 120_000);

      console.log();
      const bpSpinner = ora(`  [${stackId}] 클론 중...`).start();
      let stackStatus: StackStatus = 'failed';

      try {
        // Step 1: shallow clone from brewnet-boilerplate GitHub repo
        bpSpinner.text = `  [${stackId}] GitHub에서 소스 클론 중... (branch: stack/${stackId})`;
        await cloneStack(stackId, appDir);

        // Step 2: generate .env with wizard DB settings (hostPort/frontendPort ensure correct port bindings)
        bpSpinner.text = `  [${stackId}] 런타임 환경 구성 중... (DB: ${dbDriver}, user: ${dbOpts.dbUser})`;
        boilerplateGenerateEnv(appDir, stackId, dbDriver, { ...dbOpts, hostPort: backendPort, frontendPort });

        // Step 3: start containers (with build)
        if (isRust) {
          bpSpinner.warn(`  [${stackId}] Rust 스택 첫 빌드는 3-10분 소요됩니다 — 잠시 기다려주세요`);
          bpSpinner.start(`  [${stackId}] 빌드 중... (Rust: 최대 10분 소요)`);
        } else if (isJavaOrKotlin) {
          bpSpinner.text = `  [${stackId}] 빌드 중... (Java/Kotlin: 최대 5분 소요)`;
        } else {
          bpSpinner.text = `  [${stackId}] 빌드 및 컨테이너 시작 중...`;
        }
        // Best-effort: stop previous boilerplate containers for the SAME stackId to free resources.
        // Port conflicts are already handled by findFreePort above, but stopping stale containers
        // avoids wasting memory/CPU on orphaned stacks from previous wizard runs.
        {
          const { execa: execaFn } = await import('execa');
          const stale = prevStackMetas.filter(
            prev => prev.stackId === stackId && prev.appDir !== appDir && existsSync(prev.appDir),
          );
          for (const prev of stale) {
            bpSpinner.text = `  [${stackId}] 이전 컨테이너 정리 중...`;
            try { await execaFn('docker', ['compose', 'down'], { cwd: prev.appDir }); } catch { /* ignore */ }
          }
        }
        await boilerplateStartContainers(appDir);

        // Step 4: poll health endpoint until ready
        bpSpinner.text = `  [${stackId}] 헬스체크 대기 중... (timeout: ${Math.round(healthTimeoutMs / 1000)}s)`;
        const health = await boilerplatePollHealth(baseUrl, healthTimeoutMs);

        if (!health.healthy) {
          bpSpinner.warn(`  [${stackId}] 헬스체크 타임아웃 (${Math.round(healthTimeoutMs / 1000)}s 초과)`);
          console.log(chalk.dim(`    로그 확인: docker compose -f ${appDir}/docker-compose.yml logs`));
          stackStatus = 'timeout';
        } else {
          // Step 5: verify API endpoints (/api/hello, /api/echo)
          await boilerplateVerifyEndpoints(baseUrl);
          bpSpinner.succeed(`  [${stackId}] 완료 — 백엔드: ${chalk.cyan(baseUrl)}`);
          if (!isUnified && frontendPort !== undefined) {
            console.log(chalk.dim(`    프론트엔드: http://127.0.0.1:${frontendPort}`));
          }
          stackStatus = 'running';
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isPortConflict = errMsg.includes('address already in use') || errMsg.includes('ports are not available');
        if (isPortConflict) {
          bpSpinner.warn(`  [${stackId}] 포트 ${backendPort} 충돌 — 다른 프로세스가 사용 중`);
          console.log(chalk.dim(`    충돌 프로세스 확인: lsof -i :${backendPort}`));
          console.log(chalk.dim(`    Docker 컨테이너 확인: docker ps | grep ${backendPort}`));
          console.log(chalk.dim(`    해당 컨테이너 종료 후 재시도: cd ${appDir} && make up`));
        } else {
          bpSpinner.warn(`  [${stackId}] 설치 실패 — 수동 실행: cd ${appDir} && make up`);
          console.log(chalk.dim(`    ${errMsg}`));
        }
        stackStatus = 'failed';
      }

      stackMetas.push({
        stackId,
        appDir,
        backendUrl: baseUrl,
        frontendUrl: isUnified ? baseUrl : 'http://127.0.0.1:3000',
        isUnified,
        lang,
        frameworkId,
        dbDriver,
        dbUser: dbOpts.dbUser,
        dbName: dbOpts.dbName,
        gitBranch: `stack/${stackId}`,
        status: stackStatus,
      });
    }

    // Write stack metadata array for admin panel and complete step
    if (stackMetas.length > 0) {
      try {
        writeFileSync(
          join(projectPath, '.brewnet-boilerplate.json'),
          JSON.stringify(stackMetas, null, 2),
          'utf-8',
        );
        manifestFiles.push('.brewnet-boilerplate.json');
      } catch { /* best-effort */ }

      // Record each boilerplate stack for the install manifest
      for (const s of stackMetas) {
        const relDir = s.appDir.startsWith(projectPath)
          ? s.appDir.slice(projectPath.length).replace(/^[\\/]/, '')
          : s.stackId;
        manifestStacks.push({ stackId: s.stackId, directory: relDir });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7c. Credential propagation summary
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
      const homepageLink = `\x1b]8;;${info.homepage}\x07${info.homepage}\x1b]8;;\x07`;
      console.log(
        `  ${chalk.bold.white(info.label.padEnd(26))}  ${chalk.cyan(linkUrl)}`,
      );
      console.log(`  ${chalk.dim('ℹ')}  ${chalk.dim(info.loginNote)}`);
      console.log(`  ${chalk.dim('⌂')}  ${chalk.dim(`Homepage: ${homepageLink} — Refer to the official documentation for usage manual`)}`);
      console.log();
    }
    console.log(chalk.dim('  ─────────────────────────────────────────────────'));
    console.log();
  }

  // -------------------------------------------------------------------------
  // 10. Secrets & credentials location notice
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Auto-generated Secrets'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────'));
  console.log(chalk.dim(`  Location: ${projectPath}/secrets/`));
  console.log();
  console.log(
    chalk.dim('  ') + chalk.yellow('Admin password  ') +
    chalk.dim(`${projectPath}/secrets/admin_password`) +
    chalk.dim('  →  ') + chalk.white(state.admin.password || '(see file)'),
  );
  if (state.servers.dbServer.enabled && state.servers.dbServer.dbPassword) {
    console.log(
      chalk.dim('  ') + chalk.yellow('DB password     ') +
      chalk.dim(`${projectPath}/secrets/db_password`) +
      chalk.dim('  →  ') + chalk.white(state.servers.dbServer.dbPassword),
    );
  }
  console.log();
  if (state.servers.gitServer.enabled) {
    // Gitea runs in headless mode (INSTALL_LOCK=true) — no web installer.
    // Create the admin user via CLI after Gitea is healthy.
    const gitea = ora({ text: '  Gitea: admin 계정 생성 중...', indent: 2 }).start();
    try {
      const { execa: execaFn } = await import('execa');

      // Wait for Gitea to be ready (up to 60s)
      // Check health FIRST; only wait before retry on failure (not before first attempt).
      let giteaReady = false;
      for (let i = 0; i < 12 && !giteaReady; i++) {
        try {
          await execaFn('docker', [
            'exec', 'brewnet-gitea',
            'curl', '-fsSL', 'http://localhost:3000/api/healthz',
          ]);
          giteaReady = true;
        } catch {
          // Still starting — wait before next retry (skip wait after last attempt)
          if (i < 11) await new Promise((r) => setTimeout(r, 5000));
        }
      }

      if (!giteaReady) {
        gitea.warn('  Gitea: 60s 내 응답 없음 — admin 계정 미생성. 나중에 수동으로 생성하세요.');
      } else {
        const adminUser = state.admin.username || 'admin';
        const adminPass = state.admin.password || '';
        const adminEmail = `${adminUser}@${state.domain.name || 'brewnet.local'}`;

        const result = await execaFn('docker', [
          'exec', '-u', 'git', 'brewnet-gitea',
          'gitea', 'admin', 'user', 'create',
          '--username', adminUser,
          '--password', adminPass,
          '--email', adminEmail,
          '--admin',
          '--must-change-password', 'false',
        ]).catch((e: unknown) => {
          // "user already exists" is not an error — happens on re-run
          const stderr = (e as { stderr?: string }).stderr ?? '';
          if (stderr.includes('user already exists') || stderr.includes('already exists')) {
            return { exitCode: 0 };
          }
          return { exitCode: 1, stderr };
        });

        if ((result as { exitCode: number }).exitCode === 0) {
          gitea.succeed(`  Gitea: admin 계정 생성 완료 (${adminUser})`);
        } else {
          gitea.warn('  Gitea: admin 계정 생성 실패 — 수동으로 생성하세요:');
          console.log(chalk.dim(`    docker exec -u git brewnet-gitea gitea admin user create --username ${adminUser} --password <password> --email ${adminEmail} --admin --must-change-password false`));
        }
      }
    } catch (err) {
      gitea.warn('  Gitea: admin 계정 생성 건너뜀');
      if (err instanceof Error) console.log(chalk.dim(`    ${err.message}`));
    }
    console.log();
  }
  console.log(chalk.dim('  ─────────────────────────────────────────────────'));
  console.log();

  // -------------------------------------------------------------------------
  // 11. Write install manifest (.brewnet-manifest.json)
  // -------------------------------------------------------------------------
  // Records every brewnet-generated file so `brewnet uninstall` can remove
  // only what brewnet created, preserving any files the user may have added.
  try {
    const manifest: InstallManifest = {
      schemaVersion: 1,
      projectName: state.projectName,
      projectPath: state.projectPath,
      createdAt: new Date().toISOString(),
      generatedFiles: [...manifestFiles, '.brewnet-manifest.json'],
      generatedDirs: manifestDirs,
      boilerplateStacks: manifestStacks,
    };
    writeFileSync(
      join(projectPath, '.brewnet-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
  } catch { /* non-critical */ }

  // -------------------------------------------------------------------------
  // 12. Success
  // -------------------------------------------------------------------------
  console.log(chalk.green('  All files generated and services started successfully.'));
  console.log();

  return 'success';
}
