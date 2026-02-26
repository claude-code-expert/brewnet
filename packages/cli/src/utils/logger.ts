/**
 * Brewnet CLI — Structured Logger (T106)
 *
 * Writes daily JSONL log files to a configurable logs directory.
 * Each log entry is a single JSON line appended to the file
 * named by date (e.g. brewnet-2026-02-23.log).
 *
 * Usage:
 *   import { createLogger } from './utils/logger';
 *   const logger = createLogger('/path/to/logs');
 *   logger.info('init', 'Wizard started');
 *   logger.warn('deploy', 'Slow build', { duration: 12000 });
 *   logger.error('up', 'Container failed', { service: 'redis' });
 *
 * @module utils/logger
 */

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  command: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface Logger {
  info(command: string, message: string, metadata?: Record<string, unknown>): void;
  warn(command: string, message: string, metadata?: Record<string, unknown>): void;
  error(command: string, message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Create a Logger that writes daily JSONL log files into `logsDir`.
 *
 * - Creates the directory (recursively) if it doesn't already exist.
 * - Each call to info/warn/error appends a single JSON line to
 *   `<logsDir>/brewnet-YYYY-MM-DD.log`.
 * - Daily rotation is automatic: a new file is started each calendar day.
 *
 * @param logsDir - Absolute path to the directory where log files are stored.
 */
export function createLogger(logsDir: string): Logger {
  // Eagerly ensure the log directory exists.
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  function write(
    level: LogLevel,
    command: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      command,
      message,
      metadata: metadata ?? {},
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const filePath = join(logsDir, `brewnet-${dateStr}.log`);

    try {
      appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch {
      // Logging should never crash the CLI. If the write fails (e.g. disk full,
      // permission denied), we silently drop the entry.
    }
  }

  return {
    info(command: string, message: string, metadata?: Record<string, unknown>): void {
      write('info', command, message, metadata);
    },
    warn(command: string, message: string, metadata?: Record<string, unknown>): void {
      write('warn', command, message, metadata);
    },
    error(command: string, message: string, metadata?: Record<string, unknown>): void {
      write('error', command, message, metadata);
    },
  };
}

/**
 * Default global logger instance.
 * Uses ~/.brewnet/logs/ as the log directory.
 */
export const logger = createLogger(join(homedir(), '.brewnet', 'logs'));
