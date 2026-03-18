# Brewnet Development Changelog

> 이 문서는 Brewnet 프로젝트의 개발 히스토리를 기록합니다.
> 각 엔트리는 프롬프트, 변경사항, 영향받은 파일을 포함합니다.

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
