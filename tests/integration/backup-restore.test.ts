/**
 * T092 — Backup/Restore Flow Integration Tests
 *
 * Tests the backup and restore functionality used by `brewnet backup`
 * and `brewnet restore` commands:
 *   - createBackup(): archives project directory as .tar.gz
 *   - restoreBackup(): extracts archive back to project directory
 *   - listBackups(): lists all backup records
 *   - checkDiskSpace(): validates available disk space
 *
 * Test cases (from TEST_CASES.md):
 *   TC-09-08: Backup creation — .tar.gz created with valid BackupRecord
 *   TC-09-09: Restore flow — files extracted and match original content
 *   TC-09-10: Invalid backup ID — BN008 error thrown with backup ID in message
 *   TC-09-11: Disk space check — available/required/sufficient fields
 *
 * Additional test cases:
 *   - listBackups returns empty array, multiple backups, sorted newest-first
 *   - Edge cases: empty project dir, backup ID format consistency
 *
 * Approach: Functions imported from services/backup-manager.ts.
 * Uses real temp directories and tar/gzip operations. No Docker or network required.
 *
 * @module tests/integration/backup-restore
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import { isBrewnetError } from '../../packages/cli/src/utils/errors.js';
import {
  generateBackupId,
  deriveProjectName,
  buildArchiveFilename,
  createBackup,
  restoreBackup,
  listBackups,
  checkDiskSpace,
} from '../../packages/cli/src/services/backup-manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory with a unique name. */
function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `brewnet-test-${prefix}-`));
}

/** Populate a project directory with sample files for testing. */
function populateProject(projectPath: string): void {
  mkdirSync(projectPath, { recursive: true });

  // Create some typical project files
  writeFileSync(join(projectPath, 'docker-compose.yml'), 'version: "3.8"\nservices:\n  web:\n    image: nginx\n');
  writeFileSync(join(projectPath, '.env'), 'ADMIN_USER=admin\nADMIN_PASS=secret123\n');
  writeFileSync(join(projectPath, 'brewnet.config.json'), JSON.stringify({ projectName: 'test-project' }, null, 2));

  // Create a nested directory with files
  const subDir = join(projectPath, 'config');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, 'nginx.conf'), 'server { listen 80; }\n');
  writeFileSync(join(subDir, 'traefik.yml'), 'entryPoints:\n  web:\n    address: ":80"\n');
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T092 — Backup/Restore Flow', () => {
  let tempBase: string;
  let projectDir: string;
  let backupsDir: string;

  beforeEach(() => {
    tempBase = createTempDir('backup');
    projectDir = join(tempBase, 'my-project');
    backupsDir = join(tempBase, 'backups');
    populateProject(projectDir);
  });

  afterEach(() => {
    if (existsSync(tempBase)) {
      rmSync(tempBase, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // TC-09-08: Backup creation
  // =========================================================================

  describe('TC-09-08: Backup creation', () => {
    it('createBackup creates a .tar.gz file in backups directory', () => {
      const record = createBackup(projectDir, backupsDir);

      expect(record.path).toMatch(/\.tar\.gz$/);
      expect(existsSync(record.path)).toBe(true);
    });

    it('backup file exists on disk after creation', () => {
      const record = createBackup(projectDir, backupsDir);

      const archiveFiles = readdirSync(backupsDir).filter((f) => f.endsWith('.tar.gz'));
      expect(archiveFiles).toHaveLength(1);
      expect(archiveFiles[0]).toBe(`${record.id}.tar.gz`);
    });

    it('BackupRecord has valid id, timestamp, path, size', () => {
      const before = Date.now();
      const record = createBackup(projectDir, backupsDir);
      const after = Date.now();

      // ID follows the expected format: backup-<timestamp>-<random>
      expect(record.id).toMatch(/^backup-\d+-[a-f0-9]{6}$/);

      // Timestamp is within the test execution window
      expect(record.timestamp).toBeGreaterThanOrEqual(before);
      expect(record.timestamp).toBeLessThanOrEqual(after);

      // Path is absolute and within the backups directory
      expect(record.path).toContain(backupsDir);
      expect(record.path).toMatch(/\.tar\.gz$/);

      // Size is positive (archive has content)
      expect(record.size).toBeGreaterThan(0);

      // Project name is derived from directory
      expect(record.projectName).toBe('my-project');
    });

    it('backup archive contains project files', () => {
      const record = createBackup(projectDir, backupsDir);

      // List archive contents
      const listing = execSync(`tar -tzf "${record.path}"`, {
        encoding: 'utf-8',
      });

      expect(listing).toContain('docker-compose.yml');
      expect(listing).toContain('.env');
      expect(listing).toContain('brewnet.config.json');
      expect(listing).toContain('config/nginx.conf');
      expect(listing).toContain('config/traefik.yml');
    });
  });

  // =========================================================================
  // TC-09-09: Restore flow
  // =========================================================================

  describe('TC-09-09: Restore flow', () => {
    it('restore extracts files back to project directory', () => {
      const record = createBackup(projectDir, backupsDir);

      // Create a new directory for restoration
      const restoreDir = join(tempBase, 'restored-project');
      mkdirSync(restoreDir, { recursive: true });

      restoreBackup(record.id, backupsDir, restoreDir);

      // Verify files exist in the restore directory
      expect(existsSync(join(restoreDir, 'docker-compose.yml'))).toBe(true);
      expect(existsSync(join(restoreDir, '.env'))).toBe(true);
      expect(existsSync(join(restoreDir, 'brewnet.config.json'))).toBe(true);
      expect(existsSync(join(restoreDir, 'config', 'nginx.conf'))).toBe(true);
      expect(existsSync(join(restoreDir, 'config', 'traefik.yml'))).toBe(true);
    });

    it('restored files match original content', () => {
      const record = createBackup(projectDir, backupsDir);

      const restoreDir = join(tempBase, 'restored-project');
      mkdirSync(restoreDir, { recursive: true });

      restoreBackup(record.id, backupsDir, restoreDir);

      // Compare file contents
      const originalCompose = readFileSync(join(projectDir, 'docker-compose.yml'), 'utf-8');
      const restoredCompose = readFileSync(join(restoreDir, 'docker-compose.yml'), 'utf-8');
      expect(restoredCompose).toBe(originalCompose);

      const originalEnv = readFileSync(join(projectDir, '.env'), 'utf-8');
      const restoredEnv = readFileSync(join(restoreDir, '.env'), 'utf-8');
      expect(restoredEnv).toBe(originalEnv);

      const originalConfig = readFileSync(join(projectDir, 'brewnet.config.json'), 'utf-8');
      const restoredConfig = readFileSync(join(restoreDir, 'brewnet.config.json'), 'utf-8');
      expect(restoredConfig).toBe(originalConfig);

      const originalNginx = readFileSync(join(projectDir, 'config', 'nginx.conf'), 'utf-8');
      const restoredNginx = readFileSync(join(restoreDir, 'config', 'nginx.conf'), 'utf-8');
      expect(restoredNginx).toBe(originalNginx);

      const originalTraefik = readFileSync(join(projectDir, 'config', 'traefik.yml'), 'utf-8');
      const restoredTraefik = readFileSync(join(restoreDir, 'config', 'traefik.yml'), 'utf-8');
      expect(restoredTraefik).toBe(originalTraefik);
    });
  });

  // =========================================================================
  // TC-09-10: Invalid backup ID
  // =========================================================================

  describe('TC-09-10: Invalid backup ID', () => {
    it('restoreBackup with non-existent ID throws error with code BN008', () => {
      const fakeId = 'backup-0000000000000-abcdef';

      try {
        restoreBackup(fakeId, backupsDir, projectDir);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(isBrewnetError(err)).toBe(true);
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN008');
          expect(err.httpStatus).toBe(404);
        }
      }
    });

    it('error message includes the invalid backup ID', () => {
      const fakeId = 'backup-9999999999999-zzzzzzz';

      try {
        restoreBackup(fakeId, backupsDir, projectDir);
        expect(true).toBe(false);
      } catch (err) {
        expect(isBrewnetError(err)).toBe(true);
        if (isBrewnetError(err)) {
          expect(err.message).toContain(fakeId);
        }
      }
    });

    it('restoreBackup throws BN008 when backups directory does not exist', () => {
      const nonExistentDir = join(tempBase, 'no-such-backups');
      const fakeId = 'backup-1234567890000-abc123';

      expect(() => restoreBackup(fakeId, nonExistentDir, projectDir)).toThrow();

      try {
        restoreBackup(fakeId, nonExistentDir, projectDir);
      } catch (err) {
        expect(isBrewnetError(err)).toBe(true);
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN008');
        }
      }
    });
  });

  // =========================================================================
  // TC-09-11: Disk space check
  // =========================================================================

  describe('TC-09-11: Disk space check', () => {
    it('checkDiskSpace returns available and required space', () => {
      const result = checkDiskSpace(tempBase, 1024);

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('required');
      expect(result).toHaveProperty('sufficient');
      expect(typeof result.available).toBe('number');
      expect(typeof result.required).toBe('number');
      expect(typeof result.sufficient).toBe('boolean');
    });

    it('sufficient=true when available > required', () => {
      // Request just 1 byte — any real filesystem will have more
      const result = checkDiskSpace(tempBase, 1);

      expect(result.available).toBeGreaterThan(0);
      expect(result.required).toBe(1);
      expect(result.sufficient).toBe(true);
    });

    it('sufficient=false when available < required (extreme requirement)', () => {
      // Request an impossibly large amount: 1 exabyte
      const oneExabyte = 1024 * 1024 * 1024 * 1024 * 1024 * 1024;
      const result = checkDiskSpace(tempBase, oneExabyte);

      expect(result.required).toBe(oneExabyte);
      expect(result.sufficient).toBe(false);
    });

    it('checkDiskSpace returns available > 0 for a valid path', () => {
      const result = checkDiskSpace(tempBase);

      expect(result.available).toBeGreaterThan(0);
    });

    it('checkDiskSpace with zero required bytes is always sufficient', () => {
      const result = checkDiskSpace(tempBase, 0);

      expect(result.required).toBe(0);
      expect(result.sufficient).toBe(true);
    });
  });

  // =========================================================================
  // listBackups
  // =========================================================================

  describe('listBackups', () => {
    it('listBackups returns empty array when no backups exist', () => {
      // backupsDir does not exist yet
      const result = listBackups(backupsDir);
      expect(result).toEqual([]);
    });

    it('listBackups returns empty array when backups directory is empty', () => {
      mkdirSync(backupsDir, { recursive: true });
      const result = listBackups(backupsDir);
      expect(result).toEqual([]);
    });

    it('listBackups returns all backups after creating multiple', () => {
      // Create three backups
      createBackup(projectDir, backupsDir);
      createBackup(projectDir, backupsDir);
      createBackup(projectDir, backupsDir);

      const backups = listBackups(backupsDir);
      expect(backups).toHaveLength(3);

      // Each backup should have valid fields
      for (const backup of backups) {
        expect(backup.id).toMatch(/^backup-\d+-[a-f0-9]{6}$/);
        expect(backup.path).toMatch(/\.tar\.gz$/);
        expect(backup.size).toBeGreaterThan(0);
        expect(backup.projectName).toBe('my-project');
      }
    });

    it('backups are sorted by timestamp (newest first)', () => {
      // Create backups with small delays to ensure distinct timestamps
      const record1 = createBackup(projectDir, backupsDir);
      const record2 = createBackup(projectDir, backupsDir);
      const record3 = createBackup(projectDir, backupsDir);

      const backups = listBackups(backupsDir);

      // Newest (record3) should come first
      expect(backups[0].id).toBe(record3.id);
      expect(backups[1].id).toBe(record2.id);
      expect(backups[2].id).toBe(record1.id);

      // Timestamps should be in descending order
      for (let i = 0; i < backups.length - 1; i++) {
        expect(backups[i].timestamp).toBeGreaterThanOrEqual(backups[i + 1].timestamp);
      }
    });

    it('listBackups only includes .tar.gz files', () => {
      mkdirSync(backupsDir, { recursive: true });

      // Create a backup
      createBackup(projectDir, backupsDir);

      // Also create some non-backup files in the directory
      writeFileSync(join(backupsDir, 'notes.txt'), 'some notes');
      writeFileSync(join(backupsDir, 'metadata.json'), '{}');

      const backups = listBackups(backupsDir);
      expect(backups).toHaveLength(1);
      expect(backups[0].path).toMatch(/\.tar\.gz$/);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('backup with empty project directory still creates a valid archive', () => {
      const emptyDir = join(tempBase, 'empty-project');
      mkdirSync(emptyDir, { recursive: true });

      const record = createBackup(emptyDir, backupsDir);

      expect(existsSync(record.path)).toBe(true);
      expect(record.size).toBeGreaterThan(0); // tar.gz has headers even if empty
      expect(record.projectName).toBe('empty-project');
      expect(record.id).toMatch(/^backup-\d+-[a-f0-9]{6}$/);
    });

    it('backup ID format is consistent across multiple calls', () => {
      const ids: string[] = [];

      for (let i = 0; i < 5; i++) {
        const record = createBackup(projectDir, backupsDir);
        ids.push(record.id);
      }

      // All IDs should follow the same pattern
      for (const id of ids) {
        expect(id).toMatch(/^backup-\d+-[a-f0-9]{6}$/);
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('createBackup creates backups directory if it does not exist', () => {
      const nestedBackupsDir = join(tempBase, 'deep', 'nested', 'backups');
      expect(existsSync(nestedBackupsDir)).toBe(false);

      const record = createBackup(projectDir, nestedBackupsDir);

      expect(existsSync(nestedBackupsDir)).toBe(true);
      expect(existsSync(record.path)).toBe(true);
    });

    it('restoreBackup creates project directory if it does not exist', () => {
      const record = createBackup(projectDir, backupsDir);
      const newProjectDir = join(tempBase, 'new', 'restored', 'project');

      expect(existsSync(newProjectDir)).toBe(false);

      restoreBackup(record.id, backupsDir, newProjectDir);

      expect(existsSync(newProjectDir)).toBe(true);
      expect(existsSync(join(newProjectDir, 'docker-compose.yml'))).toBe(true);
    });

    it('backup and restore preserves nested directory structure', () => {
      // Add deeper nesting to the project
      const deepDir = join(projectDir, 'services', 'web', 'templates');
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(join(deepDir, 'index.html'), '<html><body>Hello</body></html>');

      const record = createBackup(projectDir, backupsDir);
      const restoreDir = join(tempBase, 'restored-nested');

      restoreBackup(record.id, backupsDir, restoreDir);

      const restoredContent = readFileSync(
        join(restoreDir, 'services', 'web', 'templates', 'index.html'),
        'utf-8',
      );
      expect(restoredContent).toBe('<html><body>Hello</body></html>');
    });

    it('multiple backups can coexist and be individually restored', () => {
      // Create first version of the project
      writeFileSync(join(projectDir, 'version.txt'), 'v1');
      const backup1 = createBackup(projectDir, backupsDir);

      // Modify the project
      writeFileSync(join(projectDir, 'version.txt'), 'v2');
      writeFileSync(join(projectDir, 'new-file.txt'), 'added in v2');
      const backup2 = createBackup(projectDir, backupsDir);

      // Restore backup1 to one directory
      const restore1Dir = join(tempBase, 'restore-v1');
      restoreBackup(backup1.id, backupsDir, restore1Dir);

      // Restore backup2 to another directory
      const restore2Dir = join(tempBase, 'restore-v2');
      restoreBackup(backup2.id, backupsDir, restore2Dir);

      // Verify v1 has original content
      expect(readFileSync(join(restore1Dir, 'version.txt'), 'utf-8')).toBe('v1');
      expect(existsSync(join(restore1Dir, 'new-file.txt'))).toBe(false);

      // Verify v2 has modified content
      expect(readFileSync(join(restore2Dir, 'version.txt'), 'utf-8')).toBe('v2');
      expect(readFileSync(join(restore2Dir, 'new-file.txt'), 'utf-8')).toBe('added in v2');
    });

    it('deriveProjectName extracts the last path segment', () => {
      expect(deriveProjectName('/home/user/brewnet/my-project')).toBe('my-project');
      expect(deriveProjectName('/srv/apps/test-server/')).toBe('test-server');
      expect(deriveProjectName('/single')).toBe('single');
    });

    it('buildArchiveFilename appends .tar.gz to backup ID', () => {
      const filename = buildArchiveFilename('backup-1234567890-abcdef');
      expect(filename).toBe('backup-1234567890-abcdef.tar.gz');
    });

    it('generateBackupId produces unique IDs on rapid successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        ids.add(generateBackupId());
      }
      // All 20 IDs should be unique due to the random suffix
      expect(ids.size).toBe(20);
    });
  });

  // =========================================================================
  // Integrated flow: backup -> list -> restore -> verify
  // =========================================================================

  describe('Integrated flow: backup, list, restore, verify', () => {
    it('full round-trip: create backup, list it, restore, verify contents', () => {
      // Step 1: Create a backup
      const record = createBackup(projectDir, backupsDir);
      expect(record.id).toBeTruthy();

      // Step 2: List backups — should include our backup
      const backups = listBackups(backupsDir);
      expect(backups).toHaveLength(1);
      expect(backups[0].id).toBe(record.id);
      expect(backups[0].projectName).toBe('my-project');

      // Step 3: Check disk space before restore
      const diskCheck = checkDiskSpace(tempBase, record.size);
      expect(diskCheck.sufficient).toBe(true);

      // Step 4: Restore to a new directory
      const restoreDir = join(tempBase, 'full-restore');
      restoreBackup(record.id, backupsDir, restoreDir);

      // Step 5: Verify all files match
      const originalFiles = ['docker-compose.yml', '.env', 'brewnet.config.json'];
      for (const file of originalFiles) {
        const original = readFileSync(join(projectDir, file), 'utf-8');
        const restored = readFileSync(join(restoreDir, file), 'utf-8');
        expect(restored).toBe(original);
      }
    });

    it('disk space check integrates with backup size for validation', () => {
      const record = createBackup(projectDir, backupsDir);

      // The backup size should be reasonable for our small test project
      expect(record.size).toBeGreaterThan(0);
      expect(record.size).toBeLessThan(1024 * 1024); // less than 1 MB for test data

      // Disk space should be sufficient for the backup size
      const check = checkDiskSpace(tempBase, record.size);
      expect(check.sufficient).toBe(true);
      expect(check.available).toBeGreaterThan(record.size);
    });
  });
});
