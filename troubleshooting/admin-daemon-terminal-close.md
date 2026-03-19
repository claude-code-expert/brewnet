# Admin Server Dies When Terminal Closes

## Symptom
`brewnet admin` 실행 후 터미널 창을 닫으면 admin 서버 프로세스가 종료됨.
`brewnet init` 완료 후에도 CLI 프로세스 종료와 함께 admin 서버가 죽음.

## Root Cause
1. **SIGHUP**: 터미널 닫으면 OS가 SIGHUP을 프로세스에 전송 → Node.js 기본 동작은 종료
2. **stdout/stderr 파이프 끊김**: 터미널 PTY 파괴 시 `console.log()` 등에서 에러 발생 가능
3. **Commander.js 종료**: `init` 완료 후 action 함수 반환 → Commander가 프로세스 종료

## Fix
Admin 서버를 **detached child process (daemon)**으로 분리:
- `admin-daemon.ts`: 독립 실행 엔트리포인트
- `admin-launcher.ts`: `spawn()` with `detached: true`, stdio → 로그 파일
- CLI는 daemon 시작 확인 후 즉시 종료

```
brewnet admin       → daemon spawn → CLI 종료 (0.5초)
brewnet admin --foreground  → 기존 방식 (디버그용)
brewnet shutdown    → daemon 종료
```

## Affected Files
- `packages/cli/src/services/admin-daemon.ts` (new)
- `packages/cli/src/services/admin-launcher.ts` (new)
- `packages/cli/src/commands/admin.ts`
- `packages/cli/src/commands/shutdown.ts` (new)
- `packages/cli/src/wizard/steps/complete.ts`

## Commits
`5cd7702`, `bf9e51e`, `d8c5913`
