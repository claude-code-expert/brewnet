/**
 * Brewnet CLI — Project Database DAO
 *
 * Provides typed CRUD operations for the project-level SQLite database.
 * All functions take projectPath as the first argument to locate the DB.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { AppEntry, DeployHistoryEntry } from '../types/app-entry.js';
import type { DomainConnection } from '@brewnet/shared';
import { getDbPath, initDatabase } from './db-manager.js';

/** Expand leading ~ to the user's home directory (Node.js fs APIs do not expand tilde). */
function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

// ---------------------------------------------------------------------------
// DB lifecycle — lazy singleton per process
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

export function getDb(projectPath: string): Database.Database {
  const target = getDbPath(expandTilde(projectPath));
  if (_db && _dbPath === target) return _db;
  if (_db) _db.close();
  _db = initDatabase(target);
  _dbPath = target;
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}

/** Test-only: inject a pre-configured database instance. */
export function _setDbForTest(db: Database.Database): void {
  if (_db && _db !== db) _db.close();
  _db = db;
  _dbPath = '__test__';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveDb(projectPath: string): Database.Database {
  if (_dbPath === '__test__' && _db) return _db;
  return getDb(projectPath);
}

// Row types matching SQLite snake_case columns

interface AppRow {
  name: string;
  mode: string;
  stack_id: string | null;
  source_url: string | null;
  app_dir: string;
  lang: string | null;
  framework: string | null;
  port: number;
  gitea_repo_url: string | null;
  status: string;
  deploy_settings: string | null;
  created_at: string;
}

interface DomainConnectionRow {
  app_name: string;
  subdomain: string;
  domain: string;
  hostname: string;
  tunnel_id: string | null;
  cname_record_id: string | null;
  www_cname_record_id: string | null;
  container_port: number | null;
  connected_at: string;
  scenario: string | null;
  base_path: string | null;
}

interface DeployHistoryRow {
  id: number;
  app_name: string;
  commit_hash: string;
  commit_message: string;
  status: string;
  deployed_at: string;
}

function rowToAppEntry(row: AppRow): AppEntry {
  const entry: AppEntry = {
    name: row.name,
    mode: row.mode as AppEntry['mode'],
    appDir: row.app_dir,
    port: row.port,
    status: row.status as AppEntry['status'],
    createdAt: row.created_at,
  };
  if (row.stack_id != null) entry.stackId = row.stack_id;
  if (row.source_url != null) entry.sourceUrl = row.source_url;
  if (row.lang != null) entry.lang = row.lang;
  if (row.framework != null) entry.framework = row.framework;
  if (row.gitea_repo_url != null) entry.giteaRepoUrl = row.gitea_repo_url;
  return entry;
}

function rowToDomainConnection(row: DomainConnectionRow): DomainConnection {
  const conn: DomainConnection = {
    appName: row.app_name,
    subdomain: row.subdomain,
    domain: row.domain,
    hostname: row.hostname,
    tunnelId: row.tunnel_id ?? '',
    cnameRecordId: row.cname_record_id ?? '',
    containerPort: row.container_port ?? 0,
    connectedAt: row.connected_at,
    scenario: (row.scenario ?? 'A') as DomainConnection['scenario'],
  };
  if (row.www_cname_record_id != null) conn.wwwCnameRecordId = row.www_cname_record_id;
  if (row.base_path != null) conn.basePath = row.base_path;
  return conn;
}

function rowToDeployHistory(row: DeployHistoryRow): DeployHistoryEntry {
  return {
    appName: row.app_name,
    commitHash: row.commit_hash,
    commitMessage: row.commit_message,
    status: row.status as DeployHistoryEntry['status'],
    deployedAt: row.deployed_at,
  };
}

// ---------------------------------------------------------------------------
// Apps CRUD
// ---------------------------------------------------------------------------

export function listApps(projectPath: string): AppEntry[] {
  const db = resolveDb(projectPath);
  const rows = db.prepare('SELECT * FROM apps ORDER BY created_at DESC').all() as AppRow[];
  return rows.map(rowToAppEntry);
}

export function getApp(projectPath: string, name: string): AppEntry | null {
  const db = resolveDb(projectPath);
  const row = db.prepare('SELECT * FROM apps WHERE name = ?').get(name) as AppRow | undefined;
  return row ? rowToAppEntry(row) : null;
}

export function addApp(projectPath: string, entry: AppEntry): void {
  const db = resolveDb(projectPath);
  db.prepare(`
    INSERT INTO apps (name, mode, stack_id, source_url, app_dir, lang, framework, port, gitea_repo_url, status, deploy_settings, created_at)
    VALUES (@name, @mode, @stack_id, @source_url, @app_dir, @lang, @framework, @port, @gitea_repo_url, @status, @deploy_settings, @created_at)
  `).run({
    name: entry.name,
    mode: entry.mode,
    stack_id: entry.stackId ?? null,
    source_url: entry.sourceUrl ?? null,
    app_dir: entry.appDir,
    lang: entry.lang ?? null,
    framework: entry.framework ?? null,
    port: entry.port,
    gitea_repo_url: entry.giteaRepoUrl ?? null,
    status: entry.status,
    deploy_settings: null,
    created_at: entry.createdAt,
  });
}

export function updateApp(projectPath: string, name: string, patch: Partial<AppEntry>): void {
  const db = resolveDb(projectPath);
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { name };

  if (patch.mode !== undefined) { setClauses.push('mode = @mode'); params.mode = patch.mode; }
  if (patch.stackId !== undefined) { setClauses.push('stack_id = @stack_id'); params.stack_id = patch.stackId ?? null; }
  if (patch.sourceUrl !== undefined) { setClauses.push('source_url = @source_url'); params.source_url = patch.sourceUrl ?? null; }
  if (patch.appDir !== undefined) { setClauses.push('app_dir = @app_dir'); params.app_dir = patch.appDir; }
  if (patch.lang !== undefined) { setClauses.push('lang = @lang'); params.lang = patch.lang ?? null; }
  if (patch.framework !== undefined) { setClauses.push('framework = @framework'); params.framework = patch.framework ?? null; }
  if (patch.port !== undefined) { setClauses.push('port = @port'); params.port = patch.port; }
  if (patch.giteaRepoUrl !== undefined) { setClauses.push('gitea_repo_url = @gitea_repo_url'); params.gitea_repo_url = patch.giteaRepoUrl ?? null; }
  if (patch.status !== undefined) { setClauses.push('status = @status'); params.status = patch.status; }
  if (patch.createdAt !== undefined) { setClauses.push('created_at = @created_at'); params.created_at = patch.createdAt; }

  if (setClauses.length === 0) return;

  db.prepare(`UPDATE apps SET ${setClauses.join(', ')} WHERE name = @name`).run(params);
}

export function removeApp(projectPath: string, name: string): void {
  const db = resolveDb(projectPath);
  db.prepare('DELETE FROM apps WHERE name = ?').run(name);
}

// ---------------------------------------------------------------------------
// Domain Connections CRUD
// ---------------------------------------------------------------------------

export function listDomainConnections(projectPath: string): DomainConnection[] {
  const db = resolveDb(projectPath);
  const rows = db.prepare('SELECT * FROM domain_connections ORDER BY connected_at DESC').all() as DomainConnectionRow[];
  return rows.map(rowToDomainConnection);
}

export function getDomainConnection(projectPath: string, appName: string): DomainConnection | null {
  const db = resolveDb(projectPath);
  const row = db.prepare('SELECT * FROM domain_connections WHERE app_name = ?').get(appName) as DomainConnectionRow | undefined;
  return row ? rowToDomainConnection(row) : null;
}

export function upsertDomainConnection(projectPath: string, conn: DomainConnection): void {
  const db = resolveDb(projectPath);
  db.prepare(`
    INSERT INTO domain_connections (app_name, subdomain, domain, hostname, tunnel_id, cname_record_id, www_cname_record_id, container_port, connected_at, scenario, base_path)
    VALUES (@app_name, @subdomain, @domain, @hostname, @tunnel_id, @cname_record_id, @www_cname_record_id, @container_port, @connected_at, @scenario, @base_path)
    ON CONFLICT(app_name) DO UPDATE SET
      subdomain = excluded.subdomain,
      domain = excluded.domain,
      hostname = excluded.hostname,
      tunnel_id = excluded.tunnel_id,
      cname_record_id = excluded.cname_record_id,
      www_cname_record_id = excluded.www_cname_record_id,
      container_port = excluded.container_port,
      connected_at = excluded.connected_at,
      scenario = excluded.scenario,
      base_path = excluded.base_path
  `).run({
    app_name: conn.appName,
    subdomain: conn.subdomain,
    domain: conn.domain,
    hostname: conn.hostname,
    tunnel_id: conn.tunnelId ?? null,
    cname_record_id: conn.cnameRecordId ?? null,
    www_cname_record_id: conn.wwwCnameRecordId ?? null,
    container_port: conn.containerPort ?? null,
    connected_at: conn.connectedAt,
    scenario: conn.scenario ?? null,
    base_path: conn.basePath ?? null,
  });
}

export function removeDomainConnection(projectPath: string, appName: string): void {
  const db = resolveDb(projectPath);
  db.prepare('DELETE FROM domain_connections WHERE app_name = ?').run(appName);
}

// ---------------------------------------------------------------------------
// Deploy History
// ---------------------------------------------------------------------------

const MAX_DEPLOY_HISTORY_PER_APP = 500;

export function getDeployHistory(projectPath: string, appName?: string): DeployHistoryEntry[] {
  const db = resolveDb(projectPath);
  if (appName) {
    const rows = db.prepare(
      'SELECT * FROM deploy_history WHERE app_name = ? ORDER BY deployed_at DESC',
    ).all(appName) as DeployHistoryRow[];
    return rows.map(rowToDeployHistory);
  }
  const rows = db.prepare(
    'SELECT * FROM deploy_history ORDER BY deployed_at DESC',
  ).all() as DeployHistoryRow[];
  return rows.map(rowToDeployHistory);
}

export function appendDeployHistory(projectPath: string, entry: DeployHistoryEntry): void {
  const db = resolveDb(projectPath);
  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO deploy_history (app_name, commit_hash, commit_message, status, deployed_at)
      VALUES (@app_name, @commit_hash, @commit_message, @status, @deployed_at)
    `).run({
      app_name: entry.appName,
      commit_hash: entry.commitHash,
      commit_message: entry.commitMessage,
      status: entry.status,
      deployed_at: entry.deployedAt,
    });

    // Auto-trim: keep only the latest MAX_DEPLOY_HISTORY_PER_APP rows per app
    db.prepare(`
      DELETE FROM deploy_history
      WHERE app_name = @app_name
        AND id NOT IN (
          SELECT id FROM deploy_history
          WHERE app_name = @app_name
          ORDER BY deployed_at DESC
          LIMIT @limit
        )
    `).run({ app_name: entry.appName, limit: MAX_DEPLOY_HISTORY_PER_APP });
  });
  txn();
}

// ---------------------------------------------------------------------------
// Settings KV
// ---------------------------------------------------------------------------

export function getSetting(projectPath: string, key: string): string | null {
  const db = resolveDb(projectPath);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(projectPath: string, key: string, value: string): void {
  const db = resolveDb(projectPath);
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run({ key, value });
}

// ---------------------------------------------------------------------------
// Migration — JSON → DB (one-time, idempotent)
// ---------------------------------------------------------------------------

interface MigrationData {
  apps?: AppEntry[];
  domainConnections?: DomainConnection[];
  deployHistory?: DeployHistoryEntry[];
}

export function migrateFromJson(projectPath: string, data: MigrationData): { migrated: string[] } {
  const db = resolveDb(projectPath);
  const migrated: string[] = [];

  const txn = db.transaction(() => {
    if (data.apps && data.apps.length > 0) {
      const insertApp = db.prepare(`
        INSERT OR IGNORE INTO apps (name, mode, stack_id, source_url, app_dir, lang, framework, port, gitea_repo_url, status, deploy_settings, created_at)
        VALUES (@name, @mode, @stack_id, @source_url, @app_dir, @lang, @framework, @port, @gitea_repo_url, @status, @deploy_settings, @created_at)
      `);
      for (const entry of data.apps) {
        const result = insertApp.run({
          name: entry.name,
          mode: entry.mode,
          stack_id: entry.stackId ?? null,
          source_url: entry.sourceUrl ?? null,
          app_dir: entry.appDir,
          lang: entry.lang ?? null,
          framework: entry.framework ?? null,
          port: entry.port,
          gitea_repo_url: entry.giteaRepoUrl ?? null,
          status: entry.status,
          deploy_settings: null,
          created_at: entry.createdAt,
        });
        if (result.changes > 0) migrated.push(`app:${entry.name}`);
      }
    }

    if (data.domainConnections && data.domainConnections.length > 0) {
      const insertConn = db.prepare(`
        INSERT OR IGNORE INTO domain_connections (app_name, subdomain, domain, hostname, tunnel_id, cname_record_id, www_cname_record_id, container_port, connected_at, scenario, base_path)
        VALUES (@app_name, @subdomain, @domain, @hostname, @tunnel_id, @cname_record_id, @www_cname_record_id, @container_port, @connected_at, @scenario, @base_path)
      `);
      for (const conn of data.domainConnections) {
        const result = insertConn.run({
          app_name: conn.appName,
          subdomain: conn.subdomain,
          domain: conn.domain,
          hostname: conn.hostname,
          tunnel_id: conn.tunnelId ?? null,
          cname_record_id: conn.cnameRecordId ?? null,
          www_cname_record_id: conn.wwwCnameRecordId ?? null,
          container_port: conn.containerPort ?? null,
          connected_at: conn.connectedAt,
          scenario: conn.scenario ?? null,
          base_path: conn.basePath ?? null,
        });
        if (result.changes > 0) migrated.push(`domain:${conn.appName}`);
      }
    }

    if (data.deployHistory && data.deployHistory.length > 0) {
      const insertDeploy = db.prepare(`
        INSERT INTO deploy_history (app_name, commit_hash, commit_message, status, deployed_at)
        VALUES (@app_name, @commit_hash, @commit_message, @status, @deployed_at)
      `);
      for (const entry of data.deployHistory) {
        insertDeploy.run({
          app_name: entry.appName,
          commit_hash: entry.commitHash,
          commit_message: entry.commitMessage,
          status: entry.status,
          deployed_at: entry.deployedAt,
        });
        migrated.push(`deploy:${entry.appName}:${entry.commitHash}`);
      }
    }
  });

  txn();
  return { migrated };
}
