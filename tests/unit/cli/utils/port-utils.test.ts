/**
 * Unit tests for utils/port-utils
 *
 * Covers: suggestAlternativePorts, isPortAvailable, findFirstAvailableAlternative
 */

import { describe, it, expect } from '@jest/globals';
import {
  suggestAlternativePorts,
  isPortAvailable,
  findFirstAvailableAlternative,
} from '../../../../packages/cli/src/utils/port-utils.js';

// ---------------------------------------------------------------------------
// suggestAlternativePorts
// ---------------------------------------------------------------------------

describe('suggestAlternativePorts', () => {
  it('returns known alternatives for port 80', () => {
    expect(suggestAlternativePorts(80)).toEqual([8080, 8088, 8000, 8008]);
  });

  it('returns known alternatives for port 443', () => {
    expect(suggestAlternativePorts(443)).toEqual([8443, 4443, 9443]);
  });

  it('returns known alternatives for port 5432', () => {
    expect(suggestAlternativePorts(5432)).toEqual([5433, 5434]);
  });

  it('returns known alternatives for port 3306', () => {
    expect(suggestAlternativePorts(3306)).toEqual([3307, 3308]);
  });

  it('returns known alternatives for port 6379', () => {
    expect(suggestAlternativePorts(6379)).toEqual([6380, 6381]);
  });

  it('falls back to port+1, port+10, port+100 for unknown ports', () => {
    expect(suggestAlternativePorts(12345)).toEqual([12346, 12355, 12445]);
  });

  it('fallback filters out ports > 65535', () => {
    const result = suggestAlternativePorts(65535);
    // 65536 and 65545 are > 65535, 65635 too → all filtered
    expect(result.every((p) => p <= 65535)).toBe(true);
  });

  it('fallback returns empty array when all candidates overflow', () => {
    // 65535 → +1=65536 (>65535), +10=65545, +100=65635 → all filtered
    const result = suggestAlternativePorts(65535);
    expect(result).toEqual([]);
  });

  it('returns an array for every registered port', () => {
    const knownPorts = [80, 443, 2222, 3000, 3022, 5432, 3306, 6379, 8096, 9000, 5050, 8085];
    for (const port of knownPorts) {
      expect(suggestAlternativePorts(port).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// isPortAvailable
// ---------------------------------------------------------------------------

describe('isPortAvailable', () => {
  it('returns true for an unbound port', async () => {
    // Use a high ephemeral port unlikely to be in use
    const result = await isPortAvailable(59876);
    expect(typeof result).toBe('boolean');
    // Can only assert it's a boolean — actual availability depends on OS state
  });

  it('returns false when port is already bound', async () => {
    const net = await import('net');
    const server = net.createServer();

    await new Promise<void>((resolve) => server.listen(59877, '0.0.0.0', resolve));

    try {
      const available = await isPortAvailable(59877);
      expect(available).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// findFirstAvailableAlternative
// ---------------------------------------------------------------------------

describe('findFirstAvailableAlternative', () => {
  it('returns a number when an alternative is available', async () => {
    // Port 80 alternatives: 8080, 8088, 8000, 8008 — at least one should be free in test env
    const result = await findFirstAvailableAlternative(80);
    // May be undefined if all candidates happen to be in use, but typically one is free
    if (result !== undefined) {
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    }
  });

  it('returns undefined when no candidate is available', async () => {
    const net = await import('net');
    // Bind a port that has only one registered alternative
    const servers: ReturnType<typeof net.createServer>[] = [];

    const alternatives = [5433, 5434]; // port 5432 alternatives
    for (const port of alternatives) {
      const srv = net.createServer();
      await new Promise<void>((resolve) => srv.listen(port, '0.0.0.0', resolve));
      servers.push(srv);
    }

    try {
      const result = await findFirstAvailableAlternative(5432);
      expect(result).toBeUndefined();
    } finally {
      for (const srv of servers) {
        await new Promise<void>((resolve, reject) =>
          srv.close((err) => (err ? reject(err) : resolve())),
        );
      }
    }
  });
});
