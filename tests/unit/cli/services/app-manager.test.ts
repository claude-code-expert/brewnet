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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExeca = jest.fn<(...args: any[]) => Promise<{ stdout: string; stderr: string }>>();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

// Mock GiteaClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateRepo = jest.fn<(...args: any[]) => Promise<string>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRepoExists = jest.fn<(...args: any[]) => Promise<boolean>>();
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
const mockReadApps = jest.fn<() => unknown[]>(() => []);
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
const mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
global.fetch = mockFetch as unknown as typeof fetch;

// Mock wizard state — must be declared BEFORE await import(app-manager.js)
// so the mock is registered before app-manager.ts loads state.js
const mockLoadState = jest.fn();
const mockGetLastProject = jest.fn(() => 'my-project');
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
}));

// Mock boilerplate-manager (used by Mode B and C for reinitGit / cloneStack)
const mockReinitGit = jest.fn<(...args: any[]) => Promise<void>>();
const mockCloneStack = jest.fn<(...args: any[]) => Promise<void>>();
const mockGenerateEnv = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/boilerplate-manager.js', () => ({
  reinitGit: mockReinitGit,
  cloneStack: mockCloneStack,
  generateEnv: mockGenerateEnv,
}));

// Mock frameworks.ts (resolveStackId) — must be before await import(app-manager.js)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveStackId = jest.fn<(...args: any[]) => string | null>(() => 'go-gin');
jest.unstable_mockModule('../../../../packages/cli/src/config/frameworks.js', () => ({
  resolveStackId: mockResolveStackId,
}));

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
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');

    const jobId = await createApp({
      mode: 'boilerplate',
      appName: 'my-app',
      stackId: 'nodejs-nextjs-full',
      port: 3000,
    });

    expect(typeof jobId).toBe('string');
    // Poll until job finishes (max 1000ms, 20ms interval — robust in CI)
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId);
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(mockCreateRepo).toHaveBeenCalledWith('my-app', expect.any(String));
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
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

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
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    const { startApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await startApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'up', '-d'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'running' });
  });

  it('runs docker compose down and updates status', async () => {
    mockReadApps.mockReturnValue([{ name: 'my-app', appDir: '/dir', status: 'running' }]);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    const { stopApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await stopApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'down'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'stopped' });
  });
});
