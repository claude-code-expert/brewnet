/**
 * Unit tests for commands/status pure functions
 *
 * Covers:
 *   - getStatusIndicator — all Docker states
 *   - formatServiceStatus — maps ContainerInfo[] → StatusRow[]
 *   - formatStatusTable — empty list, single row, multi-row formatting
 */

import { describe, it, expect, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — silence external dependencies
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../../../packages/cli/src/services/docker-manager.js', () => ({
  checkDockerAvailability: jest.fn(),
}));

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  getStatusIndicator,
  formatServiceStatus,
  formatStatusTable,
} = await import('../../../../packages/cli/src/commands/status.js');

import type { ContainerInfo } from '../../../../packages/cli/src/commands/status.js';

// ---------------------------------------------------------------------------
// getStatusIndicator
// ---------------------------------------------------------------------------

describe('getStatusIndicator', () => {
  it('returns green "Running" for running state', () => {
    const result = getStatusIndicator('running');
    expect(result).toContain('Running');
  });

  it('returns red "Stopped" for exited state', () => {
    const result = getStatusIndicator('exited');
    expect(result).toContain('Stopped');
  });

  it('returns red "Stopped" for dead state', () => {
    const result = getStatusIndicator('dead');
    expect(result).toContain('Stopped');
  });

  it('returns yellow "Restarting" for restarting state', () => {
    const result = getStatusIndicator('restarting');
    expect(result).toContain('Restarting');
  });

  it('returns yellow "Paused" for paused state', () => {
    const result = getStatusIndicator('paused');
    expect(result).toContain('Paused');
  });

  it('returns yellow "Created" for created state', () => {
    const result = getStatusIndicator('created');
    expect(result).toContain('Created');
  });

  it('returns yellow "Removing" for removing state', () => {
    const result = getStatusIndicator('removing');
    expect(result).toContain('Removing');
  });

  it('capitalizes and returns dim text for unknown state', () => {
    const result = getStatusIndicator('unknown-state');
    expect(result).toContain('Unknown-state');
  });

  it('returns a non-empty string for any state', () => {
    const states = ['running', 'exited', 'dead', 'restarting', 'paused', 'created', 'removing', 'custom'];
    for (const state of states) {
      expect(getStatusIndicator(state).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// formatServiceStatus
// ---------------------------------------------------------------------------

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    name: 'traefik',
    state: 'running',
    status: 'Up 2 hours',
    ports: ['80/tcp', '443/tcp'],
    image: 'traefik:v2.10',
    created: Date.now(),
    ...overrides,
  };
}

describe('formatServiceStatus', () => {
  it('returns empty array for empty input', () => {
    const result = formatServiceStatus([]);
    expect(result).toEqual([]);
  });

  it('maps container to row with name, status, image, ports, uptime', () => {
    const result = formatServiceStatus([makeContainer()]);
    expect(result).toHaveLength(1);
    const row = result[0]!;
    expect(row.name).toBe('traefik');
    expect(row.image).toBe('traefik:v2.10');
    expect(row.ports).toContain('80/tcp');
    expect(row.uptime).toBe('2h');
  });

  it('parses uptime "Up 30 minutes" as "30m"', () => {
    const result = formatServiceStatus([makeContainer({ status: 'Up 30 minutes' })]);
    expect(result[0]!.uptime).toBe('30m');
  });

  it('parses uptime "Up 3 days" as "3d"', () => {
    const result = formatServiceStatus([makeContainer({ status: 'Up 3 days' })]);
    expect(result[0]!.uptime).toBe('3d');
  });

  it('parses uptime "Up About an hour" as "1h"', () => {
    const result = formatServiceStatus([makeContainer({ status: 'Up About an hour' })]);
    expect(result[0]!.uptime).toBe('1h');
  });

  it('parses uptime "Up Less than a second" as "<1s"', () => {
    const result = formatServiceStatus([makeContainer({ status: 'Up Less than a second' })]);
    expect(result[0]!.uptime).toBe('<1s');
  });

  it('returns "-" for exited container status', () => {
    const result = formatServiceStatus([makeContainer({ status: 'Exited (0) 5 minutes ago' })]);
    expect(result[0]!.uptime).toBe('-');
  });

  it('joins multiple ports with comma', () => {
    const result = formatServiceStatus([makeContainer({ ports: ['80/tcp', '443/tcp'] })]);
    expect(result[0]!.ports).toBe('80/tcp, 443/tcp');
  });

  it('handles empty ports array', () => {
    const result = formatServiceStatus([makeContainer({ ports: [] })]);
    expect(result[0]!.ports).toBe('');
  });

  it('processes multiple containers', () => {
    const containers = [
      makeContainer({ name: 'traefik', state: 'running' }),
      makeContainer({ name: 'gitea', state: 'exited' }),
      makeContainer({ name: 'nextcloud', state: 'restarting' }),
    ];
    const result = formatServiceStatus(containers);
    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe('traefik');
    expect(result[1]!.name).toBe('gitea');
    expect(result[2]!.name).toBe('nextcloud');
  });
});

// ---------------------------------------------------------------------------
// formatStatusTable
// ---------------------------------------------------------------------------

describe('formatStatusTable', () => {
  it('returns "No services running" message for empty rows', () => {
    const result = formatStatusTable([]);
    expect(result).toContain('No services running');
  });

  it('returns a string with header for non-empty rows', () => {
    const rows = formatServiceStatus([makeContainer()]);
    const table = formatStatusTable(rows);
    expect(table).toContain('Name');
    expect(table).toContain('Status');
    expect(table).toContain('Image');
    expect(table).toContain('Ports');
    expect(table).toContain('Uptime');
  });

  it('includes service name in table output', () => {
    const rows = formatServiceStatus([makeContainer({ name: 'my-service' })]);
    const table = formatStatusTable(rows);
    expect(table).toContain('my-service');
  });

  it('includes separator row in output', () => {
    const rows = formatServiceStatus([makeContainer()]);
    const table = formatStatusTable(rows);
    expect(table).toContain('---');
  });

  it('handles multiple rows', () => {
    const containers = [
      makeContainer({ name: 'traefik' }),
      makeContainer({ name: 'gitea', state: 'exited', status: 'Exited (0) 5m ago' }),
    ];
    const rows = formatServiceStatus(containers);
    const table = formatStatusTable(rows);
    expect(table).toContain('traefik');
    expect(table).toContain('gitea');
  });

  it('returns a multi-line string for non-empty input', () => {
    const rows = formatServiceStatus([makeContainer()]);
    const table = formatStatusTable(rows);
    expect(table.split('\n').length).toBeGreaterThan(2);
  });
});
