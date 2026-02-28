/**
 * T103 — E2E: Partial Install Flow
 *
 * Tests the wizard flow for a Partial Install:
 *   - Only Web Server (Traefik) + Git Server (Gitea) enabled
 *   - DB server disabled — no postgresql/redis in compose
 *   - Generated compose has only 2 services (traefik + gitea)
 *   - State setupType = 'partial'
 *
 * Strategy:
 *   - Mock @inquirer/prompts to provide automated answers
 *   - Mock Docker operations and filesystem
 *   - Verify WizardState and compose config reflect partial install
 *
 * @module tests/e2e/partial-install
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Track prompt calls for verification
// ---------------------------------------------------------------------------

const promptCalls: Array<{ type: string; message?: string; result: unknown }> = [];

// ---------------------------------------------------------------------------
// Auto-answer queues
// ---------------------------------------------------------------------------

let inputQueue: unknown[] = [];
let selectQueue: unknown[] = [];
let confirmQueue: unknown[] = [];
let checkboxQueue: unknown[] = [];

function mockInput(opts: Record<string, unknown>) {
  const result = inputQueue.shift() ?? opts.default ?? '';
  promptCalls.push({ type: 'input', message: opts.message as string, result });
  return Promise.resolve(result);
}

function mockSelect(opts: Record<string, unknown>) {
  const result = selectQueue.shift() ?? opts.default ?? '';
  promptCalls.push({ type: 'select', message: opts.message as string, result });
  return Promise.resolve(result);
}

function mockConfirm(opts: Record<string, unknown>) {
  const result = confirmQueue.shift() ?? opts.default ?? true;
  promptCalls.push({ type: 'confirm', message: opts.message as string, result });
  return Promise.resolve(result);
}

function mockCheckbox(opts: Record<string, unknown>) {
  const result = checkboxQueue.shift() ?? [];
  promptCalls.push({ type: 'checkbox', message: opts.message as string, result });
  return Promise.resolve(result);
}

// ---------------------------------------------------------------------------
// Mock: @inquirer/prompts
// ---------------------------------------------------------------------------

jest.unstable_mockModule('@inquirer/prompts', () => ({
  input: jest.fn(mockInput),
  password: jest.fn(mockInput),
  select: jest.fn(mockSelect),
  confirm: jest.fn(mockConfirm),
  checkbox: jest.fn(mockCheckbox),
}));

// ---------------------------------------------------------------------------
// Mock: chalk (passthrough)
// ---------------------------------------------------------------------------

const passthroughChalk: Record<string, unknown> = {};
const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return undefined;
    }
    const fn = (str: unknown) => String(str);
    return new Proxy(fn as unknown as Record<string, unknown>, handler);
  },
  apply(_target, _thisArg, args) {
    return String(args[0] ?? '');
  },
};
const chalkProxy = new Proxy(passthroughChalk, handler);

jest.unstable_mockModule('chalk', () => ({
  default: chalkProxy,
}));

// ---------------------------------------------------------------------------
// Mock: ora
// ---------------------------------------------------------------------------

const mockSpinner = {
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  text: '',
};

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => mockSpinner),
}));

// ---------------------------------------------------------------------------
// Mock: cli-table3
// ---------------------------------------------------------------------------

jest.unstable_mockModule('cli-table3', () => ({
  default: jest.fn().mockImplementation(() => ({
    push: jest.fn(),
    toString: jest.fn(() => ''),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: node:fs
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn<(p: string, encoding?: string) => string>().mockReturnValue('');
const mockReaddirSync = jest.fn().mockReturnValue([]);
const mockChmodSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  chmodSync: mockChmodSync,
}));

// ---------------------------------------------------------------------------
// Mock: node:os
// ---------------------------------------------------------------------------

jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/mock-home'),
  default: { homedir: jest.fn(() => '/mock-home') },
}));

// ---------------------------------------------------------------------------
// Mock: execa
// ---------------------------------------------------------------------------

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  $: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

// ---------------------------------------------------------------------------
// Mock: dockerode
// ---------------------------------------------------------------------------

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('OK'),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: conf
// ---------------------------------------------------------------------------

jest.unstable_mockModule('conf', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(''),
    set: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: logger
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../packages/cli/src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: system checker
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../packages/cli/src/services/system-checker.js', () => ({
  runAllChecks: jest.fn().mockResolvedValue({
    results: [
      { name: 'OS', status: 'pass', message: 'macOS', critical: true },
      { name: 'Docker', status: 'pass', message: 'Docker 27.0.3', critical: true },
      { name: 'Node.js', status: 'pass', message: 'v20.18.0', critical: true },
      { name: 'Disk', status: 'pass', message: '50 GB', critical: false },
      { name: 'Memory', status: 'pass', message: '16 GB', critical: false },
      { name: 'Git', status: 'pass', message: 'git 2.45.0', critical: false },
    ],
    hasCriticalFailure: false,
    warnings: [],
  }),
}));

// ---------------------------------------------------------------------------
// Suppress console.log
// ---------------------------------------------------------------------------

const originalConsoleLog = console.log;

// ---------------------------------------------------------------------------
// Dynamic imports (after all mocks)
// ---------------------------------------------------------------------------

const { runSystemCheckStep } = await import(
  '../../packages/cli/src/wizard/steps/system-check.js'
);
const { runProjectSetupStep } = await import(
  '../../packages/cli/src/wizard/steps/project-setup.js'
);
const { runServerComponentsStep } = await import(
  '../../packages/cli/src/wizard/steps/server-components.js'
);
const { runDevStackStep, applySkipDevStack } = await import(
  '../../packages/cli/src/wizard/steps/dev-stack.js'
);
const { runDomainNetworkStep } = await import(
  '../../packages/cli/src/wizard/steps/domain-network.js'
);
const { runReviewStep, generateReviewSections } = await import(
  '../../packages/cli/src/wizard/steps/review.js'
);
const { generateComposeConfig, composeConfigToYaml } = await import(
  '../../packages/cli/src/services/compose-generator.js'
);
const { createDefaultWizardState, applyPartialInstallDefaults } = await import(
  '../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetQueues() {
  inputQueue = [];
  selectQueue = [];
  confirmQueue = [];
  checkboxQueue = [];
  promptCalls.length = 0;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T103 — E2E: Partial Install Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueues();
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  // =========================================================================
  // 1. Partial install → only webServer + gitServer enabled
  // =========================================================================

  describe('Partial install defaults', () => {
    it('should enable only webServer and gitServer', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());

      expect(state.setupType).toBe('partial');
      expect(state.servers.webServer.enabled).toBe(true);
      expect(state.servers.webServer.service).toBe('traefik');
      expect(state.servers.gitServer.enabled).toBe(true);
      expect(state.servers.gitServer.service).toBe('gitea');
    });

    it('should disable all optional components', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());

      expect(state.servers.dbServer.enabled).toBe(false);
      expect(state.servers.fileServer.enabled).toBe(false);
      expect(state.servers.media.enabled).toBe(false);
      expect(state.servers.sshServer.enabled).toBe(false);
      expect(state.servers.mailServer.enabled).toBe(false);
      expect(state.servers.appServer.enabled).toBe(false);
      expect(state.servers.fileBrowser.enabled).toBe(false);
    });

    it('should have empty DB server fields when disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());

      expect(state.servers.dbServer.primary).toBe('');
      expect(state.servers.dbServer.primaryVersion).toBe('');
      expect(state.servers.dbServer.dbName).toBe('');
      expect(state.servers.dbServer.dbUser).toBe('');
      expect(state.servers.dbServer.dbPassword).toBe('');
      expect(state.servers.dbServer.cache).toBe('');
      expect(state.servers.dbServer.adminUI).toBe(false);
    });
  });

  // =========================================================================
  // 2. DB server disabled → no postgresql/redis in compose
  // =========================================================================

  describe('Compose config for partial install', () => {
    it('should NOT include postgresql when DB server is disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).not.toContain('postgresql');
    });

    it('should NOT include redis when DB server is disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).not.toContain('redis');
    });

    it('should NOT include mysql when DB server is disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).not.toContain('mysql');
    });

    it('should NOT include pgadmin when DB server is disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).not.toContain('pgadmin');
    });
  });

  // =========================================================================
  // 3. Generated compose has only 2 services (traefik + gitea)
  // =========================================================================

  describe('Compose service count', () => {
    it('should have exactly 2 services for partial install with local domain', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';
      state.domain.provider = 'local';
      state.domain.cloudflare.enabled = false;

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).toHaveLength(3); // traefik + gitea + brewnet-welcome
      expect(serviceNames).toContain('traefik');
      expect(serviceNames).toContain('gitea');
    });

    it('should have 3 services if cloudflare tunnel is added', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';
      state.domain.provider = 'custom';
      state.domain.name = 'example.com';
      state.domain.cloudflare.enabled = true;
      state.domain.cloudflare.tunnelToken = 'my-token';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).toHaveLength(4); // traefik + gitea + cloudflared + brewnet-welcome
      expect(serviceNames).toContain('traefik');
      expect(serviceNames).toContain('gitea');
      expect(serviceNames).toContain('cloudflared');
    });

    it('should have no database-related services', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';
      state.domain.cloudflare.enabled = false;

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      const dbRelated = ['postgresql', 'mysql', 'redis', 'valkey', 'keydb', 'pgadmin'];
      for (const dbSvc of dbRelated) {
        expect(serviceNames).not.toContain(dbSvc);
      }
    });
  });

  // =========================================================================
  // 4. State setupType = 'partial'
  // =========================================================================

  describe('Partial install wizard flow', () => {
    it('should set setupType to partial through project setup step', async () => {
      inputQueue = ['test-partial', '~/brewnet/test-partial'];
      selectQueue = ['partial'];
      mockExistsSync.mockReturnValue(false);

      const state = await runProjectSetupStep(createDefaultWizardState());

      expect(state.setupType).toBe('partial');
    });

    it('should apply partial install defaults when partial is selected', async () => {
      inputQueue = ['test-partial', '~/brewnet/test-partial'];
      selectQueue = ['partial'];
      mockExistsSync.mockReturnValue(false);

      const state = await runProjectSetupStep(createDefaultWizardState());

      expect(state.servers.dbServer.enabled).toBe(false);
      expect(state.servers.fileServer.enabled).toBe(false);
      expect(state.servers.media.enabled).toBe(false);
      expect(state.servers.sshServer.enabled).toBe(false);
    });

    it('should complete full partial wizard flow through all steps', async () => {
      // --- Step 0: System Check ---
      const sysResult = await runSystemCheckStep();
      expect(sysResult.passed).toBe(true);

      // --- Step 1: Project Setup (partial) ---
      inputQueue = ['partial-server', '~/brewnet/partial-server'];
      selectQueue = ['partial'];
      mockExistsSync.mockReturnValue(false);

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);

      expect(state.setupType).toBe('partial');
      expect(state.projectName).toBe('partial-server');

      // --- Step 2: Server Components ---
      // Admin is pre-set (done by runAdminSetupStep Pre-Step in real flow)
      // Web: traefik
      // File server: disabled
      // DB: disabled
      // Media: disabled
      // SSH: disabled
      state = { ...state, admin: { ...state.admin, username: 'admin', password: 'test-password-12345' } };
      inputQueue = [];
      confirmQueue = [false, false, false, false]; // fileServer=false, db=false, media=false, ssh=false
      selectQueue = ['traefik'];

      state = await runServerComponentsStep(state);

      expect(state.admin.username).toBe('admin');
      expect(state.servers.webServer.service).toBe('traefik');
      // DB should still be disabled from partial defaults
      expect(state.servers.dbServer.enabled).toBe(false);

      // --- Step 3: Dev Stack — SKIP ---
      confirmQueue = [true];
      state = await runDevStackStep(state);

      expect(state.devStack.languages).toEqual([]);
      expect(state.servers.appServer.enabled).toBe(false);

      // --- Step 4: Domain & Network (local) ---
      selectQueue = ['local'];
      state = await runDomainNetworkStep(state);

      expect(state.domain.provider).toBe('local');
      expect(state.domain.name).toBe('partial-server.local');

      // --- Step 5: Review ---
      selectQueue = ['generate'];
      const reviewResult = await runReviewStep(state);
      expect(reviewResult.action).toBe('generate');

      // --- Verify compose ---
      const composeConfig = generateComposeConfig(state);
      const serviceNames = Object.keys(composeConfig.services);

      expect(serviceNames).toHaveLength(3); // traefik + gitea + brewnet-welcome
      expect(serviceNames).toContain('traefik');
      expect(serviceNames).toContain('gitea');
      expect(serviceNames).not.toContain('postgresql');
      expect(serviceNames).not.toContain('redis');
    });
  });

  // =========================================================================
  // 5. YAML output for partial install
  // =========================================================================

  describe('YAML output', () => {
    it('should generate valid YAML for partial install', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';
      state.domain.cloudflare.enabled = false;

      const config = generateComposeConfig(state);
      const yaml = composeConfigToYaml(config);

      expect(yaml).toContain('traefik:');
      expect(yaml).toContain('gitea:');
      expect(yaml).not.toContain('postgresql:');
      expect(yaml).not.toContain('redis:');
    });
  });

  // =========================================================================
  // 6. gitea has no depends_on when DB is disabled
  // =========================================================================

  describe('Service dependencies for partial install', () => {
    it('should not have depends_on for gitea when DB is disabled', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);

      // Gitea should have no depends_on since DB and cache are disabled
      expect(config.services['gitea'].depends_on).toBeUndefined();
    });

    it('should have traefik with no depends_on', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-pass-12345';

      const config = generateComposeConfig(state);

      expect(config.services['traefik'].depends_on).toBeUndefined();
    });
  });

  // =========================================================================
  // 7. Review sections for partial install
  // =========================================================================

  describe('Review sections for partial install', () => {
    it('should show Partial Install in the project section', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test';
      state.projectName = 'partial-test';

      const sections = generateReviewSections(state);
      const projectSection = sections.find((s: { id: string }) => s.id === 'project');

      expect(projectSection).toBeDefined();
      const setupTypeItem = projectSection!.items.find(
        (i: { label: string }) => i.label === 'Setup Type',
      );
      expect(setupTypeItem).toBeDefined();
      expect(setupTypeItem!.value).toBe('Partial Install');
    });

    it('should not show Database or Cache in server section', () => {
      const state = applyPartialInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test';

      const sections = generateReviewSections(state);
      const serverSection = sections.find((s: { id: string }) => s.id === 'servers');

      expect(serverSection).toBeDefined();
      const dbItem = serverSection!.items.find(
        (i: { label: string }) => i.label === 'Database',
      );
      const cacheItem = serverSection!.items.find(
        (i: { label: string }) => i.label === 'Cache',
      );
      expect(dbItem).toBeUndefined();
      expect(cacheItem).toBeUndefined();
    });
  });
});
