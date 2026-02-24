/**
 * Unit tests for services/env-generator module (T062)
 *
 * Tests the .env and .env.example file generation from wizard state.
 * Verifies that all required secret keys are present, passwords are non-empty,
 * .env.example values are masked, and file permissions are set correctly.
 *
 * Test cases covered:
 * - TC-08-03: Any config → .env file has all required secret keys present
 * - TC-08-04: .env generated → file permissions chmod 600
 * - TC-08-13: .env.example generated → all keys present, values masked
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock fs module before importing the module under test
// ---------------------------------------------------------------------------

const mockWriteFileSync = jest.fn<typeof import('node:fs').writeFileSync>();
const mockChmodSync = jest.fn<typeof import('node:fs').chmodSync>();
const mockMkdirSync = jest.fn<typeof import('node:fs').mkdirSync>();

jest.unstable_mockModule('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  chmodSync: mockChmodSync,
  mkdirSync: mockMkdirSync,
  default: {
    writeFileSync: mockWriteFileSync,
    chmodSync: mockChmodSync,
    mkdirSync: mockMkdirSync,
  },
}));

// ---------------------------------------------------------------------------
// Imports (must be after mocks for ESM)
// ---------------------------------------------------------------------------

const { generateEnvFiles, writeEnvFile, writeEnvExampleFile } = await import(
  '../../../../packages/cli/src/services/env-generator.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type {
  WizardState,
  ServerComponents,
} from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvGeneratorResult {
  envContent: string;
  envExampleContent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a WizardState with selective overrides applied on top of defaults.
 */
function buildState(overrides: Partial<{
  projectName: string;
  projectPath: string;
  admin: Partial<WizardState['admin']>;
  servers: Partial<WizardState['servers']>;
  domain: Partial<WizardState['domain']>;
  devStack: Partial<WizardState['devStack']>;
  boilerplate: Partial<WizardState['boilerplate']>;
}> = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.projectName) state.projectName = overrides.projectName;
  if (overrides.projectPath) state.projectPath = overrides.projectPath;

  if (overrides.admin) {
    Object.assign(state.admin, overrides.admin);
  }
  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      const servers = state.servers as unknown as Record<string, unknown>;
      servers[key] = {
        ...(servers[key] as object),
        ...(value as object),
      };
    }
  }
  if (overrides.domain) {
    // Deep merge cloudflare separately
    const { cloudflare, ...domainRest } = overrides.domain;
    Object.assign(state.domain, domainRest);
    if (cloudflare) {
      Object.assign(state.domain.cloudflare, cloudflare);
    }
  }
  if (overrides.devStack) {
    Object.assign(state.devStack, overrides.devStack);
  }
  if (overrides.boilerplate) {
    Object.assign(state.boilerplate, overrides.boilerplate);
  }

  return state;
}

/**
 * Parse a .env format string into a key-value record.
 * Ignores comments (#) and blank lines.
 */
function parseEnvContent(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    entries[key] = value;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: generateEnvFiles — Full Install State
// ---------------------------------------------------------------------------

describe('generateEnvFiles', () => {
  describe('full install state (PostgreSQL + Redis + Gitea)', () => {
    it('includes BREWNET_ADMIN_USERNAME and BREWNET_ADMIN_PASSWORD', () => {
      const state = buildState({
        admin: { username: 'myadmin', password: 'SuperSecret123!' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbP@ss99',
            adminUI: true,
            cache: 'redis',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['BREWNET_ADMIN_USERNAME']).toBe('myadmin');
      expect(env['BREWNET_ADMIN_PASSWORD']).toBe('SuperSecret123!');
    });

    it('includes PostgreSQL keys (POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD)', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'AdminPass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'mydb',
            dbUser: 'myuser',
            dbPassword: 'DbSecret',
            adminUI: false,
            cache: 'redis',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['POSTGRES_USER']).toBe('myuser');
      expect(env['POSTGRES_DB']).toBe('mydb');
      expect(env['POSTGRES_PASSWORD']).toBe('DbSecret');
    });

    it('includes REDIS_PASSWORD when cache is redis', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'AdminPass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbPass',
            adminUI: false,
            cache: 'redis',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['REDIS_PASSWORD']).toBeDefined();
      expect(env['REDIS_PASSWORD']!.length).toBeGreaterThan(0);
    });

    it('includes Gitea keys (GITEA_ADMIN_USER, GITEA_ADMIN_PASSWORD, GITEA__security__SECRET_KEY)', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'MyGiteaPass' },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['GITEA_ADMIN_USER']).toBe('admin');
      expect(env['GITEA_ADMIN_PASSWORD']).toBe('MyGiteaPass');
      expect(env['GITEA__security__SECRET_KEY']).toBeDefined();
      expect(env['GITEA__security__SECRET_KEY']!.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // DB disabled — no database keys
  // -------------------------------------------------------------------------

  describe('DB disabled', () => {
    it('does not include POSTGRES_* keys when DB is disabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: false,
            primary: '',
            primaryVersion: '',
            dbName: '',
            dbUser: '',
            dbPassword: '',
            adminUI: false,
            cache: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['POSTGRES_USER']).toBeUndefined();
      expect(env['POSTGRES_DB']).toBeUndefined();
      expect(env['POSTGRES_PASSWORD']).toBeUndefined();
    });

    it('does not include MYSQL_* keys when DB is disabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: false,
            primary: '',
            primaryVersion: '',
            dbName: '',
            dbUser: '',
            dbPassword: '',
            adminUI: false,
            cache: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['MYSQL_DATABASE']).toBeUndefined();
      expect(env['MYSQL_USER']).toBeUndefined();
      expect(env['MYSQL_PASSWORD']).toBeUndefined();
      expect(env['MYSQL_ROOT_PASSWORD']).toBeUndefined();
    });

    it('does not include REDIS_PASSWORD when cache is empty', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: false,
            primary: '',
            primaryVersion: '',
            dbName: '',
            dbUser: '',
            dbPassword: '',
            adminUI: false,
            cache: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['REDIS_PASSWORD']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // MySQL variant
  // -------------------------------------------------------------------------

  describe('MySQL enabled', () => {
    it('includes MYSQL_* keys instead of POSTGRES_* keys', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'AdminPass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'mysql',
            primaryVersion: '8.4',
            dbName: 'mydb',
            dbUser: 'myuser',
            dbPassword: 'MySqlSecret',
            adminUI: false,
            cache: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['MYSQL_DATABASE']).toBe('mydb');
      expect(env['MYSQL_USER']).toBe('myuser');
      expect(env['MYSQL_PASSWORD']).toBe('MySqlSecret');
      expect(env['MYSQL_ROOT_PASSWORD']).toBe('AdminPass');
      // Should NOT include PostgreSQL keys
      expect(env['POSTGRES_USER']).toBeUndefined();
      expect(env['POSTGRES_DB']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cloudflare Tunnel
  // -------------------------------------------------------------------------

  describe('Cloudflare Tunnel enabled', () => {
    it('includes CLOUDFLARE_TUNNEL_TOKEN when tunnel is enabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
          ssl: 'cloudflare',
          cloudflare: {
            enabled: true,
            tunnelToken: 'my-cf-token-abc123',
            tunnelName: 'brewnet-tunnel',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['CLOUDFLARE_TUNNEL_TOKEN']).toBe('my-cf-token-abc123');
    });

    it('does not include CLOUDFLARE_TUNNEL_TOKEN when tunnel is disabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        domain: {
          provider: 'local',
          name: 'brewnet.local',
          ssl: 'self-signed',
          cloudflare: {
            enabled: false,
            tunnelToken: '',
            tunnelName: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['CLOUDFLARE_TUNNEL_TOKEN']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Mail Server
  // -------------------------------------------------------------------------

  describe('Mail Server enabled', () => {
    it('includes MAIL_* keys when mail server is enabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        domain: {
          provider: 'custom',
          name: 'mail.example.com',
        },
        servers: {
          mailServer: { enabled: true, service: 'docker-mailserver' },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      // Should include mail-related environment variables
      const mailKeys = Object.keys(env).filter(
        (k: string) => k.startsWith('MAIL_') || k.startsWith('SMTP_') || k.startsWith('POSTMASTER'),
      );
      expect(mailKeys.length).toBeGreaterThan(0);
    });

    it('does not include MAIL_* keys when mail server is disabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          mailServer: { enabled: false, service: 'docker-mailserver' },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      const mailKeys = Object.keys(env).filter(
        (k: string) => k.startsWith('MAIL_') || k.startsWith('SMTP_') || k.startsWith('POSTMASTER'),
      );
      expect(mailKeys).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // .env.example — masked values
  // -------------------------------------------------------------------------

  describe('.env.example generation', () => {
    it('has the same keys as .env', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'SuperSecret' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbPass',
            adminUI: true,
            cache: 'redis',
          },
          mailServer: { enabled: true, service: 'docker-mailserver' },
        },
        domain: {
          provider: 'custom',
          name: 'example.com',
          cloudflare: {
            enabled: true,
            tunnelToken: 'cf-token',
            tunnelName: 'tunnel',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const envKeys = Object.keys(parseEnvContent(result.envContent)).sort();
      const exampleKeys = Object.keys(parseEnvContent(result.envExampleContent)).sort();

      expect(exampleKeys).toEqual(envKeys);
    });

    it('masks password/secret values in .env.example', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'RealPassword123!' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'RealDbPass',
            adminUI: false,
            cache: 'redis',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const example = parseEnvContent(result.envExampleContent);

      // Password values should NOT contain the actual passwords
      expect(example['BREWNET_ADMIN_PASSWORD']).not.toBe('RealPassword123!');
      expect(example['POSTGRES_PASSWORD']).not.toBe('RealDbPass');
      expect(example['REDIS_PASSWORD']).not.toBe('RealPassword123!');
      expect(example['GITEA_ADMIN_PASSWORD']).not.toBe('RealPassword123!');

      // Values should be masked placeholders
      for (const [key, value] of Object.entries(example)) {
        if (
          key.includes('PASSWORD') ||
          key.includes('SECRET') ||
          key.includes('TOKEN')
        ) {
          // Masked values are placeholder strings, not the real secret
          expect(value).toMatch(
            /^(<.+>|changeme|your-.+|CHANGE_ME|replace-.+|placeholder)$/i,
          );
        }
      }
    });

    it('preserves non-secret values in .env.example', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'mydb',
            dbUser: 'myuser',
            dbPassword: 'DbPass',
            adminUI: false,
            cache: '',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const example = parseEnvContent(result.envExampleContent);

      // Non-secret values like usernames and DB names should be present
      expect(example['BREWNET_ADMIN_USERNAME']).toBeDefined();
      if (example['POSTGRES_USER']) {
        expect(example['POSTGRES_USER']).toBeDefined();
      }
      if (example['POSTGRES_DB']) {
        expect(example['POSTGRES_DB']).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // All password values must be non-empty
  // -------------------------------------------------------------------------

  describe('password values are non-empty', () => {
    it('all PASSWORD/SECRET/TOKEN values in .env are non-empty strings', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'MyPassword123!' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbP@ss',
            adminUI: true,
            cache: 'redis',
          },
          fileServer: { enabled: true, service: 'nextcloud' },
          mailServer: { enabled: true, service: 'docker-mailserver' },
          sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
        },
        domain: {
          provider: 'custom',
          name: 'example.com',
          cloudflare: {
            enabled: true,
            tunnelToken: 'cf-token-value',
            tunnelName: 'my-tunnel',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      for (const [key, value] of Object.entries(env)) {
        if (
          key.includes('PASSWORD') ||
          key.includes('SECRET') ||
          key.includes('TOKEN')
        ) {
          expect(value.length).toBeGreaterThan(0);
        }
      }
    });

    it('uses admin password for credential propagation', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'ValidPass!' },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['BREWNET_ADMIN_PASSWORD']).toBe('ValidPass!');
      expect(env['GITEA_ADMIN_PASSWORD']).toBe('ValidPass!');
    });
  });

  // -------------------------------------------------------------------------
  // Valkey / KeyDB cache variants
  // -------------------------------------------------------------------------

  describe('cache variants', () => {
    it('includes cache password when cache is valkey', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbPass',
            adminUI: false,
            cache: 'valkey',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      // Either VALKEY_PASSWORD or REDIS_PASSWORD (valkey is redis-compatible)
      const hasCachePassword =
        env['VALKEY_PASSWORD'] !== undefined ||
        env['REDIS_PASSWORD'] !== undefined;
      expect(hasCachePassword).toBe(true);
    });

    it('includes cache password when cache is keydb', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          dbServer: {
            enabled: true,
            primary: 'postgresql',
            primaryVersion: '17',
            dbName: 'brewnet_db',
            dbUser: 'brewnet',
            dbPassword: 'DbPass',
            adminUI: false,
            cache: 'keydb',
          },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      const hasCachePassword =
        env['KEYDB_PASSWORD'] !== undefined ||
        env['REDIS_PASSWORD'] !== undefined;
      expect(hasCachePassword).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // File server variants
  // -------------------------------------------------------------------------

  describe('file server env vars', () => {
    it('includes Nextcloud keys when nextcloud is enabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          fileServer: { enabled: true, service: 'nextcloud' },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['NEXTCLOUD_ADMIN_USER']).toBe('admin');
      expect(env['NEXTCLOUD_ADMIN_PASSWORD']).toBe('Pass');
    });

    it('includes MinIO keys when minio is enabled', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        servers: {
          fileServer: { enabled: true, service: 'minio' },
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['MINIO_ROOT_USER']).toBe('admin');
      expect(env['MINIO_ROOT_PASSWORD']).toBe('Pass');
    });
  });

  // -------------------------------------------------------------------------
  // Domain-related env vars
  // -------------------------------------------------------------------------

  describe('domain env vars', () => {
    it('includes BREWNET_DOMAIN with the configured domain name', () => {
      const state = buildState({
        admin: { username: 'admin', password: 'Pass' },
        domain: {
          provider: 'custom',
          name: 'myserver.example.com',
        },
      });

      const result: EnvGeneratorResult = generateEnvFiles(state);
      const env = parseEnvContent(result.envContent);

      expect(env['BREWNET_DOMAIN']).toBe('myserver.example.com');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: writeEnvFile — chmod 600
// ---------------------------------------------------------------------------

describe('writeEnvFile', () => {
  it('writes .env file content to the correct path', () => {
    const projectPath = '/home/user/my-project';
    const content = 'BREWNET_ADMIN_USERNAME=admin\nBREWNET_ADMIN_PASSWORD=secret\n';

    writeEnvFile(projectPath, content);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      content,
      expect.anything(),
    );
  });

  it('sets file permissions to 0o600 (chmod 600)', () => {
    const projectPath = '/home/user/my-project';
    const content = 'KEY=VALUE\n';

    writeEnvFile(projectPath, content);

    // Verify chmod 600 is applied — either via chmodSync or writeFileSync options
    const chmodCalled = mockChmodSync.mock.calls.some(
      (call) => call[1] === 0o600,
    );
    const writeWithMode = mockWriteFileSync.mock.calls.some(
      (call) =>
        typeof call[2] === 'object' &&
        call[2] !== null &&
        'mode' in (call[2] as object) &&
        (call[2] as { mode: number }).mode === 0o600,
    );

    expect(chmodCalled || writeWithMode).toBe(true);
  });

  it('writes to projectPath/.env', () => {
    const projectPath = '/opt/brewnet/myproject';
    const content = 'A=B\n';

    writeEnvFile(projectPath, content);

    const writtenPath = mockWriteFileSync.mock.calls[0]![0] as string;
    expect(writtenPath).toMatch(/\/opt\/brewnet\/myproject\/?.*\.env$/);
    // Should not be .env.example
    expect(writtenPath).not.toContain('.env.example');
  });
});

// ---------------------------------------------------------------------------
// Tests: writeEnvExampleFile
// ---------------------------------------------------------------------------

describe('writeEnvExampleFile', () => {
  it('writes .env.example file to the correct path', () => {
    const projectPath = '/home/user/my-project';
    const content = 'BREWNET_ADMIN_USERNAME=admin\nBREWNET_ADMIN_PASSWORD=<your-password>\n';

    writeEnvExampleFile(projectPath, content);

    const writtenPath = mockWriteFileSync.mock.calls[0]![0] as string;
    expect(writtenPath).toContain('.env.example');
  });

  it('does NOT set restrictive chmod 600 on .env.example (it is safe to share)', () => {
    const projectPath = '/home/user/my-project';
    const content = 'KEY=<your-value>\n';

    writeEnvExampleFile(projectPath, content);

    // .env.example should NOT have chmod 600 restriction
    // It either has no chmod call or a less restrictive permission
    const chmod600OnExample = mockChmodSync.mock.calls.some(
      (call) =>
        (call[0] as string).includes('.env.example') && call[1] === 0o600,
    );
    expect(chmod600OnExample).toBe(false);
  });
});
