# Feature Specification: Admin UI React Migration

**Feature Branch**: `001-admin-react-migration`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "admin 페이지 react 방식으로 교체하는데 CLI랑은 관계없지? react 도입을 고려해서 작업할 때 기존 dashboard, apps, domain, new app 기능이 변형되지 않게 (에러가 나지 않도록) 수정하려면 어떻게 해야 할지 분석후 구현계획을 작성해"

---

## Background & Scope

### What is being replaced

The current brewnet admin interface (`admin-server.ts`, `apps-page.ts`, `status-page.ts`) generates all HTML, CSS, and JavaScript via TypeScript template literals at runtime. Every page is a ~1,000–2,000 line string embedded in source code. This approach makes UI iteration slow and fragile.

**This migration replaces only the UI rendering layer.** The REST API endpoints (30+) in `admin-server.ts` are **unchanged and stay in place**. The CLI package (`packages/cli`) commands, wizard steps, Docker/compose generation — **none of that is touched**.

### CLI is NOT affected

The CLI (`brewnet init`, `brewnet deploy`, etc.) is a completely separate code path. The admin server is a separate HTTP server started by `brewnet admin`. React lives in a new `packages/admin-ui` package that is built to static files and served by the existing admin HTTP server. Zero changes to CLI command logic.

### Pages to migrate (3 pages)

| Current Route | Description |
|---|---|
| `GET /` | Service status dashboard, logs tab, external domains section |
| `GET /apps` | App list, create app modal, Settings tab (Cloudflare credentials) |
| `GET /apps/:name` | App detail: Overview, Deployment, Logs (SSE), Domain tabs |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dashboard remains fully functional after migration (Priority: P1)

An admin opens `http://localhost:8800/` and sees the same dashboard as before: service cards with status indicators, the logs tab with filtering, and the external domains section for tunnel-connected apps.

**Why this priority**: Dashboard is the landing page; if it breaks, nothing else matters.

**Independent Test**: Load `/` and verify service cards render + log filtering and status polling work.

**Acceptance Scenarios**:

1. **Given** the admin server is running, **When** a user navigates to `http://localhost:8800/`, **Then** the dashboard loads and displays all services with their current status within 2 seconds.
2. **Given** the dashboard is open, **When** a user clicks the Logs tab, **Then** log entries appear and source/level filtering works correctly.
3. **Given** Quick Tunnel is active, **When** the dashboard loads, **Then** the Quick Tunnel URL is shown in the External Domains section.

---

### User Story 2 — Apps list and Create App work without regression (Priority: P1)

An admin opens `/apps`, sees deployed apps with status (running/stopped/building), can start/stop/delete apps, and can create a new app via the modal with progress polling.

**Why this priority**: App management is the core workflow for brewnet's app-deploy feature.

**Independent Test**: Load `/apps`, open the create-app modal, start the job, and confirm progress polling completes successfully.

**Acceptance Scenarios**:

1. **Given** apps exist, **When** the apps page loads, **Then** each app's name, status, last-deployed time, and action buttons are visible.
2. **Given** the apps page is open, **When** a user clicks "Create New App", **Then** the creation modal opens with language/framework options and a progress indicator during job execution.
3. **Given** an app has never been deployed, **When** a user clicks Start, **Then** a toast warning guides them to Deploy first (no silent failure, no navigation).
4. **Given** an app is running, **When** a user clicks Stop, **Then** the app stops and the status updates within 3 seconds.
5. **Given** the Settings tab is open, **When** a user fills in Cloudflare credentials and saves, **Then** the credentials are persisted and a success message appears.

---

### User Story 3 — App Detail page tabs all function correctly (Priority: P2)

An admin clicks into an app and navigates the four tabs: Overview (status and endpoints), Deployment (git branch, deploy history, manual deploy), Logs (live streaming), and Domain (connect/disconnect).

**Why this priority**: The detail page is used during active deploy cycles; regression here blocks the core dev workflow.

**Independent Test**: Navigate to `/apps/:name` and exercise each tab end-to-end.

**Acceptance Scenarios**:

1. **Given** an app detail page is open, **When** the user clicks the Deployment tab, **Then** deploy history loads and the "Deploy Now" button triggers a deploy job with a progress indicator.
2. **Given** an app detail page is open, **When** the user clicks the Logs tab, **Then** live log output streams in real time.
3. **Given** Cloudflare credentials are configured, **When** a user opens the Domain tab and connects a subdomain, **Then** the connection succeeds and the hostname appears in the dashboard External Domains section.

---

### User Story 4 — Navigation and routing work without full page reloads (Priority: P1)

All inter-page links work: clicking an app name navigates to its detail page, back button returns to apps list, header nav links switch between Dashboard and Apps.

**Why this priority**: Broken routing causes perceived total failure.

**Independent Test**: Navigate from Dashboard → Apps → App Detail → back → Apps, verifying no full-page reload and no blank screen.

**Acceptance Scenarios**:

1. **Given** the apps list is open, **When** a user clicks an app name, **Then** the browser navigates to `/apps/:name` without a full page reload and without a blank screen.
2. **Given** the app detail page is open, **When** the user presses the browser back button, **Then** the apps list is restored.
3. **Given** a user is on any page, **When** they refresh the browser, **Then** the correct page loads (no 404 from the admin server).

---

### Edge Cases

- What happens when Quick Tunnel has not yet started? → Dashboard shows tunnel status as "inactive", no crash or error toast.
- How does the React app handle `/api/git/repos` returning 502 (Gitea unreachable)? → Silent fallback to empty list, no error toast (same as current BN502 fix).
- What happens when `/api/apps/:name` returns 404 (app deleted in another session)? → App detail shows a "not found" message, does not crash.
- What if the React bundle fails to serve (assets missing)? → Admin server must not have external CDN dependencies; all assets bundled locally.
- How does the SSE log stream behave when the connection drops? → Auto-reconnect via EventSource default retry behavior, with a "reconnecting..." indicator in the UI.
- What if `BOILERPLATE_STACKS` or `DOMAIN_CONNECTIONS` are empty? → Pages render correctly with empty states (no crash on empty arrays).

---

## Clarifications

### Session 2026-03-18

- Q: `SERVICE_DETAIL_MAP` 등 현재 HTML에 임베드된 대형 정적 데이터의 노출 방식은? → A: 모든 동적 데이터를 API 엔드포인트로 완전 이전 (신규 엔드포인트 `/api/services/catalog` 포함)
- Q: React SPA에서 어드민 비밀번호(`X-Admin-Password`) 유지 방식은? → A: 페이지 로드 시 비밀번호 입력 모달 → `sessionStorage` 저장 (탭 닫으면 자동 삭제)
- Q: 마이그레이션 완료 후 기존 template literal HTML 함수(`generateDashboardHtml`, `generateAppsPageHtml`, `generateAppDetailHtml`) 처리 방침은? → A: 마이그레이션 완료 + 검증 후 전체 삭제 (dead code 제거)
- Q: 서비스/앱 상태 자동 갱신(폴링) 전략은? → A: 현재와 동일한 setInterval 폴링 방식 유지 (주기·방식 변경 없음)
- Q: React 마이그레이션 시 기존 CSS/비주얼 처리 방침은? → A: 기존 CSS 스타일 최대한 그대로 복제 — 비주얼 동등성 우선, 리디자인 없음

---

## Requirements *(mandatory)*

### Functional Requirements

**Migration scope:**
- **FR-001**: The admin UI MUST be served as a single-page application from the same port (8800) as the REST API, maintaining all current routes (`/`, `/apps`, `/apps/:name`).
- **FR-002**: The admin HTTP server MUST serve the compiled React build's static files from a local directory with no external CDN dependencies at runtime. The React UI MUST replicate the existing visual design (colors, layout, component styles) with no redesign.
- **FR-003**: All existing REST API endpoints MUST remain unchanged in method, path, request/response format.
- **FR-004**: The CLI package commands, wizard steps, and service modules MUST NOT be modified except for the following changes in `admin-server.ts`: (a) adding static file serving for the React SPA build, (b) adding `GET /api/config` and `GET /api/services/catalog` endpoints to expose data previously embedded in HTML, (c) adding `?token` query string auth fallback to the SSE log stream handler, and (d) removing legacy HTML generation functions (`generateDashboardHtml`, `buildBoilerplateSectionHtml`, `escHtml`, `refreshBoilerplateMeta`) and their associated source files (`apps-page.ts`, `status-page.ts`). Unit tests for `admin-server.ts` MAY be updated to reflect the new SPA fallback behavior.
- **FR-005**: The admin server MUST serve `index.html` for all non-API, non-asset GET requests so SPA routing works on browser refresh.

**Feature parity:**
- **FR-006**: Dashboard MUST display all services with status, logs tab with source/level filtering, and the External Domains section. Automatic status refresh MUST use the same setInterval polling strategy and intervals as the current implementation (no polling frequency or mechanism changes).
- **FR-007**: Apps page MUST support: list apps, start/stop, deploy, delete, create new app with progress polling, and the Settings tab with Cloudflare credentials form.
- **FR-008**: App Detail MUST support all four tabs: Overview, Deployment (history + manual deploy), Logs (SSE streaming), Domain (connect/disconnect).
- **FR-009**: The deploy-before-start guard MUST be preserved: starting an undeployed app shows the warning toast and blocks the action.
- **FR-010**: The BN502 suppression MUST be preserved: the repos-loading call MUST use a silent fallback when Gitea is unreachable (no error toast on page load).

**Data exposure:**
- **FR-011**: All data currently embedded as JS variables in HTML (`BOILERPLATE_STACKS`, `DOMAIN_CONNECTIONS`, `SERVICE_DETAIL_MAP`) MUST be fully moved to dedicated API endpoints so the React app can fetch them on page mount. A new `GET /api/services/catalog` endpoint MUST be added for `SERVICE_DETAIL_MAP`. No data embedding in the initial HTML payload is permitted.

**Build & workspace:**
- **FR-012**: A new `packages/admin-ui` workspace package MUST contain the React application with its own build configuration.
- **FR-013**: The root `npm run build` MUST build both the CLI package and the admin-ui package (admin-ui first, then CLI, or independently in parallel).
- **FR-015**: Once the React migration is complete and all acceptance criteria verified, the old template literal HTML generator functions (`generateDashboardHtml`, `generateAppsPageHtml`, `generateAppDetailHtml`) and their associated source files (`status-page.ts`, `apps-page.ts`) MUST be deleted. No legacy fallback flag is required.

**Auth forwarding:**
- **FR-014**: On first page load, the React app MUST present a password input modal. The entered admin password MUST be stored in `sessionStorage` (cleared when the tab is closed) and automatically attached as the `X-Admin-Password` header on all protected API calls. The password is never stored in `localStorage` or sent to any endpoint other than the local admin server.

### Key Entities

- **AdminServer** (`admin-server.ts`): The Node.js HTTP server on port 8800. Handles REST API (`/api/*`) and static file serving. Not replaced — extended to serve static files from `packages/admin-ui/dist/`.
- **Admin UI Package** (`packages/admin-ui`): New React SPA package. No server-side logic; communicates only via REST API.
- **AppEntry**: Represents a deployed app (name, status, port, lastDeployedAt). Fetched by React via `GET /api/apps`.
- **DashboardConfig data**: `BOILERPLATE_STACKS`, `DOMAIN_CONNECTIONS` — currently embedded in HTML, must be accessible via API for React to fetch on mount.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three pages (`/`, `/apps`, `/apps/:name`) load and display correct data within 2 seconds on a local connection.
- **SC-002**: Zero functional regressions: every existing user action (start/stop app, deploy, create app, connect domain, save Cloudflare credentials) works identically to the current implementation.
- **SC-003**: `npm run build` completes without errors and produces a working admin UI bundle served by the admin server.
- **SC-004**: No spurious error toasts appear on page load when Gitea is unreachable.
- **SC-005**: The React bundle has zero runtime CDN dependencies — all assets served from localhost:8800.
- **SC-006**: `npm test` continues to pass. CLI unit tests for `admin-server.ts` MAY be updated to reflect the SPA fallback behavior change (replacing HTML content assertions with SPA fallback assertions), but all tests must remain green.
- **SC-007**: Browser refresh on any route (`/`, `/apps`, `/apps/:name`) loads the correct page with no 404.

---

## Assumptions

1. **React + Vite** will be used for the SPA build — standard pnpm-compatible choice, no SSR needed.
2. **No new auth layer** — admin password is collected via modal on first load and stored in `sessionStorage`.
3. **`packages/dashboard/`** (described in CLAUDE.md as a future Pro/Next.js feature) is out of scope for this migration.
4. **`SERVICE_DETAIL_MAP`** is moved to a new `GET /api/services/catalog` endpoint (same data, now fetchable). No HTML embedding.
5. **Boilerplate stacks endpoint** (`GET /api/apps/boilerplates`) already exists and can be reused for the React dashboard.
6. **Visual design**: Existing CSS styles (dark theme, card layout, toast styles, color palette) are replicated as-is in React. No redesign, no new design system. Visual changes are out of scope for this migration.

---

## AppDetailModal usePolling interval=0 무한 루프 — 발견일: 2026-03-19

### 증상
AppDetailModal을 열면 브라우저 콘솔에 즉각적으로 수백~수천 개의 `net::ERR_INSUFFICIENT_RESOURCES` 에러가 발생. `/api/apps/:name/git`과 `/api/apps/:name/deploy/settings`에 대한 fetch가 무한 루프처럼 반복 요청됨.

### 근본 원인 (Root Cause)
`packages/admin-ui/src/components/AppDetailModal.tsx`의 `usePolling` 훅 호출 시 interval을 `0`으로 전달:

```typescript
usePolling(`/api/apps/${appName}/git`, 0, silentFetch, ...);
usePolling(`/api/apps/${appName}/deploy/settings`, 0, silentFetch, ...);
```

`usePolling` 내부에서 `setInterval(poll, 0)`이 실행되면 브라우저 최소 타이머 간격(~4ms)으로 동작 → 초당 250회 이상 fetch 요청 → 브라우저 네트워크 자원 고갈.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `packages/admin-ui/src/components/AppDetailModal.tsx:57` | git polling interval `0` → `30000` |
| `packages/admin-ui/src/components/AppDetailModal.tsx:63` | settings polling interval `0` → `30000` |

### 재발 방지 체크리스트
- [ ] `usePolling` 훅에 interval=0 guard 추가 고려: 0이면 최초 1회만 fetch하고 interval 없이 종료
- [ ] 새 컴포넌트에서 `usePolling` 사용 시 반드시 양수 interval(최소 1000ms) 명시
- [ ] git/settings처럼 자주 변경되지 않는 데이터는 30000ms(30초) 이상 interval 사용

### 관련 코드 (핵심 부분만)
```typescript
// Before (버그)
usePolling(`/api/apps/${appName}/git`, 0, silentFetch, ...);

// After
usePolling(`/api/apps/${appName}/git`, 30000, silentFetch, ...);
```

---

## Admin Server `/api/settings/cloudflare` 500 에러 — 발견일: 2026-03-19

### 증상
Domain Setting 모달 오픈 시 "Failed to load: 500" 메시지 표시. GET `/api/settings/cloudflare`가 500을 반환하여 Cloudflare 설정 값 로드 불가.

### 근본 원인 (Root Cause)
`packages/cli/src/services/admin-server.ts`의 `handleSettingsCloudflareGet` 함수에서 `mask()` 헬퍼가 `string` 타입만 기대하지만, `selections.json`에 cloudflare 필드가 없으면 `undefined`가 전달되어 `s.length` 접근 시 TypeError 발생:

```typescript
// 버그: s가 undefined이면 TypeError
const mask = (s: string) => s.length > 6 ? ... : s ? '***set***' : 'not set';
```

`CloudflareConfig` 타입에는 `accountId: string`이 required로 정의되어 있으나, 직접 작성한 `selections.json`이나 incomplete wizard state에서 필드가 누락될 수 있음.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/admin-server.ts:1844` | `mask(s: string)` → `mask(s: string \| undefined)`, undefined guard 추가 |

### 재발 방지 체크리스트
- [ ] WizardState 기반 핸들러는 모든 중첩 필드를 optional로 처리
- [ ] `mask()` 같은 포맷팅 헬퍼는 항상 falsy 입력을 처리하도록 작성
- [ ] `selections.json` 생성 시 `createDefaultWizardState()` 사용 또는 모든 required 필드 포함 확인

### 관련 코드 (핵심 부분만)
```typescript
// Before (버그)
const mask = (s: string) => s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : s ? '***set***' : 'not set';

// After
const mask = (s: string | undefined) => !s ? 'not set' : s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : '***set***';
```

---

## getActiveServiceRoutes undefined → /api/domain/apps 500 — 발견일: 2026-03-19

### 증상
Admin UI에서 `/api/domain/apps` 호출 시 HTTP 500 오류 반환:
```json
{"success":false,"error":"TypeError: Cannot read properties of undefined (reading 'enabled')"}
```
Domain Settings 모달에서 도메인 연결 가능한 앱 목록을 불러오지 못함.

### 근본 원인 (Root Cause)
`packages/cli/src/services/cloudflare-client.ts:544`의 `getActiveServiceRoutes()` 함수에서 `state.servers.fileServer`, `state.servers.media`, `state.servers.dbServer`, `state.servers.fileBrowser` 접근 시 optional chaining 미적용.

`selections.json`에 해당 서버가 설정되지 않은 경우 (Git 서버만 활성화) 이 필드들은 `undefined`이고, `.enabled` 접근 시 TypeError 발생.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/cloudflare-client.ts:544-568` | `state.servers.fileServer.enabled` → `state.servers.fileServer?.enabled` 등 optional chaining 적용 |

### 재발 방지 체크리스트
- [ ] `WizardState.servers.*` 접근 시 반드시 optional chaining (`?.`) 사용
- [ ] `selections.json`에 일부 서버만 설정된 미니멀 환경에서도 모든 API 핸들러가 동작하는지 확인
- [ ] 새 서버 타입을 `getActiveServiceRoutes()`에 추가할 때 항상 `?.enabled` 사용

### 관련 코드 (핵심 부분만)
```typescript
// Before (버그 — cloudflare-client.ts)
if (state.servers.fileServer.enabled) { ... }
if (state.servers.media.enabled && state.servers.media.services.includes('jellyfin')) { ... }

// After
if (state.servers.fileServer?.enabled) { ... }
if (state.servers.media?.enabled && state.servers.media.services?.includes('jellyfin')) { ... }
```

---

## test-cycle.sh SPA/SSE/basePath 검증 오류 — 발견일: 2026-03-19

### 증상
1. **Phase 4 JS 문법 검사 실패**: React SPA 도입 후 inline `<script>` 없어 `node --check /dev/stdin`이 항상 "FAIL" 반환
2. **Phase 6 nodejs-nextjs-full backend 404**: Next.js basePath `/apps/{stackId}` 때문에 `/health` 직접 접근 시 404
3. **Phase 8.1 Local ≠ External 오탐**: health endpoint 응답의 timestamp 필드가 요청마다 달라 전체 body 비교 실패
4. **Logs SSE Content-Type 오탐**: `grep -i 'content-type'`이 `Access-Control-Allow-Headers: Content-Type` 줄도 매칭

### 근본 원인 (Root Cause)
- Phase 4: 이전엔 inline script를 검사했지만 React SPA 전환 후 모든 JS가 external bundle
- Phase 6: `test-cycle.sh:901` 헬스체크 URL이 `/health` 고정, unified 스택의 basePath 미적용
- Phase 8.1: timestamp 포함 전체 body 비교 → status 필드만 비교해야 함
- Logs SSE: `curl -I` (HEAD) 응답에서 `grep -i 'content-type'`이 CORS 헤더 먼저 매칭

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `test-cycle.sh` Phase 4 | inline script 검사 → external bundle URL 추출 후 검사 |
| `test-cycle.sh` Phase 6:901 | `/health` → unified 스택은 `/apps/${STACK_ID}/health` |
| `test-cycle.sh` Phase 6:926 | Image URL도 unified 스택은 `/apps/${STACK_ID}/brewnet-site-banner.png` |
| `test-cycle.sh` Phase 8.1 | body 전체 비교 → `status` 필드만 추출해 비교 |
| `test-cycle.sh` Phase 9.3/10.5 | `curl -I + grep 'content-type'` → `curl -v + grep '^< content-type'` |

### 재발 방지 체크리스트
- [ ] unified 스택 (Next.js) 테스트 시 basePath `/apps/{stackId}` 반드시 포함
- [ ] SSE Content-Type 검증은 `curl -v` verbose GET으로 `^< content-type` 패턴 사용
- [ ] health 응답 비교 시 timestamp/date 같은 동적 필드는 제외하고 비교
- [ ] React SPA 전환 후 JS 문법 검사는 external bundle 파일 URL 기준으로 작성
