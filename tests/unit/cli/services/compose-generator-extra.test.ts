/**
 * Additional unit tests for services/compose-generator
 *
 * Covers file-I/O utility functions not tested in compose-generator.test.ts:
 *   addExternalLabels, removeExternalLabels, addQuickTunnelAppLabels,
 *   patchCloudflaredToNamedTunnel, patchBuiltinServicesForNamedTunnel
 *
 * Strategy: mock node:fs so the YAML-based functions operate on in-memory
 * fixtures without touching the real filesystem.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fsFiles: Record<string, string> = {};

const mockReadFileSync = jest.fn((p: unknown) => {
  const path = p as string;
  if (!(path in fsFiles)) throw new Error(`ENOENT: no such file: ${path}`);
  return fsFiles[path]!;
});

const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsFiles[p as string] = data as string;
});

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(() => ({ size: 0 })),
}));

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------

const {
  addExternalLabels,
  removeExternalLabels,
  addQuickTunnelAppLabels,
  patchCloudflaredToNamedTunnel,
  patchBuiltinServicesForNamedTunnel,
} = await import('../../../../packages/cli/src/services/compose-generator.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPOSE_PATH = '/project/docker-compose.yml';

/** Build a minimal compose YAML string for testing. */
function makeComposeYaml(services: Record<string, unknown>): string {
  return yaml.dump({ services }, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false });
}

beforeEach(() => {
  fsFiles = {};
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// addExternalLabels
// ---------------------------------------------------------------------------

describe('addExternalLabels', () => {
  it('adds Traefik external labels to a service', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      myapp: { image: 'myapp:latest', container_name: 'myapp' },
    });

    addExternalLabels(COMPOSE_PATH, 'myapp', 'api.example.com', 8080);

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, Record<string, string>>> }).services;
    const labels = services['myapp']!['labels'];
    expect(labels['traefik.enable']).toBe('true');
    expect(labels['traefik.http.routers.myapp-external.rule']).toContain('api.example.com');
    expect(labels['traefik.http.services.myapp-external.loadbalancer.server.port']).toBe('8080');
  });

  it('finds service by brewnet- prefix when exact name not found', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      'brewnet-gitea': { image: 'gitea/gitea:latest' },
    });

    addExternalLabels(COMPOSE_PATH, 'gitea', 'git.example.com', 3000);

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, Record<string, string>>> }).services;
    const labels = services['brewnet-gitea']!['labels'];
    expect(labels['traefik.http.routers.gitea-external.rule']).toContain('git.example.com');
  });

  it('throws when service not found in compose file', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      traefik: { image: 'traefik:v2.10' },
    });

    expect(() => addExternalLabels(COMPOSE_PATH, 'notexist', 'x.example.com', 3000))
      .toThrow('Service "notexist" not found');
  });

  it('returns early when services section is missing', () => {
    fsFiles[COMPOSE_PATH] = yaml.dump({ version: '3' });
    // should not throw
    expect(() => addExternalLabels(COMPOSE_PATH, 'app', 'x.example.com', 3000)).not.toThrow();
    // writeFileSync should not have been called (early return)
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeExternalLabels
// ---------------------------------------------------------------------------

describe('removeExternalLabels', () => {
  it('removes previously added external labels', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      myapp: {
        image: 'myapp:latest',
        labels: {
          'traefik.enable': 'true',
          'traefik.http.routers.myapp-external.rule': 'Host(`api.example.com`)',
          'traefik.http.routers.myapp-external.entrypoints': 'web',
          'traefik.http.services.myapp-external.loadbalancer.server.port': '8080',
          'other.label': 'keep',
        },
      },
    });

    removeExternalLabels(COMPOSE_PATH, 'myapp');

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, Record<string, string>>> }).services;
    const labels = services['myapp']!['labels'];
    expect(labels['traefik.http.routers.myapp-external.rule']).toBeUndefined();
    expect(labels['traefik.http.services.myapp-external.loadbalancer.server.port']).toBeUndefined();
    // unrelated labels are kept
    expect(labels['other.label']).toBe('keep');
  });

  it('does nothing when service not found', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({ traefik: { image: 'traefik:v2.10' } });
    // Should not throw
    expect(() => removeExternalLabels(COMPOSE_PATH, 'notexist')).not.toThrow();
    // File was still written (yaml.dump of unchanged content), OR writeFileSync not called
    // Either way, no error should occur
  });

  it('does nothing when service has no labels', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({ myapp: { image: 'myapp:latest' } });
    expect(() => removeExternalLabels(COMPOSE_PATH, 'myapp')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// addQuickTunnelAppLabels
// ---------------------------------------------------------------------------

describe('addQuickTunnelAppLabels', () => {
  it('adds PathPrefix labels and brewnet network to a service', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      backend: { image: 'myapp:latest', networks: ['default'] },
    });

    addQuickTunnelAppLabels(COMPOSE_PATH, 'my-api', 'backend', 8080);

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, unknown>> }).services;
    const labels = services['backend']!['labels'] as Record<string, string>;
    expect(labels['traefik.enable']).toBe('true');
    expect(labels['traefik.http.routers.app-my-api.rule']).toContain('/apps/my-api');
    expect(labels['traefik.http.services.app-my-api.loadbalancer.server.port']).toBe('8080');
    // strip-prefix middleware applied (not noStrip)
    expect(labels['traefik.http.middlewares.app-my-api-strip.stripprefix.prefixes']).toBe('/apps/my-api');

    // brewnet network injected
    const topNetworks = (written as { networks: Record<string, unknown> }).networks;
    expect(topNetworks?.['brewnet']).toEqual({ external: true });
  });

  it('with noStrip=true: omits strip-prefix middleware', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      app: { image: 'nextjs:latest' },
    });

    addQuickTunnelAppLabels(COMPOSE_PATH, 'nextjs-app', 'app', 3000, true);

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, unknown>> }).services;
    const labels = services['app']!['labels'] as Record<string, string>;
    // no strip middleware in noStrip mode
    expect(labels['traefik.http.middlewares.app-nextjs-app-strip.stripprefix.prefixes']).toBeUndefined();
  });

  it('converts array-style labels to object format', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      backend: {
        image: 'myapp:latest',
        labels: ['existingkey=existingval'],
      },
    });

    addQuickTunnelAppLabels(COMPOSE_PATH, 'my-api', 'backend', 8080);

    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const services = (written as { services: Record<string, Record<string, unknown>> }).services;
    const labels = services['backend']!['labels'] as Record<string, string>;
    // Original array label preserved
    expect(labels['existingkey']).toBe('existingval');
    // New labels added
    expect(labels['traefik.enable']).toBe('true');
  });

  it('returns early when services section is missing', () => {
    fsFiles[COMPOSE_PATH] = yaml.dump({ version: '3' });
    expect(() => addQuickTunnelAppLabels(COMPOSE_PATH, 'app', 'svc', 3000)).not.toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns early when specific service not found', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({ traefik: { image: 'traefik:v2.10' } });
    expect(() => addQuickTunnelAppLabels(COMPOSE_PATH, 'app', 'backend', 3000)).not.toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchCloudflaredToNamedTunnel
// ---------------------------------------------------------------------------

describe('patchCloudflaredToNamedTunnel', () => {
  it('patches cloudflared service to named tunnel mode', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      cloudflared: {
        image: 'cloudflare/cloudflared:latest',
        command: ['tunnel', '--no-autoupdate', '--url', 'http://traefik:80'],
        environment: {},
      },
    });

    const result = patchCloudflaredToNamedTunnel(COMPOSE_PATH, 'my-tunnel-token');

    expect(result).toBe(true);
    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const svc = (written as { services: Record<string, Record<string, unknown>> }).services['cloudflared']!;
    expect(svc['command']).toEqual(['tunnel', '--no-autoupdate', 'run']);
    const env = svc['environment'] as Record<string, string>;
    expect(env['TUNNEL_TOKEN']).toBe('my-tunnel-token');
  });

  it('returns false when cloudflared service not found', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      traefik: { image: 'traefik:v2.10' },
    });

    const result = patchCloudflaredToNamedTunnel(COMPOSE_PATH, 'token');
    expect(result).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchBuiltinServicesForNamedTunnel
// ---------------------------------------------------------------------------

describe('patchBuiltinServicesForNamedTunnel', () => {
  it('returns empty array when domain is empty string', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({ gitea: { image: 'gitea/gitea' } });
    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, '');
    expect(changed).toEqual([]);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('patches gitea ROOT_URL to subdomain form', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      gitea: {
        image: 'gitea/gitea',
        environment: {
          'GITEA__server__ROOT_URL': 'https://abc.trycloudflare.com/git/',
          'GITEA__server__DOMAIN': 'abc.trycloudflare.com',
        },
      },
    });

    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, 'example.com');

    expect(changed).toContain('gitea');
    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const env = (written as {
      services: Record<string, { environment: Record<string, string> }>;
    }).services['gitea']!.environment;
    expect(env['GITEA__server__ROOT_URL']).toBe('https://git.example.com/');
    expect(env['GITEA__server__DOMAIN']).toBe('git.example.com');
  });

  it('patches nextcloud OVERWRITEWEBROOT to subdomain form', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      nextcloud: {
        image: 'nextcloud',
        environment: {
          'OVERWRITEWEBROOT': '/cloud',
          'NEXTCLOUD_TRUSTED_DOMAINS': 'localhost *.trycloudflare.com',
        },
      },
    });

    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, 'example.com');

    expect(changed).toContain('nextcloud');
    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const env = (written as {
      services: Record<string, { environment: Record<string, string> }>;
    }).services['nextcloud']!.environment;
    expect(env['OVERWRITEWEBROOT']).toBeUndefined();
    expect(env['OVERWRITEHOST']).toBe('cloud.example.com');
    expect(env['OVERWRITEPROTOCOL']).toBe('https');
  });

  it('patches pgadmin SCRIPT_NAME removal', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      pgadmin: {
        image: 'dpage/pgadmin4',
        environment: { 'SCRIPT_NAME': '/pgadmin' },
      },
    });

    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, 'example.com');
    expect(changed).toContain('pgadmin');
    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const env = (written as {
      services: Record<string, { environment: Record<string, string> }>;
    }).services['pgadmin']!.environment;
    expect(env['SCRIPT_NAME']).toBeUndefined();
  });

  it('patches filebrowser FB_BASEURL removal', () => {
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      filebrowser: {
        image: 'filebrowser/filebrowser',
        environment: { 'FB_BASEURL': '/files' },
      },
    });

    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, 'example.com');
    expect(changed).toContain('filebrowser');
    const written = yaml.load(fsFiles[COMPOSE_PATH]!) as Record<string, unknown>;
    const env = (written as {
      services: Record<string, { environment: Record<string, string> }>;
    }).services['filebrowser']!.environment;
    expect(env['FB_BASEURL']).toBeUndefined();
  });

  it('does not write file when nothing changed', () => {
    // gitea already has correct subdomain URL
    fsFiles[COMPOSE_PATH] = makeComposeYaml({
      gitea: {
        image: 'gitea/gitea',
        environment: {
          'GITEA__server__ROOT_URL': 'https://git.example.com/',
        },
      },
    });

    const changed = patchBuiltinServicesForNamedTunnel(COMPOSE_PATH, 'example.com');
    // gitea was NOT changed since URL is already correct
    expect(changed).not.toContain('gitea');
    // No write needed
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
