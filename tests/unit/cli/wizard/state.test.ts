/**
 * Unit tests for wizard/state module (T022)
 *
 * Tests: createState, saveState, loadState, resetState,
 *        hasResumeState, getLastProject, listProjects
 *
 * Strategy: Mock node:fs, node:os, conf, and logger to avoid filesystem
 * side-effects and isolate business logic.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup — must be called before importing the module under test
// ---------------------------------------------------------------------------

// Mock fs functions
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string, encoding: string) => string>();
const mockWriteFileSync = jest.fn<(path: string, data: string, encoding: string) => void>();
const mockMkdirSync = jest.fn<(path: string, options?: any) => any>();
const mockReaddirSync = jest.fn<(path: string, options?: any) => any>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
}));

// Mock node:os to return a predictable home directory
jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/mock-home'),
}));

// Mock conf package (global config store)
const mockConfGet = jest.fn<(key: string) => any>();
const mockConfSet = jest.fn<(key: string, value: any) => void>();

jest.unstable_mockModule('conf', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: mockConfGet,
    set: mockConfSet,
  })),
}));

// Mock logger to suppress output during tests
jest.unstable_mockModule('../../../../packages/cli/src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test (must come AFTER jest.unstable_mockModule calls)
// ---------------------------------------------------------------------------

const {
  createState,
  loadState,
  saveState,
  resetState,
  hasResumeState,
  getLastProject,
  listProjects,
  getProjectDir,
  getStateFilePath,
  _resetGlobalConfig,
} = await import('../../../../packages/cli/src/wizard/state.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid WizardState object for testing. */
function buildValidState(overrides: Record<string, unknown> = {}): any {
  return {
    schemaVersion: 7,
    projectName: 'test-project',
    projectPath: '~/brewnet/test-project',
    setupType: 'full',
    admin: { username: 'admin', password: 'secret', storage: 'local' },
    servers: {
      webServer: { enabled: true, service: 'traefik' },
      fileServer: { enabled: false, service: '' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: true,
        primary: 'postgresql',
        primaryVersion: '17',
        dbName: 'brewnet_db',
        dbUser: 'brewnet',
        dbPassword: '',
        adminUI: true,
        cache: 'redis',
      },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      mailServer: { enabled: false, service: 'docker-mailserver' },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' },
    },
    devStack: { languages: [], frameworks: {}, frontend: null },
    boilerplate: { generate: true, sampleData: true, devMode: 'hot-reload' },
    domain: {
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      cloudflare: {
        enabled: false,
        tunnelMode: 'none',
        quickTunnelUrl: '',
        accountId: '',
        apiToken: '',
        tunnelId: '',
        tunnelToken: '',
        tunnelName: '',
        zoneId: '',
        zoneName: '',
      },
    },
    portRemapping: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Reset global config singleton so each test starts fresh
  _resetGlobalConfig();
});

// ── Path helpers ────────────────────────────────────────────────────────────

describe('getProjectDir / getStateFilePath', () => {
  it('returns the correct project directory', () => {
    expect(getProjectDir('my-project')).toBe(
      '/mock-home/.brewnet/projects/my-project',
    );
  });

  it('returns the correct state file path', () => {
    expect(getStateFilePath('my-project')).toBe(
      '/mock-home/.brewnet/projects/my-project/selections.json',
    );
  });
});

// ── createState ─────────────────────────────────────────────────────────────

describe('createState', () => {
  it('returns a WizardState with schemaVersion 7', () => {
    const state = createState();
    expect(state.schemaVersion).toBe(7);
  });

  it('returns default project name "my-homeserver"', () => {
    const state = createState();
    expect(state.projectName).toBe('my-homeserver');
  });

  it('returns the expected default structure', () => {
    const state = createState();

    // Top-level defaults
    expect(state.setupType).toBe('full');
    expect(state.projectPath).toBe('~/brewnet/my-homeserver');

    // Admin defaults
    expect(state.admin.username).toBe('admin');
    expect(state.admin.password).toBe('');
    expect(state.admin.storage).toBe('local');

    // Server defaults
    expect(state.servers.webServer.enabled).toBe(true);
    expect(state.servers.webServer.service).toBe('traefik');
    expect(state.servers.fileServer.enabled).toBe(false);
    expect(state.servers.gitServer.enabled).toBe(true);
    expect(state.servers.gitServer.service).toBe('gitea');
    expect(state.servers.dbServer.enabled).toBe(true);
    expect(state.servers.dbServer.primary).toBe('postgresql');
    expect(state.servers.media.enabled).toBe(false);
    expect(state.servers.sshServer.enabled).toBe(false);
    expect(state.servers.mailServer.enabled).toBe(false);
    expect(state.servers.appServer.enabled).toBe(false);
    expect(state.servers.fileBrowser.enabled).toBe(false);

    // DevStack defaults
    expect(state.devStack.languages).toEqual([]);
    expect(state.devStack.frameworks).toEqual({});
    expect(state.devStack.frontend).toBeNull();

    // Boilerplate defaults
    expect(state.boilerplate.generate).toBe(true);
    expect(state.boilerplate.sampleData).toBe(true);
    expect(state.boilerplate.devMode).toBe('hot-reload');

    // Domain defaults
    expect(state.domain.provider).toBe('local');
    expect(state.domain.name).toBe('brewnet.local');
    expect(state.domain.ssl).toBe('self-signed');
    expect(state.domain.cloudflare.enabled).toBe(false);
  });

  it('returns a new object on each call (no shared references)', () => {
    const state1 = createState();
    const state2 = createState();
    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
  });
});

// ── saveState ───────────────────────────────────────────────────────────────

describe('saveState', () => {
  it('creates the project directory recursively', () => {
    const state = buildValidState();
    saveState(state);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/mock-home/.brewnet/projects/test-project',
      { recursive: true },
    );
  });

  it('writes the state as pretty-printed JSON', () => {
    const state = buildValidState();
    saveState(state);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock-home/.brewnet/projects/test-project/selections.json',
      JSON.stringify(state, null, 2),
      'utf-8',
    );
  });

  it('updates the global config with the project name', () => {
    // mkdirSync needed by getGlobalConfig() initialization
    mockMkdirSync.mockReturnValue(undefined);
    const state = buildValidState();
    saveState(state);

    expect(mockConfSet).toHaveBeenCalledWith('lastProject', 'test-project');
  });

  it('does not throw when global config write fails', () => {
    mockConfSet.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const state = buildValidState();
    expect(() => saveState(state)).not.toThrow();
  });
});

// ── loadState ───────────────────────────────────────────────────────────────

describe('loadState', () => {
  it('returns null when no state file exists', () => {
    mockExistsSync.mockReturnValue(false);

    const result = loadState('nonexistent');
    expect(result).toBeNull();
  });

  it('loads and returns a valid state from disk', () => {
    const state = buildValidState();

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    const result = loadState('test-project');
    expect(result).toEqual(state);
    expect(result!.schemaVersion).toBe(7);
    expect(result!.projectName).toBe('test-project');
  });

  it('returns null for corrupt JSON (parse error)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ this is not valid JSON!!!');

    const result = loadState('broken');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');

    const result = loadState('empty');
    expect(result).toBeNull();
  });

  it('returns null when the parsed value is not an object (string)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('"just a string"');

    const result = loadState('string-state');
    expect(result).toBeNull();
  });

  it('returns null when the parsed value is null', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('null');

    const result = loadState('null-state');
    expect(result).toBeNull();
  });

  it('returns null when the parsed value is an array', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('[1, 2, 3]');

    // Note: typeof [] === 'object' but the code checks `parsed === null`
    // An array still has schemaVersion undefined, so it will fail the schema version check
    const result = loadState('array-state');
    expect(result).toBeNull();
  });

  it('returns null when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = loadState('unreadable');
    expect(result).toBeNull();
  });
});

// ── Schema migration ────────────────────────────────────────────────────────

describe('loadState — schema migration', () => {
  it('returns null when schemaVersion is 3 (older than current 7)', () => {
    const oldState = buildValidState({ schemaVersion: 3 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(oldState));

    const result = loadState('old-v3');
    expect(result).toBeNull();
  });

  it('returns null when schemaVersion is 4 (older than current 7)', () => {
    const oldState = buildValidState({ schemaVersion: 4 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(oldState));

    const result = loadState('old-v4');
    expect(result).toBeNull();
  });

  it('returns null when schemaVersion is 5 (older than current 7)', () => {
    const oldState = buildValidState({ schemaVersion: 5 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(oldState));

    const result = loadState('old-v5');
    expect(result).toBeNull();
  });

  it('returns null when schemaVersion is 1 (very old)', () => {
    const oldState = buildValidState({ schemaVersion: 1 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(oldState));

    const result = loadState('old-v1');
    expect(result).toBeNull();
  });

  it('migrates v6 state: converts frontend array to single value', () => {
    // v6 state with frontend as array ['reactjs']
    const v6State = {
      ...buildValidState({ schemaVersion: 6 }),
      devStack: { languages: [], frameworks: {}, frontend: ['reactjs'] },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(v6State));

    const result = loadState('migrate-v6-react');
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(7);
    expect(result!.devStack.frontend).toBe('react');
  });

  it('migrates v6 state: frontend empty array maps to null', () => {
    const v6State = {
      ...buildValidState({ schemaVersion: 6 }),
      devStack: { languages: [], frameworks: {}, frontend: [] },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(v6State));

    const result = loadState('migrate-v6-empty');
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(7);
    expect(result!.devStack.frontend).toBeNull();
  });

  it('returns the state when schemaVersion matches the current (7)', () => {
    const state = buildValidState({ schemaVersion: 7 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    const result = loadState('current-v7');
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(7);
  });

  it('returns null when schemaVersion is missing', () => {
    const noVersion = { projectName: 'test' };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(noVersion));

    const result = loadState('no-version');
    expect(result).toBeNull();
  });

  it('returns null when schemaVersion is a non-numeric type', () => {
    const badVersion = buildValidState({ schemaVersion: 'five' });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(badVersion));

    const result = loadState('string-version');
    expect(result).toBeNull();
  });

  it('returns null when schemaVersion is higher than current (future version)', () => {
    const futureState = buildValidState({ schemaVersion: 99 });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(futureState));

    // schemaVersion 99 is not < SCHEMA_VERSION, but 99 !== SCHEMA_VERSION
    // so the second check (obj.schemaVersion !== SCHEMA_VERSION) catches it
    const result = loadState('future-v99');
    expect(result).toBeNull();
  });
});

// ── saveState + loadState round-trip ────────────────────────────────────────

describe('saveState + loadState (round-trip)', () => {
  it('saves state to disk and loads it back correctly', () => {
    const state = buildValidState({ projectName: 'roundtrip' });

    // Capture what saveState writes
    let writtenData = '';
    mockWriteFileSync.mockImplementation(
      (_path: string, data: string, _encoding: string) => {
        writtenData = data;
      },
    );

    saveState(state);

    // Now simulate loadState reading back the same data
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => writtenData);

    const loaded = loadState('roundtrip');
    expect(loaded).toEqual(state);
  });

  it('preserves nested objects through save/load cycle', () => {
    const state = buildValidState({
      projectName: 'nested-test',
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: 'react',
      },
      servers: {
        ...buildValidState().servers,
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
        media: { enabled: true, services: ['jellyfin'] },
      },
    });

    let writtenData = '';
    mockWriteFileSync.mockImplementation(
      (_path: string, data: string, _encoding: string) => {
        writtenData = data;
      },
    );

    saveState(state);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => writtenData);

    const loaded = loadState('nested-test');
    expect(loaded).toEqual(state);
    expect(loaded!.devStack.languages).toEqual(['nodejs', 'python']);
    expect(loaded!.devStack.frameworks).toEqual({ nodejs: 'nextjs', python: 'fastapi' });
    expect(loaded!.servers.sshServer.sftp).toBe(true);
    expect(loaded!.servers.media.services).toEqual(['jellyfin']);
  });
});

// ── resetState ──────────────────────────────────────────────────────────────

describe('resetState', () => {
  it('returns a fresh state with the given project name', () => {
    const state = resetState('fresh-project');
    expect(state.projectName).toBe('fresh-project');
    expect(state.schemaVersion).toBe(7);
  });

  it('sets the projectPath based on the project name', () => {
    const state = resetState('my-server');
    expect(state.projectPath).toBe('~/brewnet/my-server');
  });

  it('saves the reset state to disk', () => {
    resetState('saved-reset');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock-home/.brewnet/projects/saved-reset/selections.json',
      expect.any(String),
      'utf-8',
    );

    // Verify the written data contains the correct project name
    const writtenJson = (mockWriteFileSync.mock.calls[0] as any[])[1] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.projectName).toBe('saved-reset');
    expect(parsed.schemaVersion).toBe(7);
  });

  it('returns default values for all other fields', () => {
    const state = resetState('defaults-check');
    const defaultState = createState();

    // Everything except projectName and projectPath should match defaults
    expect(state.setupType).toBe(defaultState.setupType);
    expect(state.admin).toEqual(defaultState.admin);
    expect(state.servers).toEqual(defaultState.servers);
    expect(state.devStack).toEqual(defaultState.devStack);
    expect(state.boilerplate).toEqual(defaultState.boilerplate);
    expect(state.domain).toEqual(defaultState.domain);
  });
});

// ── hasResumeState ──────────────────────────────────────────────────────────

describe('hasResumeState', () => {
  it('returns true when the state file exists', () => {
    mockExistsSync.mockReturnValue(true);

    expect(hasResumeState('existing-project')).toBe(true);
    expect(mockExistsSync).toHaveBeenCalledWith(
      '/mock-home/.brewnet/projects/existing-project/selections.json',
    );
  });

  it('returns false when the state file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    expect(hasResumeState('nonexistent')).toBe(false);
    expect(mockExistsSync).toHaveBeenCalledWith(
      '/mock-home/.brewnet/projects/nonexistent/selections.json',
    );
  });
});

// ── getLastProject ──────────────────────────────────────────────────────────

describe('getLastProject', () => {
  it('returns the last saved project name', () => {
    mockConfGet.mockReturnValue('my-project');

    const result = getLastProject();
    expect(result).toBe('my-project');
  });

  it('returns undefined when no project has been saved (empty string)', () => {
    mockConfGet.mockReturnValue('');

    const result = getLastProject();
    expect(result).toBeUndefined();
  });

  it('returns undefined when global config throws', () => {
    mockConfGet.mockImplementation(() => {
      throw new Error('Config read failure');
    });

    const result = getLastProject();
    expect(result).toBeUndefined();
  });

  it('returns undefined when lastProject is undefined', () => {
    mockConfGet.mockReturnValue(undefined);

    const result = getLastProject();
    expect(result).toBeUndefined();
  });
});

// ── listProjects ────────────────────────────────────────────────────────────

describe('listProjects', () => {
  it('returns a list of project names that have saved state', () => {
    // PROJECTS_DIR exists
    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/mock-home/.brewnet/projects') return true;
      // selections.json exists for proj-a and proj-b but not proj-c
      if (path === '/mock-home/.brewnet/projects/proj-a/selections.json') return true;
      if (path === '/mock-home/.brewnet/projects/proj-b/selections.json') return true;
      if (path === '/mock-home/.brewnet/projects/proj-c/selections.json') return false;
      return false;
    });

    mockReaddirSync.mockReturnValue([
      { name: 'proj-a', isDirectory: () => true },
      { name: 'proj-b', isDirectory: () => true },
      { name: 'proj-c', isDirectory: () => true },
    ]);

    const result = listProjects();
    expect(result).toEqual(['proj-a', 'proj-b']);
  });

  it('returns empty array when projects directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = listProjects();
    expect(result).toEqual([]);
  });

  it('filters out non-directory entries', () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/mock-home/.brewnet/projects') return true;
      if (path === '/mock-home/.brewnet/projects/real-project/selections.json')
        return true;
      return false;
    });

    mockReaddirSync.mockReturnValue([
      { name: 'real-project', isDirectory: () => true },
      { name: 'some-file.txt', isDirectory: () => false },
    ]);

    const result = listProjects();
    expect(result).toEqual(['real-project']);
  });

  it('returns empty array when readdirSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = listProjects();
    expect(result).toEqual([]);
  });

  it('returns empty array when there are no project directories', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);

    const result = listProjects();
    expect(result).toEqual([]);
  });

  it('returns empty array when directories exist but none have selections.json', () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/mock-home/.brewnet/projects') return true;
      return false; // No selections.json for any project
    });

    mockReaddirSync.mockReturnValue([
      { name: 'empty-proj', isDirectory: () => true },
    ]);

    const result = listProjects();
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 11 — Cross-Cutting Persistence Tests (T107: TC-W-01 through TC-W-05)
// ═══════════════════════════════════════════════════════════════════════════

describe('T107 — Wizard state persistence (cross-cutting)', () => {
  // TC-W-01: State saved to ~/.brewnet/projects/<name>/selections.json
  describe('TC-W-01: State path convention', () => {
    it('should save state to ~/.brewnet/projects/<projectName>/selections.json', () => {
      const state = buildValidState({ projectName: 'my-server' });
      saveState(state);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/mock-home/.brewnet/projects/my-server/selections.json',
        expect.any(String),
        'utf-8',
      );
    });

    it('should use the projectName from state as the directory name', () => {
      const state = buildValidState({ projectName: 'production-box' });
      saveState(state);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/mock-home/.brewnet/projects/production-box',
        { recursive: true },
      );
    });
  });

  // TC-W-02: Resume detected when previous state exists
  describe('TC-W-02: Resume detection', () => {
    it('should detect resume availability when selections.json exists', () => {
      mockExistsSync.mockReturnValue(true);
      expect(hasResumeState('my-server')).toBe(true);
    });

    it('should not detect resume when selections.json is absent', () => {
      mockExistsSync.mockReturnValue(false);
      expect(hasResumeState('my-server')).toBe(false);
    });

    it('should check the correct file path for resume detection', () => {
      mockExistsSync.mockReturnValue(false);
      hasResumeState('some-project');

      expect(mockExistsSync).toHaveBeenCalledWith(
        '/mock-home/.brewnet/projects/some-project/selections.json',
      );
    });
  });

  // TC-W-03: Loaded state has all previous selections
  describe('TC-W-03: Full state recovery', () => {
    it('should load back the exact same state that was saved (round-trip)', () => {
      const original = buildValidState({
        projectName: 'recovery-test',
        devStack: {
          languages: ['nodejs', 'python'],
          frameworks: { nodejs: 'nextjs', python: 'fastapi' },
          frontend: 'react',
        },
        domain: {
          provider: 'custom',
          name: 'myserver.dev',
          ssl: 'letsencrypt',
          cloudflare: { enabled: true, tunnelToken: 'abc123', tunnelName: 'my-tunnel' },
        },
      });

      let captured = '';
      mockWriteFileSync.mockImplementation(
        (_path: string, data: string, _enc: string) => { captured = data; },
      );
      saveState(original);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => captured);

      const loaded = loadState('recovery-test');
      expect(loaded).toEqual(original);
      expect(loaded!.devStack.languages).toEqual(['nodejs', 'python']);
      expect(loaded!.domain.cloudflare.tunnelToken).toBe('abc123');
    });
  });

  // TC-W-04: "Start fresh" discards previous state
  describe('TC-W-04: Start fresh discards state', () => {
    it('should return default values when resetState is called (fresh start)', () => {
      const reset = resetState('discarded-project');
      const defaults = createState();

      // All non-name fields should be defaults
      expect(reset.admin).toEqual(defaults.admin);
      expect(reset.servers).toEqual(defaults.servers);
      expect(reset.devStack).toEqual(defaults.devStack);
      expect(reset.domain).toEqual(defaults.domain);
      expect(reset.boilerplate).toEqual(defaults.boilerplate);
    });

    it('should overwrite the saved file with the fresh state', () => {
      resetState('overwritten-project');

      // saveState is called internally, which writes to disk
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/mock-home/.brewnet/projects/overwritten-project/selections.json',
        expect.any(String),
        'utf-8',
      );

      // Verify the written data is a fresh default with the given name
      const writtenJson = (mockWriteFileSync.mock.calls[0] as any[])[1] as string;
      const parsed = JSON.parse(writtenJson);
      expect(parsed.projectName).toBe('overwritten-project');
      expect(parsed.schemaVersion).toBe(7);
      expect(parsed.admin.username).toBe('admin');
    });
  });

  // TC-W-05: Schema version migration
  describe('TC-W-05: Schema version migration', () => {
    it.each([1, 2, 3, 4, 5])(
      'should return null for schemaVersion %i (older than current 7, no migration path)',
      (version) => {
        const oldState = buildValidState({ schemaVersion: version });
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(oldState));

        const result = loadState(`old-v${version}`);
        expect(result).toBeNull();
      },
    );

    it('should migrate v6 state: frontend array → null when empty', () => {
      const v6State = {
        ...buildValidState({ schemaVersion: 6 }),
        devStack: { languages: [], frameworks: {}, frontend: [] },
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(v6State));

      const result = loadState('migrate-v6');
      expect(result).not.toBeNull();
      expect(result!.schemaVersion).toBe(7);
      expect(result!.devStack.frontend).toBeNull();
    });

    it('should return the state when schemaVersion is exactly 7 (current)', () => {
      const state = buildValidState({ schemaVersion: 7 });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(state));

      const result = loadState('current');
      expect(result).not.toBeNull();
      expect(result!.schemaVersion).toBe(7);
    });

    it('should return null for future schema versions (e.g., 8, 99)', () => {
      for (const futureVersion of [8, 99]) {
        const futureState = buildValidState({ schemaVersion: futureVersion });
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(futureState));

        const result = loadState(`future-v${futureVersion}`);
        expect(result).toBeNull();
      }
    });
  });
});
