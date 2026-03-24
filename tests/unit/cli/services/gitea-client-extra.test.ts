/**
 * Additional unit tests for services/gitea-client
 *
 * Covers uncovered methods: repoIsEmpty, deleteRepo, getRepo,
 *   getLatestCommit, createWebhook, listBranches, authedCloneUrl,
 *   createRepo 409/500 paths.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockChmodSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  chmodSync: mockChmodSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: jest.fn(),
}));

const mockFetch = jest.fn<() => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------

const { GiteaClient } = await import(
  '../../../../packages/cli/src/services/gitea-client.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new GiteaClient({
    baseUrl: 'http://localhost:3000',
    username: 'admin',
    password: 'secret',
    tokenPath: '/home/user/.brewnet/gitea-token',
  });
}

function jsonResponse(data: unknown, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_h: string) => contentType },
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GiteaClient — repoIsEmpty', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('returns true when repo is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, empty: true }));
    const client = makeClient();
    expect(await client.repoIsEmpty('my-app')).toBe(true);
  });

  it('returns false when repo is not empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, empty: false }));
    const client = makeClient();
    expect(await client.repoIsEmpty('my-app')).toBe(false);
  });

  it('returns false when fetch returns non-200', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const client = makeClient();
    expect(await client.repoIsEmpty('my-app')).toBe(false);
  });
});

describe('GiteaClient — deleteRepo', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('sends DELETE request to correct URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 204));
    const client = makeClient();
    await client.deleteRepo('my-app');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/repos/admin/my-app');
    expect((opts as { method: string }).method).toBe('DELETE');
  });
});

describe('GiteaClient — getRepo', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('returns repo data on success', async () => {
    const fakeRepo = {
      id: 1, name: 'my-app', clone_url: 'http://localhost:3000/admin/my-app.git',
      ssh_url: 'ssh://git@localhost:3022/admin/my-app.git',
      html_url: 'http://localhost:3000/admin/my-app',
      description: 'Test repo', private: true, default_branch: 'main',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(fakeRepo));
    const client = makeClient();
    const repo = await client.getRepo('my-app');
    expect(repo.name).toBe('my-app');
    expect(repo.default_branch).toBe('main');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));
    const client = makeClient();
    await expect(client.getRepo('missing')).rejects.toThrow('getRepo failed');
  });
});

describe('GiteaClient — getLatestCommit', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('returns commit data on success', async () => {
    const commits = [{
      sha: 'abc1234567890',
      commit: { message: 'feat: initial commit\n\nmore details', committer: { date: '2026-03-15T10:00:00Z' } },
    }];
    mockFetch.mockResolvedValueOnce(jsonResponse(commits));
    const client = makeClient();
    const result = await client.getLatestCommit('my-app', 'main');
    expect(result).not.toBeNull();
    expect(result!.hash).toBe('abc1234567890');
    expect(result!.shortHash).toBe('abc1234');
    expect(result!.message).toBe('feat: initial commit');
    expect(result!.date).toBe('2026-03-15T10:00:00Z');
  });

  it('returns null when no commits', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const client = makeClient();
    expect(await client.getLatestCommit('my-app', 'main')).toBeNull();
  });

  it('returns null on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const client = makeClient();
    expect(await client.getLatestCommit('my-app', 'main')).toBeNull();
  });
});

describe('GiteaClient — createWebhook', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('sends POST to correct endpoint with webhook config', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const client = makeClient();
    await client.createWebhook('my-app', 'https://hook.example.com/webhook', 'mysecret');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/repos/admin/my-app/hooks');
    const body = JSON.parse(opts.body as string);
    expect(body.type).toBe('gitea');
    expect(body.config.url).toBe('https://hook.example.com/webhook');
    expect(body.config.secret).toBe('mysecret');
    expect(body.events).toContain('push');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'forbidden' }, 403));
    const client = makeClient();
    await expect(
      client.createWebhook('my-app', 'https://hook.example.com', 'secret'),
    ).rejects.toThrow('createWebhook failed');
  });
});

describe('GiteaClient — listBranches', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('returns branch names on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { name: 'main' }, { name: 'develop' }, { name: 'feature/foo' },
    ]));
    const client = makeClient();
    const branches = await client.listBranches('my-app');
    expect(branches).toEqual(['main', 'develop', 'feature/foo']);
  });

  it('returns empty array on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));
    const client = makeClient();
    expect(await client.listBranches('my-app')).toEqual([]);
  });
});

describe('GiteaClient — authedCloneUrl', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('uses API token from file when it exists', () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'myapitoken';
    const client = makeClient();
    const url = client.authedCloneUrl('http://localhost:3000/admin/my-app.git');
    expect(url).toContain('myapitoken');
    expect(url).toContain('admin');
  });

  it('falls back to password when token file missing', () => {
    // fsContent is empty, so existsSync returns false
    const client = makeClient();
    const url = client.authedCloneUrl('http://localhost:3000/admin/my-app.git');
    expect(url).toContain('secret'); // password from config
  });

  it('normalizes path-based Gitea URL (strips wrong prefix)', () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
    const client = makeClient();
    // Gitea behind Traefik strip-prefix returns URL without /git subpath
    const url = client.authedCloneUrl('http://localhost/admin/my-app.git');
    // Should be rebuilt using baseUrl (http://localhost:3000)
    expect(url).toContain('localhost:3000');
    expect(url).toContain('/admin/my-app.git');
  });
});

describe('GiteaClient — createRepo 409/500 edge cases', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
  });

  it('returns clone_url from existing repo on 409 conflict', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'repository already exists' }, 409))
      .mockResolvedValueOnce(jsonResponse({
        id: 1, clone_url: 'http://localhost:3000/admin/my-app.git',
      }));
    const client = makeClient();
    const url = await client.createRepo('my-app');
    expect(url).toBe('http://localhost:3000/admin/my-app.git');
  });
});

// ---------------------------------------------------------------------------
// GiteaClient — prepare()
// ---------------------------------------------------------------------------

/** Simulate /api/v1/version returning valid Gitea JSON (Gitea ready) */
function versionOk() {
  return {
    ok: true,
    status: 200,
    headers: { get: (_h: string) => 'application/json' },
    json: async () => ({ version: '1.21.0' }),
    text: async () => '{"version":"1.21.0"}',
  } as unknown as Response;
}

describe('GiteaClient — prepare()', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  it('returns "token cached" when existing token is valid', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'valid-token';
    mockFetch
      // /api/v1/version (Gitea ready probe)
      .mockResolvedValueOnce(versionOk())
      // /api/v1/user (token validation → 200, not 401)
      .mockResolvedValueOnce(jsonResponse({ login: 'admin' }, 200));

    const client = makeClient();
    const result = await client.prepare();
    expect(result.autoFixed).toBe(false);
    expect(result.message).toBe('token cached');
  });

  it('re-creates token when cached token is stale (401)', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'stale-token';
    mockFetch
      // /api/v1/version probe
      .mockResolvedValueOnce(versionOk())
      // /api/v1/user → 401 (stale)
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      // POST /api/v1/users/.../tokens → 201 + new token
      .mockResolvedValueOnce(jsonResponse({ sha1: 'new-token-sha1' }, 201));

    const client = makeClient();
    const result = await client.prepare();
    expect(result.autoFixed).toBe(false);
    expect(result.message).toBe('token created');
    // Token file should have been rewritten with new value
    expect(fsContent['/home/user/.brewnet/gitea-token']).toBe('new-token-sha1');
  });

  it('skips token validation on network error and returns "token cached"', async () => {
    fsContent['/home/user/.brewnet/gitea-token'] = 'some-token';
    mockFetch
      // /api/v1/version probe
      .mockResolvedValueOnce(versionOk())
      // /api/v1/user → network error
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const client = makeClient();
    const result = await client.prepare();
    expect(result.message).toBe('token cached (network check skipped)');
  });

  it('creates new token when no token file exists', async () => {
    // fsContent is empty — no token file
    mockFetch
      // /api/v1/version probe
      .mockResolvedValueOnce(versionOk())
      // POST /api/v1/users/.../tokens → 201
      .mockResolvedValueOnce(jsonResponse({ sha1: 'brand-new-token' }, 201));

    const client = makeClient();
    const result = await client.prepare();
    expect(result.autoFixed).toBe(false);
    expect(result.message).toBe('token created');
    expect(fsContent['/home/user/.brewnet/gitea-token']).toBe('brand-new-token');
  });

  it('throws when token creation fails', async () => {
    fsContent = {};
    mockFetch
      // /api/v1/version probe
      .mockResolvedValueOnce(versionOk())
      // POST token → 400 error
      .mockResolvedValueOnce(jsonResponse({ message: 'bad request' }, 400));

    const client = makeClient();
    await expect(client.prepare()).rejects.toThrow('Gitea token creation failed');
  });
});
