/**
 * Unit tests for project-db.ts — Project-level SQLite DAO layer.
 *
 * Uses a real in-memory SQLite DB (`:memory:`) instead of mocks.
 * The database IS the unit under test for this DAO module.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import type { AppEntry, DeployHistoryEntry } from '../../../../packages/cli/src/types/app-entry.js';
import type { DomainConnection } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// In-memory DB factory — mirrors db-manager.ts schema exactly
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`CREATE TABLE IF NOT EXISTS apps (
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
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS domain_connections (
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
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    status TEXT NOT NULL,
    deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (app_name) REFERENCES apps(name) ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_deploy_history_app_name ON deploy_history(app_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deploy_history_deployed_at ON deploy_history(deployed_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_domain_connections_hostname ON domain_connections(hostname)`);

  return db;
}

// ---------------------------------------------------------------------------
// Mock db-manager so we can inject the in-memory DB
// ---------------------------------------------------------------------------

let testDb: Database.Database;

jest.unstable_mockModule('../../../../packages/cli/src/services/db-manager.js', () => ({
  initDatabase: jest.fn(() => testDb),
  getDbPath: jest.fn((p: string) => `${p}/.brewnet.db`),
}));

const projectDb = await import('../../../../packages/cli/src/services/project-db.js');

const PROJECT = '/tmp/test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleApp(name = 'my-app'): AppEntry {
  return {
    name,
    mode: 'boilerplate' as const,
    stackId: 'nodejs-nextjs-full',
    appDir: `/home/user/apps/${name}`,
    port: 3000,
    status: 'running' as const,
    createdAt: '2026-03-27T00:00:00.000Z',
  };
}

function sampleConnection(appName = 'my-app'): DomainConnection {
  return {
    appName,
    subdomain: 'app',
    domain: 'example.com',
    hostname: 'app.example.com',
    tunnelId: 'tun-1',
    cnameRecordId: 'rec-1',
    containerPort: 3000,
    connectedAt: '2026-03-27T00:00:00.000Z',
    scenario: 'A' as DomainConnection['scenario'],
  };
}

function sampleDeployEntry(appName = 'my-app', hash = 'abc123'): DeployHistoryEntry {
  return {
    appName,
    commitHash: hash,
    commitMessage: 'feat: initial deploy',
    status: 'success' as const,
    deployedAt: '2026-03-27T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  testDb = createTestDb();
  projectDb._setDbForTest(testDb);
});

afterEach(() => {
  projectDb.closeDb();
});

// ===========================================================================
// 1. Apps CRUD
// ===========================================================================

describe('Apps CRUD', () => {
  it('listApps returns empty array initially', () => {
    expect(projectDb.listApps(PROJECT)).toEqual([]);
  });

  it('addApp + listApps round-trip', () => {
    const app = sampleApp();
    projectDb.addApp(PROJECT, app);
    const apps = projectDb.listApps(PROJECT);

    expect(apps).toHaveLength(1);
    expect(apps[0].name).toBe('my-app');
    expect(apps[0].mode).toBe('boilerplate');
    expect(apps[0].stackId).toBe('nodejs-nextjs-full');
    expect(apps[0].appDir).toBe('/home/user/apps/my-app');
    expect(apps[0].port).toBe(3000);
    expect(apps[0].status).toBe('running');
    expect(apps[0].createdAt).toBe('2026-03-27T00:00:00.000Z');
  });

  it('addApp throws on duplicate name (UNIQUE constraint)', () => {
    projectDb.addApp(PROJECT, sampleApp());
    expect(() => projectDb.addApp(PROJECT, sampleApp())).toThrow();
  });

  it('getApp returns null for missing app', () => {
    expect(projectDb.getApp(PROJECT, 'nonexistent')).toBeNull();
  });

  it('getApp returns match for existing app', () => {
    projectDb.addApp(PROJECT, sampleApp('web-app'));
    const app = projectDb.getApp(PROJECT, 'web-app');
    expect(app).not.toBeNull();
    expect(app!.name).toBe('web-app');
  });

  it('updateApp patches specific fields, leaves others unchanged', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.updateApp(PROJECT, 'my-app', { status: 'stopped', port: 4000 });

    const app = projectDb.getApp(PROJECT, 'my-app')!;
    expect(app.status).toBe('stopped');
    expect(app.port).toBe(4000);
    // Unchanged fields
    expect(app.mode).toBe('boilerplate');
    expect(app.appDir).toBe('/home/user/apps/my-app');
    expect(app.stackId).toBe('nodejs-nextjs-full');
  });

  it('updateApp on missing app is a no-op (does not throw)', () => {
    expect(() => {
      projectDb.updateApp(PROJECT, 'nonexistent', { status: 'failed' });
    }).not.toThrow();
    // Still no apps
    expect(projectDb.listApps(PROJECT)).toHaveLength(0);
  });

  it('updateApp with empty patch is a no-op', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.updateApp(PROJECT, 'my-app', {});
    const app = projectDb.getApp(PROJECT, 'my-app')!;
    expect(app.status).toBe('running');
  });

  it('removeApp deletes the app', () => {
    projectDb.addApp(PROJECT, sampleApp());
    expect(projectDb.listApps(PROJECT)).toHaveLength(1);

    projectDb.removeApp(PROJECT, 'my-app');
    expect(projectDb.listApps(PROJECT)).toHaveLength(0);
    expect(projectDb.getApp(PROJECT, 'my-app')).toBeNull();
  });

  it('removeApp on missing app is a no-op', () => {
    expect(() => projectDb.removeApp(PROJECT, 'nonexistent')).not.toThrow();
  });

  it('addApp preserves optional fields when set', () => {
    const app: AppEntry = {
      ...sampleApp(),
      sourceUrl: 'https://github.com/user/repo.git',
      lang: 'typescript',
      framework: 'nextjs',
      giteaRepoUrl: 'http://localhost:3000/admin/my-app',
    };
    projectDb.addApp(PROJECT, app);

    const fetched = projectDb.getApp(PROJECT, 'my-app')!;
    expect(fetched.sourceUrl).toBe('https://github.com/user/repo.git');
    expect(fetched.lang).toBe('typescript');
    expect(fetched.framework).toBe('nextjs');
    expect(fetched.giteaRepoUrl).toBe('http://localhost:3000/admin/my-app');
  });

  it('addApp omits optional fields from result when not set', () => {
    const app: AppEntry = {
      name: 'minimal-app',
      mode: 'new-project',
      appDir: '/home/user/apps/minimal',
      port: 5000,
      status: 'creating',
      createdAt: '2026-03-27T00:00:00.000Z',
    };
    projectDb.addApp(PROJECT, app);

    const fetched = projectDb.getApp(PROJECT, 'minimal-app')!;
    expect(fetched.stackId).toBeUndefined();
    expect(fetched.sourceUrl).toBeUndefined();
    expect(fetched.lang).toBeUndefined();
    expect(fetched.framework).toBeUndefined();
    expect(fetched.giteaRepoUrl).toBeUndefined();
  });

  it('listApps orders by created_at DESC', () => {
    projectDb.addApp(PROJECT, { ...sampleApp('app-old'), createdAt: '2026-01-01T00:00:00.000Z' });
    projectDb.addApp(PROJECT, { ...sampleApp('app-new'), createdAt: '2026-06-01T00:00:00.000Z' });
    projectDb.addApp(PROJECT, { ...sampleApp('app-mid'), createdAt: '2026-03-01T00:00:00.000Z' });

    const apps = projectDb.listApps(PROJECT);
    expect(apps.map(a => a.name)).toEqual(['app-new', 'app-mid', 'app-old']);
  });
});

// ===========================================================================
// 2. Domain Connections CRUD
// ===========================================================================

describe('Domain Connections CRUD', () => {
  it('listDomainConnections returns empty initially', () => {
    expect(projectDb.listDomainConnections(PROJECT)).toEqual([]);
  });

  it('upsert + list round-trip (app must exist first due to FK)', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());

    const conns = projectDb.listDomainConnections(PROJECT);
    expect(conns).toHaveLength(1);
    expect(conns[0].appName).toBe('my-app');
    expect(conns[0].subdomain).toBe('app');
    expect(conns[0].domain).toBe('example.com');
    expect(conns[0].hostname).toBe('app.example.com');
    expect(conns[0].tunnelId).toBe('tun-1');
    expect(conns[0].cnameRecordId).toBe('rec-1');
    expect(conns[0].containerPort).toBe(3000);
    expect(conns[0].scenario).toBe('A');
  });

  it('upsert without parent app throws FK constraint error', () => {
    expect(() => {
      projectDb.upsertDomainConnection(PROJECT, sampleConnection('no-such-app'));
    }).toThrow();
  });

  it('upsert overwrites existing connection for same appName', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());

    const updated: DomainConnection = {
      ...sampleConnection(),
      subdomain: 'api',
      hostname: 'api.example.com',
      containerPort: 4000,
    };
    projectDb.upsertDomainConnection(PROJECT, updated);

    const conns = projectDb.listDomainConnections(PROJECT);
    expect(conns).toHaveLength(1);
    expect(conns[0].subdomain).toBe('api');
    expect(conns[0].hostname).toBe('api.example.com');
    expect(conns[0].containerPort).toBe(4000);
  });

  it('getDomainConnection returns null for missing appName', () => {
    expect(projectDb.getDomainConnection(PROJECT, 'nonexistent')).toBeNull();
  });

  it('getDomainConnection returns match for existing', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());

    const conn = projectDb.getDomainConnection(PROJECT, 'my-app');
    expect(conn).not.toBeNull();
    expect(conn!.hostname).toBe('app.example.com');
  });

  it('removeDomainConnection deletes by appName', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(1);

    projectDb.removeDomainConnection(PROJECT, 'my-app');
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(0);
  });

  it('removeDomainConnection on missing appName is a no-op', () => {
    expect(() => projectDb.removeDomainConnection(PROJECT, 'nonexistent')).not.toThrow();
  });

  it('FK CASCADE: removing app deletes its domain connection', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(1);

    projectDb.removeApp(PROJECT, 'my-app');
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(0);
  });

  it('preserves optional wwwCnameRecordId and basePath', () => {
    projectDb.addApp(PROJECT, sampleApp());
    const conn: DomainConnection = {
      ...sampleConnection(),
      subdomain: '@',
      hostname: 'example.com',
      wwwCnameRecordId: 'www-rec-1',
      basePath: '/apps/my-app',
    };
    projectDb.upsertDomainConnection(PROJECT, conn);

    const fetched = projectDb.getDomainConnection(PROJECT, 'my-app')!;
    expect(fetched.wwwCnameRecordId).toBe('www-rec-1');
    expect(fetched.basePath).toBe('/apps/my-app');
  });

  it('omits wwwCnameRecordId and basePath when not set', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.upsertDomainConnection(PROJECT, sampleConnection());

    const fetched = projectDb.getDomainConnection(PROJECT, 'my-app')!;
    expect(fetched.wwwCnameRecordId).toBeUndefined();
    expect(fetched.basePath).toBeUndefined();
  });
});

// ===========================================================================
// 3. Deploy History
// ===========================================================================

describe('Deploy History', () => {
  it('getDeployHistory returns empty initially', () => {
    expect(projectDb.getDeployHistory(PROJECT)).toEqual([]);
  });

  it('append + get round-trip', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry());

    const history = projectDb.getDeployHistory(PROJECT);
    expect(history).toHaveLength(1);
    expect(history[0].appName).toBe('my-app');
    expect(history[0].commitHash).toBe('abc123');
    expect(history[0].commitMessage).toBe('feat: initial deploy');
    expect(history[0].status).toBe('success');
    expect(history[0].deployedAt).toBe('2026-03-27T00:00:00.000Z');
  });

  it('getDeployHistory with appName filter', () => {
    projectDb.addApp(PROJECT, sampleApp('app-a'));
    projectDb.addApp(PROJECT, sampleApp('app-b'));
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('app-a', 'hash1'));
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('app-b', 'hash2'));
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('app-a', 'hash3'));

    const historyA = projectDb.getDeployHistory(PROJECT, 'app-a');
    expect(historyA).toHaveLength(2);
    expect(historyA.every(h => h.appName === 'app-a')).toBe(true);

    const historyB = projectDb.getDeployHistory(PROJECT, 'app-b');
    expect(historyB).toHaveLength(1);
    expect(historyB[0].commitHash).toBe('hash2');
  });

  it('getDeployHistory without filter returns all entries', () => {
    projectDb.addApp(PROJECT, sampleApp('app-a'));
    projectDb.addApp(PROJECT, sampleApp('app-b'));
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('app-a', 'hash1'));
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('app-b', 'hash2'));

    const all = projectDb.getDeployHistory(PROJECT);
    expect(all).toHaveLength(2);
  });

  it('getDeployHistory orders by deployed_at DESC', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.appendDeployHistory(PROJECT, {
      ...sampleDeployEntry('my-app', 'old'),
      deployedAt: '2026-01-01T00:00:00.000Z',
    });
    projectDb.appendDeployHistory(PROJECT, {
      ...sampleDeployEntry('my-app', 'new'),
      deployedAt: '2026-06-01T00:00:00.000Z',
    });

    const history = projectDb.getDeployHistory(PROJECT);
    expect(history[0].commitHash).toBe('new');
    expect(history[1].commitHash).toBe('old');
  });

  it('FK CASCADE: removing app deletes its deploy history', () => {
    projectDb.addApp(PROJECT, sampleApp());
    projectDb.appendDeployHistory(PROJECT, sampleDeployEntry());
    expect(projectDb.getDeployHistory(PROJECT)).toHaveLength(1);

    projectDb.removeApp(PROJECT, 'my-app');
    expect(projectDb.getDeployHistory(PROJECT)).toHaveLength(0);
  });

  it('appendDeployHistory without parent app throws FK constraint error', () => {
    expect(() => {
      projectDb.appendDeployHistory(PROJECT, sampleDeployEntry('no-such-app'));
    }).toThrow();
  });
});

// ===========================================================================
// 4. Settings KV
// ===========================================================================

describe('Settings KV', () => {
  it('getSetting returns null for missing key', () => {
    expect(projectDb.getSetting(PROJECT, 'theme')).toBeNull();
  });

  it('setSetting + getSetting round-trip', () => {
    projectDb.setSetting(PROJECT, 'theme', 'dark');
    expect(projectDb.getSetting(PROJECT, 'theme')).toBe('dark');
  });

  it('setSetting overwrites existing value', () => {
    projectDb.setSetting(PROJECT, 'theme', 'dark');
    projectDb.setSetting(PROJECT, 'theme', 'light');
    expect(projectDb.getSetting(PROJECT, 'theme')).toBe('light');
  });

  it('multiple keys are independent', () => {
    projectDb.setSetting(PROJECT, 'key1', 'val1');
    projectDb.setSetting(PROJECT, 'key2', 'val2');
    expect(projectDb.getSetting(PROJECT, 'key1')).toBe('val1');
    expect(projectDb.getSetting(PROJECT, 'key2')).toBe('val2');
  });
});

// ===========================================================================
// 5. migrateFromJson
// ===========================================================================

describe('migrateFromJson', () => {
  it('migrates apps, connections, and deploy history in one transaction', () => {
    const app = sampleApp();
    const conn = sampleConnection();
    const deploy = sampleDeployEntry();

    const result = projectDb.migrateFromJson(PROJECT, {
      apps: [app],
      domainConnections: [conn],
      deployHistory: [deploy],
    });

    expect(result.migrated).toContain('app:my-app');
    expect(result.migrated).toContain('domain:my-app');
    expect(result.migrated).toContain('deploy:my-app:abc123');

    expect(projectDb.listApps(PROJECT)).toHaveLength(1);
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(1);
    expect(projectDb.getDeployHistory(PROJECT)).toHaveLength(1);
  });

  it('idempotent: re-migration skips existing apps (INSERT OR IGNORE)', () => {
    const app = sampleApp();
    projectDb.migrateFromJson(PROJECT, { apps: [app] });

    // Second migration — same app should be ignored
    const result = projectDb.migrateFromJson(PROJECT, { apps: [app] });
    expect(result.migrated).not.toContain('app:my-app');

    // Still only one app
    expect(projectDb.listApps(PROJECT)).toHaveLength(1);
  });

  it('idempotent: re-migration skips existing domain connections', () => {
    const app = sampleApp();
    const conn = sampleConnection();
    projectDb.migrateFromJson(PROJECT, { apps: [app], domainConnections: [conn] });

    const result = projectDb.migrateFromJson(PROJECT, { apps: [app], domainConnections: [conn] });
    expect(result.migrated).not.toContain('domain:my-app');

    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(1);
  });

  it('deploy history is always appended (not idempotent)', () => {
    const app = sampleApp();
    const deploy = sampleDeployEntry();
    projectDb.migrateFromJson(PROJECT, { apps: [app], deployHistory: [deploy] });
    projectDb.migrateFromJson(PROJECT, { apps: [app], deployHistory: [deploy] });

    // deploy_history uses INSERT (not INSERT OR IGNORE), so duplicates are added
    expect(projectDb.getDeployHistory(PROJECT)).toHaveLength(2);
  });

  it('handles empty data arrays gracefully', () => {
    const result = projectDb.migrateFromJson(PROJECT, {
      apps: [],
      domainConnections: [],
      deployHistory: [],
    });
    expect(result.migrated).toEqual([]);
  });

  it('handles undefined data arrays gracefully', () => {
    const result = projectDb.migrateFromJson(PROJECT, {});
    expect(result.migrated).toEqual([]);
  });

  it('handles null-ish data gracefully', () => {
    const result = projectDb.migrateFromJson(PROJECT, {
      apps: undefined,
      domainConnections: undefined,
      deployHistory: undefined,
    });
    expect(result.migrated).toEqual([]);
  });

  it('migrates multiple apps and their connections', () => {
    const app1 = sampleApp('app-1');
    const app2 = sampleApp('app-2');
    const conn1 = sampleConnection('app-1');
    const conn2 = sampleConnection('app-2');

    const result = projectDb.migrateFromJson(PROJECT, {
      apps: [app1, app2],
      domainConnections: [conn1, conn2],
    });

    expect(result.migrated).toContain('app:app-1');
    expect(result.migrated).toContain('app:app-2');
    expect(result.migrated).toContain('domain:app-1');
    expect(result.migrated).toContain('domain:app-2');
    expect(projectDb.listApps(PROJECT)).toHaveLength(2);
    expect(projectDb.listDomainConnections(PROJECT)).toHaveLength(2);
  });
});

// ===========================================================================
// 6. DB lifecycle (getDb, closeDb, _setDbForTest)
// ===========================================================================

describe('DB lifecycle', () => {
  it('closeDb is safe to call multiple times', () => {
    projectDb.closeDb();
    expect(() => projectDb.closeDb()).not.toThrow();
  });

  it('_setDbForTest replaces the current database', () => {
    // Add an app to current db
    projectDb.addApp(PROJECT, sampleApp());
    expect(projectDb.listApps(PROJECT)).toHaveLength(1);

    // Replace with a fresh db
    const freshDb = createTestDb();
    projectDb._setDbForTest(freshDb);
    expect(projectDb.listApps(PROJECT)).toHaveLength(0);

    // Clean up
    projectDb.closeDb();
  });
});
