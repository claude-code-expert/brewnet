/**
 * Additional unit tests for utils/service-verifier
 *
 * Covers uncovered paths:
 *   - verifyServiceAccess: startupDelay path (L231)
 *   - verifyServiceAccess: retry wait before second attempt (L266)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { verifyServiceAccess } from '../../../../packages/cli/src/utils/service-verifier.js';

const mockFetch = jest.fn<typeof fetch>();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as typeof fetch;
});

describe('verifyServiceAccess — startupDelay', () => {
  it('waits startupDelay ms before fetching (L231)', async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true } as Response);

    const start = Date.now();
    const result = await verifyServiceAccess(
      {
        serviceId: 'my-app',
        label: 'My App',
        localUrl: 'http://localhost:3000',
        startupDelay: 10,
      },
      { timeout: 1000, retries: 0 },
    );

    expect(Date.now() - start).toBeGreaterThanOrEqual(10);
    expect(result.status).toBe('ok');
  });
});

describe('verifyServiceAccess — retry wait', () => {
  it('retries after fetch failure and returns ok on second attempt (L266)', async () => {
    // Use jest fake timers to avoid real 2s wait
    jest.useFakeTimers();

    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200, ok: true } as Response);

    const promise = verifyServiceAccess(
      { serviceId: 'svc', label: 'Svc', localUrl: 'http://localhost:4000' },
      { timeout: 500, retries: 1 },
    );

    // Advance timers past the 2s retry wait
    await jest.runAllTimersAsync();

    const result = await promise;
    jest.useRealTimers();

    expect(result.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
