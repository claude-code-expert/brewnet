/**
 * Additional unit tests for services/uninstall-manager
 *
 * Covers paths not exercised by existing test files:
 *   - readManifest: invalid fields (L108), JSON parse error (L112)
 *   - stopBoilerplateContainers: compose not found (L130-131), execa error (L142-144)
 *   - removeByManifest: boilerplate stack removal (L163-169), generatedDirs (L178-183)
 *   - runUninstall: orphan container cleanup via dockerode (L389-404)
 *   - runUninstall: CLI binary rmSync error (L496-497)
 *   - listInstallations: filesystem scan ~/brewnet/ (L584)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const existingPaths = new Set<string>();
const mockExistsSync = jest.fn((p: unknown) => existingPaths.has(p as string));
const mockRmSync = jest.fn();
const mockReaddirSync = jest.fn<() => { isDirectory: () => boolean; name: string }[]>(() => []);
const mockReadFileSync = jest.fn<(p: unknown) => string>(() => '{}');

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: mockReadFileSync,
}));

const mockExeca = jest.fn();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock dockerode for orphan container tests
const mockListContainers = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    listContainers: mockListContainers,
  })),
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { runUninstall, listInstallations } = await import(
  '../../../../packages/cli/src/services/uninstall-manager.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/tmp/extra-uninstall-test';

function makeValidManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    generatedFiles: ['docker-compose.yml', '.env'],
    generatedDirs: ['secrets'],
    boilerplateStacks: [
      { stackId: 'nodejs-express', directory: 'nodejs-express', port: 3000 },
    ],
    ...overrides,
  });
}

function defaultExeca() {
  mockExeca.mockResolvedValue({ stdout: 'net1', stderr: '', exitCode: 0 });
}

beforeEach(() => {
  existingPaths.clear();
  jest.clearAllMocks();
  mockListContainers.mockResolvedValue([]);
  defaultExeca();
  // Default readFileSync: return empty object (no manifest)
  mockReadFileSync.mockImplementation(() => '{}');
});

// ---------------------------------------------------------------------------
// readManifest — invalid fields (L108)
// ---------------------------------------------------------------------------

describe('readManifest — invalid manifest fields', () => {
  it('returns null when manifest missing generatedDirs and boilerplateStacks', async () => {
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        // Missing generatedDirs and boilerplateStacks — should return null
        return JSON.stringify({ generatedFiles: ['docker-compose.yml'] });
      }
      return '{}';
    });

    // When manifest is null, falls back to full directory rm
    await runUninstall({ projectPath: PROJECT_PATH });
    expect(mockRmSync).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// readManifest — JSON parse error (L112)
// ---------------------------------------------------------------------------

describe('readManifest — JSON parse error', () => {
  it('returns null and falls back to full rm on invalid JSON', async () => {
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return 'this is NOT valid JSON!!!';
      }
      return '{}';
    });

    await runUninstall({ projectPath: PROJECT_PATH });
    expect(mockRmSync).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// stopBoilerplateContainers — compose not found (L130-131)
// ---------------------------------------------------------------------------

describe('stopBoilerplateContainers — compose not found', () => {
  it('adds skipped entry when stack compose file is missing', async () => {
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    // Do NOT add the stack compose → compose not found
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return makeValidManifest();
      }
      return '{}';
    });

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(
      result.skipped.some((s) => s.includes('nodejs-express') && s.includes('compose not found')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stopBoilerplateContainers — execa error (L142-144)
// ---------------------------------------------------------------------------

describe('stopBoilerplateContainers — execa error', () => {
  it('records error when boilerplate compose down throws', async () => {
    const stackCompose = join(PROJECT_PATH, 'nodejs-express', 'docker-compose.yml');
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    existingPaths.add(stackCompose);
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return makeValidManifest();
      }
      return '{}';
    });

    // First call (boilerplate compose down) throws; rest succeed
    mockExeca
      .mockRejectedValueOnce(new Error('ENOENT: docker not found'))
      .mockResolvedValue({ stdout: 'net1', stderr: '', exitCode: 0 });

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.errors.some((e) => e.includes('nodejs-express'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeByManifest — boilerplate + generatedDirs removal (L163-183)
// ---------------------------------------------------------------------------

describe('removeByManifest — selective removal', () => {
  it('removes boilerplate stack directory listed in manifest', async () => {
    const stackDir = join(PROJECT_PATH, 'nodejs-express');
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    existingPaths.add(stackDir);
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return makeValidManifest({ generatedDirs: [] });
      }
      return '{}';
    });

    await runUninstall({ projectPath: PROJECT_PATH });
    expect(mockRmSync).toHaveBeenCalledWith(stackDir, { recursive: true, force: true });
  });

  it('removes generatedDirs listed in manifest', async () => {
    const secretsDir = join(PROJECT_PATH, 'secrets');
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    existingPaths.add(secretsDir);
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        // No boilerplate stacks to avoid confusing the test
        return makeValidManifest({ boilerplateStacks: [] });
      }
      return '{}';
    });

    await runUninstall({ projectPath: PROJECT_PATH });
    expect(mockRmSync).toHaveBeenCalledWith(secretsDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// runUninstall — orphan container cleanup (L389-404)
// ---------------------------------------------------------------------------

describe('runUninstall — orphan container cleanup', () => {
  it('removes orphan containers when found under projectPath', async () => {
    const subDir = join(PROJECT_PATH, 'nodejs-express');
    existingPaths.add(PROJECT_PATH);
    mockListContainers.mockResolvedValueOnce([
      {
        Id: 'abc123',
        Names: ['/nodejs-express'],
        Labels: {
          'com.docker.compose.project.working_dir': subDir,
          'com.docker.compose.config.files': 'docker-compose.yml',
        },
      },
    ]);

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.removed.some((r) => r.includes('Orphan containers'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runUninstall — CLI binary rmSync error (L496-497)
// ---------------------------------------------------------------------------

describe('runUninstall — CLI binary removal error', () => {
  it('records error when CLI binary cannot be removed', async () => {
    const binPath = join(homedir(), '.local', 'bin', 'brewnet');
    existingPaths.add(binPath);
    mockRmSync.mockImplementation((p: unknown) => {
      if (p === binPath) throw new Error('EACCES: permission denied');
    });

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.errors.some((e) => e.includes('permission denied') && e.includes('sudo'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// listInstallations — filesystem scan (L584)
// ---------------------------------------------------------------------------

describe('listInstallations — filesystem scan', () => {
  it('discovers projects via ~/brewnet/ directory scan', () => {
    const brewnetRoot = join(homedir(), 'brewnet');
    const projectName = 'fs-discovered-project';
    const composePath = join(brewnetRoot, projectName, 'docker-compose.yml');

    existingPaths.add(brewnetRoot);
    existingPaths.add(composePath);
    mockReaddirSync.mockImplementation((p: unknown) => {
      if (p === brewnetRoot) {
        return [{ isDirectory: () => true, name: projectName }];
      }
      return [];
    });

    const result = listInstallations();
    expect(result.some((r) => r.name === projectName)).toBe(true);
    expect(result.some((r) => r.path === `~/brewnet/${projectName}`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeByManifest — rmSync error on boilerplate stack dir (L168-169)
// ---------------------------------------------------------------------------

describe('removeByManifest — boilerplate stack rmSync error (L168-169)', () => {
  it('records error when rmSync throws removing boilerplate stack dir', async () => {
    const stackDir = join(PROJECT_PATH, 'nodejs-express');
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    existingPaths.add(stackDir);
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return makeValidManifest({ generatedDirs: [] });
      }
      return '{}';
    });
    mockRmSync.mockImplementation((p: unknown) => {
      if ((p as string) === stackDir) throw new Error('EACCES: permission denied on stackDir');
    });

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.errors.some((e) => e.includes('nodejs-express') && e.includes('permission denied'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeByManifest — rmSync error on generated dir (L182-183)
// ---------------------------------------------------------------------------

describe('removeByManifest — generatedDir rmSync error (L182-183)', () => {
  it('records error when rmSync throws removing generated directory', async () => {
    const secretsDir = join(PROJECT_PATH, 'secrets');
    existingPaths.add(PROJECT_PATH);
    existingPaths.add(join(PROJECT_PATH, '.brewnet-manifest.json'));
    existingPaths.add(secretsDir);
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('.brewnet-manifest.json')) {
        return makeValidManifest({ boilerplateStacks: [] });
      }
      return '{}';
    });
    mockRmSync.mockImplementation((p: unknown) => {
      if ((p as string) === secretsDir) throw new Error('EACCES: permission denied on secrets');
    });

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.errors.some((e) => e.includes('secrets') && e.includes('permission denied'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphanContainers — execa throws (L403-404)
// ---------------------------------------------------------------------------

describe('cleanupOrphanContainers — execa error (L403-404)', () => {
  it('records error when docker compose down throws for orphan containers', async () => {
    const subDir = join(PROJECT_PATH, 'nodejs-express');
    existingPaths.add(PROJECT_PATH);
    mockListContainers.mockResolvedValueOnce([
      {
        Id: 'abc123',
        Names: ['/nodejs-express'],
        Labels: {
          'com.docker.compose.project.working_dir': subDir,
          'com.docker.compose.config.files': 'docker-compose.yml',
        },
      },
    ]);
    // Make the orphan compose down throw
    mockExeca.mockRejectedValueOnce(new Error('docker compose failed'));

    const result = await runUninstall({ projectPath: PROJECT_PATH });
    expect(result.errors.some((e) => e.includes('orphan') && e.includes('nodejs-express'))).toBe(true);
  });
});
