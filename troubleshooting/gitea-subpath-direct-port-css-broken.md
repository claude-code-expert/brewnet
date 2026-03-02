# Gitea 서브패스 설정 시 직접 포트 접근 CSS 깨짐 Troubleshooting

> Quick Tunnel 모드에서 Gitea ROOT_URL에 sub-path(`/git/`)가 포함될 때, 직접 포트(3000) 접근 시 CSS/JS 에셋이 404로 실패하는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Docker |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | Quick Tunnel 모드 + 포트 3000 노출 시 |

### 문제 요약

Quick Tunnel 모드에서 Gitea `ROOT_URL=http://localhost/git/` 설정 시, Traefik을 통한 `localhost/git/` 접근은 정상이지만 직접 포트 접근(`localhost:3000`) 시 CSS/JS 에셋이 모두 404로 실패. 화면이 깨진 상태로 로드됨.

### 에러 상세

```
# 브라우저 콘솔 에러 (localhost:3000 접근 시)
Failed to load asset files from http://localhost:3000/git/assets/js/index.js?v=1.25.4.
Please make sure the asset files can be accessed.

Failed to load asset files from http://localhost:3000/git/assets/css/index.css?v=1.25.4.

# HTTP 응답
GET localhost:3000/git/assets/js/index.js → 404 Not Found
GET localhost:3000/git/assets/css/index.css → 404 Not Found
```

### 근본 원인

Gitea의 `ROOT_URL` 경로 처리 방식 이해 필요:

| 설정 | 동작 |
|------|------|
| `ROOT_URL=http://localhost/git/` | AppSubUrl = `/git/` |
| HTML 내 에셋 링크 | `/git/assets/js/index.js` (prefix 포함) |
| Gitea HTTP 라우터 | bare path(`/assets/...`) 처리 (prefix 없이) |
| Traefik strip-prefix | `/git/` 제거 후 → `/assets/...` 전달 → ✅ |
| 직접 포트 3000 | 브라우저 → `localhost:3000/git/assets/...` → Gitea 라우터에 없음 → 404 |

핵심: **Gitea는 reverse proxy의 strip-prefix를 전제로 설계됨**. 직접 포트 접근은 sub-path가 있을 때 구조적으로 동작 불가.

### 재현 조건

1. Quick Tunnel 모드 `brewnet init` 완료 (Gitea 포함)
2. `GITEA__server__ROOT_URL=http://localhost/git/` 설정
3. `ports: ["3000:3000"]` 노출
4. `localhost:3000` 접근 → HTML 로드됨 (Gitea 라우터가 `/` 처리)
5. 브라우저가 `/git/assets/...` 요청 → 404

### 해결 방안

Quick Tunnel 모드에서 Gitea 포트 3000 노출 제거. 로컬 접근은 `localhost/git/` (Traefik 경유) 사용.

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | Quick Tunnel 모드에서 Gitea 포트 3000 노출 제거 |

```typescript
// packages/cli/src/services/compose-generator.ts
case 'gitea': {
  // Quick Tunnel: ROOT_URL=http://localhost/git/ sets AppSubUrl=/git/.
  // Gitea generates /git/assets/... links but HTTP router handles routes WITHOUT prefix.
  // Traefik strips /git/ before forwarding → Gitea receives bare /assets/... paths ✓
  // Direct port access (localhost:3000): browser requests /git/assets/... → Gitea 404
  const ports = [`${remap(state.servers.gitServer.sshPort)}:22`];
  if (state.domain.cloudflare.tunnelMode !== 'quick') {
    ports.unshift(`${remap(state.servers.gitServer.port)}:3000`);
  }
  return ports;
}
```

#### 런타임 수정 (이미 배포된 경우)

```bash
# docker-compose.yml에서 Gitea ports 섹션 수정
# "3000:3000" 라인 제거 후 재시작
docker compose up -d gitea
```

### 예방 방법

- sub-path(`AppSubUrl`)가 있는 서비스는 직접 포트 접근 불가 → Traefik 경유만 허용
- Quick Tunnel 모드 로컬 접근 URL:
  - Gitea: `http://localhost/git/` (Traefik 경유, 포트 80)
  - SSH: `ssh -p 3022 git@localhost` (직접 포트)
- 서비스 검증기(`service-verifier.ts`)에서도 Quick Tunnel 모드에 맞는 URL 사용 확인

### 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts`, `packages/cli/src/utils/service-verifier.ts`
- Gitea 공식 문서 — [Running Gitea with a sub-path](https://docs.gitea.io/en-us/administration/reverse-proxies/)
- 관련 커밋: 이전 세션 `a081d51`

---
