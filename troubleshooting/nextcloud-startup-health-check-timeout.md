# Nextcloud 기동 시 헬스체크 타임아웃 Troubleshooting

> Nextcloud가 첫 실행 시 DB 초기화로 인해 기동이 느려 서비스 검증 헬스체크가 항상 실패하는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Network / Docker / Runtime |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | 매 신규 설치 시 |

### 문제 요약

`brewnet init` Step 7 완료 후 "Failed services: Nextcloud — fetch failed" 표시. Nextcloud는 첫 실행 시 내부 DB 초기화 및 마이그레이션을 수행하는데 최소 30초 이상 소요되며, 기존 헬스체크는 대기 없이 바로 실행되어 항상 타임아웃 실패 처리됨.

### 에러 상세

```
Failed services:
  • Nextcloud — fetch failed

Tip: view logs with  docker compose logs -f
```

### 근본 원인

`service-verifier.ts`의 `buildServiceUrlMap`에서 Nextcloud 엔트리에 `startupDelay`가 없었음.
`verifyServiceAccess`의 기본 설정은 `timeout: 5000`, `retries: 2`로 총 대기 시간이 ~19초에 불과.
Nextcloud 첫 실행 초기화는 30~120초가 소요되어 모든 재시도가 타임아웃으로 실패.

비교: pgAdmin은 이미 `startupDelay: 15000`이 설정되어 있었으나 Nextcloud에는 누락됨.

실제 서비스 동작은 정상이며 단순히 헬스체크 타이밍 문제임 — 실패 표시 후 몇 분 뒤에는 접속 가능.

### 재현 조건

1. Nextcloud가 포함된 신규 `brewnet init` 실행
2. Step 7 서비스 검증 단계에서 Nextcloud 헬스체크 실행됨
3. `/status.php` 엔드포인트 응답 전 타임아웃 발생

### 해결 방안

`buildServiceUrlMap`의 Nextcloud 엔트리에 `startupDelay: 30000` 추가.
`Promise.all`로 병렬 실행되므로 다른 서비스 검증에는 영향 없음.
30초 대기 후 3회(5초 타임아웃, 2초 간격) 시도 → 총 최대 49초 대기.

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/utils/service-verifier.ts` | Nextcloud 엔트리에 `startupDelay: 30000` 추가 |

```typescript
// After
entries.push({
  serviceId: 'nextcloud',
  label: 'Nextcloud',
  localUrl: `http://localhost:${effectivePort(8443)}`,
  externalUrl: extUrl('/cloud', 'cloud'),
  healthEndpoint: '/status.php',
  startupDelay: 30000,   // ← 추가
});
```

### 예방 방법

- 신규 서비스 추가 시 공식 문서에서 초기화 시간을 확인하고 `startupDelay` 설정
- 느린 서비스 기준: Nextcloud(30s+), pgAdmin(15s+), Gitea(10s+)
- 헬스체크 실패 시 실제 서비스 로그 먼저 확인: `docker compose logs -f <service>`

### 관련 참고

- 관련 파일: `packages/cli/src/utils/service-verifier.ts`
- Nextcloud 첫 실행 초기화 소요 시간: 시스템 사양에 따라 30~120초

---
