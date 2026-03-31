/**
 * Unit tests for wizard/steps/complete module
 *
 * Tests runCompleteStep rendering logic with mocked dependencies.
 * Verifies all output sections: endpoints, credentials, tunnel info,
 * next steps, troubleshooting, admin panel start.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLaunchAdminDaemon = jest.fn<() => Promise<{ pid: number; port: number; logFile: string }>>()
  .mockResolvedValue({ pid: 99999, port: 8088, logFile: '/tmp/test.log' });

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/admin-launcher.js',
  () => ({
    launchAdminDaemon: mockLaunchAdminDaemon,
  }),
);

const mockCollectAllServices = jest.fn<() => string[]>();
const mockGetCredentialTargets = jest.fn<() => string[]>();

jest.unstable_mockModule(
  '../../../../../packages/cli/src/utils/resources.js',
  () => ({
    collectAllServices: mockCollectAllServices,
    getCredentialTargets: mockGetCredentialTargets,
    countSelectedServices: jest.fn(() => 0),
    estimateResources: jest.fn(() => ({ ram: 0, disk: 0 })),
    getImageName: jest.fn(() => 'traefik:latest'),
  }),
);

// Mock execa — complete.ts does dynamic import('execa') to open browser
const mockExeca = jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockInstallBrewnetService = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/system-service.js',
  () => ({
    installBrewnetService: mockInstallBrewnetService,
    uninstallBrewnetService: jest.fn().mockResolvedValue(false),
    isBrewnetServiceInstalled: jest.fn().mockReturnValue(false),
    getServiceFilePath: jest.fn(() => '/tmp/test.plist'),
  }),
);

const mockConfirm = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
  password: jest.fn(),
}));

const mockGenerateEndpoints = jest.fn<() => { service: string; url: string }[]>();
const mockSortByDependency = jest.fn<(s: string[]) => string[]>((s) => s);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/health-checker.js',
  () => ({
    generateEndpoints: mockGenerateEndpoints,
    sortByDependency: mockSortByDependency,
    categorizeService: jest.fn(() => 'application'),
    buildPullCommand: jest.fn(),
    buildUpCommand: jest.fn(),
    buildDownCommand: jest.fn(),
    pollHealthCheck: jest.fn(),
    checkDnsResolution: jest.fn(),
    checkEndpointReachable: jest.fn(),
    HEALTH_CHECK_TIMEOUT: 120000,
    HEALTH_CHECK_INTERVAL: 2000,
    DOCKER_COMPOSE_FILENAME: 'docker-compose.yml',
  }),
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { runCompleteStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/complete.js'
);

const { createDefaultWizardState } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockCollectAllServices.mockReturnValue(['traefik', 'gitea']);
  mockSortByDependency.mockImplementation((s) => s);
  mockGenerateEndpoints.mockReturnValue([
    { service: 'traefik', url: 'http://traefik.brewnet.local' },
    { service: 'gitea', url: 'http://git.brewnet.local' },
  ]);
  mockGetCredentialTargets.mockReturnValue(['Gitea', 'Traefik Dashboard']);
  mockLaunchAdminDaemon.mockResolvedValue({ pid: 99999, port: 8088, logFile: '/tmp/test.log' });
  mockInstallBrewnetService.mockResolvedValue(undefined);
  mockConfirm.mockResolvedValue(false);
});

describe('runCompleteStep', () => {
  it('completes without throwing', async () => {
    const state = makeState({ projectPath: '/home/user/brewnet-home' });
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });

  it('calls collectAllServices with wizard state', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockCollectAllServices).toHaveBeenCalledWith(state);
  });

  it('calls sortByDependency with collected services', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockSortByDependency).toHaveBeenCalledWith(['traefik', 'gitea']);
  });

  it('calls sortByDependency to order services', async () => {
    // complete.ts uses sortByDependency internally for quick-tunnel path listings
    const state = makeState();
    await runCompleteStep(state);
    expect(mockSortByDependency).toHaveBeenCalledWith(['traefik', 'gitea']);
  });

  it('calls getCredentialTargets to check credential propagation', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockGetCredentialTargets).toHaveBeenCalled();
  });

  it('launches the admin daemon', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088 }),
    );
  });

  it('passes noOpen option — skips browser open', async () => {
    const state = makeState();
    await expect(runCompleteStep(state, { noOpen: true })).resolves.toBeUndefined();
    expect(mockLaunchAdminDaemon).toHaveBeenCalled();
  });

  it('does not throw when admin daemon fails to start (non-fatal)', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('port in use'));
    const state = makeState();
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });

  it('handles empty endpoints list gracefully', async () => {
    mockGenerateEndpoints.mockReturnValue([]);
    const state = makeState();
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });

  it('handles empty credential targets gracefully', async () => {
    mockGetCredentialTargets.mockReturnValue([]);
    const state = makeState();
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });

  it('shows tunnel section for tunnel provider', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaultState = createDefaultWizardState();
    const state = makeState({
      domain: {
        ...defaultState.domain,
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          ...defaultState.domain.cloudflare,
          enabled: true,
          tunnelName: 'my-tunnel',
          tunnelId: 'tunnel-123',
          zoneName: 'example.com',
        },
      },
    });

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/tunnel/i);
    consoleSpy.mockRestore();
  });

  it('shows manual tunnel setup hint when tunnelId is missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaultState = createDefaultWizardState();
    const state = makeState({
      domain: {
        ...defaultState.domain,
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          ...defaultState.domain.cloudflare,
          enabled: true,
          tunnelName: 'my-tunnel',
          tunnelId: '', // no tunnel ID = manual setup
        },
      },
    });

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/tunnel/i);
    consoleSpy.mockRestore();
  });

  it('does not show tunnel section for local provider', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = makeState({
      domain: {
        ...createDefaultWizardState().domain,
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
      },
    });

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toMatch(/Cloudflare Tunnel/);
    consoleSpy.mockRestore();
  });

  it('shows projectPath in troubleshooting section', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = makeState({ projectPath: '/custom/path/brewnet' });
    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch('/custom/path/brewnet');
    consoleSpy.mockRestore();
  });

  it('renders External column table when hasTunnel=true (quick mode)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaultState = createDefaultWizardState();
    const state = makeState({
      domain: {
        ...defaultState.domain,
        provider: 'tunnel',
        name: 'example.com',
        cloudflare: {
          ...defaultState.domain.cloudflare,
          enabled: true,
          tunnelMode: 'quick' as const,
          quickTunnelUrl: 'https://abc-123.trycloudflare.com',
        },
      },
    });

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/External/i);
    consoleSpy.mockRestore();
  });

  it('shows quick-tunnel provider section with service paths', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaultState = createDefaultWizardState();
    const state = makeState({
      domain: {
        ...defaultState.domain,
        provider: 'quick-tunnel',
        cloudflare: {
          ...defaultState.domain.cloudflare,
          enabled: true,
          tunnelMode: 'quick' as const,
          quickTunnelUrl: 'https://xyz-999.trycloudflare.com',
        },
      },
      servers: {
        ...defaultState.servers,
        gitServer: { enabled: true as const, service: 'gitea' as const, port: 3000, sshPort: 3022 },
      },
    });
    // Ensure sorted includes 'gitea' to hit the quickPaths filter
    mockCollectAllServices.mockReturnValue(['gitea', 'traefik']);

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/Quick Tunnel/i);
    expect(allOutput).toMatch(/trycloudflare\.com/);
    consoleSpy.mockRestore();
  });

  it('shows quick-tunnel section even without installed services', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaultState = createDefaultWizardState();
    const state = makeState({
      domain: {
        ...defaultState.domain,
        provider: 'quick-tunnel',
        cloudflare: {
          ...defaultState.domain.cloudflare,
          enabled: true,
          tunnelMode: 'quick' as const,
          quickTunnelUrl: 'https://xyz-888.trycloudflare.com',
        },
      },
    });
    // No services from QUICK_TUNNEL_PATH_MAP installed → activePaths.length === 0
    mockCollectAllServices.mockReturnValue(['traefik']);

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/Quick Tunnel/i);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Auto-start service prompt
// ---------------------------------------------------------------------------

describe('auto-start service prompt', () => {
  it('prompts "재부팅 후 Brewnet을 자동으로 시작할까요?" after daemon starts', async () => {
    const state = makeState({ projectPath: '/home/user/brewnet-home' });
    await runCompleteStep(state);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('재부팅 후 Brewnet을 자동으로 시작할까요'),
      }),
    );
  });

  it('calls installBrewnetService when user answers yes', async () => {
    mockConfirm.mockResolvedValue(true);
    const state = makeState({ projectPath: '/home/user/brewnet-home' });
    await runCompleteStep(state);
    expect(mockInstallBrewnetService).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088, projectPath: '/home/user/brewnet-home' }),
    );
  });

  it('does not call installBrewnetService when user answers no', async () => {
    mockConfirm.mockResolvedValue(false);
    const state = makeState({ projectPath: '/home/user/brewnet-home' });
    await runCompleteStep(state);
    expect(mockInstallBrewnetService).not.toHaveBeenCalled();
  });

  it('does not prompt when admin daemon fails to start', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('port in use'));
    const state = makeState();
    await runCompleteStep(state);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('does not throw when installBrewnetService fails (non-fatal)', async () => {
    mockConfirm.mockResolvedValue(true);
    mockInstallBrewnetService.mockRejectedValue(new Error('launchctl failed'));
    const state = makeState({ projectPath: '/home/user/brewnet-home' });
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });

  it('does not throw when confirm is interrupted (Ctrl+C)', async () => {
    mockConfirm.mockRejectedValue(new Error('User force closed the prompt'));
    const state = makeState();
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
  });
});
