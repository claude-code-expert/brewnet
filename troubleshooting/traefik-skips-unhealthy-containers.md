# Traefik이 unhealthy 컨테이너를 완전히 무시함

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-14 |
| **상태** | 🔄 부분 해결 (python-django 라이브 인스턴스만 수정, 전체 스택 미검증) |
| **에러 타입** | Docker / Configuration |
| **브랜치** | develop |
| **재발 여부** | 최초 발생 |

## 문제 요약

`python-django` 보일러플레이트 컨테이너가 `traefik.enable=true` 레이블과 올바른 `brewnet` 네트워크를 갖추고 있음에도 Traefik 라우터 목록에 전혀 등록되지 않아 외부 URL로 접근 시 landing 페이지만 반환됨.

## 에러 상세

```
# Traefik API 라우터 목록 (python-django 항목 없음)
GET http://localhost:8080/api/http/routers
→ ["brewnet-landing@docker", "quicktunnel-gitea@docker", ...] (10개, django 없음)

# 컨테이너 헬스 상태
docker inspect python-django-backend-1 --format '{{.State.Health.Status}}'
→ starting (→ unhealthy)

# 헬스체크 실패 로그
OCI runtime exec failed: exec failed: unable to start container process:
exec: "wget": executable file not found in $PATH
```

## 근본 원인

`boilerplate-manager.ts`의 `writeTraefikOverride()` 함수가 모든 스택에 `wget` 기반 헬스체크를 `docker-compose.override.yml`에 주입했음. Python/Django 컨테이너에는 `wget`이 없어 헬스체크가 즉시 실패 → 컨테이너가 `unhealthy` 상태 → **Traefik v2는 `unhealthy` 또는 `starting` 상태 컨테이너의 라우터를 아예 등록하지 않음** (rawdata API에서도 완전히 부재).

```yaml
# 잘못된 override (모든 스택에 wget 헬스체크 강제 적용)
healthcheck:
  test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
```

## 재현 조건

- `writeTraefikOverride()` 호출 시 non-Next.js 스택
- 대상 컨테이너에 `wget` 미설치 (Python, Java, Rust 기반 이미지)
- Docker 헬스체크가 정의된 상태

## 해결 방법

`writeTraefikOverride()`에서 헬스체크 override를 Next.js 스택에만 적용 (basePath URL 변경이 필요한 경우). 나머지 스택은 원래 `docker-compose.yml`의 헬스체크를 그대로 사용.

```typescript
// packages/cli/src/services/boilerplate-manager.ts
const healthcheckLines = isNextjs
  ? [
      '    healthcheck:',
      `      test: ["CMD", "wget", "-q", "-O", "/dev/null", "${healthUrl}"]`,
      '      interval: 10s',
      // ...
    ]
  : []; // non-Next.js: 원래 스택의 healthcheck 사용

const lines = [
  // ...
  ...healthcheckLines,  // Next.js만 삽입
  '    labels:',
  ...backendLabels,
];
```

## 추가 발견: Alpine Linux localhost IPv6 문제

프론트엔드 `Dockerfile`의 `HEALTHCHECK`에서 `http://localhost:80` 사용 시 동일하게 `unhealthy` 발생. Alpine에서 `localhost`는 `::1` (IPv6)로 해석되지만 nginx는 IPv4만 리슨.

**해결**: `patchDockerfileHealthcheck()` 함수 추가 — 모든 Dockerfile의 HEALTHCHECK 라인에서 `localhost` → `127.0.0.1` 자동 교체.

```typescript
// packages/cli/src/services/boilerplate-manager.ts
export function patchDockerfileHealthcheck(projectDir: string, stackId: string): void {
  if (stackId.startsWith('nodejs-nextjs')) return;
  // backend/Dockerfile, frontend/Dockerfile 모두 패치
  dockerfile.replace(/http:\/\/localhost:/g, 'http://127.0.0.1:');
}
```

## 미해결 사항

- `python-django` 외 Java, Rust, Go 등 wget 미포함 스택에서 동일 문제 재현 가능성 미검증
- `create-app` 커맨드로 신규 생성 시 `patchDockerfileHealthcheck` 실제 동작 검증 필요
- 각 스택 boilerplate의 `HEALTHCHECK` 커맨드 종류 점검 필요 (wget/curl/없음)

## 핵심 교훈

> **Traefik v2는 Docker healthcheck가 정의된 컨테이너가 `unhealthy`이면 해당 컨테이너의 라우터를 전혀 등록하지 않는다.** `/api/rawdata`에서도 완전히 부재. 라우터가 보이지 않을 때 가장 먼저 컨테이너 헬스 상태를 확인할 것.

## 수정된 파일

- `packages/cli/src/services/boilerplate-manager.ts` — `writeTraefikOverride()`, `patchDockerfileHealthcheck()` 신규
- `packages/cli/src/wizard/steps/generate.ts` — `patchDockerfileHealthcheck()` 호출 추가
- `~/brewnet/my-homeserver/python-django/docker-compose.override.yml` — wget healthcheck 제거
- `~/brewnet/my-homeserver/python-django/frontend/Dockerfile` — `localhost` → `127.0.0.1`
