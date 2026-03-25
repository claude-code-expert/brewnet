/**
 * Additional unit tests for services/gitea-client — mustChangePassword auto-fix
 *
 * Covers uncovered lines in gitea-client.ts:
 *   - _createToken(): 403 mustChange → execSync auto-fix success + retry (L54-74)
 *   - _createToken(): 403 mustChange → execSync throws → re-throw (L60-67)
 *   - _createToken(): auto-fix succeeded but retry still fails (L70-73)
 *
 * Requires mocking node:child_process (execSync) — separate file from gitea-client-extra.test.ts.
 *
 * NOTE: beforeEach uses mockFetch.mockReset() (not jest.clearAllMocks()) to flush the
 * mockResolvedValueOnce queue. jest.clearAllMocks() only clears call history, NOT the
 * once-value queue, causing stale mock responses to leak into subsequent tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecSync = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  execSync: mockExecSync,
}));

let fsContent: Record<string, string> = {};

jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn((p: unknown) => (p as string) in fsContent),
  readFileSync: jest.fn((p: unknown) => fsContent[p as string] ?? ''),
  writeFileSync: jest.fn((p: unknown, data: unknown) => {
    fsContent[p as string] = data as string;
  }),
  chmodSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const mockFetch = jest.fn<() => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
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

function versionOk() {
  return {
    ok: true,
    status: 200,
    headers: { get: (_h: string) => 'application/json' },
    json: async () => ({ version: '1.21.0' }),
    text: async () => '{"version":"1.21.0"}',
  } as unknown as Response;
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
// Tests — _createToken() mustChangePassword auto-fix paths (L54-74)
// Called via prepare() when no token file exists
// ---------------------------------------------------------------------------

describe('GiteaClient — _createToken() mustChangePassword auto-fix', () => {
  beforeEach(() => {
    fsContent = {};
    // Reset mockFetch queue (mockClear does NOT flush mockResolvedValueOnce queue)
    mockFetch.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  it('auto-fixes mustChangePassword via execSync and creates token on retry (L54-74)', async () => {
    // No token file → triggers _createToken()
    mockFetch
      // /api/v1/version probe
      .mockResolvedValueOnce(versionOk())
      // POST token → 403 with "must change" in body
      .mockResolvedValueOnce(jsonResponse('You must change your password to continue', 403))
      // POST token retry after execSync fix → 201
      .mockResolvedValueOnce(jsonResponse({ sha1: 'fixed-token' }, 201));

    const client = makeClient();
    const result = await client.prepare();

    // execSync was called to fix mustChangePassword
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('must-change-password=false'),
      expect.objectContaining({ stdio: 'pipe' }),
    );
    expect(result.autoFixed).toBe(true);
    // Source message: 'mustChangePassword was set — auto-fixed via docker exec; token created'
    expect(result.message).toContain('auto-fixed');
    expect(fsContent['/home/user/.brewnet/gitea-token']).toBe('fixed-token');
  });

  it('throws when execSync auto-fix itself fails (L60-67)', async () => {
    mockFetch
      .mockResolvedValueOnce(versionOk())
      // POST token → 403 "must change"
      .mockResolvedValueOnce(jsonResponse('must change password required', 403));

    // execSync throws (docker exec container not found)
    const execError = Object.assign(new Error('docker exec failed'), {
      stderr: Buffer.from('No such container: brewnet-gitea'),
    });
    mockExecSync.mockImplementation(() => { throw execError; });

    const client = makeClient();
    await expect(client.prepare()).rejects.toThrow('auto-fix failed');
  });

  it('throws when retry token creation fails after auto-fix (L70-73)', async () => {
    mockFetch
      .mockResolvedValueOnce(versionOk())
      // POST token → 403 "must change"
      .mockResolvedValueOnce(jsonResponse('must change password now', 403))
      // POST token retry → still fails (server error)
      .mockResolvedValueOnce(jsonResponse({ message: 'server error' }, 500));

    // execSync succeeds (auto-fix command ran OK)
    mockExecSync.mockReturnValue(Buffer.from(''));

    const client = makeClient();
    await expect(client.prepare()).rejects.toThrow('failed after auto-fix');
  });
});
