/**
 * Unit tests for services/storage-manager
 *
 * Covers: initStorage, getInstalledStorageBackends, STORAGE_BACKENDS constant,
 *         buildEnvEntries (via initStorage), patchEnvFile (via initStorage side effects)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const COMPOSE_PATH = '/project/docker-compose.yml';
const ENV_PATH = '/project/.env';

const composeFsContent: Record<string, string> = {};
let envContent = '';
const writtenFiles: Record<string, string> = {};

const mockExistsSync = jest.fn((p: unknown) => {
  if (p === COMPOSE_PATH) return true;
  if (p === ENV_PATH) return envContent.length > 0;
  return (p as string) in composeFsContent;
});

const mockReadFileSync = jest.fn((p: unknown) => {
  if (p === ENV_PATH) return envContent;
  return composeFsContent[p as string] ?? '';
});

const mockWriteFileSync = jest.fn((p: unknown, content: unknown) => {
  writtenFiles[p as string] = content as string;
  if (p === ENV_PATH) envContent = content as string;
});

const mockCopyFileSync = jest.fn();
const mockReaddirSync = jest.fn<() => string[]>(() => []);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  copyFileSync: mockCopyFileSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
}));

// service-manager returns a success result for addService
const mockAddService = jest.fn(async (_id: string, _path: string) => ({
  success: true,
  composePath: COMPOSE_PATH,
  backupPath: COMPOSE_PATH + '.bak',
}));

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/service-manager.js',
  () => ({ addService: mockAddService }),
);

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------

const {
  initStorage,
  getInstalledStorageBackends,
  STORAGE_BACKENDS,
} = await import('../../../../packages/cli/src/services/storage-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompose(services: string[]): string {
  const svcBlock = services.map((s) => `  ${s}:\n    image: ${s}:latest`).join('\n');
  return `services:\n${svcBlock}\n`;
}

// ---------------------------------------------------------------------------
// STORAGE_BACKENDS constant
// ---------------------------------------------------------------------------

describe('STORAGE_BACKENDS', () => {
  it('includes nextcloud, minio, filebrowser, jellyfin', () => {
    expect(STORAGE_BACKENDS).toContain('nextcloud');
    expect(STORAGE_BACKENDS).toContain('minio');
    expect(STORAGE_BACKENDS).toContain('filebrowser');
    expect(STORAGE_BACKENDS).toContain('jellyfin');
  });

  it('has exactly 4 entries', () => {
    expect(STORAGE_BACKENDS).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// initStorage
// ---------------------------------------------------------------------------

describe('initStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envContent = '';
    Object.keys(writtenFiles).forEach((k) => delete writtenFiles[k]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === COMPOSE_PATH) return true;
      return false;
    });
  });

  it('throws when compose file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(
      initStorage('nextcloud', { projectPath: '/project', adminPassword: 'pw' }),
    ).rejects.toThrow('No docker-compose.yml found');
  });

  it('calls addService with correct backend and projectPath', async () => {
    await initStorage('nextcloud', { projectPath: '/project', adminPassword: 'secret' });
    expect(mockAddService).toHaveBeenCalledWith('nextcloud', '/project');
  });

  it('returns success=true when addService succeeds', async () => {
    const result = await initStorage('minio', { projectPath: '/project', adminPassword: 'pw' });
    expect(result.success).toBe(true);
    expect(result.backend).toBe('minio');
  });

  it('returns envPatched=true for nextcloud (credentials needed)', async () => {
    const result = await initStorage('nextcloud', {
      projectPath: '/project',
      adminUsername: 'admin',
      adminPassword: 'secret',
      domain: 'myserver.local',
    });
    expect(result.envPatched).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = (mockWriteFileSync.mock.calls[0] as [string, string])[1];
    expect(written).toContain('NEXTCLOUD_ADMIN_USER=admin');
    expect(written).toContain('NEXTCLOUD_ADMIN_PASSWORD=secret');
    expect(written).toContain('NEXTCLOUD_TRUSTED_DOMAINS=myserver.local localhost');
  });

  it('returns envPatched=true for minio with credentials', async () => {
    const result = await initStorage('minio', {
      projectPath: '/project',
      adminUsername: 'minioadmin',
      adminPassword: 'minio-secret',
    });
    expect(result.envPatched).toBe(true);
    const written = (mockWriteFileSync.mock.calls[0] as [string, string])[1];
    expect(written).toContain('MINIO_ROOT_USER=minioadmin');
    expect(written).toContain('MINIO_ROOT_PASSWORD=minio-secret');
  });

  it('returns envPatched=false for filebrowser (no .env credentials)', async () => {
    const result = await initStorage('filebrowser', { projectPath: '/project' });
    expect(result.envPatched).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns envPatched=false for jellyfin (no .env credentials)', async () => {
    const result = await initStorage('jellyfin', { projectPath: '/project' });
    expect(result.envPatched).toBe(false);
  });

  it('propagates addService failure without throwing', async () => {
    mockAddService.mockResolvedValueOnce({
      success: false,
      error: 'Service already exists',
      composePath: COMPOSE_PATH,
      backupPath: undefined,
    });

    const result = await initStorage('nextcloud', { projectPath: '/project' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
    expect(result.envPatched).toBe(false);
  });

  it('patches existing key in .env without duplication', async () => {
    // Pre-populate .env with an existing key
    mockExistsSync.mockImplementation((p: unknown) => {
      if (p === COMPOSE_PATH || p === ENV_PATH) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (p === ENV_PATH) return 'MINIO_ROOT_USER=old\nOTHER_VAR=foo\n';
      return '';
    });

    await initStorage('minio', {
      projectPath: '/project',
      adminUsername: 'new-admin',
      adminPassword: 'new-pw',
    });

    const written = (mockWriteFileSync.mock.calls[0] as [string, string])[1];
    // Updated value, no duplicate
    expect(written).toContain('MINIO_ROOT_USER=new-admin');
    expect(written).not.toMatch(/MINIO_ROOT_USER=old/);
    // Existing unrelated key preserved
    expect(written).toContain('OTHER_VAR=foo');
  });
});

// ---------------------------------------------------------------------------
// getInstalledStorageBackends
// ---------------------------------------------------------------------------

describe('getInstalledStorageBackends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when compose file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getInstalledStorageBackends('/project')).toEqual([]);
  });

  it('returns installed backends present in compose', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeCompose(['nextcloud', 'traefik']));
    const result = getInstalledStorageBackends('/project');
    expect(result).toContain('nextcloud');
    expect(result).not.toContain('minio');
  });

  it('returns all backends when all are in compose', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeCompose(['nextcloud', 'minio', 'filebrowser', 'jellyfin']),
    );
    const result = getInstalledStorageBackends('/project');
    expect(result).toHaveLength(4);
    for (const backend of STORAGE_BACKENDS) {
      expect(result).toContain(backend);
    }
  });

  it('returns empty array when no storage backends are in compose', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeCompose(['traefik', 'gitea']));
    expect(getInstalledStorageBackends('/project')).toEqual([]);
  });
});
