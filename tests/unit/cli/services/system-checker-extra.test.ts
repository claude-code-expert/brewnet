/**
 * Additional unit tests for services/system-checker — edge case error paths
 *
 * Covers:
 *   - checkNodeVersion(): outer catch — process.version getter throws (L196)
 *   - parseDfAvailableGB(): 1K-blocks header → KB to GB conversion (L238-241)
 *   - parseDfAvailableGB(): heuristic fallback for unknown header (L244-249)
 *   - checkDiskSpace(): parseDfAvailableGB returns -1 → warn (L261)
 *   - checkMemory(): totalmem() throws → catch returns warn (L329)
 *   - checkPort(): server emits non-EADDRINUSE, non-EACCES error (L378)
 *   - checkPort(): createServer() throws → outer catch resolves warn (L404)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup (identical module set to system-checker.test.ts)
// ---------------------------------------------------------------------------

const mockPlatform = jest.fn<() => NodeJS.Platform>().mockReturnValue('darwin');
const mockRelease = jest.fn<() => string>().mockReturnValue('25.2.0');
const mockTotalmem = jest.fn<() => number>().mockReturnValue(8 * 1024 * 1024 * 1024);
const mockFreemem = jest.fn<() => number>().mockReturnValue(4 * 1024 * 1024 * 1024);
const mockCpus = jest.fn<() => Array<{ model: string }>>().mockReturnValue([{ model: 'Apple M1' }]);

jest.unstable_mockModule('node:os', () => ({
  platform: mockPlatform,
  release: mockRelease,
  totalmem: mockTotalmem,
  freemem: mockFreemem,
  cpus: mockCpus,
  default: {
    platform: mockPlatform,
    release: mockRelease,
    totalmem: mockTotalmem,
    freemem: mockFreemem,
    cpus: mockCpus,
  },
}));

const mockExeca = jest.fn<(cmd: string, args?: string[]) => Promise<{ stdout: string; exitCode: number }>>()
  .mockImplementation(async (cmd: string) => {
    throw new Error(`Unmocked execa call: ${cmd}`);
  });

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
  default: { execa: mockExeca },
}));

type ListenCallback = () => void;
type ErrorCallback = (err: NodeJS.ErrnoException) => void;

const mockServerInstance = {
  listen: jest.fn<(port: number, callback: ListenCallback) => void>(),
  close: jest.fn<(callback?: () => void) => void>(),
  on: jest.fn<(event: string, callback: ErrorCallback) => void>(),
  once: jest.fn<(event: string, callback: ErrorCallback) => void>(),
};

const mockCreateServer = jest.fn(() => mockServerInstance as unknown as ReturnType<typeof mockCreateServer>);

jest.unstable_mockModule('node:net', () => ({
  createServer: mockCreateServer,
  default: { createServer: mockCreateServer },
}));

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { checkNodeVersion, checkDiskSpace, checkMemory, checkPort } = await import(
  '../../../../packages/cli/src/services/system-checker.js'
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.mockReturnValue('darwin');
  mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  mockExeca.mockImplementation(async (cmd: string) => {
    throw new Error(`Unmocked execa call: ${cmd}`);
  });

  mockServerInstance.listen.mockImplementation((_port: number, cb: ListenCallback) => cb());
  mockServerInstance.close.mockImplementation((cb?: () => void) => { if (cb) cb(); });
  mockServerInstance.on.mockReturnValue(mockServerInstance as unknown as ReturnType<typeof mockCreateServer>);
  mockServerInstance.once.mockReturnValue(mockServerInstance as unknown as ReturnType<typeof mockCreateServer>);
  mockCreateServer.mockReturnValue(mockServerInstance as unknown as ReturnType<typeof mockCreateServer>);
});

// ---------------------------------------------------------------------------
// checkNodeVersion — outer catch (L196)
// ---------------------------------------------------------------------------

describe('checkNodeVersion() — outer catch when process.version getter throws (L196)', () => {
  afterEach(() => {
    // Restore process.version to a normal string value
    Object.defineProperty(process, 'version', {
      value: 'v20.11.0',
      writable: true,
      configurable: true,
    });
  });

  it('returns fail with "Unable to determine" when process.version throws', async () => {
    // execa('node', ['--version']) will throw ('Unmocked') → inner catch tries process.version
    // If process.version getter also throws, the outer catch fires (L196)
    Object.defineProperty(process, 'version', {
      get: () => { throw new Error('process.version unavailable'); },
      configurable: true,
    });

    const result = await checkNodeVersion();
    expect(result.status).toBe('fail');
    expect(result.message).toContain('Unable to determine');
  });
});

// ---------------------------------------------------------------------------
// checkDiskSpace — parseDfAvailableGB paths
// ---------------------------------------------------------------------------

describe('checkDiskSpace() — parseDfAvailableGB K-blocks header (L238-241)', () => {
  it('converts 1K-blocks value to GB correctly', async () => {
    // 100 GB = 100 * 1024 * 1024 = 104857600 KB
    const kbAvailable = 100 * 1024 * 1024;
    mockExeca.mockResolvedValueOnce({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/sda1      209715200 104857600 ${kbAvailable}  50% /`,
      exitCode: 0,
    } as never);

    const result = await checkDiskSpace(20);
    expect(result.status).toBe('pass');
    // 100GB available should be reported as pass (>= 20GB)
    expect(result.message).toContain('GB');
  });
});

describe('checkDiskSpace() — parseDfAvailableGB heuristic fallback (L244-249)', () => {
  it('treats large raw values as KB when header has no block unit keyword', async () => {
    // Header has no "G-blocks", "1G", "K-blocks", "1K"
    // Value > 100000 triggers heuristic KB→GB conversion
    mockExeca.mockResolvedValueOnce({
      stdout: 'Filesystem    Blocks    Used  Available Use% Mounted on\n/dev/sda1   200000000 100000000 104857600   50% /\n',
      exitCode: 0,
    } as never);

    const result = await checkDiskSpace(20);
    // 104857600 KB ≈ 100 GB → pass
    expect(result.status).toBe('pass');
    expect(result.message).toContain('GB');
  });
});

describe('checkDiskSpace() — availableGB < 0 (L261)', () => {
  it('returns warn with "Unable to determine" when df output has fewer than 2 lines', async () => {
    mockExeca.mockResolvedValueOnce({
      // Only header, no data line → lines.length < 2 → parseDfAvailableGB returns -1
      stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on',
      exitCode: 0,
    } as never);

    const result = await checkDiskSpace(20);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('Unable to determine');
  });
});

// ---------------------------------------------------------------------------
// checkMemory — catch block (L329)
// ---------------------------------------------------------------------------

describe('checkMemory() — totalmem throws (L329)', () => {
  it('returns warn when totalmem() throws', async () => {
    mockTotalmem.mockImplementation(() => { throw new Error('totalmem unavailable'); });

    const result = await checkMemory();
    expect(result.status).toBe('warn');
    expect(result.message).toContain('Unable to determine system memory');
  });
});

// ---------------------------------------------------------------------------
// checkPort — generic error path (L378)
// ---------------------------------------------------------------------------

describe('checkPort() — generic non-EADDRINUSE/non-EACCES error (L378)', () => {
  it('resolves warn with error message for unknown error code', async () => {
    // Prevent listen callback from firing (so the "pass" path never runs)
    mockServerInstance.listen.mockImplementation((_port: number, _cb: ListenCallback) => {
      // intentionally don't call _cb
    });
    // Register the error event handler and fire it with a non-standard code
    mockServerInstance.on.mockImplementation(
      (event: string, cb: ErrorCallback) => {
        if (event === 'error') {
          const err = Object.assign(new Error('network unreachable'), { code: 'ENETUNREACH' });
          setImmediate(() => cb(err));
        }
        return mockServerInstance as unknown as ReturnType<typeof mockCreateServer>;
      },
    );

    const result = await checkPort(8080);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('8080');
  });
});

// ---------------------------------------------------------------------------
// checkPort — outer catch: createServer throws (L404)
// ---------------------------------------------------------------------------

describe('checkPort() — createServer throws (L404)', () => {
  it('resolves warn when createServer itself throws', async () => {
    mockCreateServer.mockImplementation(() => {
      throw new Error('createServer failed');
    });

    const result = await checkPort(8080);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('check failed');
  });
});
