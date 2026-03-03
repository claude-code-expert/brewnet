/**
 * Unit tests for services/admin-server module
 *
 * Tests the HTTP server created by createAdminServer():
 *   - inferType (pure function, tested indirectly)
 *   - HTTP routes: GET /, OPTIONS, GET /api/health, GET /api/services,
 *     POST /api/services/install, POST /api/services/:id/start|stop,
 *     DELETE /api/services/:id, GET /api/catalog, GET/POST /api/backup,
 *     404 fallback
 *
 * All external dependencies (dockerode, service-manager, backup-manager,
 * wizard/state, logger) are mocked via jest.unstable_mockModule.
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListContainers = jest.fn();
const mockGetContainer = jest.fn();

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn(() => ({
    listContainers: mockListContainers,
    getContainer: mockGetContainer,
  })),
}));

const mockAddService = jest.fn<() => Promise<{ success: boolean; error?: string }>>();
const mockRemoveService = jest.fn<() => Promise<{ success: boolean; error?: string }>>();

jest.unstable_mockModule('../../../../packages/cli/src/services/service-manager.js', () => ({
  addService: mockAddService,
  removeService: mockRemoveService,
}));

const mockCreateBackup = jest.fn<() => { id: string }>(() => ({ id: 'backup-001' }));
const mockListBackups = jest.fn<() => { id: string; createdAt: string }[]>(() => [
  { id: 'backup-001', createdAt: new Date().toISOString() },
]);

jest.unstable_mockModule('../../../../packages/cli/src/services/backup-manager.js', () => ({
  createBackup: mockCreateBackup,
  listBackups: mockListBackups,
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: jest.fn(() => null),
  loadState: jest.fn(() => null),
  createState: jest.fn(),
  saveState: jest.fn(),
  hasResumeState: jest.fn(() => false),
  getProjectDir: jest.fn((name: string) => `/home/user/.brewnet/projects/${name}`),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let serverPort: number;
let stopServer: () => Promise<void>;

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }));
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function makeContainer(id: string, state: string, labels?: Record<string, string>) {
  return {
    Id: `sha-${id}`,
    Labels: { 'com.docker.compose.service': id, ...labels },
    State: state,
    Status: state === 'running' ? 'Up 2 hours' : 'Exited (0) 5 minutes ago',
    Ports: [{ PublicPort: 80 }],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const instance = createAdminServer({ port: 0, projectPath: '/tmp/test' });
  await instance.start();
  // port: 0 lets OS assign a free port; read actual port from server.address()
  serverPort = (instance.server.address() as AddressInfo).port;
  stopServer = instance.stop;
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListContainers.mockResolvedValue([]);
  mockAddService.mockResolvedValue({ success: true });
  mockRemoveService.mockResolvedValue({ success: true });
  mockGetContainer.mockReturnValue({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
});

// ---------------------------------------------------------------------------
// GET /  — dashboard HTML
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns 200 with text/html', async () => {
    const res = await req('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('response contains Brewnet Admin in HTML', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('Brewnet Admin');
  });

  it('GET /index.html also returns dashboard HTML', async () => {
    const res = await req('GET', '/index.html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Brewnet Admin');
  });
});

// ---------------------------------------------------------------------------
// OPTIONS — CORS preflight
// ---------------------------------------------------------------------------

describe('OPTIONS', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await req('OPTIONS', '/api/services');
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await req('GET', '/api/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// GET /api/services
// ---------------------------------------------------------------------------

describe('GET /api/services', () => {
  it('returns empty services list when no containers', async () => {
    mockListContainers.mockResolvedValue([]);
    const res = await req('GET', '/api/services');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.services).toEqual([]);
    expect(body.summary.total).toBe(0);
  });

  it('returns services for labeled containers', async () => {
    mockListContainers.mockResolvedValue([
      makeContainer('traefik', 'running'),
      makeContainer('gitea', 'exited'),
    ]);

    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    expect(body.services).toHaveLength(2);
    const traefik = body.services.find((s: { id: string }) => s.id === 'traefik');
    expect(traefik.status).toBe('running');
    const gitea = body.services.find((s: { id: string }) => s.id === 'gitea');
    expect(gitea.status).toBe('stopped');
  });

  it('skips containers without compose service label', async () => {
    mockListContainers.mockResolvedValue([
      { Id: 'sha-unknown', Labels: {}, State: 'running', Status: 'Up', Ports: [] },
    ]);
    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    expect(body.services).toHaveLength(0);
  });

  it('correctly identifies service types', async () => {
    mockListContainers.mockResolvedValue([
      makeContainer('postgresql', 'running'),
      makeContainer('nextcloud', 'running'),
      makeContainer('jellyfin', 'running'),
      makeContainer('openssh-server', 'running'),
      makeContainer('docker-mailserver', 'running'),
      makeContainer('myapp', 'running'),
    ]);
    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    const byId = Object.fromEntries(body.services.map((s: { id: string; type: string }) => [s.id, s.type]));
    expect(byId['postgresql']).toBe('db');
    expect(byId['nextcloud']).toBe('file');
    expect(byId['jellyfin']).toBe('media');
    expect(byId['openssh-server']).toBe('ssh');
    expect(byId['docker-mailserver']).toBe('mail');
    // 'myapp' is not in SERVICE_REGISTRY so inferType is not called → 'unknown'
    expect(byId['myapp']).toBe('unknown');
  });

  it('marks required services as not removable', async () => {
    mockListContainers.mockResolvedValue([
      makeContainer('traefik', 'running'),
      makeContainer('gitea', 'running'),
    ]);
    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    const traefik = body.services.find((s: { id: string }) => s.id === 'traefik');
    expect(traefik.removable).toBe(false);
  });

  it('marks optional services as removable', async () => {
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'running')]);
    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    const jellyfin = body.services.find((s: { id: string }) => s.id === 'jellyfin');
    expect(jellyfin.removable).toBe(true);
  });

  it('returns 500 when docker throws', async () => {
    mockListContainers.mockRejectedValue(new Error('Docker error'));
    const res = await req('GET', '/api/services');
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('BN001');
  });

  it('summary reports running count correctly', async () => {
    mockListContainers.mockResolvedValue([
      makeContainer('traefik', 'running'),
      makeContainer('gitea', 'exited'),
      makeContainer('nextcloud', 'running'),
    ]);
    const res = await req('GET', '/api/services');
    const body = JSON.parse(res.body);
    expect(body.summary.running).toBe(2);
    expect(body.summary.stopped).toBe(1);
    expect(body.summary.total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// POST /api/services/install
// ---------------------------------------------------------------------------

describe('POST /api/services/install', () => {
  it('returns 202 on success', async () => {
    mockAddService.mockResolvedValue({ success: true });
    const res = await req('POST', '/api/services/install', { id: 'jellyfin' });
    expect(res.status).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 400 when id is missing', async () => {
    const res = await req('POST', '/api/services/install', {});
    expect(res.status).toBe(400);
  });

  it('returns 409 when service already exists', async () => {
    mockAddService.mockResolvedValue({ success: false, error: 'Service already installed' });
    const res = await req('POST', '/api/services/install', { id: 'jellyfin' });
    expect(res.status).toBe(409);
  });

  it('returns 500 when addService fails with other error', async () => {
    mockAddService.mockResolvedValue({ success: false, error: 'compose error' });
    const res = await req('POST', '/api/services/install', { id: 'jellyfin' });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/services/:category/:id/start|stop
// Note: Router uses parts[3]=id, parts[4]=action, so URL needs 5 segments:
//   /api/services/{category}/{id}/{action}
// ---------------------------------------------------------------------------

describe('POST /api/services/containers/:id/start', () => {
  it('starts a stopped container', async () => {
    const mockContainer = {
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'exited')]);
    mockGetContainer.mockReturnValue(mockContainer);

    const res = await req('POST', '/api/services/containers/jellyfin/start');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('running');
    expect(mockContainer.start).toHaveBeenCalled();
  });

  it('returns 400 when starting already-running service', async () => {
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'running')]);
    const res = await req('POST', '/api/services/containers/jellyfin/start');
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('ALREADY_RUNNING');
  });

  it('returns 404 when service not found', async () => {
    mockListContainers.mockResolvedValue([]);
    const res = await req('POST', '/api/services/containers/jellyfin/start');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/services/containers/:id/stop', () => {
  it('stops a running container', async () => {
    const mockContainer = {
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'running')]);
    mockGetContainer.mockReturnValue(mockContainer);

    const res = await req('POST', '/api/services/containers/jellyfin/stop');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('stopped');
    expect(mockContainer.stop).toHaveBeenCalled();
  });

  it('returns 400 when stopping already-stopped service', async () => {
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'exited')]);
    const res = await req('POST', '/api/services/containers/jellyfin/stop');
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_RUNNING');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/services/:category/:id
// Note: Router uses parts[3]=id, so URL needs 4+ segments
//   /api/services/{category}/{id}
// ---------------------------------------------------------------------------

describe('DELETE /api/services/containers/:id', () => {
  it('removes a non-required service', async () => {
    mockRemoveService.mockResolvedValue({ success: true });
    const res = await req('DELETE', '/api/services/containers/jellyfin');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 400 for required service (traefik)', async () => {
    const res = await req('DELETE', '/api/services/containers/traefik');
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('REQUIRED_SERVICE');
  });

  it('returns 404 when service not found', async () => {
    mockRemoveService.mockResolvedValue({ success: false, error: 'Service not found' });
    const res = await req('DELETE', '/api/services/containers/jellyfin');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/catalog
// ---------------------------------------------------------------------------

describe('GET /api/catalog', () => {
  it('returns catalog array', async () => {
    mockListContainers.mockResolvedValue([]);
    const res = await req('GET', '/api/catalog');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.catalog)).toBe(true);
  });

  it('marks installed services in catalog', async () => {
    mockListContainers.mockResolvedValue([makeContainer('jellyfin', 'running')]);
    const res = await req('GET', '/api/catalog');
    const body = JSON.parse(res.body);
    const jellyfin = body.catalog.find((s: { id: string }) => s.id === 'jellyfin');
    if (jellyfin) {
      expect(jellyfin.installed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/backup
// ---------------------------------------------------------------------------

describe('GET /api/backup', () => {
  it('returns list of backups', async () => {
    mockListBackups.mockReturnValue([{ id: 'bk-1', createdAt: '2024-01-01T00:00:00Z' }]);
    const res = await req('GET', '/api/backup');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.backups)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/backup
// ---------------------------------------------------------------------------

describe('POST /api/backup', () => {
  it('creates a backup and returns 202', async () => {
    mockCreateBackup.mockReturnValue({ id: 'bk-new' });
    const res = await req('POST', '/api/backup');
    expect(res.status).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.backupId).toBe('bk-new');
  });
});

// ---------------------------------------------------------------------------
// GET / — service detail modal and external URLs
// ---------------------------------------------------------------------------

describe('GET / — modal and external URL features', () => {
  it('HTML contains SERVICE_DETAILS JSON for modal', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var SERVICE_DETAILS =');
  });

  it('HTML contains ADMIN_CREDS JSON', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var ADMIN_CREDS =');
  });

  it('HTML contains DOMAIN_CONFIG JSON', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var DOMAIN_CONFIG =');
  });

  it('HTML contains showServiceModal function', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function showServiceModal(');
  });

  it('HTML contains closeServiceModal function', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function closeServiceModal(');
  });

  it('HTML contains escapeHtml function', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function escapeHtml(');
  });

  it('HTML contains handleModalEsc for ESC key support', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function handleModalEsc(');
  });

  it('HTML contains External column header', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('<th>External</th>');
  });

  it('HTML contains modal-overlay CSS class', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('.modal-overlay');
  });

  it('HTML contains svc-link CSS class for clickable names', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('.svc-link');
  });

  it('HTML contains getExternalUrl function', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function getExternalUrl(');
  });

  it('HTML contains EXT_PATHS for external URL routing', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var EXT_PATHS');
    expect(res.body).toContain('gitea');
    expect(res.body).toContain('nextcloud');
    expect(res.body).toContain('pgadmin');
  });

  it('HTML contains NAME_ALIASES for service name mapping', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var NAME_ALIASES');
    expect(res.body).toContain('OpenSSH Server');
    expect(res.body).toContain('SSH Server');
  });
});

// ---------------------------------------------------------------------------
// GET / — boilerplate stack modal feature
// ---------------------------------------------------------------------------

describe('GET / — boilerplate stack modal feature', () => {
  it('HTML contains BOILERPLATE_STACKS JSON variable', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var BOILERPLATE_STACKS =');
  });

  it('HTML contains showBoilerplateModal function', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('function showBoilerplateModal(');
  });

  it('BOILERPLATE_STACKS defaults to empty array when no metadata file', async () => {
    const res = await req('GET', '/');
    expect(res.body).toContain('var BOILERPLATE_STACKS = []');
  });
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

describe('404 fallback', () => {
  it('returns 404 for unknown non-api path', async () => {
    const res = await req('GET', '/unknown-path');
    expect(res.status).toBe(404);
  });

  it('returns 404 JSON for unknown API path', async () => {
    const res = await req('GET', '/api/unknown-endpoint');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});
