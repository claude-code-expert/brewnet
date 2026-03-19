/**
 * Unit tests for admin command — browser open logic (daemon mode)
 *
 * Tests the auto-open browser section in default daemon mode.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLaunchAdminDaemon = jest.fn<() => Promise<{ pid: number; port: number; logFile: string }>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/admin-launcher.js',
  () => ({
    launchAdminDaemon: mockLaunchAdminDaemon,
  }),
);

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// Mock child_process.execSync for killPort
jest.unstable_mockModule('node:child_process', () => ({
  execSync: jest.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
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
    // ignore commander errors
  }
}

// ---------------------------------------------------------------------------
// Tests — browser open logic (daemon mode)
// ---------------------------------------------------------------------------

describe('admin command — browser open (--open enabled)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 12345, port: 8088, logFile: '/tmp/test.log' });
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls execa to open browser when --no-open is NOT passed', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088']);

    expect(mockExeca).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not call execa for browser open when --no-open is passed', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088', '--no-open']);

    expect(mockExeca).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('continues gracefully when browser open fails (non-fatal)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockExeca.mockRejectedValue(new Error('open: command not found'));

    const p = makeProgram();
    registerAdminCommand(p);

    await expect(parseCommand(p, ['admin', '--port', '8088'])).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
