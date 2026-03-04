/**
 * Unit tests for the health polling logic in boilerplate-manager (T028).
 *
 * Verifies:
 *   - Returns healthy:true when /health responds with status:"ok"
 *   - Retries until healthy (passes on 3rd attempt)
 *   - Returns healthy:false after timeout
 *   - Captures db_connected from response body
 *   - Handles fetch errors gracefully (continues polling)
 */

import { jest } from '@jest/globals';
import { pollHealth } from '../../../../packages/cli/src/services/boilerplate-manager.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responses: Array<{ ok: boolean; body?: object } | Error>): void {
  let callCount = 0;
  globalThis.fetch = jest.fn().mockImplementation(async () => {
    const response = responses[callCount] ?? responses[responses.length - 1]!;
    callCount++;

    if (response instanceof Error) {
      throw response;
    }

    return {
      ok: response.ok,
      json: async () => response.body ?? {},
    };
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Healthy on first attempt
// ---------------------------------------------------------------------------

describe('pollHealth — immediate success', () => {
  it('returns healthy:true when /health responds with status:"ok" on first attempt', async () => {
    mockFetch([{ ok: true, body: { status: 'ok', db_connected: true } }]);

    const result = await pollHealth('http://127.0.0.1:8080', 10_000);

    expect(result.healthy).toBe(true);
    expect(result.dbConnected).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('captures db_connected:false from response', async () => {
    mockFetch([{ ok: true, body: { status: 'ok', db_connected: false } }]);

    const result = await pollHealth('http://127.0.0.1:8080', 10_000);

    expect(result.healthy).toBe(true);
    expect(result.dbConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retries before success
// ---------------------------------------------------------------------------

describe('pollHealth — retry logic', () => {
  it('retries and succeeds on the 3rd attempt', async () => {
    mockFetch([
      { ok: false },                                          // attempt 1: HTTP error
      { ok: true, body: { status: 'starting' } },           // attempt 2: wrong status
      { ok: true, body: { status: 'ok', db_connected: true } }, // attempt 3: success
    ]);

    const result = await pollHealth('http://127.0.0.1:8080', 30_000);

    expect(result.healthy).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('handles fetch errors gracefully and continues polling', async () => {
    mockFetch([
      new Error('ECONNREFUSED'),                               // attempt 1: network error
      new Error('ECONNREFUSED'),                               // attempt 2: still not up
      { ok: true, body: { status: 'ok', db_connected: true } }, // attempt 3: success
    ]);

    const result = await pollHealth('http://127.0.0.1:8080', 30_000);

    expect(result.healthy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('pollHealth — timeout', () => {
  it('returns healthy:false with error message when timeout is exceeded', async () => {
    // Always return HTTP 503 (never healthy)
    mockFetch([{ ok: false, body: { status: 'starting' } }]);

    // Very short timeout to make the test fast
    const result = await pollHealth('http://127.0.0.1:8080', 100);

    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/timed out/i);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(100);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe('pollHealth — URL usage', () => {
  it('polls the /health endpoint at the provided baseUrl', async () => {
    mockFetch([{ ok: true, body: { status: 'ok' } }]);

    await pollHealth('http://127.0.0.1:3000', 10_000);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/health',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });
});
