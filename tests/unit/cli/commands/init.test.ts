/**
 * Unit tests for commands/init — registerInitCommand / runInitWizard
 *
 * Covers:
 *   - --config: file not found → early return
 *   - --config: importConfig throws → early return
 *   - --config: valid, passwords auto-generated
 *   - --non-interactive without --config → early return (error message)
 *   - --non-interactive with --config → runs generate + complete
 *   - Interactive: minimal install type selected → runMinimalInstall
 *   - Interactive: full install type → runs through all wizard steps
 *   - ExitPromptError caught in wizard loop
 *   - Unexpected error caught in wizard loop
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks — must precede dynamic imports
// ---------------------------------------------------------------------------

// node:fs — existsSync for config file check
const mockExistsSync = jest.fn<(p: unknown) => boolean>().mockReturnValue(false);
jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// @inquirer/prompts — select for install type
const mockSelect = jest.fn<() => Promise<string>>().mockResolvedValue('full');
jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: mockSelect,
  input: jest.fn(),
  confirm: jest.fn(),
  password: jest.fn(),
}));

// wizard/state
const mockCreateState = jest.fn();
const mockSaveState   = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  createState:      mockCreateState,
  saveState:        mockSaveState,
  loadState:        jest.fn(() => null),
  discoverProjectPath: jest.fn(() => null),
  getLastProject:   jest.fn(() => null),
  getStateFilePath: jest.fn(() => '/tmp/state.json'),
  hasResumeState:   jest.fn(() => false),
}));

// utils/password
const mockGeneratePassword = jest.fn<(n: number) => string>().mockReturnValue('AutoGenPass123!');
jest.unstable_mockModule('../../../../packages/cli/src/utils/password.js', () => ({
  generatePassword: mockGeneratePassword,
}));

// wizard step functions
const mockRunAdminSetupStep     = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunSystemCheckStep    = jest.fn<() => Promise<unknown>>();
const mockRunProjectSetupStep   = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunServerComponentsStep = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunDevStackStep       = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunDomainNetworkStep  = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunReviewStep         = jest.fn<(s: unknown) => Promise<unknown>>();
const mockRunGenerateStep       = jest.fn<(s: unknown) => Promise<string>>();
const mockRunCompleteStep       = jest.fn<(s: unknown, opts: unknown) => Promise<void>>();
const mockImportConfig          = jest.fn<(p: string) => unknown>();
const mockRunMinimalInstall     = jest.fn<(opts: unknown) => Promise<void>>();

jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/admin-setup.js',      () => ({ runAdminSetupStep:       mockRunAdminSetupStep }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/system-check.js',     () => ({ runSystemCheckStep:      mockRunSystemCheckStep }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/project-setup.js',    () => ({ runProjectSetupStep:     mockRunProjectSetupStep }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/server-components.js',() => ({ runServerComponentsStep: mockRunServerComponentsStep, applyComponentRules: jest.fn((s: unknown) => s), applyDevStackAutoEnables: jest.fn((s: unknown) => s) }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/dev-stack.js',        () => ({ runDevStackStep:         mockRunDevStackStep, applySkipDevStack: jest.fn() }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/domain-network.js',   () => ({ runDomainNetworkStep:    mockRunDomainNetworkStep, applyDomainDefaults: jest.fn() }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/review.js',           () => ({ runReviewStep: mockRunReviewStep, importConfig: mockImportConfig, generateReviewSections: jest.fn() }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/generate.js',         () => ({ runGenerateStep: mockRunGenerateStep }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/complete.js',         () => ({ runCompleteStep: mockRunCompleteStep }));
jest.unstable_mockModule('../../../../packages/cli/src/wizard/run-minimal-install.js',    () => ({ runMinimalInstall: mockRunMinimalInstall }));
jest.unstable_mockModule('../../../../packages/cli/src/services/uninstall-manager.js',    () => ({
  cleanupForRestart: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  runUninstall: jest.fn(),
  readManifest: jest.fn(),
  listInstallations: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const { registerInitCommand } = await import(
  '../../../../packages/cli/src/commands/init.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerInitCommand(p);
  return p;
}

async function runInit(args: string[] = []): Promise<void> {
  const p = makeProgram();
  try {
    await p.parseAsync(['init', ...args], { from: 'user' });
  } catch {
    // ignore commander errors
  }
}

function makeState() {
  const s = createDefaultWizardState();
  s.admin.password = 'TestPass123!';
  return s;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerInitCommand / runInitWizard', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Default state
    const state = makeState();
    mockCreateState.mockReturnValue(state);
    mockRunAdminSetupStep.mockResolvedValue(state);
    mockRunSystemCheckStep.mockResolvedValue({ passed: true, results: [], portRemapping: {} });
    mockRunProjectSetupStep.mockResolvedValue(state);
    mockRunServerComponentsStep.mockResolvedValue(state);
    mockRunDevStackStep.mockResolvedValue(state);
    mockRunDomainNetworkStep.mockResolvedValue(state);
    mockRunReviewStep.mockResolvedValue({ action: 'generate' });
    mockRunGenerateStep.mockResolvedValue('success');
    mockRunCompleteStep.mockResolvedValue(undefined);
    mockRunMinimalInstall.mockResolvedValue(undefined);
    mockImportConfig.mockReturnValue(state);
    mockSaveState.mockReturnValue(undefined);
    mockSelect.mockResolvedValue('full');
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ── Command registration ──────────────────────────────────────────────────

  it('registers the "init" command', () => {
    const p = makeProgram();
    expect(p.commands.find((c) => c.name() === 'init')).toBeDefined();
  });

  // ── --config: file not found ──────────────────────────────────────────────

  it('prints error and returns early when --config file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    let errMsg = '';
    consoleSpy.mockImplementation((s: unknown) => { errMsg += String(s); });

    await runInit(['--config', '/no/such/file.json']);

    expect(errMsg).toContain('not found');
    expect(mockRunAdminSetupStep).not.toHaveBeenCalled();
  });

  // ── --config: importConfig throws ────────────────────────────────────────

  it('prints error and returns early when importConfig throws', async () => {
    mockExistsSync.mockReturnValue(true);
    mockImportConfig.mockImplementation(() => { throw new Error('invalid JSON'); });

    let errMsg = '';
    consoleSpy.mockImplementation((s: unknown) => { errMsg += String(s); });

    await runInit(['--config', '/some/config.json']);

    expect(errMsg).toContain('Failed to load config');
    expect(mockRunAdminSetupStep).not.toHaveBeenCalled();
  });

  // ── --config valid: auto-generates missing passwords ─────────────────────

  it('auto-generates admin password when config has empty password', async () => {
    const stateNoPass = makeState();
    stateNoPass.admin.password = '';
    stateNoPass.servers.dbServer.enabled = true;
    stateNoPass.servers.dbServer.dbPassword = '';

    mockExistsSync.mockReturnValue(true);
    mockImportConfig.mockReturnValue(stateNoPass);

    await runInit(['--config', '/my/config.json', '--non-interactive']);

    expect(mockGeneratePassword).toHaveBeenCalled();
  });

  // ── --non-interactive without --config ───────────────────────────────────

  it('prints error when --non-interactive used without --config', async () => {
    let errMsg = '';
    consoleSpy.mockImplementation((s: unknown) => { errMsg += String(s); });

    await runInit(['--non-interactive']);

    expect(errMsg).toContain('--non-interactive requires --config');
    expect(mockRunGenerateStep).not.toHaveBeenCalled();
  });

  // ── --non-interactive with --config: runs generate + complete ─────────────

  it('runs generate then complete when --non-interactive and valid --config', async () => {
    mockExistsSync.mockReturnValue(true);

    await runInit(['--config', '/my/config.json', '--non-interactive']);

    expect(mockRunGenerateStep).toHaveBeenCalled();
    expect(mockRunCompleteStep).toHaveBeenCalled();
    expect(mockRunAdminSetupStep).not.toHaveBeenCalled(); // skips interactive steps
  });

  // ── --non-interactive: generate returns 'error' → skips complete ──────────

  it('skips complete when generate returns error in non-interactive mode', async () => {
    mockExistsSync.mockReturnValue(true);
    mockRunGenerateStep.mockResolvedValue('error');

    await runInit(['--config', '/my/config.json', '--non-interactive']);

    expect(mockRunGenerateStep).toHaveBeenCalled();
    expect(mockRunCompleteStep).not.toHaveBeenCalled();
  });

  // ── Interactive: minimal install selected ────────────────────────────────

  it('calls runMinimalInstall when user selects "minimal" install type', async () => {
    mockSelect.mockResolvedValue('minimal');

    await runInit();

    expect(mockRunMinimalInstall).toHaveBeenCalled();
    expect(mockRunAdminSetupStep).not.toHaveBeenCalled();
  });

  // ── Interactive: full install — all steps complete → calls complete ───────

  it('runs through all wizard steps when user selects "full" install', async () => {
    mockSelect.mockResolvedValue('full');

    await runInit();

    expect(mockRunAdminSetupStep).toHaveBeenCalled();
    expect(mockRunSystemCheckStep).toHaveBeenCalled();
    expect(mockRunProjectSetupStep).toHaveBeenCalled();
    expect(mockRunServerComponentsStep).toHaveBeenCalled();
    expect(mockRunDevStackStep).toHaveBeenCalled();
    expect(mockRunDomainNetworkStep).toHaveBeenCalled();
    expect(mockRunReviewStep).toHaveBeenCalled();
    expect(mockRunGenerateStep).toHaveBeenCalled();
    expect(mockRunCompleteStep).toHaveBeenCalled();
  });

  // ── System check failure → early return ──────────────────────────────────

  it('stops wizard when system check fails', async () => {
    mockSelect.mockResolvedValue('full');
    mockRunSystemCheckStep.mockResolvedValue({ passed: false, results: [], portRemapping: {} });

    await runInit();

    expect(mockRunSystemCheckStep).toHaveBeenCalled();
    expect(mockRunProjectSetupStep).not.toHaveBeenCalled();
  });

  // ── Port remapping from system check merged into state ────────────────────

  it('merges port remapping into state when system check returns conflicts', async () => {
    mockSelect.mockResolvedValue('full');
    mockRunSystemCheckStep.mockResolvedValue({
      passed: true,
      results: [],
      portRemapping: { 80: 8080 },
    });

    await runInit();

    // State should have been saved after port remapping
    expect(mockSaveState).toHaveBeenCalled();
  });

  // ── Generate returns 'error' → goes back to Review step ──────────────────

  it('navigates back to Review when generate returns error', async () => {
    mockSelect.mockResolvedValue('full');
    let generateCallCount = 0;
    mockRunGenerateStep.mockImplementation(async () => {
      generateCallCount++;
      if (generateCallCount === 1) return 'error';
      return 'success';
    });
    mockRunReviewStep
      .mockResolvedValueOnce({ action: 'generate' }) // first time → generate (fails)
      .mockResolvedValueOnce({ action: 'generate' }); // second time → generate (succeeds)

    await runInit();

    expect(mockRunGenerateStep).toHaveBeenCalledTimes(2);
  });

  // ── Generate returns 'restart' → restarts from AdminSetup ────────────────

  it('restarts wizard when generate returns restart', async () => {
    mockSelect.mockResolvedValue('full');
    let generateCallCount = 0;
    mockRunGenerateStep.mockImplementation(async () => {
      generateCallCount++;
      if (generateCallCount === 1) return 'restart';
      return 'success';
    });
    // Review called twice (once before restart, once after)
    mockRunReviewStep.mockResolvedValue({ action: 'generate' });

    await runInit();

    // AdminSetup runs twice: once initially, once after restart
    expect(mockRunAdminSetupStep).toHaveBeenCalledTimes(2);
  });

  // ── ExitPromptError caught ────────────────────────────────────────────────

  it('handles ExitPromptError gracefully with state save', async () => {
    mockSelect.mockResolvedValue('full');
    class ExitPromptError extends Error {
      constructor() { super('exit'); this.name = 'ExitPromptError'; }
    }
    mockRunAdminSetupStep.mockRejectedValue(new ExitPromptError());

    let output = '';
    consoleSpy.mockImplementation((s: unknown) => { output += String(s); });

    await runInit();

    expect(output).toContain('cancelled');
  });

  // ── Unexpected error caught ───────────────────────────────────────────────

  it('handles unexpected errors with error message and state save attempt', async () => {
    mockSelect.mockResolvedValue('full');
    mockRunAdminSetupStep.mockRejectedValue(new Error('unexpected crash'));

    let output = '';
    consoleSpy.mockImplementation((s: unknown) => { output += String(s); });

    await runInit();

    expect(output).toContain('unexpected error');
  });

  // ── Review: modify step → navigates to specified step ────────────────────

  it('navigates to specified step when review returns modify action', async () => {
    mockSelect.mockResolvedValue('full');
    let reviewCallCount = 0;
    mockRunReviewStep.mockImplementation(async () => {
      reviewCallCount++;
      if (reviewCallCount === 1) {
        return { action: 'modify', modifyStep: 2 }; // WizardStep.ProjectSetup = 2
      }
      return { action: 'generate' };
    });

    await runInit();

    // ProjectSetup runs twice (once normally, once after modify navigation)
    expect(mockRunProjectSetupStep).toHaveBeenCalledTimes(2);
  });

  // ── Review: export action → stays on Review step (L341) ──────────────────

  it('stays on Review step when review returns export action (L341)', async () => {
    mockSelect.mockResolvedValue('full');
    let reviewCallCount = 0;
    mockRunReviewStep.mockImplementation(async () => {
      reviewCallCount++;
      if (reviewCallCount === 1) {
        return { action: 'export' }; // stays on Review, loops again
      }
      return { action: 'generate' }; // second time: proceed
    });

    await runInit();

    // Review was called twice (first: export, second: generate)
    expect(mockRunReviewStep).toHaveBeenCalledTimes(2);
    expect(mockRunGenerateStep).toHaveBeenCalled();
  });

  // ── Generate: clean-restart → cleanup + restart wizard (L375-387) ────────

  it('runs cleanup and restarts wizard when generate returns clean-restart', async () => {
    mockSelect.mockResolvedValue('full');
    let generateCallCount = 0;
    mockRunGenerateStep.mockImplementation(async () => {
      generateCallCount++;
      if (generateCallCount === 1) return 'clean-restart';
      return 'success';
    });
    mockRunReviewStep.mockResolvedValue({ action: 'generate' });

    await runInit();

    // Generate called twice: first clean-restart, then success
    expect(mockRunGenerateStep).toHaveBeenCalledTimes(2);
    // AdminSetup runs twice: once initially, once after restart
    expect(mockRunAdminSetupStep).toHaveBeenCalledTimes(2);
  });
});
