# FileBrowser 로그인 후 404 (settings.json BaseURL 우선순위) Troubleshooting

> Quick Tunnel 모드에서 FileBrowser 로그인 페이지는 정상이지만 계정/비밀번호 입력 후 404가 반환되는 문제. `/config/settings.json`이 DB 설정과 FB_BASEURL 환경변수보다 높은 우선순위를 가지는 것이 원인.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | FileBrowser 신규 설치 시 (named volume 없는 경우) |

### 문제 요약

`FB_BASEURL=/files` 환경변수와 DB 레벨 `config set --baseurl /files` 설정 모두 적용했음에도 외부 접근(`https://xxx.trycloudflare.com/files`)에서 로그인 후 404 반환. 로컬(`localhost:8085`)은 정상.

### 에러 상세

```
# 외부 접근 플로우
GET  https://xxx.trycloudflare.com/files/login  → 200 OK (로그인 폼 표시)
POST https://xxx.trycloudflare.com/files/api/login  → 200 OK (JWT 발급)
GET  https://xxx.trycloudflare.com/login?redirect=/  → 404 (Traefik 랜딩 페이지)

# HTML 내 window.FileBrowser 객체 (원인)
<script>
  window.FileBrowser = {
    "BaseURL": "",    ← "" 임에도 불구하고 FB_BASEURL=/files 설정되어 있음
    "StaticURL": "/static",
    ...
  }
</script>

# 예상값
window.FileBrowser = { "BaseURL": "/files", ... }
```

### 근본 원인

FileBrowser BaseURL 우선순위 계층:

```
/config/settings.json  ← 최고 우선순위 (모든 설정 오버라이드)
     ↓
DB (filebrowser.db)    ← 두 번째 우선순위
     ↓
FB_BASEURL 환경변수     ← 최저 우선순위 (Go 서버 라우팅에만 영향)
```

`FB_BASEURL`은 Go HTTP 서버 라우팅 경로에는 적용되지만, Vue.js SPA가 참조하는 `window.FileBrowser.BaseURL`은 settings.json → DB 순으로 읽힘.

기존 설치에서 `/config/settings.json`에 `"baseURL": ""`가 저장되어 있으면 모든 다른 설정을 무시. Vue router가 `window.FileBrowser.BaseURL`을 base path로 사용하므로 빈 값이면 로그인 후 `router.push('/')` → Traefik 루트 → 랜딩 페이지 → 404.

**추가 복잡도**: 기존 `/config` 볼륨이 anonymous volume(long hash ID)이어서 `generate.ts`에서 볼륨명으로 참조 불가.

### 재현 조건

1. Quick Tunnel 모드 `brewnet init` 완료 (FileBrowser 포함, 구 버전)
2. `/config`가 anonymous volume으로 마운트됨
3. `/config/settings.json` 내 `"baseURL": ""`
4. 외부 URL에서 FileBrowser 접근 → 로그인 가능
5. 로그인 제출 후 → 404

### 해결 방안

두 가지 조치 병행:

**1. 런타임 즉시 수정 (이미 배포된 경우):**
```bash
# settings.json 직접 수정 (컨테이너 내부)
docker exec brewnet-filebrowser sh -c \
  'printf '"'"'{"port":80,"baseURL":"/files","address":"","log":"stdout","database":"/database/filebrowser.db","root":"/srv"}'"'"' > /config/settings.json'
docker restart brewnet-filebrowser
```

**2. 코드 수정 (신규 설치 시 자동 처리):**

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | FileBrowser `/config` named volume 추가 |
| `packages/cli/src/wizard/steps/generate.ts` | Quick Tunnel 모드에서 `busybox`로 settings.json 자동 작성 |

```typescript
// compose-generator.ts — /config를 named volume으로 변경
case 'filebrowser':
  return [
    `${BREWNET_PREFIX}_filebrowser_data:/srv`,
    `${BREWNET_PREFIX}_filebrowser_db:/database`,
    `${BREWNET_PREFIX}_filebrowser_config:/config`,  // ← named volume 추가
  ];
```

```typescript
// generate.ts — FileBrowser settings.json 자동 작성
const { stdout } = await execaFn('docker', [
  'inspect', 'brewnet-filebrowser',
  '--format', '{{range .Mounts}}{{.Destination}}={{.Name}}\n{{end}}',
]);
const mountMap: Record<string, string> = {};
for (const line of stdout.trim().split('\n')) {
  const [dest, name] = line.split('=');
  if (dest && name) mountMap[dest.trim()] = name.trim();
}
const configVolume = mountMap['/config'];

if (state.domain.cloudflare.tunnelMode === 'quick' && configVolume) {
  const settingsJson = JSON.stringify({
    port: 80, baseURL: '/files', address: '', log: 'stdout',
    database: '/database/filebrowser.db', root: '/srv',
  });
  await execaFn('docker', [
    'run', '--rm', '-v', `${configVolume}:/config`, 'busybox',
    'sh', '-c', `printf '%s' '${settingsJson}' > /config/settings.json`,
  ]);
}
```

### 예방 방법

- FileBrowser 설정 변경 시 반드시 `/config/settings.json` 확인 (DB/env 설정만으로 부족)
- `docker exec <container> cat /config/settings.json` 으로 현재 적용 값 검증
- named volume 사용 여부 확인: `docker inspect <container> --format '{{range .Mounts}}{{.Type}} {{.Destination}}\n{{end}}'`
- Quick Tunnel 외부 접근 진단: 브라우저 DevTools → Sources 탭 → `window.FileBrowser.BaseURL` 값 확인

### 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts`, `packages/cli/src/wizard/steps/generate.ts`
- 관련 이슈: [filebrowser-external-access-baseurl.md](./filebrowser-external-access-baseurl.md) (이전 세션의 관련 이슈)
- FileBrowser 설정 우선순위: settings.json > DB > 환경변수

---
