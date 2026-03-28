// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { GiteaClient } from './gitea-client.js';
import { listApps as dbListApps, getApp as dbGetApp, addApp as dbAddApp, updateApp as dbUpdateApp, removeApp as dbRemoveApp, getDeployHistory as dbGetDeployHistory, appendDeployHistory as dbAppendDeployHistory, getSetting, setSetting } from './project-db.js';
import { getLastProject, loadState, discoverProjectPath } from '../wizard/state.js';
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions, DeployHistoryEntry, GitRepoEntry, AppGitInfo, DeploySettings } from '../types/app-entry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREWNET_DIR = join(homedir(), '.brewnet');
const GITEA_TOKEN_PATH = join(BREWNET_DIR, 'gitea-token');

// ---------------------------------------------------------------------------
// In-memory job store (ephemeral — cleared on server restart)
// ---------------------------------------------------------------------------

const jobs = new Map<string, AppJob>();

// ---------------------------------------------------------------------------
// Exported helpers (testable in isolation)
// ---------------------------------------------------------------------------

export function resolveProjectPath(): string {
  return _adminProjectPath ?? discoverProjectPath() ?? process.cwd();
}

// ---------------------------------------------------------------------------
// Admin server project path override
// ---------------------------------------------------------------------------

/**
 * Module-level project path set by admin-server at startup.
 * Ensures resolveContext() always operates on the correct project even when
 * multiple .brewnet.db files exist (discoverProjectPath picks by mtime which
 * can return a different project than the one admin-server was started with).
 */
let _adminProjectPath: string | null = null;

/**
 * Called by admin-server immediately after it resolves its project path.
 * All subsequent resolveContext() calls in this process will use this path.
 */
export function setAdminProjectPath(path: string): void {
  _adminProjectPath = path;
}

// ---------------------------------------------------------------------------
// Gitea config cache — persists confirmed baseUrl/username so resolveContext()
// doesn't need to re-derive from wizardState on every call.
// Written at: wizard completion (generate.ts), Named Tunnel setup (admin-server.ts).
// ---------------------------------------------------------------------------

interface GiteaConfig {
  baseUrl: string;
  username: string;
  writtenAt: string;
}

export function loadGiteaConfig(): GiteaConfig | null {
  try {
    const pp = resolveProjectPath();
    const baseUrl = getSetting(pp, 'gitea.baseUrl');
    const username = getSetting(pp, 'gitea.username');
    if (!baseUrl || !username) return null;
    return { baseUrl, username, writtenAt: getSetting(pp, 'gitea.writtenAt') ?? '' };
  } catch {
    return null;
  }
}

export function saveGiteaConfig(baseUrl: string, username: string): void {
  try {
    const pp = resolveProjectPath();
    setSetting(pp, 'gitea.baseUrl', baseUrl);
    setSetting(pp, 'gitea.username', username);
    setSetting(pp, 'gitea.writtenAt', new Date().toISOString());
  } catch (e) {
    console.warn('[app-manager] gitea-config save failed:', e instanceof Error ? e.message : e);
  }
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

let _boilerplateRegistered = false;

export async function listApps(): Promise<AppEntry[]> {
  const projectPath = resolveProjectPath();
  const apps = dbListApps(projectPath);

  // Auto-register wizard boilerplates (once per process lifetime).
  // This bridges the gap between `brewnet init` (writes .brewnet-boilerplate.json)
  // and the Apps page (reads DB).
  if (_boilerplateRegistered) return apps;
  _boilerplateRegistered = true;
  try {
    const ctx = resolveContext();
    const bpPath = join(ctx.projectPath, '.brewnet-boilerplate.json');
    if (existsSync(bpPath)) {
      const raw = JSON.parse(readFileSync(bpPath, 'utf-8'));
      const bpMetas: Array<{ stackId: string; appDir: string; lang?: string; frameworkId?: string; status?: string; backendUrl?: string }> =
        Array.isArray(raw) ? raw : [raw];
      for (const bp of bpMetas) {
        if (!bp.stackId || !bp.appDir) continue;
        // Check if already registered by stackId or appDir
        const exists = apps.some((a) => a.appDir === bp.appDir || a.stackId === bp.stackId);
        if (!exists) {
          const port = bp.backendUrl ? parseInt(new URL(bp.backendUrl).port || '8080', 10) : 8080;
          const entry: AppEntry = {
            name: bp.stackId,
            mode: 'boilerplate',
            stackId: bp.stackId,
            appDir: bp.appDir,
            lang: bp.lang,
            framework: bp.frameworkId,
            port,
            status: (bp.status as AppEntry['status']) || 'running',
            createdAt: new Date().toISOString(),
          };
          dbAddApp(projectPath, entry);
          apps.push(entry);
        }
      }
    }
  } catch { /* non-critical — boilerplate auto-register is best-effort */ }

  return apps;
}

export function getDeployHistory(appName?: string): DeployHistoryEntry[] {
  const projectPath = resolveProjectPath();
  return dbGetDeployHistory(projectPath, appName);
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
  const pp = resolveProjectPath();
  const autoDeploy = getSetting(pp, `deploy.${appName}.autoDeploy`);
  const deployBranch = getSetting(pp, `deploy.${appName}.deployBranch`);
  const webhookSecret = getSetting(pp, `deploy.${appName}.webhookSecret`);
  return {
    autoDeploy: autoDeploy === 'true',
    deployBranch: deployBranch ?? 'main',
    ...(webhookSecret ? { webhookSecret } : {}),
  };
}

export function updateDeploySettings(appName: string, settings: Partial<DeploySettings>): void {
  const pp = resolveProjectPath();
  const app = dbGetApp(pp, appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  if (settings.autoDeploy !== undefined) setSetting(pp, `deploy.${appName}.autoDeploy`, String(settings.autoDeploy));
  if (settings.deployBranch !== undefined) setSetting(pp, `deploy.${appName}.deployBranch`, settings.deployBranch);
  if (settings.webhookSecret !== undefined) setSetting(pp, `deploy.${appName}.webhookSecret`, settings.webhookSecret);
}

export async function getAppGitInfo(appName: string): Promise<AppGitInfo> {
  const ctx = resolveContext();
  const app = dbGetApp(resolveProjectPath(), appName);
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
    // Auto-fix repos created before visibility change (private → public)
    if (repo.private) {
      await gitea.makeRepoPublic(appName).catch((e) => {
        console.warn(`[app-manager] makeRepoPublic failed for ${appName}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    latestCommit = await gitea.getLatestCommit(appName, branch);
  } catch (e) {
    console.warn(`[app-manager] getAppGitInfo Gitea call failed (${appName}): ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    giteaUrl: `${ctx.giteaDisplayUrl}/${ctx.giteaUser}/${appName}`,
    cloneUrlHttp: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${appName}.git`,
    cloneUrlSsh,
    localPath: app.appDir,
    branch,
    latestCommit,
  };
}

export async function rollbackApp(appName: string, commitHash: string): Promise<string> {
  const job = newJob(appName, ['Checkout', 'Build & Start', 'Health check']);
  jobs.set(job.jobId, job);
  setImmediate(() => void _runRollback(job, appName, commitHash));
  return job.jobId;
}

async function _runRollback(job: AppJob, appName: string, commitHash: string): Promise<void> {
  const pp = resolveProjectPath();
  try {
    const app = dbGetApp(pp, appName);
    if (!app) throw new Error(`App "${appName}" not found`);

    const target = commitHash || 'HEAD~1';
    setStep(job, 0, 'running', `git checkout ${target.slice(0, 7)}`);
    await execa('git', ['checkout', target], { cwd: app.appDir });
    setStep(job, 0, 'done');

    await _injectQuickTunnelIfNeeded(app.appDir, appName, app.port);

    setStep(job, 1, 'running', 'docker compose up --build');
    await _dockerComposeUp(app.appDir, job);
    setStep(job, 1, 'done', 'containers started');

    setStep(job, 2, 'running');
    const healthUrl = _buildHealthUrl(app.appDir, app.port);
    setStep(job, 2, 'running', `polling ${healthUrl}`);
    await _pollHealth(healthUrl, 120_000, job);
    setStep(job, 2, 'done');

    dbUpdateApp(pp, appName, { status: 'running' });
    dbAppendDeployHistory(pp, {
      appName,
      commitHash,
      commitMessage: `Rollback to ${commitHash.slice(0, 7)}`,
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
    dbAppendDeployHistory(pp, {
      appName,
      commitHash,
      commitMessage: `Rollback to ${commitHash.slice(0, 7)}`,
      status: 'failed',
      deployedAt: new Date().toISOString(),
    });
  }
}

export async function getAppBranches(appName: string): Promise<string[]> {
  const ctx = resolveContext();
  const gitea = new GiteaClient({
    baseUrl: ctx.giteaBaseUrl,
    username: ctx.giteaUser,
    password: ctx.giteaPassword,
    tokenPath: GITEA_TOKEN_PATH,
  });
  return gitea.listBranches(appName);
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

/**
 * Deploy a local path project without Gitea — Mode D (local-path).
 * Validates the path, registers the app in the project DB, auto-scaffolds
 * docker config if missing, then runs docker compose up + health check.
 */
export async function deployLocalApp(opts: {
  appName: string;
  localPath: string;
  port: number;
}): Promise<string> {
  const { appName, localPath, port } = opts;
  const job = newJob(appName, ['Validate', 'Scaffold', 'Docker up', 'Health check']);
  jobs.set(job.jobId, job);
  setImmediate(() => void _runDeployLocal(job, appName, localPath, port));
  return job.jobId;
}

async function _runDeployLocal(job: AppJob, appName: string, localPath: string, port: number): Promise<void> {
  const pp = resolveProjectPath();
  try {
    // Step 0: Validate path and project type
    setStep(job, 0, 'running');
    if (!existsSync(localPath)) throw new Error(`Path does not exist: ${localPath}`);
    const projectType = _detectProjectType(localPath);
    const hasDockerfile = existsSync(join(localPath, 'Dockerfile'));
    if (!projectType && !hasDockerfile) {
      throw new Error('Cannot detect project type and no Dockerfile found. Add a Dockerfile to deploy.');
    }
    appendLog(job, `[validate] ${projectType ? `Detected ${projectType} project` : 'Dockerfile found'}`);
    // Register in DB (idempotent)
    const existing = dbGetApp(pp, appName);
    if (!existing) {
      dbAddApp(pp, {
        name: appName,
        mode: 'local-path',
        appDir: localPath,
        port,
        status: 'creating',
        createdAt: new Date().toISOString(),
      });
    } else {
      dbUpdateApp(pp, appName, { appDir: localPath, port, status: 'creating' });
    }
    setStep(job, 0, 'done');

    // Step 1: Scaffold docker config if missing
    setStep(job, 1, 'running');
    ensureComposeFile(localPath, appName, port, job);
    await _injectQuickTunnelIfNeeded(localPath, appName, port);
    setStep(job, 1, 'done');

    // Step 2: Docker up
    setStep(job, 2, 'running', 'docker compose up --build');
    await _dockerComposeUp(localPath, job);
    setStep(job, 2, 'done', 'containers started');

    // Step 3: Health check
    setStep(job, 3, 'running');
    const healthUrl = _buildHealthUrl(localPath, port);
    setStep(job, 3, 'running', `polling ${healthUrl}`);
    await _pollHealth(healthUrl, 120_000, job);
    setStep(job, 3, 'done');

    dbUpdateApp(pp, appName, { status: 'running' });
    job.status = 'done';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    for (const step of job.steps) {
      if (step.status === 'running' || step.status === 'pending') step.status = 'failed';
    }
    dbUpdateApp(pp, appName, { status: 'failed' });
  }
}

async function _runDeploy(job: AppJob, appName: string): Promise<void> {
  const pp = resolveProjectPath();
  const app = dbGetApp(pp, appName);
  if (!app) { job.status = 'failed'; job.error = `App "${appName}" not found`; return; }
  try {
    const settings = getDeploySettings(appName);

    setStep(job, 0, 'running');
    try {
      const ctx = resolveContext();
      const gitea = new GiteaClient({
        baseUrl: ctx.giteaBaseUrl,
        username: ctx.giteaUser,
        password: ctx.giteaPassword,
        tokenPath: GITEA_TOKEN_PATH,
      });
      await gitea.prepare();
      const repoExists = await gitea.repoExists(appName);
      if (!repoExists) {
        appendLog(job, '[pull] Gitea repo not found — recreating and pushing local code');
        // Boilerplates are cloned --depth 1; unshallow before pushing to empty Gitea repo.
        const isShallowNew = await execa('git', ['rev-parse', '--is-shallow-repository'], { cwd: app.appDir })
          .then((r) => r.stdout.trim() === 'true').catch(() => false);
        if (isShallowNew) {
          appendLog(job, '[pull] shallow clone detected — unshallowing');
          await execa('git', ['fetch', '--unshallow', 'origin'], { cwd: app.appDir }).catch(async () => {
            const { reinitGit } = await import('./boilerplate-manager.js');
            await reinitGit(app.appDir);
          });
        }
        const cloneUrl = await gitea.createRepo(appName, `Brewnet app: ${appName}`);
        const authedUrl = gitea.authedCloneUrl(cloneUrl);
        await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: app.appDir }).catch(() =>
          execa('git', ['remote', 'set-url', 'brewnet', authedUrl], { cwd: app.appDir }),
        );
        await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: app.appDir });
        appendLog(job, '[pull] Gitea repo recreated and code pushed ✓');
      } else if (!existsSync(app.appDir)) {
        // appDir was deleted — re-clone from Gitea
        appendLog(job, '[pull] appDir missing — cloning from Gitea');
        const authedUrl = gitea.authedCloneUrl(`${ctx.giteaBaseUrl}/${ctx.giteaUser}/${appName}.git`);
        await execa('git', ['clone', authedUrl, app.appDir]);
        appendLog(job, '[pull] re-cloned from Gitea ✓');
      } else if (await gitea.repoIsEmpty(appName)) {
        // Repo exists but was never pushed to (e.g. created during app setup but push was skipped)
        appendLog(job, '[pull] Gitea repo is empty — pushing local code');
        // Boilerplates are cloned --depth 1; unshallow before pushing to empty Gitea repo.
        // reinitGit wipes .git, so remote must be added AFTER this step (same order as _createModeA).
        const isShallow = await execa('git', ['rev-parse', '--is-shallow-repository'], { cwd: app.appDir })
          .then((r) => r.stdout.trim() === 'true').catch(() => false);
        if (isShallow) {
          appendLog(job, '[pull] shallow clone detected — unshallowing');
          await execa('git', ['fetch', '--unshallow', 'origin'], { cwd: app.appDir }).catch(async () => {
            const { reinitGit } = await import('./boilerplate-manager.js');
            await reinitGit(app.appDir);
          });
        }
        const authedUrl = gitea.authedCloneUrl(`${ctx.giteaBaseUrl}/${ctx.giteaUser}/${appName}.git`);
        await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: app.appDir }).catch(() =>
          execa('git', ['remote', 'set-url', 'brewnet', authedUrl], { cwd: app.appDir }),
        );
        await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: app.appDir });
        appendLog(job, '[pull] code pushed to Gitea ✓');
      } else {
        await execa('git', ['pull', 'brewnet', settings.deployBranch], { cwd: app.appDir }).catch((e) => {
          appendLog(job, `[pull] git pull failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(job, `[pull] Gitea sync failed (non-critical): ${msg}`);
      console.warn(`[app-manager] Gitea sync failed for "${appName}": ${msg}`);
    }
    setStep(job, 0, 'done');

    // Check if deployable — must have docker-compose.yml (or auto-scaffold)
    const hasCompose = existsSync(join(app.appDir, 'docker-compose.yml')) || existsSync(join(app.appDir, 'compose.yml'));
    if (!hasCompose) {
      // Try auto-scaffold for known project types
      const projectType = _detectProjectType(app.appDir);
      if (projectType) {
        appendLog(job, `[scaffold] Detected ${projectType} project — generating Docker config`);
        _scaffoldDockerConfig(app.appDir, appName, app.port, job, projectType);
      } else {
        throw new Error(
          'This project has no docker-compose.yml or Dockerfile. ' +
          'Add a Dockerfile and docker-compose.yml to deploy, or use a Brewnet boilerplate.',
        );
      }
    }

    // Inject Traefik Quick Tunnel labels (idempotent — safe to call even if labels already present)
    await _injectQuickTunnelIfNeeded(app.appDir, appName, app.port);

    setStep(job, 1, 'running', 'docker compose up --build');
    await _dockerComposeUp(app.appDir, job);
    setStep(job, 1, 'done', 'containers started');

    setStep(job, 2, 'running');
    const healthUrlDeploy = _buildHealthUrl(app.appDir, app.port);
    setStep(job, 2, 'running', `polling ${healthUrlDeploy}`);
    await _pollHealth(healthUrlDeploy, 120_000, job);
    setStep(job, 2, 'done');

    dbUpdateApp(pp, appName, { status: 'running' });
    const headHash = await execa('git', ['rev-parse', 'HEAD'], { cwd: app.appDir })
      .then((r) => r.stdout.trim()).catch(() => '');
    const headMsg = await execa('git', ['log', '-1', '--format=%s'], { cwd: app.appDir })
      .then((r) => r.stdout.trim()).catch(() => 'Manual deploy');
    dbAppendDeployHistory(pp, {
      appName,
      commitHash: headHash,
      commitMessage: headMsg,
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
    const headHashFail = await execa('git', ['rev-parse', 'HEAD'], { cwd: app.appDir })
      .then((r) => r.stdout.trim()).catch(() => '');
    dbAppendDeployHistory(pp, {
      appName,
      commitHash: headHashFail,
      commitMessage: 'Manual deploy',
      status: 'failed',
      deployedAt: new Date().toISOString(),
    });
  }
}

export function getAppDir(appName: string): string | undefined {
  return dbGetApp(resolveProjectPath(), appName)?.appDir;
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

/** Append a log line to the job's rolling log buffer (max 200 lines). */
function appendLog(job: AppJob, line: string): void {
  if (!job.logs) job.logs = [];
  job.logs.push(line);
  if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
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
  giteaBaseUrl: string;    // Internal URL for API calls — always http://localhost/git
  giteaDisplayUrl: string; // URL for display/links — external URL in Named Tunnel mode
  giteaUser: string;
  giteaPassword: string;
}

function resolveContext(): AppContext {
  // Use the same project-path resolution as the rest of the codebase.
  // The old approach (getLastProject() → loadState() → projectPath) breaks whenever
  // ~/.brewnet/config.json has lastProject="" (e.g. after DB migration) because
  // loadState("") returns null and the fallback becomes process.cwd() — a completely
  // wrong path that causes all credential lookups to silently produce empty strings.
  const projectPath = resolveProjectPath();
  const envPath = join(projectPath, '.env');

  // Username: DB (gitea.username) → env file → default "admin"
  const cached = loadGiteaConfig();
  const giteaUser =
    cached?.username ||
    readDotEnvValue(envPath, 'GITEA_ADMIN_USER') ||
    'admin';

  // Password: SQLite DB is now the authoritative source (written during init/migration).
  // Falls back through secrets file → .env → legacy wizard state for backwards compatibility.
  let giteaPassword = '';
  try {
    giteaPassword = getSetting(projectPath, 'admin.password') ?? '';
  } catch { /* DB not initialized yet — continue to fallbacks */ }

  if (!giteaPassword) {
    const secretsPath = join(projectPath, 'secrets', 'admin_password');
    if (existsSync(secretsPath)) giteaPassword = readFileSync(secretsPath, 'utf-8').trim();
  }
  if (!giteaPassword) giteaPassword = readDotEnvValue(envPath, 'GITEA_ADMIN_PASSWORD');
  if (!giteaPassword) {
    // Legacy fallback: wizard state (selections.json) — only load if lastProject is non-empty
    const last = getLastProject();
    if (last) {
      const state = loadState(last);
      giteaPassword = (state?.admin as { password?: string } | undefined)?.password ?? '';
    }
  }

  // Tunnel mode & zone: DB is authoritative; wizard state as legacy fallback.
  let tunnelMode = '';
  let zoneName = '';
  try {
    tunnelMode = getSetting(projectPath, 'cf.tunnelMode') ?? '';
    zoneName = getSetting(projectPath, 'cf.zoneName') ?? '';
  } catch { /* DB not initialized */ }

  if (!tunnelMode || !zoneName) {
    const last = getLastProject();
    const state = last ? loadState(last) : null;
    if (!tunnelMode) tunnelMode = state?.domain?.cloudflare?.tunnelMode ?? '';
    if (!zoneName) zoneName = state?.domain?.cloudflare?.zoneName ?? '';
  }

  // Internal API URL: always local Traefik proxy — stable regardless of tunnel state.
  const giteaBaseUrl = 'http://localhost/git';
  // Display URL: external subdomain in Named Tunnel mode so dashboard links open correctly.
  // In Named Tunnel mode Gitea's ROOT_URL has no /git subpath, so local /git/ auth redirects
  // break in the browser. The external URL https://git.<zone>/ works correctly.
  const giteaDisplayUrl =
    tunnelMode === 'named' && zoneName ? `https://git.${zoneName}` : giteaBaseUrl;

  return { projectPath, giteaBaseUrl, giteaDisplayUrl, giteaUser, giteaPassword };
}

/** Inject Traefik Quick Tunnel labels if running in quick tunnel mode. */
async function _injectQuickTunnelIfNeeded(appDir: string, appName: string, port: number): Promise<void> {
  try {
    const last = getLastProject();
    const state = loadState(last ?? '');
    if (state?.domain?.cloudflare?.tunnelMode !== 'quick') return;
    const { injectTraefikForQuickTunnel } = await import('./boilerplate-manager.js');
    injectTraefikForQuickTunnel(appDir, appName, port);
  } catch (err) {
    // Log but don't fail — external access simply won't work
    console.error(`[Quick Tunnel] Failed to inject Traefik labels for ${appName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Internal: simple health poll
// ---------------------------------------------------------------------------

/**
 * Detect project type from files in the directory.
 */
function _detectProjectType(dir: string): 'nextjs' | 'nodejs' | 'python' | 'go' | 'rust' | 'java' | 'static' | null {
  try {
    if (existsSync(join(dir, 'next.config.ts')) || existsSync(join(dir, 'next.config.mjs')) || existsSync(join(dir, 'next.config.js'))) return 'nextjs';
    if (existsSync(join(dir, 'package.json'))) return 'nodejs';
    if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'pyproject.toml'))) return 'python';
    if (existsSync(join(dir, 'go.mod'))) return 'go';
    if (existsSync(join(dir, 'Cargo.toml'))) return 'rust';
    if (existsSync(join(dir, 'pom.xml')) || existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'))) return 'java';
    // Static HTML — fallback if index.html exists or any .html files
    if (existsSync(join(dir, 'index.html'))) return 'static';
    if (readdirSync(dir).some((f: string) => f.endsWith('.html'))) return 'static';
  } catch { /* ignore */ }
  return null;
}

/**
 * Generate Dockerfile + docker-compose.yml for projects that don't have them.
 */
function _scaffoldDockerConfig(dir: string, _appName: string, port: number, job?: AppJob, detectedType?: string): void {
  const type = detectedType || _detectProjectType(dir);
  if (!type) throw new Error(`Cannot auto-detect project type in ${dir}. Add a Dockerfile and docker-compose.yml manually.`);

  if (job && !detectedType) appendLog(job, `[scaffold] Detected ${type} project — generating Docker config`);

  let dockerfile = '';

  switch (type) {
    case 'nextjs':
      // Use simple single-stage build — external Next.js projects may not
      // have output:'standalone' configured, and modifying their config
      // can break cached Docker layers. Just npm install + build + start.
      dockerfile = [
        'FROM node:22-alpine',
        'WORKDIR /app',
        'COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./',
        'RUN npm install --legacy-peer-deps 2>/dev/null || yarn install 2>/dev/null || true',
        'COPY . .',
        'RUN npm run build',
        'ENV PORT=3000 HOSTNAME=0.0.0.0',
        'EXPOSE 3000',
        'CMD ["npm", "start"]',
      ].join('\n');
      break;
    case 'nodejs':
      dockerfile = [
        'FROM node:22-alpine',
        'WORKDIR /app',
        'COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./',
        'RUN npm install --legacy-peer-deps || true',
        'COPY . .',
        'RUN npm run build 2>/dev/null || true',
        'EXPOSE ' + port,
        'CMD ["npm", "start"]',
      ].join('\n');
      break;
    case 'python':
      dockerfile = [
        'FROM python:3.13-slim',
        'WORKDIR /app',
        'COPY requirements.txt* pyproject.toml* ./',
        'RUN pip install --no-cache-dir -r requirements.txt 2>/dev/null || pip install --no-cache-dir . 2>/dev/null || true',
        'COPY . .',
        'EXPOSE ' + port,
        'CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "' + port + '"]',
      ].join('\n');
      break;
    case 'go':
      dockerfile = [
        'FROM golang:1.22-alpine AS builder',
        'WORKDIR /app',
        'COPY go.mod go.sum* ./',
        'RUN go mod download',
        'COPY . .',
        'RUN CGO_ENABLED=0 go build -o server .',
        '',
        'FROM alpine',
        'WORKDIR /app',
        'COPY --from=builder /app/server .',
        'EXPOSE ' + port,
        'CMD ["./server"]',
      ].join('\n');
      break;
    case 'rust':
      dockerfile = [
        'FROM rust:1.88 AS builder',
        'WORKDIR /app',
        'COPY . .',
        'RUN cargo build --release',
        '',
        'FROM debian:bookworm-slim',
        'WORKDIR /app',
        'COPY --from=builder /app/target/release/* /app/ 2>/dev/null || true',
        'EXPOSE ' + port,
        'CMD ["./app"]',
      ].join('\n');
      break;
    case 'java':
      dockerfile = [
        'FROM gradle:8.12-jdk21 AS builder',
        'WORKDIR /app',
        'COPY . .',
        'RUN gradle build -x test 2>/dev/null || ./gradlew build -x test 2>/dev/null || mvn package -DskipTests 2>/dev/null || true',
        '',
        'FROM eclipse-temurin:21-jre-alpine',
        'WORKDIR /app',
        'COPY --from=builder /app/build/libs/*.jar app.jar 2>/dev/null || true',
        'COPY --from=builder /app/target/*.jar app.jar 2>/dev/null || true',
        'EXPOSE ' + port,
        'CMD ["java", "-jar", "app.jar"]',
      ].join('\n');
      break;
    case 'static':
      dockerfile = [
        'FROM nginx:1.27-alpine',
        'COPY . /usr/share/nginx/html/',
        'EXPOSE 80',
      ].join('\n');
      break;
  }

  const internalPort = type === 'nextjs' ? 3000 : type === 'static' ? 80 : port;
  const compose = [
    'services:',
    '  backend:',
    '    build: .',
    '    ports:',
    `      - "${port}:${internalPort}"`,
    '    restart: unless-stopped',
    '    healthcheck:',
    `      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:${internalPort}/"]`,
    '      interval: 10s',
    '      timeout: 5s',
    '      retries: 5',
  ].join('\n');

  if (!existsSync(join(dir, 'Dockerfile'))) {
    writeFileSync(join(dir, 'Dockerfile'), dockerfile, 'utf-8');
    if (job) appendLog(job, '[scaffold] Generated Dockerfile');
  }
  writeFileSync(join(dir, 'docker-compose.yml'), compose, 'utf-8');
  if (job) appendLog(job, '[scaffold] Generated docker-compose.yml');

  // .dockerignore
  if (!existsSync(join(dir, '.dockerignore'))) {
    writeFileSync(join(dir, '.dockerignore'), 'node_modules\n.next\n.git\n*.md\n', 'utf-8');
  }
}

/**
 * Ensure a docker-compose.yml exists in `dir`.
 * If missing, auto-detect project type and scaffold Dockerfile + compose.
 */
function ensureComposeFile(dir: string, appName: string, port: number, job?: AppJob): void {
  if (existsSync(join(dir, 'docker-compose.yml')) || existsSync(join(dir, 'compose.yml'))) return;
  _scaffoldDockerConfig(dir, appName, port, job);
}

/**
 * Resolve the backend health check port for a given app directory.
 * Reads BACKEND_PORT from .env (set by generateEnv).
 * Falls back to the provided port if .env is absent or has no BACKEND_PORT.
 * This ensures health checks always target the backend, not the frontend nginx.
 */
function _resolveBackendPort(appDir: string, fallbackPort: number): number {
  const envPath = join(appDir, '.env');
  const val = readDotEnvValue(envPath, 'BACKEND_PORT');
  const parsed = val ? parseInt(val, 10) : NaN;
  return isNaN(parsed) ? fallbackPort : parsed;
}

/**
 * Detect Next.js basePath from next.config.ts/mjs/js in the app directory.
 * Returns the basePath string (e.g. '/apps/my-app') or '' if not set.
 * Next.js bakes basePath at build time — /health becomes /apps/my-app/health.
 */
export function detectBasePath(appDir: string): string {
  for (const name of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
    const p = join(appDir, name);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf-8');
      const match = content.match(/basePath\s*:\s*['"`]([^'"`]+)['"`]/);
      if (match) return match[1]!;
    }
  }
  return '';
}

/**
 * Build the health check URL for an app.
 * - Brewnet boilerplates have /health endpoint → use /health
 * - Scaffolded/general projects → use / (root)
 * - Next.js with basePath → prefix accordingly
 */
function _buildHealthUrl(appDir: string, fallbackPort: number): string {
  const healthPort = _resolveBackendPort(appDir, fallbackPort);
  const basePath = detectBasePath(appDir);
  // Check if this is a brewnet boilerplate (has .env.example with STACK_LANG)
  // or has an explicit /health route file
  const isBoilerplate = existsSync(join(appDir, '.env.example'))
    && readFileSync(join(appDir, '.env.example'), 'utf-8').includes('STACK_LANG');
  const hasHealthRoute = existsSync(join(appDir, 'src', 'app', 'health'))
    || existsSync(join(appDir, 'backend', 'src'));
  const healthPath = (isBoilerplate || hasHealthRoute) ? '/health' : '/';
  return `http://127.0.0.1:${healthPort}${basePath}${healthPath}`;
}

async function _pollHealth(url: string, maxMs = 120_000, job?: AppJob): Promise<void> {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        if (job) appendLog(job, `[health] ✓ ${url} → ${res.status} (attempt ${attempt})`);
        return;
      }
      if (job) appendLog(job, `[health] ${url} → ${res.status} (attempt ${attempt})`);
    } catch {
      if (job && attempt % 3 === 1) appendLog(job, `[health] waiting... ${url} (attempt ${attempt})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (job) appendLog(job, `[health] ✗ timeout after ${maxMs / 1000}s`);
  throw new Error(`Health check timed out after ${maxMs / 1000}s: ${url}`);
}

/**
 * Run `docker compose up -d --build` with stdout/stderr streamed to job logs.
 * Automatically resolves port conflicts by finding free ports and updating .env.
 */
async function _dockerComposeUp(cwd: string, job: AppJob, maxRetries = 2): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    appendLog(job, `[docker] $ docker compose up -d --build${attempt > 0 ? ` (retry ${attempt})` : ''}`);
    appendLog(job, `[docker] cwd: ${cwd}`);
    const proc = execa('docker', ['compose', 'up', '-d', '--build'], { cwd, reject: false });
    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        appendLog(job, `[docker] ${line}`);
      }
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        appendLog(job, `[docker] ${line}`);
      }
    });
    const result = await proc;

    if (result.exitCode === 0) {
      appendLog(job, `[docker] ✓ containers started`);
      return;
    }

    // Check for port conflict — retry with a free port
    const portMatch = result.stderr?.match(/Bind for 0\.0\.0\.0:(\d+) failed: port is already allocated/);
    if (portMatch && attempt < maxRetries) {
      const conflictPort = parseInt(portMatch[1], 10);
      appendLog(job, `[docker] ⚠ port ${conflictPort} conflict — finding alternative...`);

      const { isPortAvailable: _isPortAvailable } = await import('../utils/port-utils.js');
      let newPort: number | undefined;
      for (let p = conflictPort + 1; p <= conflictPort + 20; p++) {
        if (await _isPortAvailable(p)) { newPort = p; break; }
      }

      if (newPort) {
        // Update .env file with the new port
        const envPath = join(cwd, '.env');
        if (existsSync(envPath)) {
          let env = readFileSync(envPath, 'utf-8');
          const portRegex = new RegExp(`^([A-Z_]+=)${conflictPort}$`, 'm');
          const envMatch = env.match(portRegex);
          if (envMatch) {
            env = env.replace(portRegex, `$1${newPort}`);
            writeFileSync(envPath, env, 'utf-8');
            appendLog(job, `[docker] ✓ .env updated: ${envMatch[1]}${conflictPort} → ${envMatch[1]}${newPort}`);
          } else {
            appendLog(job, `[docker] ⚠ could not find port ${conflictPort} in .env — manual fix required`);
            throw new Error(`Port ${conflictPort} conflict and could not auto-resolve in .env`);
          }
        }

        // Stop conflicting containers before retry
        await execa('docker', ['compose', 'down'], { cwd, reject: false });
        continue;
      } else {
        appendLog(job, `[docker] ✗ no free port found near ${conflictPort}`);
      }
    }

    appendLog(job, `[docker] ✗ exit code ${result.exitCode}`);
    throw new Error(`Command failed with exit code ${result.exitCode}: docker compose up -d --build\n${result.stderr}`);
  }
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
    const pp = resolveProjectPath();

    // Auto-detect mode from provided fields if not explicitly set
    if (!opts.mode) {
      if (opts.gitUrl) {
        opts.mode = 'git-clone';
      } else if (opts.stackId) {
        opts.mode = 'boilerplate';
      } else {
        opts.mode = 'new-project';
      }
    }

    // Step 0: Validating — mode-specific pre-checks
    setStep(job, 0, 'running');
    if (opts.mode === 'boilerplate') {
      if (!opts.stackId) throw new Error('stackId is required for boilerplate mode');
      const metas = readBoilerplateMeta(ctx.projectPath);
      const meta = metas.find((m) => m.stackId === opts.stackId);
      if (meta) {
        // Installed locally — use fast local copy path
        (opts as CreateAppOptions & { _meta?: unknown })._meta = meta;
      } else {
        // Not installed locally — fall back to fresh clone from catalog
        appendLog(job, `[info] Stack "${opts.stackId}" not installed locally — cloning fresh from catalog`);
        (opts as CreateAppOptions & { _resolvedStackId?: string })._resolvedStackId = opts.stackId;
      }
    } else if (opts.mode === 'git-clone') {
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

    if (opts.mode === 'boilerplate' && (opts as CreateAppOptions & { _meta?: unknown })._meta) {
      await _createModeA(job, opts, ctx, gitea, pp);
    } else if (opts.mode === 'git-clone') {
      await _createModeB(job, opts, ctx, gitea, pp);
    } else {
      // new-project OR boilerplate fallback (stack not installed locally)
      await _createModeC(job, opts, ctx, gitea, pp);
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
  pp: string,
): Promise<void> {
  // Step 0 already done in _runCreateApp — retrieve validated meta
  const meta = (opts as CreateAppOptions & { _meta?: BoilerplateMeta })._meta!;
  const port = opts.port ?? meta.port ?? parseInt(meta.backendUrl.split(':').pop() ?? '8080', 10);

  // Step 2: Gitea repo
  setStep(job, 2, 'running', `checking ${ctx.giteaUser}/${opts.appName}`);
  const alreadyExists = await gitea.repoExists(opts.appName);
  let cloneUrl: string;
  if (!alreadyExists) {
    setStep(job, 2, 'running', `creating ${ctx.giteaUser}/${opts.appName}`);
    cloneUrl = await gitea.createRepo(opts.appName, `Brewnet app: ${opts.appName}`);
  } else {
    cloneUrl = `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}.git`;
  }
  setStep(job, 2, 'done');

  // Step 3: Git remote + push
  setStep(job, 3, 'running', `pushing HEAD:main → ${ctx.giteaUser}/${opts.appName}`);
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
  setStep(job, 4, 'running', 'docker compose up --build');
  ensureComposeFile(meta.appDir, opts.appName, port, job);
  await _injectQuickTunnelIfNeeded(meta.appDir, opts.appName, port);
  await _dockerComposeUp(meta.appDir, job);
  setStep(job, 4, 'done', 'containers started');

  // Step 5: Health check — accounts for Next.js basePath
  setStep(job, 5, 'running');
  const healthUrlA = _buildHealthUrl(meta.appDir, port);
  setStep(job, 5, 'running', `polling ${healthUrlA}`);
  await _pollHealth(healthUrlA, 120_000, job);
  setStep(job, 5, 'done');

  // Register
  dbAddApp(pp, {
    name: opts.appName,
    mode: 'boilerplate',
    stackId: opts.stackId,
    appDir: meta.appDir,
    lang: meta.lang,
    framework: meta.frameworkId,
    port,
    giteaRepoUrl: `${ctx.giteaDisplayUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
  // Register Gitea webhook for auto-deploy (non-blocking)
  await setupWebhook(opts.appName, 'http://localhost:8088/api/deploy/hook').catch((e: unknown) => {
    console.warn('[webhook] registration failed (non-critical):', e instanceof Error ? e.message : String(e));
  });
}

async function _createModeB(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  pp: string,
): Promise<void> {
  // Step 0 already done in _runCreateApp
  const port = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  // Step 2: Clone external repo + create Gitea repo
  setStep(job, 2, 'running', 'Cloning external repository...');
  const { reinitGit: reinitGitB } = await import('./boilerplate-manager.js');
  // Clean existing directory from a previous failed run
  const { rmSync } = await import('node:fs');
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true, force: true });
  }
  const cloneArgs = ['clone', '--depth', '1'];
  if (opts.branch) cloneArgs.push('-b', opts.branch);
  cloneArgs.push(opts.gitUrl!, appDir);
  await execa('git', cloneArgs);
  appendLog(job, `[clone] ${opts.gitUrl} → ${opts.appName} ✓`);
  // Inject user-specified ports into .env so docker-compose picks them up
  // (prevents "port already allocated" when default 8080/3000 are in use)
  const envExPath = join(appDir, '.env.example');
  const envPath = join(appDir, '.env');
  if (existsSync(envExPath)) {
    const { findFreePort: findFreePortB } = await import('./boilerplate-manager.js');
    let envContent = readFileSync(envExPath, 'utf-8');
    envContent = envContent.replace(/^BACKEND_PORT=.*/m, `BACKEND_PORT=${port}`);
    // Start frontend port search AFTER the backend port to avoid collision
    const fePort = await findFreePortB(port + 1);
    envContent = envContent.replace(/^FRONTEND_PORT=.*/m, `FRONTEND_PORT=${fePort}`);
    writeFileSync(envPath, envContent, 'utf-8');
  } else if (existsSync(join(appDir, '.env'))) {
    let envContent = readFileSync(join(appDir, '.env'), 'utf-8');
    envContent = envContent.replace(/^BACKEND_PORT=.*/m, `BACKEND_PORT=${port}`);
    writeFileSync(join(appDir, '.env'), envContent, 'utf-8');
  }
  await reinitGitB(appDir);
  setStep(job, 2, 'running', `Creating Gitea repo ${ctx.giteaUser}/${opts.appName}…`);
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

  // Git Clone mode: auto-scaffold docker-compose.yml if repo has none.
  // Handles static sites (nginx), plain Node.js/Python projects, etc.
  ensureComposeFile(appDir, opts.appName, port, job);

  const hasCompose = existsSync(join(appDir, 'docker-compose.yml')) || existsSync(join(appDir, 'compose.yml'));
  if (hasCompose) {
    setStep(job, 4, 'running', 'docker compose up --build');
    await _injectQuickTunnelIfNeeded(appDir, opts.appName, port);
    await _dockerComposeUp(appDir, job);
    setStep(job, 4, 'done', 'containers started');

    setStep(job, 5, 'running');
    const healthUrlB = _buildHealthUrl(appDir, port);
    setStep(job, 5, 'running', `polling ${healthUrlB}`);
    await _pollHealth(healthUrlB, 120_000, job);
    setStep(job, 5, 'done');
  } else {
    setStep(job, 4, 'done', 'skipped — no docker-compose.yml');
    setStep(job, 5, 'done', 'skipped — deploy separately');
    appendLog(job, '[clone] Gitea push completed — no docker-compose.yml, skipping Docker up');
  }

  dbAddApp(pp, {
    name: opts.appName,
    mode: 'git-clone',
    sourceUrl: opts.gitUrl,
    appDir,
    port,
    giteaRepoUrl: `${ctx.giteaDisplayUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: hasCompose ? 'running' : 'stopped',
    createdAt: new Date().toISOString(),
  });
}

async function _createModeC(
  job: AppJob,
  opts: CreateAppOptions,
  ctx: AppContext,
  gitea: GiteaClient,
  pp: string,
): Promise<void> {
  const { cloneStack, generateEnv, reinitGit, findFreePort } = await import('./boilerplate-manager.js');
  const { getStackById } = await import('../config/stacks.js');

  // Step 0 already done in _runCreateApp — retrieve resolved stackId
  const stackId = (opts as CreateAppOptions & { _resolvedStackId?: string })._resolvedStackId!;
  const requestedPort = opts.port ?? 8080;
  const appDir = join(ctx.projectPath, 'apps', opts.appName);

  // Clone and scaffold (visible as part of Gitea repo step context)
  await cloneStack(stackId, appDir);
  // Auto-detect free host port starting from the requested port to prevent
  // "port already allocated" errors when other apps occupy the requested port.
  const port = await findFreePort(requestedPort);
  const stackInfo = getStackById(stackId);
  const frontendPort = (stackInfo && !stackInfo.isUnified) ? await findFreePort(port + 1) : undefined;
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

  setStep(job, 4, 'running', 'docker compose up --build');
  ensureComposeFile(appDir, opts.appName, port, job);
  await _injectQuickTunnelIfNeeded(appDir, opts.appName, port);
  await _dockerComposeUp(appDir, job);
  setStep(job, 4, 'done', 'containers started');

  setStep(job, 5, 'running');
  const healthUrlC = _buildHealthUrl(appDir, port);
  setStep(job, 5, 'running', `polling ${healthUrlC}`);
  await _pollHealth(healthUrlC, 120_000, job);
  setStep(job, 5, 'done');

  dbAddApp(pp, {
    name: opts.appName,
    mode: opts.mode === 'boilerplate' ? 'boilerplate' : 'new-project',
    stackId,
    appDir,
    lang: opts.language ?? stackInfo?.language,
    framework: opts.frameworkId ?? stackInfo?.framework,
    port,
    giteaRepoUrl: `${ctx.giteaDisplayUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}

export async function startApp(appName: string): Promise<void> {
  const pp = resolveProjectPath();
  const app = dbGetApp(pp, appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'up', '-d'], { cwd: app.appDir });
  dbUpdateApp(pp, appName, { status: 'running' });
}

export async function stopApp(appName: string): Promise<void> {
  const pp = resolveProjectPath();
  const app = dbGetApp(pp, appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'down'], { cwd: app.appDir }).catch((e: unknown) => {
    console.warn('[stopApp] docker compose down failed:', e instanceof Error ? e.message : String(e));
  });
  dbUpdateApp(pp, appName, { status: 'stopped' });
}

export async function removeApp(appName: string): Promise<void> {
  const pp = resolveProjectPath();
  const app = dbGetApp(pp, appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  await execa('docker', ['compose', 'down', '--volumes'], { cwd: app.appDir }).catch((e: unknown) => {
    console.warn('[removeApp] docker compose down failed:', e instanceof Error ? e.message : String(e));
  });
  dbRemoveApp(pp, appName);
}
