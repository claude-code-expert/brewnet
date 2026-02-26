/**
 * Unit tests for docker-installer platform-specific paths
 *
 * Covers:
 *   - macOS: brew re-check fails after installHomebrew succeeds (lines 150-152)
 *   - Linux: installDockerLinux full path (lines 193-231)
 *   - Unsupported platform (lines 258-262)
 *
 * Separate file from docker-installer.test.ts because node:os must be mocked
 * before import.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock node:os — platform() controls which install branch runs
// ---------------------------------------------------------------------------

const mockPlatform = jest.fn<() => NodeJS.Platform>();

jest.unstable_mockModule('node:os', () => ({
  default: {
    platform: mockPlatform,
    homedir: () => '/home/test',
    tmpdir: () => '/tmp',
  },
  platform: mockPlatform,
}));

// ---------------------------------------------------------------------------
// Mock execa
// ---------------------------------------------------------------------------

const mockExeca = jest.fn();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// ---------------------------------------------------------------------------
// Import (after mocks)
// ---------------------------------------------------------------------------

const { installDocker } = await import(
  '../../../../packages/cli/src/services/docker-installer.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccess(stdout = '') {
  return Object.assign(Promise.resolve({ stdout, stderr: '', exitCode: 0 }), {
    kill: () => {},
  });
}

function makeFailure(exitCode = 1) {
  const err = Object.assign(new Error('command failed'), {
    exitCode,
    stdout: '',
    stderr: 'error',
  });
  return Promise.reject(err);
}

// ---------------------------------------------------------------------------
// Unsupported platform
// ---------------------------------------------------------------------------

describe('installDocker — unsupported platform', () => {
  beforeEach(() => mockExeca.mockReset());

  it('returns failure for win32 platform', async () => {
    mockPlatform.mockReturnValue('win32');

    const result = await installDocker();

    expect(result.success).toBe(false);
    expect(result.message).toContain('win32');
  });

  it('returns failure for freebsd platform', async () => {
    mockPlatform.mockReturnValue('freebsd');

    const result = await installDocker();

    expect(result.success).toBe(false);
    expect(result.message).toContain('freebsd');
  });
});

// ---------------------------------------------------------------------------
// macOS — brew re-check fails after installHomebrew
// ---------------------------------------------------------------------------

describe('installDocker — macOS, brew available after homebrew install fails re-check', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('darwin');
    mockExeca.mockReset();
  });

  it('returns failure when brew still not found after installHomebrew succeeds', async () => {
    // 1st call: brew --version → fails (not installed)
    mockExeca
      .mockReturnValueOnce(makeFailure(1))           // brew --version fails
      .mockReturnValueOnce(makeSuccess(''))           // installHomebrew (/bin/bash) succeeds
      .mockReturnValueOnce(makeFailure(1));           // brew --version still fails (re-check)

    const result = await installDocker();

    expect(result.success).toBe(false);
    expect(result.message).toContain('brew');
  });
});

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

describe('installDocker — Linux', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('linux');
    mockExeca.mockReset();
    // Suppress console.log output during Linux install
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns success with requiresRelogin=true when Docker install script succeeds', async () => {
    // All execa calls succeed
    mockExeca.mockReturnValue(makeSuccess(''));

    const result = await installDocker();

    expect(result.success).toBe(true);
    expect(result.requiresRelogin).toBe(true);
  });

  it('returns failure when Docker install script fails', async () => {
    mockExeca.mockReturnValueOnce(makeFailure(1)); // sh -c curl | sh fails

    const result = await installDocker();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Docker');
  });

  it('calls systemctl start and enable after install script', async () => {
    mockExeca.mockReturnValue(makeSuccess(''));

    await installDocker();

    const calls = mockExeca.mock.calls.map((c) => (c as unknown[])[1] as string[]);
    const hasSystemctlStart = calls.some(
      (args) => Array.isArray(args) && args.includes('systemctl') && args.includes('start'),
    );
    expect(hasSystemctlStart).toBe(true);
  });

  it('continues (non-fatal) when systemctl fails', async () => {
    mockExeca
      .mockReturnValueOnce(makeSuccess(''))   // Docker install script succeeds
      .mockReturnValueOnce(makeFailure(1))    // systemctl start fails
      .mockReturnValue(makeSuccess(''));       // remaining calls succeed

    const result = await installDocker();

    // systemctl failure is non-fatal — should still return success
    expect(result.success).toBe(true);
  });

  it('adds current user to docker group when USER env is set', async () => {
    const origUser = process.env['USER'];
    process.env['USER'] = 'testuser';

    mockExeca.mockReturnValue(makeSuccess(''));

    await installDocker();

    const calls = mockExeca.mock.calls.map((c) => (c as unknown[])[1] as string[]);
    const hasUsermod = calls.some(
      (args) => Array.isArray(args) && args.includes('usermod'),
    );
    expect(hasUsermod).toBe(true);

    process.env['USER'] = origUser;
  });

  it('skips usermod when USER env is not set', async () => {
    const origUser = process.env['USER'];
    const origLogname = process.env['LOGNAME'];
    delete process.env['USER'];
    delete process.env['LOGNAME'];

    mockExeca.mockReturnValue(makeSuccess(''));

    await installDocker();

    const calls = mockExeca.mock.calls.map((c) => (c as unknown[])[1] as string[]);
    const hasUsermod = calls.some(
      (args) => Array.isArray(args) && args.includes('usermod'),
    );
    expect(hasUsermod).toBe(false);

    process.env['USER'] = origUser;
    process.env['LOGNAME'] = origLogname;
  });
});
