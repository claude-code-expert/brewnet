# FileBrowser 외부 접근 불가 (FB_BASEURL 누락) Troubleshooting

> Quick Tunnel 모드에서 FileBrowser 외부 URL(`https://xxx.trycloudflare.com/files`)이 `Not Found`를 반환하는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Network / Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | Quick Tunnel 신규 설치마다 |

### 문제 요약

`brewnet init` Quick Tunnel 모드로 설치 후, 다른 서비스(Nextcloud 등)는 외부 URL로 정상 접근되는데 FileBrowser만 `https://xxx.trycloudflare.com/files`로 접근 시 Not Found 또는 빈 화면 반환. 내부 `http://localhost:8085`는 정상 동작.

### 에러 상세

```
# 브라우저에서 외부 URL 접근 시
https://xxx.trycloudflare.com/files → Not Found (또는 /login 리다이렉트 후 404)

# Traefik 라우팅 로그
"GET /files/login?redirect=%2Ffiles%2F HTTP/1.1" 404
```

### 근본 원인

FileBrowser는 경로 prefix 없이 `/`에 바인딩되어 동작함.
Traefik이 `/files` 경로 요청을 FileBrowser 컨테이너로 스트립-프리픽스(strip-prefix) 라우팅하면,
FileBrowser는 로그인 후 `/login?redirect=/` 로 리다이렉트하는데, 이 경로는 Traefik 라우터에서 매핑되지 않아 404 반환.

`FB_BASEURL` 환경변수가 없으면 FileBrowser가 자신이 `/files` prefix 아래에서 서비스 중임을 모르기 때문.
`FB_BASEURL=/files` 설정 시 로그인 리다이렉트가 `/files/login?redirect=/files/`로 생성되어 Traefik 라우팅이 정상 동작.

- **영향 범위**: Quick Tunnel 외부 접근만 영향 (내부 `localhost:8085` 직접 접근은 정상)
- **다른 서비스 비교**: Nextcloud(`/cloud`), pgAdmin(`/pgadmin`)은 WSGI/PHP가 SCRIPT_NAME을 처리해 자체적으로 prefix 인식. FileBrowser는 Go 앱으로 별도 환경변수 설정 필요.

### 재현 조건

1. Quick Tunnel 모드 `brewnet init` 완료 (FileBrowser 포함)
2. `FB_BASEURL` 환경변수 없이 컨테이너 실행
3. `https://xxx.trycloudflare.com/files` 접근 → 로그인 페이지 리다이렉트 → 404

### 해결 방안

`getFilebrowserEnv()`에서 Quick Tunnel 모드 시 `FB_BASEURL=/files` 추가.
Local 모드에서는 `/files` prefix 없이 `localhost:8085` 직접 접근하므로 설정 불필요.

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | `getFilebrowserEnv()` Quick Tunnel 조건부 `FB_BASEURL=/files` 추가 |

```typescript
// packages/cli/src/services/compose-generator.ts
function getFilebrowserEnv(state: WizardState): Record<string, string> {
  const env: Record<string, string> = {
    FB_USERNAME: state.admin.username || 'admin',
    FB_PASSWORD: state.admin.password || '${ADMIN_PASSWORD}',
  };
  if (state.domain.cloudflare.tunnelMode === 'quick') {
    env['FB_BASEURL'] = '/files';  // ← 추가: path-prefix reverse proxy 인식
  }
  return env;
}
```

### 예방 방법

- path-prefix reverse proxy(Traefik strip-prefix 등) 뒤에서 실행되는 앱은 반드시 자신의 base URL을 인식해야 함
- 서비스별 base URL 환경변수 확인: `FB_BASEURL` (FileBrowser), `SCRIPT_NAME` (Flask/WSGI), `RAILS_RELATIVE_URL_ROOT` (Rails), etc.
- Quick Tunnel vs Local 모드 차이: Quick Tunnel은 Traefik path-prefix 라우팅 필요, Local 모드는 포트 직접 접근

### 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts`
- FileBrowser 공식 문서 (baseurl): https://filebrowser.org/configuration/authentication-method

---
