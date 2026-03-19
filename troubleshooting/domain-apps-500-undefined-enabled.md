# /api/domain/apps 500 — getActiveServiceRoutes undefined.enabled Troubleshooting

> 이 문서는 `/api/domain/apps` 호출 시 500 오류 관련 트러블슈팅 히스토리를 기록합니다.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | `001-fix-create-app-modal` |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

Admin UI Domain Settings 모달에서 도메인 연결 가능한 앱 목록을 불러오는 `GET /api/domain/apps` API가 HTTP 500을 반환하며 동작하지 않았다.
`getActiveServiceRoutes()` 함수에서 `state.servers.fileServer` 등이 `undefined`일 때 `.enabled` 접근 시 TypeError 발생.

## 에러 상세

```
{"success":false,"error":"TypeError: Cannot read properties of undefined (reading 'enabled')"}
```

## 근본 원인

`packages/cli/src/services/cloudflare-client.ts:544`의 `getActiveServiceRoutes()` 함수에서 여러 서버 설정 필드에 대한 optional chaining 미적용:

```typescript
// 버그 — fileServer가 undefined이면 TypeError
if (state.servers.fileServer.enabled) { ... }
if (state.servers.media.enabled && state.servers.media.services.includes('jellyfin')) { ... }
if (state.servers.dbServer.enabled && ...) { ... }
if (state.servers.fileBrowser.enabled) { ... }
```

Gitea 서버만 활성화된 최소 `selections.json` 환경에서는 `fileServer`, `media`, `dbServer`, `fileBrowser`가 모두 `undefined`여서 `.enabled` 접근 시 TypeError.

## 재현 조건

1. `selections.json`에 `servers.gitServer`만 설정 (fileServer/media/dbServer/fileBrowser 미설정)
2. Admin UI 또는 curl로 `GET /api/domain/apps` 호출
3. → HTTP 500

## 해결 방안

모든 `state.servers.*` 접근에 optional chaining `?.` 적용.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/cloudflare-client.ts:544-568` | `.enabled` → `?.enabled`, `.services.includes()` → `.services?.includes()` |

```typescript
// After (수정)
if (state.servers.fileServer?.enabled) { ... }
if (state.servers.media?.enabled && state.servers.media.services?.includes('jellyfin')) { ... }
if (state.servers.dbServer?.enabled && state.servers.dbServer.adminUI && ...) { ... }
if (state.servers.fileBrowser?.enabled) { ... }
```

## 예방 방법

- `WizardState.servers.*` 접근 시 반드시 optional chaining 사용
- 미니멀 `selections.json` (Gitea만 활성화) 환경에서 모든 API 엔드포인트 동작 확인 필수
- 새 서버 타입을 `getActiveServiceRoutes()`에 추가할 때 항상 `?.enabled` 패턴 사용

## 관련 참고

- 관련 파일: `packages/cli/src/services/cloudflare-client.ts`
- 관련 함수: `getActiveServiceRoutes()` (L537-572)
- 관련 핸들러: `handleDomainApps()` in `admin-server.ts:1703`

---
