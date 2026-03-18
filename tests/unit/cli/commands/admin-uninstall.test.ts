/**
 * Unit tests for admin and uninstall commands
 *
 * Tests command registration, options, and action logic with mocked dependencies.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks for admin command
// ---------------------------------------------------------------------------

const mockLaunchAdminDaemon = jest.fn<() => Promise<{ pid: number; port: number; logFile: string }>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/admin-launcher.js',
  () => ({
    launchAdminDaemon: mockLaunchAdminDaemon,
  }),
);

// Mock child_process.execSync for killPort
jest.unstable_mockModule('node:child_process', () => ({
  execSync: jest.fn(() => ''),
  execFileSync: jest.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Mocks for uninstall command
// ---------------------------------------------------------------------------

const mockBuildUninstallTargets = jest.fn<() => { label: string; skipped?: boolean; skipReason?: string }[]>(
  () => [
    { label: 'Docker containers', skipped: false },
    { label: 'Project directory', skipped: false },
  ],
);
const mockListInstallations = jest.fn<() => string[]>(() => ['/home/user/brewnet-home']);
const mockRunUninstall = jest.fn<() => Promise<void>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/uninstall-manager.js',
  () => ({
    buildUninstallTargets: mockBuildUninstallTargets,
    listInstallations: mockListInstallations,
    runUninstall: mockRunUninstall,
  }),
);

const mockGetLastProject = jest.fn<() => string | null>(() => '/home/user/brewnet-home');
const mockLoadState = jest.fn(() => null);

jest.unstable_mockModule(
  '../../../../packages/cli/src/wizard/state.js',
  () => ({
    getLastProject: mockGetLastProject,
    loadState: mockLoadState,
    createState: jest.fn(),
    saveState: jest.fn(),
    hasResumeState: jest.fn(() => false),
  }),
);

const mockConfirm = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
  password: jest.fn(),
}));

// Mock execa — uninstall orphan cleanup does dynamic import('execa')
const mockExeca = jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { registerAdminCommand } = await import('../../../../packages/cli/src/commands/admin.js');
const { registerUninstallCommand } = await import('../../../../packages/cli/src/commands/uninstall.js');

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
// admin command
// ---------------------------------------------------------------------------

describe('admin command registration', () => {
  it('registers "admin" command', () => {
    const p = makeProgram();
    registerAdminCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'admin');
    expect(cmd).toBeDefined();
  });

  it('has --port option', () => {
    const p = makeProgram();
    registerAdminCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'admin')!;
    const portOpt = cmd.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
  });

  it('has --no-open option', () => {
    const p = makeProgram();
    registerAdminCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'admin')!;
    const openOpt = cmd.options.find((o) => o.long === '--no-open');
    expect(openOpt).toBeDefined();
  });
});

describe('admin command action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLaunchAdminDaemon.mockResolvedValue({ pid: 12345, port: 8088, logFile: '/tmp/test.log' });
  });

  it('sets exitCode=1 for invalid port (NaN)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', 'notanumber']);

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockLaunchAdminDaemon).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });

  it('sets exitCode=1 for port 0 (out of range)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '0']);

    expect(mockLaunchAdminDaemon).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });

  it('sets exitCode=1 and prints EADDRINUSE message when daemon fails', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('EADDRINUSE: address already in use :::8088'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088', '--no-open']);

    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });

  it('sets exitCode=1 and prints generic failure message for non-EADDRINUSE error', async () => {
    mockLaunchAdminDaemon.mockRejectedValue(new Error('permission denied'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088', '--no-open']);

    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });

  it('launches daemon and exits cleanly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerAdminCommand(p);
    await parseCommand(p, ['admin', '--port', '8088', '--no-open']);

    expect(mockLaunchAdminDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8088 }),
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// uninstall command
// ---------------------------------------------------------------------------

describe('uninstall command registration', () => {
  it('registers "uninstall" command', () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'uninstall');
    expect(cmd).toBeDefined();
  });

  it('has --dry-run option', () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'uninstall')!;
    const opt = cmd.options.find((o) => o.long === '--dry-run');
    expect(opt).toBeDefined();
  });

  it('has --keep-data option', () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'uninstall')!;
    const opt = cmd.options.find((o) => o.long === '--keep-data');
    expect(opt).toBeDefined();
  });

  it('has --keep-config option', () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'uninstall')!;
    const opt = cmd.options.find((o) => o.long === '--keep-config');
    expect(opt).toBeDefined();
  });

  it('has --force option', () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'uninstall')!;
    const opt = cmd.options.find((o) => o.long === '--force');
    expect(opt).toBeDefined();
  });
});

describe('uninstall command action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunUninstall.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
    mockListInstallations.mockReturnValue(['/home/user/brewnet-home']);
    mockGetLastProject.mockReturnValue('/home/user/brewnet-home');
    mockBuildUninstallTargets.mockReturnValue([
      { label: 'Docker containers', skipped: false },
    ]);
  });

  it('shows dry-run output without calling runUninstall', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--dry-run']);

    expect(mockRunUninstall).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls runUninstall after confirmation with --force', async () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--force']);

    expect(mockRunUninstall).toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('prompts for confirmation without --force', async () => {
    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall']);

    expect(mockConfirm).toHaveBeenCalled();
  });

  it('does not runUninstall when user declines', async () => {
    mockConfirm.mockResolvedValue(false);
    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall']);

    expect(mockRunUninstall).not.toHaveBeenCalled();
  });

  it('shows "No Brewnet installations found" when listInstallations returns empty', async () => {
    mockListInstallations.mockReturnValue([]);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall']);

    expect(mockRunUninstall).not.toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No Brewnet installations found');

    consoleSpy.mockRestore();
  });

  it('handles Ctrl+C during confirm prompt gracefully (does not call runUninstall)', async () => {
    mockConfirm.mockRejectedValue(new Error('User force closed the prompt'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall']);

    expect(mockRunUninstall).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('displays removed items and shows success message', async () => {
    mockRunUninstall.mockResolvedValue({
      removed: ['Docker containers', 'Docker volumes'],
      skipped: [],
      errors: [],
      success: true,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--force']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Removed:');
    expect(output).toContain('Docker containers');
    expect(output).toContain('Uninstall complete');
    expect(output).toContain('install.sh');

    consoleSpy.mockRestore();
  });

  it('displays skipped items', async () => {
    mockRunUninstall.mockResolvedValue({
      removed: [],
      skipped: ['project directory (preserved)'],
      errors: [],
      success: true,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--force']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Skipped:');

    consoleSpy.mockRestore();
  });

  it('displays errors and shows partial success warning with exitCode=1', async () => {
    mockRunUninstall.mockResolvedValue({
      removed: [],
      skipped: [],
      errors: ['Failed to remove volume: permission denied'],
      success: false,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--force']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Error:');
    expect(output).toContain('Uninstall completed with errors');
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });

  it('shows Cloudflare tunnel notice after successful uninstall', async () => {
    mockRunUninstall.mockResolvedValue({
      removed: ['containers'],
      skipped: [],
      errors: [],
      success: true,
    });
    mockLoadState.mockReturnValueOnce({
      domain: {
        cloudflare: {
          tunnelMode: 'named',
          tunnelName: 'brewnet-tunnel',
          zoneName: 'example.com',
        },
      },
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUninstallCommand(p);
    await parseCommand(p, ['uninstall', '--force']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Cloudflare');

    consoleSpy.mockRestore();
  });
});
