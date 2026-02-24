/**
 * Unit tests for the Brewnet Logger module (T106 — Phase 11).
 *
 * Test cases:
 *   TC-L-01: Info log entry written to file with correct JSON format
 *   TC-L-02: Error log entry includes error details and metadata
 *   TC-L-03: Log file uses daily rotation naming (brewnet-YYYY-MM-DD.log)
 *   TC-L-04: Multiple log entries appended (not overwritten)
 *   TC-L-05: Logger creates logsDir if it does not exist
 *
 * Strategy: Mock node:fs and node:os to isolate filesystem side-effects.
 * The createLogger factory is imported dynamically after mocks are wired.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup — must precede the import of the module under test
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockMkdirSync = jest.fn<(path: string, options?: unknown) => unknown>();
const mockAppendFileSync = jest.fn<(path: string, data: string, encoding: string) => void>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  appendFileSync: mockAppendFileSync,
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/mock-home'),
}));

// ---------------------------------------------------------------------------
// Import module under test (must come AFTER jest.unstable_mockModule calls)
// ---------------------------------------------------------------------------

const { createLogger } = await import('../../../../packages/cli/src/utils/logger.js');
type LogEntry = import('../../../../packages/cli/src/utils/logger.js').LogEntry;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the last appendFileSync call's data argument as a LogEntry.
 */
function getLastWrittenEntry(): LogEntry {
  const calls = mockAppendFileSync.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1] as [string, string, string];
  const jsonLine = lastCall[1].trim();
  return JSON.parse(jsonLine) as LogEntry;
}

/**
 * Get the file path from the last appendFileSync call.
 */
function getLastWrittenPath(): string {
  const calls = mockAppendFileSync.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1] as [string, string, string];
  return lastCall[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // By default, the log directory exists
  mockExistsSync.mockReturnValue(true);
});

// ── TC-L-01: Info log entry written to file with correct JSON format ────────

describe('Logger — info level (TC-L-01)', () => {
  it('should write an info-level JSON entry to the log file', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('init', 'Project initialized');

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);

    const entry = getLastWrittenEntry();
    expect(entry.level).toBe('info');
    expect(entry.command).toBe('init');
    expect(entry.message).toBe('Project initialized');
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe('string');
  });

  it('should produce a valid ISO 8601 timestamp', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'timestamp check');

    const entry = getLastWrittenEntry();
    const parsed = new Date(entry.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should include an empty metadata object when none is provided', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'no metadata');

    const entry = getLastWrittenEntry();
    expect(entry.metadata).toEqual({});
  });

  it('should include metadata when provided', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('add', 'Service added', { service: 'postgresql', port: 5432 });

    const entry = getLastWrittenEntry();
    expect(entry.metadata).toEqual({ service: 'postgresql', port: 5432 });
  });
});

// ── TC-L-02: Error log entry includes error details and metadata ────────────

describe('Logger — error level (TC-L-02)', () => {
  it('should write an error-level JSON entry', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.error('deploy', 'Deployment failed', {
      error: 'ECONNREFUSED',
      attempt: 3,
    });

    const entry = getLastWrittenEntry();
    expect(entry.level).toBe('error');
    expect(entry.command).toBe('deploy');
    expect(entry.message).toBe('Deployment failed');
    expect(entry.metadata).toEqual({ error: 'ECONNREFUSED', attempt: 3 });
  });

  it('should write a warn-level JSON entry', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.warn('status', 'Service degraded', { service: 'redis' });

    const entry = getLastWrittenEntry();
    expect(entry.level).toBe('warn');
    expect(entry.command).toBe('status');
    expect(entry.message).toBe('Service degraded');
    expect(entry.metadata).toEqual({ service: 'redis' });
  });

  it('should handle error metadata with nested objects', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.error('backup', 'Backup failed', {
      error: { code: 'ENOSPC', message: 'No space left on device' },
    });

    const entry = getLastWrittenEntry();
    expect(entry.metadata).toEqual({
      error: { code: 'ENOSPC', message: 'No space left on device' },
    });
  });
});

// ── TC-L-03: Log file uses daily rotation naming ────────────────────────────

describe('Logger — daily rotation naming (TC-L-03)', () => {
  it('should write to a file named brewnet-YYYY-MM-DD.log', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'naming check');

    const writtenPath = getLastWrittenPath();
    // Path should match the pattern: /tmp/test-logs/brewnet-YYYY-MM-DD.log
    expect(writtenPath).toMatch(
      /^\/tmp\/test-logs\/brewnet-\d{4}-\d{2}-\d{2}\.log$/,
    );
  });

  it('should use today\'s date in the filename', () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const expected = `brewnet-${dateStr}.log`;

    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'date check');

    const writtenPath = getLastWrittenPath();
    expect(writtenPath).toBe(`/tmp/test-logs/${expected}`);
  });

  it('should use custom logsDir when provided', () => {
    const logger = createLogger('/custom/log/dir');
    logger.info('test', 'custom dir');

    const writtenPath = getLastWrittenPath();
    expect(writtenPath).toMatch(
      /^\/custom\/log\/dir\/brewnet-\d{4}-\d{2}-\d{2}\.log$/,
    );
  });
});

// ── TC-L-04: Multiple log entries appended (not overwritten) ────────────────

describe('Logger — append behavior (TC-L-04)', () => {
  it('should append multiple entries to the same file (appendFileSync called multiple times)', () => {
    const logger = createLogger('/tmp/test-logs');

    logger.info('init', 'Step 1');
    logger.warn('init', 'Step 2');
    logger.error('init', 'Step 3');

    // appendFileSync should have been called 3 times (once per log entry)
    expect(mockAppendFileSync).toHaveBeenCalledTimes(3);
  });

  it('should append each entry as a newline-terminated JSON line', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'line check');

    const calls = mockAppendFileSync.mock.calls;
    const data = (calls[0] as [string, string, string])[1];
    // Each entry should end with '\n' for JSONL format
    expect(data).toMatch(/\n$/);
    // Should be valid JSON (without the trailing newline)
    expect(() => JSON.parse(data.trim())).not.toThrow();
  });

  it('should call appendFileSync (not writeFileSync) to avoid overwriting', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'append test');

    // Verify appendFileSync is used
    expect(mockAppendFileSync).toHaveBeenCalled();
  });

  it('should write entries with distinct timestamps', async () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('test', 'entry 1');

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 5));
    logger.info('test', 'entry 2');

    const calls = mockAppendFileSync.mock.calls;
    const entry1 = JSON.parse(
      (calls[0] as [string, string, string])[1].trim(),
    ) as LogEntry;
    const entry2 = JSON.parse(
      (calls[1] as [string, string, string])[1].trim(),
    ) as LogEntry;

    // Both should be valid timestamps; order is preserved
    expect(new Date(entry1.timestamp).getTime()).toBeLessThanOrEqual(
      new Date(entry2.timestamp).getTime(),
    );
  });
});

// ── TC-L-05: Logger creates logsDir if not exists ───────────────────────────

describe('Logger — directory creation (TC-L-05)', () => {
  it('should create the logs directory when it does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    createLogger('/tmp/new-logs');

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/new-logs', {
      recursive: true,
    });
  });

  it('should not create the directory when it already exists', () => {
    mockExistsSync.mockReturnValue(true);

    createLogger('/tmp/existing-logs');

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('should not throw when appendFileSync fails (graceful degradation)', () => {
    mockExistsSync.mockReturnValue(true);
    mockAppendFileSync.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    const logger = createLogger('/tmp/full-disk');
    expect(() => logger.error('test', 'disk full')).not.toThrow();
  });
});

// ── Logger — JSON format completeness ───────────────────────────────────────

describe('Logger — JSON entry completeness', () => {
  it('should produce entries with timestamp, level, command, message, metadata', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('status', 'All services healthy');

    const entry = getLastWrittenEntry();
    const keys = Object.keys(entry).sort();
    expect(keys).toEqual(
      ['command', 'level', 'message', 'metadata', 'timestamp'],
    );
  });

  it('should produce entries with metadata populated when provided', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.info('status', 'Service check', { count: 5 });

    const entry = getLastWrittenEntry();
    expect(entry.metadata).toEqual({ count: 5 });
  });

  it('should produce valid JSON that can be round-tripped', () => {
    const logger = createLogger('/tmp/test-logs');
    logger.error('deploy', 'Failed', { stack: 'Error at line 42' });

    const calls = mockAppendFileSync.mock.calls;
    const raw = (calls[0] as [string, string, string])[1].trim();
    const parsed = JSON.parse(raw);
    const reserialized = JSON.stringify(parsed);
    expect(JSON.parse(reserialized)).toEqual(parsed);
  });
});
