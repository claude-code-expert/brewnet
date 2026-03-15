# Vite 프론트엔드 Traefik 서브패스에서 빈 화면

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-14 |
| **상태** | 🔄 부분 해결 (nodejs-nestjs 라이브 인스턴스만 수정, 전체 스택 미검증) |
| **에러 타입** | Build / Configuration |
| **브랜치** | develop |
| **재발 여부** | 최초 발생 |

## 문제 요약

`nodejs-nestjs` 보일러플레이트의 React/Vite 프론트엔드가 `http://localhost:3001/`에서는 정상 렌더링되지만, 외부 Cloudflare Tunnel URL `https://tunnel.com/apps/nodejs-nestjs-ui/`에서는 빈 화면만 나타남.

## 에러 상세

```html
<!-- 브라우저 DevTools에서 확인한 served index.html -->
<script type="module" crossorigin src="/assets/index-23LznSB3.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-C1lKpD32.css">

<!-- 브라우저가 실제로 요청하는 URL -->
GET https://tunnel.com/assets/index-23LznSB3.js
→ 200 OK (Content-Type: text/html)  ← landing page HTML 반환! JS 아님
```

브라우저 콘솔:
```
Uncaught SyntaxError: Unexpected token '<'  (JS 파일 위치에서 HTML이 반환됨)
```

## 근본 원인

**Vite의 `base` 설정 미적용**.

Vite 기본값 `base: '/'`로 빌드 시 에셋 경로가 루트 절대경로로 생성됨:
```html
<script src="/assets/index.js">   <!-- ← 도메인 루트 기준 절대경로 -->
```

Traefik 라우팅 흐름:
```
브라우저 @ https://tunnel.com/apps/nodejs-nestjs-ui/
  → <script src="/assets/index.js"> 로드 시도
  → GET https://tunnel.com/assets/index.js
  → Traefik: /assets/ 라우터 없음
  → catch-all brewnet-landing (PathPrefix('/')) 매칭
  → landing page HTML 반환 (JS 대신)
  → React 앱 mount 실패 → 빈 화면
```

**왜 로컬은 되는가?**
로컬 `http://localhost:3001/`는 nginx가 직접 서빙. `/assets/...` 요청이 같은 nginx로 라우팅되어 정상 동작.

## 재현 조건

- Vite 앱을 Traefik subpath (`/apps/<name>/`)로 서빙
- `vite.config.ts`에 `base` 설정 없음 (기본값 `/`)
- Traefik이 `stripprefix` 미들웨어로 서브패스 제거

## 해결 방법

### 1. vite.config.ts에 base 추가

```typescript
// frontend/vite.config.ts
export default defineConfig({
  base: '/apps/nodejs-nestjs-ui/',  // ← 추가
  plugins: [react()],
  // ...
});
```

빌드 후 index.html:
```html
<script src="/apps/nodejs-nestjs-ui/assets/index-DB0iX5HH.js">  <!-- ✓ -->
```

### 2. public 폴더 이미지 절대경로 수정

```tsx
// 이전 (broken):
<img src="/brewnet-site-banner.png" />

// 이후 (fixed):
<img src={`${import.meta.env.BASE_URL}brewnet-site-banner.png`} />
```

Vite의 `base` 설정은 **JS import / CSS url() / import.meta.env.BASE_URL**만 변환함.
JSX 안의 문자열 리터럴 `"/..."` 는 변환하지 않음.

### 3. boilerplate-manager.ts에 자동 패치 함수 추가

```typescript
// packages/cli/src/services/boilerplate-manager.ts
export function patchViteConfig(projectDir: string, stackId: string): void {
  if (stackId.startsWith('nodejs-nextjs')) return; // Next.js는 별도 처리
  const base = `/apps/${stackId}-ui/`;
  // frontend/vite.config.ts 찾아서 base 삽입
  content = content.replace(
    /(defineConfig\s*\(\s*\{)/,
    `$1\n  base: '${base}',`,
  );
}
```

`generate.ts`에서 `startContainers` 전에 호출:
```typescript
patchViteConfig(appDir, stackId);   // Step 2d
patchNextjsConfig(appDir, stackId); // Step 2e (Next.js 전용)
```

## 미해결 사항

- `nodejs-nestjs` 스택 외 다른 Vite 기반 스택 (nodejs-express, go-gin 등) 외부 접속 미검증
- 각 스택의 boilerplate `App.tsx` 내 JSX 문자열 리터럴 이미지 경로 일괄 패치 미적용
- `create-app` 커맨드로 신규 생성 시 `patchViteConfig` 실제 동작 검증 필요

## 핵심 교훈

> Vite의 `base` 설정은 에셋 경로를 서브패스 기준으로 생성하지만, **JSX 문자열 리터럴 `src="/..."` 는 변환하지 않는다**. public 폴더 파일은 반드시 `import.meta.env.BASE_URL`로 prefix해야 한다.

> Next.js의 `basePath`와 달리 Vite의 `base`를 설정해도 Traefik의 `stripprefix`는 그대로 유지해야 한다 — nginx가 서브패스를 모르기 때문.

## 수정된 파일

- `packages/cli/src/services/boilerplate-manager.ts` — `patchViteConfig()` 신규
- `packages/cli/src/wizard/steps/generate.ts` — `patchViteConfig()` 호출 추가
- `~/brewnet/my-homeserver/nodejs-nestjs/frontend/vite.config.ts` — `base` 추가
- `~/brewnet/my-homeserver/nodejs-nestjs/frontend/src/App.tsx` — `import.meta.env.BASE_URL` 적용
