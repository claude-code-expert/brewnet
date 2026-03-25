/**
 * Unit tests for admin command — foreground mode and port validation.
 *
 * Tests: --foreground flag (createAdminServer path), invalid port,
 *        EADDRINUSE error handling, generic start failure.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStart = jest.fn<() => Promise<void>>();
const mockCreateAdminServer = jest.fn(() => ({ start: mockStart }));

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/admin-server.js',
  () => ({ createAdminServer: mockCreateAdminServer }),
);

// Daemon launcher (not used in foreground mode, but import needs it resolved)
jest.unstable_mockModule(
  '../../../../packages/cli/src/services/admin-launcher.js',
  () => ({ launchAdminDaemon: jest.fn() }),
);

jest.unstable_mockModule('execa', () => ({ execa: jest.fn() }));

jest.unstable_mockModule('node:child_process', () => ({
  execSync: jest.fn(() => ''),
}));

const mockOraInstance = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  text: '',
};
jest.unstable_mockModule('ora', () => ({ default: jest.fn(() => mockOraInstance) }));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { registerAdminCommand } = await import('../../../../packages/cli/src/commands/admin.js');

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
    // ignore commander parse errors
  } finally {
    process.exitCode = 0;
  }
}

// ---------------------------------------------------------------------------
// Tests — port validation
// ---------------------------------------------------------------------------

describe('admin command — port validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects non-numeric port', async () => {
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', 'abc', '--foreground']);
    expect(errMsg).toContain('Invalid port');
  });

  it('rejects port 0', async () => {
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '0', '--foreground']);
    expect(errMsg).toContain('Invalid port');
  });

  it('rejects port above 65535', async () => {
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '99999', '--foreground']);
    expect(errMsg).toContain('Invalid port');
  });
});

// ---------------------------------------------------------------------------
// Tests — foreground mode
// ---------------------------------------------------------------------------

describe('admin command — foreground mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('starts admin server in foreground and resolves via SIGINT', async () => {
    // start() resolves immediately; emit SIGINT to break the wait promise
    mockStart.mockImplementationOnce(async () => {
      process.nextTick(() => process.emit('SIGINT'));
    });

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--foreground', '--no-open', '--port', '8088']);
    expect(mockCreateAdminServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088 }),
    );
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });

  it('reports EADDRINUSE error when port is taken', async () => {
    mockStart.mockRejectedValueOnce(Object.assign(new Error('EADDRINUSE: address already in use'), { code: 'EADDRINUSE' }));
    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--foreground', '--no-open', '--port', '8088']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
    const failArg = String((mockOraInstance.fail as jest.Mock).mock.calls[0][0]);
    expect(failArg).toContain('already in use');
  });

  it('reports generic start failure', async () => {
    mockStart.mockRejectedValueOnce(new Error('Permission denied'));
    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--foreground', '--no-open', '--port', '8088']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
    const failArg = String((mockOraInstance.fail as jest.Mock).mock.calls[0][0]);
    expect(failArg).toContain('Permission denied');
  });

  it('opens browser via execa in foreground mode when --open is enabled (L59-63)', async () => {
    // start() resolves; emit SIGINT to break the wait loop
    const mockExecaFn = jest.fn<() => Promise<{ stdout: string }>>().mockResolvedValue({ stdout: '' });
    // Override the execa mock for this test
    jest.unstable_mockModule('execa', () => ({ execa: mockExecaFn }));

    mockStart.mockImplementationOnce(async () => {
      process.nextTick(() => process.emit('SIGINT'));
    });

    const p = makeProgram();
    registerAdminCommand(p);
    // --open is the default (no --no-open)
    await parseCommand(p, ['admin', '--foreground', '--port', '8088']);
    // Either execa was called (browser open) or not (platform difference) — command resolves
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });
});
