/**
 * Unit tests for wizard/steps/review — runReviewStep (interactive)
 *
 * Covers lines 404-437:
 *   - export action (select='export', input directory, exportConfig)
 *   - modify action (select='modify', nested step select)
 *   - generate action (select='generate')
 *
 * Separate file because @inquirer/prompts must be mocked before import.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mocks — must come before any await import()
// ---------------------------------------------------------------------------

const mockSelect = jest.fn<() => Promise<string>>();
const mockInput = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: mockSelect,
  input: mockInput,
  confirm: jest.fn(),
  checkbox: jest.fn(),
  password: jest.fn(),
}));

// Mock node:fs to avoid real file writes for export tests
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn(() => false);
const mockReadFileSync = jest.fn(() => '{}');

jest.unstable_mockModule('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  rmSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  copyFileSync: jest.fn(),
  chmodSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { runReviewStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/review.js'
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
    projectName: 'test-project',
    projectPath: join(tmpdir(), 'test-brewnet'),
    admin: { ...base.admin, username: 'admin', password: 'secret123' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runReviewStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation(() => {});
    mockExistsSync.mockReturnValue(false);
  });

  it('returns { action: "generate" } when user selects generate', async () => {
    mockSelect.mockResolvedValue('generate');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runReviewStep(makeState());
    expect(result.action).toBe('generate');

    consoleSpy.mockRestore();
  });

  it('returns { action: "export", exportPath } when user selects export', async () => {
    const exportDir = join(tmpdir(), 'export-dir');
    mockSelect.mockResolvedValue('export');
    mockInput.mockResolvedValue(exportDir);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runReviewStep(makeState());
    expect(result.action).toBe('export');
    expect(result.exportPath).toBeDefined();
    expect(result.exportPath).toContain('brewnet.config.json');

    consoleSpy.mockRestore();
  });

  it('calls input with default set to projectPath for export', async () => {
    const state = makeState({ projectPath: '/home/user/my-project' });
    mockSelect.mockResolvedValue('export');
    mockInput.mockResolvedValue('/home/user/my-project');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runReviewStep(state);
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({ default: '/home/user/my-project' }),
    );

    consoleSpy.mockRestore();
  });

  it('returns { action: "modify", modifyStep } when user selects modify', async () => {
    // First select = 'modify', second select = step number
    mockSelect
      .mockResolvedValueOnce('modify')
      .mockResolvedValueOnce(1); // WizardStep.ProjectSetup
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runReviewStep(makeState());
    expect(result.action).toBe('modify');
    expect(result.modifyStep).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('calls select twice for modify action (main action + step selection)', async () => {
    mockSelect
      .mockResolvedValueOnce('modify')
      .mockResolvedValueOnce(2);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runReviewStep(makeState());
    expect(mockSelect).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it('logs header and section items to console', async () => {
    mockSelect.mockResolvedValue('generate');
    const logs: string[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });

    await runReviewStep(makeState());
    const output = logs.join('\n');
    expect(output).toContain('Step 6/8');

    consoleSpy.mockRestore();
  });
});
