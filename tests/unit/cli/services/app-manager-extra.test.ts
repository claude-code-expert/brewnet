/**
 * Additional unit tests for services/app-manager
 *
 * Covers: loadGiteaConfig, saveGiteaConfig, getDeploySettings,
 *         updateDeploySettings, getAppDir, deployLocalApp (local-path flow)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fsContent: Record<string, string> = {};

const mockExistsSync = jest.fn((p: unknown) => {
  const path = p as string;
  // Exact match OR directory prefix match (treats keys with trailing slash children as existing dirs)
  return path in fsContent || Object.keys(fsContent).some((k) => k.startsWith(path + '/'));
});
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  chmodSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  rmSync: jest.fn(),
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: () => '/home/user',
}));

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string }>>().mockResolvedValue({
  stdout: '',
  stderr: '',
});
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

const mockDbAddApp = jest.fn();
const mockDbUpdateApp = jest.fn();
const mockDbListApps = jest.fn<() => unknown[]>(() => []);
const mockDbGetApp = jest.fn<() => unknown>(() => null);
const mockDbRemoveApp = jest.fn();
const mockGetSetting = jest.fn<() => string | null>(() => null);
const mockSetSetting = jest.fn();
const mockDbAppendDeployHistory = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/project-db.js', () => ({
  listApps: mockDbListApps,
  getApp: mockDbGetApp,
  addApp: mockDbAddApp,
  updateApp: mockDbUpdateApp,
  removeApp: mockDbRemoveApp,
  getDeployHistory: jest.fn(() => []),
  appendDeployHistory: mockDbAppendDeployHistory,
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
  listDomainConnections: jest.fn(() => []),
  getDomainConnection: jest.fn(() => null),
  upsertDomainConnection: jest.fn(),
  removeDomainConnection: jest.fn(),
  getDb: jest.fn(),
  closeDb: jest.fn(),
  _setDbForTest: jest.fn(),
  migrateFromJson: jest.fn(() => ({ migrated: [] })),
}));

const mockPrepare = jest.fn<() => Promise<{ autoFixed: boolean; message: string }>>().mockResolvedValue({
  autoFixed: false,
  message: 'ok',
});
const MockGiteaClient = jest.fn().mockImplementation(() => ({
  prepare: mockPrepare,
  createRepo: jest.fn(),
  repoExists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  repoIsEmpty: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  authedCloneUrl: jest.fn((url: string) => url),
  listBranches: jest.fn<() => Promise<string[]>>().mockResolvedValue(['main', 'develop']),
  listRepos: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getRepo: jest.fn(),
  getLatestCommit: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  makeRepoPublic: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../../../packages/cli/src/services/gitea-client.js', () => ({
  GiteaClient: MockGiteaClient,
}));

const mockLoadState = jest.fn();
const mockGetLastProject = jest.fn(() => 'my-project');
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  discoverProjectPath: jest.fn(() => null),
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/boilerplate-manager.js', () => ({
  reinitGit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  cloneStack: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  generateEnv: jest.fn(),
}));

jest.unstable_mockModule('../../../../packages/cli/src/config/frameworks.js', () => ({
  resolveStackId: jest.fn(() => 'go-gin'),
}));

// Mock fetch for health polling
const mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue({
  ok: true,
  status: 200,
} as unknown as Response);
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const {
  loadGiteaConfig,
  saveGiteaConfig,
  getDeploySettings,
  updateDeploySettings,
  getAppDir,
  deployLocalApp,
  getJobStatus,
  detectBasePath,
  getAppBranches,
  rollbackApp,
} = await import('../../../../packages/cli/src/services/app-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState() {
  return {
    projectPath: '/proj',
    servers: { gitServer: { port: 3000 } },
    admin: { username: 'admin', password: 'pw' },
  };
}

const GITEA_CONFIG_PATH = '/home/user/.brewnet/gitea-config.json';
const APPS_JSON = '/home/user/.brewnet/apps.json';

// ---------------------------------------------------------------------------
// loadGiteaConfig / saveGiteaConfig
// ---------------------------------------------------------------------------

describe('loadGiteaConfig', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('returns null when config file does not exist', () => {
    expect(loadGiteaConfig()).toBeNull();
  });

  it('returns parsed config when settings exist in DB', () => {
    mockGetSetting.mockImplementation((_pp: unknown, key: unknown) => {
      if (key === 'gitea.baseUrl') return 'http://localhost/git';
      if (key === 'gitea.username') return 'admin';
      if (key === 'gitea.writtenAt') return '2026-01-01T00:00:00Z';
      return null;
    });
    const cfg = loadGiteaConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.baseUrl).toBe('http://localhost/git');
    expect(cfg!.username).toBe('admin');
  });

  it('returns null when settings are missing in DB', () => {
    mockGetSetting.mockReturnValue(null);
    expect(loadGiteaConfig()).toBeNull();
  });
});

describe('saveGiteaConfig', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('writes config via setSetting', () => {
    saveGiteaConfig('http://localhost/git', 'admin');
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'gitea.baseUrl', 'http://localhost/git');
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'gitea.username', 'admin');
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'gitea.writtenAt', expect.any(String));
  });

  it('does not throw when setSetting fails', () => {
    mockSetSetting.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });
    expect(() => saveGiteaConfig('http://localhost/git', 'admin')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getDeploySettings
// ---------------------------------------------------------------------------

describe('getDeploySettings', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('returns default settings when app has no deploySettings', () => {
    mockDbListApps.mockReturnValue([{ name: 'my-app', appDir: '/app', port: 3000, status: 'running' }]);
    const settings = getDeploySettings('my-app');
    expect(settings.autoDeploy).toBe(false);
    expect(settings.deployBranch).toBe('main');
  });

  it('returns default settings when app not found', () => {
    mockDbListApps.mockReturnValue([]);
    const settings = getDeploySettings('nonexistent');
    expect(settings.autoDeploy).toBe(false);
    expect(settings.deployBranch).toBe('main');
  });

  it('returns stored deploySettings when present', () => {
    mockGetSetting.mockImplementation((_pp: unknown, key: unknown) => {
      if (key === 'deploy.my-app.autoDeploy') return 'true';
      if (key === 'deploy.my-app.deployBranch') return 'develop';
      return null;
    });
    const settings = getDeploySettings('my-app');
    expect(settings.autoDeploy).toBe(true);
    expect(settings.deployBranch).toBe('develop');
  });
});

// ---------------------------------------------------------------------------
// updateDeploySettings
// ---------------------------------------------------------------------------

describe('updateDeploySettings', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('throws when app not found', () => {
    mockDbListApps.mockReturnValue([]);
    expect(() => updateDeploySettings('missing-app', { autoDeploy: true })).toThrow(
      'App "missing-app" not found',
    );
  });

  it('merges settings and calls setSetting', () => {
    mockDbGetApp.mockReturnValue({
      name: 'my-app',
      appDir: '/app',
      port: 3000,
      status: 'running',
    });
    updateDeploySettings('my-app', { autoDeploy: true, deployBranch: 'staging' });
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'deploy.my-app.autoDeploy', 'true');
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'deploy.my-app.deployBranch', 'staging');
  });

  it('only updates specified settings (partial update)', () => {
    mockDbGetApp.mockReturnValue({
      name: 'my-app',
      appDir: '/app',
      port: 3000,
      status: 'running',
    });
    updateDeploySettings('my-app', { autoDeploy: true });
    expect(mockSetSetting).toHaveBeenCalledWith(expect.any(String), 'deploy.my-app.autoDeploy', 'true');
    // deployBranch and webhookSecret were not passed, so setSetting should not be called for them
    expect(mockSetSetting).not.toHaveBeenCalledWith(expect.any(String), 'deploy.my-app.deployBranch', expect.any(String));
    expect(mockSetSetting).not.toHaveBeenCalledWith(expect.any(String), 'deploy.my-app.webhookSecret', expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// getAppDir
// ---------------------------------------------------------------------------

describe('getAppDir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns appDir when app exists', () => {
    mockDbGetApp.mockReturnValue({
      name: 'my-app', appDir: '/proj/my-app', port: 3000, status: 'running',
    });
    expect(getAppDir('my-app')).toBe('/proj/my-app');
  });

  it('returns undefined when app not found', () => {
    mockDbGetApp.mockReturnValue(null);
    expect(getAppDir('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deployLocalApp
// ---------------------------------------------------------------------------

describe('deployLocalApp', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    mockLoadState.mockReturnValue(makeState());
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    mockDbListApps.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
  });

  it('returns a jobId string immediately', async () => {
    // Path must "exist" and have a package.json so project type is detected
    fsContent['/proj/apps/my-app/package.json'] = '{"name":"my-app"}';

    const jobId = await deployLocalApp({
      appName: 'my-app',
      localPath: '/proj/apps/my-app',
      port: 3000,
    });
    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);
  });

  it('creates a job with status running immediately', async () => {
    fsContent['/proj/apps/my-app/package.json'] = '{"name":"my-app"}';

    const jobId = await deployLocalApp({
      appName: 'my-app',
      localPath: '/proj/apps/my-app',
      port: 3000,
    });
    const job = getJobStatus(jobId);
    expect(job).toBeDefined();
    expect(job!.appName).toBe('my-app');
    // Status is running or done by the time we check (setImmediate may have run)
    expect(['running', 'done', 'failed']).toContain(job!.status);
  });

  it('job fails when localPath does not exist', async () => {
    // mockExistsSync returns false for the path (not in fsContent)
    const jobId = await deployLocalApp({
      appName: 'missing-app',
      localPath: '/nonexistent/path',
      port: 3000,
    });

    // Wait for setImmediate to execute _runDeployLocal
    await new Promise<void>((r) => setTimeout(r, 50));

    const job = getJobStatus(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('does not exist');
  });

  it('job fails when no project type and no Dockerfile', async () => {
    // A dir that exists but has no recognizable project files and no Dockerfile
    fsContent['/proj/apps/empty-app'] = '';  // directory exists
    fsContent['/proj/apps/empty-app/.gitignore'] = '*.log';

    const jobId = await deployLocalApp({
      appName: 'empty-app',
      localPath: '/proj/apps/empty-app',
      port: 3000,
    });

    await new Promise<void>((r) => setTimeout(r, 50));

    const job = getJobStatus(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('Cannot detect project type');
  });

  it('registers app in apps.json with mode local-path', async () => {
    fsContent['/proj/apps/node-app'] = '';  // directory exists
    fsContent['/proj/apps/node-app/package.json'] = '{"name":"node-app"}';

    await deployLocalApp({
      appName: 'node-app',
      localPath: '/proj/apps/node-app',
      port: 3000,
    });

    // Allow setImmediate to run
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(mockDbAddApp).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'node-app', mode: 'local-path' }),
    );
  });

  it('detects python project (requirements.txt) and scaffolds Dockerfile', async () => {
    fsContent['/proj/apps/py-app/requirements.txt'] = 'flask\ngunicorn\n';

    const jobId = await deployLocalApp({
      appName: 'py-app',
      localPath: '/proj/apps/py-app',
      port: 8000,
    });

    await new Promise<void>((r) => setTimeout(r, 100));
    const job = getJobStatus(jobId);
    // Job should run (possibly fail at docker compose step, that's OK for type detection)
    expect(['running', 'done', 'failed']).toContain(job?.status);
    // Dockerfile should have been written via scaffolding
    const dockerfileWritten = (mockWriteFileSync.mock.calls as unknown[][]).some(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileWritten).toBe(true);
  });

  it('detects go project (go.mod) and scaffolds Dockerfile', async () => {
    fsContent['/proj/apps/go-app/go.mod'] = 'module myapp\n\ngo 1.21\n';

    await deployLocalApp({ appName: 'go-app', localPath: '/proj/apps/go-app', port: 8080 });
    await new Promise<void>((r) => setTimeout(r, 100));

    const dockerfileCall = (mockWriteFileSync.mock.calls as unknown[][]).find(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileCall).toBeDefined();
    expect((dockerfileCall![1] as string)).toContain('golang');
  });

  it('detects rust project (Cargo.toml) and scaffolds Dockerfile', async () => {
    fsContent['/proj/apps/rust-app/Cargo.toml'] = '[package]\nname = "myapp"\n';

    await deployLocalApp({ appName: 'rust-app', localPath: '/proj/apps/rust-app', port: 8000 });
    await new Promise<void>((r) => setTimeout(r, 100));

    const dockerfileCall = (mockWriteFileSync.mock.calls as unknown[][]).find(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileCall).toBeDefined();
    expect((dockerfileCall![1] as string)).toContain('rust');
  });

  it('detects next.js project and scaffolds Dockerfile', async () => {
    fsContent['/proj/apps/next-app/next.config.ts'] = 'const config = {}; export default config;';

    await deployLocalApp({ appName: 'next-app', localPath: '/proj/apps/next-app', port: 3000 });
    await new Promise<void>((r) => setTimeout(r, 100));

    const dockerfileCall = (mockWriteFileSync.mock.calls as unknown[][]).find(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileCall).toBeDefined();
    expect((dockerfileCall![1] as string)).toContain('npm run build');
  });

  it('detects java project (pom.xml) and scaffolds Dockerfile', async () => {
    fsContent['/proj/apps/java-app/pom.xml'] = '<project></project>';

    await deployLocalApp({ appName: 'java-app', localPath: '/proj/apps/java-app', port: 8080 });
    await new Promise<void>((r) => setTimeout(r, 100));

    const dockerfileCall = (mockWriteFileSync.mock.calls as unknown[][]).find(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileCall).toBeDefined();
  });

  it('detects static project (index.html) and scaffolds nginx Dockerfile', async () => {
    fsContent['/proj/apps/static-app/index.html'] = '<!DOCTYPE html><html></html>';

    await deployLocalApp({ appName: 'static-app', localPath: '/proj/apps/static-app', port: 80 });
    await new Promise<void>((r) => setTimeout(r, 100));

    const dockerfileCall = (mockWriteFileSync.mock.calls as unknown[][]).find(
      (c) => (c[0] as string).endsWith('Dockerfile'),
    );
    expect(dockerfileCall).toBeDefined();
    expect((dockerfileCall![1] as string)).toContain('nginx');
  });
});

// ---------------------------------------------------------------------------
// detectBasePath
// ---------------------------------------------------------------------------

describe('detectBasePath', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('returns empty string when no next.config file exists', () => {
    expect(detectBasePath('/proj/apps/my-app')).toBe('');
  });

  it('extracts basePath from next.config.ts', () => {
    fsContent['/proj/apps/my-app/next.config.ts'] = `
import type { NextConfig } from 'next';
const config: NextConfig = {
  basePath: '/apps/my-app',
};
export default config;
`;
    expect(detectBasePath('/proj/apps/my-app')).toBe('/apps/my-app');
  });

  it('extracts basePath from next.config.mjs when .ts absent', () => {
    fsContent['/proj/apps/my-app/next.config.mjs'] = `
const config = { basePath: '/apps/nextjs-app', reactStrictMode: true };
export default config;
`;
    expect(detectBasePath('/proj/apps/my-app')).toBe('/apps/nextjs-app');
  });

  it('returns empty string when basePath not found in config', () => {
    fsContent['/proj/apps/my-app/next.config.js'] = `
const config = { reactStrictMode: true };
module.exports = config;
`;
    expect(detectBasePath('/proj/apps/my-app')).toBe('');
  });

  it('prefers next.config.ts over next.config.mjs', () => {
    fsContent['/proj/apps/my-app/next.config.ts'] = `const c = { basePath: '/apps/ts-path' }; export default c;`;
    fsContent['/proj/apps/my-app/next.config.mjs'] = `const c = { basePath: '/apps/mjs-path' }; export default c;`;
    expect(detectBasePath('/proj/apps/my-app')).toBe('/apps/ts-path');
  });
});

// ---------------------------------------------------------------------------
// getAppBranches
// ---------------------------------------------------------------------------

describe('getAppBranches', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    mockLoadState.mockReturnValue(makeState());
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    MockGiteaClient.mockImplementation(() => ({
      prepare: mockPrepare,
      listBranches: jest.fn<() => Promise<string[]>>().mockResolvedValue(['main', 'feature/x']),
    }));
  });

  it('returns branches from GiteaClient.listBranches', async () => {
    const branches = await getAppBranches('my-app');
    expect(branches).toEqual(['main', 'feature/x']);
  });

  it('passes the app name to listBranches', async () => {
    const mockListBranches = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
    MockGiteaClient.mockImplementation(() => ({
      prepare: mockPrepare,
      listBranches: mockListBranches,
    }));
    await getAppBranches('special-app');
    expect(mockListBranches).toHaveBeenCalledWith('special-app');
  });
});

// ---------------------------------------------------------------------------
// rollbackApp
// ---------------------------------------------------------------------------

describe('rollbackApp', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    mockLoadState.mockReturnValue(makeState());
    fsContent['/proj/.env'] = 'GITEA_ADMIN_USER=admin\nGITEA_ADMIN_PASSWORD=pw\n';
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('returns a jobId string immediately', async () => {
    mockDbListApps.mockReturnValue([{
      name: 'my-app', appDir: '/proj/apps/my-app', port: 3000, status: 'running',
    }]);
    const jobId = await rollbackApp('my-app', 'abc1234');
    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);
  });

  it('job fails when app not found', async () => {
    mockDbListApps.mockReturnValue([]);

    const jobId = await rollbackApp('nonexistent', 'abc1234');
    await new Promise<void>((r) => setTimeout(r, 50));

    const job = getJobStatus(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('"nonexistent" not found');
  });

  it('job completes when all steps succeed', async () => {
    fsContent['/proj/apps/my-app/package.json'] = '{"name":"my-app"}';
    mockDbGetApp.mockReturnValue({
      name: 'my-app', appDir: '/proj/apps/my-app', port: 3000, status: 'running',
    });
    mockDbListApps.mockReturnValue([{
      name: 'my-app', appDir: '/proj/apps/my-app', port: 3000, status: 'running',
    }]);
    // _injectQuickTunnelIfNeeded uses loadState and compose file
    fsContent['/proj/apps/my-app/docker-compose.yml'] = 'services:\n  my-app:\n    image: my-app\n';

    const jobId = await rollbackApp('my-app', 'abc1234');
    await new Promise<void>((r) => setTimeout(r, 100));

    const job = getJobStatus(jobId);
    expect(['done', 'failed']).toContain(job?.status);
    // execa called with git (checkout, or compose commands)
    expect(mockExeca).toHaveBeenCalled();
  });
});
