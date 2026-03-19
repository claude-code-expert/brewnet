# Gitea Autologin — Private Repo 404 (Cookie Path Mismatch)

## Symptom
Apps 페이지에서 Gitea 레포 링크 클릭 → 404 Not Found.
autologin 엔드포인트가 302 redirect + 쿠키 발급하지만, private repo 접근 불가.

## Root Cause
Gitea `ROOT_URL = http://localhost/git/` → 쿠키 `Path=/git`.
Admin 서버가 `Set-Cookie: i_like_gitea=...; Path=/; SameSite=Lax`로 덮어쓰면
브라우저는 `Path=/` 쿠키를 보내지만, Gitea는 `Path=/git` 쿠키만 인식.

## Fix
Gitea 로그인 응답의 Set-Cookie 헤더를 **원본 그대로** 브라우저에 전달.
`Path=/git`, `gitea_incredible` (remember), `_csrf`, `lang` 모두 포함.

```typescript
// 삭제(Max-Age=0) 쿠키 제외, 나머지 전부 전달
const forwardCookies = respCookies.filter(c => !c.includes('Max-Age=0') && !c.match(/=;\s/));
responseHeaders['Set-Cookie'] = forwardCookies;
```

## Diagnosis
```bash
# autologin 호출 후 쿠키 확인
curl -s -D - "http://localhost:8088/api/gitea/autologin?redirect=/git/admin/my-app"
# Path=/git 이 있어야 정상
```

## Affected Files
- `packages/cli/src/services/admin-server.ts`

## Commit
`6c1cd9e`
