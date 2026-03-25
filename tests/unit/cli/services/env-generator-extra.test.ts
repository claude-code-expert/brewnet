/**
 * Additional unit tests for services/env-generator
 *
 * Covers paths not exercised by env-generator.test.ts:
 *   - generateHtpasswd: openssl fallback (L73-78), MD5 fallback (L84-85)
 *   - writeSecretFiles: non-empty secretFiles (L277-286)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecSync = jest.fn<() => string>(() => {
  throw new Error('command not found');
});

jest.unstable_mockModule('node:child_process', () => ({
  execSync: mockExecSync,
}));

const mockWriteFileSync = jest.fn();
const mockChmodSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  chmodSync: mockChmodSync,
  mkdirSync: mockMkdirSync,
  default: {
    writeFileSync: mockWriteFileSync,
    chmodSync: mockChmodSync,
    mkdirSync: mockMkdirSync,
  },
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { generateEnvFiles, writeSecretFiles } = await import(
  '../../../../packages/cli/src/services/env-generator.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Record<string, unknown> = {}) {
  const state = createDefaultWizardState('test-project', '/tmp/test-project');
  // Give admin password so generateHtpasswd is invoked with a real password
  state.admin.username = 'admin';
  state.admin.password = 'testpassword123';
  Object.assign(state, overrides);
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all execSync calls throw (htpasswd and openssl unavailable)
  mockExecSync.mockImplementation(() => {
    throw new Error('command not found');
  });
});

// ---------------------------------------------------------------------------
// generateHtpasswd — openssl fallback (L73-78)
// ---------------------------------------------------------------------------

describe('generateHtpasswd — openssl fallback', () => {
  it('uses openssl output when htpasswd fails but openssl succeeds', () => {
    mockExecSync
      // htpasswd call throws
      .mockImplementationOnce(() => { throw new Error('htpasswd not found'); })
      // openssl call returns valid apr1 hash
      .mockImplementationOnce(() => '$apr1$abcd1234$hashedvalue\n');

    const result = generateEnvFiles(makeState());
    // TRAEFIK_DASHBOARD_AUTH is a secret file, not in envContent
    const authSecret = result.secretFiles.find(
      (sf) => sf.relativePath === 'secrets/traefik_dashboard_auth',
    );
    expect(authSecret?.content).toContain('admin:$apr1$abcd1234$hashedvalue');
  });
});

// ---------------------------------------------------------------------------
// generateHtpasswd — MD5 fallback (L84-85)
// ---------------------------------------------------------------------------

describe('generateHtpasswd — MD5 fallback', () => {
  it('uses MD5 hash when both htpasswd and openssl fail', () => {
    // Both execSync calls throw (default behavior from beforeEach)
    const result = generateEnvFiles(makeState());
    // TRAEFIK_DASHBOARD_AUTH is a secret file with {MD5} format
    const authSecret = result.secretFiles.find(
      (sf) => sf.relativePath === 'secrets/traefik_dashboard_auth',
    );
    expect(authSecret?.content).toContain('admin:{MD5}');
  });
});

// ---------------------------------------------------------------------------
// writeSecretFiles (L277-286)
// ---------------------------------------------------------------------------

describe('writeSecretFiles', () => {
  it('does nothing when secretFiles array is empty', () => {
    writeSecretFiles('/tmp/project', []);
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('creates secrets dir and writes each secret file', () => {
    writeSecretFiles('/tmp/project', [
      { relativePath: 'secrets/admin_password', content: 'mypassword' },
      { relativePath: 'secrets/db_password', content: 'dbpassword' },
    ]);

    // mkdirSync called for secrets dir
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/project/secrets', { recursive: true });
    // chmodSync called for secrets dir
    expect(mockChmodSync).toHaveBeenCalledWith('/tmp/project/secrets', 0o700);
    // writeFileSync called for each file
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/project/secrets/admin_password',
      'mypassword',
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/project/secrets/db_password',
      'dbpassword',
      expect.objectContaining({ mode: 0o600 }),
    );
    // chmodSync called for each file too (mode 0o600)
    expect(mockChmodSync).toHaveBeenCalledWith('/tmp/project/secrets/admin_password', 0o600);
    expect(mockChmodSync).toHaveBeenCalledWith('/tmp/project/secrets/db_password', 0o600);
  });
});
