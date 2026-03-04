/**
 * Unit tests for the .env generation logic in boilerplate-manager (T027).
 *
 * Verifies:
 *   - DB_DRIVER is set to the provided driver value
 *   - DB_PASSWORD, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD are 64-char hex secrets
 *   - Original file formatting (comments, blank lines) is preserved
 *   - Node.js stacks get PRISMA_DB_PROVIDER and DATABASE_URL
 *   - Non-Node.js stacks do NOT get Prisma vars modified
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateEnv, findFreePort } from '../../../../packages/cli/src/services/boilerplate-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary project directory with a .env.example file. */
function createTempProject(envExample: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'brewnet-test-'));
  writeFileSync(join(dir, '.env.example'), envExample, 'utf-8');
  return dir;
}

/** Standard .env.example template used across all stacks. */
const STANDARD_ENV_EXAMPLE = `# Project settings
PROJECT_NAME=brewnet
DOMAIN=localhost

# Database settings
DB_DRIVER=sqlite3
DB_HOST=postgres
DB_PORT=5432
DB_NAME=brewnet_db
DB_USER=brewnet
DB_PASSWORD=password

# MySQL settings
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=brewnet_db
MYSQL_USER=brewnet
MYSQL_PASSWORD=password
MYSQL_ROOT_PASSWORD=password

# App ports
BACKEND_PORT=8080
FRONTEND_PORT=3000
`;

/** Node.js .env.example with Prisma variables. */
const NODEJS_ENV_EXAMPLE = `${STANDARD_ENV_EXAMPLE}
# Prisma
PRISMA_DB_PROVIDER=postgresql
DATABASE_URL=postgresql://brewnet:password@postgres:5432/brewnet_db
`;

// ---------------------------------------------------------------------------
// SQLite3 (default) path
// ---------------------------------------------------------------------------

describe('generateEnv — sqlite3 (default)', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempProject(STANDARD_ENV_EXAMPLE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sets DB_DRIVER to sqlite3', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_DRIVER=sqlite3$/m);
  });

  it('replaces DB_PASSWORD with a 64-char hex string', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const match = env.match(/^DB_PASSWORD=([0-9a-f]+)$/m);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
    expect(match![1]).toMatch(/^[0-9a-f]+$/);
  });

  it('replaces MYSQL_PASSWORD with a 64-char hex string', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const match = env.match(/^MYSQL_PASSWORD=([0-9a-f]+)$/m);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
  });

  it('replaces MYSQL_ROOT_PASSWORD with a 64-char hex string', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const match = env.match(/^MYSQL_ROOT_PASSWORD=([0-9a-f]+)$/m);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
  });

  it('preserves comments and non-replaced variables', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toContain('# Project settings');
    expect(env).toContain('PROJECT_NAME=brewnet');
    expect(env).toContain('BACKEND_PORT=8080');
  });

  it('generates different secrets each call', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env1 = readFileSync(join(dir, '.env'), 'utf-8');

    const dir2 = createTempProject(STANDARD_ENV_EXAMPLE);
    try {
      generateEnv(dir2, 'go-gin', 'sqlite3');
      const env2 = readFileSync(join(dir2, '.env'), 'utf-8');

      const pass1 = env1.match(/^DB_PASSWORD=(.+)$/m)![1];
      const pass2 = env2.match(/^DB_PASSWORD=(.+)$/m)![1];
      expect(pass1).not.toBe(pass2);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('does not modify Prisma vars for non-Node.js stacks', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    // go-gin stack does not start with nodejs-; Prisma lines should not exist
    expect(env).not.toContain('PRISMA_DB_PROVIDER');
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL path
// ---------------------------------------------------------------------------

describe('generateEnv — postgres', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempProject(STANDARD_ENV_EXAMPLE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sets DB_DRIVER to postgres', () => {
    generateEnv(dir, 'go-gin', 'postgres');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_DRIVER=postgres$/m);
  });

  it('sets a 64-char hex DB_PASSWORD', () => {
    generateEnv(dir, 'go-gin', 'postgres');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const match = env.match(/^DB_PASSWORD=([0-9a-f]+)$/m);
    expect(match![1]).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// Node.js + Prisma variables
// ---------------------------------------------------------------------------

describe('generateEnv — nodejs stacks (Prisma)', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempProject(NODEJS_ENV_EXAMPLE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sets PRISMA_DB_PROVIDER=postgresql for postgres driver', () => {
    generateEnv(dir, 'nodejs-express', 'postgres');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^PRISMA_DB_PROVIDER=postgresql$/m);
  });

  it('sets DATABASE_URL with postgres scheme for postgres driver', () => {
    generateEnv(dir, 'nodejs-express', 'postgres');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/brewnet:.+@postgres:5432\/brewnet_db$/m);
  });

  it('sets PRISMA_DB_PROVIDER=mysql for mysql driver', () => {
    generateEnv(dir, 'nodejs-nestjs', 'mysql');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^PRISMA_DB_PROVIDER=mysql$/m);
  });

  it('sets DATABASE_URL with mysql scheme for mysql driver', () => {
    generateEnv(dir, 'nodejs-nestjs', 'mysql');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DATABASE_URL=mysql:\/\/brewnet:.+@mysql:3306\/brewnet_db$/m);
  });

  it('sets PRISMA_DB_PROVIDER=sqlite and file DATABASE_URL for sqlite3', () => {
    generateEnv(dir, 'nodejs-nextjs', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^PRISMA_DB_PROVIDER=sqlite$/m);
    expect(env).toMatch(/^DATABASE_URL=file:\/app\/data\/brewnet_db\.db$/m);
  });

  it('embeds the generated DB_PASSWORD in the postgres DATABASE_URL', () => {
    generateEnv(dir, 'nodejs-express', 'postgres');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const dbPassword = env.match(/^DB_PASSWORD=([0-9a-f]+)$/m)![1];
    expect(env).toContain(`postgresql://brewnet:${dbPassword}@postgres:5432/brewnet_db`);
  });
});

// ---------------------------------------------------------------------------
// Custom DB credentials (opts parameter)
// ---------------------------------------------------------------------------

describe('generateEnv — custom DB credentials (opts)', () => {
  let dir: string;
  let nodejsDir: string;

  beforeEach(() => {
    dir = createTempProject(STANDARD_ENV_EXAMPLE);
    nodejsDir = createTempProject(NODEJS_ENV_EXAMPLE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(nodejsDir, { recursive: true, force: true });
  });

  it('uses provided dbPassword instead of generating a random one', () => {
    generateEnv(dir, 'go-gin', 'postgres', { dbPassword: 'my-admin-secret-password' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_PASSWORD=my-admin-secret-password$/m);
  });

  it('overrides DB_USER with provided dbUser', () => {
    generateEnv(dir, 'go-gin', 'postgres', { dbUser: 'homeserver_user' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_USER=homeserver_user$/m);
  });

  it('overrides MYSQL_USER with provided dbUser', () => {
    generateEnv(dir, 'go-gin', 'mysql', { dbUser: 'myuser' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^MYSQL_USER=myuser$/m);
  });

  it('overrides DB_NAME with provided dbName', () => {
    generateEnv(dir, 'go-gin', 'postgres', { dbName: 'my_project_db' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_NAME=my_project_db$/m);
  });

  it('overrides MYSQL_DATABASE with provided dbName', () => {
    generateEnv(dir, 'go-gin', 'mysql', { dbName: 'my_db' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^MYSQL_DATABASE=my_db$/m);
  });

  it('embeds custom dbUser and dbName in postgres DATABASE_URL for nodejs stacks', () => {
    generateEnv(nodejsDir, 'nodejs-express', 'postgres', {
      dbUser: 'wizard_user',
      dbPassword: 'wizard_pass',
      dbName: 'wizard_db',
    });
    const env = readFileSync(join(nodejsDir, '.env'), 'utf-8');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/wizard_user:wizard_pass@postgres:5432\/wizard_db$/m);
  });

  it('embeds custom dbUser and dbName in mysql DATABASE_URL for nodejs stacks', () => {
    generateEnv(nodejsDir, 'nodejs-nestjs', 'mysql', {
      dbUser: 'mu',
      dbPassword: 'mp',
      dbName: 'mdb',
    });
    const env = readFileSync(join(nodejsDir, '.env'), 'utf-8');
    expect(env).toMatch(/^DATABASE_URL=mysql:\/\/mu:mp@mysql:3306\/mdb$/m);
  });

  it('falls back to "brewnet" default user when opts.dbUser not provided', () => {
    generateEnv(dir, 'go-gin', 'postgres', { dbPassword: 'some-pass' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_USER=brewnet$/m);
  });

  it('falls back to "brewnet_db" default name when opts.dbName not provided', () => {
    generateEnv(dir, 'go-gin', 'postgres', { dbPassword: 'some-pass' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_NAME=brewnet_db$/m);
  });

  it('generates random DB_PASSWORD when opts.dbPassword not provided', () => {
    generateEnv(dir, 'go-gin', 'sqlite3', { dbUser: 'myuser' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    const match = env.match(/^DB_PASSWORD=([0-9a-f]+)$/m);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
  });

  it('MYSQL_PASSWORD is always randomly generated (even when dbPassword provided)', () => {
    generateEnv(dir, 'go-gin', 'mysql', { dbPassword: 'admin_pass' });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    // DB_PASSWORD uses provided value
    expect(env).toMatch(/^DB_PASSWORD=admin_pass$/m);
    // MYSQL_PASSWORD is still random (64-char hex)
    const match = env.match(/^MYSQL_PASSWORD=([0-9a-f]+)$/m);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// hostPort override (auto port selection)
// ---------------------------------------------------------------------------

describe('generateEnv — hostPort override', () => {
  let dir: string;

  beforeEach(() => { dir = createTempProject(STANDARD_ENV_EXAMPLE); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('sets BACKEND_PORT when hostPort is provided', () => {
    generateEnv(dir, 'go-gin', 'sqlite3', { hostPort: 8081 });
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^BACKEND_PORT=8081$/m);
  });

  it('keeps default BACKEND_PORT when hostPort is not provided', () => {
    generateEnv(dir, 'go-gin', 'sqlite3');
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^BACKEND_PORT=8080$/m);
  });

  it('appends BACKEND_PORT when key is absent from .env.example', () => {
    const noPortExample = STANDARD_ENV_EXAMPLE.replace(/^BACKEND_PORT=.*\n/m, '');
    const dir2 = createTempProject(noPortExample);
    generateEnv(dir2, 'go-gin', 'sqlite3', { hostPort: 9090 });
    const env = readFileSync(join(dir2, '.env'), 'utf-8');
    expect(env).toMatch(/BACKEND_PORT=9090/);
    rmSync(dir2, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// findFreePort
// ---------------------------------------------------------------------------

describe('findFreePort', () => {
  it('returns the requested port when it is free', async () => {
    // Port 0 asks the OS for any free port; we cannot guarantee 8080 is free in CI.
    // Instead verify that the returned port is a valid number in range.
    const port = await findFreePort(19000);
    expect(port).toBeGreaterThanOrEqual(19000);
    expect(port).toBeLessThan(19020);
  });

  it('skips an occupied port and returns the next free one', async () => {
    const { createServer } = await import('node:net');
    // Occupy port 19100
    const blocker = createServer();
    // Bind to 0.0.0.0 to simulate the real Docker conflict scenario:
    // Docker proxy binds 0.0.0.0:PORT, so findFreePort must also check 0.0.0.0.
    await new Promise<void>((resolve) => blocker.listen(19100, '0.0.0.0', resolve));
    try {
      const port = await findFreePort(19100);
      expect(port).toBe(19101);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
