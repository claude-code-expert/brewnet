/**
 * T109 — Constitution Compliance Integration Tests (Phase 11)
 *
 * Verifies the Brewnet project's constitution principles through
 * integration-level tests that exercise multiple modules together:
 *
 *   TC-C-04: Reversible — addService and removeService create backups
 *            before modifying docker-compose.yml
 *   TC-C-05: Offline First — generateComposeConfig and all config generators
 *            are pure functions that work without network access
 *
 * These tests use real filesystem operations (temp directories) to verify
 * that backup creation is not just theoretical but actually occurs on disk.
 *
 * @module tests/integration/constitution
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

import {
  addService,
  removeService,
} from '../../packages/cli/src/services/service-manager.js';

import {
  generateComposeConfig,
  composeConfigToYaml,
} from '../../packages/cli/src/services/compose-generator.js';

import {
  generateInfraConfigs,
  generateSshdConfig,
  generateGiteaConfig,
  generateTraefikConfig,
  generateFileBrowserConfig,
  generateMailConfig,
} from '../../packages/cli/src/services/config-generator.js';

import {
  generateEnvFiles,
} from '../../packages/cli/src/services/env-generator.js';

import {
  createDefaultWizardState,
  applyFullInstallDefaults,
} from '../../packages/cli/src/config/defaults.js';

import { DOCKER_COMPOSE_FILENAME } from '../../packages/shared/src/utils/constants.js';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComposeFile {
  version?: string;
  services: Record<string, unknown>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'brewnet-constitution-'));
}

/**
 * Write a minimal valid docker-compose.yml to the temp directory.
 */
function writeMinimalCompose(dir: string): string {
  const composePath = join(dir, DOCKER_COMPOSE_FILENAME);
  const compose: ComposeFile = {
    version: '3.8',
    services: {
      traefik: {
        image: 'traefik:v3.1',
        container_name: 'brewnet-traefik',
        restart: 'unless-stopped',
        security_opt: ['no-new-privileges:true'],
        networks: ['brewnet'],
      },
    },
    networks: {
      brewnet: { external: true },
      'brewnet-internal': { internal: true },
    },
  };
  writeFileSync(composePath, yaml.dump(compose), 'utf-8');
  return composePath;
}

/**
 * Read and parse the docker-compose.yml from the temp directory.
 */
function readCompose(dir: string): ComposeFile {
  const composePath = join(dir, DOCKER_COMPOSE_FILENAME);
  const content = readFileSync(composePath, 'utf-8');
  return yaml.load(content) as ComposeFile;
}

/**
 * Count .bak files in a directory.
 */
function countBackupFiles(dir: string): number {
  const files = readdirSync(dir);
  return files.filter((f) => f.includes('.bak.')).length;
}

/**
 * Build a full WizardState with all services enabled for testing
 * pure config generation.
 */
function buildFullState(): WizardState {
  const base = createDefaultWizardState() as WizardState;
  const full = applyFullInstallDefaults(base) as WizardState;
  return {
    ...full,
    admin: { ...full.admin, password: 'integration-test-pass' },
    servers: {
      ...full.servers,
      fileServer: { enabled: true, service: 'nextcloud' },
      media: { enabled: true, services: ['jellyfin'] },
      sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      mailServer: { enabled: true, service: 'docker-mailserver' },
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
    domain: {
      ...full.domain,
      provider: 'custom',
      name: 'integration.brewnet.dev',
      ssl: 'letsencrypt',
      cloudflare: { enabled: true, tunnelToken: 'test-tok', tunnelName: 'int-tunnel' },
    },
  } as WizardState;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-C-04: Reversible — addService and removeService create backups
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-C-04: Reversible — backup before modification', () => {
  describe('addService creates backup', () => {
    it('should create a backup file before adding a service', async () => {
      writeMinimalCompose(tempDir);

      // No backup files initially
      expect(countBackupFiles(tempDir)).toBe(0);

      const result = await addService('redis', tempDir);
      expect(result.success).toBe(true);

      // A backup file should now exist
      expect(countBackupFiles(tempDir)).toBe(1);
    });

    it('should return the backup path in the result', async () => {
      writeMinimalCompose(tempDir);

      const result = await addService('redis', tempDir);
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).toContain('.bak.');
      expect(existsSync(result.backupPath!)).toBe(true);
    });

    it('should preserve the original compose content in the backup', async () => {
      const composePath = writeMinimalCompose(tempDir);
      const originalContent = readFileSync(composePath, 'utf-8');

      const result = await addService('redis', tempDir);
      expect(result.success).toBe(true);

      // The backup should contain the original content
      const backupContent = readFileSync(result.backupPath!, 'utf-8');
      expect(backupContent).toBe(originalContent);
    });

    it('should create a new backup for each addService call', async () => {
      writeMinimalCompose(tempDir);

      const result1 = await addService('redis', tempDir);
      expect(result1.success).toBe(true);

      const result2 = await addService('jellyfin', tempDir);
      expect(result2.success).toBe(true);

      // Two distinct backup files
      expect(countBackupFiles(tempDir)).toBe(2);
      expect(result1.backupPath).not.toBe(result2.backupPath);
    });
  });

  describe('removeService creates backup', () => {
    it('should create a backup file before removing a service', async () => {
      // Write a compose with redis already present
      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose: ComposeFile = {
        version: '3.8',
        services: {
          traefik: {
            image: 'traefik:v3.1',
            container_name: 'brewnet-traefik',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet'],
          },
          redis: {
            image: 'redis:7-alpine',
            container_name: 'brewnet-redis',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet-internal'],
          },
        },
        networks: {
          brewnet: { external: true },
          'brewnet-internal': { internal: true },
        },
      };
      writeFileSync(composePath, yaml.dump(compose), 'utf-8');

      expect(countBackupFiles(tempDir)).toBe(0);

      const result = await removeService('redis', tempDir);
      expect(result.success).toBe(true);

      // A backup file should exist
      expect(countBackupFiles(tempDir)).toBe(1);
    });

    it('should return the backup path in the result', async () => {
      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose: ComposeFile = {
        version: '3.8',
        services: {
          traefik: {
            image: 'traefik:v3.1',
            container_name: 'brewnet-traefik',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet'],
          },
          redis: {
            image: 'redis:7-alpine',
            container_name: 'brewnet-redis',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet-internal'],
          },
        },
        networks: {},
      };
      writeFileSync(composePath, yaml.dump(compose), 'utf-8');

      const result = await removeService('redis', tempDir);
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
    });

    it('should preserve the pre-removal compose content in the backup', async () => {
      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose: ComposeFile = {
        version: '3.8',
        services: {
          traefik: {
            image: 'traefik:v3.1',
            container_name: 'brewnet-traefik',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet'],
          },
          redis: {
            image: 'redis:7-alpine',
            container_name: 'brewnet-redis',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet-internal'],
          },
        },
        networks: {},
      };
      writeFileSync(composePath, yaml.dump(compose), 'utf-8');
      const originalContent = readFileSync(composePath, 'utf-8');

      const result = await removeService('redis', tempDir);
      const backupContent = readFileSync(result.backupPath!, 'utf-8');
      expect(backupContent).toBe(originalContent);

      // The main compose should no longer have redis
      const updatedCompose = readCompose(tempDir);
      expect(updatedCompose.services['redis']).toBeUndefined();
    });
  });

  describe('backup does not occur on failed operations', () => {
    it('should not create a backup when adding a duplicate service', async () => {
      // Write compose with redis already present
      const composePath = join(tempDir, DOCKER_COMPOSE_FILENAME);
      const compose: ComposeFile = {
        version: '3.8',
        services: {
          redis: {
            image: 'redis:7-alpine',
            container_name: 'brewnet-redis',
            restart: 'unless-stopped',
            security_opt: ['no-new-privileges:true'],
            networks: ['brewnet-internal'],
          },
        },
        networks: {},
      };
      writeFileSync(composePath, yaml.dump(compose), 'utf-8');

      const result = await addService('redis', tempDir);
      expect(result.success).toBe(false);
      expect(countBackupFiles(tempDir)).toBe(0);
    });

    it('should not create a backup when removing a non-existent service', async () => {
      writeMinimalCompose(tempDir);

      const result = await removeService('nonexistent', tempDir);
      expect(result.success).toBe(false);
      expect(countBackupFiles(tempDir)).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-C-05: Offline First — config generators work without network access
// ═══════════════════════════════════════════════════════════════════════════

describe('TC-C-05: Offline First — all generators are pure functions', () => {
  describe('generateComposeConfig is a pure function', () => {
    it('should generate a valid ComposeConfig without any network calls', () => {
      const state = buildFullState();
      const config = generateComposeConfig(state);

      expect(config).toBeDefined();
      expect(config.version).toBe('3.8');
      expect(Object.keys(config.services).length).toBeGreaterThan(0);
      expect(config.networks).toBeDefined();
    });

    it('should produce consistent output for the same input (deterministic)', () => {
      const state = buildFullState();
      const config1 = generateComposeConfig(state);
      const config2 = generateComposeConfig(state);

      // Remove timestamps or nondeterministic parts if any — but compose config
      // is fully deterministic from state
      expect(config1).toEqual(config2);
    });

    it('should not modify the input state (no side effects)', () => {
      const state = buildFullState();
      const stateCopy = JSON.parse(JSON.stringify(state));

      generateComposeConfig(state);

      // State should be unchanged after generation
      expect(state).toEqual(stateCopy);
    });

    it('should serialize to valid YAML without network access', () => {
      const state = buildFullState();
      const config = generateComposeConfig(state);
      const yamlStr = composeConfigToYaml(config);

      expect(typeof yamlStr).toBe('string');
      expect(yamlStr.length).toBeGreaterThan(0);

      // Should be parseable back
      const parsed = yaml.load(yamlStr) as ComposeFile;
      expect(parsed.services).toBeDefined();
      expect(parsed.version).toBe('3.8');
    });
  });

  describe('generateInfraConfigs is a pure function', () => {
    it('should generate infrastructure configs without network calls', () => {
      const state = buildFullState();
      const files = generateInfraConfigs(state);

      expect(files.length).toBeGreaterThan(0);
      // Should have at least traefik + gitea + ssh + filebrowser + mail configs
      expect(files.length).toBeGreaterThanOrEqual(4);
    });

    it('should produce consistent output for the same input', () => {
      const state = buildFullState();
      const files1 = generateInfraConfigs(state);
      const files2 = generateInfraConfigs(state);

      expect(files1).toEqual(files2);
    });

    it('should not modify the input state', () => {
      const state = buildFullState();
      const stateCopy = JSON.parse(JSON.stringify(state));

      generateInfraConfigs(state);

      expect(state).toEqual(stateCopy);
    });
  });

  describe('individual config generators are pure functions', () => {
    it('generateSshdConfig should work without network access', () => {
      const state = buildFullState();
      const config = generateSshdConfig(state);

      expect(config).toBeDefined();
      expect(config.path).toBeTruthy();
      expect(config.content).toBeTruthy();
      expect(config.content).toContain('Port');
      expect(config.content).toContain('PubkeyAuthentication');
    });

    it('generateGiteaConfig should work without network access', () => {
      const state = buildFullState();
      const config = generateGiteaConfig(state);

      expect(config).toBeDefined();
      expect(config.path).toBeTruthy();
      expect(config.content).toBeTruthy();
      expect(config.content).toContain('[server]');
    });

    it('generateTraefikConfig should work without network access', () => {
      const state = buildFullState();
      const config = generateTraefikConfig(state);

      expect(config).toBeDefined();
      expect(config.path).toBeTruthy();
      expect(config.content).toBeTruthy();
      expect(config.content).toContain('entryPoints');
    });

    it('generateFileBrowserConfig should work without network access', () => {
      const state = buildFullState();
      const config = generateFileBrowserConfig(state);

      expect(config).not.toBeNull();
      expect(config!.path).toBeTruthy();
      expect(config!.content).toBeTruthy();
    });

    it('generateMailConfig should work without network access', () => {
      const state = buildFullState();
      const configs = generateMailConfig(state);

      expect(configs.length).toBeGreaterThan(0);
      for (const config of configs) {
        expect(config.path).toBeTruthy();
        expect(config.content).toBeTruthy();
      }
    });
  });

  describe('generateEnvFiles is a pure function', () => {
    it('should generate env file contents without network calls', () => {
      const state = buildFullState();
      const result = generateEnvFiles(state);

      expect(result.envContent).toBeTruthy();
      expect(result.envExampleContent).toBeTruthy();
    });

    it('should produce consistent output for the same input (ignoring generated passwords)', () => {
      const state = buildFullState();

      // Note: generateEnvFiles generates random passwords for empty fields,
      // so we need to pre-fill all password fields for deterministic output.
      const deterministicState = {
        ...state,
        admin: { ...state.admin, password: 'fixed-admin-pass' },
        servers: {
          ...state.servers,
          dbServer: {
            ...state.servers.dbServer,
            dbPassword: 'fixed-db-pass',
          },
        },
      } as WizardState;

      const result1 = generateEnvFiles(deterministicState);
      const result2 = generateEnvFiles(deterministicState);

      // The .env.example should always be identical (masked values)
      expect(result1.envExampleContent).toBe(result2.envExampleContent);
    });

    it('should not modify the input state', () => {
      const state = buildFullState();
      const stateCopy = JSON.parse(JSON.stringify(state));

      generateEnvFiles(state);

      expect(state).toEqual(stateCopy);
    });

    it('should mask secrets in .env.example', () => {
      const state = buildFullState();
      const result = generateEnvFiles(state);

      // .env.example should contain placeholders, not real passwords
      expect(result.envExampleContent).toContain('<your-password>');
      expect(result.envExampleContent).not.toContain(state.admin.password);
    });
  });

  describe('config generators take no external dependencies', () => {
    it('should work with a minimal default state (zero config)', () => {
      const state = createDefaultWizardState() as WizardState;

      // All of these should succeed without error
      const composeConfig = generateComposeConfig(state);
      expect(composeConfig.services).toBeDefined();

      const infraConfigs = generateInfraConfigs(state);
      expect(infraConfigs.length).toBeGreaterThan(0);

      const envResult = generateEnvFiles(state);
      expect(envResult.envContent).toBeTruthy();
    });

    it('should work with a partial install state', () => {
      const base = createDefaultWizardState() as WizardState;
      const state = {
        ...base,
        setupType: 'partial' as const,
        servers: {
          ...base.servers,
          dbServer: {
            enabled: false,
            primary: '' as const,
            primaryVersion: '',
            dbName: '',
            dbUser: '',
            dbPassword: '',
            adminUI: false,
            cache: '' as const,
          },
          fileServer: { enabled: false, service: '' as const },
          media: { enabled: false, services: [] },
          sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
          mailServer: { enabled: false, service: 'docker-mailserver' as const },
          fileBrowser: { enabled: false, mode: '' as const },
        },
      } as WizardState;

      const composeConfig = generateComposeConfig(state);
      expect(composeConfig.services).toBeDefined();

      const infraConfigs = generateInfraConfigs(state);
      expect(infraConfigs.length).toBeGreaterThan(0);
    });
  });
});
