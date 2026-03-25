/**
 * Unit tests for wizard/run-minimal-install — runMinimalInstall
 *
 * Covers:
 *   - Happy path: prompts filled → generate + complete called (L24-75)
 *   - generate returns 'error' → complete is skipped (L74)
 *   - saveState error after generate is silently swallowed (L72)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInput    = jest.fn<() => Promise<string>>();
const mockPassword = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  input:    mockInput,
  password: mockPassword,
  select:   jest.fn(),
  confirm:  jest.fn(),
}));

const mockCreateState = jest.fn();
const mockSaveState   = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  createState:      mockCreateState,
  saveState:        mockSaveState,
  loadState:        jest.fn(() => null),
  getLastProject:   jest.fn(() => null),
  getStateFilePath: jest.fn(() => '/tmp/state.json'),
  hasResumeState:   jest.fn(() => false),
}));

const mockApplyMinimalInstallDefaults = jest.fn((s: unknown) => s);
jest.unstable_mockModule('../../../../packages/cli/src/config/defaults.js', () => ({
  applyMinimalInstallDefaults: mockApplyMinimalInstallDefaults,
  createDefaultWizardState: jest.fn(() => ({
    projectName: '',
    projectPath: '',
    admin: { username: 'admin', password: '' },
    devStack: { languages: [], frameworks: {}, frontend: null },
    servers: { appServer: { enabled: false }, fileBrowser: { enabled: false, mode: 'directory' } },
    boilerplate: { generate: false, devMode: 'hot-reload', sampleData: false },
    domainConnections: [],
  })),
}));

const mockRunGenerateStep  = jest.fn<() => Promise<string>>();
const mockRunCompleteStep  = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/generate.js', () => ({
  runGenerateStep: mockRunGenerateStep,
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/steps/complete.js', () => ({
  runCompleteStep: mockRunCompleteStep,
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const { runMinimalInstall } = await import(
  '../../../../packages/cli/src/wizard/run-minimal-install.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState() {
  return {
    projectName: '',
    projectPath: '',
    admin: { username: 'admin', password: '' },
    devStack: { languages: [], frameworks: {}, frontend: null },
    servers: { appServer: { enabled: false }, fileBrowser: { enabled: false, mode: 'directory' } },
    boilerplate: { generate: false, devMode: 'hot-reload', sampleData: false },
    domainConnections: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMinimalInstall', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const state = makeMinimalState();
    mockCreateState.mockReturnValue(state);
    mockApplyMinimalInstallDefaults.mockImplementation((s: unknown) => s);
    mockRunGenerateStep.mockResolvedValue('success');
    mockRunCompleteStep.mockResolvedValue(undefined);
    mockSaveState.mockReturnValue(undefined);

    mockInput
      .mockResolvedValueOnce('my-homeserver')   // project name
      .mockResolvedValueOnce('admin');           // admin username
    mockPassword.mockResolvedValueOnce('SecurePass123!');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('calls generate then complete when generate succeeds', async () => {
    await runMinimalInstall();

    expect(mockRunGenerateStep).toHaveBeenCalled();
    expect(mockRunCompleteStep).toHaveBeenCalled();
  });

  it('sets projectName and admin credentials from user input', async () => {
    let capturedState: unknown;
    mockRunGenerateStep.mockImplementation(async (s: unknown) => {
      capturedState = s;
      return 'success';
    });

    await runMinimalInstall();

    const state = capturedState as ReturnType<typeof makeMinimalState>;
    expect(state.projectName).toBe('my-homeserver');
    expect(state.admin.username).toBe('admin');
    expect(state.admin.password).toBe('SecurePass123!');
  });

  it('calls applyMinimalInstallDefaults with the state', async () => {
    await runMinimalInstall();
    expect(mockApplyMinimalInstallDefaults).toHaveBeenCalled();
  });

  it('saves state before and after generate', async () => {
    await runMinimalInstall();
    // saveState called at least once (line 67) + try block (line 72)
    expect(mockSaveState).toHaveBeenCalledTimes(2);
  });

  it('passes noOpen option to complete step', async () => {
    await runMinimalInstall({ noOpen: true });
    expect(mockRunCompleteStep).toHaveBeenCalledWith(
      expect.anything(),
      { noOpen: true },
    );
  });

  // ── Generate error → complete skipped (L74) ───────────────────────────────

  it('skips complete step when generate returns error', async () => {
    mockRunGenerateStep.mockResolvedValue('error');

    await runMinimalInstall();

    expect(mockRunGenerateStep).toHaveBeenCalled();
    expect(mockRunCompleteStep).not.toHaveBeenCalled();
  });

  // ── saveState after generate throws → silently swallowed (L72) ───────────

  it('does not throw when post-generate saveState throws', async () => {
    // First saveState (L67) succeeds, second (L72) throws
    mockSaveState
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => { throw new Error('disk full'); });

    await expect(runMinimalInstall()).resolves.toBeUndefined();
    expect(mockRunCompleteStep).toHaveBeenCalled();
  });
});
