/**
 * Unit tests for utils/network module
 *
 * Covers: checkPort25Blocked
 * Uses net.createConnection mock to simulate TCP behavior.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock node:net
// ---------------------------------------------------------------------------

class MockSocket extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
  }
}

const mockCreateConnection = jest.fn<() => MockSocket>();

jest.unstable_mockModule('node:net', () => ({
  createConnection: mockCreateConnection,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { checkPort25Blocked } = await import('../../../../packages/cli/src/utils/network.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkPort25Blocked', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCreateConnection.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false (open) when connection succeeds', async () => {
    const socket = new MockSocket();
    mockCreateConnection.mockReturnValue(socket);

    const promise = checkPort25Blocked();

    // Simulate successful connection
    socket.emit('connect');

    const result = await promise;
    expect(result).toBe(false);
  });

  it('returns true (blocked) on connection error', async () => {
    const socket = new MockSocket();
    mockCreateConnection.mockReturnValue(socket);

    const promise = checkPort25Blocked();

    // Simulate error
    socket.emit('error', new Error('ECONNREFUSED'));

    const result = await promise;
    expect(result).toBe(true);
  });

  it('returns true (blocked) on timeout', async () => {
    const socket = new MockSocket();
    mockCreateConnection.mockReturnValue(socket);

    const promise = checkPort25Blocked();

    // Advance timer past 3000ms
    jest.advanceTimersByTime(3100);

    const result = await promise;
    expect(result).toBe(true);
    expect(socket.destroyed).toBe(true);
  });

  it('connects to smtp.cloudflare.com port 25', () => {
    const socket = new MockSocket();
    mockCreateConnection.mockReturnValue(socket);

    checkPort25Blocked().catch(() => {});

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.cloudflare.com', port: 25 }),
    );
  });
});
