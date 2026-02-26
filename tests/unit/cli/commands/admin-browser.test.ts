/**
 * Unit tests for admin command — browser open logic (lines 47-61)
 *
 * Tests the auto-open browser section that runs when --no-open is NOT passed.
 * Separate file because execa must be mocked before import.
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
  () => ({
    createAdminServer: mockCreateAdminServer,
  }),
);

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
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
// Tests — browser open logic
// ---------------------------------------------------------------------------

describe('admin command — browser open (--open enabled)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls execa to open browser when --no-open is NOT passed', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const onceSpy = jest.spyOn(process, 'once').mockImplementation(
      (event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          listener();
        }
        return process;
      },
    );

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088']);

    // execa should have been called (to open browser)
    expect(mockExeca).toHaveBeenCalled();

    onceSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('does not call execa for browser open when --no-open is passed', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const onceSpy = jest.spyOn(process, 'once').mockImplementation(
      (event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          listener();
        }
        return process;
      },
    );

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088', '--no-open']);

    // execa should NOT have been called (browser open skipped)
    expect(mockExeca).not.toHaveBeenCalled();

    onceSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('continues gracefully when browser open fails (non-fatal)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockExeca.mockRejectedValue(new Error('open: command not found'));

    const onceSpy = jest.spyOn(process, 'once').mockImplementation(
      (event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          listener();
        }
        return process;
      },
    );

    const p = makeProgram();
    registerAdminCommand(p);

    // Should not throw even when execa fails
    await expect(parseCommand(p, ['admin', '--port', '8088'])).resolves.toBeUndefined();

    onceSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
