# Next.js basePath 패치 + Quick Tunnel Sub-path 에셋 깨짐 해결

**날짜**: 2026-03-17
**증상**: Quick Tunnel sub-path(`/apps/nextjs-full/`)에서 Next.js 앱의 CSS/이미지가 깨짐
**심각도**: Critical — 페이지 렌더링 완전 실패 (빈 화면)
**영향 범위**: `nodejs-nextjs-full`, `nodejs-nextjs` (API-only) 스택

---

## 1. 문제 원인

### 1-1. 에셋 경로 불일치

Next.js는 기본적으로 `/_next/static/css/xxx.css`, `/_next/image?url=...` 등 **절대 루트 경로**를 사용한다.

Quick Tunnel 환경에서 Traefik이 `/apps/nextjs-full` PathPrefix로 라우팅할 때:
- 브라우저가 `https://tunnel/_next/static/css/xxx.css` 요청
- Traefik의 PathPrefix(`/apps/nextjs-full`)와 매칭 실패
- landing page catch-all이 HTML 반환 → **CSS 대신 HTML이 로드됨**

### 1-2. strip-prefix + Next.js 조합의 이중 문제

기존 패턴: Traefik `strip-prefix` 미들웨어로 `/apps/nextjs-full` 제거 → 컨테이너에 `/` 전달.
하지만 컨테이너 내부에서 Next.js가 생성하는 에셋 경로는 여전히 `/_next/static/...` (루트 기준).
브라우저는 이 경로를 터널 루트로 요청 → Traefik 매칭 실패.

### 1-3. trailing-slash redirect + Next.js trailingSlash:false 충돌

Traefik trailing-slash redirect: `/apps/nextjs-full` → `/apps/nextjs-full/`
Next.js default `trailingSlash: false`: `/apps/nextjs-full/` → 308 → `/apps/nextjs-full`
**→ 무한 리다이렉트 루프!**

---

## 2. 해결 방법

### 2-1. `basePath` 주입 (`patchNextConfig()`)

`next.config.ts`에 `basePath: '/apps/{appName}'` 추가:
```typescript
// before
const nextConfig: NextConfig = { output: 'standalone' };

// after
const nextConfig: NextConfig = {
    output: 'standalone',
    basePath: '/apps/nextjs-full',
};
```

basePath 설정 시 Next.js가 자체적으로 모든 경로에 프리픽스를 추가:
- `/_next/static/...` → `/apps/nextjs-full/_next/static/...` ✅
- `/_next/image?url=...` → `/apps/nextjs-full/_next/image?url=...` ✅
- 페이지 라우트도 자동 프리픽스 적용

### 2-2. Traefik 미들웨어 전면 제거 (Next.js 전용)

Next.js + basePath 조합에서는 Traefik 미들웨어가 **모두 불필요하고 유해**:

| 미들웨어 | 제거 이유 |
|----------|----------|
| `strip-prefix` | basePath가 sub-path를 처리. strip하면 Next.js가 경로를 인식 못함 |
| `trailing-slash redirect` | Next.js `trailingSlash:false` (기본값)와 충돌 → 무한 리다이렉트 |

**→ `noStrip: true` 시 두 미들웨어 모두 스킵**

### 2-3. docker-compose healthcheck 경로 업데이트

basePath 적용 후 **모든 라우트가 프리픽스 아래로 이동**:
- `/health` → 404
- `/apps/nextjs-full/health` → 200 OK

```yaml
# before
- http://127.0.0.1:3000/health

# after
- http://127.0.0.1:3000/apps/nextjs-full/health
```

### 2-4. wizard `pollHealth`/`verifyEndpoints` baseUrl 업데이트

직접 포트 접근 시에도 basePath 적용:
```typescript
const healthBaseUrl = isNextjsBasePath
  ? `${baseUrl}/apps/${stackId}`
  : baseUrl;
```

---

## 3. 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/boilerplate-manager.ts` | `patchNextConfig()` 추가 + healthcheck 패치 + `injectTraefikForQuickTunnel()`에서 Next.js 감지 → 자동 패치 |
| `packages/cli/src/services/compose-generator.ts` | `addQuickTunnelAppLabels()` — `noStrip?: boolean` 파라미터 추가. `noStrip=true` 시 strip-prefix + trailing-slash 모두 스킵 |
| `packages/cli/src/services/admin-server.ts` | External URL 컬럼: unified + `/api/` 미포함 시 프론트 + API 두 줄 표시 |
| `packages/cli/src/wizard/steps/generate.ts` | Quick Tunnel + Next.js 시 `pollHealth`/`verifyEndpoints`의 baseUrl에 basePath 반영 |

---

## 4. Admin 대시보드 표시 규칙

| 스택 | Local URL | External URL |
|------|-----------|-------------|
| `nodejs-nextjs-full` (Full-Stack) | `http://localhost:{port}` + `/api/hello ↗` | `https://tunnel/apps/nextjs-full` + `/api/hello ↗` |
| `nodejs-nextjs` (API-only) | `http://localhost:{port}` + `/api/hello ↗` | `https://tunnel/apps/nextjs-app/api/hello` (단일행) |
| 기타 비-unified 스택 | 단일 URL | 단일 URL |

판별 로직 (client-side JS):
```javascript
// external URL에 /api/가 이미 포함 → API-only → 두 줄 불필요
isUnifiedSvc && ext.indexOf('/api/') === -1
  ? `${ext}<br>${ext}/api/hello ↗`  // 두 줄
  : `${ext}`                         // 단일행
```

---

## 5. 검증 체크리스트

```bash
TUNNEL="https://<tunnel-url>"

# 1. CSS 정상 로딩
curl -sI "$TUNNEL/apps/nextjs-full/_next/static/css/<hash>.css"
# → content-type: text/css ✅

# 2. JS 번들 경로 확인
curl -s "$TUNNEL/apps/nextjs-full" | grep -o 'href="[^"]*_next[^"]*' | head -3
# → href="/apps/nextjs-full/_next/static/... ✅

# 3. 이미지 직접 접근
curl -sI "$TUNNEL/apps/nextjs-full/brewnet-site-banner.png"
# → content-type: image/png ✅

# 4. API 엔드포인트
curl -sI "$TUNNEL/apps/nextjs-full/api/hello"
# → content-type: application/json ✅

# 5. nextjs-app (API-only)
curl -sI "$TUNNEL/apps/nextjs-app/api/hello"
# → content-type: application/json ✅

# 6. 무한 리다이렉트 없음
curl -sI "$TUNNEL/apps/nextjs-full"
# → HTTP/2 200 (NOT 308) ✅

# 7. Docker healthcheck
docker ps --format '{{.Names}} {{.Status}}' | grep nextjs
# → healthy ✅
```

---

## 6. 핵심 규칙 (재발 방지)

1. **Next.js 스택에 Traefik strip-prefix 절대 사용 금지** — basePath가 sub-path를 처리. strip하면 경로 이중 제거.
2. **Next.js 스택에 Traefik trailing-slash redirect 금지** — `trailingSlash:false` (기본값)와 충돌 → 무한 루프.
3. **basePath 설정 시 반드시 재빌드** — Next.js는 빌드 시 basePath를 번들에 bake-in. 설정 변경 후 `docker compose build --no-cache` 필수.
4. **basePath 설정 시 healthcheck 경로도 반드시 업데이트** — `/health` → `/apps/{name}/health`. 안 하면 unhealthy 무한 대기.
5. **pollHealth/verifyEndpoints도 basePath 반영** — 직접 포트 접근도 basePath 적용됨 (`http://127.0.0.1:8098/apps/nextjs-full/health`).

---

## 7. 비-Next.js 스택과의 차이점

| 항목 | Next.js (basePath) | 기타 SPA (Vite/React 등) |
|------|-------------------|--------------------------|
| Sub-path 처리 | Next.js 내부 (basePath) | Traefik strip-prefix |
| Trailing slash | Next.js 자체 처리 (미들웨어 불필요) | Traefik redirect 필수 |
| 에셋 경로 | 빌드 시 basePath 반영 | 상대 경로 `./` 사용 |
| Healthcheck 경로 | `/apps/{name}/health` | `/health` (strip 후) |
| `noStrip` 플래그 | `true` | `false` (기본값) |
