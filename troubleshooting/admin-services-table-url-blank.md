# Admin Dashboard Services Table — Local URL "—" 표시

> 이 문서는 Admin Dashboard 서비스 테이블에서 Local/External 주소가 "—"로 표시되는 문제의 트러블슈팅 히스토리를 기록합니다.

---

## 발생일: 2026-03-16 (재발: 2026-03-16)

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-16 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | feature/apps-domain |
| **재발 여부** | 1회 재발 |
| **재발 주기** | 새 케이스: External URL "—" (동일 패턴, 다른 필드) |

### 문제 요약

Admin Dashboard 서비스 테이블에서 `nodejs-nextjs-full-backend-1` 컨테이너 (`backend` 서비스)의 Local URL 열이 "—"로 표시됨. External URL도 동일. 포트(3000)는 정상 표시되나 클릭 가능한 링크가 없어 직접 접속 불가.

### 에러 상세

```
Services 테이블:
  Service: backend
  Status:  running
  Port:    3000
  Local:   —          ← 기대값: http://localhost:3000
  External: —
```

### 근본 원인

`packages/cli/src/services/admin-server.ts`의 `handleGetServices()` 함수(L709)에서 URL이 오직 `WEB_UI_SERVICES` 화이트리스트에 등록된 서비스에만 설정됨:

```typescript
// Before (L709)
const WEB_UI_SERVICES = new Set([
  'traefik', 'nginx', 'caddy', 'gitea', 'nextcloud', 'minio',
  'jellyfin', 'pgadmin', 'filebrowser',
]);

url: WEB_UI_SERVICES.has(composeService) && port
  ? urlMap[composeService] ?? `http://localhost:${port}`
  : null,
```

보일러플레이트 컨테이너(`com.docker.compose.service=backend`)는 `WEB_UI_SERVICES`에 없으므로 `url = null` → "—" 표시.

- **`WEB_UI_SERVICES`**: 홈서버 서비스 8개만 포함 (화이트리스트 방식)
- 보일러플레이트 서비스명(`backend`, `frontend`, `app` 등)은 임의적이어서 화이트리스트에 사전 등록 불가
- 신규 boilerplate 스택 추가 시마다 화이트리스트 업데이트 필요 → 반복적으로 "—" 버그 재발

### 재현 조건

1. `brewnet init`으로 홈서버 설치 후 `nodejs-nextjs-full` 보일러플레이트 선택
2. Admin Dashboard 접속 → Services 탭
3. `backend` 행의 Local 열 → "—"

### 해결 방안

화이트리스트 방식(`WEB_UI_SERVICES`) → 블랙리스트 방식(`NO_HTTP_SERVICES`)으로 전환.
HTTP가 아닌 서비스(DB, SSH, Mail)만 URL 표시 제외하고, 나머지 모든 서비스는 포트가 있으면 URL 표시.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/admin-server.ts` L636-639 | `WEB_UI_SERVICES` → `NO_HTTP_SERVICES` 블랙리스트로 교체 |
| `packages/cli/src/services/admin-server.ts` L709-712 | URL 로직 조건 반전 (`has` → `!has`) |

```typescript
// After
const NO_HTTP_SERVICES = new Set([
  'postgresql', 'mysql', 'mariadb', 'redis', 'valkey', 'keydb',
  'openssh-server', 'docker-mailserver',
]);

url: port && !NO_HTTP_SERVICES.has(composeService)
  ? urlMap[composeService] ?? `http://localhost:${port}`
  : null,
```

### 검증 결과

```
backend                             port=3000   url=http://localhost:3000   ✅
nextcloud                           port=80     url=http://localhost/cloud  ✅
pgadmin                             port=5050   url=http://localhost:5050/pgadmin ✅
gitea                               port=3000   url=http://localhost/git    ✅
postgresql                          port=5432   url=—                       ✅ (DB, 올바르게 제외)
redis                               port=6379   url=—                       ✅ (DB, 올바르게 제외)
openssh-server                      port=2222   url=—                       ✅ (SSH, 올바르게 제외)
filebrowser                         port=8085   url=http://localhost:8085   ✅
jellyfin                            port=8096   url=http://localhost:8096/jellyfin/web/ ✅
```

---

## 재발: External URL "—" — 2026-03-16

### 문제 요약

Local URL 수정 후에도 External URL 컬럼이 "—"로 표시. 사용자가 도메인 연결을 한 boilerplate 서비스(`backend`)에서 발생.

### 근본 원인

`getExternalUrl(id)` 함수(L336)가 `EXT_PATHS` 화이트리스트(홈서버 서비스 9개만 포함)만 조회하고, 화이트리스트에 없으면 즉시 `null` 반환:

```javascript
// Before
var e=EXT_PATHS[id];if(!e)return null;
```

`DOMAIN_CONNECTIONS`(Cloudflare Tunnel 연결 정보)가 이미 HTML에 embed되어 있었지만 `getExternalUrl`이 전혀 조회하지 않음.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/admin-server.ts` L338 | `EXT_PATHS` 미등록 서비스는 `DOMAIN_CONNECTIONS`에서 `appName` 매칭 후 `https://hostname` 반환 |

```javascript
// After
var e=EXT_PATHS[id];if(!e){var conn=(DOMAIN_CONNECTIONS||[]).find(function(dc){return dc.appName===id;});return conn?'https://'+conn.hostname:null;}
```

### 동작 원리

- `DOMAIN_CONNECTIONS`는 `wizardState.domainConnections` 배열 (Cloudflare Tunnel 연결 시 저장됨)
- 각 entry에 `appName`, `hostname` 포함 (`DomainConnection` 타입, `packages/shared`)
- 도메인 미연결 앱 → `conn = undefined` → `null` 반환 → "—" (올바른 동작)
- 도메인 연결 앱 → `conn.hostname = 'api.example.com'` → `'https://api.example.com'` 반환

### 예방 방법

- 신규 서비스/스택 추가 시 `WEB_UI_SERVICES` 화이트리스트 업데이트 불필요 (블랙리스트 방식으로 전환됨)
- HTTP가 아닌 신규 서비스(DB, 메시지큐 등) 추가 시에만 `NO_HTTP_SERVICES`에 추가
- `TRAEFIK_PATH_SERVICES`의 urlMap 오버라이드는 그대로 유지 (Gitea `/git`, pgAdmin 등)
- External URL: `EXT_PATHS`에 없는 서비스는 자동으로 `DOMAIN_CONNECTIONS` fallback 조회 → 새 보일러플레이트 스택 추가 시 별도 작업 불필요

### 관련 참고

- 관련 파일: `packages/cli/src/services/admin-server.ts` L636-714
- 관련 상수: `TRAEFIK_PATH_SERVICES`, `INTERNAL_SERVICES`, `REQUIRED_SERVICES`

---

## 재발: Quick Tunnel 모드 External URL "—" — 2026-03-17 (3회차)

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-17 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime / Network |
| **브랜치** | develop |
| **재발 여부** | 3회차 재발 |
| **재발 주기** | 이전 수정이 Named Tunnel만 커버, Quick Tunnel 미처리 |

### 문제 요약

Quick Tunnel 모드에서 boilerplate 서비스(`frontend`, `backend`)의 External URL이 "—"으로 표시. 2회차 수정에서 `DOMAIN_CONNECTIONS` fallback을 추가했지만 이것은 Named Tunnel(도메인 연결)에만 작동. Quick Tunnel 모드에서는 `DOMAIN_CONNECTIONS`가 비어있어 여전히 null 반환.

### 근본 원인 (2단계)

**1단계: Dashboard `getExternalUrl()` 미지원**

`getExternalUrl(id)`에서 `EXT_PATHS[id]`가 없는 서비스는 `DOMAIN_CONNECTIONS` fallback만 조회. Quick Tunnel 모드에서 `DOMAIN_CONNECTIONS`가 비어있으면 null.

```javascript
// Before (2회차 수정 후)
var e=EXT_PATHS[id];
if(!e){
  var conn=(DOMAIN_CONNECTIONS||[]).find(...);
  return conn ? 'https://'+conn.hostname : null;  // Quick Tunnel: 항상 null
}
```

**2단계: Docker 네트워크 분리**

보일러플레이트 컨테이너는 `<stackId>_default` 네트워크에만 속하고, Traefik은 `brewnet` 네트워크만 감시. 따라서 Traefik이 보일러플레이트 컨테이너를 발견하지 못해 실제 라우팅도 불가.

### 해결 방안 (3단계)

**1. `compose-generator.ts` — `addQuickTunnelAppLabels()` 신규 함수**
- boilerplate/app docker-compose.yml에 Traefik PathPrefix 라벨 주입
- `brewnet` 외부 네트워크 조인
- 경로: `/apps/{appName}` (strip-prefix 미들웨어 포함)

**2. `boilerplate-manager.ts` — `injectTraefikForQuickTunnel()` 함수**
- `startContainers()` 전에 호출
- compose 파일의 primary HTTP 서비스 자동 감지 (backend, app, web 등)

**3. `generate.ts` Section 7b — Quick Tunnel 모드일 때 라벨 주입**
```typescript
if (state.domain.cloudflare.tunnelMode === 'quick') {
  injectTraefikForQuickTunnel(appDir, stackId, backendPort);
}
```

**4. `app-manager.ts` — 3가지 모드 모두에 적용**
```typescript
_injectQuickTunnelIfNeeded(appDir, appName, port);
```

**5. `admin-server.ts` — `getExternalUrl()` Quick Tunnel fallback**
```javascript
if(c.quickTunnelUrl && !NO_QT[id]){
  return quickTunnelUrl + '/apps/' + id;
}
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `compose-generator.ts` | `addQuickTunnelAppLabels()` 신규 — PathPrefix + brewnet 네트워크 주입 |
| `boilerplate-manager.ts` | `injectTraefikForQuickTunnel()` 신규 — compose 서비스 자동 감지 + 라벨 주입 |
| `generate.ts` Section 7b | Quick Tunnel 모드일 때 `injectTraefikForQuickTunnel()` 호출 |
| `app-manager.ts` | `_injectQuickTunnelIfNeeded()` — 3가지 모드 docker compose up 직전 호출 |
| `admin-server.ts` L336-349 | `getExternalUrl()` Quick Tunnel fallback: `/apps/{id}` URL 생성 |

### 예방 방법

- Quick Tunnel 모드에서 새 서비스/앱 추가 시 `brewnet` 네트워크 조인은 자동 처리됨
- `EXT_PATHS` 화이트리스트 업데이트 불필요 — Quick Tunnel fallback이 자동으로 `/apps/{id}` 구성
- `NO_HTTP_SERVICES`에 등록된 DB/SSH/Mail 서비스만 External URL 제외

### 관련 참고

- 관련 커밋: develop 브랜치 (2026-03-17)
- 관련 파일: `compose-generator.ts`, `boilerplate-manager.ts`, `generate.ts`, `app-manager.ts`, `admin-server.ts`
- Traefik 네트워크: `brewnet` (external: true, `docker network create brewnet`으로 생성)
- Quick Tunnel 경로 패턴: `https://xxx.trycloudflare.com/apps/{appName}`
