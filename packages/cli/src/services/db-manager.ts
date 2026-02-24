/**
 * Brewnet CLI — Database Manager (T101)
 *
 * Manages the local SQLite database used for tracking services,
 * backups, and application logs.
 *
 * Uses `better-sqlite3` for synchronous, fast SQLite operations.
 * All table creation is idempotent (CREATE TABLE IF NOT EXISTS).
 *
 * @module services/db-manager
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DB_DIR = join(homedir(), '.brewnet', 'db');
const DB_FILENAME = 'brewnet.db';

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

/**
 * SQL statements for creating the core Brewnet tables.
 * All use IF NOT EXISTS for idempotent initialization.
 */
const CREATE_TABLES_SQL = [
  // Services table: tracks Docker services managed by Brewnet
  `CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Backups table: records of project backup snapshots
  `CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Logs table: structured application logs
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL DEFAULT 'info',
    command TEXT,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the Brewnet SQLite database.
 *
 * Creates the database directory and file if they do not exist,
 * then ensures all required tables are present. This function is
 * idempotent and safe to call multiple times.
 *
 * @param dbDir - Directory for the database file. Defaults to ~/.brewnet/db/
 * @returns The initialized Database instance (for further operations if needed)
 */
export function initDatabase(dbDir: string = DEFAULT_DB_DIR): Database.Database {
  // Ensure the database directory exists
  mkdirSync(dbDir, { recursive: true });

  const dbPath = join(dbDir, DB_FILENAME);
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create all tables (idempotent)
  for (const sql of CREATE_TABLES_SQL) {
    db.exec(sql);
  }

  return db;
}

/**
 * Open an existing Brewnet database (does not create tables).
 *
 * @param dbDir - Directory for the database file. Defaults to ~/.brewnet/db/
 * @returns The Database instance
 */
export function openDatabase(dbDir: string = DEFAULT_DB_DIR): Database.Database {
  const dbPath = join(dbDir, DB_FILENAME);
  return new Database(dbPath);
}

/**
 * Get the default database directory path.
 */
export function getDefaultDbDir(): string {
  return DEFAULT_DB_DIR;
}

/**
 * Get the full path to the database file.
 */
export function getDbPath(dbDir: string = DEFAULT_DB_DIR): string {
  return join(dbDir, DB_FILENAME);
}
