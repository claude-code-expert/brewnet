// T001 — Centralized logging shared types

// ─── Type Aliases ───────────────────────────────────────────────────────────

/** Origin of a unified log entry */
export type LogSource = 'cli' | 'tunnel' | 'access' | 'service';

/** Severity level for unified log entries (extends base LogLevel with 'debug') */
export type UnifiedLogLevel = 'info' | 'warn' | 'error' | 'debug';

// ─── Unified Log Entry ─────────────────────────────────────────────────────

/** A normalized log record from any source */
export interface UnifiedLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Origin of this entry */
  source: LogSource;
  /** Severity level */
  level: UnifiedLogLevel;
  /** Container or service name (if applicable) */
  service?: string;
  /** Human-readable log message */
  message: string;
  /** Arbitrary structured metadata */
  metadata: Record<string, unknown>;
}

// ─── Log Query ──────────────────────────────────────────────────────────────

/** Filter and pagination parameters for querying unified logs */
export interface LogQuery {
  /** Filter by origin (default: all sources) */
  sources?: LogSource[];
  /** Filter by service name */
  services?: string[];
  /** Filter by severity */
  levels?: UnifiedLogLevel[];
  /** ISO 8601 start of time range */
  since?: string;
  /** ISO 8601 end of time range */
  until?: string;
  /** Max entries to return (default: 100, max: 1000) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Text search in message field */
  search?: string;
}

// ─── Log Query Result ───────────────────────────────────────────────────────

/** Paginated response from a log query */
export interface LogQueryResult {
  /** Matched log entries, sorted by timestamp descending */
  entries: UnifiedLogEntry[];
  /** Total matching entries (before pagination) */
  total: number;
  /** Whether more entries exist beyond current page */
  hasMore: boolean;
}

// ─── Log Stats ──────────────────────────────────────────────────────────────

/** Aggregated statistics across all log sources */
export interface LogStats {
  /** Total log entry count */
  total: number;
  /** Count per source */
  bySource: Record<LogSource, number>;
  /** Count per level */
  byLevel: Record<string, number>;
  /** Latest error-level entries (max 10) */
  recentErrors: UnifiedLogEntry[];
  /** ISO 8601 timestamp of when stats were computed */
  lastUpdated: string;
}
