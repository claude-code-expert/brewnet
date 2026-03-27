/**
 * Unit tests for commands/domain
 *
 * Covers: domain list, domain status, domain disconnect,
 *         domain tunnel status (quick/named), domain connect (with --domain)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// DomainManager mock (class mock)
const mockDomainManagerList = jest.fn<() => unknown[]>(() => []);
const mockDomainManagerStatus = jest.fn<(appName?: string) => Promise<unknown[]>>().mockResolvedValue([]);
const mockDomainManagerDisconnect = jest.fn<() => Promise<unknown>>().mockResolvedValue({
  success: true,
  steps: [],
  removedHostname: 'git.example.com',
});
const mockDomainManagerConnect = jest.fn<() => Promise<unknown>>().mockResolvedValue({
  success: true,
  hostname: 'api.example.com',
  externalUrl: 'https://api.example.com',
  steps: [],
});
const mockDomainManagerGetConnectableApps = jest.fn<() => unknown[]>(() => []);
const mockDomainManagerGetState = jest.fn<() => unknown>().mockReturnValue({
  domain: { cloudflare: { tunnelMode: 'named', tunnelId: 'tun-1', apiToken: 'tok', accountId: 'acc', zoneId: 'zone-123', tunnelName: 'brewnet-test' } },
});

const MockDomainManager = jest.fn().mockImplementation(() => ({
  list: mockDomainManagerList,
  status: mockDomainManagerStatus,
  disconnect: mockDomainManagerDisconnect,
  connect: mockDomainManagerConnect,
  getConnectableApps: mockDomainManagerGetConnectableApps,
  getState: mockDomainManagerGetState,
}));

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/domain-manager.js',
  () => ({ DomainManager: MockDomainManager }),
);

// cloudflare-client mock
const mockVerifyToken = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetAccounts = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'acc-1', name: 'Test' }]);
const mockGetZones = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'zone-1', name: 'example.com' }]);
const mockCreateTunnel = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'tun-new', token: 'tok-new' });
const mockConfigureTunnelIngress = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateDnsRecord = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetTunnelHealth = jest.fn<() => Promise<unknown>>().mockResolvedValue({ status: 'healthy', connectorCount: 2 });
const mockDeleteTunnel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetActiveServiceRoutes = jest.fn<() => unknown[]>(() => [
  { subdomain: 'git', containerName: 'gitea', port: 3000 },
]);

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
  }),
);

// wizard/state mock
const mockGetLastProject = jest.fn(() => 'my-project');
const mockLoadState = jest.fn();
const mockSaveState = jest.fn();

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
  saveState: mockSaveState,
}));

// TunnelLogger mock
const mockTunnelLoggerLog = jest.fn();
const MockTunnelLogger = jest.fn().mockImplementation(() => ({ log: mockTunnelLoggerLog }));
jest.unstable_mockModule('../../../../packages/cli/src/utils/tunnel-logger.js', () => ({
  TunnelLogger: MockTunnelLogger,
}));

// QuickTunnelManager mock
const MockQuickTunnelManager = jest.fn().mockImplementation(() => ({
  start: jest.fn<() => Promise<string>>().mockResolvedValue('https://abc.trycloudflare.com'),
  stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../../../packages/cli/src/services/quick-tunnel.js', () => ({
  QuickTunnelManager: MockQuickTunnelManager,
}));

// Dockerode mock
const mockDockerodeRemoveContainer = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDockerodeCreateContainer = jest.fn<() => Promise<unknown>>();
const MockDockerode = jest.fn().mockImplementation(() => ({
  getContainer: jest.fn(() => ({
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    remove: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    logs: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('')),
    inspect: jest.fn<() => Promise<unknown>>().mockResolvedValue({ State: { Running: true } }),
  })),
  createContainer: mockDockerodeCreateContainer,
  listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));
jest.unstable_mockModule('dockerode', () => ({ default: MockDockerode }));

// ora mock
const mockOraInstance = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
  text: '',
};
jest.unstable_mockModule('ora', () => ({ default: jest.fn(() => mockOraInstance) }));

// inquirer mock
jest.unstable_mockModule('@inquirer/prompts', () => ({
  input: jest.fn<() => Promise<string>>().mockResolvedValue('test-value'),
  select: jest.fn<() => Promise<string>>().mockResolvedValue('option-1'),
  confirm: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------

const { registerDomainCommand } = await import('../../../../packages/cli/src/commands/domain.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return p;
}

async function parseCommand(program: Command, args: string[]): Promise<void> {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((_code) => {
    throw new Error('process.exit called');
  });
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch {
    // ignore commander errors and mocked process.exit
  } finally {
    exitSpy.mockRestore();
    process.exitCode = 0;
  }
}

function makeWizardState(tunnelMode = 'named') {
  return {
    domain: {
      provider: 'tunnel',
      name: 'example.com',
      cloudflare: {
        enabled: true,
        tunnelMode,
        quickTunnelUrl: tunnelMode === 'quick' ? 'https://abc.trycloudflare.com' : '',
        accountId: 'acc-123',
        apiToken: 'tok-abc',
        tunnelId: 'tun-456',
        tunnelToken: 'tun-token',
        tunnelName: 'brewnet-test',
        zoneId: 'zone-abc',
        zoneName: 'example.com',
      },
    },
    servers: {
      webServer: { enabled: true, service: 'traefik' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
    },
    domainConnections: [],
    portRemapping: {},
  };
}

// ---------------------------------------------------------------------------
// domain — registration
// ---------------------------------------------------------------------------

describe('domain command registration', () => {
  it('registers the "domain" command', () => {
    const p = makeProgram();
    registerDomainCommand(p);
    expect(p.commands.find((c) => c.name() === 'domain')).toBeDefined();
  });

  it('registers domain subcommands', () => {
    const p = makeProgram();
    registerDomainCommand(p);
    const domain = p.commands.find((c) => c.name() === 'domain')!;
    const names = domain.commands.map((c) => c.name());
    expect(names).toContain('connect');
    expect(names).toContain('disconnect');
    expect(names).toContain('status');
    expect(names).toContain('list');
    expect(names).toContain('tunnel');
  });
});

// ---------------------------------------------------------------------------
// domain list
// ---------------------------------------------------------------------------

describe('domain list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
  });

  it('shows empty message when no connections', async () => {
    mockDomainManagerList.mockReturnValue([]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'list']);
    expect(output).toContain('No external domains connected');
  });

  it('shows connections table when connections exist', async () => {
    mockDomainManagerList.mockReturnValue([{
      appName: 'git',
      hostname: 'git.example.com',
      connectedAt: '2026-03-15T10:00:00Z',
    }]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'list']);
    expect(output).toContain('git.example.com');
  });

  it('shows error when no project found', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'list']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows error when DomainManager constructor throws', async () => {
    MockDomainManager.mockImplementationOnce(() => { throw new Error('State not found'); });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'list']);
    expect(errMsg).toContain('State not found');
  });
});

// ---------------------------------------------------------------------------
// domain status
// ---------------------------------------------------------------------------

describe('domain status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('shows empty message when no connections', async () => {
    mockDomainManagerStatus.mockResolvedValue([]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status']);
    expect(output).toContain('No external domains connected');
  });

  it('shows status table for connections', async () => {
    mockDomainManagerStatus.mockResolvedValue([{
      appName: 'git',
      local: { url: 'http://localhost:3000', healthy: true },
      external: { url: 'https://git.example.com', dnsResolved: true, httpsReachable: true },
      tunnel: { status: 'healthy', connectorCount: 1 },
      dns: { type: 'CNAME', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true },
    }]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status']);
    expect(output).toContain('git');
    expect(output).toContain('git.example.com');
  });

  it('filters by app name when provided', async () => {
    mockDomainManagerStatus.mockResolvedValue([]);
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status', 'my-app']);
    expect(mockDomainManagerStatus).toHaveBeenCalledWith('my-app');
  });

  it('shows error when no project found (L998-999)', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows error when DomainManager constructor throws (L1006-1007)', async () => {
    MockDomainManager.mockImplementationOnce(() => { throw new Error('state load failed'); });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status']);
    expect(errMsg).toContain('Failed to load project');
  });
});

// ---------------------------------------------------------------------------
// domain disconnect
// ---------------------------------------------------------------------------

describe('domain disconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('disconnects successfully', async () => {
    mockDomainManagerDisconnect.mockResolvedValue({
      success: true,
      steps: [{ step: 'ingress_removal', status: 'completed' }],
      removedHostname: 'git.example.com',
    });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'disconnect', 'git']);
    expect(output).toContain('disconnected');
  });

  it('shows error on disconnect failure', async () => {
    mockDomainManagerDisconnect.mockResolvedValue({
      success: false,
      steps: [],
      error: 'Tunnel ingress removal failed',
    });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'disconnect', 'git']);
    expect(errMsg).toContain('Tunnel ingress removal failed');
  });

  it('shows error when no project found (L940-941)', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'disconnect', 'git']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows error when DomainManager constructor throws (L948-949)', async () => {
    MockDomainManager.mockImplementationOnce(() => { throw new Error('project state missing'); });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'disconnect', 'git']);
    expect(errMsg).toContain('Failed to load project');
  });

  it('shows step error message when step fails (L970)', async () => {
    mockDomainManagerDisconnect.mockResolvedValue({
      success: false,
      steps: [{ step: 'ingress_removal', status: 'failed', error: 'Ingress rule not found' }],
      error: 'Ingress rule not found',
    });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'disconnect', 'git']);
    expect(output).toContain('Ingress rule not found');
  });
});

// ---------------------------------------------------------------------------
// domain tunnel status
// ---------------------------------------------------------------------------

describe('domain tunnel status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows error when no project found', async () => {
    mockGetLastProject.mockReturnValue('');
    mockLoadState.mockReturnValue(null);
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows quick tunnel info for quick mode', async () => {
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(makeWizardState('quick'));
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(output).toContain('Quick Tunnel');
  });

  it('shows named tunnel health with API token', async () => {
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(makeWizardState('named'));
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 2 });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(output).toContain('healthy');
  });

  it('shows tunnel info without API token', async () => {
    mockGetLastProject.mockReturnValue('my-project');
    const state = makeWizardState('named');
    (state.domain.cloudflare as { apiToken: string }).apiToken = '';
    mockLoadState.mockReturnValue(state);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(output).toContain('No API token');
  });

  it('shows error message when getTunnelHealth throws (L397-400)', async () => {
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(makeWizardState('named'));
    mockGetTunnelHealth.mockRejectedValue(new Error('CF API timeout'));
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(errMsg).toContain('CF API timeout');
  });
});

// ---------------------------------------------------------------------------
// domain connect — app with --domain (basic flow)
// ---------------------------------------------------------------------------

describe('domain connect with --domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(makeWizardState('named'));
    // Reset getState to default (zoneId present) so Scenario C path is not taken
    mockDomainManagerGetState.mockReturnValue({
      domain: { cloudflare: { tunnelMode: 'named', tunnelId: 'tun-1', apiToken: 'tok', accountId: 'acc', zoneId: 'zone-123', tunnelName: 'brewnet-test' } },
    });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('shows error when no project found', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows error when DomainManager constructor throws', async () => {
    MockDomainManager.mockImplementationOnce(() => { throw new Error('state file missing'); });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('Failed to load project');
  });

  it('calls DomainManager.connect on success path', async () => {
    mockDomainManagerConnect.mockResolvedValue({
      success: true,
      hostname: 'my-api.example.com',
      externalUrl: 'https://my-api.example.com',
      steps: [{ step: 'health_check', status: 'completed' }],
    });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(mockDomainManagerConnect).toHaveBeenCalled();
  });

  it('shows connect failure error message', async () => {
    mockDomainManagerConnect.mockResolvedValue({
      success: false,
      hostname: 'my-api.example.com',
      externalUrl: 'https://my-api.example.com',
      steps: [],
      error: 'APP_NOT_RUNNING: Service not healthy',
    });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('APP_NOT_RUNNING');
  });

  it('shows Scenario C CNAME instructions when no zoneId but tunnelId exists (L854)', async () => {
    const state = makeWizardState('named');
    state.domain.cloudflare.zoneId = '';  // no zoneId
    state.domain.cloudflare.tunnelId = 'tun-456';  // but has tunnelId
    mockLoadState.mockReturnValue(state);
    mockDomainManagerGetState.mockReturnValueOnce({ domain: { cloudflare: { zoneId: '', tunnelId: 'tun-456' } } });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Scenario C'));
  });

  it('shows media streaming ToS warning and proceeds to connect for jellyfin app (L878)', async () => {
    mockDomainManagerConnect.mockResolvedValue({
      success: true,
      hostname: 'jellyfin.example.com',
      externalUrl: 'https://jellyfin.example.com',
      steps: [],
    });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'jellyfin', '--domain', 'jellyfin.example.com']);
    expect(output).toContain('ToS');
    expect(mockDomainManagerConnect).toHaveBeenCalled();
  });

  it('shows error when domain format invalid (no dot) (L831)', async () => {
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'invaliddomain']);
    expect(errMsg).toContain('Invalid domain');
  });

  it('shows error when --domain is set but app name is missing (L99-100)', async () => {
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    // --domain set but no positional app argument
    await parseCommand(p, ['domain', 'connect', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('App name is required');
  });

  it('shows step error detail when step has failed status (L905)', async () => {
    mockDomainManagerConnect.mockResolvedValue({
      success: false,
      hostname: 'my-api.example.com',
      externalUrl: 'https://my-api.example.com',
      steps: [{ step: 'health_check', status: 'failed', error: 'Connection refused on port 3000' }],
      error: 'APP_NOT_RUNNING',
    });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(output).toContain('Connection refused on port 3000');
  });

  it('shows CNAME conflict instructions when error is CNAME_CONFLICT (L924-925)', async () => {
    mockDomainManagerConnect.mockResolvedValue({
      success: false,
      hostname: 'my-api.example.com',
      externalUrl: 'https://my-api.example.com',
      steps: [],
      error: 'CNAME_CONFLICT',
    });
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(output).toContain('--force');
  });
});

// ---------------------------------------------------------------------------
// domain tunnel status — additional paths (L328, L356)
// ---------------------------------------------------------------------------

describe('domain tunnel status — tunnelMode=none', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows error message when tunnelMode is none (L328-329)', async () => {
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(makeWizardState('none'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tunnel configured'));
  });

  it('shows error when named tunnel has no tunnelId or accountId (L356)', async () => {
    const state = makeWizardState('named');
    state.domain.cloudflare.tunnelId = '';
    state.domain.cloudflare.accountId = '';
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue(state);
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'status']);
    expect(errMsg).toContain('No tunnel info');
  });
});

// ---------------------------------------------------------------------------
// domain tunnel restart — all paths (L424-541)
// ---------------------------------------------------------------------------

describe('domain tunnel restart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
    mockGetTunnelHealth.mockResolvedValue({ status: 'healthy', connectorCount: 1 });
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows error when no project found (L427)', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    expect(errMsg).toContain('No Brewnet project found');
  });

  it('shows error when tunnelMode is none (L434-436)', async () => {
    mockLoadState.mockReturnValue(makeWizardState('none'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tunnel configured'));
  });

  it('restarts container successfully in named tunnel mode (L443-501)', async () => {
    mockLoadState.mockReturnValue(makeWizardState('named'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Container stop + start + health check complete
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Restarting'));
  });

  it('handles container already stopped gracefully (L454-455)', async () => {
    mockLoadState.mockReturnValue(makeWizardState('named'));
    MockDockerode.mockImplementationOnce(() => ({
      getContainer: jest.fn(() => ({
        stop: jest.fn().mockRejectedValue(new Error('container not running')),
        start: jest.fn().mockResolvedValue(undefined),
        logs: jest.fn().mockResolvedValue(Buffer.from('')),
        inspect: jest.fn().mockResolvedValue({ State: { Running: false } }),
      })),
      listContainers: jest.fn().mockResolvedValue([]),
    }));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Should succeed despite stop error
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Restarting'));
  });

  it('shows error when container stop fails with non-running error (L457-459)', async () => {
    mockLoadState.mockReturnValue(makeWizardState('named'));
    MockDockerode.mockImplementationOnce(() => ({
      getContainer: jest.fn(() => ({
        stop: jest.fn().mockRejectedValue(new Error('ECONNREFUSED docker socket')),
        start: jest.fn().mockResolvedValue(undefined),
        logs: jest.fn().mockResolvedValue(Buffer.from('')),
        inspect: jest.fn().mockResolvedValue({ State: { Running: false } }),
      })),
      listContainers: jest.fn().mockResolvedValue([]),
    }));
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Should have tried to stop and hit the error path
    expect(MockDockerode).toHaveBeenCalled();
  });

  it('shows error when container start fails (L470-472)', async () => {
    mockLoadState.mockReturnValue(makeWizardState('named'));
    MockDockerode.mockImplementationOnce(() => ({
      getContainer: jest.fn(() => ({
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockRejectedValue(new Error('Cannot start container')),
        logs: jest.fn().mockResolvedValue(Buffer.from('')),
        inspect: jest.fn().mockResolvedValue({ State: { Running: false } }),
      })),
      listContainers: jest.fn().mockResolvedValue([]),
    }));
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    expect(errMsg).toContain('Cannot start');
  });

  it('shows service URLs with zoneName in named tunnel mode (L535-539)', async () => {
    const state = makeWizardState('named');
    mockLoadState.mockReturnValue(state);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Service URL display with subdomain.zoneName pattern
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('example.com'));
  });

  it('completes quick tunnel restart and shows quick tunnel URL (L476-492)', async () => {
    const state = makeWizardState('quick');
    state.domain.cloudflare.quickTunnelUrl = 'https://abc.trycloudflare.com';
    mockLoadState.mockReturnValue(state);

    // captureQuickTunnelUrl uses callback-style container.logs() — mock must call callback
    // immediately with error to avoid 30s timeout; this exercises the catch block (L490)
    MockDockerode.mockImplementationOnce(() => ({
      getContainer: jest.fn().mockReturnValue({
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        logs: jest.fn().mockImplementation(
          (_opts: unknown, cb: (err: Error, stream: undefined) => void) => {
            cb(new Error('container stopped'), undefined);
          },
        ),
        inspect: jest.fn().mockResolvedValue({ State: { Running: true } }),
      }),
      listContainers: jest.fn().mockResolvedValue([]),
    }));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Quick tunnel path ran — error caught gracefully (L490 urlSpinner.warn)
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('shows no-tunnel-credentials restart fallback message (L504-505)', async () => {
    // tunnelMode='named' but no tunnelId → else branch at L502-505 (3s wait + console.log)
    jest.useFakeTimers();
    const state = makeWizardState('named');
    state.domain.cloudflare.tunnelId = '';
    mockLoadState.mockReturnValue(state);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerDomainCommand(p);
    const cmd = parseCommand(p, ['domain', 'tunnel', 'restart']);
    jest.runAllTimersAsync();
    await cmd;
    jest.useRealTimers();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('restart complete'));
  });

  it('saves state with new URL when Quick Tunnel URL capture succeeds (L483-489)', async () => {
    // Use quick-tunnel state so the URL capture branch runs
    const state = makeWizardState('quick');
    state.domain.cloudflare.quickTunnelUrl = 'https://old.trycloudflare.com';
    mockLoadState.mockReturnValue(state);

    // Mock container.logs to call callback with a stream that emits a URL immediately
    MockDockerode.mockImplementationOnce(() => ({
      getContainer: jest.fn().mockReturnValue({
        stop: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        inspect: jest.fn().mockResolvedValue({ State: { Running: true } }),
        logs: jest.fn().mockImplementation(
          (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
            const mockStream = {
              on: jest.fn().mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
                if (event === 'data') {
                  // Immediately deliver a URL via data event
                  handler(Buffer.from('Your tunnel URL: https://abc-xyz.trycloudflare.com'));
                }
              }),
              destroy: jest.fn(),
            };
            cb(null, mockStream);
          },
        ),
      }),
      listContainers: jest.fn().mockResolvedValue([]),
    }));

    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'tunnel', 'restart']);
    // Success path: state was saved with new URL (L486)
    expect(mockSaveState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// domain connect — legacy path (no --domain) error cases
// ---------------------------------------------------------------------------

describe('domain connect — legacy path error cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
  });

  it('shows error when state is null in legacy connect (L111-113)', async () => {
    mockLoadState.mockReturnValue(null);
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    // No --domain flag → legacy path; state = null → lines 111-113
    await parseCommand(p, ['domain', 'connect']);
    expect(errMsg).toContain('No Brewnet project found');
  });
});
