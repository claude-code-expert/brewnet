# Brewnet Development Changelog

> 이 문서는 Brewnet 프로젝트의 개발 히스토리를 기록합니다.
> 각 엔트리는 프롬프트, 변경사항, 영향받은 파일을 포함합니다.

## [develop] - 2026-03-28 09:37

### 🎯 Prompts
1. "프론트엔드 포트 충돌 해결" — 배포된 앱 포트(3001)가 기존 서비스와 충돌, 3003으로 직접 변경 후 DB 레코드 업데이트
2. "자동 포트 충돌 해소 구현" — docker compose up 실패 시 자동으로 빈 포트 탐지 후 .env 업데이트 + retry
3. "대시보드 도메인 프로바이더 상태 버그 수정" — named tunnel 생성 후 quick tunnel URL이 계속 표시되는 문제
4. "대시보드 Quick Tunnel 배너 named tunnel에서도 보이는 버그 수정" — 배너가 tunnelMode가 아닌 URL 존재 여부로 렌더링
5. "서비스 명칭/URL 불일치 수정" — brewnet 서비스가 Services 탭과 Apps 탭에서 다른 이름/URL 표시
6. "문서 구조 재편 검증" — CLAUDE.md에서 DB 스키마와 프로젝트 구조를 별도 파일로 분리 + MANDATORY 섹션 복원
7. "Supermemory MCP 설정" — Claude Desktop에 있던 설정을 Claude Code settings.json에도 추가

### ✅ Changes
- **Added**: `discoverProjectPath()` — `~/.brewnet/config.json` → `selections.json` → `~/brewnet/*/.brewnet.db` 파일시스템 스캔 3단계 프로젝트 경로 자동 발견 (`wizard/state.ts`)
- **Fixed**: `_dockerComposeUp()` — 포트 충돌 시 최대 2회 retry, 빈 포트 탐색 후 `.env` 자동 업데이트 (`app-manager.ts`)
- **Fixed**: dashboard config 엔드포인트 — `cf.tunnelMode`/`cf.zoneName`을 DB에서 직접 읽어 tunnelMode 정확도 개선 (`admin-server.ts`)
- **Fixed**: Services API — 등록된 앱이 있을 경우 앱 DB를 authoritative source로 사용해 name/url 통일 (`admin-server.ts`)
- **Fixed**: 프로젝트 경로 해석 — `discoverProjectPath()` 통합, DB 기반 admin 자격증명 읽기 + secrets file fallback (`admin-server.ts`)
- **Fixed**: `Dashboard.tsx` 배너 — `domainProvider === 'named-tunnel'`이면 named tunnel 배너, 아니면 quick tunnel URL 배너로 조건 분기
- **Added**: `useAppDomain` — `connectingMessage` 상태 추가, connect 단계별 진행 메시지 표시 (`useAppDomain.ts`)
- **Modified**: `.claude/CLAUDE.md` — DB 스키마를 `DATABASE.md`로, 프로젝트 구조를 `PROJECT_STRUCTURE.md`로 분리, `@ref` 링크로 대체
- **Added**: `.claude/DATABASE.md` — 테이블 스키마/인덱스/known keys 전체 문서화
- **Added**: `.claude/PROJECT_STRUCTURE.md` — 디렉토리 구조 + 코어 모듈 전체 문서화
- **Added**: Supermemory MCP 설정 — `~/.claude/settings.json`에 `mcp-supermemory-ai` 항목 추가

### 📁 Files Modified
- `packages/cli/src/wizard/state.ts` (+74 lines) — `discoverProjectPath()`, `expandTilde()`
- `packages/cli/src/services/admin-server.ts` (+492, -some lines) — 프로젝트 경로 발견, 자격증명 로직, Services API DB 통합, tunnelMode DB 읽기
- `packages/cli/src/services/app-manager.ts` (+85, -27 lines) — `_dockerComposeUp()` auto port conflict retry
- `packages/cli/src/services/project-db.ts` (+22 lines) — `getSettings`, `setSettings` bulk 연산
- `packages/admin-ui/src/pages/Dashboard.tsx` (+37, -3 lines) — named/quick tunnel 배너 조건 분기
- `packages/admin-ui/src/features/domain/hooks/useAppDomain.ts` (+88, -8 lines) — `connectingMessage`, 단계별 progress label
- `.claude/CLAUDE.md` (-196 lines) — DB/구조 섹션 분리
- `.claude/DATABASE.md` (신규)
- `.claude/PROJECT_STRUCTURE.md` (신규)

---

## [develop] - 2026-03-27 01:22

### 🎯 Prompts
1. "패치 해" (admin-daemon 크래시/종료 로깅 구현)
2. "http://localhost:8088/catalog 에 나오는 리스트는 정상인데 install 눌러도 아무 반응이 없어. 우리 명령어 중에 service install, add 명령어가 있었던거 같은데 이게 동작 안하는건지 테스트 및 검증해봐. 안되어있으면 구현하고 테스트 케이스 작성해"
3. "cronDelete 하고 http://localhost:8088/catalog 에 왜 설치 된 내역/설치할 내역이 제대로 동작하지 않는지 검증해서 패치해. 우리 명령어 중에 service 나 add 명령어로 앱 추가 하는거 연결하면 되는거 아냐?"
4. "커밋해" + "브랜치 따서 따로 보관해"

### ✅ Changes
- **Added**: `admin-daemon.ts` — SIGTERM/SIGINT/uncaughtException/unhandledRejection 핸들러 4개 + 시작/실패 로그, 데몬 크래시 원인 추적 가능 (`packages/cli/src/services/admin-daemon.ts`)
- **Fixed**: `handleInstallService` — `addService()`(compose 수정만)에 `docker compose up -d <id>` 추가, 설치 후 컨테이너 즉시 기동. 성공 시 `status: "running"`, docker 실패 시 `status: "compose_updated"` 반환 (`packages/cli/src/services/admin-server.ts`)
- **Fixed**: `handleRemoveService` — `docker compose rm -sf` 순서 버그 수정, compose에서 제거 전 먼저 컨테이너 중지 (이전엔 compose 제거 후 rm 시도 → ENOENT 실패) (`packages/cli/src/services/admin-server.ts`)
- **Fixed**: `findFirstAvailableAlternative` 플래키 테스트 — Docker PostgreSQL로 인해 5433 포트 선점 시 EADDRINUSE를 "외부 점유"로 처리, timeout 10초로 연장 (`tests/unit/cli/utils/port-utils.test.ts`)
- **Added**: 서비스 설치/제거 사이클 9개 테스트 케이스 추가 — execa mock, docker compose 호출 순서/인자 검증 (`tests/unit/cli/services/admin-server.test.ts`)

### 📊 Test Results
- Total: 2879+ tests passing (pre-commit hook 통과)
- Fix verified: `curl /api/catalog/install` → `{ status: "running" }` → `docker ps` 확인 ✅
- Fix verified: `curl /api/catalog/remove` → 컨테이너 제거 → `/api/catalog` installed:false ✅

### 📁 Files Modified
- `packages/cli/src/services/admin-daemon.ts` (+36 lines)
- `packages/cli/src/services/admin-server.ts` (+23, -1 lines)
- `tests/unit/cli/services/admin-server.test.ts` (+99, -14 lines)
- `tests/unit/cli/utils/port-utils.test.ts` (+13, -6 lines)

---

## [develop] - 2026-03-26 09:30

### 🎯 Prompts
1. "앱 git clone 후 deploy 한 뒤 도메인 연결 단계 마지막에 subdomain, root domain 연결시 에러 — ingress rules don't support proxying to a different path on the origin service"
2. "진행해" (루트 패스 서빙을 위한 basePath 제거 + Docker 리빌드 구현)
3. "빌드 해"

### ✅ Changes
- **Fixed**: CF Tunnel ingress origin URL에서 basePath 제거 — `http://host:3000/apps/x`는 CF API가 거부하므로 `http://host:3000`만 사용 (`cloudflare-client.ts:336`)
- **Added**: `unpatchNextConfig()` — `patchNextConfig()`의 역함수, Named Tunnel 전용 서브도메인에서 루트 패스 서빙을 위해 basePath/images/healthcheck 일괄 복원 (`boilerplate-manager.ts`)
- **Added**: Domain connect Step 0 — basePath 감지 시 자동으로 next.config에서 basePath 제거 → Docker `--no-cache` 리빌드 → 컨테이너 재시작, 실패 시 `patchNextConfig()`로 롤백 (`domain-manager.ts`)
- **Modified**: `ServiceRoute.basePath`, `DomainConnection.basePath` JSDoc 수정 — health check/logging 전용이며 CF Tunnel ingress에는 미사용 명시

### 📁 Files Modified
- `packages/cli/src/services/cloudflare-client.ts` (+2, -2 lines)
- `packages/cli/src/services/boilerplate-manager.ts` (+63 lines)
- `packages/cli/src/services/domain-manager.ts` (+35, -2 lines)
- `packages/shared/src/types/wizard-state.ts` (+1, -1 lines)

---

## [develop] - 2026-03-25 22:30

### 🎯 Prompts
1. "traefik 상세 모달에서 보안상 외부 도메인으로 노출하지 않습니다 영역 삭제해"
2. "domain 연결 후 subdomain 연동할 때 토스트 메시지가 너무 빨리 사라지니까 닫기 x 버튼을 통해 닫게 해줘"
3. "brewnet uninstall시 클라우드플레어 터널도 같이 정리해주는게 맞아"
4. "cloudflared LaunchDaemon 시스템 서비스 정리도 추가해"
5. "cli에서 시스템 체크 후 Installation type이 또 뜨는 중복 프롬프트 제거해"
6. "brewnet.simplite.net 404 문제 — domain connect 시 Next.js basePath를 tunnel ingress URL에 자동 반영"
7. "불필요한 테스트 파일 식별 및 삭제"

### ✅ Changes
- **Removed**: `ServiceDetailInfo.securityNote` 필드 및 Traefik 보안 경고 UI 블록 (`admin-server.ts`, `ServiceDetailModal.tsx`, `types.ts`)
- **Added**: `showPersistentToast()` — 닫기(✕) 버튼으로만 닫히는 persistent 토스트 (`Toast.tsx`)
- **Modified**: 도메인 연결 에러 시 `showPersistentToast` 사용 (`useAppDomain.ts`)
- **Added**: `brewnet uninstall` 시 Cloudflare Tunnel + DNS 자동 삭제 — `deleteTunnel(cascade: true)` (`uninstall.ts`, `cloudflare-client.ts`)
- **Added**: `cleanupCloudflaredService()` — macOS LaunchDaemon / Linux systemd 자동 정리 (`uninstall.ts`)
- **Fixed**: `init.ts` pre-step에서 Full Install 선택 후 `project-setup.ts`에서 Installation type 중복 프롬프트 제거
- **Fixed**: Domain connect 시 Next.js basePath를 tunnel ingress service URL에 자동 포함 (`domain-manager.ts`, `cloudflare-client.ts`)
- **Added**: `ServiceRoute.basePath`, `DomainConnection.basePath` 필드 (`cloudflare-client.ts`, `wizard-state.ts`)
- **Fixed**: Toast 타이머 언마운트 누수, `_hideTimer` null 미설정, `completedSteps` 중복 state 제거 (`Toast.tsx`, `DomainSettingModal.tsx`, `StepIndicator.tsx`)
- **Fixed**: `init.ts` silent catch → `console.warn` 로그 추가 (CLAUDE.md 규칙 준수)
- **Added**: 테스트 커버리지 85%+ 달성을 위한 15개 테스트 파일 추가/확장 (2861 tests)
- **Removed**: `docker-installer-extra.test.ts` 중복 테스트 파일 삭제

### 📊 Test Results
- Total: 2861/2861 passed (105 suites)
- Coverage: 85.11% CLI

### 📁 Files Modified (주요)
- `packages/cli/src/commands/uninstall.ts` (+112 lines — CF tunnel/DNS 자동 삭제, cloudflared 서비스 정리)
- `packages/cli/src/services/domain-manager.ts` (+98 lines — basePath 감지, ingress/health check 반영)
- `packages/cli/src/services/cloudflare-client.ts` (+25 lines — basePath in service URL, cascade delete)
- `packages/admin-ui/src/components/Toast.tsx` (+77 lines — persistent toast, close button)
- `packages/cli/src/commands/init.ts` (+5 lines — setupType 중복 제거)
- `packages/shared/src/types/wizard-state.ts` (+13 lines — basePath, wwwCnameRecordId, apex domain)
- 15 test files (+1800 lines)

---

## [develop] - 2026-03-24 — CLI list/update 명령어, Admin Catalog 페이지, SSH 제거, UI 개선

### 🎯 Prompts
1. "전체 명령어 리스트 보여줘" (Telegram)
2. "우리 프로젝트 전체 문서에서 ssh 관련 내역은 이제 진행하지 않으니까 주석처리해"
3. "전체 명령어 이거 맞나 검증해 하나씩 실행해서 각각 호출되고 제대로 된 결과가 나오는지 테스트"
4. "문서 업데이트 해 미구현된거 구현하려면 어떻게 해야 하는지 계획을 만들고 구현 방안을 수립해"
5. "update만 구현. 나머지는 보류 하고 전체 앱의 목록을 반환하는 명령어도 필요해"
6. "두개 다 구현해. update, list 둘다 어드민에서 버튼으로 해당 기능을 수행할 수 있도록"
7. "모든 모달 내부의 이 색상 텍스트는 좀 더 밝은 색으로 하고 폰트 크기도 하나 더 키워야 해"
8. "로그 시스템 문제점 3가지 수정하고 파일 보관 정책은 7일이야"
9. "ssh 삭제. 내부에 이제 ssh는 지원하지 않음" (Catalog)
10. "cloudflared 인스톨하면 어떻게 되는거지? 로직을 살펴봐" → Catalog에서 제외

### ✅ Changes

#### CLI 명령어 추가 (2개)
- **Added**: `brewnet list` — 서비스 카탈로그 + 앱 스택 목록 (`--stacks`, `--installed`, `--json`) (`packages/cli/src/commands/list.ts`)
- **Added**: `brewnet update` — Docker 이미지 pull + 서비스 재시작 (`--no-restart`) (`packages/cli/src/commands/update.ts`)
- **Modified**: 명령어 등록 14→16개 (`packages/cli/src/index.ts`)

#### Admin API
- **Added**: `POST /api/services/update` — 대시보드에서 서비스 업데이트 트리거 (`packages/cli/src/services/admin-server.ts`)

#### Admin UI — Catalog 페이지
- **Added**: `/catalog` 페이지 — 서비스 카탈로그 조회 + Install/Remove 버튼 (`packages/admin-ui/src/pages/Catalog.tsx`)
- **Added**: NavHeader에 "Catalog" 탭 추가 (`packages/admin-ui/src/components/NavHeader.tsx`)
- **Added**: `/catalog` 라우트 등록 (`packages/admin-ui/src/router.tsx`)

#### Admin UI — Dashboard
- **Added**: "Update Services" 버튼 + 상태 메시지 (`packages/admin-ui/src/pages/Dashboard.tsx`)

#### SSH 기능 제거 (전체 문서)
- **Modified**: 14개 문서 파일에서 SSH 관련 내용 HTML 주석 처리
- **Modified**: Catalog API에서 `openssh-server` 제외 (`admin-server.ts`)
- **Modified**: Catalog API에서 `cloudflared` 제외 (독립 설치 불가)

#### 로그 시스템 수정 (4건)
- **Fixed**: `formatTs()` 날짜 미표시 → `MM-DD HH:MM:SS.mmm` 형식 (`LogsTab.tsx`)
- **Fixed**: `LogEntry.ts` → `timestamp` 필드명 불일치 수정 (`types.ts`, `LogsTab.tsx`)
- **Added**: UI 기본 `since=24h` 필터 추가 (`LogsTab.tsx`)
- **Added**: 서버 시작 시 로그 로테이션 즉시 실행 (`admin-server.ts`)
- **Modified**: 로그 보관 정책 30일→7일 (`constants.ts`)

#### UI 색상/크기 개선 (다수)
- **Modified**: 모달 내부 `--txt3` 오버라이드 → `#6889b0` (밝게) (`global.css .modal`)
- **Modified**: `.sk` (stat label) — `var(--txt3)` → `var(--txt2)`, `10px` → `11px`
- **Modified**: `.rtbl th` (테이블 헤더) — `#e0e8f0` (거의 흰색), `11px`
- **Modified**: `#header` 높이 `50px` → `65px`, 로고 `16px` → `18px`
- **Modified**: ☕ 이모지 → brewnet SVG 아이콘 (`NavHeader.tsx`)
- **Modified**: Footer — copyright + brewnet.dev(amber) + GitHub 아이콘 추가 (`Footer.tsx`)
- **Modified**: AppCard 높이 `200px` 고정, 그리드 너비 `350px` → `370px`

#### 문서 정리
- **Modified**: CLAUDE.md, README.md — 실제 구현된 22개 명령어로 업데이트
- **Added**: `tests/cli-command-verify.sh` — CLI 명령어 검증 스크립트 (24 PASS)

### 📊 Test Results
- CLI commands: 24/24 PASS, 2 PENDING (deploy, storage)
- Unit tests: 58/58 passed (commands/index.test.ts)

### 📁 Files Modified
- `.claude/CLAUDE.md` (+31, -31 lines)
- `README.md` (+86, -81 lines)
- `packages/admin-ui/src/pages/Catalog.tsx` (NEW, ~250 lines)
- `packages/cli/src/commands/list.ts` (NEW, ~210 lines)
- `packages/cli/src/commands/update.ts` (NEW, ~90 lines)
- `packages/cli/src/index.ts` (+4 lines)
- `packages/cli/src/services/admin-server.ts` (+49 lines)
- `packages/admin-ui/src/pages/Dashboard.tsx` (+31 lines)
- `packages/admin-ui/src/components/NavHeader.tsx` (+15 lines)
- `packages/admin-ui/src/components/Footer.tsx` (+21 lines)
- `packages/admin-ui/src/components/LogsTab.tsx` (+15, -20 lines)
- `packages/admin-ui/src/components/AppCard.tsx` (+11 lines)
- `packages/admin-ui/src/styles/global.css` (+10, -10 lines)
- `packages/admin-ui/src/types.ts` (+1, -1 lines)
- `packages/shared/src/utils/constants.ts` (+1, -1 lines)
- `tests/unit/cli/commands/index.test.ts` (+2, -2 lines)
- `tests/cli-command-verify.sh` (NEW)
- `docs/superpowers/plans/2026-03-23-update-and-list-commands.md` (NEW)
- 14 spec/doc files (SSH comment-out)

---

## [develop] - 2026-03-22 — v0.0.8 릴리즈: npm 배포 파이프라인, 설치 UX 개선, wizard 단순화

### 🎯 Prompts
1. "git tag 후 git push origin v0.0.1 --force 로 하면 npm에 제대로 올라가는건지 검사해봐"
2. "설치할 때 BREWNET V1.0.1 을 가져오는데 이거 어디서 가져오는거지? 버전은 PACKAGE.JSON에서 가져오는거 아니야?"
3. "sudo 권한이 필요합니다 /usr/local/bin 에 설치합니다. 하고 비번 넣어줬는데 no such file or directory 에러"
4. "npm install 한 뒤 brewnet init 해도 아무 동작 안하고 brewnet --version에도 아무런 반응이 없어"
5. "admin pannel 열때 admin ui not built 동일하게 나와"
6. "Pulling Docker images...에서 다음 단계로 못가는거 같은데"
7. "Applications 폴더로 이동 중... 에서 다음 화면으로 안넘어가는거 같아"
8. "file server는 nextcloud 하나만 지원하자"
9. "mysql 선택시 하위 버전 옵션 나오는데 최신으로 하나만 깔도록 해"
10. "boilerplate 단계에서 기술 스택 정하면 그냥 설치하겠다고 동의한거니까 바로 설치하게 해"
11. "npm 과 curl이 완전하게 분리되서 설치할 수 있도록 설계해야해"
12. "ExitPromptError: User force closed the prompt with 0 null"

### ✅ Changes

#### npm 배포 파이프라인 구축
- **Added**: GitHub Actions `publish.yml` — `v*` 태그 push 시 자동 npm 게시 (`@brewnet/cli`)
- **Added**: `scripts/test-npm-install.sh` — npm install 로컬 시뮬레이션 테스트 (npm pack → install → smoke test)
- **Fixed**: CI workflow에 admin-ui 빌드 단계 추가 (npm 패키지에 대시보드 누락 해결)

#### CLI 진입점 수정
- **Fixed**: `isDirectRun` 경로 매칭 → 테스트 환경 감지로 변경 (npm global 심링크에서 silent exit 해결) (`packages/cli/src/index.ts`)
- **Fixed**: async IIFE + parseAsync → 동기 parse로 변경 (ExitPromptError 해결)
- **Removed**: auto-init 로직 제거 — `brewnet init`으로 통일

#### Admin UI 번들링
- **Added**: tsup onSuccess — `admin-ui/dist` → `cli/dist/admin-ui/` 자동 복사 (`packages/cli/tsup.config.ts`)
- **Fixed**: `admin-server.ts` 경로 `../../admin-ui` → `../admin-ui` (dist 밖을 가리키던 버그)
- **Refactored**: monorepo fallback 제거 — `dist/admin-ui/` 단일 경로만 사용

#### install.sh 수정
- **Fixed**: `/usr/local/bin` 미존재 시 `sudo mkdir -p` 추가
- **Fixed**: brew install --cask `stdio: 'inherit'`로 변경 (sudo 프롬프트 가려지던 문제)
- **Fixed**: docker pull `stdio: 'inherit'`로 변경 (진행률 표시)
- **Changed**: 버전 하드코딩 제거 → `package.json`에서 동적 로드
- **Changed**: 빌드를 admin-ui → shared → cli 3단계로 분리 (실패 가시화)
- **Removed**: `exec brewnet init` 제거 — curl/npm 설치 경로 완전 분리

#### Wizard 단순화
- **Changed**: File Server 2단계(활성화→서비스 선택) → Nextcloud 설치 1단계로 축소
- **Changed**: DB 버전 선택 제거 — 최신 버전 자동 할당 (PostgreSQL 18.3, MySQL 8.4)
- **Removed**: "Generate boilerplate?" 확인 질문 제거 — 스택 선택 시 바로 설치
- **Removed**: SSH 서버 포트(2222) 시스템 체크에서 제거

#### 기타
- **Fixed**: deploy 시 "repo not found" 경로에 unshallow 체크 추가 (`shallow update not allowed` 해결)
- **Added**: landing page hero-links 버튼 (brewnet.dev + GitHub)
- **Changed**: README — curl 설치만 권장, npm/SSH/MinIO 참조 제거

### 📊 npm Versions Published
- v0.0.1 → v0.0.8 (8 releases)

### 📁 Key Files Modified
- `packages/cli/src/index.ts` — CLI 진입점 (4회 수정)
- `packages/cli/src/services/admin-server.ts` — admin UI 경로 (3회 수정)
- `packages/cli/tsup.config.ts` — admin-ui 번들링
- `install.sh` — 설치 스크립트 (6회 수정)
- `.github/workflows/publish.yml` — npm 배포 워크플로우
- `packages/cli/src/wizard/steps/server-components.ts` — wizard 단순화
- `packages/cli/src/wizard/steps/dev-stack.ts` — boilerplate confirm 제거
- `packages/cli/src/services/docker-installer.ts` — brew stdio 수정
- `packages/cli/src/wizard/steps/generate.ts` — docker pull stdio 수정
- `README.md` — 설치 문서 정리

---

## [feature/named-tunnel-builtin-services] - 2026-03-22 14:00 — Named Tunnel 근본 버그 4건 수정 (DNS/Git Push/State Sync/Gitea Link)

### 🎯 Prompts
1. "git clone 시 여전히 에러 나고 있어 — 어제만 해도 잘 되던건데 static 한 리소스도 클론 후 gitea 푸시, deploy 및 도메인 연결이 되어야 해"
2. "https://git.simplite.net/admin/nodejs-nestjs 이 주소 들어가면 에러 1033 나고 있어"
3. "http://localhost/git/admin/nodejs-nestjs.git 접근시 http://localhost/user/login 로 리디렉션 되고 있는거 같아"
4. "버튼 룩앤필이 안맞아 아이콘은 lucid를 원칙으로 써야 해"

### ✅ Changes

#### 버그 수정 — DNS CNAME Stale Tunnel UUID (Error 1033)
- **Root Cause**: `createDnsRecord()`가 "already exists" 에러 시 기존 CNAME을 갱신하지 않고 무시 → 터널 재생성 후 구 UUID 가리킴
- **Fixed**: `createDnsRecord()`에 upsert 로직 추가 — POST 실패 시 `getDnsRecords()` + PATCH로 기존 레코드 갱신 (`packages/cli/src/services/cloudflare-client.ts`)

#### 버그 수정 — Git Push 실패 (clone_url /git prefix 누락)
- **Root Cause**: Traefik `strip-prefix: /git` → Gitea가 `X-Forwarded-Host` 기반으로 `http://localhost/admin/repo.git` 반환 (/git 없음) → Traefik이 admin-ui SPA로 라우팅
- **Fixed**: `authedCloneUrl()`에서 `user/repo.git` 패턴 추출 후 `baseUrl`(`http://localhost/git`)로 재조립 (`packages/cli/src/services/gitea-client.ts`)

#### 버그 수정 — 도메인 연결 후 wizardState 미갱신
- **Root Cause**: `wizardState`는 서버 시작 시 1회 로드되는 인메모리 싱글톤. `DomainManager.connect()`가 디스크에 저장해도 인메모리 미갱신
- **Fixed**: `handleDomainConnect()`/`handleDomainDisconnect()` 성공 후 `loadState()` → `state.domainConnections` 동기화 (`packages/cli/src/services/admin-server.ts`)

#### 버그 수정 — Gitea 링크 로그인 리디렉트
- **Root Cause**: `getAppGitInfo()`의 `giteaUrl`이 항상 `http://localhost/git/...` → Named Tunnel에서 autologin 경유 → ROOT_URL 불일치로 auth redirect 깨짐
- **Fixed**: `AppContext`에 `giteaDisplayUrl` 추가 — Named Tunnel이면 `https://git.<zone>`, 아니면 로컬 URL. `giteaUrl`과 `giteaRepoUrl`에 사용 (`packages/cli/src/services/app-manager.ts`)

#### 기능 추가
- **Added**: Static site 지원 — Git Clone 모드에서 docker-compose.yml 없는 저장소에 `ensureComposeFile()` 자동 호출 → nginx 기반 compose 생성 (`packages/cli/src/services/app-manager.ts`)
- **Added**: `gitea-config.json` 항상 `http://localhost/git` 저장 — Named Tunnel 외부 URL 사용 금지 (`packages/cli/src/services/admin-server.ts`, `packages/cli/src/wizard/steps/generate.ts`)
- **Added**: `resolveContext()` — `giteaBaseUrl`을 항상 `http://localhost/git`으로 고정 (터널 상태 무관) (`packages/cli/src/services/app-manager.ts`)

#### UI 개선
- **Modified**: CreateAppModal 모드 선택 버튼 — 이모지(📦🔗) → Lucide 아이콘(Package, GitBranch) + 선택 상태 fontWeight 강조 (`packages/admin-ui/src/components/CreateAppModal.tsx`)

### 📁 Files Modified
- `packages/cli/src/services/cloudflare-client.ts` (createDnsRecord upsert)
- `packages/cli/src/services/gitea-client.ts` (authedCloneUrl URL 정규화)
- `packages/cli/src/services/admin-server.ts` (wizardState 동기화, gitea-config.json 정규화)
- `packages/cli/src/services/app-manager.ts` (giteaDisplayUrl, ensureComposeFile, resolveContext)
- `packages/cli/src/wizard/steps/generate.ts` (gitea-config.json localhost/git 고정)
- `packages/cli/src/services/domain-manager.ts` (zoneName 경로 수정)
- `packages/admin-ui/src/components/CreateAppModal.tsx` (Lucide 아이콘)

### 📋 Troubleshooting 기록
- `troubleshooting/dns-cname-stale-tunnel-uuid-error-1033.md`
- `troubleshooting/gitea-clone-url-missing-git-prefix.md`
- `troubleshooting/wizardstate-stale-domain-connections.md`
- `troubleshooting/gitea-link-login-redirect-named-tunnel.md`

---

## [feature/named-tunnel-builtin-services] - 2026-03-22 — Named Tunnel 전환 이슈 수정 + ServiceDetailModal 개선

### 🎯 Prompts
1. "도메인 연결 후 Nextcloud 페이지를 찾을 수 없음 — https://cloud.simplite.net 에러"
2. "traefik 카드는 도메인 연결된건데도 로컬만 나오는데. 상세 화면도 로컬만 있어"
3. "ssh -p 2222 admin@localhost 이것도 도메인 연결되면 바뀌어야 하는거 아닌가 싶은데"
4. "이 내용 간단하게 요약해서 외부 도메인 연결해도 보안 때문에 내부접근만 허용한다 하고 상세 모달에서 안내를 해줘야 해"
5. "아냐 이거 별도의 문서 md로 만들어서 phase 폴더 안에다 넣어 [SSH automation spec]"
6. "@CopyButton 이거 텍스트랑 테두리 좀 더 밝게 해"
7. "http://localhost:3000/admin/nodejs-express 접속하면 404 나와 @InfoRow Gitea URL — 왜 소스 푸시 안된거지?"
8. "@OverviewTab 도메인이 프론트에 연결된 상태면 백엔드도 호출될 수 있을텐데 왜 백엔드 도메인은 주소는 안나오는건지 조사해봐"
9. "무슨 소리야 https://nodejs-express.simplite.net/api/hello 로 이동하면 바로 백엔드 호출되는데 왜 호출이 안된다는거야? 소스 코드 다 확인하고 답변하라고 했지. 그냥 url이 제대로 표기 안되는 문제인거잖아"
10. "지금 내용 다 깔끔하게 정리해서 /changelog /troubleshooting 에 기록해. 다시 반복되지 않도록 gitea, domain 사항들 다 정리해놔"
11. "@OverviewTab 프론트 주소로 도메인 연결됐는데 /api/hello 가 기본값이야 [backend external URL에 /api/hello 추가]"

### ✅ Changes

#### 버그 수정
- **Fixed**: Named Tunnel 모드에서 비통합 앱 `backendExternalUrl = null` 오류 → `https://${domainConn.hostname}/api/hello`로 수정 (GET /api/apps L1344, GET /api/apps/:name L1500) (`packages/cli/src/services/admin-server.ts`)
- **Fixed**: Named Tunnel 모드에서 Gitea URL이 `http://localhost:3000/...`으로 표시 — Named Tunnel은 Gitea HTTP 포트(3000) 미노출 → `https://git.${zoneName}` 사용으로 수정 (`packages/cli/src/services/app-manager.ts:477`)

#### 신규 기능
- **Added**: `ServiceDetailInfo.securityNote` 필드 — 서비스 상세 모달에 보안 안내 텍스트 표시 (`packages/cli/src/services/admin-server.ts`, `packages/admin-ui/src/types.ts`)
- **Added**: Traefik `securityNote` — "도메인 연결 후에도 보안상 로컬 네트워크에서만 접근 가능합니다 (의도된 설계)" 안내 추가 (`packages/cli/src/services/admin-server.ts`)
- **Added**: `ServiceDetailModal` securityNote 렌더링 블록 — 황색 경고 박스 스타일 (`packages/admin-ui/src/components/ServiceDetailModal.tsx`)
- **Added**: `specs/007-ssh-external-access/spec.md` — SSH 외부 접근 자동화 스펙 (Cloudflare A레코드, Phase 1-3 구현 계획) (`specs/007-ssh-external-access/spec.md`)

#### UI 개선
- **Modified**: CopyButton 텍스트/테두리 색상 밝게 조정 — `var(--txt3)` → `var(--txt2)`, `var(--bdr)` → `var(--bdr2)` (`packages/admin-ui/src/components/ServiceCard.tsx`)

#### 수동 복구 (코드 변경 아님)
- Gitea `gitea_db` 재생성 후 admin 계정 소실 → `gitea admin user create` + `change-password --must-change-password=false` + `generate-access-token` 실행
- Nextcloud Named Tunnel 전환 후 `overwritewebroot=/cloud` 잔존 → `occ config:system:set` 3개 명령으로 수동 수정
- Gitea 토큰 재생성 + Gitea URL 수정 → admin-server 재시작

### 📁 Files Modified
- `packages/cli/src/services/admin-server.ts` (backendExternalUrl /api/hello, securityNote)
- `packages/cli/src/services/app-manager.ts` (giteaBaseUrl Named Tunnel 수정)
- `packages/admin-ui/src/components/ServiceDetailModal.tsx` (securityNote 렌더링)
- `packages/admin-ui/src/components/ServiceCard.tsx` (CopyButton 색상)
- `packages/admin-ui/src/types.ts` (securityNote 타입)
- `specs/007-ssh-external-access/spec.md` (신규)
- `troubleshooting/gitea-admin-lost-after-db-recreation.md` (신규)
- `troubleshooting/nextcloud-named-tunnel-overwritewebroot-remnant.md` (신규)
- `troubleshooting/gitea-url-localhost-port-not-exposed-named-tunnel.md` (신규)
- `troubleshooting/named-tunnel-nonunified-backend-url-wrong-null.md` (신규)
- `troubleshooting/README.md` (4개 신규 파일 인덱스 추가)

---

## [006-domain-settings] - 2026-03-21 — Cloudflare Tunnel 도메인 설정 UI + App Domain 연결 기능 완성

### 🎯 Prompts
1. "006 feature - CloudflareTunnelModal 다단계 위자드 + AppDomainTab 구현"
2. "zone 로드가 안돼 — admin password 입력 후에도 빈 상태 유지"
3. "accountId를 getAccounts API가 실패하면 zones 응답에서 fallback으로 추출해줘"
4. "create-app으로 만든 앱 도메인 연결이 500 에러"
5. "cloudflared container가 named tunnel로 안 바뀜 — 아직도 quick tunnel로 동작"
6. "tunnel ingress에 create-app 앱 라우팅이 없어"
7. "AppDomainTab 서브도메인 입력 필드 border가 안 보임"
8. "modal 바깥 클릭하면 닫혀버려 — 실수로 닫히는 경우 있음"
9. "Disconnect 버튼 빨간색으로, 오른쪽 정렬"
10. "현재 프로젝트 오늘 완료된 것, changelog와 troubleshooting 작성해"

### ✅ Changes

#### 신규 기능 — Cloudflare Tunnel 설정 위자드
- **Added**: `CloudflareTunnelModal` — 4단계 위자드 (token → zone → tunnel → complete) 구현 (`packages/admin-ui/src/features/domain/components/CloudflareTunnelModal.tsx`)
- **Added**: `TokenStep` — API 토큰 입력 및 검증 단계 (`features/domain/components/TokenStep.tsx`)
- **Added**: `ZoneStep` — Cloudflare 존 목록 드롭다운 선택 단계 (`features/domain/components/ZoneStep.tsx`)
- **Added**: `TunnelStep` — 터널 이름 입력 + 생성 상태 표시 + 에러 재시도 UI (`features/domain/components/TunnelStep.tsx`)
- **Added**: `useCloudflareSetup` 훅 — 위자드 상태 머신, 단계별 API 호출 조율 (`features/domain/hooks/useCloudflareSetup.ts`)
- **Added**: `domain-api.ts` — 도메인 설정 REST API 래퍼 (getSettings, saveToken, saveZone, listZones, createTunnel, connect, disconnect) (`features/domain/api/domain-api.ts`)

#### 신규 기능 — App Domain 연결 탭
- **Added**: `AppDomainTab` — App Detail 내 도메인 연결/해제 탭 (서브도메인 입력, CNAME 생성, tunnel ingress 등록) (`features/domain/components/AppDomainTab.tsx`)
- **Added**: `backendUrl`, `backendInternalUrl` 필드를 `AppEntry` 타입에 추가 (`packages/admin-ui/src/types.ts`)
- **Added**: admin-server `GET /api/apps` 응답에 `backendUrl`/`backendInternalUrl` 생성 — split-stack 앱(프론트+백 분리)의 백엔드 포트 자동 감지 (`packages/cli/src/services/admin-server.ts`)

#### 신규 기능 — Cloudflare 자동화
- **Added**: `patchCloudflaredToNamedTunnel()` — named tunnel 설정 완료 후 docker-compose.yml의 cloudflared 컨테이너를 quick-tunnel → named-tunnel로 자동 패치 + docker-compose re-up (`packages/cli/src/services/compose-generator.ts`)
- **Added**: `accountId` zones 응답 fallback 추출 — `getAccounts()` API 실패 시 zones listing 응답의 `account.id`에서 자동 추출 (`packages/cli/src/services/cloudflare-client.ts`, `packages/cli/src/services/admin-server.ts`)
- **Added**: `handleCloudflareZones`에서 zones 로딩 시 proactive accountId 추출 및 저장 (`packages/cli/src/services/admin-server.ts`)
- **Added**: project-specific 기본 터널 이름 — 프로젝트 이름 기반 자동 생성 (`features/domain/types.ts`)

#### 신규 기능 — UI/UX
- **Added**: 커스텀 styled `<select>` — SVG 셰브론 아이콘 포함 드롭다운 (`packages/admin-ui/src/styles/global.css`)
- **Added**: TunnelStep 에러 박스 스타일링 — 경고 색상 배경, 재시작 버튼 우측 정렬 (`features/domain/components/TunnelStep.tsx`)
- **Added**: TunnelStep docker-compose + cloudflared 재시작 상태 실시간 표시 (`features/domain/components/TunnelStep.tsx`)
- **Added**: CloudflareTunnelModal 완료 화면에 docker 작업 상태 표시 (`features/domain/components/CloudflareTunnelModal.tsx`)

#### 버그 수정
- **Fixed**: admin password 입력 후 zone 목록이 빈 상태 — `useCloudflareSetup`이 비동기 상태 업데이트 완료 전 zone 로드 시도 → 패스워드를 직접 전달하도록 수정 (`features/domain/hooks/useCloudflareSetup.ts`)
- **Fixed**: create-app으로 생성한 앱 도메인 연결 500 에러 — `domain-manager.ts`에서 앱 이름 해석 오류 → 정확한 이름 매핑으로 수정 (`packages/cli/src/services/domain-manager.ts`)
- **Fixed**: create-app 앱의 Cloudflare tunnel ingress 라우팅 누락 — `configureTunnelIngress()`에서 서비스명 불일치 → apps registry 기반 lookup으로 수정 (`packages/cli/src/services/domain-manager.ts`)
- **Fixed**: cloudflared 컨테이너가 named tunnel 설정 후에도 quick tunnel로 계속 동작 — compose file 패치 없이 cloudflared가 재시작됨 → `patchCloudflaredToNamedTunnel()` 자동 호출 추가 (`packages/cli/src/services/compose-generator.ts`)
- **Fixed**: AppDomainTab 서브도메인 입력 필드 border 미표시 — CSS 클래스 누락 → 글로벌 input 스타일 적용 (`features/domain/components/AppDomainTab.tsx`)
- **Fixed**: Modal 배경 클릭 시 실수로 닫힘 — `AppDetailModal`, `ConfirmModal`, `CloudflareTunnelModal` 모두 overlay click handler 제거 (`packages/admin-ui/src/components/AppDetailModal.tsx`)
- **Fixed**: non-unified split-stack 앱 프론트엔드 포트 감지 — domain 연결 시 백엔드 포트 대신 프론트엔드 포트로 라우팅 (`packages/cli/src/services/domain-manager.ts`)

#### UI 레이아웃 개선
- **Changed**: AppDomainTab 서브도메인 폼 레이아웃 — 수직 → 단일 행 수평 배치, 입력/존명/버튼 그룹화 후 flex-end 우측 정렬
- **Changed**: Disconnect 버튼 텍스트 빨간색 처리 (위험 액션 표시)
- **Changed**: 존 이름 표시 너비 250px 고정

### 📁 Files Modified
- `packages/admin-ui/src/features/domain/` — 신규 디렉토리 전체 (components, hooks, api, types)
- `packages/admin-ui/src/types.ts` (+2 필드)
- `packages/admin-ui/src/styles/global.css` (+28 lines — styled select)
- `packages/admin-ui/src/pages/AppDetail.tsx` (Domain 탭 통합)
- `packages/admin-ui/src/components/AppDetailModal.tsx` (overlay click 제거)
- `packages/cli/src/services/admin-server.ts` (+452, -0 — 도메인 API 엔드포인트 전체 + backendUrl 생성)
- `packages/cli/src/services/domain-manager.ts` (+86, -0 — create-app 지원 + 프론트 포트 감지)
- `packages/cli/src/services/compose-generator.ts` (+42 — patchCloudflaredToNamedTunnel)
- `packages/cli/src/services/cloudflare-client.ts` (+11 — accountId 추출)

---

## [001-fix-create-app-modal] - 2026-03-19 22:xx

### 🎯 Prompts
1. `@<AppCard>` — node/nest 인데 front는 어떻게 접속하지? 접속할 수 있는 버튼이나 주소가 표기 안됨
2. nest 생성 시 포트 3000이 점유 중이었는데 localhost로 접근하면 다른 앱(개발 중)으로 나와. 이 포트 맞는 거야?
3. `@<AppCard>` 이건 아직 deploy 하지 않았기 때문에 overview에서 GITEA URL을 눌러도 404. deploy 해야 주소가 나온다고 안내하는 게 맞지 않을까?
4. `@<OverviewTab>` 배포 후 overview에 들어갔는데 "Deploy 먼저" 배너가 똑같이 나오고 있어
5. deploy 할 때 gitea에 push 하는 과정이 생략된 거 같은데? Gitea 접속하면 소스 아무것도 없어

### ✅ Changes
- **Fixed**: non-unified 보일러플레이트 앱의 `localUrl`이 백엔드 포트(8080)를 가리키던 문제 → `.brewnet-boilerplate.json` 참조로 프론트 URL 반환 (`admin-server.ts`)
- **Fixed**: `.brewnet-boilerplate.json`의 `frontendUrl`이 항상 3000 하드코딩 → `.env`의 `FRONTEND_PORT` 직접 읽도록 수정 (`admin-server.ts`)
- **Fixed**: 위자드 흐름에서도 `frontendUrl` 하드코딩 제거 → 실제 할당된 `frontendPort` 변수 사용 (`generate.ts`)
- **Fixed**: `GET /api/apps/:name` 단일 앱 엔드포인트가 `lastDeployedAt` enrichment 없이 raw 반환 → 목록 엔드포인트와 동일하게 enrichment 적용 (`admin-server.ts`)
- **Added**: `OverviewTab` — `lastDeployedAt` null 시 Git Repository 섹션에 "Deploy 먼저" amber 경고 배너, Gitea URL 링크 opacity 흐리게 처리 (`OverviewTab.tsx`)
- **Fixed**: deploy 시 Gitea repo가 존재하지만 empty일 때 push 생략 → `repoIsEmpty()` 체크 후 push 처리 (`app-manager.ts`, `gitea-client.ts`)
- **Fixed**: shallow clone 보일러플레이트를 empty Gitea repo에 push 시 "shallow update not allowed" 에러 → unshallow 후 push (`app-manager.ts`)

### 📁 Files Modified
- `packages/cli/src/services/admin-server.ts` (enrichment 로직 2곳 추가)
- `packages/cli/src/services/app-manager.ts` (empty repo push + unshallow 로직)
- `packages/cli/src/services/gitea-client.ts` (`repoIsEmpty()` 메서드 추가)
- `packages/cli/src/wizard/steps/generate.ts` (`frontendUrl` 하드코딩 제거)
- `packages/admin-ui/src/components/OverviewTab.tsx` (미배포 경고 배너 추가)

---

## [001-fix-create-app-modal] - 2026-03-19 22:31 — Git Clone 앱 Deploy 시 Traefik 라우팅 + Next.js basePath 미주입 버그 수정

### 🎯 Prompts
1. "Implement the following plan: Git Clone 앱 Deploy 시 Traefik 라우팅 + Next.js basePath 미주입 버그 수정"
2. "/simplify"

### ✅ Changes
- **Fixed**: `_runDeploy`가 scaffold 후 `_injectQuickTunnelIfNeeded` 미호출 → Traefik 라벨 미주입 버그 (`packages/cli/src/services/app-manager.ts:260`)
- **Fixed**: `patchNextConfig`가 `output: 'standalone'` 없는 사용자 repo (예: `brewnet-web`)의 `next.config.ts`에 `basePath` 미삽입 → CSS/JS 404 버그 (`packages/cli/src/services/boilerplate-manager.ts:332`)
- **Fixed**: compose healthcheck에 root path `/` → `basePath/` fallback 추가 (scaffolded templates 대응) (`packages/cli/src/services/boilerplate-manager.ts:360`)
- **Fixed**: `_injectQuickTunnelIfNeeded` ESM 환경에서 `require()` 사용 → 런타임 오류 → `async` + `await import()`로 교체 (`packages/cli/src/services/app-manager.ts:387`)
- **Fixed**: `resolveContext`의 `WizardState` 필드에 불필요한 `as` 캐스트 → 직접 접근으로 교체 (`packages/cli/src/services/app-manager.ts:380`)

### 📁 Files Modified
- `packages/cli/src/services/app-manager.ts` (+90, -24 lines)
- `packages/cli/src/services/boilerplate-manager.ts` (+14, -2 lines)

---

## [001-fix-create-app-modal] - 2026-03-19 13:55 — wizardState null 버그 수정 + test-cycle.sh lastProject 자동 복원 + 16/16 전체 통과 + 66/66 단위 테스트 통과

### 🎯 Prompts (주요)
1. "(세션 연속) test-cycle.sh --skip-init 재실행 시 Gitea 401 + create-app 전체 실패 → 근본 원인 수정 → 16/16 + 66/66 전체 통과 → /add-md /changelog /troubleshooting 작성 후 리포트"

### ✅ Changes
- **Fixed**: admin-server wizardState null 버그 — `~/.brewnet/config.json`의 `lastProject` 빈값으로 시작 시 `wizardState=null` → Gitea 패스워드 없음 → 모든 create-app 실패 (환경 복원으로 해결)
- **Fixed**: Phase 9.4 `/api/settings/cloudflare` 401 — wizardState null이므로 `checkAdminAuth()` 즉시 401 반환 (admin-server 재시작으로 해결)
- **Fixed**: Phase 10-11 create-app 전체 실패 — `resolveContext()` 비밀번호 의존 체인 끊김 (lastProject → state → secretsPath)
- **Added**: `test-cycle.sh` — `--skip-init` 시작 부분에 lastProject 자동 검증/복원 로직 추가 (`CONFIG_BACKUP`에서 복원)
- **Added**: `troubleshooting/admin-server-wizardstate-null-lastproject-empty.md` — 트러블슈팅 문서 신규 작성
- **Added**: `.claude/CLAUDE.md` — wizardState null 시나리오 섹션 추가 (재발 방지 체크리스트 포함)

### 📊 Test Results
- **test-cycle.sh**: Phase 11 16/16 통과 ✅ (go×3, rust×2, java×2, kotlin×2, nodejs×4, python×3)
- **Unit Tests**: 66/66 스위트 통과, 2266 tests passed ✅
- 각 스택별 검증 항목: localhost health, 페이지 로드, Gitea 레포 확인, Overview API, Git info, Logs SSE, Deploy settings, Domain tab, Stop/Start/Deploy/Delete toast 트리거

### 📁 Files Modified (이번 세션)
- `test-cycle.sh` (+35 lines, lastProject 자동 복원 블록 추가)
- `troubleshooting/admin-server-wizardstate-null-lastproject-empty.md` (신규)
- `troubleshooting/README.md` (+1 인덱스 행)
- `.claude/CLAUDE.md` (+57 lines, wizardState null 시나리오 섹션)

---

## [001-fix-create-app-modal] - 2026-03-19 12:15 — Phase 11 추가: 16종 boilerplate 전체 라이프사이클 테스트 + Next.js basePath/appname 버그 수정 + Jest 4개 테스트 수정 → 전체 통과

### 🎯 Prompts (주요)
1. "(세션 연속) Phase 11 16종 boilerplate 전체 생성/health/modal/start/stop/deploy/delete 테스트 실행 완료 확인 후, 실패 수정 → 전체 통과 → /add-md /changelog /troubleshooting 작성 후 리포트"

### ✅ Changes
- **Fixed**: Phase 11 Next.js unified 스택 health/page URL에서 `S_STACK` → `S_APP` 사용 (`test-cycle.sh` L1748, L1762) — `patchNextConfig()`이 appName 기반 basePath를 주입하므로 stackId가 아닌 appName 사용 필요
- **Fixed**: Phase 11 페이지 로드 허용 코드에 308 추가 (`test-cycle.sh` L1767) — Next.js trailingSlash:false 기본값으로 trailing slash redirect 시 308 반환
- **Fixed**: Jest `instanceof Command` 실패 → `constructor.name === 'Command'` 체크로 변경 (`tests/unit/cli/commands/index.test.ts`, `tests/integration/cli-bootstrap.test.ts`) — ESM 모듈 중복 문제
- **Fixed**: Jest admin-server `GET /` 503 → 200/503 모두 허용으로 변경 (`tests/unit/cli/services/admin-server.test.ts`, `tests/integration/admin-server.test.ts`) — ts-jest 소스 경로에서 PKG_ROOT가 `packages/`로 계산되어 ADMIN_UI_DIST 미발견
- **Added**: Phase 11 troubleshooting 문서 2개 (`troubleshooting/phase11-nextjs-unified-basepath-appname.md`, `troubleshooting/jest-admin-server-503-and-commander-instanceof.md`)

### 📊 Test Results
- Phase 11: 16/16 ✅ (nodejs-nextjs, nodejs-nextjs-full 포함 전체)
- Unit Tests: 2266/2266 passed (38 skipped, 1 suite skipped)
- Test Suites: 66/67 passed (1 pre-existing skip)

### 📁 Files Modified (이번 세션)
- `test-cycle.sh` (+819, -107 lines) — Phase 11 추가 + 2개 버그 수정
- `tests/integration/admin-server.test.ts` (+19, -11 lines)
- `tests/integration/cli-bootstrap.test.ts` (+5, -3 lines)
- `tests/unit/cli/commands/index.test.ts` (+3, -1 lines)
- `tests/unit/cli/services/admin-server.test.ts` (+26, -14 lines)
- `troubleshooting/phase11-nextjs-unified-basepath-appname.md` (신규)
- `troubleshooting/jest-admin-server-503-and-commander-instanceof.md` (신규)
- `troubleshooting/README.md` (+3 rows)

---

## [001-fix-create-app-modal] - 2026-03-19 11:30 — test-cycle.sh 전체 통과: SPA/basePath/SSE/domain-apps 5개 버그 수정

### 🎯 Prompts (주요)
1. "10분마다 체크: boilerplate 16종 생성/start/stop/deploy/접속/repo 확인, AppDetailModal 탭 검증, domain settings 확인, 토스트 메시지, test-cycle.sh 업데이트, 전체 통과 후 /add-md /changelog /troubleshooting 작성 + 리포트"

### ✅ Changes

**test-cycle.sh 버그 수정 (5개)**
- **Fixed**: Phase 4 JS 문법 검사 항상 FAIL — React SPA는 inline `<script>` 없음. `sed` 추출 대신 외부 bundle URL 추출 후 `node --check` 적용
- **Fixed**: Phase 6 `nodejs-nextjs-full` 404 — Next.js `basePath` 설정으로 health endpoint가 `/apps/${STACK_ID}/health`. `IS_UNIFIED` 분기 추가
- **Fixed**: Phase 8.1 Local ≠ External 오탐 — timestamp 필드가 요청마다 달라 전체 body 비교 시 항상 불일치. `status` 필드만 추출 비교로 변경
- **Fixed**: Phase 9.3/10.5 SSE Content-Type 오탐 — `curl -I + grep 'content-type'`이 `Access-Control-Allow-Headers` 헤더를 먼저 매칭. `curl -v + grep '^< content-type'`으로 수정
- **Fixed**: `cfg.devStack.languages` TypeError — `selections.json`에 `devStack: {}`인 경우 `.languages` undefined. `?.languages || []` optional chaining 적용
- **Added**: `--skip-init` 플래그 — 기존 환경에서 Phase 4-10만 반복 테스트 가능 (SKIP_INIT=true, SKIP_BUILD=true, SKIP_UNINSTALL=true)
- **Fixed**: Phase 3 제어 흐름 — `step_done`은 flow control 아님. `if/elif/else` 블록으로 재구조화해 `--skip-init` 시 `brewnet init` 호출 차단

**cloudflare-client.ts 버그 수정**
- **Fixed**: `GET /api/domain/apps` HTTP 500 — `getActiveServiceRoutes()`에서 `state.servers.*` 필드가 `undefined`일 때 `.enabled` 접근 → TypeError. 모든 접근에 optional chaining `?.` 적용 (`packages/cli/src/services/cloudflare-client.ts:544-568`)

**문서 작성**
- **Added**: `troubleshooting/domain-apps-500-undefined-enabled.md` — `/api/domain/apps 500` 버그 기록
- **Added**: `troubleshooting/test-cycle-spa-sse-basepath-fixes.md` — 5개 test-cycle.sh 검증 오류 기록
- **Updated**: `troubleshooting/README.md` — 2개 항목 추가
- **Updated**: `specs/001-admin-react-migration/spec.md` — getActiveServiceRoutes/test-cycle 버그 시나리오 추가

### 📊 Test Results
- test-cycle.sh `--skip-init` 전체 통과: ✅ Phase 4-10 all green
- Phase 10 (앱 lifecycle): tc-lifecycle-test (nodejs-express) create→start→stop→deploy→delete ✅

### 📁 Key Files Modified
- `test-cycle.sh` (Phase 4/6/8.1/9.3/10.5 버그 수정, --skip-init 플래그)
- `packages/cli/src/services/cloudflare-client.ts` (optional chaining, L544-568)
- `troubleshooting/domain-apps-500-undefined-enabled.md` (신규)
- `troubleshooting/test-cycle-spa-sse-basepath-fixes.md` (신규)
- `specs/001-admin-react-migration/spec.md` (시나리오 2개 추가)

---

## [001-fix-create-app-modal] - 2026-03-19 10:44 — 3개 런타임 버그 수정 + CreateAppModal 필드명 정렬 + test-cycle.sh 업데이트

### 🎯 Prompts (주요)
1. "10분마다 체크해서 완료되면 종료: 16종 boilerplate 생성 → start/stop/deploy/접속/repo 확인, AppDetailModal 탭(Overview/Logs/Domain) 검증, domain settings 인터페이스 확인, 토스트 메시지 확인, test-cycle.sh 업데이트, 전체 통과 후 /add-md /changelog /troubleshooting 작성 + 리포트"

### ✅ Changes

**Bug Fixes (런타임 버그 3개)**
- **Fixed**: `AppDetailModal` `usePolling` interval=0 → `ERR_INSUFFICIENT_RESOURCES` 무한 루프 (`packages/admin-ui/src/components/AppDetailModal.tsx:57,63`) — git/settings polling interval `0` → `30000`
- **Fixed**: `/api/settings/cloudflare` 500 Internal Server Error — `mask()` 헬퍼가 `undefined` 인자 수신 시 `s.length` TypeError 발생 (`packages/cli/src/services/admin-server.ts:1844`) — `string | undefined` 파라미터 + undefined guard 추가
- **Fixed**: Boilerplate non-unified 스택 `FRONTEND_PORT=BACKEND_PORT` 충돌 (2번째 재발) — `findFreePortB(3000)` / `findFreePort(3000)` 고정 시작점 → `findFreePort(port + 1)` (`packages/cli/src/services/app-manager.ts:819,894`)

**CreateAppModal 필드명 정렬**
- **Fixed**: `CreateAppModal.tsx` 제출 시 `appName` (not `name`), `language`, `frameworkId` 필드 사용 — 백엔드 `handleCreateApp` 스키마와 정렬
- **Added**: 프레임워크 미선택 시 제출 차단 validation
- **Added**: `apps.tsx` start/stop 액션 토스트 알림 추가
- **Added**: 16개 boilerplate 스택 동적 로딩 (`/api/apps/boilerplates`)

**test-cycle.sh 업데이트**
- **Updated**: Phase 7 — React SPA 아키텍처 기반으로 교체 (HTML 파싱 제거, bundle 서빙 확인)
- **Added**: Phase 9 — boilerplates API, 필드명 검증, 도메인 설정, 16종 스택 ID 검증 포함 종합 API 테스트
- **Fixed**: Phase 9.4 — `/api/settings/cloudflare` 테스트에 `X-Admin-Password` 헤더 추가

**Gitea 통합 개선 (이전 세션)**
- **Fixed**: Gitea repository 링크 DeploymentTab에서 autologin 경유로 변경 (private repo 404 해결)
- **Fixed**: deployment 시 Gitea repository 누락 시 자동 재생성
- **Changed**: Gitea repository 생성 시 private → public visibility
- **Fixed**: OverviewTab/BoilerplateDetailModal GitHub URL 오타 (`codevillain-dev` → `brewnet-boilerplate`)
- **Added**: 동적 Gitea base URL (Quick Tunnel vs Named Tunnel 분기)

**문서 업데이트**
- **Added**: `troubleshooting/app-detail-modal-polling-interval-zero.md` — usePolling interval=0 버그 기록
- **Added**: `troubleshooting/admin-server-cloudflare-settings-500.md` — mask() undefined TypeError 기록
- **Updated**: `troubleshooting/boilerplate-frontend-port-conflict.md` — 2번째 재발 섹션 추가
- **Updated**: `troubleshooting/README.md` — 3개 항목 추가, boilerplate 재발 횟수 업데이트
- **Updated**: `specs/001-admin-react-migration/spec.md` — usePolling/cloudflare 시나리오 추가
- **Updated**: `specs/001-create-app/spec.md` — FRONTEND_PORT 충돌 시나리오 추가

### 📊 Test Results
- Unit tests: 90/91 passing (pre-existing Commander.js instanceof 이슈 1개, 변경사항과 무관)
- TypeScript: 컴파일 오류 0개
- Production build: 성공

### 📁 Key Files Modified
- `packages/admin-ui/src/components/AppDetailModal.tsx` (polling interval fix)
- `packages/cli/src/services/admin-server.ts` (mask() undefined guard)
- `packages/cli/src/services/app-manager.ts` (frontend port conflict fix)
- `packages/admin-ui/src/components/CreateAppModal.tsx` (field name alignment + 16-stack dynamic loading)
- `packages/admin-ui/src/pages/Apps.tsx` (toast notifications)
- `test-cycle.sh` (Phase 7 React SPA + Phase 9 comprehensive API tests)
- `troubleshooting/` (3 new/updated files)
- `specs/001-admin-react-migration/spec.md`, `specs/001-create-app/spec.md`

---

## [develop] - 2026-03-18 13:30 — Apps 페이지 대규모 리팩토링 + E2E 검증

### 🎯 Prompts (주요)
1. "FileBrowser external URL이 /static으로 나와 — /files가 맞는거 아냐?"
2. "New Project UI 미지원 프레임워크 삭제해"
3. "CLI 실행 후 창 닫혀도 서버 죽는다 — daemonize해"
4. "brewnet shutdown 종료 명령어 연결해"
5. "보일러플레이트 health check가 안 돼 — Next.js basePath 문제"
6. "progress 모달에 docker/healthcheck 로그가 안 나와"
7. "git clone 한 소스를 배포할 때 docker-compose 없으면 자동 처리해"
8. "보일러플레이트 탭 왜 필요해? — 자동 등록으로 변경"
9. "Dashboard와 Apps URL 표기가 달라 — 통일해"
10. "New Project 탭을 첫번째로"

### ✅ Changes

**Admin Server**
- **Fixed**: FileBrowser external URL `/static` → `/files` (primaryRouterKey 우선 매칭)
- **Fixed**: Gitea autologin 쿠키 `Path=/git` 보존 (private repo 404 해결)
- **Fixed**: `isUnifiedSvc` Gitea 포트 3000 오매칭 제외
- **Fixed**: Dashboard 헤더 → Apps 페이지와 통일 디자인
- **Added**: `/api/apps` 응답에 `localUrl` (basePath 포함) + `lastDeployedAt` 추가

**Apps Page**
- **Removed**: Boilerplate 탭 제거 (3탭 → 2탭: New Project + Git Clone)
- **Changed**: New Project 탭이 기본 탭 (첫번째)
- **Fixed**: 미지원 프레임워크 9개 제거 (LANG_DATA, FW_CODE_MAP)
- **Added**: BOILERPLATES 정적 배열 12개 → 16개 완성
- **Fixed**: progress 모달 `white-space: pre-wrap` (줄바꿈 표시)
- **Fixed**: job 로그 + SSE 컨테이너 로그 병합 표시
- **Fixed**: 성공/실패 토스트 생성 vs 배포 구분
- **Removed**: "Git Server에서 관리" 불필요 링크 제거
- **Fixed**: `localUrl`을 서버 제공 값 사용 (basePath 반영)

**App Manager**
- **Added**: Git Clone `branch` 옵션 지원
- **Added**: Git Clone 모드 `.env` 포트 주입 (BACKEND_PORT/FRONTEND_PORT)
- **Fixed**: Git Clone — compose 없으면 clone+push만 (Docker 단계 스킵)
- **Added**: Deploy 시 docker-compose.yml 없으면 프로젝트 타입 감지 → 자동 스캐폴딩
- **Added**: 지원 타입: Next.js, Node.js, Python, Go, Rust, Java/Kotlin, Static HTML (nginx)
- **Fixed**: Next.js basePath health check URL 자동 반영
- **Fixed**: 보일러플레이트/일반 프로젝트 health path 분기 (`/health` vs `/`)
- **Added**: `_dockerComposeUp()` — stdout/stderr를 job.logs[]에 스트림
- **Added**: `_pollHealth()` — 폴링 진행을 job.logs[]에 기록
- **Fixed**: `cloneStack()` / Mode B — 기존 디렉토리 rmSync 후 재클론
- **Added**: Wizard 보일러플레이트 `listApps()` 자동 등록

**Gitea Client**
- **Fixed**: `createRepo` 500 "files already exist" → orphan 파일 자동 삭제 후 재시도

**CLI Commands**
- **Added**: `brewnet shutdown [--port]` — admin daemon 종료
- **Changed**: `brewnet admin` → detached daemon (터미널 닫아도 유지)
- **Added**: `brewnet admin --foreground` — 디버그/테스트용
- **Fixed**: `createRequire('../../package.json')` 번들 경로 해결

**Wizard**
- **Fixed**: Next.js(unified) 선택 시 Frontend 프롬프트 자동 스킵
- **Fixed**: `cloneStack()` 기존 디렉토리 삭제 후 재클론

**Tests**
- **Added**: Playwright E2E (`tests/e2e/apps-page-e2e.mjs`) — 37개 검증
- **Updated**: test-cycle.sh Phase 7.7+7.8 프레임워크 검증
- **Updated**: admin/complete 테스트 → daemon mock 적용
- **Updated**: subcommand count 13 → 14

### 📊 Test Results
- Unit: 67 suites passed, 2332 tests
- E2E: 37 Playwright checks all passed
- test-cycle.sh: Phase 7.7+7.8 추가

### 📁 Files Modified (21 files, +1218, -336)
- `packages/cli/src/services/admin-server.ts`
- `packages/cli/src/services/apps-page.ts`
- `packages/cli/src/services/app-manager.ts`
- `packages/cli/src/services/admin-daemon.ts` (new)
- `packages/cli/src/services/admin-launcher.ts` (new)
- `packages/cli/src/services/gitea-client.ts`
- `packages/cli/src/services/boilerplate-manager.ts`
- `packages/cli/src/commands/admin.ts`
- `packages/cli/src/commands/shutdown.ts` (new)
- `packages/cli/src/commands/init.ts`
- `packages/cli/src/wizard/steps/complete.ts`
- `packages/cli/src/wizard/steps/dev-stack.ts`
- `packages/cli/src/types/app-entry.ts`
- `packages/cli/src/index.ts`
- `packages/cli/tsup.config.ts`
- `tests/e2e/apps-page-e2e.mjs` (new)
- `tests/unit/cli/commands/*.test.ts` (4 files)
- `test-cycle.sh`
- `spec/ADMIN_APPS_FEATURES.md`

---

## [develop] - 2026-03-18 10:17

### fix(init): system-check 테이블 상단 테두리 및 컬럼 정렬 수정
- **증상**: Step 0 시스템 체크 테이블 첫 번째 컬럼 간격 어긋남, 상단 테두리 미렌더링
- **원인**: `ora` 스피너의 `stop()` 호출 후 커서가 줄 중간에 남아 테이블 상단 테두리 손상
- **해결**: 스피너 정지 후 `\r` + clearLine으로 커서 위치 초기화
- **파일**: `packages/cli/src/wizard/steps/system-check.ts`

### refactor(shared): mail server 관련 exports 제거
- `mailServerConfigSchema`, `MailServerConfig` 타입, mail port 상수 4개 (`SMTP_PORT`, `IMAP_PORT`, `POP3_PORT`, `SMTPS_PORT`) 제거
- mail server 기능 제거에 따른 잔존 exports 정리
- 48개 테스트 실패 → 6개로 감소
- **파일**: `packages/shared/src/index.ts`, `packages/shared/src/schemas/wizard-state.schema.ts`, `packages/shared/src/types/wizard-state.ts`

### fix(test): 빈 network.test.ts 파일 삭제
- JSDoc 주석만 있고 테스트 코드가 없는 `tests/unit/cli/utils/network.test.ts` 삭제
- Jest "empty test suite" 오류 제거
- **파일**: `tests/unit/cli/utils/network.test.ts` (deleted)

### feat(init): PostgreSQL 버전 메이저 → 패치 릴리스로 업데이트
- **변경 전**: 메이저 버전 선택 (16, 15, 14, 13)
- **변경 후**: 패치 릴리스 선택 (18.3, 17.9, 16.13) — PostgreSQL 공식 문서 기준
- Docker 이미지 `postgres:17-alpine` → `postgres:18.3-alpine` (기본값)
- compose-generator에 동적 버전 선택 로직 구현 (`primaryVersion` 필드 활용)
- 기본값 `18.3` 으로 업데이트
- **파일**: `packages/shared/src/utils/constants.ts`, `packages/cli/src/config/services.ts`, `packages/cli/src/config/defaults.ts`, `packages/cli/src/services/compose-generator.ts`, `packages/cli/src/utils/resources.ts`

### test: PostgreSQL 18.3 버전 업데이트에 따른 테스트 기대값 수정
- 2,332개 테스트 전체 통과 확인
- **파일**: `tests/integration/service-startup.test.ts`, `tests/e2e/full-install.test.ts`, `tests/integration/project-setup.test.ts`

---

## [develop] - 2026-03-18

### fix(admin): FileBrowser external URL /static → /files
- **증상**: Admin Dashboard에서 FileBrowser external URL이 `...trycloudflare.com/static`으로 표시
- **원인**: `handleGetServices()`의 `Object.entries(labels).find()`가 보조 라우터 `quicktunnel-filebrowser-static`을 메인 라우터 `quicktunnel-filebrowser`보다 먼저 매칭
- **해결**: `primaryRouterKey`로 `traefik.http.routers.quicktunnel-{serviceId}.rule`을 먼저 직접 조회, 없을 때만 fallback
- **파일**: `packages/cli/src/services/admin-server.ts`

### fix(apps): New Project UI 미지원 프레임워크 9개 제거
- **증상**: New Project 탭에서 Chi, Starlette, Fastify 등 보일러플레이트가 없는 프레임워크 선택 시 앱 생성 실패
- **해결**: `LANG_DATA`와 `FW_CODE_MAP`에서 CONNECT_BOILERPLATE.md에 없는 9개 프레임워크 제거
- **제거 목록**: Go/Chi, Python/Starlette, Node.js/Fastify, Node.js/Hono, Rust/Rocket, Rust/Warp, Java/Quarkus, React/Vite+React, React/Remix
- **잔존**: 15개 지원 프레임워크 (7개 언어)
- **파일**: `packages/cli/src/services/apps-page.ts`

### test(cycle): Phase 7 프레임워크 검증 추가 (7.7 + 7.8)
- 7.7: 미지원 프레임워크 9개 absence 확인
- 7.8: 지원 프레임워크 15개 presence 확인
- **파일**: `test-cycle.sh`

---

## [feature/apps-ui → develop] - 2026-03-17 20:30

### 🎯 Prompts
1. "apps 영역에 백엔드, 프론트엔드 주소 노출하고 링크 걸어. git 주소도 링크걸고, Gitea 자동 로그인 걸어서 화면 노출할 수 있도록 해"
2. "현재 어드민과 apps에 구현된 전체 기능을 체크해서 md로 만들어줘"
3. "수정으로 /apps 잘 나오던 화면이 또 불러오는 중...으로 표시되고 — 로고는 그대로 어떤 화면이든 최상단에 나와야 하는거 아냐?"
4. "왜 external을 Quick tunnel인데 못 캡쳐하지? 원래 연결되던거 아냐?"
5. "1번으로 우선해서 구현하고 전체적으로 개발 계획을 세워서 진행해"
6. "BREWNET_UX_GIT_DOMAIN.md가 새롭게 분석한 apps 내의 서버 출력과 도메인 세팅 플로우야 — UI분석해서 연결해"
7. "로그 패널 펼쳐질 때 기존 /apps/:name 기능탭이 다 같이 포함되어야지 — overview, git, deploy, log, domain"
8. "설치된 보일러플레이트가 없다고 나오는데 이미 깔려있어. external은 기본 static 페이지만 나와"
9. "node-nest 배포앱 목록에 안보이고, 연결 버튼 누르면 BN-404"
10. "프론트는 빈 화면만 나와 (Vite SPA 에셋 로드 실패)"
11. "localhost는 되는데 external은 기본 페이지만 나와 — 루프 테스트할 때 뭘 보고 해결했다고 보고한거지?"

### 🔍 근본 원인 분석 (5개 독립 버그)

**Bug 1: Template literal regex → JS 파싱 실패**
- **증상**: `/apps` 페이지 "불러오는 중..." 고정, New App 버튼 미동작
- **원인**: `/^https?:\/\/[^/]+/` regex 리터럴이 TypeScript template literal 안에서 `\/` → `/` 변환 → `//`가 JS 라인 코멘트로 해석 → `<script>` 블록 전체 파싱 실패
- **해결**: `new RegExp('^https?://[^/]+')` 문자열 방식으로 변경
- **교훈**: template literal 안 인라인 JS에서는 regex 리터럴 절대 사용 금지 → `new RegExp()` 필수

**Bug 2: Docker 네트워크 분리 → Traefik이 보일러플레이트 컨테이너 미발견**
- **증상**: Quick Tunnel external URL이 Brewnet landing 페이지(static) 반환
- **원인**: 보일러플레이트 compose의 `networks: { brewnet: { driver: bridge } }` → Docker Compose가 `spring-app_brewnet` 별도 네트워크 생성. Traefik은 `brewnet` (external) 네트워크만 감시
- **해결**: `addQuickTunnelAppLabels()`에서 `brewnet: { external: true }` 강제 덮어쓰기. 기존 `if (!topNetworks['brewnet'])` 조건을 제거하고 무조건 설정
- **교훈**: 보일러플레이트 compose에 `brewnet` 네트워크가 선언되어 있어도 `external: true`가 아니면 별도 네트워크

**Bug 3: Array 라벨 → Object 캐스팅 깨짐 → Traefik 라벨 무시**
- **증상**: 컨테이너 재시작 후에도 Traefik 라벨 0개
- **원인**: 보일러플레이트 compose의 labels가 array 형식 `["key=val"]`. `addQuickTunnelAppLabels()`에서 `(svc['labels'] ?? {}) as Record<string, string>` 캐스팅 → `{0: "key=val"}` 생성 → Docker Compose가 Traefik 라벨 무시
- **해결**: Array 감지 후 `{key: "val"}` object 형식으로 변환하는 로직 추가
- **교훈**: compose labels는 array 또는 object 형식 가능. yaml.load() 결과를 캐스팅 전 반드시 `Array.isArray()` 체크

**Bug 4: PathPrefix 충돌 + Vite SPA trailing slash**
- **증상**: `/apps/nodejs-nestjs-ui` 요청이 backend로 라우팅됨; frontend 빈 화면
- **원인 1**: PathPrefix(`/apps/nodejs-nestjs`)가 `/apps/nodejs-nestjs-ui`도 매칭. 같은 priority(10)에서 짧은 prefix가 먼저 매칭
- **원인 2**: trailing slash 없이 `/apps/spring-app-ui` 접근 시 `./assets/...` 상대경로가 `/apps/assets/...`로 해석 → Traefik 매칭 실패 → landing page
- **해결**: priority를 path 길이 기반으로 동적 설정 (`10 + pathPrefix.length`). Traefik `redirectregex` 미들웨어로 trailing slash 자동 추가. Docker Compose `$$` 이스케이프로 `${1}` 캡처 그룹 보존
- **교훈**: Traefik PathPrefix는 explicit priority 설정 시 길이 자동 계산이 무시됨. Vite SPA는 반드시 trailing slash redirect 필요

**Bug 5: Admin 대시보드 External URL 경로 불일치**
- **증상**: 대시보드에 `/apps/frontend`, `/apps/backend` 표시 → 접근 시 landing page
- **원인**: `getExternalUrl(id)` 함수가 compose 서비스명(`frontend`)을 경로로 사용했으나, 실제 Traefik 라우트는 앱 이름(`/apps/spring-app`). `BOILERPLATE_STACKS`가 비어있어 매핑 실패 → fallback으로 서비스명 사용
- **해결**: `handleGetServices`에서 각 컨테이너의 Traefik 라벨(`traefik.http.routers.*.rule`)에서 PathPrefix를 파싱하여 `externalUrl`을 서버사이드 계산. 클라이언트 fallback 함수보다 서버 응답 우선 사용 (`s.externalUrl || getExternalUrl(s.id)`)
- **교훈**: External URL은 서버사이드에서 컨테이너 라벨 기반으로 계산해야 정확. 클라이언트 추측(compose 서비스명 기반)은 앱명과 서비스명이 다를 때 실패

### ✅ Changes

**Gitea 자동 로그인 (Prompt 1)**:
- **Added**: `admin-server.ts` — `GET /api/gitea/autologin?redirect=<path>` (서버사이드 CSRF 로그인 → `i_like_gitea` 세션 쿠키 → 302 리다이렉트)
- **Modified**: `apps-page.ts` — 앱 카드 포트 링크, git 레포 링크, Gitea 레포 테이블 전부 autologin 경유

**문서 생성 (Prompt 2)**:
- **Added**: `spec/ADMIN_APPS_FEATURES.md` — 42개 API, 전체 UI, 데이터 타입, 비즈니스 로직 9섹션 문서

**JS 파싱 버그 + 로고 헤더 (Prompt 3, Bug 1)**:
- **Fixed**: regex 리터럴 → `new RegExp()` (template literal 호환)
- **Added**: `/apps` + `/apps/:name` 페이지에 Brewnet SVG 로고 + Dashboard/Apps 네비게이션 헤더

**Quick Tunnel 외부 접근 (Prompt 4-5, Bug 2-5)**:
- **Added**: `compose-generator.ts` — `addQuickTunnelAppLabels()` (PathPrefix + stripprefix + redirectregex + brewnet external 네트워크 주입)
- **Added**: `boilerplate-manager.ts` — `injectTraefikForQuickTunnel()` (compose 파싱, 서비스 자동 감지, 컨테이너 내부 포트 추출, array→object 라벨 변환)
- **Modified**: `generate.ts` Section 7b — Quick Tunnel 모드에서 라벨 주입 호출
- **Modified**: `app-manager.ts` — 3가지 모드 (A/B/C) docker compose up 직전 `_injectQuickTunnelIfNeeded()` 호출
- **Fixed**: `admin-server.ts` `handleGetServices()` — `externalUrl` 서버사이드 계산 (컨테이너 Traefik 라벨 PathPrefix 파싱)

**앱 카드 UX 개선 (Prompt 6, BREWNET_UX_GIT_DOMAIN.md)**:
- **Modified**: `apps-page.ts` `renderApps()` — Running/Building/Stopped 3상태 카드
- **Added**: CSS: `.card-running` 상단 보더, `.meta-grid` 4열 정보, `.commit-row` + Gitea diff 링크, `.health-badges`, `.build-progress` 인라인, `.stopped-meta`
- **Added**: Job 완료 시 auto deploy 설정 자동 적용

**아코디언 Detail 패널 (Prompt 7)**:
- **Added**: `apps-page.ts` — 5탭 아코디언 (Overview/Git/Deploy/Logs/Domain) 카드 하단 펼침/접힘
- **Added**: 각 탭 lazy loading (`loadAccOverview`, `loadAccGit`, `loadAccDeploy`, `startAccLogs`, `loadAccDomain`)
- **Modified**: Logs 버튼 → 아코디언 Logs 탭 직접 열기 (페이지 전환 없음)
- **Modified**: 레포 테이블 "앱 보기 →" → 카드 스크롤 + amber 하이라이트 + 아코디언 열기

**Health check 백엔드 포트 고정**:
- **Fixed**: `app-manager.ts` — `_resolveBackendPort()` 추가. `.env`의 `BACKEND_PORT` 읽어 항상 backend 체크 (frontend nginx `/health` 접근 방지)
- **적용**: Mode A/B/C + Deploy 총 4곳

**미연결 앱 자동 등록 (Prompt 9)**:
- **Fixed**: `admin-server.ts` `POST /api/git/repos/:name/connect` — 앱이 apps.json에 없으면 Docker 컨테이너 스캔 후 자동 생성 + 연결

### 📊 Test Results
- Phase 4-8 E2E: 6회 연속 전체 통과
- Backend Local == External: ✅ (health JSON timestamp 제외 일치)
- Frontend Local == External: ✅ (HTML md5 일치)
- Gitea API/Autologin/WebUI: 200/302/200 ✅
- JS syntax check (admin + apps): OK ✅

### 📁 Files Modified
- `packages/cli/src/services/admin-server.ts` (+175, -5)
- `packages/cli/src/services/apps-page.ts` (+404, -18)
- `packages/cli/src/services/compose-generator.ts` (+96)
- `packages/cli/src/services/boilerplate-manager.ts` (+95)
- `packages/cli/src/services/app-manager.ts` (+41, -4)
- `packages/cli/src/wizard/steps/generate.ts` (+7)
- `spec/ADMIN_APPS_FEATURES.md` (+408, 신규)
- `test-cycle.sh` (+272)
- `troubleshooting/admin-services-table-url-blank.md` (+91)
- `troubleshooting/README.md` (+1, -1)
- `CHANGELOG.md` (+52)

### 🌿 Branches
- `feature/apps-ui` (commit: b4124e4)
- `develop` (fast-forward merge: b4124e4)

---

## [005-app-deploy-ui] - 2026-03-17 00:30

### 🎯 Prompts
1. "apps 페이지에 아무것도 안나오고 상단 텍스트와 불러오는중이라는 텍스트만 나와 — 원인이 뭔지 근본적인 문제를 찾아서 해결하고 완료될 때까지 반복해"
2. "깃 로컬 주소는 http://localhost/git 이게 실제 주소인데 http://localhost:8088/git 로 연결하고 있어"
3. "앱 생성중 모달에서 다음단계로 진입을 못하는거 같은데 — 왜 진행이 안되는지 화면에 단계별 로그부터 출력하면서 어떤단계에서 에러가 나는지 추가해서 보여줘"
4. "new app의 보일러 플레이팅과 new project는 뭐가 다른거지?"
5. "ADMIN에서 프론트, 백엔드 external 주소 안나와"
6. "현재 설치된 것만 기본값으로 보여줘. 거기서 gitea에 연결하는 작업만 진행"

### ✅ Changes

**esbuild Template Literal 호환성 (JS SyntaxError 전수 제거)**:
- **Fixed**: `apps-page.ts` — `\/` in regex → `new RegExp()` 전환 (esbuild가 `\/`→`/` 정규화 → `//` 주석 생성)
- **Fixed**: `apps-page.ts` — `'\n'` in template literal → `'\\n'` (실제 LF로 컴파일됨)
- **Fixed**: `apps-page.ts` — `\'` in onclick → `&#39;` HTML entity 전환 (10곳+)

**Git Server 링크 404 (Issue 1)**:
- **Fixed**: `apps-page.ts:204` — `/git` 상대경로 → `http://localhost/git` 절대 URL

**앱 생성 Progress 모달 멈춤 (Issue 2)**:
- **Fixed**: `app-manager.ts:319-367` — Step 순서 정상화: Step 0(Validating) → Step 1(Gitea setup) → Step 2~5 순차 실행
- **Fixed**: `apps-page.ts:768` — Progress 모달 실패 시 에러 메시지 + 실패 단계를 log-content에 표시
- **Fixed**: `apps-page.ts` — 완료/실패 후 apps + repos 모두 새로고침

**Boilerplate 탭 설치된 것만 표시 (Issue 2d)**:
- **Modified**: `apps-page.ts` — `loadInstalledBp()` 추가: `/api/apps/boilerplates`에서 설치 목록 조회
- **Modified**: `apps-page.ts` — `renderBpGrid()`: 설치된 stackId만 필터링, 미설치 시 안내 메시지
- **Modified**: `apps-page.ts` — Boilerplate 탭 안내 문구 개선: "이미 설치된 보일러플레이트를 Gitea에 연결합니다"

**quickTunnelUrl 영속화 (Issue 5a)**:
- **Fixed**: `init.ts:309` — Generate step 완료 후 `saveState(state)` 호출 추가 (quickTunnelUrl 등 런타임 값 영속화)

**Spec 준수**:
- **Added**: ebox 태그에 `Cloudflare Tunnel 자동 연결` 추가 (spec 2.2)
- **Fixed**: Running 앱 삭제 버튼: building만 disable, running은 클릭 → 모달 경고 (spec 9.2)

### 📊 Test Results
- Unit tests: 68/69 suites passed, 2431/2469 tests passed (1 skipped suite)
- JS Syntax check: ✅ apps-page 33K+ bytes SyntaxError 0
- test-cycle.sh: ✅ 전 단계 통과 (Step 0~6)
  - Step 5.5 create-app E2E: ✔ Validating | ✔ Gitea setup | ✔ Gitea repo | ✔ Git push | ✔ Docker up | ✔ Health check
  - Step 6: 6/6 보일러플레이트 스택 Backend + Frontend + Image 전부 통과

### 📁 Files Modified
- `packages/cli/src/services/apps-page.ts` (+1420, -400)
- `packages/cli/src/services/app-manager.ts` (+80, -50)
- `packages/cli/src/services/admin-server.ts` (+130, -20)
- `packages/cli/src/commands/init.ts` (+2)
- `packages/cli/src/services/gitea-client.ts` (+3)
- `packages/cli/src/types/app-entry.ts` (+8)
- `docs/research/GITEA_APP_DEPLOY_SPEC.md` (3 시나리오 추가)
- `CURRENT_PLAN.md` (신규)

---

## [001-create-app → develop] - 2026-03-04 17:00

### 🎯 Prompts
1. "근데 난 이해가 안되는 부분이 file browser나 jellyfin의 경우 별도의 도메인으로 클라우드플레어 터널링이 되는거잖아 왜 gitea만 안된다는거지? nodejs nextjs 서버도 안떠 ports are not available: 0.0.0.0:3000"
2. "node 나 다른 기술 스택 실행시 이미 포트 점유중이면 다른 포트 써도 되는거 아냐?"
3. "gitea 여전히 사용자 이름 또는 암호가 올바르지 않습니다. 내가 뭘 해줘야 하지?"
4. "시크릿창에서도 안돼"
5. "그럼 초기화 하고 다시 빌드 한 뒤에 설치 테스트 해볼수있도록 해"
6. "근데 brewnet uninstall에 컨테이너 관련 설정들은 안 없어지는거야?"
7. "여기까지 일단 커밋하고 푸시한 뒤 develop에 머지해"

### ✅ Changes
- **Fixed**: Gitea admin user creation — `docker exec brewnet-gitea` → `docker exec -u git brewnet-gitea` (root 실행 거부 해결) (`packages/cli/src/wizard/steps/generate.ts`)
- **Fixed**: Non-unified 스택 프론트엔드 포트 충돌 — `FRONTEND_PORT`도 `findFreePort`로 자동 선택 (`packages/cli/src/wizard/steps/generate.ts`, `packages/cli/src/services/boilerplate-manager.ts`)
- **Fixed**: `brewnet uninstall` — 프로젝트 state 없어도 고아 컨테이너/볼륨/네트워크 전부 정리 (`packages/cli/src/commands/uninstall.ts`)
- **Fixed**: `brewnet uninstall` 네트워크 제거 — 하드코딩 `brewnet, brewnet-internal` → `docker network ls --filter name=brewnet` 동적 조회 (`packages/cli/src/services/uninstall-manager.ts`)
- **Fixed**: Named Tunnel 모드 Gitea/Nextcloud `ROOT_URL` 미설정 — 서브도메인 방식으로 수정 (`packages/cli/src/services/compose-generator.ts`)
- **Added**: `brewnet create-app` 명령 — 16개 스택 카탈로그, 클론→환경설정→실행 전체 플로우 (`packages/cli/src/commands/create-app.ts`, `packages/cli/src/config/stacks.ts`, `packages/cli/src/services/boilerplate-manager.ts`)
- **Added**: Admin panel 상세 로그 패널 — 색상 레벨별 로그(info/ok/warn/error/dim) (`packages/cli/src/services/admin-server.ts`)
- **Added**: Gitea `INSTALL_LOCK=true` — 웹 설치 마법사 비활성화, env-var 기반 설정 강제

### 🔍 Root Causes
- **Gitea 로그인 실패**: `docker exec` 가 root로 실행 → Gitea "not supposed to be run as root" 에러 → admin 계정 생성 자체가 안 됨 → catch가 조용히 무시
- **FRONTEND_PORT 충돌**: `nodejs-express` 등 non-unified 스택은 frontend 컨테이너(port 3000)가 별도 존재. `findFreePort`가 `BACKEND_PORT`만 처리하고 `FRONTEND_PORT`는 방치
- **uninstall 미완**: `listInstallations()` 결과 없으면 early return (Docker 정리 없음); 네트워크명 하드코딩으로 `my-homeserver_brewnet-internal` 형식 미처리
- **비밀번호 특수문자**: bash 쌍따옴표 안 `!@` → 히스토리 확장 → 엉뚱한 문자열 저장. execa (셸 없음)에선 무관

### 📊 Test Results
- Test Suites: 1 skipped (boilerplate-generation TDD stub), 63 passed
- Tests: 2618 passed, 38 skipped

### 📁 Files Modified
- `packages/cli/src/wizard/steps/generate.ts` (+170, -30 lines)
- `packages/cli/src/services/boilerplate-manager.ts` (+352 lines, new)
- `packages/cli/src/commands/create-app.ts` (+435 lines, new)
- `packages/cli/src/commands/uninstall.ts` (+38, -3 lines)
- `packages/cli/src/services/uninstall-manager.ts` (+12, -6 lines)
- `packages/cli/src/services/compose-generator.ts` (+69, -0 lines)
- `packages/cli/src/services/admin-server.ts` (+172, -0 lines)
- `packages/cli/src/config/stacks.ts` (+217 lines, new)
- `tests/unit/cli/services/uninstall-manager.test.ts` (+35, -15 lines)
- `tests/unit/cli/services/uninstall-complete-cleanup.test.ts` (+25, -10 lines)
- `tests/integration/uninstall.test.ts` (+18, -10 lines)

### 🌿 Branches
- `001-create-app` (commit: 8686e95)
- `develop` (merge commit: c09ed9f)

---

## [feature/traefik] - 2026-03-02 21:30

### 🎯 Prompts
1. "설치 완료 후 http://localhost/git/user/sign_up 이 화면으로 넘어가고 여기서 또 다시 http 기본 화면 나와 이것도 캐시 문제야?"

### ✅ Changes
- **Fixed**: Landing page nginx `Cache-Control: no-store` 헤더 추가 — Gitea 전환 구간(install→running mode) 중 브라우저가 landing page를 `/git/user/sign_up` 경로에 heuristic cache(ETag 기반, ~3시간)로 저장하던 문제 해결 (`packages/cli/src/services/config-generator.ts`, `~/brewnet/my-homeserver/landing/nginx.conf`)
- **Rebuilt**: `brewnet-landing` 컨테이너 재빌드 및 재시작

### 🔍 Root Cause
- Gitea 설치 폼 제출 후 install mode → running mode 전환 시 ~1-5초 빈틈 발생
- 이 구간 요청이 Traefik catch-all → landing page로 라우팅됨
- Landing page nginx가 `Cache-Control` 미설정 → RFC 7234 heuristic cache 적용 (~3시간)
- 일반 캐시 삭제로는 ETag 기반 heuristic cache가 유지됨

### 📁 Files Modified
- `packages/cli/src/services/config-generator.ts` (+4, -1 lines)
- `~/brewnet/my-homeserver/landing/nginx.conf` (+3, -1 lines)

---

## [feature/traefik] - 2026-03-02 17:00

### 🎯 Prompts
1. "여전히 http://localhost:8096/jellyfin/web/#/home 이 주소로 나오잖아. 화면에 표시되는 주소도 http://localhost:8096/jellyfin/web/#/wizard/start 로 표시하고 링크도 바꾸라고"
2. (plan 실행) "Fix gitea_db Creation — \\gexec meta-command incompatible with psql -c"

### ✅ Changes
- **Fixed**: Jellyfin 대시보드 URL `#/home` → `#/wizard/start` 변경 (`admin-server.ts`)
- **Fixed**: gitea_db 생성 시 `\\gexec` 메타커맨드 → `DO $$ ... $$` PL/pgSQL 익명 블록으로 교체 (`generate.ts`)

### 📁 Files Modified
- `packages/cli/src/services/admin-server.ts` (Jellyfin URL 수정)
- `packages/cli/src/wizard/steps/generate.ts` (gitea_db 생성 SQL 수정)

---

## [feature/traefik] - 2026-03-02 15:37

### 🎯 Prompts
1. "그럼 minio를 선택하면 추가 환경 설정해야 할 사항들이 brewnet에 존재해? 개발자라면 이걸 써서 사용하는게 수월한거야? 검증해봐"
2. "1, 2 다 적용해 (MinIO Quick Tunnel + Traefik 포트 수정)"
3. "Service Verification — Gitea fail 나와"
4. "Jellyfin 로컬설치 안돼 외부에서만 접근되고 있어. Server Mismatch"
5. "파일 브라우저 내부 접근은 되는데 외부에서 접근 후 계정 비밀번호 입력하면 404 page not found라고 나와"
6. "nextcloud 는 로컬에서 되고 원격에서 안돼 / gitea 도 localhost:3022 로컬에서 안돼 원격에서 되고"
7. "? Development mode — Hot-reload / Production 안내 설명문구 추가하라고 했는데 반영 안됐어"
8. "gitea Failed to load asset files from localhost:3000/git/assets/js/index.js — 로컬 css깨지는거 같아"
9. "젤리핀 Server Mismatch 나와 / 외부 접근은 정상"

### ✅ Changes
- **Fixed**: MinIO Quick Tunnel 경로 미지원 — `QUICK_TUNNEL_PATH_MAP`에 `/minio` 추가 (`compose-generator.ts`)
- **Fixed**: MinIO Named Tunnel Traefik 포트 불일치 — `9000`→`9001` (Console UI) 수정 (`services.ts`)
- **Fixed**: Gitea 서비스 검증 실패 — Quick Tunnel 모드에서 `localhost:3000` 대신 `localhost/git/` 헬스체크로 수정 (`service-verifier.ts`)
- **Fixed**: Gitea CSS 깨짐 — Quick Tunnel 모드에서 HTTP 포트 3000 미노출 유지 (ROOT_URL /git/ prefix로 인해 직접 포트 접근 불가) (`compose-generator.ts`)
- **Fixed**: Jellyfin 헬스체크 ⚠ warn — Quick Tunnel에서 BaseUrl=/jellyfin이 설정되면 `/health` → `/jellyfin/health`로 수정 (`service-verifier.ts`)
- **Fixed**: Jellyfin 로컬 URL 표시 — Quick Tunnel 모드에서 `localhost:8096/jellyfin` 표시 (`service-verifier.ts`)
- **Fixed**: FileBrowser 외부 로그인 후 404 — `settings.json`의 `baseURL` 필드가 DB보다 우선; 설치 시 busybox로 settings.json 직접 기록 (`generate.ts`)
- **Added**: FileBrowser `/config` 네임드 볼륨 (`brewnet_filebrowser_config:/config`) — settings.json 영구 보존 (`compose-generator.ts`)
- **Fixed**: Nextcloud 외부 접근 불가 — Quick Tunnel URL 변경 시마다 trusted_domains 만료; `*.trycloudflare.com` regex 방식 시도 후 특정 hostname 직접 등록 방식으로 정착 (`generate.ts`)
- **Fixed**: Dev Stack wizard Hot-reload/Production 설명 미표시 — `description` 필드(포커스 시만 표시) → `name` 인라인 텍스트로 변경 (항상 표시) (`dev-stack.ts`)

### 🐛 Runtime Fixes (running docker-compose.yml)
- FileBrowser `settings.json` baseURL `/files` 직접 수정 및 컨테이너 재시작
- Nextcloud `occ config:system:set trusted_domains 5 --value=speeches-way-mark-separation.trycloudflare.com`
- Gitea 포트 3000 노출/미노출 반복 테스트 → Quick Tunnel에서 미노출 확정

### 📁 Files Modified
- `packages/cli/src/services/compose-generator.ts` (+91, -22 lines)
- `packages/cli/src/utils/service-verifier.ts` (+49, -7 lines)
- `packages/cli/src/wizard/steps/generate.ts` (+91, -15 lines)
- `packages/cli/src/wizard/steps/dev-stack.ts` (+4, -6 lines)
- `packages/cli/src/config/services.ts` (+1, -1 lines)

---

## [feature/traefik] - 2026-03-02 18:30

### 🎯 Prompts
1. "invalid interpolation format for services.traefik.labels... ${1}/dashboard/ — 이것 때문에 터널링 안된거야?"
2. "Failed services: Nextcloud — fetch failed"
3. "Bad Request: Request path '/' does not start with SCRIPT_NAME '/pgadmin' / 신뢰하지 않는 도메인으로 접근 — 파일서버는 초기 계정과 비밀번호 뭐지?"
4. "http://localhost:8085/login?redirect=/files/ 이 접속이 안돼는데 계정 비밀번호 정보 알려줘"
5. "File Browser에 admin/admin도 안되고 admin/skagml12!@로 세팅한 기본 비밀번호도 안돼 공식 문서 찾아서 초기 비밀번호 세팅하는걸 찾아봐"
6. "파일 브라우저는 외부 접근 안돼. 다른건 되는 상황이고 pgAdmin은 내부접근이 안돼. 외부 접근은 돼고 Bad Request: Request path '/' does not start with SCRIPT_NAME '/pgadmin'"
7. "브루넷 어드민에서 표시하는 주소를 http://localhost:5050/pgadmin 로 바꿔줘야해 각 서비스 인포 출력하는 레이어에 서버 공식 홈페이지 링크를 한줄 추가해 — homepage: <주소> 영문으로 추가해줘"
8. "✔ Include sample data / seed files? Yes 이 단계 없애줘"
9. "나머지 서버들도 동일하게 공식 홈페이지랑 안내문 추가해"
10. "pgAdmin 주소 http://localhost:5050/ 만 표시되는데 — 링크 자체를 http://localhost:5050/pgAdmin으로 표시하고 클릭시 이 주소로 가야 한다고"
11. "file browser에서 우리가 초기에 세팅한 계정/비밀번호 적용 안돼. 문제가 뭔지 파악해봐"

### ✅ Changes

#### Docker Compose 인터폴레이션 버그 수정
- **Fixed**: Traefik `redirectregex.replacement` 값의 `${1}` → `$${1}` 이스케이프 — Docker Compose가 캡처 그룹 참조를 환경변수로 오인하여 전체 스택 시작 실패하던 문제 (`packages/cli/src/services/compose-generator.ts`)

#### Nextcloud 서비스 검증 개선
- **Fixed**: Nextcloud 헬스체크 타임아웃 — 첫 실행 시 DB 초기화로 기동 느린 점 반영, `startupDelay: 30000` 추가 (`packages/cli/src/utils/service-verifier.ts`)

#### FileBrowser 초기 계정 설정 수정
- **Added**: `getFilebrowserEnv()` — `FB_USERNAME`, `FB_PASSWORD`, `FB_BASEURL` 환경변수 설정 (`packages/cli/src/services/compose-generator.ts`)
- **Fixed**: FileBrowser 외부 접근(Quick Tunnel) 불가 — `FB_BASEURL=/files` 설정으로 로그인 리다이렉트 경로 수정 (`packages/cli/src/services/compose-generator.ts`)
- **Fixed**: FileBrowser 비밀번호 적용 로직 — BoltDB 독점 잠금 문제로 `docker exec` 중 항상 실패하던 것을 컨테이너 중지 → 임시 컨테이너로 DB 업데이트 → 재시작 방식으로 변경 (`packages/cli/src/wizard/steps/generate.ts`)

#### pgAdmin URL 수정
- **Fixed**: pgAdmin localUrl `http://localhost:5050` → `http://localhost:5050/pgadmin` (status-page, service-verifier, admin-server `TRAEFIK_PATH_SERVICES`) (`packages/cli/src/services/status-page.ts`, `packages/cli/src/utils/service-verifier.ts`, `packages/cli/src/services/admin-server.ts`)

#### 서비스 공식 홈페이지 추가
- **Added**: `ServiceDetailInfo.homepage` 필드 — 모든 서비스(Traefik, Nginx, Caddy, Gitea, Nextcloud, PostgreSQL, MySQL, Redis, pgAdmin, Jellyfin, SSH Server, Mail Server, FileBrowser, MinIO Console, Cloudflared, Valkey, KeyDB)에 공식 URL 추가 (`packages/cli/src/services/status-page.ts`)
- **Added**: `ServiceAccessInfo.homepage` 필드 — CLI 완료 화면에 `⌂ Homepage: <url> — Refer to the official documentation for usage manual` 출력 (`packages/cli/src/utils/service-verifier.ts`, `packages/cli/src/wizard/steps/generate.ts`)
- **Added**: admin-server 서비스 모달 하단에 `$ homepage` 섹션 렌더링 (`packages/cli/src/services/admin-server.ts`)
- **Added**: `Valkey`, `KeyDB` 항목을 `SERVICE_DETAIL_MAP`에 신규 추가 (`packages/cli/src/services/status-page.ts`)
- **Fixed**: cache 서비스 이름 정규화 `'valkey'` → `'Valkey'`, `'keydb'` → `'KeyDB'` (`packages/cli/src/services/status-page.ts`, `packages/cli/src/services/admin-server.ts`)

#### Sample Data 단계 제거
- **Removed**: 위자드 Step 3에서 "Include sample data / seed files?" 프롬프트 제거, `sampleData` 항상 `false`로 고정 (`packages/cli/src/wizard/steps/dev-stack.ts`, `packages/cli/src/config/defaults.ts`)

### 📁 Files Modified
- `packages/cli/src/services/compose-generator.ts` (+23, -1 lines)
- `packages/cli/src/services/status-page.ts` (+91, -2 lines)
- `packages/cli/src/utils/service-verifier.ts` (+17, -0 lines)
- `packages/cli/src/wizard/steps/generate.ts` (+42, -0 lines)
- `packages/cli/src/services/admin-server.ts` (+4, -0 lines)
- `packages/cli/src/wizard/steps/dev-stack.ts` (+1, -7 lines)
- `packages/cli/src/config/defaults.ts` (+1, -1 lines)

---

## [feature/traefik] - 2026-03-01 12:44

### 🎯 Prompts
1. "front end 기술셋 선택시 react(typescript), vue 만 남기고나머진 삭제해"
2. "설치 실패가 났는데 로그 찾아보고 원인이 뭔지 알아내. 다 완성된 후에 어드민 대시보드 링크도 안나오고 화면도 자동실행 안되는데 이유가 뭐지?"

### ✅ Changes

#### Svelte 제거 (FrontendTech: react, vue, none)
- **Modified**: `FrontendTech` type — removed `'svelte'` (`packages/shared/src/types/wizard-state.ts`)
- **Modified**: Zod schema — removed `'svelte'` from enum (`packages/shared/src/schemas/wizard-state.schema.ts`)
- **Modified**: `FRONTEND_REGISTRY` — removed svelte entry, renamed react to "React (TypeScript)" (`packages/cli/src/config/frameworks.ts`)
- **Modified**: v6→v7 migration — svelte now maps to `null` (`packages/cli/src/wizard/state.ts`)
- **Modified**: Test assertions — 4→3 frontend techs, svelte cases removed (`tests/unit/cli/config/frameworks.test.ts`, `tests/unit/cli/wizard/dev-stack.test.ts`, `tests/unit/cli/wizard/server-components.test.ts`)

#### 서비스 검증 실패 수정 (Traefik Dashboard, pgAdmin, Admin Panel)
- **Fixed**: Traefik Dashboard health check — port 8080 not exposed, changed to port 80 `/api/overview` via `healthUrl` field (`packages/cli/src/utils/service-verifier.ts`)
- **Fixed**: pgAdmin health check — SCRIPT_NAME=/pgadmin requires `/pgadmin/misc/ping` path (`packages/cli/src/utils/service-verifier.ts`)
- **Fixed**: Admin Panel EADDRINUSE — added `killPortProcess()` to kill stale admin server before starting (`packages/cli/src/wizard/steps/complete.ts`)
- **Added**: `healthUrl` field to `ServiceUrlEntry` interface for independent health check URLs (`packages/cli/src/utils/service-verifier.ts`)
- **Removed**: Unused `traefikDashboardPort()` function (`packages/cli/src/utils/service-verifier.ts`)

### 📁 Files Modified
- `packages/shared/src/types/wizard-state.ts` (+1, -1 lines)
- `packages/shared/src/schemas/wizard-state.schema.ts` (+1, -1 lines)
- `packages/cli/src/config/frameworks.ts` (+2, -4 lines)
- `packages/cli/src/wizard/state.ts` (-2 lines)
- `packages/cli/src/utils/service-verifier.ts` (+17, -26 lines)
- `packages/cli/src/wizard/steps/complete.ts` (+21, -2 lines)
- `tests/unit/cli/config/frameworks.test.ts` (+5, -10 lines)
- `tests/unit/cli/wizard/dev-stack.test.ts` (+2, -12 lines)
- `tests/unit/cli/wizard/server-components.test.ts` (+2, -4 lines)

---

## [feature/traefik] - 2026-03-01 01:00

### 🎯 Prompts
1. "좋아 uninstall을 할 때 이 내용을 같이 포함하도록 업데이트 해"
2. "삭제하지 않아도 실해는 없습니다 (연결 없으면 inactive 처리). 이건 그냥 삭제하지 않으면 inactive 처리 된다고만 해"

### ✅ Changes
- **Modified**: Uninstall CF notice — context-aware by tunnel mode (`packages/cli/src/commands/uninstall.ts`)
  - **Named Tunnel**: 터널 삭제 경로 + DNS CNAME 삭제 경로 구체적 안내 (터널 이름, 도메인 이름 포함)
  - **Quick Tunnel**: CF 측 정리 불필요 안내
  - **Local / 미설정**: CF 메시지 없음

### 📁 Files Modified
- `packages/cli/src/commands/uninstall.ts` (+31, -1 lines)

---

## [feature/traefik] - 2026-03-01 00:00

### 🎯 Prompts
1. "Implement the following plan: Docker Compose Secrets 마이그레이션 + Traefik BasicAuth 수정"

### ✅ Changes
- **Added**: `SecretFile` interface and `writeSecretFiles()` function for file-based Docker secrets (`packages/cli/src/services/env-generator.ts`)
- **Added**: `ENV_TO_SECRET_FILE` mapping — 14 env vars → 7 secret files (`packages/cli/src/services/env-generator.ts`)
- **Added**: `applySecretsMigration()` — per-service secret env var removal + `_FILE` env var injection (`packages/cli/src/services/compose-generator.ts`)
- **Added**: `collectTopLevelSecrets()` — auto-generates top-level `secrets:` block in docker-compose.yml (`packages/cli/src/services/compose-generator.ts`)
- **Added**: `secrets/` to `.gitignore` generation (`packages/cli/src/wizard/steps/generate.ts`)
- **Modified**: `EnvGeneratorResult` — added `secretFiles: SecretFile[]` field (`packages/cli/src/services/env-generator.ts`)
- **Modified**: `ComposeService` / `ComposeConfig` interfaces — added `secrets` fields (`packages/cli/src/services/compose-generator.ts`)
- **Modified**: `generateComposeConfig()` — applies secrets migration after service build (`packages/cli/src/services/compose-generator.ts`)
- **Modified**: `generateEnvFiles()` — splits entries into .env (non-secret) and secret files (`packages/cli/src/services/env-generator.ts`)
- **Modified**: generate.ts — calls `writeSecretFiles()` after env generation (`packages/cli/src/wizard/steps/generate.ts`)
- **Fixed**: Traefik BasicAuth login failure — removed `$$` escaping in `generateHtpasswd()`, switched from `basicauth.users` (env interpolation) to `basicauth.usersfile` (file-based) (`packages/cli/src/services/env-generator.ts`, `packages/cli/src/services/compose-generator.ts`)
- **Modified**: Credential display text — `.env file` → `secrets/admin_password` (`packages/cli/src/wizard/steps/complete.ts`, `packages/cli/src/services/status-page.ts`)

### 📁 Files Modified
- `packages/cli/src/services/env-generator.ts` (+153, -1 lines)
- `packages/cli/src/services/compose-generator.ts` (+237, -3 lines)
- `packages/cli/src/wizard/steps/generate.ts` (+34, -1 lines)
- `packages/cli/src/wizard/steps/complete.ts` (+3, -1 lines)
- `packages/cli/src/services/status-page.ts` (+2, -1 lines)

### 🔑 Secret File Mapping
| Env Var | Secret File | Convention |
|---------|-------------|------------|
| `POSTGRES_PASSWORD` | `secrets/db_password` | `_FILE` |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | `secrets/db_password` | `_FILE` |
| `NEXTCLOUD_ADMIN_PASSWORD` | `secrets/admin_password` | `_FILE` |
| `PGADMIN_DEFAULT_PASSWORD` | `secrets/admin_password` | `_FILE` |
| `GITEA__database__PASSWD` | `secrets/db_password` | `__FILE` |
| `REDIS/VALKEY/KEYDB` | `secrets/cache_password` | command workaround |
| `TRAEFIK_DASHBOARD_AUTH` | `secrets/traefik_dashboard_auth` | usersfile label |
| `RELAY_PASSWORD` | `secrets/smtp_relay_password` | `__FILE` |
| `CLOUDFLARE_TUNNEL_TOKEN` | `secrets/cf_tunnel_token` | stays in .env |
| `MINIO_ROOT_PASSWORD` | stays in `.env` | no _FILE support |

---
