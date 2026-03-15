/**
 * Unit tests for the Log Rotation module (T032).
 *
 * Tests: cleanOldCliLogs date filtering, rotateLargeFile copytruncate behavior,
 *        file shifting, runRotation orchestration.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();
const mockStatSync = jest.fn<(path: string) => { size: number }>();
const mockUnlinkSync = jest.fn<(path: string) => void>();
const mockCopyFileSync = jest.fn<(src: string, dst: string) => void>();
const mockRenameSync = jest.fn<(src: string, dst: string) => void>();
const mockTruncateSync = jest.fn<(path: string, len: number) => void>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  unlinkSync: mockUnlinkSync,
  copyFileSync: mockCopyFileSync,
  renameSync: mockRenameSync,
  truncateSync: mockTruncateSync,
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  readFileSync: jest.fn(() => ''),
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/mock-home'),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

const { cleanOldCliLogs, rotateLargeFile, runRotation } = await import(
  '../../../../packages/cli/src/utils/log-rotation.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// cleanOldCliLogs
// ---------------------------------------------------------------------------

describe('cleanOldCliLogs', () => {
  it('should return 0 when directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = cleanOldCliLogs('/nonexistent', 30);
    expect(result).toBe(0);
  });

  it('should delete files older than retention days', () => {
    mockExistsSync.mockReturnValue(true);

    // Create a date 40 days ago
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    // Create today's date
    const todayStr = new Date().toISOString().slice(0, 10);

    mockReaddirSync.mockReturnValue([
      `brewnet-${oldDateStr}.log`,
      `brewnet-${todayStr}.log`,
    ]);

    const result = cleanOldCliLogs('/logs', 30);
    expect(result).toBe(1);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    expect(mockUnlinkSync).toHaveBeenCalledWith(`/logs/brewnet-${oldDateStr}.log`);
  });

  it('should not delete files within retention period', () => {
    mockExistsSync.mockReturnValue(true);

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const recentDateStr = recentDate.toISOString().slice(0, 10);

    mockReaddirSync.mockReturnValue([`brewnet-${recentDateStr}.log`]);

    const result = cleanOldCliLogs('/logs', 30);
    expect(result).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('should ignore non-matching files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['other.log', 'tunnel.log', 'readme.md']);

    const result = cleanOldCliLogs('/logs', 30);
    expect(result).toBe(0);
  });

  it('should handle unlink failures gracefully', () => {
    mockExistsSync.mockReturnValue(true);

    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    mockReaddirSync.mockReturnValue([`brewnet-${oldDateStr}.log`]);
    mockUnlinkSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    // Should not throw
    const result = cleanOldCliLogs('/logs', 30);
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rotateLargeFile
// ---------------------------------------------------------------------------

describe('rotateLargeFile', () => {
  it('should return false when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = rotateLargeFile('/logs/tunnel.log', 50 * 1024 * 1024, 5);
    expect(result).toBe(false);
  });

  it('should return false when file is under size limit', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 1024 });

    const result = rotateLargeFile('/logs/tunnel.log', 50 * 1024 * 1024, 5);
    expect(result).toBe(false);
  });

  it('should rotate file when over size limit', () => {
    // existsSync: true for the file, false for rotated copies
    mockExistsSync.mockImplementation((path: string) => {
      return path === '/logs/tunnel.log';
    });
    mockStatSync.mockReturnValue({ size: 60 * 1024 * 1024 }); // 60MB > 50MB

    const result = rotateLargeFile('/logs/tunnel.log', 50 * 1024 * 1024, 5);
    expect(result).toBe(true);
    expect(mockCopyFileSync).toHaveBeenCalledWith('/logs/tunnel.log', '/logs/tunnel.log.1');
    expect(mockTruncateSync).toHaveBeenCalledWith('/logs/tunnel.log', 0);
  });

  it('should shift existing rotated files', () => {
    mockExistsSync.mockImplementation((path: string) => {
      // File and .1 and .2 exist
      return (
        path === '/logs/tunnel.log' ||
        path === '/logs/tunnel.log.1' ||
        path === '/logs/tunnel.log.2'
      );
    });
    mockStatSync.mockReturnValue({ size: 60 * 1024 * 1024 });

    rotateLargeFile('/logs/tunnel.log', 50 * 1024 * 1024, 5);

    // .2 → .3
    expect(mockRenameSync).toHaveBeenCalledWith('/logs/tunnel.log.2', '/logs/tunnel.log.3');
    // .1 → .2
    expect(mockRenameSync).toHaveBeenCalledWith('/logs/tunnel.log.1', '/logs/tunnel.log.2');
    // copy current → .1
    expect(mockCopyFileSync).toHaveBeenCalledWith('/logs/tunnel.log', '/logs/tunnel.log.1');
    // truncate original
    expect(mockTruncateSync).toHaveBeenCalledWith('/logs/tunnel.log', 0);
  });

  it('should delete oldest file when at max capacity', () => {
    mockExistsSync.mockImplementation((path: string) => {
      // All 5 rotated files exist
      return (
        path === '/logs/f.log' ||
        path === '/logs/f.log.1' ||
        path === '/logs/f.log.2' ||
        path === '/logs/f.log.3' ||
        path === '/logs/f.log.4' ||
        path === '/logs/f.log.5'
      );
    });
    mockStatSync.mockReturnValue({ size: 60 * 1024 * 1024 });

    rotateLargeFile('/logs/f.log', 50 * 1024 * 1024, 5);

    // Oldest (.5) should be deleted
    expect(mockUnlinkSync).toHaveBeenCalledWith('/logs/f.log.5');
  });
});

// ---------------------------------------------------------------------------
// runRotation
// ---------------------------------------------------------------------------

describe('runRotation', () => {
  it('should not throw when directories do not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => runRotation('/logs', '/project')).not.toThrow();
  });

  it('should call cleanOldCliLogs and rotateLargeFile for each source', () => {
    // Make CLI logs dir exist with an old file
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/logs') return true;
      if (path === '/logs/tunnel.log') return true;
      if (path === '/project/logs/access.log') return true;
      return false;
    });
    mockReaddirSync.mockReturnValue([`brewnet-${oldDateStr}.log`]);
    mockStatSync.mockReturnValue({ size: 100 }); // Under limit — no rotation

    runRotation('/logs', '/project');

    // cleanOldCliLogs was called (for CLI logs)
    expect(mockReaddirSync).toHaveBeenCalled();
    // rotateLargeFile was called for tunnel.log and access.log (statSync)
    expect(mockStatSync).toHaveBeenCalled();
  });
});
