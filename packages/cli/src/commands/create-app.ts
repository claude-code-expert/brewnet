/**
 * brewnet create-app — App Scaffolding Command
 *
 * Scaffolds a full-stack application from one of 16 pre-built boilerplate
 * stacks hosted on the brewnet-boilerplate GitHub repository.
 *
 * Usage:
 *   brewnet create-app <project-name> [--stack <STACK_ID>] [--database <DB_DRIVER>]
 *
 * Execution flow (10 steps):
 *   1. Pre-flight: Docker check + directory existence check
 *   2. Stack resolution: --stack flag OR interactive prompts
 *   3. Rust warning (if applicable)
 *   4. Clone: git clone --depth=1 -b stack/<id>
 *   5. Env: generate .env from .env.example with secure secrets
 *   6. Git reinit: clean history for the scaffolded project
 *   7. Start: docker compose up -d --build
 *   8. Health poll: GET /health until ready
 *   9. Verify: GET /api/hello + POST /api/echo
 *  10. Success box
 *
 * @module commands/create-app
 */

import { existsSync, rmSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { select } from '@inquirer/prompts';
import {
  STACK_CATALOG,
  VALID_STACK_IDS,
  VALID_DB_DRIVERS,
  getStackById,
  getStacksByLanguage,
} from '../config/stacks.js';
import {
  cloneStack,
  generateEnv,
  reinitGit,
  startContainers,
  pollHealth,
  verifyEndpoints,
} from '../services/boilerplate-manager.js';
import { checkDocker } from '../services/system-checker.js';
import { BrewnetError } from '../utils/errors.js';
import type { StackEntry } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// T010 — Command Registration
// ---------------------------------------------------------------------------

export interface CreateAppCommandOptions {
  stack?: string;
  database?: string;
}

/**
 * Register the `brewnet create-app` command on the given Commander program.
 */
export function registerCreateAppCommand(program: Command): void {
  program
    .command('create-app <project-name>')
    .description('Scaffold a full-stack app from a pre-built boilerplate stack')
    .option(
      '--stack <STACK_ID>',
      `Pre-select a stack (skips interactive prompts). Valid IDs:\n  ${STACK_CATALOG.map((s) => s.id).join(', ')}`,
    )
    .option(
      '--database <DB_DRIVER>',
      'Database driver: sqlite3 (default, no container), postgres, mysql',
      'sqlite3',
    )
    .addHelpText(
      'after',
      `
Examples:
  $ brewnet create-app my-app                          # Interactive selection, SQLite
  $ brewnet create-app my-api --stack go-gin           # Direct stack, SQLite
  $ brewnet create-app my-api --stack nodejs-express --database postgres
`,
    )
    .action(async (projectName: string, options: CreateAppCommandOptions) => {
      await runCreateApp(projectName, options);
    });
}

// ---------------------------------------------------------------------------
// Audit Logging — Constitution Principle III compliance (C1)
// ---------------------------------------------------------------------------

interface AuditEntry {
  timestamp: string;
  command: 'create-app';
  projectName: string;
  stackId: string;
  dbDriver: string;
  status: 'started' | 'success' | 'failed';
  elapsedMs?: number;
  error?: string;
}

/**
 * Append a JSONL audit log entry to ~/.brewnet/logs/create-app.log.
 * Errors are silently suppressed — audit logging MUST NOT break the command.
 */
function writeAuditLog(entry: AuditEntry): void {
  try {
    const logDir = join(homedir(), '.brewnet', 'logs');
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'create-app.log'), JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Audit logging failure must not affect command execution
  }
}

// ---------------------------------------------------------------------------
// T011 — Interactive Stack Selection
// ---------------------------------------------------------------------------

/**
 * Present a two-step interactive selection:
 *   1. Select language (6 choices)
 *   2. Select framework (filtered by language)
 *
 * Returns the selected StackEntry.
 */
async function selectStackInteractively(): Promise<StackEntry> {
  const byLanguage = getStacksByLanguage();
  const languages = Object.keys(byLanguage);

  const selectedLanguage = await select<string>({
    message: 'Select a language',
    choices: languages.map((lang) => ({
      name: `${lang} (${byLanguage[lang]!.length} framework${byLanguage[lang]!.length > 1 ? 's' : ''})`,
      value: lang,
    })),
  });

  const frameworkChoices = byLanguage[selectedLanguage]!;
  const selectedStack = await select<StackEntry>({
    message: 'Select a framework',
    choices: frameworkChoices.map((stack) => ({
      name: `${stack.framework}  ${chalk.dim(`(${stack.orm}, v${stack.version})`)}`,
      value: stack,
    })),
  });

  return selectedStack;
}

// ---------------------------------------------------------------------------
// T012 — Main Command Handler (10-step flow)
// ---------------------------------------------------------------------------

async function runCreateApp(
  projectName: string,
  options: CreateAppCommandOptions,
): Promise<void> {
  const projectDir = resolve(projectName);
  const dbDriver = options.database ?? 'sqlite3';
  const startTime = Date.now();

  // Tracks whether clone completed — used by cleanup logic in catch + SIGINT
  let cloneSucceeded = false;
  // Tracks resolved stack ID for audit log (updated after interactive selection)
  let resolvedStackId = options.stack ?? '(interactive)';

  // ── U1: SIGINT handler — clean up partial directory on Ctrl+C ───────────
  const sigintHandler = (): void => {
    process.removeListener('SIGINT', sigintHandler);
    if (!cloneSucceeded && existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
      console.log(chalk.yellow('\n\nAborted. Partial directory removed.'));
    } else {
      console.log(chalk.yellow('\n\nAborted.'));
    }
    writeAuditLog({
      timestamp: new Date().toISOString(),
      command: 'create-app',
      projectName,
      stackId: resolvedStackId,
      dbDriver,
      status: 'failed',
      elapsedMs: Date.now() - startTime,
      error: 'User aborted (SIGINT)',
    });
    process.exit(130);
  };
  process.on('SIGINT', sigintHandler);

  try {
    // ── US5: Pre-flight — Docker check ─────────────────────────────────────
    const dockerCheck = await checkDocker();
    if (dockerCheck.status !== 'pass') {
      throw BrewnetError.dockerNotRunning();
    }

    // ── US5: Pre-flight — directory existence ──────────────────────────────
    if (existsSync(projectDir)) {
      throw BrewnetError.directoryConflict(projectName);
    }

    // ── US2: Stack validation / US1: Interactive selection ─────────────────
    let stack: StackEntry;
    if (options.stack) {
      if (!VALID_STACK_IDS.has(options.stack)) {
        throw BrewnetError.resourceNotFound(
          `stack ID "${options.stack}"\n\n  Valid IDs:\n    ${STACK_CATALOG.map((s) => s.id).join(', ')}`,
        );
      }
      stack = getStackById(options.stack)!;
    } else {
      stack = await selectStackInteractively();
    }
    resolvedStackId = stack.id;

    // ── US3: Database validation ────────────────────────────────────────────
    if (!VALID_DB_DRIVERS.includes(dbDriver as (typeof VALID_DB_DRIVERS)[number])) {
      throw BrewnetError.resourceNotFound(
        `database driver "${dbDriver}"\n\n  Valid options: ${VALID_DB_DRIVERS.join(', ')}`,
      );
    }

    // ── C1: Audit log — operation started ──────────────────────────────────
    writeAuditLog({
      timestamp: new Date().toISOString(),
      command: 'create-app',
      projectName,
      stackId: stack.id,
      dbDriver,
      status: 'started',
    });

    // ── US4: Rust build warning ─────────────────────────────────────────────
    if (stack.buildSlow) {
      console.log(
        chalk.yellow(
          `\n⚠  Rust Warning: First build may take 3-10 minutes due to Rust compilation.\n` +
            `   Health check timeout extended to 10 minutes. Please be patient.\n`,
        ),
      );
    }

    const healthTimeoutMs = stack.buildSlow ? 600_000 : 120_000;
    const backendPort = stack.isUnified ? 3000 : 8080;
    const baseUrl = `http://127.0.0.1:${backendPort}`;

    // ── Step 1: Clone ───────────────────────────────────────────────────
    const cloneSpinner = ora(`Cloning stack/${stack.id} from brewnet-boilerplate…`).start();
    try {
      await cloneStack(stack.id, projectDir);
      cloneSucceeded = true;
      cloneSpinner.succeed(`Cloned ${stack.id}`);
    } catch {
      cloneSpinner.fail('Clone failed');
      throw BrewnetError.cloneFailed(stack.id);
    }

    // ── Step 2: Generate .env ───────────────────────────────────────────
    const envSpinner = ora('Generating .env with secure credentials…').start();
    try {
      generateEnv(projectDir, stack.id, dbDriver);
      envSpinner.succeed('.env generated');
    } catch (err) {
      envSpinner.fail('.env generation failed');
      throw err;
    }

    // ── Step 3: Git reinit ──────────────────────────────────────────────
    const gitSpinner = ora('Initializing git repository…').start();
    try {
      await reinitGit(projectDir);
      gitSpinner.succeed('Git repository initialized');
    } catch (err) {
      gitSpinner.fail('Git initialization failed');
      throw err;
    }

    // ── Step 4: Start containers ────────────────────────────────────────
    const buildMsg = stack.buildSlow
      ? 'Building and starting containers (up to 10 min for Rust)…'
      : 'Building and starting containers…';
    const buildSpinner = ora(buildMsg).start();
    try {
      await startContainers(projectDir);
      buildSpinner.succeed('Containers started');
    } catch (err) {
      buildSpinner.fail('Container startup failed');
      // U2: Detect port-already-in-use from docker compose output (BN002)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('address already in use') || msg.includes('port is already allocated')) {
        const portMatch = msg.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1]!, 10) : backendPort;
        throw BrewnetError.portConflict(port);
      }
      throw BrewnetError.buildFailed(msg.slice(0, 500));
    }

    // ── Step 5: Health polling with elapsed timer ───────────────────────
    const healthStart = Date.now();
    const healthSpinner = ora('Waiting for backend to become healthy… (0s elapsed)').start();
    const healthInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - healthStart) / 1000);
      healthSpinner.text = `Waiting for backend to become healthy… (${elapsed}s elapsed)`;
    }, 1000);

    let healthResult;
    try {
      healthResult = await pollHealth(baseUrl, healthTimeoutMs);
    } finally {
      clearInterval(healthInterval);
    }

    if (!healthResult.healthy) {
      healthSpinner.fail('Health check timed out');
      throw BrewnetError.healthCheckTimeout(healthTimeoutMs / 1000);
    }
    healthSpinner.succeed(
      `Backend healthy (${Math.round(healthResult.elapsedMs / 1000)}s)` +
        (healthResult.dbConnected === false ? chalk.yellow(' — DB not connected') : ''),
    );

    // ── Step 6: Verify API endpoints ────────────────────────────────────
    const verifySpinner = ora('Verifying API endpoints…').start();
    try {
      await verifyEndpoints(baseUrl);
      verifySpinner.succeed('API endpoints verified');
    } catch (err) {
      verifySpinner.fail('Endpoint verification failed');
      throw err;
    }

    // ── C1: Audit log — success ─────────────────────────────────────────
    writeAuditLog({
      timestamp: new Date().toISOString(),
      command: 'create-app',
      projectName,
      stackId: stack.id,
      dbDriver,
      status: 'success',
      elapsedMs: Date.now() - startTime,
    });

    // ── T013: Success box ─────────────────────────────────────────────────
    printSuccessBox(projectName, stack, dbDriver, backendPort);
  } catch (err) {
    // ── Cleanup partial directory ────────────────────────────────────────
    if (!cloneSucceeded && existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }

    // ── C1: Audit log — failure ─────────────────────────────────────────
    const errorMsg = err instanceof Error ? err.message : String(err);
    writeAuditLog({
      timestamp: new Date().toISOString(),
      command: 'create-app',
      projectName,
      stackId: resolvedStackId,
      dbDriver,
      status: 'failed',
      elapsedMs: Date.now() - startTime,
      error: errorMsg,
    });

    // ── Format and display error ─────────────────────────────────────────
    if (err instanceof BrewnetError) {
      console.error('\n' + err.format() + '\n');
    } else {
      console.error(chalk.red(`\nError: ${errorMsg}\n`));
    }
    process.exit(1);
  } finally {
    process.removeListener('SIGINT', sigintHandler);
  }
}

// ---------------------------------------------------------------------------
// T013 — printSuccessBox
// ---------------------------------------------------------------------------

/**
 * Print a bordered success summary after successful scaffolding.
 */
function printSuccessBox(
  projectName: string,
  stack: StackEntry,
  dbDriver: string,
  backendPort: number,
): void {
  const stackLabel = `${stack.id} (${stack.language} · ${stack.framework} · ${stack.orm})`;
  const dbLabel =
    dbDriver === 'sqlite3'
      ? `sqlite3 (no external container)`
      : `${dbDriver} (container on port ${dbDriver === 'postgres' ? '5433' : '3307'})`;

  const lines: string[] = [];

  lines.push(chalk.green(`✅ ${projectName} is ready!`));
  lines.push('');

  if (stack.isUnified) {
    lines.push(`App (UI + API)  →  ${chalk.cyan('http://localhost:3000')}`);
  } else {
    lines.push(`Frontend        →  ${chalk.cyan('http://localhost:3000')}`);
    lines.push(`Backend         →  ${chalk.cyan(`http://localhost:${backendPort}`)}`);
  }

  lines.push(`Stack           →  ${chalk.bold(stackLabel)}`);
  lines.push(`Database        →  ${dbLabel}`);
  lines.push('');
  lines.push(`cd ${projectName}`);
  lines.push(`make logs     ${chalk.dim('# view container logs')}`);
  lines.push(`make down     ${chalk.dim('# stop containers')}`);

  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const border = '─'.repeat(maxLen + 4);

  console.log('\n' + chalk.green('┌' + border + '┐'));
  for (const line of lines) {
    const pad = maxLen - stripAnsi(line).length;
    console.log(chalk.green('│') + '  ' + line + ' '.repeat(pad) + '  ' + chalk.green('│'));
  }
  console.log(chalk.green('└' + border + '┘') + '\n');
}

/**
 * Strip ANSI escape codes for length calculation.
 * Minimal implementation — covers common chalk escape sequences.
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}
