# CLAUDE.md - Brewnet Project Context

---
## ⚠️ MANDATORY — 모든 응답 전 반드시 확인

1. **응답 형식**: 모든 작업 완료 시 반드시 Korean summary로 마무리
   - 무엇을 변경했는지
   - 왜 그렇게 했는지
   - 주의할 점이 있는지

2. **조사 원칙**: 경로, 설정값, 코드 동작에 대해 답하기 전 반드시 소스 코드를 먼저 읽을 것. 추측으로 답변 금지.

---

## Project Overview

**Brewnet** — "Your Home Server, Brewed Fresh"

A self-hosted home server management platform that provides an interactive CLI tool and Web Dashboard (Pro) for setting up and managing personal servers with Docker-based services.


## ⛔ NEVER Rules

- Jellyfin 초기 설정 URL은 반드시 `http://<host>:8096/web/#/wizard/start`를 사용. `#/home`은 절대 사용하지 말 것.
- 추측으로 경로, 설정값, URL을 답변하지 말 것 — 반드시 소스 코드를 먼저 읽을 것.
- 에러 발생 시 수동 Fix 안내만 하고 끝내지 말 것 — 자동 복구가 가능하면 자동으로 처리하고, 처리 결과를 사용자에게 보여줄 것.
- `.catch(() => {})` 로 에러를 silently 삼키지 말 것 — 최소한 로그에 남길 것.
- **Template literal 안 인라인 JS에서 regex 리터럴(`/.../`) 절대 사용 금지** — `\/`가 template escape로 소비되어 `//` 주석이 됨 → 전체 JS 파싱 실패. 반드시 `new RegExp('...')` 사용.
- **yaml.load() 결과의 Docker Compose labels를 사용할 때 반드시 `Array.isArray()` 체크** — 보일러플레이트 compose는 array 형식 `["key=val"]` 사용. Object로 캐스팅하면 `{0: "key=val"}` 깨짐.
- **External URL을 클라이언트에서 추측하지 말 것** — compose 서비스명과 앱 이름이 다를 수 있음. 반드시 서버사이드에서 컨테이너 Traefik 라벨 기반으로 계산.
- **Traefik PathPrefix로 SPA를 서빙할 때 trailing slash redirect 미들웨어 필수** — 없으면 `./assets/...` 상대경로가 잘못된 디렉토리로 해석되어 빈 화면.
- **자동 테스트에서 "통과" 보고 전 실제 사용자 경험 경로 검증 필수** — 직접 포트 curl과 admin 대시보드 External URL 링크 클릭은 완전히 다른 경로. 브라우저가 보는 것과 동일한 URL을 테스트할 것.
- **Next.js 스택에 Traefik strip-prefix / trailing-slash redirect 절대 사용 금지** — Next.js는 `basePath`로 sub-path를 자체 처리함. strip-prefix는 경로 이중 제거, trailing-slash는 `trailingSlash:false` 기본값과 충돌하여 무한 리다이렉트 발생. `addQuickTunnelAppLabels()`에 `noStrip: true` 사용.
- **Next.js basePath 설정 시 반드시 (1) Docker 이미지 `--no-cache` 재빌드, (2) healthcheck 경로 `/apps/{name}/health`로 업데이트, (3) `pollHealth`/`verifyEndpoints`의 baseUrl에 basePath 반영** — basePath는 빌드 시 bake-in되므로 재빌드 필수. healthcheck/pollHealth 미변경 시 unhealthy 무한 대기.
- **Quick Tunnel URL 감지 정규식은 반드시 하이픈 포함 서브도메인만 매칭해야 함** — cloudflared 로그에 실제 URL 이전에 `"Post https://api.trycloudflare.com/tunnel": context deadline exceeded"` 에러가 먼저 찍힘. `/[a-z0-9-]+\.trycloudflare\.com/` 패턴은 `api.trycloudflare.com` 오매칭. 반드시 `quick-tunnel.ts`와 동일한 `/[\w]+-[\w][\w-]*\.trycloudflare\.com/` 패턴 사용.
- **Nextcloud Quick Tunnel 모드에서 `NEXTCLOUD_TRUSTED_DOMAINS` env var에 반드시 `*.trycloudflare.com` 포함** — Nextcloud 29는 regex 미지원, `*` 와일드카드만 동작. regex(`/.*\.trycloudflare\.com/`) 넣으면 literal 문자열로 처리되어 아무것도 안 매칭됨. 컨테이너 재생성 시 env var 기준 재초기화되므로 occ 단독으로는 부족. `compose-generator.ts`의 `getNextcloudEnv()`와 `generate.ts`의 occ 호출 모두 `*.trycloudflare.com` 사용.
- **Admin 대시보드(admin-server.ts)는 완성본 — UI 수정 외 로직 변경 금지** — 기능 완성 상태이며 구조/로직 변경은 사전 명시적 요청 없이 진행하지 말 것.
- **Admin UI 디버깅 시 반드시 `pnpm --filter @brewnet/admin-ui dev`로 개발 서버 실행** — `localhost:5173`에서 Vite 개발 서버 구동. react-grab 등 브라우저 기반 디버깅 도구 사용 시 이 명령어로 먼저 서버를 띄워야 함.
- **Gitea API 반환 clone_url을 절대 그대로 사용하지 말 것** — Traefik strip-prefix 뒤의 Gitea는 `X-Forwarded-Host` 기반으로 subpath 없는 URL 반환 (예: `http://localhost/admin/repo.git` — `/git` 누락). `authedCloneUrl()`이 `baseUrl`로 재조립하므로 직접 clone_url 조립 금지.
- **`giteaBaseUrl`(API용)과 `giteaDisplayUrl`(표시용)은 반드시 분리** — Named Tunnel 모드에서 API URL은 `http://localhost/git`, 표시 URL은 `https://git.<zone>`. 혼용 시 auth redirect 깨짐 또는 터널 의존 API 실패.
- **Cloudflare DNS 레코드 생성 시 반드시 upsert 패턴 사용** — `createDnsRecord()`는 "already exists" 시 기존 레코드를 PATCH로 갱신. 터널 재생성 후 구 UUID가 남으면 Error 1033.
- **wizardState 변경하는 핸들러에서 반드시 인메모리 동기화** — `handleDomainConnect/Disconnect` 등 DomainManager가 디스크에 저장한 후 `loadState()` → `state.domainConnections = fresh` 필수. 안하면 GET /api/apps가 stale 데이터 반환.

## 🔁 Process Decision Rules

- **프로세스가 명세서(spec/MD)에 정의되어 있지 않은 경우**: 임의로 결정하지 말고 반드시 사용자에게 되물어볼 것.
  - 예: 에러 복구 방식, 실패 시 동작, UX 흐름 등이 spec에 없으면 → 구현 전 먼저 질문
- **같은 문제가 두 번 이상 반복될 경우**: 표면적 수정 전에 반드시 근본 원인(root cause)을 소스 레벨에서 확인할 것.
- **수정 후 반드시 runtime 검증**: 코드 변경 후 빌드 성공만으로 완료 판단 금지 — 실제 동작 경로를 소스 레벨에서 추적해서 fix가 실제로 작동하는지 확인.


## Investigation Rules

- When the same problem recurs and resolution is requested again, always perform a thorough source-level deep dive before responding.
- Never claim to have confirmed a fix without actually reading the relevant source code.

## Session Continuity

- After /compact completes and a new session context begins, always re-read CLAUDE.md to re-establish project context before proceeding.


## Tech Stack

### CLI (packages/cli)
- TypeScript 5, Node.js 20+
- Commander.js (CLI framework)
- @inquirer/prompts (interactive prompts)
- execa (process execution)
- chalk / ora (terminal styling)
- better-sqlite3 (local DB)
- dockerode (Docker API)
- simple-git (Git operations)

### Dashboard (packages/dashboard) — Pro Feature
- Next.js 14 (App Router)
- Tailwind CSS + shadcn/ui
- Zustand (state management)
- TanStack Query (data fetching)
- React Hook Form + Zod (forms/validation)
- Recharts (charts)
- xterm.js (web terminal)
- Monaco Editor (code editor)

### Shared (packages/shared)
- Common TypeScript types and utilities
- Shared validation schemas (Zod)

### System Integration (external, not npm)
- Docker / Docker Compose
- Nginx (reverse proxy, auto-configured)
- Traefik (service routing, alternative to Nginx)
- Certbot / Let's Encrypt (SSL)
- SQLite (local database via better-sqlite3)
- Gitea (Git server, Docker container)

## Project Structure (Monorepo with pnpm)

@PROJECT_STRUCTURE.md 참고 

## CLI Commands

```bash
brewnet init                   # Interactive setup wizard (7-step flow)
brewnet add <service>          # Add a service (e.g., jellyfin, nextcloud)
brewnet remove <service>       # Remove a service
brewnet up                     # Start all services (docker-compose up)
brewnet down                   # Stop all services
brewnet status                 # Show service status
brewnet logs [service]         # View logs
brewnet update                 # Update services
brewnet backup                 # Create backup
brewnet restore <backup-id>    # Restore from backup
brewnet export                 # Export configuration
brewnet deploy <path>          # Deploy an application
brewnet domain add <domain>    # Add custom domain
brewnet domain ssl <domain>    # Configure SSL
brewnet domain tunnel setup    # Configure Cloudflare Tunnel
brewnet domain tunnel status   # Check tunnel status
brewnet domain tunnel expose   # Add public hostname
brewnet storage init           # Initialize file storage
brewnet create-app <name>      # Scaffold a new app project
```

## Installation Flow (7-step wizard)

```
Step 0: System check (OS, Docker, ports, disk)
Step 1: Project setup (name, path, Full Install / Partial Install)
Step 2: Admin account + Server components (Web/File/App/DB/Media toggle cards)
Step 3: Runtime & Boilerplate (language, framework, scaffolding) — conditional: appServer only
Step 4: Domain & Network (provider: Local/Custom with Cloudflare Tunnel, SSL)
Step 5: Review & Confirm (includes credential propagation summary)
Step 6: Docker Compose generation, service startup, credential propagation, external access verification
Step 7: Complete (endpoints, credentials summary, tunnel status, external access verification commands)
```

## Database Schema (SQLite)
@DATABASE.md 참고 

## Development Conventions

- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm (monorepo workspaces)
- **Formatting**: Prettier
- **Linting**: ESLint
- **Testing**: Jest (unit/integration), Playwright (E2E)
- **Coverage Target**: 80%+ overall, 90%+ for CLI core
- **Build**: tsc for CLI, next build for dashboard
- **Node.js Version**: 20+

## Key Design Principles

1. **Zero Config** — Works out of the box with sensible defaults
3. **Transparent** — All operations logged, user can inspect/modify generated configs
4. **Reversible** — Every action can be undone (rollback, restore)
5. **Offline First** — Core CLI works without internet (except Docker pulls)

## Development Phases

| Phase | Focus | Duration |
|-------|-------|----------|
| 1 (MVP) | CLI foundation, Docker management, basic services | 2 weeks |
| 2 | Networking (domain, SSL, Nginx, Traefik) | 2 weeks |
| 3 | Security (ACL, firewall, SSO) | 2 weeks |
| 4 | Dashboard (Pro), monitoring, file/DB management | 2 weeks |
| 5 | Polish, testing, documentation, performance | 2 weeks |

## Config File Format

Projects deployed via Brewnet use `brewnet.yml`:

```yaml
name: my-app
type: nodejs
version: "20"
build:
  command: npm run build
  output: dist
start:
  command: npm start
  port: 3000
env:
  NODE_ENV: production
domain: myapp.example.com
ssl: true
```

## Spec Documents Reference

All detailed specifications are in the `spec/` directory:
- `SPEC.md` — Complete technical specification (v2.0)
- `PRD.md` — Product Requirements Document
- `PRD_FEATURES.md` — Feature specifications
- `PRD_TECHNICAL.md` — Technical architecture
- `PRD_API.md` — API specification (CLI + Dashboard REST/WebSocket)
- `PRD_VALIDATION.md` — Validation & gap analysis, revised MVP phases
- `brewnet-project-spec.md` — CLI wizard & docker-compose generation spec
- `IMPLEMENTATION_CHECKLIST.md` — UX improvement tasks
- `BREWNET_UX_SUMMARY.md` — UX summary & execution plan
- `UX_IMPROVEMENTS.md` — 13 UX improvement items
- `FINAL-SUMMARY.md` — Summary of 4 critical gaps found
- `brewnet_user_workflow_simulation.md` — 8-step user workflow simulation
- `file-server-complete-guide.md` — File server (Nextcloud/MinIO/Jellyfin/SFTP) guide
- `boilerplate-complete-guide.md` — App scaffolding/template generation guide
- `testing-complete-guide.md` — Testing strategy & CI/CD pipeline guide

## Language Policy

- Internal reasoning and planning: English
- Code and technical artifacts: English (variable names, comments, logs, error messages)
- Git commits: English, follow Conventional Commits (e.g., feat:, fix:, refactor:)
- User-facing responses: Korean (한국어)
  - Task summaries, explanations, and clarifying questions in Korean
  - When reporting errors or issues, describe the problem in Korean but keep the original error message in English

## Response Format

When completing a task, always end with a Korean summary:
- 무엇을 변경했는지
- 왜 그렇게 했는지
- 주의할 점이 있는지

---

# PROBLEM SOLVE

/changelog, /troubleshooting 으로 생성된 문서들을 참고:
- 변경 이력: `CHANGELOG.md`
- 에러 해결 히스토리: `troubleshooting/*.md`

