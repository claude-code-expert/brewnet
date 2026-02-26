/**
 * Unit tests for services/cloudflare-client module
 *
 * Covers pure functions: buildTokenCreationUrl, getActiveServiceRoutes.
 * Covers fetch-based functions with mocked global fetch:
 *   verifyToken, getAccounts, getZones, createTunnel, configureTunnelIngress, createDnsRecord.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const {
  buildTokenCreationUrl,
  getActiveServiceRoutes,
  verifyToken,
  getAccounts,
  getZones,
  createTunnel,
  configureTunnelIngress,
  createDnsRecord,
} = await import('../../../../packages/cli/src/services/cloudflare-client.js');

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return { ...base, ...overrides };
}

function makeFetchResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

// ---------------------------------------------------------------------------
// buildTokenCreationUrl
// ---------------------------------------------------------------------------

describe('buildTokenCreationUrl', () => {
  it('returns a Cloudflare URL', () => {
    const url = buildTokenCreationUrl('my-project');
    expect(url).toMatch(/^https:\/\/dash\.cloudflare\.com/);
  });

  it('includes project name in the URL', () => {
    const url = buildTokenCreationUrl('my-server');
    expect(url).toContain('brewnet-my-server');
  });

  it('encodes permissions in the URL', () => {
    const url = buildTokenCreationUrl('test');
    expect(url).toContain('permissionGroupKeys');
  });

  it('includes cloudflare_tunnel permission', () => {
    const url = buildTokenCreationUrl('test');
    expect(decodeURIComponent(url)).toContain('cloudflare_tunnel');
  });

  it('includes dns permission', () => {
    const url = buildTokenCreationUrl('test');
    expect(decodeURIComponent(url)).toContain('dns');
  });
});

// ---------------------------------------------------------------------------
// getActiveServiceRoutes
// ---------------------------------------------------------------------------

describe('getActiveServiceRoutes', () => {
  it('always includes gitea route', () => {
    const state = makeState();
    const routes = getActiveServiceRoutes(state);
    const gitea = routes.find((r) => r.containerName === 'gitea');
    expect(gitea).toBeDefined();
    expect(gitea?.subdomain).toBe('git');
    expect(gitea?.port).toBe(3000);
  });

  it('includes nextcloud route when file server is nextcloud', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const nc = routes.find((r) => r.containerName === 'nextcloud');
    expect(nc).toBeDefined();
    expect(nc?.subdomain).toBe('cloud');
  });

  it('includes minio route when file server is minio', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: true, service: 'minio' },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const minio = routes.find((r) => r.containerName === 'minio');
    expect(minio).toBeDefined();
  });

  it('does not include file server route when disabled', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: false, service: null },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const nc = routes.find((r) => r.containerName === 'nextcloud');
    const minio = routes.find((r) => r.containerName === 'minio');
    expect(nc).toBeUndefined();
    expect(minio).toBeUndefined();
  });

  it('includes jellyfin route when media is enabled', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        media: { enabled: true, services: ['jellyfin'] },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const jellyfin = routes.find((r) => r.containerName === 'jellyfin');
    expect(jellyfin).toBeDefined();
    expect(jellyfin?.port).toBe(8096);
  });

  it('includes pgadmin when db is postgresql with adminUI', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        dbServer: {
          ...makeState().servers.dbServer,
          enabled: true,
          primary: 'postgresql',
          adminUI: true,
        },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const pga = routes.find((r) => r.containerName === 'pgadmin');
    expect(pga).toBeDefined();
  });

  it('includes filebrowser when fileBrowser is enabled', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    const routes = getActiveServiceRoutes(state);
    const fb = routes.find((r) => r.containerName === 'filebrowser');
    expect(fb).toBeDefined();
  });

  it('returns only gitea for state with no optional services', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: false, service: null },
        media: { enabled: false, services: [] },
        dbServer: {
          ...makeState().servers.dbServer,
          enabled: false,
          adminUI: false,
          primary: null,
        },
        fileBrowser: { enabled: false, mode: null },
      },
    });
    const routes = getActiveServiceRoutes(state);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.containerName).toBe('gitea');
  });
});

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

describe('verifyToken', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns valid=true and email on success', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({
        success: true,
        result: { status: 'active' },
      }))
      .mockResolvedValueOnce(makeFetchResponse({
        success: true,
        result: { email: 'user@example.com' },
      }));

    const result = await verifyToken('valid-token');
    expect(result.valid).toBe(true);
    expect(result.email).toBe('user@example.com');
  });

  it('returns valid=false when token is inactive', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: true,
      result: { status: 'disabled' },
    }));

    const result = await verifyToken('inactive-token');
    expect(result.valid).toBe(false);
  });

  it('returns valid=false when API returns success=false', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 401));

    const result = await verifyToken('bad-token');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAccounts
// ---------------------------------------------------------------------------

describe('getAccounts', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns array of accounts on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: true,
      result: [
        { id: 'acc-1', name: 'My Account' },
        { id: 'acc-2', name: 'Work Account' },
      ],
    }));

    const accounts = await getAccounts('token');
    expect(accounts).toHaveLength(2);
    expect(accounts[0]?.id).toBe('acc-1');
  });

  it('returns empty array when API fails', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 403));
    const accounts = await getAccounts('bad-token');
    expect(accounts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getZones
// ---------------------------------------------------------------------------

describe('getZones', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns array of zones on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: true,
      result: [
        { id: 'zone-1', name: 'example.com', status: 'active' },
      ],
    }));

    const zones = await getZones('token');
    expect(zones).toHaveLength(1);
    expect(zones[0]?.name).toBe('example.com');
  });

  it('returns empty array when API fails', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 403));
    const zones = await getZones('bad-token');
    expect(zones).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createTunnel
// ---------------------------------------------------------------------------

describe('createTunnel', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns tunnelId and tunnelToken on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: true,
      result: { id: 'tunnel-abc', token: 'eyJhbGciOi...' },
    }));

    const result = await createTunnel('token', 'acc-1', 'my-tunnel');
    expect(result.tunnelId).toBe('tunnel-abc');
    expect(result.tunnelToken).toBe('eyJhbGciOi...');
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Tunnel already exists' }],
    }, false, 409));

    await expect(createTunnel('token', 'acc-1', 'existing')).rejects.toThrow();
  });

  it('throws when response is missing id or token', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: true,
      result: { id: null, token: null },
    }));

    await expect(createTunnel('token', 'acc-1', 'bad-response')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// configureTunnelIngress
// ---------------------------------------------------------------------------

describe('configureTunnelIngress', () => {
  beforeEach(() => mockFetch.mockReset());

  it('resolves on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: true }));
    const routes = [{ subdomain: 'git', containerName: 'gitea', port: 3000 }];
    await expect(
      configureTunnelIngress('token', 'acc-1', 'tunnel-1', 'example.com', routes),
    ).resolves.toBeUndefined();
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Permission denied' }],
    }, false, 403));

    await expect(
      configureTunnelIngress('token', 'acc-1', 'tunnel-1', 'example.com', []),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createDnsRecord
// ---------------------------------------------------------------------------

describe('createDnsRecord', () => {
  beforeEach(() => mockFetch.mockReset());

  it('resolves on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: true }));
    await expect(
      createDnsRecord('token', 'zone-1', 'tunnel-1', 'git', 'example.com'),
    ).resolves.toBeUndefined();
  });

  it('resolves even if record already exists (non-fatal)', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Record already exists' }],
    }, false, 409));

    await expect(
      createDnsRecord('token', 'zone-1', 'tunnel-1', 'git', 'example.com'),
    ).resolves.toBeUndefined();
  });

  it('throws for non-"already exists" errors', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Zone not found' }],
    }, false, 404));

    await expect(
      createDnsRecord('token', 'zone-1', 'tunnel-1', 'git', 'example.com'),
    ).rejects.toThrow();
  });
});
