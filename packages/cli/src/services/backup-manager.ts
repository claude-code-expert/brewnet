/**
 * Brewnet CLI — Backup Manager (T098)
 *
 * Provides backup and restore operations for Brewnet projects.
 * Archives project directories as .tar.gz files and supports
 * listing, restoring, and disk space validation.
 *
 * @module services/backup-manager
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

import { BrewnetError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A record describing a single backup snapshot. */
export interface BackupRecord {
  id: string;
  timestamp: number;
  path: string;
  size: number;
  projectName: string;
}

/** Result of a disk space check. */
export interface DiskSpaceResult {
  available: number;   // bytes
  required: number;    // bytes
  sufficient: boolean;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique backup ID based on timestamp and random suffix.
 * Format: `backup-<timestamp>-<random6hex>`
 */
export function generateBackupId(): string {
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString('hex');
  return `backup-${ts}-${rand}`;
}

/**
 * Derive the project name from the project path.
 * Uses the last segment of the path as the project name.
 */
export function deriveProjectName(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, '').split('/');
  return segments[segments.length - 1] || 'unknown';
}

/**
 * Build the archive filename for a backup.
 */
export function buildArchiveFilename(backupId: string): string {
  return `${backupId}.tar.gz`;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Create a backup of the project directory.
 *
 * Archives the contents of `projectPath` into a .tar.gz file stored
 * in `backupsDir`. Returns a BackupRecord describing the created backup.
 *
 * @param projectPath - The project directory to back up
 * @param backupsDir - The directory where backup archives are stored
 * @returns A BackupRecord with id, timestamp, path, size, projectName
 */
export function createBackup(projectPath: string, backupsDir: string): BackupRecord {
  mkdirSync(backupsDir, { recursive: true });

  const backupId = generateBackupId();
  const archiveFilename = buildArchiveFilename(backupId);
  const archivePath = join(backupsDir, archiveFilename);
  const timestamp = Date.now();

  // Create .tar.gz archive of the project directory contents.
  // Using -C to change into the parent dir and archiving the basename
  // so that extraction is relative.
  const parentDir = join(projectPath, '..');
  const baseName = deriveProjectName(projectPath);

  execSync(`tar -czf "${archivePath}" -C "${parentDir}" "${baseName}"`, {
    stdio: 'pipe',
  });

  const stats = statSync(archivePath);

  return {
    id: backupId,
    timestamp,
    path: archivePath,
    size: stats.size,
    projectName: baseName,
  };
}

/**
 * Restore a backup by extracting the archive to the project path.
 *
 * @param backupId - The ID of the backup to restore
 * @param backupsDir - The directory where backup archives are stored
 * @param projectPath - The target directory to restore into
 * @throws {BrewnetError} BN008 when the backup archive is not found
 */
export function restoreBackup(backupId: string, backupsDir: string, projectPath: string): void {
  const archiveFilename = buildArchiveFilename(backupId);
  const archivePath = join(backupsDir, archiveFilename);

  if (!existsSync(archivePath)) {
    throw BrewnetError.resourceNotFound(`backup:${backupId}`);
  }

  // Ensure the project directory exists
  mkdirSync(projectPath, { recursive: true });

  // Extract the archive — strip the top-level directory component so that
  // contents are placed directly into projectPath
  execSync(`tar -xzf "${archivePath}" -C "${projectPath}" --strip-components=1`, {
    stdio: 'pipe',
  });
}

/**
 * List all backups in the backups directory, sorted by timestamp (newest first).
 *
 * @param backupsDir - The directory where backup archives are stored
 * @returns Array of BackupRecord, newest first
 */
export function listBackups(backupsDir: string): BackupRecord[] {
  if (!existsSync(backupsDir)) {
    return [];
  }

  const files = readdirSync(backupsDir).filter((f) => f.endsWith('.tar.gz'));
  const records: BackupRecord[] = [];

  for (const file of files) {
    const filePath = join(backupsDir, file);
    const stats = statSync(filePath);

    // Parse the backup ID from the filename (remove .tar.gz)
    const backupId = file.replace(/\.tar\.gz$/, '');

    // Extract timestamp from backup ID format: backup-<timestamp>-<random>
    const parts = backupId.split('-');
    const timestamp = parts.length >= 2 ? parseInt(parts[1], 10) : stats.mtimeMs;

    // Derive project name by inspecting the archive listing.
    // The first entry is usually the top-level directory like "my-project/"
    let projectName = 'unknown';
    try {
      const listing = execSync(`tar -tzf "${filePath}" | head -1`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      }).trim();
      projectName = listing.replace(/\/$/, '').split('/')[0] || 'unknown';
    } catch {
      // Fall back to unknown
    }

    records.push({
      id: backupId,
      timestamp,
      path: filePath,
      size: stats.size,
      projectName,
    });
  }

  // Sort by timestamp, newest first
  records.sort((a, b) => b.timestamp - a.timestamp);

  return records;
}

/**
 * Check available disk space at the given path.
 *
 * @param path - The filesystem path to check
 * @param requiredBytes - The number of bytes required (optional, defaults to 0)
 * @returns DiskSpaceResult with available, required, and sufficient fields
 */
export function checkDiskSpace(path: string, requiredBytes: number = 0): DiskSpaceResult {
  // Use `df` to get available space in 1K blocks, then convert to bytes
  let available: number;
  try {
    // macOS and Linux both support `df -k`
    const output = execSync(`df -k "${path}" | tail -1`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();

    // df output columns: Filesystem 1K-blocks Used Available Use% Mounted-on
    const columns = output.split(/\s+/);
    const availableKB = parseInt(columns[3], 10);
    available = availableKB * 1024;
  } catch {
    // If df fails, return 0 available
    available = 0;
  }

  return {
    available,
    required: requiredBytes,
    sufficient: available >= requiredBytes,
  };
}
