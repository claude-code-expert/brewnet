# Jellyfin BaseUrl 설정 시 헬스체크 경로 불일치 + 서비스 검증 ⚠ warn Troubleshooting

> Quick Tunnel 모드에서 Jellyfin BaseUrl=/jellyfin 설정 시 `/health` 엔드포인트가 302 리다이렉트되어 서비스 검증이 ⚠ warn을 반환하는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Network |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | Quick Tunnel 모드 + Jellyfin 선택 시 |

### 문제 요약

Quick Tunnel 모드에서 Jellyfin `BaseUrl=/jellyfin` 설정 후 서비스 검증 시 상태가 ✅ healthy가 아닌 ⚠ warn으로 표시됨. Jellyfin은 실제로 정상 동작하지만 검증기가 잘못된 경로를 헬스체크하기 때문. 또한 로컬에서 `http://localhost:8096`로 접근 시 Server Mismatch 화면 표시.

### 에러 상세

```
# 서비스 검증 출력
Service         Status   Port    URL
Jellyfin        ⚠ warn   8096    http://localhost:8096

# 실제 HTTP 응답
GET http://localhost:8096/health → 302 Found → Location: /jellyfin/health
GET http://localhost:8096/jellyfin/health → 200 OK

# 브라우저 (localhost:8096 접근 시)
"Server Mismatch: The server you are connecting to is not the same server
that you previously connected to."
```

### 근본 원인

**헬스체크 경로 불일치:**
Jellyfin은 `network.xml`에 `<BaseUrl>/jellyfin</BaseUrl>` 설정 시 모든 경로에 prefix 강제 적용.
- `GET /health` → 302 → `/jellyfin/health`
- 서비스 검증기가 `healthEndpoint: '/health'`를 `http://localhost:8096/health`로 체크 → 302 수신 → warn 판정

**Server Mismatch:**
브라우저 localStorage에 이전 서버 URL이 저장되어 있을 때, 새 URL로 접근하면 발생하는 Jellyfin 클라이언트 측 보호 기능. 코드 버그 아님.

### 재현 조건

1. Quick Tunnel 모드 `brewnet init` 완료 (Jellyfin 포함)
2. Jellyfin entrypoint에서 `network.xml` `<BaseUrl>/jellyfin</BaseUrl>` 설정됨
3. `brewnet status` 실행 → Jellyfin ⚠ warn
4. `localhost:8096` 브라우저 접근 → Server Mismatch (이전 localStorage 존재 시)

### 해결 방안

**헬스체크 경로 수정:**
Quick Tunnel 모드에서 Jellyfin localUrl에 `/jellyfin` prefix 추가하여 검증기가 올바른 경로 체크.

**Server Mismatch 해결:**
- "Connect Anyway" 버튼 클릭 후 새 서버 URL로 재설정
- 또는 브라우저 사이트 데이터(localStorage) 삭제 후 재접속
- 올바른 로컬 URL: `http://localhost:8096/jellyfin/web/`

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/utils/service-verifier.ts` | Quick Tunnel 모드에서 Jellyfin localUrl에 `/jellyfin` prefix 추가 |

```typescript
// packages/cli/src/utils/service-verifier.ts
// buildServiceUrls()
const jellyfinBase = isQuickTunnel ? '/jellyfin' : '';
entries.push({
  serviceId: 'jellyfin',
  label: 'Jellyfin',
  localUrl: `http://localhost:${effectivePort(8096)}${jellyfinBase}`,
  externalUrl: extUrl('/jellyfin', 'media'),
  healthEndpoint: '/health',
});

// buildServiceAccessGuide()
const jellyfinLocalUrl = isQuickTunnelAccess
  ? `http://localhost:${remap(8096)}/jellyfin`
  : `http://localhost:${remap(8096)}`;
```

### 예방 방법

- `BaseUrl`/경로 prefix 설정이 있는 서비스는 헬스체크 경로도 함께 prefix 적용 필요
- Quick Tunnel 모드와 Local 모드의 서비스 URL 차이 반드시 검증기에 반영
- Jellyfin 로컬 접근: `localhost:8096/jellyfin/web/` (Quick Tunnel 모드)
- Jellyfin 로컬 접근: `localhost:8096` (Local 모드)

### 관련 참고

- 관련 파일: `packages/cli/src/utils/service-verifier.ts`
- Jellyfin network.xml: `/config/config/network.xml` 내 `<BaseUrl>` 설정
- Server Mismatch는 사용자 브라우저 localStorage 이슈로 코드 수정 불필요

---
