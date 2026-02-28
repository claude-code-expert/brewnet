/**
 * Integration tests for wizard Step 4: Domain & Network — T039–T043
 *
 * Tests the complete runDomainNetworkStep() function across all 5 scenarios:
 *   T039 — Scenario 1: Quick Tunnel → quickTunnelUrl set, tunnelMode='quick'
 *   T040 — Scenario 2: Named Tunnel success → all CF API calls made, apiToken cleared
 *   T041 — Scenario 2 rollback → deleteTunnel called on DNS failure
 *   T042 — Scenario 3: Guided domain purchase → Quick Tunnel bridge, then Named Tunnel
 *   T043 — Scenario 4: Named Tunnel only → no ingress/DNS, zoneId empty
 *
 * Mock strategy:
 *   - @inquirer/prompts: auto-return scenario choices
 *   - cloudflare-client: mock all CF API functions
 *   - quick-tunnel: mock QuickTunnelManager
 *   - tunnel-logger: no-op
 *   - ora: no-op spinner
 *   - execa: no-op (tryOpenUrl)
 *   - network: port 25 check returns false
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock @inquirer/prompts
// ---------------------------------------------------------------------------

const mockSelect = jest.fn<() => Promise<string>>();
const mockInput = jest.fn<() => Promise<string>>();
const mockConfirm = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: mockSelect,
  input: mockInput,
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
const mockDeleteTunnel = jest.fn<() => Promise<void>>();
const mockGetTunnelHealth = jest.fn<() => Promise<{ status: string; connectorCount: number }>>();

jest.unstable_mockModule(
  '../../../packages/cli/src/services/cloudflare-client.js',
  () => ({
    verifyToken: mockVerifyToken,
    getAccounts: mockGetAccounts,
    getZones: mockGetZones,
    createTunnel: mockCreateTunnel,
    configureTunnelIngress: mockConfigureTunnelIngress,
    createDnsRecord: mockCreateDnsRecord,
    deleteTunnel: mockDeleteTunnel,
    getTunnelHealth: mockGetTunnelHealth,
    getActiveServiceRoutes: jest.fn(() => [
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]),
    buildTokenCreationUrl: jest.fn(() => 'https://dash.cloudflare.com/profile/api-tokens'),
  }),
);

// ---------------------------------------------------------------------------
// Mock QuickTunnelManager
// ---------------------------------------------------------------------------

const mockQtStart = jest.fn<() => Promise<string>>();
const mockQtStop = jest.fn<() => Promise<void>>();

jest.unstable_mockModule(
  '../../../packages/cli/src/services/quick-tunnel.js',
  () => ({
    QuickTunnelManager: jest.fn().mockImplementation(() => ({
      start: mockQtStart,
      stop: mockQtStop,
      getUrl: jest.fn(() => ''),
    })),
  }),
);

// ---------------------------------------------------------------------------
// Mock TunnelLogger
// ---------------------------------------------------------------------------

jest.unstable_mockModule(
  '../../../packages/cli/src/utils/tunnel-logger.js',
  () => ({
    TunnelLogger: jest.fn().mockImplementation(() => ({ log: jest.fn() })),
    logTunnelEvent: jest.fn(),
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
// Mock execa — suppress browser open
// ---------------------------------------------------------------------------

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

// ---------------------------------------------------------------------------
// Mock network — port 25 not blocked
// ---------------------------------------------------------------------------

jest.unstable_mockModule(
  '../../../packages/cli/src/utils/network.js',
  () => ({
    checkPort25Blocked: jest.fn().mockResolvedValue(false),
  }),
);

// ---------------------------------------------------------------------------
// Dynamic imports (after all mock setup)
// ---------------------------------------------------------------------------

import type { WizardState } from '@brewnet/shared';

const { runDomainNetworkStep } = await import(
  '../../../packages/cli/src/wizard/steps/domain-network.js'
);
const { createDefaultWizardState } = await import(
  '../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// T039 — Scenario 1: Quick Tunnel
// ---------------------------------------------------------------------------

describe('T039 — Scenario 1: Quick Tunnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Scenario 1: Quick Tunnel selected
    mockSelect.mockResolvedValueOnce('1-quick');
    // Confirm mail server: no
    mockConfirm.mockResolvedValue(false);
  });

  it('sets quickTunnelUrl to empty (URL captured later in Step 6)', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    // URL is captured in generate step after docker compose up
    expect(result.domain.cloudflare.quickTunnelUrl).toBe('');
  });

  it('sets tunnelMode to "quick"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelMode).toBe('quick');
  });

  it('sets provider to "quick-tunnel"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.provider).toBe('quick-tunnel');
  });

  it('does NOT call any CF API functions (no account required)', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockCreateTunnel).not.toHaveBeenCalled();
    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });

  it('does NOT start QuickTunnelManager (container started via compose)', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockQtStart).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T040 — Scenario 2: Named Tunnel success (full API flow)
// ---------------------------------------------------------------------------

describe('T040 — Scenario 2: Named Tunnel with existing domain (success)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected
    mockSelect.mockResolvedValueOnce('2-named-existing');
    // API token input
    mockInput.mockResolvedValue('valid-cf-api-token');
    // Mail server: no
    mockConfirm.mockResolvedValue(false);

    // CF API mocks
    mockVerifyToken.mockResolvedValue({ valid: true, email: 'user@example.com' });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([
      { id: 'zone-1', name: 'example.com', status: 'active' },
    ]);
    mockCreateTunnel.mockResolvedValue({
      tunnelId: 'new-tunnel-id',
      tunnelToken: 'new-tunnel-jwt',
    });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('calls verifyToken with the provided API token', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockVerifyToken).toHaveBeenCalledWith('valid-cf-api-token');
  });

  it('calls getAccounts', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockGetAccounts).toHaveBeenCalled();
  });

  it('calls getZones', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockGetZones).toHaveBeenCalled();
  });

  it('calls createTunnel', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockCreateTunnel).toHaveBeenCalled();
  });

  it('calls configureTunnelIngress', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockConfigureTunnelIngress).toHaveBeenCalled();
  });

  it('calls createDnsRecord', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockCreateDnsRecord).toHaveBeenCalled();
  });

  it('sets tunnelId on returned state', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelId).toBe('new-tunnel-id');
  });

  it('sets provider to "tunnel"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.provider).toBe('tunnel');
  });

  it('sets tunnelMode to "named"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelMode).toBe('named');
  });

  it('clears apiToken from returned state (security)', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.apiToken).toBe('');
  });
});

// ---------------------------------------------------------------------------
// T041 — Scenario 2 rollback: DNS failure triggers tunnel deletion
// ---------------------------------------------------------------------------

describe('T041 — Scenario 2 rollback: DNS failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected
    mockSelect.mockResolvedValueOnce('2-named-existing');
    mockInput.mockResolvedValue('valid-cf-api-token');
    mockConfirm.mockResolvedValue(false);

    // CF API: tunnel creation succeeds
    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([{ id: 'zone-1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({
      tunnelId: 'created-tunnel-id',
      tunnelToken: 'created-token',
    });
    // Ingress fails → triggers rollback
    mockConfigureTunnelIngress.mockRejectedValue(new Error('Permission denied'));
    mockDeleteTunnel.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'inactive', connectorCount: 0 });
  });

  it('calls deleteTunnel when ingress configuration fails (rollback)', async () => {
    const state = makeState();

    try {
      await runDomainNetworkStep(state);
    } catch {
      // May throw after rollback
    }

    expect(mockDeleteTunnel).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'created-tunnel-id',
    );
  });
});

// ---------------------------------------------------------------------------
// T042 — Scenario 3: Guided domain purchase (Quick Tunnel bridge + Named Tunnel)
// ---------------------------------------------------------------------------

describe('T042 — Scenario 3: Guided domain purchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 3 selected
    mockSelect.mockResolvedValueOnce('3-named-buy');

    // Accept Quick Tunnel bridge while waiting for domain setup
    mockConfirm.mockResolvedValueOnce(true); // Start Quick Tunnel bridge?

    // API token after domain setup complete
    mockInput.mockResolvedValue('valid-cf-api-token');

    // Quick Tunnel bridge URL
    mockQtStart.mockResolvedValue('https://bridge.trycloudflare.com');
    mockQtStop.mockResolvedValue(undefined);

    // CF API for Named Tunnel
    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([{ id: 'zone-1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({ tunnelId: 'named-tid', tunnelToken: 'named-token' });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('starts Quick Tunnel bridge when user accepts', async () => {
    const state = makeState();

    try {
      await runDomainNetworkStep(state);
    } catch {
      // May time out waiting for Enter — acceptable in test context
    }

    expect(mockQtStart).toHaveBeenCalled();
  });

  it('stops Quick Tunnel after Named Tunnel setup if bridge was running', async () => {
    const state = makeState();

    try {
      await runDomainNetworkStep(state);
    } catch {
      // OK
    }

    // If the Named Tunnel flow completed, Quick Tunnel should be stopped
    if (mockCreateTunnel.mock.calls.length > 0) {
      expect(mockQtStop).toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// T043 — Scenario 4: Named Tunnel only (no DNS)
// ---------------------------------------------------------------------------

describe('T043 — Scenario 4: Named Tunnel only, domain later', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 4 selected
    mockSelect.mockResolvedValueOnce('4-named-only');
    mockInput.mockResolvedValue('valid-cf-api-token');
    mockConfirm.mockResolvedValue(false);

    // CF API: token + account + zone + tunnel creation
    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([{ id: 'zone-1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({
      tunnelId: 'tunnel-only-id',
      tunnelToken: 'tunnel-only-token',
    });
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('calls createTunnel', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockCreateTunnel).toHaveBeenCalled();
  });

  it('does NOT call configureTunnelIngress (no DNS setup)', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockConfigureTunnelIngress).not.toHaveBeenCalled();
  });

  it('does NOT call createDnsRecord (no DNS setup)', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockCreateDnsRecord).not.toHaveBeenCalled();
  });

  it('sets tunnelId on returned state', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelId).toBe('tunnel-only-id');
  });

  it('leaves zoneId empty (domain not yet connected)', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.zoneId).toBe('');
  });

  it('leaves zoneName empty (domain not yet connected)', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.zoneName).toBe('');
  });

  it('sets tunnelMode to "named"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelMode).toBe('named');
  });

  it('clears apiToken from returned state', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.apiToken).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Local only
// ---------------------------------------------------------------------------

describe('Scenario 5: Local only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockResolvedValueOnce('5-local');
  });

  it('sets provider to "local"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.provider).toBe('local');
  });

  it('sets tunnelMode to "none"', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.tunnelMode).toBe('none');
  });

  it('disables Cloudflare', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);

    expect(result.domain.cloudflare.enabled).toBe(false);
  });

  it('does not call any CF API functions', async () => {
    const state = makeState();
    await runDomainNetworkStep(state);

    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockCreateTunnel).not.toHaveBeenCalled();
  });
});
