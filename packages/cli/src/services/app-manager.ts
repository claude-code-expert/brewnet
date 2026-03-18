// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

    // Check if deployable — must have docker-compose.yml (or auto-scaffold)
    const hasCompose = existsSync(join(app.appDir, 'docker-compose.yml')) || existsSync(join(app.appDir, 'compose.yml'));
    if (!hasCompose) {
      // Try auto-scaffold for known project types
      const projectType = _detectProjectType(app.appDir);
      if (projectType) {
        appendLog(job, `[scaffold] Detected ${projectType} project — generating Docker config`);
        _scaffoldDockerConfig(app.appDir, appName, app.port, job);
      } else {
        throw new Error(
          'This project has no docker-compose.yml or Dockerfile. ' +
          'Add a Dockerfile and docker-compose.yml to deploy, or use a Brewnet boilerplate.',
        );
      }
    }

    setStep(job, 1, 'running', 'docker compose up --build');
    await _dockerComposeUp(app.appDir, job);
    setStep(job, 1, 'done', 'containers started');

    setStep(job, 2, 'running');
    const healthUrlDeploy = _buildHealthUrl(app.appDir, app.port, app.port);
    setStep(job, 2, 'running', `polling ${healthUrlDeploy}`);
    await _pollHealth(healthUrlDeploy, 120_000, job);
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

/** Inject Traefik Quick Tunnel labels if running in quick tunnel mode. */
function _injectQuickTunnelIfNeeded(appDir: string, appName: string, port: number): void {
  try {
    const last = getLastProject();
    const state = loadState(last ?? '');
    if (state?.domain?.cloudflare?.tunnelMode !== 'quick') return;
    const { injectTraefikForQuickTunnel } = require('./boilerplate-manager.js') as typeof import('./boilerplate-manager.js');
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
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    if (readdirSync(dir).some((f: string) => f.endsWith('.html'))) return 'static';
  } catch { /* ignore */ }
  return null;
}

/**
 * Generate Dockerfile + docker-compose.yml for projects that don't have them.
 */
function _scaffoldDockerConfig(dir: string, _appName: string, port: number, job?: AppJob): void {
  const type = _detectProjectType(dir);
  if (!type) throw new Error(`Cannot auto-detect project type in ${dir}. Add a Dockerfile and docker-compose.yml manually.`);

  if (job) appendLog(job, `[scaffold] Detected ${type} project — generating Docker config`);

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
function _detectBasePath(appDir: string): string {
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
function _buildHealthUrl(appDir: string, port: number, fallbackPort: number): string {
  const healthPort = _resolveBackendPort(appDir, fallbackPort);
  const basePath = _detectBasePath(appDir);
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
 */
async function _dockerComposeUp(cwd: string, job: AppJob): Promise<void> {
  appendLog(job, `[docker] $ docker compose up -d --build`);
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
  if (result.exitCode !== 0) {
    appendLog(job, `[docker] ✗ exit code ${result.exitCode}`);
    throw new Error(`Command failed with exit code ${result.exitCode}: docker compose up -d --build\n${result.stderr}`);
  }
  appendLog(job, `[docker] ✓ containers started`);
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
  setStep(job, 4, 'running', 'docker compose up --build');
  ensureComposeFile(meta.appDir, opts.appName, port, job);
  _injectQuickTunnelIfNeeded(meta.appDir, opts.appName, port);
  await _dockerComposeUp(meta.appDir, job);
  setStep(job, 4, 'done', 'containers started');

  // Step 5: Health check — accounts for Next.js basePath
  setStep(job, 5, 'running');
  const healthUrlA = _buildHealthUrl(meta.appDir, port, port);
  setStep(job, 5, 'running', `polling ${healthUrlA}`);
  await _pollHealth(healthUrlA, 120_000, job);
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
  // Clean existing directory from a previous failed run
  const { rmSync } = await import('node:fs');
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true, force: true });
  }
  const cloneArgs = ['clone', '--depth', '1'];
  if (opts.branch) cloneArgs.push('-b', opts.branch);
  cloneArgs.push(opts.gitUrl!, appDir);
  await execa('git', cloneArgs);
  // Inject user-specified ports into .env so docker-compose picks them up
  // (prevents "port already allocated" when default 8080/3000 are in use)
  const { existsSync: envExists, readFileSync: envRead, writeFileSync: envWrite } = await import('node:fs');
  const envExPath = join(appDir, '.env.example');
  const envPath = join(appDir, '.env');
  if (envExists(envExPath)) {
    const { findFreePort: findFreePortB } = await import('./boilerplate-manager.js');
    let envContent = envRead(envExPath, 'utf-8');
    envContent = envContent.replace(/^BACKEND_PORT=.*/m, `BACKEND_PORT=${port}`);
    const fePort = await findFreePortB(3000);
    envContent = envContent.replace(/^FRONTEND_PORT=.*/m, `FRONTEND_PORT=${fePort}`);
    envWrite(envPath, envContent, 'utf-8');
  } else if (envExists(join(appDir, '.env'))) {
    let envContent = envRead(join(appDir, '.env'), 'utf-8');
    envContent = envContent.replace(/^BACKEND_PORT=.*/m, `BACKEND_PORT=${port}`);
    envWrite(join(appDir, '.env'), envContent, 'utf-8');
  }
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

  // Git Clone mode: skip Docker up + Health check.
  // Clone + Gitea repo creation is sufficient — user deploys separately.
  // If docker-compose.yml exists (e.g. brewnet boilerplate), auto-start.
  const hasCompose = existsSync(join(appDir, 'docker-compose.yml')) || existsSync(join(appDir, 'compose.yml'));
  if (hasCompose) {
    setStep(job, 4, 'running', 'docker compose up --build');
    _injectQuickTunnelIfNeeded(appDir, opts.appName, port);
    await _dockerComposeUp(appDir, job);
    setStep(job, 4, 'done', 'containers started');

    setStep(job, 5, 'running');
    const healthUrlB = _buildHealthUrl(appDir, port, port);
    setStep(job, 5, 'running', `polling ${healthUrlB}`);
    await _pollHealth(healthUrlB, 120_000, job);
    setStep(job, 5, 'done');
  } else {
    setStep(job, 4, 'done', 'skipped — no docker-compose.yml');
    setStep(job, 5, 'done', 'skipped — deploy separately');
    appendLog(job, '[clone] Gitea push completed — no docker-compose.yml, skipping Docker up');
  }

  addApp(appsJson, {
    name: opts.appName,
    mode: 'git-url',
    sourceUrl: opts.gitUrl,
    appDir,
    port,
    giteaRepoUrl: `${ctx.giteaBaseUrl}/${ctx.giteaUser}/${opts.appName}`,
    status: hasCompose ? 'running' : 'stopped',
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

  setStep(job, 4, 'running', 'docker compose up --build');
  ensureComposeFile(appDir, opts.appName, port, job);
  _injectQuickTunnelIfNeeded(appDir, opts.appName, port);
  await _dockerComposeUp(appDir, job);
  setStep(job, 4, 'done', 'containers started');

  setStep(job, 5, 'running');
  const healthUrlC = _buildHealthUrl(appDir, port, port);
  setStep(job, 5, 'running', `polling ${healthUrlC}`);
  await _pollHealth(healthUrlC, 120_000, job);
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
