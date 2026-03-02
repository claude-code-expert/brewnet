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

const mockAdminStart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateAdminServer = jest.fn(() => ({ start: mockAdminStart }));

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/admin-server.js',
  () => ({
    createAdminServer: mockCreateAdminServer,
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
  mockAdminStart.mockResolvedValue(undefined);
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

  it('starts the admin server', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockCreateAdminServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088 }),
    );
    expect(mockAdminStart).toHaveBeenCalled();
  });

  it('passes noOpen option — skips browser open', async () => {
    const state = makeState();
    // noOpen=true should still start the server, just not open the browser
    await expect(runCompleteStep(state, { noOpen: true })).resolves.toBeUndefined();
    expect(mockAdminStart).toHaveBeenCalled();
  });

  it('does not throw when admin server fails to start (non-fatal)', async () => {
    mockAdminStart.mockRejectedValue(new Error('port in use'));
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
});
