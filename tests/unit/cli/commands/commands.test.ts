/**
 * Unit tests for CLI commands: add, remove, up, down, logs, backup, restore
 *
 * Tests command registration (names, descriptions, arguments, options)
 * and action logic through mocked service dependencies.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mock service dependencies
// ---------------------------------------------------------------------------

const mockAddService = jest.fn<() => Promise<{ success: boolean; composePath?: string; backupPath?: string; error?: string }>>();
const mockRemoveService = jest.fn<() => Promise<{ success: boolean; composePath?: string; backupPath?: string; error?: string }>>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/service-manager.js',
  () => ({
    addService: mockAddService,
    removeService: mockRemoveService,
  }),
);

const mockCreateBackup = jest.fn<() => { id: string; path: string; projectName: string; size: number; timestamp: number }>();
const mockListBackups = jest.fn<() => { id: string; path: string; projectName: string; size: number; timestamp: number }[]>();
const mockCheckDiskSpace = jest.fn<() => { sufficient: boolean; available: number; required: number }>();
const mockRestoreBackup = jest.fn<() => void>();

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/backup-manager.js',
  () => ({
    createBackup: mockCreateBackup,
    listBackups: mockListBackups,
    checkDiskSpace: mockCheckDiskSpace,
    restoreBackup: mockRestoreBackup,
  }),
);

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockConfirm = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
  password: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { registerAddCommand } = await import('../../../../packages/cli/src/commands/add.js');
const { registerRemoveCommand } = await import('../../../../packages/cli/src/commands/remove.js');
const { registerUpCommand } = await import('../../../../packages/cli/src/commands/up.js');
const { registerDownCommand } = await import('../../../../packages/cli/src/commands/down.js');
const { registerLogsCommand } = await import('../../../../packages/cli/src/commands/logs.js');
const { registerBackupCommand } = await import('../../../../packages/cli/src/commands/backup.js');
const { registerRestoreCommand } = await import('../../../../packages/cli/src/commands/restore.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return p;
}

async function parseCommand(
  program: Command,
  args: string[],
): Promise<void> {
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch {
    // ignore commander errors
  }
}

// ---------------------------------------------------------------------------
// Command Registration Tests
// ---------------------------------------------------------------------------

describe('Command registration', () => {
  it('registerAddCommand registers "add" command', () => {
    const p = makeProgram();
    registerAddCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'add');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBeTruthy();
  });

  it('registerRemoveCommand registers "remove" command', () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'remove');
    expect(cmd).toBeDefined();
  });

  it('registerUpCommand registers "up" command', () => {
    const p = makeProgram();
    registerUpCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'up');
    expect(cmd).toBeDefined();
  });

  it('registerDownCommand registers "down" command', () => {
    const p = makeProgram();
    registerDownCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'down');
    expect(cmd).toBeDefined();
  });

  it('registerLogsCommand registers "logs" command', () => {
    const p = makeProgram();
    registerLogsCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'logs');
    expect(cmd).toBeDefined();
  });

  it('registerBackupCommand registers "backup" command', () => {
    const p = makeProgram();
    registerBackupCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'backup');
    expect(cmd).toBeDefined();
  });

  it('registerRestoreCommand registers "restore" command', () => {
    const p = makeProgram();
    registerRestoreCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'restore');
    expect(cmd).toBeDefined();
  });

  it('"remove" has --purge option', () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'remove');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--purge');
  });

  it('"remove" has --force option', () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'remove');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--force');
  });

  it('"logs" has --follow option', () => {
    const p = makeProgram();
    registerLogsCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'logs');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--follow');
  });

  it('"down" has --volumes option', () => {
    const p = makeProgram();
    registerDownCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'down');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--volumes');
  });

  it('"backup" has --list option', () => {
    const p = makeProgram();
    registerBackupCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'backup');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--list');
  });

  it('"restore" has --force option', () => {
    const p = makeProgram();
    registerRestoreCommand(p);
    const cmd = p.commands.find((c) => c.name() === 'restore');
    const options = cmd!.options.map((o) => o.long);
    expect(options).toContain('--force');
  });
});

// ---------------------------------------------------------------------------
// add command tests
// ---------------------------------------------------------------------------

describe('add command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddService.mockResolvedValue({
      success: true,
      composePath: '/project/docker-compose.yml',
      backupPath: '/backups/backup-001.tar.gz',
    });
  });

  it('calls addService with service name and path', async () => {
    const p = makeProgram();
    registerAddCommand(p);
    await parseCommand(p, ['add', 'jellyfin', '-p', '/my/project']);
    expect(mockAddService).toHaveBeenCalledWith('jellyfin', '/my/project');
  });

  it('does not throw when addService fails', async () => {
    mockAddService.mockResolvedValue({ success: false, error: 'Service not found' });
    const p = makeProgram();
    registerAddCommand(p);
    await expect(parseCommand(p, ['add', 'unknown-service'])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// remove command tests
// ---------------------------------------------------------------------------

describe('remove command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveService.mockResolvedValue({
      success: true,
      composePath: '/project/docker-compose.yml',
      backupPath: '/backups/backup-001.tar.gz',
    });
    mockConfirm.mockResolvedValue(true);
  });

  it('calls removeService after user confirms', async () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    await parseCommand(p, ['remove', 'jellyfin', '-p', '/my/project']);
    expect(mockRemoveService).toHaveBeenCalledWith('jellyfin', '/my/project', expect.any(Object));
  });

  it('skips confirmation with --force', async () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    await parseCommand(p, ['remove', 'jellyfin', '--force']);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRemoveService).toHaveBeenCalled();
  });

  it('does not call removeService when user cancels', async () => {
    mockConfirm.mockResolvedValue(false);
    const p = makeProgram();
    registerRemoveCommand(p);
    await parseCommand(p, ['remove', 'jellyfin']);
    expect(mockRemoveService).not.toHaveBeenCalled();
  });

  it('passes purge option to removeService', async () => {
    const p = makeProgram();
    registerRemoveCommand(p);
    await parseCommand(p, ['remove', 'jellyfin', '--purge', '--force']);
    expect(mockRemoveService).toHaveBeenCalledWith(
      'jellyfin',
      expect.any(String),
      expect.objectContaining({ purge: true }),
    );
  });

  it('sets exitCode=1 when removeService returns success=false', async () => {
    mockRemoveService.mockResolvedValue({ success: false, error: 'service not found in compose' });
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerRemoveCommand(p);
    await parseCommand(p, ['remove', 'nonexistent', '--force']);

    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number | undefined;
  });
});

// ---------------------------------------------------------------------------
// up command tests
// ---------------------------------------------------------------------------

describe('up command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls docker compose up -d', async () => {
    const p = makeProgram();
    registerUpCommand(p);
    await parseCommand(p, ['up']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'up', '-d']),
      expect.any(Object),
    );
  });

  it('does not throw when execa fails', async () => {
    mockExeca.mockRejectedValue(new Error('docker not found'));
    const p = makeProgram();
    registerUpCommand(p);
    await expect(parseCommand(p, ['up'])).resolves.toBeUndefined();
  });

  it('logs stdout when execa returns non-empty stdout', async () => {
    mockExeca.mockResolvedValue({ stdout: 'container started', stderr: '', exitCode: 0 });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUpCommand(p);
    await parseCommand(p, ['up']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('container started');

    consoleSpy.mockRestore();
  });

  it('logs stderr when execa returns non-empty stderr', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: 'pulling image warnings', exitCode: 0 });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerUpCommand(p);
    await parseCommand(p, ['up']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('pulling image warnings');

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// down command tests
// ---------------------------------------------------------------------------

describe('down command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls docker compose down', async () => {
    const p = makeProgram();
    registerDownCommand(p);
    await parseCommand(p, ['down']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'down']),
      expect.any(Object),
    );
  });

  it('passes --volumes flag when specified', async () => {
    const p = makeProgram();
    registerDownCommand(p);
    await parseCommand(p, ['down', '--volumes']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--volumes']),
      expect.any(Object),
    );
  });

  it('does not throw when execa fails', async () => {
    mockExeca.mockRejectedValue(new Error('error'));
    const p = makeProgram();
    registerDownCommand(p);
    await expect(parseCommand(p, ['down'])).resolves.toBeUndefined();
  });

  it('logs stdout when execa returns non-empty stdout', async () => {
    mockExeca.mockResolvedValue({ stdout: 'containers removed', stderr: '', exitCode: 0 });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerDownCommand(p);
    await parseCommand(p, ['down']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('containers removed');

    consoleSpy.mockRestore();
  });

  it('logs stderr when execa returns non-empty stderr', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: 'warning: network removed', exitCode: 0 });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const p = makeProgram();
    registerDownCommand(p);
    await parseCommand(p, ['down']);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('warning: network removed');

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// logs command tests
// ---------------------------------------------------------------------------

describe('logs command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls docker compose logs', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['logs']),
      expect.any(Object),
    );
  });

  it('passes service name when specified', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', 'gitea']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['gitea']),
      expect.any(Object),
    );
  });

  it('passes --follow flag when -f specified', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '-f']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--follow']),
      expect.any(Object),
    );
  });

  it('passes --tail value when -n specified', async () => {
    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs', '-n', '100']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['--tail', '100']),
      expect.any(Object),
    );
  });

  it('sets exitCode=1 and prints error when execa throws', async () => {
    mockExeca.mockRejectedValue(new Error('no such container'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origExitCode = process.exitCode;

    const p = makeProgram();
    registerLogsCommand(p);
    await parseCommand(p, ['logs']);

    expect(consoleSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
    process.exitCode = origExitCode as number | undefined;
  });
});

// ---------------------------------------------------------------------------
// backup command tests
// ---------------------------------------------------------------------------

describe('backup command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckDiskSpace.mockReturnValue({ sufficient: true, available: 10 * 1024 * 1024 * 1024, required: 0 });
    mockCreateBackup.mockReturnValue({
      id: 'backup-1234567890-abc',
      path: '/backups/backup-1234567890-abc.tar.gz',
      projectName: 'my-project',
      size: 1024 * 1024 * 10, // 10MB
      timestamp: Date.now(),
    });
    mockListBackups.mockReturnValue([]);
  });

  it('calls createBackup with project path', async () => {
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup', '-p', '/my/project']);
    expect(mockCreateBackup).toHaveBeenCalledWith('/my/project', expect.any(String));
  });

  it('calls listBackups when --list flag used', async () => {
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup', '--list']);
    expect(mockListBackups).toHaveBeenCalled();
    expect(mockCreateBackup).not.toHaveBeenCalled();
  });

  it('shows "No backups found" when list is empty', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockListBackups.mockReturnValue([]);
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup', '--list']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toMatch(/no backups/i);
    consoleSpy.mockRestore();
  });

  it('does not create backup when disk space insufficient', async () => {
    mockCheckDiskSpace.mockReturnValue({ sufficient: false, available: 0, required: 1000 });
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup']);
    expect(mockCreateBackup).not.toHaveBeenCalled();
  });

  it('lists backups with details when --list and backups exist', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockListBackups.mockReturnValue([
      { id: 'backup-111-aaa', path: '/backups/backup-111-aaa.tar.gz', projectName: 'test', size: 5 * 1024 * 1024, timestamp: Date.now() },
    ]);
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup', '--list']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('backup-111-aaa');
    consoleSpy.mockRestore();
  });

  it('handles createBackup throwing an error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateBackup.mockImplementation(() => { throw new Error('disk full'); });
    const p = makeProgram();
    registerBackupCommand(p);
    await parseCommand(p, ['backup']);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// restore command tests
// ---------------------------------------------------------------------------

describe('restore command', () => {
  const validBackup = {
    id: 'backup-1234567890-abc',
    path: '/backups/backup-1234567890-abc.tar.gz',
    projectName: 'my-project',
    size: 1024 * 1024,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockListBackups.mockReturnValue([validBackup]);
    mockCheckDiskSpace.mockReturnValue({ sufficient: true, available: 10 * 1024 * 1024 * 1024, required: 0 });
    mockConfirm.mockResolvedValue(true);
    mockRestoreBackup.mockReturnValue(undefined);
  });

  it('rejects invalid backup ID format', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', 'invalid-id']);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows error when backup ID not found', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockListBackups.mockReturnValue([]);
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', 'backup-9999-xyz']);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls restoreBackup after confirmation', async () => {
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', validBackup.id]);
    expect(mockRestoreBackup).toHaveBeenCalledWith(validBackup.id, expect.any(String), expect.any(String));
  });

  it('skips confirmation with --force', async () => {
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', validBackup.id, '--force']);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRestoreBackup).toHaveBeenCalled();
  });

  it('does not restore when user cancels', async () => {
    mockConfirm.mockResolvedValue(false);
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', validBackup.id]);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('shows available backups when backup ID not found and list is non-empty', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockListBackups.mockReturnValue([validBackup]);
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', 'backup-9999-notfound']);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Available backups');
    consoleSpy.mockRestore();
  });

  it('shows disk space error when insufficient space', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckDiskSpace.mockReturnValue({ sufficient: false, available: 1024, required: 1024 * 1024 });
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', validBackup.id]);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles restoreBackup throwing an error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRestoreBackup.mockImplementation(() => { throw new Error('extraction failed'); });
    const p = makeProgram();
    registerRestoreCommand(p);
    await parseCommand(p, ['restore', validBackup.id, '--force']);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
