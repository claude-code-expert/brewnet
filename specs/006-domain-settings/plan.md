# Implementation Plan: Domain Settings — Cloudflare Tunnel & External Domain Integration

**Branch**: `006-domain-settings` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/006-domain-settings/spec.md`

---

## Summary

Redesign the Cloudflare domain settings experience from a static form into a guided 3-step wizard (Token → Zone → Tunnel), with per-app subdomain connection panels that auto-provision DNS and tunnel ingress. All new code lives in a self-contained `features/domain/` module. Two new backend endpoints are added (zone listing, tunnel creation). Existing domain connect/disconnect behavior is preserved and enhanced with smarter UX.

---

## Technical Context

**Language/Version**: TypeScript 5.x strict mode (frontend + backend), Node.js 20+ (ESM)
**Primary Dependencies**:
- Frontend: React 18, existing CSS variables, Unicode symbol icons (no new packages — lucide-react was not installed; ✓/👁/? used in place of CheckCircle/Eye/HelpCircle)
- Backend: `cloudflare-client.ts` (all CF API functions already exist), `admin-server.ts` (2 new route handlers)
**Storage**: WizardState JSON at `~/.brewnet/projects/<name>/selections.json` — no schema changes required
**Testing**: Jest 29 + ts-jest (existing) — new tests in `tests/unit/admin-ui/` and `tests/unit/cli/services/`
**Target Platform**: macOS / Linux — admin UI in browser (localhost:5173 dev / served from CLI in prod)
**Project Type**: Web application module (React SPA admin-ui) + Node.js CLI service extension
**Performance Goals**: Token validation < 5s, zone list load < 5s, tunnel creation < 30s (Cloudflare API dependent)
**Constraints**: No new npm packages. All new frontend styling uses existing CSS variables only. Admin-server.ts remains the only entry point for Cloudflare API calls (browser never calls CF directly).
**Scale/Scope**: Single-user admin UI, 2 new API endpoints, ~12 new frontend files, 2 test files

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero Config | ✅ PASS | Tunnel name pre-filled from project name; zones auto-fetched after token |
| II. Secure by Default | ✅ PASS | CF token stored server-side only; browser receives masked values; no new credentials in localStorage |
| III. Transparent Operations | ✅ PASS | Each wizard step shows exactly what it's doing; all errors name the failure and give remediation |
| IV. Reversible Actions | ✅ PASS | Disconnect removes DNS + ingress; requires ConfirmModal confirmation |
| V. Offline First | ✅ PASS | Domain setup inherently requires internet (CF API); failure produces clear offline error messages |
| TypeScript strict | ✅ PASS | All new code in strict mode, no `any` types |
| Architecture Rules | ✅ PASS | New code in `admin-ui` package; CLI unchanged except 2 new handlers in admin-server.ts |
| Error Codes | ⚠️ ATTENTION | Domain handler errors use semantic string codes (`NO_TOKEN`, `TOKEN_INVALID`, `TUNNEL_NAME_CONFLICT`, `CREDENTIALS_INCOMPLETE`) scoped to this feature rather than BN-numeric codes. Justification: these are UI-layer validation codes not surfaced to end-users as BN codes; they map to HTTP 400/401 status codes and all have actionable messages. BN codes continue to cover system-level errors (BN001–BN010). |
| Test Coverage | ⚠️ ATTENTION | admin-ui has no test framework; pure utility tests go via existing Jest in `tests/unit/admin-ui/`; React component tests deferred |

No constitution violations requiring justification.

---

## Project Structure

### Documentation (this feature)

```text
specs/006-domain-settings/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Data entities and type definitions
├── quickstart.md        # Developer onboarding guide
├── contracts/
│   └── admin-api.md     # API endpoint contracts (existing + new)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code Layout

```text
# Frontend
packages/admin-ui/src/
├── features/domain/               # NEW — all domain management code
│   ├── index.ts                   # barrel re-exports
│   ├── types.ts                   # SetupStep, CloudflareSetupStatus, CloudflareZone, etc.
│   ├── utils/
│   │   └── subdomain.ts          # toSubdomainSlug(), validateSubdomainLabel()
│   ├── api/
│   │   └── domain-api.ts         # typed fetch wrappers → admin-server
│   ├── hooks/
│   │   ├── useCloudflareSetup.ts # wizard step state machine
│   │   └── useAppDomain.ts       # per-app connect/disconnect
│   └── components/
│       ├── HelpTooltip.tsx        # HelpCircle icon + hover tooltip + CF link
│       ├── StepIndicator.tsx      # visual 1-2-3 step progress
│       ├── CloudflareTunnelModal.tsx  # wizard container (replaces DomainSettingModal)
│       ├── TokenStep.tsx          # Step 1: token input + inline validation
│       ├── ZoneStep.tsx           # Step 2: zone dropdown from fetched list
│       ├── TunnelStep.tsx         # Step 3: tunnel name + create button
│       └── AppDomainTab.tsx       # per-app panel (replaces DomainTab)
│
├── pages/Apps.tsx                 # MODIFIED — import updated (2 lines)
└── components/AppDetailModal.tsx  # MODIFIED — import updated (2 lines)

# Backend
packages/cli/src/services/
└── admin-server.ts                # MODIFIED — 2 new route handlers + 2 handler functions

# Tests
tests/unit/
├── admin-ui/
│   └── domain-utils.test.ts      # NEW — subdomain util pure function tests
└── cli/services/
    └── domain-settings.test.ts   # NEW — new admin-server handler tests
```

**Structure Decision**: Feature module pattern (`features/domain/`) isolates all new code. Existing files modified only at import/route level. Tests follow existing Jest + ts-jest ESM pattern in `tests/unit/`.

---

## Implementation Phases

### Phase A: Backend — New API Endpoints

**Goal**: Add `GET /api/cloudflare/zones` and `POST /api/cloudflare/tunnel` to admin-server.ts

**Files changed**:
- `packages/cli/src/services/admin-server.ts` — add route dispatch + 2 handler functions

**Handler: `handleCloudflareZones`** (GET /api/cloudflare/zones)
1. Read stored `state.domain.cloudflare.apiToken`
2. If not set → 400 `NO_TOKEN`
3. Call `getZones(apiToken)` from cloudflare-client.ts
4. Return `{success: true, zones: [{id, name, status}]}`
5. If zero zones → return `{success: true, zones: [], warning: "..."}`
6. On CF API error → 400 `TOKEN_INVALID`

**Handler: `handleCreateTunnel`** (POST /api/cloudflare/tunnel)
1. Parse `{tunnelName}` from body
2. Read stored token, accountId, zoneId — if incomplete → 400 `CREDENTIALS_INCOMPLETE`
3. Call `createTunnel(apiToken, accountId, tunnelName)` from cloudflare-client.ts
4. On success: save tunnelId + tunnelName to state via `saveState()`
5. Return `{success: true, tunnelId, tunnelName}`
6. On CF error containing "already exists" → 400 `TUNNEL_NAME_CONFLICT`

**Auth**: Both endpoints require `checkAdminAuth()`.

---

### Phase B: Frontend Foundation

**Goal**: Create the `features/domain/` module scaffolding — types, utils, API wrappers

**Files created**:
- `features/domain/types.ts` — all TypeScript interfaces
- `features/domain/utils/subdomain.ts` — pure functions for slug + validation
- `features/domain/api/domain-api.ts` — typed fetch wrappers
- `features/domain/index.ts` — barrel exports

**Key utility functions**:
```typescript
// subdomain.ts
toSubdomainSlug(appName: string): string
validateSubdomainLabel(s: string): { valid: boolean; error?: string }

// domain-api.ts (typed wrappers — no business logic)
getCloudflareSettings(apiFetch): Promise<CloudflareSetupStatus>
saveToken(apiFetch, token: string): Promise<TokenSaveResult>
saveZone(apiFetch, token: string, zoneId: string): Promise<ZoneSaveResult>
getZones(apiFetch): Promise<CloudflareZone[]>
createTunnel(apiFetch, tunnelName: string): Promise<TunnelCreateResult>
connectDomain(apiFetch, appName, subdomain, domain): Promise<DomainConnectResult>
disconnectDomain(apiFetch, appName): Promise<void>
listDomains(apiFetch): Promise<DomainListResult>
```

---

### Phase C: Shared UI Components

**Goal**: Build reusable components used by both wizard and app tab

**Files created**:
- `features/domain/components/HelpTooltip.tsx`
- `features/domain/components/StepIndicator.tsx`

**HelpTooltip** — hover-triggered tooltip with optional CF dashboard link:
- Trigger: `?` Unicode character styled as a bordered circle (no lucide-react)
- Tooltip: CSS position:absolute, shown on `:hover`, z-index above modal content
- Link: `target="_blank" rel="noreferrer"` for CF dashboard links
- Styling: uses `--bg2`, `--txt2`, `--bdr`, `--r` CSS variables only

**StepIndicator** — horizontal 1-2-3 with labels, connected by line:
- Completed: `--teal` color, `✓` Unicode checkmark
- Active: `--teal` border, white fill
- Pending: `--bdr` border, `--txt3` text

---

### Phase D: Cloudflare Tunnel Wizard Modal

**Goal**: Build the 3-step `CloudflareTunnelModal` replacing `DomainSettingModal`

**Files created**:
- `features/domain/hooks/useCloudflareSetup.ts`
- `features/domain/components/TokenStep.tsx`
- `features/domain/components/ZoneStep.tsx`
- `features/domain/components/TunnelStep.tsx`
- `features/domain/components/CloudflareTunnelModal.tsx`

**`useCloudflareSetup` hook**:
- Loads current state from `GET /api/settings/cloudflare` on mount
- Derives `currentStep` from saved state (resume logic)
- Exposes: `{currentStep, completedSteps, stepState, handlers}`
- Handlers: `saveToken()`, `selectZone()`, `createTunnel()`

**Step components** (each receives step state + handler props):

`TokenStep`:
- Password input with show/hide toggle (`👁`/`🙈` Unicode; no lucide-react)
- onBlur triggers `saveToken()` API call
- Inline loading spinner during validation
- On success: green `✓` checkmark + email display + advance to ZoneStep
- On error: red border + specific error message + HelpTooltip with CF API tokens link

`ZoneStep`:
- Dropdown `<select>` populated from fetched zones
- Auto-loads zones when step becomes active
- Loading state: "Fetching your domains…" with spinner
- Zero zones: warning banner + retry button + HelpTooltip with CF zones link
- On selection: call `saveZone()` + advance to TunnelStep

`TunnelStep`:
- Text input pre-filled with `brewnet-{projectName}`
- "Create Tunnel" button → calls `createTunnel()`
- On success: animated checkmark + tunnel name display + advance to complete state
- On error: red border + specific message (conflict → "Try a different name")

**Complete state** (after all 3 steps done):
- Summary card: tunnel name, domain, green "Active" badge
- "Connect apps →" button that closes modal

---

### Phase E: Per-App Domain Tab

**Goal**: Build `AppDomainTab` replacing `DomainTab`

**Files created**:
- `features/domain/hooks/useAppDomain.ts`
- `features/domain/components/AppDomainTab.tsx`

**`useAppDomain` hook**:
- Loads `GET /api/domain/list` on mount
- Derives: `connectedDomain`, `cfConfigured`, `suggestedSubdomain`
- `suggestedSubdomain = toSubdomainSlug(appName)`
- Handlers: `connect(subdomain)`, `disconnect()`

**`AppDomainTab` layout**:

*When CF not configured*:
- Info banner: "Set up Cloudflare Tunnel first to connect apps to a public domain"
- Button: "Open Domain Settings →" (calls `onOpenDomainSettings` prop)

*When CF configured, app not connected*:
- `zoneName` displayed as base domain (e.g., "myserver.com")
- Subdomain input: pre-filled with suggestion, editable
- Inline validation on input (validateSubdomainLabel)
- "Connect" button → calls `connect(subdomain)` with domain from list
- Loading state: spinner + "Creating DNS record…"

*When app is connected*:
- External URL card: hostname + clickable `href` link + copy button
- "Disconnect" button → triggers `ConfirmModal` (existing component)
- Post-disconnect: returns to disconnected state

---

### Phase F: Integration + Tests

**Goal**: Wire new components into existing pages, run tests

**Modified files**:
- `pages/Apps.tsx` — replace `DomainSettingModal` import → `CloudflareTunnelModal`
- `components/AppDetailModal.tsx` — replace `DomainTab` import → `AppDomainTab`
- `index.ts` — add `onOpenDomainSettings` callback wiring between AppDetailModal and Apps.tsx

**New test files**:

`tests/unit/admin-ui/domain-utils.test.ts`:
```
toSubdomainSlug:
  - converts to lowercase
  - replaces spaces with hyphens
  - removes leading/trailing hyphens
  - truncates to 63 chars
  - handles already-valid names unchanged
  - handles empty string
validateSubdomainLabel:
  - accepts valid lowercase+hyphen names
  - rejects uppercase
  - rejects spaces
  - rejects leading hyphen
  - rejects trailing hyphen
  - rejects empty string
  - rejects >63 chars
```

`tests/unit/cli/services/domain-settings.test.ts`:
```
handleCloudflareZones:
  - returns zones when token valid
  - returns empty list with warning when zero zones
  - returns NO_TOKEN when token not configured
  - returns TOKEN_INVALID when CF API returns error
  - requires auth (401 without header)
handleCreateTunnel:
  - creates tunnel and saves tunnelId to state
  - returns TUNNEL_NAME_CONFLICT when name exists in CF
  - returns CREDENTIALS_INCOMPLETE when token or zoneId missing
  - requires auth (401 without header)
```

---

## Build Order

```
Phase A (Backend)  →  Phase B (Foundation)  →  Phase C (Shared UI)
                                                      ↓
                                              Phase D (Wizard Modal)
                                                      ↓
                                              Phase E (App Domain Tab)
                                                      ↓
                                              Phase F (Integration + Tests)
```

Phases A and B can begin in parallel. Phase C requires B. Phases D and E require C. Phase F requires D and E.

---

## Risk & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| CF API token not persisted after restart | Low | Research confirmed `PUT /api/settings/cloudflare` saves to state file |
| `DomainManager.connect()` requires accountId from state | Medium | Verify state has accountId populated after Zone step; log error clearly if missing |
| Tooltip z-index conflicts with modal overlay | Low | Use explicit z-index > modal value (9999) |
| Zero-zones edge case confuses user | Medium | Clear warning banner + HelpTooltip with CF dashboard link |
| Tunnel creation fails silently if accountId is empty | Medium | Validate accountId presence in `handleCreateTunnel` before calling CF API |
