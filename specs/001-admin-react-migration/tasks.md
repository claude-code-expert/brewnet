# Tasks: Admin UI React Migration

**Input**: Design documents from `/specs/001-admin-react-migration/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Not requested — no test tasks generated (spec.md SC-006 only requires existing CLI tests pass).

**Organization**: Tasks grouped by user story. US1/US2/US4 are P1; US3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup — `packages/admin-ui` Initialization

**Purpose**: Create the React workspace package skeleton. No functional code yet.

- [x] T001 Create `packages/admin-ui/` directory and `packages/admin-ui/package.json` with React 18, react-router-dom v6, Vite 5, @vitejs/plugin-react, TypeScript 5.5 dependencies (name: `@brewnet/admin-ui`, scripts: dev/build/preview)
- [x] T002 [P] Create `packages/admin-ui/tsconfig.json` with DOM lib, bundler moduleResolution, jsx: react-jsx, strict: true, noEmit: true (independent of root tsconfig)
- [x] T003 [P] Create `packages/admin-ui/vite.config.ts` with @vitejs/plugin-react plugin, server.proxy `/api` → `http://localhost:8800`, `build.outDir: 'dist'`
- [x] T004 [P] Create `packages/admin-ui/index.html` as Vite SPA entry (`<div id="root"></div>`, `<script type="module" src="/src/main.tsx">`)
- [x] T005 Update root `package.json` build script to build admin-ui first: `pnpm --filter @brewnet/admin-ui build && pnpm -r --filter !@brewnet/admin-ui build`

**Checkpoint**: `pnpm --filter @brewnet/admin-ui build` runs without errors and produces `packages/admin-ui/dist/`

---

## Phase 2: Foundational — Backend + React Scaffold

**Purpose**: Core infrastructure that MUST be complete before any page can be implemented.

**⚠️ CRITICAL**: All user story page work is blocked until this phase is complete.

### Backend: admin-server.ts

- [ ] T006 Add MIME type map (`MIME_TYPES` Record<string,string> covering .html/.js/.css/.svg/.ico/.png/.woff2/.json) and `serveStaticFile(filePath, res)` helper with `createReadStream().pipe(res)`, Content-Type, and Cache-Control (immutable for hashed assets) in `packages/cli/src/services/admin-server.ts`
- [ ] T007 [P] Replace `GET /` handler (currently calls `generateDashboardHtml`) with SPA fallback logic in `packages/cli/src/services/admin-server.ts`: define `ADMIN_UI_DIST = join(PKG_ROOT, 'packages/admin-ui/dist')`, serve `dist/index.html` (or 503 "Run: pnpm --filter @brewnet/admin-ui build" if dist missing)
- [ ] T008 [P] Replace `GET /apps` and `GET /apps/:name` handlers with SPA fallback (serve `dist/index.html`) in `packages/cli/src/services/admin-server.ts`. Add `/assets/*` route that serves from `dist/assets/` (404 if file not found)
- [ ] T009 Add path traversal prevention (`resolve(ADMIN_UI_DIST, '.' + pathname)` + `startsWith(ADMIN_UI_DIST)` check) and general catch-all SPA fallback for all non-API GET requests in `packages/cli/src/services/admin-server.ts`
- [ ] T010 [P] Add `GET /api/config` endpoint in `packages/cli/src/services/admin-server.ts`: return `{ adminUsername, passwordHint, domainProvider, quickTunnelUrl, zoneName, tunnelId }` from wizardState (reuse `detectQuickTunnelUrl()` and `detectCredentials()` logic already in file). No auth required.
- [ ] T011 [P] Add `GET /api/services/catalog` endpoint in `packages/cli/src/services/admin-server.ts`: move `SERVICE_DETAIL_MAP` and `NAME_ALIASES` data from `status-page.ts` inline into a new handler, return `{ catalog, aliases }`. No auth required.
- [ ] T012 Add `?token` query string fallback for `X-Admin-Password` auth in `GET /api/apps/:name/logs` SSE handler in `packages/cli/src/services/admin-server.ts` (check `X-Admin-Password` header first; fall back to `url.searchParams.get('token')` if present)

### React Scaffold

- [ ] T013 Create `packages/admin-ui/src/auth-context.tsx`: `AuthProvider` with `sessionStorage` password persistence, `apiFetch` wrapper that injects `X-Admin-Password` header, `useAuth()` hook
- [ ] T014 Create `packages/admin-ui/src/components/PasswordGate.tsx`: modal shown when `!isAuthenticated`; validates against `GET /api/health` with password; calls `setPassword()` on success; shows error on 401
- [ ] T015 Create `packages/admin-ui/src/styles/global.css`: extract dark theme CSS variables (background, surface, text, accent colors), body reset, layout utilities (`.page-container`, `.card`, `.btn`, `.toast`) from current inline CSS in `admin-server.ts`/`apps-page.ts`/`status-page.ts`
- [ ] T016 [P] Create `packages/admin-ui/src/hooks/usePolling.ts`: `usePolling(url, intervalMs, apiFetch)` hook — setInterval + clearInterval cleanup + cancelled flag pattern
- [ ] T017 [P] Create `packages/admin-ui/src/hooks/useLogStream.ts`: `useLogStream(url)` hook — EventSource with `es.close()` cleanup, `connected`/`logs`/`error` state, `?token` appended from sessionStorage
- [ ] T018 Create `packages/admin-ui/src/router.tsx`: `createBrowserRouter` with exactly 3 routes (`/` → `<Dashboard>`, `/apps` → `<Apps>`, `/apps/:name` → `<AppDetail>`); export `<Router>` component
- [ ] T019 Create `packages/admin-ui/src/main.tsx`: `<AuthProvider><PasswordGate><Router /></PasswordGate></AuthProvider>` mounted to `document.getElementById('root')`

**Checkpoint**: `pnpm --filter @brewnet/admin-ui build` succeeds; navigating to `http://localhost:8800/` shows password modal; entering correct password stores in sessionStorage and shows blank page stubs; `/apps` and browser refresh both return 200.

---

## Phase 3: User Story 1 — Dashboard Page (Priority: P1) 🎯 MVP

**Goal**: The `/` route shows all services with status, logs tab with filtering, External Domains section, and boilerplate stack cards — identical behavior to current implementation.

**Independent Test**: Load `http://localhost:8800/`, confirm service cards render with status, click Logs tab, verify source/level filtering works, verify Quick Tunnel URL appears in External Domains section.

- [ ] T020 [US1] Create `packages/admin-ui/src/pages/Dashboard.tsx`: fetch `GET /api/config` + `GET /api/services` + `GET /api/domain/list` + `GET /api/apps/boilerplates` on mount; implement polling of `/api/services` every 5s via `usePolling`; render page header with admin info + tunnel URL
- [ ] T021 [P] [US1] Create `packages/admin-ui/src/components/ServiceCard.tsx`: props `service: ServiceInfo`; renders service name, status badge (running=green/stopped=red), port, local URL link, external URL link; onClick opens `<ServiceDetailModal>`
- [ ] T022 [P] [US1] Create `packages/admin-ui/src/components/ServiceDetailModal.tsx`: fetches service detail from `catalog[service.id]` (already loaded in Dashboard context); renders features list, credential keys, docs link; CSS modal overlay matching current design
- [ ] T023 [US1] Create `packages/admin-ui/src/components/LogsTab.tsx`: fetches `GET /api/logs/stats` + `GET /api/logs` with filter params; renders log rows with timestamp, level badge, source, message; filter controls (source dropdown, level dropdown, search input); pagination; matches current logs tab visual layout
- [ ] T024 [P] [US1] Create `packages/admin-ui/src/components/ExternalDomainsSection.tsx`: renders domain connections from `GET /api/domain/list`; shows hostname, external URL, app name; includes CNAME Guide modal (DNS provider instructions for GoDaddy, Namecheap, 가비아, Cafe24) matching current design
- [ ] T025 [P] [US1] Create `packages/admin-ui/src/components/BoilerplateSection.tsx`: renders boilerplate stacks from `/api/apps/boilerplates`; shows stack ID, git branch, status, API endpoint URLs; onClick opens `<BoilerplateDetailModal>`
- [ ] T026 [P] [US1] Create `packages/admin-ui/src/components/BoilerplateDetailModal.tsx`: renders stack details (git branch, DB credentials, API endpoints health/hello/echo/docs, README link on GitHub); matches current boilerplate modal design
- [ ] T027 [US1] Add tab navigation (Services tab / Logs tab) to `Dashboard.tsx` with CSS tab switching; integrate all components (T021–T026) into the page layout

**Checkpoint**: Dashboard page (`/`) is fully functional — service status polling, logs filtering, External Domains section, boilerplate modals all work. Zero functional regressions vs current implementation.

---

## Phase 4: User Story 2 — Apps Page (Priority: P1)

**Goal**: `/apps` lists deployed apps with start/stop/deploy/delete actions, create-app modal with progress polling, and Settings tab with Cloudflare credentials form.

**Independent Test**: Load `/apps`, verify app cards render with status badges and action buttons; click "Create New App", fill options, confirm progress modal shows job updates; click Settings tab, fill Cloudflare credentials, save and verify success message.

- [ ] T028 [US2] Create `packages/admin-ui/src/pages/Apps.tsx`: page-level tabs (Apps / Settings); fetch `GET /api/apps` + `GET /api/git/repos` (silent fallback on 502) on mount; poll `/api/apps` every 5s; render app card list and Create New App button
- [ ] T029 [P] [US2] Create `packages/admin-ui/src/components/AppCard.tsx`: props `app: AppEntry`; renders name, status badge, last-deployed time, action buttons (Start/Stop/Deploy/Delete); deploy-before-start guard: if `!app.lastDeployedAt` and action === 'start', show warning toast instead of calling API
- [ ] T030 [P] [US2] Create `packages/admin-ui/src/components/Toast.tsx`: `showToast(msg: string, ms?: number)` (default 2600ms); auto-dismiss; matches current toast style (bottom-right, dark background); export as imperative function and React component
- [ ] T031 [US2] Create `packages/admin-ui/src/components/CreateAppModal.tsx`: step 1 language select (from LANGUAGE_REGISTRY equivalents); step 2 framework select per language; step 3 DB driver select; submit calls `POST /api/apps/create`; on success opens `<ProgressModal>` with returned `jobId`
- [ ] T032 [US2] Create `packages/admin-ui/src/components/ProgressModal.tsx`: polls `GET /api/apps/jobs/:jobId` every 1s; renders progress bar, log lines; auto-closes on `status === 'complete'`; shows error message on `status === 'failed'`; on complete triggers `loadApps()` refresh
- [ ] T033 [P] [US2] Create `packages/admin-ui/src/components/SettingsTab.tsx`: fetches `GET /api/settings/cloudflare` on mount; renders form fields (cf-token, cf-account, cf-zone, cf-tunnel); submit calls `PUT /api/settings/cloudflare`; shows success/error message; uses `apiFetch` with `X-Admin-Password` header
- [ ] T034 [US2] Wire app action handlers in `Apps.tsx`: start/stop → `POST /api/apps/:name/start|stop`; deploy → `POST /api/apps/:name/deploy` → open `ProgressModal`; delete → `DELETE /api/apps/:name` with confirmation dialog; after each action refresh app list

**Checkpoint**: Apps page is fully functional — all app actions work, create-app modal completes with progress, deploy-before-start guard shows warning toast, Settings tab saves Cloudflare credentials.

---

## Phase 5: User Story 3 — App Detail Page (Priority: P2)

**Goal**: `/apps/:name` shows 4 functional tabs: Overview (status + endpoints), Deployment (history + manual deploy), Logs (SSE streaming), Domain (connect/disconnect).

**Independent Test**: Navigate to `/apps/:name`, click each tab in sequence: verify Overview shows status, Deployment shows history and deploy button triggers job, Logs tab streams live output, Domain tab connects/disconnects subdomain.

- [ ] T035 [US3] Create `packages/admin-ui/src/pages/AppDetail.tsx`: read `:name` via `useParams()`; fetch `GET /api/apps/:name` + `GET /api/apps/:name/git` + `GET /api/apps/:name/deploy/settings` on mount; poll `/api/apps/:name` every 5s; render 4-tab navigation (Overview / Deployment / Logs / Domain); handle 404 response with "App not found" message
- [ ] T036 [P] [US3] Create `packages/admin-ui/src/components/OverviewTab.tsx`: renders app metadata (name, status badge, port, appDir, lastDeployedAt), local URL link, external URL link (from app.externalUrl), git branch info
- [ ] T037 [P] [US3] Create `packages/admin-ui/src/components/DeploymentTab.tsx`: renders git info (branch, remote, isDirty flag), deploy settings form (branch input, auto-deploy toggle, build command), deploy history list from `GET /api/deploy/history?app=:name`; "Deploy Now" button → `POST /api/apps/:name/deploy` → open `ProgressModal` (reuse T032)
- [ ] T038 [P] [US3] Create `packages/admin-ui/src/components/AppLogsTab.tsx`: uses `useLogStream` (T017) with `/api/apps/:name/logs?token=<sessionPassword>`; renders scrollable log output with auto-scroll to bottom; "reconnecting..." indicator when SSE disconnected; matches current log stream UI
- [ ] T039 [US3] Create `packages/admin-ui/src/components/DomainTab.tsx`: fetches `GET /api/domain/list` + `GET /api/domain/apps`; renders connected domains list with disconnect button (`DELETE /api/domain/disconnect/:appName`); "Connect Domain" button opens connect modal; connect modal has subdomain input + domain select, submits to `POST /api/domain/connect`; after connect/disconnect refresh domain list and show toast

**Checkpoint**: App Detail page all 4 tabs functional — live log streaming, deploy history, domain connect/disconnect all work identically to current implementation.

---

## Phase 6: User Story 4 + Polish + Cleanup (Priority: P1 + Final)

**Purpose**: Validate cross-page navigation (US4), verify all acceptance criteria, then delete legacy code.

### US4: Navigation validation

- [ ] T040 [US4] Verify `<Link>` navigation in `Apps.tsx` — app name links to `/apps/:name` using `react-router-dom` `<Link>` (no full page reload). Add `<Link to={`/apps/${encodeURIComponent(app.name)}`}>` in `AppCard.tsx`
- [ ] T041 [US4] Add navigation header component `packages/admin-ui/src/components/NavHeader.tsx`: links to `/` (Dashboard) and `/apps` (Apps) using `<NavLink>` with active styling; renders Brewnet logo/name; reuse existing header CSS variables
- [ ] T042 [US4] Verify browser back button restores previous page state — React Router browser history works by default; confirm with manual test: navigate Dashboard → Apps → AppDetail → back → confirm Apps list renders correctly

### Cleanup (FR-015)

- [ ] T043 Remove `generateDashboardHtml()` function (L139–665), `buildBoilerplateSectionHtml()` (L1048–1081), `DashboardConfig` interface (L78–91), `dashboardHtml` cache variable, `detectCredentials()` function, `refreshBoilerplateMeta()` function, and `escHtml()` helper from `packages/cli/src/services/admin-server.ts`
- [ ] T044 [P] Remove the import of `SERVICE_DETAIL_MAP` from `status-page.ts` (admin-server.ts L23) and the import of `generateAppsPageHtml, generateAppDetailHtml` from `apps-page.ts` (admin-server.ts L30) from `packages/cli/src/services/admin-server.ts`
- [ ] T045 [P] Delete `packages/cli/src/services/status-page.ts` (entire file — all exports now replaced by `GET /api/services/catalog` and `GET /api/config` endpoints)
- [ ] T046 [P] Delete `packages/cli/src/services/apps-page.ts` (entire file — all exports now replaced by React components and API endpoints)

### Final validation

- [ ] T047 Run `npm run build` and confirm zero TypeScript errors in both packages (SC-003)
- [ ] T048 [P] Run `npm test` and confirm all existing CLI unit tests pass without modification (SC-006)
- [ ] T049 [P] Manual verification: open `http://localhost:8800/`, `/apps`, `/apps/:name` — all load within 2s, no blank screens (SC-001)
- [ ] T050 Manual verification: reload browser on `/apps` and `/apps/:name` — both return 200 with correct page content, no 404 (SC-007)
- [ ] T051 [P] Manual verification: open DevTools Network tab on page load — confirm all assets served from `localhost:8800`, no external CDN requests (SC-005)
- [ ] T052 Manual verification: stop Gitea container, reload `/apps` — confirm no BN502 error toast appears (SC-004)

**Checkpoint**: All SC-001 through SC-007 verified. Legacy code deleted. Migration complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — BLOCKS all page phases
- **Phase 3 (US1 Dashboard)**: Depends on Phase 2 only — independent of US2/US3
- **Phase 4 (US2 Apps)**: Depends on Phase 2 only — independent of US1/US3
- **Phase 5 (US3 App Detail)**: Depends on Phase 2 only; shares `<ProgressModal>` (T032) from US2
- **Phase 6 (Polish/Cleanup)**: Depends on all page phases complete

### User Story Dependencies

- **US1 (P1) Dashboard**: Can start after Phase 2 — no story-level dependencies
- **US2 (P1) Apps**: Can start after Phase 2 — no story-level dependencies
- **US3 (P2) App Detail**: Depends on Phase 2; reuses `<ProgressModal>` (T032) from US2
- **US4 (P1) Navigation**: Validation phase — depends on US1, US2, US3 complete

### Component Reuse Map

| Component | Created In | Reused By |
|---|---|---|
| `<Toast>` (T030) | US2 | US1 (deploy-before-start guard), US3 (domain connect) |
| `<ProgressModal>` (T032) | US2 | US3 DeploymentTab |
| `usePolling` (T016) | Foundational | US1 Dashboard, US2 Apps, US3 AppDetail |
| `useLogStream` (T017) | Foundational | US3 AppLogsTab |
| `apiFetch` (T013) | Foundational | All pages and components |

### Parallel Opportunities

**Phase 1**: T001 must complete first; T002, T003, T004 can run in parallel after T001.

**Phase 2 Backend** (all parallel after T006 completes): T007, T008, T009, T010, T011, T012

**Phase 2 React** (T013 first, then all parallel): T014, T015, T016, T017 after T013; T018 after T014; T019 after T018.

**Phase 3**: T020 first; T021, T022, T024, T025, T026 in parallel; T023 independently; T027 last.

**Phase 4**: T028 first; T029, T030, T033 in parallel; T031, T034 sequentially after T029.

**Phase 5**: T035 first; T036, T037, T038 in parallel; T039 last.

**Phase 6**: T043 first; T044, T045, T046 in parallel; T047–T052 after T043–T046.

---

## Parallel Example: Phase 2 Backend

```bash
# After T006 (MIME map + serveStaticFile helper) completes:
Task T007: Add GET /api/config endpoint in admin-server.ts
Task T008: Replace GET /apps routes with SPA fallback in admin-server.ts
Task T010: Add ?token SSE auth in admin-server.ts
Task T011: Update root package.json build script
Task T012: Add SSE ?token auth for log stream in admin-server.ts
```

## Parallel Example: Phase 3 (Dashboard Components)

```bash
# After T020 (Dashboard.tsx skeleton + data fetching) completes:
Task T021: ServiceCard.tsx
Task T022: ServiceDetailModal.tsx
Task T023: LogsTab.tsx
Task T024: ExternalDomainsSection.tsx
Task T025: BoilerplateSection.tsx
Task T026: BoilerplateDetailModal.tsx
# Then T027 integrates all into Dashboard.tsx
```

---

## Implementation Strategy

### MVP First (US1 Dashboard only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: US1 Dashboard
4. **STOP and VALIDATE**: Load `http://localhost:8800/`, verify service status, logs, external domains
5. **MVP delivered**: Admin server now serves React-based Dashboard

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (SPA scaffold, backend updated)
2. Phase 3 (US1) → Dashboard fully functional
3. Phase 4 (US2) → Apps management fully functional
4. Phase 5 (US3) → App Detail fully functional
5. Phase 6 → Navigation validation + legacy cleanup

### Single-developer Sequential Order

```
T001–T005 → T006 → T007–T012 (parallel) → T013 → T014–T017 (parallel) → T018 → T019
→ T020 → T021–T026 (parallel) → T027
→ T028 → T029–T030–T033 (parallel) → T031 → T032 → T034
→ T035 → T036–T038 (parallel) → T039
→ T040–T042 → T043 → T044–T046 (parallel) → T047–T052
```

---

## Notes

- `[P]` tasks write to different files — no merge conflicts when running in parallel
- `[Story]` label maps each task to its user story for traceability
- CSS replication (global.css + CSS Modules) must match current design — no redesign
- Commit after each phase checkpoint for rollback safety
- Do NOT delete `status-page.ts` / `apps-page.ts` until Phase 6 — admin server needs them until static serving is working
- `<Toast>` component (T030) is required by US2 but also used by US1 deploy-guard — implement in US2 phase and import into US1 components
- If `GET /api/apps/:name/logs` SSE endpoint is currently unauthenticated, skip T012
