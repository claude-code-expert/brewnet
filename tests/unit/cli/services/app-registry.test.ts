// tests/unit/cli/services/app-registry.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

const APPS_JSON = '/home/user/.brewnet/apps.json';

let fsContent: Record<string, string> = {};
const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => fsContent[p as string] ?? '[]');
const mockWriteFileSync = jest.fn((p: unknown, data: unknown) => {
  fsContent[p as string] = data as string;
});
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

// --------------------------------------------------------------------------
// Imports (after mocks)
// --------------------------------------------------------------------------

const { readApps, addApp, updateApp, removeApp } =
  await import('../../../../packages/cli/src/services/app-registry.js');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function sampleEntry(name = 'my-app') {
  return {
    name,
    mode: 'boilerplate' as const,
    stackId: 'nodejs-nextjs-full',
    appDir: '/home/user/brewnet/nodejs-nextjs-full',
    port: 3000,
    status: 'running' as const,
    createdAt: '2026-03-15T00:00:00.000Z',
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('app-registry', () => {
  beforeEach(() => {
    fsContent = {};
    jest.clearAllMocks();
  });

  describe('readApps', () => {
    it('returns empty array when file does not exist', () => {
      const result = readApps(APPS_JSON);
      expect(result).toEqual([]);
    });

    it('returns parsed array when file exists', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      const result = readApps(APPS_JSON);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('my-app');
    });
  });

  describe('addApp', () => {
    it('appends entry and writes file', () => {
      addApp(APPS_JSON, sampleEntry());
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe('my-app');
    });

    it('throws when name already exists', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      expect(() => addApp(APPS_JSON, sampleEntry())).toThrow('already exists');
    });
  });

  describe('updateApp', () => {
    it('updates matching entry by name', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry()]);
      updateApp(APPS_JSON, 'my-app', { status: 'stopped' });
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written[0].status).toBe('stopped');
    });

    it('throws when name not found', () => {
      fsContent[APPS_JSON] = JSON.stringify([]);
      expect(() => updateApp(APPS_JSON, 'ghost', {})).toThrow('not found');
    });
  });

  describe('removeApp', () => {
    it('removes entry by name', () => {
      fsContent[APPS_JSON] = JSON.stringify([sampleEntry('a'), sampleEntry('b')]);
      removeApp(APPS_JSON, 'a');
      const written = JSON.parse(fsContent[APPS_JSON]!);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe('b');
    });
  });
});
