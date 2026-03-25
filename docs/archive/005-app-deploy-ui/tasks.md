# Tasks: App Deploy UI

**Input**: Design documents from `/specs/005-app-deploy-ui/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/admin-api.md ✅

**Tests**: No test tasks generated — not requested in spec.

**Organization**: Tasks grouped by user story. All implementation is in `packages/cli/src/services/apps-page.ts` (full rewrite) plus minimal backend additions.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Read & Understand)

**Purpose**: Read current implementation before rewriting to avoid regressions.

- [X] T001 Read full `packages/cli/src/services/apps-page.ts` — map all exported functions, current fetch endpoints, and HTML structure before rewriting
- [X] T002 [P] Read `public/demo/brewnet-app-deploy.html` CSS section — extract all CSS variables (`:root`), button classes, badge classes, and color tokens to copy verbatim
- [X] T003 [P] Read `packages/cli/src/services/app-manager.ts` — confirm `CreateAppOptions`, `AppEntry`, `AppJob`, `AppJobStep` type shapes match `data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base HTML shell, CSS, and two new backend routes. Nothing else compiles without this.

**⚠️ CRITICAL**: All user story phases depend on this foundation.

- [X] T004 In `packages/cli/src/services/apps-page.ts`: Replace the full file with a new `generateAppsPageHtml()` function that returns a minimal HTML shell — `<!DOCTYPE html>`, `<head>` with CSS variables + reset + font imports from `brewnet-app-deploy.html`, empty `<body>` with `<div id="shell"><div id="main"></div></div>`
- [X] T005 [P] In `packages/cli/src/services/apps-page.ts`: Add the full CSS block (copy verbatim from `brewnet-app-deploy.html` lines 8–205) — includes all CSS variables, button variants `.btn .bp .bg .bt .br .bgrn`, badge variants `.bdg .b-run .b-stop .b-build .b-idle`, modal styles `.modal .msm .mmd .mlg`, tab styles `.tabs .tab.active`, language chip styles `.lang-chip .lc-*`, card styles `.app-card`, topbar styles, stats styles
- [X] T006 [P] In `packages/cli/src/services/admin-server.ts`: Add `GET /api/apps/check-port?port=:N` route — calls `net.createServer().listen(port, '0.0.0.0')` to check availability, returns `{ port, available: boolean }`
- [X] T007 [P] In `packages/cli/src/services/admin-server.ts`: Add `POST /api/git/repos/:name/connect` route with `{ appName }` body — finds the AppEntry by name, sets `giteaRepoUrl` to the repo's clone URL, writes back to `~/.brewnet/apps.json`, returns `{ ok: true }`

**Checkpoint**: `generateAppsPageHtml()` returns valid HTML shell. Two new API routes respond correctly. `npm run build` passes.

---

## Phase 3: User Story 1 — App Dashboard at a Glance (Priority: P1) 🎯 MVP

**Goal**: Stats bar + app card list + status filter. User can open `/apps` and immediately see all registered apps with correct status badges and counts.

**Independent Test**: Start admin server with 3 mock apps (1 running, 1 stopped, 1 creating). Open `/apps`. Verify stats show TOTAL:3 RUNNING:1 STOPPED:1 BUILDING:1. Verify each card shows name, status badge, language chip, port, Gitea path, commit count, last action.

### Implementation for User Story 1

- [X] T008 [US1] In `generateAppsPageHtml()`: Add topbar HTML — breadcrumb `Home / App Deploy`, `↻ Refresh` ghost button (calls `refreshAll()`), `+ New App` amber button (calls `openModal('modal-new-app')`)
- [X] T009 [US1] In `generateAppsPageHtml()`: Add ebox (info box) HTML — description text + 4 tag pills: `Build = Docker 이미지 빌드`, `Deploy = Traefik 라우팅 포함 전체 배포`, `Cloudflare Tunnel 자동 연결`, `Gitea 전체 Repo 관리`
- [X] T010 [US1] In `generateAppsPageHtml()`: Add stats bar HTML — 4-column grid with ids `stat-total`, `stat-running`, `stat-stopped`, `stat-building`; labels TOTAL APPS / RUNNING / STOPPED / BUILDING with correct color classes
- [X] T011 [US1] In `generateAppsPageHtml()`: Add app list section HTML — section title `🚀 배포 앱` with `<span id="app-count">` badge, status filter `<select id="filter-state">` with options 전체/Running/Stopped/Building, `<div id="app-list">` container
- [X] T012 [US1] In `generateAppsPageHtml()`: Add inline JS `renderApps()` function — fetches `GET /api/apps`, maps `AppEntry.status` (creating→building, failed→stopped with error note), renders each app as `.app-card` HTML with: icon initials div, name + status badge, language chip (`.lang-chip.lc-{lang}`), framework text, port (🔌), Gitea repo path (📦 with link), commit count from `appGitInfo[name]?.commits ?? '—'` (📝), `appGitInfo[name]?.lastCommitAt` relative time or `createdAt` as fallback, domain link or `+ 도메인 연결` dotted button; when `apps.length === 0` renders a centered empty state: `<div class="empty-state">등록된 앱이 없습니다 — + New App으로 시작하세요</div>`
- [X] T012b [P] [US1] In `generateAppsPageHtml()`: Add inline JS `loadGitInfo(apps)` — for each app, fetches `GET /api/apps/:name/git` in parallel (`Promise.all`), stores results in module-level `appGitInfo` map keyed by app name; called inside `renderApps()` before rendering cards; on individual fetch failure silently sets `appGitInfo[name] = null` (no toast — git info is supplemental)
- [X] T013 [US1] In `generateAppsPageHtml()`: Add inline JS `updateStats()` — counts running/stopped/building from current app array, updates DOM text of the 4 stat elements
- [X] T014 [US1] In `generateAppsPageHtml()`: Add inline JS `filterApps(val)` — filters `apps` array by status, calls `renderApps()` with filtered subset; wire `<select>` `onchange` event
- [X] T015 [US1] In `generateAppsPageHtml()`: Add inline JS `refreshAll()` — calls `renderApps()` + `renderRepos()`, shows brief "새로고침..." toast
- [X] T016 [US1] In `generateAppsPageHtml()`: Add inline JS button enable/disable logic — `getButtonState(status)` returns `{ canBuild, canDeploy, canStart, canStop, canDelete }` per data-model.md matrix; used by `renderApps()` when generating each card's action buttons

**Checkpoint**: Open `/apps` — stats bar shows correct counts, app cards render with correct status badges, filter dropdown works, refresh re-fetches from API.

---

## Phase 4: User Story 5 — Build and Deploy an App (Priority: P1)

**Goal**: Build and Deploy buttons open a step-by-step progress modal with animated steps and live log output. After Deploy completes, the app status changes to `running`.

**Independent Test**: With a stopped app, click Deploy → progress modal opens → 6 steps animate pending→active→done sequentially → log output scrolls → close button appears → app status updates to running.

### Implementation for User Story 5

- [X] T017 [US5] In `generateAppsPageHtml()`: Add progress modal HTML — `<div id="modal-progress" class="modal">` with `.mmd` size: title area (dynamic), app name subtitle, steps list `<div id="progress-steps">`, log output `<pre id="progress-log" style="overflow-y:auto;height:160px">`, close button `<button id="btn-progress-close">` (hidden until complete)
- [X] T018 [US5] In `generateAppsPageHtml()`: Add inline JS `openProgressModal(type, appName)` — sets modal title to `🔨 빌드 진행 중...` or `🚀 배포 진행 중...`, resets step list and log, opens modal
- [X] T019 [US5] In `generateAppsPageHtml()`: Add inline JS `runBuild(appName)` — calls `POST /api/apps/:name/deploy` (per research.md finding 3), receives `{ jobId }`, stores `localStorage.setItem('brewnet_active_job_<appName>', jobId)`, calls `openProgressModal('build', appName)`, begins polling with `pollJob(jobId, 'build')`; Build type shows only the **first 4 steps** of the job response (spec US5: "Git pull → Dockerfile 파싱 → Docker 이미지 빌드 → 이미지 태그 등록")
- [X] T020 [US5] In `generateAppsPageHtml()`: Add inline JS `runDeploy(appName)` — calls `POST /api/apps/:name/deploy`, receives `{ jobId }`, stores jobId in localStorage, calls `openProgressModal('deploy', appName)`, begins polling with `pollJob(jobId, 'deploy')`; Deploy type shows **all 6 steps**
- [X] T021 [US5] In `generateAppsPageHtml()`: Add inline JS `pollJob(jobId, type)` — polls `GET /api/apps/jobs/:jobId` every 700ms; maps `AppJobStep.status` to `.pst.wait/.pst.active/.pst.done` classes; for Build type renders only `steps.slice(0, 4)`, for Deploy type renders all steps; appends `step.message` lines to `#progress-log` and scrolls to bottom; on job `done`: removes localStorage entry, shows close button, updates app status to `running` (for deploy type), calls `renderApps()`; on job `failed`: removes localStorage entry, shows error in red, shows close button
- [X] T021b [US5] In `generateAppsPageHtml()`: Add inline JS SSE log streaming — inside `pollJob()`, when job transitions to `running` state, opens `new EventSource('/api/apps/<name>/logs')`; appends each `data.line` to `#progress-log` and auto-scrolls; closes EventSource on job `done` or `failed`; handles `EventSource` error by appending `[로그 스트림 종료]` to log
- [X] T022 [US5] In `generateAppsPageHtml()`: Add inline JS `toggleApp(appName, action)` — action is `'start'` or `'stop'`; calls `POST /api/apps/:name/start` or `POST /api/apps/:name/stop`; on success calls `renderApps()`

**Checkpoint**: Click Build on stopped app → progress modal animates **4 steps** → SSE log lines appear → close button appears → app status unchanged. Click Deploy → same flow with **6 steps** → after completion app card shows "● RUNNING".

---

## Phase 5: User Story 2, 3, 4 — New App Modal (Priority: P1/P2)

**Goal**: New App modal with 3 tabs (Boilerplate / Git Clone / New Project). Each tab has correct fields, auto-fill, and port conflict warning. Submission creates the app and starts polling.

**Independent Test**: Open New App modal → Tab 0: select Go/Gin → verify port 8080 auto-fills → enter name "test-api" → submit → app appears in list as building → 2.5s later becomes stopped.

### Implementation for User Story 2, 3, 4

- [X] T023 [US2] In `generateAppsPageHtml()`: Add New App modal HTML `<div id="modal-new-app" class="modal">` with `.mlg` size, 3-tab header (보일러플레이트/Git Clone/New Project), tab panels `#tab-bp`, `#tab-git`, `#tab-proj`, shared app name input, shared port input with conflict warning span, submit button, cancel button
- [X] T024 [US2] In `generateAppsPageHtml()`: Add inline JS `renderBpGrid()` — on modal open, fetches `GET /api/apps/boilerplates` to get the actual installed stacks (not a hardcoded array); renders 3-column card grid; each card shows language icon, framework name, default port; `selectBp(id)` marks card `.sel`, auto-fills port from stack metadata, updates preview line `git.local/admin/<appName>`; on fetch failure, falls back to a hardcoded 12-entry `BOILERPLATES` constant and shows a `⚠ 설치된 스택 정보를 불러오지 못해 기본값을 표시합니다` notice
- [X] T025 [US3] In `generateAppsPageHtml()`: Add inline JS `autoFillFromUrl(url)` — extracts last path segment, strips `.git`, normalizes to lowercase-hyphen, sets app name input value; attach to Git URL field `oninput`
- [X] T026 [US4] In `generateAppsPageHtml()`: Add inline JS `LANG_DATA` object (7 languages with framework arrays) and `renderLangGrid()` — 7-card language grid; `selectLang(lang)` shows framework chip row; `selectFw(el, fw)` marks `.sel`, updates live preview showing Gitea path + `0.0.0.0:<port>`
- [X] T027 [US2] In `generateAppsPageHtml()`: Add inline JS `sanitizeAppName(el)` — replaces uppercase and non-hyphen chars in real time; attach to all app name inputs `oninput`
- [X] T028 [US2] In `generateAppsPageHtml()`: Add inline JS `checkPortConflict(port)` — calls `GET /api/apps/check-port?port=<N>`; if `available: false`: (1) shows warning span `⚠ 포트 ${port}는 이미 사용 중입니다`, (2) sequentially checks ports `port+1`, `port+2`, ... up to `port+10` until finding an available one, then appends `→ ${nextPort} 사용 가능` to the warning with a `[사용]` button that fills the port field with `nextPort`; attach to port input `onblur`
- [X] T029 [US2] In `generateAppsPageHtml()`: Add inline JS `switchTab(group, idx)` — toggles `.tab.active` class and shows/hides panel divs by index; works for both `newapp` and `domain` tab groups
- [X] T030 [US2] In `generateAppsPageHtml()`: Add inline JS `submitNewApp()` — reads active tab index, builds correct `CreateAppOptions` body (mode + appName + port + stackId/gitUrl/language/frameworkId), calls `POST /api/apps/create`, on `202` response: closes modal, adds optimistic app entry to list with status `building`, starts `pollJob(jobId, 'create')` which transitions to `stopped` on completion

**Checkpoint**: All 3 tabs render correctly. Port conflict warning appears when entering a used port. Submitting creates app via API and shows building state.

---

## Phase 6: User Story 6 — Domain Connection Modal (Priority: P2)

**Goal**: Domain modal with 3 tabs (Cloudflare auto / existing manual / subdomain). Live URL preview updates as user types. Successful connection updates app card with domain link.

**Independent Test**: Open domain modal for an app → Tab 0: enter subdomain "myapp" + domain "example.com" → verify preview shows "myapp.example.com" → Tab 2: select base domain + type prefix → verify combined preview updates.

### Implementation for User Story 6

- [X] T031 [US6] In `generateAppsPageHtml()`: Add domain modal HTML `<div id="modal-domain" class="modal">` with `.mlg` size, 3-tab header (새 Cloudflare 도메인/기존 도메인 연결/서브도메인 추가), app name in header `<span id="domain-modal-app">`, tab panels for each mode, connect button, cancel button
- [X] T032 [US6] In `generateAppsPageHtml()`: Add Tab 0 HTML — Cloudflare API Token field (type=password), Domain input, Subdomain input (optional), preview line `<span id="cf-preview">`, 4-step progress list (API 인증/Tunnel Ingress/DNS CNAME/Traefik 라우팅)
- [X] T033 [US6] In `generateAppsPageHtml()`: Add Tab 1 HTML — subdomain full input, DNS guide table (Type CNAME / Name / Target with copy button), Cloudflare proxied tip, propagation note, confirm input + verify button
- [X] T034 [US6] In `generateAppsPageHtml()`: Add Tab 2 HTML — base domain `<select id="base-domain-select">` populated from `GET /api/domain/list`, subdomain prefix input with combined display `.prefix + .base`, preview line
- [X] T035 [US6] In `generateAppsPageHtml()`: Add inline JS `openDomainModal(appName)` — stores `activeDomainApp`, sets `#domain-modal-app` text, populates base domain dropdown from `/api/domain/list`, opens modal
- [X] T036 [US6] In `generateAppsPageHtml()`: Add inline JS preview update functions — `updateCfPreview()` (sub + domain → full URL), `updateSubPreview()` (prefix + base → full URL); attach to respective inputs `oninput`
- [X] T037 [US6] In `generateAppsPageHtml()`: Add inline JS `submitDomain()` — reads active domain tab, builds correct request body, calls `POST /api/domain/connect`; on success: updates app entry `domain` field, closes modal, calls `renderApps()`

**Checkpoint**: Domain modal opens for app. All 3 tabs render. Preview updates in real time. Submitting Tab 0 calls POST /api/domain/connect. App card domain link appears after success.

---

## Phase 7: User Story 7 — Delete App (Priority: P2)

**Goal**: Delete modal requires name confirmation for stopped apps. Blocked for running/building apps. Deletion removes app from list.

**Independent Test**: Click delete on running app → confirm button disabled + red warning shown. Click delete on stopped app → type wrong name → button stays disabled → type correct name → button activates → confirm → app removed.

### Implementation for User Story 7

- [X] T038 [US7] In `generateAppsPageHtml()`: Add delete modal HTML `<div id="modal-delete" class="modal">` with `.msm` size, app name heading, conditional red warning div `#delete-running-warning` (visible only for running apps), amber warning `#delete-data-warning` (Gitea 레포 연결 해제 안내), name confirm `<input id="delete-confirm-input">`, delete button `id="btn-delete-confirm"` (disabled by default), cancel button
- [X] T039 [US7] In `generateAppsPageHtml()`: Add inline JS `openDeleteModal(appName)` — stores `pendingDeleteName`, sets modal app name display, shows/hides running warning based on app status, sets `btn-delete-confirm.disabled = (status === 'running' || status === 'building')`, clears confirm input, opens modal
- [X] T040 [US7] In `generateAppsPageHtml()`: Add inline JS `checkDeleteConfirm()` — compares `#delete-confirm-input` value with `pendingDeleteName`; enables `#btn-delete-confirm` only when they match AND app is not running/building; attach to input `oninput`
- [X] T041 [US7] In `generateAppsPageHtml()`: Add inline JS `confirmDelete()` — calls `DELETE /api/apps/:name`; on success: removes app from local array, removes Gitea repo `appName` link (set to null in repos array), calls `renderApps()` + `renderRepos()` + `updateStats()`, closes modal

**Checkpoint**: Delete button on running app is disabled. Typing wrong name keeps button disabled. Typing correct name activates button. Confirming calls DELETE API and removes card.

---

## Phase 8: User Story 8 — Gitea Repository Table (Priority: P3)

**Goal**: Gitea repo table at bottom of page shows all repos with App Deploy connection badge. Unconnected repos have "+ 연결" button that actually connects the repo.

**Independent Test**: Page loads with Gitea running → repo table renders with all repos → connected repos show green badge with app name → unconnected repos show "미연결" badge → click "+ 연결" on unconnected repo → connection registered → badge updates.

### Implementation for User Story 8

- [X] T042 [US8] In `generateAppsPageHtml()`: Add Gitea repos section HTML — section header `📦 Gitea Repositories` with count badge, `Git Server에서 관리 →` link button, `<table id="repo-table">` with columns: Repository / 언어 / App Deploy / 접근 / 최근 업데이트 / 액션
- [X] T043 [US8] In `generateAppsPageHtml()`: Add inline JS `renderRepos()` — fetches `GET /api/git/repos`, renders each repo as a table row: repo name + `.b-idle` badge for private flag + star count; language chip; App Deploy badge (`.b-run` with app name if `appName !== null`, else `.b-idle` `미연결`); `git.local/admin/<name> ↗` access link; relative time since `updatedAt`; action column: `앱 보기` link (if connected) or `+ 연결` button (if not)
- [X] T044 [US8] In `generateAppsPageHtml()`: Add inline JS `connectRepoToApp(repoName)` — clicking "+ 연결" in a repo row toggles an inline input row below that row (not `window.prompt()`): renders `<input placeholder="앱 이름 입력...">` + `<button>연결</button>` + `<button>취소</button>` inline in the table; on confirm calls `POST /api/git/repos/:name/connect` with `{ appName }`; on success: removes inline input row, updates repo `appName` in local array, calls `renderRepos()`; on error: shows toast with error message; cancel removes the inline input row

**Checkpoint**: Repo table renders all Gitea repos. Connected repos show green badge. Click "+ 연결" → prompt for app name → API call → badge updates.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Wire up helpers, error handling, toast system, and verify all API calls use correct endpoints.

- [X] T045 In `generateAppsPageHtml()`: Add toast notification system — `<div id="toast">` fixed positioned, `showToast(msg)` function that fades in/out with 2.6s timeout, used by all API error paths and success confirmations
- [X] T046 [P] In `generateAppsPageHtml()`: Add modal utility functions — `openModal(id)`, `closeModal(id)`, `closeOnOverlay(e, id)`; wire overlay click handlers on all 4 modals
- [X] T047 [P] In `generateAppsPageHtml()`: Add window load handler — calls `renderApps()` + `renderRepos()` on page load; ensures boilerplate grid, language grid, and base domain dropdown are populated; after `renderApps()` resolves, if any app has `status === 'creating'`, starts a 3-second interval that re-calls `renderApps()` until no `creating`-status apps remain (auto-polling for in-progress jobs on reload); also restores any jobId stored in `localStorage.getItem('brewnet_active_job_<appName>')` and resumes `pollJob()` if the job is still running
- [X] T048 In `generateAppsPageHtml()`: Audit all fetch calls — verify endpoints match `contracts/admin-api.md` (especially `GET /api/git/repos` not `/api/gitea/repos`); add error handling to every fetch: map known HTTP status patterns to BN error codes (503/Docker → BN001, 404 → BN008, 409 conflict → BN002) and show `showToast('BN00X: ' + err.message + ' — 해결 방법: ...')` per Constitution §III; never use `.catch(() => {})`
- [X] T049 [P] In `generateAppsPageHtml()`: Add relative time helper `timeAgo(isoString)` — converts ISO timestamps to "방금 전 / N분 전 / N시간 전 / N일 전" format; used in app cards and repo table
- [X] T050 Run `npm run build` and `npm test` — fix any TypeScript errors in `apps-page.ts` and `admin-server.ts`; ensure no `any` types remain

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — read-only, start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 understanding — BLOCKS all user stories
- **US1 Dashboard (Phase 3)**: Depends on Phase 2 — renders app list
- **US5 Build/Deploy (Phase 4)**: Depends on Phase 3 — actions on app cards
- **US2/3/4 New App (Phase 5)**: Depends on Phase 2 — can parallel with Phase 3/4
- **US6 Domain (Phase 6)**: Depends on Phase 3 (needs app cards) — can parallel with Phase 4/5
- **US7 Delete (Phase 7)**: Depends on Phase 3 — can parallel with Phase 4/5/6
- **US8 Gitea Table (Phase 8)**: Depends on Phase 2 — can parallel with Phase 3+
- **Polish (Phase 9)**: Depends on all prior phases

### User Story Dependencies

```
Phase 2 (Foundation)
  ├── Phase 3 (US1 Dashboard) ← required for Phase 4, 6, 7
  │     ├── Phase 4 (US5 Build/Deploy)
  │     ├── Phase 6 (US6 Domain)
  │     └── Phase 7 (US7 Delete)
  ├── Phase 5 (US2/3/4 New App) ← independent of Phase 3
  └── Phase 8 (US8 Gitea Table) ← independent of Phase 3
```

### Parallel Opportunities

- T002, T003 can run in parallel with T001
- T005, T006, T007 can run in parallel after T004
- T008–T016 (US1) and T023–T030 (US2/3/4) and T042–T044 (US8) can run in parallel after Phase 2

---

## Parallel Example: Phase 2 Foundation

```
Parallel: T005 (CSS block), T006 (check-port route), T007 (connect route)
Sequential: T004 (HTML shell) must complete before T005
```

## Parallel Example: After Foundation Complete

```
Stream A: T008→T009→T010→T011→T012→T013→T014→T015→T016 (US1 Dashboard)
Stream B: T023→T024→T025→T026→T027→T028→T029→T030 (New App modal)
Stream C: T042→T043→T044 (Gitea table)
```

---

## Implementation Strategy

### MVP First (US1 + US5 Only — P1 Stories)

1. Complete Phase 1: Setup (read files)
2. Complete Phase 2: Foundation (HTML shell + CSS + 2 new routes)
3. Complete Phase 3: US1 Dashboard (app cards + stats + filter)
4. Complete Phase 4: US5 Build/Deploy (progress modal + polling)
5. **STOP and VALIDATE**: Open `/apps`, verify all app cards render, click Deploy, verify progress modal animates
6. All P1 user stories delivered

### Full Delivery (All Stories)

7. Phase 5: New App modal (US2/3/4) — complete create flow
8. Phase 6: Domain modal (US6)
9. Phase 7: Delete modal (US7)
10. Phase 8: Gitea table (US8)
11. Phase 9: Polish

### Commit Points

- After Phase 2: `feat(apps-page): add HTML shell and CSS foundation`
- After Phase 3+4: `feat(apps-page): app dashboard with build/deploy progress modal`
- After Phase 5: `feat(apps-page): new app modal with 3 creation modes`
- After Phase 6+7: `feat(apps-page): domain connection and delete modals`
- After Phase 8+9: `feat(apps-page): gitea repo table and polish`

---

## Notes

- All implementation is in `packages/cli/src/services/apps-page.ts` as one large `generateAppsPageHtml()` function (this is the established pattern in this project)
- CSS is copied verbatim from `public/demo/brewnet-app-deploy.html` — do NOT rewrite it
- `GET /api/git/repos` is the correct endpoint (NOT `/api/gitea/repos`)
- Build button maps to same `POST /api/apps/:name/deploy` as Deploy (per research.md finding 3)
- `AppEntry.status = 'creating'` must display as `building` in UI
- Never use `.catch(() => {})` — always log to toast at minimum (project rule)
