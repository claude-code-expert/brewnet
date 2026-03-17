# Vite SPA Trailing Slash 누락 → 빈 화면 (에셋 로드 실패)

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-17 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Network |
| **브랜치** | feature/apps-ui |
| **재발 여부** | 2회 (vite-blank-screen-traefik-subpath.md 후속) |

## 문제 요약

Quick Tunnel 경유 Vite React SPA 접근 시 `index.html`은 로드되지만 JS/CSS 에셋이 로드 실패하여 빈 화면. `./assets/index.js` 상대경로가 trailing slash 유무에 따라 다른 절대경로로 해석됨.

## 근본 원인

```
URL: /apps/spring-app-ui     (trailing slash 없음)
브라우저의 "현재 디렉토리": /apps/
./assets/index.js → /apps/assets/index.js ← 잘못된 경로!
→ Traefik PathPrefix(/apps/spring-app-ui) 매칭 안 됨
→ catch-all landing page → HTML 반환 (JS 아님) → SyntaxError → 빈 화면

URL: /apps/spring-app-ui/    (trailing slash 있음)
브라우저의 "현재 디렉토리": /apps/spring-app-ui/
./assets/index.js → /apps/spring-app-ui/assets/index.js ← 정상!
→ PathPrefix 매칭 → strip → /assets/index.js → nginx 서빙 ✅
```

## 해결 방법

Traefik `redirectregex` 미들웨어로 trailing slash 자동 추가:

```yaml
# compose-generator.ts addQuickTunnelAppLabels()에서 자동 생성
traefik.http.middlewares.app-NAME-slash.redirectregex.regex: "^(.*\/apps\/NAME)$"
traefik.http.middlewares.app-NAME-slash.redirectregex.replacement: "$${1}/"
traefik.http.middlewares.app-NAME-slash.redirectregex.permanent: "false"
traefik.http.routers.app-NAME.middlewares: "app-NAME-slash,app-NAME-strip"
```

미들웨어 체인 순서: `slash-redirect` → `strip-prefix` (순서 중요)

### Docker Compose `$$` 이스케이프

`${1}`은 regex 캡처 그룹 참조지만 Docker Compose가 환경변수로 오인. `$$` 이스케이프로 리터럴 `$` 보존:
- YAML 파일: `$${1}/`
- Docker Compose 해석: `${1}/`
- Traefik 사용: `${1}/` (캡처 그룹 1 + `/`)

## 예방 방법

> **RULE: Traefik PathPrefix로 SPA를 서빙할 때 반드시 trailing slash redirect 미들웨어 추가.**
> `addQuickTunnelAppLabels()`가 모든 앱 라우트에 자동으로 추가하므로 수동 설정 불필요.
> 관련: `vite-blank-screen-traefik-subpath.md` (Vite `base` 설정 부재 이슈)

## 관련 참고

- 파일: `packages/cli/src/services/compose-generator.ts` `addQuickTunnelAppLabels()`
- 이전 이슈: `troubleshooting/vite-blank-screen-traefik-subpath.md`
- Docker Compose interpolation: `troubleshooting/docker-compose-traefik-interpolation.md`
