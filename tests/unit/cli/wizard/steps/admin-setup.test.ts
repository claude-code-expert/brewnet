/**
 * Unit tests for wizard/steps/admin-setup — runAdminSetupStep
 *
 * Covers:
 *   - Happy path: username + matching password → state updated
 *   - Password mismatch then match: retry loop
 *   - Default username used from existing state
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInput    = jest.fn<() => Promise<string>>();
const mockPassword = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  input:    mockInput,
  password: mockPassword,
  confirm:  jest.fn(),
  select:   jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const { runAdminSetupStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/admin-setup.js'
);

const { createDefaultWizardState } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAdminSetupStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── Happy path — username + matching passwords ────────────────────────────

  it('updates state with username and password when passwords match', async () => {
    const state = createDefaultWizardState();
    mockInput.mockResolvedValue('admin');
    mockPassword
      .mockResolvedValueOnce('securepass123')  // first entry
      .mockResolvedValueOnce('securepass123'); // confirmation

    const result = await runAdminSetupStep(state);

    expect(result.admin.username).toBe('admin');
    expect(result.admin.password).toBe('securepass123');
    expect(result.admin.storage).toBe('local');
  });

  // ── Password mismatch then match ──────────────────────────────────────────

  it('retries when passwords do not match and succeeds on second attempt', async () => {
    const state = createDefaultWizardState();
    mockInput.mockResolvedValue('myuser');
    mockPassword
      .mockResolvedValueOnce('pass1')      // first entry
      .mockResolvedValueOnce('different')  // wrong confirmation → mismatch
      .mockResolvedValueOnce('correct123') // second entry
      .mockResolvedValueOnce('correct123'); // correct confirmation

    const result = await runAdminSetupStep(state);

    expect(result.admin.username).toBe('myuser');
    expect(result.admin.password).toBe('correct123');
    // password() called 4 times (2 failed + 2 successful)
    expect(mockPassword).toHaveBeenCalledTimes(4);
  });

  // ── Default username from existing state ──────────────────────────────────

  it('uses existing username as default in the input prompt', async () => {
    const state = createDefaultWizardState();
    state.admin.username = 'existinguser';

    mockInput.mockResolvedValue('existinguser');
    mockPassword
      .mockResolvedValueOnce('mypassword1')
      .mockResolvedValueOnce('mypassword1');

    const result = await runAdminSetupStep(state);
    expect(result.admin.username).toBe('existinguser');
  });
});
