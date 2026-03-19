# Implementation Plan: Centralized Logging System

**Branch**: `004-centralized-logging` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-centralized-logging/spec.md`

## Summary

4개 분산된 로그 소스(CLI JSONL, Tunnel NDJSON, Traefik access log, Docker container logs)를 통합 조회 가능한 Log Aggregator로 합치고, Admin Panel Logs 탭과 CLI `--all/--source/--level/--since/--json` 확장으로 노출한다. Docker json-file 로그 드라이버 + Traefik accesslog 설정을 compose-generator에 추가하고, 파일 기반 로테이션으로 디스크 사용량을 ~700MB 이하로 제한한다.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+ (ESM)
**Primary Dependencies**: Commander.js, dockerode, js-yaml, chalk, ora, cli-table3, execa, zod
**Storage**: File-based (JSONL, NDJSON, JSON access logs) + Docker json-file driver
**Testing**: Jest 29.x (unit/integration), ESM dynamic imports with `jest.unstable_mockModule`
**Target Platform**: macOS (darwin), Linux (Ubuntu/Debian, CentOS/RHEL)
**Project Type**: CLI (monorepo: packages/cli, packages/shared, packages/dashboard)
**Performance Goals**: Log query < 2s for up to 10,000 entries
**Constraints**: Total log storage <= 700MB (10 services), zero additional Docker containers, offline-capable for file-based sources
**Scale/Scope**: Home server with up to ~15 services

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero Config | PASS | Docker log rotation auto-applied to all services; Traefik accesslog auto-enabled; no user configuration needed |
| II. Secure by Default | PASS | Traefik access log drops all headers by default, keeps only User-Agent and X-Forwarded-For; no credentials logged; TunnelLogger already sanitizes apiToken/tunnelToken |
| III. Transparent Operations | PASS | This feature directly implements transparency — all operations logged, viewable via CLI and Admin Panel |
| IV. Reversible Actions | PASS | Log rotation uses copytruncate (non-destructive); CLI log cleanup only deletes files > 30 days old; no user data at risk |
| V. Offline First | PASS | `brewnet logs --all` reads file-based sources offline; Docker source gracefully skips when daemon unavailable (FR-015) |
| Tech Stack | PASS | Uses existing deps (dockerode, js-yaml, chalk, zod); no new runtime dependencies |
| Architecture Rules | PASS | Shared types in packages/shared; CLI implementation in packages/cli; no dashboard dependency |
| Error Handling | PASS | Graceful degradation per FR-015; malformed JSON lines skipped with warning |

## Project Structure

### Documentation (this feature)

```text
specs/004-centralized-logging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── logging.ts                    # NEW — UnifiedLogEntry, LogQuery, LogQueryResult, LogStats
├── utils/
│   └── constants.ts                  # MODIFY — add logging constants
└── index.ts                          # MODIFY — export new types

packages/cli/src/
├── services/
│   ├── compose-generator.ts          # MODIFY — ComposeLogging, getLoggingConfig(), Traefik accesslog
│   └── admin-server.ts               # MODIFY — /api/logs endpoints + Logs tab UI
├── utils/
│   ├── log-aggregator.ts             # NEW — 4-source reader + queryLogs()
│   ├── log-rotation.ts               # NEW — cleanOldCliLogs(), rotateLargeFile()
│   └── logger.ts                     # MODIFY — call cleanOldCliLogs() on init
└── commands/
    └── logs.ts                       # MODIFY — add --all/--source/--level/--since/--json

tests/unit/cli/
├── utils/
│   ├── log-aggregator.test.ts        # NEW
│   └── log-rotation.test.ts          # NEW
└── services/
    └── compose-generator.test.ts     # MODIFY — add logging field assertions
```

**Structure Decision**: Existing monorepo structure. New modules placed alongside existing utils (`log-aggregator.ts`, `log-rotation.ts`) following the same pattern as `logger.ts` and `tunnel-logger.ts`. Shared types in `packages/shared/src/types/logging.ts` following the same pattern as `errors.ts` and `wizard-state.ts`.

## Complexity Tracking

> No constitution violations. No complexity tracking needed.
