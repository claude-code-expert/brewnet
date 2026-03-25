/**
 * Unit tests for wizard/steps/system-check — runSystemCheckStep
 *
 * Covers:
 *   - Happy path (Docker running, all checks pass) → passed: true
 *   - Daemon not running — macOS: launchDockerDesktop + waitForDaemon
 *   - Daemon not running — Linux: execa systemctl + waitForDaemon
 *   - Docker not installed — install succeeds, Linux requiresRelogin
 *   - Docker not installed — install fails, user quits
 *   - Docker not installed — install fails, user retries
 *   - waitForDaemonWithRetry: retry action → daemon becomes ready
 *   - waitForDaemonWithRetry: open Desktop action (macOS)
 *   - waitForDaemonWithRetry: manual action → showDockerStartGuide
 *   - waitForDaemonWithRetry: quit action → returns false
 *   - Port conflict with occupant info, user picks alternative
 *   - Port conflict with occupant, user picks custom port
 *   - Port conflict, user keeps port
 *   - Critical failure (non-Docker) — user quits
 *   - Critical failure (non-Docker) — user retries (recursive)
 *   - Critical failure (Docker BN001) — user quits
 *   - Critical failure (Docker BN001) — user rechecks (recursive)
 *   - Critical failure (Docker BN001 macOS) — open Desktop action
 *   - Critical failure (Docker BN001) — manual + quit
 *   - Warning with remediation — user confirms
 *   - Warning with remediation — user declines
 *   - warn status in statusIcon/formatName/formatMessage helpers
 *   - Outer catch (runAllChecks throws)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any await import()
// ---------------------------------------------------------------------------

const mockOraInstance = {
  start:   jest.fn<() => typeof mockOraInstance>(),
  succeed: jest.fn<() => typeof mockOraInstance>(),
  fail:    jest.fn<() => typeof mockOraInstance>(),
  stop:    jest.fn<() => typeof mockOraInstance>(),
  warn:    jest.fn<() => typeof mockOraInstance>(),
  text:    '',
};

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => mockOraInstance),
}));

// cli-table3 — lightweight mock
jest.unstable_mockModule('cli-table3', () => {
  class MockTable {
    push(_row: unknown[]) {}
    toString() { return '[table]'; }
  }
  return { default: MockTable };
});

const mockExeca = jest.fn().mockResolvedValue({ stdout: '', exitCode: 0 });
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

// @inquirer/prompts
const mockConfirm = jest.fn<() => Promise<boolean>>();
const mockSelect  = jest.fn<() => Promise<string | number>>();
const mockInput   = jest.fn<() => Promise<string>>();
jest.unstable_mockModule('@inquirer/prompts', () => ({
  confirm:  mockConfirm,
  select:   mockSelect,
  input:    mockInput,
  password: jest.fn(),
}));

// docker-installer
const mockIsDockerInstalled   = jest.fn<() => Promise<boolean>>();
const mockIsDaemonRunning     = jest.fn<() => Promise<boolean>>();
const mockInstallDocker       = jest.fn<() => Promise<{ success: boolean; message: string; requiresRelogin?: boolean }>>();
const mockWaitForDockerDaemon = jest.fn<() => Promise<boolean>>();
const mockGetDaemonDiagnostics = jest.fn<() => Promise<string | null>>();
const mockLaunchDockerDesktop = jest.fn<() => Promise<{ success: boolean; error?: string }>>();

jest.unstable_mockModule('../../../../../packages/cli/src/services/docker-installer.js', () => ({
  isDockerInstalled:    mockIsDockerInstalled,
  isDaemonRunning:      mockIsDaemonRunning,
  installDocker:        mockInstallDocker,
  waitForDockerDaemon:  mockWaitForDockerDaemon,
  getDaemonDiagnostics: mockGetDaemonDiagnostics,
  launchDockerDesktop:  mockLaunchDockerDesktop,
}));

// system-checker
const mockRunAllChecks = jest.fn<() => Promise<{ results: unknown[]; hasCriticalFailure: boolean; warnings: unknown[] }>>();
jest.unstable_mockModule('../../../../../packages/cli/src/services/system-checker.js', () => ({
  runAllChecks: mockRunAllChecks,
}));

// port-utils
const mockSuggestAlternativePorts = jest.fn<(p: number) => number[]>().mockReturnValue([9090, 9091]);
const mockGetPortOccupant         = jest.fn<(p: number) => string | null>().mockReturnValue(null);
jest.unstable_mockModule('../../../../../packages/cli/src/utils/port-utils.js', () => ({
  suggestAlternativePorts: mockSuggestAlternativePorts,
  getPortOccupant:         mockGetPortOccupant,
}));

// ---------------------------------------------------------------------------
// Import SUT (after all mocks)
// ---------------------------------------------------------------------------

const { runSystemCheckStep } = await import(
  '../../../../../packages/cli/src/wizard/steps/system-check.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckStatus = 'pass' | 'fail' | 'warn';
type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
  critical?: boolean;
  remediation?: string;
  details?: string;
};

function passResult(name = 'Node.js', message = 'v20'): CheckResult {
  return { name, status: 'pass', message };
}

function failResult(name = 'Docker', message = 'BN001: daemon not running', critical = true): CheckResult {
  return { name, status: 'fail', message, critical };
}

function warnResult(name = 'Memory', message = '4 GB available', remediation?: string): CheckResult {
  return { name, status: 'warn', message, ...(remediation ? { remediation } : {}) };
}

function allPassChecks() {
  return { results: [passResult()], hasCriticalFailure: false, warnings: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSystemCheckStep', () => {
  let origPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.clearAllMocks();

    // Restore chained ora mock returns
    mockOraInstance.start.mockReturnValue(mockOraInstance);
    mockOraInstance.succeed.mockReturnValue(mockOraInstance);
    mockOraInstance.fail.mockReturnValue(mockOraInstance);
    mockOraInstance.stop.mockReturnValue(mockOraInstance);
    mockOraInstance.warn.mockReturnValue(mockOraInstance);

    // Defaults — Docker installed and running, all checks pass
    mockIsDockerInstalled.mockResolvedValue(true);
    mockIsDaemonRunning.mockResolvedValue(true);
    mockRunAllChecks.mockResolvedValue(allPassChecks());
    mockWaitForDockerDaemon.mockResolvedValue(true);
    mockGetDaemonDiagnostics.mockResolvedValue(null);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    mockInstallDocker.mockResolvedValue({ success: true, message: 'ok', requiresRelogin: false });
    mockConfirm.mockResolvedValue(true);
    mockSelect.mockResolvedValue('quit');
    mockInput.mockResolvedValue('9090');

    jest.spyOn(console, 'log').mockImplementation(() => {});

    // Save platform descriptor for restoration
    origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (origPlatform) {
      Object.defineProperty(process, 'platform', origPlatform);
    }
  });

  // ── Happy path (Docker running, all checks pass) ─────────────────────────

  it('returns { passed: true } when Docker running and all checks pass', async () => {
    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(result.portRemapping).toEqual({});
    expect(mockRunAllChecks).toHaveBeenCalled();
  });

  // ── warn status in helper functions (statusIcon/formatName/formatMessage) ─

  it('covers warn path in helpers when result has status warn', async () => {
    mockRunAllChecks.mockResolvedValue({
      results: [warnResult('Disk', '15 GB available')],
      hasCriticalFailure: false,
      warnings: [warnResult('Disk', '15 GB available')],
    });
    mockConfirm.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Warning — user confirms continue ─────────────────────────────────────

  it('returns { passed: true } when non-port warning and user confirms', async () => {
    const warn = warnResult('Memory', '2 GB', 'Add more RAM');
    mockRunAllChecks.mockResolvedValue({
      results: [warn],
      hasCriticalFailure: false,
      warnings: [warn],
    });
    mockConfirm.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Warning — user declines ───────────────────────────────────────────────

  it('returns { passed: false } when non-port warning and user declines', async () => {
    const warn = warnResult('Memory', '2 GB');
    mockRunAllChecks.mockResolvedValue({
      results: [warn],
      hasCriticalFailure: false,
      warnings: [warn],
    });
    mockConfirm.mockResolvedValue(false);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Port conflict — user picks alternative ────────────────────────────────

  it('remaps port when user picks alternative from port conflict', async () => {
    const portWarn: CheckResult = { name: 'Port 80 — Traefik (Web Server)', status: 'warn', message: 'In use' };
    mockRunAllChecks.mockResolvedValue({
      results: [portWarn],
      hasCriticalFailure: false,
      warnings: [portWarn],
    });
    mockSuggestAlternativePorts.mockReturnValue([8080, 8081]);
    mockGetPortOccupant.mockReturnValue('nginx');
    mockSelect.mockResolvedValue(8080 as unknown as string);

    const result = await runSystemCheckStep();
    expect(result.portRemapping[80]).toBe(8080);
    expect(result.passed).toBe(true);
  });

  // ── Port conflict — user keeps original port ──────────────────────────────

  it('records no remapping when user keeps original port', async () => {
    const portWarn: CheckResult = { name: 'Port 443', status: 'warn', message: 'In use' };
    mockRunAllChecks.mockResolvedValue({
      results: [portWarn],
      hasCriticalFailure: false,
      warnings: [portWarn],
    });
    mockSelect.mockResolvedValue('keep');

    const result = await runSystemCheckStep();
    expect(result.portRemapping).toEqual({});
    expect(result.passed).toBe(true);
  });

  // ── Port conflict — user enters custom port ───────────────────────────────

  it('remaps to custom port when user selects custom', async () => {
    const portWarn: CheckResult = { name: 'Port 80', status: 'warn', message: 'In use' };
    mockRunAllChecks.mockResolvedValue({
      results: [portWarn],
      hasCriticalFailure: false,
      warnings: [portWarn],
    });
    mockSelect.mockResolvedValue('custom');
    mockInput.mockResolvedValue('9090');

    const result = await runSystemCheckStep();
    expect(result.portRemapping[80]).toBe(9090);
  });

  // ── Critical failure (non-Docker) — user quits ───────────────────────────

  it('returns { passed: false } when non-Docker critical failure and user quits', async () => {
    const crit = failResult('Node.js', 'version too old', true);
    mockRunAllChecks.mockResolvedValue({
      results: [crit],
      hasCriticalFailure: true,
      warnings: [],
    });
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Critical failure (non-Docker) — user retries (recursive) ─────────────

  it('passes when critical failure user retries and second attempt succeeds', async () => {
    const crit = failResult('Disk', 'out of space', true);
    let calls = 0;
    mockRunAllChecks.mockImplementation(async () => {
      calls++;
      if (calls === 1) return { results: [crit], hasCriticalFailure: true, warnings: [] };
      return allPassChecks();
    });
    mockSelect.mockResolvedValueOnce('retry');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Critical failure (Docker BN001) — user quits ─────────────────────────

  it('returns { passed: false } when Docker BN001 critical failure and user quits', async () => {
    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    mockRunAllChecks.mockResolvedValue({
      results: [dockerFail],
      hasCriticalFailure: true,
      warnings: [],
    });
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Critical failure (Docker BN001) — recheck ────────────────────────────

  it('rechecks successfully when Docker BN001 user selects recheck', async () => {
    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    let calls = 0;
    mockRunAllChecks.mockImplementation(async () => {
      calls++;
      if (calls === 1) return { results: [dockerFail], hasCriticalFailure: true, warnings: [] };
      return allPassChecks();
    });
    mockSelect.mockResolvedValueOnce('recheck');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Critical failure (Docker BN001) — wait (macOS) ───────────────────────

  it('returns passed after daemon wait when Docker BN001 user selects "wait" on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    let calls = 0;
    mockRunAllChecks.mockImplementation(async () => {
      calls++;
      if (calls === 1) return { results: [dockerFail], hasCriticalFailure: true, warnings: [] };
      return allPassChecks();
    });
    // First action: wait; waitForDaemon becomes ready → recursion returns pass
    mockSelect.mockResolvedValueOnce('wait');
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Critical failure (Docker BN001) — manual + quit ─────────────────────

  it('shows manual guide then quits when Docker BN001 user selects manual then quit', async () => {
    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    mockRunAllChecks.mockResolvedValue({
      results: [dockerFail],
      hasCriticalFailure: true,
      warnings: [],
    });
    // First: manual, then quit to break the loop
    mockSelect.mockResolvedValueOnce('manual').mockResolvedValueOnce('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Critical failure (Docker BN001 macOS) — open Desktop ─────────────────

  it('launches Desktop then waits when BN001 user selects "open" on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    let calls = 0;
    mockRunAllChecks.mockImplementation(async () => {
      calls++;
      if (calls === 1) return { results: [dockerFail], hasCriticalFailure: true, warnings: [] };
      return allPassChecks();
    });
    mockSelect.mockResolvedValueOnce('open');
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockLaunchDockerDesktop).toHaveBeenCalled();
  });

  // ── Outer catch (runAllChecks throws) ────────────────────────────────────

  it('returns { passed: false } when runAllChecks throws', async () => {
    mockRunAllChecks.mockRejectedValue(new Error('unexpected crash'));

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
    expect(result.results).toEqual([]);
  });

  // ── Docker installed but daemon not running (macOS) ───────────────────────

  it('launches Docker Desktop and waits when daemon not running on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockLaunchDockerDesktop).toHaveBeenCalled();
  });

  // ── Docker installed but daemon not running (Linux) ───────────────────────

  it('runs systemctl start and waits when daemon not running on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'sudo',
      ['systemctl', 'start', 'docker'],
      expect.objectContaining({ reject: false }),
    );
  });

  // ── Daemon not running — waitForDaemon returns false → passed: false ──────

  it('returns { passed: false } when waitForDaemon times out after daemon not running', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    mockWaitForDockerDaemon.mockResolvedValue(false);
    // waitForDaemonWithRetry: first call times out → select prompt
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── waitForDaemonWithRetry — retry action becomes ready ───────────────────

  it('succeeds on retry inside waitForDaemonWithRetry when daemon becomes ready', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    // First waitForDaemon: times out; second (retry): ready
    mockWaitForDockerDaemon
      .mockResolvedValueOnce(false) // initial
      .mockResolvedValueOnce(true); // after retry
    mockSelect.mockResolvedValueOnce('retry'); // pick retry in the loop

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── waitForDaemonWithRetry — open Desktop then quit ──────────────────────

  it('launches Desktop inside waitForDaemonWithRetry then quits if still not ready', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    // Both daemon polls fail → enter retry loop twice (open then quit)
    mockWaitForDockerDaemon.mockResolvedValue(false);
    mockSelect
      .mockResolvedValueOnce('open')   // first prompt: open Desktop
      .mockResolvedValueOnce('quit');  // second prompt: quit

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── waitForDaemonWithRetry — manual → showDockerStartGuide (Linux) ────────

  it('shows Docker start guide (Linux) in waitForDaemonWithRetry then quits', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockWaitForDockerDaemon.mockResolvedValue(false);
    mockSelect
      .mockResolvedValueOnce('manual')  // show guide
      .mockResolvedValueOnce('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── waitForDaemonWithRetry — getDaemonDiagnostics shows info ─────────────

  it('shows daemon diagnostics when available in waitForDaemonWithRetry', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockWaitForDockerDaemon.mockResolvedValue(false);
    mockGetDaemonDiagnostics.mockResolvedValue('Cannot connect to Docker daemon');
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Docker NOT installed — install succeeds (Linux, requiresRelogin) ──────

  it('installs Docker and returns passed when not installed on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: true, message: 'installed', requiresRelogin: true });
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockInstallDocker).toHaveBeenCalled();
  });

  // ── Docker NOT installed — install succeeds (macOS, confirm firstLaunch) ──

  it('shows first-launch guide on macOS after Docker install succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: true, message: 'installed', requiresRelogin: false });
    mockConfirm.mockResolvedValue(true);
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockConfirm).toHaveBeenCalled();
  });

  // ── Docker NOT installed — install fails, user quits ─────────────────────

  it('returns { passed: false } when install fails and user quits', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: false, message: 'install failed' });
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Docker NOT installed — install fails, manual guide, then quit ─────────

  it('shows install guide when user selects manual then quits', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: false, message: 'install failed' });
    mockSelect.mockResolvedValue('manual');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── Docker NOT installed — install fails twice, retry then succeed ────────

  it('retries install and succeeds on second attempt', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker
      .mockResolvedValueOnce({ success: false, message: 'first failure' })
      .mockResolvedValueOnce({ success: true, message: 'installed', requiresRelogin: false });
    mockSelect.mockResolvedValueOnce('retry');
    mockWaitForDockerDaemon.mockResolvedValue(true);

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
    expect(mockInstallDocker).toHaveBeenCalledTimes(2);
  });

  // ── Docker NOT installed — macOS install guide ────────────────────────────

  it('shows macOS install guide when platform is darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: false, message: 'install failed' });
    mockSelect.mockResolvedValue('manual');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── waitForDaemonWithRetry — open action + launchDockerDesktop fails (L197-199) ──

  it('shows Desktop launch failure message inside waitForDaemonWithRetry open action', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    // Initial auto-launch succeeds but daemon never starts
    mockLaunchDockerDesktop
      .mockResolvedValueOnce({ success: true })   // initial (L266)
      .mockResolvedValueOnce({ success: false, error: 'No app found' }); // retry loop 'open' (L197-199)
    mockWaitForDockerDaemon.mockResolvedValue(false);

    // Initial wait fails → enter retry loop
    // In retry loop: select 'open' → launchDockerDesktop fails (L197-199) → still not ready
    mockSelect
      .mockResolvedValueOnce('open')   // retry loop: open
      .mockResolvedValueOnce('quit');  // retry loop: quit

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
    expect(mockLaunchDockerDesktop).toHaveBeenCalledTimes(2);
  });

  // ── waitForDaemonWithRetry — open action → daemon becomes ready (L204-205) ──

  it('returns true when daemon becomes ready after open action in waitForDaemonWithRetry', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    mockLaunchDockerDesktop.mockResolvedValue({ success: true });
    // Initial wait fails; inside retry loop 'open' daemon becomes ready
    mockWaitForDockerDaemon
      .mockResolvedValueOnce(false)  // initial wait (before retry loop)
      .mockResolvedValueOnce(true);  // after 'open' in retry loop (L204-205)

    // Retry loop: select 'open'
    mockSelect.mockResolvedValueOnce('open');

    // After waitForDaemonWithRetry returns true, runSystemCheckStep recursively runs
    // Second call: Docker now running, all checks pass
    let runCalls = 0;
    mockIsDaemonRunning.mockImplementation(async () => {
      runCalls++;
      return runCalls > 1; // false first time, true on recursive call
    });
    mockRunAllChecks.mockResolvedValue(allPassChecks());

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(true);
  });

  // ── Initial auto-launch (macOS) + launchDockerDesktop fails (L268-270) ────

  it('shows launch failure message when launchDockerDesktop fails on initial macOS start', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    mockIsDaemonRunning.mockResolvedValue(false);
    // Initial launchDockerDesktop FAILS (L268-270)
    mockLaunchDockerDesktop.mockResolvedValue({ success: false, error: 'App not found' });
    mockWaitForDockerDaemon.mockResolvedValue(false); // never starts
    mockSelect.mockResolvedValue('quit'); // quit from retry loop

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
    expect(mockLaunchDockerDesktop).toHaveBeenCalled();
  });

  // ── Docker install + waitForDaemonWithRetry returns false (L348) ──────────

  it('returns { passed: false } when waitForDaemonWithRetry fails after Docker install', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    mockIsDockerInstalled.mockResolvedValue(false);
    mockInstallDocker.mockResolvedValue({ success: true, message: 'ok', requiresRelogin: false });
    // waitForDaemonWithRetry: daemon never starts → quit
    mockWaitForDockerDaemon.mockResolvedValue(false);
    mockSelect.mockResolvedValue('quit'); // quit from retry loop inside waitForDaemonWithRetry

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);  // L348 return
  });

  // ── Critical failure with remediation hint (L458) ─────────────────────────

  it('shows remediation hint for critical failure with remediation field', async () => {
    const critWithRemediation: CheckResult = {
      name: 'Node.js',
      status: 'fail',
      message: 'version too old',
      critical: true,
      remediation: 'Run: nvm use 20',  // L458
    };
    mockRunAllChecks.mockResolvedValue({
      results: [critWithRemediation],
      hasCriticalFailure: true,
      warnings: [],
    });
    mockSelect.mockResolvedValue('quit');

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
  });

  // ── BN001 loop 'open' + launchDockerDesktop fails (L495-497) ─────────────

  it('shows Desktop launch failure in BN001 loop open action', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const dockerFail = failResult('Docker', 'BN001: daemon not running', true);
    mockRunAllChecks.mockResolvedValue({
      results: [dockerFail],
      hasCriticalFailure: true,
      warnings: [],
    });
    // BN001 loop: 'open' → launchDockerDesktop fails (L495-497) → still not ready → quit
    mockLaunchDockerDesktop.mockResolvedValue({ success: false, error: 'App not found' });
    mockWaitForDockerDaemon.mockResolvedValue(false);
    mockSelect
      .mockResolvedValueOnce('open')   // BN001 loop: open
      .mockResolvedValueOnce('quit');  // BN001 loop: quit

    const result = await runSystemCheckStep();
    expect(result.passed).toBe(false);
    expect(mockLaunchDockerDesktop).toHaveBeenCalled();
  });
});
