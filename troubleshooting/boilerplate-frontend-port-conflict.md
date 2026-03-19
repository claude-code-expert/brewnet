# Boilerplate Frontend Port Conflict Troubleshooting

> Non-unified 스택(nodejs-express 등) 실행 시 프론트엔드 컨테이너가 port 충돌로 시작 실패

---

## 재발 기록 — 2026-03-19 (2번째)

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | 001-fix-create-app-modal |
| **재발 여부** | 재발 (2번째) |

## 문제 요약

`create-app` API로 new-project 앱 생성 시 `BACKEND_PORT`와 `FRONTEND_PORT`가 동일한 포트로 설정되어 프론트엔드 컨테이너가 "port is already allocated" 에러로 시작 실패.

## 에러 상세

```
Error response from daemon: failed to set up container networking:
driver failed programming external connectivity on endpoint test-express-frontend-1:
Bind for 0.0.0.0:3002 failed: port is already allocated
```

## 근본 원인

`app-manager.ts`의 boilerplate 클론 후 `.env` 주입 로직에서:
1. `BACKEND_PORT=${port}` (사용자 지정값, e.g. 3002)
2. `FRONTEND_PORT=$(findFreePortB(3000))` → 포트 3000부터 스캔

`.env` 파일 작성 시점에 백엔드 컨테이너가 아직 시작되지 않아 포트 3002가 free로 감지됨. 결과적으로 `FRONTEND_PORT=3002 = BACKEND_PORT=3002`.

`new-project` 경로의 `boilerplate-manager.ts` `findFreePort(3000)` 호출도 동일 문제.

## 해결 방안

프론트엔드 포트 탐색 시작점을 백엔드 포트+1로 변경:

```typescript
// app-manager.ts — boilerplate git-clone 경로
const fePort = await findFreePortB(port + 1);  // 이전: findFreePortB(3000)

// app-manager.ts — new-project 경로
const frontendPort = (stackInfo && !stackInfo.isUnified) ? await findFreePort(port + 1) : undefined;
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/app-manager.ts:819` | `findFreePortB(3000)` → `findFreePortB(port + 1)` |
| `packages/cli/src/services/app-manager.ts:894` | `findFreePort(3000)` → `findFreePort(port + 1)` |

## 예방 방법

- `findFreePort` 호출 시 이미 할당된 포트를 exclude 파라미터로 전달하는 방식 고려
- 포트 탐색 범위를 사용자 지정 포트 이후부터 시작하도록 일관성 유지

---

## 최초 발생 — 2026-03-04 (1번째)

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-04 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | 001-create-app |
| **재발 여부** | 최초 발생 |

## 문제 요약

`brewnet init`에서 `nodejs-express` 스택을 선택했을 때 프론트엔드 컨테이너 시작 시 "ports are not available: exposing port TCP 0.0.0.0:3000" 에러가 발생했다. admin panel에서 `[frontend] error` 로 표시됐다.

## 에러 상세

```
Error: (HTTP code 500) server error - ports are not available:
exposing port TCP 0.0.0.0:3000 -> 127.0.0.1:0:
listen tcp 0.0.0.0:3000: bind: address already in use
```

## 근본 원인

boilerplate 스택은 두 가지 유형이 있다:

| 유형 | 예시 | 포트 |
|------|------|------|
| Unified (통합) | nodejs-nextjs* | BACKEND_PORT (3000) 1개만 |
| Non-unified (분리) | nodejs-express, go-gin 등 | BACKEND_PORT (8080) + FRONTEND_PORT (3000) 2개 |

`generate.ts`의 `findFreePort` 로직이 `BACKEND_PORT`만 자동 선택하고 `FRONTEND_PORT=3000`은 그대로 두었다. 호스트에 다른 프로세스(예: tika Next.js dev server)가 port 3000을 점유하고 있으면 프론트엔드 컨테이너가 시작 실패한다.

## 재현 조건

1. host port 3000이 다른 프로세스에 점유된 상태
2. `brewnet init`에서 non-unified 스택 선택 (nodejs-express, nodejs-nestjs 등)
3. 프론트엔드 컨테이너가 `${FRONTEND_PORT:-3000}:80` 바인딩 시도
4. → port conflict 에러

## 해결 방안

Non-unified 스택에 대해 `FRONTEND_PORT`도 `findFreePort(3000)`으로 자동 선택:

```typescript
// generate.ts
const isUnified = stackId.startsWith('nodejs-nextjs');
const backendPort = await findFreePort(isUnified ? 3000 : 8080);

// Non-unified: frontend port도 자동 선택
const frontendPort = isUnified ? undefined : await findFreePort(3000);

boilerplateGenerateEnv(appDir, stackId, dbDriver, {
  ...dbOpts,
  hostPort: backendPort,
  frontendPort,           // ← 추가
});
```

```typescript
// boilerplate-manager.ts — GenerateEnvOpts 인터페이스 추가
frontendPort?: number;

// generateEnv 내부
if (opts?.frontendPort !== undefined) {
  if (/^FRONTEND_PORT=/m.test(content)) {
    content = content.replace(/^FRONTEND_PORT=.*/m, `FRONTEND_PORT=${opts.frontendPort}`);
  } else {
    content += `\nFRONTEND_PORT=${opts.frontendPort}\n`;
  }
}
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts` | frontendPort 자동 선택 추가, generateEnv 호출에 frontendPort 전달 |
| `packages/cli/src/services/boilerplate-manager.ts` | `GenerateEnvOpts.frontendPort` 옵션 추가, FRONTEND_PORT 치환 로직 |

## 예방 방법

- 새로운 스택 템플릿 추가 시 `docker-compose.yml`에서 `${FRONTEND_PORT:-3000}:80` 패턴 사용 확인
- Unified 스택 여부(`isUnified = stackId.startsWith('nodejs-nextjs')`) 구분 필수
- 수동 복구: `.env` 파일에서 `FRONTEND_PORT=<free_port>` 직접 수정 후 `make up`

## 관련 참고

- 관련 커밋: `8686e95`
- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`, `packages/cli/src/services/boilerplate-manager.ts`
- 관련 이슈: `BACKEND_PORT` auto-selection은 이미 구현됨 — `FRONTEND_PORT`만 누락

---
