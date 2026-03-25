/**
 * Additional unit tests for utils/port-utils
 *
 * Covers getPortOccupant (L21-41) not tested in port-utils.test.ts.
 * Mocks node:child_process.execSync and node:os to control platform detection.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecSync = jest.fn<() => string>();

jest.unstable_mockModule('node:child_process', () => ({
  execSync: mockExecSync,
}));

let mockPlatform = 'linux';
jest.unstable_mockModule('node:os', () => ({
  default: {
    platform: () => mockPlatform,
  },
  platform: () => mockPlatform,
}));

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------

const { getPortOccupant } = await import('../../../../packages/cli/src/utils/port-utils.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform = 'linux';
});

describe('getPortOccupant', () => {
  it('returns null on non-supported platform (Windows)', () => {
    mockPlatform = 'win32';
    expect(getPortOccupant(80)).toBeNull();
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('returns null when lsof output is empty', () => {
    mockExecSync.mockReturnValue('');
    expect(getPortOccupant(80)).toBeNull();
  });

  it('returns null when lsof output is only header (no process line)', () => {
    // Only the header row, no LISTEN entries
    mockExecSync.mockReturnValue('COMMAND  PID  USER');
    expect(getPortOccupant(80)).toBeNull();
  });

  it('parses process name and PID from lsof output', () => {
    mockExecSync.mockReturnValue(
      'COMMAND    PID    USER\nnginx    1234   root   ...',
    );
    expect(getPortOccupant(80)).toBe('nginx (PID 1234)');
  });

  it('returns null when execSync throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('lsof not found'); });
    expect(getPortOccupant(80)).toBeNull();
  });

  it('works on darwin platform', () => {
    mockPlatform = 'darwin';
    mockExecSync.mockReturnValue('COMMAND    PID    USER\nhttpd    5678   user   ...');
    expect(getPortOccupant(443)).toBe('httpd (PID 5678)');
  });

  it('passes the correct port number to lsof command', () => {
    mockExecSync.mockReturnValue('COMMAND    PID    USER\nnode    9999   user   ...');
    getPortOccupant(3000);
    const cmd = (mockExecSync.mock.calls[0]?.[0] ?? '') as string;
    expect(cmd).toContain('3000');
  });
});
