/**
 * T091 — Add/Remove Service Flow Integration Tests
 *
 * Tests the service management operations for adding and removing services
 * from an existing Brewnet project's docker-compose.yml:
 *
 *   - Adding a service to compose (YAML updated, image correct, labels added)
 *   - Backup creation before any compose modification
 *   - Duplicate service detection
 *   - Removing a service (with and without data purge)
 *   - Service ID validation against SERVICE_REGISTRY
 *   - Compose YAML integrity after add/remove operations
 *
 * Test case references (from TEST_CASES.md):
 *   TC-09-03: Add service flow (compose update, image, labels, backup)
 *   TC-09-04: Duplicate detection (service already exists)
 *   TC-09-05: Remove service prompt (removeService called)
 *   TC-09-06: Remove with keep-data (volumes preserved)
 *   TC-09-07: Remove with purge (volumes removed)
 *
 * Approach: TDD — the module `packages/cli/src/services/service-manager.ts`
 * does NOT exist yet. These tests define the expected behavior and will fail
 * until the implementation is created.
 *
 * @module tests/integration/service-management
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

import {
  addService,
  removeService,
  isServiceInCompose,
} from '../../packages/cli/src/services/service-manager.js';

import {
  getServiceDefinition,
  SERVICE_REGISTRY,
} from '../../packages/cli/src/config/services.js';

import { DOCKER_COMPOSE_FILENAME } from '../../packages/shared/src/utils/constants.js';

// ---------------------------------------------------------------------------
// Types (mirrors planned compose structure from compose-generator.ts)
// ---------------------------------------------------------------------------

interface ComposeService {
  image: string;
  container_name?: string;
  restart?: string;
  networks?: string[];
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  labels?: Record<string, string>;
  depends_on?: string[];
  healthcheck?: Record<string, unknown>;
}

interface ComposeFile {
  version?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

/** Result shape expected from addService / removeService */
interface ServiceOperationResult {
  success: boolean;
  composePath: string;
  backupPath?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a unique temporary directory for test isolation.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'brewnet-svc-mgmt-'));
}

/**
 * Generate a minimal but valid docker-compose.yml for testing.
 * Includes traefik (web server) and gitea (git server) as the baseline.
 */
function createBaseComposeFile(projectPath: string): string {
  const compose: ComposeFile = {
    version: '3.8',
    services: {
      traefik: {
        image: 'traefik:v3.0',
        container_name: 'brewnet-traefik',
        restart: 'unless-stopped',
        networks: ['brewnet'],
        ports: ['80:80', '443:443', '8080:8080'],
        volumes: [
          '/var/run/docker.sock:/var/run/docker.sock:ro',
          'brewnet_traefik_certs:/letsencrypt',
        ],
        labels: {
          'traefik.enable': 'true',
          'traefik.http.routers.traefik-dashboard.rule': 'Host(`traefik.myserver.example.com`)',
          'traefik.http.routers.traefik-dashboard.entrypoints': 'websecure',
          'traefik.http.routers.traefik-dashboard.tls.certresolver': 'letsencrypt',
          'traefik.http.routers.traefik-dashboard.service': 'api@internal',
        },
      },
      gitea: {
        image: 'gitea/gitea:latest',
        container_name: 'brewnet-gitea',
        restart: 'unless-stopped',
        networks: ['brewnet', 'brewnet-internal'],
        ports: ['3000:3000', '3022:22'],
        volumes: ['brewnet_gitea_data:/data'],
        labels: {
          'traefik.enable': 'true',
          'traefik.http.routers.gitea.rule': 'Host(`git.myserver.example.com`)',
          'traefik.http.routers.gitea.entrypoints': 'websecure',
          'traefik.http.routers.gitea.tls.certresolver': 'letsencrypt',
          'traefik.http.services.gitea.loadbalancer.server.port': '3000',
        },
      },
    },
    networks: {
      brewnet: { external: true },
      'brewnet-internal': { internal: true },
    },
  };

  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);
  const yamlContent = yaml.dump(compose, { indent: 2, lineWidth: 120, noRefs: true });
  writeFileSync(composePath, yamlContent, 'utf-8');
  return composePath;
}

/**
 * Parse a docker-compose.yml file back into a ComposeFile object.
 */
function parseComposeFile(composePath: string): ComposeFile {
  const content = readFileSync(composePath, 'utf-8');
  return yaml.load(content) as ComposeFile;
}

/**
 * Create a compose file that already contains a specific service.
 */
function createComposeWithService(
  projectPath: string,
  serviceId: string,
  serviceImage: string,
): string {
  const composePath = createBaseComposeFile(projectPath);
  const compose = parseComposeFile(composePath);

  compose.services[serviceId] = {
    image: serviceImage,
    container_name: `brewnet-${serviceId}`,
    restart: 'unless-stopped',
    networks: ['brewnet'],
  };

  const yamlContent = yaml.dump(compose, { indent: 2, lineWidth: 120, noRefs: true });
  writeFileSync(composePath, yamlContent, 'utf-8');
  return composePath;
}

/**
 * Create a compose file with a service that has named volumes.
 */
function createComposeWithServiceAndVolumes(
  projectPath: string,
  serviceId: string,
  serviceImage: string,
  volumes: string[],
): string {
  const composePath = createBaseComposeFile(projectPath);
  const compose = parseComposeFile(composePath);

  compose.services[serviceId] = {
    image: serviceImage,
    container_name: `brewnet-${serviceId}`,
    restart: 'unless-stopped',
    networks: ['brewnet'],
    volumes,
  };

  // Also register named volumes at the top level
  if (!compose.volumes) {
    compose.volumes = {};
  }
  for (const vol of volumes) {
    const namedVolume = vol.split(':')[0];
    if (namedVolume && !namedVolume.startsWith('/') && !namedVolume.startsWith('.')) {
      compose.volumes[namedVolume] = null;
    }
  }

  const yamlContent = yaml.dump(compose, { indent: 2, lineWidth: 120, noRefs: true });
  writeFileSync(composePath, yamlContent, 'utf-8');
  return composePath;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T091 — Add/Remove Service Flow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // =========================================================================
  // TC-09-03: Add service flow
  // =========================================================================

  describe('TC-09-03: Add service flow', () => {
    it('adding jellyfin updates compose YAML with a jellyfin service block', async () => {
      const composePath = createBaseComposeFile(tempDir);

      const result: ServiceOperationResult = await addService('jellyfin', tempDir);

      expect(result.success).toBe(true);

      const compose = parseComposeFile(composePath);
      expect(compose.services).toHaveProperty('jellyfin');
      expect(compose.services['jellyfin']).toBeDefined();
    });

    it('added service has the correct image from SERVICE_REGISTRY', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      const jellyfinDef = getServiceDefinition('jellyfin');
      expect(jellyfinDef).toBeDefined();
      expect(compose.services['jellyfin'].image).toBe(jellyfinDef!.image);
    });

    it('added service with a subdomain has Traefik routing labels', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);
      const labels = compose.services['jellyfin'].labels;

      expect(labels).toBeDefined();
      expect(labels!['traefik.enable']).toBe('true');
      // Jellyfin's subdomain is 'jellyfin', so the router rule should contain it
      expect(labels![`traefik.http.routers.jellyfin.rule`]).toContain('jellyfin');
      expect(labels![`traefik.http.services.jellyfin.loadbalancer.server.port`]).toBe('8096');
    });

    it('docker-compose.yml backup is created before modification', async () => {
      createBaseComposeFile(tempDir);

      const result: ServiceOperationResult = await addService('jellyfin', tempDir);

      // The operation should create a backup and return its path
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);

      // Backup should contain the original content (without jellyfin)
      const backupCompose = parseComposeFile(result.backupPath!);
      expect(backupCompose.services).not.toHaveProperty('jellyfin');
      expect(backupCompose.services).toHaveProperty('traefik');
      expect(backupCompose.services).toHaveProperty('gitea');
    });
  });

  // =========================================================================
  // TC-09-04: Duplicate detection
  // =========================================================================

  describe('TC-09-04: Duplicate service detection', () => {
    it('adding a service already in compose returns an error with "already exists"', async () => {
      createComposeWithService(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest');

      const result: ServiceOperationResult = await addService('jellyfin', tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.toLowerCase()).toContain('already exists');
    });

    it('error message includes the service name', async () => {
      createComposeWithService(tempDir, 'nextcloud', 'nextcloud:29-apache');

      const result: ServiceOperationResult = await addService('nextcloud', tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('nextcloud');
    });
  });

  // =========================================================================
  // TC-09-05: Remove service (basic)
  // =========================================================================

  describe('TC-09-05: Remove service is called', () => {
    it('removeService removes the specified service from compose', async () => {
      createComposeWithService(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest');

      const result: ServiceOperationResult = await removeService('jellyfin', tempDir, {});

      expect(result.success).toBe(true);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);
      expect(compose.services).not.toHaveProperty('jellyfin');
    });
  });

  // =========================================================================
  // TC-09-06: Remove with keep-data (no purge)
  // =========================================================================

  describe('TC-09-06: Remove without purge — volumes preserved', () => {
    it('remove without purge removes service from compose but volumes remain in YAML', async () => {
      const volumes = [
        'brewnet_jellyfin_config:/config',
        'brewnet_jellyfin_media:/media',
      ];
      createComposeWithServiceAndVolumes(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest', volumes);

      const result: ServiceOperationResult = await removeService('jellyfin', tempDir, { purge: false });

      expect(result.success).toBe(true);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      // Service should be gone
      expect(compose.services).not.toHaveProperty('jellyfin');

      // Named volumes should still be present at top-level (data preserved)
      if (compose.volumes) {
        expect(compose.volumes).toHaveProperty('brewnet_jellyfin_config');
        expect(compose.volumes).toHaveProperty('brewnet_jellyfin_media');
      }
    });

    it('backup of compose is created before removal', async () => {
      createComposeWithService(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest');

      const result: ServiceOperationResult = await removeService('jellyfin', tempDir, {});

      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);

      // Backup should contain the original content (with jellyfin)
      const backupCompose = parseComposeFile(result.backupPath!);
      expect(backupCompose.services).toHaveProperty('jellyfin');
    });
  });

  // =========================================================================
  // TC-09-07: Remove with purge — volumes also removed
  // =========================================================================

  describe('TC-09-07: Remove with purge — service and volumes removed', () => {
    it('remove with purge=true removes service AND associated volume entries from compose', async () => {
      const volumes = [
        'brewnet_jellyfin_config:/config',
        'brewnet_jellyfin_media:/media',
      ];
      createComposeWithServiceAndVolumes(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest', volumes);

      const result: ServiceOperationResult = await removeService('jellyfin', tempDir, { purge: true });

      expect(result.success).toBe(true);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      // Service should be gone
      expect(compose.services).not.toHaveProperty('jellyfin');

      // Named volumes should also be removed
      if (compose.volumes) {
        expect(compose.volumes).not.toHaveProperty('brewnet_jellyfin_config');
        expect(compose.volumes).not.toHaveProperty('brewnet_jellyfin_media');
      }
    });
  });

  // =========================================================================
  // Service validation
  // =========================================================================

  describe('Service ID validation', () => {
    it('invalid service ID returns an error', async () => {
      createBaseComposeFile(tempDir);

      const result: ServiceOperationResult = await addService('nonexistent-service', tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('valid service ID is found in SERVICE_REGISTRY', () => {
      const validIds = ['jellyfin', 'nextcloud', 'minio', 'redis', 'postgresql', 'mysql'];

      for (const id of validIds) {
        const def = getServiceDefinition(id);
        expect(def).toBeDefined();
        expect(def!.id).toBe(id);
        expect(def!.image).toBeTruthy();
      }
    });
  });

  // =========================================================================
  // isServiceInCompose utility
  // =========================================================================

  describe('isServiceInCompose utility', () => {
    it('returns true when service exists in compose', () => {
      const composePath = createComposeWithService(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest');

      const result = isServiceInCompose('jellyfin', composePath);

      expect(result).toBe(true);
    });

    it('returns false when service does not exist in compose', () => {
      const composePath = createBaseComposeFile(tempDir);

      const result = isServiceInCompose('jellyfin', composePath);

      expect(result).toBe(false);
    });

    it('returns true for base services (traefik, gitea)', () => {
      const composePath = createBaseComposeFile(tempDir);

      expect(isServiceInCompose('traefik', composePath)).toBe(true);
      expect(isServiceInCompose('gitea', composePath)).toBe(true);
    });

    it('returns false for a service not present in compose', () => {
      const composePath = createBaseComposeFile(tempDir);

      expect(isServiceInCompose('nextcloud', composePath)).toBe(false);
      expect(isServiceInCompose('minio', composePath)).toBe(false);
      expect(isServiceInCompose('openssh-server', composePath)).toBe(false);
    });
  });

  // =========================================================================
  // Compose update integrity
  // =========================================================================

  describe('Compose YAML integrity after operations', () => {
    it('after adding a service, compose YAML is still valid (parseable)', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const content = readFileSync(composePath, 'utf-8');

      // YAML parsing should not throw
      expect(() => yaml.load(content)).not.toThrow();

      const compose = yaml.load(content) as ComposeFile;
      expect(compose.services).toBeDefined();
      expect(typeof compose.services).toBe('object');
    });

    it('after removing a service, compose YAML is still valid (parseable)', async () => {
      createComposeWithService(tempDir, 'jellyfin', 'jellyfin/jellyfin:latest');

      await removeService('jellyfin', tempDir, {});

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const content = readFileSync(composePath, 'utf-8');

      expect(() => yaml.load(content)).not.toThrow();

      const compose = yaml.load(content) as ComposeFile;
      expect(compose.services).toBeDefined();
      expect(typeof compose.services).toBe('object');
    });

    it('adding a service preserves existing services in compose', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      // Original services should still be present
      expect(compose.services).toHaveProperty('traefik');
      expect(compose.services).toHaveProperty('gitea');

      // New service should also be present
      expect(compose.services).toHaveProperty('jellyfin');

      // Verify original service definitions are not corrupted
      expect(compose.services['traefik'].image).toBe('traefik:v3.0');
      expect(compose.services['gitea'].image).toBe('gitea/gitea:latest');
    });
  });

  // =========================================================================
  // Edge cases and additional scenarios
  // =========================================================================

  describe('Edge cases', () => {
    it('removing a service that is not in compose returns an error', async () => {
      createBaseComposeFile(tempDir);

      const result: ServiceOperationResult = await removeService('jellyfin', tempDir, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('adding a service when compose file does not exist returns an error', async () => {
      // tempDir exists but has no compose file
      const result: ServiceOperationResult = await addService('jellyfin', tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('added service has networks from SERVICE_REGISTRY', async () => {
      createBaseComposeFile(tempDir);

      await addService('nextcloud', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      const nextcloudDef = getServiceDefinition('nextcloud');
      expect(nextcloudDef).toBeDefined();
      expect(compose.services['nextcloud'].networks).toEqual(
        expect.arrayContaining(nextcloudDef!.networks),
      );
    });

    it('added service has container_name with brewnet prefix', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      expect(compose.services['jellyfin'].container_name).toBe('brewnet-jellyfin');
    });

    it('added service has restart policy set to unless-stopped', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      expect(compose.services['jellyfin'].restart).toBe('unless-stopped');
    });

    it('removing a base service (traefik) still preserves other services', async () => {
      createBaseComposeFile(tempDir);

      // Even if removing traefik (an unusual operation), gitea should remain
      await removeService('traefik', tempDir, {});

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      expect(compose.services).not.toHaveProperty('traefik');
      expect(compose.services).toHaveProperty('gitea');
    });

    it('multiple add operations produce a compose with all services', async () => {
      createBaseComposeFile(tempDir);

      await addService('jellyfin', tempDir);
      await addService('redis', tempDir);
      await addService('nextcloud', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      expect(compose.services).toHaveProperty('traefik');
      expect(compose.services).toHaveProperty('gitea');
      expect(compose.services).toHaveProperty('jellyfin');
      expect(compose.services).toHaveProperty('redis');
      expect(compose.services).toHaveProperty('nextcloud');
    });

    it('adding a service without a subdomain does not include Traefik labels', async () => {
      createBaseComposeFile(tempDir);

      // Redis has no subdomain (empty string)
      await addService('redis', tempDir);

      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose = parseComposeFile(composePath);

      const redisDef = getServiceDefinition('redis');
      expect(redisDef).toBeDefined();
      expect(redisDef!.subdomain).toBe('');

      // Redis should not have Traefik routing labels
      const labels = compose.services['redis'].labels;
      if (labels) {
        expect(labels['traefik.enable']).toBeUndefined();
      }
    });

    it('backup file path follows a consistent naming pattern', async () => {
      createBaseComposeFile(tempDir);

      const result: ServiceOperationResult = await addService('jellyfin', tempDir);

      expect(result.backupPath).toBeDefined();
      // Backup should be in the same directory as the compose file
      expect(result.backupPath!.startsWith(tempDir)).toBe(true);
      // Backup filename should contain the original filename or a timestamp indicator
      expect(result.backupPath!).toContain('docker-compose');
    });
  });
});
