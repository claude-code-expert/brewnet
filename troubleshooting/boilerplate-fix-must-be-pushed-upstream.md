# 보일러플레이트 수정이 반복 재발하는 문제

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-15 |
| **상태** | ✅ 해결 |
| **에러 타입** | Process / Workflow |
| **브랜치** | develop |
| **재발 여부** | 동일 문제 2회 반복 후 근본 원인 파악 |

## 문제 요약

`my-homeserver/nodejs-express/frontend/src/App.tsx`의 이미지 경로 버그(`src="/brewnet-site-banner.png"`)를 이전 세션에서 수정했음에도 불구하고, 다음 세션에서 동일 증상이 재발함.

## 증상

```html
<!-- 브라우저에서 확인 -->
<img alt="Brewnet — Your server on tap. Just brew it."
     class="hero-banner"
     src="/brewnet-site-banner.png">   ← 절대경로 그대로

<!-- 외부 URL / 로컬 subpath에서 이미지 404 -->
GET https://tunnel.com/brewnet-site-banner.png → 404
GET http://localhost/brewnet-site-banner.png   → 404
```

## 근본 원인

`my-homeserver/nodejs-express`는 `brewnet-boilerplate` GitHub 리포의 **클론된 복사본**이다.

```
origin → https://github.com/claude-code-expert/brewnet-boilerplate.git
branch → stack/nodejs-express
```

이전 세션에서 로컬 파일만 수정했고, **commit + push를 하지 않았다**. 따라서:

- GitHub 소스에는 여전히 깨진 경로가 남아 있음
- 컨테이너 재빌드(`docker compose build`)는 소스 파일을 그대로 사용 → 문제 없음
- 하지만 `git checkout`, `git reset`, 또는 새 clone 시 → 원상복구
- 또는 브라우저 캐시 클리어 / 컨테이너 재생성 시 → 다시 깨짐

## 해결 방법

로컬 수정 후 반드시 **커밋 + 푸시**:

```bash
git add frontend/src/App.tsx
git commit -m "fix: use relative path for public assets under Traefik subpath"
git push origin stack/nodejs-express
```

## 함께 수정한 관련 버그 (nodejs-express 스택)

### 1. 이미지 절대경로 → 상대경로

```tsx
// ❌ 깨짐: Traefik subpath 환경에서 도메인 루트 요청
<img src="/brewnet-site-banner.png" />

// ✅ 정상: 현재 페이지 URL 기준 상대경로
<img src="./brewnet-site-banner.png" />
```

**이유**: `vite.config.ts`에 `base: './'` 설정 시, 브라우저가 `/apps/nodejs-express-ui/`에 있을 때:
- `/brewnet-site-banner.png` → `https://domain.com/brewnet-site-banner.png` (Traefik 라우트 없음 → 404)
- `./brewnet-site-banner.png` → `https://domain.com/apps/nodejs-express-ui/brewnet-site-banner.png` → Traefik이 prefix strip → nginx `/brewnet-site-banner.png` 서빙 ✅

### 2. vite.config.ts base 설정

```typescript
// ✅ frontend/vite.config.ts
export default defineConfig({
  base: './',   // ← 추가: Traefik subpath에서 에셋 상대경로 생성
  plugins: [react()],
  // ...
});
```

stack-agnostic한 `'./'` 사용으로 stackId를 몰라도 됨 (이전 방식인 `'/apps/nodejs-express-ui/'` 하드코딩 불필요).

### 3. Dockerfile healthcheck Alpine IPv6

```dockerfile
# ❌ Alpine에서 localhost가 ::1(IPv6)로 해석 → 연결 실패
CMD wget -q -O /dev/null http://localhost:80 || exit 1

# ✅ IPv4 명시
CMD wget -q -O /dev/null http://127.0.0.1:80 || exit 1
```

### 4. Traefik 트레일링 슬래시 리디렉트

```yaml
# docker-compose.override.yml — frontend 서비스 labels
- "traefik.http.middlewares.bp-nodejs-express-ui-slash.redirectregex.regex=/apps/nodejs-express-ui$$"
- "traefik.http.middlewares.bp-nodejs-express-ui-slash.redirectregex.replacement=/apps/nodejs-express-ui/"
- "traefik.http.middlewares.bp-nodejs-express-ui-strip.stripprefix.prefixes=/apps/nodejs-express-ui"
- "traefik.http.routers.bp-nodejs-express-ui.middlewares=bp-nodejs-express-ui-slash,bp-nodejs-express-ui-strip"
```

트레일링 슬래시 없이 접근 시 (`/apps/nodejs-express-ui`) Vite의 `base: './'`가 상위 디렉토리(`/apps/`) 기준으로 잘못 해석되는 것을 307 리디렉트로 방지.

## 핵심 교훈

> **보일러플레이트 인스턴스(`my-homeserver/`)를 수정했을 때, 해당 디렉토리가 GitHub 리포의 클론이라면 반드시 commit + push해야 한다. 로컬 수정만으로는 재현 환경이나 재설치 시 원상복구된다.**

> **`boilerplate-manager.ts`의 패치 함수들(`patchViteConfig`, `patchDockerfileHealthcheck`)이 있더라도, boilerplate 소스 자체가 올바르게 수정되어 있어야 패치가 불필요해지거나 최소화된다.**

## 수정된 파일

모두 `brewnet-boilerplate` 리포 `stack/nodejs-express` 브랜치, 커밋 `e6a26cc`:

- `frontend/src/App.tsx` — 이미지 상대경로
- `frontend/vite.config.ts` — `base: './'`
- `frontend/Dockerfile` — healthcheck IPv4
- `docker-compose.override.yml` — Traefik redirectregex 미들웨어
