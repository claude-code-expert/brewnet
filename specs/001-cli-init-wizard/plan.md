# Implementation Plan: CLI Init Wizard

**Branch**: `001-cli-init-wizard` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: spec.md, USER-STORY.md v2.3, REQUIREMENT.md v2.2, REQUIREMENT_ADDENDUM.md v1.0

---

## Summary

Brewnet CLI의 `brewnet init` 인터랙티브 위저드를 구현한다. 핵심 설계 목표:

1. **One-line install** — `curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash`
2. **Docker 자동 설치** — macOS(Homebrew) / Linux(get.docker.com) 플랫폼별 자동 설치
3. **7단계 위저드** — 시스템 체크 → 프로젝트 설정 → 서버 컴포넌트 → DevStack → 도메인 → 리뷰 → 생성 → 완료
4. **Local Admin Panel** — 설치 완료 후 `http://localhost:8088`에서 서비스 관리(start/stop/install/uninstall) UI 제공

---

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+ (ESM)
**Primary Dependencies**: Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, better-sqlite3, zod, conf
**Admin Panel**: Node.js built-in `http` module + static HTML serving (no external web framework)
**Install Script**: POSIX shell (`install.sh`) — curl-pipeable bash script
**Storage**: SQLite (better-sqlite3) for service state + JSON for wizard state
**Testing**: Jest 29.x + Playwright E2E
**Target Platform**: macOS 12+, Ubuntu 20.04+
**Project Type**: CLI tool + embedded local web admin
**Performance Goals**: `brewnet init` completes < 5 min (excl. Docker image pulls)
**Constraints**: Offline-capable for core ops, no external API at runtime except Docker image pulls
**Scale/Scope**: Single-server, single-user home server management

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero Config | ✅ PASS | All wizard prompts have working defaults; Docker auto-installed |
| II. Secure by Default | ✅ PASS | SSH key-only, 20-char auto-passwords, no-new-privileges, Docker internal networks |
| III. Transparent Operations | ✅ PASS | All installs shown with ora spinner + execa stdio:inherit |
| IV. Reversible Actions | ✅ PASS | `--purge` flag for data deletion, backup before compose changes |
| V. Offline First | ⚠️ JUSTIFIED | Docker auto-install requires internet; documented as intentional exception (bootstrap phase only) |

**Complexity Tracking**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Offline First exception for Docker install | Docker auto-install requires downloading binaries | Cannot install Docker offline; user can pre-install manually to avoid this |
| Admin panel (local HTTP server) | Service management UI at localhost:8088 | CLI-only `brewnet status` insufficient for start/stop/install/uninstall UX |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-cli-init-wizard/
├── plan.md              ← this file
├── research.md          ← technology decisions
├── data-model.md        ← TypeScript interfaces
├── contracts/           ← CLI command schemas + Admin REST API
│   ├── cli-commands.md
│   └── admin-api.md
├── checklists/
│   └── docker-install.md
└── tasks.md             ← implementation tasks
```

### Source Code

```text
packages/cli/src/
├── index.ts                        # CLI entry point (Commander.js root)
├── commands/
│   ├── init.ts                     # brewnet init — wizard orchestrator
│   ├── admin.ts                    # brewnet admin — start local admin panel
│   ├── status.ts                   # brewnet status
│   ├── up.ts / down.ts             # brewnet up / down
│   ├── add.ts / remove.ts          # brewnet add/remove <service>
│   ├── backup.ts / restore.ts      # brewnet backup/restore
│   └── logs.ts                     # brewnet logs
├── wizard/
│   ├── state.ts                    # WizardState schema v5 + persistence
│   ├── navigation.ts               # Step state machine
│   └── steps/
│       ├── system-check.ts         # Step 0: system check + Docker auto-install
│       ├── project-setup.ts        # Step 1: project name, path, type
│       ├── server-components.ts    # Step 2: admin + service toggles
│       ├── dev-stack.ts            # Step 3: languages, frameworks, boilerplate
│       ├── domain-network.ts       # Step 4: domain, tunnel, mail
│       ├── review.ts               # Step 5: review + export
│       ├── generate.ts             # Step 6: file gen + docker up
│       └── complete.ts             # Step 7: endpoints + admin panel open
├── services/
│   ├── docker-installer.ts         # Docker auto-install (macOS/Linux)
│   ├── docker-manager.ts           # Container lifecycle (dockerode)
│   ├── admin-server.ts             # Local HTTP server for admin panel
│   ├── system-checker.ts           # Pre-flight checks
│   ├── compose-generator.ts        # docker-compose.yml generation
│   ├── env-generator.ts            # .env file generation
│   ├── config-generator.ts         # Infrastructure config files
│   ├── credential-manager.ts       # Admin credential propagation
│   ├── health-checker.ts           # Post-startup health polling
│   ├── boilerplate-generator.ts    # App scaffolding templates
│   ├── backup-manager.ts           # Backup/restore
│   ├── db-manager.ts               # SQLite local state
│   └── service-manager.ts          # Add/remove/start/stop services
├── config/
│   ├── services.ts                 # Service registry (17 Docker services)
│   ├── frameworks.ts               # Language/framework registry
│   └── defaults.ts                 # WizardState default values
└── utils/
    ├── errors.ts                   # BrewnetError (BN001–BN010)
    ├── logger.ts                   # Logging to ~/.brewnet/logs/
    ├── password.ts                 # Crypto-random password generation
    ├── resources.ts                # RAM/disk estimation
    └── validation.ts               # Zod validators

install.sh                          # One-line curl install script (repo root)

public/demo/                        # Browser demo (HTML reference)
├── index.html
├── step0-system-check.html         # → system-check.ts reference
├── step1-project-setup.html        # → project-setup.ts reference
├── step2-server-components.html    # → server-components.ts reference
├── step3-runtime.html              # → dev-stack.ts reference
├── step4-domain.html               # → domain-network.ts reference
├── step5-review.html               # → review.ts reference
├── step6-generate.html             # → generate.ts reference
├── step7-complete.html             # → complete.ts reference
└── manage.html                     # → admin-server.ts UI reference

packages/cli/public/                # Admin panel static assets (served by admin-server.ts)
└── admin/
    ├── index.html                  # Service manager UI (adapted from manage.html)
    └── css/ + js/
```

---

## Architecture: Admin Panel

```
brewnet init (완료)
  └─→ runCompleteStep()
        ├─ 서비스 엔드포인트 출력
        ├─ AdminServer.start(port=8088)
        │     ├─ GET  /api/services         — 서비스 목록 + 상태
        │     ├─ POST /api/services/:id/start  — 서비스 시작
        │     ├─ POST /api/services/:id/stop   — 서비스 중지
        │     ├─ POST /api/services/install    — 새 서비스 추가
        │     └─ DELETE /api/services/:id      — 서비스 제거
        └─ 브라우저 자동 오픈 → http://localhost:8088
```

- Admin panel HTML: `manage.html` 기반으로 리얼 API 연동
- No external framework (Node.js built-in `http.createServer`)
- JWT 없음 — localhost 전용, 외부 미노출
- `brewnet admin` 명령으로 언제든 재시작 가능

---

## Architecture: Install Script (`install.sh`)

```bash
#!/bin/bash
set -e

REPO_URL="https://github.com/claude-code-expert/brewnet.git"
BREWNET_SOURCE="$HOME/.brewnet/source"

# npm 레지스트리 불필요 — GitHub 소스에서 직접 빌드
# 1. OS 감지 (macOS / Linux)
# 2. Node.js 20+ 확인
# 3. pnpm 확인 (없으면 npm install -g pnpm)
# 4. git 확인
# 5. git clone --depth 1 $REPO_URL ~/.brewnet/source/
#    (재실행 시: git pull --ff-only)
# 6. pnpm install && pnpm build → packages/cli/dist/index.js
# 7. /usr/local/bin/brewnet 또는 ~/.local/bin/brewnet 래퍼 생성
# 8. ~/.brewnet/{projects,backups,logs,db}/ 생성
# 9. PATH 설정 (.zshrc / .bashrc — ~/.local/bin 사용 시만)
# 10. brewnet --version 출력
```

---

## Architecture: Docker Auto-Install (구현 완료)

```
isDockerInstalled() == false
  ├─ macOS: checkHomebrew() → brew install --cask docker → open -a Docker → waitForDaemon(90s)
  └─ Linux: curl get.docker.com | sudo sh → systemctl start docker → usermod -aG docker $USER → waitForDaemon(30s)
```

구현 파일:
- `packages/cli/src/services/docker-installer.ts` ✅ (완료)
- `packages/cli/src/wizard/steps/system-check.ts` ✅ (통합 완료)

---

## Phase Roadmap

| Phase | Deliverables | Gate |
|-------|-------------|------|
| **1 (Current)** | install.sh, Docker auto-install, 위저드 Steps 0-7, compose 생성, health check | `brewnet init` full flow 동작 |
| **2** | Admin panel (admin-server.ts + UI), `brewnet admin` 명령, service start/stop/add/remove API | `localhost:8088` 서비스 관리 UI 동작 |
| **3** | Domain/SSL/Traefik, Git server (Gitea), `brewnet deploy` | 외부 접근 + 자동 배포 동작 |
| **4** | SSH/ACL/firewall, mail server, backup/restore, `brewnet status` 고도화 | 보안 + 데이터 관리 동작 |
| **5** | Pro Dashboard (packages/dashboard), 모니터링, 실시간 로그 | Web UI Pro tier 동작 |
