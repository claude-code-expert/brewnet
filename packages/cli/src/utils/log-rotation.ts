/**
 * Log Rotation — manages log file lifecycle for non-Docker sources.
 *
 * - CLI logs: delete files older than CLI_LOG_RETENTION_DAYS
 * - Tunnel/Access logs: copytruncate rotation at ACCESS_LOG_MAX_BYTES
 *
 * @module utils/log-rotation
 */

import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  copyFileSync,
  renameSync,
  truncateSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  CLI_LOG_RETENTION_DAYS,
  ACCESS_LOG_MAX_BYTES,
} from '@brewnet/shared';

/**
 * Delete CLI log files older than `retentionDays`.
 *
 * Parses the date from the filename pattern `brewnet-YYYY-MM-DD.log`
 * and deletes files whose date is before the retention threshold.
 */
export function cleanOldCliLogs(logsDir: string, retentionDays: number): number {
  if (!existsSync(logsDir)) return 0;

  const now = Date.now();
  const thresholdMs = retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const files = readdirSync(logsDir).filter((f) =>
    /^brewnet-\d{4}-\d{2}-\d{2}\.log$/.test(f),
  );

  for (const file of files) {
    const dateStr = file.replace('brewnet-', '').replace('.log', '');
    const fileDate = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(fileDate.getTime())) continue;

    if (now - fileDate.getTime() > thresholdMs) {
      try {
        unlinkSync(join(logsDir, file));
        deleted++;
      } catch {
        // Skip files that can't be deleted
      }
    }
  }

  return deleted;
}

/**
 * Rotate a large file using the copytruncate strategy.
 *
 * 1. Shift existing rotated files: .4 → .5, .3 → .4, etc.
 * 2. Copy current file to .1
 * 3. Truncate the original file to 0 bytes
 *
 * This preserves the file handle for processes writing to the original file.
 *
 * @returns true if rotation was performed, false if file is under the size limit
 */
export function rotateLargeFile(
  filePath: string,
  maxBytes: number,
  maxFiles: number,
): boolean {
  if (!existsSync(filePath)) return false;

  const stat = statSync(filePath);
  if (stat.size < maxBytes) return false;

  // Shift existing rotated files (delete oldest if at max)
  const oldest = `${filePath}.${maxFiles}`;
  if (existsSync(oldest)) {
    try {
      unlinkSync(oldest);
    } catch {
      // Best effort
    }
  }

  // Shift .N-1 → .N, .N-2 → .N-1, etc.
  for (let i = maxFiles - 1; i >= 1; i--) {
    const src = `${filePath}.${i}`;
    const dst = `${filePath}.${i + 1}`;
    if (existsSync(src)) {
      try {
        renameSync(src, dst);
      } catch {
        // Best effort
      }
    }
  }

  // Copy current → .1, then truncate original
  try {
    copyFileSync(filePath, `${filePath}.1`);
    truncateSync(filePath, 0);
  } catch {
    // If copy/truncate fails, don't lose data
    return false;
  }

  return true;
}

/**
 * Run all rotation tasks for non-Docker log sources.
 *
 * - CLI logs: delete files older than 30 days
 * - Tunnel log: copytruncate at 50MB × 5 copies
 * - Access log: copytruncate at 50MB × 5 copies
 */
export function runRotation(logsDir: string, projectPath: string): void {
  // CLI log retention
  try {
    cleanOldCliLogs(logsDir, CLI_LOG_RETENTION_DAYS);
  } catch {
    // Non-critical
  }

  // Tunnel log rotation
  const tunnelLog = join(logsDir, 'tunnel.log');
  try {
    rotateLargeFile(tunnelLog, ACCESS_LOG_MAX_BYTES, 5);
  } catch {
    // Non-critical
  }

  // Access log rotation
  const accessLog = join(projectPath, 'logs', 'access.log');
  try {
    rotateLargeFile(accessLog, ACCESS_LOG_MAX_BYTES, 5);
  } catch {
    // Non-critical
  }
}
