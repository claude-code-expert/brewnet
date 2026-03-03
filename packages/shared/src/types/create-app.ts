/**
 * create-app — Shared type definitions
 *
 * Types used by `brewnet create-app` command for stack scaffolding.
 *
 * @module types/create-app
 */

// ---------------------------------------------------------------------------
// Stack Catalog
// ---------------------------------------------------------------------------

/**
 * A single entry in the 16-stack boilerplate catalog.
 * Each stack maps to an orphan branch `stack/<id>` in brewnet-boilerplate.
 */
export interface StackEntry {
  /** Unique identifier — matches the boilerplate branch name (e.g., "go-gin") */
  id: string;
  /** Display name for the programming language (e.g., "Go") */
  language: string;
  /** Display name for the framework (e.g., "Gin") */
  framework: string;
  /** Runtime version string (e.g., "1.22") */
  version: string;
  /** ORM or database access layer (e.g., "GORM", "Prisma 6", "SQLx") */
  orm: string;
  /**
   * true for stacks that serve UI and API on a single port (3000).
   * Only nodejs-nextjs and nodejs-nextjs-full.
   */
  isUnified: boolean;
  /**
   * true for Rust stacks where the first Docker build takes 3-10 minutes.
   * Triggers an extended health-check timeout (600 s) and a warning message.
   */
  buildSlow: boolean;
}

// ---------------------------------------------------------------------------
// Command Options
// ---------------------------------------------------------------------------

/** Valid database driver values for the --database flag. */
export type DbDriver = 'sqlite3' | 'postgres' | 'mysql';

/** Parsed command-line options for `brewnet create-app`. */
export interface CreateAppOptions {
  /** Value of --stack flag; undefined triggers interactive selection. */
  stack?: string;
  /** Value of --database flag; defaults to 'sqlite3'. */
  database: DbDriver;
}

// ---------------------------------------------------------------------------
// Health Verification
// ---------------------------------------------------------------------------

/** Result returned by the health-endpoint polling loop. */
export interface StackHealthResult {
  /** true if the /health endpoint returned status:"ok" within the timeout. */
  healthy: boolean;
  /** Total time spent polling in milliseconds. */
  elapsedMs: number;
  /** Value of db_connected field from the /health response body (if present). */
  dbConnected?: boolean;
  /** Error message if polling timed out or the fetch failed. */
  error?: string;
}
