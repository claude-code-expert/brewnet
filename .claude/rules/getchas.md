# Brewnet Technical Gotchas

> 반복 발생한 버그에서 추출한 프로젝트 특화 규칙.
> 새 버그 패턴 발견 시 이 파일에 추가.

---

## Jellyfin

- 초기 설정 URL은 반드시 `http://<host>:8096/web/#/wizard/start` 사용
- `#/home` 절대 사용 금지

---

## Template Literal 안 정규식

- Template literal 안 인라인 JS에서 regex 리터럴(`/.../`) 절대 사용 금지
- `\/` 가 template escape로 소비되어 `//` 주석 처리 → 전체 JS 파싱 실패
- 반드시 `new RegExp('...')` 사용

---

## Docker Compose Labels (yaml.load)

- `yaml.load()` 결과의 Docker Compose labels 사용 시 반드시 `Array.isArray()` 체크
- 보일러플레이트 compose는 array 형식 `["key=val"]` 사용
- Object로 캐스팅하면 `{0: "key=val"}` 으로 깨짐

---

## External URL

- External URL을 클라이언트에서 추측 금지 — compose 서비스명과 앱 이름이 다를 수 있음
- 반드시 서버사이드에서 컨테이너 Traefik 라벨 기반으로 계산

---

## Traefik + SPA

- Traefik PathPrefix로 SPA 서빙 시 trailing slash redirect 미들웨어 필수
- 없으면 `./assets/...` 상대경로가 잘못된 디렉토리로 해석 → 빈 화면

---

## Next.js + Traefik

- Next.js 스택에 Traefik strip-prefix / trailing-slash redirect 절대 사용 금지
- Next.js는 `basePath`로 sub-path 자체 처리
  - strip-prefix → 경로 이중 제거
  - trailing-slash → `trailingSlash: false` 기본값과 충돌 → 무한 리다이렉트
- `addQuickTunnelAppLabels()`에 `noStrip: true` 사용

---

## Next.js basePath 변경 시 필수 3단계

1. Docker 이미지 `--no-cache` 재빌드 (basePath는 빌드 시 bake-in)
2. healthcheck 경로 → `/apps/{name}/health` 로 업데이트
3. `pollHealth` / `verifyEndpoints` 의 `baseUrl` 에 basePath 반영

위 3단계 중 하나라도 누락 시 unhealthy 무한 대기.

---

## Quick Tunnel URL 감지 정규식

- cloudflared 로그에 실제 URL 이전에 `api.trycloudflare.com` 에러가 먼저 찍힘
- `/[a-z0-9-]+\.trycloudflare\.com/` 패턴은 `api.trycloudflare.com` 오매칭
- 반드시 `quick-tunnel.ts`와 동일한 `/[\w]+-[\w][\w-]*\.trycloudflare\.com/` 패턴 사용

---

## Nextcloud Quick Tunnel — TRUSTED_DOMAINS

- `NEXTCLOUD_TRUSTED_DOMAINS` env var에 반드시 `*.trycloudflare.com` 포함
- Nextcloud 29는 regex 미지원 — `*` 와일드카드만 동작
- regex(`/.*\.trycloudflare\.com/`) 넣으면 literal 문자열 처리 → 아무것도 매칭 안 됨
- 컨테이너 재생성 시 env var 기준 재초기화 → occ 단독으로는 부족
- `compose-generator.ts`의 `getNextcloudEnv()`와 `generate.ts`의 occ 호출 모두 `*.trycloudflare.com` 사용

---

## Gitea — clone_url

- Gitea API 반환 `clone_url` 절대 그대로 사용 금지
- Traefik strip-prefix 뒤의 Gitea는 `X-Forwarded-Host` 기반으로 subpath 없는 URL 반환
  - 예: `http://localhost/admin/repo.git` (`/git` 누락)
- `authedCloneUrl()`이 `baseUrl`로 재조립 → 직접 `clone_url` 조립 금지

---

## Gitea — URL 분리

- `giteaBaseUrl` (API용) 과 `giteaDisplayUrl` (표시용) 반드시 분리
- Named Tunnel 모드: API URL = `http://localhost/git`, 표시 URL = `https://git.<zone>`
- 혼용 시 auth redirect 깨짐 또는 터널 의존 API 실패

---

## Cloudflare DNS

- DNS 레코드 생성 시 반드시 upsert 패턴 사용
- `createDnsRecord()`는 "already exists" 시 기존 레코드를 PATCH로 갱신
- 터널 재생성 후 구 UUID가 남으면 Error 1033

---

## wizardState 동기화

- `wizardState` 변경하는 핸들러에서 반드시 인메모리 동기화
- `handleDomainConnect/Disconnect` 등 DomainManager가 디스크 저장 후
  → `loadState()` → `state.domainConnections = fresh` 필수
- 누락 시 `GET /api/apps` 가 stale 데이터 반환