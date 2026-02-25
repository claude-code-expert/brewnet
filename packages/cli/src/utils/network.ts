/**
 * Network utility functions for Brewnet CLI.
 *
 * @module utils/network
 */

import { createConnection } from 'node:net';

// ---------------------------------------------------------------------------
// checkPort25Blocked
// ---------------------------------------------------------------------------

/**
 * Check whether outbound SMTP port 25 is blocked by the ISP.
 *
 * Attempts a TCP connection to smtp.cloudflare.com:25 with a 3-second timeout.
 *
 * @returns Promise<boolean> — true if blocked (connection failed/timed out),
 *   false if port 25 is open and reachable
 */
export function checkPort25Blocked(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: 'smtp.cloudflare.com', port: 25 });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(true); // timeout → blocked
    }, 3000);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false); // connected → open
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(true); // connection error → blocked
    });
  });
}
