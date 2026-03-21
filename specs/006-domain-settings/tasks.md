# Tasks: Domain Settings — Cloudflare Tunnel & External Domain Integration

**Input**: Design documents from `specs/006-domain-settings/`
**Branch**: `006-domain-settings`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tests**: Included for backend handlers (Jest, existing infrastructure) and pure utility functions.
**Organization**: Tasks grouped by user story — each phase is independently deliverable.
**Post-clarify additions**: T035–T037 added by `/speckit.analyze` remediation (2026-03-20) to cover FR-023, FR-025, FR-018 gaps.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on other in-progress tasks)
- **[Story]**: Which user story this task belongs to
- All paths are relative to repo root

---

## Phase 1: Setup (Directory Structure)

**Purpose**: Create new directories. No logic yet.

- [x] T001 Create `packages/admin-ui/src/features/domain/utils/` directory (empty `.gitkeep`)
- [x] T002 Create `packages/admin-ui/src/features/domain/api/` directory (empty `.gitkeep`)
- [x] T003 Create `packages/admin-ui/src/features/domain/hooks/` directory (empty `.gitkeep`)
- [x] T004 Create `packages/admin-ui/src/features/domain/components/` directory (empty `.gitkeep`)
- [x] T005 Create `tests/unit/admin-ui/` directory (empty `.gitkeep`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, pure utilities, and typed API wrappers used by ALL user stories. Must be complete before any user story phase begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Create `packages/admin-ui/src/features/domain/types.ts` — define `SetupStep`, `CloudflareSetupStatus`, `CloudflareZone`, `SetupStepState`, `AppDomainState`, `DomainConnectResult`, `TunnelCreateResult` as described in `data-model.md`

- [x] T007 [P] Create `packages/admin-ui/src/features/domain/utils/subdomain.ts` — implement `toSubdomainSlug(appName: string): string` (lowercase, non-DNS chars → hyphen, collapse hyphens, trim hyphens, max 63 chars) and `validateSubdomainLabel(s: string): { valid: boolean; error?: string }` (reject uppercase, spaces, leading/trailing hyphen, empty, >63 chars)

- [x] T008 [P] Create `packages/admin-ui/src/features/domain/api/domain-api.ts` — typed fetch wrappers (no business logic) for all admin-server domain endpoints:
  - `getCloudflareSettings(apiFetch)` → `GET /api/settings/cloudflare`
  - `saveToken(apiFetch, token)` → `PUT /api/settings/cloudflare` with `{apiToken}`
  - `saveZone(apiFetch, token, zoneId)` → `PUT /api/settings/cloudflare` with `{apiToken, zoneId}`
  - `listZones(apiFetch)` → `GET /api/cloudflare/zones`
  - `createTunnel(apiFetch, tunnelName)` → `POST /api/cloudflare/tunnel`
  - `connectDomain(apiFetch, appName, subdomain, domain)` → `POST /api/domain/connect`
  - `disconnectDomain(apiFetch, appName)` → `DELETE /api/domain/disconnect/:appName`
  - `listDomains(apiFetch)` → `GET /api/domain/list`

- [x] T009 Create `packages/admin-ui/src/features/domain/index.ts` — barrel re-export of all public components and hooks (update as each file is created)

**Checkpoint**: Foundation ready — all user story phases can now begin.

---

## Phase 3: User Story 1 — Cloudflare Tunnel Wizard (Priority: P1) 🎯 MVP

**Goal**: Admin can complete 3-step Cloudflare Tunnel setup (Token → Zone → Tunnel) through a guided modal, replacing the existing static `DomainSettingModal`.

**Independent Test**: Open `CloudflareTunnelModal` from Apps page → complete all 3 steps with a real Cloudflare token → verify tunnel appears in Cloudflare Dashboard → re-open modal → confirm it shows "complete" state with tunnel summary card (resume from complete step).

### Backend (US1)

- [x] T010 [P] [US1] Add `handleCloudflareZones` function to `packages/cli/src/services/admin-server.ts`:
  - `GET /api/cloudflare/zones` route (auth-gated with `checkAdminAuth`)
  - Read `state.domain.cloudflare.apiToken` — if missing → `400 NO_TOKEN`
  - Call `getZones(apiToken)` from `cloudflare-client.ts`
  - Return `{success: true, zones: [{id, name, status}]}` or empty with `warning` field
  - On CF error → `400 TOKEN_INVALID` with "Stored token is no longer valid" message

- [x] T011 [P] [US1] Add `handleCreateTunnel` function to `packages/cli/src/services/admin-server.ts`:
  - `POST /api/cloudflare/tunnel` route (auth-gated)
  - Parse `{tunnelName}` from body
  - Validate token + accountId + zoneId all set — if incomplete → `400 CREDENTIALS_INCOMPLETE`
  - Call `createTunnel(apiToken, accountId, tunnelName)` from `cloudflare-client.ts`
  - On success: save `tunnelId` + `tunnelName` to state via `saveState()`, set `tunnelMode: 'named'`, `enabled: true`
  - Return `{success: true, tunnelId, tunnelName}`
  - On CF error containing "already exists" → `400 TUNNEL_NAME_CONFLICT` with "Try a different name" message

- [x] T012 [US1] Wire T010 + T011 into the admin-server dispatch block in `packages/cli/src/services/admin-server.ts`:
  - Add `if (parts[1] === 'cloudflare')` block after the `settings` block
  - Route `GET /api/cloudflare/zones` → `handleCloudflareZones(res, wizardState)`
  - Route `POST /api/cloudflare/tunnel` → `handleCreateTunnel(res, body, wizardState)`

### Tests (US1)

- [x] T013 [P] [US1] Create `tests/unit/cli/services/domain-settings.test.ts` — backend handler tests using mocked `global.fetch`:
  - `handleCloudflareZones`: returns zones list, returns empty+warning when zero zones, returns `NO_TOKEN` error, returns `TOKEN_INVALID` on CF failure, requires auth (401 without header)
  - `handleCreateTunnel`: creates tunnel and saves tunnelId to state, returns `TUNNEL_NAME_CONFLICT`, returns `CREDENTIALS_INCOMPLETE` when missing fields, requires auth
  - Follow pattern from `tests/unit/cli/services/cloudflare-client.test.ts`

### Shared UI Components (US1)

- [x] T014 [P] [US1] Create `packages/admin-ui/src/features/domain/components/HelpTooltip.tsx`:
  - Props: `{ text: string; link?: string; linkLabel?: string }`
  - Renders `<HelpCircle size={14} />` from `lucide-react`
  - Tooltip div shown on hover via CSS (position: absolute, z-index: 9999)
  - Uses only CSS vars: `--bg2`, `--txt2`, `--bdr`, `--r`, `--teal`
  - Link opens in new tab with `target="_blank" rel="noreferrer"`

- [x] T015 [P] [US1] Create `packages/admin-ui/src/features/domain/components/StepIndicator.tsx`:
  - Props: `{ steps: Array<{id: string; label: string}>; currentStep: string; completedSteps: string[] }`
  - Horizontal step row: number circle + label, connected by line
  - Completed step: `--teal` fill + `<CheckCircle>` icon; active: `--teal` border; pending: `--bdr` border `--txt3` text
  - Uses only existing CSS vars

### Wizard State Hook (US1)

- [x] T016 [US1] Create `packages/admin-ui/src/features/domain/hooks/useCloudflareSetup.ts`:
  - On mount: calls `getCloudflareSettings(apiFetch)` → derives `currentStep` via:
    `!apiTokenSet → 'token'`, `!zoneName → 'zone'`, `!tunnelName → 'tunnel'`, else `'complete'`
  - If `currentStep === 'zone'`: auto-calls `listZones(apiFetch)` to pre-populate zone dropdown
  - Exposes state: `{currentStep, completedSteps, tokenState, zoneState, tunnelState, summary}`
  - Handler `saveToken(token)`: calls `saveToken()` API → on success set `completedSteps` + advance step + set `tokenEmail`; on error set `tokenError` with mapped error message
  - Handler `selectZone(zoneId, zoneName)`: calls `saveZone()` API → on success advance to 'tunnel'
  - Handler `createTunnelAction(tunnelName)`: calls `createTunnel()` API → on success advance to 'complete'
  - Default tunnel name derived from `summary.tunnelName` or `brewnet-{projectName}` pattern

### Step Components (US1)

- [x] T017 [P] [US1] Create `packages/admin-ui/src/features/domain/components/TokenStep.tsx`:
  - Password input with show/hide toggle (`<Eye>` / `<EyeOff>` icons from lucide-react)
  - `onBlur` + Enter key triggers `saveToken()`
  - Loading state: spinner replaces save button text
  - Success state: inline green checkmark + `"Verified — {email}"` text + step auto-advances
  - Error state: red border on input + error message below field (mapped from `CF_ERROR_MESSAGES`)
  - `<HelpTooltip>` with CF API tokens link: `https://dash.cloudflare.com/profile/api-tokens`

- [x] T018 [P] [US1] Create `packages/admin-ui/src/features/domain/components/ZoneStep.tsx`:
  - `<select>` dropdown populated from `zones` array
  - Shows loading spinner while zones fetch
  - Zero zones: warning banner + "Retry" button + `<HelpTooltip>` with CF domains link
  - On selection: calls `selectZone()` handler → advances to TunnelStep
  - `<HelpTooltip>` explaining what a zone is + CF dashboard link

- [x] T019 [P] [US1] Create `packages/admin-ui/src/features/domain/components/TunnelStep.tsx`:
  - Text input pre-filled with default tunnel name from hook
  - "Create Tunnel" primary button (`btn bp` class)
  - Loading state: spinner + "Creating tunnel…"
  - Success state: checkmark + tunnel name displayed + "Complete!" message
  - Error state: red border + specific error message (conflict → "Try a different name")
  - `<HelpTooltip>` explaining what a tunnel is + CF tunnels docs link

### Modal Container (US1)

- [x] T020 [US1] Create `packages/admin-ui/src/features/domain/components/CloudflareTunnelModal.tsx` — wizard container:
  - Props: `{ apiFetch: ApiFetch; onClose: () => void }`
  - Uses `useCloudflareSetup(apiFetch)` hook
  - Modal header: "Cloudflare Domain Setup" title + subtitle + close button (same structure as existing modals)
  - Renders `<StepIndicator>` with steps: Token / Domain / Tunnel
  - Conditionally renders `<TokenStep>`, `<ZoneStep>`, or `<TunnelStep>` based on `currentStep`
  - "Complete" state: summary card (tunnel name, domain, green "Active" badge) + no action needed
  - Info banner explaining one-time setup (same teal style as existing `DomainSettingModal`)
  - All styling via existing CSS classes: `overlay`, `modal`, `btn`, `btn bp`, `fg`, `fi`, `fl`, `fhint`

### Integration (US1)

- [x] T021 [US1] Update `packages/admin-ui/src/pages/Apps.tsx`:
  - Replace `import { DomainSettingModal } from '../components/DomainSettingModal.js'` with `import { CloudflareTunnelModal } from '../features/domain/index.js'`
  - Replace `<DomainSettingModal ...>` JSX with `<CloudflareTunnelModal ...>` (same props: `apiFetch`, `onClose`)

- [x] T022 [US1] Update `packages/admin-ui/src/features/domain/index.ts` to export `CloudflareTunnelModal`

**Checkpoint**: Build admin-ui (`pnpm --filter admin-ui build`) and CLI (`pnpm --filter @brewnet/cli build`) — both must succeed. Open wizard from Apps page and complete all 3 steps. Run `npx jest tests/unit/cli/services/domain-settings` — all tests pass.

---

## Phase 4: User Story 2 — Per-App Subdomain Connection (Priority: P2)

**Goal**: Admin can assign a subdomain to any running app through the App Detail → Domain tab. System auto-provisions DNS + ingress. External URL appears as clickable link after connection. App tab shows a prompt to configure Cloudflare if not yet set up.

**Independent Test**: Given Cloudflare is configured (Phase 3 complete), open any app's detail modal → Domain tab → confirm subdomain suggestion matches app name slug → connect → verify external URL link appears → confirm DNS CNAME record exists in Cloudflare Dashboard.

### Hook (US2)

- [x] T023 [US2] Create `packages/admin-ui/src/features/domain/hooks/useAppDomain.ts`:
  - Props: `{ appName: string; apiFetch: ApiFetch }`
  - On mount: calls `listDomains(apiFetch)` → derives `connectedDomain` (find by appName) + `cfConfigured` (from `credentialsConfigured`) + `zoneName` (from tunnel info)
  - Derives `suggestedSubdomain = toSubdomainSlug(appName)` from `utils/subdomain.ts`
  - Handler `connect(subdomain)`:
    - Client-side validate with `validateSubdomainLabel(subdomain)` first → show error if invalid
    - Call `connectDomain(apiFetch, appName, subdomain, zoneName)`
    - On success: `showToast('Domain connected')`, reload domain list
    - On error: map error code to user message via `CF_ERROR_MESSAGES`
  - Exposes: `{connectedDomain, cfConfigured, zoneName, suggestedSubdomain, connecting, subdomainError, connect, reload}`

### Component (US2)

- [x] T024 [US2] Create `packages/admin-ui/src/features/domain/components/AppDomainTab.tsx`:
  - Props: `{ appName: string; apiFetch: ApiFetch; onOpenDomainSettings?: () => void }`
  - Uses `useAppDomain(appName, apiFetch)` hook
  - **State: CF not configured** → info banner with "Set up Cloudflare Tunnel first" + "Open Domain Settings →" button (calls `onOpenDomainSettings`)
  - **State: loading** → spinner row
  - **State: not connected** → shows zone name as base domain (e.g., `.myserver.com`) + subdomain input pre-filled with suggestion + inline DNS validation on input change + "Connect" button (primary `btn bp`) + HelpTooltip on subdomain field
  - **State: connecting** → spinner + "Creating DNS record…" text
  - **State: connected** → external URL card: full hostname as `<a href=... target="_blank">` link + copy icon button + "Connected since {date}" meta

### Integration (US2)

- [x] T025 [US2] Update `packages/admin-ui/src/components/AppDetailModal.tsx`:
  - Replace `import { DomainTab } from './DomainTab.js'` with `import { AppDomainTab } from '../features/domain/index.js'`
  - Replace `<DomainTab appName={appName} apiFetch={apiFetch} />` with `<AppDomainTab appName={appName} apiFetch={apiFetch} onOpenDomainSettings={onOpenDomainSettings} />`
  - Add `onOpenDomainSettings?: () => void` to `AppDetailModalProps` interface

- [x] T026 [US2] Update `packages/admin-ui/src/pages/Apps.tsx` to pass `onOpenDomainSettings` callback to `AppDetailModal`:
  - When `onOpenDomainSettings` is called from inside AppDetailModal: close detail modal + open `CloudflareTunnelModal`
  - Pattern: `onOpenDomainSettings={() => { setSelectedApp(null); setShowDomainSetting(true); }}` (uses `setSelectedApp(null)`, not `setShowDetail`)

- [x] T027 [US2] Update `packages/admin-ui/src/features/domain/index.ts` to export `AppDomainTab`

### Tests (US2)

- [x] T028 [P] [US2] Create `tests/unit/admin-ui/domain-utils.test.ts` — pure function tests:
  - `toSubdomainSlug`: converts to lowercase, replaces spaces with hyphens, removes leading/trailing hyphens, truncates to 63 chars, handles already-valid names, handles empty string, handles special chars (dots, underscores, @)
  - `validateSubdomainLabel`: accepts valid names, rejects uppercase, rejects spaces, rejects leading hyphen, rejects trailing hyphen, rejects empty string, rejects >63 chars, rejects labels with only hyphens
  - Follow existing Jest+ts-jest pattern (`import { describe, it, expect } from '@jest/globals'`)

**Checkpoint**: `pnpm --filter admin-ui build` succeeds. Open App Detail → Domain tab → complete connect flow. Run `npx jest tests/unit/admin-ui/domain-utils` — all tests pass.

---

## Phase 5: User Story 3 — Domain Disconnect (Priority: P3)

**Goal**: Admin can remove a domain connection from an app, with explicit confirmation. System automatically cleans up the Cloudflare DNS record and tunnel ingress entry.

**Independent Test**: Given an app with a connected domain (Phase 4 complete), click "Disconnect" → confirm dialog appears showing hostname → confirm → domain tab returns to "not connected" state → verify DNS CNAME record is removed in Cloudflare Dashboard.

### Implementation (US3)

- [x] T029 [US3] Add disconnect flow to `packages/admin-ui/src/features/domain/hooks/useAppDomain.ts`:
  - Handler `disconnect()`: calls `disconnectDomain(apiFetch, appName)`
  - On success: `showToast('Domain disconnected')`, reload domain list
  - On error: show toast with mapped error message
  - Expose: `{disconnecting, disconnect}` in addition to existing state

- [x] T030 [US3] Add disconnect UI to `packages/admin-ui/src/features/domain/components/AppDomainTab.tsx`:
  - **State: connected** → add "Disconnect" button (secondary `btn bg`) below the URL card
  - On click: set local `confirmDisconnect = true` state
  - Render `<ConfirmModal>` (import from `../../components/ConfirmModal.js`) when `confirmDisconnect === true`:
    - `title="Disconnect Domain?"`
    - `message="This will remove the DNS record for {hostname} and the app will no longer be publicly accessible."`
    - `confirmLabel="Disconnect"`
    - On confirm: call `disconnect()` from hook
    - On cancel: set `confirmDisconnect = false`
  - **State: disconnecting** → show spinner replacing the URL card

**Checkpoint**: `pnpm --filter admin-ui build` succeeds. Full round-trip: connect domain → disconnect domain → verify DNS cleaned up. `pnpm test` passes (no regressions).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, cleanup of replaced files, full test suite validation.

- [x] T035 [US2] Add app-status guard to `packages/admin-ui/src/features/domain/components/AppDomainTab.tsx` (FR-023):
  - Receive `appStatus: string` prop from `AppDomainTab` (sourced from parent `app.status`)
  - When `appStatus !== 'running'`: disable the Connect button and show inline error below it: "App must be running to connect a domain — start the app first"
  - Style: same inline error pattern as subdomain validation error (red text, `--red` color)
  - Connect button: `disabled` attribute + `opacity: 0.5` when blocked

- [x] T031 [P] Run full build verification: `pnpm --filter @brewnet/cli build && pnpm --filter admin-ui build` — both must complete with zero TypeScript errors in strict mode

- [x] T032 [P] Run full test suite: `pnpm test` — all existing tests pass + new tests in `tests/unit/cli/services/domain-settings.test.ts` and `tests/unit/admin-ui/domain-utils.test.ts` pass

- [x] T037 [P] Implement two-phase subdomain conflict detection (FR-018) in `packages/cli/src/services/admin-server.ts` `POST /api/domain/connect` handler:
  - Phase 1 (local): check existing `domainConnections` in state — if subdomain already mapped to another app, return `409 SUBDOMAIN_CONFLICT_LOCAL` with the conflicting app name
  - Phase 2 (Cloudflare): if no local conflict, call `cloudflare-client.ts` `listDnsRecords(zoneId, subdomain)` — if a matching CNAME already exists, return `409 SUBDOMAIN_CONFLICT_EXTERNAL` with message "This subdomain already has a DNS record in Cloudflare (not created by Brewnet)"
  - Add corresponding test cases to `tests/unit/cli/services/domain-settings.test.ts`

- [x] T036 [P] Verify FR-025 (immediate error + Retry button on API failure) is implemented across step components:
  - `TokenStep.tsx`: network error during `saveToken()` → error state shows with a "Retry" button distinct from the primary submit button
  - `ZoneStep.tsx`: already has "Retry" button for zero-zones / fetch failure (verify it also covers network errors)
  - `TunnelStep.tsx`: CF API failure during `createTunnel()` → "Create Tunnel" button re-enables (acts as implicit retry) — document this as the retry mechanism
  - If "Retry" button is absent in TokenStep or ZoneStep for general network failures, add it

- [x] T033 Validate quickstart.md Definition of Done checklist — manually test each item:
  - `CloudflareTunnelModal` opens from Apps page "Domain Settings" button
  - 3-step wizard completes for a real Cloudflare account
  - Wizard resumes from correct step on re-open (complete → shows summary; zone not set → opens ZoneStep)
  - `AppDomainTab` shows suggestion, connects subdomain, shows external URL link
  - Disconnect removes DNS record (verified in Cloudflare Dashboard)
  - All error states show specific messages (test with bad token, conflicting subdomain)

- [x] T034 Remove legacy replaced files after confirming all functionality works:
  - Delete `packages/admin-ui/src/components/DomainSettingModal.tsx`
  - Delete `packages/admin-ui/src/components/DomainTab.tsx`
  - Verify no remaining imports of these files (`grep -r 'DomainSettingModal\|DomainTab' packages/admin-ui/src`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks all user story phases
- **US1 (Phase 3)**: Depends on Phase 2 — no dependency on US2 or US3
- **US2 (Phase 4)**: Depends on Phase 2 — no dependency on US1 (AppDomainTab works with already-configured CF)
- **US3 (Phase 5)**: Extends US2 — depends on Phase 4 completing AppDomainTab
- **Polish (Phase 6)**: Depends on all user story phases

### Within Phase 3 (US1)

```
T010 + T011 (backend handlers) — parallel
       ↓
T012 (route wiring) — sequential
T013 (backend tests) — parallel with T012

T014 + T015 (shared UI) — parallel, can start after Phase 2
T016 (hook) — after T014, T015
T017 + T018 + T019 (step components) — parallel, after T016
       ↓
T020 (modal container) — sequential, after T017-T019
       ↓
T021 + T022 (integration) — sequential
```

### Within Phase 4 (US2)

```
T023 (hook) — after Phase 2
T024 (component) — after T023
T025 + T026 + T027 (integration) — after T024
T028 (tests) — parallel with T023
```

### User Story Independence

- **US1**: Can be implemented without US2 or US3. `CloudflareTunnelModal` is self-contained.
- **US2**: Can be tested end-to-end given only that CF credentials exist (from Phase 3 or pre-configured). `AppDomainTab` calls existing domain endpoints.
- **US3**: Extends US2's `AppDomainTab` — requires Phase 4 to be complete.

---

## Parallel Execution Examples

### Phase 3 Parallel Batch 1 (start together)

```
Agent A: T010 — handleCloudflareZones in admin-server.ts
Agent B: T011 — handleCreateTunnel in admin-server.ts
Agent C: T013 — domain-settings.test.ts (write tests)
Agent D: T014 — HelpTooltip.tsx
Agent E: T015 — StepIndicator.tsx
```

### Phase 3 Parallel Batch 2 (after T016 hook is done)

```
Agent A: T017 — TokenStep.tsx
Agent B: T018 — ZoneStep.tsx
Agent C: T019 — TunnelStep.tsx
```

### Phase 4 Parallel Batch

```
Agent A: T023 — useAppDomain.ts hook
Agent B: T028 — domain-utils.test.ts (write tests)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (directories)
2. Complete Phase 2: Foundational (types, utils, API wrappers)
3. Complete Phase 3: US1 — Cloudflare Tunnel Wizard
4. **STOP and VALIDATE**: Open wizard → complete 3 steps → verify tunnel in CF Dashboard
5. Demo-ready: admin can configure tunnel via new guided modal

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → Tunnel wizard works → Demo (MVP)
3. Phase 4 → Per-app subdomain connection → Demo (full Cloudflare flow)
4. Phase 5 → Disconnect → Demo (full lifecycle)
5. Phase 6 → Polish → PR ready

---

## Notes

- [P] tasks = different files, no blocking dependencies on concurrent tasks
- Each checkpoint includes a build check — do not skip
- `pnpm --filter admin-ui build` is the TypeScript strict mode gate for frontend tasks
- Error messages MUST come from the `CF_ERROR_MESSAGES` map — no inline string literals for user-facing errors
- `ConfirmModal` used in T030 is already implemented at `packages/admin-ui/src/components/ConfirmModal.tsx` — import as-is
- `showToast` is already implemented at `packages/admin-ui/src/components/Toast.tsx` — import as-is
- All new components use existing CSS classes and variables only — no new CSS files
