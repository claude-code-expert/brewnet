/**
 * Unit tests for services/system-service
 *
 * Covers macOS (LaunchAgent) and Linux (systemd user) service management.
 *
 * Edge cases:
 *   - installBrewnetService generates correct plist (macOS)
 *   - installBrewnetService generates correct systemd unit (Linux)
 *   - plist written to ~/Library/LaunchAgents/com.brewnet.admin.plist (macOS)
 *   - unit written to ~/.config/systemd/user/brewnet-admin.service (Linux)
 *   - isBrewnetServiceInstalled returns true when file exists
 *   - isBrewnetServiceInstalled returns false when file missing
 *   - uninstallBrewnetService removes the correct file
 *   - uninstallBrewnetService returns false (no-op) when file not present
 *   - --path forwarded into plist/unit when provided
 *   - --port forwarded into plist/unit when provided
 *   - plist contains RunAtLoad=true and KeepAlive=true
 *   - plist contains --foreground and --no-open flags
 *   - systemd unit contains Restart=always and WantedBy=default.target
 *   - getServiceFilePath returns correct paths per platform
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<() => boolean>();
const mockWriteFileSync = jest.fn();
const mockUnlinkSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn<() => string>(() => '');

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
}));

const mockExeca = jest.fn<() => Promise<{ stdout: string; stderr: string; exitCode: number }>>();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const {
  installBrewnetService,
  uninstallBrewnetService,
  isBrewnetServiceInstalled,
  getServiceFilePath,
} = await import('../../../../packages/cli/src/services/system-service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_BIN = '/usr/local/bin/brewnet';
const HOME = homedir();

// ---------------------------------------------------------------------------
// getServiceFilePath
// ---------------------------------------------------------------------------

describe('getServiceFilePath', () => {
  it('returns LaunchAgents plist path on darwin', () => {
    const path = getServiceFilePath('darwin');
    expect(path).toBe(join(HOME, 'Library', 'LaunchAgents', 'com.brewnet.admin.plist'));
  });

  it('returns systemd user service path on linux', () => {
    const path = getServiceFilePath('linux');
    expect(path).toBe(join(HOME, '.config', 'systemd', 'user', 'brewnet-admin.service'));
  });

  it('returns null for unsupported platforms (win32)', () => {
    const path = getServiceFilePath('win32');
    expect(path).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBrewnetServiceInstalled
// ---------------------------------------------------------------------------

describe('isBrewnetServiceInstalled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when service file exists (darwin)', () => {
    mockExistsSync.mockReturnValue(true);
    expect(isBrewnetServiceInstalled('darwin')).toBe(true);
  });

  it('returns false when service file does not exist (darwin)', () => {
    mockExistsSync.mockReturnValue(false);
    expect(isBrewnetServiceInstalled('darwin')).toBe(false);
  });

  it('returns true when systemd unit file exists (linux)', () => {
    mockExistsSync.mockReturnValue(true);
    expect(isBrewnetServiceInstalled('linux')).toBe(true);
  });

  it('returns false for unsupported platform', () => {
    expect(isBrewnetServiceInstalled('win32')).toBe(false);
  });

  it('checks the correct plist file path on darwin', () => {
    mockExistsSync.mockReturnValue(false);
    isBrewnetServiceInstalled('darwin');
    const expectedPath = join(HOME, 'Library', 'LaunchAgents', 'com.brewnet.admin.plist');
    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });

  it('checks the correct unit file path on linux', () => {
    mockExistsSync.mockReturnValue(false);
    isBrewnetServiceInstalled('linux');
    const expectedPath = join(HOME, '.config', 'systemd', 'user', 'brewnet-admin.service');
    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });
});

// ---------------------------------------------------------------------------
// installBrewnetService — macOS (darwin)
// ---------------------------------------------------------------------------

describe('installBrewnetService — macOS (darwin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('writes plist to ~/Library/LaunchAgents/com.brewnet.admin.plist', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const expectedPath = join(HOME, 'Library', 'LaunchAgents', 'com.brewnet.admin.plist');
    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('plist contains the Label com.brewnet.admin', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('com.brewnet.admin');
  });

  it('plist contains the brewnet binary path', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain(MOCK_BIN);
  });

  it('plist contains admin subcommand', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('<string>admin</string>');
  });

  it('plist contains --foreground flag', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('--foreground');
  });

  it('plist contains --no-open flag', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('--no-open');
  });

  it('plist contains RunAtLoad = true', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('<key>RunAtLoad</key>');
    expect(content).toContain('<true/>');
  });

  it('plist contains KeepAlive = true', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('<key>KeepAlive</key>');
  });

  it('plist contains log file path under ~/.brewnet/logs', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('.brewnet/logs');
  });

  it('plist includes custom port when port != 8088', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 9000, platform: 'darwin' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('9000');
  });

  it('plist includes --path when projectPath provided', async () => {
    await installBrewnetService({
      brewnetBin: MOCK_BIN,
      port: 8088,
      platform: 'darwin',
      projectPath: '/home/user/my-server',
    });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('--path');
    expect(content).toContain('/home/user/my-server');
  });

  it('activates plist via launchctl load -w', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const plistPath = join(HOME, 'Library', 'LaunchAgents', 'com.brewnet.admin.plist');
    expect(mockExeca).toHaveBeenCalledWith('launchctl', ['load', '-w', plistPath]);
  });

  it('creates LaunchAgents directory if needed', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'darwin' });
    const expectedDir = join(HOME, 'Library', 'LaunchAgents');
    expect(mockMkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// installBrewnetService — Linux (systemd user)
// ---------------------------------------------------------------------------

describe('installBrewnetService — Linux (systemd user)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('writes unit to ~/.config/systemd/user/brewnet-admin.service', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const expectedPath = join(HOME, '.config', 'systemd', 'user', 'brewnet-admin.service');
    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8');
  });

  it('unit contains [Unit] section', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('[Unit]');
  });

  it('unit contains [Service] section', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('[Service]');
  });

  it('unit contains [Install] section', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('[Install]');
  });

  it('unit ExecStart contains brewnet binary', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain(`ExecStart=${MOCK_BIN}`);
  });

  it('unit ExecStart contains admin --foreground --no-open', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('admin --foreground --no-open');
  });

  it('unit contains Restart=always', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('Restart=always');
  });

  it('unit contains WantedBy=default.target', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('WantedBy=default.target');
  });

  it('unit includes custom port when port != 8088', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 9000, platform: 'linux' });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('--port 9000');
  });

  it('unit includes --path when projectPath provided', async () => {
    await installBrewnetService({
      brewnetBin: MOCK_BIN,
      port: 8088,
      platform: 'linux',
      projectPath: '/home/user/my-server',
    });
    const content = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('--path /home/user/my-server');
  });

  it('enables and starts service via systemctl --user', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    expect(mockExeca).toHaveBeenCalledWith('systemctl', ['--user', 'daemon-reload']);
    expect(mockExeca).toHaveBeenCalledWith('systemctl', ['--user', 'enable', '--now', 'brewnet-admin']);
  });

  it('creates systemd user directory if needed', async () => {
    await installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'linux' });
    const expectedDir = join(HOME, '.config', 'systemd', 'user');
    expect(mockMkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// installBrewnetService — unsupported platform
// ---------------------------------------------------------------------------

describe('installBrewnetService — unsupported platform', () => {
  it('throws for unsupported platform (win32)', async () => {
    await expect(
      installBrewnetService({ brewnetBin: MOCK_BIN, port: 8088, platform: 'win32' }),
    ).rejects.toThrow(/not supported/i);
  });
});

// ---------------------------------------------------------------------------
// uninstallBrewnetService
// ---------------------------------------------------------------------------

describe('uninstallBrewnetService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false when service is not installed (darwin)', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await uninstallBrewnetService('darwin');
    expect(result).toBe(false);
  });

  it('returns false when service is not installed (linux)', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await uninstallBrewnetService('linux');
    expect(result).toBe(false);
  });

  it('removes plist file on darwin when installed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await uninstallBrewnetService('darwin');
    const expectedPath = join(HOME, 'Library', 'LaunchAgents', 'com.brewnet.admin.plist');
    expect(mockUnlinkSync).toHaveBeenCalledWith(expectedPath);
  });

  it('unloads plist via launchctl before removing on darwin', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await uninstallBrewnetService('darwin');
    expect(mockExeca).toHaveBeenCalledWith(
      'launchctl',
      ['unload', '-w', expect.stringContaining('com.brewnet.admin.plist')],
      expect.objectContaining({ reject: false }),
    );
  });

  it('removes unit file on linux when installed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await uninstallBrewnetService('linux');
    const expectedPath = join(HOME, '.config', 'systemd', 'user', 'brewnet-admin.service');
    expect(mockUnlinkSync).toHaveBeenCalledWith(expectedPath);
  });

  it('stops and disables service via systemctl --user before removing on linux', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await uninstallBrewnetService('linux');
    expect(mockExeca).toHaveBeenCalledWith(
      'systemctl',
      ['--user', 'stop', 'brewnet-admin'],
      expect.objectContaining({ reject: false }),
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'systemctl',
      ['--user', 'disable', 'brewnet-admin'],
      expect.objectContaining({ reject: false }),
    );
  });

  it('returns true when uninstall succeeds', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const result = await uninstallBrewnetService('darwin');
    expect(result).toBe(true);
  });

  it('returns false for unsupported platform', async () => {
    const result = await uninstallBrewnetService('win32');
    expect(result).toBe(false);
  });

  it('does not remove file when service not installed — darwin', async () => {
    mockExistsSync.mockReturnValue(false);
    await uninstallBrewnetService('darwin');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });
});
