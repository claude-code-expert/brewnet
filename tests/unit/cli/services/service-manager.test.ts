/**
 * Unit tests for services/service-manager module
 *
 * Covers: addService, removeService, isServiceInCompose
 * Tests volume switch cases, compose mutations, and error paths.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const COMPOSE_PATH = '/tmp/project/docker-compose.yml';

// Track simulated compose content keyed by path
let composeFsContent: Record<string, string> = {};

const mockExistsSync = jest.fn((p: unknown) => p === COMPOSE_PATH || (p as string) in composeFsContent);
const mockReadFileSync = jest.fn((p: unknown) => composeFsContent[p as string] ?? '');
const mockWriteFileSync = jest.fn();
const mockCopyFileSync = jest.fn();
const mockReaddirSync = jest.fn<() => string[]>(() => []);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  copyFileSync: mockCopyFileSync,
  readdirSync: mockReaddirSync,
  mkdirSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  addService,
  removeService,
  isServiceInCompose,
} = await import('../../../../packages/cli/src/services/service-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal docker-compose YAML string.
 * Optionally includes an existing service to test duplicate/purge logic.
 */
function makeComposeYaml(services: Record<string, { image: string; volumes?: string[] }> = {}): string {
  const serviceEntries = Object.entries(services)
    .map(([name, def]) => {
      const volLines = (def.volumes ?? []).map((v) => `      - ${v}`).join('\n');
      return `  ${name}:\n    image: ${def.image}${volLines ? '\n    volumes:\n' + volLines : ''}`;
    })
    .join('\n');
  return `version: "3"\nservices:\n${serviceEntries || '  traefik:\n    image: traefik:v3.0'}\n`;
}

function setCompose(path: string, yaml: string): void {
  composeFsContent[path] = yaml;
  mockExistsSync.mockImplementation((p: unknown) => (p as string) in composeFsContent);
  mockReadFileSync.mockImplementation((p: unknown) => composeFsContent[p as string] ?? '');
}

// ---------------------------------------------------------------------------
// addService
// ---------------------------------------------------------------------------

describe('addService', () => {
  beforeEach(() => {
    composeFsContent = {};
    mockExistsSync.mockImplementation((p: unknown) => (p as string) in composeFsContent);
    mockReadFileSync.mockImplementation((p: unknown) => composeFsContent[p as string] ?? '');
    mockWriteFileSync.mockReset();
    mockCopyFileSync.mockReset();
    mockReaddirSync.mockReturnValue([]);
  });

  it('returns failure for unknown service ID', async () => {
    const result = await addService('unknown-service-xyz', '/tmp/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown service');
  });

  it('returns failure when docker-compose.yml does not exist', async () => {
    const result = await addService('gitea', '/tmp/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('docker-compose.yml not found');
  });

  it('returns failure when service already exists in compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml({ gitea: { image: 'gitea/gitea:1.21' } }));
    const result = await addService('gitea', '/tmp/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('returns success when adding gitea to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('gitea', '/tmp/project');
    expect(result.success).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('returns success when adding postgresql to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('postgresql', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding mysql to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('mysql', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding redis to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('redis', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding valkey to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('valkey', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding keydb to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('keydb', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding nextcloud to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('nextcloud', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding minio to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('minio', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding jellyfin to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('jellyfin', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding openssh-server to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('openssh-server', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding docker-mailserver to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('docker-mailserver', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding pgadmin to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('pgadmin', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding filebrowser to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('filebrowser', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding cloudflared (no volumes) to existing compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('cloudflared', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('handles compose with no services section (creates services)', async () => {
    // Minimal compose with no services key
    setCompose(COMPOSE_PATH, 'version: "3"\n');
    const result = await addService('redis', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('handles compose with no volumes section (creates volumes)', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    // No volumes key in compose — adding gitea should create it
    const result = await addService('gitea', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding traefik (covers traefik volume case)', async () => {
    setCompose(COMPOSE_PATH, 'version: "3"\nservices:\n  redis:\n    image: redis:7\n');
    const result = await addService('traefik', '/tmp/project');
    expect(result.success).toBe(true);
  });

  it('returns success when adding nginx (triggers default volume case)', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await addService('nginx', '/tmp/project');
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeService
// ---------------------------------------------------------------------------

describe('removeService', () => {
  beforeEach(() => {
    composeFsContent = {};
    mockExistsSync.mockImplementation((p: unknown) => (p as string) in composeFsContent);
    mockReadFileSync.mockImplementation((p: unknown) => composeFsContent[p as string] ?? '');
    mockWriteFileSync.mockReset();
    mockCopyFileSync.mockReset();
    mockReaddirSync.mockReturnValue([]);
  });

  it('returns failure when docker-compose.yml does not exist', async () => {
    const result = await removeService('gitea', '/tmp/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('docker-compose.yml not found');
  });

  it('returns failure when service not found in compose', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = await removeService('gitea', '/tmp/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in compose');
  });

  it('removes existing service and returns success', async () => {
    setCompose(COMPOSE_PATH, makeComposeYaml({
      gitea: { image: 'gitea/gitea:1.21', volumes: ['brewnet_gitea_data:/data'] },
    }));
    const result = await removeService('gitea', '/tmp/project');
    expect(result.success).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('purges named volumes when purge=true', async () => {
    setCompose(COMPOSE_PATH,
      'version: "3"\n' +
      'services:\n' +
      '  gitea:\n' +
      '    image: gitea/gitea:1.21\n' +
      '    volumes:\n' +
      '      - brewnet_gitea_data:/data\n' +
      'volumes:\n' +
      '  brewnet_gitea_data:\n',
    );
    const result = await removeService('gitea', '/tmp/project', { purge: true });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isServiceInCompose
// ---------------------------------------------------------------------------

describe('isServiceInCompose', () => {
  beforeEach(() => {
    composeFsContent = {};
    mockExistsSync.mockImplementation((p: unknown) => (p as string) in composeFsContent);
    mockReadFileSync.mockImplementation((p: unknown) => composeFsContent[p as string] ?? '');
  });

  it('returns false when compose file does not exist', () => {
    const result = isServiceInCompose('gitea', '/tmp/nonexistent/docker-compose.yml');
    expect(result).toBe(false);
  });

  it('returns true when service exists in compose', () => {
    setCompose(COMPOSE_PATH, makeComposeYaml({ gitea: { image: 'gitea/gitea:1.21' } }));
    const result = isServiceInCompose('gitea', COMPOSE_PATH);
    expect(result).toBe(true);
  });

  it('returns false when service does not exist in compose', () => {
    setCompose(COMPOSE_PATH, makeComposeYaml());
    const result = isServiceInCompose('gitea', COMPOSE_PATH);
    expect(result).toBe(false);
  });

  it('returns false when readFileSync throws (invalid file)', () => {
    composeFsContent[COMPOSE_PATH] = 'exists';
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('EACCES: permission denied'); });
    const result = isServiceInCompose('gitea', COMPOSE_PATH);
    expect(result).toBe(false);
  });
});
