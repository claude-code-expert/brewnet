# Next.js basePath Causes Health Check Timeout

## Symptom
Next.js 보일러플레이트 앱 생성 시 Health check가 영원히 타임아웃.
`http://127.0.0.1:3000/health` → HTML 반환 (JSON이 아님).
실제 health 경로는 `http://127.0.0.1:3000/apps/nodejs-nextjs/health`.

## Root Cause
Next.js에 `basePath: '/apps/nodejs-nextjs'`가 설정되어 있으면, 모든 라우트가 basePath 하위로 이동.
`_pollHealth()`가 basePath 없이 `/health`를 호출 → Next.js가 catch-all 페이지로 렌더링 → HTML 200 반환 (JSON이 아님) → health check 실패로 판단.

## Fix
`_detectBasePath()` — next.config.ts/mjs/js에서 `basePath` 읽어서 health URL에 자동 반영.
`_buildHealthUrl()` — 보일러플레이트(`/health`)와 일반 프로젝트(`/`) 경로 분기.

```
보일러플레이트: http://127.0.0.1:3000/apps/nodejs-nextjs/health
일반 프로젝트:  http://127.0.0.1:3000/
```

## Affected Files
- `packages/cli/src/services/app-manager.ts`

## Commit
`72dd702`, `1ba0953`
