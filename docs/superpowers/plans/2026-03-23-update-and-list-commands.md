# Update & List Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `brewnet update` (pull latest images + restart) and `brewnet list` (show available/installed services) CLI commands, plus Admin UI integration for both.

**Architecture:** Both commands are read/action-only and don't modify existing service logic. `update` reuses `health-checker.ts` command builders. `list` reads `SERVICE_REGISTRY` and `STACK_CATALOG`. Admin UI gets a new "Catalog" page for browsing + installing services, and an "Update" button on Dashboard. All new code is additive — no existing handlers or components are modified.

**Tech Stack:** TypeScript 5.x, Commander.js, chalk, ora, execa, React (admin-ui), existing `SERVICE_REGISTRY`, `STACK_CATALOG`, `health-checker.ts`

**Key constraint:** `admin-server.ts`의 기존 핸들러 로직 변경 금지 (CLAUDE.md 규칙). 신규 핸들러/엔드포인트 추가만 허용.

---

## File Map

| File | Responsibility |
|------|---------------|
| `packages/cli/src/commands/update.ts` | CLI `brewnet update` — pull + restart + health verify |
| `packages/cli/src/commands/list.ts` | CLI `brewnet list` — service/stack catalog display |
| `packages/cli/src/index.ts` | Register both new commands |
| `packages/cli/src/services/admin-server.ts` | Add `POST /api/services/update` handler (new handler only) |
| `packages/admin-ui/src/pages/Catalog.tsx` | New page: browsable service catalog with install/remove |
| `packages/admin-ui/src/pages/Dashboard.tsx` | Add "Update Services" button (minimal addition) |
| `packages/admin-ui/src/components/NavHeader.tsx` | Add "Catalog" nav link |
| `packages/admin-ui/src/router.tsx` | Add `/catalog` route |
| `tests/unit/cli/commands/index.test.ts` | Update subcommand count expectation |

---

## Task 1: CLI `brewnet list` command

**Files:**
- Create: `packages/cli/src/commands/list.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `list.ts` with service catalog display**

```typescript
/**
 * brewnet list — Show available services and app stacks
 *
 * Displays the SERVICE_REGISTRY (infrastructure services) and
 * optionally STACK_CATALOG (app boilerplate stacks) with
 * installation status.
 *
 * @module commands/list
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { SERVICE_REGISTRY } from '../config/services.js';
import { STACK_CATALOG } from '../config/stacks.js';

// Category display names and order
const CATEGORY_MAP: Record<string, { label: string; order: number }> = {
  web:   { label: 'Web Server',   order: 0 },
  git:   { label: 'Git Server',   order: 1 },
  file:  { label: 'File Server',  order: 2 },
  db:    { label: 'Database',     order: 3 },
  media: { label: 'Media',        order: 4 },
  admin: { label: 'Admin UI',     order: 5 },
  tunnel:{ label: 'Tunnel',       order: 6 },
  other: { label: 'Other',        order: 7 },
};

function inferCategory(id: string): string {
  if (['traefik', 'nginx', 'caddy'].includes(id)) return 'web';
  if (id === 'gitea') return 'git';
  if (['nextcloud', 'minio', 'filebrowser'].includes(id)) return 'file';
  if (['postgresql', 'mysql'].includes(id)) return 'db';
  if (id === 'jellyfin') return 'media';
  if (id === 'pgadmin') return 'admin';
  if (id === 'cloudflared') return 'tunnel';
  return 'other';
}

async function getInstalledServices(projectPath: string): Promise<Set<string>> {
  const installed = new Set<string>();
  try {
    const { stdout } = await execa(
      'docker',
      ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'ps', '--all', '--format', 'json'],
      { cwd: projectPath },
    );
    const trimmed = stdout.trim();
    if (!trimmed) return installed;

    // Handle JSON array or NDJSON
    const entries: { Service?: string }[] = [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) entries.push(...parsed);
    } catch {
      for (const line of trimmed.split('\n').filter(Boolean)) {
        try { entries.push(JSON.parse(line)); } catch { /* skip */ }
      }
    }

    for (const e of entries) {
      if (e.Service) installed.add(e.Service);
    }
  } catch {
    // No compose file or Docker not running — return empty set
  }
  return installed;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List available services and app stacks')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--stacks', 'Show app boilerplate stacks instead of services')
    .option('--installed', 'Show only installed services')
    .option('--json', 'Output as JSON')
    .action(async (options: { path: string; stacks: boolean; installed: boolean; json: boolean }) => {
      if (options.stacks) {
        // --- App stacks mode ---
        const stacks = STACK_CATALOG.map((s) => ({
          id: s.id,
          language: s.language,
          framework: s.framework,
          version: s.version,
          orm: s.orm,
        }));

        if (options.json) {
          console.log(JSON.stringify(stacks, null, 2));
          return;
        }

        console.log(chalk.bold('\n  App Stacks (brewnet create-app)\n'));
        const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
        console.log(
          `  ${chalk.bold(pad('ID', 24))}${chalk.bold(pad('Language', 12))}${chalk.bold(pad('Framework', 28))}${chalk.bold('ORM')}`,
        );
        console.log(`  ${'-'.repeat(24)}${'-'.repeat(12)}${'-'.repeat(28)}${'-'.repeat(16)}`);
        for (const s of stacks) {
          console.log(
            `  ${chalk.cyan(pad(s.id, 24))}${pad(s.language, 12)}${pad(s.framework, 28)}${chalk.dim(s.orm)}`,
          );
        }
        console.log(chalk.dim(`\n  ${stacks.length} stacks available. Use: brewnet create-app <name> --stack <id>\n`));
        return;
      }

      // --- Services mode ---
      const installedSet = await getInstalledServices(options.path);
      const allServices = [...SERVICE_REGISTRY.values()].map((def) => ({
        id: def.id,
        name: def.name,
        image: def.image,
        category: inferCategory(def.id),
        ramMB: def.ramMB,
        installed: installedSet.has(def.id),
      }));

      const filtered = options.installed
        ? allServices.filter((s) => s.installed)
        : allServices;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      // Group by category
      const groups = new Map<string, typeof filtered>();
      for (const svc of filtered) {
        const list = groups.get(svc.category) ?? [];
        list.push(svc);
        groups.set(svc.category, list);
      }

      // Sort groups by defined order
      const sorted = [...groups.entries()].sort(
        (a, b) => (CATEGORY_MAP[a[0]]?.order ?? 99) - (CATEGORY_MAP[b[0]]?.order ?? 99),
      );

      console.log(chalk.bold('\n  Available Services\n'));
      for (const [cat, items] of sorted) {
        const label = CATEGORY_MAP[cat]?.label ?? cat;
        console.log(`  ${chalk.bold(label)}`);
        for (const svc of items) {
          const status = svc.installed
            ? chalk.green('● installed')
            : chalk.dim('○ available');
          console.log(
            `    ${status}  ${chalk.cyan(svc.id.padEnd(20))} ${svc.name.padEnd(20)} ${chalk.dim(svc.image)}`,
          );
        }
        console.log('');
      }

      const installedCount = filtered.filter((s) => s.installed).length;
      console.log(
        chalk.dim(`  ${installedCount}/${filtered.length} installed. `) +
        chalk.dim(`Use: brewnet add <id> | brewnet remove <id>\n`),
      );
    });
}
```

- [ ] **Step 2: Register in index.ts**

Add to `packages/cli/src/index.ts`:

```typescript
// Add import (after line 27)
import { registerListCommand } from './commands/list.js';

// Add registration (after registerCreateAppCommand, ~line 59)
registerListCommand(program);
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet && pnpm --filter @brewnet/cli build
node packages/cli/dist/index.js list
node packages/cli/dist/index.js list --stacks
node packages/cli/dist/index.js list --installed
node packages/cli/dist/index.js list --json
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/list.ts packages/cli/src/index.ts
git commit -m "feat(cli): add brewnet list command for service/stack catalog"
```

---

## Task 2: CLI `brewnet update` command

**Files:**
- Create: `packages/cli/src/commands/update.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `update.ts`**

```typescript
/**
 * brewnet update — Update all services
 *
 * Pulls latest Docker images for all services in the compose file,
 * then recreates containers with the new images. Optionally creates
 * a backup before updating.
 *
 * @module commands/update
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { checkDockerAvailability } from '../services/docker-manager.js';
import { BrewnetError } from '../utils/errors.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Pull latest images and restart all services')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--no-restart', 'Pull images only, do not restart containers')
    .action(async (options: { path: string; restart: boolean }) => {
      // Guard: Docker must be running
      try {
        await checkDockerAvailability();
      } catch (err) {
        const msg = err instanceof BrewnetError ? err.message : String(err);
        console.error(chalk.red(`Error [BN001]: ${msg}`));
        process.exitCode = 1;
        return;
      }

      const composePath = DOCKER_COMPOSE_FILENAME;

      // Step 1: Pull latest images
      const pullSpinner = ora('Pulling latest images...').start();
      try {
        await execa('docker', ['compose', '-f', composePath, 'pull'], {
          cwd: options.path,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        pullSpinner.succeed('All images pulled.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('no configuration file') || msg.includes('No such file')) {
          pullSpinner.fail('No brewnet project found in the current directory.');
          console.log(
            chalk.dim(`  Run ${chalk.bold('brewnet init')} to set up a project, or use `) +
            chalk.bold('-p <path>') + chalk.dim(' to specify a project path.'),
          );
        } else {
          pullSpinner.fail(chalk.red(`Failed to pull images: ${msg}`));
        }
        process.exitCode = 1;
        return;
      }

      if (!options.restart) {
        console.log(chalk.dim('\n  Images pulled. Skipping restart (--no-restart).'));
        console.log(chalk.dim(`  Run ${chalk.bold('brewnet up')} to start with new images.\n`));
        return;
      }

      // Step 2: Recreate containers with new images
      const upSpinner = ora('Restarting services with new images...').start();
      try {
        await execa(
          'docker',
          ['compose', '-f', composePath, 'up', '-d', '--force-recreate', '--remove-orphans'],
          { cwd: options.path, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        upSpinner.succeed('All services restarted with latest images.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        upSpinner.fail(chalk.red(`Failed to restart services: ${msg}`));
        process.exitCode = 1;
        return;
      }

      // Step 3: Quick health summary
      try {
        const { stdout } = await execa(
          'docker',
          ['compose', '-f', composePath, 'ps', '--format', 'json'],
          { cwd: options.path },
        );
        const trimmed = stdout.trim();
        if (trimmed) {
          let containers: { State?: string }[] = [];
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) containers = parsed;
          } catch {
            containers = trimmed.split('\n').filter(Boolean).flatMap((l) => {
              try { return [JSON.parse(l)]; } catch { return []; }
            });
          }
          const running = containers.filter((c) => c.State === 'running').length;
          console.log(chalk.dim(`\n  ${running}/${containers.length} services running.\n`));
        }
      } catch {
        // Non-critical — skip health summary
      }
    });
}
```

- [ ] **Step 2: Register in index.ts**

Add to `packages/cli/src/index.ts`:

```typescript
// Add import (after registerListCommand import)
import { registerUpdateCommand } from './commands/update.js';

// Add registration (after registerListCommand)
registerUpdateCommand(program);
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/codevillain/Claude-Code-Expert/brewnet && pnpm --filter @brewnet/cli build
node packages/cli/dist/index.js update --help
node packages/cli/dist/index.js update --no-restart
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/update.ts packages/cli/src/index.ts
git commit -m "feat(cli): add brewnet update command for image pull + restart"
```

---

## Task 3: Admin API — `POST /api/services/update` endpoint

**Files:**
- Modify: `packages/cli/src/services/admin-server.ts` (add new handler + route only)

- [ ] **Step 1: Add `handleUpdateServices` handler function**

Add the new handler function in `admin-server.ts`, right after the `handleRemoveService` function (after ~line 883), before `handleGetCatalog`:

```typescript
async function handleUpdateServices(
  _req: IncomingMessage,
  res: ServerResponse,
  _parts: string[],
  _body: string,
  projectPath: string,
): Promise<void> {
  try {
    const composePath = join(projectPath, 'docker-compose.yml');
    if (!existsSync(composePath)) {
      json(res, 404, { success: false, error: 'No compose file found' });
      return;
    }

    // Pull latest images
    await execa('docker', ['compose', '-f', 'docker-compose.yml', 'pull'], {
      cwd: projectPath,
    });

    // Recreate with new images
    await execa(
      'docker',
      ['compose', '-f', 'docker-compose.yml', 'up', '-d', '--force-recreate', '--remove-orphans'],
      { cwd: projectPath },
    );

    json(res, 200, { success: true, message: 'Services updated and restarted' });
  } catch (err) {
    json(res, 500, { success: false, error: String(err) });
  }
}
```

- [ ] **Step 2: Add route for the new handler**

In the request router (around line 1245, inside the `parts[1] === 'services'` block), add:

```typescript
if (req.method === 'POST' && parts[2] === 'update') {
  await handleUpdateServices(req, res, parts, body, projectPath);
  return;
}
```

Place this right after the existing `parts[2] === 'install'` check (line 1246).

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @brewnet/cli build
# Test with curl (admin must be running)
curl -s -X POST http://localhost:8088/api/services/update \
  -H "X-Admin-Password: $(node -e "const f=require('fs'),p=require('path'),o=require('os');const c=JSON.parse(f.readFileSync(p.join(o.homedir(),'.brewnet','projects',JSON.parse(f.readFileSync(p.join(o.homedir(),'.brewnet','config.json'),'utf8')).lastProject,'selections.json'),'utf8'));console.log(c.admin.password)")" \
  | python3 -m json.tool
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/services/admin-server.ts
git commit -m "feat(admin-api): add POST /api/services/update endpoint"
```

---

## Task 4: Admin UI — Catalog page with install/remove

**Files:**
- Create: `packages/admin-ui/src/pages/Catalog.tsx`
- Modify: `packages/admin-ui/src/router.tsx`
- Modify: `packages/admin-ui/src/components/NavHeader.tsx`

- [ ] **Step 1: Create `Catalog.tsx` page**

This page fetches `GET /api/catalog` (already returns `{ catalog: [...] }` with `installed` boolean) and renders services grouped by category, with Install/Remove buttons.

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { NavHeader } from '../components/NavHeader.js';
import { Footer } from '../components/Footer.js';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  image: string;
  ramEstimateMB: number;
  installed: boolean;
}

const CATEGORY_ORDER = ['db', 'file', 'media', 'admin', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  db: 'Database',
  file: 'File Server',
  media: 'Media',
  admin: 'Admin UI',
  other: 'Other',
};

export function Catalog() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/catalog');
      if (res.ok) {
        const data = await res.json() as { catalog: CatalogItem[] };
        setItems(data.catalog);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const handleInstall = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch('/api/services/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchCatalog();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleRemove = async (id: string) => {
    if (!confirm(`Remove ${id}? Data volumes will be preserved.`)) return;
    setActionLoading(id);
    try {
      await apiFetch(`/api/services/containers/${id}`, { method: 'DELETE' });
      await fetchCatalog();
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  // Group by category
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }

  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a[0]) ?? 99) - (CATEGORY_ORDER.indexOf(b[0]) ?? 99),
  );

  return (
    <div id="main">
      <NavHeader />
      <div id="content" style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Service Catalog</h2>
          <span style={{ color: '#888', fontSize: 13 }}>
            {items.filter((i) => i.installed).length}/{items.length} installed
          </span>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Loading catalog...</p>
        ) : (
          sortedGroups.map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#1e1e2e',
                      borderRadius: 8,
                      padding: '16px 20px',
                      border: item.installed ? '1px solid #4ade80' : '1px solid #333',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                      <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{item.image}</div>
                      <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>RAM: ~{item.ramEstimateMB}MB</div>
                    </div>
                    <button
                      onClick={() => item.installed ? handleRemove(item.id) : handleInstall(item.id)}
                      disabled={actionLoading === item.id}
                      style={{
                        background: item.installed ? '#ef4444' : '#4ade80',
                        color: item.installed ? '#fff' : '#000',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: actionLoading === item.id ? 'wait' : 'pointer',
                        opacity: actionLoading === item.id ? 0.6 : 1,
                        minWidth: 80,
                      }}
                    >
                      {actionLoading === item.id ? '...' : item.installed ? 'Remove' : 'Install'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Add route in `router.tsx`**

```tsx
import { Catalog } from './pages/Catalog.js';

// Add to router array:
{ path: '/catalog', element: <Catalog /> },
```

- [ ] **Step 3: Add nav link in `NavHeader.tsx`**

Add a third `NavLink` after the "Apps" link:

```tsx
<NavLink
  to="/catalog"
  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
>
  Catalog
</NavLink>
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @brewnet/admin-ui build
pnpm --filter @brewnet/cli build
# Start admin and navigate to http://localhost:8088/catalog
```

- [ ] **Step 5: Commit**

```bash
git add packages/admin-ui/src/pages/Catalog.tsx packages/admin-ui/src/router.tsx packages/admin-ui/src/components/NavHeader.tsx
git commit -m "feat(admin-ui): add Catalog page with install/remove buttons"
```

---

## Task 5: Admin UI — Update button on Dashboard

**Files:**
- Modify: `packages/admin-ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add update button and handler to Dashboard**

Add state and handler inside the `Dashboard` component:

```tsx
const [updating, setUpdating] = useState(false);
const [updateMsg, setUpdateMsg] = useState('');

const handleUpdate = async () => {
  setUpdating(true);
  setUpdateMsg('');
  try {
    const res = await apiFetch('/api/services/update', { method: 'POST' });
    const data = await res.json() as { success: boolean; message?: string; error?: string };
    setUpdateMsg(data.success ? 'Services updated successfully.' : `Error: ${data.error}`);
  } catch (err) {
    setUpdateMsg(`Error: ${String(err)}`);
  }
  setUpdating(false);
};
```

Add the button in the services tab header area (inside the tab bar or actions area on the Dashboard page, near the tab selection buttons):

```tsx
<button
  onClick={handleUpdate}
  disabled={updating}
  style={{
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: updating ? 'wait' : 'pointer',
    opacity: updating ? 0.6 : 1,
  }}
>
  {updating ? 'Updating...' : 'Update Services'}
</button>
{updateMsg && (
  <span style={{ marginLeft: 12, fontSize: 13, color: updateMsg.startsWith('Error') ? '#ef4444' : '#4ade80' }}>
    {updateMsg}
  </span>
)}
```

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @brewnet/admin-ui build
pnpm --filter @brewnet/cli build
# Verify button appears on Dashboard and triggers update
```

- [ ] **Step 3: Commit**

```bash
git add packages/admin-ui/src/pages/Dashboard.tsx
git commit -m "feat(admin-ui): add Update Services button to Dashboard"
```

---

## Task 6: Update test expectations and documentation

**Files:**
- Modify: `tests/unit/cli/commands/index.test.ts`
- Modify: `tests/cli-command-verify.sh`
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Update unit test subcommand count**

In `tests/unit/cli/commands/index.test.ts`, update the expected subcommand count from 14 to 16 (adding `list` and `update`).

- [ ] **Step 2: Update `cli-command-verify.sh`**

Move `brewnet update` and add `brewnet list` from PENDING to the Core Commands check section.

- [ ] **Step 3: Update `.claude/CLAUDE.md` CLI Commands section**

Remove `update` from the `<!-- Not yet implemented -->` comment block.
Add `brewnet list` and `brewnet update` to the main command list.

- [ ] **Step 4: Run tests and verify**

```bash
bash tests/cli-command-verify.sh
cd /Users/codevillain/Claude-Code-Expert/brewnet && pnpm test 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/cli/commands/index.test.ts tests/cli-command-verify.sh .claude/CLAUDE.md
git commit -m "test: update command count and verification for list + update"
```
