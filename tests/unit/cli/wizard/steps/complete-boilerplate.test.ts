/**
 * Unit tests for wizard/steps/complete — boilerplate meta section (L225-251)
 *
 * Covers the boilerplate JSON file display path that requires mocking node:fs.
 * Uses a separate test file because the main complete.test.ts does not mock node:fs.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<() => unknown>().mockReturnValue(false);
const mockReadFileSync = jest.fn<() => unknown>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/system-service.js',
  () => ({
    installBrewnetService: jest.fn().mockResolvedValue(undefined),
    uninstallBrewnetService: jest.fn().mockResolvedValue(false),
    isBrewnetServiceInstalled: jest.fn().mockReturnValue(false),
    getServiceFilePath: jest.fn(() => '/tmp/test.plist'),
  }),
);

jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm: jest.fn().mockResolvedValue(false),
  input: jest.fn(),
  select: jest.fn(),
  checkbox: jest.fn(),
  password: jest.fn(),
}));

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/admin-launcher.js',
  () => ({
    launchAdminDaemon: jest.fn().mockResolvedValue({ pid: 99999, port: 8088, logFile: '/tmp/test.log' }),
  }),
);

jest.unstable_mockModule(
  '../../../../../packages/cli/src/utils/resources.js',
  () => ({
    collectAllServices: jest.fn().mockReturnValue(['traefik']),
    getCredentialTargets: jest.fn().mockReturnValue([]),
    countSelectedServices: jest.fn(() => 0),
    estimateResources: jest.fn(() => ({ ram: 0, disk: 0 })),
    getImageName: jest.fn(() => 'traefik:latest'),
  }),
);

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

jest.unstable_mockModule(
  '../../../../../packages/cli/src/services/health-checker.js',
  () => ({
    generateEndpoints: jest.fn().mockReturnValue([]),
    sortByDependency: jest.fn((s: unknown[]) => s),
    categorizeService: jest.fn(() => 'application'),
    buildPullCommand: jest.fn(),
    buildUpCommand: jest.fn(),
    buildDownCommand: jest.fn(),
    pollHealthCheck: jest.fn(),
    checkDnsResolution: jest.fn(),
    checkEndpointReachable: jest.fn(),
    HEALTH_CHECK_TIMEOUT: 120000,
    HEALTH_CHECK_INTERVAL: 2000,
    DOCKER_COMPOSE_FILENAME: 'docker-compose.yml',
  }),
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { runCompleteStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/complete.js'
);
const { createDefaultWizardState } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Tests — boilerplate meta section
// ---------------------------------------------------------------------------

describe('runCompleteStep — boilerplate meta', () => {
  it('renders Dev Stack Apps section when boilerplate JSON exists (unified stack)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = createDefaultWizardState();
    state.projectPath = '/tmp/brewnet/test-project';

    // Mock existsSync to return true for the boilerplate meta path
    mockExistsSync.mockImplementation((p: unknown) =>
      (p as string).includes('.brewnet-boilerplate.json'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify([{
      stackId: 'nodejs-nextjs',
      appDir: '/tmp/brewnet/test-project/nodejs-nextjs',
      backendUrl: 'http://localhost/apps/my-app',
      frontendUrl: undefined,
      isUnified: true,
      status: 'running',
    }]));

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('Dev Stack Apps');
    expect(allOutput).toContain('nodejs-nextjs');
    consoleSpy.mockRestore();
  });

  it('renders backend+frontend URLs for non-unified stack', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = createDefaultWizardState();
    state.projectPath = '/tmp/brewnet/test-project';

    mockExistsSync.mockImplementation((p: unknown) =>
      (p as string).includes('.brewnet-boilerplate.json'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify([{
      stackId: 'nodejs-react',
      appDir: '/tmp/brewnet/test-project/nodejs-react',
      backendUrl: 'http://localhost:3000',
      frontendUrl: 'http://localhost:4200',
      isUnified: false,
      status: 'running',
    }]));

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('Backend');
    expect(allOutput).toContain('Frontend');
    consoleSpy.mockRestore();
  });

  it('handles legacy single-object boilerplate JSON format', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = createDefaultWizardState();
    state.projectPath = '/tmp/brewnet/test-project';

    mockExistsSync.mockImplementation((p: unknown) =>
      (p as string).includes('.brewnet-boilerplate.json'),
    );
    // Single object (legacy format)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      stackId: 'nodejs-express',
      appDir: '/tmp/brewnet/test-project/nodejs-express',
      backendUrl: 'http://localhost:3000',
      isUnified: true,
    }));

    await runCompleteStep(state);

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('nodejs-express');
    consoleSpy.mockRestore();
  });

  it('silently skips when boilerplate JSON is malformed', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = createDefaultWizardState();
    state.projectPath = '/tmp/brewnet/test-project';

    mockExistsSync.mockImplementation((p: unknown) =>
      (p as string).includes('.brewnet-boilerplate.json'),
    );
    mockReadFileSync.mockReturnValue('not-valid-json');

    // Should not throw
    await expect(runCompleteStep(state)).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });
});
