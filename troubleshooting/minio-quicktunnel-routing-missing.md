# MinIO Quick Tunnel 라우팅 누락 + Named Tunnel 포트 오류 Troubleshooting

> Quick Tunnel 모드에서 MinIO가 외부 URL로 접근 불가하고, Named Tunnel 모드에서 MinIO Traefik 라우팅이 API 포트를 가리키는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Docker |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | MinIO 선택 시 매 설치마다 |

### 문제 요약

두 가지 독립적인 버그:

1. **Quick Tunnel 모드**: MinIO가 `QUICK_TUNNEL_PATH_MAP`에 정의되지 않아 Traefik path-prefix 라우팅 레이블 생성 누락 → 외부 URL(`/minio`) 접근 불가
2. **Named Tunnel 모드**: `traefikRouterLabels('minio', 'minio', 9000)`가 MinIO API 포트(9000)를 가리키어 콘솔 UI 대신 S3 API 엔드포인트로 라우팅됨

### 에러 상세

```
# Quick Tunnel 모드
https://xxx.trycloudflare.com/minio → 404 (Traefik에 라우터 없음)

# Named Tunnel 모드 - 브라우저에서 MinIO 대시보드 접근 시
Traefik → MinIO 9000 (S3 API) → JSON/XML 응답 (UI 아님)
MinIO Console은 9001 포트에서 서비스
```

### 근본 원인

**버그 1 (Quick Tunnel 라우팅 누락):**
`generateTraefikLabels()` 함수는 `QUICK_TUNNEL_PATH_MAP`에 정의된 서비스만 Traefik path-prefix 라우터 레이블을 생성함. MinIO 항목이 없어 `traefik.enable: false`로 처리되어 Traefik 라우팅 자체가 생성되지 않음.

**버그 2 (포트 오류):**
MinIO는 두 포트를 사용:
- `9000`: S3 API 엔드포인트 (programmatic access)
- `9001`: Console UI (웹 대시보드)

`services.ts`의 `traefikLabels`에서 9000을 지정해 웹 UI 대신 API 포트로 라우팅됨.

MinIO 콘솔은 `MINIO_BROWSER_REDIRECT_URL` 환경변수로 strip-prefix 없이 자체 경로 처리함 (`noStrip: true` 필요).

### 재현 조건

1. `brewnet init` 시 MinIO 선택
2. Quick Tunnel 모드: `https://xxx.trycloudflare.com/minio` 접근 → 404
3. Named Tunnel 모드: MinIO 대시보드 접근 → S3 API JSON 응답

### 해결 방안

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | `QUICK_TUNNEL_PATH_MAP`에 MinIO 항목 추가 (`noStrip: true`) |
| `packages/cli/src/config/services.ts` | `traefikRouterLabels` 포트 9000 → 9001 |

```typescript
// packages/cli/src/services/compose-generator.ts
const QUICK_TUNNEL_PATH_MAP: Record<string, { path: string; port: number; noStrip?: boolean }> = {
  // ... 기존 항목 ...
  minio: { path: '/minio', port: 9001, noStrip: true },  // ← 추가
};
```

```typescript
// packages/cli/src/config/services.ts
traefikLabels: traefikRouterLabels('minio', 'minio', 9001),  // ← 9000 → 9001
```

### 예방 방법

- 새 서비스 추가 시 반드시 `QUICK_TUNNEL_PATH_MAP`에 항목 추가 확인
- 웹 UI와 API 포트가 분리된 서비스(MinIO, Prometheus 등)는 포트 용도 명시적으로 주석 기재
- `noStrip` 필요 여부: 서비스가 자체적으로 경로 prefix를 인식하는 경우 `true`

### 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts`, `packages/cli/src/config/services.ts`
- MinIO Console 포트: 9001 (UI), 9000 (S3 API)
- MinIO env: `MINIO_BROWSER_REDIRECT_URL` — 콘솔 접근 URL 설정

---
