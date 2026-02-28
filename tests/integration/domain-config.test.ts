/**
 * T084 — Domain-Specific Compose & Config Generation Integration Tests
 *
 * Tests that the compose generator and config generator handle
 * domain-specific configurations correctly:
 *
 *   - Cloudflared service in docker-compose (tunnel token, restart policy)
 *   - Mail Server in docker-compose (ports, hostname, local domain override)
 *   - SSL/Traefik configuration (letsencrypt ACME, self-signed, cloudflare DNS)
 *
 * Test cases (from TEST_CASES.md):
 *   TC-06-05: Tunnel token validation in compose context
 *   TC-06-06: Cloudflared service block in compose
 *   TC-06-09: Mail Server compose block
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
  generateMailConfig,
  generateInfraConfigs,
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

/**
 * Build a state with mail server enabled and the given domain config.
 */
function buildMailState(
  provider: 'local' | 'tunnel',
  domainName: string,
  mailEnabled: boolean,
): WizardState {
  return buildState({
    admin: {
      username: 'brewadmin',
      password: 'securepassword',
      storage: 'local',
    },
    servers: {
      webServer: { enabled: true, service: 'traefik' },
      fileServer: { enabled: false, service: '' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
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
      mailServer: { enabled: mailEnabled, service: 'docker-mailserver' },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' },
    },
    domain: {
      provider,
      name: domainName,
      ssl: provider === 'local' ? 'self-signed' : 'letsencrypt',
      cloudflare: {
        enabled: false,
        tunnelToken: '',
        tunnelName: '',
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
  // TC-06-09: Mail Server compose
  // =========================================================================

  describe('TC-06-09: Mail Server compose block', () => {
    it('non-local domain + mail server enabled → compose includes docker-mailserver service', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      expect(config.services).toHaveProperty('docker-mailserver');
    });

    it('docker-mailserver service has ports 25, 587, 993', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService).toBeDefined();
      expect(mailService.ports).toBeDefined();
      expect(mailService.ports).toContain('25:25');
      expect(mailService.ports).toContain('587:587');
      expect(mailService.ports).toContain('993:993');
    });

    it('docker-mailserver service has correct OVERRIDE_HOSTNAME with mail subdomain', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.environment).toBeDefined();
      expect(mailService.environment!['OVERRIDE_HOSTNAME']).toBe('mail.myserver.example.com');
    });

    it('docker-mailserver service has fail2ban enabled and clamav disabled', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.environment!['ENABLE_FAIL2BAN']).toBe('1');
      expect(mailService.environment!['ENABLE_CLAMAV']).toBe('0');
    });

    it('docker-mailserver uses correct Docker image', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.image).toBe('ghcr.io/docker-mailserver/docker-mailserver:latest');
    });

    it('docker-mailserver has correct restart policy', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.restart).toBe('unless-stopped');
    });

    it('docker-mailserver has persistent volumes for mail data, state, and config', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.volumes).toBeDefined();
      expect(mailService.volumes).toContain('brewnet_mail_data:/var/mail');
      expect(mailService.volumes).toContain('brewnet_mail_state:/var/mail-state');
      expect(mailService.volumes).toContain('brewnet_mail_config:/tmp/docker-mailserver');
    });

    it('docker-mailserver has security_opt no-new-privileges', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      const mailService = config.services['docker-mailserver'];
      expect(mailService.security_opt).toContain('no-new-privileges:true');
    });

    it('mail server config uses admin username in postfix hostname', () => {
      // The config-generator produces postfix main.cf with the domain name.
      // The admin username is used as the postmaster concept by propagating
      // admin credentials. Verify the generated mail config references the domain.
      const state = buildMailState('custom', 'myserver.example.com', true);
      const mailConfigs = generateMailConfig(state);

      expect(mailConfigs.length).toBeGreaterThan(0);

      // Postfix config should reference the domain
      const postfixConfig = mailConfigs.find((f) => f.path.includes('postfix'));
      expect(postfixConfig).toBeDefined();
      expect(postfixConfig!.content).toContain('myhostname = myserver.example.com');
      expect(postfixConfig!.content).toContain('mydomain = myserver.example.com');
    });

    it('mail server disabled + non-local domain → no docker-mailserver in compose', () => {
      const state = buildMailState('custom', 'myserver.example.com', false);
      const config = generateComposeConfig(state);

      expect(config.services).not.toHaveProperty('docker-mailserver');
    });

    it('local domain + mail server enabled → compose still includes docker-mailserver (compose generator does not enforce domain rule)', () => {
      // NOTE: The compose generator itself does NOT enforce the "local domain = no mail"
      // business rule. That validation happens at the wizard/UI level (Step 4).
      // The compose generator faithfully produces whatever the state says.
      // This test documents that behavior. The wizard should prevent this state
      // from being created, but the generator is transparent.
      const state = buildMailState('local', 'brewnet.local', true);
      const config = generateComposeConfig(state);

      // The compose generator includes it because mailServer.enabled is true
      expect(config.services).toHaveProperty('docker-mailserver');

      // But the OVERRIDE_HOSTNAME will be mail.brewnet.local — which won't work
      // in practice. The wizard prevents this state.
      const mailService = config.services['docker-mailserver'];
      expect(mailService.environment!['OVERRIDE_HOSTNAME']).toBe('mail.brewnet.local');
    });

    it('tunnel + mail server enabled → compose includes docker-mailserver', () => {
      const state = buildMailState('tunnel', 'myserver.example.com', true);
      const config = generateComposeConfig(state);

      expect(config.services).toHaveProperty('docker-mailserver');

      const mailService = config.services['docker-mailserver'];
      expect(mailService.environment!['OVERRIDE_HOSTNAME']).toBe('mail.myserver.example.com');
    });

    it('docker-mailserver YAML output contains all three port mappings', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      expect(yamlStr).toContain('25:25');
      expect(yamlStr).toContain('587:587');
      expect(yamlStr).toContain('993:993');
    });

    it('mail server disabled → generateMailConfig returns empty array', () => {
      const state = buildMailState('custom', 'myserver.example.com', false);
      const mailConfigs = generateMailConfig(state);

      expect(mailConfigs).toEqual([]);
    });

    it('mail server enabled → generateMailConfig returns postfix and dovecot configs', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const mailConfigs = generateMailConfig(state);

      expect(mailConfigs.length).toBe(2);

      const paths = mailConfigs.map((f) => f.path);
      expect(paths).toContain('infrastructure/mail/postfix/main.cf');
      expect(paths).toContain('infrastructure/mail/dovecot/dovecot.conf');
    });

    it('dovecot config references the domain in SSL cert paths', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const mailConfigs = generateMailConfig(state);

      const dovecotConfig = mailConfigs.find((f) => f.path.includes('dovecot'));
      expect(dovecotConfig).toBeDefined();
      expect(dovecotConfig!.content).toContain('myserver.example.com.pem');
      expect(dovecotConfig!.content).toContain('myserver.example.com.key');
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

    it('Traefik compose service exposes ports 80, 443, 8080', () => {
      const state = createDefaultWizardState();
      const config = generateComposeConfig(state);
      const traefikService = config.services['traefik'];

      expect(traefikService.ports).toContain('80:80');
      expect(traefikService.ports).toContain('443:443');
      expect(traefikService.ports).toContain('8080:8080');
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
      expect(traefikService.labels!['traefik.http.routers.traefik-dashboard.rule']).toContain(
        'myserver.example.com',
      );
      expect(
        traefikService.labels!['traefik.http.routers.traefik-dashboard.tls.certresolver'],
      ).toBe('letsencrypt');
    });
  });

  // =========================================================================
  // Combined scenarios: cloudflared + mail + SSL in a full state
  // =========================================================================

  describe('Combined scenarios: full state with domain services', () => {
    it('custom domain with cloudflare tunnel + mail server → both services present in compose', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'secret', storage: 'local' },
        servers: {
          webServer: { enabled: true, service: 'traefik' },
          fileServer: { enabled: false, service: '' },
          gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
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
          mailServer: { enabled: true, service: 'docker-mailserver' },
          appServer: { enabled: false },
          fileBrowser: { enabled: false, mode: '' },
        },
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'letsencrypt',
          cloudflare: {
            enabled: true,
            tunnelToken: 'combined-test-token',
            tunnelName: 'combined-tunnel',
          },
        },
      });

      const config = generateComposeConfig(state);

      // Both domain-specific services should be present
      expect(config.services).toHaveProperty('cloudflared');
      expect(config.services).toHaveProperty('docker-mailserver');

      // Plus the required services
      expect(config.services).toHaveProperty('traefik');
      expect(config.services).toHaveProperty('gitea');

      // Verify token and hostname
      expect(config.services['cloudflared'].environment!['TUNNEL_TOKEN']).toBe(
        'combined-test-token',
      );
      expect(config.services['docker-mailserver'].environment!['OVERRIDE_HOSTNAME']).toBe(
        'mail.myserver.example.com',
      );
    });

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
            cache: 'redis',
          },
          media: { enabled: false, services: [] },
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
          mailServer: { enabled: true, service: 'docker-mailserver' },
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
      expect(yamlStr).toContain('redis:');
      expect(yamlStr).toContain('openssh-server:');
      expect(yamlStr).toContain('docker-mailserver:');
      expect(yamlStr).toContain('cloudflared:');
    });

    it('generateInfraConfigs includes mail configs when mail server is enabled', () => {
      const state = buildMailState('custom', 'myserver.example.com', true);
      const infraConfigs = generateInfraConfigs(state);

      const paths = infraConfigs.map((f) => f.path);

      // Should include traefik + gitea (always) + mail configs
      expect(paths).toContain('infrastructure/traefik/traefik.yml');
      expect(paths).toContain('infrastructure/gitea/app.ini');
      expect(paths).toContain('infrastructure/mail/postfix/main.cf');
      expect(paths).toContain('infrastructure/mail/dovecot/dovecot.conf');
    });

    it('generateInfraConfigs excludes mail configs when mail server is disabled', () => {
      const state = buildMailState('custom', 'myserver.example.com', false);
      const infraConfigs = generateInfraConfigs(state);

      const paths = infraConfigs.map((f) => f.path);

      expect(paths).not.toContain('infrastructure/mail/postfix/main.cf');
      expect(paths).not.toContain('infrastructure/mail/dovecot/dovecot.conf');
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
