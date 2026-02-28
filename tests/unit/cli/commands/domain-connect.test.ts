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
