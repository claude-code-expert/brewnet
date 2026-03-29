/**
 * Unit tests for handleInstallService Named Tunnel integration.
 *
 * When a catalog service is installed while Named Tunnel is active:
 * 1. patchBuiltinServicesForNamedTunnel is called BEFORE container start
 * 2. configureTunnelIngress is called with all catalog-mapped services in compose
 * 3. createDnsRecord is called for the new service's subdomain
 *
 * When Named Tunnel is NOT active, none of these calls happen.
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'node:http';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that load admin-server
// ---------------------------------------------------------------------------

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn(() => ({
    listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getContainer: jest.fn().mockReturnValue({
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop:  jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }),
  })),
}));

const mockAddService = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
jest.unstable_mockModule('../../../../packages/cli/src/services/service-manager.js', () => ({
  addService:    mockAddService,
  removeService: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 }),
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/backup-manager.js', () => ({
  createBackup: jest.fn<() => { id: string }>(() => ({ id: 'bkp-001' })),
  listBackups:  jest.fn<() => unknown[]>(() => []),
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  discoverProjectPath: jest.fn(() => PROJECT_PATH),
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

const mockGetSetting  = jest.fn<(path: string, key: string) => string | null>(() => null);
const mockGetSettings = jest.fn<(path: string, prefix: string) => Record<string, string>>(() => ({}));

jest.unstable_mockModule('../../../../packages/cli/src/services/project-db.js', () => ({
  listApps:               jest.fn<() => unknown[]>(() => []),
  getApp:                 jest.fn(() => null),
  addApp:                 jest.fn(),
  updateApp:              jest.fn(),
  removeApp:              jest.fn(),
  listDomainConnections:  jest.fn(() => []),
  getDomainConnection:    jest.fn(() => null),
  upsertDomainConnection: jest.fn(),
  removeDomainConnection: jest.fn(),
  getDeployHistory:       jest.fn(() => []),
  appendDeployHistory:    jest.fn(),
  getSetting:             mockGetSetting,
  setSetting:             jest.fn(),
  getSettings:            mockGetSettings,
  setSettings:            jest.fn(),
  getDb:                  jest.fn(),
  closeDb:                jest.fn(),
  _setDbForTest:          jest.fn(),
  migrateFromJson:        jest.fn(() => ({ migrated: [] })),
}));

const mockConfigureTunnelIngress = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateDnsRecord        = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../../packages/cli/src/services/cloudflare-client.js', () => ({
  verifyToken:             jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  configureTunnelIngress:  mockConfigureTunnelIngress,
  createDnsRecord:         mockCreateDnsRecord,
  deleteDnsRecord:         jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getDnsRecords:           jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getTunnelHealth:         jest.fn<() => Promise<unknown>>().mockResolvedValue({ healthy: true }),
  getActiveServiceRoutes:  jest.fn(() => []),
  buildTokenCreationUrl:   jest.fn(() => ''),
  fetchWithRetry:          jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  deleteTunnel:            jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getAccounts:             jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getZones:                jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  createTunnel:            jest.fn<() => Promise<unknown>>().mockResolvedValue({ tunnelId: '', token: '' }),
}));

const mockPatchBuiltin = jest.fn<(composePath: string, domain: string) => string[]>(() => []);

jest.unstable_mockModule('../../../../packages/cli/src/services/compose-generator.js', () => ({
  patchBuiltinServicesForNamedTunnel: mockPatchBuiltin,
  generateComposeConfig:              jest.fn(() => ({})),
  composeConfigToYaml:                jest.fn(() => ''),
  addExternalLabels:                  jest.fn(),
  removeExternalLabels:               jest.fn(),
  addQuickTunnelAppLabels:            jest.fn(),
  patchCloudflaredToNamedTunnel:      jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/tmp/test-install-named-tunnel';

const { createAdminServer } = await import(
  '../../../../packages/cli/src/services/admin-server.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_PASSWORD = 'test-install-pw';

let serverPort: number;
let stopServer: () => Promise<void>;

async function postInstall(id: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ id });
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/services/install',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-admin-password': ADMIN_PASSWORD,
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> }));
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

/** Write a docker-compose.yml in the test project dir with the given service IDs */
function writeCompose(...serviceIds: string[]): void {
  const services = serviceIds
    .map((id) => `  ${id}:\n    image: test/${id}:latest`)
    .join('\n');
  writeFileSync(join(PROJECT_PATH, 'docker-compose.yml'), `services:\n${services}\n`, 'utf-8');
}

/** Configure getSetting/getSettings mocks for Named Tunnel */
function setupNamedTunnel(): void {
  mockGetSetting.mockImplementation((_path: string, key: string) => {
    if (key === 'cf.tunnelMode') return 'named';
    if (key === 'cf.zoneName')   return 'example.com';
    if (key === 'admin.username') return 'testadmin';
    if (key === 'admin.password') return 'secret123!';
    return null;
  });
  mockGetSettings.mockImplementation((_path: string, _prefix: string) => ({
    'cf.tunnelMode':  'named',
    'cf.zoneName':    'example.com',
    'cf.apiToken':    'tok-abc',
    'cf.accountId':   'acc-123',
    'cf.tunnelId':    'tun-456',
    'cf.zoneId':      'zone-789',
  }));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  mkdirSync(PROJECT_PATH, { recursive: true });

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
  rmSync(PROJECT_PATH, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAddService.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/services/install — Named Tunnel ingress update', () => {
  it('named tunnel: calls patchBuiltinServicesForNamedTunnel before starting container', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'gitea', 'jellyfin');

    const { status } = await postInstall('jellyfin');
    expect(status).toBe(202);
    expect(mockPatchBuiltin).toHaveBeenCalledWith(
      join(PROJECT_PATH, 'docker-compose.yml'),
      'example.com',
    );
  });

  it('named tunnel: calls configureTunnelIngress with all catalog-mapped services in compose', async () => {
    setupNamedTunnel();
    // compose already contains gitea (existing) + jellyfin (just added)
    writeCompose('traefik', 'gitea', 'jellyfin');

    await postInstall('jellyfin');

    expect(mockConfigureTunnelIngress).toHaveBeenCalledTimes(1);
    const call0 = mockConfigureTunnelIngress.mock.calls[0] as unknown as [
      string, string, string, string, Array<{ subdomain: string; port: number; containerName: string }>
    ];
    const [token, accountId, tunnelId, zoneName, routes] = call0;
    expect(token).toBe('tok-abc');
    expect(accountId).toBe('acc-123');
    expect(tunnelId).toBe('tun-456');
    expect(zoneName).toBe('example.com');
    // traefik is NOT in CATALOG_TUNNEL_ROUTES, so only gitea + jellyfin
    expect(routes).toHaveLength(2);
    expect(routes).toEqual(expect.arrayContaining([
      { subdomain: 'git',   port: 3000, containerName: 'gitea' },
      { subdomain: 'media', port: 8096, containerName: 'jellyfin' },
    ]));
  });

  it('named tunnel: calls createDnsRecord for the newly installed service subdomain', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'gitea', 'jellyfin');

    await postInstall('jellyfin');

    expect(mockCreateDnsRecord).toHaveBeenCalledTimes(1);
    const dnsCall = (mockCreateDnsRecord.mock.calls[0] as unknown) as [string, string, string, string, string];
    const [token, zoneId, tunnelId, subdomain, domain] = dnsCall;
    expect(token).toBe('tok-abc');
    expect(zoneId).toBe('zone-789');
    expect(tunnelId).toBe('tun-456');
    expect(subdomain).toBe('media');
    expect(domain).toBe('example.com');
  });

  it('named tunnel: service without CATALOG_TUNNEL_ROUTES entry skips ingress update', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'unknown-service');

    await postInstall('unknown-service');

    // unknown-service has no tunnel route def → ingress update skipped
    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });

  it('quick tunnel mode: skips all CF tunnel calls', async () => {
    mockGetSetting.mockImplementation((_path: string, key: string) => {
      if (key === 'cf.tunnelMode') return 'quick';
      return null;
    });
    mockGetSettings.mockReturnValue({ 'cf.tunnelMode': 'quick' });
    writeCompose('traefik', 'jellyfin');

    await postInstall('jellyfin');

    expect(mockPatchBuiltin).not.toHaveBeenCalled();
    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });

  it('tunnel mode none: skips all CF tunnel calls', async () => {
    mockGetSetting.mockImplementation((_path: string, key: string) => {
      if (key === 'cf.tunnelMode') return 'none';
      return null;
    });
    mockGetSettings.mockReturnValue({ 'cf.tunnelMode': 'none' });
    writeCompose('traefik', 'nextcloud');

    await postInstall('nextcloud');

    expect(mockPatchBuiltin).not.toHaveBeenCalled();
    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });

  it('named tunnel: addService failure returns 409/500 without calling CF APIs', async () => {
    setupNamedTunnel();
    mockAddService.mockResolvedValue({ success: false, error: 'Service "jellyfin" already exists in compose' } as { success: boolean });
    writeCompose('traefik', 'jellyfin');

    const { status } = await postInstall('jellyfin');

    expect(status).toBe(409);
    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });
});

// Verify compose file exists check
describe('POST /api/services/install — compose file interaction', () => {
  it('named tunnel: reads compose file from project path to determine active routes', async () => {
    setupNamedTunnel();
    // Only nextcloud in compose (not gitea)
    writeCompose('traefik', 'nextcloud');

    await postInstall('nextcloud');

    expect(mockConfigureTunnelIngress).toHaveBeenCalledTimes(1);
    const routes = ((mockConfigureTunnelIngress.mock.calls[0] as unknown) as [unknown, unknown, unknown, unknown, Array<{ containerName: string }>])[4];
    const containerNames = routes.map((r) => r.containerName);
    // Only nextcloud has a tunnel route (traefik doesn't)
    expect(containerNames).toEqual(['nextcloud']);
    expect(containerNames).not.toContain('gitea');
  });
});

// ---------------------------------------------------------------------------
// Credential propagation: addService receives admin credentials from DB
// ---------------------------------------------------------------------------

describe('POST /api/services/install — admin credential propagation', () => {
  it('postgresql: passes admin username and password from settings DB', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'postgresql');

    await postInstall('postgresql');

    expect(mockAddService).toHaveBeenCalledTimes(1);
    const callArgs = (mockAddService.mock.calls[0] as unknown) as [string, string, { env?: Record<string, string>; domain?: string }];
    expect(callArgs[0]).toBe('postgresql');
    expect(callArgs[2]).toBeDefined();
    expect(callArgs[2].env).toEqual({
      POSTGRES_USER: 'testadmin',
      POSTGRES_PASSWORD: 'secret123!',
      POSTGRES_DB: 'brewnet_db',
    });
    expect(callArgs[2].domain).toBe('example.com');
  });

  it('pgadmin: uses admin email pattern and admin password', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'pgadmin');

    await postInstall('pgadmin');

    const callArgs = (mockAddService.mock.calls[0] as unknown) as [string, string, { env?: Record<string, string>; domain?: string }];
    expect(callArgs[2].env).toEqual({
      PGADMIN_DEFAULT_EMAIL: 'testadmin@brewnet.dev',
      PGADMIN_DEFAULT_PASSWORD: 'secret123!',
    });
  });

  it('minio: uses admin username and password', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'minio');

    await postInstall('minio');

    const callArgs = (mockAddService.mock.calls[0] as unknown) as [string, string, { env?: Record<string, string>; domain?: string }];
    expect(callArgs[2].env).toEqual({
      MINIO_ROOT_USER: 'testadmin',
      MINIO_ROOT_PASSWORD: 'secret123!',
    });
  });

  it('domain is passed for {{DOMAIN}} resolution in Traefik labels', async () => {
    setupNamedTunnel();
    writeCompose('traefik', 'pgadmin');

    await postInstall('pgadmin');

    const callArgs = (mockAddService.mock.calls[0] as unknown) as [string, string, { domain?: string }];
    expect(callArgs[2].domain).toBe('example.com');
  });

  it('quick tunnel: pgadmin env includes SCRIPT_NAME', async () => {
    mockGetSetting.mockImplementation((_path: string, key: string) => {
      if (key === 'cf.tunnelMode') return 'quick';
      if (key === 'admin.username') return 'testadmin';
      if (key === 'admin.password') return 'secret123!';
      return null;
    });
    writeCompose('traefik', 'pgadmin');

    await postInstall('pgadmin');

    const callArgs = (mockAddService.mock.calls[0] as unknown) as [string, string, { env?: Record<string, string> }];
    expect(callArgs[2].env).toEqual(expect.objectContaining({
      SCRIPT_NAME: '/pgadmin',
    }));
  });
});
