/**
 * Unit tests for TunnelLogger — T035
 *
 * Verifies:
 *   - Events written as valid NDJSON lines
 *   - apiToken never present in any written field
 *   - tunnelToken never present in any written field
 *   - Log file and parent directories created if missing
 *   - Multiple events append correctly (each as a separate JSON line)
 *
 * Mock strategy: node:fs and node:os are mocked via jest.unstable_mockModule
 * so tests never touch the real filesystem.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { TunnelLogEvent } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Mock node:os — called at module level to build log path constants
// ---------------------------------------------------------------------------

jest.unstable_mockModule('node:os', () => ({
  default: {
    homedir: jest.fn(() => '/home/testuser'),
    tmpdir: jest.fn(() => '/tmp'),
  },
  homedir: jest.fn(() => '/home/testuser'),
  tmpdir: jest.fn(() => '/tmp'),
}));

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------

const mockMkdirSync = jest.fn();
const mockAppendFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn<() => boolean>().mockReturnValue(false);

jest.unstable_mockModule('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    appendFileSync: mockAppendFileSync,
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
  },
  mkdirSync: mockMkdirSync,
  appendFileSync: mockAppendFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mock setup)
// ---------------------------------------------------------------------------

const { logTunnelEvent, TunnelLogger } = await import(
  '../../../../packages/cli/src/utils/tunnel-logger.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TunnelLogEvent> = {}): TunnelLogEvent {
  return {
    timestamp: '2025-06-15T10:00:00.000Z',
    event: 'CREATE',
    tunnelMode: 'named',
    tunnelId: 'tunnel-abc-123',
    tunnelName: 'my-homeserver',
    domain: 'example.com',
    detail: 'Named tunnel created',
    ...overrides,
  };
}

/** Extract what was passed to appendFileSync */
function getWrittenLines(): string[] {
  return (mockAppendFileSync as jest.Mock).mock.calls.map(
    (call) => (call as [string, string, string])[1],
  );
}

// ---------------------------------------------------------------------------
// logTunnelEvent tests
// ---------------------------------------------------------------------------

describe('logTunnelEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the log directory with mkdirSync (recursive)', () => {
    logTunnelEvent(makeEvent());

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brewnet'),
      { recursive: true },
    );
  });

  it('writes a valid JSON line to the log file', () => {
    const event = makeEvent({ detail: 'write-test-detail' });
    logTunnelEvent(event);

    const lines = getWrittenLines();
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.detail).toBe('write-test-detail');
    expect(parsed.event).toBe('CREATE');
    expect(parsed.tunnelMode).toBe('named');
  });

  it('written line ends with a newline character', () => {
    logTunnelEvent(makeEvent());

    const lines = getWrittenLines();
    expect(lines[0]).toMatch(/\n$/);
  });

  it('written line is valid JSON (no extra chars)', () => {
    logTunnelEvent(makeEvent());

    const lines = getWrittenLines();
    expect(() => JSON.parse(lines[0]!.trim())).not.toThrow();
  });

  it('throws if event contains apiToken field', () => {
    const badEvent = { ...makeEvent(), apiToken: 'super-secret-token' };

    expect(() => logTunnelEvent(badEvent as unknown as TunnelLogEvent)).toThrow(/apiToken/);
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('throws if event contains tunnelToken field', () => {
    const badEvent = { ...makeEvent(), tunnelToken: 'my-jwt-token' };

    expect(() => logTunnelEvent(badEvent as unknown as TunnelLogEvent)).toThrow(/tunnelToken/);
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('multiple calls each append exactly one JSON line', () => {
    logTunnelEvent(makeEvent({ event: 'CREATE', detail: 'First' }));
    logTunnelEvent(makeEvent({ event: 'ROLLBACK', detail: 'Second' }));
    logTunnelEvent(makeEvent({ event: 'RESTART', detail: 'Third' }));

    expect(mockAppendFileSync).toHaveBeenCalledTimes(3);

    const lines = getWrittenLines();
    const events = lines.map((l) => JSON.parse(l.trim()).event as string);
    expect(events).toEqual(['CREATE', 'ROLLBACK', 'RESTART']);
  });

  it('writes to ~/.brewnet/logs/tunnel.log path', () => {
    logTunnelEvent(makeEvent());

    const [logPath] = (mockAppendFileSync as jest.Mock).mock.calls[0] as [string, string, string];
    expect(logPath).toContain('tunnel.log');
    expect(logPath).toContain('.brewnet');
  });

  it('preserves all non-sensitive event fields in the written JSON', () => {
    const event = makeEvent({
      tunnelId: 'tid-123',
      tunnelName: 'my-server',
      domain: 'myserver.com',
      error: 'some error occurred',
    });
    logTunnelEvent(event);

    const lines = getWrittenLines();
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.tunnelId).toBe('tid-123');
    expect(parsed.tunnelName).toBe('my-server');
    expect(parsed.domain).toBe('myserver.com');
    expect(parsed.error).toBe('some error occurred');
  });
});

// ---------------------------------------------------------------------------
// TunnelLogger class tests
// ---------------------------------------------------------------------------

describe('TunnelLogger', () => {
  let logger: InstanceType<typeof TunnelLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new TunnelLogger();
  });

  it('log() auto-adds ISO timestamp if not provided', () => {
    logger.log({
      event: 'QUICK_START',
      tunnelMode: 'quick',
      detail: 'Quick tunnel started',
    });

    const lines = getWrittenLines();
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
  });

  it('log() uses provided timestamp when given', () => {
    const ts = '2025-12-31T23:59:59.000Z';
    logger.log({
      event: 'RESTART',
      tunnelMode: 'named',
      detail: 'restart test',
      timestamp: ts,
    });

    const lines = getWrittenLines();
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.timestamp).toBe(ts);
  });

  it('log() throws if apiToken field is present', () => {
    expect(() =>
      logger.log({
        event: 'CREATE',
        tunnelMode: 'named',
        detail: 'test',
        apiToken: 'secret',
      } as unknown as Parameters<typeof logger.log>[0]),
    ).toThrow(/apiToken/);
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('log() throws if tunnelToken field is present', () => {
    expect(() =>
      logger.log({
        event: 'CREATE',
        tunnelMode: 'named',
        detail: 'test',
        tunnelToken: 'my-token',
      } as unknown as Parameters<typeof logger.log>[0]),
    ).toThrow(/tunnelToken/);
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('log() appends QUICK_START event correctly', () => {
    logger.log({ event: 'QUICK_START', tunnelMode: 'quick', detail: 'started' });

    const lines = getWrittenLines();
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.event).toBe('QUICK_START');
    expect(parsed.tunnelMode).toBe('quick');
  });

  it('log() appends DOMAIN_CONNECT event correctly', () => {
    logger.log({
      event: 'DOMAIN_CONNECT',
      tunnelMode: 'named',
      tunnelId: 'tid-xyz',
      domain: 'example.com',
      detail: 'domain connected',
    });

    const lines = getWrittenLines();
    const parsed = JSON.parse(lines[0]!.trim());
    expect(parsed.event).toBe('DOMAIN_CONNECT');
    expect(parsed.domain).toBe('example.com');
  });

  it('log() multiple calls append sequentially', () => {
    logger.log({ event: 'CREATE', tunnelMode: 'named', detail: 'a' });
    logger.log({ event: 'QUICK_START', tunnelMode: 'quick', detail: 'b' });

    expect(mockAppendFileSync).toHaveBeenCalledTimes(2);
    const lines = getWrittenLines();
    expect(JSON.parse(lines[0]!.trim()).event).toBe('CREATE');
    expect(JSON.parse(lines[1]!.trim()).event).toBe('QUICK_START');
  });
});
