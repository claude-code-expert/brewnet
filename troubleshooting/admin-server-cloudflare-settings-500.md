# Admin Server Cloudflare Settings 500 Error Troubleshooting

> `/api/settings/cloudflare` GET 요청 시 500 Internal Server Error 반환

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

Domain Setting 모달 오픈 시 "Failed to load: 500" 메시지 표시. `/api/settings/cloudflare`가 500을 반환하여 Cloudflare 설정 값을 로드 불가.

## 에러 상세

```
GET http://localhost:8088/api/settings/cloudflare HTTP 500
{"success":false,"error":"Internal server error"}
```

브라우저 콘솔:
```
[ERROR] Failed to load resource: the server responded with a status of 500
@ http://localhost:8088/api/settings/cloudflare
```

## 근본 원인

`admin-server.ts`의 `handleSettingsCloudflareGet` 함수에서 `mask()` 헬퍼가 `string` 타입을 기대하지만, `selections.json`에서 cloudflare 관련 필드(`accountId`, `zoneId`, `tunnelId`)가 없는 경우 `undefined`가 전달되어 TypeError 발생:

```typescript
// 버그 있는 코드
const mask = (s: string) => s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : s ? '***set***' : 'not set';
//                           ^^^^^^^^ s가 undefined이면 TypeError

json(res, 200, {
  accountId: mask(cf.accountId),  // cf.accountId가 undefined일 때 크래시
  ...
});
```

`CloudflareConfig` 타입에는 `accountId: string`이 required로 정의되어 있지만, 직접 작성한 `selections.json`이나 incomplete wizard state에서 해당 필드가 누락될 수 있음.

## 재현 조건

1. `~/.brewnet/projects/<name>/selections.json`에 cloudflare 섹션에 `apiToken`, `accountId`, `zoneId` 등이 없는 경우
2. `/api/settings/cloudflare` GET 호출
3. → `mask(undefined)` → TypeError → 500

## 해결 방안

`mask()` 함수가 `undefined`를 안전하게 처리하도록 수정:

```typescript
// 수정 전
const mask = (s: string) => s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : s ? '***set***' : 'not set';

// 수정 후
const mask = (s: string | undefined) => !s ? 'not set' : s.length > 6 ? s.slice(0, 3) + '***' + s.slice(-3) : '***set***';
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/admin-server.ts:1844` | `mask()` 함수 파라미터를 `string | undefined`로 변경, undefined guard 추가 |

## 예방 방법

- `WizardState` 기반 핸들러는 모든 중첩 필드를 optional로 처리할 것
- `mask()` 같은 포맷팅 헬퍼는 항상 falsy 입력을 처리하도록 작성
- `selections.json` 생성 시 `createDefaultWizardState()`를 사용하거나 모든 required 필드 포함 확인

## 관련 참고

- 관련 파일: `packages/cli/src/services/admin-server.ts`
- 관련 함수: `handleSettingsCloudflareGet()`
- UI 영향: DomainSettingModal 초기 로드 시 "Failed to load: 500" 표시

---
