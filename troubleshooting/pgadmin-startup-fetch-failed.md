# pgAdmin 기동 시 서비스 검증 fetch failed Troubleshooting

> 이 문서는 brewnet init 마법사의 서비스 검증 단계에서 pgAdmin이 fetch failed를 반환하는 오류 히스토리를 기록합니다.

---

# pgAdmin 서비스 검증 단계에서 fetch failed 반환

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-01 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Network / Docker / Runtime |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | `docker compose up` 후 pgAdmin 초기화 시 매번 발생 가능 |

## 문제 요약

`brewnet init` 마법사 완료 후 서비스 검증 단계에서 pgAdmin이 `fetch failed`(네트워크 레벨 오류)를 반환하며
실패 서비스로 보고되었다. curl로 직접 확인하면 200 OK가 정상 반환되므로 코드 오류가 아닌 타이밍 문제였다.
또한 `SCRIPT_NAME=/pgadmin` 설정으로 인해 구 헬스체크 경로(`/misc/ping`)가 HTTP 500을 반환하는 문제도 확인되었다.

## 에러 상세

```
1 service(s) did not respond.

Failed services:
  • pgAdmin — fetch failed

Tip: view logs with  docker compose logs -f
Per-service logs:    ls ~/.brewnet/*/logs/*.log
```

pgAdmin 컨테이너 로그에서 발견된 추가 경고:

```
[WARNING] Configuration problem: Request path '/misc/ping' does not start with SCRIPT_NAME '/pgadmin'
::ffff:128.199.73.36 - - "GET /misc/ping HTTP/1.1" 500 0
```

## 근본 원인

**원인 1: 기동 시간 초과 (주요 원인)**

`docker compose up -d` 완료 후 서비스 검증이 즉시 실행되는데, pgAdmin은 내부 DB 초기화와
gunicorn 워커 기동에 30초 이상 소요될 수 있다. 기존 retry 로직(3회 × 5초 = 최대 15초)으로는
초기화가 끝나기 전에 포트가 열리지 않아 ECONNREFUSED → `fetch failed`가 발생한다.

**원인 2: SCRIPT_NAME과 헬스체크 경로 불일치 (이전 커밋 회귀)**

커밋 `7b7bfeb`에서 Quick Tunnel 모드 지원을 위해 pgAdmin 컨테이너에 `SCRIPT_NAME=/pgadmin`을
추가했다. 이 설정 시 pgAdmin은 `/misc/ping` 경로 요청에 HTTP 500을 반환한다
(`Request path does not start with SCRIPT_NAME`). 커밋 `a081d51`에서 헬스체크 경로를
`/pgadmin/misc/ping`으로 수정하여 HTTP 레벨 오류는 해결되었으나,
타이밍 문제로 인한 `fetch failed`(ECONNREFUSED)는 여전히 남아 있었다.

### 경로별 응답 요약

| 경로 | SCRIPT_NAME 설정 시 응답 |
|------|--------------------------|
| `/misc/ping` | HTTP 500 (Body 없음) |
| `/pgadmin/misc/ping` | HTTP 200 `PING` |

## 재현 조건

1. brewnet init 마법사 실행 (Quick Tunnel 모드, PostgreSQL + pgAdmin 선택)
2. `docker compose up -d` 후 즉시 서비스 검증 실행
3. pgAdmin이 아직 gunicorn을 기동 중인 시점에 검증 도달

## 해결 방안

`ServiceUrlEntry` 인터페이스에 `startupDelay` 필드를 추가하고, pgAdmin 항목에
15초 대기를 설정하여 헬스체크 전에 충분한 기동 시간을 확보한다.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/utils/service-verifier.ts` | `ServiceUrlEntry`에 `startupDelay?: number` 필드 추가 |
| `packages/cli/src/utils/service-verifier.ts` | `verifyServiceAccess()`에 `startupDelay` 대기 로직 추가 |
| `packages/cli/src/utils/service-verifier.ts` | pgAdmin 항목에 `startupDelay: 15000` 설정 |

**변경 후 최대 대기 시간**: 15초(startupDelay) + 3회 × 5초(timeout) + 2 × 2초(retry interval) = **34초**

```typescript
// ServiceUrlEntry 인터페이스
/** Milliseconds to wait before the first health check attempt (for slow-starting services) */
startupDelay?: number;

// verifyServiceAccess 함수
if (entry.startupDelay) {
  await new Promise((r) => setTimeout(r, entry.startupDelay));
}

// pgAdmin 항목
entries.push({
  serviceId: 'pgadmin',
  localUrl: `http://localhost:${effectivePort(5050)}/pgadmin`,
  healthEndpoint: '/misc/ping',
  startupDelay: 15000,  // pgAdmin DB 초기화 대기
});
```

## 예방 방법

- Docker secrets(`PGADMIN_DEFAULT_PASSWORD_FILE`) 방식으로 비밀번호를 주입하는 경우
  첫 기동 시 초기화 시간이 더 길어질 수 있으므로 `startupDelay` 값을 넉넉하게 설정한다
- pgAdmin과 같이 WSGI 기반으로 `SCRIPT_NAME`을 사용하는 서비스는
  경로 변경 시 헬스체크 URL도 함께 검토한다

## 관련 참고

- 관련 커밋: `7b7bfeb` (SCRIPT_NAME 추가), `a081d51` (헬스체크 경로 수정)
- 관련 파일: `packages/cli/src/utils/service-verifier.ts`
- pgAdmin SCRIPT_NAME 문서: https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment.html

---
