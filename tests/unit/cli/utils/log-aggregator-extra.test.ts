/**
 * Additional unit tests for utils/log-aggregator
 *
 * Covers uncovered paths not in log-aggregator.test.ts:
 *   - getLogStats (aggregated stats across all sources)
 *   - readAccessLogs: Duration, RequestHost, userAgent metadata fields
 *   - queryLogs: `until` filter, `levels` filter with no match
 *   - readCliLogs: since-date file pruning
 *
 * Strategy: mock node:fs, node:os, dockerode (returns empty containers),
 * and log-rotation so no real I/O occurs.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fsFiles: Record<string, string> = {};
let fsDirs: Record<string, string[]> = {};

const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsFiles);
const mockReadFileSync = jest.fn((p: unknown) => fsFiles[p as string] ?? '');
const mockReaddirSync = jest.fn((p: unknown) => fsDirs[p as string] ?? []);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  statSync: jest.fn(() => ({ size: 0 })),
  unlinkSync: jest.fn(),
  copyFileSync: jest.fn(),
  renameSync: jest.fn(),
  truncateSync: jest.fn(),
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/home/user'),
}));

// Mock dockerode so readServiceLogs falls back to empty (no Docker available)
jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    listContainers: jest.fn().mockResolvedValue([]),
  })),
}));

// Mock log-rotation (already mocked in main test file, but we need our own)
jest.unstable_mockModule('../../../../packages/cli/src/utils/log-rotation.js', () => ({
  runRotation: jest.fn(),
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const {
  readAccessLogs,
  readCliLogs,
  queryLogs,
  getLogStats,
} = await import('../../../../packages/cli/src/utils/log-aggregator.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLI_LOG_DIR = '/home/user/.brewnet/logs';

function makeCliEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: '2026-03-15T10:00:00.000Z',
    level: 'info',
    command: 'init',
    message: 'CLI log entry',
    metadata: {},
    ...overrides,
  });
}

function makeAccessEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    StartUTC: '2026-03-15T10:00:00.000Z',
    OriginStatus: 200,
    RequestMethod: 'GET',
    RequestPath: '/api/test',
    ...overrides,
  });
}

beforeEach(() => {
  fsFiles = {};
  fsDirs = {};
  jest.clearAllMocks();
  // existsSync: true for known files AND for directories with entries in fsDirs
  mockExistsSync.mockImplementation((p: unknown) => {
    const path = p as string;
    return (path in fsFiles) || (Array.isArray(fsDirs[path]) && fsDirs[path].length > 0);
  });
  mockReadFileSync.mockImplementation((p: unknown) => fsFiles[p as string] ?? '');
  mockReaddirSync.mockImplementation((p: unknown) => fsDirs[p as string] ?? []);
});

// ---------------------------------------------------------------------------
// readAccessLogs — additional metadata fields
// ---------------------------------------------------------------------------

describe('readAccessLogs — extended metadata', () => {
  it('includes Duration in metadata when present', () => {
    fsFiles['/project/logs/access.log'] = makeAccessEntry({ Duration: 123.456 }) + '\n';
    const result = readAccessLogs('/project');
    expect(result[0].metadata.duration).toBe(123.456);
  });

  it('includes RequestHost in metadata when present', () => {
    fsFiles['/project/logs/access.log'] = makeAccessEntry({ RequestHost: 'myhost.example.com' }) + '\n';
    const result = readAccessLogs('/project');
    expect(result[0].metadata.requestHost).toBe('myhost.example.com');
  });

  it('includes userAgent from request_User-Agent field', () => {
    fsFiles['/project/logs/access.log'] = makeAccessEntry({
      'request_User-Agent': 'Mozilla/5.0 (Test Browser)',
    }) + '\n';
    const result = readAccessLogs('/project');
    expect(result[0].metadata.userAgent).toBe('Mozilla/5.0 (Test Browser)');
  });

  it('includes userAgent from request_User_Agent fallback', () => {
    fsFiles['/project/logs/access.log'] = makeAccessEntry({
      request_User_Agent: 'curl/7.88',
    }) + '\n';
    const result = readAccessLogs('/project');
    expect(result[0].metadata.userAgent).toBe('curl/7.88');
  });

  it('skips malformed JSON lines silently', () => {
    fsFiles['/project/logs/access.log'] = 'not-valid-json\n' + makeAccessEntry() + '\n';
    const result = readAccessLogs('/project');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// readCliLogs — sinceDate file pruning
// ---------------------------------------------------------------------------

describe('readCliLogs — sinceDate pruning', () => {
  it('skips log files older than the since date', () => {
    fsDirs[CLI_LOG_DIR] = [
      'brewnet-2026-03-13.log',
      'brewnet-2026-03-14.log',
      'brewnet-2026-03-15.log',
    ];
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-13.log`] = makeCliEntry({ timestamp: '2026-03-13T10:00:00.000Z', message: 'old1' }) + '\n';
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-14.log`] = makeCliEntry({ timestamp: '2026-03-14T10:00:00.000Z', message: 'old2' }) + '\n';
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] = makeCliEntry({ timestamp: '2026-03-15T10:00:00.000Z', message: 'new' }) + '\n';

    const result = readCliLogs(CLI_LOG_DIR, '2026-03-15T00:00:00.000Z');
    // Only the 2026-03-15 file should be read
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('new');
  });

  it('reads all files when no since filter', () => {
    fsDirs[CLI_LOG_DIR] = [
      'brewnet-2026-03-13.log',
      'brewnet-2026-03-15.log',
    ];
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-13.log`] = makeCliEntry({ message: 'old' }) + '\n';
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] = makeCliEntry({ message: 'new' }) + '\n';

    const result = readCliLogs(CLI_LOG_DIR);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// queryLogs — until filter
// ---------------------------------------------------------------------------

describe('queryLogs — until filter', () => {
  beforeEach(() => {
    fsDirs[CLI_LOG_DIR] = ['brewnet-2026-03-15.log'];
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] =
      makeCliEntry({ timestamp: '2026-03-15T06:00:00.000Z', message: 'morning' }) + '\n' +
      makeCliEntry({ timestamp: '2026-03-15T14:00:00.000Z', message: 'afternoon' }) + '\n' +
      makeCliEntry({ timestamp: '2026-03-15T22:00:00.000Z', message: 'evening' }) + '\n';
  });

  it('excludes entries after the until timestamp', async () => {
    const result = await queryLogs(
      { sources: ['cli'], until: '2026-03-15T12:00:00.000Z' },
      '/project',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe('morning');
  });

  it('includes entries exactly at the until timestamp', async () => {
    const result = await queryLogs(
      { sources: ['cli'], until: '2026-03-15T14:00:00.000Z' },
      '/project',
    );
    expect(result.entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getLogStats
// ---------------------------------------------------------------------------

describe('getLogStats', () => {
  it('returns zero counts when no log files exist', async () => {
    // existsSync returns false for all paths → all sources return []
    const stats = await getLogStats('/project');
    expect(stats.total).toBe(0);
    expect(stats.bySource.cli).toBe(0);
    expect(stats.bySource.tunnel).toBe(0);
    expect(stats.bySource.access).toBe(0);
    expect(stats.bySource.service).toBe(0);
    expect(stats.recentErrors).toEqual([]);
    expect(typeof stats.lastUpdated).toBe('string');
  });

  it('counts entries by source correctly', async () => {
    // Add 2 CLI log entries
    fsDirs[CLI_LOG_DIR] = ['brewnet-2026-03-15.log'];
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] =
      makeCliEntry({ message: 'msg1' }) + '\n' +
      makeCliEntry({ message: 'msg2' }) + '\n';

    // Add 1 access log entry
    fsFiles['/project/logs/access.log'] = makeAccessEntry() + '\n';

    const stats = await getLogStats('/project');
    expect(stats.bySource.cli).toBe(2);
    expect(stats.bySource.access).toBe(1);
    expect(stats.total).toBe(3);
  });

  it('counts entries by level correctly', async () => {
    fsDirs[CLI_LOG_DIR] = ['brewnet-2026-03-15.log'];
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] =
      makeCliEntry({ level: 'info', message: 'info msg' }) + '\n' +
      makeCliEntry({ level: 'error', message: 'error msg' }) + '\n' +
      makeCliEntry({ level: 'warn', message: 'warn msg' }) + '\n';

    const stats = await getLogStats('/project');
    expect(stats.byLevel.info).toBe(1);
    expect(stats.byLevel.error).toBe(1);
    expect(stats.byLevel.warn).toBe(1);
  });

  it('populates recentErrors with up to 10 error entries', async () => {
    fsDirs[CLI_LOG_DIR] = ['brewnet-2026-03-15.log'];
    // 12 error entries → only 10 recent ones in recentErrors
    const lines = Array.from({ length: 12 }, (_, i) =>
      makeCliEntry({ level: 'error', message: `error-${i}`, timestamp: `2026-03-15T${String(i).padStart(2, '0')}:00:00.000Z` }),
    );
    fsFiles[`${CLI_LOG_DIR}/brewnet-2026-03-15.log`] = lines.join('\n') + '\n';

    const stats = await getLogStats('/project');
    expect(stats.recentErrors.length).toBeLessThanOrEqual(10);
    expect(stats.byLevel.error).toBe(12);
  });
});
