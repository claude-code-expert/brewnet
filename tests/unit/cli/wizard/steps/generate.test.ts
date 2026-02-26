/**
 * Unit tests for wizard/steps/generate module
 *
 * Tests runGenerateStep with all IO and service dependencies mocked.
 * Verifies success/failure paths for: compose generation, .env generation,
 * infra config generation, image pull, service startup, credential summary.
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

const mockGenerateEnvFiles = jest.fn<() => { envContent: string; envExampleContent: string }>(() => ({
  envContent: 'ADMIN_USER=admin',
  envExampleContent: 'ADMIN_USER=<your_value>',
}));
const mockWriteEnvFile = jest.fn();

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/env-generator.js',
  () => ({
    generateEnvFiles: mockGenerateEnvFiles,
    writeEnvFile: mockWriteEnvFile,
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

// Mock execa (dynamic import inside generate.ts)
const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// Mock confirm from @inquirer/prompts
const mockConfirm = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: jest.fn(),
  select: jest.fn(),
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
    stdout: 'done',
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
  });
  mockGenerateInfraConfigs.mockReturnValue([
    { path: 'traefik/traefik.yml', content: '# traefik' },
  ]);
  mockBuildPullCommand.mockReturnValue({ cmd: 'docker', args: ['compose', 'pull'] });
  mockBuildUpCommand.mockReturnValue({ cmd: 'docker', args: ['compose', 'up', '-d'] });
  mockCollectAllServices.mockReturnValue(['traefik', 'gitea']);
  mockGetCredentialTargets.mockReturnValue(['Gitea']);
  mockSuccessfulDockerExeca();
});

describe('runGenerateStep', () => {
  it('returns true on full success', async () => {
    const result = await runGenerateStep(makeState());
    expect(result).toBe(true);
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

  it('returns false when compose generation throws', async () => {
    mockGenerateComposeConfig.mockImplementation(() => {
      throw new Error('generation failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('returns false when env generation throws', async () => {
    mockGenerateEnvFiles.mockImplementation(() => {
      throw new Error('env failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('returns false when infra config generation throws', async () => {
    mockGenerateInfraConfigs.mockImplementation(() => {
      throw new Error('infra failed');
    });
    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('returns false when user declines after pull failure', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: 'pull failed', exitCode: 1 }) // pull fails
    mockConfirm.mockResolvedValue(false); // user declines to continue

    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('continues after pull failure if user confirms', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: 'pull error', exitCode: 1 }) // pull fails
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });           // up succeeds
    mockConfirm.mockResolvedValue(true); // user confirms to continue

    const result = await runGenerateStep(makeState());
    expect(result).toBe(true);
  });

  it('returns false when service startup fails and user declines rollback', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })          // pull succeeds
      .mockResolvedValueOnce({ stdout: '', stderr: 'up failed', exitCode: 1 }); // up fails
    mockConfirm.mockResolvedValue(false); // user declines rollback

    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('runs rollback when service startup fails and user confirms', async () => {
    mockBuildDownCommand.mockReturnValue({ cmd: 'docker', args: ['compose', 'down'] });
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })            // pull
      .mockResolvedValueOnce({ stdout: '', stderr: 'failed', exitCode: 1 })      // up fails
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });            // down (rollback)
    mockConfirm.mockResolvedValue(true); // user confirms rollback

    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
    expect(mockBuildDownCommand).toHaveBeenCalled();
  });

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

  it('handles pull throwing execa-style error (with stdout/stderr) and continues if user confirms', async () => {
    // Trigger execCommand catch: err has 'stdout' property → returns { exitCode: 1 }
    // Then the outer exitCode !== 0 branch runs and user confirms to continue
    const execaErr = Object.assign(new Error('docker pull failed'), {
      stdout: '',
      stderr: 'network timeout',
      exitCode: 1,
    });
    mockExeca
      .mockRejectedValueOnce(execaErr)                                      // pull → execCommand catch (has stdout)
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });     // up succeeds
    mockConfirm.mockResolvedValue(true);

    const result = await runGenerateStep(makeState());
    expect(result).toBe(true);
  });

  it('returns false when pull throws plain Error and user declines', async () => {
    // Plain Error (no stdout) → execCommand rethrows → outer catch at lines 189-202
    mockExeca.mockRejectedValueOnce(new Error('connection refused'));
    mockConfirm.mockResolvedValue(false);

    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });

  it('continues when pull throws plain Error and user confirms', async () => {
    // Plain Error → outer catch → user confirms → up succeeds
    mockExeca
      .mockRejectedValueOnce(new Error('connection refused'))               // pull: plain Error rethrown
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });     // up succeeds
    mockConfirm.mockResolvedValue(true);

    const result = await runGenerateStep(makeState());
    expect(result).toBe(true);
  });

  it('returns false when up throws plain Error', async () => {
    // pull succeeds, up throws plain Error → catch at lines 239-245
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })      // pull
      .mockRejectedValueOnce(new Error('docker daemon not running'));       // up: plain Error

    const result = await runGenerateStep(makeState());
    expect(result).toBe(false);
  });
});
