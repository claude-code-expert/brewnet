/**
 * @module port-utils
 * @description Port conflict detection and alternative port suggestion utilities.
 * Used by the System Check wizard step to resolve port conflicts gracefully.
 */

import * as net from 'net';
import { execSync } from 'node:child_process';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Port occupant detection
// ---------------------------------------------------------------------------

/**
 * Detect which process is occupying a port.
 * Uses `lsof` (macOS/Linux). Returns a human-readable string like
 * "nginx (PID 1234)" or null if detection fails.
 */
export function getPortOccupant(port: number): string | null {
  try {
    const plat = os.platform();
    if (plat !== 'darwin' && plat !== 'linux') return null;

    const raw = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -P -n 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    if (!raw) return null;

    // Skip header, parse first LISTEN line: COMMAND PID USER ...
    const lines = raw.split('\n').slice(1);
    if (lines.length === 0) return null;

    const parts = lines[0].split(/\s+/);
    const command = parts[0] ?? 'unknown';
    const pid = parts[1] ?? '?';
    return `${command} (PID ${pid})`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Port alternative suggestions
// ---------------------------------------------------------------------------

/** Maps known default ports to ordered lists of alternative candidates. */
const PORT_ALTERNATIVES: Record<number, number[]> = {
  80: [8080, 8088, 8000, 8008],
  443: [8443, 4443, 9443],
  2222: [2223, 2220, 22222],
  3000: [3001, 3010, 3080],
  3022: [3023, 3033, 3030],
  5432: [5433, 5434],
  3306: [3307, 3308],
  6379: [6380, 6381],
  8096: [8097, 8098, 9096],
  9000: [9001, 9090, 9900],
  5050: [5051, 5052],
  8085: [8086, 8087],
};

/**
 * Returns a list of alternative port numbers for a given port.
 * Falls back to a generic range if the port is not in the registry.
 */
export function suggestAlternativePorts(port: number): number[] {
  if (PORT_ALTERNATIVES[port]) {
    return PORT_ALTERNATIVES[port];
  }
  // Generic fallback: port+1, port+10, port+100
  return [port + 1, port + 10, port + 100].filter((p) => p <= 65535);
}

// ---------------------------------------------------------------------------
// Port availability check
// ---------------------------------------------------------------------------

/**
 * Checks whether a given port is available on all interfaces.
 * Returns true if the port can be bound, false if it's in use.
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find the first available alternative port for the given conflict port.
 * Returns undefined if none of the candidates are available.
 */
export async function findFirstAvailableAlternative(port: number): Promise<number | undefined> {
  const candidates = suggestAlternativePorts(port);
  for (const candidate of candidates) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
