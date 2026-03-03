/**
 * Complete Cleanup Verification Tests
 *
 * Verifies that `brewnet uninstall` cleanly removes ALL brewnet artifacts
 * while leaving Docker engine untouched.
 *
 * Cleanup targets:
 *   1. Docker containers (compose down)
 *   2. Docker volumes (--volumes)
 *   3. Docker images (--rmi all)
 *   4. Docker networks (brewnet, brewnet-internal)
 *   5. Project directory (~/brewnet/<name>/)
 *   6. ~/.brewnet/ directory (config.json, projects/, logs/, db/, status/)
 *   7. CLI binary (3 known locations)
 *   8. Wizard state fallback (projects/<name>/)
 *
 * NOT removed:
 *   - Docker engine itself
 *   - System packages
 *   - User data outside brewnet directories
 *
 * @module tests/unit/cli/services/uninstall-complete-cleanup
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

const existingPaths = new Set<string>();
const mockExistsSync = jest.fn((p: unknown) => existingPaths.has(p as string));
const mockRmSync = jest.fn();
const mockReaddirSync = jest.fn<() => { isDirectory: () => boolean; name: string }[]>(() => []);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(() => '{}'),
}));

const mockGetLastProject = jest.fn<() => string | null>(() => 'my-homeserver');
const mockLoadState = jest.fn(() => ({
  projectPath: '~/brewnet/my-homeserver',
  projectName: 'my-homeserver',
}));
const mockGetProjectDir = jest.fn(
  (name: string) => join(homedir(), '.brewnet', 'projects', name),
);

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  getLastProject: mockGetLastProject,
  loadState: mockLoadState,
  getProjectDir: mockGetProjectDir,
  createState: jest.fn(),
  saveState: jest.fn(),
  hasResumeState: jest.fn(() => false),
}));

jest.unstable_mockModule('../../../../packages/cli/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  runUninstall,
  buildUninstallTargets,
} = await import('../../../../packages/cli/src/services/uninstall-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOME = homedir();
const BREWNET_DIR = join(HOME, '.brewnet');
const PROJECT_PATH = join(HOME, 'brewnet', 'my-homeserver');
const COMPOSE_FILE = join(PROJECT_PATH, 'docker-compose.yml');

/** Simulate a realistic brewnet installation with all possible artifacts. */
function setupFullInstallation() {
  existingPaths.clear();

  // Project directory + compose file
  existingPaths.add(PROJECT_PATH);
  existingPaths.add(COMPOSE_FILE);

  // ~/.brewnet/ directory and subdirectories
  existingPaths.add(BREWNET_DIR);
  existingPaths.add(join(BREWNET_DIR, 'config.json'));
  existingPaths.add(join(BREWNET_DIR, 'projects'));
  existingPaths.add(join(BREWNET_DIR, 'projects', 'my-homeserver'));
  existingPaths.add(join(BREWNET_DIR, 'logs'));
  existingPaths.add(join(BREWNET_DIR, 'db'));
  existingPaths.add(join(BREWNET_DIR, 'status'));

  // CLI binary (first known location)
  existingPaths.add(join(HOME, '.local', 'bin', 'brewnet'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  existingPaths.clear();
  mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
  mockRmSync.mockReset();
  mockExeca.mockReset();
  // Return network IDs for `docker network ls` calls; empty for everything else
  mockExeca.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === 'docker' && Array.isArray(args) && args.includes('network') && args.includes('ls')) {
      return Promise.resolve({ stdout: 'net-aaa\nnet-bbb', stderr: '', exitCode: 0 });
    }
    return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
  });
  mockGetLastProject.mockReturnValue('my-homeserver');
  mockLoadState.mockReturnValue({
    projectPath: '~/brewnet/my-homeserver',
    projectName: 'my-homeserver',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Full cleanup verification
// ═══════════════════════════════════════════════════════════════════════════

describe('full uninstall cleanup verification', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('removes Docker containers via docker compose down', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    const composeDownCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(composeDownCall).toBeDefined();
    expect(composeDownCall![0]).toBe('docker');
    expect(composeDownCall![1]).toContain('compose');
    expect(composeDownCall![1]).toContain('down');
  });

  it('removes Docker volumes with --volumes flag', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: false });

    const composeDownCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(composeDownCall![1]).toContain('--volumes');
  });

  it('removes Docker images with --rmi all flag', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: false });

    const composeDownCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(composeDownCall![1]).toContain('--rmi');
    expect(composeDownCall![1]).toContain('all');
  });

  it('removes Docker networks (brewnet + brewnet-internal)', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    // Implementation: docker network ls --filter name=brewnet -q → then docker network rm [ids]
    const networkLsCall = mockExeca.mock.calls.find(
      (c) =>
        (c[0] as string) === 'docker' &&
        (c[1] as string[]).includes('network') &&
        (c[1] as string[]).includes('ls'),
    );
    expect(networkLsCall).toBeDefined();
    expect(networkLsCall![1]).toContain('--filter');

    const networkRmCall = mockExeca.mock.calls.find(
      (c) =>
        (c[0] as string) === 'docker' &&
        (c[1] as string[]).includes('network') &&
        (c[1] as string[]).includes('rm'),
    );
    expect(networkRmCall).toBeDefined();
  });

  it('removes project directory (~/brewnet/<name>/)', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    expect(mockRmSync).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
  });

  it('removes entire ~/.brewnet/ directory', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    expect(mockRmSync).toHaveBeenCalledWith(BREWNET_DIR, { recursive: true, force: true });
  });

  it('removes wizard state directory as fallback', async () => {
    const stateDir = join(BREWNET_DIR, 'projects', 'my-homeserver');
    existingPaths.add(stateDir);

    await runUninstall({ projectPath: PROJECT_PATH, projectName: 'my-homeserver' });

    expect(mockRmSync).toHaveBeenCalledWith(stateDir, { recursive: true, force: true });
  });

  it('removes CLI binary from known install locations', async () => {
    const binPath = join(HOME, '.local', 'bin', 'brewnet');

    await runUninstall({ projectPath: PROJECT_PATH });

    expect(mockRmSync).toHaveBeenCalledWith(binPath, { force: true });
  });

  it('checks all three CLI binary locations', async () => {
    const bins = [
      join(HOME, '.local', 'bin', 'brewnet'),
      '/usr/local/bin/brewnet',
      '/usr/bin/brewnet',
    ];
    for (const bin of bins) existingPaths.add(bin);

    const result = await runUninstall({ projectPath: PROJECT_PATH });

    const binaryRemovals = result.removed.filter((r) => r.includes('CLI binary'));
    expect(binaryRemovals).toHaveLength(3);
  });

  it('result.removed covers all major cleanup categories', async () => {
    const removed = (await runUninstall({ projectPath: PROJECT_PATH })).removed;
    const categories = removed.join(' | ').toLowerCase();

    expect(categories).toMatch(/docker.*containers/i);
    expect(categories).toMatch(/docker.*networks/i);
    expect(categories).toMatch(/project.*directory/i);
    expect(categories).toMatch(/\.brewnet/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Docker engine is NEVER touched
// ═══════════════════════════════════════════════════════════════════════════

describe('Docker engine is never removed', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('never calls docker uninstall / remove / purge', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockExeca.mock.calls) {
      const args = (call[1] as string[]).join(' ');
      expect(args).not.toMatch(/uninstall|remove.*docker|purge/i);
    }
  });

  it('never calls brew/apt/yum to remove docker', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockExeca.mock.calls) {
      const cmd = call[0] as string;
      expect(cmd).not.toBe('brew');
      expect(cmd).not.toBe('apt');
      expect(cmd).not.toBe('apt-get');
      expect(cmd).not.toBe('yum');
      expect(cmd).not.toBe('dnf');
    }
  });

  it('only executes docker compose and docker network commands', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockExeca.mock.calls) {
      const cmd = call[0] as string;
      const subCmd = (call[1] as string[])[0];
      expect(cmd).toBe('docker');
      expect(['compose', 'network']).toContain(subCmd);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// --keep-data preserves volumes and images
// ═══════════════════════════════════════════════════════════════════════════

describe('--keep-data mode', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('omits --volumes flag from compose down when keepData=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: true });

    const downCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(downCall![1]).not.toContain('--volumes');
  });

  it('omits --rmi flag from compose down when keepData=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: true });

    const downCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(downCall![1]).not.toContain('--rmi');
  });

  it('still removes project directory when keepData=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: true });

    expect(mockRmSync).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
  });

  it('still removes ~/.brewnet/ when keepData=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: true });

    expect(mockRmSync).toHaveBeenCalledWith(BREWNET_DIR, { recursive: true, force: true });
  });

  it('still removes CLI binary when keepData=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: true });

    const binPath = join(HOME, '.local', 'bin', 'brewnet');
    expect(mockRmSync).toHaveBeenCalledWith(binPath, { force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// --keep-config preserves project directory
// ═══════════════════════════════════════════════════════════════════════════

describe('--keep-config mode', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('does NOT remove project directory when keepConfig=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepConfig: true });

    expect(mockRmSync).not.toHaveBeenCalledWith(
      PROJECT_PATH,
      { recursive: true, force: true },
    );
  });

  it('still runs docker compose down when keepConfig=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepConfig: true });

    const downCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    expect(downCall).toBeDefined();
  });

  it('still removes Docker networks when keepConfig=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepConfig: true });

    // network ls should be called to discover networks
    const networkLsCall = mockExeca.mock.calls.find(
      (c) =>
        (c[0] as string) === 'docker' &&
        (c[1] as string[]).includes('network') &&
        (c[1] as string[]).includes('ls'),
    );
    expect(networkLsCall).toBeDefined();
  });

  it('still removes ~/.brewnet/ when keepConfig=true', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepConfig: true });

    expect(mockRmSync).toHaveBeenCalledWith(BREWNET_DIR, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildUninstallTargets labels
// ═══════════════════════════════════════════════════════════════════════════

describe('buildUninstallTargets label accuracy', () => {
  beforeEach(() => {
    existingPaths.clear();
    mockExistsSync.mockImplementation((p: unknown) => existingPaths.has(p as string));
  });

  it('full uninstall compose label includes volumes + images', () => {
    existingPaths.add(COMPOSE_FILE);
    const targets = buildUninstallTargets(PROJECT_PATH, { keepData: false });
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose?.label).toContain('volumes');
    expect(compose?.label).toContain('images');
  });

  it('keepData compose label omits volumes and images', () => {
    existingPaths.add(COMPOSE_FILE);
    const targets = buildUninstallTargets(PROJECT_PATH, { keepData: true });
    const compose = targets.find((t) => t.type === 'compose');
    expect(compose?.label).not.toContain('volumes');
    expect(compose?.label).not.toContain('images');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// compose down --rmi all args verification
// ═══════════════════════════════════════════════════════════════════════════

describe('compose down args ordering', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('passes correct arg sequence: compose -f <file> down --volumes --rmi all', async () => {
    await runUninstall({ projectPath: PROJECT_PATH, keepData: false });

    const downCall = mockExeca.mock.calls.find(
      (c) => (c[0] as string) === 'docker' && (c[1] as string[]).includes('down'),
    );
    const args = downCall![1] as string[];
    expect(args[0]).toBe('compose');
    expect(args[1]).toBe('-f');
    expect(args[2]).toBe('docker-compose.yml');
    expect(args[3]).toBe('down');
    expect(args).toContain('--volumes');
    expect(args).toContain('--rmi');
    // 'all' should follow '--rmi'
    const rmiIdx = args.indexOf('--rmi');
    expect(args[rmiIdx + 1]).toBe('all');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error resilience — partial failures don't stop cleanup
// ═══════════════════════════════════════════════════════════════════════════

describe('error resilience during full uninstall', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('continues removing files even when docker compose down fails', async () => {
    mockExeca.mockRejectedValueOnce(new Error('docker not running'));
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const result = await runUninstall({ projectPath: PROJECT_PATH });

    // docker compose down failed but file cleanup should still proceed
    expect(result.errors.some((e) => e.includes('compose down'))).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
    expect(mockRmSync).toHaveBeenCalledWith(BREWNET_DIR, { recursive: true, force: true });
  });

  it('continues removing ~/.brewnet/ even when project dir removal fails', async () => {
    let callCount = 0;
    mockRmSync.mockImplementation((_path: unknown) => {
      callCount++;
      if (callCount === 1) throw new Error('EPERM');
      // subsequent calls succeed
    });

    const result = await runUninstall({ projectPath: PROJECT_PATH });

    expect(result.errors.some((e) => e.includes('EPERM'))).toBe(true);
    // Second call to rmSync should still happen (for ~/.brewnet/)
    expect(mockRmSync.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns success=false when any error occurs', async () => {
    mockExeca.mockRejectedValueOnce(new Error('compose down error'));
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const result = await runUninstall({ projectPath: PROJECT_PATH });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No files outside brewnet scope are touched
// ═══════════════════════════════════════════════════════════════════════════

describe('scope boundary — only brewnet files are removed', () => {
  beforeEach(() => {
    setupFullInstallation();
  });

  it('rmSync is only called with brewnet-related paths', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockRmSync.mock.calls) {
      const path = call[0] as string;
      const isBrewnetPath =
        path.includes('brewnet') ||
        path.includes('.brewnet') ||
        path === '/usr/local/bin/brewnet' ||
        path === '/usr/bin/brewnet';
      expect(isBrewnetPath).toBe(true);
    }
  });

  it('never touches home directory itself', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockRmSync.mock.calls) {
      const path = call[0] as string;
      expect(path).not.toBe(HOME);
      expect(path).not.toBe(HOME + '/');
    }
  });

  it('never touches /etc, /var, or /tmp', async () => {
    await runUninstall({ projectPath: PROJECT_PATH });

    for (const call of mockRmSync.mock.calls) {
      const path = call[0] as string;
      expect(path).not.toMatch(/^\/(etc|var|tmp)\//);
    }
  });
});
