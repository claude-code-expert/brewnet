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

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { execa } from 'execa';
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
export async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
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
  await execa('git', [
    'clone',
    '--depth=1',
    '-b',
    `stack/${stackId}`,
    BOILERPLATE_REPO_URL,
    projectDir,
  ]);
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
  const mysqlPassword = randomBytes(32).toString('hex');
  const mysqlRoot = randomBytes(32).toString('hex');

  // 3. Apply regex substitutions (line-by-line, preserves comments/formatting)
  content = content
    .replace(/^DB_DRIVER=.*/m, `DB_DRIVER=${dbDriver}`)
    .replace(/^DB_USER=.*/m, `DB_USER=${dbUser}`)
    .replace(/^DB_NAME=.*/m, `DB_NAME=${dbName}`)
    .replace(/^DB_PASSWORD=.*/m, `DB_PASSWORD=${dbPassword}`)
    .replace(/^MYSQL_USER=.*/m, `MYSQL_USER=${dbUser}`)
    .replace(/^MYSQL_DATABASE=.*/m, `MYSQL_DATABASE=${dbName}`)
    .replace(/^MYSQL_PASSWORD=.*/m, `MYSQL_PASSWORD=${mysqlPassword}`)
    .replace(/^MYSQL_ROOT_PASSWORD=.*/m, `MYSQL_ROOT_PASSWORD=${mysqlRoot}`);

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
 * Poll GET <baseUrl><healthPath> until HTTP 200 with body.status === "ok".
 *
 * Uses `127.0.0.1` in baseUrl (not `localhost`) to avoid Alpine Linux
 * IPv6 resolution failures where localhost resolves to ::1.
 *
 * @param baseUrl    - e.g. "http://127.0.0.1:8080" (no trailing slash)
 * @param timeoutMs  - Maximum wait time in milliseconds (120_000 or 600_000 for Rust)
 * @param healthPath - Health endpoint path (default: "/health"). Use "/apps/<stackId>/health"
 *                     for Next.js stacks with basePath set.
 * @returns StackHealthResult with healthy, elapsedMs, and dbConnected
 */
export async function pollHealth(
  baseUrl: string,
  timeoutMs: number,
  healthPath = '/health',
): Promise<StackHealthResult> {
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}${healthPath}`, {
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

// ---------------------------------------------------------------------------
// T010 — writeTraefikOverride
// ---------------------------------------------------------------------------

/**
 * Write docker-compose.override.yml to connect boilerplate containers to the
 * main brewnet Traefik network and register PathPrefix routing labels.
 *
 * - backend  → /apps/<stackId>        (StripPrefix → container port)
 * - frontend → /apps/<stackId>-ui     (non-unified only, StripPrefix → port 3000)
 *
 * @param projectDir              - Absolute path to the boilerplate project directory
 * @param stackId                 - Stack identifier (e.g. "go-gin")
 * @param containerPort           - Backend container-internal port (3000 unified, 8080 others)
 * @param frontendContainerPort   - Frontend container-internal port (3000); omit for unified stacks
 */
export function writeTraefikOverride(
  projectDir: string,
  stackId: string,
  containerPort: number,
  frontendContainerPort?: number,
): void {
  const rn = `bp-${stackId}`;
  const pp = `/apps/${stackId}`;

  // Next.js stacks use `basePath` in next.config so they handle the sub-path internally.
  // Traefik must NOT strip the prefix for these stacks — the full path must reach Next.js.
  // Other stacks (go, rust, python, …) do not know about the prefix, so stripprefix is needed.
  const isNextjs = stackId.startsWith('nodejs-nextjs');
  const healthUrl = isNextjs
    ? `http://127.0.0.1:${containerPort}${pp}/health`
    : `http://127.0.0.1:${containerPort}/health`;

  const backendLabels = isNextjs
    ? [
        '      - "traefik.enable=true"',
        `      - "traefik.docker.network=brewnet"`,
        `      - "traefik.http.routers.${rn}.rule=PathPrefix(\`${pp}\`)"`,
        `      - "traefik.http.routers.${rn}.entrypoints=web"`,
        `      - "traefik.http.services.${rn}.loadbalancer.server.port=${containerPort}"`,
      ]
    : [
        '      - "traefik.enable=true"',
        `      - "traefik.docker.network=brewnet"`,
        `      - "traefik.http.routers.${rn}.rule=PathPrefix(\`${pp}\`)"`,
        `      - "traefik.http.routers.${rn}.entrypoints=web"`,
        `      - "traefik.http.middlewares.${rn}-strip.stripprefix.prefixes=${pp}"`,
        `      - "traefik.http.routers.${rn}.middlewares=${rn}-strip"`,
        `      - "traefik.http.services.${rn}.loadbalancer.server.port=${containerPort}"`,
      ];

  // Next.js stacks need a healthcheck override because basePath changes the URL.
  // Other stacks (Go, Rust, Python, Java, …) already have a correct healthcheck
  // in their docker-compose.yml; overriding it with wget would break Python/Java
  // containers that don't have wget, making them unhealthy and invisible to Traefik.
  const healthcheckLines = isNextjs
    ? [
        '    healthcheck:',
        `      test: ["CMD", "wget", "-q", "-O", "/dev/null", "${healthUrl}"]`,
        '      interval: 10s',
        '      timeout: 5s',
        '      retries: 5',
        '      start_period: 30s',
      ]
    : [];

  const lines = [
    'networks:',
    '  brewnet:',
    '    external: true',
    '',
    'services:',
    '  backend:',
    '    networks:',
    '      - default',
    '      - brewnet',
    ...healthcheckLines,
    '    labels:',
    ...backendLabels,
  ];

  if (frontendContainerPort !== undefined) {
    const frn = `bp-${stackId}-ui`;
    const fpp = `/apps/${stackId}-ui`;
    lines.push(
      '',
      '  frontend:',
      '    networks:',
      '      - default',
      '      - brewnet',
      '    labels:',
      '      - "traefik.enable=true"',
      `      - "traefik.docker.network=brewnet"`,
      `      - "traefik.http.routers.${frn}.rule=PathPrefix(\`${fpp}\`)"`,
      `      - "traefik.http.routers.${frn}.entrypoints=web"`,
      `      - "traefik.http.middlewares.${frn}-strip.stripprefix.prefixes=${fpp}"`,
      `      - "traefik.http.routers.${frn}.middlewares=${frn}-strip"`,
      `      - "traefik.http.services.${frn}.loadbalancer.server.port=${frontendContainerPort}"`,
    );
  }

  writeFileSync(join(projectDir, 'docker-compose.override.yml'), lines.join('\n') + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// T010b — patchDockerfileHealthcheck
// ---------------------------------------------------------------------------

/**
 * Replace `localhost` with `127.0.0.1` in all Dockerfile HEALTHCHECK lines.
 *
 * On Alpine Linux, `localhost` resolves to `::1` (IPv6) but many service
 * containers only listen on IPv4. This makes `wget http://localhost:<port>`
 * fail with "Connection refused", leaving containers permanently unhealthy
 * and invisible to Traefik's Docker provider.
 *
 * Patches both `backend/Dockerfile` and `frontend/Dockerfile` if present.
 * Only applies to non-Next.js stacks — Next.js healthchecks are handled by
 * writeTraefikOverride which generates a fresh CMD with the correct basePath URL.
 *
 * @param projectDir - Absolute path to the boilerplate project directory
 * @param stackId    - Stack identifier (e.g. "python-django")
 */
export function patchDockerfileHealthcheck(projectDir: string, stackId: string): void {
  if (stackId.startsWith('nodejs-nextjs')) return;

  const dockerfiles = [
    join(projectDir, 'Dockerfile'),
    join(projectDir, 'backend', 'Dockerfile'),
    join(projectDir, 'frontend', 'Dockerfile'),
  ];

  for (const p of dockerfiles) {
    try {
      const original = readFileSync(p, 'utf-8');
      const patched = original.replace(
        /HEALTHCHECK(.*\\\n.*|\s.*)\bhttp:\/\/localhost:/g,
        (m) => m.replace(/http:\/\/localhost:/g, 'http://127.0.0.1:'),
      );
      if (patched !== original) {
        writeFileSync(p, patched, 'utf-8');
      }
    } catch { /* file not present — skip */ }
  }
}

// ---------------------------------------------------------------------------
// T011 — patchNextjsConfig
// ---------------------------------------------------------------------------

/**
 * Patch next.config.ts (or next.config.js) in the boilerplate directory to set
 * `basePath` so that Next.js generates asset URLs (/_next/...) prefixed with
 * the Traefik path, preventing broken images/CSS when served under a sub-path.
 *
 * Must be called BEFORE startContainers so that `next build` (inside Docker)
 * bakes the correct basePath into the build output.
 *
 * Only applies to nodejs-nextjs* stacks. No-ops silently for other stacks.
 *
 * @param projectDir - Absolute path to the boilerplate project directory
 * @param stackId    - Stack identifier (e.g. "nodejs-nextjs-full")
 */
export function patchNextjsConfig(projectDir: string, stackId: string): void {
  if (!stackId.startsWith('nodejs-nextjs')) return;

  const basePath = `/apps/${stackId}`;

  // --- 1. Patch next.config.ts / .js / .mjs ---
  const candidates = ['next.config.ts', 'next.config.js', 'next.config.mjs'];
  let configPath = '';
  for (const name of candidates) {
    const p = join(projectDir, name);
    try {
      readFileSync(p);
      configPath = p;
      break;
    } catch { /* not found */ }
  }
  if (configPath) {
    let content = readFileSync(configPath, 'utf-8');
    if (/basePath\s*:/.test(content)) {
      content = content.replace(/basePath\s*:\s*['"`][^'"`]*['"`]/, `basePath: '${basePath}'`);
    } else if (/output\s*:\s*['"`]standalone['"`]/.test(content)) {
      content = content.replace(
        /(output\s*:\s*['"`]standalone['"`])/,
        `$1,\n    basePath: '${basePath}'`,
      );
    } else {
      content = content.replace(/(\};\s*$)/, `  basePath: '${basePath}',\n$1`);
    }
    writeFileSync(configPath, content, 'utf-8');
  }

  // --- 2. Patch Dockerfile HEALTHCHECK to include basePath ---
  // Without this, `docker ps` would show the container as unhealthy because
  // Next.js routes all paths under basePath (e.g. /apps/stackId/health).
  const dockerfilePath = join(projectDir, 'Dockerfile');
  try {
    let dockerfile = readFileSync(dockerfilePath, 'utf-8');
    // Match wget/curl health check lines and append basePath before /health
    dockerfile = dockerfile.replace(
      /(wget\s+-q\s+-O\s+\/dev\/null\s+http:\/\/127\.0\.0\.1:\d+)(\/health)/g,
      `$1${basePath}$2`,
    );
    dockerfile = dockerfile.replace(
      /(curl\s+[^"]*http:\/\/127\.0\.0\.1:\d+)(\/health)/g,
      `$1${basePath}$2`,
    );
    writeFileSync(dockerfilePath, dockerfile, 'utf-8');
  } catch { /* Dockerfile not present or no healthcheck line — skip */ }
}
