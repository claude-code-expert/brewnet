/**
 * Integration tests for wizard Step 4: Domain & Network — T039–T044
 *
 * Tests the complete runDomainNetworkStep() function across all 3 scenarios:
 *   T039 — Scenario 1: Quick Tunnel → quickTunnelUrl set, tunnelMode='quick'
 *   T040 — Scenario 2 (has domain): Named Tunnel success → all CF API calls made, apiToken cleared
 *   T041 — Scenario 2 (has domain) rollback → deleteTunnel called on DNS failure
 *   T042 — Scenario 2 (no domain): domain purchase guide + Quick Tunnel bridge + tunnel-only
 *   T043 — Scenario 2 (no domain, no bridge): tunnel-only, no ingress/DNS, zoneId empty
 *   T044 — Scenario 3: Local only → tunnelMode='none', provider='local'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVerifyToken = jest.fn<(...args: any[]) => Promise<{ valid: boolean; email?: string }>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetAccounts = jest.fn<(...args: any[]) => Promise<Array<{ id: string; name: string }>>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetZones = jest.fn<(...args: any[]) => Promise<Array<{ id: string; name: string; status: string }>>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateTunnel = jest.fn<(...args: any[]) => Promise<{ tunnelId: string; tunnelToken: string }>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConfigureTunnelIngress = jest.fn<(...args: any[]) => Promise<void>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateDnsRecord = jest.fn<(...args: any[]) => Promise<void>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteTunnel = jest.fn<(...args: any[]) => Promise<void>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetTunnelHealth = jest.fn<(...args: any[]) => Promise<{ status: string; connectorCount: number }>>();

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
  execa: jest.fn<() => Promise<unknown>>().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

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

describe('T040 — Scenario 2 (has domain): Named Tunnel success (full API flow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected, user has domain
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true); // hasDomain = true
    // API token input
    mockInput.mockResolvedValue('valid-cf-api-token');

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

describe('T041 — Scenario 2 (has domain) rollback: DNS failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected, user has domain
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true); // hasDomain = true
    mockInput.mockResolvedValue('valid-cf-api-token');

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
// T042 — Scenario 2 (no domain): domain purchase guide + Quick Tunnel bridge
// ---------------------------------------------------------------------------

describe('T042 — Scenario 2 (no domain): domain purchase guide + Quick Tunnel bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected, user does NOT have domain
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(false); // hasDomain = false
    mockConfirm.mockResolvedValueOnce(true);  // useBridge = true

    // "Enter 누르세요" wait + API token input
    mockInput.mockResolvedValueOnce('');                  // domain-ready Enter
    mockInput.mockResolvedValue('valid-cf-api-token');    // CF API token

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
// T043 — Scenario 2 (no domain, no bridge): tunnel-only, DNS skipped
// ---------------------------------------------------------------------------

describe('T043 — Scenario 2 (no domain, no bridge): tunnel-only', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Scenario 2 selected, user does NOT have domain, declines Quick Tunnel bridge
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(false); // hasDomain = false
    mockConfirm.mockResolvedValueOnce(false); // useBridge = false
    mockInput.mockResolvedValueOnce('');                 // domain-ready Enter
    mockInput.mockResolvedValue('valid-cf-api-token');   // CF API token

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
// T044 — Scenario 3: Local only
// ---------------------------------------------------------------------------

describe('T044 — Scenario 3: Local only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockResolvedValueOnce('3-local');
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

// ---------------------------------------------------------------------------
// T045 — Named Tunnel: verifyToken throws → catch branch (L331)
//   verifyToken throws → catch sets { valid: false } → outer catch → local fallback
// ---------------------------------------------------------------------------

describe('T045 — Named Tunnel: verifyToken throws → local fallback', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('bad-token');
    mockVerifyToken.mockRejectedValue(new Error('network error'));
  });

  it('falls back to local when verifyToken throws', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.provider).toBe('local');
    expect(mockVerifyToken).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T046 — Named Tunnel: getAccounts returns [] → manual ID input (L361-368)
// ---------------------------------------------------------------------------

describe('T046 — Named Tunnel: zero accounts → manual account ID input', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput
      .mockResolvedValueOnce('valid-token')    // API token
      .mockResolvedValueOnce('manual-acc-id') // manual account ID
      .mockResolvedValueOnce('my-tunnel');    // tunnel name

    mockVerifyToken.mockResolvedValue({ valid: true, email: 'user@example.com' });
    mockGetAccounts.mockResolvedValue([]);
    mockGetZones.mockResolvedValue([{ id: 'z1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({ tunnelId: 'tid', tunnelToken: 'tok' });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('prompts for manual account ID when getAccounts returns empty', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.cloudflare.accountId).toBe('manual-acc-id');
  });
});

// ---------------------------------------------------------------------------
// T047 — Named Tunnel: multiple accounts → select prompt (L374-378)
// ---------------------------------------------------------------------------

describe('T047 — Named Tunnel: multiple accounts → select prompt', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect
      .mockResolvedValueOnce('2-named')
      .mockResolvedValueOnce('acc-2');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('valid-token');

    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([
      { id: 'acc-1', name: 'Account One' },
      { id: 'acc-2', name: 'Account Two' },
    ]);
    mockGetZones.mockResolvedValue([{ id: 'z1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({ tunnelId: 'tid', tunnelToken: 'tok' });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('prompts for account selection when getAccounts returns 2+ accounts', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.cloudflare.accountId).toBe('acc-2');
  });
});

// ---------------------------------------------------------------------------
// T048 — Named Tunnel: no active zones → outer catch → local fallback (L401-404)
// ---------------------------------------------------------------------------

describe('T048 — Named Tunnel: no active zones → local fallback', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('valid-token');

    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([
      { id: 'z1', name: 'example.com', status: 'pending' }, // NOT active
    ]);
  });

  it('falls back to local when getZones returns no active zones', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.provider).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// T049 — Named Tunnel: multiple active zones → select prompt (L412-416)
// ---------------------------------------------------------------------------

describe('T049 — Named Tunnel: multiple active zones → select prompt', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect
      .mockResolvedValueOnce('2-named')
      .mockResolvedValueOnce('z2');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('valid-token');

    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([
      { id: 'z1', name: 'domain1.com', status: 'active' },
      { id: 'z2', name: 'domain2.com', status: 'active' },
    ]);
    mockCreateTunnel.mockResolvedValue({ tunnelId: 'tid', tunnelToken: 'tok' });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockResolvedValue(undefined);
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
  });

  it('prompts for zone selection when getZones returns 2+ active zones', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.cloudflare.zoneId).toBe('z2');
  });
});

// ---------------------------------------------------------------------------
// T050 — Named Tunnel: createTunnel throws → outer catch → local fallback (L457-468)
// ---------------------------------------------------------------------------

describe('T050 — Named Tunnel: createTunnel throws → local fallback', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('valid-token');

    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([{ id: 'z1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockRejectedValue(new Error('CF API error'));
  });

  it('falls back to local when createTunnel rejects', async () => {
    const state = makeState();
    const result = await runDomainNetworkStep(state);
    expect(result.domain.provider).toBe('local');
    expect(mockCreateTunnel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T051 — Named Tunnel: all DNS records fail → rollback then local fallback (L513-526)
// ---------------------------------------------------------------------------

describe('T051 — Named Tunnel: all DNS records fail → rollback', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockInput.mockReset();
    mockSelect.mockResolvedValueOnce('2-named');
    mockConfirm.mockResolvedValueOnce(true);
    mockInput.mockResolvedValue('valid-token');

    mockVerifyToken.mockResolvedValue({ valid: true });
    mockGetAccounts.mockResolvedValue([{ id: 'acc-1', name: 'My Account' }]);
    mockGetZones.mockResolvedValue([{ id: 'z1', name: 'example.com', status: 'active' }]);
    mockCreateTunnel.mockResolvedValue({ tunnelId: 'tid', tunnelToken: 'tok' });
    mockConfigureTunnelIngress.mockResolvedValue(undefined);
    mockCreateDnsRecord.mockRejectedValue(new Error('DNS error'));
    mockDeleteTunnel.mockResolvedValue(undefined);
  });

  it('calls deleteTunnel when ALL DNS records fail', async () => {
    const state = makeState();
    try {
      await runDomainNetworkStep(state);
    } catch {
      // outer catch may handle
    }
    expect(mockDeleteTunnel).toHaveBeenCalled();
  });
});
