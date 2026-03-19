# Gitea createRepo 500 — "repository files already exist"

## Symptom
New App 생성 시 Gitea repo 단계에서 500 에러:
`Gitea createRepo failed: 500 {"message":"repository files already exist [uname: admin, name: my-app]"}`

## Root Cause
`brewnet uninstall`이 Gitea DB 레코드를 삭제하지만, Docker volume의 bare git 파일은 남김.
`repoExists()` API 체크는 통과(DB에 없음) → `createRepo()`에서 디스크 파일 충돌로 500.

## Fix
`createRepo()`에서 500 + "files already exist" 감지 시:
1. `deleteRepo()`로 orphan 파일 정리
2. `createRepo()` 재시도

```typescript
if (res.status === 500 && body.includes('files already exist')) {
  await this.deleteRepo(name).catch(() => {});
  // retry createRepo...
}
```

## Affected Files
- `packages/cli/src/services/gitea-client.ts`

## Commit
`5116f57`
