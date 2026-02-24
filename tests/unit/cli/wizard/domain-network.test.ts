/**
 * Unit tests for wizard/steps/domain-network module (T083)
 *
 * Tests the pure business logic functions for the Domain & Network wizard
 * step (Step 4). Covers local/free/custom domain configuration, SSL mode
 * selection, Cloudflare Tunnel setup, free-domain TLD validation, tunnel
 * token validation, and mail server availability.
 *
 * Test cases: TC-06-01 through TC-06-04, TC-06-07, TC-06-08 (from TEST_CASES.md)
 *
 * Strategy: TDD — tests are written first. The target functions do not exist yet
 * and will be implemented in packages/cli/src/wizard/steps/domain-network.ts.
 * Tests will fail with import errors until implementation is done.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Imports — TDD targets (not yet implemented)
// ---------------------------------------------------------------------------

const {
  applyDomainDefaults,
  isMailServerAllowed,
  buildDomainConfig,
} = await import(
  '../../../../packages/cli/src/wizard/steps/domain-network.js'
);

// ---------------------------------------------------------------------------
// Imports — existing modules
// ---------------------------------------------------------------------------

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

const {
  validateFreeDomainTld,
  validateTunnelToken,
} = await import(
  '../../../../packages/cli/src/utils/validation.js'
);

import type {
  WizardState,
  DomainConfig,
  DomainProvider,
  SslMode,
  FreeDomainTld,
} from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a default WizardState with optional deep overrides.
 * Uses structuredClone to avoid shared references between tests.
 */
function buildState(overrides: Partial<{
  servers: Partial<WizardState['servers']>;
  devStack: Partial<WizardState['devStack']>;
  domain: Partial<WizardState['domain']>;
}> = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      (state.servers as Record<string, unknown>)[key] = {
        ...(state.servers as Record<string, unknown>)[key] as object,
        ...value as object,
      };
    }
  }
  if (overrides.devStack) {
    Object.assign(state.devStack, overrides.devStack);
  }
  if (overrides.domain) {
    Object.assign(state.domain, overrides.domain);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-01: Local domain configuration
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-01: Local domain configuration', () => {
  it('local domain selected → SSL mode is self-signed only', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'local');

    expect(result.domain.ssl).toBe('self-signed');
  });

  it('local domain selected → cloudflare tunnel is disabled', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'local');

    expect(result.domain.cloudflare.enabled).toBe(false);
  });

  it('local domain selected → domain name uses .local suffix', () => {
    const state = buildState({ domain: { name: 'brewnet.local' } });
    const result = applyDomainDefaults(state, 'local');

    expect(result.domain.name).toMatch(/\.local$/);
  });

  it('local domain → mail server NOT allowed', () => {
    const state = buildState({ domain: { provider: 'local' } });
    const result = applyDomainDefaults(state, 'local');

    expect(isMailServerAllowed(result)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-02: Free domain configuration
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-02: Free domain configuration', () => {
  it('free domain selected → Cloudflare Tunnel enabled by default', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'freedomain');

    expect(result.domain.cloudflare.enabled).toBe(true);
  });

  it('free domain → domain name appended with selected TLD', () => {
    const state = buildState({
      domain: { name: 'myserver', freeDomainTld: '.dpdns.org' },
    });
    const result = applyDomainDefaults(state, 'freedomain');

    // The result name should include the TLD
    expect(result.domain.name).toContain('.dpdns.org');
  });

  it('free domain → SSL mode = cloudflare', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'freedomain');

    expect(result.domain.ssl).toBe('cloudflare');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-03: Custom domain SSL options
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-03: Custom domain SSL options', () => {
  it('custom domain → SSL method options available (self-signed, letsencrypt, cloudflare)', () => {
    // With a custom domain, all three SSL modes should be valid selections.
    // applyDomainDefaults for 'custom' should allow any of the three SSL modes.
    const sslOptions: SslMode[] = ['self-signed', 'letsencrypt', 'cloudflare'];

    for (const ssl of sslOptions) {
      const state = buildState({ domain: { ssl } });
      const result = applyDomainDefaults(state, 'custom');

      // Custom domain should not force-override the user's SSL selection
      // when that selection is a valid option.
      expect(['self-signed', 'letsencrypt', 'cloudflare']).toContain(result.domain.ssl);
    }
  });

  it('custom domain + letsencrypt → ssl field is letsencrypt (Traefik ACME)', () => {
    const state = buildState({ domain: { ssl: 'letsencrypt' } });
    const result = applyDomainDefaults(state, 'custom');

    expect(result.domain.ssl).toBe('letsencrypt');
  });

  it('custom domain → default SSL = letsencrypt', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'custom');

    expect(result.domain.ssl).toBe('letsencrypt');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-04: Free domain TLD validation
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-04: Free domain TLD validation', () => {
  it('accepts .dpdns.org', () => {
    const result = validateFreeDomainTld('.dpdns.org');
    expect(result.valid).toBe(true);
  });

  it('accepts .qzz.io', () => {
    const result = validateFreeDomainTld('.qzz.io');
    expect(result.valid).toBe(true);
  });

  it('accepts .us.kg', () => {
    const result = validateFreeDomainTld('.us.kg');
    expect(result.valid).toBe(true);
  });

  it('rejects .invalid-tld', () => {
    const result = validateFreeDomainTld('.invalid-tld');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects .com', () => {
    const result = validateFreeDomainTld('.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects empty string', () => {
    const result = validateFreeDomainTld('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-07: SSL configuration
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-07: SSL configuration', () => {
  it('letsencrypt selected → ssl = letsencrypt', () => {
    const config = buildDomainConfig({
      provider: 'custom',
      name: 'example.com',
      ssl: 'letsencrypt',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
    });

    expect(config.ssl).toBe('letsencrypt');
  });

  it('self-signed selected → ssl = self-signed', () => {
    const config = buildDomainConfig({
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
    });

    expect(config.ssl).toBe('self-signed');
  });

  it('cloudflare selected → ssl = cloudflare', () => {
    const config = buildDomainConfig({
      provider: 'freedomain',
      name: 'myserver.dpdns.org',
      ssl: 'cloudflare',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: true, tunnelToken: '', tunnelName: '' },
    });

    expect(config.ssl).toBe('cloudflare');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-06-08: Mail server availability
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-06-08: Mail server availability', () => {
  it('domain = local → mail NOT shown (isMailServerAllowed returns false)', () => {
    const state = buildState({ domain: { provider: 'local' } });
    expect(isMailServerAllowed(state)).toBe(false);
  });

  it('domain = freedomain → mail IS available', () => {
    const state = buildState({
      domain: { provider: 'freedomain', name: 'myserver.dpdns.org' },
    });
    expect(isMailServerAllowed(state)).toBe(true);
  });

  it('domain = custom → mail IS available', () => {
    const state = buildState({
      domain: { provider: 'custom', name: 'example.com' },
    });
    expect(isMailServerAllowed(state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-05: Tunnel token validation (via validation.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Tunnel token validation (basic)', () => {
  it('non-empty well-formed token → accepted', () => {
    // validateTunnelToken requires JWT format (eyJ prefix, 50+ chars, base64url chars)
    const validToken =
      'eyJhIjoiYjEyMzQ1Njc4OTAiLCJ0IjoiYWJjZGVmZy1oaWprbG1uby1wcXJzdHV2In0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_here';
    const result = validateTunnelToken(validToken);
    expect(result.valid).toBe(true);
  });

  it('empty string → rejected', () => {
    const result = validateTunnelToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('whitespace-only → rejected', () => {
    // validateTunnelToken checks typeof + length === 0 first,
    // then prefix check — whitespace-only will fail prefix check
    const result = validateTunnelToken('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildDomainConfig
// ═══════════════════════════════════════════════════════════════════════════

describe('buildDomainConfig', () => {
  it('build with local provider → correct DomainConfig with local defaults', () => {
    const config = buildDomainConfig({
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
    });

    expect(config.provider).toBe('local');
    expect(config.ssl).toBe('self-signed');
    expect(config.cloudflare.enabled).toBe(false);
    expect(config.name).toBe('brewnet.local');
  });

  it('build with local provider → no tunnel even if input had tunnel enabled', () => {
    const config = buildDomainConfig({
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: true, tunnelToken: 'some-token', tunnelName: 'my-tunnel' },
    });

    // Local provider should force tunnel off
    expect(config.cloudflare.enabled).toBe(false);
  });

  it('build with freedomain + .dpdns.org → correct name and tunnel config', () => {
    const config = buildDomainConfig({
      provider: 'freedomain',
      name: 'myserver.dpdns.org',
      ssl: 'cloudflare',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: true, tunnelToken: '', tunnelName: '' },
    });

    expect(config.provider).toBe('freedomain');
    expect(config.name).toBe('myserver.dpdns.org');
    expect(config.freeDomainTld).toBe('.dpdns.org');
    expect(config.cloudflare.enabled).toBe(true);
    expect(config.ssl).toBe('cloudflare');
  });

  it('build with freedomain → tunnel is forced ON', () => {
    const config = buildDomainConfig({
      provider: 'freedomain',
      name: 'myserver.qzz.io',
      ssl: 'cloudflare',
      freeDomainTld: '.qzz.io',
      cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
    });

    // FreeDomain should force tunnel ON
    expect(config.cloudflare.enabled).toBe(true);
  });

  it('build with custom + letsencrypt → correct SSL and tunnel config', () => {
    const config = buildDomainConfig({
      provider: 'custom',
      name: 'example.com',
      ssl: 'letsencrypt',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: true, tunnelToken: '', tunnelName: '' },
    });

    expect(config.provider).toBe('custom');
    expect(config.name).toBe('example.com');
    expect(config.ssl).toBe('letsencrypt');
    // Custom domain: tunnel is optional, user choice is preserved
    expect(config.cloudflare.enabled).toBe(true);
  });

  it('build with custom + cloudflare tunnel token → tunnel enabled with token', () => {
    const tunnelToken =
      'eyJhIjoiYjEyMzQ1Njc4OTAiLCJ0IjoiYWJjZGVmZy1oaWprbG1uby1wcXJzdHV2In0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_here';
    const config = buildDomainConfig({
      provider: 'custom',
      name: 'example.com',
      ssl: 'cloudflare',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: true, tunnelToken, tunnelName: 'my-tunnel' },
    });

    expect(config.cloudflare.enabled).toBe(true);
    expect(config.cloudflare.tunnelToken).toBe(tunnelToken);
    expect(config.cloudflare.tunnelName).toBe('my-tunnel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Immutability: applyDomainDefaults does not mutate input state
// ═══════════════════════════════════════════════════════════════════════════

describe('Immutability guarantees', () => {
  it('applyDomainDefaults does not mutate the input state', () => {
    const state = buildState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
      },
    });

    const originalJson = JSON.stringify(state);

    applyDomainDefaults(state, 'freedomain');

    // Input state should be unchanged after applying freedomain defaults
    expect(JSON.stringify(state)).toBe(originalJson);
  });

  it('applyDomainDefaults returns a new object, not the same reference', () => {
    const state = buildState();
    const result = applyDomainDefaults(state, 'custom');

    expect(result).not.toBe(state);
    expect(result.domain).not.toBe(state.domain);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases & combined scenarios
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('applyDomainDefaults preserves non-domain state fields', () => {
    const state = buildState({
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: ['reactjs'] },
    });

    const result = applyDomainDefaults(state, 'custom');

    expect(result.projectName).toBe(state.projectName);
    expect(result.projectPath).toBe(state.projectPath);
    expect(result.setupType).toBe(state.setupType);
    expect(result.admin).toEqual(state.admin);
    expect(result.devStack).toEqual(state.devStack);
    expect(result.boilerplate).toEqual(state.boilerplate);
    expect(result.servers).toEqual(state.servers);
  });

  it('applyDomainDefaults can be called multiple times idempotently for the same provider', () => {
    const state = buildState();

    const first = applyDomainDefaults(state, 'local');
    const second = applyDomainDefaults(first, 'local');

    expect(first.domain.provider).toBe(second.domain.provider);
    expect(first.domain.ssl).toBe(second.domain.ssl);
    expect(first.domain.cloudflare.enabled).toBe(second.domain.cloudflare.enabled);
  });

  it('switching from freedomain to local disables tunnel and resets SSL', () => {
    const state = buildState();

    // First apply freedomain defaults
    const freedomainState = applyDomainDefaults(state, 'freedomain');
    expect(freedomainState.domain.cloudflare.enabled).toBe(true);
    expect(freedomainState.domain.ssl).toBe('cloudflare');

    // Then switch to local
    const localState = applyDomainDefaults(freedomainState, 'local');
    expect(localState.domain.cloudflare.enabled).toBe(false);
    expect(localState.domain.ssl).toBe('self-signed');
  });

  it('switching from local to custom enables letsencrypt and allows tunnel', () => {
    const state = buildState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
      },
    });

    const result = applyDomainDefaults(state, 'custom');

    expect(result.domain.provider).toBe('custom');
    expect(result.domain.ssl).toBe('letsencrypt');
    expect(result.domain.cloudflare.enabled).toBe(true);
  });

  it('buildDomainConfig returns a valid DomainConfig shape', () => {
    const config = buildDomainConfig({
      provider: 'custom',
      name: 'example.com',
      ssl: 'letsencrypt',
      freeDomainTld: '.dpdns.org',
      cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
    });

    // Verify all required fields are present
    expect(config).toHaveProperty('provider');
    expect(config).toHaveProperty('name');
    expect(config).toHaveProperty('ssl');
    expect(config).toHaveProperty('freeDomainTld');
    expect(config).toHaveProperty('cloudflare');
    expect(config.cloudflare).toHaveProperty('enabled');
    expect(config.cloudflare).toHaveProperty('tunnelToken');
    expect(config.cloudflare).toHaveProperty('tunnelName');
  });

  it('freedomain TLDs passed through buildDomainConfig are all valid', () => {
    const tlds: FreeDomainTld[] = ['.dpdns.org', '.qzz.io', '.us.kg'];

    for (const tld of tlds) {
      const config = buildDomainConfig({
        provider: 'freedomain',
        name: `myserver${tld}`,
        ssl: 'cloudflare',
        freeDomainTld: tld,
        cloudflare: { enabled: true, tunnelToken: '', tunnelName: '' },
      });

      expect(config.freeDomainTld).toBe(tld);
      expect(validateFreeDomainTld(config.freeDomainTld).valid).toBe(true);
    }
  });
});
