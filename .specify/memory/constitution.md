# Brewnet Constitution

## Core Principles

### I. Zero Config

Every feature MUST work out of the box with sensible defaults.
No manual configuration MUST be required for a first successful run.

- The `brewnet init` wizard MUST provide working defaults for every prompt.
- Generated `docker-compose.yml` MUST start without user edits.
- Secrets (passwords, JWT keys) MUST be auto-generated when not
  explicitly provided.
- Default domain MUST be `brewnet.local` for immediate local access.

**Rationale**: The primary value proposition is reducing setup from
days to minutes. Any mandatory configuration step adds friction
and undermines the core product promise.

### II. Secure by Default (NON-NEGOTIABLE)

All generated configurations MUST follow security best practices
without requiring user expertise or opt-in.

- SSH MUST use key-based authentication only; password auth MUST
  be disabled by default.
- Root login MUST be disabled on all managed services.
- Docker containers MUST use `no-new-privileges` security option.
- Auto-generated passwords MUST be cryptographically random with
  a minimum of 16 characters.
- All internal service networks MUST use Docker internal networks
  (no external exposure by default).
- Firewall rules MUST be auto-configured to restrict access.

**Rationale**: Home servers are exposed to the internet. Users
trust Brewnet to protect their infrastructure. A single insecure
default can compromise an entire home network.

### III. Transparent Operations

Every action Brewnet performs MUST be visible, logged, and
inspectable by the user.

- All generated files (docker-compose.yml, .env, configs) MUST
  be human-readable and editable.
- CLI operations MUST display what they are doing in real-time
  (spinner, progress, file creation messages).
- Users MUST be able to inspect and manually modify any generated
  configuration without breaking Brewnet management.
- All service operations MUST be written to `~/.brewnet/logs/`.
- Error messages MUST include the error code (BN001-BN010) and
  actionable resolution steps.

**Rationale**: Black-box tools erode user trust. Brewnet serves
users who want to learn and control their infrastructure, not
just delegate it.

### IV. Reversible Actions

Every action MUST be undoable. Destructive operations MUST
require explicit confirmation.

- `brewnet remove <service>` MUST preserve user data by default
  and require `--purge` flag for data deletion.
- `brewnet backup` and `brewnet restore` MUST support full state
  recovery (config, database, volumes).
- Service updates MUST support rollback to the previous version.
- The system MUST NOT delete user-created files without explicit
  confirmation.
- Docker Compose changes MUST be backed up before overwriting.

**Rationale**: Home servers store irreplaceable personal data
(photos, documents, code). An accidental destructive action can
cause permanent data loss.

### V. Offline First

Core CLI functionality MUST work without an internet connection.
Network-dependent features MUST degrade gracefully.

- `brewnet status`, `brewnet logs`, `brewnet up`, `brewnet down`
  MUST work fully offline.
- Docker image pulls are the only operation that MUST require
  internet access.
- License validation MUST NOT block offline usage of Free tier
  features.
- The CLI MUST cache service metadata locally for offline
  reference.
- Network failures MUST produce clear error messages, not
  silent failures or crashes.

**Rationale**: Home servers operate in environments with
intermittent connectivity. Management tools that fail without
internet access become liabilities during outages.

## Technical Constraints

### Technology Stack

All implementation MUST adhere to the following technology
decisions. Changes require a constitution amendment.

**Runtime & Language**:
- Node.js 20+ (LTS versions only: 20.x, 22.x)
- TypeScript 5.x in strict mode
- ESM modules exclusively (`"type": "module"`)

**CLI Framework**:
- Commander.js for command parsing and subcommand structure
- @inquirer/prompts for interactive wizard prompts
- chalk + ora for terminal UX (color output, spinners)
- cli-table3 for tabular status output

**Docker Integration**:
- dockerode for Docker Engine API interaction
- js-yaml for docker-compose.yml generation and parsing
- execa for shell command execution

**Data & Validation**:
- Zod for all input/configuration schema validation
- better-sqlite3 for local state management (Phase 2+)
- conf for user configuration persistence (~/.brewnet/)

**Build & Quality**:
- pnpm workspaces for monorepo management
- tsup for CLI bundling (esbuild-based)
- ESLint 9.x + Prettier 3.x for code quality
- Jest 29.x for unit/integration testing

### Architecture Rules

- The project MUST use pnpm monorepo with three packages:
  `packages/cli`, `packages/shared`, `packages/dashboard`.
- All infrastructure services MUST run as Docker containers.
- All supported services MUST use OSI-approved open source
  licenses.
- The CLI MUST NOT depend on the dashboard package.
- Shared types and Zod schemas MUST live in `packages/shared`.

### Error Handling

- All errors MUST use the Brewnet error code system (BN001-BN010).
- Error codes MUST map to HTTP status codes for API consistency.
- Error messages MUST be user-facing and actionable.

## Development Workflow

### Quality Gates

- **Test coverage**: 80%+ overall, 90%+ for `packages/cli` core
  modules.
- **TypeScript**: strict mode with no `any` types in committed code.
- **Linting**: Zero ESLint errors before merge.
- **Formatting**: Prettier-enforced, checked in CI.

### Phase Discipline

Development MUST follow the 5-phase roadmap. Each phase has a
defined scope and MUST NOT include features from later phases
unless explicitly approved:

| Phase | Scope | Gate |
|-------|-------|------|
| 1 (MVP) | CLI foundation, Docker management, wizard | `brewnet init` + `brewnet up` functional |
| 2 | Networking, domain, SSL, Git server, deploy | External access + auto-deploy working |
| 3 | Security, SSH, ACL, file/DB management, SSO | Auth + data management operational |
| 4 | Dashboard (Pro), monitoring, real-time logs | Web UI functional for Pro tier |
| 5 | Polish, testing, documentation, performance | Beta release criteria met |

### Commit & Review Standards

- Commits MUST be atomic (one logical change per commit).
- Commit messages MUST follow conventional commits format.
- All PRs MUST pass CI (lint, test, build) before merge.
- Breaking changes MUST be documented in the PR description.

### Documentation

- Every CLI command MUST have `--help` documentation.
- Every core module MUST have JSDoc on exported functions.
- User-facing changes MUST update the relevant spec documents
  (PRD.md, REQUIREMENT.md, USER-STORY.md) if behavior changes.

## Governance

This constitution is the authoritative source for project
principles and technical decisions. It supersedes all other
documents when conflicts arise.

**Amendment Process**:
1. Propose amendment via PR with rationale.
2. Update constitution version following semver:
   - MAJOR: Principle removal or incompatible redefinition.
   - MINOR: New principle or material guidance expansion.
   - PATCH: Clarification, wording, or non-semantic change.
3. Verify all dependent templates remain consistent.
4. Update `LAST_AMENDED_DATE` to the amendment date.

**Compliance**:
- All PRs MUST verify compliance with Core Principles.
- The plan template Constitution Check gate MUST reference
  these principles by name.
- Violations MUST be justified in a Complexity Tracking table
  (see plan-template.md).

**Reference Documents**:
- [CLAUDE.md](../../.claude/CLAUDE.md) — AI development context
- [PRD.md](../../docs/PRD.md) — Product requirements
- [TRD.md](../../docs/TRD.md) — Technical requirements
- [REQUIREMENT.md](../../REQUIREMENT.md) — Functional requirements

**Version**: 1.0.0 | **Ratified**: 2026-02-22 | **Last Amended**: 2026-02-22

## 🚨 Guardrails (절대 준수 사항)

AI 코딩 에이전트가 실수로 위험한 작업을 수행하지 않도록 명시적으로 금지하는 규칙들이다.
**이 규칙들은 어떤 상황에서도 위반할 수 없다.**

### 데이터베이스 금지 명령어
- `DROP TABLE`, `DROP DATABASE` -- 절대 금지
- `TRUNCATE` -- 절대 금지
- `DELETE FROM` (WHERE 절 없이) -- 절대 금지
- `ALTER TABLE DROP COLUMN` -- 사용자 명시적 허가 필요

### 데이터베이스 안전 규칙
- 삭제/리셋 작업 시 반드시 사용자 승인 요청
- 삭제 전 백업 또는 복구 방법 안내
- 테스트 데이터 존재 시 DB 리셋 대신 SQL로 해결
- 운영 DB 자동 변경 절대 금지

### Git 금지 명령어
- `git push --force` -- 절대 금지
- `git reset --hard` -- 절대 금지
- `git clean -fd` -- 사용자 확인 필요
- `git branch -D` (main/master) -- 절대 금지

### 패키지 관리 금지 명령어
- `npm audit fix --force` -- 절대 금지
- `rm -rf node_modules && npm install` -- 사용자 확인 필요
- 메이저 버전 자동 업그레이드 -- 절대 금지

### 파일 시스템 금지 명령어
- `rm -rf /` 또는 루트 경로 삭제 -- 절대 금지
- 프로젝트 외부 파일 수정 -- 절대 금지
- `.env` 파일 삭제 -- 사용자 확인 필요
- `src/` 디렉토리 전체 삭제 -- 절대 금지

### 안전 작업 원칙
- 파괴적 작업(삭제, 초기화) 전 반드시 사용자 확인
- 복구 불가능한 작업은 백업 방법 먼저 안내
- 자동화된 스크립트의 파괴적 명령 실행 금지
- 의심스러운 작업은 실행 전 사용자에게 설명 및 확인