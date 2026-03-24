/**
 * Unit tests for commands: export, storage
 *
 * Tests action handler logic via parseAsync.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecaFn = jest.fn<() => Promise<{ stdout: string; stderr: string }>>().mockResolvedValue({ stdout: '', stderr: '' });
jest.unstable_mockModule('execa', () => ({ execa: mockExecaFn }));

const mockOraInstance = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  text: '',
};
jest.unstable_mockModule('ora', () => ({ default: jest.fn(() => mockOraInstance) }));

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => { fsContent[p as string] = data as string; });
const mockMkdirSync = jest.fn();
const mockMkdtempSync = jest.fn(() => '/tmp/brewnet-export-abc123');
const mockCpSync = jest.fn();
const mockRmSync = jest.fn();
const mockStatSync = jest.fn(() => ({ size: 1234 }));

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  mkdtempSync: mockMkdtempSync,
  cpSync: mockCpSync,
  rmSync: mockRmSync,
  statSync: mockStatSync,
  readdirSync: jest.fn(() => []),
  chmodSync: jest.fn(),
}));

jest.unstable_mockModule('node:os', () => {
  const mod = { homedir: () => '/home/user', tmpdir: () => '/tmp' };
  return { ...mod, default: mod };
});

const mockLoadState = jest.fn();
const mockGetLastProject = jest.fn(() => 'my-project');
const mockGetStateFilePath = jest.fn(() => '/home/user/.brewnet/projects/my-project/selections.json');
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  loadState: mockLoadState,
  getLastProject: mockGetLastProject,
  getStateFilePath: mockGetStateFilePath,
}));

const mockInitStorage = jest.fn<() => Promise<{ success: boolean; backend: string; envPatched: boolean; error?: string }>>().mockResolvedValue({
  success: true,
  backend: 'nextcloud',
  envPatched: true,
});
const mockGetInstalledStorageBackends = jest.fn<() => string[]>(() => []);
const mockStorageBackends = ['nextcloud', 'minio', 'filebrowser', 'jellyfin'];
jest.unstable_mockModule('../../../../packages/cli/src/services/storage-manager.js', () => ({
  initStorage: mockInitStorage,
  getInstalledStorageBackends: mockGetInstalledStorageBackends,
  STORAGE_BACKENDS: mockStorageBackends,
}));

jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: jest.fn<() => Promise<string>>().mockResolvedValue('nextcloud'),
  input: jest.fn<() => Promise<string>>().mockResolvedValue('admin'),
  password: jest.fn<() => Promise<string>>().mockResolvedValue('secret'),
  confirm: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { registerExportCommand } = await import('../../../../packages/cli/src/commands/export.js');
const { registerStorageCommand } = await import('../../../../packages/cli/src/commands/storage.js');

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
  } finally {
    process.exitCode = 0;
  }
}

// ---------------------------------------------------------------------------
// export command
// ---------------------------------------------------------------------------

describe('export — registration', () => {
  it('registers the "export" command', () => {
    const p = makeProgram();
    registerExportCommand(p);
    expect(p.commands.find((c) => c.name() === 'export')).toBeDefined();
  });
});

describe('export — action', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue({ projectPath: '/home/user/brewnet/my-project' });
  });

  it('fails with error when no project found', async () => {
    mockGetLastProject.mockReturnValue('');
    let errMsg = '';
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errMsg += String(s); });
    const p = makeProgram();
    registerExportCommand(p);
    await parseCommand(p, ['export']);
    expect(errMsg).toContain('No project found');
  });

  it('succeeds when wizard state and files exist', async () => {
    fsContent['/home/user/.brewnet/projects/my-project/selections.json'] = '{}';
    fsContent['/home/user/brewnet/my-project/docker-compose.yml'] = 'version: "3"';
    fsContent['/home/user/brewnet/my-project/.env'] = 'KEY=val';
    mockStatSync.mockReturnValue({ size: 2048 });
    mockExistsSync.mockImplementation((p: unknown) => (p as string) in fsContent);

    const p = makeProgram();
    registerExportCommand(p);
    await parseCommand(p, ['export', '--project', 'my-project', '--output', '/tmp']);
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });

  it('fails when loadState returns null', async () => {
    mockLoadState.mockReturnValue(null);
    const p = makeProgram();
    registerExportCommand(p);
    await parseCommand(p, ['export', '--project', 'my-project', '--output', '/tmp']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
  });

  it('fails when tar command fails', async () => {
    fsContent['/home/user/.brewnet/projects/my-project/selections.json'] = '{}';
    mockExistsSync.mockImplementation((p: unknown) => (p as string) in fsContent);
    mockExecaFn.mockRejectedValueOnce(new Error('tar: command not found'));

    const p = makeProgram();
    registerExportCommand(p);
    await parseCommand(p, ['export', '--project', 'my-project', '--output', '/tmp']);
    expect(mockOraInstance.fail).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// storage command
// ---------------------------------------------------------------------------

describe('storage — registration', () => {
  it('registers the "storage" command with subcommands', () => {
    const p = makeProgram();
    registerStorageCommand(p);
    const storage = p.commands.find((c) => c.name() === 'storage');
    expect(storage).toBeDefined();
    expect(storage!.commands.length).toBeGreaterThan(0);
  });
});

describe('storage init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockInitStorage.mockResolvedValue({ success: true, backend: 'nextcloud', envPatched: true });
  });

  it('succeeds with --service and --yes flags', async () => {
    const p = makeProgram();
    registerStorageCommand(p);
    await parseCommand(p, ['storage', 'init', '--service', 'nextcloud', '--yes', '--path', '/proj']);
    expect(mockInitStorage).toHaveBeenCalledWith('nextcloud', expect.objectContaining({ projectPath: '/proj' }));
  });

  it('shows error when initStorage fails', async () => {
    mockInitStorage.mockResolvedValueOnce({
      success: false,
      backend: 'nextcloud',
      envPatched: false,
      error: 'Service already exists',
    });
    const p = makeProgram();
    registerStorageCommand(p);
    await parseCommand(p, ['storage', 'init', '--service', 'nextcloud', '--yes', '--path', '/proj']);
    // Failure goes through spinner.fail(), not console.error
    expect(mockOraInstance.fail).toHaveBeenCalledWith(
      expect.stringContaining('already exists'),
    );
  });

  it('accepts minio as backend', async () => {
    mockInitStorage.mockResolvedValue({ success: true, backend: 'minio', envPatched: true });
    const p = makeProgram();
    registerStorageCommand(p);
    await parseCommand(p, ['storage', 'init', '--service', 'minio', '--yes', '--path', '/proj']);
    expect(mockInitStorage).toHaveBeenCalledWith('minio', expect.any(Object));
  });
});

describe('storage status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows installed backends', async () => {
    mockGetInstalledStorageBackends.mockReturnValue(['nextcloud', 'minio']);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerStorageCommand(p);
    await parseCommand(p, ['storage', 'status', '--path', '/proj']);
    // Display shows the label ("Nextcloud") not the backend id
    expect(output).toContain('Nextcloud');
    expect(output).toContain('MinIO');
    expect(output).toContain('Installed');
  });

  it('shows message when no backends installed', async () => {
    mockGetInstalledStorageBackends.mockReturnValue([]);
    let output = '';
    jest.spyOn(console, 'log').mockImplementation((s: unknown) => { output += String(s) + '\n'; });
    const p = makeProgram();
    registerStorageCommand(p);
    await parseCommand(p, ['storage', 'status', '--path', '/proj']);
    // Should show something about no backends or available backends
    expect(output.length).toBeGreaterThan(0);
  });
});
