# Cloudflare Zone 목록 로드 실패 — Admin Password 입력 후 빈 상태 유지

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-21 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | 006-domain-settings |
| **재발 여부** | 최초 발생 |

## 문제 요약

`CloudflareTunnelModal`의 ZoneStep에서 API 토큰을 저장한 후 zone 목록 로드를 시도하면 항상 빈 배열이 반환됐다. admin password를 `PasswordGate`에서 입력하고 Submit한 직후에도 동일하게 zone 목록이 나타나지 않았다.

## 에러 상세

```
// 브라우저 콘솔
GET /api/cloudflare/zones → 401 Unauthorized
// 또는 zone 목록 API 응답
{ "zones": [] }
```

## 근본 원인

`useCloudflareSetup` 훅에서 zone 목록을 불러오는 `loadZones()` 함수가 인증에 `apiFetch`를 통해 admin password를 전달하도록 설계되어 있었다. 그런데 admin password가 `PasswordGate` Submit → React 상태 업데이트 → 부모 컴포넌트 re-render 사이클을 거쳐야 했기 때문에, `loadZones()`가 호출되는 시점에 `apiFetch`에 아직 password가 반영되지 않은 상태였다.

즉, React의 비동기 상태 업데이트(setState → 다음 render cycle) 완료 전에 zone 로드가 트리거되어 실질적으로 **직전 render의 빈 password로 API가 호출**됐다.

```typescript
// 문제 코드 패턴
const handlePasswordSet = (pw: string) => {
  setAdminPassword(pw);        // ← setState (비동기, 다음 render에 반영)
  loadZones();                  // ← 이 시점에 apiFetch는 아직 pw 모름
};
```

## 재현 조건

1. `CloudflareTunnelModal` 열기
2. PasswordGate에서 admin password 입력 후 Submit
3. ZoneStep에서 "Load Zones" 또는 자동 로드 시도
4. zone 목록 빈 상태 또는 401 반환

## 해결 방안

zone 로드 호출 시 현재 password 값을 직접 인자로 전달하도록 수정. 상태 업데이트 사이클에 의존하지 않고, 방금 입력받은 password를 즉시 사용한다.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/admin-ui/src/features/domain/hooks/useCloudflareSetup.ts` | `loadZones(password)` 시그니처 추가 — 직접 전달된 password를 apiFetch에 사용 |

```typescript
// 수정 후
const handlePasswordSet = (pw: string) => {
  setAdminPassword(pw);
  loadZones(pw);   // ← 방금 받은 pw를 직접 전달
};
```

## 예방 방법

- React 상태 업데이트 후 즉시 해당 값을 사용하는 API 호출이 필요한 경우, 상태가 아닌 **로컬 변수**를 통해 값을 직접 전달할 것
- 특히 인증 토큰/패스워드처럼 "방금 입력받은 값"이 필요한 경우 setState를 신뢰하지 말 것

## 관련 참고

- 관련 파일: `packages/admin-ui/src/features/domain/hooks/useCloudflareSetup.ts`
- 관련 컴포넌트: `features/domain/components/ZoneStep.tsx`, `components/PasswordGate.tsx`

---
