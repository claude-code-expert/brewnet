/**
 * Unit tests for wizard/steps/generate module
 *
 * Tests runGenerateStep with all IO and service dependencies mocked.
 * Verifies success/failure paths for: compose generation, .env generation,
 * infra config generation, image pull, service startup, credential summary,
 * and failure recovery options (continue/restart/clean-restart).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateComposeConfig = jest.fn<() => object>(() => ({}));
const mockComposeConfigToYaml = jest.fn<() => string>(() => 'version: "3"');

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/compose-generator.js',
  () => ({
    generateComposeConfig: mockGenerateComposeConfig,
    composeConfigToYaml: mockComposeConfigToYaml,
  }),
);

const mockGenerateEnvFiles = jest.fn<() => { envContent: string; envExampleContent: string; secretFiles: { relativePath: string; content: string }[] }>(() => ({
  envContent: 'ADMIN_USER=admin',
  envExampleContent: 'ADMIN_USER=<your_value>',
  secretFiles: [],
}));
const mockWriteEnvFile = jest.fn();
const mockWriteSecretFiles = jest.fn();

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/env-generator.js',
  () => ({
    generateEnvFiles: mockGenerateEnvFiles,
    writeEnvFile: mockWriteEnvFile,
    writeSecretFiles: mockWriteSecretFiles,
  }),
);

const mockGenerateInfraConfigs = jest.fn<() => { path: string; content: string }[]>(() => [
  { path: 'traefik/traefik.yml', content: '# traefik config' },
]);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/config-generator.js',
  () => ({
    generateInfraConfigs: mockGenerateInfraConfigs,
  }),
);

const mockBuildPullCommand = jest.fn(() => ({ cmd: 'docker', args: ['compose', 'pull'] }));
const mockBuildUpCommand = jest.fn(() => ({ cmd: 'docker', args: ['compose', 'up', '-d'] }));
const mockBuildDownCommand = jest.fn(() => ({ cmd: 'docker', args: ['compose', 'down'] }));
const mockSortByDependency = jest.fn<(s: string[]) => string[]>((s) => s);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/health-checker.js',
  () => ({
    buildPullCommand: mockBuildPullCommand,
    buildUpCommand: mockBuildUpCommand,
    buildDownCommand: mockBuildDownCommand,
    sortByDependency: mockSortByDependency,
    generateEndpoints: jest.fn(() => []),
    categorizeService: jest.fn(() => 'application'),
    pollHealthCheck: jest.fn(),
    checkDnsResolution: jest.fn(),
    checkEndpointReachable: jest.fn(),
    HEALTH_CHECK_TIMEOUT: 120000,
    HEALTH_CHECK_INTERVAL: 2000,
    DOCKER_COMPOSE_FILENAME: 'docker-compose.yml',
  }),
);

const mockCollectAllServices = jest.fn<() => string[]>(() => ['traefik', 'gitea']);
const mockGetCredentialTargets = jest.fn<() => string[]>(() => ['Gitea']);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/utils/resources.js',
  () => ({
    collectAllServices: mockCollectAllServices,
    getCredentialTargets: mockGetCredentialTargets,
    countSelectedServices: jest.fn(() => 2),
    estimateResources: jest.fn(() => ({ ram: 512, disk: 5 })),
    getImageName: jest.fn(() => 'traefik:latest'),
  }),
);

// Mock service-verifier
const mockBuildServiceUrlMap = jest.fn<() => unknown[]>(() => []);
const mockBuildServiceAccessGuide = jest.fn<() => unknown[]>(() => []);
const mockVerifyServiceAccess = jest.fn();

jest.unstable_mockModule(
  '../../../../../packages/cli/src/utils/service-verifier.js',
  () => ({
    buildServiceUrlMap: mockBuildServiceUrlMap,
    buildServiceAccessGuide: mockBuildServiceAccessGuide,
    verifyServiceAccess: mockVerifyServiceAccess,
  }),
);

// Mock execa (dynamic import inside generate.ts)
const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// Mock @inquirer/prompts
const mockConfirm = jest.fn<() => Promise<boolean>>();
const mockSelect = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: jest.fn(),
  select: mockSelect,
  checkbox: jest.fn(),
  password: jest.fn(),
}));

// Mock node:fs
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
  copyFileSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  chmodSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { runGenerateStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/generate.js'
);

const { createDefaultWizardState } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return {
    ...base,
    projectPath: '/tmp/test-brewnet',
    admin: { ...base.admin, username: 'admin', password: 'pass123' },
    ...overrides,
  };
}

function mockSuccessfulDockerExeca() {
  mockExeca.mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateComposeConfig.mockReturnValue({});
  mockComposeConfigToYaml.mockReturnValue('version: "3"\nservices: {}');
  mockGenerateEnvFiles.mockReturnValue({
    envContent: 'ADMIN_USER=admin',
    envExampleContent: 'ADMIN_USER=<your_value>',
    secretFiles: [],
  });
  mockGenerateInfraConfigs.mockReturnValue([
    { path: 'traefik/traefik.yml', content: '# traefik' },
  ]);
  mockBuildPullCommand.mockReturnValue({ cmd: 'docker', args: ['compose', 'pull'] });
  mockBuildUpCommand.mockReturnValue({ cmd: 'docker', args: ['compose', 'up', '-d'] });
  mockCollectAllServices.mockReturnValue(['traefik', 'gitea']);
  mockGetCredentialTargets.mockReturnValue(['Gitea']);
  mockBuildServiceUrlMap.mockReturnValue([]);
  mockBuildServiceAccessGuide.mockReturnValue([]);
  mockSuccessfulDockerExeca();
});

describe('runGenerateStep', () => {
  it('returns success on full success', async () => {
    const result = await runGenerateStep(makeState());
    expect(result).toBe('success');
  });

  it('calls generateComposeConfig with wizard state', async () => {
    const state = makeState();
    await runGenerateStep(state);
    expect(mockGenerateComposeConfig).toHaveBeenCalledWith(state);
  });

  it('calls composeConfigToYaml with compose config result', async () => {
    const composeConfig = { services: { traefik: {} } };
    mockGenerateComposeConfig.mockReturnValue(composeConfig);
    await runGenerateStep(makeState());
    expect(mockComposeConfigToYaml).toHaveBeenCalledWith(composeConfig);
  });

  it('writes docker-compose.yml to project path', async () => {
    const state = makeState({ projectPath: '/tmp/test-brewnet' });
    await runGenerateStep(state);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('docker-compose.yml'),
      expect.any(String),
      'utf-8',
    );
  });

  it('calls generateEnvFiles with wizard state', async () => {
    const state = makeState();
    await runGenerateStep(state);
    expect(mockGenerateEnvFiles).toHaveBeenCalledWith(state);
  });

  it('calls writeEnvFile with project path and env content', async () => {
    const state = makeState({ projectPath: '/tmp/test-brewnet' });
    await runGenerateStep(state);
    expect(mockWriteEnvFile).toHaveBeenCalledWith('/tmp/test-brewnet', 'ADMIN_USER=admin');
  });

  it('writes .env.example file', async () => {
    await runGenerateStep(makeState());
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env.example'),
      'ADMIN_USER=<your_value>',
      'utf-8',
    );
  });

  it('calls generateInfraConfigs with wizard state', async () => {
    const state = makeState();
    await runGenerateStep(state);
    expect(mockGenerateInfraConfigs).toHaveBeenCalledWith(state);
  });

  it('writes all infra config files', async () => {
    mockGenerateInfraConfigs.mockReturnValue([
      { path: 'traefik/traefik.yml', content: '# traefik' },
      { path: 'gitea/app.ini', content: '# gitea' },
    ]);
    await runGenerateStep(makeState());
    const writeCalls = mockWriteFileSync.mock.calls.map((c) => c[0]);
    expect(writeCalls.some((p) => String(p).includes('traefik.yml'))).toBe(true);
    expect(writeCalls.some((p) => String(p).includes('app.ini'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Pre-startup errors → 'error'
  // -------------------------------------------------------------------------

  it('returns error when compose generation throws', async () => {
    mockGenerateComposeConfig.mockImplementation(() => {
      throw new Error('generation failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe('error');
  });

  it('returns error when env generation throws', async () => {
    mockGenerateEnvFiles.mockImplementation(() => {
      throw new Error('env failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe('error');
  });

  it('returns error when infra config generation throws', async () => {
    mockGenerateInfraConfigs.mockImplementation(() => {
      throw new Error('infra failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe('error');
  });

  // -------------------------------------------------------------------------
  // Pull failures
  // -------------------------------------------------------------------------

  it('returns error when user declines after pull failure', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: 'pull failed', exitCode: 1 });
    mockConfirm.mockResolvedValue(false);

    const result = await runGenerateStep(makeState());
    expect(result).toBe('error');
  });

  it('continues after pull failure if user confirms', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: 'pull error', exitCode: 1 }) // pull fails
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });           // up succeeds
    mockConfirm.mockResolvedValue(true);

    const result = await runGenerateStep(makeState());
    expect(result).toBe('success');
  });

  it('handles pull throwing execa-style error and continues if user confirms', async () => {
    const execaErr = Object.assign(new Error('docker pull failed'), {
      stdout: '',
      stderr: 'network timeout',
      exitCode: 1,
    });
    mockExeca
      .mockRejectedValueOnce(execaErr)
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
    mockConfirm.mockResolvedValue(true);

    const result = await runGenerateStep(makeState());
    expect(result).toBe('success');
  });

  it('returns error when pull throws plain Error and user declines', async () => {
    mockExeca.mockRejectedValueOnce(new Error('connection refused'));
    mockConfirm.mockResolvedValue(false);

    const result = await runGenerateStep(makeState());
    expect(result).toBe('error');
  });

  it('continues when pull throws plain Error and user confirms', async () => {
    mockExeca
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
    mockConfirm.mockResolvedValue(true);

    const result = await runGenerateStep(makeState());
    expect(result).toBe('success');
  });

  // -------------------------------------------------------------------------
  // Docker compose up failure — recovery options
  // -------------------------------------------------------------------------

  describe('compose up failure recovery', () => {
    beforeEach(() => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // pre-cleanup: docker compose down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // pre-cleanup: docker ps -a (no stale)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // gitea_db: compose up postgresql
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // gitea_db: pg_isready (1 poll)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // gitea_db: psql SELECT 1 (user check)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // gitea_db: psql SELECT gitea_db (no db yet)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })           // gitea_db: psql CREATE DATABASE
        .mockResolvedValueOnce({ stdout: '', stderr: 'up failed', exitCode: 1 }); // up fails
    });

    it('returns success when user selects continue', async () => {
      mockSelect.mockResolvedValue('continue');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');
    });

    it('returns restart when user selects restart', async () => {
      mockSelect.mockResolvedValue('restart');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('restart');
    });

    it('returns clean-restart when user selects clean-restart', async () => {
      mockSelect.mockResolvedValue('clean-restart');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('clean-restart');
    });
  });

  describe('compose up plain Error recovery', () => {
    it('returns restart when up throws and user selects restart', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // pre-cleanup: docker compose down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // pre-cleanup: docker ps -a (no stale)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // gitea_db: compose up postgresql
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // gitea_db: pg_isready (1 poll)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // gitea_db: psql SELECT 1 (user check)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // gitea_db: psql SELECT gitea_db (no db yet)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // gitea_db: psql CREATE DATABASE
        .mockRejectedValueOnce(new Error('docker daemon not running'));    // up throws
      mockSelect.mockResolvedValue('restart');

      const result = await runGenerateStep(makeState());
      expect(result).toBe('restart');
    });
  });

  // -------------------------------------------------------------------------
  // Pre-cleanup: stale brewnet-* container removal
  // -------------------------------------------------------------------------

  describe('pre-cleanup stale container removal', () => {
    it('removes stale brewnet-* containers found by docker ps before starting up', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                               // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                               // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                               // compose down
        .mockResolvedValueOnce({ stdout: 'brewnet-filebrowser\nbrewnet-jellyfin', stderr: '', exitCode: 0 }) // docker ps -a finds stale
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                               // docker rm -f brewnet-filebrowser
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                               // docker rm -f brewnet-jellyfin
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });                              // up succeeds

      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');

      // Verify rm -f called for both stale containers
      const rmCalls = mockExeca.mock.calls.filter(
        (c) => c[0] === 'docker' && Array.isArray(c[1]) && (c[1] as string[]).includes('rm'),
      );
      expect(rmCalls).toHaveLength(2);
      expect(rmCalls[0]![1]).toEqual(['rm', '-f', 'brewnet-filebrowser']);
      expect(rmCalls[1]![1]).toEqual(['rm', '-f', 'brewnet-jellyfin']);
    });

    it('skips stale removal when docker ps returns nothing', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // compose down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // docker ps -a (empty)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });  // up succeeds

      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');

      // No rm -f calls should exist
      const rmCalls = mockExeca.mock.calls.filter(
        (c) => c[0] === 'docker' && Array.isArray(c[1]) && (c[1] as string[]).includes('rm'),
      );
      expect(rmCalls).toHaveLength(0);
    });

    it('continues even when docker ps fails', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })   // compose down
        .mockRejectedValueOnce(new Error('docker ps failed'))             // docker ps -a throws
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });  // up succeeds

      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // Container name conflict retry
  // -------------------------------------------------------------------------

  describe('container name conflict retry', () => {
    it('removes conflicting containers and retries up successfully', async () => {
      const conflictStderr =
        'Error response from daemon: Conflict. The container name "/brewnet-traefik" is already in use by container "abc123". ' +
        'You have to remove (or rename) that container to be able to reuse that name.';
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: docker ps -a (no stale)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: compose up postgresql
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: pg_isready (1 poll)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT 1 (user check)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT gitea_db (no db yet)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql CREATE DATABASE
        .mockResolvedValueOnce({ stdout: '', stderr: conflictStderr, exitCode: 1 })    // up fails (conflict)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // docker rm -f brewnet-traefik
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });               // up retry succeeds

      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');

      // Verify docker rm -f was called with the conflicting container name
      const rmCall = mockExeca.mock.calls.find(
        (call) => call[0] === 'docker' && Array.isArray(call[1]) && (call[1] as string[]).includes('rm'),
      );
      expect(rmCall).toBeDefined();
      expect(rmCall![1]).toEqual(['rm', '-f', 'brewnet-traefik']);
    });

    it('handles multiple conflicting containers', async () => {
      const conflictStderr =
        'The container name "/brewnet-traefik" is already in use\n' +
        'The container name "/brewnet-gitea" is already in use';
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: docker ps -a (no stale)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: compose up postgresql
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: pg_isready (1 poll)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT 1 (user check)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT gitea_db (no db yet)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql CREATE DATABASE
        .mockResolvedValueOnce({ stdout: '', stderr: conflictStderr, exitCode: 1 })    // up fails (conflict)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // docker rm -f brewnet-traefik
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // docker rm -f brewnet-gitea
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });               // up retry succeeds

      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');

      const rmCalls = mockExeca.mock.calls.filter(
        (call) => call[0] === 'docker' && Array.isArray(call[1]) && (call[1] as string[]).includes('rm'),
      );
      expect(rmCalls).toHaveLength(2);
    });

    it('falls through to failure recovery if retry also fails', async () => {
      const conflictStderr = 'The container name "/brewnet-traefik" is already in use';
      mockExeca
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pull
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // network create brewnet
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: down
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // pre-cleanup: docker ps -a (no stale)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: compose up postgresql
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: pg_isready (1 poll)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT 1 (user check)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql SELECT gitea_db (no db yet)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // gitea_db: psql CREATE DATABASE
        .mockResolvedValueOnce({ stdout: '', stderr: conflictStderr, exitCode: 1 })    // up fails (conflict)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })                // docker rm -f
        .mockResolvedValueOnce({ stdout: '', stderr: 'still failing', exitCode: 1 });  // up retry also fails
      mockSelect.mockResolvedValue('restart');

      const result = await runGenerateStep(makeState());
      expect(result).toBe('restart');
    });
  });

  // -------------------------------------------------------------------------
  // Health check failure — recovery options
  // -------------------------------------------------------------------------

  describe('health check failure recovery', () => {
    beforeEach(() => {
      mockSuccessfulDockerExeca();
      mockBuildServiceUrlMap.mockReturnValue([
        { serviceId: 'traefik', label: 'Web Server', localUrl: 'http://localhost:80', healthEndpoint: '/' },
      ]);
      mockVerifyServiceAccess.mockResolvedValue({
        serviceId: 'traefik',
        label: 'Web Server',
        localUrl: 'http://localhost:80',
        status: 'fail',
        error: 'ECONNREFUSED',
      });
    });

    it('returns success when user selects continue after health check failure', async () => {
      mockSelect.mockResolvedValue('continue');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('success');
    });

    it('returns restart when user selects restart after health check failure', async () => {
      mockSelect.mockResolvedValue('restart');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('restart');
    });

    it('returns clean-restart when user selects clean-restart after health check failure', async () => {
      mockSelect.mockResolvedValue('clean-restart');
      const result = await runGenerateStep(makeState());
      expect(result).toBe('clean-restart');
    });
  });

  // -------------------------------------------------------------------------
  // Credential propagation
  // -------------------------------------------------------------------------

  it('shows credential propagation targets', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockGetCredentialTargets.mockReturnValue(['Gitea', 'Nextcloud']);

    await runGenerateStep(makeState());

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toMatch(/Credential/i);
    consoleSpy.mockRestore();
  });

  it('skips credential section when no targets', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockGetCredentialTargets.mockReturnValue([]);

    await runGenerateStep(makeState());

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toMatch(/Credential Propagation/);
    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Quick Tunnel URL capture
  // -------------------------------------------------------------------------

  describe('Quick Tunnel URL capture', () => {
    function makeQuickTunnelState(): WizardState {
      const state = makeState();
      state.domain.cloudflare.tunnelMode = 'quick';
      state.domain.cloudflare.quickTunnelUrl = '';
      return state;
    }

    function createMockSubprocess(emitUrl?: string) {
      type DataHandler = (data: Buffer | string) => void;
      const proc: Record<string, unknown> = {
        stdout: {
          on: jest.fn((event: string, handler: DataHandler) => {
            if (event === 'data' && emitUrl) {
              queueMicrotask(() => handler(emitUrl));
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn(),
        kill: jest.fn(),
        catch: jest.fn(),
      };
      return proc;
    }

    function createErrorSubprocess(error: Error) {
      const proc: Record<string, unknown> = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'error') {
            queueMicrotask(() => handler(error));
          }
          return proc;
        }),
        kill: jest.fn(),
        catch: jest.fn(),
      };
      return proc;
    }

    function setupExecaMockWithSubprocess(subprocess: Record<string, unknown>) {
      mockExeca.mockImplementation(((_cmd: unknown, args: unknown) => {
        const argsArr = args as string[];
        if (argsArr?.[0] === 'logs') {
          return subprocess;
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }) as Parameters<typeof mockExeca.mockImplementation>[0]);
    }

    it('captures URL and updates state when tunnelMode is quick', async () => {
      const tunnelUrl = 'https://test-abc123.trycloudflare.com';
      const mockProc = createMockSubprocess(tunnelUrl);
      setupExecaMockWithSubprocess(mockProc);

      const state = makeQuickTunnelState();
      const result = await runGenerateStep(state);

      expect(result).toBe('success');
      expect(state.domain.cloudflare.quickTunnelUrl).toBe(tunnelUrl);
      expect(state.domain.name).toBe('test-abc123.trycloudflare.com');
    });

    it('continues with success when URL capture fails', async () => {
      const mockProc = createErrorSubprocess(new Error('container not found'));
      setupExecaMockWithSubprocess(mockProc);

      const state = makeQuickTunnelState();
      const result = await runGenerateStep(state);

      expect(result).toBe('success');
      expect(state.domain.cloudflare.quickTunnelUrl).toBe('');
    });

    it('skips URL capture when tunnelMode is not quick', async () => {
      mockSuccessfulDockerExeca();

      const state = makeState();
      const result = await runGenerateStep(state);

      expect(result).toBe('success');
      // Verify no docker logs call was made
      const logsCalls = mockExeca.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[])[0] === 'logs',
      );
      expect(logsCalls).toHaveLength(0);
    });
  });
});
