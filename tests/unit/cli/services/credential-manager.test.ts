/**
 * Unit tests for services/credential-manager module (T059)
 *
 * Tests the credential propagation logic that determines which
 * services receive admin credentials and generates .env entries.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const {
  getCredentialPropagationTargets,
  generateCredentialEnvEntries,
} = await import(
  '../../../../packages/cli/src/services/credential-manager.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildState(overrides: Partial<{
  admin: Partial<WizardState['admin']>;
  servers: Partial<WizardState['servers']>;
  domain: Partial<WizardState['domain']>;
}> = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.admin) {
    Object.assign(state.admin, overrides.admin);
  }
  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      (state.servers as Record<string, unknown>)[key] = {
        ...(state.servers as Record<string, unknown>)[key] as object,
        ...value as object,
      };
    }
  }
  if (overrides.domain) {
    Object.assign(state.domain, overrides.domain);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests: getCredentialPropagationTargets
// ---------------------------------------------------------------------------

describe('getCredentialPropagationTargets', () => {
  it('always includes Gitea targets', () => {
    const state = buildState();
    const targets = getCredentialPropagationTargets(state);

    const giteaTargets = targets.filter((t) => t.service === 'gitea');
    expect(giteaTargets).toHaveLength(2);
    expect(giteaTargets.map((t) => t.envVar)).toEqual(
      expect.arrayContaining([
        'GITEA__security__SECRET_KEY',
        'GITEA_ADMIN_PASSWORD',
      ]),
    );
  });

  it('includes PostgreSQL target when PostgreSQL is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: false,
          cache: '',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const pgTargets = targets.filter((t) => t.service === 'postgresql');
    expect(pgTargets).toHaveLength(1);
    expect(pgTargets[0]!.envVar).toBe('POSTGRES_PASSWORD');
  });

  it('includes MySQL target when MySQL is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: false,
          cache: '',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const mysqlTargets = targets.filter((t) => t.service === 'mysql');
    expect(mysqlTargets).toHaveLength(1);
    expect(mysqlTargets[0]!.envVar).toBe('MYSQL_ROOT_PASSWORD');
  });

  it('includes pgAdmin target when PostgreSQL with adminUI is enabled', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const pgAdminTargets = targets.filter((t) => t.service === 'pgadmin');
    expect(pgAdminTargets).toHaveLength(1);
    expect(pgAdminTargets[0]!.envVar).toBe('PGADMIN_DEFAULT_PASSWORD');
  });

  it('does not include pgAdmin when adminUI is false', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: false,
          cache: '',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const pgAdminTargets = targets.filter((t) => t.service === 'pgadmin');
    expect(pgAdminTargets).toHaveLength(0);
  });

  it('does not include pgAdmin when MySQL is selected (not PostgreSQL)', () => {
    const state = buildState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: true,
          cache: '',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const pgAdminTargets = targets.filter((t) => t.service === 'pgadmin');
    expect(pgAdminTargets).toHaveLength(0);
  });

  it('includes Nextcloud target when Nextcloud file server is enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const ncTargets = targets.filter((t) => t.service === 'nextcloud');
    expect(ncTargets).toHaveLength(1);
    expect(ncTargets[0]!.envVar).toBe('NEXTCLOUD_ADMIN_PASSWORD');
  });

  it('includes MinIO target when MinIO file server is enabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'minio' },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const minioTargets = targets.filter((t) => t.service === 'minio');
    expect(minioTargets).toHaveLength(1);
    expect(minioTargets[0]!.envVar).toBe('MINIO_ROOT_PASSWORD');
  });

  it('does not include file server targets when file server is disabled', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: false, service: '' },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const fileTargets = targets.filter(
      (t) => t.service === 'nextcloud' || t.service === 'minio',
    );
    expect(fileTargets).toHaveLength(0);
  });

  it('does not include DB targets when DB is disabled', () => {
    const state = buildState({
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

    const targets = getCredentialPropagationTargets(state);
    const dbTargets = targets.filter(
      (t) =>
        t.service === 'postgresql' ||
        t.service === 'mysql' ||
        t.service === 'pgadmin',
    );
    expect(dbTargets).toHaveLength(0);
  });

  it('returns only Gitea targets for minimal state (all optional disabled)', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: false, service: '' },
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
        media: { enabled: false, services: [] },
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
        mailServer: { enabled: false, service: 'docker-mailserver' },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.service === 'gitea')).toBe(true);
  });

  it('returns all targets for a fully enabled state', () => {
    const state = buildState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'test123',
          adminUI: true,
          cache: 'redis',
        },
      },
    });

    const targets = getCredentialPropagationTargets(state);
    const services = targets.map((t) => t.service);
    expect(services).toContain('gitea');
    expect(services).toContain('postgresql');
    expect(services).toContain('pgadmin');
    expect(services).toContain('nextcloud');
  });
});

// ---------------------------------------------------------------------------
// Tests: generateCredentialEnvEntries
// ---------------------------------------------------------------------------

describe('generateCredentialEnvEntries', () => {
  it('always includes BREWNET_ADMIN_USERNAME and BREWNET_ADMIN_PASSWORD', () => {
    const state = buildState({
      admin: { username: 'testadmin', password: 'TestPass123!' },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['BREWNET_ADMIN_USERNAME']).toBe('testadmin');
    expect(entries['BREWNET_ADMIN_PASSWORD']).toBe('TestPass123!');
  });

  it('includes Gitea env vars', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'MySecretPass' },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['GITEA_ADMIN_USER']).toBe('admin');
    expect(entries['GITEA_ADMIN_PASSWORD']).toBe('MySecretPass');
    expect(entries['GITEA__security__SECRET_KEY']).toBe('MySecretPass');
  });

  it('includes PostgreSQL env vars when enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'mydb',
          dbUser: 'myuser',
          dbPassword: 'DbPass123',
          adminUI: false,
          cache: '',
        },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['POSTGRES_USER']).toBe('myuser');
    expect(entries['POSTGRES_DB']).toBe('mydb');
    expect(entries['POSTGRES_PASSWORD']).toBe('DbPass123');
  });

  it('includes MySQL env vars when enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'mydb',
          dbUser: 'myuser',
          dbPassword: 'DbPass456',
          adminUI: false,
          cache: '',
        },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['MYSQL_DATABASE']).toBe('mydb');
    expect(entries['MYSQL_USER']).toBe('myuser');
    expect(entries['MYSQL_PASSWORD']).toBe('DbPass456');
    expect(entries['MYSQL_ROOT_PASSWORD']).toBe('AdminPass');
  });

  it('includes pgAdmin env vars when PostgreSQL + adminUI enabled', () => {
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
          adminUI: true,
          cache: '',
        },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['PGADMIN_DEFAULT_EMAIL']).toBe('admin@brewnet.dev');
    expect(entries['PGADMIN_DEFAULT_PASSWORD']).toBe('AdminPass');
  });

  it('includes Nextcloud env vars when enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['NEXTCLOUD_ADMIN_USER']).toBe('admin');
    expect(entries['NEXTCLOUD_ADMIN_PASSWORD']).toBe('AdminPass');
  });

  it('includes MinIO env vars when enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        fileServer: { enabled: true, service: 'minio' },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['MINIO_ROOT_USER']).toBe('admin');
    expect(entries['MINIO_ROOT_PASSWORD']).toBe('AdminPass');
  });

  it('uses DB password for DB entries, not admin password', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: 'DifferentDbPass',
          adminUI: false,
          cache: '',
        },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    // POSTGRES_PASSWORD should use the DB-specific password
    expect(entries['POSTGRES_PASSWORD']).toBe('DifferentDbPass');
    // But the credential propagation target still uses admin password
    expect(entries['BREWNET_ADMIN_PASSWORD']).toBe('AdminPass');
  });

  it('falls back to admin password when dbPassword is empty', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'brewnet_db',
          dbUser: 'brewnet',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['POSTGRES_PASSWORD']).toBe('AdminPass');
  });

  it('does not include DB entries when DB is disabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
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

    const entries = generateCredentialEnvEntries(state);
    expect(entries['POSTGRES_USER']).toBeUndefined();
    expect(entries['POSTGRES_DB']).toBeUndefined();
    expect(entries['MYSQL_DATABASE']).toBeUndefined();
    expect(entries['PGADMIN_DEFAULT_EMAIL']).toBeUndefined();
  });

  it('does not include file server entries when file server is disabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'AdminPass' },
      servers: {
        fileServer: { enabled: false, service: '' },
      },
    });

    const entries = generateCredentialEnvEntries(state);
    expect(entries['NEXTCLOUD_ADMIN_USER']).toBeUndefined();
    expect(entries['NEXTCLOUD_ADMIN_PASSWORD']).toBeUndefined();
    expect(entries['MINIO_ROOT_USER']).toBeUndefined();
    expect(entries['MINIO_ROOT_PASSWORD']).toBeUndefined();
  });
});
