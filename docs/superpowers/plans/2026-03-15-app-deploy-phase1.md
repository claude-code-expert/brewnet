# App Build & Deploy — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "App Deploy" button to the Brewnet admin panel that opens a `/apps` page where users can register installed boilerplate stacks, clone external Git repos, or scaffold new projects — then connect each to the local Gitea server and start them as Docker containers.

**Architecture:** New `/apps` route served by `admin-server.ts`, delegating HTML to `apps-page.ts`. Business logic split across `app-registry.ts` (JSON persistence), `gitea-client.ts` (Gitea HTTP API), and `app-manager.ts` (orchestration + async job tracking). All new API endpoints (`/api/apps/*`) are dispatch-routed from the existing admin-server.ts request handler. No new HTTP server or port required.

**Tech Stack:** Node.js 20+ ESM, TypeScript 5 strict, execa (git commands), node:fs, node:crypto (jobId), node:os (homedir), existing `boilerplate-manager.ts` functions (`cloneStack`, `generateEnv`, `reinitGit`, `startContainers`, `pollHealth`), existing `frameworks.ts` (`resolveStackId`), existing `wizard/state.ts` (`getLastProject`, `loadState`).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/cli/src/types/app-entry.ts` | CREATE | `AppEntry`, `AppJob`, `CreateAppOptions` interfaces |
| `packages/cli/src/services/app-registry.ts` | CREATE | Read/write `~/.brewnet/apps.json` |
| `packages/cli/src/services/gitea-client.ts` | CREATE | Gitea API: token management, repo CRUD |
| `packages/cli/src/services/app-manager.ts` | CREATE | Create/start/stop/remove orchestration + in-memory job map |
| `packages/cli/src/services/apps-page.ts` | CREATE | `generateAppsPageHtml()` — full HTML for `/apps` |
| `packages/cli/src/services/admin-server.ts` | MODIFY | Add "App Deploy" button + `/apps` + `/api/apps/*` route dispatch |
| `tests/unit/cli/services/app-registry.test.ts` | CREATE | CRUD unit tests (fs mocked) |
| `tests/unit/cli/services/gitea-client.test.ts` | CREATE | HTTP unit tests (fetch mocked) |
| `tests/unit/cli/services/app-manager.test.ts` | CREATE | Orchestration unit tests (all deps mocked) |

---

## Chunk 1: Foundation — Types + AppRegistry + GiteaClient

### Task 1: AppEntry types

**Files:**
- Create: `packages/cli/src/types/app-entry.ts`

- [ ] **Step 1: Create the type file**

```typescript
// packages/cli/src/types/app-entry.ts

/** Source mode for a managed app. */
export type AppMode = 'boilerplate' | 'git-url' | 'new-project';

/** Lifecycle status of a managed app. */
export type AppStatus = 'creating' | 'running' | 'stopped' | 'failed';

/** Step status inside an AppJob. */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

/** One step in an async creation job. */
export interface AppJobStep {
  label: string;
  status: StepStatus;
  message?: string;
}

/** Async job for tracking app creation progress (in-memory only). */
export interface AppJob {
  jobId: string;
  appName: string;
  status: 'running' | 'done' | 'failed';
  steps: AppJobStep[];
  error?: string;
}

/** Persisted record for one managed app (stored in apps.json). */
export interface AppEntry {
  /** Unique logical name chosen by the user. */
  name: string;
  mode: AppMode;
  /** Installed boilerplate stackId — Mode A only. */
  stackId?: string;
  /** External Git URL — Mode B only. */
  sourceUrl?: string;
  /** Absolute path to the app's source directory on disk. */
  appDir: string;
  lang?: string;
  framework?: string;
  port: number;
  /** Gitea repo URL once connected (e.g. http://localhost:3000/admin/my-app). */
  giteaRepoUrl?: string;
  status: AppStatus;
  createdAt: string;
}

/** Input to createApp(). */
export interface CreateAppOptions {
  mode: AppMode;
  appName: string;
  port?: number;
  // Mode A
  stackId?: string;
  // Mode B
  gitUrl?: string;
  // Mode C
  language?: string;
  frameworkId?: string;
  includePostgres?: boolean;
  includeRedis?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/types/app-entry.ts
git commit -m "feat: add AppEntry, AppJob, CreateAppOptions types for app deploy phase 1"
```

---

### Task 2: AppRegistry — JSON persistence

**Files:**
- Create: `packages/cli/src/services/app-registry.ts`
- Test: `tests/unit/cli/services/app-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/cli/services/app-registry.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

const APPS_JSON = '/home/user/.brewnet/apps.json';

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '[]');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

// --------------------------------------------------------------------------
// Imports (after mocks)
// --------------------------------------------------------------------------

const { readApps, writeApps, addApp, updateApp, removeApp } =
  await import('../../../../packages/cli/src/services/app-registry.js');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function sampleEntry(name = 'my-app') {
  return {
    name,
    mode: 'boilerplate' as const,
    stackId: 'nodejs-nextjs-full',
    appDir: '/home/user/brewnet/nodejs-nextjs-full',
    port: 3000,
    status: 'running' as const,
    createdAt: '2026-03-15T00:00:00.000Z',
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('app-registry', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  describe('readApps', () => {
    it('returns empty array when file does not exist', () => {
      const result = readApps(APPS_JSON);
      expect(result).toEqual([]);
    });

    it('returns parsed array when file exists', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      const result = readApps(APPS_JSON);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('my-app');
    });
  });

  describe('addApp', () => {
    it('appends entry and writes file', () => {
      addApp(APPS_JSON, sampleEntry());
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe('my-app');
    });

    it('throws when name already exists', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      expect(() => addApp(APPS_JSON, sampleEntry())).toThrow('already exists');
    });
  });

  describe('updateApp', () => {
    it('updates matching entry by name', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      updateApp(APPS_JSON, 'my-app', { status: 'stopped' });
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written[0].status).toBe('stopped');
    });

    it('throws when name not found', () => {
      fsContent[APPS_JSON] = JSON.stringify([]);
      expect(() => updateApp(APPS_JSON, 'ghost', {})).toThrow('not found');
    });
  });

  describe('removeApp', () => {
    it('removes entry by name', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry('a'), sampleEntry('b')]);
      removeApp(APPS_JSON, 'a');
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe('b');
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet
pnpm test tests/unit/cli/services/app-registry.test.ts 2>&1 | tail -20
```
Expected: `Cannot find module` error.

- [ ] **Step 3: Implement app-registry.ts**

```typescript
// packages/cli/src/services/app-registry.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppEntry } from '../types/app-entry.js';

export function readApps(appsJsonPath: string): AppEntry[] {
  if (!existsSync(appsJsonPath)) return [];
  try {
    return JSON.parse(readFileSync(appsJsonPath, 'utf-8')) as AppEntry[];
  } catch {
    return [];
  }
}

export function writeApps(appsJsonPath: string, apps: AppEntry[]): void {
  mkdirSync(dirname(appsJsonPath), { recursive: true });
  writeFileSync(appsJsonPath, JSON.stringify(apps, null, 2), 'utf-8');
}

export function addApp(appsJsonPath: string, entry: AppEntry): void {
  const apps = readApps(appsJsonPath);
  if (apps.some((a) => a.name === entry.name)) {
    throw new Error(`App "${entry.name}" already exists`);
  }
  writeApps(appsJsonPath, [...apps, entry]);
}

export function updateApp(appsJsonPath: string, name: string, patch: Partial<AppEntry>): void {
  const apps = readApps(appsJsonPath);
  const idx = apps.findIndex((a) => a.name === name);
  if (idx === -1) throw new Error(`App "${name}" not found`);
  apps[idx] = { ...apps[idx]!, ...patch };
  writeApps(appsJsonPath, apps);
}

export function removeApp(appsJsonPath: string, name: string): void {
  const apps = readApps(appsJsonPath).filter((a) => a.name !== name);
  writeApps(appsJsonPath, apps);
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test tests/unit/cli/services/app-registry.test.ts 2>&1 | tail -10
```
Expected: `Tests: 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/app-registry.ts tests/unit/cli/services/app-registry.test.ts
git commit -m "feat: add app-registry service for apps.json persistence"
```

---

### Task 3: GiteaClient — Gitea API wrapper

**Files:**
- Create: `packages/cli/src/services/gitea-client.ts`
- Test: `tests/unit/cli/services/gitea-client.test.ts`

**Context:**
- Gitea port is read from wizard state (`state.servers.gitServer.port`, default `3000`).
- Admin credentials come from the project's `.env` file (`GITEA_ADMIN_USER`, `GITEA_ADMIN_PASSWORD`). Parse with a simple line-by-line reader — do NOT import dotenv.
- First call: Basic Auth → `POST /api/v1/users/{user}/tokens` → save token to `~/.brewnet/gitea-token` (chmod 600).
- Subsequent calls: read token from file.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/cli/services/gitea-client.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockChmodSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  chmodSync: mockChmodSync,
  mkdirSync: mockMkdirSync,
}));

// Mock global fetch (Node.js 20+ has fetch as a global built-in — not via node:fetch)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// --------------------------------------------------------------------------
// Imports
// --------------------------------------------------------------------------

const { GiteaClient } = await import(
  '../../../../packages/cli/src/services/gitea-client.js'
);

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeClient() {
  return new GiteaClient({
    host: 'localhost:3000',
    username: 'admin',
    password: 'secret',
    tokenPath: '/home/user/.brewnet/gitea-token',
  });
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('GiteaClient', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  describe('ensureToken', () => {
    it('reads token from file when it exists', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'existing-token';
      const client = makeClient();
      // createRepo uses ensureToken internally
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' }));
      await client.createRepo('my-app');
      // fetch should use token auth, not basic auth
      const [, opts] = mockFetch.mock.calls[0]!;
      expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'token existing-token' });
    });

    it('creates token via Basic Auth and saves to file when token file missing', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ sha1: 'new-token-abc' })) // token create
        .mockResolvedValueOnce(jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' })); // createRepo
      const client = makeClient();
      await client.createRepo('my-app');
      expect(fsContent['/home/user/.brewnet/gitea-token']).toBe('new-token-abc');
      expect(mockChmodSync).toHaveBeenCalledWith('/home/user/.brewnet/gitea-token', 0o600);
    });
  });

  describe('repoExists', () => {
    it('returns true when repo exists (200)', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, 200));
      const client = makeClient();
      expect(await client.repoExists('my-app')).toBe(true);
    });

    it('returns false when repo not found (404)', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
      const client = makeClient();
      expect(await client.repoExists('my-app')).toBe(false);
    });
  });

  describe('createRepo', () => {
    it('returns clone URL on success', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' }),
      );
      const client = makeClient();
      const url = await client.createRepo('my-app');
      expect(url).toBe('http://localhost:3000/admin/my-app.git');
    });

    it('throws on non-2xx response', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'conflict' }, 422));
      const client = makeClient();
      await expect(client.createRepo('my-app')).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/unit/cli/services/gitea-client.test.ts 2>&1 | tail -10
```
Expected: `Cannot find module`.

- [ ] **Step 3: Implement gitea-client.ts**

```typescript
// packages/cli/src/services/gitea-client.ts
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface GiteaClientConfig {
  /** e.g. "localhost:3000" */
  host: string;
  username: string;
  password: string;
  /** Path to persist the API token, e.g. ~/.brewnet/gitea-token */
  tokenPath: string;
}

export class GiteaClient {
  private config: GiteaClientConfig;

  constructor(config: GiteaClientConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  private async ensureToken(): Promise<string> {
    const { tokenPath, host, username, password } = this.config;

    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }

    // Create token via Basic Auth
    const basic = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await fetch(`http://${host}/api/v1/users/${username}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: `brewnet-${Date.now()}` }),
    });

    if (!res.ok) {
      throw new Error(`Gitea token creation failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { sha1: string };
    const token = data.sha1;

    mkdirSync(dirname(tokenPath), { recursive: true });
    writeFileSync(tokenPath, token, 'utf-8');
    chmodSync(tokenPath, 0o600);

    return token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `token ${await this.ensureToken()}`,
      'Content-Type': 'application/json',
    };
  }

  // ---------------------------------------------------------------------------
  // Repository operations
  // ---------------------------------------------------------------------------

  async repoExists(name: string): Promise<boolean> {
    const { host, username } = this.config;
    const res = await fetch(
      `http://${host}/api/v1/repos/${username}/${name}`,
      { headers: await this.authHeaders() },
    );
    return res.status === 200;
  }

  /** Creates a private repo and returns the clone URL. */
  async createRepo(name: string, description = ''): Promise<string> {
    const { host } = this.config;
    const res = await fetch(`http://${host}/api/v1/user/repos`, {
      method: 'POST',
      headers: await this.authHeaders(),
      body: JSON.stringify({ name, description, private: true, auto_init: false }),
    });

    if (!res.ok) {
      throw new Error(`Gitea createRepo failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { clone_url: string };
    return data.clone_url;
  }

  async deleteRepo(name: string): Promise<void> {
    const { host, username } = this.config;
    await fetch(`http://${host}/api/v1/repos/${username}/${name}`, {
      method: 'DELETE',
      headers: await this.authHeaders(),
    });
  }

  /** URL suitable for git remote add — includes credentials in URL (stored in .git/config which is chmod 600). */
  authedCloneUrl(cloneUrl: string): string {
    const { username, password } = this.config;
    return cloneUrl.replace('http://', `http://${username}:${password}@`);
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test tests/unit/cli/services/gitea-client.test.ts 2>&1 | tail -10
```
Expected: `Tests: 5 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/gitea-client.ts tests/unit/cli/services/gitea-client.test.ts
git commit -m "feat: add GiteaClient for API token management and repo CRUD"
```

---

## Chunk 2: App Manager — Orchestration

### Task 4: AppManager helpers — read .env credentials + resolve app paths

**Files:**
- Create: `packages/cli/src/services/app-manager.ts` (initial skeleton + helpers)

- [ ] **Step 1: Write failing tests for readDotEnvValue and resolveAppsJsonPath**

```typescript
// tests/unit/cli/services/app-manager.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockMkdirSync = jest.fn();
const mockChmodSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  chmodSync: mockChmodSync,
}));

// Mock homedir
jest.unstable_mockModule('node:os', () => ({
  homedir: () => '/home/user',
}));

// Mock execa (git commands)
const mockExeca = jest.fn();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

// Mock GiteaClient
const mockCreateRepo = jest.fn();
const mockRepoExists = jest.fn();
const mockAuthedCloneUrl = jest.fn((url: string) => url.replace('http://', 'http://admin:pw@'));
const MockGiteaClient = jest.fn().mockImplementation(() => ({
  createRepo: mockCreateRepo,
  repoExists: mockRepoExists,
  authedCloneUrl: mockAuthedCloneUrl,
}));
jest.unstable_mockModule('../../../../packages/cli/src/services/gitea-client.js', () => ({
  GiteaClient: MockGiteaClient,
}));

// Mock app-registry
const mockAddApp = jest.fn();
const mockUpdateApp = jest.fn();
const mockReadApps = jest.fn(() => []);
const mockRemoveApp = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/app-registry.js', () => ({
  addApp: mockAddApp,
  updateApp: mockUpdateApp,
  readApps: mockReadApps,
  removeApp: mockRemoveApp,
  writeApps: jest.fn(),
}));

// Mock global.fetch (used by _pollHealth inside app-manager.ts)
// Node 20 has fetch as a global built-in — override it here so CI doesn't
// make real HTTP calls during unit tests.
const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
global.fetch = mockFetch as unknown as typeof fetch;

// --------------------------------------------------------------------------
// Imports (after mocks)
// --------------------------------------------------------------------------

const { readDotEnvValue, resolveAppsJsonPath, listApps } = await import(
  '../../../../packages/cli/src/services/app-manager.js'
);

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('app-manager helpers', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  describe('readDotEnvValue', () => {
    it('returns value when key exists in .env', () => {
      fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=secret\n';
      expect(readDotEnvValue('/proj/.env', 'GITEA_ADMIN_USER')).toBe('admin');
      expect(readDotEnvValue('/proj/.env', 'GITEA_ADMIN_PASSWORD')).toBe('secret');
    });

    it('returns empty string when key not found', () => {
      fsContent['/proj/.env'] = 'FOO=bar\n';
      expect(readDotEnvValue('/proj/.env', 'MISSING')).toBe('');
    });

    it('returns empty string when .env file missing', () => {
      expect(readDotEnvValue('/nonexistent/.env', 'KEY')).toBe('');
    });
  });

  describe('resolveAppsJsonPath', () => {
    it('returns path under ~/.brewnet/apps.json', () => {
      expect(resolveAppsJsonPath()).toBe('/home/user/.brewnet/apps.json');
    });
  });

  describe('listApps', () => {
    it('returns apps from registry', async () => {
      mockReadApps.mockReturnValue([{ name: 'my-app', status: 'running' }]);
      const apps = await listApps();
      expect(apps).toHaveLength(1);
      expect(apps[0]!.name).toBe('my-app');
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement app-manager.ts skeleton**

```typescript
// packages/cli/src/services/app-manager.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { GiteaClient } from './gitea-client.js';
import { addApp, updateApp, readApps, removeApp as registryRemoveApp } from './app-registry.js';
import type { AppEntry, AppJob, AppJobStep, CreateAppOptions } from '../types/app-entry.js';

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
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/app-manager.ts tests/unit/cli/services/app-manager.test.ts
git commit -m "feat: add app-manager skeleton with readDotEnvValue and listApps"
```

---

### Task 5: AppManager — createApp (Mode A: installed boilerplate)

**Context:**
- Mode A uses the existing boilerplate at `appDir` (already on disk, already git-initialized).
- Steps: validate name → create Gitea repo → git remote add `brewnet` → git push → docker compose up (if not already running) → register in apps.json.
- Gitea credentials read from `<projectPath>/.env`.
- `projectPath` resolved from wizard state via `getLastProject()` + `loadState()`.
- Job steps: `['Validating', 'Gitea repo', 'Git push', 'Docker up', 'Health check']`.

- [ ] **Step 1: Add Mode A test to app-manager.test.ts**

Add to the existing test file inside a new `describe('createApp — mode A')` block:

```typescript
// Append to tests/unit/cli/services/app-manager.test.ts

// Mock wizard state
const mockLoadState = jest.fn();
const mockGetLastProject = jest.fn(() => 'my-project');
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
}));

// Mock execa for git + docker
mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

describe('createApp — mode A (installed boilerplate)', () => {
  it('creates Gitea repo, sets git remote, pushes, starts docker, registers app', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/home/user/.brewnet/gitea-token'] = 'mytoken';
    // boilerplate meta
    fsContent['/proj/.brewnet-boilerplate.json'] = JSON.stringify([{
      stackId: 'nodejs-nextjs-full',
      appDir: '/proj/nodejs-nextjs-full',
      backendUrl: 'http://127.0.0.1:3000',
      port: 3000,
      lang: 'nodejs',
      frameworkId: 'nextjs-full',
      status: 'running',
    }]);

    mockCreateRepo.mockResolvedValue('http://localhost:3000/admin/my-app.git');
    mockRepoExists.mockResolvedValue(false);

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');

    const jobId = await createApp({
      mode: 'boilerplate',
      appName: 'my-app',
      stackId: 'nodejs-nextjs-full',
      port: 3000,
    });

    expect(typeof jobId).toBe('string');
    expect(mockCreateRepo).toHaveBeenCalledWith('my-app', expect.any(String));
    // Resolves asynchronously — wait for job to finish
    // Poll until job finishes (max 1000ms, 20ms interval — robust in CI)
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId);
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['remote', 'add', 'brewnet']),
      expect.objectContaining({ cwd: '/proj/nodejs-nextjs-full' }),
    );
    expect(mockAddApp).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'my-app', mode: 'boilerplate', stackId: 'nodejs-nextjs-full' }),
    );
  });

  it('returns a job with failed status when Gitea is unreachable', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/proj/.brewnet-boilerplate.json'] = JSON.stringify([{
      stackId: 'go-gin', appDir: '/proj/go-gin', backendUrl: 'http://127.0.0.1:8080', port: 8080,
      lang: 'go', frameworkId: 'gin', status: 'running',
    }]);

    mockCreateRepo.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await createApp({ mode: 'boilerplate', appName: 'go-app', stackId: 'go-gin' });
    // Poll until job finishes (max 1000ms, 20ms interval — robust in CI)
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId);
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const job = getJobStatus(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('ECONNREFUSED');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Implement createApp (Mode A) in app-manager.ts**

Add the following to `packages/cli/src/services/app-manager.ts`:

```typescript
// Add to app-manager.ts (after existing helpers — do NOT re-import node:fs, it is already imported in the skeleton)

import { getLastProject, loadState } from '../wizard/state.js';

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
  giteaPort: number;
  giteaUser: string;
  giteaPassword: string;
}

function resolveContext(): AppContext {
  const last = getLastProject();
  const state = loadState(last);
  const raw = state?.projectPath ?? process.cwd();
  const projectPath = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  const giteaPort = (state?.servers as { gitServer?: { port?: number } })?.gitServer?.port ?? 3000;
  const envPath = join(projectPath, '.env');
  const giteaUser = readDotEnvValue(envPath, 'GITEA_ADMIN_USER') || (state?.admin as { username?: string })?.username || 'admin';
  const giteaPassword = readDotEnvValue(envPath, 'GITEA_ADMIN_PASSWORD') || (state?.admin as { password?: string })?.password || '';
  return { projectPath, giteaPort, giteaUser, giteaPassword };
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
    const gitea = new GiteaClient({
      host: `localhost:${ctx.giteaPort}`,
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
    cloneUrl = `http://localhost:${ctx.giteaPort}/${ctx.giteaUser}/${opts.appName}.git`;
  }
  setStep(job, 1, 'done');

  // Step 2: Git remote + push
  setStep(job, 2, 'running');
  const authedUrl = gitea.authedCloneUrl(cloneUrl);
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], { cwd: meta.appDir }).catch(() => {
    // remote may already exist — update it
    return execa('git', ['remote', 'set-url', 'brewnet', authedUrl], { cwd: meta.appDir });
  });
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], { cwd: meta.appDir });
  setStep(job, 2, 'done');

  // Step 3: Docker up
  setStep(job, 3, 'running');
  await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: meta.appDir });
  setStep(job, 3, 'done');

  // Step 4: Health check (simple HTTP poll)
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
    giteaRepoUrl: `http://localhost:${ctx.giteaPort}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}

// Stub implementations for Mode B and C — completed in Task 6 and 7
async function _createModeB(..._: unknown[]): Promise<void> { throw new Error('Mode B: not yet implemented'); }
async function _createModeC(..._: unknown[]): Promise<void> { throw new Error('Mode C: not yet implemented'); }

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
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/app-manager.ts tests/unit/cli/services/app-manager.test.ts
git commit -m "feat: implement createApp mode A (installed boilerplate)"
```

---

### Task 6: AppManager — createApp Mode B (Git URL clone)

**Context:**
- Clones external URL to `<projectPath>/apps/<appName>`.
- Calls `reinitGit(appDir)` from boilerplate-manager.ts to clean history.
- Then same Gitea + docker flow as Mode A.

- [ ] **Step 1: Add Mode B test to app-manager.test.ts**

Append inside the existing test file:

```typescript
describe('createApp — mode B (git-url)', () => {
  it('clones repo, reinits git, pushes to Gitea, starts docker', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockCreateRepo.mockResolvedValue('http://localhost:3000/admin/ext-app.git');
    mockRepoExists.mockResolvedValue(false);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await createApp({
      mode: 'git-url',
      appName: 'ext-app',
      gitUrl: 'https://github.com/user/template.git',
      port: 8080,
    });
    // Poll until job finishes (max 1000ms, 20ms interval — robust in CI)
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId);
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    // git clone should have been called with the external URL
    const cloneCalls = (mockExeca.mock.calls as unknown[][]).filter(
      (c) => (c[1] as string[])?.includes('clone'),
    );
    expect(cloneCalls.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement _createModeB in app-manager.ts**

Replace the `_createModeB` stub:

```typescript
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

  // Step 0: Clone + reinit (use reinitGit from boilerplate-manager — uses rmSync, not shell rm -rf)
  setStep(job, 0, 'running');
  const { reinitGit: reinitGitB } = await import('./boilerplate-manager.js');
  await execa('git', ['clone', '--depth', '1', opts.gitUrl, appDir]);
  await reinitGitB(appDir); // removes .git, inits fresh, commits
  setStep(job, 0, 'done');

  // Steps 1-4 are identical to Mode A from here
  setStep(job, 1, 'running');
  const alreadyExists = await gitea.repoExists(opts.appName);
  const cloneUrl = alreadyExists
    ? `http://localhost:${ctx.giteaPort}/${ctx.giteaUser}/${opts.appName}.git`
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
    giteaRepoUrl: `http://localhost:${ctx.giteaPort}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/app-manager.ts
git commit -m "feat: implement createApp mode B (git URL clone)"
```

---

### Task 7: AppManager — createApp Mode C + startApp + stopApp

**Context:**
- Mode C: uses `cloneStack(stackId, appDir)` from `boilerplate-manager.ts`. stackId is resolved from language+frameworkId via `resolveStackId()` from `frameworks.ts`.
- `startApp` / `stopApp`: `docker compose up -d` / `docker compose down` then update apps.json.

- [ ] **Step 1: Add tests**

```typescript
// Append to app-manager.test.ts

// Mock boilerplate-manager
const mockCloneStack = jest.fn();
const mockGenerateEnv = jest.fn();
const mockReinitGit = jest.fn();
const mockStartContainers = jest.fn();
const mockPollHealth = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/boilerplate-manager.js', () => ({
  cloneStack: mockCloneStack,
  generateEnv: mockGenerateEnv,
  reinitGit: mockReinitGit,
  startContainers: mockStartContainers,
  pollHealth: mockPollHealth,
}));

// Mock frameworks
const mockResolveStackId = jest.fn(() => 'go-gin');
jest.unstable_mockModule('../../../../packages/cli/src/config/frameworks.js', () => ({
  resolveStackId: mockResolveStackId,
}));

describe('createApp — mode C (new project)', () => {
  it('clones boilerplate, setups gitea, starts containers', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockCreateRepo.mockResolvedValue('http://localhost:3000/admin/new-app.git');
    mockRepoExists.mockResolvedValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ status: 'healthy' });

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await createApp({
      mode: 'new-project',
      appName: 'new-app',
      language: 'go',
      frameworkId: 'gin',
      port: 8080,
    });
    // Poll until background job settles (max 1 s)
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId);
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(mockCloneStack).toHaveBeenCalledWith('go-gin', expect.stringContaining('new-app'));
  });
});

describe('startApp / stopApp', () => {
  it('runs docker compose up and updates status', async () => {
    mockReadApps.mockReturnValue([{ name: 'my-app', appDir: '/dir', status: 'stopped' }]);
    mockExeca.mockResolvedValue({});
    const { startApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await startApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'up', '-d'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'running' });
  });

  it('runs docker compose down and updates status', async () => {
    mockReadApps.mockReturnValue([{ name: 'my-app', appDir: '/dir', status: 'running' }]);
    mockExeca.mockResolvedValue({});
    const { stopApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await stopApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'down'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'stopped' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement Mode C + startApp + stopApp in app-manager.ts**

Append to `packages/cli/src/services/app-manager.ts`:

```typescript
// Replace _createModeC stub:
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
  // Use app-manager's own _pollHealth (correct signature: url, maxMs)
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
    giteaRepoUrl: `http://localhost:${ctx.giteaPort}/${ctx.giteaUser}/${opts.appName}`,
    status: 'running',
    createdAt: new Date().toISOString(),
  });
}

// Add after _createModeC:

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
```

- [ ] **Step 4: Run all app-manager tests**

```bash
pnpm test tests/unit/cli/services/app-manager.test.ts 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/services/app-manager.ts
git commit -m "feat: implement createApp mode C, startApp, stopApp, removeApp"
```

---

## Chunk 3: UI — Apps Page + Admin Server Integration

### Task 8: apps-page.ts — HTML template

**Files:**
- Create: `packages/cli/src/services/apps-page.ts`

**Visual design:** Match admin panel exactly — same dark theme (`#0d1117` bg, `#f5a623` amber, `#58a6ff` blue, monospace font, same table/modal/badge CSS).

**Page structure:**
1. Header: Brewnet logo + "← Admin" back link + "App Deploy" title + "+ New App" button.
2. Apps table: `Name | Mode | Stack | Port | Status | Local URL | Actions`.
3. "New App" modal: 3-tab source selector + conditional form fields.
4. Progress modal: step list + poll timer.

- [ ] **Step 1: Create apps-page.ts**

```typescript
// packages/cli/src/services/apps-page.ts

/**
 * HTML template for the /apps page — App Build & Deploy (Phase 1).
 *
 * Intentionally self-contained: all CSS and JS inline, matching the
 * admin panel dark theme. Loaded once at server start; no file I/O at
 * request time.
 */

import { STACK_CATALOG } from '../config/stacks.js';

// Serialise catalog for embedded JS (language → frameworks list)
const LANGUAGE_MAP: Record<string, Array<{ id: string; label: string }>> = {};
for (const s of STACK_CATALOG) {
  if (!LANGUAGE_MAP[s.language]) LANGUAGE_MAP[s.language] = [];
  LANGUAGE_MAP[s.language]!.push({ id: s.id, label: s.framework });
}
const DEFAULT_PORTS: Record<string, number> = {
  Go: 8080, Python: 8000, Java: 8080, 'Node.js': 3000, Rust: 8080, Kotlin: 8080,
};

export function generateAppsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet — App Deploy</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:24px}
h1{color:#f5a623;font-size:20px;display:flex;align-items:center;gap:10px;margin-bottom:4px}
.sub{color:#8b949e;font-size:12px;margin-bottom:24px}
.header{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
.back{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px}
.back:hover{background:#21262d}
.btn-primary{padding:5px 14px;background:#f5a623;color:#0d1117;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700}
.btn-primary:hover{background:#e09420}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;padding:8px 12px;background:#161b22;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #30363d}
td{padding:8px 12px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:hover td{background:#161b22}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}
.stopped{background:#3d1f1f;color:#f85149}
.creating{background:#2d2a1f;color:#e3b341}
.failed{background:#3d2b1f;color:#e3b341}
.btn{padding:4px 10px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent;margin-left:4px}
.btn-stop{border-color:#f85149;color:#f85149}.btn-stop:hover{background:#3d1f1f}
.btn-start{border-color:#3fb950;color:#3fb950}.btn-start:hover{background:#1a4731}
.btn-remove{border-color:#8b949e;color:#8b949e}.btn-remove:hover{background:#21262d}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
/* Modal */
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:100}
.modal-box{background:#161b22;border:1px solid #30363d;border-radius:10px;max-width:600px;width:92%;max-height:85vh;overflow-y:auto;font-family:'Courier New',monospace;font-size:14px}
.modal-titlebar{background:#0d1117;padding:10px 16px;display:flex;align-items:center;gap:8px;border-radius:10px 10px 0 0;position:sticky;top:0;z-index:1}
.modal-dot{width:12px;height:12px;border-radius:50%;display:inline-block}
.modal-dot.r{background:#f85149}.modal-dot.y{background:#e3b341}.modal-dot.g{background:#3fb950}
.modal-title{flex:1;color:#8b949e;font-size:13px;margin-left:4px}
.modal-close{background:none;border:none;color:#8b949e;font-size:18px;cursor:pointer;line-height:1}
.modal-close:hover{color:#c9d1d9}
.modal-body{padding:20px}
/* Form */
.mode-tabs{display:flex;gap:0;margin-bottom:20px;border:1px solid #30363d;border-radius:6px;overflow:hidden}
.mode-tab{flex:1;padding:8px;text-align:center;cursor:pointer;font-size:12px;color:#8b949e;background:#0d1117;border:none;font-family:inherit;transition:all .15s}
.mode-tab.active{background:#1c2128;color:#f5a623;font-weight:700}
.mode-tab:hover:not(.active){background:#161b22;color:#c9d1d9}
.form-group{margin-bottom:14px}
.form-label{display:block;color:#8b949e;font-size:12px;margin-bottom:5px}
.form-input{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:7px 10px;font-family:inherit;font-size:13px}
.form-input:focus{outline:none;border-color:#58a6ff}
.form-select{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:7px 10px;font-family:inherit;font-size:13px}
.lang-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}
.lang-card{padding:8px;text-align:center;border:1px solid #30363d;border-radius:6px;cursor:pointer;font-size:13px;transition:all .15s}
.lang-card:hover{border-color:#58a6ff;color:#58a6ff}
.lang-card.selected{border-color:#f5a623;color:#f5a623;background:#1c1a12}
.form-hint{color:#484f58;font-size:11px;margin-top:4px}
.form-row{display:flex;gap:10px}
.form-row .form-group{flex:1}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #30363d}
.btn-cancel{padding:6px 16px;background:transparent;border:1px solid #30363d;border-radius:4px;color:#8b949e;cursor:pointer;font-family:inherit;font-size:13px}
.btn-cancel:hover{border-color:#8b949e;color:#c9d1d9}
.btn-submit{padding:6px 16px;background:#f5a623;border:none;border-radius:4px;color:#0d1117;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700}
.btn-submit:hover{background:#e09420}
.btn-submit:disabled{opacity:.4;cursor:default}
/* Progress */
.progress-step{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px}
.step-icon{width:18px;text-align:center;flex-shrink:0}
.step-label{flex:1;color:#c9d1d9}
.step-msg{color:#8b949e;font-size:11px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #21262d;font-size:13px}
.info-key{color:#8b949e}
.info-val{color:#c9d1d9;font-family:monospace}
a.app-link{color:#58a6ff;text-decoration:none}
a.app-link:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="header">
  <h1>
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="#f5a623" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/>
      <path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/>
      <path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/>
      <path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/>
      <path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/>
    </svg>
    App Deploy
  </h1>
  <a href="/" class="back">← Admin</a>
  <span style="flex:1"></span>
  <button class="btn-primary" onclick="openNewAppModal()">+ New App</button>
</div>

<div class="section-title">Managed Apps</div>
<table id="app-table">
  <thead><tr><th>Name</th><th>Mode</th><th>Stack / Source</th><th>Port</th><th>Status</th><th>Local URL</th><th>Actions</th></tr></thead>
  <tbody id="app-body"><tr><td colspan="7" style="color:#8b949e">Loading...</td></tr></tbody>
</table>

<script>
var LANGUAGE_MAP = ${JSON.stringify(LANGUAGE_MAP)};
var DEFAULT_PORTS = ${JSON.stringify(DEFAULT_PORTS)};
var BOILERPLATES = [];  // loaded from /api/apps/boilerplates on modal open

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function badge(status){const c={running:'running',stopped:'stopped',creating:'creating',failed:'failed'}[status]||'stopped';return '<span class="badge '+c+'">'+status+'</span>';}

// ---------------------------------------------------------------------------
// App table
// ---------------------------------------------------------------------------
async function loadApps(){
  const r=await fetch('/api/apps').then(r=>r.json()).catch(()=>({apps:[]}));
  const tbody=document.getElementById('app-body');
  if(!r.apps||r.apps.length===0){tbody.innerHTML='<tr><td colspan="7" style="color:#8b949e">No apps yet — click "+ New App" to get started.</td></tr>';return;}
  tbody.innerHTML=r.apps.map(function(a){
    var localUrl=a.port?'http://localhost:'+a.port:'';
    var stackLabel=a.stackId||a.sourceUrl||'—';
    return '<tr>'+
      '<td><b>'+escHtml(a.name)+'</b></td>'+
      '<td><span style="color:#8b949e">'+escHtml(a.mode)+'</span></td>'+
      '<td style="font-size:12px;color:#8b949e">'+escHtml(stackLabel)+'</td>'+
      '<td>'+escHtml(String(a.port||'—'))+'</td>'+
      '<td>'+badge(a.status)+'</td>'+
      '<td>'+(localUrl?'<a href="'+localUrl+'" target="_blank" class="app-link">'+localUrl+'</a>':'—')+'</td>'+
      '<td>'+
        (a.status==='running'?'<button class="btn btn-stop" onclick="stopApp(\''+escHtml(a.name)+'\')">Stop</button>':'')+
        (a.status==='stopped'?'<button class="btn btn-start" onclick="startApp(\''+escHtml(a.name)+'\')">Start</button>':'')+
        '<button class="btn btn-remove" onclick="removeApp(\''+escHtml(a.name)+'\')">Remove</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

async function stopApp(name){
  await fetch('/api/apps/'+encodeURIComponent(name)+'/stop',{method:'POST'});
  loadApps();
}
async function startApp(name){
  await fetch('/api/apps/'+encodeURIComponent(name)+'/start',{method:'POST'});
  loadApps();
}
async function removeApp(name){
  if(!confirm('Remove app "'+name+'"? The source files will NOT be deleted.'))return;
  await fetch('/api/apps/'+encodeURIComponent(name),{method:'DELETE'});
  loadApps();
}

// ---------------------------------------------------------------------------
// New App modal — 3 modes
// ---------------------------------------------------------------------------
var currentMode='boilerplate';
var selectedLang='';

async function openNewAppModal(){
  // Load installed boilerplates
  BOILERPLATES=await fetch('/api/apps/boilerplates').then(r=>r.json()).then(r=>r.boilerplates||[]).catch(()=>[]);
  var ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.id='new-app-overlay';
  ov.onclick=function(e){if(e.target===ov)closeNewAppModal();};
  ov.innerHTML=buildNewAppModalHtml();
  document.body.appendChild(ov);
  document.addEventListener('keydown',handleEsc);
  switchMode('boilerplate');
}

function closeNewAppModal(){
  var o=document.getElementById('new-app-overlay');
  if(o)o.remove();
  document.removeEventListener('keydown',handleEsc);
}

function handleEsc(e){if(e.key==='Escape')closeNewAppModal();}

function buildNewAppModalHtml(){
  var bpOptions=BOILERPLATES.length
    ?BOILERPLATES.map(function(b){return '<option value="'+escHtml(b.stackId)+'">'+escHtml(b.stackId)+' (port '+escHtml(String(b.port||'?'))+')</option>';}).join('')
    :'<option disabled>No installed boilerplates</option>';
  var langCards=Object.keys(LANGUAGE_MAP).map(function(lang){
    // ID uses same normalize pattern as switchMode to ensure getElementById matches
    return '<div class="lang-card" onclick="selectLang(\''+escHtml(lang)+'\')" id="lang-'+lang.replace(/[^a-z]/gi,'-')+'">'+escHtml(lang)+'</div>';
  }).join('');
  return '<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">New App</span>'+
      '<button class="modal-close" onclick="closeNewAppModal()">\\u00d7</button>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div class="mode-tabs">'+
        '<button class="mode-tab active" id="tab-boilerplate" onclick="switchMode(\'boilerplate\')">Installed Boilerplate</button>'+
        '<button class="mode-tab" id="tab-git-url" onclick="switchMode(\'git-url\')">Git URL</button>'+
        '<button class="mode-tab" id="tab-new-project" onclick="switchMode(\'new-project\')">New Project</button>'+
      '</div>'+
      '<div id="mode-fields"></div>'+
      '<div class="form-actions">'+
        '<button class="btn-cancel" onclick="closeNewAppModal()">Cancel</button>'+
        '<button class="btn-submit" id="submit-btn" onclick="submitNewApp()">Create App →</button>'+
      '</div>'+
    '</div></div>';
}

function switchMode(mode){
  currentMode=mode;
  selectedLang='';
  ['boilerplate','git-url','new-project'].forEach(function(m){
    var tab=document.getElementById('tab-'+m);
    if(tab)tab.className='mode-tab'+(m===mode?' active':'');
  });
  var fields=document.getElementById('mode-fields');
  if(!fields)return;
  if(mode==='boilerplate'){
    var bpOpts=BOILERPLATES.length
      ?BOILERPLATES.map(function(b){return '<option value="'+escHtml(b.stackId)+'">'+escHtml(b.stackId)+' (port '+b.port+')</option>';}).join('')
      :'<option disabled value="">No installed boilerplates</option>';
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Stack (installed)</label>'+
      '<select class="form-select" id="f-stackId" onchange="onStackChange()">'+bpOpts+'</select>'+
      '<p class="form-hint">Already installed during brewnet init. Connects to Gitea and starts Docker.</p></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
        '<div class="form-group"><label class="form-label">Port</label><input class="form-input" id="f-port" type="number" placeholder="3000"/></div>'+
      '</div>'+
      '<div class="form-group"><label class="form-label">Framework</label><input class="form-input" id="f-framework" readonly style="opacity:.5"/></div>'+
      '<div class="form-group"><label class="form-label">Local Path</label><input class="form-input" id="f-appDir" readonly style="opacity:.5"/></div>';
    if(BOILERPLATES.length)onStackChange();
  } else if(mode==='git-url'){
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Git URL</label>'+
      '<input class="form-input" id="f-gitUrl" placeholder="https://github.com/user/repo.git"/>'+
      '<p class="form-hint">Will be cloned, git history reset, and pushed to your local Gitea.</p></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
        '<div class="form-group"><label class="form-label">Port</label><input class="form-input" id="f-port" type="number" value="8080"/></div>'+
      '</div>';
  } else {
    var langCards=Object.keys(LANGUAGE_MAP).map(function(lang){
      return '<div class="lang-card" onclick="selectLang(\''+lang+'\')" id="lang-'+lang.replace(/[^a-z]/gi,'-')+'">'+lang+'</div>';
    }).join('');
    fields.innerHTML=
      '<div class="form-group"><label class="form-label">Language</label><div class="lang-grid" id="lang-grid">'+langCards+'</div></div>'+
      '<div class="form-group" id="fw-group" style="display:none"><label class="form-label">Framework</label>'+
        '<select class="form-select" id="f-frameworkId"></select></div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label class="form-label">App Name</label><input class="form-input" id="f-appName" placeholder="my-app"/></div>'+
        '<div class="form-group"><label class="form-label">Port</label><input class="form-input" id="f-port" type="number" placeholder="8080"/></div>'+
      '</div>';
  }
}

function onStackChange(){
  var sel=document.getElementById('f-stackId');
  var stackId=sel?sel.value:'';
  var meta=BOILERPLATES.find(function(b){return b.stackId===stackId;});
  if(!meta)return;
  var portEl=document.getElementById('f-port');
  var fwEl=document.getElementById('f-framework');
  var dirEl=document.getElementById('f-appDir');
  if(portEl)portEl.value=String(meta.port||'');
  if(fwEl)fwEl.value=meta.frameworkId||'';
  if(dirEl)dirEl.value=meta.appDir||'';
}

function selectLang(lang){
  selectedLang=lang;
  document.querySelectorAll('.lang-card').forEach(function(el){el.classList.remove('selected');});
  var card=document.getElementById('lang-'+lang.replace(/[^a-z]/gi,'-'));
  if(card)card.classList.add('selected');
  var fwGroup=document.getElementById('fw-group');
  var fwSel=document.getElementById('f-frameworkId');
  var portEl=document.getElementById('f-port');
  if(fwSel){
    fwSel.innerHTML=(LANGUAGE_MAP[lang]||[]).map(function(f){return '<option value="'+escHtml(f.id)+'">'+escHtml(f.label)+'</option>';}).join('');
  }
  if(fwGroup)fwGroup.style.display='';
  if(portEl)portEl.value=String(DEFAULT_PORTS[lang]||8080);
}

async function submitNewApp(){
  var appName=(document.getElementById('f-appName')||{}).value||'';
  if(!appName){alert('App name is required');return;}
  if(!/^[a-z0-9-]+$/.test(appName)){alert('App name must be lowercase letters, numbers, hyphens only');return;}

  var body={mode:currentMode,appName:appName};
  var portEl=document.getElementById('f-port');
  if(portEl&&portEl.value)body.port=parseInt(portEl.value,10);

  if(currentMode==='boilerplate'){
    var stackSel=document.getElementById('f-stackId');
    body.stackId=stackSel?stackSel.value:'';
  } else if(currentMode==='git-url'){
    var urlEl=document.getElementById('f-gitUrl');
    body.gitUrl=urlEl?urlEl.value:'';
    if(!body.gitUrl){alert('Git URL is required');return;}
  } else {
    if(!selectedLang){alert('Please select a language');return;}
    var fwSel=document.getElementById('f-frameworkId');
    // STACK_CATALOG uses display names ('Node.js', 'Go') but resolveStackId expects
    // lowercase code IDs ('nodejs', 'go'). Normalize here before sending to API.
    var LANG_CODE_MAP={'Node.js':'nodejs','Go':'go','Python':'python','Java':'java','Rust':'rust','Kotlin':'kotlin'};
    body.language=LANG_CODE_MAP[selectedLang]||selectedLang.toLowerCase();
    body.frameworkId=fwSel?fwSel.value:'';
  }

  var submitBtn=document.getElementById('submit-btn');
  if(submitBtn)submitBtn.disabled=true;

  var r=await fetch('/api/apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(function(e){return{error:e.message};});
  if(r.error){alert('Error: '+r.error);if(submitBtn)submitBtn.disabled=false;return;}

  closeNewAppModal();
  openProgressModal(appName,r.jobId);
}

// ---------------------------------------------------------------------------
// Progress modal (polls /api/apps/jobs/:jobId)
// ---------------------------------------------------------------------------
var progressTimer=null;

function openProgressModal(appName,jobId){
  var ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.id='progress-overlay';
  ov.innerHTML='<div class="modal-box">'+
    '<div class="modal-titlebar">'+
      '<span class="modal-dot r"></span><span class="modal-dot y"></span><span class="modal-dot g"></span>'+
      '<span class="modal-title">Creating '+escHtml(appName)+'...</span>'+
    '</div>'+
    '<div class="modal-body" id="progress-body"><p style="color:#8b949e">Starting...</p></div>'+
  '</div>';
  document.body.appendChild(ov);
  pollJob(appName,jobId);
}

function closeProgressModal(){
  var o=document.getElementById('progress-overlay');if(o)o.remove();
  if(progressTimer)clearTimeout(progressTimer);
}

function stepIcon(status){
  if(status==='done')return'<span style="color:#3fb950">✓</span>';
  if(status==='running')return'<span style="color:#e3b341">⏳</span>';
  if(status==='failed')return'<span style="color:#f85149">✗</span>';
  return'<span style="color:#484f58">○</span>';
}

async function pollJob(appName,jobId){
  var r=await fetch('/api/apps/jobs/'+encodeURIComponent(jobId)).then(r=>r.json()).catch(()=>null);
  if(!r){progressTimer=setTimeout(function(){pollJob(appName,jobId);},2000);return;}
  var body=document.getElementById('progress-body');
  if(!body)return;
  var stepsHtml=(r.steps||[]).map(function(s){
    return '<div class="progress-step">'+stepIcon(s.status)+'<span class="step-label">'+escHtml(s.label)+'</span>'+(s.message?'<span class="step-msg">'+escHtml(s.message)+'</span>':'')+'</div>';
  }).join('');
  if(r.status==='done'){
    body.innerHTML=stepsHtml+'<div style="margin-top:16px;color:#3fb950;font-weight:700">✓ App created successfully</div>'+
      '<div style="margin-top:16px;text-align:right"><button class="btn-primary" onclick="closeProgressModal();loadApps()">Done</button></div>';
  } else if(r.status==='failed'){
    body.innerHTML=stepsHtml+'<div style="margin-top:12px;color:#f85149">✗ Failed: '+escHtml(r.error||'Unknown error')+'</div>'+
      '<div style="margin-top:16px;text-align:right"><button class="btn-cancel" onclick="closeProgressModal()">Close</button></div>';
  } else {
    body.innerHTML=stepsHtml;
    progressTimer=setTimeout(function(){pollJob(appName,jobId);},2000);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
loadApps();
setInterval(loadApps,15000);
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet
pnpm --filter @brewnet/cli exec tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/services/apps-page.ts
git commit -m "feat: add apps-page.ts with New App modal (3 modes) and progress polling UI"
```

---

### Task 9: admin-server.ts — button + /apps route + /api/apps/* dispatch

**Files:**
- Modify: `packages/cli/src/services/admin-server.ts`

**Changes (3 surgical edits — nothing else):**
1. Import `generateAppsPageHtml` from `apps-page.ts`.
2. Import `createApp`, `getJobStatus`, `listApps`, `startApp`, `stopApp`, `removeApp` from `app-manager.ts`.
3. Add "🚀 App Deploy" button to the header in `generateDashboardHtml()`.
4. Add `/apps` GET route.
5. Add `/api/apps/*` route dispatch block.

- [ ] **Step 1: Add imports to admin-server.ts**

At the top of `packages/cli/src/services/admin-server.ts`, after existing imports:

```typescript
import { generateAppsPageHtml } from './apps-page.js';
import {
  createApp,
  getJobStatus,
  listApps,
  startApp,
  stopApp,
  removeApp as appRemove,
} from './app-manager.js';
import type { CreateAppOptions } from '../types/app-entry.js';
```

- [ ] **Step 2: Add button to dashboard HTML**

In `generateDashboardHtml()`, locate:

```html
  <span class="refresh" onclick="loadServices(true)">&#8635; Refresh</span>
```

Replace with:

```html
  <span class="refresh" onclick="loadServices(true)">&#8635; Refresh</span>
  <a href="/apps" style="padding:5px 12px;background:#f5a623;color:#0d1117;border-radius:4px;font-size:12px;font-weight:700;text-decoration:none;font-family:'Courier New',monospace">&#x1F680; App Deploy</a>
```

- [ ] **Step 3: Add /apps and /api/apps/* routes**

In the server request handler, after the favicon route and before the existing dashboard HTML route, add:

```typescript
    // Serve Apps page
    if (req.method === 'GET' && (url === '/apps' || url === '/apps/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateAppsPageHtml());
      return;
    }
```

In the API routing section, **inside the existing `try { ... } catch` block** (around line 783-827 of admin-server.ts), after the `if (parts[1] === 'backup')` handler and before `json(res, 404, { success: false, error: 'Not found' })`. The entire API routing block is already wrapped in a try-catch — the new code must sit inside that same try block:

```typescript
        // --- /api/apps/* ---
        if (parts[1] === 'apps') {
          // GET /api/apps — list managed apps
          if (req.method === 'GET' && parts.length === 2) {
            const apps = await listApps();
            json(res, 200, { apps });
            return;
          }

          // GET /api/apps/boilerplates — installed boilerplate meta
          if (req.method === 'GET' && parts[2] === 'boilerplates') {
            const boilerplateMetaPath = projectPath
              ? join(projectPath, '.brewnet-boilerplate.json')
              : null;
            let boilerplates: unknown[] = [];
            if (boilerplateMetaPath && existsSync(boilerplateMetaPath)) {
              try {
                const raw = JSON.parse(readFileSync(boilerplateMetaPath, 'utf-8'));
                boilerplates = Array.isArray(raw) ? raw : [raw];
              } catch { /* ignore */ }
            }
            json(res, 200, { boilerplates });
            return;
          }

          // POST /api/apps/create
          if (req.method === 'POST' && parts[2] === 'create') {
            const opts = JSON.parse(body) as CreateAppOptions;
            const jobId = await createApp(opts);
            json(res, 202, { jobId });
            return;
          }

          // GET /api/apps/jobs/:jobId
          if (req.method === 'GET' && parts[2] === 'jobs' && parts[3]) {
            const job = getJobStatus(parts[3]);
            if (!job) { json(res, 404, { error: 'Job not found' }); return; }
            json(res, 200, job);
            return;
          }

          // POST /api/apps/:name/start
          if (req.method === 'POST' && parts[3] === 'start') {
            await startApp(parts[2]!);
            json(res, 200, { success: true });
            return;
          }

          // POST /api/apps/:name/stop
          if (req.method === 'POST' && parts[3] === 'stop') {
            await stopApp(parts[2]!);
            json(res, 200, { success: true });
            return;
          }

          // DELETE /api/apps/:name
          if (req.method === 'DELETE' && parts[2] && !parts[3]) {
            await appRemove(parts[2]);
            json(res, 200, { success: true });
            return;
          }
        }
```

> **Note:** `existsSync` and `readFileSync` are already imported at the top of admin-server.ts. `join` is also already imported.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @brewnet/cli exec tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Run existing admin-server tests to confirm nothing broken**

```bash
pnpm test tests/unit/cli/services/admin-server.test.ts 2>&1 | tail -15
```
Expected: same pass count as before.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/services/admin-server.ts
git commit -m "feat: add App Deploy button and /apps + /api/apps/* routes to admin-server"
```

---

### Task 10: Full test suite + manual smoke test

- [ ] **Step 1: Run all unit tests**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet
pnpm test 2>&1 | tail -20
```
Expected: no regressions. New tests pass.

- [ ] **Step 2: Build CLI**

```bash
pnpm --filter @brewnet/cli build 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test (requires running brewnet stack)**

```bash
# Start admin server on port 8088 (in dev)
# Open http://localhost:8088 → verify "🚀 App Deploy" button visible
# Click button → verify /apps page loads with correct dark theme
# Verify app table shows "No apps yet"
# Click "+ New App" → verify 3-tab modal opens
# Tab "Installed Boilerplate" → verify dropdown shows installed stacks from .brewnet-boilerplate.json
# Tab "Git URL" → verify URL + name + port fields visible
# Tab "New Project" → verify language grid (6 languages) visible
# Select language "Go" → verify framework dropdown appears, port auto-fills to 8080
# Click Cancel → modal closes
# Open browser DevTools → GET /api/apps/boilerplates → verify returns boilerplates array
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete app-deploy phase 1 — app creation with Gitea + Docker integration"
```

---

## Summary

| Task | Files | Coverage |
|------|-------|---------|
| 1 | `app-entry.ts` | Types only |
| 2 | `app-registry.ts` + test | 6 unit tests |
| 3 | `gitea-client.ts` + test | 5 unit tests |
| 4 | `app-manager.ts` skeleton | 3 unit tests |
| 5 | `app-manager.ts` Mode A | 2 unit tests |
| 6 | `app-manager.ts` Mode B | 1 unit test |
| 7 | `app-manager.ts` Mode C + start/stop | 3 unit tests |
| 8 | `apps-page.ts` | TypeScript compile check |
| 9 | `admin-server.ts` | Existing test regression check |
| 10 | — | Full suite + smoke test |

**Phase 2 (next):** Gitea Webhook registration → `POST /api/deploy/hook` → auto-deploy pipeline → real-time log streaming → deploy history.
