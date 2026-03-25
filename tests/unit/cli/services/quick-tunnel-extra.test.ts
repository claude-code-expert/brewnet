/**
 * Additional unit tests for QuickTunnelManager — error paths
 *
 * Covers uncovered lines in quick-tunnel.ts:
 *   - ensureImage(): pull callback with error (L134)
 *   - ensureImage(): followProgress callback with error (L136)
 *   - captureUrl(): container.logs callback with error (L154-155)
 *   - captureUrl(): container.logs callback with null stream (L154-155)
 *   - captureUrl(): stream 'error' event (L175-176)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock dockerode — expose followProgress as a named mock
// ---------------------------------------------------------------------------

const mockFollowProgress = jest.fn();
const mockPull = jest.fn();
const mockGetImage = jest.fn();
const mockCreateContainer = jest.fn();
const mockGetContainer = jest.fn();
const mockContainerStart = jest.fn<() => Promise<void>>();
const mockContainerLogs = jest.fn();

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    getContainer: mockGetContainer,
    createContainer: mockCreateContainer,
    getImage: mockGetImage,
    pull: mockPull,
    modem: {
      followProgress: mockFollowProgress,
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

const mockLogger = { log: jest.fn() };

function makeContainer() {
  return {
    id: 'test-container-id',
    start: mockContainerStart,
    logs: mockContainerLogs,
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    remove: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// beforeEach — default happy-path stubs
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default: remove existing container throws (no pre-existing)
  mockGetContainer.mockReturnValue({
    remove: jest.fn().mockRejectedValue(new Error('No such container')),
    stop: jest.fn().mockResolvedValue(undefined),
  });

  // Default: image already present (no pull needed)
  mockGetImage.mockReturnValue({
    inspect: jest.fn().mockResolvedValue({}),
  });

  mockCreateContainer.mockResolvedValue(makeContainer());
  mockContainerStart.mockResolvedValue(undefined);

  // followProgress: success by default
  mockFollowProgress.mockImplementation(
    (_stream: unknown, cb: (err: null) => void) => cb(null),
  );
});

// ---------------------------------------------------------------------------
// ensureImage() — pull callback error (L134)
// ---------------------------------------------------------------------------

describe('ensureImage() — pull callback error', () => {
  it('rejects when pull callback receives an error', async () => {
    // Force image inspect to throw so ensureImage enters the pull branch
    mockGetImage.mockReturnValue({
      inspect: jest.fn().mockRejectedValue(new Error('image not found')),
    });

    // pull calls back with an error
    mockPull.mockImplementation(
      (_img: string, cb: (err: Error, stream: null) => void) => {
        cb(new Error('pull failed: network unreachable'), null);
      },
    );

    // @ts-expect-error — passing mock logger to constructor
    const manager = new QuickTunnelManager(mockLogger);
    await expect(manager.start()).rejects.toThrow('pull failed: network unreachable');
  });
});

// ---------------------------------------------------------------------------
// ensureImage() — followProgress callback error (L136)
// ---------------------------------------------------------------------------

describe('ensureImage() — followProgress callback error', () => {
  it('rejects when followProgress reports an error', async () => {
    mockGetImage.mockReturnValue({
      inspect: jest.fn().mockRejectedValue(new Error('image not found')),
    });

    // pull succeeds (returns a stream), but followProgress reports error
    const fakeStream = new EventEmitter();
    mockPull.mockImplementation(
      (_img: string, cb: (err: null, stream: unknown) => void) => {
        cb(null, fakeStream);
      },
    );
    mockFollowProgress.mockImplementation(
      (_stream: unknown, cb: (err: Error) => void) => {
        cb(new Error('followProgress error'));
      },
    );

    // @ts-expect-error — passing mock logger to constructor
    const manager = new QuickTunnelManager(mockLogger);
    await expect(manager.start()).rejects.toThrow('followProgress error');
  });
});

// ---------------------------------------------------------------------------
// captureUrl() — container.logs callback with error (L154-155)
// ---------------------------------------------------------------------------

describe('captureUrl() — container.logs callback error', () => {
  it('rejects when container.logs callback receives an error', async () => {
    mockContainerLogs.mockImplementation(
      (_opts: unknown, cb: (err: Error, stream: null) => void) => {
        cb(new Error('logs stream error'), null);
      },
    );

    // @ts-expect-error — passing mock logger to constructor
    const manager = new QuickTunnelManager(mockLogger);
    await expect(manager.start()).rejects.toThrow('logs stream error');
  });

  it('rejects with fallback error when container.logs callback has null stream and no error', async () => {
    mockContainerLogs.mockImplementation(
      (_opts: unknown, cb: (err: null, stream: null) => void) => {
        cb(null, null);
      },
    );

    // @ts-expect-error — passing mock logger to constructor
    const manager = new QuickTunnelManager(mockLogger);
    await expect(manager.start()).rejects.toThrow('컨테이너 로그 스트림을 열 수 없습니다');
  });
});

// ---------------------------------------------------------------------------
// captureUrl() — stream 'error' event (L175-176)
// ---------------------------------------------------------------------------

describe('captureUrl() — stream error event', () => {
  it('rejects when the log stream emits an error event', async () => {
    const stream = Object.assign(new EventEmitter(), { destroy: jest.fn() });

    mockContainerLogs.mockImplementation(
      (_opts: unknown, cb: (err: null, stream: unknown) => void) => {
        cb(null, stream);
        // Emit error after callback returns
        setImmediate(() => stream.emit('error', new Error('stream broken')));
      },
    );

    // @ts-expect-error — passing mock logger to constructor
    const manager = new QuickTunnelManager(mockLogger);
    await expect(manager.start()).rejects.toThrow('stream broken');
  });
});
