/**
 * Unit tests for services/health-checker module
 *
 * Covers pure functions: categorizeService, sortByDependency,
 * buildPullCommand, buildUpCommand, buildDownCommand, buildLogsCommand,
 * generateEndpoints, pollHealthCheck, checkDnsResolution, checkEndpointReachable
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock node:dns for checkDnsResolution
const mockResolve4 = jest.fn<() => Promise<string[]>>();

jest.unstable_mockModule('node:dns', () => ({
  promises: { resolve4: mockResolve4 },
}));

// Mock fetch for checkEndpointReachable
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const {
  categorizeService,
  sortByDependency,
  buildPullCommand,
  buildUpCommand,
  buildDownCommand,
  buildLogsCommand,
  generateEndpoints,
  pollHealthCheck,
  checkDnsResolution,
  checkEndpointReachable,
} = await import('../../../../packages/cli/src/services/health-checker.js');

const { createDefaultWizardState, applyFullInstallDefaults } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return { ...createDefaultWizardState(), ...overrides };
}

// ---------------------------------------------------------------------------
// categorizeService
// ---------------------------------------------------------------------------

describe('categorizeService', () => {
  it('traefik → infrastructure', () => {
    expect(categorizeService('traefik')).toBe('infrastructure');
  });

  it('nginx → infrastructure', () => {
    expect(categorizeService('nginx')).toBe('infrastructure');
  });

  it('caddy → infrastructure', () => {
    expect(categorizeService('caddy')).toBe('infrastructure');
  });

  it('cloudflared → infrastructure', () => {
    expect(categorizeService('cloudflared')).toBe('infrastructure');
  });

  it('postgresql → database', () => {
    expect(categorizeService('postgresql')).toBe('database');
  });

  it('mysql → database', () => {
    expect(categorizeService('mysql')).toBe('database');
  });

  it('redis → cache', () => {
    expect(categorizeService('redis')).toBe('cache');
  });

  it('valkey → cache', () => {
    expect(categorizeService('valkey')).toBe('cache');
  });

  it('keydb → cache', () => {
    expect(categorizeService('keydb')).toBe('cache');
  });

  it('pgadmin → utility', () => {
    expect(categorizeService('pgadmin')).toBe('utility');
  });

  it('filebrowser → utility', () => {
    expect(categorizeService('filebrowser')).toBe('utility');
  });

  it('openssh-server → utility', () => {
    expect(categorizeService('openssh-server')).toBe('utility');
  });

  it('docker-mailserver → utility', () => {
    expect(categorizeService('docker-mailserver')).toBe('utility');
  });

  it('gitea → application (unknown)', () => {
    expect(categorizeService('gitea')).toBe('application');
  });

  it('nextcloud → application (unknown)', () => {
    expect(categorizeService('nextcloud')).toBe('application');
  });

  it('custom-app → application (fallback)', () => {
    expect(categorizeService('my-custom-app')).toBe('application');
  });
});

// ---------------------------------------------------------------------------
// sortByDependency
// ---------------------------------------------------------------------------

describe('sortByDependency', () => {
  it('sorts infrastructure before database', () => {
    const sorted = sortByDependency(['postgresql', 'traefik']);
    expect(sorted.indexOf('traefik')).toBeLessThan(sorted.indexOf('postgresql'));
  });

  it('sorts database before cache', () => {
    const sorted = sortByDependency(['redis', 'postgresql']);
    expect(sorted.indexOf('postgresql')).toBeLessThan(sorted.indexOf('redis'));
  });

  it('sorts cache before application', () => {
    const sorted = sortByDependency(['gitea', 'redis']);
    expect(sorted.indexOf('redis')).toBeLessThan(sorted.indexOf('gitea'));
  });

  it('sorts application before utility', () => {
    const sorted = sortByDependency(['pgadmin', 'nextcloud']);
    expect(sorted.indexOf('nextcloud')).toBeLessThan(sorted.indexOf('pgadmin'));
  });

  it('full order: infrastructure → db → cache → app → utility', () => {
    const input = ['pgadmin', 'redis', 'gitea', 'postgresql', 'traefik'];
    const sorted = sortByDependency(input);
    const idx = (s: string) => sorted.indexOf(s);

    expect(idx('traefik')).toBeLessThan(idx('postgresql'));
    expect(idx('postgresql')).toBeLessThan(idx('redis'));
    expect(idx('redis')).toBeLessThan(idx('gitea'));
    expect(idx('gitea')).toBeLessThan(idx('pgadmin'));
  });

  it('preserves order for services in the same category', () => {
    const sorted = sortByDependency(['redis', 'valkey', 'keydb']);
    expect(sorted).toEqual(['redis', 'valkey', 'keydb']);
  });

  it('does not mutate the original array', () => {
    const original = ['gitea', 'traefik'];
    const sorted = sortByDependency(original);
    expect(original).toEqual(['gitea', 'traefik']);
    expect(sorted).not.toEqual(original);
  });

  it('handles empty array', () => {
    expect(sortByDependency([])).toEqual([]);
  });

  it('handles single item', () => {
    expect(sortByDependency(['traefik'])).toEqual(['traefik']);
  });
});

// ---------------------------------------------------------------------------
// buildPullCommand
// ---------------------------------------------------------------------------

describe('buildPullCommand', () => {
  it('returns docker compose pull command', () => {
    const result = buildPullCommand('/project/docker-compose.yml');
    expect(result.cmd).toBe('docker');
    expect(result.args).toEqual(['compose', '-f', '/project/docker-compose.yml', 'pull']);
  });
});

// ---------------------------------------------------------------------------
// buildUpCommand
// ---------------------------------------------------------------------------

describe('buildUpCommand', () => {
  it('returns docker compose up -d command', () => {
    const result = buildUpCommand('/project/docker-compose.yml');
    expect(result.cmd).toBe('docker');
    expect(result.args).toEqual(['compose', '-f', '/project/docker-compose.yml', 'up', '-d']);
  });
});

// ---------------------------------------------------------------------------
// buildDownCommand
// ---------------------------------------------------------------------------

describe('buildDownCommand', () => {
  it('returns docker compose down --remove-orphans command', () => {
    const result = buildDownCommand('/project/docker-compose.yml');
    expect(result.cmd).toBe('docker');
    expect(result.args).toContain('down');
    expect(result.args).toContain('--remove-orphans');
  });
});

// ---------------------------------------------------------------------------
// buildLogsCommand
// ---------------------------------------------------------------------------

describe('buildLogsCommand', () => {
  it('returns docker compose logs --tail 50 <service>', () => {
    const result = buildLogsCommand('/project/docker-compose.yml', 'gitea');
    expect(result.cmd).toBe('docker');
    expect(result.args).toContain('logs');
    expect(result.args).toContain('gitea');
    expect(result.args).toContain('50');
  });
});

// ---------------------------------------------------------------------------
// generateEndpoints
// ---------------------------------------------------------------------------

describe('generateEndpoints', () => {
  it('generates https:// URLs for tunnel domain', () => {
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.dpdns.org',
        ssl: 'cloudflare',
        freeDomainTld: '.dpdns.org',
        cloudflare: { enabled: true, tunnelToken: '', tunnelName: 'my-tunnel', accountId: '', apiToken: '', tunnelId: '', zoneId: '', zoneName: '' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });

    const endpoints = generateEndpoints(state, ['traefik', 'gitea']);
    expect(endpoints.length).toBeGreaterThan(0);
    for (const ep of endpoints) {
      expect(ep.url).toMatch(/^https:\/\//);
    }
  });

  it('generates http:// URLs for local domain', () => {
    const state = makeState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
        freeDomainTld: '.dpdns.org',
        cloudflare: { enabled: false, tunnelToken: '', tunnelName: '', accountId: '', apiToken: '', tunnelId: '', zoneId: '', zoneName: '' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });

    const endpoints = generateEndpoints(state, ['traefik', 'gitea']);
    for (const ep of endpoints) {
      expect(ep.url).toMatch(/^http:\/\//);
    }
  });

  it('skips services not in SUBDOMAIN_MAP', () => {
    const state = makeState();
    const endpoints = generateEndpoints(state, ['unknown-service', 'custom-app']);
    expect(endpoints).toHaveLength(0);
  });

  it('returns empty array when no services given', () => {
    const state = makeState();
    const endpoints = generateEndpoints(state, []);
    expect(endpoints).toHaveLength(0);
  });

  it('includes service name in endpoint info', () => {
    const state = makeState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
        freeDomainTld: '.dpdns.org',
        cloudflare: { enabled: false, tunnelToken: '', tunnelName: '', accountId: '', apiToken: '', tunnelId: '', zoneId: '', zoneName: '' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });

    const endpoints = generateEndpoints(state, ['gitea']);
    expect(endpoints[0]?.service).toBe('gitea');
  });
});

// ---------------------------------------------------------------------------
// pollHealthCheck
// ---------------------------------------------------------------------------

describe('pollHealthCheck', () => {
  it('returns healthy when container state is running without healthcheck', async () => {
    const mockDocker = {
      listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { State: 'running', Status: 'Up 5 seconds' },
      ]),
    };

    const result = await pollHealthCheck('gitea', mockDocker as any, 5000, 100);
    expect(result.healthy).toBe(true);
    expect(result.service).toBe('gitea');
  });

  it('returns healthy when container status includes (healthy)', async () => {
    const mockDocker = {
      listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { State: 'running', Status: 'Up 10 seconds (healthy)' },
      ]),
    };

    const result = await pollHealthCheck('postgresql', mockDocker as any, 5000, 100);
    expect(result.healthy).toBe(true);
  });

  it('returns timeout result when container never becomes healthy', async () => {
    const mockDocker = {
      listContainers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { State: 'running', Status: 'Up 1 second (health: starting)' },
      ]),
    };

    const result = await pollHealthCheck('redis', mockDocker as any, 200, 50);
    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  }, 3000);

  it('continues polling after docker API error', async () => {
    let callCount = 0;
    const mockDocker = {
      listContainers: jest.fn<() => Promise<unknown[]>>().mockImplementation(() => {
        callCount++;
        if (callCount < 3) throw new Error('Docker API error');
        return Promise.resolve([{ State: 'running', Status: 'Up 1 second' }]);
      }),
    };

    const result = await pollHealthCheck('traefik', mockDocker as any, 5000, 50);
    expect(result.healthy).toBe(true);
  }, 5000);
});

// ---------------------------------------------------------------------------
// checkDnsResolution
// ---------------------------------------------------------------------------

describe('checkDnsResolution', () => {
  beforeEach(() => {
    mockResolve4.mockReset();
  });

  it('returns true when DNS resolves successfully', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    const result = await checkDnsResolution('example.com');
    expect(result).toBe(true);
  });

  it('returns false when DNS resolution fails', async () => {
    mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await checkDnsResolution('nonexistent.invalid');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkEndpointReachable
// ---------------------------------------------------------------------------

describe('checkEndpointReachable', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns true for 200 response', async () => {
    mockFetch.mockResolvedValue({ status: 200 } as Response);
    const result = await checkEndpointReachable('https://example.com');
    expect(result).toBe(true);
  });

  it('returns true for 404 response (server responding)', async () => {
    mockFetch.mockResolvedValue({ status: 404 } as Response);
    const result = await checkEndpointReachable('https://example.com/path');
    expect(result).toBe(true);
  });

  it('returns false for 500 response', async () => {
    mockFetch.mockResolvedValue({ status: 500 } as Response);
    const result = await checkEndpointReachable('https://example.com');
    expect(result).toBe(false);
  });

  it('returns false when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await checkEndpointReachable('https://unreachable.example.com');
    expect(result).toBe(false);
  });
});
