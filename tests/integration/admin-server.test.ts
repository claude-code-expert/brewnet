/**
 * T101c — Admin Server Integration Tests
 *
 * Tests the local admin panel HTTP server (admin-server.ts) by starting a
 * real Node.js HTTP server on an ephemeral port and making actual HTTP
 * requests. Docker and service-manager calls are mocked.
 *
 * Test cases:
 *   - GET /api/health → { status: 'ok' }
 *   - GET /          → HTML dashboard
 *   - GET /api/services → service list from mocked Docker
 *   - POST /api/services/install → delegates to addService
 *   - POST /api/services/:id/start → start container via Docker
 *   - POST /api/services/:id/stop  → stop container via Docker
 *   - DELETE /api/services/:id     → delegates to removeService
 *   - GET /api/catalog → service catalog from registry
 *   - GET /api/backup  → backup list
 *   - POST /api/backup → create backup
 *   - Unknown routes   → 404
 *
 * REQ Coverage: IMPLEMENT_SPEC.md T101c (admin-api.md contract)
 *
 * @module tests/integration/admin-server
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — must precede all await import()
// ---------------------------------------------------------------------------

// Mock wizard/state — prevent real ~/.brewnet reads
jest.unstable_mockModule('../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: jest.fn(() => null),
  loadState: jest.fn(() => null),
  createState: jest.fn(),
  saveState: jest.fn(),
  hasResumeState: jest.fn(() => false),
  getProjectDir: jest.fn((name: string) => `/tmp/brewnet-projects/${name}`),
}));

// Mock logger
jest.unstable_mockModule('../../packages/cli/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Fake container for Docker mocks
const fakeContainer = {
  Id: 'abc123',
  State: 'running',
  Status: 'Up 2 hours',
  Labels: { 'com.docker.compose.service': 'redis' },
  Ports: [{ PublicPort: 6379 }],
};

const mockDockerStart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDockerStop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetContainer = jest.fn(() => ({ start: mockDockerStart, stop: mockDockerStop }));
const mockListContainers = jest.fn<() => Promise<typeof fakeContainer[]>>().mockResolvedValue([fakeContainer]);

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    listContainers: mockListContainers,
    getContainer: mockGetContainer,
  })),
}));

// Mock service-manager
const mockAddService = jest.fn<(id: string, path: string) => Promise<{ success: boolean; error?: string }>>()
  .mockResolvedValue({ success: true });
const mockRemoveService = jest.fn<(id: string, path: string, opts?: object) => Promise<{ success: boolean; error?: string }>>()
  .mockResolvedValue({ success: true });

jest.unstable_mockModule('../../packages/cli/src/services/service-manager.js', () => ({
  addService: mockAddService,
  removeService: mockRemoveService,
  isServiceInCompose: jest.fn(() => false),
}));

// Mock backup-manager
const mockCreateBackup = jest.fn(() => ({ id: 'backup-001', path: '/tmp/backup-001.tar.gz', sizeBytes: 1024, services: ['redis'], createdAt: new Date().toISOString() }));
const mockListBackups = jest.fn(() => [{ id: 'backup-001', createdAt: new Date().toISOString() }]);

jest.unstable_mockModule('../../packages/cli/src/services/backup-manager.js', () => ({
  createBackup: mockCreateBackup,
  listBackups: mockListBackups,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { createAdminServer } = await import('../../packages/cli/src/services/admin-server.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let serverPort: number;
let stopServer: () => Promise<void>;

async function req(method: string, path: string, body?: object): Promise<{ status: number; data: unknown }> {
  const url = `http://127.0.0.1:${serverPort}${path}`;
  const opts: RequestInit = { method };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, opts);
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const { server, start, stop } = createAdminServer({ port: 0, projectPath: '/tmp/test-project' });
  // Listen on ephemeral port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      serverPort = addr.port;
      resolve();
    });
  });
  stopServer = stop;
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListContainers.mockResolvedValue([fakeContainer]);
  mockAddService.mockResolvedValue({ success: true });
  mockRemoveService.mockResolvedValue({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Health check
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/health', () => {
  it('returns status ok and version', async () => {
    const { status, data } = await req('GET', '/api/health');
    expect(status).toBe(200);
    expect((data as Record<string, unknown>).status).toBe('ok');
    expect((data as Record<string, unknown>).version).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard HTML
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /', () => {
  it('returns HTML dashboard with 200', async () => {
    const { status, data } = await req('GET', '/');
    expect(status).toBe(200);
    expect(typeof data).toBe('string');
    expect((data as string).toLowerCase()).toContain('<!doctype html');
  });

  it('returns HTML for /index.html', async () => {
    const { status } = await req('GET', '/index.html');
    expect(status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/services
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/services', () => {
  it('returns services array and summary', async () => {
    const { status, data } = await req('GET', '/api/services');
    const body = data as Record<string, unknown>;
    expect(status).toBe(200);
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.summary).toBeDefined();
  });

  it('lists containers from Docker with correct fields', async () => {
    const { data } = await req('GET', '/api/services');
    const { services } = data as { services: Record<string, unknown>[] };
    expect(services.length).toBeGreaterThan(0);
    const svc = services[0]!;
    expect(svc.id).toBe('redis');
    expect(svc.status).toBe('running');
    expect(svc.removable).toBe(true); // redis is not in REQUIRED_SERVICES
  });

  it('returns empty services list when Docker returns no containers', async () => {
    mockListContainers.mockResolvedValueOnce([]);
    const { data } = await req('GET', '/api/services');
    const { services } = data as { services: unknown[] };
    expect(services).toHaveLength(0);
  });

  it('returns BN001 error when Docker is unavailable', async () => {
    mockListContainers.mockRejectedValueOnce(new Error('docker not running'));
    const { status, data } = await req('GET', '/api/services');
    expect(status).toBe(500);
    expect((data as Record<string, unknown>).code).toBe('BN001');
  });

  it('marks required services (traefik, gitea) as non-removable', async () => {
    const traefikContainer = {
      ...fakeContainer,
      Labels: { 'com.docker.compose.service': 'traefik' },
    };
    mockListContainers.mockResolvedValueOnce([traefikContainer]);
    const { data } = await req('GET', '/api/services');
    const { services } = data as { services: Record<string, unknown>[] };
    const traefik = services.find((s) => s.id === 'traefik');
    expect(traefik?.removable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/services/install
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/services/install', () => {
  it('returns 202 and success when addService succeeds', async () => {
    const { status, data } = await req('POST', '/api/services/install', { id: 'redis' });
    expect(status).toBe(202);
    expect((data as Record<string, unknown>).success).toBe(true);
    expect((data as Record<string, unknown>).id).toBe('redis');
  });

  it('calls addService with correct service id', async () => {
    await req('POST', '/api/services/install', { id: 'nextcloud' });
    expect(mockAddService).toHaveBeenCalledWith('nextcloud', expect.any(String));
  });

  it('returns 409 when service already exists', async () => {
    mockAddService.mockResolvedValueOnce({ success: false, error: 'already exists in compose' });
    const { status, data } = await req('POST', '/api/services/install', { id: 'redis' });
    expect(status).toBe(409);
    expect((data as Record<string, unknown>).code).toBe('ALREADY_EXISTS');
  });

  it('returns 500 on generic addService failure', async () => {
    mockAddService.mockResolvedValueOnce({ success: false, error: 'Unknown service' });
    const { status, data } = await req('POST', '/api/services/install', { id: 'unknown' });
    expect(status).toBe(500);
    expect((data as Record<string, unknown>).success).toBe(false);
  });

  it('returns 400 when id is missing in body', async () => {
    const { status } = await req('POST', '/api/services/install', {});
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/services/:id/start
// ═══════════════════════════════════════════════════════════════════════════

// URL format: /api/services/containers/:id/start|stop (5 segments)
describe('POST /api/services/containers/:id/start', () => {
  it('returns 400 when service is already running', async () => {
    // fakeContainer.State = 'running', so starting it should return 400
    const { status, data } = await req('POST', '/api/services/containers/redis/start');
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).code).toBe('ALREADY_RUNNING');
  });

  it('starts a stopped container and returns success', async () => {
    const stoppedContainer = { ...fakeContainer, State: 'exited' };
    mockListContainers.mockResolvedValueOnce([stoppedContainer]);

    const { status, data } = await req('POST', '/api/services/containers/redis/start');
    expect(status).toBe(200);
    expect((data as Record<string, unknown>).success).toBe(true);
    expect((data as Record<string, unknown>).status).toBe('running');
    expect(mockDockerStart).toHaveBeenCalled();
  });

  it('returns 404 when service not found', async () => {
    mockListContainers.mockResolvedValueOnce([]);
    const { status, data } = await req('POST', '/api/services/containers/unknown/start');
    expect(status).toBe(404);
    expect((data as Record<string, unknown>).code).toBe('BN008');
  });
});

// URL format: /api/services/containers/:id/stop
describe('POST /api/services/containers/:id/stop', () => {
  it('stops a running container and returns success', async () => {
    const { status, data } = await req('POST', '/api/services/containers/redis/stop');
    expect(status).toBe(200);
    expect((data as Record<string, unknown>).success).toBe(true);
    expect((data as Record<string, unknown>).status).toBe('stopped');
    expect(mockDockerStop).toHaveBeenCalled();
  });

  it('returns 400 when service is already stopped', async () => {
    const stoppedContainer = { ...fakeContainer, State: 'exited' };
    mockListContainers.mockResolvedValueOnce([stoppedContainer]);

    const { status, data } = await req('POST', '/api/services/containers/redis/stop');
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).code).toBe('NOT_RUNNING');
  });

  it('returns 404 when service not found', async () => {
    mockListContainers.mockResolvedValueOnce([]);
    const { status } = await req('POST', '/api/services/containers/nonexistent/stop');
    expect(status).toBe(404);
  });
});

// URL format: DELETE /api/services/containers/:id (4 segments)
describe('DELETE /api/services/containers/:id', () => {
  it('removes a service and returns success', async () => {
    const { status, data } = await req('DELETE', '/api/services/containers/redis');
    expect(status).toBe(200);
    expect((data as Record<string, unknown>).success).toBe(true);
    expect((data as Record<string, unknown>).dataPreserved).toBe(true);
  });

  it('calls removeService with correct id and projectPath', async () => {
    await req('DELETE', '/api/services/containers/nextcloud');
    expect(mockRemoveService).toHaveBeenCalledWith('nextcloud', expect.any(String), { purge: false });
  });

  it('passes purge=true when query param set', async () => {
    await req('DELETE', '/api/services/containers/nextcloud?purge=true');
    expect(mockRemoveService).toHaveBeenCalledWith('nextcloud', expect.any(String), { purge: true });
  });

  it('rejects removal of required services (traefik)', async () => {
    const { status, data } = await req('DELETE', '/api/services/containers/traefik');
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).code).toBe('REQUIRED_SERVICE');
    expect(mockRemoveService).not.toHaveBeenCalled();
  });

  it('returns 404 when service not found in compose', async () => {
    mockRemoveService.mockResolvedValueOnce({ success: false, error: 'not found in compose' });
    const { status } = await req('DELETE', '/api/services/containers/nonexistent');
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/catalog
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/catalog', () => {
  it('returns catalog array', async () => {
    mockListContainers.mockResolvedValueOnce([]);
    const { status, data } = await req('GET', '/api/catalog');
    expect(status).toBe(200);
    const { catalog } = data as { catalog: unknown[] };
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('each catalog entry has required fields', async () => {
    mockListContainers.mockResolvedValueOnce([]);
    const { data } = await req('GET', '/api/catalog');
    const { catalog } = data as { catalog: Record<string, unknown>[] };
    const entry = catalog[0]!;
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.name).toBe('string');
    expect(typeof entry.image).toBe('string');
    expect(typeof entry.installed).toBe('boolean');
  });

  it('marks installed services correctly', async () => {
    mockListContainers.mockResolvedValueOnce([fakeContainer]); // redis running
    const { data } = await req('GET', '/api/catalog');
    const { catalog } = data as { catalog: Record<string, unknown>[] };
    const redis = catalog.find((s) => s.id === 'redis');
    if (redis) {
      expect(redis.installed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/backup  +  POST /api/backup
// ═══════════════════════════════════════════════════════════════════════════

describe('/api/backup', () => {
  it('GET returns backup list', async () => {
    const { status, data } = await req('GET', '/api/backup');
    expect(status).toBe(200);
    const { backups } = data as { backups: unknown[] };
    expect(Array.isArray(backups)).toBe(true);
    expect(mockListBackups).toHaveBeenCalled();
  });

  it('POST creates backup and returns 202', async () => {
    const { status, data } = await req('POST', '/api/backup');
    expect(status).toBe(202);
    const body = data as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.backupId).toBe('backup-001');
    expect(mockCreateBackup).toHaveBeenCalled();
  });

  it('POST returns 500 when createBackup throws', async () => {
    mockCreateBackup.mockImplementationOnce(() => { throw new Error('disk full'); });
    const { status } = await req('POST', '/api/backup');
    expect(status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unknown routes
// ═══════════════════════════════════════════════════════════════════════════

describe('Unknown routes', () => {
  it('returns 404 for unknown API route', async () => {
    const { status } = await req('GET', '/api/unknown');
    expect(status).toBe(404);
  });

  it('returns 404 for unknown path', async () => {
    const { status } = await req('GET', '/foo/bar');
    expect(status).toBe(404);
  });

  it('returns 204 for OPTIONS (CORS preflight)', async () => {
    const url = `http://127.0.0.1:${serverPort}/api/services`;
    const res = await fetch(url, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
});
