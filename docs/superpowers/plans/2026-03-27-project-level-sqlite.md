# Project-Level SQLite Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move critical app/domain/deploy data from ephemeral `~/.brewnet/*.json` files to a project-level SQLite DB that survives `~/.brewnet/` recreation.

**Architecture:** Repurpose the existing but unused `db-manager.ts` to create `<projectPath>/.brewnet.db`. The new `project-db.ts` module provides a typed data-access layer (DAO) with the same function signatures as `app-registry.ts`, making the migration a drop-in replacement. `app-registry.ts` is deleted; all consumers switch to `project-db.ts`. Domain connections move from `selections.json` to the DB. `selections.json` retains wizard-only fields (admin creds, server selections, CF credentials).

**Tech Stack:** better-sqlite3 (already in dependencies), TypeScript strict mode, Jest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `packages/cli/src/services/project-db.ts` | SQLite DAO — apps, domain_connections, deploy_history, settings KV |
| **Create** | `tests/unit/cli/services/project-db.test.ts` | Unit tests for all DAO functions |
| **Modify** | `packages/cli/src/services/db-manager.ts` | Update schema, accept projectPath, remove old tables |
| **Modify** | `packages/cli/src/services/app-manager.ts:8,16-19,31-33,84-128` | Replace `app-registry` imports with `project-db` |
| **Modify** | `packages/cli/src/services/admin-server.ts:32,1034-1095,1371-1427,2124-2128,2161-2165` | Use DB for apps/domains, remove JSON file reads |
| **Modify** | `packages/cli/src/services/domain-manager.ts:27-28,93-100,325-345,467-469` | Write domain connections to DB instead of selections.json |
| **Delete** | `packages/cli/src/services/app-registry.ts` | Replaced entirely by project-db.ts |
| **Modify** | `packages/shared/src/types/wizard-state.ts` | Remove `domainConnections` from WizardState (moved to DB) |
| **Modify** | `tests/unit/cli/services/app-registry.test.ts` | Delete (replaced by project-db.test.ts) |
| **Modify** | `tests/unit/cli/services/app-registry-extra.test.ts` | Delete (replaced by project-db.test.ts) |
| **Modify** | `tests/unit/cli/services/app-manager.test.ts` | Update mocks: app-registry → project-db |
| **Modify** | `tests/unit/cli/services/app-manager-extra.test.ts` | Same mock updates |
| **Modify** | `tests/unit/cli/services/domain-manager.test.ts` | Update: domain writes go to DB, not saveState |
| **Modify** | `tests/unit/cli/services/domain-manager-extra.test.ts` | Same |
| **Modify** | `tests/unit/cli/services/domain-manager-paths.test.ts` | Same |
| **Modify** | `tests/integration/admin-server.test.ts` | Add project-db mock, update app/domain test flows |

---

### Task 1: Create project-db.ts — SQLite DAO

**Files:**
- Create: `packages/cli/src/services/project-db.ts`
- Modify: `packages/cli/src/services/db-manager.ts`

- [ ] **Step 1: Update db-manager.ts schema**

Replace the 3 unused tables with the new schema. Keep `initDatabase()` signature but change default path logic.

```typescript
// packages/cli/src/services/db-manager.ts
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';

const DB_FILENAME = 'brewnet.db';

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
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
] as const;

export function initDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const sql of CREATE_TABLES_SQL) {
    db.exec(sql);
  }
  return db;
}

export function getDbPath(projectPath: string): string {
  return join(projectPath, '.brewnet.db');
}
```

- [ ] **Step 2: Create project-db.ts DAO**

This module provides the same function signatures as `app-registry.ts` plus domain/settings operations. Uses a lazy singleton DB connection per projectPath.

```typescript
// packages/cli/src/services/project-db.ts
import type Database from 'better-sqlite3';
import { initDatabase, getDbPath } from './db-manager.js';
import type { AppEntry, DeployHistoryEntry } from '../types/app-entry.js';
import type { DomainConnection } from '@brewnet/shared';

// Lazy singleton — one DB connection per process
let _db: Database.Database | null = null;
let _dbProjectPath: string | null = null;

export function getDb(projectPath: string): Database.Database {
  if (_db && _dbProjectPath === projectPath) return _db;
  if (_db) _db.close();
  _db = initDatabase(getDbPath(projectPath));
  _dbProjectPath = projectPath;
  return _db;
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null; _dbProjectPath = null; }
}

/** For tests only — inject a pre-configured DB instance */
export function _setDbForTest(db: Database.Database): void {
  _db = db;
  _dbProjectPath = '__test__';
}

// ── Apps ──────────────────────────────────────────────────────────────

function rowToApp(row: Record<string, unknown>): AppEntry {
  return {
    name: row.name as string,
    mode: row.mode as AppEntry['mode'],
    stackId: (row.stack_id as string) || undefined,
    sourceUrl: (row.source_url as string) || undefined,
    appDir: row.app_dir as string,
    lang: (row.lang as string) || undefined,
    framework: (row.framework as string) || undefined,
    port: row.port as number,
    giteaRepoUrl: (row.gitea_repo_url as string) || undefined,
    status: row.status as AppEntry['status'],
    createdAt: row.created_at as string,
  };
}

export function listApps(projectPath: string): AppEntry[] {
  const db = getDb(projectPath);
  const rows = db.prepare('SELECT * FROM apps ORDER BY created_at').all();
  return rows.map((r) => rowToApp(r as Record<string, unknown>));
}

export function getApp(projectPath: string, name: string): AppEntry | null {
  const db = getDb(projectPath);
  const row = db.prepare('SELECT * FROM apps WHERE name = ?').get(name);
  return row ? rowToApp(row as Record<string, unknown>) : null;
}

export function addApp(projectPath: string, entry: AppEntry): void {
  const db = getDb(projectPath);
  db.prepare(`INSERT INTO apps (name, mode, stack_id, source_url, app_dir, lang, framework, port, gitea_repo_url, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry.name, entry.mode, entry.stackId ?? null, entry.sourceUrl ?? null,
    entry.appDir, entry.lang ?? null, entry.framework ?? null, entry.port,
    entry.giteaRepoUrl ?? null, entry.status, entry.createdAt,
  );
}

export function updateApp(projectPath: string, name: string, patch: Partial<AppEntry>): void {
  const db = getDb(projectPath);
  const existing = db.prepare('SELECT name FROM apps WHERE name = ?').get(name);
  if (!existing) throw new Error(`App "${name}" not found`);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const fieldMap: Record<string, string> = {
    mode: 'mode', stackId: 'stack_id', sourceUrl: 'source_url', appDir: 'app_dir',
    lang: 'lang', framework: 'framework', port: 'port', giteaRepoUrl: 'gitea_repo_url',
    status: 'status', createdAt: 'created_at',
  };
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (jsKey in patch) {
      sets.push(`${dbCol} = ?`);
      vals.push((patch as Record<string, unknown>)[jsKey] ?? null);
    }
  }
  if (sets.length === 0) return;
  vals.push(name);
  db.prepare(`UPDATE apps SET ${sets.join(', ')} WHERE name = ?`).run(...vals);
}

export function removeApp(projectPath: string, name: string): void {
  const db = getDb(projectPath);
  db.prepare('DELETE FROM apps WHERE name = ?').run(name);
  // FK CASCADE deletes domain_connections and deploy_history
}

// ── Domain Connections ────────────────────────────────────────────────

function rowToConnection(row: Record<string, unknown>): DomainConnection {
  return {
    appName: row.app_name as string,
    subdomain: row.subdomain as string,
    domain: row.domain as string,
    hostname: row.hostname as string,
    tunnelId: (row.tunnel_id as string) || undefined,
    cnameRecordId: (row.cname_record_id as string) || undefined,
    wwwCnameRecordId: (row.www_cname_record_id as string) || undefined,
    containerPort: (row.container_port as number) || undefined,
    connectedAt: row.connected_at as string,
    scenario: (row.scenario as string) as DomainConnection['scenario'],
    basePath: (row.base_path as string) || undefined,
  };
}

export function listDomainConnections(projectPath: string): DomainConnection[] {
  const db = getDb(projectPath);
  const rows = db.prepare('SELECT * FROM domain_connections ORDER BY connected_at').all();
  return rows.map((r) => rowToConnection(r as Record<string, unknown>));
}

export function getDomainConnection(projectPath: string, appName: string): DomainConnection | null {
  const db = getDb(projectPath);
  const row = db.prepare('SELECT * FROM domain_connections WHERE app_name = ?').get(appName);
  return row ? rowToConnection(row as Record<string, unknown>) : null;
}

export function upsertDomainConnection(projectPath: string, conn: DomainConnection): void {
  const db = getDb(projectPath);
  db.prepare(`INSERT OR REPLACE INTO domain_connections
    (app_name, subdomain, domain, hostname, tunnel_id, cname_record_id, www_cname_record_id, container_port, connected_at, scenario, base_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    conn.appName, conn.subdomain, conn.domain, conn.hostname,
    conn.tunnelId ?? null, conn.cnameRecordId ?? null, conn.wwwCnameRecordId ?? null,
    conn.containerPort ?? null, conn.connectedAt, conn.scenario ?? null, conn.basePath ?? null,
  );
}

export function removeDomainConnection(projectPath: string, appName: string): void {
  const db = getDb(projectPath);
  db.prepare('DELETE FROM domain_connections WHERE app_name = ?').run(appName);
}

// ── Deploy History ────────────────────────────────────────────────────

function rowToDeployEntry(row: Record<string, unknown>): DeployHistoryEntry {
  return {
    appName: row.app_name as string,
    commitHash: row.commit_hash as string,
    commitMessage: row.commit_message as string,
    status: row.status as 'success' | 'failed',
    deployedAt: row.deployed_at as string,
  };
}

export function getDeployHistory(projectPath: string, appName?: string): DeployHistoryEntry[] {
  const db = getDb(projectPath);
  if (appName) {
    return db.prepare('SELECT * FROM deploy_history WHERE app_name = ? ORDER BY deployed_at DESC')
      .all(appName).map((r) => rowToDeployEntry(r as Record<string, unknown>));
  }
  return db.prepare('SELECT * FROM deploy_history ORDER BY deployed_at DESC LIMIT 500')
    .all().map((r) => rowToDeployEntry(r as Record<string, unknown>));
}

export function appendDeployHistory(projectPath: string, entry: DeployHistoryEntry): void {
  const db = getDb(projectPath);
  db.prepare(`INSERT INTO deploy_history (app_name, commit_hash, commit_message, status, deployed_at)
    VALUES (?, ?, ?, ?, ?)`).run(
    entry.appName, entry.commitHash, entry.commitMessage, entry.status, entry.deployedAt,
  );
  // Trim old entries — keep max 500 per app
  db.prepare(`DELETE FROM deploy_history WHERE id NOT IN (
    SELECT id FROM deploy_history WHERE app_name = ? ORDER BY deployed_at DESC LIMIT 500
  ) AND app_name = ?`).run(entry.appName, entry.appName);
}

// ── Settings KV ───────────────────────────────────────────────────────

export function getSetting(projectPath: string, key: string): string | null {
  const db = getDb(projectPath);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(projectPath: string, key: string, value: string): void {
  const db = getDb(projectPath);
  db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(key, value);
}

// ── Migration: JSON → DB (one-time) ──────────────────────────────────

export function migrateFromJson(projectPath: string, data: {
  apps?: AppEntry[];
  domainConnections?: DomainConnection[];
  deployHistory?: DeployHistoryEntry[];
  giteaConfig?: { baseUrl: string; username: string };
}): { migrated: string[] } {
  const db = getDb(projectPath);
  const migrated: string[] = [];

  const runInTransaction = db.transaction(() => {
    if (data.apps?.length) {
      for (const app of data.apps) {
        const exists = db.prepare('SELECT name FROM apps WHERE name = ?').get(app.name);
        if (!exists) {
          addApp(projectPath, app);
        }
      }
      migrated.push(`apps: ${data.apps.length}`);
    }
    if (data.domainConnections?.length) {
      for (const conn of data.domainConnections) {
        upsertDomainConnection(projectPath, conn);
      }
      migrated.push(`domain_connections: ${data.domainConnections.length}`);
    }
    if (data.deployHistory?.length) {
      for (const entry of data.deployHistory) {
        appendDeployHistory(projectPath, entry);
      }
      migrated.push(`deploy_history: ${data.deployHistory.length}`);
    }
    if (data.giteaConfig) {
      setSetting(projectPath, 'gitea.baseUrl', data.giteaConfig.baseUrl);
      setSetting(projectPath, 'gitea.username', data.giteaConfig.username);
      migrated.push('gitea_config');
    }
  });

  runInTransaction();
  return { migrated };
}
```

- [ ] **Step 3: Verify db-manager.ts and project-db.ts compile**

Run: `cd packages/cli && npx tsc --noEmit src/services/project-db.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/services/project-db.ts packages/cli/src/services/db-manager.ts
git commit -m "feat: add project-level SQLite DAO (project-db.ts)"
```

---

### Task 2: Unit tests for project-db.ts

**Files:**
- Create: `tests/unit/cli/services/project-db.test.ts`

- [ ] **Step 1: Write comprehensive tests**

These tests use a real in-memory SQLite DB (`:memory:`), not mocks, because the DAO is the unit under test.

```typescript
// tests/unit/cli/services/project-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';

// We need to mock db-manager to inject an in-memory DB
import { jest } from '@jest/globals';

// Mock db-manager — inject in-memory DB
let testDb: Database.Database;

jest.unstable_mockModule('../../../../packages/cli/src/services/db-manager.js', () => ({
  initDatabase: jest.fn(() => testDb),
  getDbPath: jest.fn((p: string) => `${p}/.brewnet.db`),
}));

const projectDb = await import('../../../../packages/cli/src/services/project-db.js');

const PROJECT = '/tmp/test-project';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS apps (
    name TEXT PRIMARY KEY, mode TEXT NOT NULL, stack_id TEXT, source_url TEXT,
    app_dir TEXT NOT NULL, lang TEXT, framework TEXT, port INTEGER NOT NULL,
    gitea_repo_url TEXT, status TEXT NOT NULL DEFAULT 'creating',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS domain_connections (
    app_name TEXT PRIMARY KEY, subdomain TEXT NOT NULL, domain TEXT NOT NULL,
    hostname TEXT NOT NULL, tunnel_id TEXT, cname_record_id TEXT,
    www_cname_record_id TEXT, container_port INTEGER,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')), scenario TEXT, base_path TEXT,
    FOREIGN KEY (app_name) REFERENCES apps(name) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, app_name TEXT NOT NULL,
    commit_hash TEXT NOT NULL, commit_message TEXT NOT NULL,
    status TEXT NOT NULL, deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (app_name) REFERENCES apps(name) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

function sampleApp(name = 'my-app'): Parameters<typeof projectDb.addApp>[1] {
  return {
    name, mode: 'boilerplate', stackId: 'nodejs-nextjs-full',
    appDir: `/home/user/apps/${name}`, port: 3000,
    status: 'running', createdAt: '2026-03-27T00:00:00.000Z',
  };
}

function sampleConnection(appName = 'my-app'): Parameters<typeof projectDb.upsertDomainConnection>[1] {
  return {
    appName, subdomain: 'app', domain: 'example.com',
    hostname: 'app.example.com', tunnelId: 'tun-1',
    cnameRecordId: 'rec-1', containerPort: 3000,
    connectedAt: '2026-03-27T00:00:00.000Z', scenario: 'standard',
  };
}

describe('project-db', () => {
  beforeEach(() => {
    testDb = createTestDb();
    projectDb._setDbForTest(testDb);
  });

  afterEach(() => {
    projectDb.closeDb();
  });

  // ── Apps ──

  describe('apps CRUD', () => {
    it('listApps returns empty array initially', () => {
      expect(projectDb.listApps(PROJECT)).toEqual([]);
    });

    it('addApp + listApps round-trips', () => {
      projectDb.addApp(PROJECT, sampleApp());
      const apps = projectDb.listApps(PROJECT);
      expect(apps).toHaveLength(1);
      expect(apps[0]!.name).toBe('my-app');
      expect(apps[0]!.mode).toBe('boilerplate');
      expect(apps[0]!.port).toBe(3000);
    });

    it('addApp throws on duplicate name', () => {
      projectDb.addApp(PROJECT, sampleApp());
      expect(() => projectDb.addApp(PROJECT, sampleApp())).toThrow();
    });

    it('getApp returns null for missing app', () => {
      expect(projectDb.getApp(PROJECT, 'ghost')).toBeNull();
    });

    it('getApp returns matching app', () => {
      projectDb.addApp(PROJECT, sampleApp());
      const app = projectDb.getApp(PROJECT, 'my-app');
      expect(app?.name).toBe('my-app');
    });

    it('updateApp patches fields', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.updateApp(PROJECT, 'my-app', { status: 'stopped', port: 4000 });
      const app = projectDb.getApp(PROJECT, 'my-app');
      expect(app?.status).toBe('stopped');
      expect(app?.port).toBe(4000);
    });

    it('updateApp throws for missing app', () => {
      expect(() => projectDb.updateApp(PROJECT, 'ghost', { status: 'stopped' })).toThrow('not found');
    });

    it('removeApp deletes app', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.removeApp(PROJECT, 'my-app');
      expect(projectDb.listApps(PROJECT)).toHaveLength(0);
    });
  });

  // ── Domain Connections ──

  describe('domain connections CRUD', () => {
    it('listDomainConnections returns empty initially', () => {
      expect(projectDb.listDomainConnections(PROJECT)).toEqual([]);
    });

    it('upsert + list round-trips', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.upsertDomainConnection(PROJECT, sampleConnection());
      const conns = projectDb.listDomainConnections(PROJECT);
      expect(conns).toHaveLength(1);
      expect(conns[0]!.hostname).toBe('app.example.com');
    });

    it('upsert overwrites existing connection for same app', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.upsertDomainConnection(PROJECT, sampleConnection());
      projectDb.upsertDomainConnection(PROJECT, { ...sampleConnection(), hostname: 'new.example.com' });
      const conns = projectDb.listDomainConnections(PROJECT);
      expect(conns).toHaveLength(1);
      expect(conns[0]!.hostname).toBe('new.example.com');
    });

    it('removeDomainConnection deletes by appName', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.upsertDomainConnection(PROJECT, sampleConnection());
      projectDb.removeDomainConnection(PROJECT, 'my-app');
      expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(0);
    });

    it('FK CASCADE: removing app deletes its domain connection', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.upsertDomainConnection(PROJECT, sampleConnection());
      projectDb.removeApp(PROJECT, 'my-app');
      expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(0);
    });
  });

  // ── Deploy History ──

  describe('deploy history', () => {
    it('returns empty initially', () => {
      expect(projectDb.getDeployHistory(PROJECT)).toEqual([]);
    });

    it('append + get round-trips', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.appendDeployHistory(PROJECT, {
        appName: 'my-app', commitHash: 'abc123', commitMessage: 'init',
        status: 'success', deployedAt: '2026-03-27T00:00:00.000Z',
      });
      const history = projectDb.getDeployHistory(PROJECT, 'my-app');
      expect(history).toHaveLength(1);
      expect(history[0]!.commitHash).toBe('abc123');
    });

    it('FK CASCADE: removing app deletes its deploy history', () => {
      projectDb.addApp(PROJECT, sampleApp());
      projectDb.appendDeployHistory(PROJECT, {
        appName: 'my-app', commitHash: 'abc', commitMessage: 'x',
        status: 'success', deployedAt: '2026-03-27T00:00:00.000Z',
      });
      projectDb.removeApp(PROJECT, 'my-app');
      expect(projectDb.getDeployHistory(PROJECT, 'my-app')).toHaveLength(0);
    });
  });

  // ── Settings KV ──

  describe('settings KV', () => {
    it('getSetting returns null for missing key', () => {
      expect(projectDb.getSetting(PROJECT, 'no-such-key')).toBeNull();
    });

    it('setSetting + getSetting round-trips', () => {
      projectDb.setSetting(PROJECT, 'gitea.baseUrl', 'http://localhost/git');
      expect(projectDb.getSetting(PROJECT, 'gitea.baseUrl')).toBe('http://localhost/git');
    });

    it('setSetting overwrites existing value', () => {
      projectDb.setSetting(PROJECT, 'key', 'v1');
      projectDb.setSetting(PROJECT, 'key', 'v2');
      expect(projectDb.getSetting(PROJECT, 'key')).toBe('v2');
    });
  });

  // ── Migration ──

  describe('migrateFromJson', () => {
    it('migrates apps, connections, and deploy history in one transaction', () => {
      const result = projectDb.migrateFromJson(PROJECT, {
        apps: [sampleApp('a'), sampleApp('b')],
        domainConnections: [sampleConnection('a')],
        deployHistory: [{
          appName: 'a', commitHash: 'abc', commitMessage: 'init',
          status: 'success', deployedAt: '2026-03-27T00:00:00.000Z',
        }],
        giteaConfig: { baseUrl: 'http://localhost/git', username: 'admin' },
      });

      expect(result.migrated).toContain('apps: 2');
      expect(result.migrated).toContain('domain_connections: 1');
      expect(result.migrated).toContain('deploy_history: 1');
      expect(result.migrated).toContain('gitea_config');
      expect(projectDb.listApps(PROJECT)).toHaveLength(2);
      expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(1);
      expect(projectDb.getSetting(PROJECT, 'gitea.baseUrl')).toBe('http://localhost/git');
    });

    it('skips duplicate apps on re-migration', () => {
      projectDb.addApp(PROJECT, sampleApp('a'));
      const result = projectDb.migrateFromJson(PROJECT, {
        apps: [sampleApp('a')],
      });
      expect(result.migrated).toContain('apps: 1');
      expect(projectDb.listApps(PROJECT)).toHaveLength(1); // no duplicate
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/unit/cli/services/project-db.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/cli/services/project-db.test.ts
git commit -m "test: add project-db unit tests with in-memory SQLite"
```

---

### Task 3: Migrate app-manager.ts to use project-db

**Files:**
- Modify: `packages/cli/src/services/app-manager.ts:8,16-19,31-33,84-128`

- [ ] **Step 1: Replace app-registry imports with project-db**

In `app-manager.ts`, replace:
```typescript
// OLD
import { readApps, addApp, updateApp, removeApp as registryRemoveApp, readDeployHistory, appendDeployHistory } from './app-registry.js';
```
with:
```typescript
// NEW
import {
  listApps as dbListApps, addApp as dbAddApp, updateApp as dbUpdateApp,
  removeApp as dbRemoveApp, getDeployHistory as dbGetDeployHistory,
  appendDeployHistory as dbAppendDeployHistory, getSetting, setSetting,
  listDomainConnections,
} from './project-db.js';
```

- [ ] **Step 2: Update resolveAppsJsonPath → resolveProjectPath**

Replace `resolveAppsJsonPath()` (line 31-33) and the DEPLOY_HISTORY_PATH constant (line 19) with a `resolveProjectPath()` that returns the project directory path, derived from `getLastProject()` + `loadState()`.

```typescript
// Remove these:
// const DEPLOY_HISTORY_PATH = join(BREWNET_DIR, 'deploy-history.json');
// export function resolveAppsJsonPath(): string { return join(BREWNET_DIR, 'apps.json'); }

// Add this:
export function resolveProjectPath(): string {
  const last = getLastProject();
  if (last) {
    const state = loadState(last);
    if (state?.projectPath) return state.projectPath;
  }
  return process.cwd();
}
```

- [ ] **Step 3: Update listApps() function (lines 84-128)**

Replace the JSON-based `listApps()` with DB calls:
```typescript
export async function listApps(): Promise<AppEntry[]> {
  const projectPath = resolveProjectPath();
  return dbListApps(projectPath);
}
```

Remove the `_boilerplateRegistered` flag and `.brewnet-boilerplate.json` auto-registration logic — boilerplates should be registered via the wizard's generate step into the DB directly.

- [ ] **Step 4: Update all other app-registry function calls**

Search for every `readApps(`, `addApp(`, `updateApp(`, `registryRemoveApp(`, `readDeployHistory(`, `appendDeployHistory(` call in app-manager.ts and replace with the DB equivalents, passing `resolveProjectPath()` instead of `resolveAppsJsonPath()`.

- [ ] **Step 5: Update Gitea config cache to use settings KV**

Replace `loadGiteaConfig()` and `saveGiteaConfig()` functions to use `getSetting`/`setSetting`:
```typescript
export function loadGiteaConfig(): GiteaConfig | null {
  const pp = resolveProjectPath();
  const baseUrl = getSetting(pp, 'gitea.baseUrl');
  const username = getSetting(pp, 'gitea.username');
  if (!baseUrl || !username) return null;
  return { baseUrl, username, writtenAt: getSetting(pp, 'gitea.writtenAt') ?? '' };
}

export function saveGiteaConfig(baseUrl: string, username: string): void {
  const pp = resolveProjectPath();
  setSetting(pp, 'gitea.baseUrl', baseUrl);
  setSetting(pp, 'gitea.username', username);
  setSetting(pp, 'gitea.writtenAt', new Date().toISOString());
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors in domain-manager.ts)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/services/app-manager.ts
git commit -m "refactor: migrate app-manager from JSON files to project-db SQLite"
```

---

### Task 4: Migrate domain-manager.ts to use project-db

**Files:**
- Modify: `packages/cli/src/services/domain-manager.ts:27-28,325-345,467-469,482-484`

- [ ] **Step 1: Replace selections.json domain writes with DB writes**

In `domain-manager.ts`, the `connect()` method (lines 325-345) currently does:
```typescript
this.state.domainConnections.push(connection);
saveState(this.state);
```

Replace with:
```typescript
import { upsertDomainConnection, removeDomainConnection, listDomainConnections as dbListConns } from './project-db.js';

// In connect(), step 5:
upsertDomainConnection(this.state.projectPath, connection);
```

- [ ] **Step 2: Update disconnect() (lines 467-469)**

Replace:
```typescript
this.state.domainConnections = connections.filter((c) => c.appName !== appName);
saveState(this.state);
```
With:
```typescript
removeDomainConnection(this.state.projectPath, appName);
```

- [ ] **Step 3: Update list() (line 482-484)**

Replace:
```typescript
list(): DomainConnection[] {
  return this.state.domainConnections ?? [];
}
```
With:
```typescript
list(): DomainConnection[] {
  return dbListConns(this.state.projectPath);
}
```

- [ ] **Step 4: Remove `import { readApps } from './app-registry.js'`** (line 28)

Replace with import from project-db if needed, or read apps from DB.

- [ ] **Step 5: Verify compilation**

Run: `cd packages/cli && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/services/domain-manager.ts
git commit -m "refactor: migrate domain-manager from selections.json to project-db SQLite"
```

---

### Task 5: Migrate admin-server.ts to use project-db

**Files:**
- Modify: `packages/cli/src/services/admin-server.ts:1034-1095,1371-1427,2124-2128,2161-2165`

- [ ] **Step 1: Add project-db import**

```typescript
import { listDomainConnections, listApps as dbListApps } from './project-db.js';
```

- [ ] **Step 2: Update startup allowedWorkingDirs (lines 1078-1085)**

Replace `~/.brewnet/apps.json` read with:
```typescript
try {
  const dbApps = dbListApps(projectPath);
  for (const app of dbApps) {
    if (app.appDir) allowedWorkingDirs.add(app.appDir);
  }
} catch { /* DB not yet initialized — non-fatal */ }
```

- [ ] **Step 3: Update GET /api/apps domain enrichment (line 1400)**

Replace:
```typescript
const domainConn = (wizardState?.domainConnections ?? []).find((c) => c.appName === a.name);
```
With:
```typescript
const allConns = listDomainConnections(projectPath);
// (computed once before the loop)
// ...
const domainConn = allConns.find((c) => c.appName === a.name);
```

- [ ] **Step 4: Remove in-memory domainConnections sync in connect/disconnect handlers**

Lines 2124-2128 and 2161-2165 currently reload `selections.json` to sync `state.domainConnections`. Since connections now live in DB and are read fresh on each API call, these sync blocks become:
```typescript
// No more in-memory sync needed — DB is source of truth
// (remove the loadState + domainConnections assignment blocks)
```

- [ ] **Step 5: Verify compilation**

Run: `cd packages/cli && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/services/admin-server.ts
git commit -m "refactor: migrate admin-server app/domain reads to project-db SQLite"
```

---

### Task 6: Remove domainConnections from WizardState

**Files:**
- Modify: `packages/shared/src/types/wizard-state.ts`
- Modify: `packages/cli/src/wizard/state.ts` (loadState migration)

- [ ] **Step 1: Keep domainConnections as optional deprecated field**

In `wizard-state.ts`, mark it `@deprecated` but keep it optional so existing `selections.json` files don't break:
```typescript
/** @deprecated — domain connections are now stored in project-level SQLite DB */
domainConnections?: DomainConnection[];
```

- [ ] **Step 2: Add one-time migration in admin-server startup**

After loading wizardState, check if `domainConnections` has entries and DB is empty → call `migrateFromJson()`:

```typescript
// In createAdminServer(), after wizardState is loaded:
import { migrateFromJson, listApps as dbListApps, listDomainConnections } from './project-db.js';

if (wizardState) {
  // One-time migration from JSON → DB
  const existingApps = dbListApps(projectPath);
  if (existingApps.length === 0) {
    // Check for legacy JSON files
    const legacyAppsPath = join(homedir(), '.brewnet', 'apps.json');
    const legacyHistoryPath = join(homedir(), '.brewnet', 'deploy-history.json');
    const legacyGiteaPath = join(homedir(), '.brewnet', 'gitea-config.json');
    const legacyApps = existsSync(legacyAppsPath) ? JSON.parse(readFileSync(legacyAppsPath, 'utf-8')) : [];
    const legacyHistory = existsSync(legacyHistoryPath) ? JSON.parse(readFileSync(legacyHistoryPath, 'utf-8')) : [];
    const legacyGitea = existsSync(legacyGiteaPath) ? JSON.parse(readFileSync(legacyGiteaPath, 'utf-8')) : null;

    if (legacyApps.length || wizardState.domainConnections?.length || legacyHistory.length) {
      const result = migrateFromJson(projectPath, {
        apps: legacyApps,
        domainConnections: wizardState.domainConnections,
        deployHistory: legacyHistory,
        giteaConfig: legacyGitea,
      });
      logger.info('admin-server', `One-time JSON → DB migration: ${result.migrated.join(', ')}`);
    }
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `pnpm run build` (or `cd packages/cli && npx tsc --noEmit`)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/wizard-state.ts packages/cli/src/services/admin-server.ts
git commit -m "refactor: deprecate domainConnections in WizardState, add JSON→DB migration"
```

---

### Task 7: Delete app-registry.ts and update all remaining references

**Files:**
- Delete: `packages/cli/src/services/app-registry.ts`
- Delete: `tests/unit/cli/services/app-registry.test.ts`
- Delete: `tests/unit/cli/services/app-registry-extra.test.ts`
- Modify: any remaining imports

- [ ] **Step 1: Search for all remaining app-registry imports**

Run: `grep -rn "app-registry" packages/ tests/ --include="*.ts"`

- [ ] **Step 2: Update or remove each reference**

- `domain-manager.ts` line 28: already updated in Task 4
- `app-manager.ts` line 8: already updated in Task 3
- `admin-server.ts` line 32: check if any direct import remains
- `commands/export.ts`: may import readApps — update to use project-db

- [ ] **Step 3: Delete the files**

```bash
rm packages/cli/src/services/app-registry.ts
rm tests/unit/cli/services/app-registry.test.ts
rm tests/unit/cli/services/app-registry-extra.test.ts
```

- [ ] **Step 4: Verify build**

Run: `pnpm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete app-registry.ts, all consumers migrated to project-db"
```

---

### Task 8: Update existing tests

**Files:**
- Modify: `tests/unit/cli/services/app-manager.test.ts`
- Modify: `tests/unit/cli/services/app-manager-extra.test.ts`
- Modify: `tests/unit/cli/services/domain-manager.test.ts`
- Modify: `tests/unit/cli/services/domain-manager-extra.test.ts`
- Modify: `tests/unit/cli/services/domain-manager-paths.test.ts`
- Modify: `tests/integration/admin-server.test.ts`

- [ ] **Step 1: Update app-manager tests**

Replace `jest.unstable_mockModule('...app-registry.js', ...)` with `jest.unstable_mockModule('...project-db.js', ...)`. Match the new function signatures (first arg is `projectPath` string, not `appsJsonPath`).

- [ ] **Step 2: Update domain-manager tests**

Mock `project-db.js` instead of `wizard/state.js`'s `saveState` for domain connection persistence. `DomainManager.connect()` now calls `upsertDomainConnection()` instead of `saveState()`.

- [ ] **Step 3: Update admin-server integration test**

Add mock for `project-db.js`:
```typescript
jest.unstable_mockModule('../../packages/cli/src/services/project-db.js', () => ({
  listApps: jest.fn(() => []),
  listDomainConnections: jest.fn(() => []),
  getDeployHistory: jest.fn(() => []),
  addApp: jest.fn(),
  updateApp: jest.fn(),
  removeApp: jest.fn(),
  upsertDomainConnection: jest.fn(),
  removeDomainConnection: jest.fn(),
  appendDeployHistory: jest.fn(),
  getSetting: jest.fn(() => null),
  setSetting: jest.fn(),
  migrateFromJson: jest.fn(() => ({ migrated: [] })),
  getDb: jest.fn(),
  closeDb: jest.fn(),
  _setDbForTest: jest.fn(),
}));
```

- [ ] **Step 4: Run all tests**

Run: `npx jest --verbose 2>&1 | tail -50`
Expected: All tests pass (or only pre-existing failures unrelated to this change)

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: update all test mocks for project-db migration"
```

---

### Task 9: Wire up DB initialization in wizard generate step

**Files:**
- Modify: `packages/cli/src/wizard/steps/generate.ts`

- [ ] **Step 1: Initialize DB and register boilerplate apps at wizard completion**

In `runGenerateStep()`, after Docker Compose is generated and services are started, initialize the project DB and register any boilerplate apps:

```typescript
import { getDb, addApp } from '../../services/project-db.js';

// After compose generation and service startup:
// Initialize project-level DB
getDb(state.projectPath);
logger.info('generate', `Project DB initialized at ${state.projectPath}/.brewnet.db`);

// Register boilerplate apps in DB (if any)
// (existing boilerplate registration logic, adapted to use addApp from project-db)
```

- [ ] **Step 2: Verify wizard flow still works**

Run: `node packages/cli/dist/index.js init --help`
Expected: No import errors

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/wizard/steps/generate.ts
git commit -m "feat: initialize project-level SQLite DB during wizard generate step"
```

---

### Task 10: Build, full test run, and verification

- [ ] **Step 1: Full build**

Run: `pnpm run build`
Expected: Clean build

- [ ] **Step 2: Full test suite**

Run: `npx jest --verbose 2>&1 | tail -80`
Expected: All tests pass

- [ ] **Step 3: Manual verification — create DB for existing project**

```bash
# Start admin server — should auto-migrate if legacy JSON files exist
node packages/cli/dist/index.js admin --foreground --no-open &
sleep 3
# Check apps endpoint
curl -s http://localhost:8088/api/apps | python3 -m json.tool
# Check DB file exists
ls -la ~/brewnet/brewnet-home/.brewnet.db
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: project-level SQLite migration complete — build and tests verified"
```
