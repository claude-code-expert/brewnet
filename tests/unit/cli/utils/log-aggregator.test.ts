/**
 * Unit tests for the Log Aggregator module (T020).
 *
 * Tests: parseDuration, readCliLogs, readTunnelLogs, readAccessLogs,
 *        queryLogs filter/sort/paginate.
 *
 * Strategy: Mock node:fs to provide fixture data. Docker (readServiceLogs)
 * is excluded from unit tests as it requires a running Docker daemon.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string, encoding: string) => string>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();

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
  homedir: jest.fn(() => '/mock-home'),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

const {
  parseDuration,
  readCliLogs,
  readTunnelLogs,
  readAccessLogs,
  queryLogs,
} = await import('../../../../packages/cli/src/utils/log-aggregator.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe('parseDuration', () => {
  it('should parse hours (e.g., "1h")', () => {
    const result = parseDuration('1h');
    const diff = Date.now() - new Date(result).getTime();
    // Should be approximately 1 hour (3600000ms), within 1 second tolerance
    expect(diff).toBeGreaterThan(3599000);
    expect(diff).toBeLessThan(3601000);
  });

  it('should parse minutes (e.g., "30m")', () => {
    const result = parseDuration('30m');
    const diff = Date.now() - new Date(result).getTime();
    expect(diff).toBeGreaterThan(1799000);
    expect(diff).toBeLessThan(1801000);
  });

  it('should parse days (e.g., "7d")', () => {
    const result = parseDuration('7d');
    const diff = Date.now() - new Date(result).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(diff).toBeGreaterThan(sevenDaysMs - 1000);
    expect(diff).toBeLessThan(sevenDaysMs + 1000);
  });

  it('should parse ISO date strings', () => {
    const result = parseDuration('2026-03-15');
    expect(result).toBe(new Date('2026-03-15').toISOString());
  });

  it('should parse ISO datetime strings', () => {
    const result = parseDuration('2026-03-15T10:00:00Z');
    expect(result).toBe('2026-03-15T10:00:00.000Z');
  });

  it('should throw for invalid formats', () => {
    expect(() => parseDuration('xyz')).toThrow("Invalid time format: 'xyz'");
  });

  it('should throw for empty string', () => {
    expect(() => parseDuration('')).toThrow('Invalid time format');
  });
});

// ---------------------------------------------------------------------------
// readCliLogs
// ---------------------------------------------------------------------------

describe('readCliLogs', () => {
  it('should return empty array when directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = readCliLogs('/nonexistent');
    expect(result).toEqual([]);
  });

  it('should parse JSONL entries from brewnet-*.log files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['brewnet-2026-03-15.log']);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-15T10:00:00.000Z',
        level: 'info',
        command: 'init',
        message: 'Wizard started',
        metadata: {},
      }) + '\n',
    );

    const result = readCliLogs('/mock-home/.brewnet/logs');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      timestamp: '2026-03-15T10:00:00.000Z',
      source: 'cli',
      level: 'info',
      message: 'Wizard started',
      metadata: { command: 'init' },
    });
  });

  it('should filter by since timestamp', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['brewnet-2026-03-14.log', 'brewnet-2026-03-15.log']);

    const oldEntry = JSON.stringify({
      timestamp: '2026-03-14T08:00:00.000Z',
      level: 'info',
      command: 'status',
      message: 'Old entry',
      metadata: {},
    });
    const newEntry = JSON.stringify({
      timestamp: '2026-03-15T10:00:00.000Z',
      level: 'warn',
      command: 'up',
      message: 'New entry',
      metadata: {},
    });

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('2026-03-14')) return oldEntry + '\n';
      return newEntry + '\n';
    });

    const result = readCliLogs('/logs', '2026-03-15T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('New entry');
  });

  it('should skip malformed JSONL lines', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['brewnet-2026-03-15.log']);
    mockReadFileSync.mockReturnValue(
      'not json\n' +
        JSON.stringify({
          timestamp: '2026-03-15T10:00:00.000Z',
          level: 'info',
          command: 'test',
          message: 'Valid',
          metadata: {},
        }) +
        '\n',
    );

    const result = readCliLogs('/logs');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Valid');
  });

  it('should ignore non-matching files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['other.log', 'brewnet-2026-03-15.log', 'readme.md']);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-15T10:00:00.000Z',
        level: 'info',
        command: 'test',
        message: 'Entry',
        metadata: {},
      }) + '\n',
    );

    const result = readCliLogs('/logs');
    expect(result).toHaveLength(1);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('should move command field to metadata', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['brewnet-2026-03-15.log']);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-15T10:00:00.000Z',
        level: 'info',
        command: 'deploy',
        message: 'Deployed',
        metadata: { service: 'web' },
      }) + '\n',
    );

    const result = readCliLogs('/logs');
    expect(result[0].metadata).toEqual({ command: 'deploy', service: 'web' });
  });
});

// ---------------------------------------------------------------------------
// readTunnelLogs
// ---------------------------------------------------------------------------

describe('readTunnelLogs', () => {
  it('should return empty array when tunnel.log does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = readTunnelLogs('/logs');
    expect(result).toEqual([]);
  });

  it('should parse NDJSON tunnel events', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-15T10:00:00.000Z',
        event: 'CREATE',
        tunnelMode: 'quick',
        domain: 'myapp.trycloudflare.com',
        detail: 'Tunnel created',
      }) + '\n',
    );

    const result = readTunnelLogs('/logs');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      timestamp: '2026-03-15T10:00:00.000Z',
      source: 'tunnel',
      level: 'info',
      service: 'myapp.trycloudflare.com',
      message: 'Tunnel created',
      metadata: { event: 'CREATE', tunnelMode: 'quick' },
    });
  });

  it('should set level to error when error field is present', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-15T10:00:00.000Z',
        event: 'STATUS_CHANGE',
        tunnelMode: 'named',
        tunnelId: 'abc-123',
        detail: 'Connection lost',
        error: 'ECONNRESET',
      }) + '\n',
    );

    const result = readTunnelLogs('/logs');
    expect(result[0].level).toBe('error');
    expect(result[0].metadata.tunnelId).toBe('abc-123');
  });

  it('should filter by since timestamp', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        timestamp: '2026-03-14T08:00:00.000Z',
        event: 'CREATE',
        tunnelMode: 'quick',
        detail: 'Old event',
      }) +
        '\n' +
        JSON.stringify({
          timestamp: '2026-03-15T10:00:00.000Z',
          event: 'RESTART',
          tunnelMode: 'quick',
          detail: 'New event',
        }) +
        '\n',
    );

    const result = readTunnelLogs('/logs', '2026-03-15T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('New event');
  });
});

// ---------------------------------------------------------------------------
// readAccessLogs
// ---------------------------------------------------------------------------

describe('readAccessLogs', () => {
  it('should return empty array when access.log does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = readAccessLogs('/project');
    expect(result).toEqual([]);
  });

  it('should parse Traefik JSON access log entries', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        StartUTC: '2026-03-15T10:00:00.000Z',
        OriginStatus: 200,
        ServiceName: 'gitea@docker',
        RequestMethod: 'GET',
        RequestPath: '/api/repos',
        RouterName: 'gitea-router',
        ClientAddr: '192.168.1.1',
      }) + '\n',
    );

    const result = readAccessLogs('/project');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      timestamp: '2026-03-15T10:00:00.000Z',
      source: 'access',
      level: 'info',
      service: 'gitea',
      message: 'GET /api/repos → 200',
      metadata: {
        routerName: 'gitea-router',
        clientAddr: '192.168.1.1',
      },
    });
  });

  it('should map status >= 500 to error level', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        StartUTC: '2026-03-15T10:00:00.000Z',
        OriginStatus: 503,
        RequestMethod: 'GET',
        RequestPath: '/health',
      }) + '\n',
    );

    const result = readAccessLogs('/project');
    expect(result[0].level).toBe('error');
  });

  it('should map status >= 400 to warn level', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        StartUTC: '2026-03-15T10:00:00.000Z',
        OriginStatus: 404,
        RequestMethod: 'GET',
        RequestPath: '/missing',
      }) + '\n',
    );

    const result = readAccessLogs('/project');
    expect(result[0].level).toBe('warn');
  });

  it('should strip @provider suffix from service name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        StartUTC: '2026-03-15T10:00:00.000Z',
        OriginStatus: 200,
        ServiceName: 'nextcloud@docker',
        RequestMethod: 'GET',
        RequestPath: '/',
      }) + '\n',
    );

    const result = readAccessLogs('/project');
    expect(result[0].service).toBe('nextcloud');
  });

  it('should filter by since timestamp', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        StartUTC: '2026-03-14T08:00:00.000Z',
        OriginStatus: 200,
        RequestMethod: 'GET',
        RequestPath: '/old',
      }) +
        '\n' +
        JSON.stringify({
          StartUTC: '2026-03-15T10:00:00.000Z',
          OriginStatus: 200,
          RequestMethod: 'GET',
          RequestPath: '/new',
        }) +
        '\n',
    );

    const result = readAccessLogs('/project', '2026-03-15T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('/new');
  });
});

// ---------------------------------------------------------------------------
// queryLogs — filter, sort, paginate
// ---------------------------------------------------------------------------

describe('queryLogs', () => {
  // Set up mock data for all three file-based sources
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);

    // CLI logs
    mockReaddirSync.mockReturnValue(['brewnet-2026-03-15.log']);

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('brewnet-2026-03-15.log')) {
        return (
          JSON.stringify({
            timestamp: '2026-03-15T10:00:01.000Z',
            level: 'info',
            command: 'init',
            message: 'CLI log entry',
            metadata: {},
          }) + '\n'
        );
      }
      if (path.includes('tunnel.log')) {
        return (
          JSON.stringify({
            timestamp: '2026-03-15T10:00:02.000Z',
            event: 'CREATE',
            tunnelMode: 'quick',
            detail: 'Tunnel event',
          }) + '\n'
        );
      }
      if (path.includes('access.log')) {
        return (
          JSON.stringify({
            StartUTC: '2026-03-15T10:00:03.000Z',
            OriginStatus: 200,
            ServiceName: 'gitea@docker',
            RequestMethod: 'GET',
            RequestPath: '/api/repos',
          }) + '\n'
        );
      }
      return '';
    });
  });

  it('should merge entries from multiple sources', async () => {
    const result = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'] },
      '/project',
    );
    expect(result.entries).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('should sort entries by timestamp descending', async () => {
    const result = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'] },
      '/project',
    );
    const timestamps = result.entries.map((e) => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  it('should filter by source', async () => {
    const result = await queryLogs({ sources: ['cli'] }, '/project');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].source).toBe('cli');
  });

  it('should filter by level', async () => {
    // Add an error-level entry
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('brewnet-2026-03-15.log')) {
        return (
          JSON.stringify({
            timestamp: '2026-03-15T10:00:01.000Z',
            level: 'error',
            command: 'up',
            message: 'Service failed',
            metadata: {},
          }) +
          '\n' +
          JSON.stringify({
            timestamp: '2026-03-15T10:00:00.000Z',
            level: 'info',
            command: 'init',
            message: 'Started',
            metadata: {},
          }) +
          '\n'
        );
      }
      if (path.includes('tunnel.log')) return '';
      if (path.includes('access.log')) return '';
      return '';
    });

    const result = await queryLogs(
      { sources: ['cli'], levels: ['error'] },
      '/project',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].level).toBe('error');
  });

  it('should filter by service name', async () => {
    const result = await queryLogs(
      { sources: ['access'], services: ['gitea'] },
      '/project',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].service).toBe('gitea');
  });

  it('should filter by text search in message', async () => {
    const result = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'], search: 'CLI' },
      '/project',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toContain('CLI');
  });

  it('should paginate results with limit and offset', async () => {
    const result = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'], limit: 2, offset: 0 },
      '/project',
    );
    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);

    const page2 = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'], limit: 2, offset: 2 },
      '/project',
    );
    expect(page2.entries).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it('should cap limit at LOG_QUERY_MAX_LIMIT', async () => {
    const result = await queryLogs(
      { sources: ['cli'], limit: 9999 },
      '/project',
    );
    // Should not throw and should return available entries
    expect(result.entries.length).toBeLessThanOrEqual(1000);
  });

  it('should return empty result when no sources match', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await queryLogs(
      { sources: ['cli', 'tunnel', 'access'] },
      '/project',
    );
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});
