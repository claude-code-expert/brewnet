/**
 * TunnelLogger — append-only NDJSON event log for Cloudflare Tunnel operations.
 *
 * Log location: ~/.brewnet/logs/tunnel.log
 * Format: One JSON object per line (NDJSON / JSON Lines).
 *
 * SECURITY: MUST NOT write apiToken or tunnelToken in any field.
 *
 * @module utils/tunnel-logger
 */

import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { TunnelLogEvent } from '@brewnet/shared';

const LOG_DIR = path.join(os.homedir(), '.brewnet', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'tunnel.log');

// Fields that must never appear in log entries (security)
const FORBIDDEN_KEYS = new Set(['apiToken', 'tunnelToken']);

/**
 * Sanitize a log event to ensure no credential fields are present.
 * Throws if a forbidden key is detected to surface bugs early.
 */
function sanitize(event: TunnelLogEvent): TunnelLogEvent {
  const keys = Object.keys(event);
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`TunnelLogger: forbidden field "${key}" in log event`);
    }
  }
  return event;
}

/**
 * Write a tunnel event to ~/.brewnet/logs/tunnel.log.
 *
 * Creates the log file and parent directories if they do not exist.
 * Each call appends one NDJSON line. Non-blocking (sync write for simplicity —
 * log events are low-frequency, so sync I/O is acceptable here).
 */
export function logTunnelEvent(event: TunnelLogEvent): void {
  const sanitized = sanitize(event);
  const line = JSON.stringify(sanitized) + '\n';

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

/**
 * TunnelLogger — class interface for consumers that prefer object-style usage.
 */
export class TunnelLogger {
  /**
   * Append a tunnel event to the persistent log file.
   * Automatically sets `timestamp` to the current ISO 8601 UTC string
   * if the event does not already have one.
   */
  log(event: Omit<TunnelLogEvent, 'timestamp'> & { timestamp?: string }): void {
    const withTimestamp: TunnelLogEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    } as TunnelLogEvent;
    logTunnelEvent(withTimestamp);
  }
}
