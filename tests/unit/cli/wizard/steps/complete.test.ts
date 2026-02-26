/**
 * Unit tests for wizard/steps/complete module
 *
 * Tests runCompleteStep rendering logic with mocked dependencies.
 * Verifies all output sections: endpoints, credentials, tunnel info,
 * next steps, troubleshooting, status page generation.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateAndOpenStatusPage = jest.fn<() => Promise<string>>();

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/status-page.js',
  () => ({
    generateAndOpenStatusPage: mockGenerateAndOpenStatusPage,
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
  mockGenerateAndOpenStatusPage.mockResolvedValue('/home/user/.brewnet/status/index.html');
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

  it('calls generateEndpoints with state and sorted services', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockGenerateEndpoints).toHaveBeenCalledWith(state, ['traefik', 'gitea']);
  });

  it('calls getCredentialTargets to check credential propagation', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockGetCredentialTargets).toHaveBeenCalled();
  });

  it('calls generateAndOpenStatusPage', async () => {
    const state = makeState();
    await runCompleteStep(state);
    expect(mockGenerateAndOpenStatusPage).toHaveBeenCalledWith(
      state,
      expect.objectContaining({}),
    );
  });

  it('passes noOpen option to generateAndOpenStatusPage', async () => {
    const state = makeState();
    await runCompleteStep(state, { noOpen: true });
    expect(mockGenerateAndOpenStatusPage).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ noOpen: true }),
    );
  });

  it('does not throw when generateAndOpenStatusPage fails (non-fatal)', async () => {
    mockGenerateAndOpenStatusPage.mockRejectedValue(new Error('disk full'));
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
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.dpdns.org',
        ssl: 'cloudflare',
        freeDomainTld: '.dpdns.org',
        cloudflare: {
          enabled: true,
          tunnelToken: '',
          tunnelName: 'my-tunnel',
          accountId: '',
          apiToken: '',
          tunnelId: 'tunnel-123',
          zoneId: '',
          zoneName: 'dpdns.org',
        },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/tunnel/i);
    consoleSpy.mockRestore();
  });

  it('shows manual tunnel setup hint when tunnelId is missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.dpdns.org',
        ssl: 'cloudflare',
        freeDomainTld: '.dpdns.org',
        cloudflare: {
          enabled: true,
          tunnelToken: '',
          tunnelName: 'my-tunnel',
          accountId: '',
          apiToken: '',
          tunnelId: '', // no tunnel ID = manual setup
          zoneId: '',
          zoneName: '',
        },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
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
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
        freeDomainTld: '.dpdns.org',
        cloudflare: { enabled: false, tunnelToken: '', tunnelName: '', accountId: '', apiToken: '', tunnelId: '', zoneId: '', zoneName: '' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
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
