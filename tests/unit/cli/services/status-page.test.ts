/**
 * Unit tests for services/status-page module
 *
 * Covers: generateAndOpenStatusPage
 * Mocks: node:fs (writeFileSync, mkdirSync), node:os (homedir), execa
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock node:os — must be set up BEFORE importing the module under test because
// homedir() is called at the module level to build path constants.
// ---------------------------------------------------------------------------

jest.unstable_mockModule('node:os', () => ({
  homedir: jest.fn(() => '/home/testuser'),
  tmpdir: jest.fn(() => '/tmp'),
}));

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------

const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  // Preserve any other fs exports that may be needed transitively
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Mock execa
// ---------------------------------------------------------------------------

const mockExeca = jest.fn();

jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// ---------------------------------------------------------------------------
// Imports (after all mock setup)
// ---------------------------------------------------------------------------

const { generateAndOpenStatusPage } = await import(
  '../../../../packages/cli/src/services/status-page.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return { ...base, ...overrides };
}

function makeExecaSuccess() {
  return Object.assign(Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }), {
    kill: () => {},
  });
}

function makeExecaFailure() {
  const err = Object.assign(new Error('open failed'), {
    exitCode: 1,
    stdout: '',
    stderr: 'error',
  });
  return Promise.reject(err);
}

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — file system behavior
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — file system behavior', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
    mockExeca.mockReturnValue(makeExecaSuccess());
  });

  it('returns a string path ending in index.html', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'secret1234', storage: 'local' } });
    const result = await generateAndOpenStatusPage(state, { noOpen: true });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/index\.html$/);
  });

  it('returns a path inside ~/.brewnet/status/', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'secret1234', storage: 'local' } });
    const result = await generateAndOpenStatusPage(state, { noOpen: true });
    expect(result).toBe('/home/testuser/.brewnet/status/index.html');
  });

  it('calls mkdirSync with the status directory and recursive option', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'secret1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/home/testuser/.brewnet/status',
      { recursive: true },
    );
  });

  it('calls writeFileSync with the file path and HTML content', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'secret1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [path, content, encoding] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(path).toBe('/home/testuser/.brewnet/status/index.html');
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    expect(encoding).toBe('utf-8');
  });

  it('writes valid HTML that starts with the DOCTYPE declaration', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'secret1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toMatch(/^<!DOCTYPE html>/);
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — browser open behavior
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — browser open behavior', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('does NOT call execa when noOpen=true', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('calls execa when noOpen=false (explicit)', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: false });
    expect(mockExeca).toHaveBeenCalledTimes(1);
  });

  it('calls execa when options is omitted (default opens browser)', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state);
    expect(mockExeca).toHaveBeenCalledTimes(1);
  });

  it('calls execa with the file:// URL of the generated file', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: false });
    const [, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(args).toContain('file:///home/testuser/.brewnet/status/index.html');
  });

  it('still returns the file path even when execa throws (non-fatal failure)', async () => {
    mockExeca.mockReturnValue(makeExecaFailure());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    const result = await generateAndOpenStatusPage(state, { noOpen: false });
    expect(result).toBe('/home/testuser/.brewnet/status/index.html');
  });

  it('still writes the file even when execa throws', async () => {
    mockExeca.mockReturnValue(makeExecaFailure());
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: false });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — HTML content: project name
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — HTML content: project name', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes the project name in the generated HTML', async () => {
    const state = makeState({
      projectName: 'my-awesome-server',
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('my-awesome-server');
  });

  it('uses the project name in the HTML <title>', async () => {
    const state = makeState({
      projectName: 'brewnet-home',
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toMatch(/<title>Brewnet — brewnet-home<\/title>/);
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — HTML content: domain and network
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — HTML content: local domain', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('sets domain to domain.name when provider is local', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'local',
        name: 'myserver.local',
        ssl: 'self-signed',
        cloudflare: {
          enabled: false,
          accountId: '',
          apiToken: '',
          tunnelId: '',
          tunnelToken: '',
          tunnelName: '',
          zoneId: '',
          zoneName: '',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('myserver.local');
  });

  it('shows Local (LAN only) in the network section for local provider', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'local',
        name: 'myhome.local',
        ssl: 'self-signed',
        cloudflare: {
          enabled: false,
          accountId: '',
          apiToken: '',
          tunnelId: '',
          tunnelToken: '',
          tunnelName: '',
          zoneId: '',
          zoneName: '',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Local (LAN only)');
  });

  it('does not include external URLs in service cards when provider is local', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'local',
        name: 'myhome.local',
        ssl: 'self-signed',
        cloudflare: {
          enabled: false,
          accountId: '',
          apiToken: '',
          tunnelId: '',
          tunnelToken: '',
          tunnelName: '',
          zoneId: '',
          zoneName: '',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    // External URLs are https:// links to subdomains
    expect(html).not.toContain('https://www.myhome.local');
    expect(html).not.toContain('https://git.myhome.local');
  });
});

describe('generateAndOpenStatusPage — HTML content: tunnel domain', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes external URLs using zoneName when provider is tunnel', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          accountId: 'acc-123',
          apiToken: '',
          tunnelId: 'tun-abc',
          tunnelToken: 'eyJ...',
          tunnelName: 'my-tunnel',
          zoneId: 'zone-xyz',
          zoneName: 'example.com',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('https://example.com');
    expect(html).toContain('https://git.example.com');
  });

  it('shows Cloudflare Tunnel in the network section for tunnel provider', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          accountId: 'acc-123',
          apiToken: '',
          tunnelId: 'tun-abc',
          tunnelToken: 'eyJ...',
          tunnelName: 'my-tunnel',
          zoneId: 'zone-xyz',
          zoneName: 'example.com',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Cloudflare Named Tunnel');
  });

  it('includes tunnel name in the network section', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          accountId: 'acc-123',
          apiToken: '',
          tunnelId: 'tun-def',
          tunnelToken: 'eyJ...',
          tunnelName: 'homeserver-tunnel',
          zoneId: 'zone-xyz',
          zoneName: 'example.com',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('homeserver-tunnel');
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — HTML content: optional services
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — HTML content: file server (Nextcloud)', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes Nextcloud when file server is enabled with nextcloud', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Nextcloud');
  });

  it('does not include Nextcloud service card when file server is disabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileServer: { enabled: false, service: '' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('Nextcloud')");
  });
});

describe('generateAndOpenStatusPage — HTML content: file server (MinIO)', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes MinIO when file server is enabled with minio', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileServer: { enabled: true, service: 'minio' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('MinIO');
  });

  it('does not include MinIO Console service card when file server uses nextcloud', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('MinIO Console')");
  });
});

describe('generateAndOpenStatusPage — HTML content: media (Jellyfin)', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes Jellyfin when media is enabled with jellyfin service', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        media: { enabled: true, services: ['jellyfin'] },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Jellyfin');
  });

  it('does not include Jellyfin service card when media is disabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        media: { enabled: false, services: [] },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('Jellyfin')");
  });

  it('does not include Jellyfin service card when media is enabled but services list is empty', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        media: { enabled: true, services: [] },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('Jellyfin')");
  });
});

describe('generateAndOpenStatusPage — HTML content: SSH server', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes SSH Server when sshServer is enabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('SSH Server');
  });

  it('includes the SSH port in the local URL', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('ssh://localhost:2222');
  });

  it('does not include SSH Server service card when sshServer is disabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('SSH Server')");
  });
});

describe('generateAndOpenStatusPage — HTML content: FileBrowser', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes FileBrowser when fileBrowser is enabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('FileBrowser');
  });

  it('does not include FileBrowser service card when fileBrowser is disabled', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileBrowser: { enabled: false, mode: '' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).not.toContain("showServiceModal('FileBrowser')");
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — HTML content: always-present services
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — HTML content: always-present services', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('always includes the web server service name in the HTML', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...createDefaultWizardState().servers,
        webServer: { enabled: true, service: 'traefik' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Traefik');
  });

  it('always includes Gitea in the service list', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('Gitea');
  });

  it('includes the Gitea port in the local URL', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('http://localhost:3000');
  });
});

// ---------------------------------------------------------------------------
// generateAndOpenStatusPage — HTML content: credentials
// ---------------------------------------------------------------------------

describe('generateAndOpenStatusPage — HTML content: credentials', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes the admin username in the credentials section', async () => {
    const state = makeState({
      admin: { username: 'homeadmin', password: 'pass1234', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('homeadmin');
  });

  it('masks the password showing only the last 4 chars', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'supersecret5678', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    // Should show ••••••5678 (last 4 chars of password)
    expect(html).toContain('••••••5678');
    // Should NOT expose the full password
    expect(html).not.toContain('supersecret5678');
  });

  it('uses a generic mask for short passwords (4 chars or fewer)', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'ab12', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('••••••••');
  });
});

// ---------------------------------------------------------------------------
// Service Detail Modal — HTML structure
// ---------------------------------------------------------------------------

const { SERVICE_DETAIL_MAP } = await import(
  '../../../../packages/cli/src/services/status-page.js'
);

describe('Service Detail Modal — HTML structure', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('embeds SERVICE_DETAILS JSON in a <script> block', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('var SERVICE_DETAILS =');
  });

  it('includes showServiceModal function', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('function showServiceModal(');
  });

  it('includes closeServiceModal function', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('function closeServiceModal(');
  });

  it('includes escapeHtml function for XSS prevention', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('function escapeHtml(');
  });

  it('includes modal-overlay CSS class', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('.modal-overlay');
  });

  it('includes modal-terminal CSS class', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('.modal-terminal');
  });

  it('includes modal-titlebar CSS class with dot elements', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('.modal-titlebar');
    expect(html).toContain('.modal-dot.red');
    expect(html).toContain('.modal-dot.yellow');
    expect(html).toContain('.modal-dot.green');
  });
});

// ---------------------------------------------------------------------------
// Service Detail Modal — clickable service names
// ---------------------------------------------------------------------------

describe('Service Detail Modal — clickable service names', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('renders Traefik service name with svc-name-link class', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...createDefaultWizardState().servers,
        webServer: { enabled: true, service: 'traefik' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('class="svc-name-link"');
    expect(html).toContain("onclick=\"showServiceModal('Traefik')\"");
  });

  it('renders Gitea service name with onclick handler', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain("onclick=\"showServiceModal('Gitea')\"");
  });

  it('renders Traefik Dashboard with onclick handler', async () => {
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...createDefaultWizardState().servers,
        webServer: { enabled: true, service: 'traefik' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain("onclick=\"showServiceModal('Traefik Dashboard')\"");
  });
});

// ---------------------------------------------------------------------------
// Service Detail Modal — SERVICE_DETAIL_MAP data completeness
// ---------------------------------------------------------------------------

describe('Service Detail Modal — data completeness', () => {
  it('contains Traefik key', () => {
    expect(SERVICE_DETAIL_MAP).toHaveProperty('Traefik');
  });

  it('contains Gitea key', () => {
    expect(SERVICE_DETAIL_MAP).toHaveProperty('Gitea');
  });

  it('contains Cloudflared key', () => {
    expect(SERVICE_DETAIL_MAP).toHaveProperty('Cloudflared');
  });

  it('has all required fields for every entry', () => {
    for (const [key, info] of Object.entries(SERVICE_DETAIL_MAP)) {
      const detail = info as { description: string; license: string; features: string[]; credentials: { method: string; summary: string }; tips: string[] };
      expect(typeof detail.description).toBe('string');
      expect(detail.description.length).toBeGreaterThan(0);
      expect(typeof detail.license).toBe('string');
      expect(detail.license.length).toBeGreaterThan(0);
      expect(Array.isArray(detail.features)).toBe(true);
      expect(detail.features.length).toBeGreaterThanOrEqual(2);
      expect(typeof detail.credentials.method).toBe('string');
      expect(['env', 'wizard', 'cli', 'basicauth', 'none']).toContain(detail.credentials.method);
      expect(typeof detail.credentials.summary).toBe('string');
      expect(detail.credentials.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(detail.tips)).toBe(true);
      expect(detail.tips.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('contains all 16 service entries', () => {
    const expectedKeys = [
      'Traefik', 'Traefik Dashboard', 'Gitea', 'Nextcloud',
      'PostgreSQL', 'MySQL', 'Redis', 'pgAdmin',
      'Jellyfin', 'SSH Server', 'Mail Server', 'FileBrowser',
      'MinIO Console', 'Cloudflared', 'Nginx', 'Caddy',
    ];
    for (const key of expectedKeys) {
      expect(SERVICE_DETAIL_MAP).toHaveProperty(key);
    }
    expect(Object.keys(SERVICE_DETAIL_MAP)).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// Service Detail Modal — access URLs and admin credentials in modal
// ---------------------------------------------------------------------------

describe('Service Detail Modal — access URLs in modal', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('embeds SERVICE_URLS JSON in the script block', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('var SERVICE_URLS =');
  });

  it('embeds ADMIN_CREDS JSON in the script block', async () => {
    const state = makeState({ admin: { username: 'myadmin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('var ADMIN_CREDS =');
    expect(html).toContain('"username":"myadmin"');
  });

  it('includes SERVICE_URLS entries matching service card data', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        webServer: { enabled: true, service: 'traefik' },
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    // Traefik local URL
    expect(html).toContain('"Traefik"');
    expect(html).toContain('"localUrl":"http://localhost:80"');
    // Nextcloud local URL
    expect(html).toContain('"Nextcloud"');
    expect(html).toContain('"localUrl":"http://localhost:8443"');
  });

  it('includes external URLs in SERVICE_URLS when provider is tunnel', async () => {
    const base = createDefaultWizardState();
    const state = makeState({
      admin: { username: 'admin', password: 'pass1234', storage: 'local' },
      servers: {
        ...base.servers,
        fileServer: { enabled: true, service: 'nextcloud' },
      },
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          accountId: 'acc-123',
          apiToken: '',
          tunnelId: 'tun-abc',
          tunnelToken: 'eyJ...',
          tunnelName: 'my-tunnel',
          zoneId: 'zone-xyz',
          zoneName: 'example.com',
        },
      },
    });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('"externalUrl":"https://cloud.example.com"');
  });

  it('showServiceModal references SERVICE_URLS for access section', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('SERVICE_URLS[name]');
    expect(html).toContain('modal-url-link');
    expect(html).toContain('$ access');
  });

  it('showServiceModal shows admin credentials for env/basicauth services', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('ADMIN_CREDS.username');
    expect(html).toContain('ADMIN_CREDS.passwordHint');
    expect(html).toContain('modal-cred-box');
  });
});

// ---------------------------------------------------------------------------
// Service Detail Modal — keyboard accessibility
// ---------------------------------------------------------------------------

describe('Service Detail Modal — keyboard accessibility', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExeca.mockReset();
  });

  it('includes handleModalEsc function for ESC key support', async () => {
    const state = makeState({ admin: { username: 'admin', password: 'pass1234', storage: 'local' } });
    await generateAndOpenStatusPage(state, { noOpen: true });
    const [, html] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(html).toContain('function handleModalEsc(');
    expect(html).toContain("e.key === 'Escape'");
  });
});
