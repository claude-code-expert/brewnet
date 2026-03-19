/**
 * Launch admin server as a detached background daemon.
 *
 * The daemon process is fully independent of the parent terminal:
 * - detached: true → new process group (no SIGHUP from parent)
 * - stdio redirected to log file → no broken pipe on terminal close
 * - unref() → parent can exit without waiting for child
 *
 * @module services/admin-launcher
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve path to the compiled admin-daemon.js */
function getDaemonPath(): string {
  // tsup bundles admin-launcher into index.js (dist/), but admin-daemon.js
  // is a separate entry output at dist/services/admin-daemon.js
  const candidates = [
    join(__dirname, 'services', 'admin-daemon.js'),   // dist/services/admin-daemon.js
    join(__dirname, 'admin-daemon.js'),                // dist/admin-daemon.js (flat)
    join(__dirname, '..', 'services', 'admin-daemon.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!; // best guess
}

export interface LaunchOptions {
  port: number;
  projectPath?: string;
}

export interface LaunchResult {
  pid: number;
  port: number;
  logFile: string;
}

/**
 * Spawn admin-daemon.js as a fully detached background process.
 *
 * Returns once the daemon reports ready (HTTP server listening)
 * or after a timeout (5s).
 */
export async function launchAdminDaemon(opts: LaunchOptions): Promise<LaunchResult> {
  const logDir = join(homedir(), '.brewnet', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, 'admin-server.log');

  // Open log file for append — daemon stdout/stderr go here
  const logFd = openSync(logFile, 'a');

  const daemonPath = getDaemonPath();
  const nodeArgs = [daemonPath, '--port', String(opts.port)];
  if (opts.projectPath) nodeArgs.push('--path', opts.projectPath);

  const child = spawn(process.execPath, nodeArgs, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  child.unref();

  // Wait for daemon to start listening by polling the port
  const ready = await new Promise<boolean>((resolve) => {
    let attempts = 0;
    const maxAttempts = 25; // 25 × 200ms = 5s
    const timer = setInterval(() => {
      attempts++;
      const sock = createConnection({ port: opts.port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.destroy(); clearInterval(timer); resolve(true); });
      sock.once('error', () => { sock.destroy(); if (attempts >= maxAttempts) { clearInterval(timer); resolve(false); } });
      sock.setTimeout(150, () => { sock.destroy(); });
    }, 200);
  });

  if (!ready) {
    throw new Error(`Admin daemon failed to start on port ${opts.port}. Check ${logFile}`);
  }

  return { pid: child.pid!, port: opts.port, logFile };
}
