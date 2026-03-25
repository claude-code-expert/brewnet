/**
 * Additional unit tests for services/app-registry
 *
 * Covers uncovered paths:
 *   - readApps: catch block on JSON parse error (L11)
 *   - readDeployHistory: file exists path (L42-44), catch block (L46)
 *   - appendDeployHistory: full function (L51-53)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fsContent: Record<string, string | null> = {}; // null = exists but throws on read

const mockExistsSync = jest.fn((p: unknown) => (p as string) in fsContent);
const mockReadFileSync = jest.fn((p: unknown) => {
  const content = fsContent[p as string];
  if (content === null) throw new Error('ENOENT');
  return content ?? '[]';
});
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

// ---------------------------------------------------------------------------
// SUT imports
// ---------------------------------------------------------------------------

const { readApps, readDeployHistory, appendDeployHistory } = await import(
  '../../../../packages/cli/src/services/app-registry.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APPS_JSON = '/home/user/.brewnet/apps.json';
const HISTORY_JSON = '/home/user/.brewnet/apps-history.json';

beforeEach(() => {
  fsContent = {};
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// readApps — catch block (L11)
// ---------------------------------------------------------------------------

describe('readApps — JSON parse error', () => {
  it('returns empty array when file exists but contains invalid JSON', () => {
    fsContent[APPS_JSON] = 'this is not valid json!!!';
    const result = readApps(APPS_JSON);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readDeployHistory (L42-44, L46)
// ---------------------------------------------------------------------------

describe('readDeployHistory', () => {
  it('returns empty array when file does not exist', () => {
    expect(readDeployHistory(HISTORY_JSON)).toEqual([]);
  });

  it('returns parsed entries when file exists and JSON is valid', () => {
    const entries = [
      { deployId: 'd1', appName: 'my-app', timestamp: '2026-03-15T10:00:00Z', status: 'success' },
    ];
    fsContent[HISTORY_JSON] = JSON.stringify(entries);
    const result = readDeployHistory(HISTORY_JSON);
    expect(result).toHaveLength(1);
    expect(result[0]!.deployId).toBe('d1');
  });

  it('returns empty array when file exists but contains invalid JSON', () => {
    fsContent[HISTORY_JSON] = 'not-valid-json';
    expect(readDeployHistory(HISTORY_JSON)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// appendDeployHistory (L51-53)
// ---------------------------------------------------------------------------

describe('appendDeployHistory', () => {
  it('creates new file with single entry when history is empty', () => {
    const entry = { deployId: 'd1', appName: 'my-app', timestamp: '2026-03-15T10:00:00Z', status: 'success' };
    appendDeployHistory(HISTORY_JSON, entry);

    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(fsContent[HISTORY_JSON]!);
    expect(written).toHaveLength(1);
    expect(written[0].deployId).toBe('d1');
  });

  it('appends entry to existing history', () => {
    const existing = [
      { deployId: 'd1', appName: 'my-app', timestamp: '2026-03-15T09:00:00Z', status: 'success' },
    ];
    fsContent[HISTORY_JSON] = JSON.stringify(existing);

    appendDeployHistory(HISTORY_JSON, {
      deployId: 'd2', appName: 'my-app', timestamp: '2026-03-15T10:00:00Z', status: 'failed',
    });

    const written = JSON.parse(fsContent[HISTORY_JSON]!);
    expect(written).toHaveLength(2);
    expect(written[1].deployId).toBe('d2');
  });
});
