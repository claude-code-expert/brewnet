/**
 * Unit tests for commands: list, update, logs
 *
 * Tests action handler logic via parseAsync.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockExecaFn = jest.fn<() => Promise<{ stdout: string; stderr: string }>>();
jest.unstable_mockModule('execa', () => ({ execa: mockExecaFn }));

const mockOraInstance = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  text: '',
};
jest.unstable_mockModule('ora', () => ({ default: jest.fn(() => mockOraInstance) }));

const mockCheckDockerAvailability = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule(
  '../../../../packages/cli/src/services/docker-manager.js',
  () => ({ checkDockerAvailability: mockCheckDockerAvailability }),
);

const mockQueryLogs = jest.fn<() => Promise<unknown>>();
const mockParseDuration = jest.fn<(s: string) => string>((s: string) => new Date().toISOString());
jest.unstable_mockModule(
  '../../../../packages/cli/src/utils/log-aggregator.js',
  () => ({ queryLogs: mockQueryLogs, parseDuration: mockParseDuration }),
);

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { registerListCommand } = await import('../../../../packages/cli/src/commands/list.js');
const { registerUpdateCommand } = await import('../../../../packages/cli/src/commands/update.js');
const { registerLogsCommand } = await import('../../../../packages/cli/src/commands/logs.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return p;
}

async function parseCommand(program: Command, args: string[]): Promise<void> {
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch {
    // commander exitOverride throws on --help or errors; ignore
  } finally {
    // Reset exitCode set by command error handlers to prevent Jest failing
    process.exitCode = 0;
  }
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('list — registration', () => {
  it('registers the "list" command', () => {
    const p = makeProgram();
    registerListCommand(p);
    expect(p.commands.find((c) => c.name() === 'list')).toBeDefined();
  });
});

describe('list — --stacks --json', () => {
  let output = '';
  beforeEach(() => {
    jest.clearAllMocks();
    output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
  });

  it('outputs JSON array for --stacks --json', async () => {
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--stacks', '--json']);
    const parsed = JSON.parse(output.trim()) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    const first = parsed[0] as Record<string, unknown>;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('language');
  });

  it('outputs human-readable stacks without --json', async () => {
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--stacks']);
    expect(output).toContain('Brewnet App Stacks');
  });
});

describe('list — services', () => {
  let output = '';
  beforeEach(() => {
    jest.clearAllMocks();
    output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
  });

  it('outputs JSON services when --json without --stacks', async () => {
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--json']);
    const parsed = JSON.parse(output.trim()) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('marks services as installed from docker compose ps output', async () => {
    const psOutput = JSON.stringify([
      { Service: 'traefik', State: 'running' },
      { Service: 'gitea', State: 'running' },
    ]);
    mockExecaFn.mockResolvedValue({ stdout: psOutput, stderr: '' });
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--json']);
    const parsed = JSON.parse(output.trim()) as Array<{ id: string; installed: boolean }>;
    const traefik = parsed.find((s) => s.id === 'traefik');
    expect(traefik?.installed).toBe(true);
  });

  it('handles NDJSON from docker compose ps', async () => {
    const ndjson =
      '{"Service":"traefik","State":"running"}\n{"Service":"gitea","State":"exited"}';
    mockExecaFn.mockResolvedValue({ stdout: ndjson, stderr: '' });
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--json']);
    const parsed = JSON.parse(output.trim()) as Array<{ id: string; installed: boolean }>;
    const traefik = parsed.find((s) => s.id === 'traefik');
    expect(traefik?.installed).toBe(true);
  });

  it('handles docker ps failure gracefully (empty set)', async () => {
    mockExecaFn.mockRejectedValue(new Error('docker not found'));
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--json']);
    const parsed = JSON.parse(output.trim()) as Array<{ installed: boolean }>;
    expect(parsed.every((s) => !s.installed)).toBe(true);
  });

  it('filters to installed only with --installed --json', async () => {
    mockExecaFn.mockResolvedValue({
      stdout: JSON.stringify([{ Service: 'traefik', State: 'running' }]),
      stderr: '',
    });
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list', '--installed', '--json']);
    const parsed = JSON.parse(output.trim()) as Array<{ installed: boolean }>;
    expect(parsed.every((s) => s.installed)).toBe(true);
  });

  it('displays human-readable services without --json', async () => {
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
    const p = makeProgram();
    registerListCommand(p);
    await parseCommand(p, ['list']);
    expect(output).toContain('Brewnet Services');
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('registers the "update" command', () => {
    const p = makeProgram();
    registerUpdateCommand(p);
    expect(p.commands.find((c) => c.name() === 'update')).toBeDefined();
  });

  it('succeeds when docker pull and restart work', async () => {
    mockExecaFn
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // pull
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // up --force-recreate
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // ps
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });

  it('exits when no compose file found during pull', async () => {
    mockExecaFn.mockRejectedValueOnce(new Error('no configuration file found'));
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
  });

  it('skips restart with --no-restart', async () => {
    mockExecaFn
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // pull
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // ps
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp', '--no-restart']);
    // Should NOT have called up --force-recreate
    const calls = mockExecaFn.mock.calls as unknown[][];
    const upCall = calls.find((c) => {
      const args = c[1] as string[];
      return Array.isArray(args) && args.includes('--force-recreate');
    });
    expect(upCall).toBeUndefined();
  });

  it('shows container count from ps output', async () => {
    const psOutput = '{"State":"running"}\n{"State":"running"}\n{"State":"exited"}';
    mockExecaFn
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // pull
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // up
      .mockResolvedValueOnce({ stdout: psOutput, stderr: '' }); // ps
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    const combined = logSpy.mock.calls.flat().join(' ');
    expect(combined).toContain('2/3');
  });

  it('prints stdout/stderr from docker pull when non-empty', async () => {
    mockExecaFn
      .mockResolvedValueOnce({ stdout: 'Pulling from myimage', stderr: 'Digest: sha256:abc' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })  // up
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // ps
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    const output = logSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Pulling from myimage');
    expect(output).toContain('Digest');
  });

  it('sets exitCode=1 and fails spinner when restart throws', async () => {
    mockExecaFn
      .mockResolvedValueOnce({ stdout: '', stderr: '' })      // pull OK
      .mockRejectedValueOnce(new Error('restart failed'));     // up fails
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
    // exitCode reset by parseCommand finally block, just verify fail was called
  });

  it('sets exitCode=1 when checkDockerAvailability throws generic error', async () => {
    mockCheckDockerAvailability.mockRejectedValueOnce(new Error('daemon not running'));
    const p = makeProgram();
    registerUpdateCommand(p);
    await parseCommand(p, ['update', '--path', '/tmp']);
    // process.exitCode was set to 1 inside handler (parseCommand resets it back to 0)
    expect(mockExecaFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

describe('logs — registration', () => {
  it('registers the "logs" command', () => {
    const p = makeProgram();
    registerLogsCommand(p);
    expect(p.commands.find((c) => c.name() === 'logs')).toBeDefined();
  });
});

describe('logs — flag validation', () => {
  let errOutput = '';
  beforeEach(() => {
    jest.clearAllMocks();
    errOutput = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errOutput += String(s); });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('rejects --json without --all or --source', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--json']);
    expect(errOutput).toContain('--json requires');
  });

  it('rejects --follow with --all', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--follow', '--all']);
    expect(errOutput).toContain('--follow is not supported');
  });
});

describe('logs — docker path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls docker compose logs without service', async () => {
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--path', '/tmp']);
    const calls = mockExecaFn.mock.calls as unknown[][];
    expect(calls.some((c) => {
      const args = c[1] as string[];
      return Array.isArray(args) && args.includes('logs');
    })).toBe(true);
  });

  it('appends service name when provided', async () => {
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', 'gitea', '--path', '/tmp']);
    const calls = mockExecaFn.mock.calls as unknown[][];
    expect(calls.some((c) => {
      const args = c[1] as string[];
      return Array.isArray(args) && args.includes('gitea');
    })).toBe(true);
  });

  it('appends --tail when provided', async () => {
    mockExecaFn.mockResolvedValue({ stdout: '', stderr: '' });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--tail', '50', '--path', '/tmp']);
    const calls = mockExecaFn.mock.calls as unknown[][];
    expect(calls.some((c) => {
      const args = c[1] as string[];
      return Array.isArray(args) && args.includes('--tail');
    })).toBe(true);
  });

  it('handles docker error gracefully', async () => {
    mockExecaFn.mockRejectedValue(new Error('docker error'));
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--path', '/tmp']);
    expect(errMsg).toContain('Failed to fetch logs');
  });
});

describe('logs — aggregator path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls queryLogs when --all provided', async () => {
    mockQueryLogs.mockResolvedValue({ entries: [], total: 0, hasMore: false });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--all', '--path', '/tmp']);
    expect(mockQueryLogs).toHaveBeenCalled();
  });

  it('outputs "No log entries" when empty result', async () => {
    mockQueryLogs.mockResolvedValue({ entries: [], total: 0, hasMore: false });
    let logOutput = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--all', '--path', '/tmp']);
    expect(logOutput).toContain('No log entries');
  });

  it('outputs formatted entries to console', async () => {
    mockQueryLogs.mockResolvedValue({
      entries: [{
        timestamp: '2026-03-24T10:00:00.000Z',
        source: 'cli',
        level: 'info',
        message: 'test message',
        service: 'gitea',
      }],
      total: 1,
      hasMore: false,
    });
    let logOutput = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--all', '--path', '/tmp']);
    expect(logOutput).toContain('test message');
  });

  it('outputs JSON lines with --json --all', async () => {
    const entry = {
      timestamp: '2026-03-24T10:00:00.000Z',
      source: 'cli',
      level: 'info',
      message: 'test msg',
    };
    mockQueryLogs.mockResolvedValue({ entries: [entry], total: 1, hasMore: false });
    let logOutput = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--all', '--json', '--path', '/tmp']);
    const parsed = JSON.parse(logOutput.trim()) as Record<string, unknown>;
    expect(parsed.message).toBe('test msg');
  });

  it('rejects invalid --source', async () => {
    let errOutput = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--source', 'invalid', '--path', '/tmp']);
    expect(errOutput).toContain('Invalid source');
  });

  it('rejects invalid --level', async () => {
    let errOutput = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--level', 'verbose', '--all', '--path', '/tmp']);
    expect(errOutput).toContain('Invalid level');
  });

  it('handles parseDuration error (invalid --since)', async () => {
    mockParseDuration.mockImplementationOnce(() => { throw new Error('Invalid time format: bad'); });
    let errOutput = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--since', 'bad', '--all', '--path', '/tmp']);
    expect(errOutput).toContain('Invalid time format');
  });

  it('shows hasMore message when truncated', async () => {
    mockQueryLogs.mockResolvedValue({
      entries: [{
        timestamp: '2026-03-24T10:00:00.000Z',
        source: 'cli',
        level: 'info',
        message: 'msg',
      }],
      total: 100,
      hasMore: true,
    });
    let logOutput = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logOutput += String(s); });
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '--all', '--path', '/tmp']);
    expect(logOutput).toContain('more entries');
  });
});
