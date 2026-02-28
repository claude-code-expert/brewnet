/**
 * Unit tests for wizard/steps/server-components module (T050)
 *
 * Tests the pure business logic functions that enforce server component
 * toggle rules in Step 2 of the Brewnet CLI wizard.
 *
 * Test cases: TC-04-05 through TC-04-17 (from TEST_CASES.md)
 *
 * Strategy: Import pure functions, feed them WizardState objects built
 * from createDefaultWizardState(), and assert the returned state.
 * No mocks needed except for password generation (deterministic tests).
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock password generation for deterministic tests
// ---------------------------------------------------------------------------

const MOCK_PASSWORD = 'MockDbPass1234XY';

jest.unstable_mockModule(
  '../../../../packages/cli/src/utils/password.js',
  () => ({
    generatePassword: jest.fn(() => MOCK_PASSWORD),
  }),
);

// ---------------------------------------------------------------------------
// Imports — must come AFTER jest.unstable_mockModule calls
// ---------------------------------------------------------------------------

const { generatePassword } = await import(
  '../../../../packages/cli/src/utils/password.js'
);

const {
  applyComponentRules,
  isMailServerAvailable,
  shouldAutoSuggestSftp,
  applyDevStackAutoEnables,
  isCacheSelectionAvailable,
} = await import(
  '../../../../packages/cli/src/wizard/steps/server-components.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

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
}>= {}): WizardState {
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

// ── TC-04-05: Web Server cannot be disabled (always required) ───────────────

describe('TC-04-05: Web Server always required', () => {
  it('returns webServer.enabled = true even when the input has it as true', () => {
    const state = buildState();
    // Default already has webServer.enabled = true, but verify applyComponentRules preserves it
    const result = applyComponentRules(state);
    expect(result.servers.webServer.enabled).toBe(true);
  });

  it('forces webServer.enabled back to true if somehow set to false', () => {
    const state = buildState();
    // Force the enabled field to false to simulate an invalid state
    // TypeScript literal type prevents direct assignment, so we use type assertion
    (state.servers.webServer as { enabled: boolean }).enabled = false;
    const result = applyComponentRules(state);
    expect(result.servers.webServer.enabled).toBe(true);
  });

  it('preserves the selected web server service when enforcing enabled', () => {
    const state = buildState({
      servers: { webServer: { enabled: true, service: 'nginx' } },
    });
    const result = applyComponentRules(state);
    expect(result.servers.webServer.enabled).toBe(true);
    expect(result.servers.webServer.service).toBe('nginx');
  });
});

// ── TC-04-06: Git Server always enabled ─────────────────────────────────────

describe('TC-04-06: Git Server always enabled', () => {
  it('returns gitServer.enabled = true from default state', () => {
    const state = buildState();
    const result = applyComponentRules(state);
    expect(result.servers.gitServer.enabled).toBe(true);
  });

  it('forces gitServer.enabled back to true if somehow set to false', () => {
    const state = buildState();
    (state.servers.gitServer as { enabled: boolean }).enabled = false;
    const result = applyComponentRules(state);
    expect(result.servers.gitServer.enabled).toBe(true);
  });

  it('preserves gitServer configuration (port, sshPort, service)', () => {
    const state = buildState();
    state.servers.gitServer.port = 4000;
    state.servers.gitServer.sshPort = 4022;
    const result = applyComponentRules(state);
    expect(result.servers.gitServer.enabled).toBe(true);
    expect(result.servers.gitServer.service).toBe('gitea');
    expect(result.servers.gitServer.port).toBe(4000);
    expect(result.servers.gitServer.sshPort).toBe(4022);
  });
});

// ── TC-04-07: File Server enabled → SFTP auto-suggested ────────────────────

describe('TC-04-07: File Server enabled → SFTP auto-suggested', () => {
  it('sets sshServer.sftp = true when fileServer is enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.sftp).toBe(true);
  });

  it('shouldAutoSuggestSftp returns true when fileServer is enabled', () => {
    const state = buildState({
      servers: { fileServer: { enabled: true, service: 'nextcloud' } },
    });
    expect(shouldAutoSuggestSftp(state)).toBe(true);
  });

  it('shouldAutoSuggestSftp returns false when fileServer is disabled and media is disabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: false, service: '' },
        media: { enabled: false, services: [] },
      },
    });
    expect(shouldAutoSuggestSftp(state)).toBe(false);
  });

  it('sets sftp = true with MinIO file server as well', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'minio' },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.sftp).toBe(true);
  });
});

// ── TC-04-08: Media Server enabled → SFTP auto-suggested ───────────────────

describe('TC-04-08: Media Server enabled → SFTP auto-suggested', () => {
  it('sets sshServer.sftp = true when media is enabled', () => {
    const state = buildState({
      servers: {
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.sftp).toBe(true);
  });

  it('shouldAutoSuggestSftp returns true when media is enabled', () => {
    const state = buildState({
      servers: { media: { enabled: true, services: ['jellyfin'] } },
    });
    expect(shouldAutoSuggestSftp(state)).toBe(true);
  });

  it('sets sftp = true when both fileServer and media are enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.sftp).toBe(true);
  });
});

// ── TC-04-09: Local domain → Mail Server hidden ────────────────────────────

describe('TC-04-09: Local domain → Mail Server hidden', () => {
  it('isMailServerAvailable returns false when domain.provider is "local"', () => {
    const state = buildState({
      domain: { provider: 'local' },
    });
    expect(isMailServerAvailable(state)).toBe(false);
  });

  it('applyComponentRules forces mailServer.enabled = false when domain is local', () => {
    const state = buildState({
      domain: { provider: 'local' },
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });

    const result = applyComponentRules(state);
    expect(result.servers.mailServer.enabled).toBe(false);
  });

  it('disables mail server even if user explicitly enabled it with local domain', () => {
    const state = buildState({
      domain: { provider: 'local', name: 'brewnet.local' },
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });

    const result = applyComponentRules(state);
    expect(result.servers.mailServer.enabled).toBe(false);
  });
});

// ── TC-04-10: Non-local domain → Mail Server available ─────────────────────

describe('TC-04-10: Non-local domain → Mail Server available', () => {
  it('isMailServerAvailable returns true when domain.provider is "tunnel"', () => {
    const state = buildState({
      domain: { provider: 'tunnel', name: 'example.com' },
    });
    expect(isMailServerAvailable(state)).toBe(true);
  });

  it('isMailServerAvailable returns true when domain.provider is "tunnel" (free subdomain)', () => {
    const state = buildState({
      domain: { provider: 'tunnel', name: 'myserver.example.com' },
    });
    expect(isMailServerAvailable(state)).toBe(true);
  });

  it('applyComponentRules preserves mailServer.enabled = true for tunnel domain', () => {
    const state = buildState({
      domain: { provider: 'tunnel', name: 'example.com' },
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });

    const result = applyComponentRules(state);
    expect(result.servers.mailServer.enabled).toBe(true);
  });

  it('applyComponentRules preserves mailServer.enabled = false if user chose not to enable', () => {
    const state = buildState({
      domain: { provider: 'tunnel', name: 'example.com' },
      servers: { mailServer: { enabled: false, service: 'docker-mailserver' } },
    });

    const result = applyComponentRules(state);
    expect(result.servers.mailServer.enabled).toBe(false);
  });
});

// ── TC-04-11: DB Server enabled → cache layer available ────────────────────

describe('TC-04-11: DB Server enabled → cache selection available', () => {
  it('isCacheSelectionAvailable returns true when dbServer is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'existing',
          adminUI: true,
          cache: 'redis',
        },
      },
    });
    expect(isCacheSelectionAvailable(state)).toBe(true);
  });

  it('isCacheSelectionAvailable returns false when dbServer is disabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: false,
          primary: '',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });
    expect(isCacheSelectionAvailable(state)).toBe(false);
  });

  it('preserves cache selection (redis) when DB is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'existing',
          adminUI: true,
          cache: 'redis',
        },
      },
    });
    const result = applyComponentRules(state);
    expect(result.servers.dbServer.cache).toBe('redis');
  });

  it('allows different cache options (valkey, keydb)', () => {
    for (const cache of ['valkey', 'keydb'] as const) {
      const state = buildState({
        servers: {
          dbServer: {
            enabled: true,
            primary: 'mysql',
            primaryVersion: '8.0',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'existing',
            adminUI: false,
            cache,
          },
        },
      });
      expect(isCacheSelectionAvailable(state)).toBe(true);
      const result = applyComponentRules(state);
      expect(result.servers.dbServer.cache).toBe(cache);
    }
  });
});

// ── TC-04-13: SSH Server default → passwordAuth = false ────────────────────

describe('TC-04-13: SSH Server default → passwordAuth = false (key-only)', () => {
  it('default state has sshServer.passwordAuth = false', () => {
    const state = createDefaultWizardState();
    expect(state.servers.sshServer.passwordAuth).toBe(false);
  });

  it('applyComponentRules preserves passwordAuth = false when SSH is enabled', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.passwordAuth).toBe(false);
  });

  it('does not override an explicit passwordAuth = true setting', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: true, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    // If user explicitly set passwordAuth to true, the function should respect it
    // (applyComponentRules only sets it when undefined)
    expect(result.servers.sshServer.passwordAuth).toBe(true);
  });

  it('SSH Server uses port 2222 by default', () => {
    const state = createDefaultWizardState();
    expect(state.servers.sshServer.port).toBe(2222);
    const result = applyComponentRules(state);
    expect(result.servers.sshServer.port).toBe(2222);
  });
});

// ── TC-04-14: DB Server enabled → dbPassword auto-generated ────────────────

describe('TC-04-14: DB Server enabled → dbPassword auto-generated if empty', () => {
  it('auto-generates dbPassword when dbServer is enabled and password is empty', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: '',
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);
    expect(generatePassword).toHaveBeenCalledWith(16);
  });

  it('does not overwrite an existing dbPassword', () => {
    const existingPassword = 'UserSupplied!Pass99';
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: existingPassword,
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.dbServer.dbPassword).toBe(existingPassword);
    expect(generatePassword).not.toHaveBeenCalled();
  });

  it('does not generate password when dbServer is disabled (even if password is empty)', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: false,
          primary: '',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.dbServer.dbPassword).toBe('');
    expect(generatePassword).not.toHaveBeenCalled();
  });
});

// ── TC-04-15: No language selected → App Server disabled ───────────────────

describe('TC-04-15: No language selected → App Server disabled', () => {
  it('keeps appServer disabled when languages and frontend are empty', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
  });

  it('disables appServer when devStack is completely empty (default state)', () => {
    const state = createDefaultWizardState();
    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
  });

  it('disables fileBrowser when no devStack is selected', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });
});

// ── TC-04-16: Language selected → App Server auto-enabled ──────────────────

describe('TC-04-16: Language selected → App Server auto-enabled', () => {
  it('enables appServer when a backend language is selected', () => {
    const state = buildState({
      devStack: { languages: ['nodejs'], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('enables appServer when multiple languages are selected', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: null,
      },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('enables appServer when only frontend is selected (no backend language)', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: 'react' },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('enables appServer when both languages and frontend are selected', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'express' },
        frontend: 'react',
      },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('works with each individual language option', () => {
    const languages = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'] as const;

    for (const lang of languages) {
      const state = buildState({
        devStack: { languages: [lang], frameworks: {}, frontend: null },
      });

      const result = applyDevStackAutoEnables(state);
      expect(result.servers.appServer.enabled).toBe(true);
    }
  });

  it('works with each individual frontend option', () => {
    const frontendOptions = ['react', 'vue', 'svelte'] as const;

    for (const fe of frontendOptions) {
      const state = buildState({
        devStack: { languages: [], frameworks: {}, frontend: fe },
      });

      const result = applyDevStackAutoEnables(state);
      expect(result.servers.appServer.enabled).toBe(true);
    }
  });
});

// ── TC-04-17: App Server auto-enabled → FileBrowser auto-enabled ───────────

describe('TC-04-17: App Server auto-enabled → FileBrowser auto-enabled', () => {
  it('enables fileBrowser when languages are selected (app server auto-enabled)', () => {
    const state = buildState({
      devStack: { languages: ['nodejs'], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });

  it('enables fileBrowser when frontend is selected', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: 'react' },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });

  it('disables fileBrowser when devStack is cleared (languages + frontend removed)', () => {
    // Start with devStack selected
    const stateWithDevStack = buildState({
      devStack: { languages: ['python'], frameworks: { python: 'fastapi' }, frontend: null },
    });
    const enabledResult = applyDevStackAutoEnables(stateWithDevStack);
    expect(enabledResult.servers.fileBrowser.enabled).toBe(true);

    // Now clear devStack
    const stateCleared = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });
    const disabledResult = applyDevStackAutoEnables(stateCleared);
    expect(disabledResult.servers.appServer.enabled).toBe(false);
    expect(disabledResult.servers.fileBrowser.enabled).toBe(false);
  });

  it('both appServer and fileBrowser are enabled together', () => {
    const state = buildState({
      devStack: {
        languages: ['java'],
        frameworks: { java: 'spring' },
        frontend: 'svelte',
      },
    });

    const result = applyDevStackAutoEnables(state);
    // Both should be in sync
    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });
});

// ── Immutability: applyComponentRules does not mutate input ────────────────

describe('Immutability guarantees', () => {
  it('applyComponentRules does not mutate the input state', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: '',
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const originalPassword = state.servers.dbServer.dbPassword;
    const originalJson = JSON.stringify(state);

    applyComponentRules(state);

    // Input state should be unchanged
    expect(state.servers.dbServer.dbPassword).toBe(originalPassword);
    expect(JSON.stringify(state)).toBe(originalJson);
  });

  it('applyDevStackAutoEnables does not mutate the input state', () => {
    const state = buildState({
      devStack: { languages: ['nodejs'], frameworks: {}, frontend: null },
    });

    const originalAppServer = state.servers.appServer.enabled;
    const originalFileBrowser = state.servers.fileBrowser.enabled;
    const originalJson = JSON.stringify(state);

    applyDevStackAutoEnables(state);

    expect(state.servers.appServer.enabled).toBe(originalAppServer);
    expect(state.servers.fileBrowser.enabled).toBe(originalFileBrowser);
    expect(JSON.stringify(state)).toBe(originalJson);
  });
});

// ── Combined rules: applyComponentRules + applyDevStackAutoEnables ─────────

describe('Combined rule application', () => {
  it('full pipeline: component rules + devStack auto-enables produce valid state', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.0',
          dbName: 'app_db',
          dbUser: 'app',
          dbPassword: '',
          adminUI: false,
          cache: 'valkey',
        },
        media: { enabled: true, services: ['jellyfin'] },
      },
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: 'react',
      },
      domain: { provider: 'tunnel', name: 'example.com' },
    });

    // Apply component rules first
    const afterRules = applyComponentRules(state);

    // Then apply devStack auto-enables
    const finalState = applyDevStackAutoEnables(afterRules);

    // Required components
    expect(finalState.servers.webServer.enabled).toBe(true);
    expect(finalState.servers.gitServer.enabled).toBe(true);

    // SFTP auto-suggested (file + media enabled)
    expect(finalState.servers.sshServer.sftp).toBe(true);

    // DB password auto-generated
    expect(finalState.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);

    // App server + file browser auto-enabled
    expect(finalState.servers.appServer.enabled).toBe(true);
    expect(finalState.servers.fileBrowser.enabled).toBe(true);

    // Mail server available (custom domain)
    expect(isMailServerAvailable(finalState)).toBe(true);

    // Cache available (DB enabled)
    expect(isCacheSelectionAvailable(finalState)).toBe(true);
    expect(finalState.servers.dbServer.cache).toBe('valkey');
  });

  it('minimal state: all defaults, no devStack, local domain', () => {
    const state = createDefaultWizardState();

    const afterRules = applyComponentRules(state);
    const finalState = applyDevStackAutoEnables(afterRules);

    // Required components enabled
    expect(finalState.servers.webServer.enabled).toBe(true);
    expect(finalState.servers.gitServer.enabled).toBe(true);

    // No SFTP (no file/media)
    expect(finalState.servers.sshServer.sftp).toBe(false);

    // DB password auto-generated (default state has dbServer enabled with empty password)
    expect(finalState.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);

    // No devStack → appServer and fileBrowser disabled
    expect(finalState.servers.appServer.enabled).toBe(false);
    expect(finalState.servers.fileBrowser.enabled).toBe(false);

    // Mail server not available (local domain)
    expect(isMailServerAvailable(finalState)).toBe(false);
    expect(finalState.servers.mailServer.enabled).toBe(false);
  });

  it('partial install with tunnel domain and SSH server', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        dbServer: {
          enabled: false,
          primary: '',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
      },
    });

    const result = applyComponentRules(state);

    // SSH key-only auth
    expect(result.servers.sshServer.passwordAuth).toBe(false);

    // No SFTP (no file/media)
    expect(result.servers.sshServer.sftp).toBe(false);

    // Mail available (tunnel domain)
    expect(isMailServerAvailable(result)).toBe(true);

    // No DB password generation (DB disabled)
    expect(result.servers.dbServer.dbPassword).toBe('');
    expect(generatePassword).not.toHaveBeenCalled();

    // Cache not available (DB disabled)
    expect(isCacheSelectionAvailable(result)).toBe(false);
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('applyComponentRules works with all optional components disabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: false, service: '' },
        dbServer: {
          enabled: false,
          primary: '',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
        media: { enabled: false, services: [] },
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
        mailServer: { enabled: false, service: 'docker-mailserver' },
        appServer: { enabled: false },
        fileBrowser: { enabled: false, mode: '' },
      },
    });

    const result = applyComponentRules(state);

    // Only required components enabled
    expect(result.servers.webServer.enabled).toBe(true);
    expect(result.servers.gitServer.enabled).toBe(true);
    expect(result.servers.fileServer.enabled).toBe(false);
    expect(result.servers.dbServer.enabled).toBe(false);
    expect(result.servers.media.enabled).toBe(false);
    expect(result.servers.sshServer.enabled).toBe(false);
    expect(result.servers.mailServer.enabled).toBe(false);
    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });

  it('applyDevStackAutoEnables does not affect non-server state', () => {
    const state = buildState({
      devStack: { languages: ['rust'], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);

    // Non-server fields should be preserved
    expect(result.projectName).toBe(state.projectName);
    expect(result.projectPath).toBe(state.projectPath);
    expect(result.setupType).toBe(state.setupType);
    expect(result.admin).toEqual(state.admin);
    expect(result.devStack).toEqual(state.devStack);
    expect(result.boilerplate).toEqual(state.boilerplate);
    expect(result.domain).toEqual(state.domain);
  });

  it('SFTP stays false when neither file server nor media is enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: false, service: '' },
        media: { enabled: false, services: [] },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.sshServer.sftp).toBe(false);
  });

  it('applyComponentRules can be called multiple times idempotently', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: '',
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const first = applyComponentRules(state);
    const second = applyComponentRules(first);

    // generatePassword called once for first call, not again for second
    // (because after first call, dbPassword is set)
    expect(first.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);
    expect(second.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);

    // Other rules should produce same result
    expect(first.servers.webServer.enabled).toBe(second.servers.webServer.enabled);
    expect(first.servers.gitServer.enabled).toBe(second.servers.gitServer.enabled);
    expect(first.servers.sshServer.sftp).toBe(second.servers.sshServer.sftp);
  });

  it('applyDevStackAutoEnables can be called multiple times idempotently', () => {
    const state = buildState({
      devStack: { languages: ['go'], frameworks: {}, frontend: 'svelte' },
    });

    const first = applyDevStackAutoEnables(state);
    const second = applyDevStackAutoEnables(first);

    expect(first.servers.appServer.enabled).toBe(second.servers.appServer.enabled);
    expect(first.servers.fileBrowser.enabled).toBe(second.servers.fileBrowser.enabled);
  });

  it('DB server with SQLite still gets password auto-generated', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: 'brewnet_db',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });

    const result = applyComponentRules(state);
    expect(result.servers.dbServer.dbPassword).toBe(MOCK_PASSWORD);
  });
});
