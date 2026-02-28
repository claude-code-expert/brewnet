/**
 * Unit tests for the service registry.
 *
 * Covers: SERVICE_REGISTRY structure, getServiceDefinition(), getAllServiceIds(),
 * and specific port/property assertions for key services.
 */

import {
  SERVICE_REGISTRY,
  getServiceDefinition,
  getAllServiceIds,
  type ServiceDefinition,
} from '../../../../packages/cli/src/config/services.js';

// ---------------------------------------------------------------------------
// Expected service IDs (alphabetical for readability; order in the Map may differ)
// ---------------------------------------------------------------------------
const EXPECTED_SERVICE_IDS: string[] = [
  'traefik',
  'nginx',
  'caddy',
  'gitea',
  'filebrowser',
  'nextcloud',
  'minio',
  'jellyfin',
  'postgresql',
  'mysql',
  'redis',
  'valkey',
  'keydb',
  'pgadmin',
  'openssh-server',
  'docker-mailserver',
  'cloudflared',
];

// ===========================================================================
// SERVICE_REGISTRY — size & completeness
// ===========================================================================

describe('SERVICE_REGISTRY', () => {
  it('has exactly 17 entries', () => {
    expect(SERVICE_REGISTRY.size).toBe(17);
  });

  it('contains every expected service ID', () => {
    for (const id of EXPECTED_SERVICE_IDS) {
      expect(SERVICE_REGISTRY.has(id)).toBe(true);
    }
  });

  it('contains no unexpected service IDs', () => {
    const registeredIds = [...SERVICE_REGISTRY.keys()];
    for (const id of registeredIds) {
      expect(EXPECTED_SERVICE_IDS).toContain(id);
    }
  });
});

// ===========================================================================
// ServiceDefinition shape — every entry must satisfy the interface contract
// ===========================================================================

describe('ServiceDefinition shape', () => {
  const entries = [...SERVICE_REGISTRY.entries()];

  it.each(entries)(
    '%s has a non-empty image string',
    (_id: string, def: ServiceDefinition) => {
      expect(typeof def.image).toBe('string');
      expect(def.image.length).toBeGreaterThan(0);
    },
  );

  it.each(entries)(
    '%s has ports as an array',
    (_id: string, def: ServiceDefinition) => {
      expect(Array.isArray(def.ports)).toBe(true);
    },
  );

  it.each(entries)(
    '%s has a positive ramMB',
    (_id: string, def: ServiceDefinition) => {
      expect(typeof def.ramMB).toBe('number');
      expect(def.ramMB).toBeGreaterThan(0);
    },
  );

  it.each(entries)(
    '%s has a non-negative diskGB',
    (_id: string, def: ServiceDefinition) => {
      expect(typeof def.diskGB).toBe('number');
      expect(def.diskGB).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(entries)(
    '%s has a non-empty networks array',
    (_id: string, def: ServiceDefinition) => {
      expect(Array.isArray(def.networks)).toBe(true);
      expect(def.networks.length).toBeGreaterThan(0);
    },
  );

  it.each(entries)(
    '%s has requiredEnvVars as an array',
    (_id: string, def: ServiceDefinition) => {
      expect(Array.isArray(def.requiredEnvVars)).toBe(true);
    },
  );

  it.each(entries)(
    '%s has a matching id field',
    (id: string, def: ServiceDefinition) => {
      expect(def.id).toBe(id);
    },
  );

  it.each(entries)(
    '%s has a non-empty name string',
    (_id: string, def: ServiceDefinition) => {
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
    },
  );

  // healthCheck — when present, must satisfy the expected shape
  it.each(entries)(
    '%s has a valid healthCheck config when present',
    (_id: string, def: ServiceDefinition) => {
      if (def.healthCheck) {
        expect(typeof def.healthCheck.endpoint).toBe('string');
        expect(typeof def.healthCheck.interval).toBe('number');
        expect(def.healthCheck.interval).toBeGreaterThan(0);
        expect(typeof def.healthCheck.timeout).toBe('number');
        expect(def.healthCheck.timeout).toBeGreaterThan(0);
        expect(typeof def.healthCheck.retries).toBe('number');
        expect(def.healthCheck.retries).toBeGreaterThan(0);
      }
    },
  );
});

// ===========================================================================
// getServiceDefinition()
// ===========================================================================

describe('getServiceDefinition()', () => {
  it('returns the correct definition for a known service', () => {
    const traefik = getServiceDefinition('traefik');
    expect(traefik).toBeDefined();
    expect(traefik!.id).toBe('traefik');
    expect(traefik!.name).toBe('Traefik');
    expect(traefik!.image).toBe('traefik:v2.11');
  });

  it('returns the correct definition for every registered service', () => {
    for (const id of EXPECTED_SERVICE_IDS) {
      const def = getServiceDefinition(id);
      expect(def).toBeDefined();
      expect(def!.id).toBe(id);
    }
  });

  it('returns undefined for an unknown service ID', () => {
    expect(getServiceDefinition('unknown-service')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getServiceDefinition('')).toBeUndefined();
  });
});

// ===========================================================================
// getAllServiceIds()
// ===========================================================================

describe('getAllServiceIds()', () => {
  it('returns an array of 17 service IDs', () => {
    const ids = getAllServiceIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toHaveLength(17);
  });

  it('contains every expected service ID', () => {
    const ids = getAllServiceIds();
    for (const id of EXPECTED_SERVICE_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('returns a new array on each call (no shared reference)', () => {
    const a = getAllServiceIds();
    const b = getAllServiceIds();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ===========================================================================
// Specific service assertions
// ===========================================================================

describe('Specific service definitions', () => {
  // -- Traefik ----------------------------------------------------------------
  describe('traefik', () => {
    const traefik = getServiceDefinition('traefik')!;

    it('exposes ports 80, 443, and 8080', () => {
      expect(traefik.ports).toContain(80);
      expect(traefik.ports).toContain(443);
      expect(traefik.ports).toContain(8080);
    });

    it('has a healthCheck with endpoint /api/health', () => {
      expect(traefik.healthCheck).toBeDefined();
      expect(traefik.healthCheck!.endpoint).toBe('/api/health');
    });

    it('has traefikLabels for its dashboard', () => {
      expect(traefik.traefikLabels).toBeDefined();
      expect(traefik.traefikLabels!['traefik.enable']).toBe('true');
    });
  });

  // -- PostgreSQL -------------------------------------------------------------
  describe('postgresql', () => {
    const pg = getServiceDefinition('postgresql')!;

    it('exposes port 5432', () => {
      expect(pg.ports).toEqual([5432]);
    });

    it('requires POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB', () => {
      expect(pg.requiredEnvVars).toContain('POSTGRES_PASSWORD');
      expect(pg.requiredEnvVars).toContain('POSTGRES_USER');
      expect(pg.requiredEnvVars).toContain('POSTGRES_DB');
    });

    it('is on the brewnet-internal network', () => {
      expect(pg.networks).toContain('brewnet-internal');
    });
  });

  // -- Gitea ------------------------------------------------------------------
  describe('gitea', () => {
    const gitea = getServiceDefinition('gitea')!;

    it('exposes port 3000 (web) and 3022 (SSH)', () => {
      expect(gitea.ports).toContain(3000);
      expect(gitea.ports).toContain(3022);
    });

    it('uses subdomain "git"', () => {
      expect(gitea.subdomain).toBe('git');
    });

    it('has traefikLabels routing to port 3000', () => {
      expect(gitea.traefikLabels).toBeDefined();
      expect(
        gitea.traefikLabels![
          'traefik.http.services.gitea.loadbalancer.server.port'
        ],
      ).toBe('3000');
    });
  });

  // -- MySQL ------------------------------------------------------------------
  describe('mysql', () => {
    const mysql = getServiceDefinition('mysql')!;

    it('exposes port 3306', () => {
      expect(mysql.ports).toEqual([3306]);
    });

    it('requires MYSQL_ROOT_PASSWORD', () => {
      expect(mysql.requiredEnvVars).toContain('MYSQL_ROOT_PASSWORD');
    });
  });

  // -- Redis ------------------------------------------------------------------
  describe('redis', () => {
    const redis = getServiceDefinition('redis')!;

    it('exposes port 6379', () => {
      expect(redis.ports).toEqual([6379]);
    });

    it('has no required environment variables', () => {
      expect(redis.requiredEnvVars).toHaveLength(0);
    });
  });

  // -- Cloudflared ------------------------------------------------------------
  describe('cloudflared', () => {
    const cf = getServiceDefinition('cloudflared')!;

    it('exposes no ports', () => {
      expect(cf.ports).toHaveLength(0);
    });

    it('requires TUNNEL_TOKEN', () => {
      expect(cf.requiredEnvVars).toContain('TUNNEL_TOKEN');
    });

    it('has no healthCheck', () => {
      expect(cf.healthCheck).toBeUndefined();
    });
  });

  // -- OpenSSH Server ---------------------------------------------------------
  describe('openssh-server', () => {
    const ssh = getServiceDefinition('openssh-server')!;

    it('exposes port 2222', () => {
      expect(ssh.ports).toEqual([2222]);
    });

    it('requires USER_NAME and PASSWORD_ACCESS env vars', () => {
      expect(ssh.requiredEnvVars).toContain('USER_NAME');
      expect(ssh.requiredEnvVars).toContain('PASSWORD_ACCESS');
    });
  });

  // -- Docker Mailserver ------------------------------------------------------
  describe('docker-mailserver', () => {
    const mail = getServiceDefinition('docker-mailserver')!;

    it('exposes ports 25, 587, 993', () => {
      expect(mail.ports).toContain(25);
      expect(mail.ports).toContain(587);
      expect(mail.ports).toContain(993);
    });

    it('uses subdomain "mail"', () => {
      expect(mail.subdomain).toBe('mail');
    });
  });

  // -- Jellyfin ---------------------------------------------------------------
  describe('jellyfin', () => {
    const jf = getServiceDefinition('jellyfin')!;

    it('exposes port 8096', () => {
      expect(jf.ports).toEqual([8096]);
    });

    it('uses subdomain "jellyfin"', () => {
      expect(jf.subdomain).toBe('jellyfin');
    });
  });

  // -- Nginx ------------------------------------------------------------------
  describe('nginx', () => {
    const nginx = getServiceDefinition('nginx')!;

    it('exposes ports 80 and 443', () => {
      expect(nginx.ports).toContain(80);
      expect(nginx.ports).toContain(443);
    });

    it('has no traefikLabels', () => {
      expect(nginx.traefikLabels).toBeUndefined();
    });
  });

  // -- Caddy ------------------------------------------------------------------
  describe('caddy', () => {
    const caddy = getServiceDefinition('caddy')!;

    it('exposes ports 80 and 443', () => {
      expect(caddy.ports).toContain(80);
      expect(caddy.ports).toContain(443);
    });
  });
});
