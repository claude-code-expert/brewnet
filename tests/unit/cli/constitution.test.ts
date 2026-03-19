/**
 * T108 — Constitution Compliance Unit Tests (Phase 11)
 *
 * Verifies that the Brewnet project adheres to its design constitution:
 *
 *   TC-C-01: Zero Config — createDefaultWizardState() produces a valid config
 *   TC-C-02: Secure by Default — SSH key-only, .env chmod 600, no root login
 *   TC-C-03: Transparent — all compose services include security_opt and restart
 *
 * These are pure-function, zero-side-effect tests that verify the structural
 * guarantees of the configuration generators without mocking the filesystem.
 */

import { describe, it, expect } from '@jest/globals';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Dynamic imports (ESM compatible)
// ---------------------------------------------------------------------------

const { createDefaultWizardState, applyFullInstallDefaults } = await import(
  '../../../packages/cli/src/config/defaults.js'
);

const { generateComposeConfig } = await import(
  '../../../packages/cli/src/services/compose-generator.js'
);

const { generateSshdConfig } = await import(
  '../../../packages/cli/src/services/config-generator.js'
);

import type { ComposeConfig, ComposeService } from
  '../../../packages/cli/src/services/compose-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a WizardState with deep overrides on top of the default.
 */
function buildState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState() as WizardState;
  return {
    ...base,
    ...overrides,
    servers: {
      ...base.servers,
      ...(overrides.servers ?? {}),
    },
    domain: {
      ...base.domain,
      ...(overrides.domain ?? {}),
      cloudflare: {
        ...base.domain.cloudflare,
        ...(overrides.domain?.cloudflare ?? {}),
      },
    },
    admin: {
      ...base.admin,
      ...(overrides.admin ?? {}),
    },
  } as WizardState;
}

/**
 * Build a "full install" WizardState with all optional services enabled
 * to maximize the number of services in the compose output.
 */
function buildFullState(): WizardState {
  const base = createDefaultWizardState() as WizardState;
  const full = applyFullInstallDefaults(base) as WizardState;
  return {
    ...full,
    admin: { ...full.admin, password: 'test-password-123' },
    servers: {
      ...full.servers,
      fileServer: { enabled: true, service: 'nextcloud' },
      media: { enabled: true, services: ['jellyfin'] },
      sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
    domain: {
      ...full.domain,
      provider: 'custom',
      name: 'test.brewnet.dev',
      ssl: 'letsencrypt',
      cloudflare: { enabled: true, tunnelToken: 'test-token', tunnelName: 'test-tunnel' },
    },
  } as WizardState;
}

/**
 * Extract all service entries from a ComposeConfig as an array of
 * [serviceId, serviceDefinition] pairs.
 */
function getAllServices(config: ComposeConfig): Array<[string, ComposeService]> {
  return Object.entries(config.services);
}

// ═══════════════════════════════════════════════════════════════════════════
// TC-C-01: Zero Config
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-C-01: Zero Config — default state produces a valid configuration', () => {
  it('should have correct default server selections (traefik, gitea, postgresql)', () => {
    const state = createDefaultWizardState();
    expect(state.servers.webServer).toEqual(expect.objectContaining({ enabled: true, service: 'traefik' }));
    expect(state.servers.gitServer).toEqual(expect.objectContaining({ enabled: true, service: 'gitea' }));
    expect(state.servers.dbServer).toEqual(expect.objectContaining({ enabled: true, primary: 'postgresql' }));
  });

  it('should have domain defaults that work without external setup', () => {
    const state = createDefaultWizardState();
    expect(state.domain.provider).toBe('local');
    expect(state.domain.ssl).toBe('self-signed');
  });

  it('should generate a valid compose config from the default state', () => {
    const state = createDefaultWizardState() as WizardState;
    const config = generateComposeConfig(state);

    expect(Object.keys(config.services).length).toBeGreaterThanOrEqual(2);
    expect(config.services['traefik']).toBeDefined();
    expect(config.services['gitea']).toBeDefined();
    expect(config.networks['brewnet']).toBeDefined();
    expect(config.networks['brewnet-internal']).toBeDefined();
    expect(Object.keys(config.volumes!).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-C-02: Secure by Default
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-C-02: Secure by Default — SSH, .env, root login', () => {
  // SSH key-only auth by default
  describe('SSH defaults', () => {
    it('should default sshServer.passwordAuth to false (key-only)', () => {
      const state = createDefaultWizardState();
      expect(state.servers.sshServer.passwordAuth).toBe(false);
    });

    it('should generate sshd_config with PasswordAuthentication no by default', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toContain('PasswordAuthentication no');
    });

    it('should generate sshd_config with PubkeyAuthentication yes', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toContain('PubkeyAuthentication yes');
    });

    it('should generate sshd_config with PermitRootLogin no', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toContain('PermitRootLogin no');
    });

    it('should respect explicit passwordAuth=true when user overrides', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: true, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toContain('PasswordAuthentication yes');
    });

    it('should limit MaxAuthTries for brute-force protection', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toMatch(/MaxAuthTries\s+\d+/);
    });

    it('should disable X11Forwarding for security', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;

      const sshdConfig = generateSshdConfig(state);
      expect(sshdConfig.content).toContain('X11Forwarding no');
    });
  });

  // .env file permissions
  describe('.env file permissions', () => {
    it('should have ENV_FILE_PERMISSIONS constant set to 0o600 (owner read/write only)', async () => {
      const { ENV_FILE_PERMISSIONS } = await import('@brewnet/shared');
      expect(ENV_FILE_PERMISSIONS).toBe(0o600);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-C-03: Transparent — compose security_opt and restart policy
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-C-03: Transparent — all services have security_opt and restart', () => {
  describe('full state (all services enabled)', () => {
    it('should include security_opt, restart, container_name, and networks on every service', () => {
      const state = buildFullState();
      const config = generateComposeConfig(state);
      const services = getAllServices(config);

      expect(services.length).toBeGreaterThanOrEqual(6);

      for (const [id, svc] of services) {
        expect(svc.security_opt).toEqual(['no-new-privileges:true']);
        expect(svc.restart).toBe('unless-stopped');
        expect(svc.container_name).toMatch(/^brewnet-/);
        expect(svc.networks.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('individual service types comply', () => {
    const serviceScenarios: Array<{
      name: string;
      stateOverride: Partial<WizardState>;
      expectedServiceId: string;
    }> = [
      {
        name: 'Traefik (web server)',
        stateOverride: {},
        expectedServiceId: 'traefik',
      },
      {
        name: 'Gitea (git server)',
        stateOverride: {},
        expectedServiceId: 'gitea',
      },
      {
        name: 'PostgreSQL (database)',
        stateOverride: {},
        expectedServiceId: 'postgresql',
      },
    ];

    it.each(serviceScenarios)(
      '$name should have security_opt and restart in compose output',
      ({ stateOverride, expectedServiceId }) => {
        const state = buildState(stateOverride) as WizardState;
        const fullState = applyFullInstallDefaults(state) as WizardState;
        const config = generateComposeConfig(fullState);

        const svc = config.services[expectedServiceId];
        expect(svc).toBeDefined();
        expect(svc.security_opt).toEqual(['no-new-privileges:true']);
        expect(svc.restart).toBe('unless-stopped');
      },
    );

    it('Nextcloud (file server) should have security_opt and restart', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          fileServer: { enabled: true, service: 'nextcloud' },
        },
      }) as WizardState;
      const config = generateComposeConfig(state);

      const svc = config.services['nextcloud'];
      expect(svc).toBeDefined();
      expect(svc.security_opt).toEqual(['no-new-privileges:true']);
      expect(svc.restart).toBe('unless-stopped');
    });

    it('Jellyfin (media) should have security_opt and restart', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          media: { enabled: true, services: ['jellyfin'] },
        },
      }) as WizardState;
      const config = generateComposeConfig(state);

      const svc = config.services['jellyfin'];
      expect(svc).toBeDefined();
      expect(svc.security_opt).toEqual(['no-new-privileges:true']);
      expect(svc.restart).toBe('unless-stopped');
    });

    it('OpenSSH (SSH server) should have security_opt and restart', () => {
      const state = buildState({
        servers: {
          ...createDefaultWizardState().servers,
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        },
      }) as WizardState;
      const config = generateComposeConfig(state);

      const svc = config.services['openssh-server'];
      expect(svc).toBeDefined();
      expect(svc.security_opt).toEqual(['no-new-privileges:true']);
      expect(svc.restart).toBe('unless-stopped');
    });

    it('Cloudflared (tunnel) should have security_opt and restart', () => {
      const state = buildState({
        domain: {
          ...createDefaultWizardState().domain,
          cloudflare: { enabled: true, tunnelToken: 'tok', tunnelName: 'tun' },
        },
      }) as WizardState;
      const config = generateComposeConfig(state);

      const svc = config.services['cloudflared'];
      expect(svc).toBeDefined();
      expect(svc.security_opt).toEqual(['no-new-privileges:true']);
      expect(svc.restart).toBe('unless-stopped');
    });
  });
});
