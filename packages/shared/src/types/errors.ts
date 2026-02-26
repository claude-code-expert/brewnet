// T010 — Error codes, backup records, log entries, and generated config types

// ─── Error Codes ─────────────────────────────────────────────────────────────

export enum ErrorCode {
  /** Docker daemon not running */
  BN001 = 'BN001',
  /** Port already in use */
  BN002 = 'BN002',
  /** SSL certificate issuance failed */
  BN003 = 'BN003',
  /** Invalid license key */
  BN004 = 'BN004',
  /** Rate limit exceeded */
  BN005 = 'BN005',
  /** Build failed */
  BN006 = 'BN006',
  /** Invalid Git repository */
  BN007 = 'BN007',
  /** Resource not found */
  BN008 = 'BN008',
  /** Database error */
  BN009 = 'BN009',
  /** Feature requires Pro plan */
  BN010 = 'BN010',
}

/** Maps error codes to their corresponding HTTP status codes */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.BN001]: 503,
  [ErrorCode.BN002]: 409,
  [ErrorCode.BN003]: 500,
  [ErrorCode.BN004]: 401,
  [ErrorCode.BN005]: 429,
  [ErrorCode.BN006]: 500,
  [ErrorCode.BN007]: 400,
  [ErrorCode.BN008]: 404,
  [ErrorCode.BN009]: 500,
  [ErrorCode.BN010]: 403,
};

/** Human-readable descriptions for each error code */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.BN001]: 'Docker daemon is not running. Please start Docker and try again.',
  [ErrorCode.BN002]: 'Port is already in use. Please free the port or choose a different one.',
  [ErrorCode.BN003]: 'SSL certificate issuance failed. Check your domain configuration.',
  [ErrorCode.BN004]: 'Invalid license key. Please verify your license.',
  [ErrorCode.BN005]: 'Rate limit exceeded. Please wait and try again.',
  [ErrorCode.BN006]: 'Build failed. Check the build logs for details.',
  [ErrorCode.BN007]: 'Invalid Git repository. Ensure the repository URL is correct.',
  [ErrorCode.BN008]: 'Resource not found.',
  [ErrorCode.BN009]: 'Database error. Check the database configuration and logs.',
  [ErrorCode.BN010]: 'This feature requires a Pro plan. Upgrade to access it.',
};

// ─── Brewnet Error Class ─────────────────────────────────────────────────────

export class BrewnetError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly metadata?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, metadata?: Record<string, unknown>) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'BrewnetError';
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.metadata = metadata;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Log Entry ───────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  /** Timestamp of the log entry */
  timestamp: Date;
  /** Severity level */
  level: LogLevel;
  /** CLI command that generated this log (e.g., "brewnet add jellyfin") */
  command: string;
  /** Human-readable log message */
  message: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

// ─── Backup Record ───────────────────────────────────────────────────────────

export interface BackupRecord {
  /** Unique backup identifier (UUID) */
  id: string;
  /** Filesystem path to the backup archive */
  path: string;
  /** Backup archive size in bytes */
  size: number;
  /** List of service IDs included in this backup */
  services: string[];
  /** When the backup was created */
  createdAt: Date;
  /** Name of the project that was backed up */
  projectName: string;
  /** Filesystem path of the project that was backed up */
  projectPath: string;
}

// ─── Generated Config ────────────────────────────────────────────────────────

export interface GeneratedFile {
  /** Relative file path within the project directory */
  path: string;
  /** Full file content as a string */
  content: string;
  /** Unix file permissions (e.g., 0o600 for .env files) */
  permissions?: number;
}

export interface GeneratedConfig {
  /** Absolute path to the project directory */
  projectPath: string;
  /** List of files to be written */
  files: GeneratedFile[];
}
