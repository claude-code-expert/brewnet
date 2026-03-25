/**
 * Unit tests for `brewnet domain connect` command — T036, T037, T038
 *
 * Verifies the three execution paths:
 *   - Path A (tunnelMode='quick'): Quick→Named migration; new tunnel created,
 *     old container stopped, state.tunnelMode → 'named', quickTunnelUrl cleared
 *   - Path B (tunnelMode='named', zoneId=''): Attach domain to Named Tunnel;
 *     existing tunnelId reused, DNS records created, zoneId persisted
 *   - CNAME conflict (T038): When createDnsRecord gets 409 "already exists",
 *     domain connect still completes without throwing
 *
 * Mock strategy:
 *   - @inquirer/prompts: auto-return fixed values (token, account, zone)
 *   - cloudflare-client: mock API calls
 *   - wizard/state: mock load/save
 *   - quick-tunnel: mock QuickTunnelManager.stop()
 *   - tunnel-logger: no-op
 *   - ora: no-op spinner
 *   - dockerode: not needed (domain connect doesn't directly use Docker)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mock @inquirer/prompts — auto-answer all prompts
// ---------------------------------------------------------------------------

const mockInput = jest.fn<() => Promise<string>>();
const mockSelect = jest.fn<() => Promise<string>>();
const mockConfirm = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  input: mockInput,
  select: mockSelect,
  confirm: mockConfirm,
  password: jest.fn(),
  checkbox: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock cloudflare-client
// ---------------------------------------------------------------------------

const mockVerifyToken = jest.fn<() => Promise<{ valid: boolean; email?: string }>>();
const mockGetAccounts = jest.fn<() => Promise<Array<{ id: string; name: string }>>>();
const mockGetZones = jest.fn<() => Promise<Array<{ id: string; name: string; status: string }>>>();
const mockCreateTunnel = jest.fn<() => Promise<{ tunnelId: string; tunnelToken: string }>>();
const mockConfigureTunnelIngress = jest.fn<() => Promise<void>>();
const mockCreateDnsRecord = jest.fn<() => Promise<void>>();
const mockGetTunnelHealth = jest.fn();
const mockDeleteTunnel = jest.fn<() => Promise<void>>();
const mockGetActiveServiceRoutes = jest.fn<() => Array<{ subdomain: string; containerName: string; port: number }>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/cloudflare-client.js',
  () => ({
    verifyToken: mockVerifyToken,
    getAccounts: mockGetAccounts,
    getZones: mockGetZones,
    createTunnel: mockCreateTunnel,
    configureTunnelIngress: mockConfigureTunnelIngress,
    createDnsRecord: mockCreateDnsRecord,
    getTunnelHealth: mockGetTunnelHealth,
    deleteTunnel: mockDeleteTunnel,
    getActiveServiceRoutes: mockGetActiveServiceRoutes,
    buildTokenCreationUrl: jest.fn(() => 'https://dash.cloudflare.com/create-token'),
  }),
);

// ---------------------------------------------------------------------------
// Mock wizard/state
// ---------------------------------------------------------------------------

const mockLoadState = jest.fn();
const mockSaveState = jest.fn();
const mockGetLastProject = jest.fn<() => string | null>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/wizard/state.js',
  () => ({
    loadState: mockLoadState,
    saveState: mockSaveState,
    getLastProject: mockGetLastProject,
  }),
);

// ---------------------------------------------------------------------------
// Mock TunnelLogger
// ---------------------------------------------------------------------------

const mockTunnelLog = jest.fn();

jest.unstable_mockModule(
  '../../../../packages/cli/src/utils/tunnel-logger.js',
  () => ({
    TunnelLogger: jest.fn().mockImplementation(() => ({ log: mockTunnelLog })),
    logTunnelEvent: jest.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Mock DomainManager
// ---------------------------------------------------------------------------

const mockDomainManagerConnect = jest.fn<() => unknown>();
const mockDomainManagerDisconnect = jest.fn<() => unknown>();
const mockDomainManagerList = jest.fn<() => unknown>();
const mockDomainManagerStatus = jest.fn<() => unknown>();
const mockDomainManagerGetConnectableApps = jest.fn<() => unknown>();
const mockDomainManagerGetState = jest.fn<() => unknown>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/domain-manager.js',
  () => ({
    DomainManager: jest.fn().mockImplementation(() => ({
      connect: mockDomainManagerConnect,
      disconnect: mockDomainManagerDisconnect,
      list: mockDomainManagerList,
      status: mockDomainManagerStatus,
      getConnectableApps: mockDomainManagerGetConnectableApps,
      getState: mockDomainManagerGetState,
      reload: jest.fn(),
    })),
  }),
);

// ---------------------------------------------------------------------------
// Mock QuickTunnelManager
// ---------------------------------------------------------------------------

const mockQtStop = jest.fn<() => Promise<void>>();
const mockQtStart = jest.fn<() => Promise<string>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/quick-tunnel.js',
  () => ({
    QuickTunnelManager: jest.fn().mockImplementation(() => ({
      start: mockQtStart,
      stop: mockQtStop,
      getUrl: jest.fn(() => 'https://old-quick.trycloudflare.com'),
    })),
  }),
);

// ---------------------------------------------------------------------------
// Mock ora — no-op spinner
// ---------------------------------------------------------------------------

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
  })),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mock setup)
// ---------------------------------------------------------------------------

import type { WizardState } from '@brewnet/shared';

const { registerDomainCommand } = await import(
  '../../../../packages/cli/src/commands/domain.js'
);
const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return p;
}

async function runDomainConnect(program: Command): Promise<void> {
  try {
    await program.parseAsync(['domain', 'connect'], { from: 'user' });
  } catch {
    // Absorb Commander exits and process.exit mocks
  }
}

function makeQuickTunnelState(): WizardState {
  const state = createDefaultWizardState();
  return {
    ...state,
    projectName: 'my-server',
    domain: {
      ...state.domain,
      provider: 'quick-tunnel',
      cloudflare: {
        ...state.domain.cloudflare,
        enabled: true,
        tunnelMode: 'quick',
        quickTunnelUrl: 'https://old-quick.trycloudflare.com',
        tunnelId: '',
        tunnelToken: '',
        tunnelName: '',
        accountId: '',
        zoneId: '',
        zoneName: '',
      },
    },
  };
}

function makeNamedTunnelNoZoneState(): WizardState {
  const state = createDefaultWizardState();
  return {
    ...state,
    projectName: 'my-server',
    domain: {
      ...state.domain,
      provider: 'tunnel',
      cloudflare: {
        ...state.domain.cloudflare,
        enabled: true,
        tunnelMode: 'named',
        quickTunnelUrl: '',
        tunnelId: 'existing-tunnel-id',
        tunnelToken: 'existing-token',
        tunnelName: 'my-server',
        accountId: 'acc-123',
        zoneId: '',   // No zone yet → Path B
        zoneName: '',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Default mock setup
// ---------------------------------------------------------------------------

function setupDefaultMocks(): void {
  // Prompts: auto-return fixed values
  mockInput.mockResolvedValue('valid-api-token');
  mockSelect.mockResolvedValue('acc-123'); // account selection

  // CF API
  mockVerifyToken.mockResolvedValue({ valid: true, email: 'user@example.com' });
  mockGetAccounts.mockResolvedValue([{ id: 'acc-123', name: 'My Account' }]);
  mockGetZones.mockResolvedValue([
    { id: 'zone-456', name: 'example.com', status: 'active' },
  ]);
  mockCreateTunnel.mockResolvedValue({
    tunnelId: 'new-tunnel-id',
    tunnelToken: 'new-tunnel-token',
  });
  mockConfigureTunnelIngress.mockResolvedValue(undefined);
  mockCreateDnsRecord.mockResolvedValue(undefined);
  mockDeleteTunnel.mockResolvedValue(undefined);
  mockGetActiveServiceRoutes.mockReturnValue([
    { subdomain: 'git', containerName: 'gitea', port: 3000 },
  ]);

  // Quick Tunnel stop
  mockQtStop.mockResolvedValue(undefined);

  // State
  mockGetLastProject.mockReturnValue('my-server');
}

// ---------------------------------------------------------------------------
// T036 — Path A: Quick Tunnel → Named Tunnel migration
// ---------------------------------------------------------------------------

describe('domain connect — Path A (Quick Tunnel → Named Tunnel)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeQuickTunnelState());
  });

  it('calls createTunnel when migrating from Quick Tunnel', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockCreateTunnel).toHaveBeenCalledWith(
      expect.any(String), // apiToken
      expect.any(String), // accountId
      expect.any(String), // tunnelName
    );
  });

  it('calls configureTunnelIngress with new tunnelId', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockConfigureTunnelIngress).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'new-tunnel-id',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('calls QuickTunnelManager.stop() to stop the old Quick Tunnel', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockQtStop).toHaveBeenCalled();
  });

  it('saves state with tunnelMode="named" after migration', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            tunnelMode: 'named',
          }),
        }),
      }),
    );
  });

  it('saves state with new tunnelId after migration', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            tunnelId: 'new-tunnel-id',
          }),
        }),
      }),
    );
  });

  it('saves state with quickTunnelUrl cleared after migration', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            quickTunnelUrl: '',
          }),
        }),
      }),
    );
  });

  it('clears apiToken from saved state (security)', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            apiToken: '',
          }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// T037 — Path B: Named Tunnel with no DNS → attach domain
// ---------------------------------------------------------------------------

describe('domain connect — Path B (Named Tunnel, no zone → attach domain)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeNamedTunnelNoZoneState());
  });

  it('does NOT call createTunnel (existing tunnelId reused)', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });

  it('calls configureTunnelIngress with the EXISTING tunnelId', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockConfigureTunnelIngress).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'existing-tunnel-id', // existing, NOT new
      expect.any(String),
      expect.any(Array),
    );
  });

  it('calls createDnsRecord for each active service route', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockCreateDnsRecord).toHaveBeenCalled();
  });

  it('saves state with zoneId persisted', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            zoneId: 'zone-456',
          }),
        }),
      }),
    );
  });

  it('saves state with zoneName persisted', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            zoneName: 'example.com',
          }),
        }),
      }),
    );
  });

  it('does NOT call QuickTunnelManager.stop()', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    expect(mockQtStop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T038 — CNAME conflict: existing record updated (upserted) not duplicated
// ---------------------------------------------------------------------------

describe('domain connect — T038 CNAME conflict (409 upsert)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeNamedTunnelNoZoneState());
  });

  it('completes successfully when createDnsRecord returns 409 (already exists)', async () => {
    // Simulate 409 "already exists" — the implementation treats this as non-fatal
    mockCreateDnsRecord.mockRejectedValue(
      Object.assign(new Error('Record already exists'), { code: 409 }),
    );

    const p = makeProgram();
    registerDomainCommand(p);

    // Should not throw despite DNS record already existing
    await expect(runDomainConnect(p)).resolves.toBeUndefined();
    expect(mockSaveState).toHaveBeenCalled();
  });

  it('saves state with zoneId even when DNS records already exist', async () => {
    mockCreateDnsRecord.mockRejectedValue(new Error('Record already exists'));

    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    // State should still be saved with the zoneId
    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          cloudflare: expect.objectContaining({
            zoneId: 'zone-456',
          }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Guard: tunnelMode='none' exits immediately
// ---------------------------------------------------------------------------

describe('domain connect — guard: tunnelMode=none', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('exits without calling CF API when tunnelMode is none', async () => {
    const state = createDefaultWizardState();
    // Default state has tunnelMode='none'
    mockGetLastProject.mockReturnValue('my-server');
    mockLoadState.mockReturnValue(state);

    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => { throw new Error('process.exit(1)'); });

    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnect(p);

    mockExit.mockRestore();
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T016 — domain connect --domain (external domain connection via DomainManager)
// ---------------------------------------------------------------------------

describe('domain connect --domain (external domain connection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const state = createDefaultWizardState();
    const stateWithTunnel = {
      ...state,
      projectName: 'my-server',
      domainConnections: [],
      domain: {
        ...state.domain,
        provider: 'tunnel' as const,
        cloudflare: {
          ...state.domain.cloudflare,
          enabled: true,
          tunnelMode: 'named' as const,
          tunnelId: 'tun-123',
          tunnelToken: 'tok-123',
          tunnelName: 'my-server',
          accountId: 'acc-123',
          apiToken: 'test-token',
          zoneId: 'zone-456',
          zoneName: 'example.com',
        },
      },
    };

    mockDomainManagerGetState.mockReturnValue(stateWithTunnel);
    mockDomainManagerConnect.mockResolvedValue({
      success: true,
      hostname: 'my-api.example.com',
      externalUrl: 'https://my-api.example.com',
      steps: [
        { step: 'health_check', status: 'completed', durationMs: 50 },
        { step: 'ingress_update', status: 'completed', durationMs: 200 },
        { step: 'dns_creation', status: 'completed', durationMs: 300 },
        { step: 'traefik_labels', status: 'completed' },
        { step: 'dns_propagation', status: 'completed', durationMs: 3200 },
      ],
    });
  });

  async function runDomainConnectWithDomain(program: Command, app: string, domain: string, force = false): Promise<void> {
    try {
      const args = ['domain', 'connect', app, '--domain', domain];
      if (force) args.push('--force');
      await program.parseAsync(args, { from: 'user' });
    } catch {
      // Absorb exits
    }
  }

  it('calls DomainManager.connect() when --domain is provided', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnectWithDomain(p, 'my-api', 'my-api.example.com');

    expect(mockDomainManagerConnect).toHaveBeenCalledWith(
      'my-api',
      'my-api',
      'example.com',
      expect.objectContaining({ force: false }),
    );
  });

  it('passes --force flag to DomainManager.connect()', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnectWithDomain(p, 'my-api', 'my-api.example.com', true);

    expect(mockDomainManagerConnect).toHaveBeenCalledWith(
      'my-api',
      'my-api',
      'example.com',
      expect.objectContaining({ force: true }),
    );
  });

  it('does NOT call legacy flow (verifyToken, createTunnel) when --domain is used', async () => {
    const p = makeProgram();
    registerDomainCommand(p);

    await runDomainConnectWithDomain(p, 'my-api', 'my-api.example.com');

    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });

  it('shows Scenario C CNAME instructions when zoneId is empty', async () => {
    const stateNoZone = createDefaultWizardState();
    const stateWithTunnelNoZone = {
      ...stateNoZone,
      projectName: 'my-server',
      domainConnections: [],
      domain: {
        ...stateNoZone.domain,
        provider: 'tunnel' as const,
        cloudflare: {
          ...stateNoZone.domain.cloudflare,
          enabled: true,
          tunnelMode: 'named' as const,
          tunnelId: 'tun-123',
          tunnelToken: 'tok-123',
          tunnelName: 'my-server',
          accountId: 'acc-123',
          apiToken: 'test-token',
          zoneId: '',  // No zone → Scenario C
          zoneName: '',
        },
      },
    };
    mockDomainManagerGetState.mockReturnValue(stateWithTunnelNoZone);

    const p = makeProgram();
    registerDomainCommand(p);

    // Should not call DomainManager.connect() — just display instructions
    await runDomainConnectWithDomain(p, 'my-api', 'my-api.example.com');

    expect(mockDomainManagerConnect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Legacy connect — error and edge cases (L142-143, L150-151, L162, L166, L171, L173, L185-186, L197, L199)
// ---------------------------------------------------------------------------

describe('domain connect — legacy: error and edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeQuickTunnelState());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows invalid token error and exits with code 2 when verifyToken returns valid=false', async () => {
    mockVerifyToken.mockResolvedValue({ valid: false });
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:2'); });
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockExit).toHaveBeenCalledWith(2);
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });

  it('shows verify failure and exits with code 2 when verifyToken throws', async () => {
    mockVerifyToken.mockRejectedValue(new Error('Network timeout'));
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:2'); });
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockExit).toHaveBeenCalledWith(2);
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });

  it('prompts for manual account ID when getAccounts returns empty and proceeds to createTunnel', async () => {
    mockGetAccounts.mockResolvedValue([]);
    mockInput
      .mockResolvedValueOnce('valid-api-token')
      .mockResolvedValueOnce('manual-acc-id');
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockCreateTunnel).toHaveBeenCalled();
  });

  it('shows account select prompt when getAccounts returns multiple entries', async () => {
    mockGetAccounts.mockResolvedValue([
      { id: 'acc-1', name: 'Account One' },
      { id: 'acc-2', name: 'Account Two' },
    ]);
    mockSelect.mockResolvedValue('acc-1');
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockCreateTunnel).toHaveBeenCalled();
  });

  it('shows error and exits with code 4 when no active zones found', async () => {
    mockGetZones.mockResolvedValue([]);
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:4'); });
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockExit).toHaveBeenCalledWith(4);
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });

  it('shows zone select prompt when multiple active zones exist', async () => {
    mockGetZones.mockResolvedValue([
      { id: 'zone-456', name: 'example.com', status: 'active' },
      { id: 'zone-789', name: 'other.com', status: 'active' },
    ]);
    mockSelect.mockResolvedValue('zone-456');
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockCreateTunnel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path C: Named Tunnel with existing zone → re-sync ingress + DNS (L218-221)
// ---------------------------------------------------------------------------

describe('domain connect — Path C (Named Tunnel, existing zone → re-sync)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    // Named tunnel with a zone already set → Path C; reuse base state with zoneId override
    const state = makeNamedTunnelNoZoneState();
    state.domain.cloudflare.zoneId = 'zone-456';
    mockLoadState.mockReturnValue(state);
  });

  it('calls configureTunnelIngress with existing tunnelId (Path C re-sync)', async () => {
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockCreateTunnel).not.toHaveBeenCalled();
    expect(mockConfigureTunnelIngress).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'existing-tunnel-id',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('warns but succeeds when configureTunnelIngress throws in Path C (L729)', async () => {
    mockConfigureTunnelIngress.mockRejectedValueOnce(new Error('CF ingress fail in C'));
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    // Path C non-fatal ingress failure → warn but still saves state
    expect(mockSaveState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path A — createTunnel failure (L585-586)
// ---------------------------------------------------------------------------

describe('domain connect — Path A: createTunnel failure (L585-586)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeQuickTunnelState());
  });

  it('aborts without saving state when createTunnel throws (L585-586)', async () => {
    mockCreateTunnel.mockRejectedValue(new Error('CF tunnel creation failed'));
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockSaveState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path A — QuickTunnel stop failure (L625)
// ---------------------------------------------------------------------------

describe('domain connect — Path A: QuickTunnel stop failure (L625)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeQuickTunnelState());
  });

  it('warns but continues when QuickTunnel stop throws in Path A (L625)', async () => {
    mockQtStop.mockRejectedValue(new Error('Docker stop failed'));
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    // Even with stop failure, state is saved (migration completed)
    expect(mockSaveState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path B — ingress failure (L671-672)
// ---------------------------------------------------------------------------

describe('domain connect — Path B: ingress failure (L671-672)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockLoadState.mockReturnValue(makeNamedTunnelNoZoneState());
  });

  it('aborts without saving state when ingress throws in Path B (L671-672)', async () => {
    mockConfigureTunnelIngress.mockRejectedValue(new Error('CF ingress failed in B'));
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockSaveState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path B — no tunnelId throws (L659)
// ---------------------------------------------------------------------------

describe('domain connect — Path B: missing tunnelId throws (L659)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    // Named mode with no zone (→ Path B) AND no tunnelId (→ line 659 throws)
    const state = makeNamedTunnelNoZoneState();
    state.domain.cloudflare.tunnelId = '';
    mockLoadState.mockReturnValue(state);
  });

  it('throws when tunnelId is empty in Path B (L659)', async () => {
    const p = makeProgram();
    registerDomainCommand(p);
    // runDomainConnect absorbs the thrown error — just verify no save
    await runDomainConnect(p);
    expect(mockSaveState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Path C — no tunnelId throws (L717)
// ---------------------------------------------------------------------------

describe('domain connect — Path C: missing tunnelId throws (L717)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    // Named tunnel with zone (→ Path C) but no tunnelId (→ line 717 throws)
    const state = makeNamedTunnelNoZoneState();
    state.domain.cloudflare.zoneId = 'zone-already-set';
    state.domain.cloudflare.tunnelId = '';
    mockLoadState.mockReturnValue(state);
  });

  it('throws when tunnelId is empty in Path C (L717)', async () => {
    const p = makeProgram();
    registerDomainCommand(p);
    await runDomainConnect(p);
    expect(mockSaveState).not.toHaveBeenCalled();
  });
});
