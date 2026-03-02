# pgAdmin SCRIPT_NAME Bad Request 오류 Troubleshooting

> pgAdmin이 `SCRIPT_NAME=/pgadmin`으로 설정된 상태에서 루트 경로(`/`)로 접근 시 Bad Request 반환, 그리고 어드민 대시보드에 잘못된 URL이 표시되는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

### 문제 요약

두 가지 문제가 동시에 발생:
1. `http://localhost:5050/`으로 접근 시 Bad Request 반환 — `SCRIPT_NAME=/pgadmin`이 설정된 상태에서 `/pgadmin` prefix 없이 접근하면 pgAdmin WSGI 앱이 거부함
2. 어드민 대시보드(`TRAEFIK_PATH_SERVICES`)에 pgAdmin URL이 `http://localhost:5050`으로 표시되어 클릭 시 Bad Request 발생

### 에러 상세

```
Bad Request

Configuration problem: Request path '/' does not start with SCRIPT_NAME '/pgadmin'
```

### 근본 원인

**원인 1 — URL 접근 경로 오류**
Quick Tunnel 모드에서 pgAdmin은 `SCRIPT_NAME=/pgadmin` 환경변수로 실행됨 (`getPgadminEnv`).
이 설정은 pgAdmin WSGI 앱이 `/pgadmin` prefix를 포함한 경로만 처리하도록 함.
`localhost:5050/`으로 직접 접근 시 WSGI 앱이 경로를 매칭하지 못해 Bad Request 반환.

**원인 2 — 어드민 대시보드 URL 미설정**
`admin-server.ts`의 `TRAEFIK_PATH_SERVICES`에 pgAdmin 항목이 없어 기본값인 `http://localhost:${port}` (= `http://localhost:5050`) 표시.

### 재현 조건

1. Quick Tunnel 모드로 `brewnet init` 완료
2. 어드민 대시보드에서 pgAdmin URL 클릭 → `http://localhost:5050/` 이동 → Bad Request

### 해결 방안

- 올바른 접근 URL: `http://localhost:5050/pgadmin`
- `TRAEFIK_PATH_SERVICES`에 `pgadmin: 'http://localhost:5050/pgadmin'` 추가
- `status-page.ts` `collectStatusData`의 pgAdmin localUrl 수정
- Traefik 경유 로컬 접근: `http://localhost/pgadmin` (Quick Tunnel 모드)

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/admin-server.ts` | `TRAEFIK_PATH_SERVICES`에 `pgadmin: 'http://localhost:5050/pgadmin'` 추가 |
| `packages/cli/src/services/status-page.ts` | `collectStatusData` pgAdmin `localUrl` → `http://localhost:${remap(5050)}/pgadmin` |

```typescript
// admin-server.ts
const TRAEFIK_PATH_SERVICES: Record<string, string> = {
  nextcloud: 'http://localhost/cloud',
  pgadmin: 'http://localhost:5050/pgadmin',  // ← 추가
};
```

### 예방 방법

- WSGI 앱(`SCRIPT_NAME` 사용)은 항상 path prefix 포함한 URL로 접근
- `TRAEFIK_PATH_SERVICES`는 직접 포트 접근 시 경로 보정이 필요한 서비스를 등록하는 용도 — 신규 서비스 추가 시 확인 필요
- 서비스 URL 표시 위치가 여러 곳(`service-verifier.ts`, `status-page.ts`, `admin-server.ts`)임을 인지하고 일관성 유지

### 관련 참고

- 관련 파일: `packages/cli/src/services/admin-server.ts`, `packages/cli/src/services/status-page.ts`, `packages/cli/src/utils/service-verifier.ts`
- pgAdmin 공식 문서: https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment.html

---
