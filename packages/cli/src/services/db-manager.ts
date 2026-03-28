/**
 * Brewnet CLI — Database Manager
 *
 * Project-level SQLite database initialization and schema management.
 * Database lives at <projectPath>/.brewnet.db (survives ~/.brewnet/ deletion).
 *
 * Uses better-sqlite3 for synchronous, fast SQLite operations.
 * All table creation is idempotent (CREATE TABLE IF NOT EXISTS).
 */

import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DB_FILENAME = '.brewnet.db';

const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS apps (
    name TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    stack_id TEXT,
    source_url TEXT,
    app_dir TEXT NOT NULL,
    lang TEXT,
    framework TEXT,
    port INTEGER NOT NULL,
    gitea_repo_url TEXT,
    status TEXT NOT NULL DEFAULT 'creating',
    deploy_settings TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS domain_connections (
    app_name TEXT PRIMARY KEY,
    subdomain TEXT NOT NULL,
    domain TEXT NOT NULL,
    hostname TEXT NOT NULL,
    tunnel_id TEXT,
    cname_record_id TEXT,
    www_cname_record_id TEXT,
    container_port INTEGER,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    scenario TEXT,
    base_path TEXT,
    FOREIGN KEY (app_name) REFERENCES apps(name) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    status TEXT NOT NULL,
    deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (app_name) REFERENCES apps(name) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
] as const;

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_deploy_history_app_name ON deploy_history(app_name)`,
  `CREATE INDEX IF NOT EXISTS idx_deploy_history_deployed_at ON deploy_history(deployed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_connections_hostname ON domain_connections(hostname)`,
] as const;

/**
 * Get the full database file path for a project.
 */
export function getDbPath(projectPath: string): string {
  return join(projectPath, DB_FILENAME);
}

/**
 * Initialize the project-level SQLite database.
 *
 * Creates the database file if it does not exist, enables WAL mode
 * and foreign keys, then ensures all required tables are present.
 * Idempotent and safe to call multiple times.
 *
 * @param dbPath - Full path to the .db file (use getDbPath() to compute)
 * @returns The initialized Database instance
 */
export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const sql of CREATE_TABLES_SQL) {
    db.exec(sql);
  }
  for (const sql of INDEX_SQL) {
    db.exec(sql);
  }

  // Protect DB file (contains admin password and CF tokens)
  try { chmodSync(dbPath, 0o600); } catch { /* non-critical on some platforms */ }

  return db;
}
