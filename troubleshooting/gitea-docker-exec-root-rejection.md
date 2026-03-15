# Gitea Docker Exec Root Rejection Troubleshooting

> `docker exec brewnet-gitea gitea admin user create` 실행 시 Gitea가 root 실행을 거부하여 admin 계정이 생성되지 않는 문제

---

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-04 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | 001-create-app |
| **재발 여부** | 최초 발생 |

## 문제 요약

`brewnet init` 완료 후 Gitea 웹 UI에서 로그인 시 "사용자 이름 또는 암호가 올바르지 않습니다" 에러가 발생했다. admin 계정 생성 단계가 내부적으로 실패했지만 wizard가 이를 조용히 삼켜버려 사용자에게 노출되지 않았다.

## 에러 상세

```
docker exec brewnet-gitea gitea admin user list
→ 2026/03/03 16:16:35 modules/setting/setting.go:179:loadRunModeFrom() [F] Gitea is not supposed to be run as root.
```

## 근본 원인

`generate.ts`에서 `docker exec brewnet-gitea gitea admin user create ...` 를 호출할 때 `-u git` 플래그가 없었다. Docker exec는 기본적으로 root(uid=0)로 실행되는데, Gitea 바이너리는 보안상 root 실행을 명시적으로 거부한다. Gitea 컨테이너는 `USER_UID=1000`으로 `git` 사용자를 사용한다.

`.catch()` 핸들러가 "user already exists" 메시지만 성공으로 처리하고 나머지 에러는 `{ exitCode: 1 }` 반환에 그쳐, spinner가 실패를 표시하지만 wizard는 계속 진행했다.

## 재현 조건

1. `GITEA__security__INSTALL_LOCK=true` 설정으로 Gitea 컨테이너 실행
2. `docker exec brewnet-gitea gitea admin user list` 실행 (root로)
3. → "not supposed to be run as root" 에러 발생

## 해결 방안

`docker exec` 에 `-u git` 플래그 추가:

```typescript
// Before (broken)
await execaFn('docker', [
  'exec', 'brewnet-gitea',
  'gitea', 'admin', 'user', 'create', ...
]);

// After (fixed)
await execaFn('docker', [
  'exec', '-u', 'git', 'brewnet-gitea',
  'gitea', 'admin', 'user', 'create', ...
]);
```

수동 복구 (이미 실행 중인 컨테이너):
```bash
docker exec -u git brewnet-gitea gitea admin user create \
  --username admin --password <password> \
  --email admin@brewnet.local \
  --admin --must-change-password false
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts` | L1115: `'exec', 'brewnet-gitea'` → `'exec', '-u', 'git', 'brewnet-gitea'` |
| `packages/cli/src/wizard/steps/generate.ts` | L1135: 수동 복구 힌트 메시지에도 `-u git` 추가 |

## 예방 방법

- Gitea 컨테이너 내부에서 실행할 모든 `docker exec` 명령에 `-u git` 필수
- `gitea admin user list`, `gitea admin user change-password` 등 모든 관리 명령 동일하게 적용
- `execa` 배열 인자 방식은 셸 없이 실행되므로 특수문자 이슈 없음

## 관련 참고

- 관련 커밋: `8686e95`
- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`
- Gitea 공식 문서: `GITEA__security__INSTALL_LOCK=true` 설정 시 웹 설치 마법사 비활성화

---
