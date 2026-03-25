/**
 * Unit tests for log-aggregator readServiceLogs + queryLogs service source.
 *
 * Covers: readServiceLogs container loop (L254-313), string fallback (L289),
 *         opts.tail/since (L265-267), queryLogs service source (L362),
 *         queryLogs services filter (L383).
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

jest.unstable_mockModule('../../../../packages/cli/src/utils/log-rotation.js', () => ({
  runRotation: jest.fn(),
}));

// Dockerode mock — exposed so individual tests can configure per-container behavior
const mockContainerLogs = jest.fn<() => Promise<Buffer>>();
const mockGetContainer = jest.fn().mockReturnValue({ logs: mockContainerLogs });
const mockListContainers = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    listContainers: mockListContainers,
    getContainer: mockGetContainer,
  })),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

const { readServiceLogs, queryLogs } = await import(
  '../../../../packages/cli/src/utils/log-aggregator.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Docker multiplexed log buffer:
 * [stream_type(1), 0, 0, 0, payload_size(4 big-endian)] + payload
 */
function makeDockerLogBuffer(lines: string[], stream = 1): Buffer {
  const text = lines.join('\n') + '\n';
  const payload = Buffer.from(text, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt8(stream, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

beforeEach(() => {
  fsFiles = {};
  fsDirs = {};
  jest.clearAllMocks(); // clears calls/results (not implementation queues)
  // Explicitly reset mocks that may have leftover queued implementations
  mockContainerLogs.mockReset();
  mockListContainers.mockReset();
  // Re-wire after reset
  mockGetContainer.mockReturnValue({ logs: mockContainerLogs });
  mockListContainers.mockResolvedValue([]);
  mockContainerLogs.mockResolvedValue(Buffer.alloc(0));
});

// ---------------------------------------------------------------------------
// readServiceLogs — matching container with Buffer logs
// ---------------------------------------------------------------------------

describe('readServiceLogs — container log parsing', () => {
  it('returns log entries from a container matching the project name', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['2026-03-15T10:00:00Z Hello world']),
    );

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('Hello world');
    expect(entries[0]!.source).toBe('service');
    expect(entries[0]!.level).toBe('info');
    expect(entries[0]!.service).toBe('app');
  });

  it('uses stderr stream type to set level=error', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-db-1'] },
    ]);
    // stream=2 → stderr → error
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['2026-03-15T10:00:00Z Error occurred'], 2),
    );

    const entries = await readServiceLogs('/project');
    expect(entries[0]!.level).toBe('error');
  });

  it('skips containers whose name does not start with project name', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'xyz789xyz789xyz7', Names: ['/other-app-1'] },
    ]);
    // No log setup needed — logs() won't be called for non-matching containers

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(0);
  });

  it('skips log lines without a timestamp match', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['no-timestamp-here no-match']),
    );

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(0);
  });

  it('filters entries before opts.since', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer([
        '2026-03-15T06:00:00Z Morning',
        '2026-03-15T18:00:00Z Evening',
      ]),
    );

    const entries = await readServiceLogs('/project', { since: '2026-03-15T12:00:00Z' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('Evening');
  });

  it('passes tail option to container.logs', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(Buffer.alloc(0));

    await readServiceLogs('/project', { tail: 50 });
    const logCallArgs = mockContainerLogs.mock.calls[0]![0] as Record<string, unknown>;
    expect(logCallArgs.tail).toBe(50);
  });

  it('handles string fallback when logs() returns a non-Buffer', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    // Return a string instead of Buffer (fallback path L289)
    mockContainerLogs.mockResolvedValueOnce(
      '2026-03-15T10:00:00Z String log line' as unknown as Buffer,
    );

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('String log line');
  });

  it('uses container Id prefix when Names is not provided', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'project1234567890', Names: undefined },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['2026-03-15T10:00:00Z Id-based container']),
    );

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(1);
  });

  it('normalizes timestamp without trailing Z', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['2026-03-15T10:00:00 No-Z timestamp']),
    );

    const entries = await readServiceLogs('/project');
    expect(entries[0]!.timestamp).toBe('2026-03-15T10:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// queryLogs — service source + services filter
// ---------------------------------------------------------------------------

describe('queryLogs — service source', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('calls readServiceLogs when sources includes service', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockResolvedValueOnce(
      makeDockerLogBuffer(['2026-03-15T10:00:00Z Service entry']),
    );

    const result = await queryLogs({ sources: ['service'] }, '/project');
    expect(result.entries.some((e) => e.source === 'service')).toBe(true);
  });

  it('filters entries by services array', async () => {
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
      { Id: 'def456def456def4', Names: ['/project-db-1'] },
    ]);
    mockContainerLogs
      .mockResolvedValueOnce(makeDockerLogBuffer(['2026-03-15T10:00:00Z App log']))
      .mockResolvedValueOnce(makeDockerLogBuffer(['2026-03-15T10:00:00Z DB log']));

    const result = await queryLogs({ sources: ['service'], services: ['app'] }, '/project');
    // Only 'app' entries should be included
    expect(result.entries.every((e) => e.service === 'app')).toBe(true);
  });

  // ── Error paths (L324, L329) ─────────────────────────────────────────────

  it('warns and returns empty when container.logs() throws (L324)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockListContainers.mockResolvedValueOnce([
      { Id: 'abc123abc123abc1', Names: ['/project-app-1'] },
    ]);
    mockContainerLogs.mockRejectedValueOnce(new Error('container stopped'));

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[log-aggregator]'),
      expect.stringContaining('app'),
      expect.any(Error),
    );
  });

  it('warns and returns empty when docker.listContainers() throws (L329)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockListContainers.mockRejectedValueOnce(new Error('Docker not running'));

    const entries = await readServiceLogs('/project');
    expect(entries).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[log-aggregator]'),
      expect.any(Error),
    );
  });
});
