/**
 * Unit tests for wizard/steps/domain-network module (pure functions)
 *
 * Covers:
 *   - isMailServerAllowed
 *   - applyDomainDefaults (local / tunnel providers)
 *   - buildDomainConfig (local / tunnel variants)
 */

import { describe, it, expect, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — silence interactive and external calls
// ---------------------------------------------------------------------------

jest.unstable_mockModule('@inquirer/prompts', () => ({
  input: jest.fn(),
  select: jest.fn(),
  confirm: jest.fn(),
  password: jest.fn(),
  checkbox: jest.fn(),
}));

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

jest.unstable_mockModule('../../../../../packages/cli/src/services/cloudflare-client.js', () => ({
  verifyToken: jest.fn(),
  getAccounts: jest.fn(),
  getZones: jest.fn(),
  createTunnel: jest.fn(),
  configureTunnelIngress: jest.fn(),
  createDnsRecord: jest.fn(),
  deleteTunnel: jest.fn(),
  getTunnelHealth: jest.fn(),
  buildTokenCreationUrl: jest.fn(() => 'https://dash.cloudflare.com/profile/api-tokens'),
  getActiveServiceRoutes: jest.fn(() => []),
}));

jest.unstable_mockModule('../../../../../packages/cli/src/utils/network.js', () => ({
  checkPort25Blocked: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  isMailServerAllowed,
  applyDomainDefaults,
  buildDomainConfig,
} = await import(
  '../../../../../packages/cli/src/wizard/steps/domain-network.js'
);

const { createDefaultWizardState } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState, DomainConfig } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return {
    ...base,
    projectName: 'test-project',
    ...overrides,
  };
}

function makeDomainConfig(overrides: Partial<DomainConfig> = {}): DomainConfig {
  return {
    provider: 'local',
    name: 'test.local',
    ssl: 'self-signed',
    cloudflare: {
      enabled: false,
      tunnelMode: 'none',
      quickTunnelUrl: '',
      tunnelToken: '',
      tunnelName: '',
      accountId: '',
      apiToken: '',
      tunnelId: '',
      zoneId: '',
      zoneName: '',
    },
    mailServer: {
      enabled: false,
      service: 'docker-mailserver',
      port25Blocked: false,
      relayProvider: '',
      relayHost: '',
      relayPort: 587,
      relayUser: '',
      relayPassword: '',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isMailServerAllowed
// ---------------------------------------------------------------------------

describe('isMailServerAllowed', () => {
  it('returns false when provider is local', () => {
    const state = makeState({ domain: { ...makeState().domain, provider: 'local' } });
    expect(isMailServerAllowed(state)).toBe(false);
  });

  it('returns true when provider is tunnel', () => {
    const state = makeState({ domain: { ...makeState().domain, provider: 'tunnel' } });
    expect(isMailServerAllowed(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyDomainDefaults — local provider
// ---------------------------------------------------------------------------

describe('applyDomainDefaults — local', () => {
  it('sets provider to local', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'local');
    expect(result.domain.provider).toBe('local');
  });

  it('sets ssl to self-signed for local', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'local');
    expect(result.domain.ssl).toBe('self-signed');
  });

  it('disables cloudflare for local', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'local');
    expect(result.domain.cloudflare.enabled).toBe(false);
  });

  it('clears cloudflare credentials for local', () => {
    const state = makeState({
      domain: {
        ...makeState().domain,
        cloudflare: {
          enabled: true,
          tunnelToken: 'token-abc',
          tunnelName: 'my-tunnel',
          accountId: 'acc-123',
          apiToken: 'api-key',
          tunnelId: 'tid-xyz',
          zoneId: 'zone-1',
          zoneName: 'example.com',
        },
      },
    });
    const result = applyDomainDefaults(state, 'local');
    expect(result.domain.cloudflare.tunnelToken).toBe('');
    expect(result.domain.cloudflare.apiToken).toBe('');
    expect(result.domain.cloudflare.accountId).toBe('');
    expect(result.domain.cloudflare.tunnelId).toBe('');
    expect(result.domain.cloudflare.zoneId).toBe('');
    expect(result.domain.cloudflare.zoneName).toBe('');
  });

  it('sets domain name to {projectName}.local for local', () => {
    const state = makeState({ projectName: 'my-server' });
    const result = applyDomainDefaults(state, 'local');
    expect(result.domain.name).toBe('my-server.local');
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    const originalProvider = state.domain.provider;
    applyDomainDefaults(state, 'local');
    expect(state.domain.provider).toBe(originalProvider);
  });
});

// ---------------------------------------------------------------------------
// applyDomainDefaults — tunnel provider
// ---------------------------------------------------------------------------

describe('applyDomainDefaults — tunnel', () => {
  it('sets provider to tunnel', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'tunnel');
    expect(result.domain.provider).toBe('tunnel');
  });

  it('sets ssl to cloudflare for tunnel', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'tunnel');
    expect(result.domain.ssl).toBe('cloudflare');
  });

  it('enables cloudflare for tunnel', () => {
    const state = makeState();
    const result = applyDomainDefaults(state, 'tunnel');
    expect(result.domain.cloudflare.enabled).toBe(true);
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    const originalEnabled = state.domain.cloudflare.enabled;
    applyDomainDefaults(state, 'tunnel');
    expect(state.domain.cloudflare.enabled).toBe(originalEnabled);
  });
});

// ---------------------------------------------------------------------------
// buildDomainConfig — local
// ---------------------------------------------------------------------------

describe('buildDomainConfig — local provider', () => {
  it('disables cloudflare for local provider', () => {
    const config = makeDomainConfig({
      provider: 'local',
      cloudflare: {
        enabled: true,
        tunnelToken: 'tok',
        tunnelName: 'n',
        accountId: 'a',
        apiToken: 'api',
        tunnelId: 'tid',
        zoneId: 'z',
        zoneName: 'z.com',
      },
    });
    const result = buildDomainConfig(config);
    expect(result.cloudflare.enabled).toBe(false);
  });

  it('clears all cloudflare fields for local provider', () => {
    const config = makeDomainConfig({
      provider: 'local',
      cloudflare: {
        enabled: true,
        tunnelToken: 'tok',
        tunnelName: 'name',
        accountId: 'acc',
        apiToken: 'api',
        tunnelId: 'tid',
        zoneId: 'zid',
        zoneName: 'z.com',
      },
    });
    const result = buildDomainConfig(config);
    expect(result.cloudflare.tunnelToken).toBe('');
    expect(result.cloudflare.tunnelName).toBe('');
    expect(result.cloudflare.accountId).toBe('');
    expect(result.cloudflare.apiToken).toBe('');
    expect(result.cloudflare.tunnelId).toBe('');
    expect(result.cloudflare.zoneId).toBe('');
    expect(result.cloudflare.zoneName).toBe('');
  });

  it('preserves other config fields for local provider', () => {
    const config = makeDomainConfig({ provider: 'local', name: 'myserver.local', ssl: 'self-signed' });
    const result = buildDomainConfig(config);
    expect(result.name).toBe('myserver.local');
    expect(result.ssl).toBe('self-signed');
  });

  it('does not mutate the original config', () => {
    const config = makeDomainConfig({
      provider: 'local',
      cloudflare: {
        enabled: true,
        tunnelToken: 'orig',
        tunnelName: '',
        accountId: '',
        apiToken: '',
        tunnelId: '',
        zoneId: '',
        zoneName: '',
      },
    });
    buildDomainConfig(config);
    expect(config.cloudflare.enabled).toBe(true);
    expect(config.cloudflare.tunnelToken).toBe('orig');
  });

  it('returns a new object (not the same reference)', () => {
    const config = makeDomainConfig({ provider: 'local' });
    const result = buildDomainConfig(config);
    expect(result).not.toBe(config);
  });
});

// ---------------------------------------------------------------------------
// buildDomainConfig — tunnel
// ---------------------------------------------------------------------------

describe('buildDomainConfig — tunnel provider', () => {
  it('enables cloudflare for tunnel provider', () => {
    const config = makeDomainConfig({
      provider: 'tunnel',
      cloudflare: {
        enabled: false,
        tunnelToken: 'tok',
        tunnelName: 'my-tunnel',
        accountId: 'acc',
        apiToken: 'api',
        tunnelId: 'tid',
        zoneId: 'zid',
        zoneName: 'example.com',
      },
    });
    const result = buildDomainConfig(config);
    expect(result.cloudflare.enabled).toBe(true);
  });

  it('preserves tunnel credentials for tunnel provider', () => {
    const config = makeDomainConfig({
      provider: 'tunnel',
      cloudflare: {
        enabled: false,
        tunnelToken: 'my-token',
        tunnelName: 'my-tunnel',
        accountId: 'acc-1',
        apiToken: '',
        tunnelId: 'tid-1',
        zoneId: 'zid-1',
        zoneName: 'example.com',
      },
    });
    const result = buildDomainConfig(config);
    expect(result.cloudflare.tunnelToken).toBe('my-token');
    expect(result.cloudflare.tunnelName).toBe('my-tunnel');
    expect(result.cloudflare.accountId).toBe('acc-1');
  });
});
