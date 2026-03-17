# FileBrowser External URL Shows /static Instead of /files

## Symptom
Admin Dashboard의 FileBrowser 행에서 External URL이 `https://<tunnel>.trycloudflare.com/static`으로 표시됨.
정상은 `https://<tunnel>.trycloudflare.com/files`.

## Root Cause
`handleGetServices()`에서 컨테이너 Traefik 라벨 중 PathPrefix를 `Object.entries(labels).find()`로 검색.
FileBrowser 컨테이너에는 두 개의 라우터가 존재:

1. `traefik.http.routers.quicktunnel-filebrowser.rule` = `PathPrefix('/files')` (메인)
2. `traefik.http.routers.quicktunnel-filebrowser-static.rule` = `PathPrefix('/static')` (보조 - Vite 에셋용)

`find()`는 라벨 순회 순서에 따라 `-static` 라우터를 먼저 매칭할 수 있음.

## Fix
`primaryRouterKey = traefik.http.routers.quicktunnel-{serviceId}.rule`로 메인 라우터를 먼저 직접 조회.
없을 때만 generic `find()` fallback 사용.

```typescript
const primaryRouterKey = `traefik.http.routers.quicktunnel-${composeService}.rule`;
const routerRule =
  labels[primaryRouterKey] && String(labels[primaryRouterKey]).includes('PathPrefix')
    ? [primaryRouterKey, labels[primaryRouterKey]]
    : Object.entries(labels).find(
        ([k, v]) => k.includes('traefik.http.routers.') && k.endsWith('.rule') && String(v).includes('PathPrefix'),
      );
```

## Affected File
- `packages/cli/src/services/admin-server.ts` — `handleGetServices()`

## Diagnosis
```bash
# 컨테이너 라벨 확인
docker inspect --format '{{json .Config.Labels}}' \
  $(docker ps -q --filter "label=com.docker.compose.service=filebrowser") | python3 -m json.tool | grep traefik

# 정상 출력에는 두 라우터 모두 있어야 함:
# quicktunnel-filebrowser.rule = PathPrefix(`/files`)
# quicktunnel-filebrowser-static.rule = PathPrefix(`/static`)
```

## Commit
`8d4e984` (develop)
