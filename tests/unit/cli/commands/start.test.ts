/**
 * Unit tests for commands/start — brewnet start
 *
 * brewnet start = docker compose up -d + launchAdminDaemon
 *
 * Edge cases:
 *   - happy path: docker OK + admin OK → prints URL
 *   - --path option forwarded to both docker and admin
 *   - --port option forwarded to admin daemon
 *   - --no-open skips browser launch
 *   - docker compose failure → exitCode=1, admin NOT started
 *   - admin daemon failure → exitCode=1 after docker succeeds
 *   - no project path found (discoverProjectPath returns null) → falls back to cwd
 *   - browser open is attempted on success (when --no-open not set)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

const mockLaunchAdminDaemon = jest.fn<() => Promise<{ pid: number; port: number; logFile: string }>>();
jest.unstable_mockModule(
  '../../../../packages/cli/src/services/admin-launcher.js',
  () => ({ launchAdminDaemon: mockLaunchAdminDaemon }),
);

const mockDiscoverProjectPath = jest.fn<() => string | null>();
jest.unstable_mockModule(
  '../../../../packages/cli/src/wizard/state.js',
  () => ({ discoverProjectPath: mockDiscoverProjectPath }),
);

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

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const { registerStartCommand } = await import(
  '../../../../packages/cli/src/commands/start.js'
);

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
    // ignore commander errors
  }
}

const PROJECT_PATH = '/home/user/brewnet/my-server';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('start command — registration', () => {
  it('registers "start" command on the program', () => {
    const p = makeProgram();
    registerStartCommand(p);
    expect(p.commands.find((c) => c.name() === 'start')).toBeDefined();
  });

  it('has a meaningful description', () => {
    const p = makeProgram();
    registerStartCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'start')!;
    expect(cmd.description().length).toBeGreaterThan(5);
  });

  it('accepts --path option', () => {
    const p = makeProgram();
    registerStartCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'start')!;
    expect(cmd.options.map((o) => o.long)).toContain('--path');
  });

  it('accepts --port option', () => {
    const p = makeProgram();
    registerStartCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'start')!;
    expect(cmd.options.map((o) => o.long)).toContain('--port');
  });

  it('accepts --no-open flag', () => {
    const p = makeProgram();
    registerStartCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'start')!;
    // Commander converts --no-open to the 'open' boolean option
    expect(cmd.options.map((o) => o.long)).toContain('--no-open');
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('start command — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 1234, port: 8088, logFile: '/tmp/admin.log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('runs docker compose up -d', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'up', '-d']),
      expect.any(Object),
    );
  });

  it('passes project path as cwd to docker compose', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.objectContaining({ cwd: PROJECT_PATH }),
    );
  });

  it('launches admin daemon after docker succeeds', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockLaunchAdminDaemon).toHaveBeenCalled();
  });

  it('passes projectPath to launchAdminDaemon', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: PROJECT_PATH }),
    );
  });

  it('uses default port 8088 for admin daemon', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088 }),
    );
  });

  it('does not set exitCode=1 on success', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(process.exitCode).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// --path option
// ---------------------------------------------------------------------------

describe('start command — --path option', () => {
  const CUSTOM_PATH = '/custom/path/to/project';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(null);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 99, port: 8088, logFile: '/tmp/log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('passes --path value to docker compose cwd', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--path', CUSTOM_PATH]);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.objectContaining({ cwd: CUSTOM_PATH }),
    );
  });

  it('passes --path value to launchAdminDaemon', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--path', CUSTOM_PATH]);
    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: CUSTOM_PATH }),
    );
  });

  it('--path takes precedence over discoverProjectPath', async () => {
    mockDiscoverProjectPath.mockReturnValue('/discovered/path');
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--path', CUSTOM_PATH]);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.objectContaining({ cwd: CUSTOM_PATH }),
    );
  });
});

// ---------------------------------------------------------------------------
// --port option
// ---------------------------------------------------------------------------

describe('start command — --port option', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 99, port: 9000, logFile: '/tmp/log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('passes --port value to launchAdminDaemon', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--port', '9000']);
    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9000 }),
    );
  });

  it('sets exitCode=1 for invalid port (NaN)', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--port', 'abc']);
    expect(process.exitCode).toBe(1);
    expect(mockExeca).not.toHaveBeenCalled();
    process.exitCode = undefined;
  });

  it('sets exitCode=1 for out-of-range port (0)', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--port', '0']);
    expect(process.exitCode).toBe(1);
    expect(mockExeca).not.toHaveBeenCalled();
    process.exitCode = undefined;
  });

  it('sets exitCode=1 for out-of-range port (65536)', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--port', '65536']);
    expect(process.exitCode).toBe(1);
    expect(mockExeca).not.toHaveBeenCalled();
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// Docker compose failure
// ---------------------------------------------------------------------------

describe('start command — docker compose failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets exitCode=1 when docker compose throws', async () => {
    mockExeca.mockRejectedValue(new Error('docker not found'));
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(process.exitCode).toBe(1);
  });

  it('does NOT launch admin daemon when docker compose fails', async () => {
    mockExeca.mockRejectedValue(new Error('compose error'));
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockLaunchAdminDaemon).not.toHaveBeenCalled();
  });

  it('does not throw — error is handled gracefully', async () => {
    mockExeca.mockRejectedValue(new Error('permission denied'));
    const p = makeProgram();
    registerStartCommand(p);
    await expect(parseCommand(p, ['start'])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Admin daemon failure
// ---------------------------------------------------------------------------

describe('start command — admin daemon failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets exitCode=1 when launchAdminDaemon throws', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('daemon timeout'));
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(process.exitCode).toBe(1);
  });

  it('docker compose WAS called even when admin daemon later fails', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('daemon start failed'));
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'up', '-d']),
      expect.any(Object),
    );
  });

  it('does not throw — error is handled gracefully', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('port in use'));
    const p = makeProgram();
    registerStartCommand(p);
    await expect(parseCommand(p, ['start'])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// discoverProjectPath fallback
// ---------------------------------------------------------------------------

describe('start command — project path discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 1, port: 8088, logFile: '/tmp/log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('uses discoverProjectPath when --path not provided', async () => {
    mockDiscoverProjectPath.mockReturnValue('/discovered/project');
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.objectContaining({ cwd: '/discovered/project' }),
    );
  });

  it('falls back to cwd when discoverProjectPath returns null', async () => {
    mockDiscoverProjectPath.mockReturnValue(null);
    const originalCwd = process.cwd();
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.objectContaining({ cwd: originalCwd }),
    );
  });

  it('calls discoverProjectPath with undefined when no --path given', async () => {
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    expect(mockDiscoverProjectPath).toHaveBeenCalledWith(undefined);
  });

  it('calls discoverProjectPath with empty string treated as no-path', async () => {
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    const p = makeProgram();
    registerStartCommand(p);
    // No --path flag → default empty string
    await parseCommand(p, ['start']);
    // discoverProjectPath should be called (path discovery happens)
    expect(mockDiscoverProjectPath).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// --no-open flag
// ---------------------------------------------------------------------------

describe('start command — --no-open flag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 5, port: 8088, logFile: '/tmp/log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('completes successfully with --no-open', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await expect(parseCommand(p, ['start', '--no-open'])).resolves.toBeUndefined();
    expect(process.exitCode).not.toBe(1);
  });

  it('does not call execa with open/xdg-open when --no-open is set', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start', '--no-open']);

    // execa is called ONLY for docker compose (not for open/xdg-open)
    const execaCalls = mockExeca.mock.calls as unknown as [string, string[], object][];
    const openCall = execaCalls.find(([cmd]) => cmd === 'open' || cmd === 'xdg-open');
    expect(openCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// docker compose uses DOCKER_COMPOSE_FILENAME
// ---------------------------------------------------------------------------

describe('start command — compose filename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverProjectPath.mockReturnValue(PROJECT_PATH);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 1, port: 8088, logFile: '/tmp/log' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('includes -f flag with compose filename in docker args', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    const args = (mockExeca.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args).toContain('-f');
  });

  it('passes docker-compose.yml as compose file', async () => {
    const p = makeProgram();
    registerStartCommand(p);
    await parseCommand(p, ['start']);
    const args = (mockExeca.mock.calls[0] as unknown as [string, string[]])[1];
    const fIndex = args.indexOf('-f');
    expect(fIndex).toBeGreaterThanOrEqual(0);
    expect(args[fIndex + 1]).toContain('docker-compose');
  });
});
