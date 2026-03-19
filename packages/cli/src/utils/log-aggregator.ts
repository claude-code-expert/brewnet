/**
 * Log Aggregator — unified log reading from 4 sources.
 *
 * Reads CLI JSONL, Tunnel NDJSON, Traefik access log, and Docker container logs,
 * transforms each to UnifiedLogEntry, and supports querying with filters and pagination.
 *
 * @module utils/log-aggregator
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type {
  LogSource,
  UnifiedLogLevel,
  UnifiedLogEntry,
  LogQuery,
  LogQueryResult,
  LogStats,
} from '@brewnet/shared';
import {
  LOG_QUERY_DEFAULT_LIMIT,
  LOG_QUERY_MAX_LIMIT,
} from '@brewnet/shared';
import { runRotation } from './log-rotation.js';

// ─── Duration Parsing ───────────────────────────────────────────────────────

/**
 * Parse a human-friendly duration string (e.g. "1h", "30m", "7d") or ISO date
 * into an absolute ISO 8601 timestamp.
 *
 * Supported formats: Nh (hours), Nm (minutes), Nd (days), ISO 8601 date/datetime.
 */
export function parseDuration(input: string): string {
  const match = input.match(/^(\d+)([hmd])$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = Date.now();
    let ms = 0;
    switch (unit) {
      case 'h':
        ms = value * 60 * 60 * 1000;
        break;
      case 'm':
        ms = value * 60 * 1000;
        break;
      case 'd':
        ms = value * 24 * 60 * 60 * 1000;
        break;
    }
    return new Date(now - ms).toISOString();
  }

  // Try parsing as ISO date
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  throw new Error(
    `Invalid time format: '${input}'. Use: 1h, 30m, 1d, or ISO date (2026-03-15)`,
  );
}

// ─── Source Readers ─────────────────────────────────────────────────────────

/**
 * Read CLI JSONL log files (brewnet-YYYY-MM-DD.log) and transform to UnifiedLogEntry[].
 */
export function readCliLogs(logsDir: string, since?: string): UnifiedLogEntry[] {
  if (!existsSync(logsDir)) return [];

  const files = readdirSync(logsDir)
    .filter((f) => /^brewnet-\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .sort();

  // If since is specified, skip files whose date is before the since date
  const sinceDate = since ? since.slice(0, 10) : undefined;

  const entries: UnifiedLogEntry[] = [];
  for (const file of files) {
    if (sinceDate) {
      const fileDate = file.replace('brewnet-', '').replace('.log', '');
      if (fileDate < sinceDate) continue;
    }

    const content = readFileSync(join(logsDir, file), 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          timestamp: string;
          level: string;
          command: string;
          message: string;
          metadata: Record<string, unknown>;
        };

        if (since && parsed.timestamp < since) continue;

        entries.push({
          timestamp: parsed.timestamp,
          source: 'cli',
          level: parsed.level as UnifiedLogLevel,
          message: parsed.message,
          metadata: { command: parsed.command, ...parsed.metadata },
        });
      } catch {
        // Skip malformed lines
      }
    }
  }
  return entries;
}

/**
 * Read Tunnel NDJSON log file (tunnel.log) and transform to UnifiedLogEntry[].
 */
export function readTunnelLogs(logsDir: string, since?: string): UnifiedLogEntry[] {
  const logFile = join(logsDir, 'tunnel.log');
  if (!existsSync(logFile)) return [];

  const content = readFileSync(logFile, 'utf-8');
  const entries: UnifiedLogEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as {
        timestamp: string;
        event: string;
        tunnelMode: string;
        tunnelId?: string;
        tunnelName?: string;
        domain?: string;
        detail: string;
        error?: string;
      };

      if (since && parsed.timestamp < since) continue;

      const metadata: Record<string, unknown> = {
        event: parsed.event,
        tunnelMode: parsed.tunnelMode,
      };
      if (parsed.tunnelId) metadata.tunnelId = parsed.tunnelId;
      if (parsed.tunnelName) metadata.tunnelName = parsed.tunnelName;

      entries.push({
        timestamp: parsed.timestamp,
        source: 'tunnel',
        level: parsed.error ? 'error' : 'info',
        service: parsed.domain,
        message: parsed.detail,
        metadata,
      });
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Read Traefik JSON access log and transform to UnifiedLogEntry[].
 */
export function readAccessLogs(projectPath: string, since?: string): UnifiedLogEntry[] {
  const logFile = join(projectPath, 'logs', 'access.log');
  if (!existsSync(logFile)) return [];

  const content = readFileSync(logFile, 'utf-8');
  const entries: UnifiedLogEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as {
        StartUTC: string;
        OriginStatus: number;
        ServiceName?: string;
        RequestMethod: string;
        RequestPath: string;
        RouterName?: string;
        ClientAddr?: string;
        Duration?: number;
        RequestHost?: string;
        request_User_Agent?: string;
        'request_User-Agent'?: string;
      };

      if (since && parsed.StartUTC < since) continue;

      let level: UnifiedLogLevel = 'info';
      if (parsed.OriginStatus >= 500) level = 'error';
      else if (parsed.OriginStatus >= 400) level = 'warn';

      const metadata: Record<string, unknown> = {};
      if (parsed.RouterName) metadata.routerName = parsed.RouterName;
      if (parsed.ClientAddr) metadata.clientAddr = parsed.ClientAddr;
      if (parsed.Duration !== undefined) metadata.duration = parsed.Duration;
      if (parsed.RequestHost) metadata.requestHost = parsed.RequestHost;
      const userAgent = parsed['request_User-Agent'] ?? parsed.request_User_Agent;
      if (userAgent) metadata.userAgent = userAgent;

      // Extract clean service name from Traefik's "serviceName@provider" format
      const serviceName = parsed.ServiceName?.split('@')[0];

      entries.push({
        timestamp: parsed.StartUTC,
        source: 'access',
        level,
        service: serviceName,
        message: `${parsed.RequestMethod} ${parsed.RequestPath} → ${parsed.OriginStatus}`,
        metadata,
      });
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Read Docker container logs via dockerode.
 *
 * Uses 8-byte multiplexed stream format:
 * - Byte 0: stream type (1=stdout → info, 2=stderr → error)
 * - Bytes 4-7: payload size (big-endian uint32)
 * - Remaining: payload text
 */
export async function readServiceLogs(
  projectPath: string,
  opts?: { since?: string; tail?: number },
): Promise<UnifiedLogEntry[]> {
  let Dockerode: typeof import('dockerode');
  try {
    Dockerode = (await import('dockerode')).default;
  } catch {
    return [];
  }

  const docker = new Dockerode();
  const entries: UnifiedLogEntry[] = [];

  try {
    const containers = await docker.listContainers({ all: false });
    // Filter containers belonging to this project by working directory label or name prefix
    const projectName = basename(projectPath).toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const containerInfo of containers) {
      const containerName =
        containerInfo.Names?.[0]?.replace(/^\//, '') ?? containerInfo.Id.slice(0, 12);

      // Match containers that belong to this project (docker compose prefixes with project name)
      if (!containerName.toLowerCase().startsWith(projectName)) continue;

      const container = docker.getContainer(containerInfo.Id);
      const logOpts: Record<string, unknown> = {
        stdout: true,
        stderr: true,
        timestamps: true,
      };
      if (opts?.tail) logOpts.tail = opts.tail;
      if (opts?.since) {
        logOpts.since = Math.floor(new Date(opts.since).getTime() / 1000);
      }

      try {
        const logBuffer = (await container.logs(logOpts)) as Buffer;

        // Demultiplex Docker's 8-byte header format:
        // [stream_type(1), 0, 0, 0, size(4 big-endian)] + payload
        const frames: { stream: number; text: string }[] = [];
        if (Buffer.isBuffer(logBuffer)) {
          let pos = 0;
          while (pos + 8 <= logBuffer.length) {
            const streamType = logBuffer[pos];
            const payloadSize = logBuffer.readUInt32BE(pos + 4);
            pos += 8;
            if (pos + payloadSize > logBuffer.length) break;
            const payload = logBuffer.subarray(pos, pos + payloadSize).toString('utf-8');
            frames.push({ stream: streamType, text: payload });
            pos += payloadSize;
          }
        } else {
          // Fallback if logs() returns a plain string (no multiplexing)
          frames.push({ stream: 1, text: String(logBuffer) });
        }

        for (const frame of frames) {
          const level: UnifiedLogLevel = frame.stream === 2 ? 'error' : 'info';
          for (const line of frame.text.split('\n')) {
            if (!line.trim()) continue;

            // Docker timestamp format at the start of each line
            const tsMatch = line.match(
              /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)/,
            );
            if (!tsMatch) continue;

            const timestamp = tsMatch[1].endsWith('Z') ? tsMatch[1] : tsMatch[1] + 'Z';
            const message = tsMatch[2];

            if (opts?.since && timestamp < opts.since) continue;

            // Strip project prefix from container name for clean service name
            const serviceName = containerName
              .replace(new RegExp(`^${projectName}[-_]`), '')
              .replace(/-\d+$/, '');

            entries.push({
              timestamp,
              source: 'service',
              level,
              service: serviceName,
              message,
              metadata: { containerId: containerInfo.Id.slice(0, 12) },
            });
          }
        }
      } catch {
        // Container may have stopped between list and logs call
      }
    }
  } catch {
    // Docker not available or not running
  }

  return entries;
}

// ─── Query Engine ───────────────────────────────────────────────────────────

/**
 * Query logs from all sources with filtering, sorting, and pagination.
 */
export async function queryLogs(
  query: LogQuery,
  projectPath: string,
): Promise<LogQueryResult> {
  const logsDir = join(homedir(), '.brewnet', 'logs');
  const since = query.since;

  // Determine which sources to read
  const sourcesToRead: LogSource[] = query.sources ?? ['cli', 'tunnel', 'access', 'service'];

  // Read sources in parallel
  const readers: Promise<UnifiedLogEntry[]>[] = [];

  if (sourcesToRead.includes('cli')) {
    readers.push(Promise.resolve(readCliLogs(logsDir, since)));
  }
  if (sourcesToRead.includes('tunnel')) {
    readers.push(Promise.resolve(readTunnelLogs(logsDir, since)));
  }
  if (sourcesToRead.includes('access')) {
    readers.push(Promise.resolve(readAccessLogs(projectPath, since)));
  }
  if (sourcesToRead.includes('service')) {
    readers.push(readServiceLogs(projectPath, { since }));
  }

  const results = await Promise.all(readers);
  let entries = results.flat();

  // Run log rotation after reading (best-effort, never blocks queries)
  try {
    runRotation(logsDir, projectPath);
  } catch {
    // Rotation failure should never block log queries
  }

  // Apply filters
  if (query.levels?.length) {
    entries = entries.filter((e) => query.levels!.includes(e.level));
  }
  if (query.services?.length) {
    entries = entries.filter((e) => e.service && query.services!.includes(e.service));
  }
  if (query.until) {
    entries = entries.filter((e) => e.timestamp <= query.until!);
  }
  if (query.search) {
    const searchLower = query.search.toLowerCase();
    entries = entries.filter((e) => e.message.toLowerCase().includes(searchLower));
  }

  // Sort by timestamp descending
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = entries.length;
  const limit = Math.min(query.limit ?? LOG_QUERY_DEFAULT_LIMIT, LOG_QUERY_MAX_LIMIT);
  const offset = query.offset ?? 0;
  const paged = entries.slice(offset, offset + limit);

  return {
    entries: paged,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Compute aggregated statistics from all log sources.
 * Reads all entries (bypassing pagination) to produce accurate counts.
 */
export async function getLogStats(projectPath: string): Promise<LogStats> {
  const logsDir = join(homedir(), '.brewnet', 'logs');

  // Read all sources directly (no pagination) for accurate stats
  const [cliEntries, tunnelEntries, accessEntries, serviceEntries] = await Promise.all([
    Promise.resolve(readCliLogs(logsDir)),
    Promise.resolve(readTunnelLogs(logsDir)),
    Promise.resolve(readAccessLogs(projectPath)),
    readServiceLogs(projectPath, {}),
  ]);
  const allEntries = [...cliEntries, ...tunnelEntries, ...accessEntries, ...serviceEntries];

  const bySource: Record<LogSource, number> = { cli: 0, tunnel: 0, access: 0, service: 0 };
  const byLevel: Record<string, number> = { info: 0, warn: 0, error: 0, debug: 0 };

  for (const entry of allEntries) {
    bySource[entry.source]++;
    byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
  }

  // Sort descending to pick recent errors
  allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recentErrors = allEntries.filter((e) => e.level === 'error').slice(0, 10);

  return {
    total: allEntries.length,
    bySource,
    byLevel,
    recentErrors,
    lastUpdated: new Date().toISOString(),
  };
}
