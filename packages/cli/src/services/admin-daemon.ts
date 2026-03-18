/**
 * Admin server daemon entry point.
 *
 * Spawned as a detached child process by `brewnet admin` and `brewnet init`.
 * Runs independently of the parent terminal — survives terminal close, shell exit, etc.
 *
 * Usage (internal — not called directly by users):
 *   node admin-daemon.js [--port 8088] [--path /path/to/project]
 *
 * @module services/admin-daemon
 */

import { createAdminServer } from './admin-server.js';

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
}

const port = parseInt(getArg('port', '8088'), 10);
const projectPath = getArg('path', '') || undefined;

// Ignore SIGHUP — this process has no controlling terminal
process.on('SIGHUP', () => { /* detached — ignore */ });

// Suppress stdout/stderr errors when pipe is broken (parent terminal gone)
process.stdout?.on?.('error', () => { /* ignore */ });
process.stderr?.on?.('error', () => { /* ignore */ });

const { start } = createAdminServer({ port, projectPath });

start()
  .then(() => {
    // Signal parent that we're ready (if still connected)
    if (process.send) process.send({ status: 'ready', port });
  })
  .catch((err) => {
    if (process.send) process.send({ status: 'error', error: String(err) });
    process.exit(1);
  });
