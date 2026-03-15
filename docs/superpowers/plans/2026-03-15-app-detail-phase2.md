# App Detail Page (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an App Detail page (`/apps/:name`) with Overview / Git / Deploy / Logs tabs, Gitea webhook auto-deploy, and a real-time log stream — completing the STORY-05 / STORY-06 user flow from BREWNET_DEPLOY_USER_STORY.md.

**Architecture:** The admin server (Node.js built-in HTTP) gains five new route groups. The new `generateAppDetailHtml()` function in `apps-page.ts` returns a self-contained HTML page with inline JS that polls new API endpoints. Deploy jobs reuse the existing in-memory `AppJob` pattern. Log streaming uses Server-Sent Events (SSE) via dockerode's stream API.

**Tech Stack:** TypeScript 5 (strict), Node.js 20+ ESM, dockerode, execa, Gitea REST API v1, Server-Sent Events (no WebSocket dependency).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/cli/src/types/app-entry.ts` | Add `AppGitInfo`, `DeploySettings` types |
| Modify | `packages/cli/src/services/gitea-client.ts` | Add `getRepo`, `getLatestCommit`, `createWebhook` |
| Modify | `packages/cli/src/services/app-manager.ts` | Add `deployApp`, `getAppGitInfo`, `setupWebhook`, `updateDeploySettings`, `getDeploySettings` |
| Modify | `packages/cli/src/services/apps-page.ts` | Add `generateAppDetailHtml()` |
| Modify | `packages/cli/src/services/admin-server.ts` | Route: GET /apps/:name, GET/POST /api/apps/:name/*, POST /api/deploy/hook, GET /api/apps/:name/logs |
| Create | `tests/unit/cli/services/gitea-client-phase2.test.ts` | Tests for new GiteaClient methods |
| Create | `tests/unit/cli/services/app-manager-phase2.test.ts` | Tests for new app-manager functions |

---

## Task 1: Types — AppGitInfo and DeploySettings

**Files:**
- Modify: `packages/cli/src/types/app-entry.ts`

- [ ] **Step 1: Add types to app-entry.ts**

Append after `GitRepoEntry` (line 81):

```typescript
/** Git + Gitea information for a managed app. */
export interface AppGitInfo {
  /** Gitea web URL, e.g. http://localhost/git/admin/my-api */
  giteaUrl: string;
  /** HTTP clone URL */
  cloneUrlHttp: string;
  /** SSH clone URL */
  cloneUrlSsh: string;
  /** Absolute path on disk */
  localPath: string;
  /** Current default branch */
  branch: string;
  /** Latest commit on the branch, null if repo is empty */
  latestCommit: {
    hash: string;
    shortHash: string;
    message: string;
    date: string; // ISO 8601
  } | null;
}

/** Per-app deploy settings (stored in apps.json alongside AppEntry). */
export interface DeploySettings {
  autoDeploy: boolean;
  deployBranch: string;
  webhookSecret?: string;
}
```

- [ ] **Step 2: Build passes**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet
pnpm -F @brewnet/cli build 2>&1 | tail -20
```

Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/types/app-entry.ts
git commit -m "feat(types): add AppGitInfo and DeploySettings interfaces"
```

---

## Task 2: GiteaClient — getRepo, getLatestCommit, createWebhook

**Files:**
- Modify: `packages/cli/src/services/gitea-client.ts`
- Create: `tests/unit/cli/services/gitea-client-phase2.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/cli/services/gitea-client-phase2.test.ts`:

```typescript
// tests/unit/cli/services/gitea-client-phase2.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GiteaClient } from '../../../../packages/cli/src/services/gitea-client.js';

// Reuse mock setup from existing gitea-client.test.ts pattern
const fsContent: Record<string, string> = {};
vi.mock('node:fs', () => ({
  existsSync: (p: string) => p in fsContent,
  readFileSync: (p: string) => fsContent[p] ?? '',
  writeFileSync: (p: string, v: string) => { fsContent[p] = v; },
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}
function makeClient() {
  return new GiteaClient({ baseUrl: 'http://localhost:3000', username: 'admin', password: 'pass', tokenPath: '/home/user/.brewnet/gitea-token' });
}

beforeEach(() => {
  mockFetch.mockReset();
  Object.keys(fsContent).forEach(k => delete fsContent[k]);
});

describe('GiteaClient.getRepo', () => {
  it('returns repo detail on success', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    const fakeRepo = { id: 1, name: 'my-api', clone_url: 'http://localhost:3000/admin/my-api.git', ssh_url: 'ssh://git@localhost:2222/admin/my-api.git', html_url: 'http://localhost:3000/admin/my-api', description: '', private: true, default_branch: 'main' };
    mockFetch.mockResolvedValueOnce(jsonResponse(fakeRepo));
    const client = makeClient();
    const repo = await client.getRepo('my-api');
    expect(repo.name).toBe('my-api');
    expect(repo.default_branch).toBe('main');
  });

  it('throws on 404', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
    await expect(makeClient().getRepo('nope')).rejects.toThrow('getRepo failed');
  });
});

describe('GiteaClient.getLatestCommit', () => {
  it('returns null for empty repo (404 commits)', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockFetch.mockResolvedValueOnce(jsonResponse([], 200));
    const result = await makeClient().getLatestCommit('my-api', 'main');
    expect(result).toBeNull();
  });

  it('returns commit info when commits exist', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    const commits = [{ sha: 'abc1234567890', commit: { message: 'feat: hello', committer: { date: '2026-03-15T10:00:00Z' } } }];
    mockFetch.mockResolvedValueOnce(jsonResponse(commits));
    const result = await makeClient().getLatestCommit('my-api', 'main');
    expect(result).not.toBeNull();
    expect(result!.shortHash).toBe('abc1234');
    expect(result!.message).toBe('feat: hello');
  });
});

describe('GiteaClient.createWebhook', () => {
  it('posts webhook config to Gitea', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 42 }, 201));
    await makeClient().createWebhook('my-api', 'http://localhost:8088/api/deploy/hook', 'secret123');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/hooks');
    const body = JSON.parse(opts.body as string);
    expect(body.config.url).toBe('http://localhost:8088/api/deploy/hook');
    expect(body.events).toContain('push');
  });

  it('throws on failure', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'bad request' }, 422));
    await expect(makeClient().createWebhook('my-api', 'http://x', 'sec')).rejects.toThrow('createWebhook failed');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test -- --testPathPattern="gitea-client-phase2" --no-coverage 2>&1 | tail -30
```

Expected: FAIL (methods don't exist yet).

- [ ] **Step 3: Implement in gitea-client.ts**

Add after `listRepos()` method (after line 116):

```typescript
  /** Fetch a single repo's detail (includes default_branch, ssh_url). */
  async getRepo(name: string): Promise<{
    id: number; name: string; clone_url: string; ssh_url: string;
    html_url: string; description: string; private: boolean; default_branch: string;
  }> {
    const { baseUrl, username } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${name}`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Gitea getRepo failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<ReturnType<GiteaClient['getRepo']> extends Promise<infer T> ? T : never>;
  }

  /** Get the latest commit on a branch. Returns null for empty repos. */
  async getLatestCommit(
    repoName: string,
    branch: string,
  ): Promise<{ hash: string; shortHash: string; message: string; date: string } | null> {
    const { baseUrl, username } = this.config;
    const res = await fetch(
      `${baseUrl}/api/v1/repos/${username}/${repoName}/commits?sha=${encodeURIComponent(branch)}&limit=1`,
      { headers: await this.authHeaders() },
    );
    if (!res.ok) return null;
    const commits = (await res.json()) as Array<{ sha: string; commit: { message: string; committer: { date: string } } }>;
    if (!commits.length) return null;
    const c = commits[0]!;
    return {
      hash: c.sha,
      shortHash: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0]!,
      date: c.commit.committer.date,
    };
  }

  /** Register a push webhook on the repo. */
  async createWebhook(repoName: string, webhookUrl: string, secret: string): Promise<void> {
    const { baseUrl, username } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${repoName}/hooks`, {
      method: 'POST',
      headers: await this.authHeaders(),
      body: JSON.stringify({
        type: 'gitea',
        config: { url: webhookUrl, content_type: 'json', secret },
        events: ['push'],
        active: true,
      }),
    });
    if (!res.ok) throw new Error(`Gitea createWebhook failed: ${res.status} ${await res.text()}`);
  }
```

Note: Fix the return type annotation to be concrete (no `extends Promise` recursion):

```typescript
  async getRepo(name: string): Promise<{
    id: number; name: string; clone_url: string; ssh_url: string;
    html_url: string; description: string; private: boolean; default_branch: string;
  }> {
    const { baseUrl, username } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${name}`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Gitea getRepo failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ id: number; name: string; clone_url: string; ssh_url: string; html_url: string; description: string; private: boolean; default_branch: string; }>;
  }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test -- --testPathPattern="gitea-client-phase2" --no-coverage 2>&1 | tail -20
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Build check**

```bash
pnpm -F @brewnet/cli build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/services/gitea-client.ts tests/unit/cli/services/gitea-client-phase2.test.ts
git commit -m "feat(gitea): add getRepo, getLatestCommit, createWebhook methods"
```

---

## Task 3: app-manager — deployApp, getAppGitInfo, setupWebhook, DeploySettings

**Files:**
- Modify: `packages/cli/src/services/app-manager.ts`
- Create: `tests/unit/cli/services/app-manager-phase2.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/cli/services/app-manager-phase2.test.ts`:

```typescript
// tests/unit/cli/services/app-manager-phase2.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// fs mock
const fsContent: Record<string, string> = {};
vi.mock('node:fs', () => ({
  existsSync: (p: string) => p in fsContent,
  readFileSync: (p: string) => { if (!(p in fsContent)) throw new Error('ENOENT: '+p); return fsContent[p]; },
  writeFileSync: (p: string, v: string) => { fsContent[p] = v; },
  chmodSync: vi.fn(), mkdirSync: vi.fn(),
}));
vi.mock('node:os', () => ({ homedir: () => '/home/user' }));
vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '' }) }));

import { updateDeploySettings, getDeploySettings } from '../../../../packages/cli/src/services/app-manager.js';

beforeEach(() => { Object.keys(fsContent).forEach(k => delete fsContent[k]); });

describe('updateDeploySettings / getDeploySettings', () => {
  it('stores and retrieves deploy settings', () => {
    // Prepare apps.json
    fsContent['/home/user/.brewnet/apps.json'] = JSON.stringify([
      { name: 'my-api', mode: 'boilerplate', appDir: '/apps/my-api', port: 8080, status: 'running', createdAt: '2026-01-01T00:00:00Z' }
    ]);
    updateDeploySettings('my-api', { autoDeploy: true, deployBranch: 'main' });
    const s = getDeploySettings('my-api');
    expect(s.autoDeploy).toBe(true);
    expect(s.deployBranch).toBe('main');
  });

  it('returns defaults when app has no settings', () => {
    fsContent['/home/user/.brewnet/apps.json'] = JSON.stringify([
      { name: 'other-app', mode: 'new-project', appDir: '/apps/other', port: 3000, status: 'running', createdAt: '2026-01-01T00:00:00Z' }
    ]);
    const s = getDeploySettings('other-app');
    expect(s.autoDeploy).toBe(false);
    expect(s.deployBranch).toBe('main');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test -- --testPathPattern="app-manager-phase2" --no-coverage 2>&1 | tail -20
```

- [ ] **Step 3: Implement in app-manager.ts**

**3a. Extend imports** at top of file:

```typescript
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions, DeployHistoryEntry, GitRepoEntry, AppGitInfo, DeploySettings } from '../types/app-entry.js';
```

**3b. Add deploy settings helpers** after `getDeployHistory` in the Public API section:

```typescript
export function getDeploySettings(appName: string): DeploySettings {
  const apps = readApps(resolveAppsJsonPath());
  const app = apps.find((a) => a.name === appName);
  const settings = (app as AppEntry & { deploySettings?: DeploySettings })?.deploySettings;
  return settings ?? { autoDeploy: false, deployBranch: 'main' };
}

export function updateDeploySettings(appName: string, settings: Partial<DeploySettings>): void {
  const appsJson = resolveAppsJsonPath();
  const apps = readApps(appsJson);
  const app = apps.find((a) => a.name === appName);
  if (!app) throw new Error(`App "${appName}" not found`);
  const existing = (app as AppEntry & { deploySettings?: DeploySettings }).deploySettings ?? { autoDeploy: false, deployBranch: 'main' };
  (app as AppEntry & { deploySettings?: DeploySettings }).deploySettings = { ...existing, ...settings };
  // Write back via updateApp (re-read apps in updateApp to avoid stale)
  updateApp(appsJson, appName, { deploySettings: (app as AppEntry & { deploySettings?: DeploySettings }).deploySettings } as Partial<AppEntry>);
}
```

**3c. Add getAppGitInfo** (uses GiteaClient):

```typescript
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
```

**3d. Add setupWebhook**:

```typescript
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
```

**3e. Add deployApp** (creates a job, runs docker compose up --build):

```typescript
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
```

**3f. Export `getAppContainerLogs`** (for SSE streaming in admin-server):

```typescript
/** Resolve the docker compose project name for an app to stream logs. */
export function getAppDir(appName: string): string | undefined {
  const apps = readApps(resolveAppsJsonPath());
  return apps.find((a) => a.name === appName)?.appDir;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test -- --testPathPattern="app-manager-phase2" --no-coverage 2>&1 | tail -20
```

- [ ] **Step 5: Build**

```bash
pnpm -F @brewnet/cli build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/services/app-manager.ts packages/cli/src/types/app-entry.ts tests/unit/cli/services/app-manager-phase2.test.ts
git commit -m "feat(app-manager): add deployApp, getAppGitInfo, setupWebhook, DeploySettings"
```

---

## Task 4: App Detail Page HTML (`apps-page.ts`)

**Files:**
- Modify: `packages/cli/src/services/apps-page.ts`
- Modify: `packages/cli/src/services/admin-server.ts` (route only, minimal change)

- [ ] **Step 1: Add `generateAppDetailHtml()` to apps-page.ts**

Append to the end of `apps-page.ts`:

```typescript
/**
 * App Detail page for /apps/:name
 * Four tabs: Overview | Git | Deploy | Logs
 * All data fetched via /api/apps/:name/* endpoints.
 */
export function generateAppDetailHtml(appName: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet — ${esc(appName)}</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#f5a623;font-size:18px;display:flex;align-items:center;gap:10px;margin-bottom:2px}
.subtitle{color:#8b949e;font-size:12px;margin-bottom:20px}
.header-row{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
.nav-link{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px;font-family:inherit}
.nav-link:hover{background:#21262d}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}.stopped{background:#3d1f1f;color:#f85149}
.tabs{display:flex;border-bottom:1px solid #30363d;margin-bottom:20px;gap:0}
.tab{padding:8px 18px;cursor:pointer;color:#8b949e;font-size:13px;background:none;border:none;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:#c9d1d9}.tab.active{color:#f5a623;border-bottom-color:#f5a623}
.tab-panel{display:none}.tab-panel.active{display:block}
.section{margin-bottom:20px}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #21262d;font-size:13px}
.info-key{color:#8b949e;min-width:120px}.info-val{color:#c9d1d9;font-family:monospace;word-break:break-all}
.btn{padding:4px 12px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent;margin-left:6px}
.btn-primary{background:#f5a623;color:#0d1117;border-color:#f5a623;font-weight:700}
.btn-primary:hover{background:#e09420}
.btn-stop{border-color:#f85149;color:#f85149}.btn-stop:hover{background:#3d1f1f}
.btn-start{border-color:#3fb950;color:#3fb950}.btn-start:hover{background:#1a4731}
.btn-default{border-color:#30363d;color:#8b949e}.btn-default:hover{background:#21262d}
.code-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap;word-break:break-all;margin-bottom:8px}
.copy-btn{float:right;padding:2px 8px;border:1px solid #30363d;border-radius:4px;cursor:pointer;background:transparent;color:#8b949e;font-size:11px;font-family:inherit}
.copy-btn:hover{background:#21262d;color:#c9d1d9}
.history-row{display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #21262d;font-size:12px}
.history-status{width:16px;text-align:center}
.history-hash{color:#58a6ff;font-family:monospace}
.history-msg{flex:1;color:#c9d1d9}
.history-time{color:#8b949e;white-space:nowrap}
.toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.toggle{position:relative;display:inline-block;width:38px;height:20px}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#30363d;border-radius:20px;transition:.2s}
.slider:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background:#c9d1d9;border-radius:50%;transition:.2s}
input:checked+.slider{background:#f5a623}
input:checked+.slider:before{transform:translateX(18px)}
#log-output{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:12px;height:400px;overflow-y:auto;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap}
.log-line.err{color:#f85149}.log-line.warn{color:#e3b341}
a.ext{color:#58a6ff;text-decoration:none}a.ext:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="header-row">
  <div>
    <h1 id="app-name">${esc(appName)} <span id="app-badge" class="badge stopped">loading</span></h1>
    <div class="subtitle" id="app-subtitle">loading...</div>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
    <a href="/apps" class="nav-link">\u2190 Apps</a>
    <button class="btn btn-default" id="btn-open" onclick="openApp()" style="display:none">Open \u2192</button>
    <button class="btn btn-stop" id="btn-stop" onclick="stopApp()" style="display:none">Stop</button>
    <button class="btn btn-start" id="btn-start" onclick="startApp()" style="display:none">Start</button>
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('overview')">Overview</button>
  <button class="tab" onclick="switchTab('git')">Git</button>
  <button class="tab" onclick="switchTab('deploy')">Deploy</button>
  <button class="tab" onclick="switchTab('logs')">Logs</button>
</div>

<!-- OVERVIEW TAB -->
<div id="tab-overview" class="tab-panel active">
  <div class="section">
    <div class="section-title">App Info</div>
    <div class="info-row"><span class="info-key">Name</span><span class="info-val">${esc(appName)}</span></div>
    <div class="info-row"><span class="info-key">Mode</span><span class="info-val" id="ov-mode">—</span></div>
    <div class="info-row"><span class="info-key">Stack</span><span class="info-val" id="ov-stack">—</span></div>
    <div class="info-row"><span class="info-key">Port</span><span class="info-val" id="ov-port">—</span></div>
    <div class="info-row"><span class="info-key">Status</span><span class="info-val" id="ov-status">—</span></div>
    <div class="info-row"><span class="info-key">Local URL</span><span class="info-val" id="ov-url">—</span></div>
    <div class="info-row"><span class="info-key">Created</span><span class="info-val" id="ov-created">—</span></div>
  </div>
</div>

<!-- GIT TAB -->
<div id="tab-git" class="tab-panel">
  <div class="section">
    <div class="section-title">Repository</div>
    <div class="info-row"><span class="info-key">Gitea URL</span><span class="info-val" id="git-url">—</span></div>
    <div class="info-row"><span class="info-key">Branch</span><span class="info-val" id="git-branch">—</span></div>
    <div class="info-row"><span class="info-key">Latest Commit</span><span class="info-val" id="git-commit">—</span></div>
  </div>
  <div class="section">
    <div class="section-title">Clone</div>
    <div style="position:relative">
      <div class="code-block" id="git-clone-http">loading...</div>
      <button class="copy-btn" onclick="copyText('git-clone-http')">Copy</button>
    </div>
    <div style="position:relative">
      <div class="code-block" id="git-clone-ssh">loading...</div>
      <button class="copy-btn" onclick="copyText('git-clone-ssh')">Copy</button>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Local Path</div>
    <div class="code-block" id="git-local-path">—</div>
  </div>
  <div class="section">
    <div class="section-title">Quick Setup (run on your dev machine)</div>
    <div style="position:relative">
      <div class="code-block" id="git-setup-cmds">loading...</div>
      <button class="copy-btn" onclick="copyText('git-setup-cmds')">Copy Setup</button>
    </div>
  </div>
</div>

<!-- DEPLOY TAB -->
<div id="tab-deploy" class="tab-panel">
  <div class="section">
    <div class="section-title">Deploy Settings</div>
    <div class="toggle-row">
      <label class="toggle">
        <input type="checkbox" id="auto-deploy-toggle" onchange="saveAutoDeploySettings()"/>
        <span class="slider"></span>
      </label>
      <span style="font-size:13px">Auto Deploy (on git push)</span>
    </div>
    <div class="info-row" style="margin-bottom:12px">
      <span class="info-key">Deploy Branch</span>
      <input id="deploy-branch-input" value="main" style="background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:160px" onchange="saveAutoDeploySettings()"/>
    </div>
    <button class="btn btn-primary" onclick="triggerDeploy()">Deploy Now</button>
    <span id="deploy-status-msg" style="margin-left:12px;font-size:12px;color:#8b949e"></span>
  </div>
  <div class="section" style="margin-top:20px">
    <div class="section-title">Deploy History</div>
    <div id="deploy-history">loading...</div>
  </div>
</div>

<!-- LOGS TAB -->
<div id="tab-logs" class="tab-panel">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <span style="font-size:12px;color:#8b949e">Live container logs</span>
    <button class="btn btn-default" onclick="startLogStream()" style="font-size:11px">Reconnect</button>
    <button class="btn btn-default" onclick="clearLogs()" style="font-size:11px">Clear</button>
  </div>
  <div id="log-output"></div>
</div>

<script>
var APP_NAME = ${JSON.stringify(appName)};
var appData = null;
var gitData = null;
var logSource = null;
var activeTab = 'overview';

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(function(t,i) {
    var names = ['overview','git','deploy','logs'];
    t.className = 'tab' + (names[i] === tab ? ' active' : '');
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.className = 'tab-panel'; });
  document.getElementById('tab-'+tab).className = 'tab-panel active';
  if (tab === 'git' && !gitData) loadGitInfo();
  if (tab === 'deploy') { loadDeployHistory(); loadDeploySettings(); }
  if (tab === 'logs' && !logSource) startLogStream();
}

// ── Load app overview ────────────────────────────────────────────────────
async function loadApp() {
  var r = await fetch('/api/apps/' + encodeURIComponent(APP_NAME)).then(function(r){return r.json();}).catch(function(){return null;});
  if (!r || !r.app) { document.getElementById('app-subtitle').textContent = 'App not found'; return; }
  appData = r.app;
  var a = r.app;
  var badge = document.getElementById('app-badge');
  badge.textContent = a.status;
  badge.className = 'badge ' + (a.status === 'running' ? 'running' : 'stopped');
  document.getElementById('app-subtitle').textContent = (a.lang||'') + (a.framework?' · '+a.framework:'') + (a.port?' · Port '+a.port:'');
  // Overview tab
  document.getElementById('ov-mode').textContent = a.mode || '—';
  document.getElementById('ov-stack').textContent = a.stackId || a.sourceUrl || '—';
  document.getElementById('ov-port').textContent = a.port || '—';
  document.getElementById('ov-status').textContent = a.status || '—';
  var localUrl = a.port ? 'http://localhost:' + a.port : '';
  document.getElementById('ov-url').innerHTML = localUrl ? '<a class="ext" href="' + localUrl + '" target="_blank">' + localUrl + '</a>' : '—';
  document.getElementById('ov-created').textContent = (a.createdAt || '—').replace('T',' ').slice(0,16);
  // Header buttons
  document.getElementById('btn-open').style.display = localUrl ? '' : 'none';
  document.getElementById('btn-stop').style.display = a.status === 'running' ? '' : 'none';
  document.getElementById('btn-start').style.display = a.status !== 'running' ? '' : 'none';
}

function openApp() {
  if (appData && appData.port) window.open('http://localhost:' + appData.port, '_blank');
}
async function stopApp() {
  await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/stop', { method: 'POST' });
  loadApp();
}
async function startApp() {
  await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/start', { method: 'POST' });
  loadApp();
}

// ── Git tab ───────────────────────────────────────────────────────────────
async function loadGitInfo() {
  var r = await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/git').then(function(r){return r.json();}).catch(function(){return null;});
  if (!r || !r.git) { document.getElementById('git-url').textContent = 'Gitea not available'; return; }
  gitData = r.git;
  var g = r.git;
  document.getElementById('git-url').innerHTML = '<a class="ext" href="' + g.giteaUrl + '" target="_blank">' + g.giteaUrl + ' [Open]</a>';
  document.getElementById('git-branch').textContent = g.branch || 'main';
  var c = g.latestCommit;
  document.getElementById('git-commit').textContent = c ? c.shortHash + ' — ' + c.message : '(empty repo)';
  document.getElementById('git-clone-http').textContent = 'git clone ' + g.cloneUrlHttp;
  document.getElementById('git-clone-ssh').textContent = 'git clone ' + g.cloneUrlSsh;
  document.getElementById('git-local-path').textContent = g.localPath;
  document.getElementById('git-setup-cmds').textContent =
    'git remote add brewnet ' + g.cloneUrlHttp + '\\n' +
    'git push brewnet ' + (g.branch || 'main');
}

function copyText(id) {
  var el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || '');
  var btn = el.nextElementSibling;
  if (btn) { btn.textContent = 'Copied!'; setTimeout(function(){btn.textContent = 'Copy';}, 1500); }
}

// ── Deploy tab ────────────────────────────────────────────────────────────
async function loadDeploySettings() {
  var r = await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/deploy/settings').then(function(r){return r.json();}).catch(function(){return null;});
  if (!r) return;
  document.getElementById('auto-deploy-toggle').checked = !!r.autoDeploy;
  document.getElementById('deploy-branch-input').value = r.deployBranch || 'main';
}

async function saveAutoDeploySettings() {
  var autoDeploy = document.getElementById('auto-deploy-toggle').checked;
  var deployBranch = document.getElementById('deploy-branch-input').value.trim() || 'main';
  await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/deploy/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoDeploy: autoDeploy, deployBranch: deployBranch })
  });
}

async function triggerDeploy() {
  var msg = document.getElementById('deploy-status-msg');
  msg.textContent = 'Deploying...';
  var r = await fetch('/api/apps/' + encodeURIComponent(APP_NAME) + '/deploy', { method: 'POST' }).then(function(r){return r.json();}).catch(function(e){return{error:e.message};});
  if (r.error) { msg.textContent = 'Error: ' + r.error; return; }
  msg.textContent = 'Job ' + r.jobId + ' started...';
  pollDeployJob(r.jobId, msg);
}

function pollDeployJob(jobId, msgEl) {
  var timer = setInterval(async function() {
    var r = await fetch('/api/apps/jobs/' + encodeURIComponent(jobId)).then(function(r){return r.json();}).catch(function(){return null;});
    if (!r) return;
    if (r.status === 'done') { clearInterval(timer); msgEl.textContent = '\u2713 Deploy successful'; loadDeployHistory(); loadApp(); }
    else if (r.status === 'failed') { clearInterval(timer); msgEl.textContent = '\u2717 Deploy failed: ' + (r.error || ''); loadDeployHistory(); }
  }, 2000);
}

async function loadDeployHistory() {
  var r = await fetch('/api/deploy/history?app=' + encodeURIComponent(APP_NAME)).then(function(r){return r.json();}).catch(function(){return{history:[]};});
  var entries = (r.history || []).slice().reverse();
  var div = document.getElementById('deploy-history');
  if (!entries.length) { div.innerHTML = '<span style="color:#8b949e;font-size:12px">No deployments yet.</span>'; return; }
  div.innerHTML = entries.map(function(e) {
    var icon = e.status === 'success' ? '<span style="color:#3fb950">\u2705</span>' : '<span style="color:#f85149">\u274c</span>';
    var time = (e.deployedAt || '').replace('T',' ').slice(0,16);
    return '<div class="history-row">' + icon +
      '<span class="history-hash">' + (e.commitHash ? e.commitHash.slice(0,7) : '—') + '</span>' +
      '<span class="history-msg">' + escHtml(e.commitMessage || 'deploy') + '</span>' +
      '<span class="history-time">' + time + '</span>' +
      '</div>';
  }).join('');
}

// ── Logs tab (SSE) ────────────────────────────────────────────────────────
function startLogStream() {
  if (logSource) logSource.close();
  var output = document.getElementById('log-output');
  output.innerHTML = '<span style="color:#8b949e">Connecting...</span>\\n';
  logSource = new EventSource('/api/apps/' + encodeURIComponent(APP_NAME) + '/logs');
  logSource.onmessage = function(e) {
    var line = document.createElement('div');
    line.className = 'log-line' + (/error|fatal/i.test(e.data) ? ' err' : /warn/i.test(e.data) ? ' warn' : '');
    line.textContent = e.data;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  };
  logSource.onerror = function() {
    var line = document.createElement('div');
    line.textContent = '[stream disconnected]';
    line.style.color = '#8b949e';
    output.appendChild(line);
  };
}
function clearLogs() { document.getElementById('log-output').innerHTML = ''; }

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Boot ──────────────────────────────────────────────────────────────────
loadApp();
setInterval(loadApp, 15000);
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Build check**

```bash
pnpm -F @brewnet/cli build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Add route to admin-server.ts**

In the `createServer` handler, just below the existing `/apps` route (line ~1048), add:

```typescript
    // Serve App Detail page
    if (req.method === 'GET' && parts[0] === 'apps' && parts[1] && parts[1] !== 'api') {
      const { generateAppDetailHtml } = await import('./apps-page.js');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateAppDetailHtml(decodeURIComponent(parts[1])));
      return;
    }
```

Actually, `parts` is computed from the URL path (`/apps/my-api` → `['apps', 'my-api']`), so:

```typescript
    // Serve App Detail page at /apps/:name
    if (req.method === 'GET' && parts.length === 2 && parts[0] === 'apps') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateAppDetailHtml(decodeURIComponent(parts[1])));
      return;
    }
```

Add import at top: update the `apps-page.js` import:
```typescript
import { generateAppsPageHtml, generateAppDetailHtml } from './apps-page.js';
```

Also update the apps list table to add a "Details" button per row in `apps-page.ts` `loadApps()`:

In the `tbody.innerHTML = r.apps.map(...)` row builder, add before `Actions` column buttons:
```javascript
'<td><a href="/apps/'+encodeURIComponent(a.name)+'" class="btn btn-default" style="text-decoration:none;display:inline-block">Details</a></td>'+
```

And add `Details` to the `<thead>` row.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/services/apps-page.ts packages/cli/src/services/admin-server.ts
git commit -m "feat(ui): add App Detail page with Overview/Git/Deploy/Logs tabs"
```

---

## Task 5: API Routes for App Detail

**Files:**
- Modify: `packages/cli/src/services/admin-server.ts`

- [ ] **Step 1: Add new imports to admin-server.ts**

Update the app-manager import line:
```typescript
import {
  createApp, getJobStatus, listApps, startApp, stopApp,
  removeApp as appRemove, getDeployHistory, listGiteaRepos,
  deployApp, getAppGitInfo, setupWebhook, updateDeploySettings, getDeploySettings, getAppDir,
} from './app-manager.js';
```

- [ ] **Step 2: Add new API routes in the `parts[1] === 'apps'` block**

Insert before the closing `}` of the `if (parts[1] === 'apps')` block (after the existing DELETE handler at ~line 1136):

```typescript
          // GET /api/apps/:name — single app
          if (req.method === 'GET' && parts[2] && !['boilerplates','jobs'].includes(parts[2]) && parts.length === 3) {
            const apps = await listApps();
            const app = apps.find((a) => a.name === decodeURIComponent(parts[2]!));
            if (!app) { json(res, 404, { error: 'App not found' }); return; }
            json(res, 200, { app });
            return;
          }

          // GET /api/apps/:name/git
          if (req.method === 'GET' && parts[3] === 'git') {
            try {
              const git = await getAppGitInfo(decodeURIComponent(parts[2] ?? ''));
              json(res, 200, { git });
            } catch (err) {
              json(res, 502, { error: String(err) });
            }
            return;
          }

          // GET /api/apps/:name/deploy/settings
          if (req.method === 'GET' && parts[3] === 'deploy' && parts[4] === 'settings') {
            const settings = getDeploySettings(decodeURIComponent(parts[2] ?? ''));
            json(res, 200, settings);
            return;
          }

          // PUT /api/apps/:name/deploy/settings
          if (req.method === 'PUT' && parts[3] === 'deploy' && parts[4] === 'settings') {
            const opts = JSON.parse(body) as Partial<import('../types/app-entry.js').DeploySettings>;
            updateDeploySettings(decodeURIComponent(parts[2] ?? ''), opts);
            json(res, 200, { success: true });
            return;
          }

          // POST /api/apps/:name/deploy — manual deploy trigger
          if (req.method === 'POST' && parts[3] === 'deploy' && !parts[4]) {
            const jobId = await deployApp(decodeURIComponent(parts[2] ?? ''));
            json(res, 202, { jobId });
            return;
          }

          // GET /api/apps/:name/logs — SSE stream
          if (req.method === 'GET' && parts[3] === 'logs') {
            const appDir = getAppDir(decodeURIComponent(parts[2] ?? ''));
            if (!appDir) { json(res, 404, { error: 'App not found' }); return; }
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            // Stream docker compose logs from the app directory
            const { execa } = await import('execa');
            const proc = execa('docker', ['compose', 'logs', '--follow', '--tail', '50'], {
              cwd: appDir,
              reject: false,
              stdout: 'pipe',
              stderr: 'pipe',
            });
            const send = (line: string) => {
              res.write(`data: ${line.replace(/\n/g, ' ')}\n\n`);
            };
            proc.stdout?.on('data', (chunk: Buffer) => {
              for (const line of chunk.toString().split('\n')) {
                if (line.trim()) send(line);
              }
            });
            proc.stderr?.on('data', (chunk: Buffer) => {
              for (const line of chunk.toString().split('\n')) {
                if (line.trim()) send(line);
              }
            });
            req.on('close', () => proc.kill());
            return;
          }
```

- [ ] **Step 3: Add webhook route** — in the `deploy` section (after the existing `deploy history` route):

```typescript
        // POST /api/deploy/hook — Gitea webhook for auto-deploy
        if (parts[1] === 'deploy' && parts[2] === 'hook' && req.method === 'POST') {
          try {
            const payload = JSON.parse(body) as { repository?: { name?: string }; ref?: string; commits?: Array<{ id: string; message: string }> };
            const appName = payload.repository?.name;
            const branch = (payload.ref ?? '').replace('refs/heads/', '');
            if (appName) {
              const settings = getDeploySettings(appName);
              if (settings.autoDeploy && branch === settings.deployBranch) {
                void deployApp(appName);
              }
            }
            json(res, 200, { status: 'accepted' });
          } catch {
            json(res, 200, { status: 'accepted' }); // always 200 to Gitea
          }
          return;
        }
```

- [ ] **Step 4: Build**

```bash
pnpm -F @brewnet/cli build 2>&1 | tail -20
```

Fix any TypeScript errors. Common issues:
- `parts[2]` possibly undefined → use `parts[2] ?? ''`
- Import `DeploySettings` type

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/admin-server.ts
git commit -m "feat(api): add App Detail API routes and Gitea webhook handler"
```

---

## Task 6: Wire Webhook on App Create (auto-setup)

**Files:**
- Modify: `packages/cli/src/services/app-manager.ts`

- [ ] **Step 1: Add webhook registration at end of `_createModeA/B/C`**

At the end of each `_createModeA`, `_createModeB`, `_createModeC` (just before the `addApp` call adds the registry entry), call:

```typescript
  // Register Gitea webhook for auto-deploy (non-blocking — fail silently)
  await setupWebhook(opts.appName, 'http://localhost:8088/api/deploy/hook').catch(() => {});
```

This ensures every newly created app gets auto-deploy capability wired up.

- [ ] **Step 2: Build**

```bash
pnpm -F @brewnet/cli build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/services/app-manager.ts
git commit -m "feat(app-manager): auto-register Gitea webhook on app create"
```

---

## Task 7: Run Full Tests and Verify

- [ ] **Step 1: Run all unit tests**

```bash
pnpm test -- --no-coverage 2>&1 | tail -40
```

Expected: all existing tests pass. The 2 new test files (gitea-client-phase2, app-manager-phase2) also pass.

- [ ] **Step 2: Build final**

```bash
pnpm -F @brewnet/cli build
```

- [ ] **Step 3: Manual smoke test (if admin server running)**

```bash
# Get a specific app detail
curl -s http://localhost:8088/api/apps/test-nodejs-express 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(JSON.stringify(d,null,2))"

# Get git info
curl -s http://localhost:8088/api/apps/test-nodejs-express/git 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(JSON.stringify(d,null,2))"

# Check deploy history
curl -s "http://localhost:8088/api/deploy/history?app=test-nodejs-express" 2>/dev/null

# Open detail page in browser
open http://localhost:8088/apps/test-nodejs-express
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 2 App Detail page complete (STORY-05)"
```

---

## Verification Checklist

After implementation, verify:

```
□ GET /apps/:name serves App Detail HTML page
□ Overview tab shows app status, port, URL, created date
□ Git tab shows Gitea URL, clone commands, local path, latest commit
□ "Open Gitea" link opens correct Gitea repo URL
□ "Copy Setup" copies git remote add + push commands
□ Deploy tab shows auto-deploy toggle and history
□ Deploy Now triggers job and shows progress
□ Logs tab shows real-time docker compose logs
□ POST /api/deploy/hook accepts Gitea push events
□ auto-deploy = ON + matching branch → triggers deploy automatically
□ Apps list page has "Details" link per app row
□ All unit tests pass
□ pnpm -F @brewnet/cli build succeeds
```
