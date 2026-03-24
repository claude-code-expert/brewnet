# Research: Admin UI React Migration

**Branch**: `001-admin-react-migration` | **Date**: 2026-03-18

---

## Decision 1: Build Tool — Vite 5 + React 18 + React Router v6

**Decision**: Use Vite 5 as build tool with React 18 and React Router v6 (createBrowserRouter).

**Rationale**:
- pnpm monorepo already uses `packages/*` glob — `packages/admin-ui` is automatically included, no `pnpm-workspace.yaml` changes needed.
- Vite produces `dist/index.html` + `dist/assets/[name]-[hash].[ext]` structure. Content-hashed assets get `immutable` cache headers; `index.html` gets `no-cache`.
- `react-router-dom` v6 single package handles all SPA routing. `createBrowserRouter` flat array is the v6.4+ recommended pattern.

**Alternatives considered**:
- Next.js: Rejected — SSR not needed; constitution reserves `packages/dashboard` for a future Pro Next.js feature.
- Parcel: Rejected — less ecosystem support; Vite is the dominant React SPA build tool as of 2026.

---

## Decision 2: Static File Serving in admin-server.ts (raw node:http)

**Decision**: Add MIME type map + `createReadStream` serving + SPA fallback in `admin-server.ts`. No new server framework (Express/Fastify) needed.

**Rationale**:
- `admin-server.ts` already uses raw `node:http` `createServer`. Adding ~50 lines of static serving is simpler than introducing a new dependency.
- `ADMIN_UI_DIST` path computed from `PKG_ROOT` (already defined at L97): `join(PKG_ROOT, 'packages/admin-ui/dist')`.
- Path traversal prevention: `resolve(ADMIN_UI_DIST, '.' + pathname)` + `startsWith(ADMIN_UI_DIST)` check.

**Request dispatch order (after change)**:
1. `OPTIONS` → CORS preflight (unchanged)
2. `/api/*` → existing API handlers (unchanged)
3. `/assets/*` → serve from `dist/assets/`, 404 if file not found
4. Static file exists at exact path → serve it
5. Any remaining `GET` → serve `dist/index.html` (SPA fallback)
6. dist not built → 503 with "Run: pnpm --filter @brewnet/admin-ui build"

**SPA fallback handling**: React Router v6 `createBrowserRouter` needs server to return `index.html` for `/`, `/apps`, `/apps/:name`, and any future routes. The fallback is correct for all non-asset, non-API GETs.

**Alternatives considered**:
- Serve-static npm package: Rejected — would add a dependency and change the architecture for a small problem.
- Redirect all to `/?path=...`: Rejected — breaks browser history API.

---

## Decision 3: New API Endpoints Required

**Decision**: Add two new endpoints to `admin-server.ts`:

| Endpoint | Data Served | Previously Embedded As |
|---|---|---|
| `GET /api/config` | `{ adminUsername, passwordHint, domainProvider, quickTunnelUrl, zoneName, tunnelId }` | `ADMIN_CREDS` + `DOMAIN_CONFIG` JS variables |
| `GET /api/services/catalog` | `{ catalog: SERVICE_DETAIL_MAP, aliases: NAME_ALIASES }` | `SERVICE_DETAIL_MAP` JS variable |

**Already existing (no change needed)**:
- `BOILERPLATE_STACKS` → `GET /api/apps/boilerplates` (L1399) ✅
- `DOMAIN_CONNECTIONS` → `GET /api/domain/list` (L1747) ✅

**Rationale**: React cannot access JS variables embedded in an HTML page it didn't receive server-side. All data must be fetchable. `GET /api/config` is read-only and requires no auth (returns masked password hint only, not the actual password).

---

## Decision 4: Admin Password — sessionStorage + Context API

**Decision**: Password input modal on first page load → `sessionStorage.setItem('adminPassword', pw)` → React Context provides `apiFetch` wrapper that injects `X-Admin-Password` header automatically.

**Rationale**:
- `sessionStorage` clears when tab is closed (more secure than `localStorage`).
- Password validated against `GET /api/health` with the `X-Admin-Password` header; 401 = wrong password.
- Context API (`AuthProvider` + `useAuth()`) centralizes header injection without per-component boilerplate.

**SSE special case**: `EventSource` does not support custom headers. The log stream endpoint (`GET /api/apps/:name/logs`) must accept password via query string: `?token=<pw>`. The server-side SSE handler must be updated to check `?token` when `X-Admin-Password` header is absent. (If the endpoint is unauthenticated in current code, no change needed.)

**Alternatives considered**:
- Cookie-based session: Rejected — would require adding session management to admin-server.ts, significant scope expansion.
- Per-action password re-entry: Rejected — poor UX, spec clarification Q2 chose sessionStorage.

---

## Decision 5: Polling Strategy — Unchanged setInterval

**Decision**: Replicate current polling intervals exactly using `useEffect` + `setInterval` + `clearInterval` in cleanup. Add `cancelled` flag to prevent stale state updates on unmount.

**Rationale**: Spec clarification Q4 chose this approach to minimize migration risk. No new SSE streams or WebSocket for status updates.

**Pattern**:
```typescript
useEffect(() => {
  let cancelled = false;
  const poll = async () => {
    const data = await apiFetch('/api/services').then(r => r.json()).catch(() => null);
    if (!cancelled && data) setServices(data.services);
  };
  poll(); // immediate first call
  const id = setInterval(poll, POLL_INTERVAL_MS);
  return () => { cancelled = true; clearInterval(id); };
}, [apiFetch]);
```

---

## Decision 6: Visual Design — CSS Module Replication

**Decision**: Extract existing CSS from template literals into `src/styles/` CSS files or CSS Modules. Replicate exact color palette, layout, spacing, and component styles. No redesign.

**Rationale**: Spec clarification Q5 mandated 1:1 visual equivalence. Using CSS Modules provides scoping without design changes.

**Approach**:
- Global styles (body, reset, dark theme variables) → `src/styles/global.css`
- Component-specific styles → co-located `Component.module.css`
- Toast, modal, table styles → individual modules

---

## Decision 7: Code Deletion Strategy

**Decision**: After React migration is complete and all SC-001–SC-007 verified, delete:
- `packages/cli/src/services/status-page.ts` (entire file)
- `packages/cli/src/services/apps-page.ts` (entire file)
- In `admin-server.ts`: remove `generateDashboardHtml`, `buildBoilerplateSectionHtml`, `DashboardConfig` interface, `dashConfig`, `dashboardHtml`, `detectCredentials`, `refreshBoilerplateMeta`, and the 3 HTML-serving route handlers (L1276–L1300).

**Rationale**: Spec clarification Q3 + FR-015 mandate this. Dead code creates confusion and maintenance risk.

---

## Key File References

| File | Lines | Relevance |
|---|---|---|
| `packages/cli/src/services/admin-server.ts` | 2,098 | Main server — L139–665 generate functions to remove; L1276–1300 route handlers to replace; L1399,1747 existing API endpoints to reuse |
| `packages/cli/src/services/apps-page.ts` | ~1,500 | Delete after migration |
| `packages/cli/src/services/status-page.ts` | ~500 | Delete after migration (exports `SERVICE_DETAIL_MAP` used at L23) |
| `packages/cli/src/services/admin-server.ts` L23 | 1 | `import { SERVICE_DETAIL_MAP } from './status-page.js'` |
| `packages/cli/src/services/admin-server.ts` L30 | 1 | `import { generateAppsPageHtml, generateAppDetailHtml } from './apps-page.js'` |

---

## Unresolved Items (Deferred to Implementation)

1. **SSE auth**: Whether `GET /api/apps/:name/logs` currently checks `X-Admin-Password`. If yes, add `?token` query string support. If no, no change needed.
2. **`DOMAIN_CONNECTIONS` source discrepancy**: `dashConfig.domainConnectionsJson` uses `wizardState?.domainConnections` directly; `GET /api/domain/list` uses `DomainManager.list()`. Verify they return the same data or use the API endpoint consistently.
3. **Admin-server.ts dist path**: Exact relative path from `packages/cli/dist/admin-server-HASH.js` to `packages/admin-ui/dist/` must be verified after initial build.
