/**
 * Unit tests for services/compose-generator module (T061)
 *
 * TDD tests for docker-compose.yml generation from WizardState.
 *
 * Test case references:
 *   TC-08-01: Web Server + DB Server → compose contains both service definitions
 *   TC-08-02: All services selected → all service definitions present
 *   TC-08-05: Traefik selected → Host() routing labels present
 *   TC-08-06: Cloudflare tunnel enabled → cloudflared service block present
 *   TC-08-11: Any compose → brewnet (external) and brewnet-internal networks defined
 *
 * Mock strategy:
 *   - No external mocks needed — compose-generator is a pure function that
 *     transforms WizardState into a ComposeConfig object.
 *   - Uses `createDefaultWizardState()` and `applyFullInstallDefaults()`
 *     from config/defaults as state factories.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Dynamic imports (ESM compatible)
// ---------------------------------------------------------------------------

const { createDefaultWizardState, applyFullInstallDefaults } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

const { generateComposeConfig, composeConfigToYaml } = await import(
  '../../../../packages/cli/src/services/compose-generator.js'
);

import type {
  ComposeConfig,
  ComposeService,
} from '../../../../packages/cli/src/services/compose-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a WizardState with deep overrides applied on top of the default.
 */
function buildState(overrides: {
  admin?: Partial<WizardState['admin']>;
  servers?: Partial<{
    webServer: Partial<WizardState['servers']['webServer']>;
    fileServer: Partial<WizardState['servers']['fileServer']>;
    gitServer: Partial<WizardState['servers']['gitServer']>;
    dbServer: Partial<WizardState['servers']['dbServer']>;
    media: Partial<WizardState['servers']['media']>;
    sshServer: Partial<WizardState['servers']['sshServer']>;
    mailServer: Partial<WizardState['servers']['mailServer']>;
    appServer: Partial<WizardState['servers']['appServer']>;
    fileBrowser: Partial<WizardState['servers']['fileBrowser']>;
  }>;
  domain?: Partial<WizardState['domain']>;
  devStack?: Partial<WizardState['devStack']>;
} = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.admin) {
    Object.assign(state.admin, overrides.admin);
  }
  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      const servers = state.servers as unknown as Record<string, Record<string, unknown>>;
      servers[key] = {
        ...servers[key],
        ...(value as Record<string, unknown>),
      };
    }
  }
  if (overrides.domain) {
    if (overrides.domain.cloudflare) {
      state.domain.cloudflare = {
        ...state.domain.cloudflare,
        ...overrides.domain.cloudflare,
      };
      const { cloudflare: _, ...rest } = overrides.domain;
      Object.assign(state.domain, rest);
    } else {
      Object.assign(state.domain, overrides.domain);
    }
  }
  if (overrides.devStack) {
    Object.assign(state.devStack, overrides.devStack);
  }

  return state;
}

/**
 * Build a "full install" state with all services enabled for TC-08-02.
 */
function buildFullState(): WizardState {
  const state = applyFullInstallDefaults(createDefaultWizardState());
  return buildState({
    admin: { username: 'admin', password: 'TestAdminPass123!' },
    servers: {
      webServer: { enabled: true, service: 'traefik' },
      fileServer: { enabled: true, service: 'nextcloud' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: true,
        primary: 'postgresql',
        primaryVersion: '17',
        dbName: 'brewnet_db',
        dbUser: 'brewnet',
        dbPassword: 'DbPass123!',
        adminUI: true,
        cache: 'redis',
      },
      media: { enabled: true, services: ['jellyfin'] },
      sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      mailServer: { enabled: true, service: 'docker-mailserver' },
      appServer: { enabled: true },
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
    domain: {
      provider: 'custom',
      name: 'example.com',
      ssl: 'letsencrypt',
      cloudflare: { enabled: true, tunnelToken: 'test-token', tunnelName: 'brewnet-tunnel' },
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: get service names from a ComposeConfig
// ---------------------------------------------------------------------------

function serviceNames(config: ComposeConfig): string[] {
  return Object.keys(config.services);
}

// =========================================================================
// TC-08-11: Network definitions
// =========================================================================

describe('ComposeGenerator — Networks (TC-08-11)', () => {
  it('should define "brewnet" network with external: true', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(config.networks).toHaveProperty('brewnet');
    expect(config.networks['brewnet']).toMatchObject({ external: true });
  });

  it('should define "brewnet-internal" network with internal: true', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(config.networks).toHaveProperty('brewnet-internal');
    expect(config.networks['brewnet-internal']).toMatchObject({ internal: true });
  });

  it('should always include both networks regardless of service selection', () => {
    // Minimal state: only required services
    const minimal = buildState();
    const minConfig = generateComposeConfig(minimal);

    expect(Object.keys(minConfig.networks)).toContain('brewnet');
    expect(Object.keys(minConfig.networks)).toContain('brewnet-internal');

    // Full state: all services
    const full = buildFullState();
    const fullConfig = generateComposeConfig(full);

    expect(Object.keys(fullConfig.networks)).toContain('brewnet');
    expect(Object.keys(fullConfig.networks)).toContain('brewnet-internal');
  });

  it('should include exactly two network definitions', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(Object.keys(config.networks)).toHaveLength(2);
  });
});

// =========================================================================
// TC-08-01: Web Server + DB Server selected
// =========================================================================

describe('ComposeGenerator — Web + DB (TC-08-01)', () => {
  let config: ComposeConfig;

  beforeEach(() => {
    const state = buildState({
      admin: { username: 'admin', password: 'TestPass123!' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass123!',
          adminUI: false,
          cache: '',
        },
      },
    });
    config = generateComposeConfig(state);
  });

  it('should include the web server (traefik) service', () => {
    expect(config.services).toHaveProperty('traefik');
  });

  it('should include the database (postgresql) service', () => {
    expect(config.services).toHaveProperty('postgresql');
  });

  it('should include gitea (always-on required service)', () => {
    expect(config.services).toHaveProperty('gitea');
  });

  it('should set traefik image correctly', () => {
    expect(config.services['traefik']!.image).toMatch(/^traefik:/);
  });

  it('should set postgresql image correctly', () => {
    expect(config.services['postgresql']!.image).toMatch(/^postgres:\d+-alpine/);
  });

  it('should not include disabled services (nextcloud, jellyfin, ssh, mail)', () => {
    expect(config.services).not.toHaveProperty('nextcloud');
    expect(config.services).not.toHaveProperty('jellyfin');
    expect(config.services).not.toHaveProperty('openssh-server');
    expect(config.services).not.toHaveProperty('docker-mailserver');
    expect(config.services).not.toHaveProperty('cloudflared');
  });

  it('should not include cache service when cache is empty', () => {
    expect(config.services).not.toHaveProperty('redis');
    expect(config.services).not.toHaveProperty('valkey');
    expect(config.services).not.toHaveProperty('keydb');
  });

  it('should include cache service when cache is set', () => {
    const stateWithCache = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass123!',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    const configWithCache = generateComposeConfig(stateWithCache);

    expect(configWithCache.services).toHaveProperty('redis');
    expect(configWithCache.services['redis']!.image).toMatch(/^redis:\d+-alpine/);
  });

  it('should include pgadmin when adminUI is true and primary is postgresql', () => {
    const stateWithAdmin = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass123!',
          adminUI: true,
          cache: '',
        },
      },
    });
    const configWithAdmin = generateComposeConfig(stateWithAdmin);

    expect(configWithAdmin.services).toHaveProperty('pgadmin');
  });
});

// =========================================================================
// TC-08-02: All services selected
// =========================================================================

describe('ComposeGenerator — All services (TC-08-02)', () => {
  let config: ComposeConfig;

  beforeEach(() => {
    config = generateComposeConfig(buildFullState());
  });

  it('should include traefik (web server)', () => {
    expect(config.services).toHaveProperty('traefik');
  });

  it('should include gitea (git server)', () => {
    expect(config.services).toHaveProperty('gitea');
  });

  it('should include nextcloud (file server)', () => {
    expect(config.services).toHaveProperty('nextcloud');
  });

  it('should include postgresql (database)', () => {
    expect(config.services).toHaveProperty('postgresql');
  });

  it('should include redis (cache)', () => {
    expect(config.services).toHaveProperty('redis');
  });

  it('should include pgadmin (admin UI for postgresql)', () => {
    expect(config.services).toHaveProperty('pgadmin');
  });

  it('should include jellyfin (media server)', () => {
    expect(config.services).toHaveProperty('jellyfin');
  });

  it('should include openssh-server (SSH)', () => {
    expect(config.services).toHaveProperty('openssh-server');
  });

  it('should include docker-mailserver (mail)', () => {
    expect(config.services).toHaveProperty('docker-mailserver');
  });

  it('should include cloudflared (tunnel)', () => {
    expect(config.services).toHaveProperty('cloudflared');
  });

  it('should include filebrowser (file browser standalone)', () => {
    expect(config.services).toHaveProperty('filebrowser');
  });

  it('should have at least 11 service definitions', () => {
    // traefik, gitea, nextcloud, postgresql, redis, pgadmin,
    // jellyfin, openssh-server, docker-mailserver, cloudflared, filebrowser
    expect(Object.keys(config.services).length).toBeGreaterThanOrEqual(11);
  });
});

// =========================================================================
// TC-08-05: Traefik routing labels
// =========================================================================

describe('ComposeGenerator — Traefik labels (TC-08-05)', () => {
  let config: ComposeConfig;

  beforeEach(() => {
    const state = buildState({
      admin: { username: 'admin', password: 'TestPass123!' },
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: true,
          cache: 'redis',
        },
        media: { enabled: true, services: ['jellyfin'] },
      },
      domain: {
        provider: 'custom',
        name: 'example.com',
        ssl: 'letsencrypt',
      },
    });
    config = generateComposeConfig(state);
  });

  it('should set traefik.enable=true on traefik service', () => {
    const labels = config.services['traefik']!.labels ?? {};
    expect(labels['traefik.enable']).toBe('true');
  });

  it('should have Host() rule for traefik dashboard', () => {
    const labels = config.services['traefik']!.labels ?? {};
    const dashboardRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('traefik-dashboard') && k.includes('.rule'),
    );
    expect(dashboardRuleKey).toBeDefined();
    expect(labels[dashboardRuleKey!]).toContain('Host(`');
    expect(labels[dashboardRuleKey!]).toContain('example.com');
  });

  it('should set traefik.enable=true on gitea service', () => {
    const labels = config.services['gitea']!.labels ?? {};
    expect(labels['traefik.enable']).toBe('true');
  });

  it('should have Host() rule for gitea routing', () => {
    const labels = config.services['gitea']!.labels ?? {};
    const routerRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('gitea') && k.includes('.rule'),
    );
    expect(routerRuleKey).toBeDefined();
    expect(labels[routerRuleKey!]).toContain('Host(`');
    // Gitea subdomain is "git"
    expect(labels[routerRuleKey!]).toContain('git.');
    expect(labels[routerRuleKey!]).toContain('example.com');
  });

  it('should have Host() rule for nextcloud routing', () => {
    const labels = config.services['nextcloud']!.labels ?? {};
    const routerRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('nextcloud') && k.includes('.rule'),
    );
    expect(routerRuleKey).toBeDefined();
    expect(labels[routerRuleKey!]).toContain('Host(`');
    expect(labels[routerRuleKey!]).toContain('cloud.');
    expect(labels[routerRuleKey!]).toContain('example.com');
  });

  it('should have Host() rule for jellyfin routing', () => {
    const labels = config.services['jellyfin']!.labels ?? {};
    const routerRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('jellyfin') && k.includes('.rule'),
    );
    expect(routerRuleKey).toBeDefined();
    expect(labels[routerRuleKey!]).toContain('Host(`');
    expect(labels[routerRuleKey!]).toContain('jellyfin.');
    expect(labels[routerRuleKey!]).toContain('example.com');
  });

  it('should have Host() rule for pgadmin routing', () => {
    const labels = config.services['pgadmin']!.labels ?? {};
    const routerRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('pgadmin') && k.includes('.rule'),
    );
    expect(routerRuleKey).toBeDefined();
    expect(labels[routerRuleKey!]).toContain('Host(`');
    expect(labels[routerRuleKey!]).toContain('pgadmin.');
    expect(labels[routerRuleKey!]).toContain('example.com');
  });

  it('should set entrypoints to websecure on routers', () => {
    const labels = config.services['gitea']!.labels ?? {};
    const entrypointKey = Object.keys(labels).find((k: string) =>
      k.includes('gitea') && k.includes('.entrypoints'),
    );
    expect(entrypointKey).toBeDefined();
    expect(labels[entrypointKey!]).toBe('websecure');
  });

  it('should set certresolver to letsencrypt on routers', () => {
    const labels = config.services['gitea']!.labels ?? {};
    const certKey = Object.keys(labels).find((k: string) =>
      k.includes('gitea') && k.includes('.certresolver'),
    );
    expect(certKey).toBeDefined();
    expect(labels[certKey!]).toBe('letsencrypt');
  });

  it('should set loadbalancer server port for services', () => {
    const labels = config.services['gitea']!.labels ?? {};
    const portKey = Object.keys(labels).find((k: string) =>
      k.includes('gitea') && k.includes('loadbalancer.server.port'),
    );
    expect(portKey).toBeDefined();
    expect(labels[portKey!]).toBe('3000');
  });

  it('should resolve domain placeholder in labels with actual domain', () => {
    const labels = config.services['gitea']!.labels ?? {};
    const routerRuleKey = Object.keys(labels).find((k: string) =>
      k.includes('gitea') && k.includes('.rule'),
    );
    // Should NOT contain the {{DOMAIN}} placeholder
    expect(labels[routerRuleKey!]).not.toContain('{{DOMAIN}}');
    // Should contain the actual domain
    expect(labels[routerRuleKey!]).toContain('example.com');
  });

  it('should NOT have traefik labels on database services (no subdomain)', () => {
    const pgLabels = config.services['postgresql']!.labels ?? {};
    const hasTraefikEnable = Object.keys(pgLabels).some((k: string) =>
      k.startsWith('traefik.'),
    );
    // Databases are internal-only, no Traefik routing
    expect(hasTraefikEnable).toBe(false);
  });

  it('should NOT have traefik labels on cache services', () => {
    const redisLabels = config.services['redis']!.labels ?? {};
    const hasTraefikEnable = Object.keys(redisLabels).some((k: string) =>
      k.startsWith('traefik.'),
    );
    expect(hasTraefikEnable).toBe(false);
  });
});

// =========================================================================
// TC-08-06: Cloudflare tunnel
// =========================================================================

describe('ComposeGenerator — Cloudflare tunnel (TC-08-06)', () => {
  it('should include cloudflared service when cloudflare.enabled is true', () => {
    const state = buildState({
      domain: {
        provider: 'freedomain',
        name: 'myserver.dpdns.org',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          tunnelToken: 'my-tunnel-token',
          tunnelName: 'brewnet-tunnel',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('cloudflared');
  });

  it('should NOT include cloudflared service when cloudflare.enabled is false', () => {
    const state = buildState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
        cloudflare: { enabled: false, tunnelToken: '', tunnelName: '' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).not.toHaveProperty('cloudflared');
  });

  it('should set cloudflared image to cloudflare/cloudflared', () => {
    const state = buildState({
      domain: {
        cloudflare: {
          enabled: true,
          tunnelToken: 'test-token',
          tunnelName: 'test-tunnel',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services['cloudflared']!.image).toContain('cloudflare/cloudflared');
  });

  it('should include TUNNEL_TOKEN environment variable for cloudflared', () => {
    const state = buildState({
      domain: {
        cloudflare: {
          enabled: true,
          tunnelToken: 'my-secret-token',
          tunnelName: 'my-tunnel',
        },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['cloudflared']!.environment ?? {};

    expect(env['TUNNEL_TOKEN']).toBeDefined();
  });

  it('should place cloudflared on the brewnet network', () => {
    const state = buildState({
      domain: {
        cloudflare: {
          enabled: true,
          tunnelToken: 'token',
          tunnelName: 'tunnel',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services['cloudflared']!.networks).toContain('brewnet');
  });

  it('should set restart policy on cloudflared', () => {
    const state = buildState({
      domain: {
        cloudflare: {
          enabled: true,
          tunnelToken: 'token',
          tunnelName: 'tunnel',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services['cloudflared']!.restart).toBe('unless-stopped');
  });
});

// =========================================================================
// Constitution requirement: security_opt and restart policy
// =========================================================================

describe('ComposeGenerator — Security and restart policy', () => {
  it('should set security_opt: ["no-new-privileges:true"] on all services', () => {
    const config = generateComposeConfig(buildFullState());

    for (const [_name, svc] of Object.entries(config.services)) {
      const service = svc as ComposeService;
      expect(service.security_opt).toEqual(
        expect.arrayContaining(['no-new-privileges:true']),
      );
    }
  });

  it('should set restart: "unless-stopped" on all services', () => {
    const config = generateComposeConfig(buildFullState());

    for (const [_name, svc] of Object.entries(config.services)) {
      const service = svc as ComposeService;
      expect(service.restart).toBe('unless-stopped');
    }
  });

  it('should set container_name on every service', () => {
    const config = generateComposeConfig(buildFullState());

    for (const [_name, svc] of Object.entries(config.services)) {
      const service = svc as ComposeService;
      expect(service.container_name).toBeDefined();
      expect(typeof service.container_name).toBe('string');
      expect(service.container_name.length).toBeGreaterThan(0);
    }
  });

  it('should set image on every service', () => {
    const config = generateComposeConfig(buildFullState());

    for (const [_name, svc] of Object.entries(config.services)) {
      const service = svc as ComposeService;
      expect(service.image).toBeDefined();
      expect(typeof service.image).toBe('string');
      expect(service.image.length).toBeGreaterThan(0);
    }
  });
});

// =========================================================================
// depends_on ordering
// =========================================================================

describe('ComposeGenerator — depends_on ordering', () => {
  it('should make gitea depend on the database when DB is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const giteaDeps = config.services['gitea']!.depends_on;

    expect(giteaDeps).toBeDefined();
    if (Array.isArray(giteaDeps)) {
      expect(giteaDeps).toContain('postgresql');
    } else {
      expect(giteaDeps).toHaveProperty('postgresql');
    }
  });

  it('should make nextcloud depend on the database when both enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const ncDeps = config.services['nextcloud']!.depends_on;

    expect(ncDeps).toBeDefined();
    if (Array.isArray(ncDeps)) {
      expect(ncDeps).toContain('postgresql');
    } else {
      expect(ncDeps).toHaveProperty('postgresql');
    }
  });

  it('should make pgadmin depend on postgresql', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: true,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const pgAdminDeps = config.services['pgadmin']!.depends_on;

    expect(pgAdminDeps).toBeDefined();
    if (Array.isArray(pgAdminDeps)) {
      expect(pgAdminDeps).toContain('postgresql');
    } else {
      expect(pgAdminDeps).toHaveProperty('postgresql');
    }
  });

  it('should make gitea depend on cache when cache is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    const config = generateComposeConfig(state);
    const giteaDeps = config.services['gitea']!.depends_on;

    expect(giteaDeps).toBeDefined();
    if (Array.isArray(giteaDeps)) {
      expect(giteaDeps).toContain('redis');
    } else {
      expect(giteaDeps).toHaveProperty('redis');
    }
  });

  it('should NOT include depends_on for traefik (first to start)', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const traefikDeps = config.services['traefik']!.depends_on;

    // Traefik has no dependencies — it starts first
    expect(
      traefikDeps === undefined ||
      (Array.isArray(traefikDeps) && traefikDeps.length === 0) ||
      (typeof traefikDeps === 'object' && Object.keys(traefikDeps).length === 0),
    ).toBe(true);
  });
});

// =========================================================================
// Volume mounts for data persistence
// =========================================================================

describe('ComposeGenerator — Volume mounts', () => {
  it('should define volumes for postgresql data persistence', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const pgVolumes = config.services['postgresql']!.volumes;

    expect(pgVolumes).toBeDefined();
    expect(pgVolumes!.length).toBeGreaterThan(0);
    // Should mount a volume for PostgreSQL data directory
    const hasDataVolume = pgVolumes!.some(
      (v: string) => v.includes('/var/lib/postgresql/data') || v.includes('postgres'),
    );
    expect(hasDataVolume).toBe(true);
  });

  it('should define volumes for gitea data persistence', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const giteaVolumes = config.services['gitea']!.volumes;

    expect(giteaVolumes).toBeDefined();
    expect(giteaVolumes!.length).toBeGreaterThan(0);
    const hasDataVolume = giteaVolumes!.some(
      (v: string) => v.includes('/data') || v.includes('gitea'),
    );
    expect(hasDataVolume).toBe(true);
  });

  it('should define volumes for nextcloud data persistence', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    const config = generateComposeConfig(state);
    const ncVolumes = config.services['nextcloud']!.volumes;

    expect(ncVolumes).toBeDefined();
    expect(ncVolumes!.length).toBeGreaterThan(0);
  });

  it('should define volumes for jellyfin media and config', () => {
    const state = buildState({
      servers: {
        media: { enabled: true, services: ['jellyfin'] },
      },
    });
    const config = generateComposeConfig(state);
    const jfVolumes = config.services['jellyfin']!.volumes;

    expect(jfVolumes).toBeDefined();
    expect(jfVolumes!.length).toBeGreaterThan(0);
  });

  it('should define volumes for redis data persistence', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    const config = generateComposeConfig(state);
    const redisVolumes = config.services['redis']!.volumes;

    expect(redisVolumes).toBeDefined();
    expect(redisVolumes!.length).toBeGreaterThan(0);
  });

  it('should define volumes for traefik configuration', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const traefikVolumes = config.services['traefik']!.volumes;

    expect(traefikVolumes).toBeDefined();
    expect(traefikVolumes!.length).toBeGreaterThan(0);
    // Traefik needs access to Docker socket
    const hasDockerSocket = traefikVolumes!.some((v: string) =>
      v.includes('/var/run/docker.sock'),
    );
    expect(hasDockerSocket).toBe(true);
  });
});

// =========================================================================
// Port mappings
// =========================================================================

describe('ComposeGenerator — Port mappings', () => {
  it('should expose ports 80, 443 for traefik', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const ports = config.services['traefik']!.ports ?? [];

    expect(ports.some((p: string) => p.includes('80'))).toBe(true);
    expect(ports.some((p: string) => p.includes('443'))).toBe(true);
  });

  it('should expose SSH port 2222 for openssh-server', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });
    const config = generateComposeConfig(state);
    const ports = config.services['openssh-server']!.ports ?? [];

    expect(ports.some((p: string) => p.includes('2222'))).toBe(true);
  });

  it('should expose gitea ports (3000 web, 3022 ssh)', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const ports = config.services['gitea']!.ports ?? [];

    expect(ports.some((p: string) => p.includes('3000'))).toBe(true);
    expect(ports.some((p: string) => p.includes('3022'))).toBe(true);
  });

  it('should NOT expose database ports externally by default', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const pgPorts = config.services['postgresql']!.ports ?? [];

    // DB ports should either be empty or only exposed on internal network
    // The implementation may choose not to expose DB ports at all (best practice)
    // or expose them only to internal network
    expect(pgPorts.every((p: string) => !p.includes('0.0.0.0'))).toBe(true);
  });

  it('should expose mail server ports when mail is enabled', () => {
    const state = buildState({
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
      domain: { provider: 'custom', name: 'example.com' },
    });
    const config = generateComposeConfig(state);
    const ports = config.services['docker-mailserver']!.ports ?? [];

    // Mail server needs SMTP (25), submission (587), IMAPS (993)
    expect(ports.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// Network assignments per service
// =========================================================================

describe('ComposeGenerator — Network assignments', () => {
  it('should place traefik on brewnet network', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const nets = config.services['traefik']!.networks ?? [];

    expect(nets).toContain('brewnet');
  });

  it('should place database on brewnet-internal network', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const nets = config.services['postgresql']!.networks ?? [];

    expect(nets).toContain('brewnet-internal');
  });

  it('should place gitea on both brewnet and brewnet-internal', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const nets = config.services['gitea']!.networks ?? [];

    expect(nets).toContain('brewnet');
    expect(nets).toContain('brewnet-internal');
  });

  it('should place cache on brewnet-internal network', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    const config = generateComposeConfig(state);
    const nets = config.services['redis']!.networks ?? [];

    expect(nets).toContain('brewnet-internal');
  });
});

// =========================================================================
// MySQL variant
// =========================================================================

describe('ComposeGenerator — MySQL variant', () => {
  it('should include mysql service when primary is mysql', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('mysql');
    expect(config.services).not.toHaveProperty('postgresql');
    expect(config.services['mysql']!.image).toMatch(/^mysql:/);
  });

  it('should NOT include pgadmin when primary is mysql', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: true,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).not.toHaveProperty('pgadmin');
  });
});

// =========================================================================
// Alternative web servers
// =========================================================================

describe('ComposeGenerator — Alternative web servers', () => {
  it('should include nginx when web server is nginx', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'nginx' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('nginx');
    expect(config.services).not.toHaveProperty('traefik');
    expect(config.services['nginx']!.image).toMatch(/^nginx:/);
  });

  it('should include caddy when web server is caddy', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'caddy' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('caddy');
    expect(config.services).not.toHaveProperty('traefik');
    expect(config.services['caddy']!.image).toMatch(/^caddy:/);
  });
});

// =========================================================================
// Alternative cache engines
// =========================================================================

describe('ComposeGenerator — Alternative cache engines', () => {
  it('should include valkey when cache is valkey', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'valkey',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('valkey');
    expect(config.services).not.toHaveProperty('redis');
    expect(config.services['valkey']!.image).toContain('valkey');
  });

  it('should include keydb when cache is keydb', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'keydb',
        },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('keydb');
    expect(config.services).not.toHaveProperty('redis');
    expect(config.services['keydb']!.image).toContain('keydb');
  });
});

// =========================================================================
// MinIO file server variant
// =========================================================================

describe('ComposeGenerator — MinIO file server', () => {
  it('should include minio service when file server is minio', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'minio' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('minio');
    expect(config.services).not.toHaveProperty('nextcloud');
    expect(config.services['minio']!.image).toContain('minio');
  });
});

// =========================================================================
// Compose version
// =========================================================================

describe('ComposeGenerator — Compose config structure', () => {
  it('should set version to "3.8"', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(config.version).toBe('3.8');
  });

  it('should have services as a non-empty object', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(typeof config.services).toBe('object');
    expect(Object.keys(config.services).length).toBeGreaterThan(0);
  });

  it('should have networks as a non-empty object', () => {
    const state = buildState();
    const config = generateComposeConfig(state);

    expect(typeof config.networks).toBe('object');
    expect(Object.keys(config.networks).length).toBeGreaterThan(0);
  });
});

// =========================================================================
// composeConfigToYaml
// =========================================================================

describe('composeConfigToYaml', () => {
  it('should return a string', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(0);
  });

  it('should contain "version" key in YAML output', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    expect(yaml).toContain('version');
  });

  it('should contain "services" key in YAML output', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    expect(yaml).toContain('services');
  });

  it('should contain "networks" key in YAML output', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    expect(yaml).toContain('networks');
  });

  it('should contain service names in YAML output', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    // Default state includes traefik and gitea
    expect(yaml).toContain('traefik');
    expect(yaml).toContain('gitea');
  });

  it('should produce valid YAML with image references', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const yaml = composeConfigToYaml(config);

    // Should contain image references
    expect(yaml).toContain('image:');
  });
});

// =========================================================================
// Environment variable propagation to services
// =========================================================================

describe('ComposeGenerator — Environment variables', () => {
  it('should set POSTGRES_PASSWORD on postgresql service', () => {
    const state = buildState({
      admin: { password: 'AdminPass!' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass123!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['postgresql']!.environment ?? {};

    expect(env['POSTGRES_PASSWORD']).toBeDefined();
  });

  it('should set POSTGRES_USER and POSTGRES_DB on postgresql', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'mydb',
          dbUser: 'myuser',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['postgresql']!.environment ?? {};

    expect(env['POSTGRES_USER']).toBe('myuser');
    expect(env['POSTGRES_DB']).toBe('mydb');
  });

  it('should set Gitea database env vars when DB is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['gitea']!.environment ?? {};

    expect(env['GITEA__database__DB_TYPE']).toBeDefined();
  });

  it('should set SSH-related env vars on openssh-server', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['openssh-server']!.environment ?? {};

    expect(env['PASSWORD_ACCESS']).toBeDefined();
    expect(env['USER_NAME']).toBeDefined();
  });

  it('should set NEXTCLOUD_ADMIN_USER on nextcloud service', () => {
    const state = buildState({
      admin: { username: 'myadmin', password: 'Pass!' },
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    const config = generateComposeConfig(state);
    const env = config.services['nextcloud']!.environment ?? {};

    expect(env['NEXTCLOUD_ADMIN_USER']).toBe('myadmin');
  });
});

// =========================================================================
// Health checks
// =========================================================================

describe('ComposeGenerator — Health checks', () => {
  it('should include healthcheck for postgresql', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    const hc = config.services['postgresql']!.healthcheck;

    expect(hc).toBeDefined();
  });

  it('should include healthcheck for redis', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DbPass!',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    const config = generateComposeConfig(state);
    const hc = config.services['redis']!.healthcheck;

    expect(hc).toBeDefined();
  });

  it('should include healthcheck for gitea', () => {
    const state = buildState();
    const config = generateComposeConfig(state);
    const hc = config.services['gitea']!.healthcheck;

    expect(hc).toBeDefined();
  });
});

// =========================================================================
// FileBrowser modes
// =========================================================================

describe('ComposeGenerator — FileBrowser', () => {
  it('should include filebrowser service when mode is standalone', () => {
    const state = buildState({
      servers: {
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('filebrowser');
    expect(config.services['filebrowser']!.image).toContain('filebrowser');
  });

  it('should include filebrowser service when mode is directory', () => {
    const state = buildState({
      servers: {
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).toHaveProperty('filebrowser');
  });

  it('should NOT include filebrowser when disabled', () => {
    const state = buildState({
      servers: {
        fileBrowser: { enabled: false, mode: '' },
      },
    });
    const config = generateComposeConfig(state);

    expect(config.services).not.toHaveProperty('filebrowser');
  });
});

// =========================================================================
// Disabled DB — no database-related services
// =========================================================================

describe('ComposeGenerator — Disabled DB', () => {
  it('should not include any DB or cache services when DB is disabled', () => {
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
    const config = generateComposeConfig(state);

    expect(config.services).not.toHaveProperty('postgresql');
    expect(config.services).not.toHaveProperty('mysql');
    expect(config.services).not.toHaveProperty('redis');
    expect(config.services).not.toHaveProperty('valkey');
    expect(config.services).not.toHaveProperty('keydb');
    expect(config.services).not.toHaveProperty('pgadmin');
  });
});

// =========================================================================
// Minimal default state (only required: traefik + gitea)
// =========================================================================

describe('ComposeGenerator — Minimal default state', () => {
  it('should produce compose with at least traefik and gitea', () => {
    const state = createDefaultWizardState();
    // Default has webServer (traefik) + gitServer (gitea) + dbServer (postgresql) enabled
    const config = generateComposeConfig(state);
    const names = serviceNames(config);

    expect(names).toContain('traefik');
    expect(names).toContain('gitea');
  });

  it('should include DB services in default full install', () => {
    const state = applyFullInstallDefaults(createDefaultWizardState());
    const config = generateComposeConfig(state);
    const names = serviceNames(config);

    expect(names).toContain('postgresql');
    expect(names).toContain('redis');
  });
});

// =========================================================================
// Nextcloud + MySQL env (covers getNextcloudEnv mysql branch)
// =========================================================================

describe('ComposeGenerator — Nextcloud with MySQL env', () => {
  it('should configure nextcloud with mysql env when primary is mysql', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8',
          dbName: 'nextcloud_db',
          dbUser: 'nextcloud',
          dbPassword: 'dbpass123',
          adminUI: false,
          cache: '',
        },
      },
    });
    const config = generateComposeConfig(state);
    expect(config.services).toHaveProperty('nextcloud');
    const nextcloudService = config.services['nextcloud'];
    expect(nextcloudService).toBeDefined();
    // Environment should include mysql connection
    const env = nextcloudService?.environment as Record<string, string> | undefined;
    expect(env?.['MYSQL_HOST']).toBe('mysql');
  });
});

// =========================================================================
// Mail relay env (covers getMailEnv relay branch + env-generator relay)
// =========================================================================

describe('ComposeGenerator — Mail Server with relay provider', () => {
  it('should configure relay env when relayProvider is set', () => {
    const state = buildState({
      servers: {
        mailServer: {
          enabled: true,
          service: 'docker-mailserver',
          port25Blocked: true,
          relayProvider: 'sendgrid',
          relayHost: 'smtp.sendgrid.net',
          relayPort: 587,
          relayUser: 'apikey',
          relayPassword: 'SG.testtoken',
        },
      },
      domain: { provider: 'tunnel', name: 'test.dpdns.org' },
    });
    const config = generateComposeConfig(state);
    expect(config.services).toHaveProperty('docker-mailserver');
    const mailService = config.services['docker-mailserver'];
    const env = mailService?.environment as Record<string, string> | undefined;
    expect(env?.['DEFAULT_RELAY_HOST']).toContain('smtp.sendgrid.net');
  });
});
