/**
 * Unit tests for commands/shutdown
 *
 * Covers the shutdown command action paths:
 *   - No process on port → "No process found"
 *   - PID(s) found → kill + "Admin panel stopped"
 *   - process.kill throws (already dead) → silently continues
 *   - execSync throws → outer catch → "No admin panel running"
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mock node:child_process (execSync)
// ---------------------------------------------------------------------------

const mockExecSync = jest.fn<(cmd: string, opts?: object) => string>();

jest.unstable_mockModule('node:child_process', () => ({
  execSync: mockExecSync,
  spawn: jest.fn(),
  default: { execSync: mockExecSync, spawn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Dynamic import
// ---------------------------------------------------------------------------

const { registerShutdownCommand } = await import(
  '../../../../packages/cli/src/commands/shutdown.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram() {
  const prog = new Command();
  prog.exitOverride();
  prog.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerShutdownCommand(prog);
  return prog;
}

async function runShutdown(args: string[] = []) {
  const prog = makeProgram();
  await prog.parseAsync(['shutdown', ...args], { from: 'user' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shutdown command', () => {
  let killSpy: ReturnType<typeof jest.spyOn>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    killSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('prints "No process found" when no PIDs are running on port', async () => {
    mockExecSync.mockReturnValue('');

    await runShutdown(['--port', '8088']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No process found');
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('kills a single PID and prints success', async () => {
    mockExecSync.mockReturnValue('1234\n');

    await runShutdown(['--port', '8088']);

    expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Admin panel stopped');
  });

  it('kills multiple PIDs (one per line)', async () => {
    mockExecSync.mockReturnValue('1234\n5678\n');

    await runShutdown(['--port', '8088']);

    expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
    expect(killSpy).toHaveBeenCalledWith(5678, 'SIGTERM');
  });

  it('silently continues when process.kill throws (already dead)', async () => {
    mockExecSync.mockReturnValue('9999\n');
    killSpy.mockImplementation(() => { throw new Error('no such process'); });

    // Should not throw
    await expect(runShutdown(['--port', '8088'])).resolves.toBeUndefined();
  });

  it('prints "No admin panel running" when execSync throws', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('lsof not found'); });

    await runShutdown(['--port', '8088']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No admin panel running');
  });

  it('uses default port 8088 when --port not specified', async () => {
    mockExecSync.mockReturnValue('');

    await runShutdown();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('8088'),
      expect.any(Object),
    );
  });
});
