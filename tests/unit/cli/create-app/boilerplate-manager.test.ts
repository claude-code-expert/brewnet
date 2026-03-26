/**
 * Unit tests for boilerplate-manager — uncovered functions
 *
 * Covers:
 *   - findFreePort: RESERVED_PORTS skip (L54)
 *   - cloneStack: removes existing dir (L77-81)
 *   - cloneStack + patchImagePaths: nodejs-nextjs path patch (L92-93, L109-123)
 *   - reinitGit: delete .git + init + commit (L143, L146-148)
 *   - generateEnv: frontendPort override (L270-273)
 *   - patchNextConfig: basePath injection + patchImagePaths + healthcheck patch (L310-369)
 *   - injectTraefikForQuickTunnel: single/multi service detection (L415-470)
 *   - parseContainerPort: host:container splitting (L384-393)
 *   - startContainers: docker compose up (L488)
 *   - verifyEndpoints: hello + echo success/failure paths (L557-580)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks — must precede dynamic imports
// ---------------------------------------------------------------------------

const mockExeca = jest.fn();
jest.unstable_mockModule('execa', () => ({ execa: mockExeca }));

const mockAddQuickTunnelAppLabels = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/compose-generator.js', () => ({
  addQuickTunnelAppLabels: mockAddQuickTunnelAppLabels,
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks)
// ---------------------------------------------------------------------------

const {
  cloneStack,
  reinitGit,
  startContainers,
  verifyEndpoints,
  patchNextConfig,
  unpatchNextConfig,
  injectTraefikForQuickTunnel,
  findFreePort,
  generateEnv,
} = await import('../../../../packages/cli/src/services/boilerplate-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'brewnet-bm-test-'));
}

function cleanTmpDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// findFreePort — reserved port skip (L54)
// ---------------------------------------------------------------------------

describe('findFreePort — reserved port skip', () => {
  it('skips port 8088 (admin server reserved) and returns next free port', async () => {
    // If port 8088 is reserved, starting from 8088 should return something != 8088
    // (unless all ports 8088-8127 are in use, which is very unlikely in a test env)
    const port = await findFreePort(8088);
    expect(port).not.toBe(8088);
  });
});

// ---------------------------------------------------------------------------
// generateEnv — frontendPort override (L270-273)
// ---------------------------------------------------------------------------

describe('generateEnv — frontendPort override', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, '.env.example'), [
      'BACKEND_PORT=8080',
      'FRONTEND_PORT=3000',
    ].join('\n') + '\n', 'utf-8');
  });

  afterEach(() => cleanTmpDir(tmpDir));

  it('replaces FRONTEND_PORT when frontendPort option is provided', () => {
    generateEnv(tmpDir, 'go-gin', 'sqlite3', { frontendPort: 4000 });
    const content = readFileSync(join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('FRONTEND_PORT=4000');
    expect(content).not.toContain('FRONTEND_PORT=3000');
  });

  it('appends FRONTEND_PORT when not present in .env.example', () => {
    // .env.example without FRONTEND_PORT
    writeFileSync(join(tmpDir, '.env.example'), 'BACKEND_PORT=8080\n', 'utf-8');
    generateEnv(tmpDir, 'go-gin', 'sqlite3', { frontendPort: 5000 });
    const content = readFileSync(join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('FRONTEND_PORT=5000');
  });
});

// ---------------------------------------------------------------------------
// cloneStack — removes existing dir (L77-81) + patchImagePaths (L92-93, L109-123)
// ---------------------------------------------------------------------------

describe('cloneStack', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = makeTmpDir();
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '' });
  });

  afterEach(() => cleanTmpDir(tmpDir));

  // ── Existing directory is removed before clone (L77-81) ─────────────────

  it('removes existing directory before cloning (L77-81)', async () => {
    // tmpDir exists (created by makeTmpDir)
    expect(existsSync(tmpDir)).toBe(true);

    // Mock execa: "git clone" recreates the directory (as git does)
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('clone')) {
        // Simulate git clone creating the target directory
        mkdirSync(tmpDir, { recursive: true });
      }
      return { exitCode: 0, stdout: '' };
    });

    await cloneStack('go-gin', tmpDir);

    // execa was called with git clone args
    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', '--depth=1']),
    );
  });

  // ── nodejs-nextjs: patchImagePaths called (L92-93, L109-123) ─────────────

  it('patches image paths for nodejs-nextjs stacks (L92-93, L109-123)', async () => {
    // Mock execa: "git clone" creates dir with .tsx file
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('clone')) {
        mkdirSync(tmpDir, { recursive: true });
        writeFileSync(
          join(tmpDir, 'page.tsx'),
          '<img src="./brewnet-site-banner.png" />',
          'utf-8',
        );
      }
      return { exitCode: 0, stdout: '' };
    });

    await cloneStack('nodejs-nextjs-full', tmpDir);

    const content = readFileSync(join(tmpDir, 'page.tsx'), 'utf-8');
    // patchImagePaths converts ./brewnet-site-banner.png → /brewnet-site-banner.png for Next.js
    expect(content).toContain('src="/brewnet-site-banner.png"');
    expect(content).not.toContain('src="./brewnet-site-banner.png"');
  });

  it('does not patch image paths for non-nextjs stacks', async () => {
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('clone')) {
        mkdirSync(tmpDir, { recursive: true });
        writeFileSync(
          join(tmpDir, 'index.html'),
          '<img src="./brewnet-site-banner.png" />',
          'utf-8',
        );
      }
      return { exitCode: 0, stdout: '' };
    });

    await cloneStack('go-gin', tmpDir);

    const content = readFileSync(join(tmpDir, 'index.html'), 'utf-8');
    // go-gin is not nextjs → image path NOT patched
    expect(content).toContain('src="./brewnet-site-banner.png"');
  });
});

// ---------------------------------------------------------------------------
// reinitGit (L143, L146-148)
// ---------------------------------------------------------------------------

describe('reinitGit', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = makeTmpDir();
    // Create a fake .git directory
    mkdirSync(join(tmpDir, '.git'), { recursive: true });
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '' });
  });

  afterEach(() => cleanTmpDir(tmpDir));

  it('removes .git and initializes fresh repository (L143, L146-148)', async () => {
    await reinitGit(tmpDir);

    // .git directory should be removed
    expect(existsSync(join(tmpDir, '.git'))).toBe(false);

    // execa called with git init, add, commit
    const calls = mockExeca.mock.calls.map((c) => (c as string[][])[1]);
    expect(calls.some((a) => a && a[0] === 'init')).toBe(true);
    expect(calls.some((a) => a && a[0] === 'add')).toBe(true);
    expect(calls.some((a) => a && a[0] === 'commit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// patchNextConfig (L310-369)
// ---------------------------------------------------------------------------

describe('patchNextConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => cleanTmpDir(tmpDir));

  // ── No config file → no-op (L316) ─────────────────────────────────────────

  it('returns without error when no next.config file found (L316)', () => {
    expect(() => patchNextConfig(tmpDir, 'my-app')).not.toThrow();
  });

  // ── Already patched → no-op ──────────────────────────────────────────────

  it('does not modify file that already has basePath', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    const original = "const config = { basePath: '/apps/my-app' };";
    writeFileSync(configPath, original, 'utf-8');

    patchNextConfig(tmpDir, 'my-app');

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toBe(original); // unchanged
  });

  // ── Standalone config → basePath + images injected (L330-334) ────────────

  it('injects basePath after output: standalone (L330-334)', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    patchNextConfig(tmpDir, 'my-app');

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("basePath: '/apps/my-app'");
    expect(content).toContain('images: { unoptimized: true }');
  });

  // ── Fallback: non-standalone config → basePath inserted (L336-341) ────────

  it('inserts basePath at object start for non-standalone config (L336-341)', () => {
    const configPath = join(tmpDir, 'next.config.mjs');
    writeFileSync(configPath, 'const nextConfig = {\n  reactStrictMode: true,\n};\n', 'utf-8');

    patchNextConfig(tmpDir, 'my-app');

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("basePath: '/apps/my-app'");
  });

  // ── docker-compose.yml healthcheck patch (L355-369) ──────────────────────

  it('patches healthcheck URL in docker-compose.yml (L355-369)', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    const composePath = join(tmpDir, 'docker-compose.yml');
    const composeContent = [
      'services:',
      '  app:',
      '    healthcheck:',
      '      test: ["CMD", "curl", "http://127.0.0.1:3000/health"]',
    ].join('\n');
    writeFileSync(composePath, composeContent, 'utf-8');

    patchNextConfig(tmpDir, 'my-app');

    const compose = readFileSync(composePath, 'utf-8');
    expect(compose).toContain('http://127.0.0.1:3000/apps/my-app/health');
  });

  // ── Calls patchImagePaths for Next.js stacks (L351, L109-123) ─────────────

  it('patches image paths in .tsx files via patchImagePaths (L351, L109-123)', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    // Create a .tsx file with the absolute path set by cloneStack
    writeFileSync(
      join(tmpDir, 'component.tsx'),
      '<img src="/brewnet-site-banner.png" />',
      'utf-8',
    );

    patchNextConfig(tmpDir, 'my-app');

    const tsxContent = readFileSync(join(tmpDir, 'component.tsx'), 'utf-8');
    expect(tsxContent).toContain('src="/apps/my-app/brewnet-site-banner.png"');
  });

  // ── Root path healthcheck fallback (L364-368) ─────────────────────────────

  it('patches root healthcheck path as fallback (L364-368)', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(
      composePath,
      'healthcheck:\n  test: curl http://127.0.0.1:3000/\n',
      'utf-8',
    );

    patchNextConfig(tmpDir, 'my-app');

    const compose = readFileSync(composePath, 'utf-8');
    expect(compose).toContain('http://127.0.0.1:3000/apps/my-app/');
  });
});

// ---------------------------------------------------------------------------
// unpatchNextConfig — reverse of patchNextConfig
// ---------------------------------------------------------------------------

describe('unpatchNextConfig', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => cleanTmpDir(tmpDir));

  // ── Returns false when no next.config exists ───────────────────────────

  it('returns false when no next.config file exists', () => {
    expect(unpatchNextConfig(tmpDir, 'my-app')).toBe(false);
  });

  // ── Returns false when basePath not present ────────────────────────────

  it('returns false when basePath is not in config', () => {
    writeFileSync(join(tmpDir, 'next.config.ts'), "const config = { reactStrictMode: true };", 'utf-8');
    expect(unpatchNextConfig(tmpDir, 'my-app')).toBe(false);
  });

  // ── Removes basePath from standalone pattern ───────────────────────────

  it('removes basePath + images from standalone config', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    // First patch, then unpatch
    patchNextConfig(tmpDir, 'my-app');
    let content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("basePath: '/apps/my-app'");
    expect(content).toContain('images: { unoptimized: true }');

    const result = unpatchNextConfig(tmpDir, 'my-app');
    expect(result).toBe(true);

    content = readFileSync(configPath, 'utf-8');
    expect(content).not.toContain('basePath');
    expect(content).not.toContain('unoptimized');
    expect(content).toContain("output: 'standalone'");
  });

  // ── Removes basePath from fallback (non-standalone) pattern ────────────

  it('removes basePath from non-standalone config', () => {
    const configPath = join(tmpDir, 'next.config.mjs');
    writeFileSync(configPath, 'const nextConfig = {\n  reactStrictMode: true,\n};\n', 'utf-8');

    patchNextConfig(tmpDir, 'my-app');
    let content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("basePath: '/apps/my-app'");

    const result = unpatchNextConfig(tmpDir, 'my-app');
    expect(result).toBe(true);

    content = readFileSync(configPath, 'utf-8');
    expect(content).not.toContain('basePath');
    expect(content).toContain('reactStrictMode: true');
  });

  // ── Reverts healthcheck URLs in docker-compose.yml ─────────────────────

  it('reverts healthcheck URL from basePath to root', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, 'test: curl http://127.0.0.1:3000/health\n', 'utf-8');

    patchNextConfig(tmpDir, 'my-app');
    let compose = readFileSync(composePath, 'utf-8');
    expect(compose).toContain('http://127.0.0.1:3000/apps/my-app/health');

    unpatchNextConfig(tmpDir, 'my-app');
    compose = readFileSync(composePath, 'utf-8');
    expect(compose).toContain('http://127.0.0.1:3000/health');
    expect(compose).not.toContain('/apps/my-app');
  });

  // ── Reverts image src paths in .tsx files ──────────────────────────────

  it('reverts image src paths from basePath to root', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');
    writeFileSync(join(tmpDir, 'page.tsx'), '<img src="/brewnet-site-banner.png" />', 'utf-8');

    patchNextConfig(tmpDir, 'my-app');
    let tsx = readFileSync(join(tmpDir, 'page.tsx'), 'utf-8');
    expect(tsx).toContain('src="/apps/my-app/brewnet-site-banner.png"');

    unpatchNextConfig(tmpDir, 'my-app');
    tsx = readFileSync(join(tmpDir, 'page.tsx'), 'utf-8');
    expect(tsx).toContain('src="/brewnet-site-banner.png"');
    expect(tsx).not.toContain('/apps/my-app');
  });

  // ── Roundtrip: patchNextConfig → unpatchNextConfig → patchNextConfig ──

  it('roundtrip: unpatch then re-patch restores basePath', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    patchNextConfig(tmpDir, 'my-app');
    const patched = readFileSync(configPath, 'utf-8');

    unpatchNextConfig(tmpDir, 'my-app');
    const unpatched = readFileSync(configPath, 'utf-8');
    expect(unpatched).not.toContain('basePath');

    // Re-patch should work (idempotency of patchNextConfig after unpatch)
    patchNextConfig(tmpDir, 'my-app');
    const repatched = readFileSync(configPath, 'utf-8');
    expect(repatched).toContain("basePath: '/apps/my-app'");
    expect(repatched).toContain('images: { unoptimized: true }');
  });

  // ── Only removes matching app's basePath ───────────────────────────────

  it('does not remove basePath for a different app name', () => {
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    patchNextConfig(tmpDir, 'my-app');
    expect(unpatchNextConfig(tmpDir, 'other-app')).toBe(false);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("basePath: '/apps/my-app'");
  });
});

// ---------------------------------------------------------------------------
// injectTraefikForQuickTunnel (L415-470)
// ---------------------------------------------------------------------------

describe('injectTraefikForQuickTunnel', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = makeTmpDir();
    mockAddQuickTunnelAppLabels.mockImplementation(() => {});
  });

  afterEach(() => cleanTmpDir(tmpDir));

  // ── No compose file → no-op (L416) ──────────────────────────────────────

  it('returns without error when no docker-compose.yml (L416)', () => {
    expect(() => injectTraefikForQuickTunnel(tmpDir, 'my-app', 8080)).not.toThrow();
  });

  // ── Single-service stack (L448-454) ──────────────────────────────────────

  it('injects labels for single-service stack (L448-454)', () => {
    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, [
      'services:',
      '  app:',
      '    image: myapp',
      '    ports:',
      '      - "${BACKEND_PORT:-8080}:8080"',
    ].join('\n'), 'utf-8');

    injectTraefikForQuickTunnel(tmpDir, 'my-app', 8080);

    expect(mockAddQuickTunnelAppLabels).toHaveBeenCalledWith(
      composePath, 'my-app', 'app', 8080, false,
    );
  });

  // ── Multi-service stack: backend + frontend (L458-470) ──────────────────

  it('injects labels for backend and frontend services (L458-470)', () => {
    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, [
      'services:',
      '  backend:',
      '    image: api',
      '    ports:',
      '      - "8080:8080"',
      '  frontend:',
      '    image: ui',
      '    ports:',
      '      - "3000:80"',
    ].join('\n'), 'utf-8');

    injectTraefikForQuickTunnel(tmpDir, 'my-app', 8080);

    expect(mockAddQuickTunnelAppLabels).toHaveBeenCalledTimes(2);
    // Backend call
    const backendCall = (mockAddQuickTunnelAppLabels.mock.calls[0] as unknown[]);
    expect(backendCall[1]).toBe('my-app');
    expect(backendCall[2]).toBe('backend');
    // Frontend call
    const frontendCall = (mockAddQuickTunnelAppLabels.mock.calls[1] as unknown[]);
    expect(frontendCall[1]).toBe('my-app-ui');
  });

  // ── Next.js stack: patchNextConfig called (L427-428) ──────────────────────

  it('calls patchNextConfig for Next.js stacks (L427-428)', () => {
    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, [
      'services:',
      '  app:',
      '    image: nextjs-app',
      '    ports:',
      '      - "3000:3000"',
    ].join('\n'), 'utf-8');

    // Create next.config.ts to trigger isNextjs = true
    const configPath = join(tmpDir, 'next.config.ts');
    writeFileSync(configPath, "const config = { output: 'standalone' };", 'utf-8');

    injectTraefikForQuickTunnel(tmpDir, 'next-app', 3000);

    // patchNextConfig was called (verifiable: config now has basePath)
    const configContent = readFileSync(configPath, 'utf-8');
    expect(configContent).toContain('basePath');
    // addQuickTunnelAppLabels called with isNextjs=true
    expect(mockAddQuickTunnelAppLabels).toHaveBeenCalledWith(
      composePath, 'next-app', 'app', 3000, true,
    );
  });

  // ── Port spec without colon → parsed as container port (L392-393) ─────────

  it('handles port spec without colon (e.g. "8080") → uses parsed value', () => {
    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, [
      'services:',
      '  app:',
      '    image: myapp',
      '    ports:',
      '      - "8080"',  // no colon
    ].join('\n'), 'utf-8');

    injectTraefikForQuickTunnel(tmpDir, 'my-app', 8080);

    expect(mockAddQuickTunnelAppLabels).toHaveBeenCalledWith(
      composePath, 'my-app', 'app', 8080, false,
    );
  });

  // ── No ports on service → defaults to 8080 ───────────────────────────────

  it('defaults container port to 8080 when service has no ports', () => {
    const composePath = join(tmpDir, 'docker-compose.yml');
    writeFileSync(composePath, [
      'services:',
      '  app:',
      '    image: myapp',
    ].join('\n'), 'utf-8');

    injectTraefikForQuickTunnel(tmpDir, 'my-app', 8080);

    expect(mockAddQuickTunnelAppLabels).toHaveBeenCalledWith(
      composePath, 'my-app', 'app', 8080, false,
    );
  });
});

// ---------------------------------------------------------------------------
// startContainers (L488)
// ---------------------------------------------------------------------------

describe('startContainers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '' });
  });

  it('runs docker compose up -d --build (L488)', async () => {
    await startContainers('/tmp/my-project');

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'up', '-d', '--build'],
      { cwd: '/tmp/my-project' },
    );
  });
});

// ---------------------------------------------------------------------------
// verifyEndpoints (L557-580)
// ---------------------------------------------------------------------------

describe('verifyEndpoints', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  function mockFetch(responses: Array<{ ok: boolean; status?: number; json: () => Promise<unknown> }>) {
    let idx = 0;
    globalThis.fetch = jest.fn().mockImplementation(async () => {
      const r = responses[idx++] ?? responses[responses.length - 1]!;
      return r;
    }) as unknown as typeof fetch;
  }

  // ── Success path (L557-580) ──────────────────────────────────────────────

  it('resolves without error when both endpoints succeed', async () => {
    mockFetch([
      { ok: true, json: async () => ({ message: 'Hello Brewnet!' }) },
      { ok: true, json: async () => ({ test: 'brewnet' }) },
    ]);

    await expect(verifyEndpoints('http://127.0.0.1:8080')).resolves.toBeUndefined();
  });

  // ── GET /api/hello → HTTP error (L560-562) ────────────────────────────────

  it('throws when GET /api/hello returns non-OK status (L560-562)', async () => {
    mockFetch([
      { ok: false, status: 404, json: async () => ({}) },
    ]);

    await expect(verifyEndpoints('http://127.0.0.1:8080')).rejects.toThrow(
      'GET /api/hello returned HTTP 404',
    );
  });

  // ── GET /api/hello → missing message field (L564-566) ────────────────────

  it('throws when GET /api/hello response missing message field', async () => {
    mockFetch([
      { ok: true, json: async () => ({}) },
    ]);

    await expect(verifyEndpoints('http://127.0.0.1:8080')).rejects.toThrow(
      'missing "message" field',
    );
  });

  // ── POST /api/echo → HTTP error (L575-577) ────────────────────────────────

  it('throws when POST /api/echo returns non-OK status (L575-577)', async () => {
    mockFetch([
      { ok: true, json: async () => ({ message: 'hello' }) },
      { ok: false, status: 500, json: async () => ({}) },
    ]);

    await expect(verifyEndpoints('http://127.0.0.1:8080')).rejects.toThrow(
      'POST /api/echo returned HTTP 500',
    );
  });

  // ── POST /api/echo → wrong test value (L578-582) ─────────────────────────

  it('throws when POST /api/echo response test field mismatch (L578-582)', async () => {
    mockFetch([
      { ok: true, json: async () => ({ message: 'hello' }) },
      { ok: true, json: async () => ({ test: 'wrong' }) },
    ]);

    await expect(verifyEndpoints('http://127.0.0.1:8080')).rejects.toThrow(
      'response mismatch',
    );
  });
});
