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
  readdirSync: jest.fn(() => []),
  rmSync: jest.fn(),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListRepos = jest.fn<(...args: any[]) => Promise<unknown[]>>();
const mockPrepare = jest.fn<() => Promise<{ autoFixed: boolean; message: string }>>().mockResolvedValue({ autoFixed: false, message: 'token cached' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetRepo = jest.fn<(...args: any[]) => Promise<unknown>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetLatestCommit = jest.fn<(...args: any[]) => Promise<unknown>>().mockResolvedValue(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMakeRepoPublic = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRepoIsEmpty = jest.fn<(...args: any[]) => Promise<boolean>>().mockResolvedValue(false);
const MockGiteaClient = jest.fn().mockImplementation(() => ({
  createRepo: mockCreateRepo,
  repoExists: mockRepoExists,
  repoIsEmpty: mockRepoIsEmpty,
  authedCloneUrl: mockAuthedCloneUrl,
  listRepos: mockListRepos,
  prepare: mockPrepare,
  getRepo: mockGetRepo,
  getLatestCommit: mockGetLatestCommit,
  makeRepoPublic: mockMakeRepoPublic,
}));
jest.unstable_mockModule('../../../../packages/cli/src/services/gitea-client.js', () => ({
  GiteaClient: MockGiteaClient,
}));

// Mock app-registry
const mockAddApp = jest.fn();
const mockUpdateApp = jest.fn();
const mockReadApps = jest.fn<() => unknown[]>(() => []);
const mockRemoveApp = jest.fn();
const mockReadDeployHistory = jest.fn<() => unknown[]>(() => []);
jest.unstable_mockModule('../../../../packages/cli/src/services/app-registry.js', () => ({
  addApp: mockAddApp,
  updateApp: mockUpdateApp,
  readApps: mockReadApps,
  removeApp: mockRemoveApp,
  writeApps: jest.fn(),
  readDeployHistory: mockReadDeployHistory,
  appendDeployHistory: jest.fn(),
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

const { readDotEnvValue, resolveAppsJsonPath, listApps, getDeployHistory, listGiteaRepos } = await import(
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
    // assertComposeFile() requires docker-compose.yml in the app dir
    fsContent['/proj/nodejs-nextjs-full/docker-compose.yml'] = 'version: "3"';

    mockCreateRepo.mockResolvedValue('http://localhost:3000/admin/my-app.git');
    mockRepoExists.mockResolvedValue(false);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

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
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const { createApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await createApp({
      mode: 'git-clone',
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
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

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

describe('getDeployHistory', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('returns empty array when no history exists', () => {
    mockReadDeployHistory.mockReturnValue([]);
    expect(getDeployHistory()).toEqual([]);
  });

  it('returns all entries when no appName filter given', () => {
    const entries = [
      { appName: 'app-a', commitHash: 'abc', commitMessage: 'fix', status: 'success', deployedAt: '2026-01-01T00:00:00Z' },
      { appName: 'app-b', commitHash: 'def', commitMessage: 'feat', status: 'failed', deployedAt: '2026-01-02T00:00:00Z' },
    ];
    mockReadDeployHistory.mockReturnValue(entries);
    expect(getDeployHistory()).toHaveLength(2);
  });

  it('filters entries by appName when provided', () => {
    const entries = [
      { appName: 'app-a', commitHash: 'abc', commitMessage: 'fix', status: 'success', deployedAt: '2026-01-01T00:00:00Z' },
      { appName: 'app-b', commitHash: 'def', commitMessage: 'feat', status: 'failed', deployedAt: '2026-01-02T00:00:00Z' },
    ];
    mockReadDeployHistory.mockReturnValue(entries);
    const result = getDeployHistory('app-a');
    expect(result).toHaveLength(1);
    expect(result[0]!.appName).toBe('app-a');
  });
});

describe('listGiteaRepos', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('calls GiteaClient.listRepos and returns results', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    const fakeRepos = [
      { id: 1, name: 'test-repo', clone_url: 'http://localhost/git/admin/test-repo.git',
        html_url: 'http://localhost/git/admin/test-repo', description: '', private: true },
    ];
    mockListRepos.mockResolvedValue(fakeRepos);
    const repos = await listGiteaRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('test-repo');
    expect(mockListRepos).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from GiteaClient.listRepos', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      admin: { username: 'admin', password: 'pw' },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    mockListRepos.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(listGiteaRepos()).rejects.toThrow('ECONNREFUSED');
  });
});

describe('getAppGitInfo', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    mockReadApps.mockReturnValue([{
      name: 'my-app', appDir: '/proj/my-app', port: 3000, status: 'running',
    }]);
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('constructs correct giteaUrl for quick tunnel mode', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
      domain: { cloudflare: { tunnelMode: 'quick' } },
    });
    mockGetRepo.mockResolvedValue({
      id: 1, name: 'my-app', clone_url: 'http://localhost/git/admin/my-app.git',
      ssh_url: 'ssh://git@localhost:2222/admin/my-app.git',
      html_url: 'http://localhost/git/admin/my-app',
      description: '', private: false, default_branch: 'main',
    });
    const { getAppGitInfo } = await import('../../../../packages/cli/src/services/app-manager.js');
    const info = await getAppGitInfo('my-app');
    expect(info.giteaUrl).toBe('http://localhost/git/admin/my-app');
    expect(info.branch).toBe('main');
    expect(mockMakeRepoPublic).not.toHaveBeenCalled();
  });

  it('calls makeRepoPublic when repo is private', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
      domain: { cloudflare: { tunnelMode: 'quick' } },
    });
    mockGetRepo.mockResolvedValue({
      id: 1, name: 'my-app', clone_url: 'http://localhost/git/admin/my-app.git',
      ssh_url: 'ssh://git@localhost:2222/admin/my-app.git',
      html_url: 'http://localhost/git/admin/my-app',
      description: '', private: true, default_branch: 'main',
    });
    const { getAppGitInfo } = await import('../../../../packages/cli/src/services/app-manager.js');
    await getAppGitInfo('my-app');
    expect(mockMakeRepoPublic).toHaveBeenCalledWith('my-app');
  });

  it('returns partial info (branch=main, latestCommit=null) when Gitea is unreachable', async () => {
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
      domain: { cloudflare: { tunnelMode: '' } },
    });
    mockGetRepo.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { getAppGitInfo } = await import('../../../../packages/cli/src/services/app-manager.js');
    const info = await getAppGitInfo('my-app');
    expect(info.giteaUrl).toContain('my-app');
    expect(info.branch).toBe('main');
    expect(info.latestCommit).toBeNull();
  });
});

describe('deployApp', () => {
  function setupDeploy() {
    fsContent = {};
    jest.clearAllMocks();
    mockLoadState.mockReturnValue({
      projectPath: '/proj',
      servers: { gitServer: { port: 3000 } },
      admin: { username: 'admin', password: 'pw' },
      domain: { cloudflare: { tunnelMode: '' } },
    });
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    mockReadApps.mockReturnValue([{
      name: 'nodejs-express', appDir: '/proj/nodejs-express', port: 3000, status: 'running',
    }]);
    fsContent['/proj/nodejs-express'] = '';
    fsContent['/proj/nodejs-express/docker-compose.yml'] = 'version: "3"';
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as never);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
  }

  async function waitForJob(jobId: string, getJobStatus: (id: string) => unknown) {
    for (let i = 0; i < 50; i++) {
      const j = getJobStatus(jobId) as { status: string } | undefined;
      if (j && j.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('when Gitea repo is missing: recreates repo, sets remote, pushes, then starts docker', async () => {
    setupDeploy();
    mockRepoExists.mockResolvedValue(false);
    mockCreateRepo.mockResolvedValue('http://localhost:3000/admin/nodejs-express.git');
    const { deployApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await deployApp('nodejs-express');
    await waitForJob(jobId, getJobStatus);

    const job = getJobStatus(jobId) as { status: string; logs?: string[] };
    expect(job.status).toBe('done');
    expect(mockCreateRepo).toHaveBeenCalledWith('nodejs-express', expect.any(String));
    const pushCalls = (mockExeca.mock.calls as unknown[][]).filter(
      (c) => (c[1] as string[])?.includes('push'),
    );
    expect(pushCalls.length).toBeGreaterThan(0);
    expect(job.logs?.some((l) => l.includes('recreated'))).toBe(true);
  });

  it('when Gitea repo exists: pulls from brewnet remote and starts docker', async () => {
    setupDeploy();
    mockRepoExists.mockResolvedValue(true);
    const { deployApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await deployApp('nodejs-express');
    await waitForJob(jobId, getJobStatus);

    const job = getJobStatus(jobId) as { status: string };
    expect(job.status).toBe('done');
    expect(mockCreateRepo).not.toHaveBeenCalled();
    const pullCalls = (mockExeca.mock.calls as unknown[][]).filter(
      (c) => (c[1] as string[])?.includes('pull'),
    );
    expect(pullCalls.length).toBeGreaterThan(0);
  });

  it('when Gitea is unreachable: logs warning and continues with docker up', async () => {
    setupDeploy();
    mockRepoExists.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { deployApp, getJobStatus } = await import('../../../../packages/cli/src/services/app-manager.js');
    const jobId = await deployApp('nodejs-express');
    await waitForJob(jobId, getJobStatus);

    const job = getJobStatus(jobId) as { status: string; logs?: string[] };
    // docker up should still proceed
    expect(job.status).toBe('done');
    expect(job.logs?.some((l) => l.includes('failed'))).toBe(true);
  });
});

describe('startApp / stopApp', () => {
  it('runs docker compose up and updates status', async () => {
    mockReadApps.mockReturnValue([{ name: 'my-app', appDir: '/dir', status: 'stopped' }]);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { startApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await startApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'up', '-d'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'running' });
  });

  it('runs docker compose down and updates status', async () => {
    mockReadApps.mockReturnValue([{ name: 'my-app', appDir: '/dir', status: 'running' }]);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { stopApp } = await import('../../../../packages/cli/src/services/app-manager.js');
    await stopApp('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['compose', 'down'], expect.objectContaining({ cwd: '/dir' }));
    expect(mockUpdateApp).toHaveBeenCalledWith(expect.any(String), 'my-app', { status: 'stopped' });
  });
});
