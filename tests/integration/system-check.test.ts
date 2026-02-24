/**
 * T035 — System Check Integration Tests (Step 0 of the Wizard)
 *
 * Tests the orchestration of all system checks together via `runAllChecks()`.
 * The function is defined in `packages/cli/src/services/system-checker.ts`
 * and delegates to individual check functions (OS, Docker, Node.js, disk,
 * memory, ports, Git).
 *
 * Test case references:
 *   TC-02-01: All checks pass → no critical failures, wizard can proceed
 *   TC-02-02: Docker daemon stopped → critical failure, wizard halts
 *   TC-02-03: Low memory (<2GB) → warning, not critical
 *   TC-02-04: Low disk (<20GB) → warning, not critical
 *   TC-02-05: Node.js too old (<20) → critical failure, wizard halts
 *   TC-02-06: Port 80 already bound → warning with process info
 *   TC-02-07: Git not installed → warning (non-critical)
 *   TC-02-08: All checks fail simultaneously → all failures listed, first
 *             critical failure causes hasCriticalFailure = true
 *
 * Mock strategy:
 *   We mock the underlying system interfaces (`execa`, `os`, `node:net`,
 *   `dockerode`) rather than the individual checker functions. This way
 *   we test the real orchestration logic in `runAllChecks()` end-to-end.
 *
 * @module tests/integration/system-check
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Type definitions for the module under test
// ---------------------------------------------------------------------------

/**
 * Expected shape of a single check result from the system checker.
 * Mirrors the contract from the task description.
 */
interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
  critical: boolean;
}

interface RunAllChecksResult {
  results: CheckResult[];
  hasCriticalFailure: boolean;
  warnings: CheckResult[];
}

// ---------------------------------------------------------------------------
// Mock setup — must come before any dynamic imports of the module under test
// ---------------------------------------------------------------------------

/**
 * Mock for `execa` — used by the system checker to run CLI commands
 * like `docker --version`, `node --version`, `git --version`, `df`, etc.
 */
const mockExeca = jest.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
  // Some code may use the named export `$` or default
  $: mockExeca,
  default: mockExeca,
}));

/**
 * Mock for `dockerode` — used to ping the Docker daemon.
 */
const mockDockerPing = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    ping: mockDockerPing,
  })),
}));

/**
 * Mock for `node:os` — used for memory and platform checks.
 */
const mockTotalmem = jest.fn<() => number>();
const mockFreemem = jest.fn<() => number>();
const mockPlatform = jest.fn<() => string>();
const mockArch = jest.fn<() => string>();
const mockRelease = jest.fn<() => string>();

jest.unstable_mockModule('node:os', () => ({
  default: {
    totalmem: mockTotalmem,
    freemem: mockFreemem,
    platform: mockPlatform,
    arch: mockArch,
    release: mockRelease,
  },
  totalmem: mockTotalmem,
  freemem: mockFreemem,
  platform: mockPlatform,
  arch: mockArch,
  release: mockRelease,
}));

/**
 * Mock for `node:net` — used for port availability checks.
 * We simulate `net.createServer().listen()` behavior.
 */
const mockCreateServer = jest.fn();

jest.unstable_mockModule('node:net', () => ({
  default: {
    createServer: mockCreateServer,
  },
  createServer: mockCreateServer,
}));

/**
 * Mock for `node:child_process` — fallback for some checks that
 * may use execSync instead of execa.
 */
const mockExecSync = jest.fn<(cmd: string) => Buffer>();

jest.unstable_mockModule('node:child_process', () => ({
  execSync: mockExecSync,
  default: {
    execSync: mockExecSync,
  },
}));

/**
 * Mock for `node:fs` — used for disk space checks and file existence.
 */
const mockStatfsSync = jest.fn();
const mockExistsSync = jest.fn<(path: string) => boolean>();

jest.unstable_mockModule('node:fs', () => ({
  default: {
    statfsSync: mockStatfsSync,
    existsSync: mockExistsSync,
  },
  statfsSync: mockStatfsSync,
  existsSync: mockExistsSync,
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mock registration)
// ---------------------------------------------------------------------------

const { runAllChecks } = await import(
  '../../packages/cli/src/services/system-checker.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GB = 1024 * 1024 * 1024;

/**
 * Set up all mocks to simulate a healthy system where every check passes.
 * Individual tests override specific mocks to simulate failures.
 */
function setupHealthySystem(): void {
  // OS: macOS (darwin) or Linux — supported platform
  mockPlatform.mockReturnValue('darwin');
  mockArch.mockReturnValue('arm64');
  mockRelease.mockReturnValue('25.2.0');

  // Memory: 16GB total, 8GB free — well above 2GB threshold
  mockTotalmem.mockReturnValue(16 * GB);
  mockFreemem.mockReturnValue(8 * GB);

  // Docker: daemon is running
  mockDockerPing.mockResolvedValue('OK');

  // execa calls — route based on command
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);
    const argList = Array.isArray(args) ? args.map(String) : [];

    // Docker version check
    if (command === 'docker' && argList.includes('--version')) {
      return { stdout: 'Docker version 27.0.3, build 7d4bcd8', stderr: '', exitCode: 0 };
    }

    // Node.js version check
    if (command === 'node' && argList.includes('--version')) {
      return { stdout: 'v20.18.0', stderr: '', exitCode: 0 };
    }

    // Git version check
    if (command === 'git' && argList.includes('--version')) {
      return { stdout: 'git version 2.45.0', stderr: '', exitCode: 0 };
    }

    // Disk space check (df command)
    if (command === 'df') {
      // 100GB available
      return {
        stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1 104857600 52428800 52428800 50% /',
        stderr: '',
        exitCode: 0,
      };
    }

    // Port check (lsof) — no process using the port
    if (command === 'lsof') {
      const error = new Error('lsof: no matching connections') as Error & { exitCode: number };
      error.exitCode = 1;
      throw error;
    }

    // Default: command not recognized — resolve with empty output
    return { stdout: '', stderr: '', exitCode: 0 };
  });

  // net.createServer — ports are available
  mockCreateServer.mockImplementation(() => {
    const server = {
      listen: jest.fn((_port: number, callback: () => void) => {
        // Port is available — call back immediately
        if (callback) callback();
        return server;
      }),
      close: jest.fn((callback?: () => void) => {
        if (callback) callback();
        return server;
      }),
      on: jest.fn((_event: string, _handler: () => void) => server),
      once: jest.fn((_event: string, _handler: () => void) => server),
    };
    return server;
  });

  // fs.statfsSync — plenty of disk space (50GB available)
  mockStatfsSync.mockReturnValue({
    bsize: 4096,
    bavail: (50 * GB) / 4096, // 50GB available in blocks
  });

  // fs.existsSync
  mockExistsSync.mockReturnValue(true);

  // child_process.execSync fallback
  mockExecSync.mockReturnValue(Buffer.from(''));
}

/**
 * Make the Docker daemon appear to be stopped / unreachable.
 */
function simulateDockerDown(): void {
  mockDockerPing.mockRejectedValue(new Error('connect ECONNREFUSED /var/run/docker.sock'));

  // Also make `docker --version` fail to simulate Docker not installed
  const originalImpl = mockExeca.getMockImplementation();
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);
    const argList = Array.isArray(args) ? args.map(String) : [];

    if (command === 'docker') {
      const error = new Error('command not found: docker') as Error & { exitCode: number };
      error.exitCode = 127;
      throw error;
    }

    // Fall through to existing implementation for other commands
    if (originalImpl) {
      return originalImpl(cmd, args);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

/**
 * Make Node.js version appear to be too old (v18.x).
 */
function simulateOldNodeVersion(): void {
  const originalImpl = mockExeca.getMockImplementation();
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);
    const argList = Array.isArray(args) ? args.map(String) : [];

    if (command === 'node' && argList.includes('--version')) {
      return { stdout: 'v18.20.4', stderr: '', exitCode: 0 };
    }

    if (originalImpl) {
      return originalImpl(cmd, args);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

/**
 * Simulate low memory (1.5GB total).
 */
function simulateLowMemory(): void {
  mockTotalmem.mockReturnValue(1.5 * GB);
  mockFreemem.mockReturnValue(0.5 * GB);
}

/**
 * Simulate low disk space (15GB available).
 */
function simulateLowDisk(): void {
  mockStatfsSync.mockReturnValue({
    bsize: 4096,
    bavail: (15 * GB) / 4096, // 15GB available
  });

  // Also adjust df output
  const originalImpl = mockExeca.getMockImplementation();
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);

    if (command === 'df') {
      return {
        stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1 31457280 15728640 15728640 50% /',
        stderr: '',
        exitCode: 0,
      };
    }

    if (originalImpl) {
      return originalImpl(cmd, args);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

/**
 * Simulate port 80 being in use.
 */
function simulatePort80InUse(): void {
  // net.createServer — port 80 fails to bind
  mockCreateServer.mockImplementation(() => {
    const server: Record<string, unknown> = {
      _errorHandler: null as ((...args: unknown[]) => void) | null,
      listen: jest.fn((port: number, callback?: () => void) => {
        if (port === 80) {
          // Emit error asynchronously
          const errorHandler = server._errorHandler as ((...args: unknown[]) => void) | null;
          if (errorHandler) {
            const err = new Error('listen EADDRINUSE: address already in use 0.0.0.0:80') as Error & { code: string };
            err.code = 'EADDRINUSE';
            setTimeout(() => errorHandler(err), 0);
          }
        } else {
          if (callback) callback();
        }
        return server;
      }),
      close: jest.fn((callback?: () => void) => {
        if (callback) callback();
        return server;
      }),
      on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') {
          server._errorHandler = handler;
        }
        return server;
      }),
      once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') {
          server._errorHandler = handler;
        }
        return server;
      }),
    };
    return server;
  });

  // lsof shows nginx on port 80
  const originalImpl = mockExeca.getMockImplementation();
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);
    const argList = Array.isArray(args) ? args.map(String) : [];

    if (command === 'lsof' && argList.some((a) => a.includes('80'))) {
      return {
        stdout: 'nginx 1234 root 6u IPv4 12345 0t0 TCP *:http (LISTEN)',
        stderr: '',
        exitCode: 0,
      };
    }

    if (originalImpl) {
      return originalImpl(cmd, args);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

/**
 * Simulate Git not installed.
 */
function simulateGitMissing(): void {
  const originalImpl = mockExeca.getMockImplementation();
  mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
    const command = String(cmd);
    const argList = Array.isArray(args) ? args.map(String) : [];

    if (command === 'git' && argList.includes('--version')) {
      const error = new Error('command not found: git') as Error & { exitCode: number };
      error.exitCode = 127;
      throw error;
    }

    if (originalImpl) {
      return originalImpl(cmd, args);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

/**
 * Simulate an unsupported OS (Windows).
 */
function simulateUnsupportedOS(): void {
  mockPlatform.mockReturnValue('win32');
}

/**
 * Find a check result by name (case-insensitive partial match).
 */
function findResult(results: CheckResult[], nameFragment: string): CheckResult | undefined {
  const lower = nameFragment.toLowerCase();
  return results.find((r) => r.name.toLowerCase().includes(lower));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('System Check Integration — runAllChecks() (T035)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHealthySystem();
  });

  // =========================================================================
  // TC-02-01: All checks pass
  // =========================================================================

  describe('TC-02-01: All requirements met — all checks pass', () => {
    it('should return hasCriticalFailure = false when all checks pass', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should return an array of results with at least 5 check items', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // Minimum checks: OS, Docker, Node.js, Disk, Memory, Port(s), Git
      expect(result.results.length).toBeGreaterThanOrEqual(5);
    });

    it('should have all results with status "pass"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      for (const check of result.results) {
        expect(check.status).toBe('pass');
      }
    });

    it('should have no warnings when all checks pass', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.warnings).toHaveLength(0);
    });

    it('should include an OS check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const osCheck = findResult(result.results, 'os');
      expect(osCheck).toBeDefined();
      expect(osCheck!.status).toBe('pass');
    });

    it('should include a Docker check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck).toBeDefined();
      expect(dockerCheck!.status).toBe('pass');
    });

    it('should include a Node.js version check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('pass');
    });

    it('should include a disk space check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.status).toBe('pass');
    });

    it('should include a memory check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      expect(memCheck!.status).toBe('pass');
    });

    it('should include a Git check result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck).toBeDefined();
      expect(gitCheck!.status).toBe('pass');
    });

    it('should have a human-readable message for each result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      for (const check of result.results) {
        expect(check.message).toBeTruthy();
        expect(typeof check.message).toBe('string');
        expect(check.message.length).toBeGreaterThan(0);
      }
    });

    it('should have a name for each result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      for (const check of result.results) {
        expect(check.name).toBeTruthy();
        expect(typeof check.name).toBe('string');
      }
    });

    it('should have a critical flag (boolean) for each result', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      for (const check of result.results) {
        expect(typeof check.critical).toBe('boolean');
      }
    });
  });

  // =========================================================================
  // TC-02-02: Docker daemon stopped — critical failure
  // =========================================================================

  describe('TC-02-02: Docker daemon stopped — critical failure, wizard halts', () => {
    beforeEach(() => {
      simulateDockerDown();
    });

    it('should return hasCriticalFailure = true', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);
    });

    it('should have Docker check with status "fail"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck).toBeDefined();
      expect(dockerCheck!.status).toBe('fail');
    });

    it('should mark Docker check as critical', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck).toBeDefined();
      expect(dockerCheck!.critical).toBe(true);
    });

    it('should include an actionable message about Docker', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck).toBeDefined();
      // Message should mention Docker, installation, or how to start it
      const msg = (dockerCheck!.message + (dockerCheck!.details ?? '')).toLowerCase();
      expect(msg).toMatch(/docker/i);
    });

    it('should still run and report all other checks even though Docker failed', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // Should have results for more than just Docker
      expect(result.results.length).toBeGreaterThan(1);

      // Non-Docker checks should still be present
      const nonDockerChecks = result.results.filter(
        (r) => !r.name.toLowerCase().includes('docker'),
      );
      expect(nonDockerChecks.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TC-02-03: Low memory (1.5GB) — warning, not critical
  // =========================================================================

  describe('TC-02-03: System RAM = 1.5GB (below 2GB) — memory warning', () => {
    beforeEach(() => {
      simulateLowMemory();
    });

    it('should return hasCriticalFailure = false (low memory is a warning, not critical)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should have memory check with status "warn"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      expect(memCheck!.status).toBe('warn');
    });

    it('should mark memory check as non-critical', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      expect(memCheck!.critical).toBe(false);
    });

    it('should include memory warning in the warnings array', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      const memWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('mem'),
      );
      expect(memWarning).toBeDefined();
    });

    it('should mention the available RAM or the 2GB threshold in the message', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      const combined = (memCheck!.message + (memCheck!.details ?? '')).toLowerCase();
      // Should mention RAM amount or the threshold
      expect(combined).toMatch(/ram|memory|gb|2\s*gb|1\.5/i);
    });
  });

  // =========================================================================
  // TC-02-04: Low disk space (15GB, below 20GB) — warning
  // =========================================================================

  describe('TC-02-04: Available disk = 15GB (below 20GB) — disk warning', () => {
    beforeEach(() => {
      simulateLowDisk();
    });

    it('should return hasCriticalFailure = false (low disk is a warning)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should have disk check with status "warn"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.status).toBe('warn');
    });

    it('should mark disk check as non-critical', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.critical).toBe(false);
    });

    it('should include disk warning in the warnings array', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      const diskWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('disk'),
      );
      expect(diskWarning).toBeDefined();
    });

    it('should mention the disk space or 20GB threshold in the message', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      const combined = (diskCheck!.message + (diskCheck!.details ?? '')).toLowerCase();
      expect(combined).toMatch(/disk|space|gb|20|15|storage/i);
    });
  });

  // =========================================================================
  // TC-02-05: Node.js too old (v18.x) — critical failure
  // =========================================================================

  describe('TC-02-05: Node.js version 18.x installed — critical failure', () => {
    beforeEach(() => {
      simulateOldNodeVersion();
    });

    it('should return hasCriticalFailure = true', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);
    });

    it('should have Node.js check with status "fail"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('fail');
    });

    it('should mark Node.js check as critical', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.critical).toBe(true);
    });

    it('should include install instructions in message or details', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      const combined = (nodeCheck!.message + (nodeCheck!.details ?? '')).toLowerCase();
      // Should mention version requirement or how to upgrade
      expect(combined).toMatch(/node|version|20|upgrade|install|nvm/i);
    });

    it('should not include Node.js check in warnings (it is a failure, not a warning)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('node'),
      );
      // Warnings should only contain 'warn' status items, not 'fail' items
      expect(nodeWarning).toBeUndefined();
    });
  });

  // =========================================================================
  // TC-02-06: Port 80 already bound — warning with process info
  // =========================================================================

  describe('TC-02-06: Port 80 already bound — port warning', () => {
    beforeEach(() => {
      simulatePort80InUse();
    });

    it('should return hasCriticalFailure = false (port conflicts are warnings)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should have port check with status "warn"', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const portCheck = findResult(result.results, 'port');
      expect(portCheck).toBeDefined();
      expect(portCheck!.status).toBe('warn');
    });

    it('should mark port check as non-critical', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const portCheck = findResult(result.results, 'port');
      expect(portCheck).toBeDefined();
      expect(portCheck!.critical).toBe(false);
    });

    it('should include port info in the warnings array', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const portWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('port'),
      );
      expect(portWarning).toBeDefined();
    });

    it('should mention port 80 or the process using it in message/details', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const portCheck = findResult(result.results, 'port');
      expect(portCheck).toBeDefined();
      const combined = (portCheck!.message + (portCheck!.details ?? '')).toLowerCase();
      expect(combined).toMatch(/80|port|in use|nginx|occupied|bound/i);
    });
  });

  // =========================================================================
  // TC-02-07: Git not installed — non-critical warning
  // =========================================================================

  describe('TC-02-07: Git not installed — non-critical warning', () => {
    beforeEach(() => {
      simulateGitMissing();
    });

    it('should return hasCriticalFailure = false (Git is non-critical)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should have Git check with status "warn" or "fail" but critical = false', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck).toBeDefined();
      // Git missing can be either 'warn' or 'fail', but should NOT be critical
      expect(['warn', 'fail']).toContain(gitCheck!.status);
      expect(gitCheck!.critical).toBe(false);
    });

    it('should include Git in warnings array (non-critical issue)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // Since Git is non-critical, it should appear in warnings regardless
      // of whether status is 'warn' or 'fail'
      const gitWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('git'),
      );
      expect(gitWarning).toBeDefined();
    });

    it('should mention Git installation in message or details', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck).toBeDefined();
      const combined = (gitCheck!.message + (gitCheck!.details ?? '')).toLowerCase();
      expect(combined).toMatch(/git|install|not found|missing/i);
    });
  });

  // =========================================================================
  // TC-02-08: All checks fail simultaneously
  // =========================================================================

  describe('TC-02-08: All checks fail simultaneously — all failures listed', () => {
    beforeEach(() => {
      // Simulate everything failing at once
      simulateUnsupportedOS();
      simulateDockerDown();
      simulateOldNodeVersion();
      simulateLowMemory();
      simulateLowDisk();
      simulatePort80InUse();
      simulateGitMissing();
    });

    it('should return hasCriticalFailure = true', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);
    });

    it('should list ALL failures in results (not stop at the first one)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // Should have results for every check category
      expect(result.results.length).toBeGreaterThanOrEqual(5);

      // Count non-pass results
      const nonPassResults = result.results.filter((r) => r.status !== 'pass');
      expect(nonPassResults.length).toBeGreaterThanOrEqual(3);
    });

    it('should have at least 2 critical failures (Docker + Node.js)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const criticalFailures = result.results.filter(
        (r) => r.status === 'fail' && r.critical === true,
      );
      // Docker and Node.js are both critical
      expect(criticalFailures.length).toBeGreaterThanOrEqual(2);
    });

    it('should have warnings for non-critical issues (memory, disk, port, git)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // warnings array should contain the non-critical issues
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('should include Docker failure in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck).toBeDefined();
      expect(dockerCheck!.status).toBe('fail');
      expect(dockerCheck!.critical).toBe(true);
    });

    it('should include Node.js failure in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('fail');
      expect(nodeCheck!.critical).toBe(true);
    });

    it('should include memory warning in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      expect(memCheck!.status).toBe('warn');
    });

    it('should include disk warning in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.status).toBe('warn');
    });

    it('should include Git issue in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck).toBeDefined();
      expect(['warn', 'fail']).toContain(gitCheck!.status);
    });

    it('should run all checks without throwing (orchestrator catches individual errors)', async () => {
      // runAllChecks should never throw — it catches individual check failures
      // and aggregates them into the results array
      await expect(runAllChecks()).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // Mixed results — various combinations
  // =========================================================================

  describe('Mixed results — correct categorization of pass/warn/fail', () => {
    it('should correctly categorize: Docker fail + low memory warn + rest pass', async () => {
      simulateDockerDown();
      simulateLowMemory();

      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);

      const dockerCheck = findResult(result.results, 'docker');
      expect(dockerCheck!.status).toBe('fail');
      expect(dockerCheck!.critical).toBe(true);

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck!.status).toBe('warn');
      expect(memCheck!.critical).toBe(false);

      // Node.js should still pass
      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck!.status).toBe('pass');
    });

    it('should correctly categorize: low memory + low disk warnings only', async () => {
      simulateLowMemory();
      simulateLowDisk();

      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);

      const memWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('mem'),
      );
      const diskWarning = result.warnings.find((w) =>
        w.name.toLowerCase().includes('disk'),
      );
      expect(memWarning).toBeDefined();
      expect(diskWarning).toBeDefined();
    });

    it('should correctly categorize: Git missing + port conflict (no critical)', async () => {
      simulateGitMissing();
      simulatePort80InUse();

      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(false);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('should correctly categorize: Node.js old (critical) + Git missing (non-critical)', async () => {
      simulateOldNodeVersion();
      simulateGitMissing();

      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck!.status).toBe('fail');
      expect(nodeCheck!.critical).toBe(true);

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck!.critical).toBe(false);
    });

    it('should correctly categorize: Docker down + Node.js old (both critical)', async () => {
      simulateDockerDown();
      simulateOldNodeVersion();

      const result: RunAllChecksResult = await runAllChecks();

      expect(result.hasCriticalFailure).toBe(true);

      const criticalFailures = result.results.filter(
        (r) => r.status === 'fail' && r.critical === true,
      );
      expect(criticalFailures.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Return type contract validation
  // =========================================================================

  describe('Return type contract — runAllChecks() shape validation', () => {
    it('should return an object with results, hasCriticalFailure, and warnings', async () => {
      const result = await runAllChecks();

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('hasCriticalFailure');
      expect(result).toHaveProperty('warnings');
    });

    it('results should be an array of CheckResult objects', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(Array.isArray(result.results)).toBe(true);
      for (const check of result.results) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('status');
        expect(check).toHaveProperty('message');
        expect(check).toHaveProperty('critical');
        expect(['pass', 'fail', 'warn']).toContain(check.status);
        expect(typeof check.name).toBe('string');
        expect(typeof check.message).toBe('string');
        expect(typeof check.critical).toBe('boolean');
      }
    });

    it('hasCriticalFailure should be a boolean', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(typeof result.hasCriticalFailure).toBe('boolean');
    });

    it('warnings should be an array (subset of results with warn/non-critical status)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      expect(Array.isArray(result.warnings)).toBe(true);

      // Every item in warnings should also appear in results
      for (const warning of result.warnings) {
        const inResults = result.results.some(
          (r) => r.name === warning.name && r.message === warning.message,
        );
        expect(inResults).toBe(true);
      }
    });

    it('hasCriticalFailure should be true if and only if any result has status=fail and critical=true', async () => {
      // Test with all passing
      const passResult: RunAllChecksResult = await runAllChecks();
      const hasCritical = passResult.results.some(
        (r) => r.status === 'fail' && r.critical === true,
      );
      expect(passResult.hasCriticalFailure).toBe(hasCritical);
    });

    it('hasCriticalFailure should be true when Docker is down', async () => {
      simulateDockerDown();
      const failResult: RunAllChecksResult = await runAllChecks();
      const hasCritical = failResult.results.some(
        (r) => r.status === 'fail' && r.critical === true,
      );
      expect(failResult.hasCriticalFailure).toBe(true);
      expect(hasCritical).toBe(true);
    });

    it('warnings array should only contain non-critical issues', async () => {
      simulateLowMemory();
      simulateGitMissing();

      const result: RunAllChecksResult = await runAllChecks();

      for (const warning of result.warnings) {
        // Warnings should be non-critical or status = warn
        expect(warning.status === 'warn' || warning.critical === false).toBe(true);
      }
    });

    it('details field should be optional (string or undefined)', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      for (const check of result.results) {
        if (check.details !== undefined) {
          expect(typeof check.details).toBe('string');
        }
      }
    });
  });

  // =========================================================================
  // Execution order and completeness
  // =========================================================================

  describe('Execution — all checks run regardless of individual failures', () => {
    it('should always return results for the core check categories', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      // These are the minimum required checks per FR-02
      const requiredCategories = ['os', 'docker', 'node', 'disk', 'mem'];
      for (const category of requiredCategories) {
        const found = findResult(result.results, category);
        expect(found).toBeDefined();
      }
    });

    it('should return results for Git check', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const gitCheck = findResult(result.results, 'git');
      expect(gitCheck).toBeDefined();
    });

    it('should not throw even when multiple checks fail', async () => {
      simulateDockerDown();
      simulateOldNodeVersion();
      simulateLowMemory();
      simulateLowDisk();
      simulateGitMissing();

      // Should resolve, not reject
      const result = await runAllChecks();
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should not have duplicate check names in results', async () => {
      const result: RunAllChecksResult = await runAllChecks();

      const names = result.results.map((r) => r.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('should handle exactly 2GB memory as pass (threshold is "below 2GB")', async () => {
      mockTotalmem.mockReturnValue(2 * GB);
      mockFreemem.mockReturnValue(1 * GB);

      const result: RunAllChecksResult = await runAllChecks();

      const memCheck = findResult(result.results, 'mem');
      expect(memCheck).toBeDefined();
      // Exactly 2GB should pass (below 2GB triggers warning)
      expect(memCheck!.status).toBe('pass');
    });

    it('should handle exactly 20GB disk as pass (threshold is "below 20GB")', async () => {
      mockStatfsSync.mockReturnValue({
        bsize: 4096,
        bavail: (20 * GB) / 4096,
      });

      const originalImpl = mockExeca.getMockImplementation();
      mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
        const command = String(cmd);
        if (command === 'df') {
          return {
            stdout: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1 41943040 20971520 20971520 50% /',
            stderr: '',
            exitCode: 0,
          };
        }
        if (originalImpl) {
          return originalImpl(cmd, args);
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result: RunAllChecksResult = await runAllChecks();

      const diskCheck = findResult(result.results, 'disk');
      expect(diskCheck).toBeDefined();
      // Exactly 20GB should pass (below 20GB triggers warning)
      expect(diskCheck!.status).toBe('pass');
    });

    it('should handle Node.js v20.0.0 as pass (minimum supported version)', async () => {
      const originalImpl = mockExeca.getMockImplementation();
      mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
        const command = String(cmd);
        const argList = Array.isArray(args) ? args.map(String) : [];

        if (command === 'node' && argList.includes('--version')) {
          return { stdout: 'v20.0.0', stderr: '', exitCode: 0 };
        }
        if (originalImpl) {
          return originalImpl(cmd, args);
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('pass');
    });

    it('should handle Node.js v19.x as fail (below minimum v20)', async () => {
      const originalImpl = mockExeca.getMockImplementation();
      mockExeca.mockImplementation(async (cmd: unknown, args?: unknown) => {
        const command = String(cmd);
        const argList = Array.isArray(args) ? args.map(String) : [];

        if (command === 'node' && argList.includes('--version')) {
          return { stdout: 'v19.9.0', stderr: '', exitCode: 0 };
        }
        if (originalImpl) {
          return originalImpl(cmd, args);
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result: RunAllChecksResult = await runAllChecks();

      const nodeCheck = findResult(result.results, 'node');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck!.status).toBe('fail');
      expect(nodeCheck!.critical).toBe(true);
    });

    it('should treat unsupported OS (win32) as critical failure or warning', async () => {
      simulateUnsupportedOS();

      const result: RunAllChecksResult = await runAllChecks();

      const osCheck = findResult(result.results, 'os');
      expect(osCheck).toBeDefined();
      // Windows is not a supported platform — should be 'fail' or 'warn'
      expect(osCheck!.status).not.toBe('pass');
    });

    it('should handle Linux platform as supported', async () => {
      mockPlatform.mockReturnValue('linux');

      const result: RunAllChecksResult = await runAllChecks();

      const osCheck = findResult(result.results, 'os');
      expect(osCheck).toBeDefined();
      expect(osCheck!.status).toBe('pass');
    });
  });

  // =========================================================================
  // Idempotency
  // =========================================================================

  describe('Idempotency — multiple calls produce consistent results', () => {
    it('should return the same structure on consecutive calls with same environment', async () => {
      const result1: RunAllChecksResult = await runAllChecks();
      const result2: RunAllChecksResult = await runAllChecks();

      expect(result1.hasCriticalFailure).toBe(result2.hasCriticalFailure);
      expect(result1.results.length).toBe(result2.results.length);
      expect(result1.warnings.length).toBe(result2.warnings.length);

      // Same check names in same order
      const names1 = result1.results.map((r) => r.name);
      const names2 = result2.results.map((r) => r.name);
      expect(names1).toEqual(names2);
    });

    it('should return different results when environment changes between calls', async () => {
      // First call: healthy system
      const result1: RunAllChecksResult = await runAllChecks();
      expect(result1.hasCriticalFailure).toBe(false);

      // Now break Docker
      simulateDockerDown();

      const result2: RunAllChecksResult = await runAllChecks();
      expect(result2.hasCriticalFailure).toBe(true);
    });
  });
});
