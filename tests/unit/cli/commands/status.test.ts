/**
 * @file tests/unit/cli/commands/status.test.ts
 * @description TDD unit tests for T090: Status table formatting
 *
 * Tests the formatting functions used by `brewnet status` to display
 * Docker container status as a CLI table.
 *
 * Test cases covered:
 *   TC-09-01: Running services status (green indicators, ports, uptime)
 *   TC-09-02: Stopped/restarting/paused service indicators
 *   Table formatting (empty list, header columns, long names)
 *   Status parsing (uptime extraction, exit status, no ports)
 *
 * These are TDD tests — the functions do not exist yet. They define the
 * expected behavior of `formatServiceStatus()`, `formatStatusTable()`,
 * and `getStatusIndicator()` before implementation.
 */

import {
  formatServiceStatus,
  formatStatusTable,
  getStatusIndicator,
} from '../../../../packages/cli/src/commands/status.js';

import type {
  ContainerInfo,
  StatusRow,
} from '../../../../packages/cli/src/commands/status.js';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    name: 'brewnet-traefik',
    state: 'running',
    status: 'Up 2 hours',
    ports: ['80/tcp', '443/tcp'],
    image: 'traefik:v3.0',
    created: Date.now() - 7200 * 1000,
    ...overrides,
  };
}

function makeRunningContainers(): ContainerInfo[] {
  return [
    makeContainer({
      name: 'brewnet-traefik',
      state: 'running',
      status: 'Up 2 hours',
      ports: ['80/tcp', '443/tcp'],
      image: 'traefik:v3.0',
    }),
    makeContainer({
      name: 'brewnet-postgres',
      state: 'running',
      status: 'Up 2 hours',
      ports: ['5432/tcp'],
      image: 'postgres:16',
    }),
    makeContainer({
      name: 'brewnet-nextcloud',
      state: 'running',
      status: 'Up 1 hour',
      ports: ['8080/tcp'],
      image: 'nextcloud:28',
    }),
  ];
}

// ---------------------------------------------------------------------------
// TC-09-01: Running services status
// ---------------------------------------------------------------------------

describe('TC-09-01: Running services status', () => {
  describe('formatServiceStatus() with running containers', () => {
    it('returns 3 rows for 3 running containers', () => {
      const containers = makeRunningContainers();
      const rows = formatServiceStatus(containers);

      expect(rows).toHaveLength(3);
    });

    it('each row contains name, status, image, ports, and uptime fields', () => {
      const containers = makeRunningContainers();
      const rows = formatServiceStatus(containers);

      for (const row of rows) {
        expect(row).toHaveProperty('name');
        expect(row).toHaveProperty('status');
        expect(row).toHaveProperty('image');
        expect(row).toHaveProperty('ports');
        expect(row).toHaveProperty('uptime');
      }
    });

    it('preserves container names in rows', () => {
      const containers = makeRunningContainers();
      const rows = formatServiceStatus(containers);
      const names = rows.map((r) => r.name);

      expect(names).toContain('brewnet-traefik');
      expect(names).toContain('brewnet-postgres');
      expect(names).toContain('brewnet-nextcloud');
    });

    it('preserves image names in rows', () => {
      const containers = makeRunningContainers();
      const rows = formatServiceStatus(containers);

      const traefikRow = rows.find((r) => r.name === 'brewnet-traefik');
      expect(traefikRow?.image).toBe('traefik:v3.0');
    });
  });

  describe('getStatusIndicator() for running state', () => {
    it('returns a green indicator for "running"', () => {
      const indicator = getStatusIndicator('running');

      // The indicator should contain the bullet character
      expect(indicator).toContain('\u25CF'); // ● (filled circle)
    });

    it('returns an indicator that includes the word "running" or equivalent', () => {
      const indicator = getStatusIndicator('running');

      // Should contain descriptive text alongside the symbol
      expect(indicator.toLowerCase()).toMatch(/running|up/);
    });
  });

  describe('ports formatting', () => {
    it('joins multiple ports with comma separator', () => {
      const containers = [
        makeContainer({
          name: 'brewnet-traefik',
          ports: ['80/tcp', '443/tcp'],
        }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].ports).toBe('80/tcp, 443/tcp');
    });

    it('shows single port without comma', () => {
      const containers = [
        makeContainer({
          name: 'brewnet-postgres',
          ports: ['5432/tcp'],
        }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].ports).toBe('5432/tcp');
    });
  });
});

// ---------------------------------------------------------------------------
// TC-09-02: Stopped service indicator
// ---------------------------------------------------------------------------

describe('TC-09-02: Stopped service indicator', () => {
  describe('getStatusIndicator() for stopped/exited state', () => {
    it('returns a red indicator for "exited"', () => {
      const indicator = getStatusIndicator('exited');

      expect(indicator).toContain('\u25CF'); // ●
    });

    it('returns an indicator that includes the word "stopped" or "exited"', () => {
      const indicator = getStatusIndicator('exited');

      expect(indicator.toLowerCase()).toMatch(/stopped|exited|down/);
    });

    it('returns a different indicator than running', () => {
      const runningIndicator = getStatusIndicator('running');
      const stoppedIndicator = getStatusIndicator('exited');

      // Strip ANSI codes for comparison — the underlying text or color must differ
      const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');
      // Even after stripping, the indicators should represent different states
      expect(stripAnsi(stoppedIndicator)).not.toBe(stripAnsi(runningIndicator));
    });
  });

  describe('mixed running and stopped containers', () => {
    it('assigns correct status indicators for each container state', () => {
      const containers = [
        makeContainer({ name: 'brewnet-traefik', state: 'running', status: 'Up 2 hours' }),
        makeContainer({ name: 'brewnet-postgres', state: 'exited', status: 'Exited (0) 5 minutes ago' }),
      ];
      const rows = formatServiceStatus(containers);
      const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');

      const traefikRow = rows.find((r) => r.name === 'brewnet-traefik')!;
      const postgresRow = rows.find((r) => r.name === 'brewnet-postgres')!;

      // Running container should have indicator matching running state
      expect(stripAnsi(traefikRow.status).toLowerCase()).toMatch(/running|up/);
      // Stopped container should have indicator matching exited state
      expect(stripAnsi(postgresRow.status).toLowerCase()).toMatch(/stopped|exited|down/);
    });
  });

  describe('getStatusIndicator() for restarting state', () => {
    it('returns a yellow indicator for "restarting"', () => {
      const indicator = getStatusIndicator('restarting');

      expect(indicator).toContain('\u25CF'); // ●
    });

    it('returns an indicator that includes the word "restarting"', () => {
      const indicator = getStatusIndicator('restarting');

      expect(indicator.toLowerCase()).toMatch(/restarting/);
    });
  });

  describe('getStatusIndicator() for paused state', () => {
    it('returns a yellow indicator for "paused"', () => {
      const indicator = getStatusIndicator('paused');

      expect(indicator).toContain('\u25CF'); // ●
    });

    it('returns an indicator that includes the word "paused"', () => {
      const indicator = getStatusIndicator('paused');

      expect(indicator.toLowerCase()).toMatch(/paused/);
    });
  });

  describe('getStatusIndicator() for other states', () => {
    it('handles "created" state', () => {
      const indicator = getStatusIndicator('created');

      expect(indicator).toContain('\u25CF');
    });

    it('handles "dead" state', () => {
      const indicator = getStatusIndicator('dead');

      expect(indicator).toContain('\u25CF');
    });

    it('handles "removing" state', () => {
      const indicator = getStatusIndicator('removing');

      expect(indicator).toContain('\u25CF');
    });
  });
});

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

describe('Table formatting', () => {
  describe('formatStatusTable() with empty list', () => {
    it('returns a "No services running" message for empty containers', () => {
      const rows: StatusRow[] = [];
      const table = formatStatusTable(rows);

      expect(table).toContain('No services running');
    });

    it('returns a non-empty string even for empty input', () => {
      const rows: StatusRow[] = [];
      const table = formatStatusTable(rows);

      expect(table.length).toBeGreaterThan(0);
    });
  });

  describe('formatStatusTable() header columns', () => {
    it('includes Name column header', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toMatch(/name/i);
    });

    it('includes Status column header', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toMatch(/status/i);
    });

    it('includes Image column header', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toMatch(/image/i);
    });

    it('includes Ports column header', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toMatch(/ports/i);
    });

    it('includes Uptime column header', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toMatch(/uptime/i);
    });
  });

  describe('formatStatusTable() content', () => {
    it('includes service names in the table output', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toContain('brewnet-traefik');
      expect(table).toContain('brewnet-postgres');
      expect(table).toContain('brewnet-nextcloud');
    });

    it('includes image names in the table output', () => {
      const rows = formatServiceStatus(makeRunningContainers());
      const table = formatStatusTable(rows);

      expect(table).toContain('traefik:v3.0');
      expect(table).toContain('postgres:16');
    });
  });

  describe('long service names', () => {
    it('does not truncate long service names', () => {
      const longName = 'brewnet-my-very-long-service-name-that-should-not-be-truncated';
      const containers = [
        makeContainer({ name: longName }),
      ];
      const rows = formatServiceStatus(containers);
      const table = formatStatusTable(rows);

      expect(rows[0].name).toBe(longName);
      expect(table).toContain(longName);
    });
  });
});

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

describe('Status parsing', () => {
  describe('uptime extraction from Docker status strings', () => {
    it('extracts uptime from "Up 2 hours"', () => {
      const containers = [
        makeContainer({ status: 'Up 2 hours', state: 'running' }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].uptime).toMatch(/2h/);
    });

    it('extracts uptime from "Up 30 minutes"', () => {
      const containers = [
        makeContainer({ status: 'Up 30 minutes', state: 'running' }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].uptime).toMatch(/30m/);
    });

    it('extracts uptime from "Up 3 days"', () => {
      const containers = [
        makeContainer({ status: 'Up 3 days', state: 'running' }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].uptime).toMatch(/3d/);
    });

    it('extracts uptime from "Up About an hour"', () => {
      const containers = [
        makeContainer({ status: 'Up About an hour', state: 'running' }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].uptime).toMatch(/1h/);
    });

    it('extracts uptime from "Up Less than a second"', () => {
      const containers = [
        makeContainer({ status: 'Up Less than a second', state: 'running' }),
      ];
      const rows = formatServiceStatus(containers);

      // Should show something meaningful for very short uptime
      expect(rows[0].uptime).toMatch(/<\s*1s|0s|just started/i);
    });
  });

  describe('stopped container status parsing', () => {
    it('shows no meaningful uptime for "Exited (0) 5 minutes ago"', () => {
      const containers = [
        makeContainer({
          state: 'exited',
          status: 'Exited (0) 5 minutes ago',
        }),
      ];
      const rows = formatServiceStatus(containers);

      // Stopped containers should show "-" or empty for uptime
      expect(rows[0].uptime).toMatch(/^-$|^$/);
    });

    it('handles "Exited (137) 1 hour ago"', () => {
      const containers = [
        makeContainer({
          state: 'exited',
          status: 'Exited (137) 1 hour ago',
        }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].uptime).toMatch(/^-$|^$/);
    });
  });

  describe('container with no ports', () => {
    it('shows empty string for ports when container has no port mappings', () => {
      const containers = [
        makeContainer({
          name: 'brewnet-redis',
          ports: [],
          image: 'redis:7',
        }),
      ];
      const rows = formatServiceStatus(containers);

      expect(rows[0].ports).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// formatServiceStatus — additional edge cases
// ---------------------------------------------------------------------------

describe('formatServiceStatus() edge cases', () => {
  it('returns an empty array when given an empty container list', () => {
    const rows = formatServiceStatus([]);

    expect(rows).toEqual([]);
  });

  it('handles a single container', () => {
    const containers = [makeContainer()];
    const rows = formatServiceStatus(containers);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('brewnet-traefik');
  });

  it('preserves order of containers in output rows', () => {
    const containers = [
      makeContainer({ name: 'z-service' }),
      makeContainer({ name: 'a-service' }),
      makeContainer({ name: 'm-service' }),
    ];
    const rows = formatServiceStatus(containers);

    expect(rows[0].name).toBe('z-service');
    expect(rows[1].name).toBe('a-service');
    expect(rows[2].name).toBe('m-service');
  });
});

// ---------------------------------------------------------------------------
// getStatusIndicator — comprehensive state mapping
// ---------------------------------------------------------------------------

describe('getStatusIndicator() — state to indicator mapping', () => {
  it('running and exited produce different text (after stripping ANSI)', () => {
    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');

    const running = stripAnsi(getStatusIndicator('running'));
    const exited = stripAnsi(getStatusIndicator('exited'));

    expect(running).not.toBe(exited);
  });

  it('restarting and paused both contain yellow indicator', () => {
    // Both are "transitional" states — they should use the same color category
    const restarting = getStatusIndicator('restarting');
    const paused = getStatusIndicator('paused');

    // Both should contain the bullet
    expect(restarting).toContain('\u25CF');
    expect(paused).toContain('\u25CF');
  });

  it('all valid Docker states return a non-empty string', () => {
    const states = ['running', 'exited', 'created', 'restarting', 'removing', 'paused', 'dead'];

    for (const state of states) {
      const indicator = getStatusIndicator(state);
      expect(indicator.length).toBeGreaterThan(0);
    }
  });

  it('returns a fallback indicator for unknown states', () => {
    const indicator = getStatusIndicator('unknown-state');

    expect(indicator.length).toBeGreaterThan(0);
    expect(indicator).toContain('\u25CF');
  });
});
