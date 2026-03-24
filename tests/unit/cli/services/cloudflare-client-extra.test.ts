/**
 * Additional unit tests for services/cloudflare-client
 *
 * Covers uncovered paths:
 *   - getTunnelHealth: success path (L498-526), failure path (L513-515)
 *   - createDnsRecord: PATCH update failure path (L400-401)
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

const { getTunnelHealth, createDnsRecord } = await import(
  '../../../../packages/cli/src/services/cloudflare-client.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// getTunnelHealth (L498-526)
// ---------------------------------------------------------------------------

describe('getTunnelHealth', () => {
  it('returns healthy status and connector count on success', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: true,
      result: {
        status: 'healthy',
        connections: [{}, {}],
      },
    }));

    const result = await getTunnelHealth('token', 'acc-1', 'tun-abc');
    expect(result.status).toBe('healthy');
    expect(result.connectorCount).toBe(2);
  });

  it('returns degraded status when tunnel is degraded', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: true,
      result: {
        status: 'degraded',
        connections: [{}],
      },
    }));

    const result = await getTunnelHealth('token', 'acc-1', 'tun-abc');
    expect(result.status).toBe('degraded');
    expect(result.connectorCount).toBe(1);
  });

  it('returns inactive for unknown status value', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: true,
      result: {
        status: 'down',
        connections: [],
      },
    }));

    const result = await getTunnelHealth('token', 'acc-1', 'tun-abc');
    expect(result.status).toBe('inactive');
    expect(result.connectorCount).toBe(0);
  });

  it('throws when API returns success=false (L513-515)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: false,
      errors: [{ message: 'Tunnel not found' }],
    }, false, 404));

    await expect(getTunnelHealth('token', 'acc-1', 'bad-tunnel')).rejects.toThrow(
      'Failed to get tunnel health: Tunnel not found',
    );
  });

  it('uses HTTP status as fallback error message when errors array is missing', async () => {
    // Use 403 (auth error) so fetchWithRetry returns immediately without retrying
    mockFetch.mockResolvedValueOnce(makeResponse({ success: false }, false, 403));

    await expect(getTunnelHealth('token', 'acc-1', 'tun-abc')).rejects.toThrow(
      'HTTP 403',
    );
  });
});

// ---------------------------------------------------------------------------
// createDnsRecord — PATCH update failure (L400-401)
// ---------------------------------------------------------------------------

describe('createDnsRecord — PATCH update failure', () => {
  it('throws DNS record update failed when PATCH also fails', async () => {
    // 1st call: POST → already exists
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: false,
      errors: [{ message: 'Record already exists' }],
    }, false, 409));

    // 2nd call: GET existing records (getDnsRecords via fetchWithRetry)
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: true,
      result: [{ id: 'rec-1', name: 'git.example.com', content: 'old.cfargotunnel.com', proxied: true }],
    }));

    // 3rd call: PATCH → fails
    mockFetch.mockResolvedValueOnce(makeResponse({
      success: false,
      errors: [{ message: 'Permission denied' }],
    }, false, 403));

    await expect(
      createDnsRecord('token', 'zone-1', 'tunnel-1', 'git', 'example.com'),
    ).rejects.toThrow('DNS record update failed: Permission denied');
  });
});
