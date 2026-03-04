# Traefik Port 443 Browser HTTPS Upgrade Troubleshooting

> Quick Tunnel 모드에서 Traefik이 불필요하게 포트 443을 열어 브라우저의 HTTP→HTTPS 자동 업그레이드로 서비스에 접근 불가

---

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-04 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Docker / Network |
| **브랜치** | feature/port |
| **재발 여부** | 최초 발생 |

## 문제 요약

`http://localhost/cloud`, `http://localhost/git`, `http://localhost/dashboard/` 등 Traefik 경유 서비스들이 브라우저에서 전혀 접근되지 않았다. `curl`로 동일한 URL에 요청하면 200/302 정상 응답이 반환되고, Cloudflare Quick Tunnel을 통한 외부 접근도 정상 작동했다. `http://localhost:3000` (boilerplate 직접 포트)는 브라우저에서도 정상 작동했다.

## 에러 상세

```
# 브라우저에서:
http://localhost/cloud → 접근 불가 (에러 메시지 없음)
http://localhost/git  → 접근 불가
http://localhost/dashboard/ → 접근 불가

# curl에서 (동일 URL):
curl http://localhost/cloud  → 302 Found (정상)
curl http://localhost/git    → 200 OK (정상)

# HTTPS 진단:
curl -k https://localhost/cloud → HTTP/2 404
# → 포트 443이 열려있고 TLS 핸드셰이크 성공하지만 websecure 라우터 없음
```

## 근본 원인

### 기술적 원인 (3가지 요소 결합)

1. **`compose-generator.ts`가 Quick Tunnel 모드에서도 항상 포트 443을 노출**
   ```typescript
   // 수정 전 — 모든 경우에 443 포함
   case 'traefik':
     return [`${httpHost}:80`, `${httpsHost}:443`];  // 항상!

   // 수정 전 command
   '--entrypoints.websecure.address=:443',  // 항상!
   ```

2. **모든 서비스 라우터는 `web`(HTTP) 엔트리포인트에만 등록** — `websecure`(HTTPS) 엔트리포인트에 등록된 라우터 없음

3. **Chrome의 HTTPS 자동 업그레이드**
   - Chrome은 기본 HTTP 포트(80)에서 HTTPS(443)로 자동 업그레이드 시도
   - 포트 443이 열려있어 TCP 연결 성공 → Traefik의 기본 자체 서명 인증서로 TLS 핸드셰이크
   - websecure 라우터 없음 → `404 page not found` 반환
   - 결과: 사용자가 서비스에 접근 불가로 인식

4. **포트 3000이 작동한 이유**: 비표준 포트(3000)에서 HTTPS 연결 실패(거부) → Chrome이 HTTP로 폴백 → 정상 접근

### Quick Tunnel 아키텍처 문제

Cloudflare Quick Tunnel은 HTTPS를 외부에서 처리한다:
```
브라우저 → HTTPS → Cloudflare Edge → cloudflared → http://traefik:80
```
로컬 Traefik은 HTTP만 서비스하면 충분. 포트 443을 로컬에 열어도 Let's Encrypt 인증서도 없고 websecure 라우터도 없으므로 유해무익.

## 재현 조건

1. Cloudflare Quick Tunnel 모드로 `brewnet init` 실행
2. `docker ps`에서 `brewnet-traefik`의 포트에 `0.0.0.0:443->443/tcp` 표시됨
3. Chrome(또는 Safari)에서 `http://localhost/cloud` 입력
4. 브라우저가 HTTPS 업그레이드 시도 → `https://localhost/cloud` → 404

```bash
# 진단 명령
curl -k --max-time 3 https://localhost/cloud  # HTTP/2 404 반환 시 이 버그
lsof -iTCP:443 -sTCP:LISTEN 2>/dev/null | grep com.docke  # 443 열려있는지 확인
```

## 해결 방안

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | Quick Tunnel 모드일 때 포트 443 제외, websecure 엔트리포인트 추가 안 함 |

```typescript
// getServicePorts — 수정 후
case 'traefik': {
  const httpHost = remap(80);
  const isQuickTunnel = state.domain.cloudflare.tunnelMode === 'quick';
  // Quick Tunnel: Cloudflare handles HTTPS externally; exposing 443 locally
  // causes browsers to auto-upgrade HTTP→HTTPS, hit Traefik's default
  // self-signed cert, and get 404 (no websecure routers defined).
  if (isQuickTunnel) {
    return [`${httpHost}:80`];
  }
  const httpsHost = remap(443);
  return [`${httpHost}:80`, `${httpsHost}:443`];
}

// Traefik command — 수정 후
const cmds: string[] = [
  '--providers.docker=true',
  ...
  '--entrypoints.web.address=:80',
  // '--entrypoints.websecure.address=:443',  ← 제거됨
  '--api.insecure=true',
];
// Websecure entrypoint only added for non-Quick-Tunnel setups
if (!isQuickTunnel) {
  cmds.push('--entrypoints.websecure.address=:443');
}
```

### 즉시 수정 (실행 중인 시스템)

```bash
# 1. docker-compose.yml에서 포트 443 제거
# ~/brewnet/my-homeserver/docker-compose.yml 수정:
#   ports: 에서 "443:443" 줄 삭제
#   command: 에서 "--entrypoints.websecure.address=:443" 줄 삭제

# 2. Traefik만 재시작
cd ~/brewnet/my-homeserver
docker compose up -d traefik

# 3. 포트 443이 닫혔는지 확인
lsof -iTCP:443 -sTCP:LISTEN 2>/dev/null || echo "Port 443: NOT listening ✓"

# 4. HTTP 서비스 동작 확인
curl http://localhost/git  # 200 OK
curl http://localhost/cloud  # 302 → /cloud/login
```

### 검증

```bash
# HTTPS가 거부되는지 확인 (연결 거부 = 정상)
curl -k --max-time 2 https://localhost/cloud 2>&1
# → curl: (7) Failed to connect to localhost port 443 after ... ms: Connection refused ✓

# HTTP는 여전히 작동하는지 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost/git   # → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost/cloud  # → 302
```

## 예방 방법

- **Quick Tunnel 모드**: Traefik에 포트 443 불필요. Cloudflare가 HTTPS 종단점 역할
- **Named Tunnel + Let's Encrypt**: 포트 443 필요 (ACME TLS challenge 용)
- **로컬 전용 (no tunnel)**: 포트 443 선택 사항, 단 cert 없으면 브라우저 경고
- compose-generator에서 `ssl === 'letsencrypt'` 조건으로 websecure 엔트리포인트 활성화

### 브라우저에서 HTTPS 업그레이드 확인하는 진단법

```bash
# 포트 443이 열려있고 TLS가 작동하는지 (문제 있음)
curl -k --max-time 2 https://localhost/cloud
# → HTTP/2 404 = 포트 열려있음, 브라우저 HTTPS 업그레이드 영향 있음

# 포트 443이 닫혀있는지 (정상)
curl -k --max-time 2 https://localhost/cloud 2>&1
# → Connection refused = 포트 닫힘, Chrome이 HTTP로 폴백
```

## 관련 참고

- 관련 커밋: `1d77b8c`
- 관련 파일: `packages/cli/src/services/compose-generator.ts` (L511-518, L713-733)
- 관련 이슈: `feature/port` 브랜치 — findFreePort 0.0.0.0 수정 세션에서 발견
- Chrome HTTPS Upgrade: port 80에서 port 443으로 자동 업그레이드, 비표준 포트(3000 등)는 폴백 허용

---
