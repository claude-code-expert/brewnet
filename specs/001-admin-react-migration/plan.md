# Implementation Plan: Admin UI React Migration

**Branch**: `001-admin-react-migration` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-admin-react-migration/spec.md`

---

## Summary

Replace the brewnet admin interface's inline HTML generation (template literal approach: ~5,000 lines across `admin-server.ts`, `apps-page.ts`, `status-page.ts`) with a React SPA served as static files by the existing admin HTTP server on port 8800. The CLI package, all 30+ REST API endpoints, Docker/compose logic, and wizard steps are **unchanged**. Two new API endpoints (`GET /api/config`, `GET /api/services/catalog`) expose data previously embedded as JS variables in HTML. The React app uses React Router v6 for client-side routing, sessionStorage for password persistence, and replicates the existing visual design 1:1.

---

## Technical Context

**Language/Version**: TypeScript 5.x (packages/cli unchanged) + TypeScript 5.5 (packages/admin-ui, React build)
**Primary Dependencies** (admin-ui new):
- React 18 + React DOM
- React Router DOM v6 (`createBrowserRouter`)
- Vite 5 + `@vitejs/plugin-react`
- `@types/react`, `@types/react-dom`

**Storage**: No new storage. wizardState persisted to `~/.brewnet/projects/<name>/selections.json` (unchanged).
**Testing**: Jest 29.x for CLI unit tests (unchanged). React components: no new test framework required (spec does not add test coverage requirements beyond SC-006: existing tests pass).
**Target Platform**: macOS/Linux local browser (same as current admin server).
**Project Type**: Web SPA (`packages/admin-ui`) + Node.js HTTP server extension (`packages/cli`).
**Performance Goals**: All pages load within 2 seconds on local connection (SC-001).
**Constraints**: Zero CDN dependencies at runtime (SC-005). Bundle ≤ 50MB including all assets (SC-007). No redesign (visual replication only).
**Scale/Scope**: Single-user localhost admin tool. 3 pages, ~30 API endpoints consumed.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Zero Config | ✅ Pass | React UI served automatically by admin server; no manual user config needed |
| II. Secure by Default | ✅ Pass | sessionStorage (not localStorage); path traversal prevention in static serving; no CDN |
| III. Transparent Operations | ✅ Pass | Same operations visible in UI; existing logging unchanged |
| IV. Reversible Actions | ✅ Pass | Old code deleted only after verification; no data model changes |
| V. Offline First | ✅ Pass | React bundle served locally from dist/; no internet required at runtime |
| Architecture: 3 packages | ⚠️ Violation | Constitution mandates exactly `cli`, `shared`, `dashboard`. We add a 4th: `admin-ui`. See Complexity Tracking. |
| CLI must not depend on dashboard | ✅ Pass | `packages/cli` does not import from `packages/admin-ui`; only serves its static files |
| TypeScript strict mode | ✅ Pass | `admin-ui/tsconfig.json` uses strict mode with `noEmit:true` |
| pnpm monorepo | ✅ Pass | `packages/*` glob already covers `admin-ui`; no workspace.yaml change needed |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-admin-react-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── new-api-endpoints.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code Changes

```text
brewnet/
├── packages/
│   ├── cli/
│   │   └── src/services/
│   │       ├── admin-server.ts      # MODIFY: add static serving, 2 new API handlers, remove HTML generators
│   │       ├── status-page.ts       # DELETE after migration complete
│   │       └── apps-page.ts         # DELETE after migration complete
│   └── admin-ui/                    # NEW package
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html               # Vite SPA entry point
│       └── src/
│           ├── main.tsx             # React entry + AuthProvider + Router
│           ├── auth-context.tsx     # Password gate + apiFetch wrapper
│           ├── router.tsx           # createBrowserRouter: /, /apps, /apps/:name
│           ├── pages/
│           │   ├── Dashboard.tsx    # Replaces generateDashboardHtml()
│           │   ├── Apps.tsx         # Replaces generateAppsPageHtml()
│           │   └── AppDetail.tsx    # Replaces generateAppDetailHtml()
│           ├── components/
│           │   ├── ServiceCard.tsx
│           │   ├── LogsTab.tsx
│           │   ├── AppCard.tsx
│           │   ├── CreateAppModal.tsx
│           │   ├── PasswordGate.tsx
│           │   ├── Toast.tsx
│           │   └── ... (per-feature components)
│           ├── hooks/
│           │   ├── usePolling.ts    # setInterval + cleanup pattern
│           │   └── useLogStream.ts  # EventSource + cleanup pattern
│           └── styles/
│               ├── global.css       # Body, reset, dark theme variables
│               └── *.module.css     # Component-scoped styles
├── package.json                     # MODIFY: build script order (admin-ui first)
└── pnpm-workspace.yaml             # UNCHANGED (packages/* already covers admin-ui)
```

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 4th workspace package (`packages/admin-ui`) | Constitution mandates `cli`, `shared`, `dashboard`. But `packages/dashboard` is reserved for a future Pro Next.js feature (multi-page, App Router, SSO). The admin UI migration targets the inline HTML admin server only — merging into `packages/dashboard` would conflate two distinct products with different tech stacks and deployment models. | Creating `packages/admin-ui` as a separate package isolates build concerns, prevents dependency pollution of the CLI package, and leaves `packages/dashboard` clean for its intended Pro use case. Using a single `packages/dashboard` for both would require Next.js to serve both the Pro dashboard and the CLI admin UI — creating tight coupling between unrelated features. |

---

## Build & Integration Notes

### Root `package.json` script change

```json
{
  "scripts": {
    "build": "pnpm --filter @brewnet/admin-ui build && pnpm -r --filter !@brewnet/admin-ui build"
  }
}
```

admin-ui must build before the CLI because `admin-server.ts` will verify at startup whether `dist/` exists (503 fallback if missing).

### `ADMIN_UI_DIST` path in admin-server.ts

```typescript
// packages/cli/src/services/admin-server.ts
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// PKG_ROOT already defined at L97 — points to monorepo root
const ADMIN_UI_DIST = join(PKG_ROOT, 'packages/admin-ui/dist');
```

### SPA fallback dispatch order in admin-server.ts

```
1. OPTIONS                        → CORS preflight (unchanged)
2. /api/*                         → existing API handlers (unchanged)
3. /assets/* (file exists)        → serve from ADMIN_UI_DIST/assets/ (immutable cache)
4. /assets/* (file not found)     → 404
5. Exact static file exists       → serve it (e.g., /vite.svg, /favicon.ico)
6. Any GET (fallback)             → serve ADMIN_UI_DIST/index.html
7. dist not built                 → 503 "Run: pnpm --filter @brewnet/admin-ui build"
```

### Dev workflow (local development of admin-ui)

```bash
# Terminal 1: start Vite dev server with proxy to running admin server
pnpm --filter @brewnet/admin-ui dev
# Vite runs on :5173, proxies /api/* to http://localhost:8800

# Terminal 2: start admin server (no React needed for API testing)
brewnet admin
```

The `vite.config.ts` proxy (`'/api': 'http://localhost:8800'`) enables hot-reload during development without rebuilding the CLI on every UI change.

---

## Phase Implementation Sequence

### Phase A: Backend preparation (admin-server.ts changes only)
1. Add `GET /api/config` endpoint
2. Add `GET /api/services/catalog` endpoint
3. Add SSE `?token` query string fallback for log stream
4. Add static file serving + SPA fallback + MIME map (replace HTML-serving route handlers)
5. Verify existing tests still pass (`npm test`)

### Phase B: React package scaffold
1. Create `packages/admin-ui/` with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
2. Implement `AuthProvider`, `PasswordGate`, `apiFetch` wrapper
3. Implement `createBrowserRouter` with 3 routes
4. Verify `pnpm --filter @brewnet/admin-ui build` produces `dist/`
5. Verify admin server serves `dist/index.html` on `/`

### Phase C: Page-by-page migration (in dependency order)
1. Dashboard page (`/`) — services, logs, external domains, boilerplate section
2. Apps page (`/apps`) — app list, create modal, Settings tab
3. App Detail page (`/apps/:name`) — 4 tabs

### Phase D: Cleanup
1. Delete `status-page.ts` and `apps-page.ts`
2. Remove HTML generator functions and imports from `admin-server.ts`
3. Update root `package.json` build script
4. Final verification of all SC-001–SC-007
