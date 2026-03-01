# Brewnet Development Changelog

> 이 문서는 Brewnet 프로젝트의 개발 히스토리를 기록합니다.
> 각 엔트리는 프롬프트, 변경사항, 영향받은 파일을 포함합니다.

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
