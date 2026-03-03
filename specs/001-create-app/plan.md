# Implementation Plan: brewnet create-app — App Scaffolding Command

**Branch**: `001-create-app` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-create-app/spec.md`

## Summary

Add `brewnet create-app <project-name>` CLI command that scaffolds a running full-stack application from one of 16 Docker-based boilerplate stacks hosted on the `brewnet-boilerplate` GitHub repository. The command clones the selected stack as a shallow copy, auto-generates `.env` with cryptographically secure secrets (no user input), starts containers, polls the health endpoint until ready, verifies API endpoints, and prints a success box with URLs and management commands — all within 2 minutes for non-Rust stacks.

The implementation adds three new source files to the existing monorepo CLI package and one shared type module, following established patterns from `domain.ts` (command registration), `system-checker.ts` (Docker validation), and `health-checker.ts` (polling logic).

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+
**Primary Dependencies**: Commander.js, @inquirer/prompts, chalk, ora, execa, zod, node:crypto (built-in), node:fs (built-in)
**Storage**: N/A (no `~/.brewnet/db/` writes; scaffolded project is self-contained on disk)
**Testing**: Jest 29.x — unit tests for catalog validation, env generation, health polling logic
**Target Platform**: macOS (darwin), Linux (Ubuntu/Debian, CentOS/RHEL)
**Project Type**: CLI command extension — adds `create-app` subcommand to existing Commander.js program
**Performance Goals**: Non-Rust stacks: scaffold + running app within 2 minutes; Rust stacks: within 10 minutes
**Constraints**: Health polling must use `127.0.0.1` (not `localhost`) to avoid Alpine IPv6 resolution failure; clone requires internet access (only network-required step)
**Scale/Scope**: 16 stacks, single-user CLI operation; one `create-app` command registered alongside 12 existing commands

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero Config | ✅ PASS | `brewnet create-app my-app` requires no flags; DB defaults to `sqlite3`, stack resolved interactively, all secrets auto-generated |
| II. Secure by Default | ✅ PASS | `crypto.randomBytes(32).toString('hex')` for all DB passwords; secrets never printed to terminal or logs |
| III. Transparent Operations | ✅ PASS | Spinner per step (clone, env gen, build, health poll); spinner text shows what step is running; success box on completion |
| IV. Reversible Actions | ✅ PASS | Command only creates a new directory; no existing state modified; partial directory cleaned up on Ctrl+C/error |
| V. Offline First | ⚠️ ACCEPTABLE | Clone requires internet — inherent to the feature; clearly documented in error handling; all other steps (env gen, container start, health check) are fully offline |

### Complexity Tracking: Offline First Exception

| Item | Detail |
|------|--------|
| Principle | V. Offline First — "Core CLI works without internet (except Docker pulls)" |
| Carve-out | `brewnet create-app` performs `git clone` from GitHub — this is architecturally unavoidable because the boilerplate stacks are hosted remotely. All 15 remaining steps (env generation, git reinit, docker compose, health polling, API verification) are fully offline. |
| User impact | Single network request at step 1; subsequent steps do not require connectivity. On failure, BN006 `cloneFailed` error code provides a clear diagnosis and retry instruction. |
| Justification | The feature's core value is zero-config scaffolding from pre-built stacks. Local-disk caching of stacks is out of scope (no `brewnet update` mechanism for stack catalog in this version). |
| Mitigation | Clone failure immediately terminates with BN006 and removes any partial directory; no user data is lost. |

## Project Structure

### Documentation (this feature)

```text
specs/001-create-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-command.md   # create-app command schema
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── shared/
│   └── src/
│       └── types/
│           └── create-app.ts          # NEW: StackEntry, CreateAppOptions, StackHealth
│
└── cli/
    └── src/
        ├── index.ts                   # MODIFY: register create-app command
        ├── commands/
        │   └── create-app.ts          # NEW: Command handler + orchestration
        ├── services/
        │   └── boilerplate-manager.ts # NEW: Clone, env gen, startup, health polling
        └── config/
            └── stacks.ts              # NEW: 16-stack catalog

tests/
├── unit/
│   ├── create-app/
│   │   ├── stacks.test.ts             # Stack catalog completeness + ID validation
│   │   ├── env-generation.test.ts     # .env substitution logic
│   │   └── health-polling.test.ts     # HTTP polling with mock server
│   └── (existing tests unchanged)
```

**Structure Decision**: Single-package extension following the established monorepo CLI pattern. All new code lives in `packages/cli/src/` following existing command/service/config separation. Shared types in `packages/shared/src/types/` per constitution architecture rules.

## Component Architecture

### 1. `packages/shared/src/types/create-app.ts` — Type Definitions

```typescript
// Stack entry in the 16-stack catalog
export interface StackEntry {
  id: string;         // "go-gin" — matches branch name stack/<id>
  language: string;   // Display: "Go"
  framework: string;  // Display: "Gin"
  version: string;    // Runtime version: "1.22"
  orm: string;        // ORM/DB layer: "GORM"
  isUnified: boolean; // true = port 3000 only (nodejs-nextjs*)
  buildSlow: boolean; // true = Rust stacks (warn: 3-10 min)
}

// Parsed command options
export interface CreateAppOptions {
  stack?: string;       // --stack <STACK_ID>
  database: 'sqlite3' | 'postgres' | 'mysql';
}

// Health verification result
export interface StackHealthResult {
  healthy: boolean;
  elapsedMs: number;
  dbConnected?: boolean;
  error?: string;
}
```

### 2. `packages/cli/src/config/stacks.ts` — Stack Catalog

Contains the authoritative list of all 16 stack IDs, metadata, and helper functions:

```typescript
export const STACK_CATALOG: StackEntry[]  // 16 entries
export const VALID_STACK_IDS: string[]    // derived from catalog
export const VALID_DB_DRIVERS = ['sqlite3', 'postgres', 'mysql'] as const

export function getStackById(id: string): StackEntry | undefined
export function getStacksByLanguage(): Record<string, StackEntry[]>  // for interactive prompt
```

Stack ID → language grouping for interactive prompts:
- Go: `go-gin`, `go-echo`, `go-fiber`
- Rust: `rust-actix-web`, `rust-axum`
- Java: `java-springboot`, `java-spring`
- Kotlin: `kotlin-ktor`, `kotlin-springboot`
- Node.js: `nodejs-express`, `nodejs-nestjs`, `nodejs-nextjs`, `nodejs-nextjs-full`
- Python: `python-fastapi`, `python-django`, `python-flask`

### 3. `packages/cli/src/services/boilerplate-manager.ts` — Core Service

Stateless functions called in sequence by the command handler:

```typescript
// Step 1 of 10: Clone from brewnet-boilerplate
export async function cloneStack(stackId: string, projectDir: string): Promise<void>

// Step 2 of 10: Generate .env from .env.example with secure secrets
export function generateEnv(projectDir: string, stackId: string, dbDriver: string): void

// Step 3 of 10: Re-initialize git history (clean slate)
export async function reinitGit(projectDir: string): Promise<void>

// Step 4 of 10: Start containers (docker compose up -d --build)
export async function startContainers(projectDir: string): Promise<void>

// Step 5 of 10: Poll /health endpoint until ready
export async function pollHealth(baseUrl: string, timeoutMs: number): Promise<StackHealthResult>

// Step 6 of 10: Verify /api/hello + POST /api/echo
export async function verifyEndpoints(baseUrl: string): Promise<void>
```

**`generateEnv` logic** (from CONNECT_BOILERPLATE.md authoritative spec):
1. Read `<projectDir>/.env.example` as base content
2. Generate 3 secrets: `dbPassword`, `mysqlPassword`, `mysqlRoot` — each `crypto.randomBytes(32).toString('hex')`
3. Replace `DB_DRIVER=.*` → `DB_DRIVER=<dbDriver>`
4. Replace `DB_PASSWORD=.*` → `DB_PASSWORD=<dbPassword>`
5. Replace `MYSQL_PASSWORD=.*` → `MYSQL_PASSWORD=<mysqlPassword>`
6. Replace `MYSQL_ROOT_PASSWORD=.*` → `MYSQL_ROOT_PASSWORD=<mysqlRoot>`
7. If `stackId.startsWith('nodejs-')`: also set `PRISMA_DB_PROVIDER` and `DATABASE_URL`
8. Write result to `<projectDir>/.env`

**Health polling** uses `fetch()` (Node.js 20+ built-in) against `http://127.0.0.1:<port>/health`:
- Non-Rust: 120s timeout, 1s interval
- Rust: 600s timeout, 1s interval (determined by `stack.buildSlow`)
- Port: 3000 for `isUnified` stacks, 8080 for standard stacks

### 4. `packages/cli/src/commands/create-app.ts` — Command Handler

Orchestration flow:
1. **Pre-flight**: `checkDocker()` from `system-checker.ts` — exits BN001 if not running
2. **Dir check**: `existsSync(projectDir)` — exits with clear error if exists
3. **Stack resolution**: validate `--stack` against catalog OR run `selectStackInteractively()`
4. **Rust warning**: if `stack.buildSlow`, print yellow warning before proceeding
5. **Clone** with spinner: `cloneStack(stackId, projectDir)`
6. **Env gen** with spinner: `generateEnv(projectDir, stackId, dbDriver)`
7. **Git reinit** with spinner: `reinitGit(projectDir)`
8. **Start** with spinner: `startContainers(projectDir)` + Rust time estimate
9. **Health poll** with animated spinner showing elapsed time: `pollHealth(baseUrl, timeout)`
10. **Verify** with spinner: `verifyEndpoints(baseUrl)`
11. **Success box**: `printSuccessBox(projectName, stack, baseUrl, frontendUrl)`

**Interactive stack selection** (when `--stack` not provided):
- Prompt 1: `select` — "Select a language" → 6 language choices
- Prompt 2: `select` — "Select a framework" → frameworks filtered to chosen language
- Returns the matching `StackEntry`

**Error handling**:
- Clone failure: display error + suggestion to check internet connection; remove partial dir
- Health timeout: display `docker compose logs backend` hint; leave containers for debugging
- Invalid `--stack`: list all 16 valid IDs
- Invalid `--database`: list the 3 valid options

### 5. `packages/cli/src/index.ts` — Command Registration

Add one line: `import { registerCreateAppCommand } from './commands/create-app.js';`
Add one call: `registerCreateAppCommand(program);`

## Complexity Tracking

> No constitution violations — table not required.

## Design Decisions & Rationale (from research)

See [research.md](./research.md) for full details. Key decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Health polling mechanism | `fetch()` built-in | Node.js 20+ includes `fetch`; no extra dep; AbortSignal.timeout() for clean cancellation |
| Secret generation | `crypto.randomBytes(32).toString('hex')` | Matches CONNECT_BOILERPLATE.md spec exactly; produces 64-char hex string |
| IP for health check | `127.0.0.1` | Alpine Linux resolves `localhost` to `::1` (IPv6) which fails when container only listens on IPv4 |
| Stack catalog location | `packages/cli/src/config/stacks.ts` | Separate from `frameworks.ts` (different ID scheme); CLI-only concern, not in shared |
| Env generation | Regex line-by-line replacement | Preserves all comments/formatting in `.env.example`; matches established pattern in CONNECT_BOILERPLATE.md |
| Git reinit | `rm -rf .git && git init && git add -A && git commit` | Severs boilerplate history; user starts with clean slate; optional but specified in spec |
| Error on health timeout | Leave containers running, print debug hint | Developer needs container logs to diagnose; tearing down would destroy evidence |
| `execa` for shell commands | Yes (consistent with codebase) | Already in dependencies; used throughout CLI for git/docker commands |
