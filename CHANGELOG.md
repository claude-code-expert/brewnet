# Brewnet Development Changelog

> 이 문서는 Brewnet 프로젝트의 개발 히스토리를 기록합니다.
> 각 엔트리는 프롬프트, 변경사항, 영향받은 파일을 포함합니다.

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
