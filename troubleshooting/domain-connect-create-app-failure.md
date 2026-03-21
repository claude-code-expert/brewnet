# create-app 앱 도메인 연결 500 에러 — 앱 이름 해석 오류 + ingress 라우팅 누락

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-21 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | 006-domain-settings |
| **재발 여부** | 최초 발생 |

## 문제 요약

`create-app`으로 생성한 앱을 AppDomainTab에서 서브도메인에 연결하려 하면 500 에러가 반환됐다. 또한 연결이 성공한 것처럼 보이는 경우에도 Cloudflare tunnel ingress에 라우팅이 등록되지 않아 실제 외부 접근이 불가능했다.

## 에러 상세

```
POST /api/domain/connect
→ 500 Internal Server Error
{ "error": "App not found: my-app" }

// 또는 연결은 됐지만 외부 접근 시
ERR_CONNECTION_REFUSED (cloudflare가 local service로 라우팅 못 찾음)
```

## 근본 원인

### 원인 1 — 앱 이름 해석 오류

`domain-manager.ts`의 `connect()` 함수에서 wizard boilerplate 앱과 create-app 앱을 구분하는 로직이 없었다. wizard boilerplate는 `state.boilerplates[].name`에서 조회하고, create-app 앱은 `~/.brewnet/apps.json` (app registry)에서 조회해야 한다.

기존 코드는 boilerplate 방식만 처리하여 create-app 앱의 경우 `App not found` 에러를 반환했다.

### 원인 2 — Cloudflare tunnel ingress 라우팅 누락

`configureTunnelIngress()` 호출 시 서비스명으로 docker-compose 서비스명을 사용해야 하는데, create-app 앱의 경우 `appName`이 아닌 실제 compose 서비스명(`stacks.ts`의 `serviceNames`)을 사용해야 했다. 서비스명 불일치로 cloudflared가 올바른 로컬 서비스를 찾지 못했다.

```typescript
// 문제: appName을 그대로 서비스명으로 사용
await configureTunnelIngress(tunnelId, appName, localPort);
// ↑ "my-app" → docker 서비스명은 "my-app-backend" 일 수도 있음
```

## 재현 조건

1. `create-app` 명령으로 앱 생성 (예: `nestjs` 스택)
2. Admin UI → Apps → App Detail → Domain 탭
3. 서브도메인 입력 후 Connect 클릭
4. 500 에러 발생

## 해결 방안

### 원인 1 수정

`connect()` 함수에서 apps registry (`readApps()`)를 먼저 조회하여 create-app 앱을 지원하도록 수정.

### 원인 2 수정

non-unified split-stack 앱의 경우 프론트엔드 포트를 감지하여 라우팅에 적용. stacks registry에서 해당 앱의 실제 서비스 구성을 조회하여 올바른 포트와 서비스명 사용.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/domain-manager.ts` | apps registry 기반 앱 조회 추가, non-unified 스택 프론트 포트 감지 로직 추가 |

```typescript
// 수정 후 — apps registry에서 먼저 조회
const apps = await readApps();
const app = apps.find(a => a.name === appName);
if (app) {
  // create-app 앱 처리 경로
  const stack = getStackById(app.stackId);
  const frontendPort = stack?.isUnified ? app.port : app.frontendPort ?? app.port;
  // ...
}
```

## 예방 방법

- domain-manager에서 앱을 식별할 때 **wizard boilerplate**와 **create-app 앱** 두 가지 소스를 항상 함께 조회할 것
- Cloudflare tunnel ingress 설정 시 `appName` 직접 사용 금지 — 반드시 apps registry 또는 compose 파일에서 실제 서비스명/포트를 조회할 것
- split-stack(비 unified) 앱은 프론트엔드 포트와 백엔드 포트가 다름 — 외부 노출은 항상 프론트엔드 포트로

## 관련 참고

- 관련 파일: `packages/cli/src/services/domain-manager.ts`
- 관련 파일: `packages/cli/src/services/app-registry.ts`
- 관련 타입: `packages/shared/src/types/wizard-state.ts` (`DomainConnection`)
- 관련 설정: `packages/cli/src/config/stacks.ts` (`isUnified` 플래그)

---
