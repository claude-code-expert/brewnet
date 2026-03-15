# Tasks: Centralized Logging System

**Input**: Design documents from `/specs/004-centralized-logging/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Test tasks included for new modules only (log-aggregator, log-rotation) as they are critical infrastructure.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but US2 (Docker infrastructure) is a prerequisite for US1 (aggregator needs access logs to read). Execution order: US2 → US1 → US3/US4 (parallel).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Types & Constants)

**Purpose**: Define shared types and constants that all phases depend on

- [x] T001 [P] Create logging types (LogSource, UnifiedLogLevel, UnifiedLogEntry, LogQuery, LogQueryResult, LogStats) in `packages/shared/src/types/logging.ts`
- [x] T002 [P] Add logging constants (DOCKER_LOG_MAX_SIZE, DOCKER_LOG_MAX_FILES, CLI_LOG_RETENTION_DAYS, ACCESS_LOG_MAX_BYTES, LOG_QUERY_DEFAULT_LIMIT, LOG_QUERY_MAX_LIMIT, LOG_POLL_INTERVAL_MS) to `packages/shared/src/utils/constants.ts`
- [x] T003 Export new logging types and constants from `packages/shared/src/index.ts`

**Checkpoint**: Shared types available — `pnpm -C packages/shared build` passes

---

## Phase 2: User Story 2 — Docker Log Rotation & Access Logging (Priority: P1)

**Goal**: All Docker services get json-file log rotation; Traefik writes JSON access logs

**Independent Test**: Generate a docker-compose.yml and verify every service has `logging` field, Traefik has accesslog flags and `./logs:/logs` volume

### Implementation for User Story 2

- [x] T004 [US2] Add `ComposeLogging` interface and `logging?: ComposeLogging` field to `ComposeService` interface in `packages/cli/src/services/compose-generator.ts` (after L43)
- [x] T005 [US2] Add `getLoggingConfig()` helper function returning json-file driver config with DOCKER_LOG_MAX_SIZE/DOCKER_LOG_MAX_FILES constants in `packages/cli/src/services/compose-generator.ts`
- [x] T006 [US2] Inject `svc.logging = getLoggingConfig()` in `buildComposeService()` in `packages/cli/src/services/compose-generator.ts` (after volumes assignment ~L674)
- [x] T007 [US2] Add `./logs:/logs` to Traefik volumes in `getServiceVolumes()` case `'traefik'` in `packages/cli/src/services/compose-generator.ts` (L66)
- [x] T008 [US2] Add Traefik accesslog command flags (`--accesslog=true`, `--accesslog.filepath=/logs/access.log`, `--accesslog.format=json`, `--accesslog.bufferingsize=100`, header field config) to Traefik command array in `buildComposeService()` in `packages/cli/src/services/compose-generator.ts` (~L743)
- [x] T009 [US2] Add logging field assertions and Traefik accesslog flag tests to `tests/unit/cli/services/compose-generator.test.ts`

**Checkpoint**: `npm test` passes — compose-generator outputs logging config for all services, Traefik has accesslog flags

---

## Phase 3: User Story 1 — Unified Log Viewing via CLI (Priority: P1) 🎯 MVP

**Goal**: `brewnet logs --all/--source/--level/--since/--json` reads 4 sources and displays unified output

**Independent Test**: Run `brewnet logs --all` and verify entries from CLI JSONL, Tunnel NDJSON, Traefik access log, and Docker container logs appear sorted by timestamp

### Implementation for User Story 1

- [x] T010 [US1] Create `parseDuration()` utility function (Nh/Nm/Nd/ISO parsing) in `packages/cli/src/utils/log-aggregator.ts`
- [x] T011 [US1] Implement `readCliLogs(logsDir, since?)` — glob `brewnet-*.log`, JSONL parse, transform to UnifiedLogEntry in `packages/cli/src/utils/log-aggregator.ts`
- [x] T012 [US1] Implement `readTunnelLogs(logsDir, since?)` — parse `tunnel.log` NDJSON, transform to UnifiedLogEntry in `packages/cli/src/utils/log-aggregator.ts`
- [x] T013 [US1] Implement `readAccessLogs(projectPath, since?)` — parse Traefik JSON access log, status-to-level mapping (>=500→error, >=400→warn, else→info) in `packages/cli/src/utils/log-aggregator.ts`
- [x] T014 [US1] Implement `readServiceLogs(projectPath, opts?)` — dockerode container.logs() with 8-byte multiplexed stream parsing, stdout→info/stderr→error in `packages/cli/src/utils/log-aggregator.ts`
- [x] T015 [US1] Implement `queryLogs(query, projectPath)` — parallel source reading, merge/filter/sort/paginate, return LogQueryResult in `packages/cli/src/utils/log-aggregator.ts`
- [x] T016 [US1] Implement `getLogStats(projectPath)` — compute LogStats from all sources in `packages/cli/src/utils/log-aggregator.ts`
- [x] T017 [US1] Add `--all`, `--source`, `--level`, `--since`, `--json` options to logs command in `packages/cli/src/commands/logs.ts`
- [x] T018 [US1] Implement aggregator branch logic — when new flags present, call queryLogs() and format output (colored table or JSON lines) in `packages/cli/src/commands/logs.ts`
- [x] T019 [US1] Add error handling for invalid flag values (--source, --level, --since) and flag conflicts (--follow + --all, --json without aggregator flags) in `packages/cli/src/commands/logs.ts`
- [x] T020 [US1] Create unit tests for log-aggregator (readCliLogs, readTunnelLogs, readAccessLogs, parseDuration, queryLogs filter/sort/paginate) in `tests/unit/cli/utils/log-aggregator.test.ts`

**Checkpoint**: `brewnet logs --all` shows unified logs from all sources — `npm test` passes with new log-aggregator tests

---

## Phase 4: User Story 3 — Admin Panel Log Viewer (Priority: P2)

**Goal**: Admin Panel Logs tab with filter controls, auto-refresh, and API endpoints

**Independent Test**: Open Admin Panel, click Logs tab, verify logs appear with source/level/service filters and 5-second auto-refresh

### Implementation for User Story 3

- [x] T021 [US3] Add `GET /api/logs` endpoint — parse query params to LogQuery, call queryLogs(), return LogQueryResult JSON in `packages/cli/src/services/admin-server.ts` (API routing section ~L1072)
- [x] T022 [US3] Add `GET /api/logs/stats` endpoint — call getLogStats(), return LogStats JSON in `packages/cli/src/services/admin-server.ts`
- [x] T023 [US3] Add tab bar HTML (Services | Logs) with tab switching JavaScript to `generateDashboardHtml()` in `packages/cli/src/services/admin-server.ts`
- [x] T024 [US3] Add Logs tab content — filter controls (source dropdown, level buttons, service dropdown, auto-refresh toggle) and log table container in `packages/cli/src/services/admin-server.ts`
- [x] T025 [US3] Add Logs tab JavaScript — fetchLogs(), 5-second polling with auto-refresh toggle, filter state management, log entry rendering with source/level colors in `packages/cli/src/services/admin-server.ts`
- [x] T026 [US3] Rename existing `#log` div section title from "Log" to "Activity" in `packages/cli/src/services/admin-server.ts`

**Checkpoint**: Admin Panel shows Logs tab with working filters and auto-refresh — API returns valid LogQueryResult

---

## Phase 5: User Story 4 — Log Rotation for Non-Docker Sources (Priority: P2)

**Goal**: CLI logs cleaned after 30 days, Tunnel/Access logs rotated via copytruncate at 50MB

**Independent Test**: Create oversized test files and verify rotation triggers correctly

### Implementation for User Story 4

- [x] T027 [P] [US4] Implement `cleanOldCliLogs(logsDir, retentionDays)` — glob `brewnet-*.log`, parse date from filename, delete files older than threshold in `packages/cli/src/utils/log-rotation.ts`
- [x] T028 [P] [US4] Implement `rotateLargeFile(filePath, maxBytes, maxFiles)` — copytruncate strategy (copy → shift existing → truncate original) in `packages/cli/src/utils/log-rotation.ts`
- [x] T029 [US4] Implement `runRotation(logsDir, projectPath)` — orchestrate rotation for CLI, Tunnel, and Access log files using appropriate strategy per source in `packages/cli/src/utils/log-rotation.ts`
- [x] T030 [US4] Add `cleanOldCliLogs()` call in `createLogger()` initialization (with try-catch to prevent logger creation failure) in `packages/cli/src/utils/logger.ts` (~L50)
- [x] T031 [US4] Add rotation trigger in `queryLogs()` — call `runRotation()` before reading sources in `packages/cli/src/utils/log-aggregator.ts`
- [x] T032 [US4] Create unit tests for log-rotation (cleanOldCliLogs date filtering, rotateLargeFile copytruncate behavior, file shifting) in `tests/unit/cli/utils/log-rotation.test.ts`

**Checkpoint**: Log files are automatically managed — old CLI logs deleted, oversized files rotated — `npm test` passes

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T033 Run full test suite (`npm test && npm run lint`) and fix any failures
- [x] T034 Run quickstart.md verification steps end-to-end
- [x] T035 Verify backward compatibility — `brewnet logs`, `brewnet logs -f`, `brewnet logs gitea` work unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US2 — Docker infra)**: Depends on Phase 1 (needs logging constants)
- **Phase 3 (US1 — CLI aggregator)**: Depends on Phase 1 (needs shared types) + Phase 2 (needs access log to exist)
- **Phase 4 (US3 — Admin Panel)**: Depends on Phase 3 (needs queryLogs/getLogStats)
- **Phase 5 (US4 — File rotation)**: Depends on Phase 1 (needs constants); can run in parallel with Phase 4
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US2 (P1, Docker infra)**: Depends on Setup only — provides access log data for US1
- **US1 (P1, CLI aggregator)**: Depends on Setup + US2 — core module used by US3
- **US3 (P2, Admin Panel)**: Depends on US1 — uses queryLogs() and getLogStats()
- **US4 (P2, File rotation)**: Depends on Setup only — can start after Phase 1, parallel with US3

### Within Each User Story

- Types/constants before implementation
- Core functions before consumers
- Implementation before tests

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T027 and T028 can run in parallel (independent functions in same new file)
- Phase 4 (US3) and Phase 5 (US4) can run in parallel after Phase 3 completes

---

## Parallel Example: Phase 1 Setup

```bash
# Launch both setup tasks together:
Task T001: "Create logging types in packages/shared/src/types/logging.ts"
Task T002: "Add logging constants to packages/shared/src/utils/constants.ts"
# Then sequentially:
Task T003: "Export from packages/shared/src/index.ts" (depends on T001, T002)
```

## Parallel Example: Phase 5 (US4)

```bash
# Launch both rotation functions together:
Task T027: "Implement cleanOldCliLogs() in packages/cli/src/utils/log-rotation.ts"
Task T028: "Implement rotateLargeFile() in packages/cli/src/utils/log-rotation.ts"
# Then sequentially:
Task T029: "Implement runRotation() orchestrator" (depends on T027, T028)
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup (shared types + constants)
2. Complete Phase 2: US2 (Docker log rotation + Traefik access log)
3. Complete Phase 3: US1 (Log Aggregator + CLI extension)
4. **STOP and VALIDATE**: `brewnet logs --all` shows unified view from all sources
5. This delivers SC-001, SC-002, SC-004, SC-007

### Incremental Delivery

1. Setup + US2 → Docker log rotation working, access logs generated
2. + US1 → Unified CLI log viewing (MVP!)
3. + US3 → Admin Panel log viewer (full web experience)
4. + US4 → File rotation (production hardening)
5. Each increment adds value without breaking previous work

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 before US1 because US1's aggregator needs Traefik access logs to exist
- US3 and US4 can be implemented in parallel after US1
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
