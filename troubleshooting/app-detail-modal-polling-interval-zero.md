# AppDetailModal Polling Interval Zero Troubleshooting

> AppDetailModal에서 git/settings API를 interval 0으로 폴링하여 ERR_INSUFFICIENT_RESOURCES 발생

---

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | 001-fix-create-app-modal |
| **재발 여부** | 최초 발생 |

## 문제 요약

앱 상세 모달(AppDetailModal)을 열면 브라우저 콘솔에 수백~수천 개의 `ERR_INSUFFICIENT_RESOURCES` 에러가 즉각 발생. `/api/apps/:name/git`과 `/api/apps/:name/deploy/settings`에 대한 fetch가 무한 루프처럼 반복 요청됨.

## 에러 상세

```
[ERROR] Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES
@ http://localhost:8088/api/apps/test-express/git
[ERROR] Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES
@ http://localhost:8088/api/apps/test-express/deploy/settings
```
(196개 이상 반복)

## 근본 원인

`AppDetailModal.tsx`에서 `usePolling` 훅을 interval `0`으로 호출:

```typescript
// packages/admin-ui/src/components/AppDetailModal.tsx
usePolling(`/api/apps/${appName}/git`, 0, silentFetch, ...);
usePolling(`/api/apps/${appName}/deploy/settings`, 0, silentFetch, ...);
```

`usePolling` 내부 구현:
```typescript
const id = setInterval(poll, intervalMs);  // setInterval(fn, 0)
```

`setInterval(fn, 0)`은 브라우저 최소 타이머 간격(~4ms)으로 실행됨. 초당 250회 이상 fetch 요청이 발생하여 브라우저 네트워크 자원 고갈 → `ERR_INSUFFICIENT_RESOURCES`.

## 재현 조건

1. 앱이 1개 이상 등록된 상태에서 앱 이름 클릭
2. AppDetailModal 오픈
3. 브라우저 콘솔에서 즉각 수백 개 에러 확인

## 해결 방안

git과 deploy/settings 데이터는 자주 변경되지 않는 정적 정보이므로 30초 간격으로 폴링:

```typescript
// 이전 (버그)
usePolling(`/api/apps/${appName}/git`, 0, silentFetch, ...);
usePolling(`/api/apps/${appName}/deploy/settings`, 0, silentFetch, ...);

// 수정 후
usePolling(`/api/apps/${appName}/git`, 30000, silentFetch, ...);
usePolling(`/api/apps/${appName}/deploy/settings`, 30000, silentFetch, ...);
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/admin-ui/src/components/AppDetailModal.tsx:57` | git polling interval `0` → `30000` |
| `packages/admin-ui/src/components/AppDetailModal.tsx:63` | settings polling interval `0` → `30000` |

## 예방 방법

- `usePolling`에 `interval === 0` guard 추가 고려: 0이면 한 번만 fetch하고 재요청 없도록
- 초기 fetch가 필요한 경우 `useEffect`로 직접 구현하거나 `interval`을 명시적으로 0이 아닌 값 사용

## 관련 참고

- 관련 파일: `packages/admin-ui/src/hooks/usePolling.ts`, `packages/admin-ui/src/components/AppDetailModal.tsx`
- 앱 상태(status/port/lastDeployedAt)는 5000ms 폴링 유지 — 올바른 설정

---
