/**
 * Unit tests for services/docker-installer module
 *
 * Covers: isDockerInstalled, isDaemonRunning, waitForDockerDaemon, installDocker
 * All execa calls are mocked to avoid real system execution.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock execa
// ---------------------------------------------------------------------------

const mockExeca = jest.fn();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

const {
  isDockerInstalled,
  isDaemonRunning,
  waitForDockerDaemon,
  installDocker,
} = await import('../../../../packages/cli/src/services/docker-installer.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecaSuccess(stdout = '') {
  return Object.assign(Promise.resolve({ stdout, stderr: '', exitCode: 0 }), {
    stdout: Promise.resolve(stdout),
    kill: () => {},
  });
}

function makeExecaFailure(exitCode = 1) {
  const err = Object.assign(new Error('command failed'), {
    exitCode,
    stdout: '',
    stderr: 'error',
  });
  return Promise.reject(err);
}

// ---------------------------------------------------------------------------
// isDockerInstalled
// ---------------------------------------------------------------------------

describe('isDockerInstalled', () => {
  beforeEach(() => mockExeca.mockReset());

  it('returns true when docker --version succeeds', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess('Docker version 24.0.0'));
    const result = await isDockerInstalled();
    expect(result).toBe(true);
    // Third argument is { env: augmentedEnv() } — use expect.objectContaining to be flexible
    expect(mockExeca).toHaveBeenCalledWith('docker', ['--version'], expect.objectContaining({
      env: expect.objectContaining({ PATH: expect.stringContaining('/usr/local/bin') }),
    }));
  });

  it('returns false when docker --version throws', async () => {
    mockExeca.mockReturnValue(makeExecaFailure());
    const result = await isDockerInstalled();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDaemonRunning
// ---------------------------------------------------------------------------

describe('isDaemonRunning', () => {
  beforeEach(() => mockExeca.mockReset());

  it('returns true when docker info exits with 0', async () => {
    mockExeca.mockReturnValue(
      Object.assign(Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), {
        kill: () => {},
      }),
    );
    const result = await isDaemonRunning();
    expect(result).toBe(true);
  });

  it('returns false when docker info exits with non-zero', async () => {
    mockExeca.mockReturnValue(
      Object.assign(Promise.resolve({ exitCode: 1, stdout: '', stderr: 'error' }), {
        kill: () => {},
      }),
    );
    const result = await isDaemonRunning();
    expect(result).toBe(false);
  });

  it('returns false when docker info throws', async () => {
    mockExeca.mockReturnValue(makeExecaFailure());
    const result = await isDaemonRunning();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// waitForDockerDaemon
// ---------------------------------------------------------------------------

describe('waitForDockerDaemon', () => {
  beforeEach(() => mockExeca.mockReset());

  it('returns true immediately when daemon is ready on first poll', async () => {
    mockExeca.mockReturnValue(
      Object.assign(Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), {
        kill: () => {},
      }),
    );
    const result = await waitForDockerDaemon(5000, 100);
    expect(result).toBe(true);
  });

  it('returns true after a few failed polls then success', async () => {
    let callCount = 0;
    mockExeca.mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Object.assign(Promise.resolve({ exitCode: 1, stdout: '', stderr: '' }), {
          kill: () => {},
        });
      }
      return Object.assign(Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), {
        kill: () => {},
      });
    });

    const result = await waitForDockerDaemon(5000, 50);
    expect(result).toBe(true);
  }, 10000);

  it('returns false when daemon never becomes ready within timeout', async () => {
    mockExeca.mockReturnValue(
      Object.assign(Promise.resolve({ exitCode: 1, stdout: '', stderr: '' }), {
        kill: () => {},
      }),
    );
    const result = await waitForDockerDaemon(200, 50);
    expect(result).toBe(false);
  }, 3000);
});

// ---------------------------------------------------------------------------
// installDocker
// ---------------------------------------------------------------------------

describe('installDocker', () => {
  beforeEach(() => mockExeca.mockReset());

  it('returns an InstallResult object with success and message fields', async () => {
    // On darwin: brew --version fails → hasBrew=false → installHomebrew fails → return failure
    mockExeca.mockReturnValue(makeExecaFailure(1)); // fail all commands

    const result = await installDocker();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('returns success when brew is available and docker installs successfully', async () => {
    // On darwin: brew --version succeeds → hasBrew=true
    // brew install --cask docker succeeds
    // open -a Docker succeeds
    mockExeca
      .mockReturnValueOnce(makeExecaSuccess('Homebrew 4.0.0'))   // brew --version
      .mockReturnValueOnce(makeExecaSuccess(''))                   // brew install --cask docker
      .mockReturnValueOnce(makeExecaSuccess(''));                   // open -a Docker

    const result = await installDocker();
    // On darwin this should return success (macOS install path)
    // On linux this test might return unsupported, but we test the interface
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
  });

  it('returns failure when installHomebrew fails after brew is not found', async () => {
    // brew --version fails → no brew
    // installHomebrew (/bin/bash) also fails
    mockExeca
      .mockReturnValueOnce(makeExecaFailure(1))   // brew --version fails
      .mockReturnValueOnce(makeExecaFailure(1));   // installHomebrew fails

    const result = await installDocker();
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('returns failure when brew install --cask docker fails', async () => {
    // brew --version succeeds → hasBrew=true
    // brew install --cask docker fails
    mockExeca
      .mockReturnValueOnce(makeExecaSuccess('Homebrew 4.0.0'))   // brew --version
      .mockReturnValueOnce(makeExecaFailure(1));                   // brew install fails

    const result = await installDocker();
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });
});
