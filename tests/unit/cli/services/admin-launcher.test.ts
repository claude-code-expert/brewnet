/**
 * Unit tests for services/admin-launcher — launchAdminDaemon
 *
 * Covers:
 *   - Daemon starts successfully (socket connects) → returns { pid, port, logFile }
 *   - Daemon fails to start (timeout after maxAttempts) → throws Error
 *   - getDaemonPath: fallback to best-guess when no candidate exists
 *   - projectPath option passed to nodeArgs
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOpenSync  = jest.fn(() => 42); // fd = 42
const mockMkdirSync = jest.fn();
const mockExistsSync = jest.fn(() => false); // candidates not found by default

jest.unstable_mockModule('node:fs', () => ({
  openSync:   mockOpenSync,
  mkdirSync:  mockMkdirSync,
  existsSync: mockExistsSync,
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// child process — spawn returns a fake child
const mockUnref  = jest.fn();
const mockSpawn = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

// net — createConnection controls whether daemon is "ready"
type ConnectCallback = () => void;
type ErrorCallback = (err: Error) => void;

const mockSockDestroy = jest.fn();
const mockSockSetTimeout = jest.fn();
const mockCreateConnection = jest.fn();

jest.unstable_mockModule('node:net', () => ({
  createConnection: mockCreateConnection,
  default: { createConnection: mockCreateConnection },
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const { launchAdminDaemon } = await import(
  '../../../../packages/cli/src/services/admin-launcher.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChild(pid = 1234) {
  return { pid, unref: mockUnref };
}

function makeSock(behavior: 'connect' | 'error') {
  const sock = {
    destroy: mockSockDestroy,
    once: jest.fn((event: string, cb: ConnectCallback | ErrorCallback) => {
      if (event === behavior) {
        setImmediate(() => (cb as ConnectCallback)());
      }
    }),
    setTimeout: mockSockSetTimeout,
  };
  return sock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('launchAdminDaemon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockOpenSync.mockReturnValue(42);
    mockMkdirSync.mockReturnValue(undefined);
    mockExistsSync.mockReturnValue(false);
    mockSpawn.mockReturnValue(makeChild(5678));
    mockUnref.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Daemon starts (socket connects on first attempt) ─────────────────────

  it('resolves with pid/port/logFile when daemon connects immediately', async () => {
    mockCreateConnection.mockImplementation(() => makeSock('connect'));

    const promise = launchAdminDaemon({ port: 8088 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.pid).toBe(5678);
    expect(result.port).toBe(8088);
    expect(result.logFile).toContain('admin-server.log');
  });

  // ── projectPath passed to nodeArgs ────────────────────────────────────────

  it('passes --path option to spawned process when projectPath is provided', async () => {
    mockCreateConnection.mockImplementation(() => makeSock('connect'));

    const promise = launchAdminDaemon({ port: 8088, projectPath: '/home/user/my-project' });
    await jest.runAllTimersAsync();
    await promise;

    const spawnArgs = mockSpawn.mock.calls[0] as [string, string[], object];
    expect(spawnArgs[1]).toContain('--path');
    expect(spawnArgs[1]).toContain('/home/user/my-project');
  });

  // ── Log file path includes .brewnet/logs dir ──────────────────────────────

  it('creates log directory under ~/.brewnet/logs', async () => {
    mockCreateConnection.mockImplementation(() => makeSock('connect'));

    const promise = launchAdminDaemon({ port: 8088 });
    await jest.runAllTimersAsync();
    await promise;

    const expectedLogDir = join(homedir(), '.brewnet', 'logs');
    expect(mockMkdirSync).toHaveBeenCalledWith(expectedLogDir, { recursive: true });
  });

  // ── Daemon fails to start (timeout) ──────────────────────────────────────

  it('throws when daemon never connects within maxAttempts (5s)', async () => {
    // All connection attempts fail
    mockCreateConnection.mockImplementation(() => makeSock('error'));

    let caughtError: Error | undefined;
    const promise = launchAdminDaemon({ port: 8088 }).catch((e: Error) => {
      caughtError = e;
    });

    // Run 25 intervals (25 × 200ms = 5000ms)
    await jest.runAllTimersAsync();
    await promise;

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain('Admin daemon failed to start on port 8088');
  });

  // ── getDaemonPath fallback — no candidate exists ──────────────────────────

  it('uses first candidate as best-guess when no daemon file exists', async () => {
    mockExistsSync.mockReturnValue(false); // no candidate found
    mockCreateConnection.mockImplementation(() => makeSock('connect'));

    const promise = launchAdminDaemon({ port: 9000 });
    await jest.runAllTimersAsync();
    const result = await promise;

    // Should still spawn (using first candidate path as fallback)
    expect(mockSpawn).toHaveBeenCalled();
    expect(result.port).toBe(9000);
  });

  // ── getDaemonPath — candidate found ──────────────────────────────────────

  it('uses found candidate path when existsSync returns true', async () => {
    mockExistsSync.mockReturnValueOnce(true); // first candidate exists
    mockCreateConnection.mockImplementation(() => makeSock('connect'));

    const promise = launchAdminDaemon({ port: 8088 });
    await jest.runAllTimersAsync();
    await promise;

    // spawn args[1][0] (first arg to node) should be a path ending in admin-daemon.js
    const spawnArgs = mockSpawn.mock.calls[0] as [string, string[], object];
    expect(spawnArgs[1][0]).toMatch(/admin-daemon\.js$/);
  });
});
