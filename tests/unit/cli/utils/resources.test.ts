/**
 * Unit tests for Brewnet CLI — Resource Estimation & Service Collection
 *
 * Tests cover:
 *  - countSelectedServices
 *  - estimateResources
 *  - collectAllServices
 *  - getCredentialTargets
 *  - getImageName
 */

import {
  countSelectedServices,
  estimateResources,
  collectAllServices,
  getCredentialTargets,
  getImageName,
  WizardState,
  SERVICE_RAM_MAP,
  SERVICE_DISK_MAP,
} from '../../../../packages/cli/src/utils/resources.js';

// ---------------------------------------------------------------------------
// Factory helper: creates a minimal WizardState with sensible defaults.
// Every test can override specific fields via deepMerge.
// ---------------------------------------------------------------------------

function createBaseState(overrides?: DeepPartial<WizardState>): WizardState {
  const base: WizardState = {
    schemaVersion: 5,
    projectName: 'test-project',
    projectPath: '/tmp/test-project',
    setupType: 'full',
    admin: {
      username: 'admin',
      password: 'secret',
      storage: 'local',
    },
    servers: {
      webServer: { enabled: true, service: 'traefik' },
      gitServer: { enabled: true },
      fileServer: { enabled: false, service: '' },
      appServer: { enabled: false },
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
      mailServer: { enabled: false, service: '' },
      fileBrowser: { enabled: false, mode: '' },
    },
    devStack: {
      languages: [],
      frameworks: {},
      frontend: null,
    },
    boilerplate: {
      generate: false,
      sampleData: false,
      devMode: 'production',
    },
    domain: {
      provider: 'local',
      name: 'localhost',
      ssl: 'none',
      cloudflare: {
        enabled: false,
        tunnelToken: '',
        tunnelName: '',
      },
    },
  };

  return overrides ? deepMerge(base, overrides) : base;
}

/** Recursive partial type helper. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Simple recursive merge (arrays are replaced, not concatenated). */
function deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as DeepPartial<Record<string, unknown>>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

// ===========================================================================
// countSelectedServices
// ===========================================================================

describe('countSelectedServices', () => {
  test('minimal state counts web server + gitea = 2', () => {
    const state = createBaseState();
    expect(countSelectedServices(state)).toBe(2);
  });

  test('file server adds 1 when enabled with a service', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: 'nextcloud' } },
    });
    expect(countSelectedServices(state)).toBe(3);
  });

  test('file server not counted when enabled but service is empty', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: '' } },
    });
    expect(countSelectedServices(state)).toBe(2);
  });

  test('app server counted only when devStack has languages', () => {
    const stateWithoutLang = createBaseState({
      servers: { appServer: { enabled: true } },
    });
    expect(countSelectedServices(stateWithoutLang)).toBe(2);

    const stateWithLang = createBaseState({
      servers: { appServer: { enabled: true } },
      devStack: { languages: ['nodejs'] },
    });
    expect(countSelectedServices(stateWithLang)).toBe(3);
  });

  test('database (non-sqlite) adds 1, sqlite does not', () => {
    const pgState = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: false,
          cache: '',
        },
      },
    });
    expect(countSelectedServices(pgState)).toBe(3);

    const sqliteState = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });
    // sqlite does not add a container
    expect(countSelectedServices(sqliteState)).toBe(2);
  });

  test('database with adminUI adds an extra container', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: '',
        },
      },
    });
    // web(1) + gitea(1) + postgresql(1) + pgadmin(1) = 4
    expect(countSelectedServices(state)).toBe(4);
  });

  test('adminUI is not counted when primary is sqlite', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: true,
          cache: '',
        },
      },
    });
    // sqlite doesn't add container, and adminUI only applies to non-sqlite
    expect(countSelectedServices(state)).toBe(2);
  });

  test('cache adds 1 when set', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: false,
          cache: 'redis',
        },
      },
    });
    // web(1) + gitea(1) + postgresql(1) + redis(1) = 4
    expect(countSelectedServices(state)).toBe(4);
  });

  test('media adds count equal to the number of media services', () => {
    const state = createBaseState({
      servers: { media: { enabled: true, services: ['jellyfin'] } },
    });
    expect(countSelectedServices(state)).toBe(3);
  });

  test('ssh server adds 1', () => {
    const state = createBaseState({
      servers: { sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false } },
    });
    expect(countSelectedServices(state)).toBe(3);
  });

  test('mail server adds 1', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });
    expect(countSelectedServices(state)).toBe(3);
  });

  test('fileBrowser standalone adds 1, directory mode does not', () => {
    const standaloneState = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'standalone' } },
    });
    expect(countSelectedServices(standaloneState)).toBe(3);

    const directoryState = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'directory' } },
    });
    expect(countSelectedServices(directoryState)).toBe(2);
  });

  test('full install counts all services correctly', () => {
    const state = createBaseState({
      servers: {
        webServer: { enabled: true, service: 'nginx' },
        fileServer: { enabled: true, service: 'nextcloud' },
        appServer: { enabled: true },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: 'redis',
        },
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
        mailServer: { enabled: true, service: 'docker-mailserver' },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
      devStack: { languages: ['nodejs'] },
    });
    // web(1) + gitea(1) + fileServer(1) + appServer(1) + pg(1) + pgadmin(1) + redis(1)
    //   + jellyfin(1) + ssh(1) + mail(1) + fileBrowser(1) = 11
    expect(countSelectedServices(state)).toBe(11);
  });
});

// ===========================================================================
// estimateResources
// ===========================================================================

describe('estimateResources', () => {
  test('minimal state returns web server + gitea estimates', () => {
    const state = createBaseState(); // traefik web server
    const result = estimateResources(state);

    expect(result.containers).toBe(2);
    expect(result.ramMB).toBe(SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']!);
    expect(result.diskGB).toBeCloseTo(
      SERVICE_DISK_MAP['traefik']! + SERVICE_DISK_MAP['gitea']!,
      1,
    );
    expect(result.ramGB).toMatch(/^\d+\.\d+ GB$/);
  });

  test('web server defaults to traefik when service is empty', () => {
    const state = createBaseState({
      servers: { webServer: { enabled: true, service: '' } },
    });
    const result = estimateResources(state);
    // Empty service string falls back to 'traefik' lookup. traefik exists in the map
    // so its RAM is used rather than the 40 MB fallback.
    expect(result.ramMB).toBe(SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']!);
  });

  test('uses fallback RAM for unknown web server', () => {
    const state = createBaseState({
      servers: { webServer: { enabled: true, service: 'unknown-proxy' } },
    });
    const result = estimateResources(state);
    // 'unknown-proxy' is not in SERVICE_RAM_MAP, ramFor returns 0, fallback is 40
    expect(result.ramMB).toBe(40 + SERVICE_RAM_MAP['gitea']!);
  });

  test('file server adds its RAM and disk', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: 'nextcloud' } },
    });
    const result = estimateResources(state);
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['nextcloud']!,
    );
  });

  test('media services each contribute', () => {
    const state = createBaseState({
      servers: { media: { enabled: true, services: ['jellyfin'] } },
    });
    const result = estimateResources(state);
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['jellyfin']!,
    );
  });

  test('database postgresql with adminUI and redis cache', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: 'redis',
        },
      },
    });
    const result = estimateResources(state);
    // web + gitea + postgresql + pgadmin + redis = 5 containers
    expect(result.containers).toBe(5);
    const expectedRam =
      SERVICE_RAM_MAP['traefik']! +
      SERVICE_RAM_MAP['gitea']! +
      SERVICE_RAM_MAP['postgresql']! +
      SERVICE_RAM_MAP['pgadmin']! +
      SERVICE_RAM_MAP['redis']!;
    expect(result.ramMB).toBe(expectedRam);
  });

  test('sqlite database does not add a container', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });
    const result = estimateResources(state);
    // Only web + gitea
    expect(result.containers).toBe(2);
  });

  test('sqlite with cache still adds cache container', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: 'valkey',
        },
      },
    });
    const result = estimateResources(state);
    // web + gitea + valkey = 3
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['valkey']!,
    );
  });

  test('app server only counted when devStack has languages', () => {
    const stateNoLang = createBaseState({
      servers: { appServer: { enabled: true } },
    });
    expect(estimateResources(stateNoLang).containers).toBe(2);

    const stateWithLang = createBaseState({
      servers: { appServer: { enabled: true } },
      devStack: { languages: ['python'] },
    });
    expect(estimateResources(stateWithLang).containers).toBe(3);
    expect(estimateResources(stateWithLang).ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['app']!,
    );
  });

  test('fileBrowser standalone adds resources, directory does not', () => {
    const standalone = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'standalone' } },
    });
    expect(estimateResources(standalone).containers).toBe(3);

    const directory = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'directory' } },
    });
    expect(estimateResources(directory).containers).toBe(2);
  });

  test('ssh server adds resources', () => {
    const state = createBaseState({
      servers: { sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false } },
    });
    const result = estimateResources(state);
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['openssh-server']!,
    );
  });

  test('mail server adds resources', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });
    const result = estimateResources(state);
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! +
        SERVICE_RAM_MAP['gitea']! +
        SERVICE_RAM_MAP['docker-mailserver']!,
    );
  });

  test('mail server defaults to docker-mailserver when service is empty', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: '' } },
    });
    const result = estimateResources(state);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! +
        SERVICE_RAM_MAP['gitea']! +
        SERVICE_RAM_MAP['docker-mailserver']!,
    );
  });

  test('cloudflare tunnel adds resources when enabled', () => {
    const state = createBaseState({
      domain: {
        provider: 'custom',
        name: 'example.com',
        ssl: 'cloudflare',
        cloudflare: { enabled: true, tunnelToken: 'tok', tunnelName: 'my-tunnel' },
      },
    });
    const result = estimateResources(state);
    expect(result.containers).toBe(3);
    expect(result.ramMB).toBe(
      SERVICE_RAM_MAP['traefik']! + SERVICE_RAM_MAP['gitea']! + SERVICE_RAM_MAP['cloudflared']!,
    );
  });

  test('ramGB is formatted correctly', () => {
    const state = createBaseState();
    const result = estimateResources(state);
    // traefik(45) + gitea(256) = 301 MB = 0.3 GB (301/1024)
    expect(result.ramGB).toBe(`${(301 / 1024).toFixed(1)} GB`);
  });

  test('diskGB is rounded to one decimal place', () => {
    const state = createBaseState();
    const result = estimateResources(state);
    // traefik(0.1) + gitea(1.0) = 1.1
    expect(result.diskGB).toBe(1.1);
  });

  test('full install estimates sum all resources', () => {
    const state = createBaseState({
      servers: {
        webServer: { enabled: true, service: 'nginx' },
        fileServer: { enabled: true, service: 'minio' },
        appServer: { enabled: true },
        dbServer: {
          enabled: true,
          primary: 'mysql',
          primaryVersion: '8.4',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: 'keydb',
        },
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
        mailServer: { enabled: true, service: 'docker-mailserver' },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
      devStack: { languages: ['nodejs', 'python'] },
      domain: {
        provider: 'custom',
        name: 'example.com',
        ssl: 'letsencrypt',
        cloudflare: { enabled: true, tunnelToken: 'tok', tunnelName: 'tunnel' },
      },
    });

    const result = estimateResources(state);
    // nginx + gitea + minio + jellyfin + mysql + pgadmin + keydb + app + filebrowser
    //   + openssh-server + docker-mailserver + cloudflared = 12 containers
    expect(result.containers).toBe(12);

    const expectedRam =
      SERVICE_RAM_MAP['nginx']! +
      SERVICE_RAM_MAP['gitea']! +
      SERVICE_RAM_MAP['minio']! +
      SERVICE_RAM_MAP['jellyfin']! +
      SERVICE_RAM_MAP['mysql']! +
      SERVICE_RAM_MAP['pgadmin']! +
      SERVICE_RAM_MAP['keydb']! +
      SERVICE_RAM_MAP['app']! +
      SERVICE_RAM_MAP['filebrowser']! +
      SERVICE_RAM_MAP['openssh-server']! +
      SERVICE_RAM_MAP['docker-mailserver']! +
      SERVICE_RAM_MAP['cloudflared']!;
    expect(result.ramMB).toBe(expectedRam);
  });
});

// ===========================================================================
// collectAllServices
// ===========================================================================

describe('collectAllServices', () => {
  test('minimal state returns [web server, gitea]', () => {
    const state = createBaseState();
    expect(collectAllServices(state)).toEqual(['traefik', 'gitea']);
  });

  test('web server defaults to traefik when service string is empty', () => {
    const state = createBaseState({
      servers: { webServer: { enabled: true, service: '' } },
    });
    expect(collectAllServices(state)[0]).toBe('traefik');
  });

  test('includes file server service when enabled', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: 'minio' } },
    });
    expect(collectAllServices(state)).toContain('minio');
  });

  test('includes media services', () => {
    const state = createBaseState({
      servers: { media: { enabled: true, services: ['jellyfin'] } },
    });
    expect(collectAllServices(state)).toContain('jellyfin');
  });

  test('includes database (non-sqlite) and admin UI', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: '',
        },
      },
    });
    const ids = collectAllServices(state);
    expect(ids).toContain('postgresql');
    expect(ids).toContain('pgadmin');
  });

  test('does not include sqlite as a service', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: false,
          cache: '',
        },
      },
    });
    const ids = collectAllServices(state);
    expect(ids).not.toContain('sqlite');
  });

  test('includes cache when set', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: false,
          cache: 'valkey',
        },
      },
    });
    expect(collectAllServices(state)).toContain('valkey');
  });

  test('includes openssh-server when SSH enabled', () => {
    const state = createBaseState({
      servers: { sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false } },
    });
    expect(collectAllServices(state)).toContain('openssh-server');
  });

  test('includes mail server when enabled', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });
    expect(collectAllServices(state)).toContain('docker-mailserver');
  });

  test('mail server defaults to docker-mailserver when service is empty', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: '' } },
    });
    expect(collectAllServices(state)).toContain('docker-mailserver');
  });

  test('includes filebrowser only in standalone mode', () => {
    const standalone = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'standalone' } },
    });
    expect(collectAllServices(standalone)).toContain('filebrowser');

    const directory = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'directory' } },
    });
    expect(collectAllServices(directory)).not.toContain('filebrowser');
  });

  test('includes cloudflared when cloudflare tunnel enabled', () => {
    const state = createBaseState({
      domain: {
        provider: 'custom',
        name: 'example.com',
        ssl: 'cloudflare',
        cloudflare: { enabled: true, tunnelToken: 'tok', tunnelName: 'tunnel' },
      },
    });
    expect(collectAllServices(state)).toContain('cloudflared');
  });

  test('does not include cloudflared when tunnel disabled', () => {
    const state = createBaseState();
    expect(collectAllServices(state)).not.toContain('cloudflared');
  });

  test('order is deterministic: web, gitea, file, media, db, adminUI, cache, ssh, mail, filebrowser, cloudflared', () => {
    const state = createBaseState({
      servers: {
        webServer: { enabled: true, service: 'nginx' },
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: 'redis',
        },
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        mailServer: { enabled: true, service: 'docker-mailserver' },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
      domain: {
        provider: 'custom',
        name: 'example.com',
        ssl: 'cloudflare',
        cloudflare: { enabled: true, tunnelToken: 'tok', tunnelName: 'tunnel' },
      },
    });
    expect(collectAllServices(state)).toEqual([
      'nginx',
      'gitea',
      'nextcloud',
      'jellyfin',
      'postgresql',
      'pgadmin',
      'redis',
      'openssh-server',
      'docker-mailserver',
      'filebrowser',
      'cloudflared',
    ]);
  });
});

// ===========================================================================
// getCredentialTargets
// ===========================================================================

describe('getCredentialTargets', () => {
  test('always includes Gitea', () => {
    const state = createBaseState();
    expect(getCredentialTargets(state)).toEqual(['Gitea']);
  });

  test('includes Nextcloud when fileServer is nextcloud', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: 'nextcloud' } },
    });
    expect(getCredentialTargets(state)).toContain('Nextcloud');
  });

  test('includes MinIO when fileServer is minio', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: true, service: 'minio' } },
    });
    expect(getCredentialTargets(state)).toContain('MinIO');
  });

  test('does not include fileServer targets when disabled', () => {
    const state = createBaseState({
      servers: { fileServer: { enabled: false, service: 'nextcloud' } },
    });
    const targets = getCredentialTargets(state);
    expect(targets).not.toContain('Nextcloud');
    expect(targets).not.toContain('MinIO');
  });

  test('includes pgAdmin when adminUI is enabled with non-sqlite db', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: '',
        },
      },
    });
    expect(getCredentialTargets(state)).toContain('pgAdmin');
  });

  test('does not include pgAdmin when primary is sqlite', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'sqlite',
          primaryVersion: '',
          dbName: '',
          dbUser: '',
          dbPassword: '',
          adminUI: true,
          cache: '',
        },
      },
    });
    expect(getCredentialTargets(state)).not.toContain('pgAdmin');
  });

  test('does not include pgAdmin when adminUI is false', () => {
    const state = createBaseState({
      servers: {
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: false,
          cache: '',
        },
      },
    });
    expect(getCredentialTargets(state)).not.toContain('pgAdmin');
  });

  test('includes Jellyfin when media has jellyfin', () => {
    const state = createBaseState({
      servers: { media: { enabled: true, services: ['jellyfin'] } },
    });
    expect(getCredentialTargets(state)).toContain('Jellyfin');
  });

  test('does not include Jellyfin when media services lack it', () => {
    const state = createBaseState({
      servers: { media: { enabled: true, services: [] } },
    });
    expect(getCredentialTargets(state)).not.toContain('Jellyfin');
  });

  test('includes SSH Server when enabled', () => {
    const state = createBaseState({
      servers: { sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false } },
    });
    expect(getCredentialTargets(state)).toContain('SSH Server');
  });

  test('includes Mail Server when enabled', () => {
    const state = createBaseState({
      servers: { mailServer: { enabled: true, service: 'docker-mailserver' } },
    });
    expect(getCredentialTargets(state)).toContain('Mail Server');
  });

  test('includes FileBrowser when enabled (any mode)', () => {
    const standalone = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'standalone' } },
    });
    expect(getCredentialTargets(standalone)).toContain('FileBrowser');

    const directory = createBaseState({
      servers: { fileBrowser: { enabled: true, mode: 'directory' } },
    });
    expect(getCredentialTargets(directory)).toContain('FileBrowser');
  });

  test('full install returns all targets', () => {
    const state = createBaseState({
      servers: {
        fileServer: { enabled: true, service: 'nextcloud' },
        dbServer: {
          enabled: true,
          primary: 'postgresql',
          primaryVersion: '17',
          dbName: 'app',
          dbUser: 'admin',
          dbPassword: 'pw',
          adminUI: true,
          cache: 'redis',
        },
        media: { enabled: true, services: ['jellyfin'] },
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
        mailServer: { enabled: true, service: 'docker-mailserver' },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    expect(getCredentialTargets(state)).toEqual([
      'Gitea',
      'Nextcloud',
      'pgAdmin',
      'Jellyfin',
      'SSH Server',
      'Mail Server',
      'FileBrowser',
    ]);
  });
});

// ===========================================================================
// getImageName
// ===========================================================================

describe('getImageName', () => {
  test('returns correct image for known services', () => {
    expect(getImageName('traefik')).toBe('traefik:v3.0');
    expect(getImageName('nginx')).toBe('nginx:1.25-alpine');
    expect(getImageName('caddy')).toBe('caddy:2-alpine');
    expect(getImageName('nextcloud')).toBe('nextcloud:29-apache');
    expect(getImageName('minio')).toBe('minio/minio:latest');
    expect(getImageName('jellyfin')).toBe('jellyfin/jellyfin:latest');
    expect(getImageName('postgresql')).toBe('postgres:17-alpine');
    expect(getImageName('mysql')).toBe('mysql:8.4');
    expect(getImageName('redis')).toBe('redis:7-alpine');
    expect(getImageName('valkey')).toBe('valkey/valkey:7-alpine');
    expect(getImageName('keydb')).toBe('eqalpha/keydb:latest');
    expect(getImageName('pgadmin')).toBe('dpage/pgadmin4:latest');
    expect(getImageName('openssh-server')).toBe('linuxserver/openssh-server:latest');
    expect(getImageName('docker-mailserver')).toBe(
      'ghcr.io/docker-mailserver/docker-mailserver:latest',
    );
    expect(getImageName('filebrowser')).toBe('filebrowser/filebrowser:latest');
    expect(getImageName('cloudflared')).toBe('cloudflare/cloudflared:latest');
    expect(getImageName('gitea')).toBe('gitea/gitea:latest');
  });

  test('falls back to serviceId:latest for unknown services', () => {
    expect(getImageName('unknown-service')).toBe('unknown-service:latest');
    expect(getImageName('my-custom-app')).toBe('my-custom-app:latest');
  });

  test('fallback works for empty string', () => {
    expect(getImageName('')).toBe(':latest');
  });
});
