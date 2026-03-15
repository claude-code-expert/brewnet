// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { GiteaClient } from './gitea-client.js';
import { readApps, addApp, updateApp, removeApp as registryRemoveApp } from './app-registry.js';
import { getLastProject, loadState } from '../wizard/state.js';
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions } from '../types/app-entry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');

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
  const giteaPassword = readDotEnvValue(envPath, 'GITEA_ADMIN_PASSWORD') || (state?.admin as { password?: string } | undefined)?.password || '';
  // Gitea is behind Traefik on port 80 at /git — port 3000 is internal only
  const giteaBaseUrl = 'http://localhost/git';
  return { projectPath, giteaBaseUrl, giteaUser, giteaPassword };
}

// ---------------------------------------------------------------------------
// Internal: simple health poll
// ---------------------------------------------------------------------------

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
  const job = newJob(opts.appName, ['Validating', 'Gitea repo', 'Git push', 'Docker up', 'Health check']);
  jobs.set(job.jobId, job);

  // Run async — caller polls via getJobStatus
  setImmediate(() => void _runCreateApp(job, opts));

  return job.jobId;
}

async function _runCreateApp(job: AppJob, opts: CreateAppOptions): Promise<void> {
  try {
    const ctx = resolveContext();
    const appsJson = resolveAppsJsonPath();
    const GITEA_TOKEN_PATH = join(BREWNET_DIR, 'gitea-token');
    const gitea = new GiteaClient({
      baseUrl: ctx.giteaBaseUrl,
      username: ctx.giteaUser,
      password: ctx.giteaPassword,
      tokenPath: GITEA_TOKEN_PATH,
    });

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
  // Step 0: Validate
  setStep(job, 0, 'running');
  const metas = readBoilerplateMeta(ctx.projectPath);
  const meta = metas.find((m) => m.stackId === opts.stackId);
  if (!meta) throw new Error(`Installed boilerplate "${opts.stackId}" not found`);
  const port = opts.port ?? meta.port ?? parseInt(meta.backendUrl.split(':').pop() ?? '8080', 10);
  setStep(job, 0, 'done');

  // Step 1: Gitea repo
  setStep(job, 1, 'running');
  const alreadyExists = await gitea.repoExists(opts.appName);
  let cloneUrl: string;
  if (!alreadyExists) {
    cloneUrl = await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  } else {
    cloneUrl = `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}.git`;
  }
  setStep(job, 1, 'done');

  // Step 2: Git remote + push
  setStep(job, 2, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: meta.appDir }).catch(() => {
    return execa('git', ['remote', 'set-url', 'brewnet', authedUrl], { cwd: meta.appDir });
  });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: meta.appDir });
  setStep(job, 2, 'done');

  // Step 3: Docker up
  setStep(job, 3, 'running');
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: meta.appDir });
  setStep(job, 3, 'done');

  // Step 4: Health check
  setStep(job, 4, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`);
  setStep(job, 4, 'done');

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
}

async function _createModeB(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  appsJson: string,
): Promise<void> {
  if (!opts.gitUrl) throw new Error('gitUrl is required for mode B');
  const port = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  // Step 0: Clone + reinit (reinitGit from boilerplate-manager uses rmSync, not shell rm -rf)
  setStep(job, 0, 'running');
  const { reinitGit: reinitGitB } = await import('./boilerplate-manager.js');
  await execa('git', ['clone', '--depth', '1', opts.gitUrl, appDir]);
  await reinitGitB(appDir);
  setStep(job, 0, 'done');

  setStep(job, 1, 'running');
  const alreadyExists = await gitea.repoExists(opts.appName);
  const cloneUrl = alreadyExists
    ? `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}.git`
    : await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  setStep(job, 1, 'done');

  setStep(job, 2, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: appDir });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: appDir });
  setStep(job, 2, 'done');

  setStep(job, 3, 'running');
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: appDir });
  setStep(job, 3, 'done');

  setStep(job, 4, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`);
  setStep(job, 4, 'done');

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
  const { cloneStack, generateEnv, reinitGit } = await import('./boilerplate-manager.js');
  const { resolveStackId } = await import('../config/frameworks.js');

  // resolveStackId can return null for unknown combos — fail fast
  const stackId = resolveStackId(opts.language ?? 'nodejs', opts.frameworkId ?? 'express');
  if (!stackId) throw new Error(`Unknown stack: ${opts.language}/${opts.frameworkId}`);
  const port = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  setStep(job, 0, 'running');
  await cloneStack(stackId, appDir);
  generateEnv(appDir, stackId, 'sqlite3', { hostPort: port });
  await reinitGit(appDir);
  setStep(job, 0, 'done');

  setStep(job, 1, 'running');
  const cloneUrl = await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  setStep(job, 1, 'done');

  setStep(job, 2, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: appDir });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: appDir });
  setStep(job, 2, 'done');

  setStep(job, 3, 'running');
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: appDir });
  setStep(job, 3, 'done');

  setStep(job, 4, 'running');
  await _pollHealth(`http://127.0.0.1:${port}/health`, 120_000);
  setStep(job, 4, 'done');

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
