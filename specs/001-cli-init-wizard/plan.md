# Implementation Plan: CLI Init Wizard

**Branch**: `001-cli-init-wizard` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-cli-init-wizard/spec.md`

---

## Summary

Phase 1 (설치 → `brewnet init` 위저드 → 서비스 관리 → `brewnet uninstall`)의 구현이 **사실상 완료**되었다. T001–T115 (128개 tasks) 전부 `[x]` 체크됨. 55개 테스트 스위트, 2329 테스트, 80.04% coverage 달성. 남은 작업은 구현이 아니라 **마무리 3개 항목** (미커밋 파일, T101c 테스트, GitHub CI)이다.

---

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+ (ESM)
**Primary Dependencies**: Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, better-sqlite3, zod, conf, tsup
**Storage**: better-sqlite3 (local SQLite at `~/.brewnet/db/`), JSON state files at `~/.brewnet/projects/<name>/selections.json`
**Testing**: Jest 29.x with `--experimental-vm-modules`, ts-jest, execa (E2E)
**Target Platform**: macOS 12+ / Ubuntu 20.04+ (Linux), Node.js 20+
**Project Type**: CLI tool (monorepo — packages/cli + packages/shared)
**Performance Goals**: `brewnet init` completes in under 10 minutes (ex. image pull)
**Constraints**: Offline-capable core, no internet required except Docker pulls
**Scale/Scope**: Single-user home server CLI, Phase 1 MVP

---

## Constitution Check

### I. Zero Config ✅ PASS
- 모든 wizard 단계에 sensible defaults 구현 (projectName, admin password auto-gen, traefik 기본값)
- `generatePassword()` 자동 생성, 모든 프롬프트에 기본값

### II. Secure by Default ✅ PASS
- `.env` chmod 600 구현 (`env-generator.ts`)
- SSH `PasswordAuthentication no`, `PermitRootLogin no` 기본값 (`config-generator.ts`)
- 모든 컨테이너 `security_opt: [no-new-privileges:true]` (`compose-generator.ts`)
- 20자 cryptographically random 패스워드

### III. Transparent Operations ✅ PASS
- 모든 생성 파일 human-readable YAML/JSON
- ora spinner + chalk 색상 출력 구현
- `~/.brewnet/logs/` daily JSON 로그 (`logger.ts`)
- 에러 메시지 BN001–BN010 코드 + remediation 포함

### IV. Reversible Actions ✅ PASS
- `brewnet remove` — data preserved by default, `--purge` 필요
- `brewnet backup/restore` — tar.gz 아카이브
- `brewnet uninstall --keep-data`, `--keep-config` 플래그
- docker-compose.yml 수정 전 backup (constitution 요구)

### V. Offline First ✅ PASS
- 서비스 registry 로컬 번들 (`config/services.ts`)
- `status`, `logs`, `up`, `down` — offline 동작
- Docker image pull만 인터넷 필요 (intentional exception)
- 네트워크 실패 시 명확한 에러 (silent failure 없음)

**Constitution Gate**: ✅ PASS (모든 원칙 충족)

---

## Project Structure

### Documentation (this feature)

```text
specs/001-cli-init-wizard/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — technology decisions + completion analysis
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — developer quickstart
├── contracts/           # Phase 1 output — CLI command contracts
└── tasks.md             # Phase 2 output — T001–T115 all [x] complete
```

### Source Code (implemented)

```text
packages/cli/src/
├── index.ts                    # CLI entry point (Commander.js)
├── commands/
│   ├── init.ts                 # brewnet init (wizard orchestrator)
│   ├── status.ts               # brewnet status
│   ├── add.ts                  # brewnet add <service>
│   ├── remove.ts               # brewnet remove <service>
│   ├── up.ts / down.ts         # docker compose up/down
│   ├── logs.ts                 # brewnet logs [service]
│   ├── backup.ts               # brewnet backup
│   ├── restore.ts              # brewnet restore <id>
│   ├── admin.ts                # brewnet admin [--port]  ← NEW (untracked)
│   └── uninstall.ts            # brewnet uninstall       ← NEW (untracked)
├── wizard/
│   ├── state.ts                # WizardState management
│   ├── navigation.ts           # Step navigation state machine
│   └── steps/
│       ├── system-check.ts     # Step 0
│       ├── project-setup.ts    # Step 1
│       ├── server-components.ts # Step 2
│       ├── dev-stack.ts        # Step 3
│       ├── domain-network.ts   # Step 4
│       ├── review.ts           # Step 5
│       ├── generate.ts         # Step 6
│       └── complete.ts         # Step 7
├── services/
│   ├── compose-generator.ts    # docker-compose.yml generation
│   ├── env-generator.ts        # .env generation + chmod 600
│   ├── config-generator.ts     # infrastructure configs + boilerplate
│   ├── health-checker.ts       # service health polling
│   ├── credential-manager.ts   # admin credential propagation
│   ├── backup-manager.ts       # tar.gz backup + SQLite record
│   ├── docker-manager.ts       # Docker API (dockerode)
│   ├── docker-installer.ts     # Docker auto-install (macOS/Linux)
│   ├── system-checker.ts       # System requirements check
│   ├── service-manager.ts      # add/remove service from compose
│   ├── db-manager.ts           # SQLite initialization
│   ├── cloudflare-client.ts    # Cloudflare API v4 client
│   ├── status-page.ts          # Post-install HTML status page
│   ├── admin-server.ts         # Local admin panel HTTP server ← NEW (untracked)
│   └── uninstall-manager.ts    # Uninstall orchestration ← NEW (untracked)
├── config/
│   ├── services.ts             # 17 Docker service registry
│   ├── frameworks.ts           # Language/framework registry
│   └── defaults.ts             # Wizard default values
└── utils/
    ├── errors.ts               # BrewnetError (BN001–BN010)
    ├── logger.ts               # Daily JSON file logger
    ├── password.ts             # Confusion-free password generation
    ├── validation.ts           # Input validation helpers
    ├── resources.ts            # estimateResources, getCredentialTargets
    └── network.ts              # checkPort25Blocked()

packages/shared/src/
├── types/
│   ├── wizard-state.ts         # WizardState + sub-interfaces
│   ├── service.ts              # ServiceDefinition, Language, FrontendTech
│   └── errors.ts               # ErrorCode enum, BackupRecord, LogEntry
├── schemas/
│   ├── wizard-state.schema.ts  # Zod schema
│   └── config.schema.ts        # brewnet.config.json schema
└── utils/
    └── constants.ts            # SCHEMA_VERSION=5, defaults, ports

tests/
├── unit/cli/
│   ├── commands/               # index.test.ts, status.test.ts
│   ├── config/                 # services.test.ts, frameworks.test.ts
│   ├── services/               # 12 service unit test files
│   ├── utils/                  # errors, logger, password, validation, resources
│   ├── wizard/                 # state, server-components, domain-network, dev-stack
│   └── constitution.test.ts
├── integration/                # 12 integration test files
│   ├── admin-server.test.ts    # ← MISSING (T101c not created)
│   └── [11 other integration tests]
└── e2e/                        # full-install, partial-install, wizard-resume

install.sh                      # curl-pipeable installer ✅
```

**Structure Decision**: Monorepo with `packages/cli` (Commander.js CLI) + `packages/shared` (Zod schemas + types). Dashboard (Phase 4) in separate `packages/dashboard`. All source code implemented and passing tests.

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. All 5 principles satisfied without exceptions.

---

## Remaining Work (Phase 1 Gap List)

Phase 1 구현은 완료됨. 아래 3개 항목만 마무리 필요:

### Gap 1: `tests/integration/admin-server.test.ts` 미생성 [HIGH]

- **Task**: T101c marked `[x]` but file does not exist on disk
- **Required tests**:
  - `GET /api/services` — returns service list
  - `POST /api/services/:id/start` — starts container
  - `POST /api/services/:id/stop` — stops container
  - `POST /api/services/install` — installs new service
  - `DELETE /api/services/:id` — removes service
  - `GET /api/health` — server health check
- **Mock strategy**: Mock `docker-manager.ts` and `service-manager.ts`; test HTTP API layer with real Node.js http server

### Gap 2: `.github/workflows/ci.yml` 미생성 [MEDIUM]

- **Required steps**:
  1. `pnpm install`
  2. `pnpm build`
  3. `pnpm test:coverage` (verify 80%+ threshold)
  4. `bash -n install.sh` (syntax check)
- **Triggers**: `push` to `main`, `001-cli-init-wizard`; `pull_request` to `main`

### Gap 3: 미커밋 변경사항 [HIGH]

- **Untracked (4)**: `commands/admin.ts`, `commands/uninstall.ts`, `services/admin-server.ts`, `services/uninstall-manager.ts`
- **Modified (15)**: docs + packages/cli/src + specs + tests (see `git status`)
- **Action**: Commit all changes before PR to main

---

## Phase Gate Status

| Gate | Condition | Status |
|------|-----------|--------|
| T001–T115 all complete | All tasks `[x]` | ✅ |
| Tests pass | 2329/2329 | ✅ |
| Statement coverage ≥ 80% | 80.04% | ✅ |
| Function coverage ≥ 90% (CLI core) | 89.94% | ⚠️ (0.06% short) |
| admin-server integration test | EXISTS | ❌ |
| GitHub CI workflow | EXISTS | ❌ |
| All changes committed | Git clean | ❌ |
