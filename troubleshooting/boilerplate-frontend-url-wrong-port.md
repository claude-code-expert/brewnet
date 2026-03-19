# Boilerplate Frontend URL Wrong Port Troubleshooting

> Non-unified 보일러플레이트 앱의 프론트 접속 URL이 잘못된 포트(3000)를 가리키는 문제

---

## 최초 발생 — 2026-03-19

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | 001-fix-create-app-modal |
| **재발 여부** | 최초 발생 |

## 문제 요약

`nodejs-nestjs` 같은 non-unified 보일러플레이트 앱의 `↗ Local` 링크가 프론트엔드(포트 3001)가 아닌 백엔드(포트 8080)를 가리켰다. 포트 3000이 다른 앱에 점유되어 `FRONTEND_PORT=3001`로 할당됐지만, `.brewnet-boilerplate.json`에는 3000으로 하드코딩되어 저장됐고 admin-server도 이 파일을 참조하지 않았다.

또한 앱 상세 모달이 배포 후에도 "Deploy 먼저" 경고를 계속 표시하는 문제가 함께 발생했다.

## 에러 상세

```
# .brewnet-boilerplate.json
"frontendUrl": "http://127.0.0.1:3000"   ← 실제 포트는 3001

# admin-server GET /api/apps 응답
localUrl: "http://localhost:8080"         ← 백엔드 포트
externalUrl: ".../apps/nodejs-nestjs"    ← 백엔드 경로 (/apps/name-ui 아님)

# admin-server GET /api/apps/:name 응답
lastDeployedAt: null                      ← 배포 후에도 항상 null
```

## 근본 원인

세 가지 독립 버그가 겹쳐 발생:

### 1. `generate.ts` frontendUrl 하드코딩
```typescript
// generate.ts:954 — 수정 전
frontendUrl: isUnified ? baseUrl : 'http://127.0.0.1:3000',  // ← 항상 3000
```
`frontendPort` 변수가 바로 위에서 올바르게 계산됐음에도 리터럴 3000으로 저장.

### 2. `admin-server` `/api/apps` — `.brewnet-boilerplate.json` 미참조
`GET /api/apps` 핸들러가 `apps.json`의 `port`(백엔드 포트)만 보고 `localUrl`/`externalUrl`을 계산. non-unified 스택의 별도 프론트 경로(`/apps/{name}-ui`)를 전혀 고려하지 않음.

### 3. `admin-server` `/api/apps/:name` — enrichment 누락
단일 앱 조회 엔드포인트가 `lastDeployedAt`, `localUrl`, `externalUrl` enrichment 없이 raw `AppEntry`를 그대로 반환. `AppDetailModal`이 이 엔드포인트를 폴링하므로 배포 후에도 항상 `lastDeployedAt: null`.

## 재현 조건

1. host port 3000이 다른 앱에 점유된 상태에서 non-unified 보일러플레이트 생성
2. `FRONTEND_PORT=3001`로 `.env`에 저장되지만 `.brewnet-boilerplate.json`은 3000 유지
3. admin UI Apps 페이지에서 `↗ Local` 클릭 → 다른 앱(3000)으로 이동
4. 앱 상세 모달 Overview 탭 → 배포 후에도 "Deploy 먼저" 배너 지속 표시

## 해결 방안

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts:954` | `'http://127.0.0.1:3000'` → `` `http://127.0.0.1:${frontendPort ?? 3000}` `` |
| `packages/cli/src/services/admin-server.ts` (GET /api/apps) | `.brewnet-boilerplate.json` 참조 추가, non-unified 스택 감지 시 `.env`의 `FRONTEND_PORT` 직접 읽어 `localUrl` 계산, `externalUrl`을 `/apps/{name}-ui`로 수정 |
| `packages/cli/src/services/admin-server.ts` (GET /api/apps/:name) | `lastDeployedAt`, `localUrl`, `externalUrl` enrichment 로직 추가 (목록 엔드포인트와 동일) |
| `packages/admin-ui/src/components/OverviewTab.tsx` | `lastDeployedAt` null 시 Git Repository 섹션에 경고 배너 + Gitea URL 흐리게 표시 |

### 핵심 로직

```typescript
// admin-server.ts — /api/apps GET enrichment
const hasFrontend = bpMeta && bpMeta.isUnified === false;
if (hasFrontend) {
  // .env에서 실제 FRONTEND_PORT 읽기 (메타 파일 신뢰 불가)
  let frontendPort = 3000;
  const feEnvContent = readFileSync(join(a.appDir, '.env'), 'utf-8');
  const m = feEnvContent.match(/^FRONTEND_PORT=(\d+)/m);
  if (m) frontendPort = parseInt(m[1], 10);
  localUrl = `http://127.0.0.1:${frontendPort}`;
  externalUrl = qt ? `${qt}/apps/${a.name}-ui` : null;
}
```

## 예방 방법

- `frontendUrl`을 `.brewnet-boilerplate.json`에 저장할 때 항상 실제 할당된 포트 변수를 사용할 것
- `GET /api/apps/:name` 같은 단일 조회 엔드포인트도 목록 엔드포인트와 동일한 enrichment를 적용할 것
- non-unified 스택의 Traefik 경로는 항상 `/apps/{name}-ui` 패턴임을 확인

## 관련 참고

- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`, `packages/cli/src/services/admin-server.ts`, `packages/admin-ui/src/components/OverviewTab.tsx`
- 관련 이슈: `boilerplate-frontend-port-conflict.md` — 포트 할당 버그 (선행 이슈)

---
