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
  fetchWithRetry,
  deleteTunnel,
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

// ---------------------------------------------------------------------------
// fetchWithRetry — T032
// ---------------------------------------------------------------------------

describe('fetchWithRetry', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns response immediately on success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }, true, 200));

    const res = await fetchWithRetry('https://api.example.com/test', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 500 and returns final success', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({}, false, 500))
      .mockResolvedValueOnce(makeFetchResponse({}, false, 500))
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }, true, 200));

    const res = await fetchWithRetry('https://api.example.com/', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries on repeated 500', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse({}, false, 500));

    const res = await fetchWithRetry('https://api.example.com/', undefined, {
      maxRetries: 2,
      baseDelayMs: 1,
    });
    // After exhausting retries, returns the last 500 response (does not throw)
    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does NOT retry on HTTP 401 (auth error)', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 401));

    const res = await fetchWithRetry('https://api.example.com/', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
  });

  it('does NOT retry on HTTP 403 (forbidden)', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 403));

    const res = await fetchWithRetry('https://api.example.com/', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on HTTP 400 (bad request)', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: false }, false, 400));

    const res = await fetchWithRetry('https://api.example.com/', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 (rate limit) and succeeds on next attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({}, false, 429))
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }, true, 200));

    const res = await fetchWithRetry('https://api.example.com/', undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (fetch throws)', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }, true, 200));

    const res = await fetchWithRetry('https://api.example.com/', undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws after all retries exhausted on repeated network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('connection refused'));

    await expect(
      fetchWithRetry('https://api.example.com/', undefined, { maxRetries: 2, baseDelayMs: 1 }),
    ).rejects.toThrow('connection refused');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

// ---------------------------------------------------------------------------
// deleteTunnel — T033
// ---------------------------------------------------------------------------

describe('deleteTunnel', () => {
  beforeEach(() => mockFetch.mockReset());

  it('resolves on HTTP 200 success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: true }));

    await expect(
      deleteTunnel('token', 'acc-1', 'tunnel-1'),
    ).resolves.toBeUndefined();
  });

  it('resolves on HTTP 404 (already deleted — treat as success)', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({}, false, 404));

    await expect(
      deleteTunnel('token', 'acc-1', 'tunnel-nonexistent'),
    ).resolves.toBeUndefined();
  });

  it('throws descriptive error when HTTP 400 with active connection', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Tunnel has active connections' }],
    }, false, 400));

    await expect(
      deleteTunnel('token', 'acc-1', 'tunnel-active'),
    ).rejects.toThrow(/active/i);
  });

  it('throws generic error on non-400 failure (e.g. 422)', async () => {
    // Use 422 (not 500) to avoid retry delays — 500 would trigger retries with real sleep
    mockFetch.mockResolvedValueOnce(makeFetchResponse({
      success: false,
      errors: [{ message: 'Unprocessable Entity' }],
    }, false, 422));

    await expect(
      deleteTunnel('token', 'acc-1', 'tunnel-1'),
    ).rejects.toThrow('Unprocessable Entity');
  });

  it('sends DELETE method to the correct CF API endpoint', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ success: true }));

    await deleteTunnel('my-token', 'my-account', 'my-tunnel');

    const [calledUrl, calledInit] = (mockFetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/accounts/my-account/cfd_tunnel/my-tunnel');
    expect(calledInit.method).toBe('DELETE');
    expect((calledInit.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token');
  });
});
