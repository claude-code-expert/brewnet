// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { GiteaClient } from './gitea-client.js';
import { readApps, addApp, updateApp, removeApp as registryRemoveApp, readDeployHistory, appendDeployHistory } from './app-registry.js';
import { getLastProject, loadState } from '../wizard/state.js';
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions, DeployHistoryEntry, GitRepoEntry, AppGitInfo, DeploySettings } from '../types/app-entry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');
const GITEA_TOKEN_PATH = join(BREWNET_DIR, 'gitea-token');
const DEPLOY_HISTORY_PATH = join(BREWNET_DIR, 'deploy-history.json');

// ---------------------------------------------------------------------------
// In-memory job store (ephemeral — cleared on server restart)
// ---------------------------------------------------------------------------

const jobs = new Map<string, AppJob>();

// ---------------------------------------------------------------------------
// Exported helpers (testable in isolation)
// ---------------------------------------------------------------------------

export function resolveAppsJsonPath(): string {
  return join(BREWNET_DIR, 'apps.json');
}

/** Parse a single KEY=VALUE line from a .env file. Returns '' if not found. */
export function readDotEnvValue(envPath: string, key: string): string {
  if (!existsSync(envPath)) return '';
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listApps(): Promise<AppEntry[]> {
  return readApps(resolveAppsJsonPath());
}

export function getDeployHistory(appName?: string): DeployHistoryEntry[] {
  const entries = readDeployHistory(DEPLOY_HISTORY_PATH);
  if (!appName) return entries;
  return entries.filter((e) => e.appName === appName);
}

export async function listGiteaRepos(): Promise<GitRepoEntry[]> {
  const ctx = resolveContext();
  const gitea = new GiteaClient({
    baseUrl: ctx.giteaBaseUrl,
    username: ctx.giteaUser,
    password: ctx.giteaPassword,
    tokenPath: GITEA_TOKEN_PATH,
  });
  await gitea.prepare(); // validate/refresh token before listing
  return gitea.listRepos();
}

export function getDeploySettings(appName: string): DeploySettings {
  const apps = readApps(resolveAppsJsonPath());
  const app = apps.find((a) => a.name === appName);
  const settings = (app as (AppEntry & { deploySettings?: DeploySettings }) | undefined)?.deploySettings;
  return settings ?? { autoDeploy: false, deployBranch: 'main' };
}

export function updateDeploySettings(appName: string, settings: Partial<DeploySettings>): void {
  const appsJson = resolveAppsJsonPath();
  const apps = readApps(appsJson);
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  const existing = (app as AppEntry & { deploySettings?: DeploySettings }).deploySettings
    ?? { autoDeploy: false, deployBranch: 'main' };
  (app as AppEntry & { deploySettings?: DeploySettings }).deploySettings = { ...existing, ...settings };
  updateApp(appsJson, appName, app as Partial<AppEntry>);
}

export async function getAppGitInfo(appName: string): Promise<AppGitInfo> {
  const ctx = resolveContext();
  const apps = readApps(resolveAppsJsonPath());
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);

  const gitea = new GiteaClient({
    baseUrl: ctx.giteaBaseUrl,
    username: ctx.giteaUser,
    password: ctx.giteaPassword,
    tokenPath: GITEA_TOKEN_PATH,
  });

  let branch = 'main';
  let latestCommit: AppGitInfo['latestCommit'] = null;
  let cloneUrlSsh = `ssh://git@localhost:2222/${ctx.giteaUser}/${appName}.git`;

  try {
    const repo = await gitea.getRepo(appName);
    branch = repo.default_branch || 'main';
    cloneUrlSsh = repo.ssh_url || cloneUrlSsh;
    latestCommit = await gitea.getLatestCommit(appName, branch);
  } catch {
    // Gitea might not be running — return partial info
  }

  return {
    giteaUrl: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${appName}`,
    cloneUrlHttp: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${appName}.git`,
    cloneUrlSsh,
    localPath: app.appDir,
    branch,
    latestCommit,
  };
}

export async function setupWebhook(appName: string, webhookUrl: string): Promise<void> {
  const ctx = resolveContext();
  const settings = getDeploySettings(appName);
  const secret = settings.webhookSecret ?? randomBytes(16).toString('hex');

  const gitea = new GiteaClient({
    baseUrl: ctx.giteaBaseUrl,
    username: ctx.giteaUser,
    password: ctx.giteaPassword,
    tokenPath: GITEA_TOKEN_PATH,
  });

  await gitea.createWebhook(appName, webhookUrl, secret);
  updateDeploySettings(appName, { webhookSecret: secret });
}

export async function deployApp(appName: string): Promise<string> {
  const job = newJob(appName, ['Pull', 'Build & Start', 'Health check']);
  jobs.set(job.jobId, job);
  setImmediate(() => void _runDeploy(job, appName));
  return job.jobId;
}

async function _runDeploy(job: AppJob, appName: string): Promise<void> {
  try {
    const apps = readApps(resolveAppsJsonPath());
    const app = apps.find((a) => a.name === appName);
    if (!app) throw new Error(`App "${appName}" not found`);
    const settings = getDeploySettings(appName);

    setStep(job, 0, 'running');
    await execa('git', ['pull', 'brewnet', settings.deployBranch], { cwd: app.appDir }).catch(() => {});
    setStep(job, 0, 'done');

    setStep(job, 1, 'running');
    await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: app.appDir });
    setStep(job, 1, 'done');

    setStep(job, 2, 'running');
    await _pollHealth(`http://127.0.0.1:${app.port}/health`);
    setStep(job, 2, 'done');

    updateApp(resolveAppsJsonPath(), appName, { status: 'running' });
    appendDeployHistory(DEPLOY_HISTORY_PATH, {
      appName,
      commitHash: '',
      commitMessage: 'Manual deploy',
      status: 'success',
      deployedAt: new Date().toISOString(),
    });

    job.status = 'done';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    for (const step of job.steps) {
      if (step.status === 'running' || step.status === 'pending') step.status = 'failed';
    }
    appendDeployHistory(DEPLOY_HISTORY_PATH, {
      appName,
      commitHash: '',
      commitMessage: 'Manual deploy',
      status: 'failed',
      deployedAt: new Date().toISOString(),
    });
  }
}

export function getAppDir(appName: string): string | undefined {
  const apps = readApps(resolveAppsJsonPath());
  return apps.find((a) => a.name === appName)?.appDir;
}

export function getJobStatus(jobId: string): AppJob | undefined {
  return jobs.get(jobId);
}

// ---------------------------------------------------------------------------
// Internal: job helpers
// ---------------------------------------------------------------------------

function newJob(appName: string, stepLabels: string[]): AppJob {
  return {
    jobId: randomBytes(8).toString('hex'),
    appName,
    status: 'running',
    steps: stepLabels.map((label) => ({ label, status: 'pending' })),
  };
}

function setStep(job: AppJob, index: number, status: AppJobStep['status'], message?: string): void {
  const step = job.steps[index];
  if (step) { step.status = status; if (message) step.message = message; }
}

// ---------------------------------------------------------------------------
// Internal: read boilerplate meta from project
// ---------------------------------------------------------------------------

interface BoilerplateMeta {
  stackId: string;
  appDir: string;
  backendUrl: string;
  port?: number;
  lang: string;
  frameworkId: string;
  status: string;
}

function readBoilerplateMeta(projectPath: string): BoilerplateMeta[] {
  const p = join(projectPath, '.brewnet-boilerplate.json');
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(raw) ? raw : [raw];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Internal: resolve wizard context
// ---------------------------------------------------------------------------

interface AppContext {
  projectPath: string;
  giteaBaseUrl: string;
  giteaUser: string;
  giteaPassword: string;
}

function resolveContext(): AppContext {
  const last = getLastProject();
  const state = loadState(last ?? '');
  const raw = (state as { projectPath?: string } | null)?.projectPath ?? process.cwd();
  const projectPath = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  const envPath = join(projectPath, '.env');
  const giteaUser = readDotEnvValue(envPath, 'GITEA_ADMIN_USER') || (state?.admin as { username?: string } | undefined)?.username || 'admin';
  // GITEA_ADMIN_PASSWORD is a Docker secret, NOT in .env — read from secrets file first
  const secretsPath = join(projectPath, 'secrets', 'admin_password');
  const secretsPassword = existsSync(secretsPath) ? readFileSync(secretsPath, 'utf-8').trim() : '';
  const giteaPassword = secretsPassword || readDotEnvValue(envPath, 'GITEA_ADMIN_PASSWORD') || (state?.admin as { password?: string } | undefined)?.password || '';
  // Gitea is behind Traefik on port 80 at /git — port 3000 is internal only
  const giteaBaseUrl = 'http://localhost/git';
  return { projectPath, giteaBaseUrl, giteaUser, giteaPassword };
}

// ---------------------------------------------------------------------------
// Internal: simple health poll
// ---------------------------------------------------------------------------

/**
 * Assert that a docker-compose.yml (or compose.yml) exists in `dir`.
 *
 * Docker Compose v2 traverses parent directories when no compose file is found
 * in the working directory. Without this guard, a missing compose file would
 * silently run the parent project's compose (e.g. my-homeserver), report
 * Docker up as "done", and leave the app's health check permanently failing.
 */
function assertComposeFile(dir: string): void {
  if (!existsSync(join(dir, 'docker-compose.yml')) && !existsSync(join(dir, 'compose.yml'))) {
    throw new Error(
      `No docker-compose.yml found in ${dir}. ` +
        'The cloned repository must contain a Docker Compose configuration at its root.',
    );
  }
}

async function _pollHealth(url: string, maxMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Health check timed out after ${maxMs / 1000}s: ${url}`);
}

// ---------------------------------------------------------------------------
// Public: createApp
// ---------------------------------------------------------------------------

export async function createApp(opts: CreateAppOptions): Promise<string> {
  const job = newJob(opts.appName, ['Validating', 'Gitea setup', 'Gitea repo', 'Git push', 'Docker up', 'Health check']);
  jobs.set(job.jobId, job);

  // Run async — caller polls via getJobStatus
  setImmediate(() => void _runCreateApp(job, opts));

  return job.jobId;
}

async function _runCreateApp(job: AppJob, opts: CreateAppOptions): Promise<void> {
  try {
    const ctx = resolveContext();
    const appsJson = resolveAppsJsonPath();

    // Step 0: Validating — mode-specific pre-checks
    setStep(job, 0, 'running');
    if (opts.mode === 'boilerplate') {
      const metas = readBoilerplateMeta(ctx.projectPath);
      const meta = metas.find((m) => m.stackId === opts.stackId);
      if (!meta) throw new Error(`Installed boilerplate "${opts.stackId}" not found. Use "New Project" tab to create a fresh project.`);
      // Stash validated meta on opts for use in _createModeA
      (opts as CreateAppOptions & { _meta?: unknown })._meta = meta;
    } else if (opts.mode === 'git-url') {
      if (!opts.gitUrl) throw new Error('gitUrl is required for Git Clone mode');
    } else if (opts.mode === 'new-project') {
      const { resolveStackId } = await import('../config/frameworks.js');
      const stackId = resolveStackId(opts.language ?? 'nodejs', opts.frameworkId ?? 'express');
      if (!stackId) throw new Error(`Unknown stack: ${opts.language}/${opts.frameworkId}`);
      (opts as CreateAppOptions & { _resolvedStackId?: string })._resolvedStackId = stackId;
    }
    setStep(job, 0, 'done');

    // Step 1: Gitea setup — ensure token exists, auto-fix mustChangePassword if needed
    setStep(job, 1, 'running');
    const gitea = new GiteaClient({
      baseUrl: ctx.giteaBaseUrl,
      username: ctx.giteaUser,
      password: ctx.giteaPassword,
      tokenPath: GITEA_TOKEN_PATH,
    });
    const giteaPrep = await gitea.prepare();
    setStep(job, 1, 'done', giteaPrep.message);

    if (opts.mode === 'boilerplate') {
      await _createModeA(job, opts, ctx, gitea, appsJson);
    } else if (opts.mode === 'git-url') {
      await _createModeB(job, opts, ctx, gitea, appsJson);
    } else {
      await _createModeC(job, opts, ctx, gitea, appsJson);
    }

    job.status = 'done';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    for (const step of job.steps) {
      if (step.status === 'running' || step.status === 'pending') step.status = 'failed';
    }
  }
}

async function _createModeA(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  appsJson: string,
): Promise<void> {
  // Step 0 already done in _runCreateApp — retrieve validated meta
  const meta = (opts as CreateAppOptions & { _meta?: BoilerplateMeta })._meta!;
  const port = opts.port ?? meta.port ?? parseInt(meta.backendUrl.split(':').pop() ?? '8080', 10);

  // Step 2: Gitea repo
  setStep(job, 2, 'running');
  const alreadyExists = await gitea.repoExists(opts.appName);
  let cloneUrl: string;
  if (!alreadyExists) {
    cloneUrl = await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  } else {
    cloneUrl = `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}.git`;
  }
  setStep(job, 2, 'done');

  // Step 3: Git remote + push
  setStep(job, 3, 'running');
  // Boilerplates are cloned --depth 1; Gitea rejects shallow pushes to empty repos.
  // Unshallow first (try origin), fall back to a fresh git init if origin is unreachable.
  const shallowCheck = await execa('git', ['rev-parse', '--is-shallow-repository'], { cwd: meta.appDir }).catch(() => ({ stdout: 'false' }));
  if (shallowCheck.stdout.trim() === 'true') {
    await execa('git', ['fetch', '--unshallow', 'origin'], { cwd: meta.appDir }).catch(async () => {
      const { reinitGit } = await import('./boilerplate-manager.js');
      await reinitGit(meta.appDir);
    });
  }
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: meta.appDir }).catch(() => {
    return execa('git', ['remote', 'set-url', 'brewnet', authedUrl], { cwd: meta.appDir });
  });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: meta.appDir });
  setStep(job, 3, 'done');

  // Step 4: Docker up
  setStep(job, 4, 'running');
  assertComposeFile(meta.appDir);
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: meta.appDir });
  setStep(job, 4, 'done');

  // Step 5: Health check
  setStep(job, 5, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`);
  setStep(job, 5, 'done');

  // Register
  addApp(appsJson, {
    name: opts.appName,
    mode: 'boilerplate',
    stackId: opts.stackId,
    appDir: meta.appDir,
    lang: meta.lang,
    framework: meta.frameworkId,
    port,
    giteaRepoUrl: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
  // Register Gitea webhook for auto-deploy (non-blocking — fail silently)
  await setupWebhook(opts.appName, 'http://localhost:8088/api/deploy/hook').catch(() => {});
}

async function _createModeB(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  appsJson: string,
): Promise<void> {
  // Step 0 already done in _runCreateApp
  const port = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  // Step 2: Clone external repo + create Gitea repo
  setStep(job, 2, 'running', 'Cloning external repository...');
  const { reinitGit: reinitGitB } = await import('./boilerplate-manager.js');
  await execa('git', ['clone', '--depth', '1', opts.gitUrl!, appDir]);
  await reinitGitB(appDir);
  const alreadyExists = await gitea.repoExists(opts.appName);
  const cloneUrl = alreadyExists
    ? `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}.git`
    : await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  setStep(job, 2, 'done');

  setStep(job, 3, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: appDir });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: appDir });
  setStep(job, 3, 'done');

  setStep(job, 4, 'running');
  assertComposeFile(appDir);
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: appDir });
  setStep(job, 4, 'done');

  setStep(job, 5, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`);
  setStep(job, 5, 'done');

  addApp(appsJson, {
    name: opts.appName,
    mode: 'git-url',
    sourceUrl: opts.gitUrl,
    appDir,
    port,
    giteaRepoUrl: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}

async function _createModeC(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  appsJson: string,
): Promise<void> {
  const { cloneStack, generateEnv, reinitGit, findFreePort } = await import('./boilerplate-manager.js');
  const { getStackById } = await import('../config/stacks.js');

  // Step 0 already done in _runCreateApp — retrieve resolved stackId
  const stackId = (opts as CreateAppOptions & { _resolvedStackId?: string })._resolvedStackId!;
  const port = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  // Clone and scaffold (visible as part of Gitea repo step context)
  await cloneStack(stackId, appDir);
  // Non-unified stacks have a separate frontend container on port 3000 by default.
  // Auto-detect a free port to prevent "port already allocated" errors when the
  // homeserver boilerplate is already running on port 3000.
  const stackInfo = getStackById(stackId);
  const frontendPort = (stackInfo && !stackInfo.isUnified) ? await findFreePort(3000) : undefined;
  generateEnv(appDir, stackId, 'sqlite3', { hostPort: port, frontendPort });
  await reinitGit(appDir);

  setStep(job, 2, 'running');
  const cloneUrl = await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  setStep(job, 2, 'done');

  setStep(job, 3, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: appDir });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: appDir });
  setStep(job, 3, 'done');

  setStep(job, 4, 'running');
  assertComposeFile(appDir);
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: appDir });
  setStep(job, 4, 'done');

  setStep(job, 5, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`, 120_000);
  setStep(job, 5, 'done');

  addApp(appsJson, {
    name: opts.appName,
    mode: 'new-project',
    stackId,
    appDir,
    lang: opts.language,
    framework: opts.frameworkId,
    port,
    giteaRepoUrl: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}

export async function startApp(appName: string): Promise<void> {
  const appsJson = resolveAppsJsonPath();
  const apps = readApps(appsJson);
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'up', '-d'], { cwd: app.appDir });
  updateApp(appsJson, appName, { status: 'running' });
}

export async function stopApp(appName: string): Promise<void> {
  const appsJson = resolveAppsJsonPath();
  const apps = readApps(appsJson);
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'down'], { cwd: app.appDir });
  updateApp(appsJson, appName, { status: 'stopped' });
}

export async function removeApp(appName: string): Promise<void> {
  const appsJson = resolveAppsJsonPath();
  const apps = readApps(appsJson);
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'down', '--volumes'], { cwd: app.appDir }).catch(() => {});
  registryRemoveApp(appsJson, appName);
}
