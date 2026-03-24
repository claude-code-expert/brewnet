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
    expect(output).toContain('연결된 외부 도메인이 없습니다');
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
    expect(errMsg).toContain('프로젝트를 찾을 수 없습니다');
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

  it('shows empty message when no connections', async () => {
    mockDomainManagerStatus.mockResolvedValue([]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'status']);
    expect(output).toContain('연결된 외부 도메인이 없습니다');
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
    expect(output).toContain('해제');
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
    expect(errMsg).toContain('프로젝트를 찾을 수 없습니다');
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
    expect(output).toContain('API 토큰 없음');
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
  });

  it('shows error when no project found', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('프로젝트를 찾을 수 없습니다');
  });

  it('shows error when DomainManager constructor throws', async () => {
    MockDomainManager.mockImplementationOnce(() => { throw new Error('state file missing'); });
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerDomainCommand(p);
    await parseCommand(p, ['domain', 'connect', 'my-api', '--domain', 'my-api.example.com']);
    expect(errMsg).toContain('프로젝트 로드 실패');
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
});
