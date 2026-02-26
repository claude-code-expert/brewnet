/**
 * T051 — Resource Estimation Integration Tests (TC-04-12)
 *
 * Integration tests for resource estimation with multiple components.
 * Verifies that RAM/disk estimates update correctly as components
 * are toggled on/off, simulating real wizard interactions.
 *
 * Unlike the unit tests (which test individual functions in isolation),
 * these integration tests exercise the full pipeline:
 *
 *   defaults module (createDefaultWizardState / applyFullInstallDefaults /
 *   applyPartialInstallDefaults)  →  resource estimation functions
 *   (estimateResources / countSelectedServices / collectAllServices /
 *   getCredentialTargets)  →  service registry (getServiceDefinition)
 *
 * This ensures that default state factories produce states whose resource
 * estimates are correct and self-consistent, and that toggling components
 * in sequence produces the expected cumulative changes.
 *
 * @module tests/integration/resource-estimation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  createDefaultWizardState,
  applyFullInstallDefaults,
  applyPartialInstallDefaults,
} from '../../packages/cli/src/config/defaults.js';

import {
  countSelectedServices,
  estimateResources,
  collectAllServices,
  getCredentialTargets,
  getImageName,
  SERVICE_RAM_MAP,
  SERVICE_DISK_MAP,
} from '../../packages/cli/src/utils/resources.js';

import type { WizardState } from '../../packages/cli/src/utils/resources.js';
import type { ResourceEstimate } from '../../packages/cli/src/utils/resources.js';

import {
  getServiceDefinition,
  getAllServiceIds,
} from '../../packages/cli/src/config/services.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep-clone a WizardState to avoid mutation across test steps.
 */
function cloneState(state: WizardState): WizardState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Toggle a boolean-enabled server component on/off and return a new state.
 */
function withServer<K extends keyof WizardState['servers']>(
  state: WizardState,
  key: K,
  patch: Partial<WizardState['servers'][K]>,
): WizardState {
  const next = cloneState(state);
  next.servers[key] = { ...next.servers[key], ...patch } as WizardState['servers'][K];
  return next;
}

// ---------------------------------------------------------------------------
// 1. Default full install state
// ---------------------------------------------------------------------------

describe('Integration: Resource Estimation with Default States', () => {
  let defaultState: WizardState;

  beforeEach(() => {
    defaultState = createDefaultWizardState();
  });

  it('should produce a valid default state with schemaVersion 5', () => {
    expect(defaultState.schemaVersion).toBe(5);
    expect(defaultState.setupType).toBe('full');
    expect(defaultState.servers.webServer.enabled).toBe(true);
    expect(defaultState.servers.webServer.service).toBe('traefik');
  });

  it('should count services for default full install state', () => {
    // Default state: webServer(traefik) + gitea + dbServer(postgresql) + pgAdmin + redis cache
    const count = countSelectedServices(defaultState);

    // web(1) + gitea(1) + postgresql(1) + pgadmin(1) + redis cache(1) = 5
    expect(count).toBe(5);
  });

  it('should estimate RAM/disk for default full install state', () => {
    const estimate = estimateResources(defaultState);

    // traefik(45) + gitea(256) + postgresql(120) + pgadmin(128) + redis(12) = 561 MB RAM
    const expectedRAM =
      SERVICE_RAM_MAP['traefik'] +
      SERVICE_RAM_MAP['gitea'] +
      SERVICE_RAM_MAP['postgresql'] +
      SERVICE_RAM_MAP['pgadmin'] +
      SERVICE_RAM_MAP['redis'];

    expect(estimate.ramMB).toBe(expectedRAM);
    expect(estimate.containers).toBe(5);
    expect(estimate.diskGB).toBeGreaterThan(0);
  });

  it('should collect correct service IDs for default full install', () => {
    const services = collectAllServices(defaultState);

    expect(services).toContain('traefik');
    expect(services).toContain('gitea');
    expect(services).toContain('postgresql');
    expect(services).toContain('pgadmin');
    expect(services).toContain('redis');
    expect(services).toHaveLength(5);
  });

  it('should list Gitea as default credential target', () => {
    const targets = getCredentialTargets(defaultState);

    // Gitea always gets credentials; pgAdmin also receives them
    expect(targets).toContain('Gitea');
    expect(targets).toContain('pgAdmin');
    // No file server, media, SSH, mail, or filebrowser by default
    expect(targets).not.toContain('Nextcloud');
    expect(targets).not.toContain('Jellyfin');
    expect(targets).not.toContain('SSH Server');
  });
});

// ---------------------------------------------------------------------------
// 2. Full install preset via applyFullInstallDefaults
// ---------------------------------------------------------------------------

describe('Integration: applyFullInstallDefaults produces consistent estimates', () => {
  it('should match default state estimates (full install preset is the default)', () => {
    const baseState = createDefaultWizardState();
    const fullState = applyFullInstallDefaults(baseState);

    const baseEstimate = estimateResources(baseState);
    const fullEstimate = estimateResources(fullState);

    // Both should yield the same since createDefaultWizardState is already full install
    expect(fullEstimate.ramMB).toBe(baseEstimate.ramMB);
    expect(fullEstimate.containers).toBe(baseEstimate.containers);
    expect(fullEstimate.diskGB).toBe(baseEstimate.diskGB);
  });

  it('should restore full install services when applied to a partial install state', () => {
    const partial = applyPartialInstallDefaults(createDefaultWizardState());
    expect(partial.servers.dbServer.enabled).toBe(false);

    const restored = applyFullInstallDefaults(partial);
    expect(restored.servers.dbServer.enabled).toBe(true);
    expect(restored.servers.dbServer.primary).toBe('postgresql');

    const estimate = estimateResources(restored);
    // Should include postgresql + pgadmin + redis again
    expect(estimate.ramMB).toBeGreaterThanOrEqual(
      SERVICE_RAM_MAP['postgresql'] + SERVICE_RAM_MAP['pgadmin'] + SERVICE_RAM_MAP['redis'],
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Partial install → fewer services, lower estimates
// ---------------------------------------------------------------------------

describe('Integration: Partial Install has lower resource estimates', () => {
  let fullState: WizardState;
  let partialState: WizardState;

  beforeEach(() => {
    fullState = createDefaultWizardState();
    partialState = applyPartialInstallDefaults(createDefaultWizardState());
  });

  it('should have fewer containers than full install', () => {
    const fullCount = countSelectedServices(fullState);
    const partialCount = countSelectedServices(partialState);

    expect(partialCount).toBeLessThan(fullCount);
  });

  it('should have lower RAM estimate than full install', () => {
    const fullEstimate = estimateResources(fullState);
    const partialEstimate = estimateResources(partialState);

    expect(partialEstimate.ramMB).toBeLessThan(fullEstimate.ramMB);
  });

  it('should have lower disk estimate than full install', () => {
    const fullEstimate = estimateResources(fullState);
    const partialEstimate = estimateResources(partialState);

    expect(partialEstimate.diskGB).toBeLessThan(fullEstimate.diskGB);
  });

  it('should only include web server and gitea for partial install', () => {
    const services = collectAllServices(partialState);

    // Partial install: traefik + gitea only
    expect(services).toContain('traefik');
    expect(services).toContain('gitea');
    expect(services).not.toContain('postgresql');
    expect(services).not.toContain('pgadmin');
    expect(services).not.toContain('redis');
    expect(services).toHaveLength(2);
  });

  it('should have exactly 2 containers for partial install', () => {
    const estimate = estimateResources(partialState);
    expect(estimate.containers).toBe(2);
  });

  it('should have partial RAM = traefik + gitea only', () => {
    const estimate = estimateResources(partialState);
    const expected = SERVICE_RAM_MAP['traefik'] + SERVICE_RAM_MAP['gitea'];
    expect(estimate.ramMB).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 4. Adding all optional services → RAM/disk increases
// ---------------------------------------------------------------------------

describe('Integration: Enabling all optional services increases estimates', () => {
  it('should have maximum resources when all services are enabled', () => {
    const state = createDefaultWizardState();

    // Enable every optional service
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = {
      enabled: true,
      port: 2222,
      passwordAuth: false,
      sftp: true,
    };
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['nodejs'];
    state.domain.cloudflare = {
      enabled: true,
      tunnelToken: 'test-token',
      tunnelName: 'test-tunnel',
    };

    const estimate = estimateResources(state);
    const defaultEstimate = estimateResources(createDefaultWizardState());

    // All-services estimate must be strictly greater than default
    expect(estimate.ramMB).toBeGreaterThan(defaultEstimate.ramMB);
    expect(estimate.diskGB).toBeGreaterThan(defaultEstimate.diskGB);
    expect(estimate.containers).toBeGreaterThan(defaultEstimate.containers);
  });

  it('should include every enabled service in collectAllServices', () => {
    const state = createDefaultWizardState();

    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = {
      enabled: true,
      port: 2222,
      passwordAuth: false,
      sftp: true,
    };
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['nodejs'];
    state.domain.cloudflare = {
      enabled: true,
      tunnelToken: 'test-token',
      tunnelName: 'test-tunnel',
    };

    const services = collectAllServices(state);

    expect(services).toContain('traefik');
    expect(services).toContain('gitea');
    expect(services).toContain('postgresql');
    expect(services).toContain('pgadmin');
    expect(services).toContain('redis');
    expect(services).toContain('nextcloud');
    expect(services).toContain('jellyfin');
    expect(services).toContain('openssh-server');
    expect(services).toContain('docker-mailserver');
    expect(services).toContain('filebrowser');
    expect(services).toContain('cloudflared');
  });

  it('should list all credential targets when all services are enabled', () => {
    const state = createDefaultWizardState();

    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = {
      enabled: true,
      port: 2222,
      passwordAuth: false,
      sftp: true,
    };
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };

    const targets = getCredentialTargets(state);

    expect(targets).toContain('Gitea');
    expect(targets).toContain('Nextcloud');
    expect(targets).toContain('pgAdmin');
    expect(targets).toContain('Jellyfin');
    expect(targets).toContain('SSH Server');
    expect(targets).toContain('Mail Server');
    expect(targets).toContain('FileBrowser');
  });
});

// ---------------------------------------------------------------------------
// 5. Removing DB server → RAM/disk decreases
// ---------------------------------------------------------------------------

describe('Integration: Removing DB server decreases estimates', () => {
  it('should decrease RAM when DB server is disabled', () => {
    const withDB = createDefaultWizardState();
    const withoutDB = cloneState(withDB);
    withoutDB.servers.dbServer = {
      enabled: false,
      primary: '',
      primaryVersion: '',
      dbName: '',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const estimateWithDB = estimateResources(withDB);
    const estimateWithoutDB = estimateResources(withoutDB);

    // Removing DB should lose: postgresql(120) + pgadmin(128) + redis(12) = 260 MB
    const expectedDrop =
      SERVICE_RAM_MAP['postgresql'] +
      SERVICE_RAM_MAP['pgadmin'] +
      SERVICE_RAM_MAP['redis'];

    expect(estimateWithDB.ramMB - estimateWithoutDB.ramMB).toBe(expectedDrop);
  });

  it('should decrease container count when DB server is disabled', () => {
    const withDB = createDefaultWizardState();
    const withoutDB = cloneState(withDB);
    withoutDB.servers.dbServer = {
      enabled: false,
      primary: '',
      primaryVersion: '',
      dbName: '',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const countWithDB = countSelectedServices(withDB);
    const countWithoutDB = countSelectedServices(withoutDB);

    // Lose postgresql + pgadmin + redis = 3 containers
    expect(countWithDB - countWithoutDB).toBe(3);
  });

  it('should decrease disk when DB server is disabled', () => {
    const withDB = createDefaultWizardState();
    const withoutDB = cloneState(withDB);
    withoutDB.servers.dbServer = {
      enabled: false,
      primary: '',
      primaryVersion: '',
      dbName: '',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const estimateWithDB = estimateResources(withDB);
    const estimateWithoutDB = estimateResources(withoutDB);

    expect(estimateWithDB.diskGB).toBeGreaterThan(estimateWithoutDB.diskGB);
  });

  it('should remove pgAdmin from credential targets when DB is disabled', () => {
    const withDB = createDefaultWizardState();
    const withoutDB = cloneState(withDB);
    withoutDB.servers.dbServer = {
      enabled: false,
      primary: '',
      primaryVersion: '',
      dbName: '',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const targetsWithDB = getCredentialTargets(withDB);
    const targetsWithoutDB = getCredentialTargets(withoutDB);

    expect(targetsWithDB).toContain('pgAdmin');
    expect(targetsWithoutDB).not.toContain('pgAdmin');
  });
});

// ---------------------------------------------------------------------------
// 6. Enable media (jellyfin) → RAM estimate increases by jellyfin's RAM
// ---------------------------------------------------------------------------

describe('Integration: Enabling Jellyfin increases RAM by exact amount', () => {
  it('should increase RAM by jellyfin RAM value when media is enabled', () => {
    const base = createDefaultWizardState();
    const withMedia = cloneState(base);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };

    const baseEstimate = estimateResources(base);
    const mediaEstimate = estimateResources(withMedia);

    expect(mediaEstimate.ramMB - baseEstimate.ramMB).toBe(SERVICE_RAM_MAP['jellyfin']);
  });

  it('should increase container count by 1 when jellyfin is enabled', () => {
    const base = createDefaultWizardState();
    const withMedia = cloneState(base);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };

    const baseCount = countSelectedServices(base);
    const mediaCount = countSelectedServices(withMedia);

    expect(mediaCount - baseCount).toBe(1);
  });

  it('should increase disk by jellyfin disk value', () => {
    const base = createDefaultWizardState();
    const withMedia = cloneState(base);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };

    const baseEstimate = estimateResources(base);
    const mediaEstimate = estimateResources(withMedia);

    const expectedDiskIncrease = SERVICE_DISK_MAP['jellyfin'];
    const actualIncrease = parseFloat(
      (mediaEstimate.diskGB - baseEstimate.diskGB).toFixed(1),
    );
    expect(actualIncrease).toBe(expectedDiskIncrease);
  });

  it('should add Jellyfin to credential targets', () => {
    const base = createDefaultWizardState();
    const withMedia = cloneState(base);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };

    const baseTargets = getCredentialTargets(base);
    const mediaTargets = getCredentialTargets(withMedia);

    expect(baseTargets).not.toContain('Jellyfin');
    expect(mediaTargets).toContain('Jellyfin');
  });

  it('should include jellyfin in collectAllServices', () => {
    const base = createDefaultWizardState();
    const withMedia = cloneState(base);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };

    const baseServices = collectAllServices(base);
    const mediaServices = collectAllServices(withMedia);

    expect(baseServices).not.toContain('jellyfin');
    expect(mediaServices).toContain('jellyfin');
  });
});

// ---------------------------------------------------------------------------
// 7. Multiple components toggled → estimates are sum of individual increases
// ---------------------------------------------------------------------------

describe('Integration: Multiple component toggles produce additive estimates', () => {
  let baseState: WizardState;
  let baseEstimate: ResourceEstimate;

  beforeEach(() => {
    baseState = applyPartialInstallDefaults(createDefaultWizardState());
    baseEstimate = estimateResources(baseState);
  });

  it('should be additive: enabling DB + media = sum of individual increases', () => {
    // Enable DB only
    const withDB = cloneState(baseState);
    withDB.servers.dbServer = {
      enabled: true,
      primary: 'postgresql',
      primaryVersion: '17',
      dbName: 'test_db',
      dbUser: 'test',
      dbPassword: 'pass',
      adminUI: false,
      cache: '',
    };
    const dbEstimate = estimateResources(withDB);
    const dbDelta = dbEstimate.ramMB - baseEstimate.ramMB;

    // Enable media only
    const withMedia = cloneState(baseState);
    withMedia.servers.media = { enabled: true, services: ['jellyfin'] };
    const mediaEstimate = estimateResources(withMedia);
    const mediaDelta = mediaEstimate.ramMB - baseEstimate.ramMB;

    // Enable both DB + media
    const withBoth = cloneState(baseState);
    withBoth.servers.dbServer = {
      enabled: true,
      primary: 'postgresql',
      primaryVersion: '17',
      dbName: 'test_db',
      dbUser: 'test',
      dbPassword: 'pass',
      adminUI: false,
      cache: '',
    };
    withBoth.servers.media = { enabled: true, services: ['jellyfin'] };
    const bothEstimate = estimateResources(withBoth);
    const bothDelta = bothEstimate.ramMB - baseEstimate.ramMB;

    // Additive: dbDelta + mediaDelta === bothDelta
    expect(bothDelta).toBe(dbDelta + mediaDelta);
  });

  it('should be additive: enabling SSH + mail + filebrowser = sum of individual increases', () => {
    // SSH only
    const withSSH = cloneState(baseState);
    withSSH.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    const sshDelta = estimateResources(withSSH).ramMB - baseEstimate.ramMB;

    // Mail only
    const withMail = cloneState(baseState);
    withMail.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    const mailDelta = estimateResources(withMail).ramMB - baseEstimate.ramMB;

    // FileBrowser standalone only
    const withFB = cloneState(baseState);
    withFB.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    const fbDelta = estimateResources(withFB).ramMB - baseEstimate.ramMB;

    // All three
    const withAll = cloneState(baseState);
    withAll.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    withAll.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    withAll.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    const allDelta = estimateResources(withAll).ramMB - baseEstimate.ramMB;

    expect(allDelta).toBe(sshDelta + mailDelta + fbDelta);
  });

  it('should have additive container counts when toggling multiple services', () => {
    const baseCount = countSelectedServices(baseState);

    // Enable file server, media, SSH
    const withAll = cloneState(baseState);
    withAll.servers.fileServer = { enabled: true, service: 'nextcloud' };
    withAll.servers.media = { enabled: true, services: ['jellyfin'] };
    withAll.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };

    const allCount = countSelectedServices(withAll);

    // +1 (nextcloud) + 1 (jellyfin) + 1 (ssh) = +3
    expect(allCount - baseCount).toBe(3);
  });

  it('should have additive disk estimates across multiple toggles', () => {
    const baseDisk = baseEstimate.diskGB;

    // Enable nextcloud + jellyfin + openssh
    const withAll = cloneState(baseState);
    withAll.servers.fileServer = { enabled: true, service: 'nextcloud' };
    withAll.servers.media = { enabled: true, services: ['jellyfin'] };
    withAll.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };

    const allDisk = estimateResources(withAll).diskGB;

    const expectedIncrease =
      SERVICE_DISK_MAP['nextcloud'] +
      SERVICE_DISK_MAP['jellyfin'] +
      SERVICE_DISK_MAP['openssh-server'];

    const actualIncrease = parseFloat((allDisk - baseDisk).toFixed(2));
    expect(actualIncrease).toBeCloseTo(expectedIncrease, 0);
  });
});

// ---------------------------------------------------------------------------
// 8. collectAllServices count matches countSelectedServices
// ---------------------------------------------------------------------------

describe('Integration: collectAllServices length matches countSelectedServices', () => {
  it('should match for default full install', () => {
    const state = createDefaultWizardState();
    const services = collectAllServices(state);
    const count = countSelectedServices(state);
    expect(services.length).toBe(count);
  });

  it('should match for partial install', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const services = collectAllServices(state);
    const count = countSelectedServices(state);
    expect(services.length).toBe(count);
  });

  it('should match when all optional services are enabled (without tunnel or app server)', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    // Note: app server is excluded here because collectAllServices does NOT
    // include the generic 'app' container (user-deployed app), while
    // countSelectedServices does count it. This is by design: the app container
    // is not a pre-defined docker-compose service.

    const services = collectAllServices(state);
    const count = countSelectedServices(state);

    // Without tunnel and without app server, these should match.
    expect(services.length).toBe(count);
  });

  it('should differ by 1 when app server is enabled (app not in collectAllServices)', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['nodejs'];

    const services = collectAllServices(state);
    const count = countSelectedServices(state);

    // collectAllServices does not include generic 'app' container,
    // but countSelectedServices does count it.
    expect(count).toBe(services.length + 1);
    expect(services).not.toContain('app');
  });

  it('should match for each server toggled individually', () => {
    const configs: Array<{ label: string; patch: (s: WizardState) => void }> = [
      {
        label: 'fileServer=nextcloud',
        patch: (s) => { s.servers.fileServer = { enabled: true, service: 'nextcloud' }; },
      },
      {
        label: 'fileServer=minio',
        patch: (s) => { s.servers.fileServer = { enabled: true, service: 'minio' }; },
      },
      {
        label: 'media=jellyfin',
        patch: (s) => { s.servers.media = { enabled: true, services: ['jellyfin'] }; },
      },
      {
        label: 'sshServer',
        patch: (s) => {
          s.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
        },
      },
      {
        label: 'mailServer',
        patch: (s) => {
          s.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
        },
      },
      {
        label: 'fileBrowser=standalone',
        patch: (s) => {
          s.servers.fileBrowser = { enabled: true, mode: 'standalone' };
        },
      },
    ];

    for (const { label, patch } of configs) {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      patch(state);

      const services = collectAllServices(state);
      const count = countSelectedServices(state);

      expect(services.length).toBe(count);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. estimateResources.containers matches countSelectedServices
//    (except when Cloudflare Tunnel is enabled — estimateResources counts it,
//     but countSelectedServices does not)
// ---------------------------------------------------------------------------

describe('Integration: estimateResources.containers vs countSelectedServices', () => {
  it('should be equal when Cloudflare Tunnel is disabled', () => {
    const state = createDefaultWizardState();
    state.domain.cloudflare.enabled = false;

    const estimate = estimateResources(state);
    const count = countSelectedServices(state);

    expect(estimate.containers).toBe(count);
  });

  it('should differ by 1 when Cloudflare Tunnel is enabled', () => {
    const state = createDefaultWizardState();
    state.domain.cloudflare = {
      enabled: true,
      tunnelToken: 'tok',
      tunnelName: 'tunnel',
    };

    const estimate = estimateResources(state);
    const count = countSelectedServices(state);

    // estimateResources includes cloudflared, countSelectedServices does not
    expect(estimate.containers).toBe(count + 1);
  });
});

// ---------------------------------------------------------------------------
// 10. Credential targets with various service combinations
// ---------------------------------------------------------------------------

describe('Integration: Credential targets across service combinations', () => {
  it('should always include Gitea regardless of other services', () => {
    const minimal = applyPartialInstallDefaults(createDefaultWizardState());
    expect(getCredentialTargets(minimal)).toContain('Gitea');

    const full = createDefaultWizardState();
    expect(getCredentialTargets(full)).toContain('Gitea');
  });

  it('should include Nextcloud when file server is nextcloud', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };

    const targets = getCredentialTargets(state);
    expect(targets).toContain('Nextcloud');
    expect(targets).not.toContain('MinIO');
  });

  it('should include MinIO when file server is minio', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'minio' };

    const targets = getCredentialTargets(state);
    expect(targets).toContain('MinIO');
    expect(targets).not.toContain('Nextcloud');
  });

  it('should not include pgAdmin when DB is sqlite', () => {
    const state = createDefaultWizardState();
    state.servers.dbServer = {
      enabled: true,
      primary: 'sqlite',
      primaryVersion: '3',
      dbName: 'brewnet.db',
      dbUser: '',
      dbPassword: '',
      adminUI: true, // even with adminUI true, sqlite should not trigger pgAdmin
      cache: '',
    };

    const targets = getCredentialTargets(state);
    expect(targets).not.toContain('pgAdmin');
  });

  it('should include pgAdmin when DB is postgresql with adminUI enabled', () => {
    const state = createDefaultWizardState();
    // Default state already has postgresql + adminUI: true
    const targets = getCredentialTargets(state);
    expect(targets).toContain('pgAdmin');
  });

  it('should not include pgAdmin when adminUI is disabled', () => {
    const state = createDefaultWizardState();
    state.servers.dbServer.adminUI = false;

    const targets = getCredentialTargets(state);
    expect(targets).not.toContain('pgAdmin');
  });

  it('should include FileBrowser in credential targets when enabled in directory mode', () => {
    const state = createDefaultWizardState();
    state.servers.fileBrowser = { enabled: true, mode: 'directory' };

    const targets = getCredentialTargets(state);
    expect(targets).toContain('FileBrowser');
  });

  it('should grow credential targets as services are added', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const initialCount = getCredentialTargets(state).length;

    // Add nextcloud
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    const afterNextcloud = getCredentialTargets(state).length;
    expect(afterNextcloud).toBe(initialCount + 1);

    // Add SSH
    state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    const afterSSH = getCredentialTargets(state).length;
    expect(afterSSH).toBe(afterNextcloud + 1);

    // Add jellyfin
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    const afterMedia = getCredentialTargets(state).length;
    expect(afterMedia).toBe(afterSSH + 1);
  });
});

// ---------------------------------------------------------------------------
// 11. Sequential toggle simulation (simulates wizard user interaction)
// ---------------------------------------------------------------------------

describe('Integration: Sequential component toggling simulates wizard flow', () => {
  it('should track cumulative RAM as user enables services one by one', () => {
    // Start from partial install (minimal: traefik + gitea)
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const ramHistory: number[] = [];

    // Step 1: baseline
    ramHistory.push(estimateResources(state).ramMB);

    // Step 2: enable PostgreSQL
    state.servers.dbServer = {
      enabled: true,
      primary: 'postgresql',
      primaryVersion: '17',
      dbName: 'mydb',
      dbUser: 'user',
      dbPassword: 'pass',
      adminUI: false,
      cache: '',
    };
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[1]).toBe(ramHistory[0] + SERVICE_RAM_MAP['postgresql']);

    // Step 3: enable Redis cache
    state.servers.dbServer.cache = 'redis';
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[2]).toBe(ramHistory[1] + SERVICE_RAM_MAP['redis']);

    // Step 4: enable pgAdmin
    state.servers.dbServer.adminUI = true;
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[3]).toBe(ramHistory[2] + SERVICE_RAM_MAP['pgadmin']);

    // Step 5: enable Nextcloud file server
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[4]).toBe(ramHistory[3] + SERVICE_RAM_MAP['nextcloud']);

    // Step 6: enable Jellyfin
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[5]).toBe(ramHistory[4] + SERVICE_RAM_MAP['jellyfin']);

    // Step 7: enable SSH
    state.servers.sshServer = {
      enabled: true,
      port: 2222,
      passwordAuth: false,
      sftp: true,
    };
    ramHistory.push(estimateResources(state).ramMB);
    expect(ramHistory[6]).toBe(ramHistory[5] + SERVICE_RAM_MAP['openssh-server']);

    // Verify monotonic increase
    for (let i = 1; i < ramHistory.length; i++) {
      expect(ramHistory[i]).toBeGreaterThan(ramHistory[i - 1]);
    }
  });

  it('should track cumulative containers as user enables services one by one', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const counts: number[] = [];

    // Baseline: traefik + gitea = 2
    counts.push(countSelectedServices(state));
    expect(counts[0]).toBe(2);

    // +postgresql
    state.servers.dbServer = {
      enabled: true,
      primary: 'postgresql',
      primaryVersion: '17',
      dbName: 'mydb',
      dbUser: 'user',
      dbPassword: 'pass',
      adminUI: false,
      cache: '',
    };
    counts.push(countSelectedServices(state));
    expect(counts[1]).toBe(3);

    // +redis
    state.servers.dbServer.cache = 'redis';
    counts.push(countSelectedServices(state));
    expect(counts[2]).toBe(4);

    // +pgadmin
    state.servers.dbServer.adminUI = true;
    counts.push(countSelectedServices(state));
    expect(counts[3]).toBe(5);

    // +nextcloud
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    counts.push(countSelectedServices(state));
    expect(counts[4]).toBe(6);

    // +jellyfin
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    counts.push(countSelectedServices(state));
    expect(counts[5]).toBe(7);

    // +SSH
    state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    counts.push(countSelectedServices(state));
    expect(counts[6]).toBe(8);

    // +mail
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    counts.push(countSelectedServices(state));
    expect(counts[7]).toBe(9);

    // +filebrowser standalone
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    counts.push(countSelectedServices(state));
    expect(counts[8]).toBe(10);

    // +app server
    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['nodejs'];
    counts.push(countSelectedServices(state));
    expect(counts[9]).toBe(11);
  });

  it('should decrease RAM when a service is toggled off', () => {
    const state = createDefaultWizardState();
    state.servers.media = { enabled: true, services: ['jellyfin'] };

    const beforeRAM = estimateResources(state).ramMB;

    // Disable media
    state.servers.media = { enabled: false, services: [] };

    const afterRAM = estimateResources(state).ramMB;

    expect(afterRAM).toBe(beforeRAM - SERVICE_RAM_MAP['jellyfin']);
  });
});

// ---------------------------------------------------------------------------
// 12. Switching service variants (e.g., nginx ↔ traefik, postgresql ↔ mysql)
// ---------------------------------------------------------------------------

describe('Integration: Switching service variants updates estimates', () => {
  it('should reflect different RAM when switching web server from traefik to nginx', () => {
    const state = createDefaultWizardState();
    const traefikEstimate = estimateResources(state);

    state.servers.webServer = { enabled: true, service: 'nginx' };
    const nginxEstimate = estimateResources(state);

    const expectedDiff = SERVICE_RAM_MAP['traefik'] - SERVICE_RAM_MAP['nginx'];
    expect(traefikEstimate.ramMB - nginxEstimate.ramMB).toBe(expectedDiff);
  });

  it('should reflect different RAM when switching web server from traefik to caddy', () => {
    const state = createDefaultWizardState();
    const traefikEstimate = estimateResources(state);

    state.servers.webServer = { enabled: true, service: 'caddy' };
    const caddyEstimate = estimateResources(state);

    const expectedDiff = SERVICE_RAM_MAP['traefik'] - SERVICE_RAM_MAP['caddy'];
    expect(traefikEstimate.ramMB - caddyEstimate.ramMB).toBe(expectedDiff);
  });

  it('should reflect different RAM when switching DB from postgresql to mysql', () => {
    const state = createDefaultWizardState();
    const pgEstimate = estimateResources(state);

    state.servers.dbServer.primary = 'mysql';
    const mysqlEstimate = estimateResources(state);

    const expectedDiff = SERVICE_RAM_MAP['postgresql'] - SERVICE_RAM_MAP['mysql'];
    expect(pgEstimate.ramMB - mysqlEstimate.ramMB).toBe(expectedDiff);
  });

  it('should reflect different RAM when switching cache from redis to keydb', () => {
    const state = createDefaultWizardState();
    const redisEstimate = estimateResources(state);

    state.servers.dbServer.cache = 'keydb';
    const keydbEstimate = estimateResources(state);

    const expectedDiff = SERVICE_RAM_MAP['redis'] - SERVICE_RAM_MAP['keydb'];
    expect(redisEstimate.ramMB - keydbEstimate.ramMB).toBe(expectedDiff);
  });

  it('should reflect different RAM when switching file server from nextcloud to minio', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    const ncEstimate = estimateResources(state);

    state.servers.fileServer = { enabled: true, service: 'minio' };
    const minioEstimate = estimateResources(state);

    const expectedDiff = SERVICE_RAM_MAP['nextcloud'] - SERVICE_RAM_MAP['minio'];
    expect(ncEstimate.ramMB - minioEstimate.ramMB).toBe(expectedDiff);
  });

  it('should update collectAllServices when switching variants', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };

    let services = collectAllServices(state);
    expect(services).toContain('nextcloud');
    expect(services).not.toContain('minio');

    state.servers.fileServer.service = 'minio';
    services = collectAllServices(state);
    expect(services).toContain('minio');
    expect(services).not.toContain('nextcloud');
  });
});

// ---------------------------------------------------------------------------
// 13. Docker image name resolution with service registry
// ---------------------------------------------------------------------------

describe('Integration: getImageName matches service registry', () => {
  it('should return known image for all registered services', () => {
    const serviceIds = getAllServiceIds();

    for (const id of serviceIds) {
      const image = getImageName(id);
      expect(image).toBeTruthy();
      expect(image).not.toBe(`${id}:latest`); // Should be a specific image, not fallback
    }
  });

  it('should return fallback for unknown service IDs', () => {
    const image = getImageName('unknown-service');
    expect(image).toBe('unknown-service:latest');
  });

  it('should return images for all services in a fully-enabled state', () => {
    const state = createDefaultWizardState();
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };
    state.servers.mailServer = { enabled: true, service: 'docker-mailserver' };
    state.servers.fileBrowser = { enabled: true, mode: 'standalone' };
    state.domain.cloudflare = { enabled: true, tunnelToken: 'tok', tunnelName: 'tun' };

    const services = collectAllServices(state);
    for (const svcId of services) {
      const image = getImageName(svcId);
      expect(image).toBeTruthy();
      // Every service used in collectAllServices should have a known image
      expect(image).not.toBe(`${svcId}:latest`);
    }
  });
});

// ---------------------------------------------------------------------------
// 14. RAM/disk format correctness
// ---------------------------------------------------------------------------

describe('Integration: ResourceEstimate format correctness', () => {
  it('should format ramGB as a human-readable string', () => {
    const state = createDefaultWizardState();
    const estimate = estimateResources(state);

    // ramGB should match pattern like "0.5 GB" or "1.2 GB"
    expect(estimate.ramGB).toMatch(/^\d+\.\d+ GB$/);
  });

  it('should have ramGB consistent with ramMB', () => {
    const state = createDefaultWizardState();
    const estimate = estimateResources(state);

    const expectedGB = (estimate.ramMB / 1024).toFixed(1);
    expect(estimate.ramGB).toBe(`${expectedGB} GB`);
  });

  it('should have non-negative diskGB', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const estimate = estimateResources(state);

    expect(estimate.diskGB).toBeGreaterThan(0);
  });

  it('should have integer ramMB', () => {
    const state = createDefaultWizardState();

    // Enable everything to test rounding
    state.servers.fileServer = { enabled: true, service: 'nextcloud' };
    state.servers.media = { enabled: true, services: ['jellyfin'] };
    state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };

    const estimate = estimateResources(state);
    expect(Number.isInteger(estimate.ramMB)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 15. Edge cases: FileBrowser directory mode vs standalone mode
// ---------------------------------------------------------------------------

describe('Integration: FileBrowser mode affects container count', () => {
  it('should not add a container for FileBrowser in directory mode', () => {
    const base = createDefaultWizardState();
    const baseCount = countSelectedServices(base);

    const withDirectoryFB = cloneState(base);
    withDirectoryFB.servers.fileBrowser = { enabled: true, mode: 'directory' };

    const directoryCount = countSelectedServices(withDirectoryFB);

    // Directory mode is served by the web server, no extra container
    expect(directoryCount).toBe(baseCount);
  });

  it('should add a container for FileBrowser in standalone mode', () => {
    const base = createDefaultWizardState();
    const baseCount = countSelectedServices(base);

    const withStandaloneFB = cloneState(base);
    withStandaloneFB.servers.fileBrowser = { enabled: true, mode: 'standalone' };

    const standaloneCount = countSelectedServices(withStandaloneFB);

    expect(standaloneCount).toBe(baseCount + 1);
  });

  it('should not add RAM for FileBrowser in directory mode', () => {
    const base = createDefaultWizardState();
    const baseRAM = estimateResources(base).ramMB;

    const withDirectoryFB = cloneState(base);
    withDirectoryFB.servers.fileBrowser = { enabled: true, mode: 'directory' };

    const directoryRAM = estimateResources(withDirectoryFB).ramMB;

    expect(directoryRAM).toBe(baseRAM);
  });

  it('should add RAM for FileBrowser in standalone mode', () => {
    const base = createDefaultWizardState();
    const baseRAM = estimateResources(base).ramMB;

    const withStandaloneFB = cloneState(base);
    withStandaloneFB.servers.fileBrowser = { enabled: true, mode: 'standalone' };

    const standaloneRAM = estimateResources(withStandaloneFB).ramMB;

    expect(standaloneRAM).toBe(baseRAM + SERVICE_RAM_MAP['filebrowser']);
  });
});

// ---------------------------------------------------------------------------
// 16. App server requires languages in devStack
// ---------------------------------------------------------------------------

describe('Integration: App server resource estimation requires devStack languages', () => {
  it('should not count app server if enabled but no languages selected', () => {
    const state = createDefaultWizardState();
    state.servers.appServer = { enabled: true };
    state.devStack.languages = []; // No languages

    const baseCount = countSelectedServices(createDefaultWizardState());
    const appCount = countSelectedServices(state);

    expect(appCount).toBe(baseCount);
  });

  it('should count app server when enabled with languages selected', () => {
    const state = createDefaultWizardState();
    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['nodejs'];

    const baseCount = countSelectedServices(createDefaultWizardState());
    const appCount = countSelectedServices(state);

    expect(appCount).toBe(baseCount + 1);
  });

  it('should add app RAM when enabled with languages', () => {
    const state = createDefaultWizardState();
    const baseRAM = estimateResources(state).ramMB;

    state.servers.appServer = { enabled: true };
    state.devStack.languages = ['python'];
    const appRAM = estimateResources(state).ramMB;

    expect(appRAM).toBe(baseRAM + SERVICE_RAM_MAP['app']);
  });

  it('should not add app RAM when enabled without languages', () => {
    const state = createDefaultWizardState();
    const baseRAM = estimateResources(state).ramMB;

    state.servers.appServer = { enabled: true };
    state.devStack.languages = [];
    const appRAM = estimateResources(state).ramMB;

    expect(appRAM).toBe(baseRAM);
  });
});

// ---------------------------------------------------------------------------
// 17. Cloudflare Tunnel impact on resource estimates
// ---------------------------------------------------------------------------

describe('Integration: Cloudflare Tunnel resource estimation', () => {
  it('should add cloudflared resources when tunnel is enabled', () => {
    const state = createDefaultWizardState();
    const baseEstimate = estimateResources(state);

    state.domain.cloudflare = {
      enabled: true,
      tunnelToken: 'test-token',
      tunnelName: 'test-tunnel',
    };
    const tunnelEstimate = estimateResources(state);

    expect(tunnelEstimate.ramMB).toBe(baseEstimate.ramMB + SERVICE_RAM_MAP['cloudflared']);
    expect(tunnelEstimate.containers).toBe(baseEstimate.containers + 1);
  });

  it('should include cloudflared in collectAllServices when tunnel is enabled', () => {
    const state = createDefaultWizardState();
    state.domain.cloudflare = {
      enabled: true,
      tunnelToken: 'test-token',
      tunnelName: 'test-tunnel',
    };

    const services = collectAllServices(state);
    expect(services).toContain('cloudflared');
  });

  it('should not include cloudflared when tunnel is disabled', () => {
    const state = createDefaultWizardState();
    state.domain.cloudflare.enabled = false;

    const services = collectAllServices(state);
    expect(services).not.toContain('cloudflared');
  });
});

// ---------------------------------------------------------------------------
// 18. SQLite: zero-container DB (no docker container needed)
// ---------------------------------------------------------------------------

describe('Integration: SQLite DB does not add container or RAM', () => {
  it('should not add a DB container when primary is sqlite', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const baseCount = countSelectedServices(state);

    state.servers.dbServer = {
      enabled: true,
      primary: 'sqlite',
      primaryVersion: '3',
      dbName: 'brewnet.db',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const sqliteCount = countSelectedServices(state);
    expect(sqliteCount).toBe(baseCount);
  });

  it('should add zero RAM for sqlite (mapped as 0)', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const baseRAM = estimateResources(state).ramMB;

    state.servers.dbServer = {
      enabled: true,
      primary: 'sqlite',
      primaryVersion: '3',
      dbName: 'brewnet.db',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: '',
    };

    const sqliteRAM = estimateResources(state).ramMB;
    expect(sqliteRAM).toBe(baseRAM);
  });

  it('should add a cache container even when primary is sqlite', () => {
    const state = applyPartialInstallDefaults(createDefaultWizardState());
    const baseCount = countSelectedServices(state);

    state.servers.dbServer = {
      enabled: true,
      primary: 'sqlite',
      primaryVersion: '3',
      dbName: 'brewnet.db',
      dbUser: '',
      dbPassword: '',
      adminUI: false,
      cache: 'redis',
    };

    const sqliteCacheCount = countSelectedServices(state);
    // Only redis cache added (sqlite itself is not a container)
    expect(sqliteCacheCount).toBe(baseCount + 1);
  });
});
