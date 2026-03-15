// tests/unit/cli/services/gitea-client.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

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
}));

// Mock global fetch (Node.js 20+ has fetch as a global built-in — not via node:fetch)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// --------------------------------------------------------------------------
// Imports
// --------------------------------------------------------------------------

const { GiteaClient } = await import(
  '../../../../packages/cli/src/services/gitea-client.js'
);

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeClient() {
  return new GiteaClient({
    host: 'localhost:3000',
    username: 'admin',
    password: 'secret',
    tokenPath: '/home/user/.brewnet/gitea-token',
  });
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('GiteaClient', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  describe('ensureToken', () => {
    it('reads token from file when it exists', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'existing-token';
      const client = makeClient();
      // createRepo uses ensureToken internally
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' }));
      await client.createRepo('my-app');
      // fetch should use token auth, not basic auth
      const [, opts] = mockFetch.mock.calls[0]!;
      expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'token existing-token' });
    });

    it('creates token via Basic Auth and saves to file when token file missing', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ sha1: 'new-token-abc' })) // token create
        .mockResolvedValueOnce(jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' })); // createRepo
      const client = makeClient();
      await client.createRepo('my-app');
      expect(fsContent['/home/user/.brewnet/gitea-token']).toBe('new-token-abc');
      expect(mockChmodSync).toHaveBeenCalledWith('/home/user/.brewnet/gitea-token', 0o600);
    });
  });

  describe('repoExists', () => {
    it('returns true when repo exists (200)', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, 200));
      const client = makeClient();
      expect(await client.repoExists('my-app')).toBe(true);
    });

    it('returns false when repo not found (404)', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
      const client = makeClient();
      expect(await client.repoExists('my-app')).toBe(false);
    });
  });

  describe('createRepo', () => {
    it('returns clone URL on success', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: 1, clone_url: 'http://localhost:3000/admin/my-app.git' }),
      );
      const client = makeClient();
      const url = await client.createRepo('my-app');
      expect(url).toBe('http://localhost:3000/admin/my-app.git');
    });

    it('throws on non-2xx response', async () => {
      fsContent['/home/user/.brewnet/gitea-token'] = 'tk';
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'conflict' }, 422));
      const client = makeClient();
      await expect(client.createRepo('my-app')).rejects.toThrow();
    });
  });
});
