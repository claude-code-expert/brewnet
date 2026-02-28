# Tasks: Cloudflare Tunnel Setup — 4-Scenario Initial Install Flow

**Input**: Design documents from `/specs/001-cf-tunnel-setup/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: Included in Phase 7 (Unit + Integration — not TDD; implement first, test after)

**Organization**: Tasks grouped by user story. Each phase (3–6) is independently implementable and testable.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Parallelizable (different files, no shared in-progress dependencies)
- **[Story]**: User story label (US1/US2/US3/US4)

---

## Phase 1: Setup — Shared Type Foundation

**Purpose**: Extend shared types first so TypeScript compilation passes before any service code is written. All downstream files depend on these types.

**⚠️ CRITICAL**: Must complete before ANY other phase. TypeScript strict mode will fail to compile without these.

- [x] T001 Extend `CloudflareConfig` interface: add `tunnelMode: 'quick' | 'named' | 'none'` and `quickTunnelUrl: string` fields — `packages/shared/src/types/wizard-state.ts`
- [x] T002 Extend `DomainProvider` union: add `'quick-tunnel'` value — `packages/shared/src/types/wizard-state.ts`
- [x] T003 Add `TunnelHealth`, `TunnelServiceStatus`, and `TunnelLogEvent` interfaces — `packages/shared/src/types/wizard-state.ts`
- [x] T004 Add Zod schema changes: extend `CloudflareConfigSchema` with `tunnelMode` + `quickTunnelUrl` defaults, extend `DomainProviderSchema` with `'quick-tunnel'` — update or create `packages/shared/src/schemas/wizard-state.schema.ts`
- [x] T005 Build shared package and fix any TypeScript errors caused by new fields — `pnpm --filter @brewnet/shared build`

**Checkpoint**: `pnpm --filter @brewnet/shared build` succeeds with zero errors.

---

## Phase 2: Foundational — Core Services (Blocks All User Stories)

**Purpose**: New utility services and modifications to existing services that are shared across all 4 user story flows. No user story implementation can begin until this phase is complete.

**⚠️ CRITICAL**: Depends on Phase 1 (types) completion.

- [x] T006 [P] Create `TunnelLogger` class with `log(event: TunnelLogEvent): void` — appends NDJSON to `~/.brewnet/logs/tunnel.log`, creates file+dir if missing, MUST NOT write `apiToken` or `tunnelToken` — `packages/cli/src/utils/tunnel-logger.ts`
- [x] T007 [P] Add `fetchWithRetry(url, init?, config?)` helper to cloudflare-client.ts: max 3 retries, exponential backoff 1s→2s→4s ±10% jitter, retry on network errors + HTTP 5xx + 429, NO retry on HTTP 400/401/403 — `packages/cli/src/services/cloudflare-client.ts`
- [x] T008 Add `deleteTunnel(apiToken, accountId, tunnelId): Promise<void>` to cloudflare-client.ts — `DELETE /accounts/{accountId}/cfd_tunnel/{tunnelId}`, throws descriptive error if active connections exist — `packages/cli/src/services/cloudflare-client.ts`
- [x] T009 Update `compose-generator.ts` cloudflared service generation: branch on `state.domain.cloudflare.tunnelMode`; `'quick'` → `command: tunnel --no-autoupdate --url http://traefik:80` (no TUNNEL_TOKEN); `'named'` → `command: tunnel --no-autoupdate run` + `TUNNEL_TOKEN` env var — `packages/cli/src/services/compose-generator.ts`

**Checkpoint**: `pnpm --filter @brewnet/cli build` succeeds. `deleteTunnel`, `fetchWithRetry`, `TunnelLogger` are importable.

---

## Phase 3: User Story 1 — Quick Tunnel (Priority: P1) 🎯 MVP

**Goal**: Users with no domain and no Cloudflare account can run `brewnet init`, select "Quick Tunnel", and immediately get a `*.trycloudflare.com` URL providing access to all path-friendly services.

**Independent Test**: Run `brewnet init` → select option 1 "Quick Tunnel" → complete wizard → confirm `*.trycloudflare.com` URL appears in Step 7 with `/files`, `/git`, `/status` paths → visit URL in browser → services respond.

- [x] T010 [US1] Create `QuickTunnelManager` class with `start(): Promise<string>` (returns URL), `stop(): Promise<void>`, `getUrl(): string` — starts cloudflared container in quick mode, streams Docker logs, extracts URL via regex `/https?:\/\/([\w-]+\.trycloudflare\.com)/i` from both stdout+stderr, 30s timeout — `packages/cli/src/services/quick-tunnel.ts`
- [x] T011 [P] [US1] Add Traefik path-prefix routing labels for Quick Tunnel mode in compose-generator.ts: generate `PathPrefix` router + `StripPrefix` middleware labels for FileBrowser (`/files`), Gitea (`/git`), Uptime Kuma (`/status`), Grafana (`/grafana`), pgAdmin (`/pgadmin`) when `tunnelMode='quick'`; skip Nextcloud/Jellyfin with advisory note — `packages/cli/src/services/compose-generator.ts`
- [x] T012 [US1] Replace binary `local/tunnel` select prompt in Step 4 with 5-option scenario selector showing prerequisites and outcomes for each option — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T013 [US1] Implement Scenario 1 flow: when option 1 selected, set `provider='quick-tunnel'`, `tunnelMode='quick'`, call `QuickTunnelManager.start()`, store returned URL in `state.domain.cloudflare.quickTunnelUrl`, log `QUICK_START` event — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T014 [US1] Update wizard Step 7 (Complete) to display Quick Tunnel URL with per-service path list + prominent restart-URL-change warning + "영구 URL: `brewnet domain connect`" hint when `tunnelMode='quick'` — `packages/cli/src/wizard/steps/complete.ts` (or equivalent Step 7 file)

**Checkpoint**: `brewnet init` → option 1 → Quick Tunnel URL displayed in Step 7 with per-service paths → browser access works → `~/.brewnet/logs/tunnel.log` has `QUICK_START` event.

---

## Phase 4: User Story 2 — Named Tunnel with Existing Domain (Priority: P2)

**Goal**: Users with an existing Cloudflare-managed domain can complete full Named Tunnel setup (token → account/zone detection → tunnel creation → ingress → DNS → healthy cloudflared container) in under 5 minutes.

**Independent Test**: Run `brewnet init` → select option 2 "Named Tunnel with existing domain" → paste valid CF API token → complete wizard → all service subdomains resolve → tunnel status shows "healthy".

- [x] T015 [US2] Wrap the existing Named Tunnel API flow (10-step sequence in `domain-network.ts`) with retry: replace all direct `fetch()` calls with `fetchWithRetry()` from T007 — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T016 [US2] Add auto-rollback to Named Tunnel API flow: track `createdTunnelId`, on any step failure after tunnel creation call `deleteTunnel()`, best-effort delete created DNS records, log `ROLLBACK` event, display "설정 실패 — 터널 롤백 완료. 다시 시도하세요." — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T017 [US2] Add `TunnelLogger` events to Named Tunnel flow: `CREATE` on tunnel creation success, `ROLLBACK` on failure — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T018 [US2] Add tunnel health verification step after cloudflared container starts: poll `GET /accounts/{accountId}/cfd_tunnel/{tunnelId}` for `status='healthy'` with 30s timeout, trigger rollback if timeout reached — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T019 [P] [US2] Create `packages/cli/src/commands/domain.ts` — Commander command file skeleton with `domain connect`, `domain tunnel status`, `domain tunnel restart` subcommand stubs — `packages/cli/src/commands/domain.ts`
- [x] T020 [US2] Implement `brewnet domain tunnel status` subcommand: read state, query CF API for tunnel health + connector count, HTTP HEAD each service URL, render cli-table3 output — `packages/cli/src/commands/domain.ts`
- [x] T021 [US2] Implement `brewnet domain tunnel restart` subcommand: dockerode container stop → start, poll for healthy status (30s), log `RESTART` event, display updated service URLs — `packages/cli/src/commands/domain.ts`
- [x] T022 [US2] Register `domain` command with Commander in CLI entry point — `packages/cli/src/index.ts`

**Checkpoint**: `brewnet init` option 2 → full tunnel setup with real CF token → services accessible → `brewnet domain tunnel status` shows healthy → `brewnet domain tunnel restart` restarts container → `~/.brewnet/logs/tunnel.log` has CREATE event.

---

## Phase 5: User Story 3 — Guided Domain Registration (Priority: P3)

**Goal**: Users with no domain are guided through Cloudflare domain registration, optionally bridge with Quick Tunnel while waiting, then complete Named Tunnel setup in a single uninterrupted session.

**Independent Test**: Run `brewnet init` → select option 3 → domain purchase instructions displayed → accept Quick Tunnel bridge → `*.trycloudflare.com` URL shown → press Enter → Named Tunnel flow completes → Quick Tunnel stops → Named Tunnel subdomains accessible.

- [x] T023 [US3] Implement Scenario 3 flow in `domain-network.ts`: display domain registration guide with Cloudflare Registrar URL, offer Quick Tunnel bridge (call QuickTunnelManager.start() if user accepts), display "도메인 설정 완료 후 Enter를 누르세요" and await single keypress within same session — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T024 [US3] After Enter confirmation in Scenario 3: call the Scenario 2 Named Tunnel flow (shared function from T015–T018), on Named Tunnel success call `QuickTunnelManager.stop()` if bridge was running, log `QUICK_STOP` event — `packages/cli/src/wizard/steps/domain-network.ts`

**Checkpoint**: Full Scenario 3 flow: Quick Tunnel starts → Enter pressed → Named Tunnel activates → Quick Tunnel container stopped → Named Tunnel subdomains accessible → `tunnel.log` has `QUICK_START`, `CREATE`, `QUICK_STOP` events.

---

## Phase 6: User Story 4 — Named Tunnel Only, Domain Later (Priority: P4)

**Goal**: Users create a Named Tunnel during init without configuring DNS, then attach a domain later via `brewnet domain connect`. Covers both "Named Tunnel only" install and Quick Tunnel → Named Tunnel migration.

**Independent Test (init)**: `brewnet init` → option 4 → cloudflared running with TUNNEL_TOKEN → no DNS records in CF dashboard → Step 7 shows `brewnet domain connect` hint.
**Independent Test (connect)**: `brewnet domain connect` after option 4 → DNS CNAMEs created → services accessible. Also: `brewnet domain connect` after option 1 (Quick Tunnel) → new Named Tunnel created → Quick Tunnel stops → DNS created → services accessible.

- [x] T025 [US4] Implement Scenario 4 flow in `domain-network.ts`: set `tunnelMode='named'`, `provider='tunnel'`, run CF API token verification + tunnel creation only (no `configureTunnelIngress`, no `createDnsRecord`), deploy cloudflared container with TUNNEL_TOKEN, leave `zoneId` + `zoneName` empty — `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T026 [US4] Update Scenario 4 Step 7 display: show tunnel name + ID, display "터널 생성 완료 — 도메인 연결: `brewnet domain connect`" — `packages/cli/src/wizard/steps/complete.ts`
- [x] T027 [US4] Implement `brewnet domain connect` command — Path A (tunnelMode='quick'): create Named Tunnel, configure ingress, create CNAME records, update docker-compose, restart cloudflared with TUNNEL_TOKEN, stop Quick Tunnel, persist state — `packages/cli/src/commands/domain.ts`
- [x] T028 [US4] Implement `brewnet domain connect` command — Path B (tunnelMode='named', zoneId=''): use existing tunnelId, call `configureTunnelIngress` + `createDnsRecord` (upsert) for all enabled services, persist zoneId + zoneName — `packages/cli/src/commands/domain.ts`
- [x] T029 [US4] Implement `brewnet domain connect` command — Path C (tunnelMode='named', zoneId set): GET current ingress from CF API, upsert missing ingress rules + CNAME records — `packages/cli/src/commands/domain.ts`
- [x] T030 [US4] Add `DOMAIN_CONNECT` TunnelLogger event + clear apiToken from state after domain connect completes — `packages/cli/src/commands/domain.ts`
- [x] T031 [US4] Add guard: if `tunnelMode='none'` or `'local'`, `brewnet domain connect` exits with error "이 프로젝트는 터널 없이 시작되었습니다. `brewnet init`을 다시 실행하세요." — `packages/cli/src/commands/domain.ts`

**Checkpoint**: `brewnet init` option 4 → no DNS records in CF → `brewnet domain connect` → DNS created → services accessible. AND: `brewnet init` option 1 → `brewnet domain connect` → Named Tunnel created, Quick Tunnel stopped, services accessible at subdomains.

---

## Phase 7: Tests

**Purpose**: Verify all 4 user story flows with unit and integration tests.

### Unit Tests (parallelizable)

- [X] T032 [P] Unit tests for `fetchWithRetry()`: 3× failure → final throw, 2× failure → 3rd success, 401 not retried, 429 retried, network error retried — `tests/unit/cli/services/cloudflare-client.test.ts`
- [X] T033 [P] Unit tests for `deleteTunnel()`: success case, HTTP 400 active connections error, HTTP 404 not found error — `tests/unit/cli/services/cloudflare-client.test.ts`
- [X] T034 [P] Unit tests for `QuickTunnelManager`: URL regex matches valid `*.trycloudflare.com` output, rejects non-matching output, 30s timeout fires, `stop()` stops container — `tests/unit/cli/services/quick-tunnel.test.ts`
- [X] T035 [P] Unit tests for `TunnelLogger`: event written as valid JSON line, `apiToken` not present in any field, `tunnelToken` not present, log file created if missing, multiple events append correctly — `tests/unit/cli/utils/tunnel-logger.test.ts`
- [X] T036 [P] Unit tests for `brewnet domain connect` — Path A: tunnelMode changes to 'named', new tunnelId persisted, old Quick Tunnel container stopped — `tests/unit/cli/commands/domain-connect.test.ts`
- [X] T037 [P] Unit tests for `brewnet domain connect` — Path B: existing tunnelId reused, DNS records created, zoneId persisted — `tests/unit/cli/commands/domain-connect.test.ts`
- [X] T038 [P] Unit tests for `brewnet domain connect` — CNAME conflict: existing record updated (upserted) not duplicated — `tests/unit/cli/commands/domain-connect.test.ts`

### Integration Tests (wizard scenarios)

- [X] T039 Integration test — Scenario 1 (Quick Tunnel): mock Docker API + cloudflared log output, assert `quickTunnelUrl` set, `tunnelMode='quick'`, Traefik path-prefix labels in compose output — `tests/integration/wizard/domain-network.test.ts`
- [X] T040 Integration test — Scenario 2 success (Named Tunnel): mock CF API (verifyToken, getAccounts, getZones, createTunnel, configureTunnelIngress, createDnsRecord, tunnel health=healthy), assert all state fields set, `apiToken` cleared — `tests/integration/wizard/domain-network.test.ts`
- [X] T041 Integration test — Scenario 2 rollback: mock CF API tunnel creation succeeds then DNS fails, assert `deleteTunnel` called, error message displayed — `tests/integration/wizard/domain-network.test.ts`
- [X] T042 Integration test — Scenario 3: Quick Tunnel starts, Enter pressed, Named Tunnel completes, `QuickTunnelManager.stop()` called — `tests/integration/wizard/domain-network.test.ts`
- [X] T043 Integration test — Scenario 4: tunnel created, `zoneId` empty, `configureTunnelIngress` NOT called, `createDnsRecord` NOT called — `tests/integration/wizard/domain-network.test.ts`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T044 [P] Add `--help` documentation for all new `domain` subcommands: `domain connect`, `domain tunnel status`, `domain tunnel restart` — `packages/cli/src/commands/domain.ts`
- [X] T045 [P] Add JSDoc comments to all exported functions: `TunnelLogger`, `QuickTunnelManager`, `fetchWithRetry`, `deleteTunnel`, domain command handlers — all new/modified files
- [X] T046 Run `pnpm lint` across packages/cli and packages/shared, fix any ESLint errors
- [ ] T047 Run quickstart.md acceptance checklist manually — verify all 11 checklist items pass end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Types)     → no dependencies — START HERE
Phase 2 (Foundation) → depends on Phase 1 — BLOCKS all user story phases
Phase 3 (US1)       → depends on Phase 2 — quick-tunnel.ts + Scenario 1 wizard
Phase 4 (US2)       → depends on Phase 2 — wraps existing flow + new commands
Phase 5 (US3)       → depends on Phase 3 (reuses QuickTunnelManager from T010)
Phase 6 (US4)       → depends on Phase 2 (reuses deleteTunnel) + domain.ts from T019
Phase 7 (Tests)     → depends on all implementation phases
Phase 8 (Polish)    → depends on Phase 7
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. Independent — Quick Tunnel is self-contained.
- **US2 (P2)**: Depends on Phase 2 only. Independent — wraps existing flow + new commands.
- **US3 (P3)**: Depends on US1 (reuses `QuickTunnelManager` from T010).
- **US4 (P4)**: Depends on Phase 2 + T019 (domain.ts skeleton from US2 phase). `brewnet domain connect` extends the skeleton.

### Within Each User Story

- Shared utilities (T007/T008/T009) → before any wizard flow changes
- Wizard Step 4 selector (T012) → before individual scenario flows (T013, T015, T023, T025)
- domain.ts skeleton (T019) → before individual subcommand implementations (T020, T021, T027-T031)

### Parallel Opportunities

- Phase 1: T001, T002, T003, T004 can all run in parallel (same file, but distinct sections)
- Phase 2: T006 (tunnel-logger), T007+T008 (cloudflare-client) can run in parallel; T009 is independent
- Phase 3: T010 (quick-tunnel.ts) + T011 (compose labels) can run in parallel
- Phase 4: T015-T018 (wizard changes) + T019 (domain.ts skeleton) can run in parallel
- Phase 7: ALL unit tests (T032–T038) can run in parallel

---

## Parallel Example: Phase 2

```bash
# These can run simultaneously (different files):
Task: "Create TunnelLogger in packages/cli/src/utils/tunnel-logger.ts"       # T006
Task: "Add fetchWithRetry() to cloudflare-client.ts"                          # T007
Task: "Add deleteTunnel() to cloudflare-client.ts"                            # T008
# Note: T007 and T008 modify the same file — run sequentially or coordinate
Task: "Update compose-generator.ts cloudflared branching"                     # T009
```

## Parallel Example: Phase 7 Unit Tests

```bash
# All parallelizable (different test files):
Task: "Test fetchWithRetry() in cloudflare-client.test.ts"                    # T032
Task: "Test deleteTunnel() in cloudflare-client.test.ts"                      # T033
Task: "Test QuickTunnelManager in quick-tunnel.test.ts"                       # T034
Task: "Test TunnelLogger in tunnel-logger.test.ts"                            # T035
Task: "Test domain connect Path A/B/CNAME in domain-connect.test.ts"         # T036-T038
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — Quick Tunnel)

1. Complete Phase 1 (Types) — T001–T005
2. Complete Phase 2 Foundation — T006–T009
3. Complete Phase 3 US1 — T010–T014
4. **STOP AND VALIDATE**: Quick Tunnel URL appears in Step 7, browser access works, tunnel.log created
5. Demo immediately — zero prerequisites for end users

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → Quick Tunnel MVP ✅ (immediate user value, zero prereqs)
3. Phase 4 → Named Tunnel + `domain tunnel status/restart` ✅ (production-ready path)
4. Phase 5 → Guided domain purchase flow ✅ (removes "I don't have a domain" dead-end)
5. Phase 6 → `brewnet domain connect` ✅ (closes the Quick Tunnel → permanent URL upgrade loop)
6. Phase 7 + 8 → Tests + polish

### Solo Developer Path (Recommended Sequence)

```
T001→T002→T003→T004→T005  (types + build)
T006, T007+T008, T009      (foundation — T007+T008 sequential; others parallel)
T010, T011                 (quick-tunnel + compose labels — parallel)
T012→T013→T014             (wizard Scenario 1 — sequential)
T019                       (domain.ts skeleton)
T015→T016→T017→T018        (wizard Scenario 2 — sequential)
T020→T021→T022             (tunnel status/restart commands)
T023→T024                  (wizard Scenario 3)
T025→T026→T027→T028→T029→T030→T031  (wizard Scenario 4 + domain connect)
T032–T043                  (tests — batch parallelizable)
T044–T047                  (polish)
```

---

## Notes

- `[P]` tasks = different files or independent sections, no shared in-progress dependencies
- `[Story]` label maps each task to a specific user story for traceability
- Each phase (3–6) is independently completable and testable
- API token (`apiToken`) MUST be cleared from state before any file write — enforced in T016, T030
- `tunnel.log` MUST never contain raw `apiToken` or `tunnelToken` — enforced in T006, T035
- Rollback (T016) must also attempt to delete any CNAME records created before the failure
- Upsert pattern (create-or-update) applies to all DNS record operations in `brewnet domain connect`
