/**
 * T104 — E2E: Wizard Resume Flow
 *
 * Tests wizard state persistence and resume:
 *   1. State saved after each step
 *   2. hasResumeState() returns true after partial completion
 *   3. Loading state restores all previous selections
 *   4. Schema version validated during load
 *
 * Strategy:
 *   - Use in-memory storage to simulate filesystem persistence
 *   - Mock node:fs to capture save/load operations
 *   - Test the save→load round-trip at each wizard step
 *   - Verify schema version migration behavior
 *
 * @module tests/e2e/wizard-resume
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// In-memory filesystem for state persistence
// ---------------------------------------------------------------------------

/** Simulates the filesystem for ~/.brewnet/projects/... */
const memoryFS = new Map<string, string>();

// ---------------------------------------------------------------------------
// Auto-answer queues
// ---------------------------------------------------------------------------

let inputQueue: unknown[] = [];
let selectQueue: unknown[] = [];
let confirmQueue: unknown[] = [];
let checkboxQueue: unknown[] = [];

const promptCalls: Array<{ type: string; message?: string; result: unknown }> = [];

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

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  })),
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
// Mock: node:fs — uses memoryFS for state persistence
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(p: string) => boolean>().mockImplementation(
  (p: string) => memoryFS.has(p),
);
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn<(p: string, data: string, encoding?: string) => void>().mockImplementation(
  (p: string, data: string) => { memoryFS.set(p, data); },
);
const mockReadFileSync = jest.fn<(p: string, encoding?: string) => string>().mockImplementation(
  (p: string) => memoryFS.get(p) ?? '',
);
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

const mockConfGet = jest.fn().mockReturnValue('');
const mockConfSet = jest.fn();

jest.unstable_mockModule('conf', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: mockConfGet,
    set: mockConfSet,
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

const {
  createState,
  saveState,
  loadState,
  hasResumeState,
  resetState,
  getStateFilePath,
  _resetGlobalConfig,
} = await import('../../packages/cli/src/wizard/state.js');

const { runProjectSetupStep } = await import(
  '../../packages/cli/src/wizard/steps/project-setup.js'
);
const { runServerComponentsStep } = await import(
  '../../packages/cli/src/wizard/steps/server-components.js'
);
const { runDevStackStep } = await import(
  '../../packages/cli/src/wizard/steps/dev-stack.js'
);
const { runDomainNetworkStep } = await import(
  '../../packages/cli/src/wizard/steps/domain-network.js'
);
const { createDefaultWizardState, applyFullInstallDefaults } = await import(
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

describe('T104 — E2E: Wizard Resume Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueues();
    memoryFS.clear();
    _resetGlobalConfig();
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  // =========================================================================
  // 1. State saved after each step
  // =========================================================================

  describe('State persistence after each step', () => {
    it('should save state after Step 1 (Project Setup)', async () => {
      inputQueue = ['resume-project', '~/brewnet/resume-project'];
      selectQueue = ['full'];

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);

      // Save state manually (as the orchestrator would)
      saveState(state);

      const filePath = getStateFilePath('resume-project');
      expect(memoryFS.has(filePath)).toBe(true);

      const saved = JSON.parse(memoryFS.get(filePath)!);
      expect(saved.projectName).toBe('resume-project');
      expect(saved.setupType).toBe('full');
    });

    it('should save state after Step 2 (Server Components)', async () => {
      // Step 1
      inputQueue = ['persist-test', '~/brewnet/persist-test'];
      selectQueue = ['full'];

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);
      saveState(state);

      // Step 2
      inputQueue = ['admin', 'brewnet_db', 'brewnet'];
      confirmQueue = [true, false, true, true, false, false];
      selectQueue = ['traefik', 'postgresql', '17', 'redis'];

      state = await runServerComponentsStep(state);
      saveState(state);

      const filePath = getStateFilePath('persist-test');
      const saved = JSON.parse(memoryFS.get(filePath)!);
      expect(saved.admin.username).toBe('admin');
      expect(saved.admin.password).toBeTruthy();
      expect(saved.servers.webServer.service).toBe('traefik');
    });

    it('should save state after Step 3 (Dev Stack — skip)', async () => {
      let state = applyFullInstallDefaults(createDefaultWizardState());
      state = { ...state, projectName: 'devstack-test', admin: { ...state.admin, password: 'test-pw' } };

      confirmQueue = [true]; // Skip
      state = await runDevStackStep(state);
      saveState(state);

      const filePath = getStateFilePath('devstack-test');
      const saved = JSON.parse(memoryFS.get(filePath)!);
      expect(saved.devStack.languages).toEqual([]);
      expect(saved.servers.appServer.enabled).toBe(false);
    });

    it('should save state after Step 4 (Domain & Network)', async () => {
      let state = applyFullInstallDefaults(createDefaultWizardState());
      state = { ...state, projectName: 'domain-test', admin: { ...state.admin, password: 'test-pw' } };

      selectQueue = ['local'];
      state = await runDomainNetworkStep(state);
      saveState(state);

      const filePath = getStateFilePath('domain-test');
      const saved = JSON.parse(memoryFS.get(filePath)!);
      expect(saved.domain.provider).toBe('local');
      expect(saved.domain.name).toBe('domain-test.local');
      expect(saved.domain.ssl).toBe('self-signed');
    });
  });

  // =========================================================================
  // 2. hasResumeState() returns true after partial completion
  // =========================================================================

  describe('Resume detection', () => {
    it('should return false before any state is saved', () => {
      expect(hasResumeState('new-project')).toBe(false);
    });

    it('should return true after state is saved', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'saved-project';
      saveState(state as any);

      expect(hasResumeState('saved-project')).toBe(true);
    });

    it('should return true after partial wizard completion (step 1 only)', async () => {
      inputQueue = ['partial-completion', '~/brewnet/partial-completion'];
      selectQueue = ['full'];

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);
      saveState(state);

      expect(hasResumeState('partial-completion')).toBe(true);
    });

    it('should return false for a different project name', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'project-a';
      saveState(state as any);

      expect(hasResumeState('project-a')).toBe(true);
      expect(hasResumeState('project-b')).toBe(false);
    });
  });

  // =========================================================================
  // 3. Loading state restores all previous selections
  // =========================================================================

  describe('State restoration', () => {
    it('should restore project name and setup type after save/load', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'restore-test';
      (state as any).setupType = 'full';
      (state as any).projectPath = '~/brewnet/restore-test';
      saveState(state as any);

      const loaded = loadState('restore-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.projectName).toBe('restore-test');
      expect(loaded!.setupType).toBe('full');
      expect(loaded!.projectPath).toBe('~/brewnet/restore-test');
    });

    it('should restore admin credentials after save/load', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'cred-test';
      state.admin.username = 'custom-admin';
      state.admin.password = 'super-secret-pw';
      saveState(state as any);

      const loaded = loadState('cred-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.admin.username).toBe('custom-admin');
      expect(loaded!.admin.password).toBe('super-secret-pw');
    });

    it('should restore server component selections after save/load', () => {
      const state = applyFullInstallDefaults(createDefaultWizardState());
      (state as any).projectName = 'server-restore';
      state.servers.dbServer.dbPassword = 'db-pw-123';
      state.servers.sshServer.enabled = true;
      state.servers.sshServer.port = 2222;
      state.servers.sshServer.passwordAuth = false;
      state.servers.sshServer.sftp = true;
      state.servers.media.enabled = true;
      state.servers.media.services = ['jellyfin'];
      saveState(state as any);

      const loaded = loadState('server-restore');
      expect(loaded).not.toBeNull();
      expect(loaded!.servers.webServer.service).toBe('traefik');
      expect(loaded!.servers.gitServer.service).toBe('gitea');
      expect(loaded!.servers.dbServer.primary).toBe('postgresql');
      expect(loaded!.servers.dbServer.cache).toBe('redis');
      expect(loaded!.servers.sshServer.enabled).toBe(true);
      expect(loaded!.servers.sshServer.sftp).toBe(true);
      expect(loaded!.servers.media.enabled).toBe(true);
      expect(loaded!.servers.media.services).toEqual(['jellyfin']);
    });

    it('should restore devStack selections after save/load', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'devstack-restore';
      state.devStack.languages = ['nodejs', 'python'] as any;
      state.devStack.frameworks = { nodejs: 'nextjs', python: 'fastapi' };
      state.devStack.frontend = ['reactjs', 'typescript'] as any;
      saveState(state as any);

      const loaded = loadState('devstack-restore');
      expect(loaded).not.toBeNull();
      expect(loaded!.devStack.languages).toEqual(['nodejs', 'python']);
      expect(loaded!.devStack.frameworks).toEqual({ nodejs: 'nextjs', python: 'fastapi' });
      expect(loaded!.devStack.frontend).toEqual(['reactjs', 'typescript']);
    });

    it('should restore domain configuration after save/load', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'domain-restore';
      state.domain.provider = 'custom' as any;
      state.domain.name = 'myserver.dev';
      state.domain.ssl = 'letsencrypt' as any;
      state.domain.cloudflare.enabled = true;
      state.domain.cloudflare.tunnelToken = 'cf-token-abc';
      state.domain.cloudflare.tunnelName = 'my-tunnel';
      saveState(state as any);

      const loaded = loadState('domain-restore');
      expect(loaded).not.toBeNull();
      expect(loaded!.domain.provider).toBe('custom');
      expect(loaded!.domain.name).toBe('myserver.dev');
      expect(loaded!.domain.ssl).toBe('letsencrypt');
      expect(loaded!.domain.cloudflare.enabled).toBe(true);
      expect(loaded!.domain.cloudflare.tunnelToken).toBe('cf-token-abc');
      expect(loaded!.domain.cloudflare.tunnelName).toBe('my-tunnel');
    });

    it('should restore boilerplate configuration after save/load', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'boilerplate-restore';
      state.boilerplate.generate = false;
      state.boilerplate.sampleData = false;
      state.boilerplate.devMode = 'production' as any;
      saveState(state as any);

      const loaded = loadState('boilerplate-restore');
      expect(loaded).not.toBeNull();
      expect(loaded!.boilerplate.generate).toBe(false);
      expect(loaded!.boilerplate.sampleData).toBe(false);
      expect(loaded!.boilerplate.devMode).toBe('production');
    });

    it('should restore state with all fields intact after multi-step wizard', async () => {
      // Step 1: Project Setup
      inputQueue = ['multistep-test', '~/brewnet/multistep-test'];
      selectQueue = ['full'];

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);
      saveState(state);

      // Step 2: Server Components
      inputQueue = ['admin', 'brewnet_db', 'brewnet'];
      confirmQueue = [true, false, true, true, false, false];
      selectQueue = ['traefik', 'postgresql', '17', 'redis'];

      state = await runServerComponentsStep(state);
      saveState(state);

      // Load and verify multi-step state
      const loaded = loadState('multistep-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.projectName).toBe('multistep-test');
      expect(loaded!.setupType).toBe('full');
      expect(loaded!.admin.username).toBe('admin');
      expect(loaded!.servers.webServer.service).toBe('traefik');
      expect(loaded!.servers.dbServer.primary).toBe('postgresql');
      expect(loaded!.servers.dbServer.cache).toBe('redis');
    });
  });

  // =========================================================================
  // 4. Schema version validated during load
  // =========================================================================

  describe('Schema version validation', () => {
    it('should accept state with current schema version (5)', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'version-5';
      saveState(state as any);

      const loaded = loadState('version-5');
      expect(loaded).not.toBeNull();
      expect(loaded!.schemaVersion).toBe(5);
    });

    it('should reject state with schema version 4 (older)', () => {
      const filePath = getStateFilePath('old-v4');
      const state = { ...createDefaultWizardState(), schemaVersion: 4, projectName: 'old-v4' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('old-v4');
      expect(loaded).toBeNull();
    });

    it('should reject state with schema version 3 (older)', () => {
      const filePath = getStateFilePath('old-v3');
      const state = { ...createDefaultWizardState(), schemaVersion: 3, projectName: 'old-v3' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('old-v3');
      expect(loaded).toBeNull();
    });

    it('should reject state with schema version 1 (very old)', () => {
      const filePath = getStateFilePath('old-v1');
      const state = { ...createDefaultWizardState(), schemaVersion: 1, projectName: 'old-v1' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('old-v1');
      expect(loaded).toBeNull();
    });

    it('should reject state with future schema version (99)', () => {
      const filePath = getStateFilePath('future-v99');
      const state = { ...createDefaultWizardState(), schemaVersion: 99, projectName: 'future-v99' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('future-v99');
      expect(loaded).toBeNull();
    });

    it('should reject state with missing schema version', () => {
      const filePath = getStateFilePath('no-version');
      const state = { projectName: 'no-version' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('no-version');
      expect(loaded).toBeNull();
    });

    it('should reject state with string schema version', () => {
      const filePath = getStateFilePath('string-version');
      const state = { ...createDefaultWizardState(), schemaVersion: 'five', projectName: 'string-version' };
      memoryFS.set(filePath, JSON.stringify(state));

      const loaded = loadState('string-version');
      expect(loaded).toBeNull();
    });

    it('should reject corrupted JSON', () => {
      const filePath = getStateFilePath('corrupt');
      memoryFS.set(filePath, '{ this is not valid JSON!!!');

      const loaded = loadState('corrupt');
      expect(loaded).toBeNull();
    });

    it('should reject non-object JSON (string)', () => {
      const filePath = getStateFilePath('string-state');
      memoryFS.set(filePath, '"just a string"');

      const loaded = loadState('string-state');
      expect(loaded).toBeNull();
    });

    it('should reject null JSON', () => {
      const filePath = getStateFilePath('null-state');
      memoryFS.set(filePath, 'null');

      const loaded = loadState('null-state');
      expect(loaded).toBeNull();
    });
  });

  // =========================================================================
  // 5. resetState creates a fresh default
  // =========================================================================

  describe('Reset state (start fresh)', () => {
    it('should create a fresh state and save it', () => {
      // First, save some state
      const originalState = applyFullInstallDefaults(createDefaultWizardState());
      (originalState as any).projectName = 'reset-me';
      originalState.admin.password = 'original-pw';
      originalState.devStack.languages = ['nodejs'] as any;
      saveState(originalState as any);

      // Verify it was saved
      expect(hasResumeState('reset-me')).toBe(true);

      // Reset
      const freshState = resetState('reset-me');

      // Should have default values
      expect(freshState.admin.password).toBe(''); // cleared
      expect(freshState.devStack.languages).toEqual([]); // cleared
      expect(freshState.projectName).toBe('reset-me'); // preserved
      expect(freshState.schemaVersion).toBe(5);
    });

    it('should overwrite the saved state with defaults', () => {
      const originalState = createDefaultWizardState();
      (originalState as any).projectName = 'overwrite-test';
      originalState.admin.username = 'custom-admin';
      saveState(originalState as any);

      // Reset
      resetState('overwrite-test');

      // Load the reset state
      const loaded = loadState('overwrite-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.admin.username).toBe('admin'); // default, not 'custom-admin'
      expect(loaded!.projectName).toBe('overwrite-test');
    });
  });

  // =========================================================================
  // 6. Multiple projects can be persisted independently
  // =========================================================================

  describe('Multiple project persistence', () => {
    it('should maintain separate state for different project names', () => {
      const stateA = createDefaultWizardState();
      (stateA as any).projectName = 'project-a';
      stateA.admin.username = 'admin-a';
      saveState(stateA as any);

      const stateB = createDefaultWizardState();
      (stateB as any).projectName = 'project-b';
      stateB.admin.username = 'admin-b';
      stateB.setupType = 'partial' as any;
      saveState(stateB as any);

      const loadedA = loadState('project-a');
      const loadedB = loadState('project-b');

      expect(loadedA).not.toBeNull();
      expect(loadedB).not.toBeNull();
      expect(loadedA!.admin.username).toBe('admin-a');
      expect(loadedB!.admin.username).toBe('admin-b');
      expect(loadedA!.setupType).toBe('full');
      expect(loadedB!.setupType).toBe('partial');
    });

    it('should not interfere between projects on save/load', () => {
      const stateA = createDefaultWizardState();
      (stateA as any).projectName = 'proj-x';
      saveState(stateA as any);

      const stateB = createDefaultWizardState();
      (stateB as any).projectName = 'proj-y';
      stateB.admin.password = 'different-pw';
      saveState(stateB as any);

      // Loading proj-x should not return proj-y's password
      const loadedA = loadState('proj-x');
      expect(loadedA!.admin.password).toBe(''); // default, not 'different-pw'

      const loadedB = loadState('proj-y');
      expect(loadedB!.admin.password).toBe('different-pw');
    });
  });

  // =========================================================================
  // 7. Resume after partial wizard completion
  // =========================================================================

  describe('Resume wizard from saved step', () => {
    it('should resume with Step 1 selections intact after interrupted wizard', async () => {
      // Simulate: user completes Step 1, then wizard is interrupted
      inputQueue = ['interrupted-project', '~/brewnet/interrupted-project'];
      selectQueue = ['full'];

      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);
      saveState(state);

      // Simulate: user restarts wizard → load previous state
      const resumed = loadState('interrupted-project');
      expect(resumed).not.toBeNull();
      expect(resumed!.projectName).toBe('interrupted-project');
      expect(resumed!.setupType).toBe('full');
      expect(resumed!.servers.webServer.enabled).toBe(true);

      // User can continue from Step 2 with the loaded state
      // (The orchestrator would check hasResumeState and loadState,
      //  then jump to the appropriate step)
    });

    it('should resume with Step 2 selections intact', async () => {
      // Step 1
      inputQueue = ['resume-step2', '~/brewnet/resume-step2'];
      selectQueue = ['full'];
      let state = createDefaultWizardState();
      state = await runProjectSetupStep(state);

      // Step 2
      inputQueue = ['admin', 'brewnet_db', 'brewnet'];
      confirmQueue = [true, false, true, true, false, false];
      selectQueue = ['traefik', 'postgresql', '17', 'redis'];
      state = await runServerComponentsStep(state);
      saveState(state);

      // Resume
      const resumed = loadState('resume-step2');
      expect(resumed).not.toBeNull();
      expect(resumed!.admin.username).toBe('admin');
      expect(resumed!.admin.password).toBeTruthy();
      expect(resumed!.servers.webServer.service).toBe('traefik');
      expect(resumed!.servers.dbServer.primary).toBe('postgresql');
    });

    it('should resume with Step 4 domain selections intact', async () => {
      let state = applyFullInstallDefaults(createDefaultWizardState());
      state = { ...state, projectName: 'resume-domain', admin: { ...state.admin, password: 'pw' } };

      selectQueue = ['local'];
      state = await runDomainNetworkStep(state);
      saveState(state);

      const resumed = loadState('resume-domain');
      expect(resumed).not.toBeNull();
      expect(resumed!.domain.provider).toBe('local');
      expect(resumed!.domain.name).toBe('resume-domain.local');
      expect(resumed!.domain.ssl).toBe('self-signed');
      expect(resumed!.domain.cloudflare.enabled).toBe(false);
    });
  });

  // =========================================================================
  // 8. Global config tracks last project
  // =========================================================================

  describe('Global config last project tracking', () => {
    it('should update last project on save', () => {
      const state = createDefaultWizardState();
      (state as any).projectName = 'tracked-project';
      saveState(state as any);

      expect(mockConfSet).toHaveBeenCalledWith('lastProject', 'tracked-project');
    });

    it('should update last project to the most recently saved project', () => {
      const stateA = createDefaultWizardState();
      (stateA as any).projectName = 'first-project';
      saveState(stateA as any);

      const stateB = createDefaultWizardState();
      (stateB as any).projectName = 'second-project';
      saveState(stateB as any);

      // Last call to set should be for 'second-project'
      const lastCall = mockConfSet.mock.calls[mockConfSet.mock.calls.length - 1];
      expect(lastCall).toEqual(['lastProject', 'second-project']);
    });
  });
});
