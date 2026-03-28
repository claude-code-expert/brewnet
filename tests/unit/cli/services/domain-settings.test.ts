/**
 * Unit tests for domain settings handlers in admin-server:
 *   - GET /api/cloudflare/zones  → handleCloudflareZones
 *   - POST /api/cloudflare/tunnel → handleCreateTunnel
 *
 * Uses actual HTTP server (port: 0) with mocked dependencies.
 * global.fetch is mocked to simulate Cloudflare API responses.
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Mock fetch (Cloudflare API calls)
// ---------------------------------------------------------------------------

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn(() => ({
    listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  })),
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/service-manager.js', () => ({
  addService: jest.fn(),
  removeService: jest.fn(),
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/backup-manager.js', () => ({
  createBackup: jest.fn(() => ({ id: 'backup-001' })),
  listBackups: jest.fn(() => []),
}));

const mockGetLastProject = jest.fn<() => string | null>(() => null);
const mockLoadState = jest.fn<() => WizardState | null>(() => null);
const mockSaveState = jest.fn<() => void>();

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  discoverProjectPath: jest.fn(() => null),
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
  saveState: mockSaveState,
  createState: jest.fn(),
  hasResumeState: jest.fn(() => false),
  getProjectDir: jest.fn((name: string) => `/tmp/test/${name}`),
}));

const mockDbListDomainConnections = jest.fn<() => unknown[]>(() => []);
jest.unstable_mockModule('../../../../packages/cli/src/services/project-db.js', () => ({
  listApps: jest.fn(() => []),
  getApp: jest.fn(() => null),
  addApp: jest.fn(),
  updateApp: jest.fn(),
  removeApp: jest.fn(),
  listDomainConnections: mockDbListDomainConnections,
  getDomainConnection: jest.fn(() => null),
  upsertDomainConnection: jest.fn(),
  removeDomainConnection: jest.fn(),
  getDeployHistory: jest.fn(() => []),
  appendDeployHistory: jest.fn(),
  getSetting: jest.fn(() => null),
  getSettings: jest.fn(() => ({})),
  setSettings: jest.fn(),
  setSetting: jest.fn(),
  getDb: jest.fn(),
  closeDb: jest.fn(),
  _setDbForTest: jest.fn(),
  migrateFromJson: jest.fn(() => ({ migrated: [] })),
}));

jest.unstable_mockModule('../../../../packages/cli/src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { createAdminServer } = await import(
  '../../../../packages/cli/src/services/admin-server.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let serverPort: number;
let stopServer: () => Promise<void>;
const ADMIN_PASSWORD = 'test-secret-pw';

function makeState(cfOverrides: Record<string, unknown> = {}): WizardState {
  const base = createDefaultWizardState();
  base.admin = { username: 'admin', password: ADMIN_PASSWORD, storage: 'local' };
  base.domain.cloudflare = {
    ...base.domain.cloudflare,
    apiToken: 'cf-test-token',
    accountId: 'acct-123',
    zoneId: 'zone-456',
    zoneName: 'example.com',
    ...cfOverrides,
  };
  return base;
}

async function req(
  method: string,
  path: string,
  opts: { body?: unknown; auth?: boolean } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { body, auth = true } = opts;
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { 'x-admin-password': ADMIN_PASSWORD } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* empty */ }
        resolve({ status: res.statusCode ?? 0, data });
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function makeStateWithConnections(connections: { appName: string; subdomain: string; domain: string }[]): WizardState {
  const base = makeState();
  const mapped = connections.map((c) => ({
    ...c,
    hostname: `${c.subdomain}.${c.domain}`,
    tunnelId: 'tunnel-test',
    cnameRecordId: 'rec-test',
    containerPort: 3000,
    connectedAt: new Date().toISOString(),
    scenario: 'cloudflare_tunnel' as const,
  }));
  base.domainConnections = mapped;
  // Also set up DB mock so admin-server reads connections from DB
  mockDbListDomainConnections.mockReturnValue(mapped);
  return base;
}

function makeCfZonesResponse(zones: unknown[], ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve({ success: ok, result: zones }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Server created without state — each test sets state via mockGetLastProject/mockLoadState
  const instance = createAdminServer({ port: 0, projectPath: '/tmp/domain-test' });
  await instance.start();
  serverPort = (instance.server.address() as AddressInfo).port;
  stopServer = instance.stop;
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  // Default: no project loaded → wizardState = null
  mockGetLastProject.mockReturnValue(null);
  mockLoadState.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// GET /api/cloudflare/zones — handleCloudflareZones
// ---------------------------------------------------------------------------

describe('GET /api/cloudflare/zones', () => {
  it('requires auth — returns 401 without header', async () => {
    const { status } = await req('GET', '/api/cloudflare/zones', { auth: false });
    expect(status).toBe(401);
  });

  it('returns 401 when no wizard state (admin password not configured)', async () => {
    // With no wizardState, checkAdminAuth fails before handler logic
    const { status, data } = await req('GET', '/api/cloudflare/zones');
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns NO_TOKEN when apiToken is empty but state exists', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState({ apiToken: '' }));
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test-no-token' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/zones', method: 'GET',
          headers: { 'x-admin-password': ADMIN_PASSWORD } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('NO_TOKEN');
    expect(res.data.success).toBe(false);
  });

  it('returns TOKEN_INVALID when CF API fetch throws', async () => {
    // Spin up a server with CF token set
    const stateWithToken = makeState();
    const inst2 = createAdminServer({ port: 0, projectPath: '/tmp/test2' });
    // Patch wizardState via module mock before the server reads it
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(stateWithToken);
    const inst2b = createAdminServer({ port: 0, projectPath: '/tmp/test3' });
    await inst2b.start();
    const port2 = (inst2b.server.address() as AddressInfo).port;

    // Mock fetch to throw (simulates CF API error)
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: port2,
        path: '/api/cloudflare/zones',
        method: 'GET',
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      };
      const r = http.request(options, (httpRes) => {
        let raw = '';
        httpRes.on('data', (c) => (raw += c));
        httpRes.on('end', () => {
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
          resolve({ status: httpRes.statusCode ?? 0, data });
        });
      });
      r.on('error', reject);
      r.end();
    });

    await inst2b.stop();
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('TOKEN_INVALID');
    void inst2.stop().catch(() => undefined);
  });

  it('returns zones list on success', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState());
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test4' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    mockFetch.mockResolvedValueOnce(makeCfZonesResponse([
      { id: 'zone-1', name: 'myserver.com', status: 'active' },
      { id: 'zone-2', name: 'example.dev', status: 'active' },
    ]));

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/zones', method: 'GET',
          headers: { 'x-admin-password': ADMIN_PASSWORD } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.zones)).toBe(true);
    expect((res.data.zones as unknown[]).length).toBe(2);
  });

  it('returns empty zones with warning when no zones found', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState());
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test5' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    // getZones returns [] on CF API failure (per cloudflare-client.ts implementation)
    mockFetch.mockResolvedValueOnce(makeCfZonesResponse([], false));

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/zones', method: 'GET',
          headers: { 'x-admin-password': ADMIN_PASSWORD } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.zones)).toBe(true);
    expect((res.data.zones as unknown[]).length).toBe(0);
    expect(typeof res.data.warning).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// POST /api/cloudflare/tunnel — handleCreateTunnel
// ---------------------------------------------------------------------------

describe('POST /api/cloudflare/tunnel', () => {
  it('requires auth — returns 401 without header', async () => {
    const { status } = await req('POST', '/api/cloudflare/tunnel', {
      body: { tunnelName: 'test-tunnel' },
      auth: false,
    });
    expect(status).toBe(401);
  });

  it('returns 401 when no wizard state (admin password not configured)', async () => {
    const { status } = await req('POST', '/api/cloudflare/tunnel', {
      body: { tunnelName: 'brewnet-test' },
    });
    expect(status).toBe(401);
  });

  it('creates tunnel and returns tunnelId on success', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState());
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test6' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    // Mock createTunnel CF API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        result: { id: 'tunnel-uuid-abc', token: 'tunnel-tok-123' },
      }),
    } as unknown as Response);

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const body = JSON.stringify({ tunnelName: 'brewnet-homeserver' });
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/tunnel', method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body) } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.tunnelId).toBe('tunnel-uuid-abc');
    expect(res.data.tunnelName).toBe('brewnet-homeserver');
  });

  it('returns TUNNEL_NAME_CONFLICT when tunnel already exists', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState());
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test7' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        success: false,
        errors: [{ message: 'tunnel with this name already exists' }],
      }),
    } as unknown as Response);

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const body = JSON.stringify({ tunnelName: 'existing-tunnel' });
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/tunnel', method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body) } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('TUNNEL_NAME_CONFLICT');
  });

  it('returns CREDENTIALS_INCOMPLETE when accountId missing', async () => {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(makeState({ accountId: '' }));

    const inst = createAdminServer({ port: 0, projectPath: '/tmp/test8' });
    await inst.start();
    const port = (inst.server.address() as AddressInfo).port;

    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const body = JSON.stringify({ tunnelName: 'test-tunnel' });
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/cloudflare/tunnel', method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body) } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('CREDENTIALS_INCOMPLETE');
  });
});

// ---------------------------------------------------------------------------
// POST /api/domain/connect — subdomain conflict detection (FR-018)
// ---------------------------------------------------------------------------

describe('POST /api/domain/connect — auth', () => {
  it('returns 401 without x-admin-password header', async () => {
    // Shared server has no adminPassword configured → 401 in both cases,
    // but this verifies the guard is present on domain/connect.
    const { status } = await req('POST', '/api/domain/connect', {
      body: { appName: 'myapp', subdomain: 'blog', domain: 'example.com' },
      auth: false,
    });
    expect(status).toBe(401);
  });
});

describe('POST /api/domain/connect — conflict detection', () => {
  async function spinUp(state: WizardState) {
    mockGetLastProject.mockReturnValue('test-project');
    mockLoadState.mockReturnValue(state);
    const inst = createAdminServer({ port: 0, projectPath: '/tmp/domain-connect-test' });
    await inst.start();
    return inst;
  }

  it('returns SUBDOMAIN_CONFLICT_LOCAL when subdomain already used by another app', async () => {
    const state = makeStateWithConnections([
      { appName: 'app-a', subdomain: 'blog', domain: 'example.com' },
    ]);
    const inst = await spinUp(state);
    const port = (inst.server.address() as AddressInfo).port;

    const body = JSON.stringify({ appName: 'app-b', subdomain: 'blog', domain: 'example.com' });
    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/domain/connect', method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body) } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    await inst.stop();
    expect(res.status).toBe(409);
    expect(res.data.error).toBe('SUBDOMAIN_CONFLICT_LOCAL');
    expect(res.data.conflictingApp).toBe('app-a');
    expect(res.data.message).toContain('app-a');
  });

  it('allows connect when same app reconnects to its own subdomain', async () => {
    // app-a already owns blog.example.com — reconnecting should NOT return local conflict
    const state = makeStateWithConnections([
      { appName: 'app-a', subdomain: 'blog', domain: 'example.com' },
    ]);
    const inst = await spinUp(state);
    const port = (inst.server.address() as AddressInfo).port;

    // Mock CF API calls that DomainManager.connect() will make (health + ingress + DNS)
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('ok') } as unknown as Response) // health
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: true, result: {} }) } as unknown as Response) // ingress PUT
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: true, result: [] }) } as unknown as Response) // listDnsRecords (no conflict)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: true, result: { id: 'dns-001' } }) } as unknown as Response); // createDnsRecord

    const body = JSON.stringify({ appName: 'app-a', subdomain: 'blog', domain: 'example.com' });
    const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const r = http.request(
        { hostname: '127.0.0.1', port, path: '/api/domain/connect', method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body) } },
        (httpRes) => {
          let raw = '';
          httpRes.on('data', (c) => (raw += c));
          httpRes.on('end', () => {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
            resolve({ status: httpRes.statusCode ?? 0, data });
          });
        }
      );
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    await inst.stop();
    // Should not return SUBDOMAIN_CONFLICT_LOCAL — same app owns it
    expect(res.data.error).not.toBe('SUBDOMAIN_CONFLICT_LOCAL');
  });
});
