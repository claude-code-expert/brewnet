/**
 * brewnet create-app — Boilerplate Manager
 *
 * Implements all steps of the `brewnet create-app` execution flow:
 *   1. cloneStack      — shallow git clone from brewnet-boilerplate
 *   2. generateEnv     — .env from .env.example with secure secrets
 *   3. reinitGit       — clean git history for the scaffolded project
 *   4. startContainers — docker compose up -d --build
 *   5. pollHealth      — HTTP GET /health with timeout
 *   6. verifyEndpoints — GET /api/hello + POST /api/echo
 *
 * All functions are stateless and throw on failure.
 * Callers are responsible for user-facing spinner/error output.
 *
 * @module services/boilerplate-manager
 */

import { readFileSync, writeFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { execa } from 'execa';
import yaml from 'js-yaml';
import { addQuickTunnelAppLabels } from './compose-generator.js';
import { BOILERPLATE_REPO_URL } from '@brewnet/shared';
import type { StackHealthResult } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Port utility
// ---------------------------------------------------------------------------

/**
 * Find the first free TCP port starting from `start`.
 * Tries up to 20 consecutive ports; falls back to `start` if none are free.
 *
 * @param start - Preferred port (e.g. 3000 or 8080)
 */
/** Ports reserved for system services — never assigned to app containers. */
const RESERVED_PORTS = new Set([8088]); // admin server

export async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 40; port++) {
    if (RESERVED_PORTS.has(port)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => { srv.close(() => resolve(true)); });
      // Bind to 0.0.0.0 (all interfaces) so we catch IPv6 dual-stack processes
      // that occupy 0.0.0.0 but leave 127.0.0.1 appearing free on macOS.
      srv.listen(port, '0.0.0.0');
    });
    if (free) return port;
  }
  return start; // last-resort fallback
}

// Re-export for callers that need the constant
export { BOILERPLATE_REPO_URL };

// ---------------------------------------------------------------------------
// T004 — cloneStack
// ---------------------------------------------------------------------------

/**
 * Shallow-clone the selected boilerplate stack into projectDir.
 *
 * Uses `--depth=1` (mandatory for fast download) and checks out
 * the `stack/<stackId>` orphan branch.
 *
 * @param stackId    - One of the 16 valid stack IDs (e.g. "go-gin")
 * @param projectDir - Absolute path of the destination directory (must not exist)
 * @throws {Error} if git clone fails (network error, unknown branch, etc.)
 */
export async function cloneStack(stackId: string, projectDir: string): Promise<void> {
  // If directory already exists (previous run), remove and re-clone for a clean state.
  // git clone refuses to write into a non-empty directory.
  const { existsSync: dirExists, rmSync } = await import('node:fs');
  if (dirExists(projectDir)) {
    rmSync(projectDir, { recursive: true, force: true });
  }
  await execa('git', [
    'clone',
    '--depth=1',
    '-b',
    `stack/${stackId}`,
    BOILERPLATE_REPO_URL,
    projectDir,
  ]);
  // Next.js stacks need absolute paths for <Image> component.
  // All other stacks keep relative paths (./...) so they work under
  // Traefik sub-path routing (/apps/{name}/) via Quick Tunnel.
  if (stackId.startsWith('nodejs-nextjs')) {
    patchImagePaths(projectDir, '/brewnet-site-banner.png');
  }
  // Non-Next.js stacks: boilerplate already uses "./brewnet-site-banner.png" — no patch needed.
}

/**
 * Patch image paths in cloned boilerplate source files.
 *
 * Next.js <Image> component requires absolute paths (`/brewnet-site-banner.png`).
 * Other stacks (Vite/React) must keep relative paths (`./brewnet-site-banner.png`)
 * because under Quick Tunnel sub-path routing (/apps/{name}/), an absolute root
 * path `/image.png` resolves to the tunnel root (Traefik catch-all landing page).
 * Relative `./image.png` resolves correctly to `/apps/{name}/image.png` when the
 * trailing-slash redirect middleware ensures the browser URL has a trailing slash.
 */
function patchImagePaths(dir: string, replacement: string, search = './brewnet-site-banner.png'): void {
  const jsxExts = new Set(['.tsx', '.ts', '.jsx', '.js']);
  const needle = `src="${search}"`;
  const insert = `src="${replacement}"`;
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(d, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!jsxExts.has(extname(entry))) continue;
      const original = readFileSync(full, 'utf-8');
      const patched = original.replaceAll(needle, insert);
      if (patched !== original) writeFileSync(full, patched, 'utf-8');
    }
  };
  walk(dir);
}

// ---------------------------------------------------------------------------
// T005 — reinitGit
// ---------------------------------------------------------------------------

/**
 * Remove the boilerplate git history and start a fresh repository.
 *
 * Steps:
 *   1. Delete .git directory (severs link to brewnet-boilerplate)
 *   2. git init
 *   3. git add -A
 *   4. git commit -m "chore: initial project from brewnet create-app"
 *
 * @param projectDir - Absolute path to the scaffolded project
 */
export async function reinitGit(projectDir: string): Promise<void> {
  // Remove existing .git directory
  rmSync(join(projectDir, '.git'), { recursive: true, force: true });

  // Initialize fresh repository
  await execa('git', ['init'], { cwd: projectDir });
  await execa('git', ['add', '-A'], { cwd: projectDir });
  await execa('git', ['commit', '-m', 'chore: initial project from brewnet create-app'], {
    cwd: projectDir,
  });
}

// ---------------------------------------------------------------------------
// T006 — generateEnv
// ---------------------------------------------------------------------------

/** Prisma DB provider values mapped from DB_DRIVER. */
const PRISMA_PROVIDER: Record<string, string> = {
  postgres: 'postgresql',
  mysql: 'mysql',
  sqlite3: 'sqlite',
};

/** Build the Prisma DATABASE_URL using the given connection parameters. */
function buildPrismaDatabaseUrl(
  dbDriver: string,
  dbUser: string,
  dbPassword: string,
  dbName: string,
): string {
  switch (dbDriver) {
    case 'postgres':
      return `postgresql://${dbUser}:${dbPassword}@postgres:5432/${dbName}`;
    case 'mysql':
      return `mysql://${dbUser}:${dbPassword}@mysql:3306/${dbName}`;
    default:
      return 'file:/app/data/brewnet_db.db';
  }
}

/**
 * Optional overrides for generateEnv(). When provided, these values replace
 * the defaults that come from the boilerplate .env.example.
 */
export interface GenerateEnvOpts {
  /** DB username. Overrides DB_USER and MYSQL_USER (default: "brewnet"). */
  dbUser?: string;
  /**
   * DB password to use instead of a randomly generated secret.
   * Pass the wizard admin password here for consistent credentials.
   */
  dbPassword?: string;
  /** DB name. Overrides DB_NAME and MYSQL_DATABASE (default: "brewnet_db"). */
  dbName?: string;
  /**
   * Override the host-side port binding (BACKEND_PORT in .env).
   * All boilerplate stacks use `${BACKEND_PORT:-default}:containerPort` in
   * docker-compose.yml, so setting this lets callers pick a free port
   * automatically without touching the container-internal port.
   */
  hostPort?: number;
  /**
   * Override the host-side frontend port binding (FRONTEND_PORT in .env).
   * Non-unified stacks (e.g. nodejs-express) have a separate frontend
   * container on port 3000. Set this to avoid "port already in use" errors.
   */
  frontendPort?: number;
}

/**
 * Generate .env from .env.example by injecting secure secrets and optional
 * credential overrides.
 *
 * What the function changes (all other values keep .env.example defaults):
 *   - DB_DRIVER           → dbDriver argument
 *   - DB_USER / DB_NAME   → opts.dbUser / opts.dbName (or defaults)
 *   - DB_PASSWORD         → opts.dbPassword or 64-char hex secret
 *   - MYSQL_USER / MYSQL_DATABASE → same overrides as postgres
 *   - MYSQL_PASSWORD      → 64-char hex secret (always random)
 *   - MYSQL_ROOT_PASSWORD → 64-char hex secret (always random)
 *   - PRISMA_DB_PROVIDER  → derived from dbDriver (nodejs-* stacks only)
 *   - DATABASE_URL        → connection URL (nodejs-* stacks only)
 *
 * IMPORTANT: Generated secrets are NEVER logged or displayed.
 *
 * @param projectDir - Absolute path to the scaffolded project
 * @param stackId    - Stack ID used to detect nodejs-* stacks for Prisma vars
 * @param dbDriver   - "sqlite3" | "postgres" | "mysql"
 * @param opts       - Optional credential overrides (wizard DB settings)
 */
export function generateEnv(
  projectDir: string,
  stackId: string,
  dbDriver: string,
  opts?: GenerateEnvOpts,
): void {
  const examplePath = join(projectDir, '.env.example');
  const envPath = join(projectDir, '.env');

  // 1. Read .env.example as base content
  let content = readFileSync(examplePath, 'utf-8');

  // 2. Resolve credentials — use provided values or generate random secrets
  const dbUser = opts?.dbUser ?? 'brewnet';
  const dbName = opts?.dbName ?? 'brewnet_db';
  const dbPassword = opts?.dbPassword ?? randomBytes(32).toString('hex');

  // 3. Apply regex substitutions (line-by-line, preserves comments/formatting)
  //    All DB passwords use the same value (admin password) for consistency.
  content = content
    .replace(/^DB_DRIVER=.*/m, `DB_DRIVER=${dbDriver}`)
    .replace(/^DB_USER=.*/m, `DB_USER=${dbUser}`)
    .replace(/^DB_NAME=.*/m, `DB_NAME=${dbName}`)
    .replace(/^DB_PASSWORD=.*/m, `DB_PASSWORD=${dbPassword}`)
    .replace(/^MYSQL_USER=.*/m, `MYSQL_USER=${dbUser}`)
    .replace(/^MYSQL_DATABASE=.*/m, `MYSQL_DATABASE=${dbName}`)
    .replace(/^MYSQL_PASSWORD=.*/m, `MYSQL_PASSWORD=${dbPassword}`)
    .replace(/^MYSQL_ROOT_PASSWORD=.*/m, `MYSQL_ROOT_PASSWORD=${dbPassword}`);

  // 4. Override host ports if free ports were selected (avoids "port already in use").
  //    Stacks use `${BACKEND_PORT:-default}:containerPort` so only the host side changes.
  if (opts?.hostPort !== undefined) {
    if (/^BACKEND_PORT=/m.test(content)) {
      content = content.replace(/^BACKEND_PORT=.*/m, `BACKEND_PORT=${opts.hostPort}`);
    } else {
      content += `\nBACKEND_PORT=${opts.hostPort}\n`;
    }
  }
  if (opts?.frontendPort !== undefined) {
    if (/^FRONTEND_PORT=/m.test(content)) {
      content = content.replace(/^FRONTEND_PORT=.*/m, `FRONTEND_PORT=${opts.frontendPort}`);
    } else {
      content += `\nFRONTEND_PORT=${opts.frontendPort}\n`;
    }
  }

  // 5. Node.js stacks (Prisma): set PRISMA_DB_PROVIDER + DATABASE_URL
  if (stackId.startsWith('nodejs-')) {
    const provider = PRISMA_PROVIDER[dbDriver] ?? 'sqlite';
    const databaseUrl = buildPrismaDatabaseUrl(dbDriver, dbUser, dbPassword, dbName);
    content = content
      .replace(/^PRISMA_DB_PROVIDER=.*/m, `PRISMA_DB_PROVIDER=${provider}`)
      .replace(/^DATABASE_URL=.*/m, `DATABASE_URL=${databaseUrl}`);
  }

  // 5. Write .env — not committed, not displayed
  writeFileSync(envPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// T006b-pre — patchNextConfig (basePath injection)
// ---------------------------------------------------------------------------

/**
 * Inject `basePath: '/apps/{appName}'` into next.config.{ts,mjs,js} so that
 * Next.js generates all asset/image paths under the sub-path prefix.
 *
 * Without basePath, Next.js emits `/_next/static/...` absolute root paths.
 * Under Quick Tunnel sub-path routing (/apps/{appName}/), the browser requests
 * `https://tunnel/_next/static/...` which misses Traefik's PathPrefix rule and
 * returns the landing-page HTML instead of CSS/JS assets.
 *
 * With basePath set, Next.js emits `/apps/{appName}/_next/static/...` which
 * correctly matches Traefik's PathPrefix route.
 *
 * @param projectDir - Absolute path to the Next.js project
 * @param appName    - Logical app name used as path segment (e.g. "nextjs-full")
 */
export function patchNextConfig(projectDir: string, appName: string): void {
  const candidates = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
  let configPath: string | null = null;
  for (const c of candidates) {
    const p = join(projectDir, c);
    if (existsSync(p)) { configPath = p; break; }
  }
  if (!configPath) return;

  let content = readFileSync(configPath, 'utf-8');
  const basePath = `/apps/${appName}`;

  // Already patched — skip
  if (content.includes('basePath')) return;

  // Insert basePath + unoptimized images after output: 'standalone'.
  // images.unoptimized is required because Next.js standalone _next/image optimizer
  // fails to resolve local images when basePath is set (fetches /img.png instead of
  // /apps/{name}/img.png internally → 400 "not a valid image").
  // With unoptimized: true, <Image> renders a plain <img> tag pointing directly to
  // /apps/{name}/img.png which Traefik routes correctly.
  content = content.replace(
    /output:\s*['"]standalone['"]/,
    `output: 'standalone',\n    basePath: '${basePath}',\n    images: { unoptimized: true }`,
  );

  // Fallback: non-standalone configs (user-owned repos without output: 'standalone')
  if (!content.includes('basePath')) {
    content = content.replace(
      /((?:const|let|var)\s+\w+(?:\s*:\s*[\w<>, |&]+)?\s*=\s*\{|module\.exports\s*=\s*\{|export\s+default\s+\{)/,
      `$1\n  basePath: '${basePath}',`,
    );
  }

  writeFileSync(configPath, content, 'utf-8');

  // Re-patch image paths to include basePath prefix.
  // With images.unoptimized=true, <Image src="/foo.png"> renders <img src="/foo.png">.
  // The browser resolves absolute paths from the tunnel root, missing Traefik's
  // PathPrefix route. Must be /apps/{appName}/foo.png for correct routing.
  // cloneStack() already converted ./brewnet-site-banner.png → /brewnet-site-banner.png
  // for Next.js stacks; now add the basePath prefix.
  patchImagePaths(projectDir, `${basePath}/brewnet-site-banner.png`, '/brewnet-site-banner.png');

  // Also patch docker-compose.yml healthcheck: /health → /apps/{appName}/health
  // With basePath set, Next.js serves all routes (including /health) under the prefix.
  const composePath = join(projectDir, 'docker-compose.yml');
  if (existsSync(composePath)) {
    let compose = readFileSync(composePath, 'utf-8');
    const oldHealthPath = 'http://127.0.0.1:3000/health';
    const newHealthPath = `http://127.0.0.1:3000${basePath}/health`;
    if (compose.includes(oldHealthPath) && !compose.includes(newHealthPath)) {
      compose = compose.replaceAll(oldHealthPath, newHealthPath);
    }
    // Fallback: scaffolded templates use root path (/) instead of /health
    const oldRootPath = 'http://127.0.0.1:3000/';
    const newRootPath = `http://127.0.0.1:3000${basePath}/`;
    if (compose.includes(oldRootPath) && !compose.includes(newRootPath)) {
      compose = compose.replaceAll(oldRootPath, newRootPath);
    }
    writeFileSync(composePath, compose, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// T006b — injectTraefikForQuickTunnel
// ---------------------------------------------------------------------------

/**
 * Parse the container-internal port from a docker-compose ports entry.
 * e.g. "${BACKEND_PORT:-8080}:8080" → 8080
 *      "3000:80" → 80
 *      "${PORT}:3000" → 3000
 */
function parseContainerPort(portSpec: string): number | null {
  const str = String(portSpec);
  // "host:container" or "${VAR:-default}:container"
  const colonIdx = str.lastIndexOf(':');
  if (colonIdx >= 0) {
    const containerPart = str.slice(colonIdx + 1).replace(/\/.*$/, ''); // strip /tcp, /udp
    const n = parseInt(containerPart, 10);
    return isNaN(n) ? null : n;
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

/**
 * Inject Traefik PathPrefix labels and brewnet external network into a
 * boilerplate's docker-compose.yml so that HTTP services are routable
 * through Quick Tunnel at /apps/{appName} (backend) and /apps/{appName}-ui (frontend).
 *
 * Reads the compose file to:
 * 1. Detect backend service (backend, app, web, api, server) and its internal port
 * 2. Detect frontend service (frontend, ui) and its internal port
 * 3. Inject Traefik labels + force brewnet to external: true
 *
 * @param projectDir  - Absolute path to the boilerplate project
 * @param appName     - Logical name used as path segment (e.g. "nodejs-nestjs")
 * @param _backendPort - Host port (unused — we detect internal port from compose)
 */
export function injectTraefikForQuickTunnel(
  projectDir: string,
  appName: string,
  _backendPort: number,
): void {
  const composePath = join(projectDir, 'docker-compose.yml');
  if (!existsSync(composePath)) return;

  const raw = readFileSync(composePath, 'utf-8');
  const doc = yaml.load(raw) as Record<string, unknown>;
  const services = doc['services'] as Record<string, Record<string, unknown>> | undefined;
  if (!services) return;

  // Detect Next.js projects: basePath handles sub-path routing internally,
  // so Traefik must NOT strip the prefix (noStrip: true).
  const isNextjs = ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .some((f) => existsSync(join(projectDir, f)));
  if (isNextjs) {
    patchNextConfig(projectDir, appName);
  }

  // addQuickTunnelAppLabels imported at top level (static import for ESM compatibility)

  // Non-HTTP services to skip
  const skipServices = new Set(['postgres', 'postgresql', 'mysql', 'mariadb', 'redis', 'db']);

  // Backend: common names
  const backendNames = ['backend', 'app', 'web', 'api', 'server'];
  const backendKey = backendNames.find((n) => services[n] && !skipServices.has(n));

  // Frontend: common names
  const frontendNames = ['frontend', 'ui'];
  const frontendKey = frontendNames.find((n) => services[n]);

  // Single-service stacks: just use the first HTTP service
  const allSvcKeys = Object.keys(services).filter((k) => !skipServices.has(k));
  const singleService = allSvcKeys.length === 1 ? allSvcKeys[0]! : null;

  if (singleService && !backendKey && !frontendKey) {
    // Unified single-service stack
    const svc = services[singleService]!;
    const ports = (svc['ports'] ?? []) as string[];
    const containerPort = ports.length > 0 ? parseContainerPort(ports[0]!) ?? 8080 : 8080;
    addQuickTunnelAppLabels(composePath, appName, singleService, containerPort, isNextjs);
    return;
  }

  // Multi-service: inject labels for both backend and frontend
  if (backendKey) {
    const svc = services[backendKey]!;
    const ports = (svc['ports'] ?? []) as string[];
    const containerPort = ports.length > 0 ? parseContainerPort(ports[0]!) ?? 8080 : 8080;
    addQuickTunnelAppLabels(composePath, appName, backendKey, containerPort, isNextjs);
  }

  if (frontendKey) {
    const svc = services[frontendKey]!;
    const ports = (svc['ports'] ?? []) as string[];
    const containerPort = ports.length > 0 ? parseContainerPort(ports[0]!) ?? 80 : 80;
    // Re-read the compose file since addQuickTunnelAppLabels writes it
    addQuickTunnelAppLabels(composePath, `${appName}-ui`, frontendKey, containerPort);
  }
}

// ---------------------------------------------------------------------------
// T007 — startContainers
// ---------------------------------------------------------------------------

/**
 * Start the stack containers in detached mode with a fresh build.
 *
 * Runs `docker compose up -d --build` in the project directory.
 * This is a long-running operation; callers should update spinners accordingly.
 *
 * @param projectDir - Absolute path to the scaffolded project
 * @throws {Error} if docker compose exits with a non-zero status
 */
export async function startContainers(projectDir: string): Promise<void> {
  await execa('docker', ['compose', 'up', '-d', '--build'], {
    cwd: projectDir,
  });
}

// ---------------------------------------------------------------------------
// T008 — pollHealth
// ---------------------------------------------------------------------------

/**
 * Poll GET <baseUrl>/health until HTTP 200 with body.status === "ok".
 *
 * Uses `127.0.0.1` in baseUrl (not `localhost`) to avoid Alpine Linux
 * IPv6 resolution failures where localhost resolves to ::1.
 *
 * @param baseUrl   - e.g. "http://127.0.0.1:8080" (no trailing slash)
 * @param timeoutMs - Maximum wait time in milliseconds (120_000 or 600_000 for Rust)
 * @returns StackHealthResult with healthy, elapsedMs, and dbConnected
 */
export async function pollHealth(baseUrl: string, timeoutMs: number): Promise<StackHealthResult> {
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const body = (await res.json()) as { status?: string; db_connected?: boolean };
        if (body.status === 'ok') {
          return {
            healthy: true,
            elapsedMs: Date.now() - start,
            dbConnected: body.db_connected,
          };
        }
      }
    } catch {
      // Not ready yet — continue polling
    }

    // Wait 1 second between attempts
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }

  return {
    healthy: false,
    elapsedMs: Date.now() - start,
    error: `Health check timed out after ${Math.round(timeoutMs / 1000)}s`,
  };
}

// ---------------------------------------------------------------------------
// T009 — verifyEndpoints
// ---------------------------------------------------------------------------

/**
 * Verify that GET /api/hello and POST /api/echo respond correctly.
 *
 * Contract (from CONNECT_BOILERPLATE.md Section 7):
 *   - GET  /api/hello → HTTP 200, body.message field exists
 *   - POST /api/echo  → HTTP 200, body.test === "brewnet"
 *
 * @param baseUrl - e.g. "http://127.0.0.1:8080" (no trailing slash)
 * @throws {Error} if either endpoint fails or returns unexpected data
 */
export async function verifyEndpoints(baseUrl: string): Promise<void> {
  // 1. GET /api/hello
  const helloRes = await fetch(`${baseUrl}/api/hello`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!helloRes.ok) {
    throw new Error(`GET /api/hello returned HTTP ${helloRes.status}`);
  }
  const helloBody = (await helloRes.json()) as { message?: unknown };
  if (!helloBody.message) {
    throw new Error(`GET /api/hello response missing "message" field`);
  }

  // 2. POST /api/echo
  const echoRes = await fetch(`${baseUrl}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: 'brewnet' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!echoRes.ok) {
    throw new Error(`POST /api/echo returned HTTP ${echoRes.status}`);
  }
  const echoBody = (await echoRes.json()) as { test?: unknown };
  if (echoBody.test !== 'brewnet') {
    throw new Error(
      `POST /api/echo response mismatch: expected test="brewnet", got "${String(echoBody.test)}"`,
    );
  }
}
