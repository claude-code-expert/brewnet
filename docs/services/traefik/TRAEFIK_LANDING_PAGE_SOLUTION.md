# Traefik 기본 페이지 보안 이슈 분석 및 해결책

> Brewnet — Your server on tap. Just brew it.

---

## 1. 문제 분석

### whoami가 노출되는 구조

Traefik 공식 Quick Start (`/getting-started/docker/`)는 데모용 `traefik/whoami` 컨테이너를 포함한다.
이 컨테이너는 HTTP 요청의 **모든 내부 정보를 그대로 반환**한다:

```
Hostname: 068c0a29a8b7          ← 컨테이너 ID
IP: 127.0.0.1                   ← 내부 IP
IP: 192.168.147.3               ← Docker 네트워크 IP
RemoteAddr: 192.168.147.2:56006 ← Traefik 내부 주소
X-Forwarded-For: 192.168.147.1  ← 게이트웨이 IP
X-Forwarded-Server: 9232cdd4fd  ← Traefik 컨테이너 ID
X-Real-Ip: 192.168.147.1       ← 실제 IP
```

### 보안 위험 요소

| 노출 정보 | 위험도 | 설명 |
|-----------|--------|------|
| Container Hostname/ID | 🔴 높음 | Docker 인프라 구조 노출 |
| 내부 네트워크 IP 대역 | 🔴 높음 | 네트워크 토폴로지 파악 가능 |
| X-Forwarded 헤더 | 🟡 중간 | 리버스 프록시 체인 구조 노출 |
| Traefik 버전 (Server 헤더) | 🟡 중간 | 알려진 취약점 타겟팅 가능 |
| HTTP 메서드/프로토콜 | 🟢 낮음 | 일반적 정보이나 불필요 |

### Cloudflare Tunnel 시나리오에서 더 심각한 이유

Brewnet은 Cloudflare Tunnel을 통해 외부 접근을 제공한다.
Tunnel은 **공인 IP 없이도 서비스를 인터넷에 노출**하므로:

1. 누구나 `brewnet.dev` 도메인으로 접근 가능
2. whoami가 catch-all이면 **모든 미등록 서브도메인** 요청이 whoami로 라우팅
3. 스캐너/봇이 내부 인프라 정보를 수집 가능

### 근본 원인

Traefik Docker provider의 `defaultRule` 설정:

```yaml
# Traefik 기본 동작
providers:
  docker:
    defaultRule: "Host(`{{ trimPrefix `/` .Name }}.docker.localhost`)"
```

`exposedByDefault=true`(기본값)이면 **모든 Docker 컨테이너가 자동으로 라우팅에 등록**된다.
whoami 컨테이너가 존재하면 `whoami.docker.localhost`로 라우팅되지만,
Tunnel 환경에서는 호스트명 매칭이 달라져 의도치 않은 노출이 발생한다.

---

## 2. 해결 전략

### 핵심 원칙

```
1. whoami 컨테이너는 프로덕션에서 절대 포함하지 않는다
2. exposedByDefault=false 강제 — 명시적 라벨이 있는 서비스만 노출
3. catch-all 랜딩 페이지로 미등록 경로를 안전하게 처리
4. Dashboard는 인증 뒤에 숨긴다
```

### 3가지 선택지

| 방안 | 설명 | Brewnet 적합도 |
|------|------|---------------|
| **A. Brewnet Landing Page (권장)** | 경량 nginx 컨테이너로 브랜딩 페이지 제공 | ⭐⭐⭐ |
| **B. Dashboard 리다이렉트** | 루트 접속 → BasicAuth Dashboard로 이동 | ⭐⭐ |
| **C. 404 커스텀 에러 페이지** | 모든 미등록 경로에 커스텀 404 반환 | ⭐ |

**방안 A를 권장하는 이유**: Brewnet 브랜딩 + 서비스 상태 확인 + 보안 정보 비노출을 동시에 달성.
Dashboard 리다이렉트는 인증 화면이 바로 뜨므로 공격 표면이 생기고, 404는 사용자 경험이 나쁘다.

---

## 3. 권장 해결책: Brewnet Landing Page

### 아키텍처

```
인터넷 → Cloudflare Tunnel → Traefik(:443)
                                  │
                                  ├─ brewnet.dev          → brewnet-landing (priority: 1, catch-all)
                                  ├─ git.brewnet.dev      → gitea:3000
                                  ├─ cloud.brewnet.dev    → nextcloud:80
                                  ├─ media.brewnet.dev    → jellyfin:8096
                                  ├─ files.brewnet.dev    → filebrowser:80
                                  ├─ db.brewnet.dev       → pgadmin:80
                                  ├─ dash.brewnet.dev     → traefik-dashboard (BasicAuth)
                                  └─ *.brewnet.dev (기타)  → brewnet-landing (catch-all)
```

### 3-1. 랜딩 페이지 HTML

`landing/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brewnet — Your server on tap</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      overflow: hidden;
    }

    /* 배경 그레인 효과 */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 2rem;
    }

    /* 맥주 잔 아이콘 (ASCII art 스타일) */
    .logo {
      font-size: 1.2rem;
      color: #f59e0b;
      margin-bottom: 2rem;
      line-height: 1.4;
      letter-spacing: 0.05em;
      opacity: 0.9;
    }

    h1 {
      font-size: clamp(2rem, 5vw, 3.5rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }

    h1 .brand { color: #f59e0b; }

    .tagline {
      font-size: 1rem;
      color: #737373;
      margin-bottom: 3rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1.2rem;
      border: 1px solid #262626;
      border-radius: 100px;
      font-size: 0.85rem;
      color: #a3a3a3;
    }

    .status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .footer {
      position: fixed;
      bottom: 1.5rem;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 0.75rem;
      color: #404040;
      letter-spacing: 0.05em;
    }

    .footer a {
      color: #525252;
      text-decoration: none;
    }

    .footer a:hover { color: #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <pre>
   🍺
  ╔═══╗
  ║   ║▒
  ║   ║▒
  ╚═══╝
      </pre>
    </div>
    <h1><span class="brand">Brewnet</span></h1>
    <p class="tagline">Your server on tap. Just brew it.</p>
    <div class="status">
      <span class="dot"></span>
      All systems operational
    </div>
  </div>
  <div class="footer">
    <a href="https://brewnet.dev">brewnet.dev</a> · BSL 1.1
  </div>
</body>
</html>
```

### 3-2. Nginx 설정

`landing/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # 보안 헤더 — whoami와 정반대로 정보를 숨긴다
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'" always;

    # 서버 버전 숨기기
    server_tokens off;

    # 모든 경로 → 랜딩 페이지
    location / {
        try_files $uri /index.html;
    }

    # health check 엔드포인트 (Traefik용)
    location /health {
        access_log off;
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # 불필요한 경로 차단
    location ~ /\. {
        deny all;
        return 404;
    }
}
```

### 3-3. Landing 컨테이너 Dockerfile

`landing/Dockerfile`:

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
```

### 3-4. Docker Compose 통합

```yaml
services:
  # ================================================================
  # Traefik — Reverse Proxy
  # ================================================================
  traefik:
    image: traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    networks:
      - brewnet
    ports:
      - "80:80"
      - "443:443"
      # 8080 포트 노출하지 않음 — Dashboard는 라벨 라우팅으로만 접근
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certs:/letsencrypt
    command:
      # EntryPoints
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      - "--entrypoints.websecure.address=:443"

      # Provider — 핵심: exposedbydefault=false
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=brewnet"

      # Dashboard — insecure=false (포트 8080 미노출)
      - "--api.dashboard=true"
      - "--api.insecure=false"

      # TLS (Let's Encrypt)
      - "--certificatesresolvers.le.acme.email=brewnet.dev@gmail.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"

      # Logging
      - "--log.level=WARN"
      - "--accesslog=true"
      - "--accesslog.filters.statuscodes=400-599"
    labels:
      - "traefik.enable=true"

      # ── Dashboard Router (dash.brewnet.dev) ──
      - "traefik.http.routers.dashboard.rule=Host(`dash.brewnet.dev`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.tls.certresolver=le"

      # BasicAuth 미들웨어 (htpasswd -nb admin PASSWORD | sed 's/$/$$/')
      - "traefik.http.middlewares.dashboard-auth.basicauth.users=${TRAEFIK_DASHBOARD_AUTH}"
      - "traefik.http.routers.dashboard.middlewares=dashboard-auth@docker"

  # ================================================================
  # Brewnet Landing Page — Catch-All (whoami 대체)
  # ================================================================
  brewnet-landing:
    build: ./landing
    # 또는 이미지를 미리 빌드해서 사용:
    # image: brewnet/landing:latest
    container_name: brewnet-landing
    restart: unless-stopped
    networks:
      - brewnet
    labels:
      - "traefik.enable=true"

      # ── Catch-All Router ──
      # PathPrefix(`/`)는 모든 경로를 매칭한다
      # priority=1로 설정하면 다른 모든 라우터보다 낮은 우선순위
      # → 등록된 서비스(gitea, nextcloud 등)가 먼저 매칭되고,
      #   매칭되지 않는 요청만 이 랜딩 페이지로 온다
      - "traefik.http.routers.landing.rule=PathPrefix(`/`)"
      - "traefik.http.routers.landing.entrypoints=websecure"
      - "traefik.http.routers.landing.priority=1"
      - "traefik.http.routers.landing.tls.certresolver=le"
      - "traefik.http.services.landing.loadbalancer.server.port=80"

      # 보안 헤더 미들웨어
      - "traefik.http.middlewares.landing-headers.headers.customResponseHeaders.Server=Brewnet"
      - "traefik.http.middlewares.landing-headers.headers.frameDeny=true"
      - "traefik.http.middlewares.landing-headers.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.landing-headers.headers.browserXssFilter=true"
      - "traefik.http.routers.landing.middlewares=landing-headers@docker"

  # ================================================================
  # ❌ whoami는 포함하지 않는다
  # ================================================================
  # whoami:
  #   image: traefik/whoami    # 프로덕션에서 절대 사용 금지
  #   ...

networks:
  brewnet:
    name: brewnet
```

---

## 4. 핵심 설정 포인트 상세

### 4-1. `exposedByDefault=false` (가장 중요)

```yaml
- "--providers.docker.exposedbydefault=false"
```

이 설정 하나가 **보안의 근간**이다.

- `true` (기본값): Docker에서 뜬 모든 컨테이너가 Traefik에 자동 등록 → whoami, DB, Redis 등이 의도치 않게 노출 가능
- `false`: `traefik.enable=true` 라벨이 있는 컨테이너만 노출 → **명시적 허용 목록 방식**

### 4-2. `api.insecure=false` + 라벨 라우팅

```yaml
- "--api.insecure=false"   # 포트 8080으로 Dashboard 접근 차단
```

Quick Start 문서에서는 `api.insecure=true`로 8080을 열지만,
Setup 문서(`/setup/docker/`)에서는 **명시적으로 false로 설정하고 라벨 기반 라우팅을 사용**한다:

```yaml
# Dashboard를 특정 호스트명 + BasicAuth 뒤에 배치
- "traefik.http.routers.dashboard.rule=Host(`dash.brewnet.dev`)"
- "traefik.http.routers.dashboard.service=api@internal"
- "traefik.http.routers.dashboard.middlewares=dashboard-auth@docker"
```

### 4-3. Catch-All의 `priority=1` 매커니즘

Traefik 라우터 공식 문서에 따르면:

> 라우터는 규칙의 길이를 기준으로 내림차순 정렬된다.  
> priority 값이 길수록 높은 우선순위를 가진다.  
> priority=0은 무시되어 기본 정렬이 적용된다.

```yaml
- "traefik.http.routers.landing.rule=PathPrefix(`/`)"
- "traefik.http.routers.landing.priority=1"
```

- `PathPrefix(/)` → 모든 HTTP 경로를 매칭
- `priority=1` → 가능한 가장 낮은 우선순위

따라서 `Host(git.brewnet.dev)` (rule 길이 더 김 = 높은 priority) 등의 다른 라우터가 **항상 먼저 매칭**되고, 어디에도 매칭되지 않는 요청만 랜딩 페이지로 흐른다.

### 4-4. Server 헤더 커스터마이징

```yaml
# Traefik 기본: "Server: Traefik" 헤더 노출
# Brewnet에서 커스텀 헤더로 교체:
- "traefik.http.middlewares.landing-headers.headers.customResponseHeaders.Server=Brewnet"
```

Traefik은 기본적으로 `Server: Traefik` 응답 헤더를 붙인다. 이것도 정보 노출이므로 커스터마이징한다.

---

## 5. whoami vs Brewnet Landing 비교

### 변경 전 (whoami → 보안 취약)

```
$ curl https://brewnet.dev/

Hostname: 068c0a29a8b7
IP: 127.0.0.1
IP: 192.168.147.3
RemoteAddr: 192.168.147.2:56006
GET / HTTP/1.1
Host: brewnet.dev
X-Forwarded-For: 172.16.0.1
X-Forwarded-Server: traefik-abc123
X-Real-Ip: 203.0.113.42
```

**노출 정보**: 컨테이너 ID, 내부 네트워크 대역, Traefik 컨테이너명, 실제 접속 IP

### 변경 후 (Brewnet Landing → 안전)

```
$ curl -I https://brewnet.dev/

HTTP/2 200
server: Brewnet
x-content-type-options: nosniff
x-frame-options: DENY
x-xss-protection: 1; mode=block
referrer-policy: no-referrer
content-type: text/html

$ curl https://brewnet.dev/

<!DOCTYPE html>
<html>... Brewnet 브랜딩 페이지 ...
```

**노출 정보**: 없음. 브랜딩 HTML만 반환.

---

## 6. 구현 체크리스트

```
□ landing/index.html 생성 (Brewnet 브랜딩 페이지)
□ landing/nginx.conf 생성 (보안 헤더 + server_tokens off)
□ landing/Dockerfile 생성 (nginx:alpine 기반)
□ docker-compose.yml에 brewnet-landing 서비스 추가
□ Traefik command에 exposedbydefault=false 확인
□ Traefik command에 api.insecure=false 확인
□ Dashboard 라벨에 BasicAuth 미들웨어 적용
□ Landing 라벨에 priority=1 catch-all 설정
□ whoami 서비스 완전 제거
□ .env에 TRAEFIK_DASHBOARD_AUTH 해시 추가
□ Cloudflare Tunnel 테스트 — 루트 도메인 접속 시 랜딩 페이지 확인
□ 미등록 서브도메인 접속 시 랜딩 페이지 확인
□ curl -I로 Server 헤더가 "Brewnet"인지 확인
```

---

## 7. .env 예시

```env
# Traefik Dashboard BasicAuth
# 생성: htpasswd -nb admin YOUR_PASSWORD | sed -e 's/\$/\$\$/g'
TRAEFIK_DASHBOARD_AUTH=admin:$$apr1$$xyz$$hashedpassword

# Domain
BREWNET_DOMAIN=brewnet.dev

# Contact
ACME_EMAIL=brewnet.dev@gmail.com
```

---

*Brewnet Server Security — whoami 제거 및 Landing Page 구현 가이드 v1.0*
