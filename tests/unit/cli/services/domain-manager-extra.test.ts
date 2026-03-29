/**
 * Additional unit tests for services/domain-manager
 *
 * Covers: status(), reload(), getState(), CNAME_CONFLICT detection,
 *         connect failure propagation, onLog callback
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Mocks (identical setup to domain-manager.test.ts)
// ---------------------------------------------------------------------------

const mockGetDnsRecords = jest.fn<() => unknown>();
const mockDeleteDnsRecord = jest.fn<() => unknown>();
const mockCreateDnsRecord = jest.fn<() => unknown>();
const mockConfigureTunnelIngress = jest.fn<() => unknown>();
const mockGetTunnelHealth = jest.fn<() => unknown>();
const mockGetActiveServiceRoutes = jest.fn<() => unknown>();
const mockAddExternalLabels = jest.fn<() => unknown>();
const mockRemoveExternalLabels = jest.fn<() => unknown>();
const mockLoadState = jest.fn<() => unknown>();
const mockSaveState = jest.fn<() => unknown>();
const mockFetch = jest.fn<typeof fetch>();

jest.unstable_mockModule('../../../../packages/cli/src/services/cloudflare-client.js', () => ({
  getDnsRecords: mockGetDnsRecords,
  deleteDnsRecord: mockDeleteDnsRecord,
  createDnsRecord: mockCreateDnsRecord,
  configureTunnelIngress: mockConfigureTunnelIngress,
  getTunnelHealth: mockGetTunnelHealth,
  getActiveServiceRoutes: mockGetActiveServiceRoutes,
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/compose-generator.js', () => ({
  addExternalLabels: mockAddExternalLabels,
  removeExternalLabels: mockRemoveExternalLabels,
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  discoverProjectPath: jest.fn(() => null),
  loadState: mockLoadState,
  saveState: mockSaveState,
}));

const mockExecaFn = jest.fn<() => unknown>().mockResolvedValue({
  stdout: 'tun-456.cfargotunnel.com.\n',
  stderr: '',
});

jest.unstable_mockModule('execa', () => ({
  execa: mockExecaFn,
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/boilerplate-manager.js', () => ({
  unpatchNextConfig: jest.fn<() => unknown>().mockReturnValue(false),
  patchNextConfig: jest.fn<() => unknown>(),
}));

const mockListDomainConnections = jest.fn<() => unknown[]>(() => []);
const mockUpsertDomainConnection = jest.fn();
const mockRemoveDomainConnection = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/project-db.js', () => ({
  listApps: jest.fn(() => []),
  getApp: jest.fn(() => null),
  addApp: jest.fn(),
  updateApp: jest.fn(),
  removeApp: jest.fn(),
  listDomainConnections: mockListDomainConnections,
  getDomainConnection: jest.fn(() => null),
  upsertDomainConnection: mockUpsertDomainConnection,
  removeDomainConnection: mockRemoveDomainConnection,
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

global.fetch = mockFetch as typeof fetch;

const { DomainManager } = await import(
  '../../../../packages/cli/src/services/domain-manager.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Record<string, unknown> = {}): WizardState {
  return {
    schemaVersion: 7,
    projectName: 'test-project',
    projectPath: '/tmp/brewnet/test-project',
    setupType: 'full',
    admin: { username: 'admin', password: 'testpassword12345', storage: 'local' as const },
    servers: {
      webServer: { enabled: true as const, service: 'traefik' as const },
      fileServer: { enabled: false, service: '' as const },
      gitServer: { enabled: true as const, service: 'gitea' as const, port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: false,
        primary: '' as const,
        primaryVersion: '',
        dbName: '',
        dbUser: '',
        dbPassword: '',
        adminUI: false,
        pgadminEmail: '',
        cache: '' as const,
      },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' as const },
    },
    devStack: { languages: [], frameworks: {}, frontend: null },
    boilerplate: { generate: false, sampleData: false, devMode: 'production' as const },
    domain: {
      provider: 'tunnel' as const,
      name: 'example.com',
      ssl: 'cloudflare' as const,
      cloudflare: {
        enabled: true,
        tunnelMode: 'named' as const,
        quickTunnelUrl: '',
        accountId: 'acc-123',
        apiToken: 'test-api-token',
        tunnelId: 'tun-456',
        tunnelToken: 'tok-789',
        tunnelName: 'brewnet-test',
        zoneId: 'zone-abc',
        zoneName: 'example.com',
      },
    },
    domainConnections: [],
    portRemapping: {},
    ...overrides,
  } as WizardState;
}

function makeConnection(overrides: Partial<{
  appName: string;
  subdomain: string;
  hostname: string;
}> = {}) {
  return {
    appName: overrides.appName ?? 'git',
    subdomain: overrides.subdomain ?? 'git',
    domain: 'example.com',
    hostname: overrides.hostname ?? 'git.example.com',
    tunnelId: 'tun-456',
    cnameRecordId: 'rec-1',
    containerPort: 3000,
    connectedAt: '2026-03-15T10:00:00Z',
    scenario: 'A' as const,
  };
}

// ---------------------------------------------------------------------------
// reload() and getState()
// ---------------------------------------------------------------------------

describe('DomainManager.reload()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockGetActiveServiceRoutes.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('reloads fresh state from disk', () => {
    const initial = makeState();
    const updated = makeState();
    updated.domainConnections = [makeConnection()];

    mockLoadState.mockReturnValueOnce(initial).mockReturnValueOnce(updated);
    // list() reads from DB mock — after reload, the projectPath changes to updated state
    mockListDomainConnections
      .mockReturnValueOnce([])        // first list() call
      .mockReturnValueOnce([makeConnection()]); // second list() call after reload

    const mgr = new DomainManager('test-project');
    expect(mgr.list()).toHaveLength(0);

    mgr.reload();
    expect(mgr.list()).toHaveLength(1);
  });

  it('keeps existing state when disk state is gone on reload', () => {
    const initial = makeState();
    initial.domainConnections = [makeConnection()];
    mockLoadState.mockReturnValueOnce(initial).mockReturnValueOnce(null);
    // list() reads from DB mock — state stays the same projectPath after null reload
    mockListDomainConnections.mockReturnValue([makeConnection()]);

    const mgr = new DomainManager('test-project');
    // reload() with null → no-op, state unchanged
    mgr.reload();
    expect(mgr.list()).toHaveLength(1);
  });
});

describe('DomainManager.getState()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockGetActiveServiceRoutes.mockReturnValue([]);
  });

  it('returns the current wizard state', () => {
    const state = makeState();
    mockLoadState.mockReturnValue(state);
    const mgr = new DomainManager('test-project');
    expect(mgr.getState().projectName).toBe('test-project');
  });
});

// ---------------------------------------------------------------------------
// status()
// ---------------------------------------------------------------------------

describe('DomainManager.status()', () => {
  let state: WizardState;

  beforeEach(() => {
    jest.clearAllMocks();
    state = makeState();
    state.domainConnections = [makeConnection()];
    mockLoadState.mockReturnValue(state);
    mockListDomainConnections.mockReturnValue([makeConnection()]);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('returns empty array when no connections', async () => {
    state.domainConnections = [];
    mockListDomainConnections.mockReturnValue([]);
    const mgr = new DomainManager('test-project');
    const result = await mgr.status();
    expect(result).toHaveLength(0);
  });

  it('returns status for all connections when no appName given', async () => {
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
    mockGetDnsRecords.mockResolvedValue([
      { id: 'rec-1', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true },
    ]);

    const mgr = new DomainManager('test-project');
    const result = await mgr.status();

    expect(result).toHaveLength(1);
    expect(result[0].appName).toBe('git');
    expect(result[0].external.url).toBe('https://git.example.com');
  });

  it('filters by appName when provided', async () => {
    const conns = [
      makeConnection({ appName: 'git', subdomain: 'git', hostname: 'git.example.com' }),
      makeConnection({ appName: 'cloud', subdomain: 'cloud', hostname: 'cloud.example.com' }),
    ];
    state.domainConnections = conns;
    mockListDomainConnections.mockReturnValue(conns);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
    mockGetDnsRecords.mockResolvedValue([]);

    const mgr = new DomainManager('test-project');
    const result = await mgr.status('git');

    expect(result).toHaveLength(1);
    expect(result[0].appName).toBe('git');
  });

  it('sets dnsResolved=true when DNS records found', async () => {
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
    mockGetDnsRecords.mockResolvedValue([
      { id: 'rec-1', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true },
    ]);

    const mgr = new DomainManager('test-project');
    const result = await mgr.status('git');

    expect(result[0].external.dnsResolved).toBe(true);
    expect(result[0].dns).not.toBeNull();
    expect(result[0].dns?.type).toBe('CNAME');
  });

  it('handles getDnsRecords failure gracefully (leaves dns=null)', async () => {
    // Make execa (dig fallback) return empty so dnsResolved stays false
    mockExecaFn.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
    mockGetDnsRecords.mockRejectedValue(new Error('CF API unreachable'));

    const mgr = new DomainManager('test-project');
    const result = await mgr.status('git');

    expect(result[0].dns).toBeNull();
    expect(result[0].external.dnsResolved).toBe(false);
  });

  it('skips DNS check when CF credentials missing', async () => {
    state.domain.cloudflare.apiToken = '';
    state.domain.cloudflare.zoneId = '';

    const mgr = new DomainManager('test-project');
    const result = await mgr.status('git');

    expect(mockGetDnsRecords).not.toHaveBeenCalled();
    expect(result[0].dns).toBeNull();
  });

  it('skips tunnel health when CF tunnel credentials missing', async () => {
    state.domain.cloudflare.apiToken = '';
    state.domain.cloudflare.accountId = '';

    const mgr = new DomainManager('test-project');
    await mgr.status('git');

    expect(mockGetTunnelHealth).not.toHaveBeenCalled();
  });

  it('handles getTunnelHealth failure gracefully', async () => {
    mockGetTunnelHealth.mockRejectedValue(new Error('tunnel API error'));
    mockGetDnsRecords.mockResolvedValue([]);

    const mgr = new DomainManager('test-project');
    const result = await mgr.status('git');

    expect(result[0].tunnel.status).toBe('inactive');
    expect(result[0].tunnel.connectorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// connect() — CNAME_CONFLICT detection
// ---------------------------------------------------------------------------

describe('DomainManager.connect() — CNAME_CONFLICT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('returns CNAME_CONFLICT when DNS record already exists', async () => {
    const state = makeState();
    mockLoadState.mockReturnValue(state);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    // Existing CNAME record found → triggers conflict
    mockGetDnsRecords.mockResolvedValue([
      { id: 'rec-1', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true },
    ]);

    const mgr = new DomainManager('test-project');
    const result = await mgr.connect('git', 'git', 'example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('CNAME_CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// connect() — ingress failure path
// ---------------------------------------------------------------------------

describe('DomainManager.connect() — ingress failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    mockGetDnsRecords.mockResolvedValue([]);
  });

  it('returns error when configureTunnelIngress fails', async () => {
    const state = makeState();
    mockLoadState.mockReturnValue(state);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    mockConfigureTunnelIngress.mockRejectedValue(new Error('CF ingress API error'));

    const mgr = new DomainManager('test-project');
    const result = await mgr.connect('git', 'git', 'example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('ingress');
  });
});

// ---------------------------------------------------------------------------
// connect() — onLog callback
// ---------------------------------------------------------------------------

describe('DomainManager.connect() — onLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('calls onLog callback with step messages', async () => {
    const state = makeState();
    mockLoadState.mockReturnValue(state);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetDnsRecords
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'rec-new',
          name: 'git.example.com',
          content: 'tun-456.cfargotunnel.com',
          proxied: true,
        },
      ]);

    const logLines: string[] = [];
    const mgr = new DomainManager('test-project');
    await mgr.connect('git', 'git', 'example.com', { onLog: (line) => logLines.push(line) });

    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.some((l) => l.includes('start:'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// connect() — existing domainConnections included in ingress (L193-194)
// ---------------------------------------------------------------------------

describe('DomainManager.connect() — existing domainConnections in ingress (L193-194)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('includes pre-existing connections as external routes in ingress (L193-194)', async () => {
    const existingConn = makeConnection({ appName: 'nextcloud', subdomain: 'cloud', hostname: 'cloud.example.com' });
    const state = makeState({
      domainConnections: [existingConn],
    });
    mockLoadState.mockReturnValue(state);
    mockListDomainConnections.mockReturnValue([existingConn]);
    // Provide a route so resolveContainerPort('gitea') resolves to 3000
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    // configureTunnelIngress fails → returns early after step 2 (L193-194 executed)
    mockConfigureTunnelIngress.mockRejectedValueOnce(new Error('ingress fail'));

    const mgr = new DomainManager('test-project');
    const result = await mgr.connect('gitea', 'git', 'example.com');

    expect(result.success).toBe(false);
    expect(mockConfigureTunnelIngress).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// status() — checkDnsResolution exception (L580) + checkHttpsReachable exception (L595)
// ---------------------------------------------------------------------------

describe('DomainManager.status() — private method exception paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDomainConnections.mockReturnValue([]);
    mockGetActiveServiceRoutes.mockReturnValue([]);
  });

  it('covers checkDnsResolution catch path (L580) when execa throws', async () => {
    const conn = makeConnection();
    const state = makeState({
      domainConnections: [conn],
    });
    mockLoadState.mockReturnValue(state);
    mockListDomainConnections.mockReturnValue([conn]);
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);
    mockGetTunnelHealth.mockResolvedValue({ status: 'inactive', connectorCount: 0 });
    mockGetDnsRecords.mockResolvedValue([]);
    // execa throws for dig — checkDnsResolution returns false via catch (L580)
    mockExecaFn.mockRejectedValueOnce(new Error('dig not found'));

    const mgr = new DomainManager('test-project');
    const results = await mgr.status();

    expect(results).toHaveLength(1);
    expect(results[0]!.external.dnsResolved).toBe(false);
  });

  it('covers checkHttpsReachable catch path (L595) when fetch throws on HTTPS check', async () => {
    const conn = makeConnection();
    const state = makeState({
      domainConnections: [conn],
    });
    mockLoadState.mockReturnValue(state);
    mockListDomainConnections.mockReturnValue([conn]);
    // First fetch call (checkLocalHealth) succeeds; second (checkHttpsReachable) throws
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockRejectedValueOnce(new Error('SSL certificate error'));
    mockGetTunnelHealth.mockResolvedValue({ status: 'inactive', connectorCount: 0 });
    mockGetDnsRecords.mockResolvedValue([]);
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });

    const mgr = new DomainManager('test-project');
    const results = await mgr.status();

    expect(results).toHaveLength(1);
    expect(results[0]!.external.httpsReachable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// connect() — DNS propagation timeout → skipped step (L292-293)
// ---------------------------------------------------------------------------

describe('DomainManager.connect() — DNS propagation timeout (L292-293)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockListDomainConnections.mockReturnValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    // DNS never resolves → poll loop times out
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks dns_propagation as skipped when poll times out', async () => {
    const state = makeState();
    mockLoadState.mockReturnValue(state);
    mockListDomainConnections.mockReturnValue([]);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockGetDnsRecords
      .mockResolvedValueOnce([]) // No existing record → no conflict
      .mockResolvedValueOnce([{ id: 'rec-new', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true }]);
    mockCreateDnsRecord.mockResolvedValue(undefined);

    const mgr = new DomainManager('test-project');
    const connectPromise = mgr.connect('gitea', 'git', 'example.com');

    // Drive the async poll loop past the 30-second DNS timeout
    await jest.advanceTimersByTimeAsync(35_000);

    const result = await connectPromise;

    expect(result.success).toBe(true);
    const pollStep = result.steps.find((s) => s.step === 'dns_propagation');
    expect(pollStep?.status).toBe('skipped');
  });
});
