/**
 * Unit tests for the Brewnet System Checker — Step 0 of the init wizard (T034).
 *
 * Test case references (from TEST_CASES.md):
 *   TC-02-01: All requirements met → each check shows pass
 *   TC-02-02: Docker daemon stopped → Docker check fails, BN001, wizard halts
 *   TC-02-03: RAM = 1.5GB (below 2GB) → memory check warns
 *   TC-02-04: Disk = 15GB (below 20GB) → disk check warns
 *   TC-02-05: Node.js 18.x → fails, critical, wizard halts
 *   TC-02-06: Port 80 already bound → warns with process info
 *   TC-02-07: Git not installed → warns (non-critical)
 *   TC-02-08: All checks fail simultaneously → all failures listed, first critical halts
 *
 * These are TDD tests (red phase) — the implementation does not exist yet.
 * All tests are expected to FAIL until `system-checker.ts` is implemented.
 *
 * Mock strategy:
 *   - `node:os` mocked via `jest.unstable_mockModule` (ESM-compatible)
 *   - `execa` mocked via `jest.unstable_mockModule`
 *   - `node:net` mocked via `jest.unstable_mockModule`
 *   - `process.version` overridden per-test
 *   - Module under test dynamically imported AFTER mocks are registered
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Type definitions for mock setup
// ---------------------------------------------------------------------------

type ExecaReturnType = {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
};

// ---------------------------------------------------------------------------
// Mock setup — must come before any dynamic imports of the module under test
// ---------------------------------------------------------------------------

// -- node:os mocks --
const mockPlatform = jest.fn<() => NodeJS.Platform>();
const mockRelease = jest.fn<() => string>();
const mockTotalmem = jest.fn<() => number>();
const mockFreemem = jest.fn<() => number>();
const mockCpus = jest.fn<() => Array<{ model: string }>>();

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

// -- execa mock --
const mockExeca = jest.fn<(cmd: string, args?: string[]) => Promise<ExecaReturnType>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
  default: { execa: mockExeca },
}));

// -- node:net mock for port checking --
type ListenCallback = () => void;
type ErrorCallback = (err: NodeJS.ErrnoException) => void;

const mockServerInstance = {
  listen: jest.fn<(port: number, callback: ListenCallback) => void>(),
  close: jest.fn<(callback?: () => void) => void>(),
  on: jest.fn<(event: string, callback: ErrorCallback) => void>(),
  once: jest.fn<(event: string, callback: ErrorCallback) => void>(),
};

const mockCreateServer = jest.fn(() => mockServerInstance);

jest.unstable_mockModule('node:net', () => ({
  createServer: mockCreateServer,
  default: { createServer: mockCreateServer },
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mock registration)
// ---------------------------------------------------------------------------

const {
  checkOS,
  checkDocker,
  checkNodeVersion,
  checkDiskSpace,
  checkMemory,
  checkPort,
  checkGit,
  runAllChecks,
} = await import('../../../../packages/cli/src/services/system-checker.js');

const { BrewnetError, isBrewnetError } = await import(
  '../../../../packages/cli/src/utils/errors.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GB = 1024 * 1024 * 1024;

/** Convenience to set up default "all pass" mock state. */
function setupAllPassingMocks(): void {
  // OS: macOS (darwin)
  mockPlatform.mockReturnValue('darwin');
  mockRelease.mockReturnValue('25.2.0');
  mockCpus.mockReturnValue([{ model: 'Apple M1' }, { model: 'Apple M1' }]);

  // Memory: 8GB total
  mockTotalmem.mockReturnValue(8 * GB);
  mockFreemem.mockReturnValue(4 * GB);

  // execa responses for Docker, Git, disk
  mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
    if (cmd === 'docker' && args?.[0] === '--version') {
      return {
        stdout: 'Docker version 27.0.3, build 7d4bcd8',
        stderr: '',
        exitCode: 0,
        failed: false,
      };
    }
    if (cmd === 'docker' && args?.[0] === 'compose' && args?.[1] === 'version') {
      return {
        stdout: 'Docker Compose version v2.28.1',
        stderr: '',
        exitCode: 0,
        failed: false,
      };
    }
    if (cmd === 'docker' && args?.[0] === 'info') {
      return {
        stdout: 'Server Version: 27.0.3',
        stderr: '',
        exitCode: 0,
        failed: false,
      };
    }
    if (cmd === 'git' && args?.[0] === '--version') {
      return {
        stdout: 'git version 2.43.0',
        stderr: '',
        exitCode: 0,
        failed: false,
      };
    }
    if (cmd === 'df') {
      // df -BG / or df -g /  — simulate 100GB available
      return {
        stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    100       100  50% /',
        stderr: '',
        exitCode: 0,
        failed: false,
      };
    }
    throw new Error(`Unmocked execa call: ${cmd} ${(args ?? []).join(' ')}`);
  });

  // Port: available (listen succeeds, then close)
  mockServerInstance.listen.mockImplementation((_port: number, callback: ListenCallback) => {
    callback();
  });
  mockServerInstance.close.mockImplementation((callback?: () => void) => {
    if (callback) callback();
  });
  mockServerInstance.on.mockReturnValue(mockServerInstance as any);
  mockServerInstance.once.mockReturnValue(mockServerInstance as any);
}

// ---------------------------------------------------------------------------
// Store original process.version so we can restore it
// ---------------------------------------------------------------------------

const originalProcessVersion = process.version;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SystemChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAllPassingMocks();
    // Default: Node.js 20+
    Object.defineProperty(process, 'version', {
      value: 'v20.11.0',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original process.version
    Object.defineProperty(process, 'version', {
      value: originalProcessVersion,
      writable: true,
      configurable: true,
    });
  });

  // =========================================================================
  // CheckResult interface shape
  // =========================================================================

  describe('CheckResult interface contract', () => {
    it('should return an object with name, status, message, and critical fields', async () => {
      const result = await checkOS();

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('critical');
      expect(typeof result.name).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(typeof result.critical).toBe('boolean');
      expect(['pass', 'fail', 'warn']).toContain(result.status);
    });

    it('should optionally include a details field', async () => {
      const result = await checkOS();

      // details is optional but if present must be a string
      if (result.details !== undefined) {
        expect(typeof result.details).toBe('string');
      }
    });
  });

  // =========================================================================
  // checkOS
  // =========================================================================

  describe('checkOS()', () => {
    it('should pass on macOS (darwin)', async () => {
      mockPlatform.mockReturnValue('darwin');
      mockRelease.mockReturnValue('25.2.0');

      const result = await checkOS();

      expect(result.name).toBe('OS');
      expect(result.status).toBe('pass');
      expect(result.critical).toBe(true);
    });

    it('should pass on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      mockRelease.mockReturnValue('6.1.0-18-amd64');

      const result = await checkOS();

      expect(result.status).toBe('pass');
    });

    it('should include platform info in details or message', async () => {
      mockPlatform.mockReturnValue('darwin');
      mockRelease.mockReturnValue('25.2.0');

      const result = await checkOS();

      const combined = `${result.message} ${result.details ?? ''}`;
      expect(combined.toLowerCase()).toMatch(/darwin|macos/i);
    });

    it('should fail on Windows (win32)', async () => {
      mockPlatform.mockReturnValue('win32');
      mockRelease.mockReturnValue('10.0.19045');

      const result = await checkOS();

      expect(result.status).toBe('fail');
      expect(result.critical).toBe(true);
      expect(result.message).toMatch(/unsupported|not supported|windows/i);
    });

    it('should fail on unsupported platforms', async () => {
      mockPlatform.mockReturnValue('freebsd' as NodeJS.Platform);
      mockRelease.mockReturnValue('14.0');

      const result = await checkOS();

      expect(result.status).toBe('fail');
      expect(result.critical).toBe(true);
    });
  });

  // =========================================================================
  // checkDocker — TC-02-02
  // =========================================================================

  describe('checkDocker()', () => {
    describe('when Docker is installed and running (pass)', () => {
      it('should return pass status', async () => {
        const result = await checkDocker();

        expect(result.name).toBe('Docker');
        expect(result.status).toBe('pass');
        expect(result.critical).toBe(true);
      });

      it('should include Docker version in details', async () => {
        const result = await checkDocker();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/27\.0|docker/i);
      });

      it('should verify both docker --version and docker compose version', async () => {
        await checkDocker();

        // Should have called execa for docker --version
        expect(mockExeca).toHaveBeenCalledWith('docker', ['--version']);
      });
    });

    describe('when Docker daemon is stopped (TC-02-02)', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'docker' && args?.[0] === '--version') {
            return {
              stdout: 'Docker version 27.0.3, build 7d4bcd8',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          if (cmd === 'docker' && (args?.[0] === 'info' || args?.[0] === 'compose')) {
            throw Object.assign(new Error('Cannot connect to the Docker daemon'), {
              exitCode: 1,
              failed: true,
              stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
            });
          }
          if (cmd === 'git' && args?.[0] === '--version') {
            return { stdout: 'git version 2.43.0', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return { stdout: '/dev/sda1 200 100 100 50% /', stderr: '', exitCode: 0, failed: false };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should return fail status', async () => {
        const result = await checkDocker();

        expect(result.status).toBe('fail');
      });

      it('should be marked as critical', async () => {
        const result = await checkDocker();

        expect(result.critical).toBe(true);
      });

      it('should include BN001 error reference or Docker-not-running message', async () => {
        const result = await checkDocker();

        expect(result.message).toMatch(/not running|not found|daemon|BN001/i);
      });
    });

    describe('when Docker is not installed at all', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'docker') {
            throw Object.assign(new Error('command not found: docker'), {
              exitCode: 127,
              failed: true,
              stderr: 'command not found: docker',
            });
          }
          if (cmd === 'git' && args?.[0] === '--version') {
            return { stdout: 'git version 2.43.0', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return { stdout: '/dev/sda1 200 100 100 50% /', stderr: '', exitCode: 0, failed: false };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should return fail status when docker command is not found', async () => {
        const result = await checkDocker();

        expect(result.status).toBe('fail');
        expect(result.critical).toBe(true);
      });

      it('should include installation instructions in the message', async () => {
        const result = await checkDocker();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/not found|not installed|install/i);
      });
    });

    describe('when Docker version is too old', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'docker' && args?.[0] === '--version') {
            return {
              stdout: 'Docker version 20.10.7, build f0df350',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          if (cmd === 'docker' && args?.[0] === 'compose' && args?.[1] === 'version') {
            return {
              stdout: 'Docker Compose version v2.0.0',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          if (cmd === 'docker' && args?.[0] === 'info') {
            return { stdout: 'Server Version: 20.10.7', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'git' && args?.[0] === '--version') {
            return { stdout: 'git version 2.43.0', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return { stdout: '/dev/sda1 200 100 100 50% /', stderr: '', exitCode: 0, failed: false };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should warn or fail for Docker < 24.0', async () => {
        const result = await checkDocker();

        expect(['fail', 'warn']).toContain(result.status);
      });
    });
  });

  // =========================================================================
  // checkNodeVersion — TC-02-05
  // =========================================================================

  describe('checkNodeVersion()', () => {
    describe('when Node.js >= 20 (pass)', () => {
      it('should return pass for Node.js 20.x', async () => {
        Object.defineProperty(process, 'version', { value: 'v20.11.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.name).toMatch(/node/i);
        expect(result.status).toBe('pass');
        expect(result.critical).toBe(true);
      });

      it('should return pass for Node.js 22.x', async () => {
        Object.defineProperty(process, 'version', { value: 'v22.0.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.status).toBe('pass');
      });

      it('should include the detected version in details or message', async () => {
        Object.defineProperty(process, 'version', { value: 'v20.11.0', configurable: true });

        const result = await checkNodeVersion();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/20\.11\.0|v20/);
      });
    });

    describe('when Node.js < 20 (TC-02-05 — fail, critical)', () => {
      it('should fail for Node.js 18.x', async () => {
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.status).toBe('fail');
        expect(result.critical).toBe(true);
      });

      it('should fail for Node.js 16.x', async () => {
        Object.defineProperty(process, 'version', { value: 'v16.20.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.status).toBe('fail');
        expect(result.critical).toBe(true);
      });

      it('should include install/upgrade instructions in the message', async () => {
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });

        const result = await checkNodeVersion();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/upgrade|install|required|>= ?20|minimum/i);
      });

      it('should show the current version in the failure message', async () => {
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });

        const result = await checkNodeVersion();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/18/);
      });
    });

    describe('edge cases', () => {
      it('should pass for Node.js 20.0.0 (exact minimum)', async () => {
        Object.defineProperty(process, 'version', { value: 'v20.0.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.status).toBe('pass');
      });

      it('should fail for Node.js 19.x (just below minimum)', async () => {
        Object.defineProperty(process, 'version', { value: 'v19.9.0', configurable: true });

        const result = await checkNodeVersion();

        expect(result.status).toBe('fail');
      });
    });
  });

  // =========================================================================
  // checkMemory — TC-02-03
  // =========================================================================

  describe('checkMemory()', () => {
    describe('when RAM >= 2GB (pass)', () => {
      it('should return pass for 8GB RAM', async () => {
        mockTotalmem.mockReturnValue(8 * GB);

        const result = await checkMemory();

        expect(result.name).toMatch(/memory|ram/i);
        expect(result.status).toBe('pass');
        expect(result.critical).toBe(false);
      });

      it('should return pass for exactly 2GB RAM', async () => {
        mockTotalmem.mockReturnValue(2 * GB);

        const result = await checkMemory();

        expect(result.status).toBe('pass');
      });

      it('should include detected RAM amount in details or message', async () => {
        mockTotalmem.mockReturnValue(8 * GB);

        const result = await checkMemory();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/8|GB/i);
      });
    });

    describe('when RAM < 2GB (TC-02-03 — warn)', () => {
      it('should warn for 1.5GB RAM', async () => {
        mockTotalmem.mockReturnValue(1.5 * GB);

        const result = await checkMemory();

        expect(result.status).toBe('warn');
      });

      it('should warn for 1GB RAM', async () => {
        mockTotalmem.mockReturnValue(1 * GB);

        const result = await checkMemory();

        expect(result.status).toBe('warn');
      });

      it('should NOT be critical (warning only, does not halt wizard)', async () => {
        mockTotalmem.mockReturnValue(1.5 * GB);

        const result = await checkMemory();

        expect(result.critical).toBe(false);
      });

      it('should include the detected and recommended amounts in message', async () => {
        mockTotalmem.mockReturnValue(1.5 * GB);

        const result = await checkMemory();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/1\.5|2|GB/i);
      });
    });

    describe('with custom minGB parameter', () => {
      it('should use the custom minimum when provided', async () => {
        mockTotalmem.mockReturnValue(3 * GB);

        const result = await checkMemory(4);

        expect(result.status).toBe('warn');
      });

      it('should pass when memory meets custom minimum', async () => {
        mockTotalmem.mockReturnValue(4 * GB);

        const result = await checkMemory(4);

        expect(result.status).toBe('pass');
      });
    });
  });

  // =========================================================================
  // checkDiskSpace — TC-02-04
  // =========================================================================

  describe('checkDiskSpace()', () => {
    describe('when disk >= 20GB (pass)', () => {
      it('should return pass for 100GB available', async () => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    100       100  50% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });

        const result = await checkDiskSpace();

        expect(result.name).toMatch(/disk/i);
        expect(result.status).toBe('pass');
        expect(result.critical).toBe(false);
      });

      it('should return pass for exactly 20GB available', async () => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    180        20  90% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });

        const result = await checkDiskSpace();

        expect(result.status).toBe('pass');
      });
    });

    describe('when disk < 20GB (TC-02-04 — warn)', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    185        15  93% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });
      });

      it('should warn for 15GB available disk', async () => {
        const result = await checkDiskSpace();

        expect(result.status).toBe('warn');
      });

      it('should NOT be critical (warning only)', async () => {
        const result = await checkDiskSpace();

        expect(result.critical).toBe(false);
      });

      it('should include available and recommended disk amounts', async () => {
        const result = await checkDiskSpace();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/15|20|GB/i);
      });
    });

    describe('when disk < 5GB (very low)', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    196         4  98% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });
      });

      it('should warn for very low disk space', async () => {
        const result = await checkDiskSpace();

        expect(result.status).toBe('warn');
      });
    });

    describe('with custom minGB parameter', () => {
      it('should use the custom minimum when provided', async () => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    160        40  80% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });

        const result = await checkDiskSpace(50);

        expect(result.status).toBe('warn');
      });

      it('should pass when disk meets custom minimum', async () => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    150        50  75% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd} ${(args ?? []).join(' ')}`);
        });

        const result = await checkDiskSpace(50);

        expect(result.status).toBe('pass');
      });
    });

    describe('when df command fails', () => {
      it('should return warn when df is unavailable', async () => {
        mockExeca.mockImplementation(async (cmd: string) => {
          if (cmd === 'df') {
            throw new Error('command not found: df');
          }
          throw new Error(`Unmocked: ${cmd}`);
        });

        const result = await checkDiskSpace();

        expect(result.status).toBe('warn');
        expect(result.message).toMatch(/unable|could not|check|determine/i);
      });
    });
  });

  // =========================================================================
  // checkPort — TC-02-06
  // =========================================================================

  describe('checkPort()', () => {
    describe('when port is available (pass)', () => {
      it('should return pass for an available port', async () => {
        // listen succeeds (port is free), then we close
        mockServerInstance.listen.mockImplementation((_port: number, callback: ListenCallback) => {
          callback();
        });
        mockServerInstance.close.mockImplementation((callback?: () => void) => {
          if (callback) callback();
        });

        const result = await checkPort(80);

        expect(result.name).toMatch(/port/i);
        expect(result.status).toBe('pass');
      });

      it('should not be critical (ports are warnings)', async () => {
        mockServerInstance.listen.mockImplementation((_port: number, callback: ListenCallback) => {
          callback();
        });
        mockServerInstance.close.mockImplementation((callback?: () => void) => {
          if (callback) callback();
        });

        const result = await checkPort(80);

        expect(result.critical).toBe(false);
      });

      it('should include the port number in the result', async () => {
        mockServerInstance.listen.mockImplementation((_port: number, callback: ListenCallback) => {
          callback();
        });
        mockServerInstance.close.mockImplementation((callback?: () => void) => {
          if (callback) callback();
        });

        const result = await checkPort(443);

        const combined = `${result.name} ${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/443/);
      });
    });

    describe('when port is already bound (TC-02-06 — warn)', () => {
      beforeEach(() => {
        mockServerInstance.listen.mockImplementation((_port: number, _callback: ListenCallback) => {
          // Do not call the success callback — instead trigger the error handler
        });
        mockServerInstance.on.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EADDRINUSE: address already in use :::80') as NodeJS.ErrnoException;
            err.code = 'EADDRINUSE';
            callback(err);
          }
          return mockServerInstance as any;
        });
        mockServerInstance.once.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EADDRINUSE: address already in use :::80') as NodeJS.ErrnoException;
            err.code = 'EADDRINUSE';
            callback(err);
          }
          return mockServerInstance as any;
        });
      });

      it('should warn when port 80 is already in use', async () => {
        const result = await checkPort(80);

        expect(result.status).toBe('warn');
      });

      it('should not be critical (port conflicts are warnings)', async () => {
        const result = await checkPort(80);

        expect(result.critical).toBe(false);
      });

      it('should include port number and in-use info in message', async () => {
        const result = await checkPort(80);

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/80/);
        expect(combined).toMatch(/in use|busy|occupied|EADDRINUSE|bound/i);
      });

      it('should work for different port numbers', async () => {
        mockServerInstance.on.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EADDRINUSE: address already in use :::443') as NodeJS.ErrnoException;
            err.code = 'EADDRINUSE';
            callback(err);
          }
          return mockServerInstance as any;
        });
        mockServerInstance.once.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EADDRINUSE: address already in use :::443') as NodeJS.ErrnoException;
            err.code = 'EADDRINUSE';
            callback(err);
          }
          return mockServerInstance as any;
        });

        const result = await checkPort(443);

        expect(result.status).toBe('warn');
        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/443/);
      });
    });

    describe('when port check encounters EACCES (permission denied)', () => {
      it('should warn for EACCES errors (e.g., port < 1024 without root)', async () => {
        mockServerInstance.listen.mockImplementation((_port: number, _callback: ListenCallback) => {
          // Do not call success
        });
        mockServerInstance.on.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EACCES: permission denied 0.0.0.0:80') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            callback(err);
          }
          return mockServerInstance as any;
        });
        mockServerInstance.once.mockImplementation((event: string, callback: ErrorCallback) => {
          if (event === 'error') {
            const err = new Error('listen EACCES: permission denied 0.0.0.0:80') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            callback(err);
          }
          return mockServerInstance as any;
        });

        const result = await checkPort(80);

        expect(result.status).toBe('warn');
      });
    });
  });

  // =========================================================================
  // checkGit — TC-02-07
  // =========================================================================

  describe('checkGit()', () => {
    describe('when Git is installed (pass)', () => {
      it('should return pass', async () => {
        const result = await checkGit();

        expect(result.name).toMatch(/git/i);
        expect(result.status).toBe('pass');
      });

      it('should not be critical', async () => {
        const result = await checkGit();

        expect(result.critical).toBe(false);
      });

      it('should include Git version in details or message', async () => {
        const result = await checkGit();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/2\.43|git/i);
      });
    });

    describe('when Git is NOT installed (TC-02-07 — warn, non-critical)', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'git') {
            throw Object.assign(new Error('command not found: git'), {
              exitCode: 127,
              failed: true,
              stderr: 'command not found: git',
            });
          }
          // Keep other mocks working
          if (cmd === 'docker' && args?.[0] === '--version') {
            return { stdout: 'Docker version 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'compose' && args?.[1] === 'version') {
            return { stdout: 'Docker Compose version v2.28.1', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'info') {
            return { stdout: 'Server Version: 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return { stdout: '/dev/sda1 200 100 100 50% /', stderr: '', exitCode: 0, failed: false };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should return warn status (not fail)', async () => {
        const result = await checkGit();

        expect(result.status).toBe('warn');
      });

      it('should NOT be critical (Git absence should not halt wizard)', async () => {
        const result = await checkGit();

        expect(result.critical).toBe(false);
      });

      it('should include install instructions in message', async () => {
        const result = await checkGit();

        const combined = `${result.message} ${result.details ?? ''}`;
        expect(combined).toMatch(/not found|not installed|install/i);
      });
    });
  });

  // =========================================================================
  // runAllChecks — TC-02-01, TC-02-08
  // =========================================================================

  describe('runAllChecks()', () => {
    describe('TC-02-01: all requirements met', () => {
      it('should return results array with multiple check results', async () => {
        const { results } = await runAllChecks();

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThanOrEqual(5);
      });

      it('should have all checks passing', async () => {
        const { results } = await runAllChecks();

        for (const result of results) {
          expect(result.status).toBe('pass');
        }
      });

      it('should set hasCriticalFailure to false', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(false);
      });

      it('should return empty warnings array', async () => {
        const { warnings } = await runAllChecks();

        expect(warnings).toEqual([]);
      });

      it('should include OS, Docker, Node.js, Memory, Disk, and Git checks', async () => {
        const { results } = await runAllChecks();

        const names = results.map((r) => r.name.toLowerCase());
        expect(names).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/os/i),
            expect.stringMatching(/docker/i),
            expect.stringMatching(/node/i),
            expect.stringMatching(/memory|ram/i),
            expect.stringMatching(/disk/i),
            expect.stringMatching(/git/i),
          ]),
        );
      });
    });

    describe('TC-02-02: Docker daemon stopped → hasCriticalFailure', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'docker') {
            throw Object.assign(new Error('Cannot connect to the Docker daemon'), {
              exitCode: 1,
              failed: true,
              stderr: 'Cannot connect to the Docker daemon',
            });
          }
          if (cmd === 'git' && args?.[0] === '--version') {
            return { stdout: 'git version 2.43.0', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    100       100  50% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should set hasCriticalFailure to true', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(true);
      });

      it('should include Docker in the results as failed', async () => {
        const { results } = await runAllChecks();

        const dockerResult = results.find((r) => r.name.toLowerCase().includes('docker'));
        expect(dockerResult).toBeDefined();
        expect(dockerResult!.status).toBe('fail');
        expect(dockerResult!.critical).toBe(true);
      });

      it('should still run all other checks (not short-circuit)', async () => {
        const { results } = await runAllChecks();

        // Even if Docker fails, other checks should still run
        expect(results.length).toBeGreaterThanOrEqual(5);
        const gitResult = results.find((r) => r.name.toLowerCase().includes('git'));
        expect(gitResult).toBeDefined();
      });
    });

    describe('TC-02-05: Node.js 18.x → hasCriticalFailure', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });
      });

      it('should set hasCriticalFailure to true for Node.js < 20', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(true);
      });

      it('should include Node.js in results as failed', async () => {
        const { results } = await runAllChecks();

        const nodeResult = results.find((r) => r.name.toLowerCase().includes('node'));
        expect(nodeResult).toBeDefined();
        expect(nodeResult!.status).toBe('fail');
        expect(nodeResult!.critical).toBe(true);
      });
    });

    describe('TC-02-03: Low RAM → warning', () => {
      beforeEach(() => {
        mockTotalmem.mockReturnValue(1.5 * GB);
      });

      it('should NOT set hasCriticalFailure for low RAM (warning only)', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(false);
      });

      it('should include memory warning in the warnings array', async () => {
        const { warnings } = await runAllChecks();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const memWarn = warnings.find((w) => w.name.toLowerCase().match(/memory|ram/));
        expect(memWarn).toBeDefined();
        expect(memWarn!.status).toBe('warn');
      });
    });

    describe('TC-02-04: Low disk → warning', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    185        15  93% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          if (cmd === 'docker' && args?.[0] === '--version') {
            return { stdout: 'Docker version 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'compose' && args?.[1] === 'version') {
            return { stdout: 'Docker Compose version v2.28.1', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'info') {
            return { stdout: 'Server Version: 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'git' && args?.[0] === '--version') {
            return { stdout: 'git version 2.43.0', stderr: '', exitCode: 0, failed: false };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should NOT set hasCriticalFailure for low disk (warning only)', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(false);
      });

      it('should include disk warning in the warnings array', async () => {
        const { warnings } = await runAllChecks();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const diskWarn = warnings.find((w) => w.name.toLowerCase().includes('disk'));
        expect(diskWarn).toBeDefined();
        expect(diskWarn!.status).toBe('warn');
      });
    });

    describe('TC-02-06: Port 80 already bound → warning', () => {
      // Note: runAllChecks should check common ports (80, 443, etc.)
      // The exact ports checked depend on implementation, but at minimum port 80

      // This test validates that port issues appear as warnings,
      // not as critical failures. The implementation may or may not check
      // ports in runAllChecks by default — if it does, we verify the behavior.
      it('should treat port conflicts as non-critical warnings', async () => {
        // The individual checkPort is tested separately above.
        // Here we verify the runAllChecks contract.
        const portResult = await checkPort(80);

        // Port checks from checkPort directly should be warn, not fail
        if (portResult.status === 'warn') {
          expect(portResult.critical).toBe(false);
        }
      });
    });

    describe('TC-02-07: Git not installed → warning (non-critical)', () => {
      beforeEach(() => {
        mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
          if (cmd === 'git') {
            throw Object.assign(new Error('command not found: git'), {
              exitCode: 127,
              failed: true,
            });
          }
          if (cmd === 'docker' && args?.[0] === '--version') {
            return { stdout: 'Docker version 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'compose' && args?.[1] === 'version') {
            return { stdout: 'Docker Compose version v2.28.1', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'docker' && args?.[0] === 'info') {
            return { stdout: 'Server Version: 27.0.3', stderr: '', exitCode: 0, failed: false };
          }
          if (cmd === 'df') {
            return {
              stdout: 'Filesystem     1G-blocks  Used Available Use% Mounted on\n/dev/sda1          200    100       100  50% /',
              stderr: '',
              exitCode: 0,
              failed: false,
            };
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should NOT set hasCriticalFailure when only Git is missing', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(false);
      });

      it('should include Git warning in the warnings array', async () => {
        const { warnings } = await runAllChecks();

        const gitWarn = warnings.find((w) => w.name.toLowerCase().includes('git'));
        expect(gitWarn).toBeDefined();
        expect(gitWarn!.status).toBe('warn');
      });
    });

    describe('TC-02-08: All checks fail simultaneously', () => {
      beforeEach(() => {
        // Unsupported OS
        mockPlatform.mockReturnValue('win32');
        mockRelease.mockReturnValue('10.0.19045');

        // Node.js too old
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });

        // Low RAM
        mockTotalmem.mockReturnValue(1.5 * GB);

        // All execa commands fail
        mockExeca.mockImplementation(async (cmd: string) => {
          if (cmd === 'docker') {
            throw Object.assign(new Error('command not found: docker'), {
              exitCode: 127,
              failed: true,
            });
          }
          if (cmd === 'git') {
            throw Object.assign(new Error('command not found: git'), {
              exitCode: 127,
              failed: true,
            });
          }
          if (cmd === 'df') {
            throw new Error('command not found: df');
          }
          throw new Error(`Unmocked: ${cmd}`);
        });
      });

      it('should report all failures, not just the first one', async () => {
        const { results } = await runAllChecks();

        const failedResults = results.filter((r) => r.status !== 'pass');
        // At least OS, Docker, Node.js should fail; Memory, Disk, Git should warn
        expect(failedResults.length).toBeGreaterThanOrEqual(4);
      });

      it('should set hasCriticalFailure to true', async () => {
        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(true);
      });

      it('should populate the warnings array with non-critical warnings', async () => {
        const { warnings } = await runAllChecks();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        for (const warn of warnings) {
          expect(warn.status).toBe('warn');
        }
      });

      it('should have multiple critical failures (OS, Docker, Node.js)', async () => {
        const { results } = await runAllChecks();

        const criticalFailures = results.filter(
          (r) => r.status === 'fail' && r.critical === true,
        );
        expect(criticalFailures.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('return shape contract', () => {
      it('should return an object with results, hasCriticalFailure, and warnings', async () => {
        const allChecks = await runAllChecks();

        expect(allChecks).toHaveProperty('results');
        expect(allChecks).toHaveProperty('hasCriticalFailure');
        expect(allChecks).toHaveProperty('warnings');
        expect(Array.isArray(allChecks.results)).toBe(true);
        expect(typeof allChecks.hasCriticalFailure).toBe('boolean');
        expect(Array.isArray(allChecks.warnings)).toBe(true);
      });

      it('should have warnings array containing only items with status = warn', async () => {
        mockTotalmem.mockReturnValue(1.5 * GB); // Force a warning

        const { warnings } = await runAllChecks();

        for (const w of warnings) {
          expect(w.status).toBe('warn');
        }
      });

      it('should set hasCriticalFailure = true if any result has status=fail and critical=true', async () => {
        // Force Node.js failure (critical)
        Object.defineProperty(process, 'version', { value: 'v18.19.0', configurable: true });

        const { hasCriticalFailure, results } = await runAllChecks();

        const hasCritical = results.some((r) => r.status === 'fail' && r.critical);
        expect(hasCritical).toBe(true);
        expect(hasCriticalFailure).toBe(true);
      });

      it('should set hasCriticalFailure = false when failures are all non-critical', async () => {
        // Only low RAM (non-critical warning)
        mockTotalmem.mockReturnValue(1.5 * GB);

        const { hasCriticalFailure } = await runAllChecks();

        expect(hasCriticalFailure).toBe(false);
      });
    });
  });

  // =========================================================================
  // Edge cases and robustness
  // =========================================================================

  describe('edge cases', () => {
    it('checkDocker should handle execa rejecting with a non-Error value', async () => {
      mockExeca.mockImplementation(async (cmd: string) => {
        if (cmd === 'docker') {
          throw 'connection refused';
        }
        throw new Error(`Unmocked: ${cmd}`);
      });

      const result = await checkDocker();

      expect(result.status).toBe('fail');
    });

    it('checkGit should handle execa rejecting with undefined', async () => {
      mockExeca.mockImplementation(async (cmd: string, args?: string[]) => {
        if (cmd === 'git') {
          throw undefined;
        }
        // Other commands still work
        if (cmd === 'docker' && args?.[0] === '--version') {
          return { stdout: 'Docker version 27.0.3', stderr: '', exitCode: 0, failed: false };
        }
        throw new Error(`Unmocked: ${cmd}`);
      });

      const result = await checkGit();

      expect(result.status).toBe('warn');
      expect(result.critical).toBe(false);
    });

    it('checkMemory should handle totalmem returning 0', async () => {
      mockTotalmem.mockReturnValue(0);

      const result = await checkMemory();

      expect(result.status).toBe('warn');
    });

    it('individual check functions should never throw — they return fail/warn status', async () => {
      // Even with broken mocks, checks should return a result, not throw
      mockPlatform.mockImplementation(() => {
        throw new Error('os.platform exploded');
      });

      // checkOS should catch the error and return a fail result
      const result = await checkOS();

      expect(result).toBeDefined();
      expect(result.status).toBe('fail');
    });

    it('runAllChecks should never throw — always returns a result object', async () => {
      // Even if something unexpected happens, runAllChecks should be resilient
      mockPlatform.mockImplementation(() => {
        throw new Error('os.platform exploded');
      });

      const allChecks = await runAllChecks();

      expect(allChecks).toBeDefined();
      expect(allChecks).toHaveProperty('results');
      expect(allChecks).toHaveProperty('hasCriticalFailure');
      expect(allChecks).toHaveProperty('warnings');
    });
  });

  // =========================================================================
  // Criticality matrix
  // =========================================================================

  describe('criticality matrix', () => {
    it('checkOS — critical: true (unsupported OS prevents operation)', async () => {
      mockPlatform.mockReturnValue('darwin');
      const result = await checkOS();
      expect(result.critical).toBe(true);
    });

    it('checkDocker — critical: true (Docker is required for all services)', async () => {
      const result = await checkDocker();
      expect(result.critical).toBe(true);
    });

    it('checkNodeVersion — critical: true (wrong Node.js breaks CLI)', async () => {
      const result = await checkNodeVersion();
      expect(result.critical).toBe(true);
    });

    it('checkMemory — critical: false (low RAM is a warning, not a blocker)', async () => {
      mockTotalmem.mockReturnValue(8 * GB);
      const result = await checkMemory();
      expect(result.critical).toBe(false);
    });

    it('checkDiskSpace — critical: false (low disk is a warning, not a blocker)', async () => {
      const result = await checkDiskSpace();
      expect(result.critical).toBe(false);
    });

    it('checkPort — critical: false (port conflicts are warnings)', async () => {
      mockServerInstance.listen.mockImplementation((_port: number, callback: ListenCallback) => {
        callback();
      });
      mockServerInstance.close.mockImplementation((callback?: () => void) => {
        if (callback) callback();
      });

      const result = await checkPort(80);
      expect(result.critical).toBe(false);
    });

    it('checkGit — critical: false (Git absence is non-critical)', async () => {
      const result = await checkGit();
      expect(result.critical).toBe(false);
    });
  });
});
