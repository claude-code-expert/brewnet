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
import { logger } from '../utils/logger.js';

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

// ---------------------------------------------------------------------------
// Crash and shutdown logging — daemon process is fully detached so these
// events would otherwise be silent. All entries go to ~/.brewnet/logs/.
// ---------------------------------------------------------------------------

process.on('SIGTERM', () => {
  logger.info('admin-daemon', `Admin server stopped (SIGTERM) pid=${process.pid}`);
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('admin-daemon', `Admin server stopped (SIGINT) pid=${process.pid}`);
  process.exit(0);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('admin-daemon', `Admin server crashed (uncaughtException): ${err.message}`, {
    stack: err.stack ?? '',
    pid: process.pid,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? (reason.stack ?? '') : '';
  logger.error('admin-daemon', `Admin server crashed (unhandledRejection): ${msg}`, {
    stack,
    pid: process.pid,
  });
  process.exit(1);
});

const { start } = createAdminServer({ port, projectPath });

start()
  .then(() => {
    logger.info('admin-daemon', `Admin server started on port ${port}`, { pid: process.pid });
    // Signal parent that we're ready (if still connected)
    if (process.send) process.send({ status: 'ready', port });
  })
  .catch((err) => {
    logger.error('admin-daemon', `Admin server failed to start: ${String(err)}`, { pid: process.pid });
    if (process.send) process.send({ status: 'error', error: String(err) });
    process.exit(1);
  });
