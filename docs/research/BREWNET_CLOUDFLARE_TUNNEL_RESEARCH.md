# Brewnet × Cloudflare Tunnel 통합 가이드

> **brewnet.dev** | Your server on tap. Just brew it
> Contact: brewnet.dev@gmail.com | License: MIT
> Last Updated: 2026-02-28

---

## 목차

1. [핵심 개요 & 결론 요약](#1-핵심-개요--결론-요약)
2. [왜 Cloudflare Tunnel인가](#2-왜-cloudflare-tunnel인가)
3. [Quick Tunnel vs Named Tunnel](#3-quick-tunnel-vs-named-tunnel)
4. [아키텍처: Traefik 이중 프록시](#4-아키텍처-traefik-이중-프록시)
5. [Cloudflare API 자동화](#5-cloudflare-api-자동화)
6. [Docker Compose 통합](#6-docker-compose-통합)
7. [TypeScript 구현 설계](#7-typescript-구현-설계)
8. [단계별 사용자 플로우](#8-단계별-사용자-플로우)
9. [제한사항 및 고려사항](#9-제한사항-및-고려사항)
10. [트러블슈팅](#10-트러블슈팅)
11. [구현 로드맵](#11-구현-로드맵)
12. [참고 자료](#12-참고-자료)

---

## 1. 핵심 개요 & 결론 요약

### Q1: 도메인 없이 Cloudflare Tunnel로 외부 접근 가능한가?

**부분적으로 가능 (Quick Tunnels), 하지만 프로덕션 사용에는 부적합.**

| 방식 | 도메인 필요 | 영구 URL | 프로덕션 적합 | API 제어 |
|------|:-----------:|:--------:|:------------:|:--------:|
| **Quick Tunnel** (trycloudflare.com) | ❌ | ❌ (매번 랜덤) | ❌ | ❌ |
| **Named Tunnel** (정식 터널) | ✅ | ✅ | ✅ | ✅ |

- **Quick Tunnel**: `cloudflared tunnel --url http://localhost:8080` 한 줄로 `*.trycloudflare.com` 임시 URL 생성. 계정도 필요 없음. 하지만 URL이 매번 바뀌고, SLA 없고, rate limit 있고, Chrome에서 "Dangerous" 경고 발생 가능.
- **Named Tunnel**: 도메인이 반드시 필요. Cloudflare에 등록된 도메인의 DNS가 필요하며, CNAME 레코드로 `<tunnel-uuid>.cfargotunnel.com`을 가리켜야 함.

**→ Brewnet 결론: 정식 터널 사용 = 도메인 필수. Quick Tunnel은 초기 테스트/데모용으로만 활용.**

### Q2: Cloudflare에서 무료 도메인을 제공하는가?

**아니오. Cloudflare Registrar는 도메인을 원가(at-cost)에 판매하지, 무료로 제공하지 않음.**

- `.com` 도메인: 약 $10.11/년
- `.dev` 도메인: 약 $12/년
- 마크업 없이 도매가로만 판매하는 것이 특징

### Q3: API로 터널 생성부터 DNS 설정까지 완전 자동화 가능한가?

**✅ 예, 100% API로 자동화 가능.**

전체 워크플로우가 REST API로 지원됨:
1. 터널 생성 → `POST /accounts/{account_id}/cfd_tunnel`  (응답에 토큰 포함)
2. 터널 설정 (ingress rules) → `PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations`
3. DNS 레코드 생성 → `POST /zones/{zone_id}/dns_records`
4. `cloudflared` 실행 → Docker 컨테이너로 토큰 기반 실행

### Brewnet 도메인 전략

```
┌─────────────────────────────────────────────────────────────────────┐
│  Brewnet External Access Strategy                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 1: Quick Tunnel (즉시 사용)                                   │
│  ├─ brewnet init 시 Quick Tunnel로 즉시 외부 접근 가능              │
│  ├─ 도메인 없이 테스트/데모 목적                                     │
│  └─ "나중에 도메인을 연결하면 영구 URL을 받을 수 있습니다" 안내      │
│                                                                      │
│  Phase 2: Named Tunnel (도메인 연결)                                 │
│  ├─ 사용자가 도메인 보유 시 자동 연동                               │
│  ├─ brewnet domain connect → API로 전체 자동화                      │
│  └─ 영구 URL + 멀티 서비스 라우팅                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 왜 Cloudflare Tunnel인가

홈서버를 외부에서 접근하게 만드는 데는 세 가지 근본 문제가 있다:

| 문제 | 설명 | 기존 해결법 | 기존 해결법의 한계 |
|------|------|-----------|------------------|
| **유동 IP** | 가정용 인터넷은 IP가 수시로 바뀜 | DDNS (DuckDNS, No-IP) | 갱신 지연, 다운타임 |
| **NAT/CGNAT** | 공유기/통신사 NAT 뒤에 있어 외부 접근 불가 | 포트포워딩 | CGNAT 환경에선 아예 불가, 보안 위험 |
| **보안** | 포트를 열면 서버가 직접 공격에 노출 | 방화벽, fail2ban | 관리 복잡, 전문 지식 필요 |

Cloudflare Tunnel은 이 세 가지를 **한 번에 해결**한다:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Tunnel 작동 원리                            │
│                                                                         │
│   [인터넷 사용자] ──HTTPS──▶ [Cloudflare Edge] ◀──아웃바운드── [홈서버]  │
│                              (글로벌 CDN)        (포트 안 열어도 됨)     │
│                                                                         │
│   ✅ 포트포워딩 불필요     ✅ 자동 SSL/TLS     ✅ DDoS 방어             │
│   ✅ CGNAT 환경 지원       ✅ IP 숨김          ✅ Zero Trust 인증       │
│   ✅ 무료                                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

핵심은 **cloudflared 데몬이 홈서버에서 Cloudflare로 아웃바운드 연결**을 맺는다는 점이다. 인바운드 포트를 열지 않으므로, 라우터 설정 변경이 전혀 필요 없다.

### 전체 구성 요소

```
[도메인 구매/등록]
       │
       ▼
[Cloudflare DNS에 도메인 등록]
       │
       ▼
[Zero Trust에서 Tunnel 생성] ──▶ [토큰 발급]
       │                              │
       ▼                              ▼
[Public Hostname 설정]      [cloudflared 설치/실행]
(서브도메인 → 로컬 서비스)    (토큰으로 인증)
       │                              │
       └──────────────┬───────────────┘
                      ▼
             [외부에서 접속 가능!]
             https://app.mydomain.com
                      │
                      ▼
             [내부: localhost:3000]
```

---

## 3. Quick Tunnel vs Named Tunnel

### 3.1 Quick Tunnel (TryCloudflare) — 도메인 불필요

```bash
# 계정 없이, 도메인 없이 즉시 실행
cloudflared tunnel --url http://localhost:8080
```

실행 결과:
```
Your quick tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

**특징:**
- Cloudflare 계정 불필요
- 도메인 불필요
- 자동 HTTPS 제공
- DDoS 보호 포함

**제한사항 (프로덕션 사용 불가 사유):**
- URL이 매번 랜덤 생성 (재시작 시 변경)
- rate limiting 적용 (구체적 수치 미공개)
- SLA/uptime 보장 없음
- API로 제어 불가
- Chrome Safe Browsing에 의해 "Dangerous" 경고 발생 가능 (trycloudflare.com 악용 사례 존재)
- 커스텀 도메인/라우팅 불가

### 3.2 Named Tunnel — 도메인 필수

정식 Cloudflare Tunnel은 다음이 반드시 필요:

1. **Cloudflare 계정** (무료 플랜 가능)
2. **도메인** (Cloudflare에 네임서버가 등록된 도메인)
3. **cloudflared** 데몬

Named Tunnel은 `<tunnel-uuid>.cfargotunnel.com` 서브도메인을 생성하지만, 이 주소로 직접 접근은 불가능. 반드시 사용자 소유 도메인의 CNAME 레코드가 이 주소를 가리켜야 트래픽이 라우팅됨.

### 3.3 IP 기반 직접 접근 가능한가?

**불가능.** Cloudflare Tunnel은 IP 기반 접근을 지원하지 않음. 모든 public hostname은 도메인 기반.

Private Network 모드(WARP 클라이언트 사용)에서는 IP/CIDR로 접근 가능하지만, 이는 WARP 클라이언트가 설치된 디바이스에서만 가능하며 일반 웹 브라우저 접근은 불가.

---

## 4. 아키텍처: Traefik 이중 프록시

단순한 구성에서는 Cloudflare Tunnel이 각 서비스에 직접 연결되지만, Brewnet은 **Traefik을 중간에 배치**하는 이중 프록시 구조를 사용한다.

```
[인터넷 사용자]
      │
      ▼ HTTPS (Cloudflare가 TLS 종료)
[Cloudflare Edge]
      │
      ▼ Tunnel (암호화)
[cloudflared 컨테이너]
      │
      ▼ HTTP (내부 네트워크)
[Traefik 리버스 프록시]           ◀── 단일 진입점 (Public Hostname URL: traefik:80)
      │
      ├──▶ gitea:3000        (Host: git.mydomain.com)
      ├──▶ filebrowser:80    (Host: files.mydomain.com)
      ├──▶ uptime-kuma:3001  (Host: status.mydomain.com)
      └──▶ authelia:9091     (Host: auth.mydomain.com)
```

**이 구조의 장점:**

- Cloudflare Public Hostname 설정을 **1개만** 만들면 됨 (와일드카드)
- 서비스 추가/삭제 시 Cloudflare 대시보드 재설정 불필요
- Traefik이 Docker 라벨로 자동 서비스 발견
- 로컬 네트워크에서도 동일한 도메인으로 접근 가능 (optional)

**Cloudflare Public Hostname 설정 (단일):**

| Subdomain | Domain | Type | URL |
|-----------|--------|------|-----|
| `*` (와일드카드) | myserver.example.com | HTTP | `traefik:80` |
| (없음) | myserver.example.com | HTTP | `traefik:80` |

> 와일드카드 서브도메인(`*.mydomain.com`)은 Cloudflare 무료 플랜의 Universal SSL이 지원한다. 단, 멀티레벨 와일드카드(`*.sub.mydomain.com`)는 Advanced Certificate가 필요하다. 개별 서브도메인을 하나씩 등록하는 방식도 가능하다.

**대안: Traefik 없이 직접 연결 (간단 구성)**

소규모 설정이나 서비스가 1~2개인 경우, Traefik 없이 Cloudflare Tunnel에서 직접 라우팅할 수 있다:

```
[Cloudflare Public Hostname에서 직접 매핑]

Subdomain     → 컨테이너:포트
──────────────────────────────
git           → gitea:3000
files         → filebrowser:80
status        → uptime-kuma:3001
```

---

## 5. Cloudflare API 자동화

### 5.1 사전 준비 & 권한

#### 필요한 API Token 권한

```
API Token Permissions:
├─ Account > Cloudflare Tunnel > Edit     (터널 생성/관리)
├─ Zone > DNS > Edit                       (DNS 레코드 생성/관리)
└─ Account > Account Settings > Read       (계정 정보 조회)
```

#### API Token 생성

```
Cloudflare Dashboard → My Profile → API Tokens → Create Token

권한 설정:
  Account | Cloudflare Tunnel | Edit
  Zone    | DNS               | Edit
  Account | Account Settings  | Read

리소스 범위:
  Account: [사용자 계정 선택]
  Zone:    [도메인 선택] 또는 All zones
```

#### 수동 개입이 필요한 부분 (자동화 불가)

| 항목 | 이유 |
|------|------|
| Cloudflare 계정 생성 | 이메일 인증/약관 동의 필요 |
| API Token 생성 | 대시보드에서 최초 1회 수동 생성 필수 |
| 도메인 등록 | 결제 정보 입력 필요 |
| 네임서버 변경 | 기존 레지스트라에서 수동 변경 필요 (Cloudflare Registrar에서 구매한 경우 자동) |

#### Token 검증

```bash
curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq .
```

응답:
```json
{
  "result": {
    "id": "100bf38cc8393103870917dd535e0628",
    "status": "active"
  },
  "success": true
}
```

### 5.2 터널 생성

전체 자동화 가능한 워크플로우:

| 단계 | API Endpoint | 비고 |
|------|-------------|------|
| ① 계정 정보 조회 | `GET /accounts` | accountId 획득 |
| ② Zone(도메인) 목록 조회 | `GET /zones` | zoneId 획득 |
| ③ 터널 생성 | `POST /accounts/{id}/cfd_tunnel` | 응답에 id + token 포함 |
| ④ 터널 설정 (ingress) | `PUT /accounts/{id}/cfd_tunnel/{tunnel_id}/configurations` | |
| ⑤ DNS CNAME 레코드 생성 | `POST /zones/{zone_id}/dns_records` | |
| ⑥ cloudflared 실행 | Docker 컨테이너 (토큰 기반) | CLI |

> **중요**: 터널 생성 `POST` 응답에 `token` 필드가 이미 포함되어 있다. 별도의 `GET /token` 호출은 불필요하다. `tunnel_secret` 필드는 선택 사항이며 지정하지 않아도 된다.

```bash
# Account ID 조회
curl -s "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result[0].id'

# Zone ID 조회 (도메인별)
curl -s "https://api.cloudflare.com/client/v4/zones?name=yourdomain.com" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result[0].id'

# 터널 생성
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "brewnet-homeserver",
    "config_src": "cloudflare"
  }' | jq .
```

응답에서 중요한 값:
```json
{
  "result": {
    "id": "c1744f8b-faa1-48a4-9e5c-02ac921467fa",
    "name": "brewnet-homeserver",
    "token": "eyJhIjoiNzE1Y2JhMj..."
  }
}
```

`id` (TUNNEL_ID)와 `token` (TUNNEL_TOKEN)을 응답에서 직접 추출한다.

### 5.3 Ingress 설정

```bash
# 터널 ingress 설정 — 여러 서비스를 하나의 터널로 라우팅
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {
          "hostname": "app.yourdomain.com",
          "service": "http://traefik:80",
          "originRequest": {}
        },
        {
          "hostname": "git.yourdomain.com",
          "service": "http://traefik:80",
          "originRequest": {}
        },
        {
          "hostname": "files.yourdomain.com",
          "service": "http://traefik:80",
          "originRequest": {}
        },
        {
          "service": "http_status:404"
        }
      ]
    }
  }'
```

> **주의**: PUT 요청은 전체 설정을 교체한다. 호스트를 추가할 때는 기존 설정을 GET으로 가져온 후 새 항목을 추가하여 PUT.

### 5.4 DNS CNAME 레코드 생성

터널 설정만으로는 트래픽이 라우팅되지 않는다. 각 hostname에 대해 DNS CNAME 레코드를 별도로 생성해야 한다:

```bash
# 각 서브도메인에 대해 CNAME 레코드 생성
# content: {TUNNEL_ID}.cfargotunnel.com

for SUBDOMAIN in app git files; do
  curl -s -X POST \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"CNAME\",
      \"name\": \"${SUBDOMAIN}\",
      \"content\": \"${TUNNEL_ID}.cfargotunnel.com\",
      \"proxied\": true,
      \"ttl\": 1
    }"
done
```

> **핵심 포인트**: Cloudflare Dashboard에서 Public Hostname을 추가하면 자동으로 DNS 레코드가 생성되지만, API로 터널 설정을 할 때는 **DNS 레코드를 별도로 API로 생성해야 한다**. 이것은 Dashboard가 내부적으로 두 API를 모두 호출하는 것을 API 사용 시 수동으로 해야 하는 것이다.

### 5.5 cloudflared 실행 (Docker)

```yaml
# docker-compose.tunnel.yml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brewnet-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - brewnet
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  brewnet:
    external: true
```

터널 상태 확인:

```bash
# 터널 상태 조회
curl -s "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result.status'

# 터널 커넥터(연결) 목록
curl -s "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}/connections" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq .
```

---

## 6. Docker Compose 통합

### 6.1 생성되는 docker-compose.yml 구조

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# 🍺 Brewnet Home Server Stack
# Generated by: brewnet init
# ═══════════════════════════════════════════════════════════════════════════

networks:
  brewnet:
    name: brewnet
    driver: bridge
  brewnet-internal:
    name: brewnet-internal
    internal: true    # 외부 접근 차단 (DB 등 내부 전용)

services:
  # ═════════════════════════════════════════════════════════════════════
  # CLOUDFLARE TUNNEL — 외부 접근의 유일한 진입점
  # ═════════════════════════════════════════════════════════════════════
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brewnet-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - brewnet
    depends_on:
      traefik:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 15s
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: '0.25'

  # ═════════════════════════════════════════════════════════════════════
  # TRAEFIK — 내부 리버스 프록시
  # ═════════════════════════════════════════════════════════════════════
  traefik:
    image: traefik:v3.0
    container_name: brewnet-proxy
    restart: unless-stopped
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=brewnet"
      - "--entrypoints.web.address=:80"
      - "--log.level=WARN"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - brewnet
    healthcheck:
      test: ["CMD", "traefik", "healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 3

  # ═════════════════════════════════════════════════════════════════════
  # GITEA — Git 서버
  # ═════════════════════════════════════════════════════════════════════
  gitea:
    image: gitea/gitea:latest
    container_name: brewnet-git
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    volumes:
      - ./data/gitea:/data
    environment:
      - GITEA__server__DOMAIN=git.${DOMAIN}
      - GITEA__server__ROOT_URL=https://git.${DOMAIN}/
      - GITEA__server__SSH_DOMAIN=git.${DOMAIN}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gitea.rule=Host(`git.${DOMAIN}`)"
      - "traefik.http.services.gitea.loadbalancer.server.port=3000"

  # ═════════════════════════════════════════════════════════════════════
  # FILEBROWSER — 파일 매니저
  # ═════════════════════════════════════════════════════════════════════
  filebrowser:
    image: filebrowser/filebrowser:latest
    container_name: brewnet-files
    restart: unless-stopped
    networks:
      - brewnet
    volumes:
      - ./data/files:/srv
      - ./config/filebrowser/filebrowser.db:/database.db
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.files.rule=Host(`files.${DOMAIN}`)"
      - "traefik.http.services.files.loadbalancer.server.port=80"
```

### 6.2 .env 파일

```bash
# ═══════════════════════════════════════════════════════════════════════════
# 🍺 Brewnet 환경 변수
# ⚠️ 이 파일은 절대 Git에 커밋하지 마세요
# ═══════════════════════════════════════════════════════════════════════════

# 도메인
DOMAIN=myserver.example.com

# Cloudflare Tunnel 토큰
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 타임존
TZ=Asia/Seoul
```

---

## 7. TypeScript 구현 설계

```typescript
// src/lib/cloudflare/tunnel-manager.ts

interface CloudflareConfig {
  apiToken: string;
  accountId: string;
  zoneId: string;
  domain: string;
}

interface TunnelInfo {
  id: string;
  name: string;
  token: string;
  status: 'healthy' | 'degraded' | 'inactive';
}

interface IngressRule {
  hostname: string;
  service: string;
  originRequest?: Record<string, unknown>;
}

class CloudflareTunnelManager {
  private config: CloudflareConfig;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config: CloudflareConfig) {
    this.config = config;
  }

  // ── Token 검증 ──
  async verifyToken(): Promise<boolean> {
    const res = await this.request('GET', '/user/tokens/verify');
    return res.success && res.result.status === 'active';
  }

  // ── Account & Zone 자동 감지 ──
  async detectAccountId(): Promise<string> {
    const res = await this.request('GET', '/accounts');
    if (res.result.length === 0) throw new Error('No accounts found');
    if (res.result.length === 1) return res.result[0].id;
    return await this.promptAccountSelection(res.result);
  }

  async detectZoneId(domain: string): Promise<string> {
    const res = await this.request('GET', `/zones?name=${domain}`);
    if (res.result.length === 0) {
      throw new Error(`Domain "${domain}" not found in Cloudflare account`);
    }
    return res.result[0].id;
  }

  // ── 터널 생성 ──
  // token은 POST 응답에 이미 포함됨 — 별도 GET 호출 불필요
  async createTunnel(name: string): Promise<TunnelInfo> {
    const res = await this.request(
      'POST',
      `/accounts/${this.config.accountId}/cfd_tunnel`,
      { name, config_src: 'cloudflare' }   // tunnel_secret 선택 사항 — 생략 가능
    );
    return {
      id: res.result.id,
      name: res.result.name,
      token: res.result.token,   // POST 응답에 포함
      status: 'inactive',
    };
  }

  // ── Ingress 설정 ──
  async configureIngress(tunnelId: string, rules: IngressRule[]): Promise<void> {
    const ingress = [
      ...rules.map(r => ({
        hostname: r.hostname,
        service: r.service,
        originRequest: r.originRequest || {},
      })),
      { service: 'http_status:404' },
    ];

    await this.request(
      'PUT',
      `/accounts/${this.config.accountId}/cfd_tunnel/${tunnelId}/configurations`,
      { config: { ingress } }
    );
  }

  // ── DNS 레코드 생성 ──
  async createDnsRecord(subdomain: string, tunnelId: string): Promise<void> {
    const existing = await this.request(
      'GET',
      `/zones/${this.config.zoneId}/dns_records?type=CNAME&name=${subdomain}.${this.config.domain}`
    );

    const record = {
      type: 'CNAME',
      name: subdomain,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
    };

    if (existing.result.length > 0) {
      await this.request('PUT', `/zones/${this.config.zoneId}/dns_records/${existing.result[0].id}`, record);
    } else {
      await this.request('POST', `/zones/${this.config.zoneId}/dns_records`, record);
    }
  }

  // ── 서비스 추가 (ingress + DNS 동시) ──
  async addService(tunnelId: string, subdomain: string, localService: string): Promise<void> {
    const currentConfig = await this.request(
      'GET',
      `/accounts/${this.config.accountId}/cfd_tunnel/${tunnelId}/configurations`
    );

    const existingIngress = currentConfig.result.config.ingress;
    const catchAll = existingIngress.pop();
    existingIngress.push({
      hostname: `${subdomain}.${this.config.domain}`,
      service: localService,
      originRequest: {},
    });
    existingIngress.push(catchAll);

    await this.request(
      'PUT',
      `/accounts/${this.config.accountId}/cfd_tunnel/${tunnelId}/configurations`,
      { config: { ingress: existingIngress } }
    );

    await this.createDnsRecord(subdomain, tunnelId);
  }

  // ── 내부 HTTP 요청 헬퍼 ──
  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
    }
    return data;
  }
}
```

### 서비스별 기본 라우팅 맵

```typescript
const DEFAULT_SERVICE_ROUTES: Record<string, { subdomain: string; port: string }> = {
  dashboard:    { subdomain: 'dash',    port: 'traefik:80' },
  filebrowser:  { subdomain: 'files',   port: 'filebrowser:80' },
  gitea:        { subdomain: 'git',     port: 'gitea:3000' },
  grafana:      { subdomain: 'grafana', port: 'grafana:3000' },
  uptimekuma:   { subdomain: 'status',  port: 'uptime-kuma:3001' },
  adminer:      { subdomain: 'db',      port: 'adminer:8080' },
  authelia:     { subdomain: 'auth',    port: 'authelia:9091' },
};
```

---

## 8. 단계별 사용자 플로우

### 8.1 시나리오 A: 도메인이 없는 사용자 (Quick Tunnel)

```
$ brewnet init

🍺 Welcome to Brewnet - Your server on tap!

Step 1/5: External Access Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? Do you have a domain name? (y/N) n

ℹ️  No domain? No problem! Here are your options:

  1. 🚀 Quick Start (No domain needed)
     └─ Get a temporary URL instantly via Cloudflare Quick Tunnel
     └─ URL changes on every restart (not for production)

  2. 💰 Get a cheap domain ($10/year)
     └─ Register at https://domains.cloudflare.com (at-cost pricing)
     └─ Run 'brewnet domain connect' after registration

? Choose an option: (1)

Starting Quick Tunnel...
✅ Your Brewnet server is temporarily accessible at:
   https://purple-meadow-abc1.trycloudflare.com

⚠️  This URL will change when the server restarts.
    Run 'brewnet domain connect' anytime to set up a permanent URL.
```

### 8.2 시나리오 B: 도메인이 있는 사용자 (Named Tunnel)

```
$ brewnet init

🍺 Welcome to Brewnet - Your server on tap!

Step 1/5: External Access Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? Do you have a domain name? (Y/n) y
? Enter your domain: myserver.example.com

Step 2/5: Cloudflare Setup
━━━━━━━━━━━━━━━━━━━━━━━━━

? Enter your Cloudflare API Token:
  (Create one at: https://dash.cloudflare.com/profile/api-tokens)
  (Required permissions: Tunnel:Edit, DNS:Edit, Account:Read)

  Token: cf_xxxxxxxxxxxxxxxxxxxxx

✅ Token verified successfully
✅ Account: John's Account (id: 7158c...)
✅ Domain: myserver.example.com (zone: a3b2c...)

Step 3/5: Creating Tunnel
━━━━━━━━━━━━━━━━━━━━━━━━

✅ Tunnel "brewnet-homeserver" created
   ID: c1744f8b-faa1-48a4-9e5c-02ac921467fa

Step 4/5: Configuring Services
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? Select services to install:
  ✅ Dashboard     → dash.myserver.example.com
  ✅ File Browser  → files.myserver.example.com
  ✅ Gitea         → git.myserver.example.com
  ✅ Uptime Kuma   → status.myserver.example.com

Configuring tunnel routes... ✅
Creating DNS records... ✅

Step 5/5: Launching
━━━━━━━━━━━━━━━━━━

Starting Docker containers...
  ✅ cloudflared (tunnel)
  ✅ traefik (reverse proxy)
  ✅ filebrowser
  ✅ gitea
  ✅ uptime-kuma

🍺 Brewnet is ready! Your services are live:

  Dashboard:   https://dash.myserver.example.com
  Files:       https://files.myserver.example.com
  Git:         https://git.myserver.example.com
  Status:      https://status.myserver.example.com

  Run 'brewnet status' to check health
  Run 'brewnet service add' to add more services
```

### 8.3 나중에 도메인 연결하기

```
$ brewnet domain connect

? Enter your domain: myserver.example.com
? Enter your Cloudflare API Token: cf_xxxxx

Converting from Quick Tunnel to Named Tunnel...
  ✅ Named tunnel created
  ✅ Ingress rules configured (4 services)
  ✅ DNS records created
  ✅ Quick Tunnel stopped
  ✅ Named tunnel active

🎉 Your permanent URLs are ready:
  https://dash.myserver.example.com
  https://files.myserver.example.com
  https://git.myserver.example.com
  https://status.myserver.example.com
```

---

## 9. 제한사항 및 고려사항

### 9.1 Cloudflare Tunnel 제한사항

| 항목 | 제한 | Brewnet 영향 |
|------|------|-------------|
| HTTP/HTTPS 전용 | TCP/UDP는 WARP 클라이언트 필요 | SSH, DB 직접 접근은 제약 |
| TLS 종료 | Cloudflare Edge에서 TLS 종료 | E2E 암호화 아님 (origin과는 별도 연결) |
| 대용량 미디어 | ToS 위반 가능성 | Jellyfin/Plex 스트리밍 주의 필요 |
| 무료 플랜 제한 | 50 사용자/월 (Zero Trust) | 개인/소규모 사용에 적합 |
| 멀티레벨 와일드카드 | `*.sub.domain.com` → Advanced Certificate 필요 | 단일 레벨 `*.domain.com`은 무료 지원 |
| 업로드 크기 | 무료 플랜 100MB | 대용량 파일 업로드 제한 |

### 9.2 SSH 접근 해법

Cloudflare Tunnel은 SSH도 지원하지만 클라이언트에 `cloudflared access` 설치가 필요:

```yaml
# config.yml에 SSH 추가
ingress:
  - hostname: ssh.myserver.example.com
    service: ssh://localhost:22
```

클라이언트 접속:
```bash
ssh -o ProxyCommand="cloudflared access ssh --hostname ssh.myserver.example.com" user@ssh.myserver.example.com
```

또는 Cloudflare의 Browser-rendered SSH terminal 사용 (웹 브라우저에서 SSH).

### 9.3 보안 고려사항

```bash
# brewnet이 저장하는 민감 정보 — ~/.brewnet/.env (600 권한)
CLOUDFLARE_API_TOKEN=cf_xxxx        # 절대 Git에 커밋하지 않음
CLOUDFLARE_TUNNEL_TOKEN=eyJhxx      # 터널 실행용 토큰
CLOUDFLARE_ACCOUNT_ID=7158cxx       # 계정 식별자
CLOUDFLARE_ZONE_ID=a3b2cxx          # 도메인 Zone 식별자
CLOUDFLARE_TUNNEL_ID=c1744xx        # 터널 식별자
```

### 9.4 Cloudflare 의존성 리스크

- Cloudflare 서비스 장애 시 외부 접근 불가 (로컬 접근은 가능)
- Cloudflare가 서비스/가격 정책 변경 가능
- **완화 전략**: Brewnet은 Cloudflare 없이도 로컬 네트워크에서 완전히 동작해야 함. 외부 접근은 "부가 기능"으로 위치.

### 9.5 API Rate Limits

Cloudflare API는 다음 rate limit이 적용:
- 일반: 1,200 요청/5분 (계정당)
- DNS 레코드 생성: 상동

Brewnet 초기 설정 시 API 호출 수 예상:
- Token 검증: 1회
- Account/Zone 조회: 2회
- 터널 생성: 1회
- 터널 설정: 1회
- DNS 레코드 생성: 서비스 수 × 1회 (보통 4~8회)
- **총: ~15회 이하** → Rate limit 문제 없음

---

## 10. 트러블슈팅

### 10.1 자주 발생하는 문제

| 증상 | 원인 | 해결 방법 |
|------|------|----------|
| **502 Bad Gateway** | 내부 서비스 미시작 또는 네트워크 분리 | `docker compose ps`로 상태 확인, 같은 네트워크인지 검증 |
| **522 Connection Timed Out** | cloudflared 컨테이너 중지됨 | `docker compose restart cloudflared` |
| **"Too Many Redirects"** | Cloudflare SSL 설정이 Flexible | Dashboard → SSL/TLS → **Full** 로 변경 |
| **DNS 미해석** | NS 전파 미완료 또는 CNAME 미생성 | `dig CNAME subdomain.domain.com` 확인, 최대 48시간 대기 |
| **토큰 인증 실패** | .env 파일의 토큰 오류 | 토큰 재확인, 줄바꿈/공백 주의 |
| **컨테이너 간 통신 불가** | Docker 네트워크 불일치 | 모든 서비스가 `brewnet` 네트워크에 속하는지 확인 |

### 10.2 진단 명령어

```bash
# ═══════════════════════════════════════════════════════════════════════
# Brewnet 터널 진단 명령어 모음
# ═══════════════════════════════════════════════════════════════════════

# 1. 전체 서비스 상태
docker compose ps

# 2. Tunnel 로그 (최근 50줄)
docker logs brewnet-tunnel --tail 50

# 3. Tunnel 연결 정보
docker exec brewnet-tunnel cloudflared tunnel info

# 4. 내부 네트워크 확인
docker network inspect brewnet

# 5. DNS 해석 테스트
dig CNAME git.myserver.example.com
nslookup myserver.example.com

# 6. 내부에서 서비스 접근 테스트
docker exec brewnet-tunnel wget -qO- http://traefik:80 --header "Host: git.myserver.example.com"

# 7. Cloudflare SSL 모드 확인
# Dashboard → SSL/TLS → Overview → "Full" 인지 확인

# 8. 전체 재시작
docker compose down && docker compose up -d

# 9. 네트워크 초기화 (극단적 상황)
docker compose down
docker network prune -f
docker compose up -d
```

### 10.3 `brewnet doctor` 터널 진단 통합

```bash
$ brewnet doctor

🔍 Brewnet System Check

  ✓ OS: macOS 15.3 (Apple Silicon)
  ✓ Docker: OrbStack v1.8 (Docker 28.5.2)
  ✓ Docker Compose: v2.30.4
  ✓ Disk: 128GB available

🔒 Tunnel Check

  ✓ cloudflared 컨테이너: 실행 중 (3일 업타임)
  ✓ 터널 연결: 활성 (2개 커넥터)
  ✓ 토큰: 유효함
  ✓ DNS: myserver.example.com → ACTIVE

🌐 Service Check

  ✓ traefik:80        응답 정상 (2ms)
  ✓ gitea:3000        응답 정상 (15ms)
  ✓ filebrowser:80    응답 정상 (8ms)
  ✓ uptime-kuma:3001  응답 정상 (12ms)

  All checks passed! 🍺
```

---

## 11. 구현 로드맵

| Phase | 태스크 | 의존성 |
|:-----:|--------|--------|
| **1** | `detectDockerRuntime()` — OrbStack/Docker 감지 | 없음 |
| **2** | `brewnet tunnel setup` — 대시보드 가이드 모드 | Phase 1 |
| **3** | Cloudflare API 클라이언트 구현 | 없음 |
| **4** | `brewnet tunnel setup` — API 자동화 모드 | Phase 3 |
| **5** | Docker Compose 생성기 (Tunnel + Traefik) | Phase 2 |
| **6** | `brewnet tunnel status` / `brewnet doctor` | Phase 5 |
| **7** | `brewnet expose add/remove` | Phase 4 |
| **8** | `brewnet secure` — Cloudflare Access 연동 | Phase 4 |
| **9** | 테스트 및 문서화 | 전체 |

---

## 12. 참고 자료

### 공식 문서
- [Cloudflare API Reference](https://developers.cloudflare.com/api/)
- [Cloudflare Tunnel Overview](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Create Tunnel via API](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)
- [Quick Tunnels (TryCloudflare)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [API Token Creation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [DNS Records API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
- [cloudflared Docker Hub](https://hub.docker.com/r/cloudflare/cloudflared)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)

### 커뮤니티 참고
- [Add public hostname to tunnel via API](https://community.cloudflare.com/t/add-public-host-name-to-tunnel-via-api/483098) — API로 tunnel config + DNS 레코드 동시 생성하는 실전 예제
- [Tunnel without domain](https://community.cloudflare.com/t/tunnel-without-domain/372778) — 도메인 없이 터널 사용에 대한 커뮤니티 논의

---

*작성일: 2026-02-28*
*상태: 최종 (두 문서 통합 + 오류 수정)*
*brewnet.dev — Your server on tap. Just brew it.*
