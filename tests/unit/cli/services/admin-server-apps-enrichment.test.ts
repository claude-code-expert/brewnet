/**
 * Unit tests for /api/apps enrichment logic in admin-server.ts
 *
 * Specifically tests the Named Tunnel / Quick Tunnel URL lifecycle:
 * - When tunnelMode === 'named', qt must be empty → externalUrl = null
 * - When tunnelMode === 'named' and no domain connection → domainRequired = true
 * - When tunnelMode === 'quick' with quickTunnelUrl → externalUrl is set
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

const mockListContainers = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn(() => ({
    listContainers: mockListContainers,
    getContainer: jest.fn().mockReturnValue({
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop:  jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }),
  })),
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/service-manager.js', () => ({
  addService:    jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  removeService: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 }),
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/backup-manager.js', () => ({
  createBackup: jest.fn<() => { id: string }>(() => ({ id: 'backup-001' })),
  listBackups:  jest.fn<() => unknown[]>(() => []),
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  discoverProjectPath: jest.fn(() => '/tmp/test-apps-enrichment'),
  getLastProject:     jest.fn(() => null),
  loadState:          jest.fn(() => null),
  createState:        jest.fn(),
  saveState:          jest.fn(),
  hasResumeState:     jest.fn(() => false),
  getProjectDir:      jest.fn((name: string) => `/tmp/.brewnet/projects/${name}`),
}));

jest.unstable_mockModule('../../../../packages/cli/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Accessible mock references for project-db
const mockListApps      = jest.fn<() => unknown[]>(() => []);
const mockGetSetting    = jest.fn<(path: string, key: string) => string | null>(() => null);
const mockGetDomainConn = jest.fn<() => unknown>(() => null);
const mockGetDeployHist = jest.fn<() => unknown[]>(() => []);

jest.unstable_mockModule('../../../../packages/cli/src/services/project-db.js', () => ({
  listApps:               mockListApps,
  getApp:                 jest.fn(() => null),
  addApp:                 jest.fn(),
  updateApp:              jest.fn(),
  removeApp:              jest.fn(),
  listDomainConnections:  jest.fn(() => []),
  getDomainConnection:    mockGetDomainConn,
  upsertDomainConnection: jest.fn(),
  removeDomainConnection: jest.fn(),
  getDeployHistory:       mockGetDeployHist,
  appendDeployHistory:    jest.fn(),
  getSetting:             mockGetSetting,
  setSetting:             jest.fn(),
  getSettings:            jest.fn<() => Record<string, string>>(() => ({})),
  setSettings:            jest.fn(),
  getDb:                  jest.fn(),
  closeDb:                jest.fn(),
  _setDbForTest:          jest.fn(),
  migrateFromJson:        jest.fn(() => ({ migrated: [] })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { createAdminServer } = await import(
  '../../../../packages/cli/src/services/admin-server.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_PASSWORD = 'test-enrichment-pw';
const PROJECT_PATH   = '/tmp/test-apps-enrichment';

let serverPort: number;
let stopServer: () => Promise<void>;

async function apiApps(): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/apps',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> }));
    });
    r.on('error', reject);
    r.end();
  });
}

// A minimal AppEntry shape matching the DB record expected by app-manager.listApps
function makeApp(name = 'myapp') {
  return {
    name,
    mode: 'git-clone' as const,
    appDir: `/tmp/apps/${name}`,
    port: 3000,
    status: 'running' as const,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const instance = createAdminServer({
    port: 0,
    projectPath: PROJECT_PATH,
    adminPassword: ADMIN_PASSWORD,
  });
  await instance.start();
  serverPort = (instance.server.address() as AddressInfo).port;
  stopServer = instance.stop;
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListApps.mockReturnValue([]);
  mockGetSetting.mockReturnValue(null);
  mockGetDomainConn.mockReturnValue(null);
  mockGetDeployHist.mockReturnValue([]);
});

/** Helper to configure getSetting responses by key */
function setupTunnel(mode: string, quickTunnelUrl?: string) {
  mockGetSetting.mockImplementation((_path: string, key: string) => {
    if (key === 'cf.tunnelMode')    return mode;
    if (key === 'cf.quickTunnelUrl') return quickTunnelUrl ?? null;
    return null;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/apps — externalUrl enrichment based on tunnelMode', () => {
  it('named tunnel + no domain connection → externalUrl=null, domainRequired=true', async () => {
    setupTunnel('named', 'https://abc-def.trycloudflare.com');
    mockListApps.mockReturnValue([makeApp('myapp')]);
    mockGetDomainConn.mockReturnValue(null);

    const { status, body } = await apiApps();
    expect(status).toBe(200);

    const apps = (body as { apps: unknown[] }).apps;
    expect(apps).toHaveLength(1);
    const app = apps[0] as Record<string, unknown>;
    expect(app.externalUrl).toBeNull();
    expect(app.domainRequired).toBe(true);
  });

  it('named tunnel + domain connection exists → externalUrl set, domainRequired=false', async () => {
    setupTunnel('named', 'https://abc-def.trycloudflare.com');
    mockListApps.mockReturnValue([makeApp('myapp')]);
    mockGetDomainConn.mockReturnValue({ appName: 'myapp', hostname: 'myapp.example.com' });

    const { status, body } = await apiApps();
    expect(status).toBe(200);

    const apps = (body as { apps: unknown[] }).apps;
    expect(apps).toHaveLength(1);
    const app = apps[0] as Record<string, unknown>;
    expect(app.externalUrl).toBe('https://myapp.example.com');
    expect(app.domainRequired).toBe(false);
  });

  it('quick tunnel mode + no domain connection → externalUrl set to qt URL, domainRequired=false', async () => {
    setupTunnel('quick', 'https://abc-def.trycloudflare.com');
    mockListApps.mockReturnValue([makeApp('myapp')]);
    mockGetDomainConn.mockReturnValue(null);

    const { status, body } = await apiApps();
    expect(status).toBe(200);

    const apps = (body as { apps: unknown[] }).apps;
    expect(apps).toHaveLength(1);
    const app = apps[0] as Record<string, unknown>;
    expect(app.externalUrl).toBe('https://abc-def.trycloudflare.com/apps/myapp');
    expect(app.domainRequired).toBe(false);
  });

  it('tunnelMode=none + no quickTunnelUrl → externalUrl=null, domainRequired=false', async () => {
    setupTunnel('none');
    mockListApps.mockReturnValue([makeApp('myapp')]);
    mockGetDomainConn.mockReturnValue(null);

    const { status, body } = await apiApps();
    expect(status).toBe(200);

    const apps = (body as { apps: unknown[] }).apps;
    expect(apps).toHaveLength(1);
    const app = apps[0] as Record<string, unknown>;
    expect(app.externalUrl).toBeNull();
    expect(app.domainRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-unified boilerplate deduplication
// ---------------------------------------------------------------------------

describe('GET /api/apps — non-unified boilerplate deduplication', () => {
  const APP_DIR = '/tmp/test-dedup-app';

  beforeAll(() => {
    mkdirSync(APP_DIR, { recursive: true });
    mkdirSync(PROJECT_PATH, { recursive: true });
    // Provide FRONTEND_PORT so enrichment sets different frontend/backend ports
    writeFileSync(join(APP_DIR, '.env'), 'FRONTEND_PORT=3001\n');
    // Provide boilerplate meta so isNonUnified resolves to true
    writeFileSync(
      join(PROJECT_PATH, '.brewnet-boilerplate.json'),
      JSON.stringify([{ stackId: 'node-test', isUnified: false }]),
    );
  });

  afterAll(() => {
    rmSync(APP_DIR, { recursive: true, force: true });
    try { rmSync(join(PROJECT_PATH, '.brewnet-boilerplate.json')); } catch { /* ignore */ }
  });

  it('frontend sibling entry is hidden; combined entry exposes both localUrl and backendLocalUrl', async () => {
    setupTunnel('none');
    mockListApps.mockReturnValue([
      // Main boilerplate entry — backend port, non-unified stackId
      { name: 'node', mode: 'boilerplate' as const, stackId: 'node-test', appDir: APP_DIR, port: 3000, status: 'running' as const, createdAt: new Date().toISOString() },
      // Frontend sibling entry — same appDir, frontendPort
      { name: 'node', mode: 'boilerplate' as const, appDir: APP_DIR, port: 3001, status: 'running' as const, createdAt: new Date().toISOString() },
    ]);

    const { status, body } = await apiApps();
    expect(status).toBe(200);

    const apps = (body as { apps: unknown[] }).apps;
    expect(apps).toHaveLength(1);                                   // sibling hidden
    const app = apps[0] as Record<string, unknown>;
    expect(app.port).toBe(3000);                                    // main entry kept
    expect(app.localUrl).toBe('http://127.0.0.1:3001');             // frontend URL
    expect(app.backendLocalUrl).toBe('http://127.0.0.1:3000');      // backend URL
  });
});
