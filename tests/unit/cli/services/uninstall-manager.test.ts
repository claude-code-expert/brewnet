/**
 * Unit tests for services/uninstall-manager module
 *
 * Covers: buildUninstallTargets, listInstallations, runUninstall
 * All file system and execa calls are mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExeca = jest.fn();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// Track which paths "exist"
const existingPaths = new Set<string>();
const mockExistsSync = jest.fn((p: unknown) => existingPaths.has(p as string));
const mockRmSync = jest.fn();
const mockReaddirSync = jest.fn<() => { isDirectory: () => boolean; name: string }[]>(() => []);
const mockReadFileSync = jest.fn<(p: string, e: string) => string>(() => '{}');

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: mockReadFileSync,
}));

const mockGetLastProject = jest.fn<() => string | null>(() => null);
const mockLoadState = jest.fn(() => null);
const mockGetProjectDir = jest.fn((name: string) => join(homedir(), '.brewnet', 'projects', name));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
  getProjectDir: mockGetProjectDir,
  createState: jest.fn(),
  saveState: jest.fn(),
  hasResumeState: jest.fn(() => false),
}));

jest.unstable_mockModule('../../../../packages/cli/src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  buildUninstallTargets,
  listInstallations,
  runUninstall,
  cleanupForRestart,
} = await import('../../../../packages/cli/src/services/uninstall-manager.js');

// ---------------------------------------------------------------------------
// buildUninstallTargets
// ---------------------------------------------------------------------------

describe('buildUninstallTargets', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
  });

  it('returns network target even without project path', () => {
    const targets = buildUninstallTargets(null, {});
    const network = targets.find((t) => t.type === 'network');
    expect(network).toBeDefined();
    expect(network?.label).toContain('Docker networks');
  });

  it('includes compose target when docker-compose.yml exists', () => {
    const projectPath = '/home/user/my-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));
    const targets = buildUninstallTargets(projectPath, {});
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose).toBeDefined();
  });

  it('does NOT include compose target when docker-compose.yml missing', () => {
    const targets = buildUninstallTargets('/home/user/no-compose', {});
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose).toBeUndefined();
  });

  it('includes directory target when projectPath provided', () => {
    const targets = buildUninstallTargets('/home/user/my-project', {});
    const dir = targets.find((t) => t.type === 'directory');
    expect(dir).toBeDefined();
    expect(dir?.path).toBe('/home/user/my-project');
  });

  it('marks directory target as skipped when keepConfig=true', () => {
    const targets = buildUninstallTargets('/home/user/my-project', { keepConfig: true });
    const dir = targets.find((t) => t.type === 'directory');
    expect(dir?.skipped).toBe(true);
    expect(dir?.skipReason).toBe('--keep-config');
  });

  it('does not include directory target when projectPath is null', () => {
    const targets = buildUninstallTargets(null, {});
    const dir = targets.find((t) => t.type === 'directory');
    expect(dir).toBeUndefined();
  });

  it('includes compose label with volumes when keepData=false', () => {
    const projectPath = '/home/user/my-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));
    const targets = buildUninstallTargets(projectPath, { keepData: false });
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose?.label).toContain('volumes');
  });

  it('includes compose label without volumes when keepData=true', () => {
    const projectPath = '/home/user/my-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));
    const targets = buildUninstallTargets(projectPath, { keepData: true });
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose?.label).not.toContain('volumes');
  });

  it('includes brewnet-meta target for ~/.brewnet/ when it exists', () => {
    existingPaths.add(join(homedir(), '.brewnet'));
    const targets = buildUninstallTargets(null, {});
    const meta = targets.filter((t) => t.type === 'brewnet-meta');
    expect(meta.length).toBeGreaterThanOrEqual(1);
    expect(meta.some((t) => t.label.includes('~/.brewnet/'))).toBe(true);
  });

  it('includes CLI binary as brewnet-meta target when binary exists', () => {
    const binPath = join(homedir(), '.local', 'bin', 'brewnet');
    existingPaths.add(binPath);
    const targets = buildUninstallTargets(null, {});
    const binary = targets.find((t) => t.type === 'brewnet-meta' && t.path === binPath);
    expect(binary).toBeDefined();
    expect(binary?.label).toContain('CLI binary');
  });

  it('does not include brewnet-meta targets when dirs do not exist', () => {
    const targets = buildUninstallTargets(null, {});
    const meta = targets.filter((t) => t.type === 'brewnet-meta');
    expect(meta.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listInstallations
// ---------------------------------------------------------------------------

describe('listInstallations', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
  });

  it('returns empty array when projects dir does not exist', () => {
    const result = listInstallations();
    expect(result).toEqual([]);
  });

  it('returns empty array when projects dir is empty', () => {
    const projectsDir = join(homedir(), '.brewnet', 'projects');
    existingPaths.add(projectsDir);
    mockReaddirSync.mockReturnValue([]);
    const result = listInstallations();
    expect(result).toEqual([]);
  });

  it('returns installations from subdirectories', () => {
    const projectsDir = join(homedir(), '.brewnet', 'projects');
    existingPaths.add(projectsDir);
    mockReaddirSync.mockReturnValue([
      { isDirectory: () => true, name: 'my-project' },
      { isDirectory: () => false, name: 'some-file.txt' },
    ]);
    mockLoadState.mockReturnValue({ projectPath: '/home/user/my-project' });
    const result = listInstallations();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('my-project');
    expect(result[0]?.path).toBe('/home/user/my-project');
  });

  it('sets path to null when state is missing', () => {
    const projectsDir = join(homedir(), '.brewnet', 'projects');
    existingPaths.add(projectsDir);
    mockReaddirSync.mockReturnValue([
      { isDirectory: () => true, name: 'orphan-project' },
    ]);
    mockLoadState.mockReturnValue(null);
    const result = listInstallations();
    expect(result[0]?.path).toBeNull();
  });

  it('returns empty array when readdirSync throws', () => {
    const projectsDir = join(homedir(), '.brewnet', 'projects');
    existingPaths.add(projectsDir);
    mockReaddirSync.mockImplementationOnce(() => { throw new Error('EACCES: permission denied'); });

    const result = listInstallations();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runUninstall — dry-run
// ---------------------------------------------------------------------------

describe('runUninstall (dry-run)', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
    mockGetLastProject.mockReturnValue(null);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('returns without calling execa in dry-run mode', async () => {
    const result = await runUninstall({ dryRun: true, projectPath: '/tmp/test' });
    expect(mockExeca).not.toHaveBeenCalled();
    expect(result.removed.length + result.skipped.length).toBeGreaterThan(0);
  });

  it('lists targets in removed array in dry-run', async () => {
    const result = await runUninstall({ dryRun: true, projectPath: '/tmp/test' });
    expect(result.removed.some((r) => r.includes('Docker networks'))).toBe(true);
  });

  it('adds skipped entries for keepConfig targets', async () => {
    const result = await runUninstall({ dryRun: true, projectPath: '/tmp/test', keepConfig: true });
    const skipped = result.skipped.find((s) => s.includes('--keep-config'));
    expect(skipped).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runUninstall — live (mocked)
// ---------------------------------------------------------------------------

describe('runUninstall (live)', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
    mockGetLastProject.mockReturnValue(null);
    mockRmSync.mockReset();
    mockExeca.mockReset();
    // Return network IDs for `docker network ls` calls; empty for everything else
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'docker' && Array.isArray(args) && args.includes('network') && args.includes('ls')) {
        return Promise.resolve({ stdout: 'net-aaa\nnet-bbb', stderr: '', exitCode: 0 });
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
  });

  it('removes docker networks', async () => {
    const result = await runUninstall({ projectPath: '/tmp/test' });
    expect(result.removed.some((r) => r.includes('Docker networks'))).toBe(true);
  });

  it('runs docker compose down when compose file exists', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    await runUninstall({ projectPath });
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'down']),
      expect.objectContaining({ cwd: projectPath }),
    );
  });

  it('adds --volumes flag when keepData is false', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    await runUninstall({ projectPath, keepData: false });
    const call = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(call?.[1]).toContain('--volumes');
  });

  it('omits --volumes flag when keepData is true', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    await runUninstall({ projectPath, keepData: true });
    const call = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(call?.[1]).not.toContain('--volumes');
  });

  it('removes project directory when it exists and keepConfig is false', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(projectPath);

    await runUninstall({ projectPath, keepConfig: false });
    expect(mockRmSync).toHaveBeenCalledWith(projectPath, { recursive: true, force: true });
  });

  it('does NOT remove project directory when keepConfig is true', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(projectPath);

    await runUninstall({ projectPath, keepConfig: true });
    expect(mockRmSync).not.toHaveBeenCalledWith(projectPath, expect.anything());
  });

  it('continues when docker compose down fails (non-fatal)', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    // First call (compose down) fails; network ls and network rm still succeed
    mockExeca
      .mockRejectedValueOnce(new Error('compose down failed'))
      .mockResolvedValue({ stdout: 'net-aaa\nnet-bbb', stderr: '', exitCode: 0 });

    const result = await runUninstall({ projectPath });
    // Should still have removed networks even after compose down failed
    expect(result.errors.some((e) => e.includes('compose down'))).toBe(true);
    expect(result.removed.some((r) => r.includes('Docker networks'))).toBe(true);
  });

  it('resolves last project from wizard state when no projectPath given', async () => {
    mockGetLastProject.mockReturnValue('my-saved-project');
    mockLoadState.mockReturnValue({ projectPath: '/home/user/my-saved-project', projectName: 'my-saved-project' });

    await runUninstall({});
    // Should call docker network ls then network rm
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['network', 'ls']),
      expect.anything(),
    );
  });

  it('returns success=false when rmSync throws on project dir', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(projectPath);
    mockRmSync.mockImplementationOnce(() => { throw new Error('permission denied'); });

    const result = await runUninstall({ projectPath });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('permission denied'))).toBe(true);
  });

  it('adds Docker networks to skipped when execa throws for network rm', async () => {
    // No compose file at projectPath, so only execa call = docker network rm
    mockExeca.mockRejectedValueOnce(new Error('docker not found'));

    const result = await runUninstall({ projectPath: '/tmp/test' });
    expect(result.skipped).toContain('Docker networks (not found or already removed)');
  });

  it('removes entire ~/.brewnet/ directory and adds to removed list', async () => {
    existingPaths.add(join(homedir(), '.brewnet'));

    const result = await runUninstall({ projectPath: '/tmp/test' });
    expect(result.removed).toContain('~/.brewnet/ (all data, source, config)');
    expect(mockRmSync).toHaveBeenCalledWith(
      join(homedir(), '.brewnet'),
      { recursive: true, force: true },
    );
  });

  it('adds to errors when rmSync throws for brewnet dir removal', async () => {
    existingPaths.add(join(homedir(), '.brewnet'));
    mockRmSync.mockImplementationOnce(() => { throw new Error('EPERM: operation not permitted'); });

    const result = await runUninstall({ projectPath: '/tmp/test' });
    expect(result.errors.some((e) => e.includes('EPERM'))).toBe(true);
  });

  it('removes CLI binary and adds to removed list', async () => {
    const binPath = join(homedir(), '.local', 'bin', 'brewnet');
    existingPaths.add(binPath);

    const result = await runUninstall({ projectPath: '/tmp/test' });
    expect(result.removed.some((r) => r.includes('CLI binary'))).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(binPath, { force: true });
  });

  it('removes wizard state project dir when projectName is resolved', async () => {
    const projectStateDir = join(homedir(), '.brewnet', 'projects', 'my-project');
    existingPaths.add(projectStateDir);
    mockGetLastProject.mockReturnValue('my-project');
    mockLoadState.mockReturnValue({ projectPath: '/tmp/my-project', projectName: 'my-project' });

    const result = await runUninstall({});
    expect(result.removed.some((r) => r.includes('Wizard state'))).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(projectStateDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// cleanupForRestart
// ---------------------------------------------------------------------------

describe('cleanupForRestart', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
    mockRmSync.mockReset();
    mockExeca.mockReset();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('calls docker compose down when compose file exists', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    await cleanupForRestart(projectPath);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', '-f', expect.stringContaining('docker-compose.yml'), 'down', '--volumes', '--remove-orphans']),
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('skips docker compose down when no compose file', async () => {
    await cleanupForRestart('/tmp/test-project');
    const composeDownCalls = mockExeca.mock.calls.filter(
      (c) => (c[1] as string[]).includes('down'),
    );
    expect(composeDownCalls).toHaveLength(0);
  });

  it('removes docker networks', async () => {
    await cleanupForRestart('/tmp/test-project');
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['network', 'rm', 'brewnet'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['network', 'rm', 'brewnet-internal'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('removes project directory when it exists', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(projectPath);

    await cleanupForRestart(projectPath);
    expect(mockRmSync).toHaveBeenCalledWith(projectPath, { recursive: true, force: true });
  });

  it('does NOT remove ~/.brewnet/ directory', async () => {
    existingPaths.add(join(homedir(), '.brewnet'));

    await cleanupForRestart('/tmp/test-project');
    expect(mockRmSync).not.toHaveBeenCalledWith(
      join(homedir(), '.brewnet'),
      expect.anything(),
    );
  });

  it('handles docker compose down errors gracefully', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(join(projectPath, 'docker-compose.yml'));
    mockExeca.mockRejectedValue(new Error('docker not running'));

    // Should not throw
    await expect(cleanupForRestart(projectPath)).resolves.toBeUndefined();
  });

  it('handles network rm errors gracefully', async () => {
    mockExeca.mockRejectedValue(new Error('network not found'));

    // Should not throw
    await expect(cleanupForRestart('/tmp/test')).resolves.toBeUndefined();
  });

  it('handles rmSync errors gracefully', async () => {
    const projectPath = '/tmp/test-project';
    existingPaths.add(projectPath);
    mockRmSync.mockImplementation(() => { throw new Error('EPERM'); });

    // Should not throw
    await expect(cleanupForRestart(projectPath)).resolves.toBeUndefined();
  });

  it('expands tilde in project path', async () => {
    const projectPath = '~/brewnet/my-project';
    const expanded = join(homedir(), 'brewnet/my-project');
    existingPaths.add(expanded);

    await cleanupForRestart(projectPath);
    expect(mockRmSync).toHaveBeenCalledWith(expanded, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// runUninstall — manifest-based selective removal
// ---------------------------------------------------------------------------

describe('runUninstall — manifest-based removal', () => {
  const projectPath = '/tmp/manifest-project';
  const manifestPath = join(projectPath, '.brewnet-manifest.json');

  const baseManifest = {
    schemaVersion: 1 as const,
    projectName: 'manifest-project',
    projectPath,
    createdAt: '2026-01-01T00:00:00.000Z',
    generatedFiles: ['docker-compose.yml', '.env', '.env.example', '.gitignore', '.brewnet-manifest.json'],
    generatedDirs: ['secrets', 'logs'],
    boilerplateStacks: [],
  };

  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
    mockGetLastProject.mockReturnValue(null);
    mockRmSync.mockReset();
    mockExeca.mockReset();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockReaddirSync.mockReturnValue([]);
    mockReadFileSync.mockReturnValue(JSON.stringify(baseManifest));
  });

  it('uses manifest-based removal and preserves user files when directory is not empty', async () => {
    existingPaths.add(manifestPath);
    existingPaths.add(projectPath);
    // Simulate a user-created file remaining after brewnet files are removed
    mockReaddirSync.mockReturnValue([
      { name: 'my-notes.md', isDirectory: () => false } as { isDirectory: () => boolean; name: string },
    ]);

    const result = await runUninstall({ projectPath });

    // Should NOT rm -rf projectPath when user files remain
    const recursiveCalls = (mockRmSync as jest.Mock).mock.calls.filter(
      (call) => call[0] === projectPath && call[1]?.recursive === true,
    );
    expect(recursiveCalls).toHaveLength(0);
    expect(result.skipped.some((s) => s.includes('user file'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falls back to full rm -rf when manifest is missing', async () => {
    // manifest NOT in existingPaths
    existingPaths.add(projectPath);
    existingPaths.add(join(projectPath, 'docker-compose.yml'));

    const result = await runUninstall({ projectPath });

    expect(mockRmSync).toHaveBeenCalledWith(projectPath, { recursive: true, force: true });
    expect(result.removed).toContain(`Project directory: ${projectPath}`);
  });

  it('stops boilerplate containers before main compose when manifest has stacks', async () => {
    const stackDir = join(projectPath, 'python-fastapi');
    const stackCompose = join(stackDir, 'docker-compose.yml');
    const manifestWithStack = {
      ...baseManifest,
      boilerplateStacks: [{ stackId: 'python-fastapi', directory: 'python-fastapi' }],
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestWithStack));
    existingPaths.add(manifestPath);
    existingPaths.add(stackCompose);
    existingPaths.add(projectPath);

    await runUninstall({ projectPath });

    // boilerplate compose down should be called before main compose
    const calls = (mockExeca as jest.Mock).mock.calls as string[][];
    const bpCall = calls.find((c) => c[1]?.includes?.('docker-compose.yml') ||
      (Array.isArray(c[1]) && c[1].includes('compose')));
    expect(bpCall).toBeDefined();
    // The call with stackDir as cwd should be first among compose calls
    const composeCalls = (mockExeca as jest.Mock).mock.calls.filter(
      (c: unknown[]) => (c[0] as string) === 'docker' && Array.isArray(c[1]) && (c[1] as string[]).includes('compose'),
    );
    expect(composeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows boilerplate containers in buildUninstallTargets when manifest exists', () => {
    const stackCompose = join(projectPath, 'python-fastapi', 'docker-compose.yml');
    const manifestWithStack = {
      ...baseManifest,
      boilerplateStacks: [{ stackId: 'python-fastapi', directory: 'python-fastapi' }],
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestWithStack));
    existingPaths.add(manifestPath);
    existingPaths.add(stackCompose);

    const targets = buildUninstallTargets(projectPath, {});
    const bpTarget = targets.find((t) => t.label.includes('python-fastapi'));
    expect(bpTarget).toBeDefined();
    expect(bpTarget?.type).toBe('compose');
  });
});
