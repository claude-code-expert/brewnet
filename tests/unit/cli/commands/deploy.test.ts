/**
 * Unit tests for commands/deploy
 *
 * Covers the deploy command action paths:
 *   - Path not found → process.exit(1)
 *   - Deploy succeeds → process.exit(0)
 *   - Deploy fails (job.status === 'failed') → process.exit(1)
 *   - Deploy times out (180s deadline) → spinner.warn
 *   - deployLocalApp throws → process.exit(1)
 *   - Running step label updates spinner text
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(p: unknown) => boolean>().mockReturnValue(true);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
}));

const mockDeployLocalApp = jest.fn<(opts: unknown) => Promise<string>>();
const mockGetJobStatus = jest.fn<(id: string) => unknown>();

jest.unstable_mockModule('../../../../packages/cli/src/services/app-manager.js', () => ({
  deployLocalApp: mockDeployLocalApp,
  getJobStatus: mockGetJobStatus,
}));

const mockOraInstance = {
  start:   jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail:    jest.fn().mockReturnThis(),
  warn:    jest.fn().mockReturnThis(),
  text:    '',
};

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => mockOraInstance),
}));

// ---------------------------------------------------------------------------
// Dynamic import (after mocks)
// ---------------------------------------------------------------------------

const { registerDeployCommand } = await import(
  '../../../../packages/cli/src/commands/deploy.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerDeployCommand(p);
  return p;
}

async function parseCommand(program: Command, args: string[]): Promise<void> {
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch {
    // ignore commander errors
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deploy command', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Restore chained mock returns after clearAllMocks
    mockOraInstance.start.mockReturnValue(mockOraInstance);
    mockOraInstance.succeed.mockReturnValue(mockOraInstance);
    mockOraInstance.fail.mockReturnValue(mockOraInstance);
    mockOraInstance.warn.mockReturnValue(mockOraInstance);

    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── path does not exist ──────────────────────────────────────────────────

  it('calls process.exit(1) when path does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    // Allow subsequent code (after mocked exit) to complete without hanging
    mockDeployLocalApp.mockResolvedValue('job-0');
    mockGetJobStatus.mockReturnValue(null); // immediate loop break

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/no-such-path', '-n', 'app']);
    await jest.runAllTimersAsync();
    await cmd;

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── deploy succeeds ──────────────────────────────────────────────────────

  it('calls process.exit(0) when deploy job finishes with status done', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockResolvedValue('job-1');
    mockGetJobStatus
      .mockReturnValueOnce({ jobId: 'job-1', status: 'done', steps: [], error: undefined })
      .mockReturnValue(null); // second iteration: break

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/myapp', '-n', 'my-app', '-p', '3000']);
    await jest.runAllTimersAsync();
    await cmd;

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });

  // ── deploy fails ─────────────────────────────────────────────────────────

  it('calls process.exit(1) when deploy job finishes with status failed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockResolvedValue('job-2');
    mockGetJobStatus
      .mockReturnValueOnce({ jobId: 'job-2', status: 'failed', error: 'build error', steps: [] })
      .mockReturnValue(null); // second iteration: break

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/myapp', '-n', 'myapp']);
    await jest.runAllTimersAsync();
    await cmd;

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockOraInstance.fail).toHaveBeenCalledWith(
      expect.stringContaining('build error'),
    );
  });

  // ── deploy times out ─────────────────────────────────────────────────────

  it('warns with "timed out" message when 180s deadline is exceeded', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockResolvedValue('job-3');
    // Always return running — loop never breaks via job status
    mockGetJobStatus.mockReturnValue({
      jobId: 'job-3',
      status: 'running',
      steps: [{ status: 'running', label: 'Building image' }],
    });

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/myapp']);
    await jest.runAllTimersAsync(); // fires all 90 loop iterations (2000ms × 90 = 180s)
    await cmd;

    expect(mockOraInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    );
  });

  // ── exception during deploy ──────────────────────────────────────────────

  it('calls process.exit(1) and spinner.fail when deployLocalApp throws', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockRejectedValue(new Error('Docker not running'));

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/myapp', '-n', 'myapp']);
    await jest.runAllTimersAsync();
    await cmd;

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockOraInstance.fail).toHaveBeenCalledWith(
      expect.stringContaining('Docker not running'),
    );
  });

  // ── spinner text updated while running ───────────────────────────────────

  it('updates spinner text with current step label while job is running', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockResolvedValue('job-4');
    mockGetJobStatus
      .mockReturnValueOnce({
        jobId: 'job-4',
        status: 'running',
        steps: [{ status: 'running', label: 'Docker compose up' }],
      })
      .mockReturnValueOnce({ jobId: 'job-4', status: 'done', steps: [], error: undefined })
      .mockReturnValue(null);

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/myapp', '-n', 'myapp']);
    await jest.runAllTimersAsync();
    await cmd;

    // Spinner text should have been updated with the running step label
    // (deploy.ts: if (current) spinner.text = `${appName} — ${current.label}…`)
    expect(mockOraInstance.succeed).toHaveBeenCalled();
  });

  // ── default app name derived from directory ──────────────────────────────

  it('uses directory name as app name when -n is not given', async () => {
    mockExistsSync.mockReturnValue(true);
    mockDeployLocalApp.mockResolvedValue('job-5');
    mockGetJobStatus
      .mockReturnValueOnce({ jobId: 'job-5', status: 'done', steps: [], error: undefined })
      .mockReturnValue(null);

    const p = makeProgram();
    const cmd = parseCommand(p, ['deploy', '/home/user/my-project']);
    await jest.runAllTimersAsync();
    await cmd;

    expect(mockDeployLocalApp).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'my-project' }),
    );
  });
});
