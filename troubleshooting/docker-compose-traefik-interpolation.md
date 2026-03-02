# Docker Compose Traefik 레이블 인터폴레이션 오류 Troubleshooting

> Traefik 레이블의 정규식 캡처 그룹 참조 `${1}`을 Docker Compose가 환경변수로 오인하여 전체 스택 시작이 실패한 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

### 문제 요약

`brewnet init` Step 7/8 "Generate & Start"에서 Docker 이미지 pull 실패 에러 발생. Traefik 레이블에 사용된 `${1}/dashboard/`를 Docker Compose가 환경변수 인터폴레이션으로 처리하면서 파싱에 실패했고, 이로 인해 모든 서비스(cloudflared 포함)가 미실행 상태가 되어 터널링도 동작하지 않았다.

### 에러 상세

```
✖  Failed to pull Docker images
   invalid interpolation format for services.traefik.labels.traefik.http.middlewares.dashboard-slash-redirect.redirectregex.replacement.
   You may need to escape any $ with another $.
   ${1}/dashboard/
```

### 근본 원인

`compose-generator.ts`의 Traefik redirectregex 미들웨어 설정에서 정규식 캡처 그룹 참조인 `${1}`을 그대로 문자열로 사용.
Docker Compose는 YAML 값 내의 `${...}` 패턴을 환경변수 보간으로 처리하기 때문에 `${1}`을 환경변수명 `1`로 해석하려다 실패.

- **영향 범위**: Docker Compose 파일 파싱 자체가 실패하므로 `docker compose pull` 및 `docker compose up` 모두 불가
- **부수 효과**: cloudflared 미실행 → Quick Tunnel URL 미발급 → Access URLs 테이블의 External 열 전부 `—` 표시

### 재현 조건

1. `compose-generator.ts`에서 `redirectregex.replacement` 값에 `${1}`을 포함하여 compose 파일 생성
2. `docker compose pull` 또는 `docker compose up` 실행

### 해결 방안

Docker Compose에서 `$$`는 리터럴 `$`로 처리됨. `${1}` → `$${1}`으로 이스케이프.
`${TRAEFIK_DASHBOARD_AUTH}`는 `.env`에서 실제로 보간되어야 하는 변수이므로 수정하지 않음.

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | `'${1}/dashboard/'` → `'$${1}/dashboard/'` |

#### 변경 전/후

```typescript
// Before
'traefik.http.middlewares.dashboard-slash-redirect.redirectregex.replacement': '${1}/dashboard/',

// After
'traefik.http.middlewares.dashboard-slash-redirect.redirectregex.replacement': '$${1}/dashboard/',
```

### 예방 방법

- Docker Compose YAML에 Traefik 레이블 등 정규식 캡처 그룹(`${N}`) 사용 시 반드시 `$$` 이스케이프
- 환경변수 보간이 의도된 값(`${VAR_NAME}`)과 리터럴 달러 기호가 필요한 값을 혼동하지 않도록 주석으로 구분

### 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts:624`
- Docker Compose 공식 문서: 환경변수 보간 시 `$$`로 이스케이프

---
