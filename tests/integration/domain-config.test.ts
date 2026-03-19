/**
 * T084 — Domain-Specific Compose & Config Generation Integration Tests
 *
 * Tests that the compose generator and config generator handle
 * domain-specific configurations correctly:
 *
 *   - Cloudflared service in docker-compose (tunnel token, restart policy)
 *   - SSL/Traefik configuration (letsencrypt ACME, self-signed, cloudflare DNS)
 *
 * Test cases (from TEST_CASES.md):
 *   TC-06-05: Tunnel token validation in compose context
 *   TC-06-06: Cloudflared service block in compose
 *   SSL/Traefik config tests (letsencrypt, self-signed, cloudflare)
 *
 * Approach: Use `createDefaultWizardState()` + deep-merge overrides to build
 * test states. Import compose/config generators directly and verify the
 * generated YAML output.
 *
 * @module tests/integration/domain-config
 */

import { describe, it, expect } from '@jest/globals';

import {
  generateComposeConfig,
  composeConfigToYaml,
} from '../../packages/cli/src/services/compose-generator.js';

import {
  generateTraefikConfig,
} from '../../packages/cli/src/services/config-generator.js';

import { createDefaultWizardState } from '../../packages/cli/src/config/defaults.js';

import type { WizardState } from '../../packages/shared/src/types/wizard-state.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Deep-merge helper: recursively merges `overrides` into a copy of `base`.
 * Arrays are replaced, not merged. Handles nested objects properly.
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown>,
): T {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overrideVal = overrides[key];

    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }
  return result;
}

/**
 * Build a WizardState for testing by deep-merging overrides onto the default state.
 *
 * Usage:
 *   buildState({ domain: { cloudflare: { enabled: true, tunnelToken: 'tok' } } })
 */
function buildState(overrides: Record<string, unknown> = {}): WizardState {
  const base = createDefaultWizardState();
  return deepMerge(base, overrides) as unknown as WizardState;
}

/**
 * Build a state with Cloudflare Tunnel enabled and a custom domain.
 */
function buildCloudflareState(tunnelToken: string): WizardState {
  return buildState({
    domain: {
      provider: 'custom',
      name: 'myserver.example.com',
      ssl: 'letsencrypt',
      cloudflare: {
        enabled: true,
        tunnelToken,
        tunnelName: 'my-tunnel',
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T084 — Domain-Specific Compose & Config Generation', () => {
  // =========================================================================
  // TC-06-05: Tunnel token validation in compose context
  // =========================================================================

  describe('TC-06-05: Tunnel token validation in compose context', () => {
    it('cloudflare tunnel enabled + empty token → compose includes cloudflared but with placeholder token', () => {
      // When cloudflare.enabled is true but tunnelToken is empty, the compose
      // generator still produces the service block, but the TUNNEL_TOKEN env
      // falls back to the '${TUNNEL_TOKEN}' placeholder. This means the compose
      // file is structurally valid but will fail at runtime unless the user
      // provides the token via .env.
      const state = buildCloudflareState('');
      const config = generateComposeConfig(state);

      // The cloudflared service IS included (generator does not validate token)
      expect(config.services).toHaveProperty('cloudflared');

      // But the token environment value is the fallback placeholder
      const cfEnv = config.services['cloudflared'].environment;
      expect(cfEnv).toBeDefined();
      expect(cfEnv!['TUNNEL_TOKEN']).toBe('${TUNNEL_TOKEN}');
    });

    it('cloudflare tunnel enabled + valid token → compose includes cloudflared with real token', () => {
      const state = buildCloudflareState('eyJhIjoiYWJjMTIzIn0.secret-tunnel-token');
      const config = generateComposeConfig(state);

      expect(config.services).toHaveProperty('cloudflared');

      const cfEnv = config.services['cloudflared'].environment;
      expect(cfEnv).toBeDefined();
      expect(cfEnv!['TUNNEL_TOKEN']).toBe('eyJhIjoiYWJjMTIzIn0.secret-tunnel-token');
    });

    it('cloudflare tunnel enabled + valid token → YAML output contains the token value', () => {
      const token = 'real-tunnel-token-abc123';
      const state = buildCloudflareState(token);
      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      expect(yamlStr).toContain(token);
      expect(yamlStr).toContain('TUNNEL_TOKEN');
    });
  });

  // =========================================================================
  // TC-06-06: Cloudflared service in compose
  // =========================================================================

  describe('TC-06-06: Cloudflared service block in compose', () => {
    it('cloudflared enabled → compose YAML includes cloudflared service block', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      expect(config.services).toHaveProperty('cloudflared');
      expect(yamlStr).toContain('cloudflared');
    });

    it('cloudflared service has tunnel token in environment', () => {
      const state = buildCloudflareState('my-super-secret-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService).toBeDefined();
      expect(cfService.environment).toBeDefined();
      expect(cfService.environment!['TUNNEL_TOKEN']).toBe('my-super-secret-token');
    });

    it('cloudflared service has correct restart policy (unless-stopped)', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.restart).toBe('unless-stopped');
    });

    it('cloudflared service uses the correct Docker image', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.image).toBe('cloudflare/cloudflared:latest');
    });

    it('cloudflared service has correct container name', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.container_name).toBe('brewnet-cloudflared');
    });

    it('cloudflared service has the tunnel run command', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.command).toEqual(['tunnel', '--no-autoupdate', 'run']);
    });

    it('cloudflared service has no exposed ports', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      // Cloudflared connects outbound, so no inbound ports are needed
      expect(cfService.ports).toBeUndefined();
    });

    it('cloudflared service has no volumes', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      // Cloudflared is stateless when using tunnel tokens
      expect(cfService.volumes).toBeUndefined();
    });

    it('cloudflared service has security_opt no-new-privileges', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.security_opt).toContain('no-new-privileges:true');
    });

    it('cloudflared service is on the brewnet network', () => {
      const state = buildCloudflareState('valid-token');
      const config = generateComposeConfig(state);

      const cfService = config.services['cloudflared'];
      expect(cfService.networks).toContain('brewnet');
    });

    it('cloudflared disabled → no cloudflared service in compose', () => {
      const state = buildState({
        domain: {
          provider: 'local',
          name: 'brewnet.local',
          ssl: 'self-signed',
          cloudflare: {
            enabled: false,
            tunnelToken: '',
            tunnelName: '',
          },
        },
      });

      const config = generateComposeConfig(state);

      expect(config.services).not.toHaveProperty('cloudflared');
    });

    it('cloudflared disabled → YAML does not contain cloudflared', () => {
      const state = buildState({
        domain: {
          provider: 'local',
          name: 'brewnet.local',
          ssl: 'self-signed',
          cloudflare: {
            enabled: false,
            tunnelToken: '',
            tunnelName: '',
          },
        },
      });

      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      expect(yamlStr).not.toContain('cloudflared');
    });
  });

  // =========================================================================
  // SSL/Traefik configuration
  // =========================================================================

  describe('SSL/Traefik config generation', () => {
    it('letsencrypt SSL → Traefik config includes ACME/certresolver section', () => {
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      expect(traefikConfig.content).toContain('certificatesResolvers');
      expect(traefikConfig.content).toContain('letsencrypt');
      expect(traefikConfig.content).toContain('acme');
      expect(traefikConfig.content).toContain('httpChallenge');
      expect(traefikConfig.content).toContain('admin@myserver.example.com');
      expect(traefikConfig.content).toContain('acme.json');
    });

    it('letsencrypt SSL → Traefik config uses HTTP challenge with web entrypoint', () => {
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      expect(traefikConfig.content).toContain('entryPoint: web');
    });

    it('letsencrypt SSL → Traefik config stores certificates at /letsencrypt/acme.json', () => {
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      expect(traefikConfig.content).toContain('storage: /letsencrypt/acme.json');
    });

    it('self-signed SSL → no ACME/certresolver labels in Traefik config', () => {
      const state = buildState({
        domain: {
          provider: 'local',
          name: 'brewnet.local',
          ssl: 'self-signed',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      expect(traefikConfig.content).not.toContain('certificatesResolvers');
      expect(traefikConfig.content).not.toContain('acme');
      expect(traefikConfig.content).not.toContain('httpChallenge');
    });

    it('self-signed SSL → Traefik config still has entrypoints and Docker provider', () => {
      const state = buildState({
        domain: {
          provider: 'local',
          name: 'brewnet.local',
          ssl: 'self-signed',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      // Core Traefik config should always be present
      expect(traefikConfig.content).toContain('entryPoints');
      expect(traefikConfig.content).toContain('address: ":80"');
      expect(traefikConfig.content).toContain('address: ":443"');
      expect(traefikConfig.content).toContain('providers');
      expect(traefikConfig.content).toContain('docker');
      expect(traefikConfig.content).toContain('unix:///var/run/docker.sock');
    });

    it('cloudflare SSL → no HTTP challenge ACME labels (not letsencrypt mode)', () => {
      // When SSL mode is 'cloudflare', the current Traefik config generator
      // does not produce the certificatesResolvers block because it only
      // generates ACME for ssl === 'letsencrypt'. Cloudflare SSL is handled
      // by Cloudflare's edge, not by Traefik's ACME.
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'cloudflare',
          cloudflare: { enabled: true, tunnelToken: 'some-token', tunnelName: 'my-tunnel' },
        },
      });

      const traefikConfig = generateTraefikConfig(state);

      // Cloudflare mode: SSL is terminated at Cloudflare edge, not at Traefik
      // So no ACME HTTP challenge should be present
      expect(traefikConfig.content).not.toContain('certificatesResolvers');
      expect(traefikConfig.content).not.toContain('httpChallenge');
    });

    it('Traefik config file is always at infrastructure/traefik/traefik.yml', () => {
      const state = createDefaultWizardState();
      const traefikConfig = generateTraefikConfig(state);

      expect(traefikConfig.path).toBe('infrastructure/traefik/traefik.yml');
    });

    it('Traefik compose service has letsencrypt cert volume', () => {
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const config = generateComposeConfig(state);
      const traefikService = config.services['traefik'];

      expect(traefikService).toBeDefined();
      expect(traefikService.volumes).toBeDefined();
      expect(traefikService.volumes).toContain('brewnet_traefik_certs:/letsencrypt');
    });

    it('Traefik compose service exposes ports 80 and 443', () => {
      const state = createDefaultWizardState();
      const config = generateComposeConfig(state);
      const traefikService = config.services['traefik'];

      expect(traefikService.ports).toContain('80:80');
      expect(traefikService.ports).toContain('443:443');
      // Port 8080 is intentionally excluded — dashboard uses label-based routing (api.insecure=false)
    });

    it('Traefik compose service has dashboard routing labels (when web server is traefik)', () => {
      const state = buildState({
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
        },
      });

      const config = generateComposeConfig(state);
      const traefikService = config.services['traefik'];

      expect(traefikService.labels).toBeDefined();
      expect(traefikService.labels!['traefik.enable']).toBe('true');
      // Dashboard uses PathPrefix routing via brewnet-dashboard router (api.insecure=false)
      expect(
        traefikService.labels!['traefik.http.routers.brewnet-dashboard.rule'],
      ).toBeDefined();
      expect(
        traefikService.labels!['traefik.http.routers.brewnet-dashboard.rule'],
      ).toContain('PathPrefix(');
    });
  });

  // =========================================================================
  // Combined scenarios: cloudflared + mail + SSL in a full state
  // =========================================================================

  describe('Combined scenarios: full state with domain services', () => {
    it('YAML output for full domain state is valid and contains all expected sections', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'secret', storage: 'local' },
        servers: {
          webServer: { enabled: true, service: 'traefik' },
          fileServer: { enabled: false, service: '' },
          gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'dbpass',
            adminUI: false,
            cache: '',
          },
          media: { enabled: false, services: [] },
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
          appServer: { enabled: false },
          fileBrowser: { enabled: false, mode: '' },
        },
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: {
            enabled: true,
            tunnelToken: 'full-state-token',
            tunnelName: 'full-tunnel',
          },
        },
      });

      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      // Should be parseable as YAML (basic structural check)
      expect(yamlStr).not.toContain('version:');
      expect(yamlStr).toContain('services:');
      expect(yamlStr).toContain('networks:');
      expect(yamlStr).toContain('volumes:');

      // All expected services should be in the YAML
      expect(yamlStr).toContain('traefik:');
      expect(yamlStr).toContain('gitea:');
      expect(yamlStr).toContain('postgresql:');
      expect(yamlStr).toContain('openssh-server:');
      expect(yamlStr).toContain('cloudflared:');
    });

    it('compose networks include both brewnet (external) and brewnet-internal', () => {
      const state = createDefaultWizardState();
      const config = generateComposeConfig(state);

      expect(config.networks).toHaveProperty('brewnet');
      expect(config.networks['brewnet']).toEqual({ external: true });
      expect(config.networks).toHaveProperty('brewnet-internal');
      expect(config.networks['brewnet-internal']).toEqual({ internal: true });
    });

    it('should declare top-level named volumes (no deprecated version field)', () => {
      const state = createDefaultWizardState();
      const config = generateComposeConfig(state);

      expect((config as Record<string, unknown>)['version']).toBeUndefined();
      expect(config.volumes).toBeDefined();
    });
  });
});
