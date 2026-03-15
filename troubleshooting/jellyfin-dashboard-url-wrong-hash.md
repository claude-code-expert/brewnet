# Jellyfin 대시보드 URL이 #/home으로 잘못 표시 Troubleshooting

> admin-server.ts의 Jellyfin URL이 `#/home`으로 하드코딩되어, 초기 설정 전 사용자가 잘못된 페이지로 연결됨.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 재발 (여러 세션에 걸쳐 반복) |
| **재발 주기** | 코드 수정 시 `#/home`으로 복귀됨 |

## 문제 요약

brewnet admin 대시보드에서 Jellyfin 링크가 `http://localhost:8096/jellyfin/web/#/home`으로 표시됨.
Jellyfin 최초 설치 후 `#/home`은 로그인 없이 접근 불가 또는 "Server Mismatch" 오류를 유발하므로,
초기 셋업 페이지인 `#/wizard/start`로 안내해야 한다.

## 에러 상세

```
Jellyfin 대시보드 클릭 시 → http://localhost:8096/jellyfin/web/#/home
실제 필요한 URL → http://localhost:8096/jellyfin/web/#/wizard/start
```

## 근본 원인

`packages/cli/src/services/admin-server.ts`의 `runtimeUrlMap`에서 Jellyfin URL을 `#/home`으로 하드코딩.
수정 지시가 반복됐음에도 매 세션마다 `#/home`이 그대로 남아 있었음.

## 재현 조건

1. brewnet init 완료 후 admin 대시보드 접속
2. Jellyfin 서비스 카드 클릭
3. `#/home`으로 리다이렉트되며 Server Mismatch 또는 로그인 요구 화면 표시

## 해결 방안

`admin-server.ts`의 Jellyfin URL 해시를 `#/wizard/start`로 변경.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/admin-server.ts` L575–577 | `#/home` → `#/wizard/start` |

**변경 전:**
```typescript
jellyfin: isQuickTunnel
  ? 'http://localhost:8096/jellyfin/web/#/home'
  : 'http://localhost:8096/web/#/home',
```

**변경 후:**
```typescript
jellyfin: isQuickTunnel
  ? 'http://localhost:8096/jellyfin/web/#/wizard/start'
  : 'http://localhost:8096/web/#/wizard/start',
```

## 예방 방법

- **절대 `#/home`으로 복귀하지 말 것** — Jellyfin URL은 항상 `#/wizard/start`
- 이 URL은 초기 셋업 안내용이므로 로그인 이후에도 무해함 (이미 설정된 경우 홈으로 자동 리다이렉트)

## 관련 참고

- 관련 파일: `packages/cli/src/services/admin-server.ts` L575–577
- 관련 이슈: `service-verifier.ts` L367 주석 — "Server Mismatch" 설명

---
