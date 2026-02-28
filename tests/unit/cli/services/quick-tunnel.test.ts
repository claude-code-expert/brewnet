/**
 * Unit tests for QuickTunnelManager — T034
 *
 * Tests URL regex matching from container log output, 30s timeout behavior,
 * and container lifecycle (start/stop).
 *
 * Mock strategy: dockerode is mocked via jest.unstable_mockModule.
 * TunnelLogger is passed as a constructor argument — no module mock needed.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock dockerode — must be before any dynamic import of the module under test
// ---------------------------------------------------------------------------

const mockContainerStart = jest.fn<() => Promise<void>>();
const mockContainerStop = jest.fn<() => Promise<void>>();
const mockContainerRemove = jest.fn<() => Promise<void>>();
const mockContainerLogs = jest.fn();
const mockGetContainer = jest.fn();
const mockCreateContainer = jest.fn();
const mockGetImage = jest.fn();
const mockPull = jest.fn();

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    getContainer: mockGetContainer,
    createContainer: mockCreateContainer,
    getImage: mockGetImage,
    pull: mockPull,
    modem: {
      followProgress: jest.fn((stream: unknown, cb: (err: null) => void) => cb(null)),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Dynamic import (after mock registration)
// ---------------------------------------------------------------------------

const { QuickTunnelManager } = await import(
  '../../../../packages/cli/src/services/quick-tunnel.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock TunnelLogger — no file I/O */
const mockLog = jest.fn();
const mockLogger = { log: mockLog };

/** Create a mock readable stream. If urlText provided, emits it on next tick. */
function makeStream(urlText?: string): EventEmitter & { destroy: jest.Mock } {
  const stream = Object.assign(new EventEmitter(), {
    destroy: jest.fn(),
  }) as EventEmitter & { destroy: jest.Mock };

  if (urlText) {
    setImmediate(() => stream.emit('data', Buffer.from(urlText)));
  }

  return stream;
}

/** Default mock container returned by createContainer */
function makeContainer() {
  return {
    id: 'test-container-id',
    start: mockContainerStart,
    logs: mockContainerLogs,
    stop: mockContainerStop,
    remove: mockContainerRemove,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuickTunnelManager', () => {
  let manager: InstanceType<typeof QuickTunnelManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // @ts-expect-error — passing mock logger to constructor
    manager = new QuickTunnelManager(mockLogger);

    // Default: remove existing container throws (no pre-existing container)
    mockGetContainer.mockReturnValue({
      remove: jest.fn().mockRejectedValue(new Error('No such container')),
      stop: mockContainerStop,
      logs: mockContainerLogs,
    });

    // Default: image already present (no pull needed)
    mockGetImage.mockReturnValue({
      inspect: jest.fn().mockResolvedValue({}),
    });

    // Default: createContainer returns a valid mock container
    mockCreateContainer.mockResolvedValue(makeContainer());
    mockContainerStart.mockResolvedValue(undefined);
    mockContainerStop.mockResolvedValue(undefined);
    mockContainerRemove.mockResolvedValue(undefined);
  });

  // =========================================================================
  // URL regex matching — verify URL extraction from log output
  // =========================================================================

  describe('URL regex matching', () => {
    it('captures *.trycloudflare.com URL from log output', async () => {
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://purple-meadow.trycloudflare.com is now accessible'));
        },
      );

      const url = await manager.start();
      expect(url).toBe('https://purple-meadow.trycloudflare.com');
    });

    it('captures URL when it appears embedded in longer log line', async () => {
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('INF | Visit https://blue-sky-123.trycloudflare.com to access your service'));
        },
      );

      const url = await manager.start();
      expect(url).toContain('trycloudflare.com');
    });

    it('captures URL with hyphenated subdomain', async () => {
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://my-long-subdomain-name.trycloudflare.com'));
        },
      );

      const url = await manager.start();
      expect(url).toBe('https://my-long-subdomain-name.trycloudflare.com');
    });

    it('does not capture non-trycloudflare.com URLs', async () => {
      // Emit a non-matching URL first, then the real one
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          const stream = makeStream();
          cb(null, stream);
          setImmediate(() => {
            // First emit a non-matching URL
            stream.emit('data', Buffer.from('https://evil.attacker.com'));
            // Then emit the real URL
            setImmediate(() => {
              stream.emit('data', Buffer.from('https://real-test.trycloudflare.com'));
            });
          });
        },
      );

      const url = await manager.start();
      expect(url).toContain('trycloudflare.com');
      expect(url).not.toContain('attacker.com');
    });

    it('returns clean base URL even when log line has path suffix', async () => {
      // The URL regex only captures up to the domain — paths in the log are ignored.
      // The log line has a full URL with path, but only the domain is extracted.
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('Visit https://strip-path.trycloudflare.com/some/path?query=1 now'));
        },
      );

      const url = await manager.start();
      expect(url).toBe('https://strip-path.trycloudflare.com');
      expect(url).toMatch(/^https:\/\/[\w-]+\.trycloudflare\.com$/);
    });
  });

  // =========================================================================
  // getUrl() — before and after start()
  // =========================================================================

  describe('getUrl()', () => {
    it('returns empty string before start() is called', () => {
      expect(manager.getUrl()).toBe('');
    });

    it('returns the captured URL after start() succeeds', async () => {
      const expectedUrl = 'https://get-url-test.trycloudflare.com';
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream(expectedUrl));
        },
      );

      await manager.start();
      expect(manager.getUrl()).toBe(expectedUrl);
    });
  });

  // =========================================================================
  // Timeout behavior — 30s timeout fires
  // =========================================================================

  describe('timeout behavior', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('rejects if no URL found within 30 seconds', async () => {
      jest.useFakeTimers();

      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          // Emit data that does NOT contain a trycloudflare.com URL
          const stream = makeStream();
          cb(null, stream);
          // Emit non-matching data synchronously (setImmediate is fake-timer-controlled)
          stream.emit('data', Buffer.from('cloudflared is starting...\n'));
        },
      );

      const startPromise = manager.start();
      // Flush microtasks to let the async startup chain (removeExistingContainer →
      // ensureImage → createContainer → start → captureUrl) reach the captureUrl
      // step where the 30s setTimeout is registered.
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // Now the 30s timeout is registered — advance past it
      jest.advanceTimersByTime(31_000);

      // Flush the rejection microtask
      for (let i = 0; i < 5; i++) await Promise.resolve();

      await expect(startPromise).rejects.toThrow('30초');
    });
  });

  // =========================================================================
  // stop() — container lifecycle
  // =========================================================================

  describe('stop()', () => {
    it('stop() calls container stop and remove', async () => {
      // First start the manager
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://stop-test.trycloudflare.com'));
        },
      );
      await manager.start();

      // Set up getContainer mock for stop
      const mockStopFn = jest.fn().mockResolvedValue(undefined);
      const mockRemoveFn = jest.fn().mockResolvedValue(undefined);
      mockGetContainer.mockReturnValue({
        stop: mockStopFn,
        remove: mockRemoveFn,
      });

      await manager.stop();

      expect(mockStopFn).toHaveBeenCalled();
      expect(mockRemoveFn).toHaveBeenCalled();
    });

    it('stop() does not throw if container does not exist', async () => {
      mockGetContainer.mockReturnValue({
        stop: jest.fn().mockRejectedValue(new Error('No such container')),
        remove: jest.fn().mockRejectedValue(new Error('No such container')),
      });

      await expect(manager.stop()).resolves.toBeUndefined();
    });

    it('stop() clears the captured URL', async () => {
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://clear-url.trycloudflare.com'));
        },
      );
      await manager.start();
      expect(manager.getUrl()).not.toBe('');

      mockGetContainer.mockReturnValue({
        stop: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      });

      await manager.stop();
      expect(manager.getUrl()).toBe('');
    });
  });

  // =========================================================================
  // Logger events
  // =========================================================================

  describe('TunnelLogger events', () => {
    it('logs QUICK_START event on successful start', async () => {
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://event-test.trycloudflare.com'));
        },
      );

      await manager.start();

      expect(mockLog).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'QUICK_START', tunnelMode: 'quick' }),
      );
    });

    it('logs QUICK_STOP event on stop', async () => {
      // Start first
      mockContainerLogs.mockImplementation(
        (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
          cb(null, makeStream('https://stop-event.trycloudflare.com'));
        },
      );
      await manager.start();

      mockGetContainer.mockReturnValue({
        stop: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      });

      await manager.stop();

      expect(mockLog).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'QUICK_STOP', tunnelMode: 'quick' }),
      );
    });
  });
});
