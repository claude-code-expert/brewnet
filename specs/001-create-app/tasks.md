# Tasks: brewnet create-app — App Scaffolding Command

**Input**: Design documents from `/specs/001-create-app/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Unit tests included for core business logic (catalog, env generation, health polling) per plan.md Testing section.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All file paths are relative to the repo root

## Source Files (new)

```
packages/shared/src/types/create-app.ts        — StackEntry, CreateAppOptions, StackHealthResult
packages/cli/src/config/stacks.ts              — 16-stack catalog + helper functions
packages/cli/src/services/boilerplate-manager.ts — Clone, env gen, startup, health polling
packages/cli/src/commands/create-app.ts        — Command handler + orchestration
packages/cli/src/index.ts                      — MODIFY: register new command
tests/unit/cli/create-app/stacks.test.ts           — Catalog unit tests
tests/unit/cli/create-app/env-generation.test.ts   — .env substitution unit tests
tests/unit/cli/create-app/health-polling.test.ts   — HTTP health polling unit tests
```

---

## Phase 1: Setup

**Purpose**: Create shared type definitions that all other files import

- [x] T001 Create `packages/shared/src/types/create-app.ts` with `StackEntry`, `CreateAppOptions` (`{ stack?: string; database: 'sqlite3' | 'postgres' | 'mysql' }`), and `StackHealthResult` (`{ healthy: boolean; elapsedMs: number; dbConnected?: boolean; error?: string }`) interfaces per data-model.md
- [x] T002 Export new types from `packages/shared/src/index.ts` by adding `export * from './types/create-app.js'`

**Checkpoint**: Shared types are importable by all CLI packages

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stack catalog and boilerplate-manager service — MUST be complete before any user story command can be tested

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create `packages/cli/src/config/stacks.ts`: define `STACK_CATALOG` array with all 16 `StackEntry` entries (exact IDs, languages, frameworks, versions, ORM, `isUnified`, `buildSlow` flags from data-model.md), `VALID_STACK_IDS` derived constant, `VALID_DB_DRIVERS = ['sqlite3', 'postgres', 'mysql'] as const`, `getStackById(id: string): StackEntry | undefined`, and `getStacksByLanguage(): Record<string, StackEntry[]>` helper
- [x] T004 [P] Create `packages/cli/src/services/boilerplate-manager.ts`: implement `cloneStack(stackId: string, projectDir: string): Promise<void>` using `execa('git', ['clone', '--depth=1', '-b', \`stack/${stackId}\`, REPO_URL, projectDir])`; export `REPO_URL = 'https://github.com/claude-code-expert/brewnet-boilerplate.git'` constant
- [x] T005 [P] Add `reinitGit(projectDir: string): Promise<void>` to `boilerplate-manager.ts`: run `rm -rf .git` via execa (or `fs.rmSync(.git, {recursive:true})`), then `git init`, `git add -A`, `git commit -m "chore: initial project from brewnet create-app"` — all cwd set to projectDir
- [x] T006 Add `generateEnv(projectDir: string, stackId: string, dbDriver: string): void` to `boilerplate-manager.ts`: read `.env.example`, generate 3 secrets with `crypto.randomBytes(32).toString('hex')`, replace `DB_DRIVER`, `DB_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` lines using regex, write `.env`; also handle postgres/mysql driver substitutions and Node.js/Prisma vars (`PRISMA_DB_PROVIDER`, `DATABASE_URL`) in the same implementation — the full multi-driver scope was implemented at once rather than incrementally as originally described (Phases 5 content merged here)
- [x] T007 Add `startContainers(projectDir: string): Promise<void>` to `boilerplate-manager.ts` using `execa('docker', ['compose', 'up', '-d', '--build'], { cwd: projectDir })`
- [x] T008 Add `pollHealth(baseUrl: string, timeoutMs: number): Promise<StackHealthResult>` to `boilerplate-manager.ts`: loop `fetch(\`${baseUrl}/health\`, { signal: AbortSignal.timeout(3000) })`, check `body.status === 'ok'`, sleep 1000ms between attempts; return `{ healthy, elapsedMs, dbConnected }` — use `http://127.0.0.1` (not localhost) per research.md decision #2
- [x] T009 Add `verifyEndpoints(baseUrl: string): Promise<void>` to `boilerplate-manager.ts`: GET `/api/hello` (assert `body.message` exists) then POST `/api/echo` with `{"test":"brewnet"}` (assert `body.test === 'brewnet'`); throw descriptive error on failure

**Checkpoint**: Foundation complete — all service functions exist. Can now run integration test from quickstart.md manually (without command handler) by calling functions directly.

---

## Phase 3: User Story 1 — Zero-Config Interactive Scaffold (Priority: P1) 🎯 MVP

**Goal**: `brewnet create-app <project-name>` with no flags runs interactive prompts, scaffolds a stack, starts containers, and prints a success box

**Independent Test**: Run `brewnet create-app test-go` (no flags), select "Go" → "Gin", verify success box appears and `http://localhost:8080/health` returns `{"status":"ok",...}`

- [x] T010 [US1] Create `packages/cli/src/commands/create-app.ts`: define `CreateAppCommandOptions` interface, export `registerCreateAppCommand(program: Command): void`, add Commander.js command `create-app <project-name>` with description "Scaffold a full-stack app from a pre-built boilerplate stack" and `--help` text showing usage examples
- [x] T011 [US1] Add `selectStackInteractively(): Promise<StackEntry>` function in `create-app.ts`: first `select` prompt "Select a language" (6 choices from `getStacksByLanguage()` keys), then `select` prompt "Select a framework" filtered to that language's stacks; return the matching `StackEntry`
- [x] T012 [US1] Implement the 10-step command handler body in `create-app.ts` wiring steps in order: resolve stack (interactive when no `--stack` flag), resolve projectDir as `path.resolve(projectName)`, spinner "Cloning stack…" → `cloneStack()`, spinner "Generating .env…" → `generateEnv(projectDir, stackId, 'sqlite3')`, spinner "Initializing git…" → `reinitGit()`, spinner "Building and starting containers…" → `startContainers()`, spinner "Waiting for backend…" → `pollHealth(baseUrl, 120_000)`, spinner "Verifying API…" → `verifyEndpoints()`
- [x] T013 [US1] Add `printSuccessBox(projectName: string, stack: StackEntry, dbDriver: string): void` in `create-app.ts` using `chalk` box-drawing characters; show Frontend/Backend URLs (port 3000 only for `isUnified` stacks, both 3000+8080 for standard), stack name, database, and `cd <project> && make logs / make down` hints
- [x] T014 [US1] Register create-app command in `packages/cli/src/index.ts`: add `import { registerCreateAppCommand } from './commands/create-app.js'` and call `registerCreateAppCommand(program)` alongside existing commands

**Checkpoint**: `brewnet create-app my-app` works end-to-end with interactive selection and sqlite3 default. US1 is independently testable per quickstart.md Test Case 1 and 2.

---

## Phase 4: User Story 2 — Direct Stack Flag (Priority: P2)

**Goal**: `brewnet create-app <name> --stack go-gin` skips interactive prompts and proceeds directly

**Independent Test**: Run `brewnet create-app ci-test --stack nodejs-express` in a non-interactive shell (no TTY); command completes without prompting, app starts successfully

- [x] T015 [US2] Add `--stack <STACK_ID>` option to Commander.js command in `create-app.ts` and update handler: when `--stack` is provided, call `getStackById(stackId)` — if `undefined`, print error listing all 16 valid IDs and exit with code 1; skip `selectStackInteractively()` entirely
- [x] T016 [US2] Add `--database <DB_DRIVER>` option to Commander.js command in `create-app.ts` with default `'sqlite3'` and validation against `VALID_DB_DRIVERS`; pass resolved `dbDriver` through to `generateEnv()` call (sqlite3 behavior unchanged, postgres/mysql support added in Phase 5)

**Checkpoint**: `brewnet create-app test --stack go-gin` completes without prompts. US2 independently testable per quickstart.md Test Case 1 (using `--stack`).

---

## Phase 5: User Story 3 — Database Driver Selection (Priority: P2)

**Goal**: `brewnet create-app <name> --stack nodejs-express --database postgres` starts app with PostgreSQL container

**Independent Test**: Run `brewnet create-app test-pg --stack nodejs-express --database postgres`; verify `curl http://localhost:8080/health | jq .db_connected` returns `true`

- [x] T017 [US3] Extend `generateEnv()` in `boilerplate-manager.ts` for postgres and mysql paths: replace `DB_DRIVER` line with selected driver, generate distinct secrets for `DB_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`; for `postgres` path set `DB_PASSWORD` secret; for `mysql` path set both `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` secrets
- [x] T018 [US3] Add Node.js/Prisma env var injection to `generateEnv()`: when `stackId.startsWith('nodejs-')`, map driver to `PRISMA_DB_PROVIDER` (`sqlite3→sqlite`, `postgres→postgresql`, `mysql→mysql`) and build `DATABASE_URL` per connection URL table in data-model.md; replace `PRISMA_DB_PROVIDER=.*` and `DATABASE_URL=.*` lines in content

**Checkpoint**: All three `--database` values work. US3 independently testable per quickstart.md Test Case 3.

---

## Phase 6: User Story 4 — Rust Stack Warning (Priority: P3)

**Goal**: Selecting a Rust stack (`rust-actix-web`, `rust-axum`) shows a build warning and uses 600s health timeout

**Independent Test**: Run `brewnet create-app test-rust --stack rust-actix-web`; confirm warning message appears before build starts and health polling waits up to 600s

- [x] T019 [US4] Add Rust warning display in the command handler of `create-app.ts`: after stack is resolved and before starting containers, check `stack.buildSlow`; if true, print yellow warning `"⚠  Rust Warning: First build may take 3-10 minutes due to Rust compilation. Health check timeout extended to 10 minutes."` using `chalk.yellow`
- [x] T020 [US4] Wire `buildSlow` to timeout in `create-app.ts`: pass `stack.buildSlow ? 600_000 : 120_000` as the `timeoutMs` argument to `pollHealth()`; update spinner text to include `"(up to 10 min for Rust)"` when `buildSlow` is true

**Checkpoint**: Rust stacks show warning and get 600s timeout. US4 independently testable per quickstart.md Test Case 5.

---

## Phase 7: User Story 5 — Conflict Detection and Safe Abort (Priority: P3)

**Goal**: Running `create-app` against an existing directory or without Docker exits immediately with a clear error; partial directories are cleaned up on failure

**Independent Test**: `mkdir test-conflict && brewnet create-app test-conflict` → immediate error, no network requests; `rm -rf test-conflict`

- [x] T021 [US5] Add Docker pre-flight check in `create-app.ts` command handler (first action, before anything else): import and call `checkDocker()` from `../services/system-checker.js`; if result.status !== 'pass', throw `BrewnetError.dockerNotRunning()` (BN001) and exit process with code 1
- [x] T022 [US5] Add directory existence check in `create-app.ts` (second action, after Docker check): call `existsSync(projectDir)`; if true, print error `"Error: Directory \"${projectName}\" already exists.\n\n  Fix: choose a different name or remove the existing directory."` and exit with code 1
- [x] T023 [US5] Add partial-directory cleanup in `create-app.ts`: wrap the clone step in try/catch — on `cloneStack` failure, call `fs.rmSync(projectDir, { recursive: true, force: true })` if the directory was created, then re-throw error with message "Failed to clone boilerplate. Check your internet connection and try again."

**Checkpoint**: All pre-flight failures exit cleanly with no side effects. US5 independently testable per quickstart.md Error Test Cases.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Animated UX, edge-case error messages, and unit tests

- [x] T024 Update health-poll spinner in `create-app.ts` to show elapsed seconds: start a 1-second `setInterval` updating `spinner.text` to `"Waiting for backend to become healthy… (Xs elapsed)"` while `pollHealth()` runs; clear interval on resolution
- [x] T025 Add health-timeout error handling in `create-app.ts`: when `pollHealth()` returns `healthy: false`, print error with container debug hint (`cd ${projectName} && docker compose logs backend`) and note that containers are still running; exit code 1 (do NOT tear down containers)
- [x] T026 [P] Write unit tests in `tests/unit/cli/create-app/stacks.test.ts`: assert catalog has exactly 16 entries; all IDs are unique; only `nodejs-nextjs` and `nodejs-nextjs-full` have `isUnified=true`; only `rust-actix-web` and `rust-axum` have `buildSlow=true`; `getStackById('go-gin')` returns correct entry; `getStackById('invalid')` returns `undefined`
- [x] T027 [P] Write unit tests in `tests/unit/cli/create-app/env-generation.test.ts`: mock `fs.readFileSync` with a sample `.env.example`; assert that `generateEnv` produces `DB_DRIVER=sqlite3`, `DB_PASSWORD` with 64-char hex value, `MYSQL_PASSWORD` with 64-char hex, `MYSQL_ROOT_PASSWORD` with 64-char hex, and that original file formatting/comments are preserved; add test for `nodejs-express` stack with postgres driver asserting `PRISMA_DB_PROVIDER=postgresql` and `DATABASE_URL=postgresql://...`
- [x] T028 Write unit tests in `tests/unit/cli/create-app/health-polling.test.ts`: mock `fetch` to return `{"status":"ok","db_connected":true}` on 3rd attempt; assert `pollHealth` returns `{ healthy: true, elapsedMs: ~2000 }`; add timeout test where fetch always fails — assert `healthy: false` after timeout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — T003–T009 require T001, T002
  - T004 (cloneStack), T005 (reinitGit) can run in parallel after T003
  - T006–T009 can run in parallel after T003
- **Phase 3 (US1)**: Depends on Phase 2 — T010–T014 require all of T003–T009
  - T010, T011 can be written in sequence (same file)
  - T012 requires T011 (calls selectStackInteractively)
  - T013 requires T012 (calls functions defined there)
  - T014 requires T013 (registers command that must exist)
- **Phase 4 (US2)**: Depends on Phase 3 (T010 must exist before adding options)
- **Phase 5 (US3)**: Depends on Phase 4 (--database option built on Phase 4 command)
- **Phase 6 (US4)**: Depends on Phase 2 (needs stack.buildSlow from catalog) + Phase 3 (command must exist)
- **Phase 7 (US5)**: Depends on Phase 3 (command structure must exist)
- **Phase 8 (Polish)**: Depends on Phases 3–7 for animation/error tasks; test tasks [P] can start after Phase 2

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 foundational — no dependency on other user stories
- **US2 (P2)**: Depends on US1 (extends the same command file)
- **US3 (P2)**: Depends on US2 (--database option added alongside --stack)
- **US4 (P3)**: Depends on US3 (command + service both exist)
- **US5 (P3)**: Can run in parallel with US4 (different concerns in same file)

### Parallel Opportunities Within Each Phase

- **Phase 2**: T004 (cloneStack), T005 (reinitGit), T006 (generateEnv), T007 (startContainers), T008 (pollHealth), T009 (verifyEndpoints) — all add distinct functions to the same file but can be drafted by different agents (different function bodies)
- **Phase 8**: T026 (catalog tests) and T027 (env tests) are in different files — run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```text
# All boilerplate-manager functions can be drafted in parallel
# (different functions in the same file — merge after review):

Task A: "Implement cloneStack() in packages/cli/src/services/boilerplate-manager.ts"
Task B: "Implement reinitGit() in packages/cli/src/services/boilerplate-manager.ts"
Task C: "Implement generateEnv() (sqlite3 path) in packages/cli/src/services/boilerplate-manager.ts"
Task D: "Implement startContainers() in packages/cli/src/services/boilerplate-manager.ts"
Task E: "Implement pollHealth() in packages/cli/src/services/boilerplate-manager.ts"
Task F: "Implement verifyEndpoints() in packages/cli/src/services/boilerplate-manager.ts"
```

## Parallel Example: Phase 8 (Tests)

```text
# Test files are independent:
Task: "T026 Write stacks.test.ts"       → tests/unit/cli/create-app/stacks.test.ts
Task: "T027 Write env-generation.test.ts" → tests/unit/cli/create-app/env-generation.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup — T001, T002
2. Complete Phase 2: Foundational — T003–T009
3. Complete Phase 3: US1 — T010–T014
4. **STOP and VALIDATE** with quickstart.md Test Case 2 (interactive) and Test Case 1 (with `--stack`)
5. `brewnet create-app my-app` is fully functional for sqlite3 with interactive selection

### Incremental Delivery

1. Phase 1 + 2 → engine ready (no command yet)
2. Phase 3 (US1) → interactive scaffold works, default sqlite3 ← **MVP Demo**
3. Phase 4 (US2) → `--stack` flag works for CI/scripts
4. Phase 5 (US3) → `--database postgres/mysql` works
5. Phase 6 (US4) → Rust stacks work safely with warning
6. Phase 7 (US5) → Pre-flight checks protect against errors
7. Phase 8 → Tests + polish

### Task Count Summary

| Phase | Tasks | User Story |
|-------|-------|-----------|
| Phase 1: Setup | T001–T002 | — |
| Phase 2: Foundational | T003–T009 | — |
| Phase 3: US1 (P1) | T010–T014 | US1 |
| Phase 4: US2 (P2) | T015–T016 | US2 |
| Phase 5: US3 (P2) | T017–T018 | US3 |
| Phase 6: US4 (P3) | T019–T020 | US4 |
| Phase 7: US5 (P3) | T021–T023 | US5 |
| Phase 8: Polish | T024–T028 | — |
| **Total** | **28 tasks** | **5 stories** |

---

## Notes

- All imports must use `.js` extension (ESM requirement: `import from './stacks.js'`)
- `boilerplate-manager.ts` is a pure-function module (no class, no state) — easier to test
- `checkDocker()` already handles all Docker validation cases; reuse directly
- The `generateEnv` function must NOT display secrets in any logs or terminal output (SC-003)
- Health polling uses `http://127.0.0.1` (NOT `http://localhost`) — Alpine IPv6 issue
- Commit after each phase checkpoint, not after every individual task
