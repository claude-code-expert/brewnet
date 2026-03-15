# Tasks: Domain External Access

**Input**: Design documents from `/specs/003-domain-external-access/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-api.md, quickstart.md

**Tests**: Included — the project has existing test infrastructure and 90%+ coverage target for CLI core.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **CLI package**: `packages/cli/src/`
- **Shared types**: `packages/shared/src/`
- **Tests**: `tests/unit/cli/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions and shared data model that all stories depend on

- [x] T001 Add `DomainConnection` interface to `packages/shared/src/types/wizard-state.ts` — fields: appName, subdomain, domain, hostname, tunnelId, cnameRecordId, containerPort, connectedAt, scenario
- [x] T002 Add `domainConnections: DomainConnection[]` field to `WizardState` interface in `packages/shared/src/types/wizard-state.ts`
- [x] T003 Add `domainConnectionSchema` Zod schema and update `wizardStateSchema` in `packages/shared/src/schemas/wizard-state.schema.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core domain lifecycle service and Cloudflare API extensions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add `getDnsRecords(apiToken, zoneId, hostname)` function to `packages/cli/src/services/cloudflare-client.ts` — GET `/zones/{zone_id}/dns_records?type=CNAME&name={hostname}`, returns array of `{ id, name, content, proxied }`
- [x] T005 [P] Add `deleteDnsRecord(apiToken, zoneId, recordId)` function to `packages/cli/src/services/cloudflare-client.ts` — DELETE `/zones/{zone_id}/dns_records/{record_id}`
- [x] T006 Create `packages/cli/src/services/domain-manager.ts` with core lifecycle class `DomainManager`:
  - Constructor: accepts project path, loads state from `selections.json`
  - `connect(appName, subdomain, domain, options)` — orchestrates: health check → ingress update → DNS create → Traefik labels → persist state → poll DNS. Returns progress events.
  - `disconnect(appName)` — orchestrates: remove ingress → delete DNS → remove Traefik labels → update state. Atomic rollback on failure.
  - `list()` — returns all `domainConnections[]` from state
  - `status(appName?)` — returns local health + external reachability + tunnel health + DNS verification
  - `getConnectableApps()` — returns apps not yet connected with their ports
  - Private helpers: `loadState()`, `saveState()`, `rollback()`, `pollDnsPropagation()`
- [x] T007 Add Traefik external label helpers to `packages/cli/src/services/compose-generator.ts`:
  - `addExternalLabels(composePath, appName, hostname, port)` — reads docker-compose.yml, adds Host-based external router labels, writes back
  - `removeExternalLabels(composePath, appName)` — removes `-external` router labels for given app
- [x] T008 Refactor existing `domain connect` (Quick→Named migration) in `packages/cli/src/commands/domain.ts` to delegate tunnel migration logic to `DomainManager` — extract Path A/B/C orchestration from command into DomainManager methods, keep command as thin CLI wrapper. Existing `tunnel status` and `tunnel restart` subcommands remain unchanged. This resolves the naming conflict: the existing `connect` subcommand evolves to use DomainManager while gaining the new `--domain` option for external domain connection.
- [x] T009 [P] Add unit tests for `getDnsRecords` and `deleteDnsRecord` in `tests/unit/cli/services/cloudflare-client.test.ts`
- [x] T010 Add unit tests for `DomainManager` core methods (connect, disconnect, rollback) in `tests/unit/cli/services/domain-manager.test.ts` — mock cloudflare-client and compose-generator

**Checkpoint**: Foundation ready — DomainManager service can connect/disconnect/list/status programmatically, existing `domain connect` command refactored to use DomainManager

---

## Phase 3: User Story 1 — Connect a Local App to an External Domain (Priority: P1) 🎯 MVP

**Goal**: User runs `brewnet domain connect my-api --domain my-api.yourdomain.com` and the app becomes publicly accessible

**Independent Test**: Run connect command with valid Cloudflare credentials → verify external URL returns expected response

### Implementation for User Story 1

- [x] T011 [US1] Extend existing `connect` subcommand in `packages/cli/src/commands/domain.ts` with `--domain <hostname>` option and `--force` flag — when `--domain` is provided, route to DomainManager.connect() for external domain connection; without `--domain`, retain existing Quick→Named migration behavior (now delegated to DomainManager via T008). Also add Scenario C detection: if domain uses CNAME-only mode, display CNAME value and manual setup instructions instead of attempting automated DNS creation.
- [x] T012 [US1] Add ora spinner progress and chalk-colored step output to connect flow in `packages/cli/src/commands/domain.ts` — display ✅/❌ for each step (health check, ingress update, DNS creation, Traefik labels, DNS propagation), show final external URL on success
- [x] T013 [US1] Add CNAME conflict detection in `DomainManager.connect()` — call `getDnsRecords()` before creating, prompt user to overwrite or abort (CLI: @inquirer/prompts confirm, `--force` skips prompt)
- [x] T014 [US1] Add Jellyfin/media streaming ToS warning in `DomainManager.connect()` — detect media service names, show Cloudflare ToS warning with chalk.yellow before proceeding (FR-012)
- [x] T015 [US1] Add tunnel audit logging for connect events in `DomainManager.connect()` — use existing `TunnelLogger` with event type `DOMAIN_CONNECT`
- [x] T016 [P] [US1] Add unit tests for connect CLI command in `tests/unit/cli/commands/domain-connect.test.ts` — test `--domain` option parsing, `--force` flag, Scenario C fallback message, error display
- [x] T017 [P] [US1] Add integration test for full connect flow in `tests/integration/domain-config.test.ts` — mock Cloudflare API, verify ingress + DNS + labels + state persistence

**Checkpoint**: `brewnet domain connect` fully functional. User Story 1 independently testable.

---

## Phase 4: User Story 2 — Disconnect an App from External Domain (Priority: P2)

**Goal**: User runs `brewnet domain disconnect my-api` and external access is cleanly removed while local service keeps running

**Independent Test**: Disconnect a previously connected app → verify external URL is unreachable, local endpoint still works

### Implementation for User Story 2

- [x] T018 [US2] Add `disconnect` subcommand to `packages/cli/src/commands/domain.ts` — parse `<app>` argument, confirm before proceeding
- [x] T019 [US2] Wire `disconnect` subcommand to `DomainManager.disconnect()` — add ora spinner, step-by-step output, show "still running locally" message on success
- [x] T020 [US2] Add atomic rollback in `DomainManager.disconnect()` — if DNS deletion fails after ingress removal, re-add ingress rule; log rollback event
- [x] T021 [US2] Add tunnel audit logging for disconnect events — event type `DOMAIN_DISCONNECT`
- [x] T022 [P] [US2] Add unit tests for disconnect CLI command and rollback logic in `tests/unit/cli/commands/domain-connect.test.ts`

**Checkpoint**: `brewnet domain disconnect` fully functional. Connect + Disconnect cycle works end-to-end.

---

## Phase 5: User Story 3 — View Domain Connection Status (Priority: P2)

**Goal**: User runs `brewnet domain status [app]` and sees consolidated view of local/external/tunnel/DNS health

**Independent Test**: Run status command → verify output accurately reflects real state of each component

### Implementation for User Story 3

- [x] T023 [US3] Add `status` subcommand to `packages/cli/src/commands/domain.ts` — optional `[app]` argument, displays all connections if no app specified
- [x] T024 [US3] Wire `status` subcommand to `DomainManager.status()` — format output with chalk colors (✅/❌/⚠️), show local URL, external URL, tunnel connectors, DNS CNAME verification
- [x] T025 [US3] Implement DNS verification in `DomainManager.status()` — use `execa` to run `dig CNAME +short` against public resolver, compare with expected tunnel UUID
- [x] T026 [US3] Implement external URL reachability check in `DomainManager.status()` — HTTP HEAD request to `https://{hostname}`, check for `cf-ray` header
- [x] T027 [P] [US3] Add unit tests for status command output formatting in `tests/unit/cli/commands/domain-connect.test.ts`

**Checkpoint**: `brewnet domain status` shows accurate real-time health. CLI core (connect/disconnect/status) complete.

---

## Phase 6: User Story 4 — List All Connected Domains (Priority: P3)

**Goal**: User runs `brewnet domain list` and sees a compact table of all domain connections

**Independent Test**: Connect multiple apps → run list → verify all appear in table format

### Implementation for User Story 4

- [x] T028 [US4] Add `list` subcommand to `packages/cli/src/commands/domain.ts` — calls `DomainManager.list()`, formats as cli-table3 table with columns: App, External URL, Connected
- [x] T029 [US4] Handle empty state in list command — show "No external domain connections" message with hint to run `brewnet domain connect`
- [x] T030 [P] [US4] Add unit test for list command table output and empty state in `tests/unit/cli/commands/domain-connect.test.ts`

**Checkpoint**: All CLI commands complete (connect/disconnect/status/list).

---

## Phase 7: User Story 5 — Admin Server Domain Management Section (Priority: P2)

**Goal**: Admin page at `localhost:8088` has a dedicated "Domains" section with connect/disconnect actions, Settings area for credentials, and CNAME Guide modal

**Independent Test**: Open Admin page → navigate to Domains section → perform connect/disconnect via web UI

### Admin REST API

- [x] T031 [US5] Add admin password middleware to `packages/cli/src/services/admin-server.ts` — check `X-Admin-Password` header against `state.admin.password` for `/api/domain/*` and `/api/settings/*` routes only
- [x] T032 [US5] Add `GET /api/domain/list` endpoint in `packages/cli/src/services/admin-server.ts` — returns connections array, tunnel status, credentialsConfigured flag. Uses `DomainManager.list()` and `DomainManager.status()`
- [x] T033 [P] [US5] Add `GET /api/domain/apps` endpoint in `packages/cli/src/services/admin-server.ts` — returns available apps with ports, running status, and alreadyConnected flag. Uses `DomainManager.getConnectableApps()`
- [x] T034 [US5] Add `POST /api/domain/connect` endpoint in `packages/cli/src/services/admin-server.ts` — accepts `{ appName, subdomain, domain }`, calls `DomainManager.connect()`, returns step results
- [x] T035 [P] [US5] Add `DELETE /api/domain/disconnect/:appName` endpoint in `packages/cli/src/services/admin-server.ts` — calls `DomainManager.disconnect()`, returns step results
- [x] T036 [P] [US5] Add `GET /api/domain/status/:appName` endpoint in `packages/cli/src/services/admin-server.ts` — calls `DomainManager.status(appName)`, returns detailed health info

### Admin Settings API

- [x] T037 [US5] Add `GET /api/settings/cloudflare` endpoint in `packages/cli/src/services/admin-server.ts` — returns masked credentials (apiToken → `***set***` or `not set`), zoneName, tunnelName, apiTokenValid flag
- [x] T038 [US5] Add `PUT /api/settings/cloudflare` endpoint in `packages/cli/src/services/admin-server.ts` — accepts `{ apiToken, accountId, zoneId, tunnelId }`, calls `verifyToken()` to validate, saves to `selections.json` under `domain.cloudflare`, enforces chmod 600

### Admin UI — Domains Section

- [x] T039 [US5] Add "Domains" section HTML to the admin page in `packages/cli/src/services/admin-server.ts` — table showing connected domains (app, external URL, tunnel health indicator, DNS status), "Connect Domain" button, per-row "Disconnect" button. Place between Services and Dev Stack sections.
- [x] T040 [US5] Add "Connect Domain" form modal in admin page HTML — app selector dropdown (from `/api/domain/apps`), domain input (pre-filled from zoneName), subdomain input, real-time progress display (step-by-step ✅/⏳/❌), admin password input field
- [x] T041 [US5] Add "CNAME Guide" modal in admin page HTML — triggered by button in Domains section, displays tunnel UUID CNAME value with copy button, step-by-step instructions for GoDaddy/Namecheap/가비아/Cafe24, equivalent CLI commands (`brewnet domain connect`)
- [x] T042 [US5] Add JavaScript fetch logic in admin page HTML — AJAX calls to domain API endpoints with `X-Admin-Password` header, poll `/api/domain/list` to refresh table after connect/disconnect, error handling with user-friendly messages

### Admin UI — Settings Area

- [x] T043 [US5] Add "Settings" section HTML to admin page in `packages/cli/src/services/admin-server.ts` — Cloudflare credentials form (API Token, Account ID, Zone ID), "Verify & Save" button, verification status display, link to Cloudflare token creation page
- [x] T044 [US5] Add JavaScript logic for Settings area — PUT `/api/settings/cloudflare` on save, display verification result (email + zoneName), mask saved token display

### Tests for User Story 5

- [x] T045 [P] [US5] Add integration tests for admin domain API endpoints in `tests/integration/admin-domain-api.test.ts` — test auth middleware (401 without password), list/connect/disconnect/status endpoints, settings save/read
- [x] T046 [P] [US5] Add unit tests for admin password middleware in `tests/unit/cli/services/admin-server.test.ts`

**Checkpoint**: Admin Server has full domain management UI. Users can manage domains from browser without CLI.

---

## Phase 8: User Story 6 — Dashboard Domain Connection Modal (Priority: P4)

**Goal**: Pro Dashboard provides domain connection modal from app detail page

**Independent Test**: Open Pro Dashboard → navigate to app detail → click Connect External Domain → verify connection

> ⚠️ **DEFERRED**: This story depends on the Pro Dashboard (Next.js) which is not yet implemented. Tasks are placeholders for Phase 4 of the project roadmap.

- [ ] T047 [US6] Create domain connection modal component in `packages/dashboard/src/components/domain/DomainConnectModal.tsx` — form with domain/subdomain/token fields, real-time progress steps
- [ ] T048 [US6] Create domain status display component in `packages/dashboard/src/components/domain/DomainStatus.tsx` — shows external URL, health indicator, disconnect button
- [ ] T049 [US6] Add domain API hooks in `packages/dashboard/src/hooks/useDomain.ts` — TanStack Query hooks for connect/disconnect/list/status using admin API endpoints

**Checkpoint**: Pro Dashboard domain management complete (deferred until Dashboard exists).

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T050 [P] Update `packages/cli/src/commands/domain.ts` help text and `--help` output to document all four subcommands (connect, disconnect, list, status)
- [x] T051 Add `DOMAIN_CONNECTIONS` JavaScript variable to admin page HTML in `packages/cli/src/services/admin-server.ts` — embed current connections data for initial page load (same pattern as `BOILERPLATE_STACKS`)
- [x] T052 [P] Update `tests/unit/cli/commands/index.test.ts` if subcommand count changes
- [x] T053 Run quickstart.md validation — verify CLI commands and Admin UI flow work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Phase 2 completion
  - US1 (Phase 3): Independent, no other story dependencies
  - US2 (Phase 4): Depends on US1 connect logic (uses same DomainManager)
  - US3 (Phase 5): Independent of US1/US2 (status reads state, doesn't modify)
  - US4 (Phase 6): Independent (list reads state only)
  - US5 (Phase 7): Depends on Phase 2 (DomainManager) — can run parallel with US1-US4 since it uses the same service via REST API
- **US6 (Phase 8)**: DEFERRED — depends on Pro Dashboard existence
- **Polish (Phase 9)**: Depends on US1-US5 completion

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundation: DomainManager + Cloudflare API)
    │
    ├──→ Phase 3 (US1: Connect) ──→ Phase 4 (US2: Disconnect)
    │
    ├──→ Phase 5 (US3: Status)     ← independent
    │
    ├──→ Phase 6 (US4: List)       ← independent
    │
    └──→ Phase 7 (US5: Admin UI)   ← independent (uses DomainManager via API)
         │
         ▼
    Phase 9 (Polish)
```

### Within Each User Story

- Models/types before services
- Services before CLI commands/API endpoints
- Core implementation before error handling
- Implementation before tests (tests verify behavior)

### Parallel Opportunities

- T004 + T005: getDnsRecords and deleteDnsRecord (different functions, same file but independent)
- T009 + T010: Cloudflare client tests and DomainManager tests (different test files)
- T016 + T017: Connect command tests and integration tests (different files)
- T031-T036: Admin API endpoints can be partially parallelized (different routes)
- T045 + T046: Admin API integration tests and middleware unit tests
- US3 (Status) + US4 (List) + US5 (Admin UI): Can run in parallel after Phase 2

---

## Parallel Example: User Story 1

```bash
# After Phase 2 is complete, launch US1 tasks:

# Sequential (dependencies):
Task T011: Extend connect subcommand with --domain option
Task T012: Add progress output (depends on T011)
Task T013: Add CNAME conflict detection (depends on T012)
Task T014: Add media ToS warning (depends on T012)
Task T015: Add audit logging (depends on T012)

# Parallel (after T012):
Task T013 + T014 + T015: Different concerns in same method, can be developed as independent additions
Task T016 + T017: Tests in different files, fully parallel
```

## Parallel Example: User Story 5

```bash
# After Phase 2 is complete, launch Admin UI tasks:

# Sequential chain:
Task T031: Auth middleware (other endpoints depend on this)
Task T032: GET /api/domain/list (foundation for UI)

# Parallel after T031:
Task T033 + T035 + T036: Independent API endpoints (GET apps, DELETE disconnect, GET status)
Task T037 + T038: Settings API endpoints (independent of domain endpoints)

# After APIs ready:
Task T039: Domains section HTML
Task T040 + T041: Connect modal + CNAME Guide modal (parallel, different modals)
Task T042 + T043 + T044: JavaScript logic (can parallel if modular)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T009)
3. Complete Phase 3: User Story 1 — Connect (T010-T016)
4. **STOP and VALIDATE**: `brewnet domain connect my-api --domain my-api.example.com` works end-to-end
5. Demo: App accessible at `https://my-api.example.com`

### Incremental Delivery

1. Setup + Foundational → DomainManager core ready
2. Add US1 (Connect) → Test → First external URL live (MVP!)
3. Add US2 (Disconnect) → Test → Full connect/disconnect cycle
4. Add US3 (Status) + US4 (List) → Test → CLI observability complete
5. Add US5 (Admin UI) → Test → Web-based domain management
6. Polish → Refactor, backward compat, help text
7. US6 (Dashboard Pro) → DEFERRED to Phase 4 roadmap

### Suggested MVP Scope

**Phase 1 + Phase 2 + Phase 3 (T001-T017)**: 17 tasks delivering the core value — users can connect any local app to an external domain with a single CLI command.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US6 (Dashboard Pro) is deferred — tasks are placeholders
- Existing `domain.ts` already has `connect` (Quick→Named migration), `tunnel status`, `tunnel restart` — new subcommands extend the same Commander.js command tree
- Admin Server follows inline HTML pattern — all UI changes are in `admin-server.ts`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
