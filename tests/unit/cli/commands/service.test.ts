/**
 * Unit tests for commands/service — brewnet service install/uninstall/status
 *
 * Edge cases:
 *   - registers "service" command with install/uninstall/status subcommands
 *   - install: calls installBrewnetService with detected brewnet bin + platform
 *   - install: --path option forwarded to installBrewnetService
 *   - install: --port option forwarded to installBrewnetService
 *   - install: already installed → warns but does not throw
 *   - install: unsupported platform → sets exitCode=1
 *   - install: installBrewnetService throws → sets exitCode=1
 *   - uninstall: calls uninstallBrewnetService
 *   - uninstall: not installed → prints informational message, no error
 *   - uninstall: successfully removed → prints success
 *   - status: installed + running → prints running status
 *   - status: not installed → prints not-installed status
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInstallBrewnetService = jest.fn<() => Promise<void>>();
const mockUninstallBrewnetService = jest.fn<() => Promise<boolean>>();
const mockIsBrewnetServiceInstalled = jest.fn<() => boolean>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/system-service.js',
  () => ({
    installBrewnetService: mockInstallBrewnetService,
    uninstallBrewnetService: mockUninstallBrewnetService,
    isBrewnetServiceInstalled: mockIsBrewnetServiceInstalled,
  }),
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
// Import SUT
// ---------------------------------------------------------------------------

const { registerServiceCommand } = await import(
  '../../../../packages/cli/src/commands/service.js'
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

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('service command — registration', () => {
  it('registers "service" top-level command', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    expect(p.commands.find((c) => c.name() === 'service')).toBeDefined();
  });

  it('"service" has "install" subcommand', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    const svc = p.commands.find((c) => c.name() === 'service')!;
    expect(svc.commands.find((c) => c.name() === 'install')).toBeDefined();
  });

  it('"service" has "uninstall" subcommand', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    const svc = p.commands.find((c) => c.name() === 'service')!;
    expect(svc.commands.find((c) => c.name() === 'uninstall')).toBeDefined();
  });

  it('"service" has "status" subcommand', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    const svc = p.commands.find((c) => c.name() === 'service')!;
    expect(svc.commands.find((c) => c.name() === 'status')).toBeDefined();
  });

  it('"install" subcommand accepts --path option', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    const install = p.commands.find((c) => c.name() === 'service')!
      .commands.find((c) => c.name() === 'install')!;
    expect(install.options.map((o) => o.long)).toContain('--path');
  });

  it('"install" subcommand accepts --port option', () => {
    const p = makeProgram();
    registerServiceCommand(p);
    const install = p.commands.find((c) => c.name() === 'service')!
      .commands.find((c) => c.name() === 'install')!;
    expect(install.options.map((o) => o.long)).toContain('--port');
  });
});

// ---------------------------------------------------------------------------
// service install
// ---------------------------------------------------------------------------

describe('service install', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsBrewnetServiceInstalled.mockReturnValue(false);
    mockInstallBrewnetService.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('calls installBrewnetService on success', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    expect(mockInstallBrewnetService).toHaveBeenCalled();
  });

  it('passes brewnetBin to installBrewnetService', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    const callArg = mockInstallBrewnetService.mock.calls[0]![0] as { brewnetBin: string };
    expect(typeof callArg.brewnetBin).toBe('string');
    expect(callArg.brewnetBin.length).toBeGreaterThan(0);
  });

  it('passes default port 8088 to installBrewnetService', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    const callArg = mockInstallBrewnetService.mock.calls[0]![0] as { port: number };
    expect(callArg.port).toBe(8088);
  });

  it('forwards --port to installBrewnetService', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install', '--port', '9000']);
    const callArg = mockInstallBrewnetService.mock.calls[0]![0] as { port: number };
    expect(callArg.port).toBe(9000);
  });

  it('forwards --path to installBrewnetService as projectPath', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install', '--path', '/home/user/project']);
    const callArg = mockInstallBrewnetService.mock.calls[0]![0] as { projectPath: string };
    expect(callArg.projectPath).toBe('/home/user/project');
  });

  it('does not set exitCode=1 on success', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    expect(process.exitCode).not.toBe(1);
  });

  it('sets exitCode=1 when installBrewnetService throws', async () => {
    mockInstallBrewnetService.mockRejectedValue(new Error('Platform not supported'));
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    expect(process.exitCode).toBe(1);
  });

  it('does not throw when installBrewnetService fails', async () => {
    mockInstallBrewnetService.mockRejectedValue(new Error('launchctl error'));
    const p = makeProgram();
    registerServiceCommand(p);
    await expect(parseCommand(p, ['service', 'install'])).resolves.toBeUndefined();
  });

  it('warns and does not call installBrewnetService when already installed', async () => {
    mockIsBrewnetServiceInstalled.mockReturnValue(true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'install']);
    expect(mockInstallBrewnetService).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// service uninstall
// ---------------------------------------------------------------------------

describe('service uninstall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsBrewnetServiceInstalled.mockReturnValue(true);
    mockUninstallBrewnetService.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('calls uninstallBrewnetService', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'uninstall']);
    expect(mockUninstallBrewnetService).toHaveBeenCalled();
  });

  it('does not set exitCode=1 on success', async () => {
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'uninstall']);
    expect(process.exitCode).not.toBe(1);
  });

  it('prints informational message when not installed (returns false)', async () => {
    mockUninstallBrewnetService.mockResolvedValue(false);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'uninstall']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('');
    // Should say something like "not installed" or "nothing to remove"
    expect(output.toLowerCase()).toMatch(/not installed|nothing|no service/);
    consoleSpy.mockRestore();
  });

  it('does not set exitCode=1 when service was not installed', async () => {
    mockUninstallBrewnetService.mockResolvedValue(false);
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'uninstall']);
    expect(process.exitCode).not.toBe(1);
  });

  it('sets exitCode=1 when uninstallBrewnetService throws', async () => {
    mockUninstallBrewnetService.mockRejectedValue(new Error('permission denied'));
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'uninstall']);
    expect(process.exitCode).toBe(1);
  });

  it('does not throw when uninstallBrewnetService fails', async () => {
    mockUninstallBrewnetService.mockRejectedValue(new Error('systemctl error'));
    const p = makeProgram();
    registerServiceCommand(p);
    await expect(parseCommand(p, ['service', 'uninstall'])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// service status
// ---------------------------------------------------------------------------

describe('service status', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints installed message when service file exists', async () => {
    mockIsBrewnetServiceInstalled.mockReturnValue(true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'status']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output.toLowerCase()).toMatch(/installed|enabled|active/);
    consoleSpy.mockRestore();
  });

  it('prints not-installed message when service file does not exist', async () => {
    mockIsBrewnetServiceInstalled.mockReturnValue(false);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'status']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output.toLowerCase()).toMatch(/not installed|not enabled|inactive/);
    consoleSpy.mockRestore();
  });

  it('calls isBrewnetServiceInstalled', async () => {
    mockIsBrewnetServiceInstalled.mockReturnValue(false);
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'status']);
    expect(mockIsBrewnetServiceInstalled).toHaveBeenCalled();
  });

  it('does not set exitCode=1 on status check', async () => {
    mockIsBrewnetServiceInstalled.mockReturnValue(false);
    const p = makeProgram();
    registerServiceCommand(p);
    await parseCommand(p, ['service', 'status']);
    expect(process.exitCode).not.toBe(1);
  });
});
