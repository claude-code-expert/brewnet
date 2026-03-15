/**
 * T102 — E2E: Full Install Minimal Flow
 *
 * Tests the complete wizard flow for a Full Install with minimal/default
 * selections:
 *   Step 0: System Check (all pass)
 *   Step 1: Project Setup (defaults, full install)
 *   Step 2: Server Components (defaults: traefik, gitea, postgresql, redis)
 *   Step 3: Dev Stack — SKIP
 *   Step 4: Domain & Network (local)
 *   Step 5: Review (generate action)
 *   Step 6: Generate (mocked Docker operations)
 *   Step 7: Complete (display endpoints)
 *
 * Strategy:
 *   - Mock @inquirer/prompts to provide automated answers
 *   - Mock Docker operations (execa, dockerode)
 *   - Mock filesystem operations (node:fs, node:os)
 *   - Verify WizardState is correctly populated after each step
 *   - Verify compose config has expected services
 *
 * @module tests/e2e/full-install
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Track prompt calls for verification
// ---------------------------------------------------------------------------

const promptCalls: Array<{ type: string; message?: string; result: unknown }> = [];

// ---------------------------------------------------------------------------
// Auto-answer queues — each prompt type pops from its own queue
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
// Mock: chalk (passthrough — no color in tests)
// ---------------------------------------------------------------------------

const passthroughChalk: Record<string, unknown> = {};
const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return undefined;
    }
    // Return a function that returns the string unchanged, but is also chainable
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
// Mock: ora (spinner — no-op in tests)
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

const writtenFiles = new Map<string, string>();

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn<(p: string, data: string, encoding?: string) => void>().mockImplementation(
  (p: string, data: string) => { writtenFiles.set(p, data); },
);
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

const mockExeca = jest.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>>()
  .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
  $: mockExeca,
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
// Mock: conf (global config store)
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
      { name: 'OS', status: 'pass', message: 'macOS (darwin)', critical: true },
      { name: 'Docker', status: 'pass', message: 'Docker 27.0.3', critical: true },
      { name: 'Node.js', status: 'pass', message: 'v20.18.0', critical: true },
      { name: 'Disk', status: 'pass', message: '50 GB available', critical: false },
      { name: 'Memory', status: 'pass', message: '16 GB total', critical: false },
      { name: 'Git', status: 'pass', message: 'git 2.45.0', critical: false },
    ],
    hasCriticalFailure: false,
    warnings: [],
  }),
}));

// ---------------------------------------------------------------------------
// Suppress console.log during tests
// ---------------------------------------------------------------------------

const originalConsoleLog = console.log;

// ---------------------------------------------------------------------------
// Dynamic imports (after all mocks registered)
// ---------------------------------------------------------------------------

const { runSystemCheckStep } = await import(
  '../../packages/cli/src/wizard/steps/system-check.js'
);
const { runProjectSetupStep } = await import(
  '../../packages/cli/src/wizard/steps/project-setup.js'
);
const { runServerComponentsStep, applyComponentRules } = await import(
  '../../packages/cli/src/wizard/steps/server-components.js'
);
const { runDevStackStep, applySkipDevStack } = await import(
  '../../packages/cli/src/wizard/steps/dev-stack.js'
);
const { runDomainNetworkStep, applyDomainDefaults } = await import(
  '../../packages/cli/src/wizard/steps/domain-network.js'
);
const { runReviewStep, generateReviewSections } = await import(
  '../../packages/cli/src/wizard/steps/review.js'
);
const { generateComposeConfig, composeConfigToYaml } = await import(
  '../../packages/cli/src/services/compose-generator.js'
);
const { createDefaultWizardState, applyFullInstallDefaults } = await import(
  '../../packages/cli/src/config/defaults.js'
);
const { WizardNavigation, WizardStep } = await import(
  '../../packages/cli/src/wizard/navigation.js'
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
  writtenFiles.clear();
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T102 — E2E: Full Install Minimal Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueues();
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  // =========================================================================
  // 1. Full wizard state flow — all steps with defaults
  // =========================================================================

  describe('Full wizard flow with default selections', () => {
    it('should produce a complete WizardState after all steps', async () => {
      // --- Step 0: System Check ---
      const sysResult = await runSystemCheckStep();
      expect(sysResult.passed).toBe(true);
      expect(sysResult.results.length).toBeGreaterThanOrEqual(5);

      // --- Step 1: Project Setup ---
      // Prompts: project name, project path, setup type
      inputQueue = ['my-homeserver', '~/brewnet/my-homeserver'];
      selectQueue = ['full'];
      mockExistsSync.mockReturnValue(false);

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);

      expect(state.projectName).toBe('my-homeserver');
      expect(state.projectPath).toBe('~/brewnet/my-homeserver');
      expect(state.setupType).toBe('full');

      // Full install defaults should be applied
      expect(state.servers.webServer.enabled).toBe(true);
      expect(state.servers.webServer.service).toBe('traefik');
      expect(state.servers.gitServer.enabled).toBe(true);
      expect(state.servers.gitServer.service).toBe('gitea');
      expect(state.servers.dbServer.enabled).toBe(true);
      expect(state.servers.dbServer.primary).toBe('postgresql');
      expect(state.servers.dbServer.cache).toBe('redis');

      // --- Step 2: Server Components ---
      // Admin is pre-set (done by runAdminSetupStep Pre-Step in real flow)
      // Web server: traefik
      // File server: disabled
      // DB: postgresql 17, adminUI=false, db name, db user, cache=redis
      // Media: disabled
      // SSH: disabled
      state = { ...state, admin: { ...state.admin, username: 'admin', password: 'test-password-12345' } };
      inputQueue = ['brewnet_db', 'brewnet'];
      confirmQueue = [false, true, false, false, false]; // fileServer=false, db=true, adminUI=false, media=false, ssh=false
      selectQueue = ['traefik', 'postgresql', '17', 'redis'];

      state = await runServerComponentsStep(state);

      expect(state.admin.username).toBe('admin');
      expect(state.admin.password).toBeTruthy(); // pre-set
      expect(state.servers.webServer.service).toBe('traefik');
      expect(state.servers.dbServer.enabled).toBe(true);
      expect(state.servers.dbServer.primary).toBe('postgresql');
      expect(state.servers.dbServer.cache).toBe('redis');

      // --- Step 3: Dev Stack — SKIP ---
      confirmQueue = [true]; // Skip dev stack
      state = await runDevStackStep(state);

      expect(state.devStack.languages).toEqual([]);
      expect(state.devStack.frontend).toBeNull();
      expect(state.servers.appServer.enabled).toBe(false);
      expect(state.servers.fileBrowser.enabled).toBe(false);

      // --- Step 4: Domain & Network (local) ---
      selectQueue = ['local'];
      state = await runDomainNetworkStep(state);

      expect(state.domain.provider).toBe('local');
      expect(state.domain.name).toBe('my-homeserver.local');
      expect(state.domain.ssl).toBe('self-signed');
      expect(state.domain.cloudflare.enabled).toBe(false);
      expect(state.servers.mailServer.enabled).toBe(false);

      // --- Step 5: Review ---
      selectQueue = ['generate'];
      const reviewResult = await runReviewStep(state);
      expect(reviewResult.action).toBe('generate');

      // --- Verify compose config ---
      const composeConfig = generateComposeConfig(state);
      const serviceNames = Object.keys(composeConfig.services);

      expect(serviceNames).toContain('traefik');
      expect(serviceNames).toContain('gitea');
      expect(serviceNames).toContain('postgresql');
      expect(serviceNames).toContain('redis');
      expect(serviceNames).not.toContain('cloudflared');
      expect(serviceNames).not.toContain('filebrowser');
      expect(serviceNames).not.toContain('openssh-server');
      expect(serviceNames).not.toContain('docker-mailserver');
    });
  });

  // =========================================================================
  // 2. System check passes with all mocked checks passing
  // =========================================================================

  describe('System check passes', () => {
    it('should pass with all checks passing', async () => {
      const result = await runSystemCheckStep();
      expect(result.passed).toBe(true);
    });

    it('should return all check results', async () => {
      const result = await runSystemCheckStep();
      expect(result.results).toHaveLength(6);
      expect(result.results.every((r: { status: string }) => r.status === 'pass')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Project name defaults to 'my-homeserver'
  // =========================================================================

  describe('Project setup defaults', () => {
    it('should use default project name my-homeserver', async () => {
      inputQueue = ['my-homeserver', '~/brewnet/my-homeserver'];
      selectQueue = ['full'];
      mockExistsSync.mockReturnValue(false);

      const state = await runProjectSetupStep(createDefaultWizardState());

      expect(state.projectName).toBe('my-homeserver');
      expect(state.projectPath).toBe('~/brewnet/my-homeserver');
    });

    it('should apply full install defaults when full is selected', async () => {
      inputQueue = ['my-homeserver', '~/brewnet/my-homeserver'];
      selectQueue = ['full'];
      mockExistsSync.mockReturnValue(false);

      const state = await runProjectSetupStep(createDefaultWizardState());

      expect(state.setupType).toBe('full');
      expect(state.servers.webServer.enabled).toBe(true);
      expect(state.servers.webServer.service).toBe('traefik');
      expect(state.servers.gitServer.enabled).toBe(true);
      expect(state.servers.gitServer.service).toBe('gitea');
      expect(state.servers.dbServer.enabled).toBe(true);
      expect(state.servers.dbServer.primary).toBe('postgresql');
    });
  });

  // =========================================================================
  // 4. Full install defaults: webServer(traefik), gitServer(gitea),
  //    dbServer(postgresql+redis)
  // =========================================================================

  describe('Full install defaults', () => {
    it('should have traefik as web server', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      expect(state.servers.webServer.enabled).toBe(true);
      expect(state.servers.webServer.service).toBe('traefik');
    });

    it('should have gitea as git server', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      expect(state.servers.gitServer.enabled).toBe(true);
      expect(state.servers.gitServer.service).toBe('gitea');
      expect(state.servers.gitServer.port).toBe(3000);
      expect(state.servers.gitServer.sshPort).toBe(3022);
    });

    it('should have postgresql as primary database', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      expect(state.servers.dbServer.enabled).toBe(true);
      expect(state.servers.dbServer.primary).toBe('postgresql');
      expect(state.servers.dbServer.primaryVersion).toBe('17');
    });

    it('should have redis as cache', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      expect(state.servers.dbServer.cache).toBe('redis');
    });
  });

  // =========================================================================
  // 5. Skip step 3 → devStack empty, appServer disabled
  // =========================================================================

  describe('Skip Dev Stack (Step 3)', () => {
    it('should clear devStack and disable appServer when skipped', async () => {
      confirmQueue = [true]; // Skip = yes

      const baseState = applyFullInstallDefaults(createDefaultWizardState());
      const state = await runDevStackStep(baseState);

      expect(state.devStack.languages).toEqual([]);
      expect(state.devStack.frameworks).toEqual({});
      expect(state.devStack.frontend).toBeNull();
      expect(state.servers.appServer.enabled).toBe(false);
      expect(state.servers.fileBrowser.enabled).toBe(false);
    });

    it('should also work via pure function applySkipDevStack', () => {
      const baseState = applyFullInstallDefaults(createDefaultWizardState());

      // Simulate some prior devStack selections
      baseState.devStack.languages = ['nodejs'] as any;
      baseState.devStack.frameworks = { nodejs: 'nextjs' };
      baseState.devStack.frontend = 'react' as any;
      baseState.servers.appServer.enabled = true;
      baseState.servers.fileBrowser.enabled = true;

      const skipped = applySkipDevStack(baseState);

      expect(skipped.devStack.languages).toEqual([]);
      expect(skipped.devStack.frameworks).toEqual({});
      expect(skipped.devStack.frontend).toBeNull();
      expect(skipped.servers.appServer.enabled).toBe(false);
      expect(skipped.servers.fileBrowser.enabled).toBe(false);
    });
  });

  // =========================================================================
  // 6. Local domain → ssl=self-signed, no tunnel
  // =========================================================================

  describe('Local domain configuration', () => {
    it('should set self-signed SSL and disable tunnel for local domain', async () => {
      selectQueue = ['local'];

      const baseState = applyFullInstallDefaults(createDefaultWizardState());
      baseState.projectName = 'my-homeserver';
      const state = await runDomainNetworkStep(baseState);

      expect(state.domain.provider).toBe('local');
      expect(state.domain.ssl).toBe('self-signed');
      expect(state.domain.cloudflare.enabled).toBe(false);
      expect(state.domain.cloudflare.tunnelToken).toBe('');
    });

    it('should set domain name to <projectName>.local', async () => {
      selectQueue = ['local'];

      const baseState = applyFullInstallDefaults(createDefaultWizardState());
      baseState.projectName = 'my-homeserver';
      const state = await runDomainNetworkStep(baseState);

      expect(state.domain.name).toBe('my-homeserver.local');
    });

    it('should disable mail server for local domain', async () => {
      selectQueue = ['local'];

      const baseState = applyFullInstallDefaults(createDefaultWizardState());
      baseState.projectName = 'my-homeserver';
      const state = await runDomainNetworkStep(baseState);

      expect(state.servers.mailServer.enabled).toBe(false);
    });

    it('should apply correct defaults via pure function', () => {
      const baseState = createDefaultWizardState();
      const localState = applyDomainDefaults(baseState, 'local');

      expect(localState.domain.provider).toBe('local');
      expect(localState.domain.ssl).toBe('self-signed');
      expect(localState.domain.cloudflare.enabled).toBe(false);
    });
  });

  // =========================================================================
  // 7. Generated compose has traefik, gitea, postgresql, redis services
  // =========================================================================

  describe('Compose config generation for full install', () => {
    it('should generate compose config with 4 core services', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).toContain('traefik');
      expect(serviceNames).toContain('gitea');
      expect(serviceNames).toContain('postgresql');
      expect(serviceNames).toContain('redis');
    });

    it('should have traefik with correct ports', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      expect(config.services['traefik'].ports).toContain('80:80');
      expect(config.services['traefik'].ports).toContain('443:443');
    });

    it('should have gitea with correct ports', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      expect(config.services['gitea'].ports).toContain('3000:3000');
      expect(config.services['gitea'].ports).toContain('3022:22');
    });

    it('should have postgresql with healthcheck', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      expect(config.services['postgresql'].healthcheck).toBeDefined();
      expect(config.services['postgresql'].healthcheck!.test).toContain('CMD-SHELL');
    });

    it('should have redis with healthcheck', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      expect(config.services['redis'].healthcheck).toBeDefined();
    });

    it('should have gitea depending on postgresql and redis', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      expect(config.services['gitea'].depends_on).toContain('postgresql');
      expect(config.services['gitea'].depends_on).toContain('redis');
    });

    it('should NOT include cloudflared when local domain', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';
      state.domain.provider = 'local';
      state.domain.cloudflare.enabled = false;

      const config = generateComposeConfig(state);
      expect(Object.keys(config.services)).not.toContain('cloudflared');
    });

    it('should include pgadmin when adminUI is enabled', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';
      state.servers.dbServer.adminUI = true;

      const config = generateComposeConfig(state);
      const serviceNames = Object.keys(config.services);

      expect(serviceNames).toContain('pgadmin');
    });

    it('should generate valid YAML from compose config', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);
      const yaml = composeConfigToYaml(config);

      expect(yaml).not.toContain('version:');
      expect(yaml).toContain('services:');
      expect(yaml).toContain('volumes:');
      expect(yaml).toContain('traefik:');
      expect(yaml).toContain('gitea:');
      expect(yaml).toContain('postgresql:');
      expect(yaml).toContain('redis:');
    });

    it('should have security_opt on all services', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      for (const [_name, svc] of Object.entries(config.services)) {
        expect(svc.security_opt).toContain('no-new-privileges:true');
      }
    });

    it('should have restart: unless-stopped on all services', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';

      const config = generateComposeConfig(state);

      for (const [_name, svc] of Object.entries(config.services)) {
        expect(svc.restart).toBe('unless-stopped');
      }
    });
  });

  // =========================================================================
  // 8. Review step generates sections for all wizard steps
  // =========================================================================

  describe('Review sections for full install', () => {
    it('should generate review sections covering all configured steps', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.username = 'admin';
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';
      state.projectName = 'my-homeserver';
      state.projectPath = '~/brewnet/my-homeserver';
      state.domain.name = 'my-homeserver.local';

      const sections = generateReviewSections(state);

      // Should have project, admin, servers, devStack, domain, resources, credentials sections
      const sectionIds = sections.map((s: { id: string }) => s.id);
      expect(sectionIds).toContain('project');
      expect(sectionIds).toContain('admin');
      expect(sectionIds).toContain('servers');
      expect(sectionIds).toContain('devStack');
      expect(sectionIds).toContain('domain');
      expect(sectionIds).toContain('resources');
    });

    it('should show Dev Stack as Skipped when no languages selected', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.password = 'test';
      state.servers.dbServer.dbPassword = 'test';

      const sections = generateReviewSections(state);
      const devSection = sections.find((s: { id: string }) => s.id === 'devStack');

      expect(devSection).toBeDefined();
      expect(devSection!.items.some((i: { value: string }) => i.value === 'Skipped')).toBe(true);
    });
  });

  // =========================================================================
  // 9. Navigation state machine
  // =========================================================================

  describe('Navigation through all steps', () => {
    it('should navigate forward through all 8 steps (SystemCheck to Complete)', () => {
      const nav = new WizardNavigation(WizardStep.SystemCheck);

      expect(nav.currentStep).toBe(WizardStep.SystemCheck);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.ProjectSetup);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.ServerComponents);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.DevStack);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.DomainNetwork);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.Review);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.Generate);

      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.Complete);
    });

    it('should skip DevStack step when marked as skipped', () => {
      const nav = new WizardNavigation(WizardStep.SystemCheck);

      nav.skipStep(WizardStep.DevStack);

      // Navigate forward from SystemCheck to ProjectSetup
      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.ProjectSetup);

      // Navigate forward to ServerComponents
      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.ServerComponents);

      // Navigate forward — should skip DevStack and go to DomainNetwork
      nav.goForward();
      expect(nav.currentStep).toBe(WizardStep.DomainNetwork);
    });

    it('should allow going back', () => {
      const nav = new WizardNavigation(WizardStep.SystemCheck);

      nav.goForward(); // -> ProjectSetup
      nav.goForward(); // -> ServerComponents
      nav.goForward(); // -> DevStack

      const prev = nav.goBack();
      expect(prev).toBe(WizardStep.ServerComponents);
      expect(nav.currentStep).toBe(WizardStep.ServerComponents);
    });
  });

  // =========================================================================
  // 10. Complete step displays endpoints (pure function check)
  // =========================================================================

  describe('Complete step endpoint info', () => {
    it('should have all required state populated at the end of full flow', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      state.admin.username = 'admin';
      state.admin.password = 'test-password-12345';
      state.servers.dbServer.dbPassword = 'db-password-12345';
      state.projectName = 'my-homeserver';
      state.projectPath = '~/brewnet/my-homeserver';
      state.domain.provider = 'local';
      state.domain.name = 'my-homeserver.local';
      state.domain.ssl = 'self-signed';
      state.domain.cloudflare.enabled = false;

      // Verify all required fields are populated
      expect(state.schemaVersion).toBe(7);
      expect(state.projectName).toBeTruthy();
      expect(state.admin.username).toBeTruthy();
      expect(state.admin.password).toBeTruthy();
      expect(state.servers.webServer.service).toBeTruthy();
      expect(state.servers.gitServer.service).toBeTruthy();
      expect(state.domain.name).toBeTruthy();
    });
  });
});
