/**
 * Unit tests for services/domain-manager module
 *
 * Tests DomainManager core lifecycle: connect, disconnect, list, status.
 * Mocks cloudflare-client and compose-generator dependencies.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDnsRecords = jest.fn<() => unknown>();
const mockDeleteDnsRecord = jest.fn<() => unknown>();
const mockCreateDnsRecord = jest.fn<() => unknown>();
const mockConfigureTunnelIngress = jest.fn<() => unknown>();
const mockGetTunnelHealth = jest.fn<() => unknown>();
const mockGetActiveServiceRoutes = jest.fn<() => unknown>();
const mockAddExternalLabels = jest.fn<() => unknown>();
const mockRemoveExternalLabels = jest.fn<() => unknown>();
const mockLoadState = jest.fn<() => unknown>();
const mockSaveState = jest.fn<() => unknown>();
const mockFetch = jest.fn<typeof fetch>();

jest.unstable_mockModule('../../../../packages/cli/src/services/cloudflare-client.js', () => ({
  getDnsRecords: mockGetDnsRecords,
  deleteDnsRecord: mockDeleteDnsRecord,
  createDnsRecord: mockCreateDnsRecord,
  configureTunnelIngress: mockConfigureTunnelIngress,
  getTunnelHealth: mockGetTunnelHealth,
  getActiveServiceRoutes: mockGetActiveServiceRoutes,
}));

jest.unstable_mockModule('../../../../packages/cli/src/services/compose-generator.js', () => ({
  addExternalLabels: mockAddExternalLabels,
  removeExternalLabels: mockRemoveExternalLabels,
}));

jest.unstable_mockModule('../../../../packages/cli/src/wizard/state.js', () => ({
  loadState: mockLoadState,
  saveState: mockSaveState,
}));

// Mock execa for DNS resolution checks (dig command)
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn<() => unknown>().mockResolvedValue({ stdout: 'tun-456.cfargotunnel.com.\n', stderr: '' }),
}));

global.fetch = mockFetch as typeof fetch;

const { DomainManager } = await import('../../../../packages/cli/src/services/domain-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Record<string, unknown> = {}): WizardState {
  return {
    schemaVersion: 7,
    projectName: 'test-project',
    projectPath: '/tmp/brewnet/test-project',
    setupType: 'full',
    admin: { username: 'admin', password: 'testpassword12345', storage: 'local' as const },
    servers: {
      webServer: { enabled: true as const, service: 'traefik' as const },
      fileServer: { enabled: false, service: '' as const },
      gitServer: { enabled: true as const, service: 'gitea' as const, port: 3000, sshPort: 3022 },
      dbServer: { enabled: false, primary: '' as const, primaryVersion: '', dbName: '', dbUser: '', dbPassword: '', adminUI: false, pgadminEmail: '', cache: '' as const },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' as const },
    },
    devStack: { languages: [], frameworks: {}, frontend: null },
    boilerplate: { generate: false, sampleData: false, devMode: 'production' as const },
    domain: {
      provider: 'tunnel' as const,
      name: 'example.com',
      ssl: 'cloudflare' as const,
      cloudflare: {
        enabled: true,
        tunnelMode: 'named' as const,
        quickTunnelUrl: '',
        accountId: 'acc-123',
        apiToken: 'test-api-token',
        tunnelId: 'tun-456',
        tunnelToken: 'tok-789',
        tunnelName: 'brewnet-test',
        zoneId: 'zone-abc',
        zoneName: 'example.com',
      },
    },
    domainConnections: [],
    portRemapping: {},
    ...overrides,
  } as WizardState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DomainManager', () => {
  let state: WizardState;

  beforeEach(() => {
    jest.clearAllMocks();
    state = makeState();
    mockLoadState.mockReturnValue(state);
    mockGetActiveServiceRoutes.mockReturnValue([
      { subdomain: 'git', containerName: 'gitea', port: 3000 },
    ]);
    // Default: mock fetch for health check
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('throws if project not found', () => {
    mockLoadState.mockReturnValue(null);
    expect(() => new DomainManager('nonexistent')).toThrow('not found');
  });

  describe('list()', () => {
    it('returns empty array when no connections', () => {
      const mgr = new DomainManager('test-project');
      expect(mgr.list()).toEqual([]);
    });

    it('returns existing connections', () => {
      const conn = {
        appName: 'git', subdomain: 'git', domain: 'example.com',
        hostname: 'git.example.com', tunnelId: 'tun-456', cnameRecordId: 'rec-1',
        containerPort: 3000, connectedAt: '2026-03-15T10:00:00Z', scenario: 'A' as const,
      };
      state.domainConnections = [conn];
      mockLoadState.mockReturnValue(state);

      const mgr = new DomainManager('test-project');
      expect(mgr.list()).toHaveLength(1);
      expect(mgr.list()[0].appName).toBe('git');
    });
  });

  describe('connect()', () => {
    it('returns error when credentials not configured', async () => {
      state.domain.cloudflare.apiToken = '';
      mockLoadState.mockReturnValue(state);

      const mgr = new DomainManager('test-project');
      const result = await mgr.connect('git', 'git', 'example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('credentials not configured');
    });

    it('returns error when app port not resolved', async () => {
      mockGetActiveServiceRoutes.mockReturnValue([]);

      const mgr = new DomainManager('test-project');
      const result = await mgr.connect('unknown-app', 'unknown', 'example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot determine container port');
    });

    it('connects successfully with all steps', async () => {
      mockConfigureTunnelIngress.mockResolvedValue(undefined);
      mockCreateDnsRecord.mockResolvedValue(undefined);
      // getDnsRecords called twice: conflict check (empty) + record ID fetch (with result)
      mockGetDnsRecords
        .mockResolvedValueOnce([]) // conflict check
        .mockResolvedValueOnce([{ id: 'rec-new', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true }]);

      const mgr = new DomainManager('test-project');
      const result = await mgr.connect('git', 'git', 'example.com');

      expect(result.success).toBe(true);
      expect(result.hostname).toBe('git.example.com');
      expect(result.externalUrl).toBe('https://git.example.com');
      expect(mockSaveState).toHaveBeenCalled();
      const savedState = mockSaveState.mock.calls[0][0] as WizardState;
      expect(savedState.domainConnections).toHaveLength(1);
      expect(savedState.domainConnections[0].appName).toBe('git');
    });

    it('detects CNAME conflict and fails without --force', async () => {
      mockConfigureTunnelIngress.mockResolvedValue(undefined);
      mockGetDnsRecords.mockResolvedValue([
        { id: 'existing', name: 'git.example.com', content: 'old.cfargotunnel.com', proxied: true },
      ]);

      const mgr = new DomainManager('test-project');
      const result = await mgr.connect('git', 'git', 'example.com', { force: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CNAME_CONFLICT');
    });

    it('overwrites CNAME conflict with --force', async () => {
      mockConfigureTunnelIngress.mockResolvedValue(undefined);
      mockGetDnsRecords
        .mockResolvedValueOnce([{ id: 'existing', name: 'git.example.com', content: 'old.cfargotunnel.com', proxied: true }])
        .mockResolvedValueOnce([{ id: 'rec-new', name: 'git.example.com', content: 'tun-456.cfargotunnel.com', proxied: true }]);
      mockDeleteDnsRecord.mockResolvedValue(undefined);
      mockCreateDnsRecord.mockResolvedValue(undefined);

      const mgr = new DomainManager('test-project');
      const result = await mgr.connect('git', 'git', 'example.com', { force: true });

      expect(result.success).toBe(true);
      expect(mockDeleteDnsRecord).toHaveBeenCalledWith('test-api-token', 'zone-abc', 'existing');
    });
  });

  describe('disconnect()', () => {
    it('returns error when app not connected', async () => {
      const mgr = new DomainManager('test-project');
      const result = await mgr.disconnect('not-connected');
      expect(result.success).toBe(false);
      expect(result.error).toContain('NOT_CONNECTED');
    });

    it('disconnects successfully', async () => {
      state.domainConnections = [{
        appName: 'git', subdomain: 'git', domain: 'example.com',
        hostname: 'git.example.com', tunnelId: 'tun-456', cnameRecordId: 'rec-1',
        containerPort: 3000, connectedAt: '2026-03-15T10:00:00Z', scenario: 'A' as const,
      }];
      mockLoadState.mockReturnValue(state);
      mockConfigureTunnelIngress.mockResolvedValue(undefined);
      mockDeleteDnsRecord.mockResolvedValue(undefined);

      const mgr = new DomainManager('test-project');
      const result = await mgr.disconnect('git');

      expect(result.success).toBe(true);
      expect(result.removedHostname).toBe('git.example.com');
      expect(mockSaveState).toHaveBeenCalled();
      const savedState = mockSaveState.mock.calls[0][0] as WizardState;
      expect(savedState.domainConnections).toHaveLength(0);
    });

    it('rolls back ingress on DNS deletion failure', async () => {
      state.domainConnections = [{
        appName: 'git', subdomain: 'git', domain: 'example.com',
        hostname: 'git.example.com', tunnelId: 'tun-456', cnameRecordId: 'rec-1',
        containerPort: 3000, connectedAt: '2026-03-15T10:00:00Z', scenario: 'A' as const,
      }];
      mockLoadState.mockReturnValue(state);
      mockConfigureTunnelIngress.mockResolvedValue(undefined);
      mockDeleteDnsRecord.mockRejectedValue(new Error('DNS API error'));

      const mgr = new DomainManager('test-project');
      const result = await mgr.disconnect('git');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNS deletion failed');
      // Rollback should re-add ingress
      expect(mockConfigureTunnelIngress).toHaveBeenCalledTimes(2);
    });
  });

  describe('getConnectableApps()', () => {
    it('returns routes with connected status', () => {
      state.domainConnections = [{
        appName: 'git', subdomain: 'git', domain: 'example.com',
        hostname: 'git.example.com', tunnelId: 'tun-456', cnameRecordId: 'rec-1',
        containerPort: 3000, connectedAt: '2026-03-15T10:00:00Z', scenario: 'A' as const,
      }];
      mockLoadState.mockReturnValue(state);

      const mgr = new DomainManager('test-project');
      const apps = mgr.getConnectableApps();

      expect(apps).toHaveLength(1);
      expect(apps[0].alreadyConnected).toBe(true);
      expect(apps[0].hostname).toBe('git.example.com');
    });
  });
});
