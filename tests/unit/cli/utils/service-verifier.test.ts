/**
 * Unit tests for utils/service-verifier
 *
 * Covers: buildServiceUrlMap, buildServiceAccessGuide, verifyServiceAccess
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { WizardState } from '@brewnet/shared';
import {
  buildServiceUrlMap,
  buildServiceAccessGuide,
  verifyServiceAccess,
} from '../../../../packages/cli/src/utils/service-verifier.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    schemaVersion: 7,
    projectName: 'test',
    projectPath: '/proj',
    setupType: 'full',
    admin: { username: 'admin', password: 'pw', storage: 'local' as const },
    servers: {
      webServer: { enabled: true as const, service: 'traefik' as const },
      fileServer: { enabled: false, service: '' as const },
      gitServer: { enabled: true as const, service: 'gitea' as const, port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: false, primary: '' as const, primaryVersion: '',
        dbName: '', dbUser: '', dbPassword: '', adminUI: false, pgadminEmail: '',
        cache: '' as const,
      },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' as const },
    },
    devStack: { languages: [], frameworks: {}, frontend: null },
    boilerplate: { generate: false, sampleData: false, devMode: 'production' as const },
    domain: {
      provider: 'tunnel' as const,
      name: 'example.com',
      ssl: 'cloudflare' as const,
      cloudflare: {
        enabled: true,
        tunnelMode: 'named' as const,
        quickTunnelUrl: '',
        accountId: 'acc-123',
        apiToken: 'token',
        tunnelId: 'tun-456',
        tunnelToken: 'tok',
        tunnelName: 'brewnet',
        zoneId: 'zone-abc',
        zoneName: 'example.com',
      },
    },
    domainConnections: [],
    portRemapping: {},
    ...overrides,
  } as WizardState;
}

// ---------------------------------------------------------------------------
// buildServiceUrlMap
// ---------------------------------------------------------------------------

describe('buildServiceUrlMap — basic', () => {
  it('includes web server and gitea entries for minimal state', () => {
    const state = makeMinimalState();
    const entries = buildServiceUrlMap(state);
    const ids = entries.map((e) => e.serviceId);
    expect(ids).toContain('traefik');
    expect(ids).toContain('gitea');
  });

  it('includes traefik-dashboard when web server is traefik', () => {
    const state = makeMinimalState();
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'traefik-dashboard')).toBeDefined();
  });

  it('does not include traefik-dashboard for nginx', () => {
    const state = makeMinimalState();
    (state.servers.webServer as { service: string }).service = 'nginx';
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'traefik-dashboard')).toBeUndefined();
  });

  it('applies portRemapping for web server', () => {
    const state = makeMinimalState({ portRemapping: { 80: 8080 } });
    const entries = buildServiceUrlMap(state);
    const traefik = entries.find((e) => e.serviceId === 'traefik');
    expect(traefik?.localUrl).toContain('8080');
  });
});

describe('buildServiceUrlMap — Named Tunnel external URLs', () => {
  it('sets external URL for gitea in named tunnel mode', () => {
    const state = makeMinimalState();
    const entries = buildServiceUrlMap(state);
    const gitea = entries.find((e) => e.serviceId === 'gitea');
    expect(gitea?.externalUrl).toBe('https://git.example.com');
  });

  it('sets external URL for web server in named tunnel mode', () => {
    const state = makeMinimalState();
    const entries = buildServiceUrlMap(state);
    const traefik = entries.find((e) => e.serviceId === 'traefik');
    expect(traefik?.externalUrl).toBe('https://example.com');
  });
});

describe('buildServiceUrlMap — Quick Tunnel mode', () => {
  function makeQuickState(): WizardState {
    return makeMinimalState({
      domain: {
        provider: 'quick-tunnel' as const,
        name: '',
        ssl: 'none' as const,
        cloudflare: {
          enabled: true,
          tunnelMode: 'quick' as const,
          quickTunnelUrl: 'https://abc-def.trycloudflare.com',
          accountId: '',
          apiToken: '',
          tunnelId: '',
          tunnelToken: '',
          tunnelName: '',
          zoneId: '',
          zoneName: '',
        },
      },
    });
  }

  it('uses path-based routing for gitea in quick tunnel', () => {
    const entries = buildServiceUrlMap(makeQuickState());
    const gitea = entries.find((e) => e.serviceId === 'gitea');
    expect(gitea?.localUrl).toContain('/git');
    expect(gitea?.externalUrl).toBe('https://abc-def.trycloudflare.com/git');
  });

  it('sets external URL for web server in quick tunnel', () => {
    const entries = buildServiceUrlMap(makeQuickState());
    const traefik = entries.find((e) => e.serviceId === 'traefik');
    expect(traefik?.externalUrl).toBe('https://abc-def.trycloudflare.com');
  });
});

describe('buildServiceUrlMap — optional services', () => {
  it('includes nextcloud when file server is nextcloud', () => {
    const state = makeMinimalState();
    (state.servers.fileServer as { enabled: boolean; service: string }).enabled = true;
    (state.servers.fileServer as { enabled: boolean; service: string }).service = 'nextcloud';
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'nextcloud')).toBeDefined();
  });

  it('includes minio when file server is minio', () => {
    const state = makeMinimalState();
    (state.servers.fileServer as { enabled: boolean; service: string }).enabled = true;
    (state.servers.fileServer as { enabled: boolean; service: string }).service = 'minio';
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'minio')).toBeDefined();
  });

  it('includes jellyfin when media is enabled', () => {
    const state = makeMinimalState();
    (state.servers.media as { enabled: boolean }).enabled = true;
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'jellyfin')).toBeDefined();
  });

  it('includes pgadmin when DB + adminUI + postgresql', () => {
    const state = makeMinimalState();
    Object.assign(state.servers.dbServer, {
      enabled: true,
      adminUI: true,
      primary: 'postgresql',
    });
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'pgadmin')).toBeDefined();
  });

  it('includes filebrowser in standalone mode', () => {
    const state = makeMinimalState();
    Object.assign(state.servers.fileBrowser, { enabled: true, mode: 'standalone' });
    const entries = buildServiceUrlMap(state);
    expect(entries.find((e) => e.serviceId === 'filebrowser')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildServiceAccessGuide
// ---------------------------------------------------------------------------

describe('buildServiceAccessGuide', () => {
  it('returns entries for traefik + gitea in minimal state', () => {
    const state = makeMinimalState();
    const guide = buildServiceAccessGuide(state);
    const ids = guide.map((e) => e.serviceId);
    expect(ids).toContain('traefik');
    expect(ids).toContain('traefik-dashboard');
    expect(ids).toContain('gitea');
  });

  it('includes nextcloud guide entry when enabled', () => {
    const state = makeMinimalState();
    (state.servers.fileServer as { enabled: boolean; service: string }).enabled = true;
    (state.servers.fileServer as { enabled: boolean; service: string }).service = 'nextcloud';
    const guide = buildServiceAccessGuide(state);
    expect(guide.find((e) => e.serviceId === 'nextcloud')).toBeDefined();
  });

  it('includes minio guide entry when enabled', () => {
    const state = makeMinimalState();
    (state.servers.fileServer as { enabled: boolean; service: string }).enabled = true;
    (state.servers.fileServer as { enabled: boolean; service: string }).service = 'minio';
    const guide = buildServiceAccessGuide(state);
    expect(guide.find((e) => e.serviceId === 'minio')).toBeDefined();
  });

  it('includes jellyfin guide entry when media enabled', () => {
    const state = makeMinimalState();
    (state.servers.media as { enabled: boolean }).enabled = true;
    const guide = buildServiceAccessGuide(state);
    const jelly = guide.find((e) => e.serviceId === 'jellyfin');
    expect(jelly).toBeDefined();
    expect(jelly?.url).toContain('/wizard/start');
  });

  it('includes pgadmin guide entry when DB+adminUI+postgresql', () => {
    const state = makeMinimalState();
    Object.assign(state.servers.dbServer, {
      enabled: true, adminUI: true, primary: 'postgresql',
    });
    const guide = buildServiceAccessGuide(state);
    expect(guide.find((e) => e.serviceId === 'pgadmin')).toBeDefined();
  });

  it('includes filebrowser guide entry in standalone mode', () => {
    const state = makeMinimalState();
    Object.assign(state.servers.fileBrowser, { enabled: true, mode: 'standalone' });
    const guide = buildServiceAccessGuide(state);
    expect(guide.find((e) => e.serviceId === 'filebrowser')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// verifyServiceAccess
// ---------------------------------------------------------------------------

describe('verifyServiceAccess', () => {
  const mockFetch = jest.fn<typeof fetch>();
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as typeof fetch;
  });

  it('returns ok when fetch returns 200', async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true } as Response);
    const result = await verifyServiceAccess(
      { serviceId: 'gitea', label: 'Gitea', localUrl: 'http://localhost:3000', healthEndpoint: '/' },
      { timeout: 1000, retries: 0 },
    );
    expect(result.status).toBe('ok');
    expect(result.statusCode).toBe(200);
  });

  it('returns ok for 401 (BasicAuth protected endpoint)', async () => {
    mockFetch.mockResolvedValue({ status: 401, ok: false } as Response);
    const result = await verifyServiceAccess(
      { serviceId: 'traefik-dashboard', label: 'Dashboard', localUrl: 'http://localhost/api/overview' },
      { timeout: 1000, retries: 0 },
    );
    expect(result.status).toBe('ok');
  });

  it('returns warn for 500+ status', async () => {
    mockFetch.mockResolvedValue({ status: 503, ok: false } as Response);
    const result = await verifyServiceAccess(
      { serviceId: 'gitea', label: 'Gitea', localUrl: 'http://localhost:3000' },
      { timeout: 1000, retries: 0 },
    );
    expect(result.status).toBe('warn');
  });

  it('returns fail after all retries exhausted', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await verifyServiceAccess(
      { serviceId: 'gitea', label: 'Gitea', localUrl: 'http://localhost:3000' },
      { timeout: 100, retries: 0 },
    );
    expect(result.status).toBe('fail');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('uses healthUrl when provided instead of localUrl+endpoint', async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true } as Response);
    await verifyServiceAccess(
      {
        serviceId: 'jellyfin',
        label: 'Jellyfin',
        localUrl: 'http://localhost:8096/jellyfin/web/#/wizard/start',
        healthUrl: 'http://localhost:8096/health',
      },
      { timeout: 1000, retries: 0 },
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8096/health',
      expect.any(Object),
    );
  });
});
