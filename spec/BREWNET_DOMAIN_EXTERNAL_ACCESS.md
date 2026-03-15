# Brewnet — 로컬 확인 이후 외부 도메인 연결 완전 가이드

> **문서 목적**: 로컬에서 서버 기동 확인 후 → 도메인 구매/연결 → Cloudflare Tunnel 외부 접속까지 3가지 시나리오 기술 정리 및 Brewnet 자동화 구현 방안  
> **사이트**: brewnet.dev | **문의**: brewnet.dev@gmail.com  
> **라이선스**: Business Source License 1.1 | **최종 수정**: 2026-03-13

---

## 전체 시나리오 분류

```
[로컬 서버 기동 확인 완료]
          │
          ├─── 시나리오 A: 새 도메인 구매
          │         ├─ A-1: Cloudflare Registrar에서 직접 구매  (가장 간단)
          │         └─ A-2: GoDaddy에서 구매 → Cloudflare NS 이전
          │
          ├─── 시나리오 B: 기존 도메인 있음 (타 등록기관) → Cloudflare 네임서버 이전
          │
          └─── 시나리오 C: 기존 도메인 있음 (네임서버 변경 불가) → CNAME only 터널 연결

각 시나리오 공통 최종 결과:
  ✅ https://my-api.yourdomain.com → 홈서버 컨테이너 라우팅
  ✅ HTTPS 자동 적용 (Cloudflare SSL)
  ✅ 포트포워딩 불필요 (Cloudflare Tunnel)
  ✅ 실제 IP 숨김
```

---

## STEP 0: 로컬 동작 확인 체크리스트

Cloudflare 연결 전 반드시 로컬에서 먼저 확인합니다.

```bash
# 1. 컨테이너 상태 확인
docker ps | grep brewnet-my-api
# 출력: brewnet-my-api   Up 2 minutes   0.0.0.0:8080->8080/tcp

# 2. 로컬 헬스체크
curl http://localhost:8080/health
# 출력: {"status":"ok"}  ← 이게 나와야 다음 단계 진행 가능

# 3. Traefik 네트워크 확인
docker network inspect brewnet-network
# my-api 컨테이너가 network에 있는지 확인

# 4. Traefik 로컬 라우팅 확인 (dnsmasq 설정된 경우)
curl http://my-api.brewnet.local/health
# 위가 안 되면 직접 포트로: curl http://localhost:8080/health
```

---

## 시나리오 A: 새 도메인 구매

### A-1. Cloudflare Registrar에서 직접 구매 (권장)

> DNS 관리가 Cloudflare에서 바로 시작되므로 네임서버 이전 대기 시간이 없습니다.  
> 단, `.com` / `.net` / `.org` / `.dev` 등 일반 TLD 지원, `.io`는 미지원입니다.

#### 지원 TLD 및 가격 확인

```
Cloudflare Registrar 가격 확인:
  https://www.cloudflare.com/products/registrar/

주요 TLD 참고 가격 (at-cost, 마진 없음):
  .com   $8.57/년
  .net   $10.44/년
  .org   $9.93/년
  .dev   $9.93/년
  .app   $11.96/년

⚠️  .io는 Cloudflare Registrar 미지원
    → GoDaddy 등 타 등록기관 구매 후 A-2 방식 적용
```

#### 구매 절차

```
1. https://dash.cloudflare.com 로그인 (없으면 가입)
2. 좌측 메뉴 → "Domain Registration" → "Register Domains"
3. 원하는 도메인 검색 → 사용 가능 확인 → Add to Cart
4. 결제 정보 입력 (카드 / PayPal)
5. 구매 완료 즉시:
   - Cloudflare DNS에 Zone 자동 생성
   - 네임서버 이전 없이 바로 DNS 레코드 추가 가능
   - Active 상태로 즉시 사용

→ STEP 1 (Cloudflare Tunnel 생성)으로 바로 이동
```

---

### A-2. GoDaddy에서 구매 → Cloudflare 네임서버 이전

> `.io`, `.co`, `.me` 등 Cloudflare Registrar 미지원 TLD가 필요하거나  
> GoDaddy에서 이미 좋은 도메인을 찾은 경우에 사용합니다.

#### 도메인 구매

```
1. https://www.godaddy.com 접속
2. 원하는 도메인 검색 → 장바구니 추가
3. 결제 완료 (연간 또는 2년 단위 권장)
   ⚠️  자동 갱신 설정 확인 필수 — 깜빡하면 도메인 만료됨

GoDaddy 1년차 할인 주의:
  1년차: $0.99~$2.99 (프로모션)
  2년차~: 정가 ($15~$25/년 수준)
  → 비용 계획 시 정가 기준으로 산정
```

#### Cloudflare에 도메인 추가

```
1. https://dash.cloudflare.com → "Add a site" → 구매한 도메인 입력
2. Free Plan 선택
3. Cloudflare가 기존 DNS 레코드 자동 스캔 (GoDaddy 파킹 레코드 등)
   → 스캔 결과 검토: 불필요한 레코드 삭제, 누락 레코드 추가
4. Continue 클릭
5. Cloudflare 네임서버 2개 확인 및 복사:
   예) liz.ns.cloudflare.com
       tim.ns.cloudflare.com
   ⚠️  계정마다 다름, 반드시 본인 화면에서 확인
```

#### GoDaddy 네임서버 변경

```
GoDaddy My Products → 해당 도메인 → DNS → Nameservers → Change

방법 선택: "Enter my own nameservers (advanced)"
  삭제: 기존 GoDaddy 네임서버 (ns1.domaincontrol.com 등)
  추가: liz.ns.cloudflare.com  ← Cloudflare에서 복사한 값
  추가: tim.ns.cloudflare.com  ← Cloudflare에서 복사한 값
Save 클릭

전파 대기: 보통 수 분~최대 24시간
```

#### 네임서버 전파 확인

```bash
dig NS yourdomain.com +short
# 정상: liz.ns.cloudflare.com. / tim.ns.cloudflare.com.

# Cloudflare 대시보드: 도메인 상태가 "Active"로 바뀌면 완료
```

---

## 시나리오 B: 기존 도메인 → Cloudflare 네임서버 이전 (Full Setup)

> 권장 방법. 기존 도메인(예: mydomain.com)을 Cloudflare DNS로 완전 이전.

### B-1. 기존 DNS 레코드 백업

```bash
# 이전 전 기존 레코드 백업 (zone file 형식)
# 대부분 등록기관 → DNS 관리 → Export/Zone File 기능 제공

# 수동 확인
dig mydomain.com ANY +short
dig www.mydomain.com +short
dig mail.mydomain.com +short
```

### B-2. Cloudflare에 도메인 추가

```
1. https://dash.cloudflare.com → Add a Site → mydomain.com 입력
2. Free Plan 선택
3. Cloudflare가 기존 DNS 레코드를 자동 스캔하여 가져옴
   ⚠️  스캔 결과 검토: 누락된 레코드 수동 추가 (MX, TXT 등)
4. Continue 클릭
5. Cloudflare 네임서버 2개 확인 및 복사:
   예) liz.ns.cloudflare.com
       tim.ns.cloudflare.com
```

### B-3. 등록기관에서 네임서버 변경

각 등록기관별 네임서버 변경 위치:

| 등록기관 | 네임서버 변경 경로 |
|---------|-----------------|
| **GoDaddy** | My Products → DNS → Nameservers → Change |
| **Namecheap** | Domain List → Manage → Nameservers → Custom DNS |
| **Porkbun** | Domains → NS Records → Edit |
| **Cafe24 (한국)** | 도메인 관리 → 네임서버 설정 → 외부 네임서버 |
| **가비아 (한국)** | 도메인 → 네임서버 설정 → 직접 입력 |
| **후이즈 (한국)** | 도메인 관리 → DNS 설정 → 네임서버 변경 |

```
설정 값:
  기존 네임서버 모두 삭제
  추가: liz.ns.cloudflare.com  ← Cloudflare에서 제공한 값
  추가: tim.ns.cloudflare.com  ← Cloudflare에서 제공한 값

⚠️  중요: Cloudflare 계정마다 네임서버가 다름
     반드시 본인 Cloudflare 화면의 값 사용
```

### B-4. 전파 확인 (보통 1~24시간)

```bash
dig NS mydomain.com +short
# 정상: liz.ns.cloudflare.com. / tim.ns.cloudflare.com.

# Cloudflare 대시보드: 도메인 상태가 "Active"로 바뀌면 완료
```

---

## 시나리오 C: 기존 도메인 + 네임서버 변경 불가 (CNAME Tunnel)

> 네임서버를 바꾸지 않고도 터널 연결 가능.  
> 서브도메인 단위로 CNAME 레코드만 기존 DNS에 추가.

### 언제 사용하는가

```
- 기존 DNS에 중요한 레코드가 많아서 이전이 부담스러울 때
- 회사/팀 도메인이라 네임서버 변경 권한이 없을 때
- 특정 서브도메인만 홈서버로 연결하고 싶을 때
- 이메일 서버 설정이 복잡해서 이전 리스크가 클 때
```

### ⚠️ 제약사항 (중요)

```
❌ Cloudflare Partial Setup (CNAME Zone): Business 플랜 이상 필요 ($240/년)
   → 무료 플랜에서는 기존 DNS Provider + Cloudflare 프록시 동시 사용 불가

✅ 그러나 Cloudflare Tunnel은 무료로 다음 방법으로 사용 가능:
   기존 DNS에서 CNAME 레코드를 터널 UUID로 직접 포인팅

방법: 기존 DNS에 CNAME 추가
  my-api.mydomain.com → CNAME → {tunnel-uuid}.cfargotunnel.com
  → Cloudflare 네임서버 필요 없음
  → SSL은 Cloudflare Origin Certificate 또는 Let's Encrypt 별도 필요
```

### C-1. 터널 UUID 확인 후 기존 DNS에 CNAME 추가

```bash
# Cloudflare API로 터널 UUID 확인
curl https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel \
  -H "Authorization: Bearer $CF_API_TOKEN"

# 응답에서 id 값이 tunnel UUID
# 예: "id": "6ff42ae2-765d-11ec-90d6-0242ac120003"
```

```
기존 DNS Provider (가비아, GoDaddy, Namecheap 등)에서:
  레코드 타입: CNAME
  이름(Host): my-api   (→ my-api.mydomain.com)
  값(Value): 6ff42ae2-765d-11ec-90d6-0242ac120003.cfargotunnel.com
  TTL: 300 (5분)
```

---

## STEP 1: Cloudflare Tunnel 생성 (공통)

시나리오 A, B, C 모두 Tunnel 생성 방법은 동일합니다.

### 방법 1: Cloudflare 대시보드 (권장 - 최초 1회)

```
1. https://one.dash.cloudflare.com 접속 (Zero Trust)
2. Networks → Connectors → Cloudflare Tunnels → Create a tunnel
3. Connector type: Cloudflared 선택
4. Tunnel name: brewnet-homeserver (식별하기 쉬운 이름)
5. Save tunnel
6. Install connector 화면에서 토큰 복사:

   cloudflared service install eyJhIjoiYWJj...  ← eyJ... 이후 전체 문자열

⚠️  토큰은 반드시 .env 파일에 저장, 절대 Git 커밋 금지
```

### 방법 2: Cloudflare API (Brewnet 자동화용)

```bash
# 터널 생성 API
# 필요 권한: Cloudflare Tunnel:Edit, Account Settings:Read

curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "brewnet-homeserver",
    "tunnel_secret": "AQIDBAUGBwgBAgMEBQYHCAECAwQFBgcIAQIDBAUGBwg="
  }'

# 응답 예시
# {
#   "result": {
#     "id": "6ff42ae2-765d-11ec-90d6-0242ac120003",  ← TUNNEL_ID
#     "name": "brewnet-homeserver",
#     "token": "eyJhIjoiYWJj..."                      ← TUNNEL_TOKEN (컨테이너 실행용)
#   }
# }
```

---

## STEP 2: cloudflared 컨테이너 기동

### Docker Compose (Brewnet 통합 방식)

```yaml
# ~/.brewnet/docker-compose.yml (Brewnet 공통 스택에 추가)

services:
  # ============================================================
  # Cloudflare Tunnel
  # ============================================================
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brewnet-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - brewnet-network
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 60s
      timeout: 15s
      retries: 3
      start_period: 30s
    depends_on:
      traefik:
        condition: service_healthy

  # ============================================================
  # Traefik (기존 설정 유지)
  # ============================================================
  traefik:
    image: traefik:v3.0
    container_name: brewnet-traefik
    # ... (기존 설정)
    # cloudflared → traefik:80 → 각 앱 컨테이너
    networks:
      - brewnet-network
```

### .env 파일

```bash
# ~/.brewnet/.env
# chmod 600 ~/.brewnet/.env  ← 반드시 실행

CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiYWJjZGVm...  # Cloudflare에서 복사한 토큰
CF_ACCOUNT_ID=abc123def456...                  # Cloudflare 계정 ID
CF_API_TOKEN=your_api_token_here...            # API 자동화용 토큰
CF_ZONE_ID=xyz789...                           # 도메인 Zone ID
CF_TUNNEL_ID=6ff42ae2-765d-...                 # 생성된 터널 ID
```

---

## STEP 3: Public Hostname 연결 (앱 → 도메인 매핑)

하나의 터널로 여러 앱을 서브도메인별로 라우팅합니다.

### 방법 1: Cloudflare 대시보드 (수동)

```
Zero Trust → Networks → Tunnels → brewnet-homeserver → Public Hostname → Add

서비스별 설정:
┌─────────────────────────────────────────────────────────────┐
│  Subdomain  │ Domain          │ Type │ URL              │
├─────────────┼─────────────────┼──────┼──────────────────┤
│  my-api     │ yourdomain.com  │ HTTP │ traefik:80       │
│  git        │ yourdomain.com  │ HTTP │ traefik:80       │
│  dashboard  │ yourdomain.com  │ HTTP │ traefik:80       │
│  jellyfin   │ yourdomain.com  │ HTTP │ traefik:80       │
└─────────────────────────────────────────────────────────────┘

모든 URL이 traefik:80으로 가는 이유:
  cloudflared → traefik (Host 헤더로 구분) → 각 앱 컨테이너
  Host: my-api.yourdomain.com → traefik이 brewnet-my-api로 라우팅
```

### 방법 2: API 완전 자동화 (Brewnet 핵심 구현)

새 앱 도메인 연결 시 `brewnet domain connect` 한 번으로 처리되는 2개 API 호출:

```typescript
// src/cloudflare/domain-connect.ts

interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  zoneId: string;
  tunnelId: string;
}

/**
 * 앱 생성 시 자동으로 호출되는 도메인 연결 함수
 * 1. 터널 ingress 규칙 추가
 * 2. CNAME DNS 레코드 생성
 */
async function connectAppToDomain(
  appName: string,
  domain: string,
  traefikUrl: string,  // 예: "http://traefik:80"
  config: CloudflareConfig
): Promise<string> {

  // ── Step 1: 터널 ingress 설정 업데이트 ─────────────────────
  const existingConfig = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}/configurations`,
    { headers: { 'Authorization': `Bearer ${config.apiToken}` } }
  ).then(r => r.json());

  const hostname = `${appName}.${domain}`;

  const newIngress = {
    hostname,
    service: traefikUrl,
    originRequest: {
      httpHostHeader: hostname,  // Traefik이 Host 헤더로 라우팅
    }
  };

  const existingIngress = existingConfig.result?.config?.ingress || [];
  const catchAll = existingIngress.find((r: any) => !r.hostname);
  const otherRules = existingIngress.filter((r: any) => r.hostname && r.hostname !== hostname);

  const updatedIngress = [
    ...otherRules,
    newIngress,
    catchAll || { service: 'http_status:404' }  // catch-all 항상 마지막
  ];

  // PUT으로 전체 config 업데이트 (개별 추가 API 없음 → 전체 교체 방식)
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}/configurations`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: { ingress: updatedIngress } }),
    }
  );

  // ── Step 2: DNS CNAME 레코드 생성 ──────────────────────────
  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: appName,                                    // my-api
        content: `${config.tunnelId}.cfargotunnel.com`,  // UUID.cfargotunnel.com
        proxied: true,                                    // Cloudflare 프록시 활성화
        comment: `Brewnet app: ${appName}`,
      }),
    }
  );

  return `https://${hostname}`;
}

/**
 * 앱 삭제 시 자동 정리
 */
async function disconnectAppFromDomain(
  appName: string,
  domain: string,
  config: CloudflareConfig
): Promise<void> {
  const hostname = `${appName}.${domain}`;

  // 1. 터널 ingress에서 해당 규칙 제거 (GET → 필터 → PUT)
  const existingConfig = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}/configurations`,
    { headers: { 'Authorization': `Bearer ${config.apiToken}` } }
  ).then(r => r.json());

  const updatedIngress = (existingConfig.result?.config?.ingress || [])
    .filter((r: any) => r.hostname !== hostname);

  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}/configurations`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { ingress: updatedIngress } }),
    }
  );

  // 2. DNS CNAME 레코드 삭제
  const dnsRecords = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records?type=CNAME&name=${hostname}`,
    { headers: { 'Authorization': `Bearer ${config.apiToken}` } }
  ).then(r => r.json());

  for (const record of dnsRecords.result || []) {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records/${record.id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${config.apiToken}` },
      }
    );
  }
}
```

### API 토큰 권한 설정

```
Cloudflare 대시보드 → My Profile → API Tokens → Create Token → Custom Token

필요 권한:
  Account:
    ✅ Cloudflare Tunnel:Edit
    ✅ Account Settings:Read
  Zone (yourdomain.com):
    ✅ DNS:Edit
    ✅ Zone:Read

토큰 IP 제한 (선택, 보안 강화):
  홈서버 외부 IP로 제한하면 토큰 유출 시 피해 최소화
```

---

## STEP 4: Traefik ↔ Cloudflare 연동 상세

cloudflared는 Traefik을 통해 각 앱에 접근합니다.

```
외부 요청 흐름:
사용자 브라우저
    │ https://my-api.yourdomain.com
    ▼
Cloudflare Edge (DDoS 보호, SSL 종료)
    │ 내부 터널
    ▼
cloudflared 컨테이너
    │ http://traefik:80  (Host: my-api.yourdomain.com)
    ▼
Traefik
    │ Host(`my-api.yourdomain.com`) 매칭
    ▼
brewnet-my-api 컨테이너 :8080
```

### Traefik docker-compose.yml 라벨 (앱별)

```yaml
# 로컬 전용 라벨
- "traefik.http.routers.my-api-local.rule=Host(`my-api.brewnet.local`)"
- "traefik.http.routers.my-api-local.entrypoints=web"

# 외부 도메인 라벨 (Cloudflare 연결 시 자동 추가)
- "traefik.http.routers.my-api-external.rule=Host(`my-api.yourdomain.com`)"
- "traefik.http.routers.my-api-external.entrypoints=web"
- "traefik.http.services.my-api.loadbalancer.server.port=8080"
```

### Brewnet 자동 라벨 생성

```typescript
// src/traefik/label-generator.ts

function generateExternalLabels(appName: string, externalDomain: string, port: number) {
  const routerName = `${appName}-external`;
  return {
    [`traefik.http.routers.${routerName}.rule`]: `Host(\`${appName}.${externalDomain}\`)`,
    [`traefik.http.routers.${routerName}.entrypoints`]: 'web',
    [`traefik.http.services.${appName}.loadbalancer.server.port`]: String(port),
  };
}
```

---

## STEP 5: 도메인 연결 검증

### CLI 검증 명령어

```bash
# 1. DNS 전파 확인
dig my-api.yourdomain.com CNAME +short
# 정상: 6ff42ae2-765d-11ec-90d6-0242ac120003.cfargotunnel.com.

# 2. HTTPS 접근 확인
curl -I https://my-api.yourdomain.com/health
# 정상: HTTP/2 200
#       cf-ray: xxxxxxxxxx  ← Cloudflare를 통했다는 증거

# 3. Cloudflare 헤더 확인
curl -s -D - https://my-api.yourdomain.com/health | grep -E "cf-ray|server|x-served"

# 4. 터널 상태 확인
docker logs brewnet-cloudflared | tail -20
# 정상: INF Connection registered connIndex=0~3 (4개 연결 = 고가용성)
```

---

## Brewnet Dashboard UI — 도메인 연결 플로우

```
[Step 1] App Detail → Overview 탭
  ● Running  http://my-api.brewnet.local  [Open →]
  "로컬에서 정상 동작을 확인했습니다. 외부에 공개하시겠습니까?"
  [  🌐 Connect External Domain  ]  ← 이 버튼 클릭

[Step 2] Domain Connection 모달
  ┌──────────────────────────────────────────────────────────────┐
  │  🌐 Connect External Domain for my-api                       │
  ├──────────────────────────────────────────────────────────────┤
  │                                                              │
  │  Domain:     [ yourdomain.com              ]                 │
  │  Subdomain:  [ my-api  ].yourdomain.com                      │
  │  Preview:    https://my-api.yourdomain.com                   │
  │                                                              │
  │  Cloudflare API Token:  [ ****...****  ] [Paste] [Verify ✓] │
  │                                                              │
  │  💡 도메인이 없으신가요?                                       │
  │     Cloudflare Registrar 또는 GoDaddy에서 구매 후 돌아오세요.  │
  │                                                              │
  │  [  Cancel  ]               [  Connect →  ]                 │
  └──────────────────────────────────────────────────────────────┘

[Step 3] 자동 처리 진행 모달
  ✅ Cloudflare API 연결 확인
  ✅ 터널 ingress 규칙 추가 (my-api.yourdomain.com → traefik:80)
  ✅ DNS CNAME 레코드 생성 (my-api → {uuid}.cfargotunnel.com)
  ✅ Traefik 라벨 업데이트
  ⏳ DNS 전파 확인 중...
  ✅ https://my-api.yourdomain.com 접속 확인

[Step 4] 완료 화면
  ┌──────────────────────────────────────────────────────────────┐
  │  ✅ 외부 도메인 연결 완료!                                     │
  │                                                              │
  │  🌐 https://my-api.yourdomain.com                            │
  │                                         [Open in Browser →]  │
  │                                         [Copy URL 📋]        │
  │                                                              │
  │  🔒 HTTPS 자동 적용  🛡️ DDoS 보호  🌍 Cloudflare CDN         │
  └──────────────────────────────────────────────────────────────┘
```

---

## Brewnet CLI — 도메인 연결 명령어

```bash
# 로컬 앱을 외부 도메인에 연결
brewnet domain connect my-api --domain my-api.yourdomain.com

# 실행 시 내부 처리:
# 1. Cloudflare API로 터널 ingress 업데이트
# 2. DNS CNAME 레코드 자동 생성
# 3. Traefik 라벨 자동 업데이트
# 4. docker compose up -d (서비스 재시작 없이 config reload)

# 도메인 제거
brewnet domain disconnect my-api

# 연결된 도메인 목록
brewnet domain list

# 도메인 상태 확인
brewnet domain status my-api
# 출력:
# my-api
#   Local:    http://my-api.brewnet.local    ✅
#   External: https://my-api.yourdomain.com  ✅
#   Tunnel:   brewnet-homeserver             ✅ (4 connections)
#   DNS:      my-api CNAME → 6ff4...cfargotunnel.com ✅
```

---

## 기술 주의사항 정리

### 보안

```
⚠️  CF_API_TOKEN 권한 최소화
    - Zone DNS:Edit는 특정 Zone(도메인)으로 제한
    - Cloudflare Tunnel:Edit는 특정 Account로 제한
    - 토큰 IP 제한: 홈서버 공인 IP로 제한 권장

⚠️  cloudflared 컨테이너 격리
    - brewnet-network 외부 네트워크 접근 차단
    - traefik:80으로만 트래픽 전달

⚠️  Traefik exposedByDefault=false 유지
    - Traefik 라벨이 명시된 컨테이너만 외부 노출
    - 실수로 내부 서비스가 노출되는 것 방지
```

### Cloudflare ToS 주의사항

```
📌  Cloudflare 무료 플랜 Terms of Service 제약:
    - 대용량 미디어 스트리밍 (Jellyfin 등) → ToS 위반 가능성
      → 해결책: Cloudflare Tunnel 우회 + 직접 포트 혼용
      → Jellyfin 같은 미디어 서버는 포트포워딩 + Let's Encrypt 권장
    - 일반 웹 앱, API, Git 서버 → 문제 없음
```

### DNS 전파 시간

```
DNS 레코드 생성 → 전파 완료까지:
  - Cloudflare 관리 도메인 (Full Setup): 즉시~1분
  - 기존 DNS Provider (시나리오 C): TTL 시간만큼 (보통 5분~1시간)
  - 초기 네임서버 변경 (시나리오 A-2, B): 수 분~24시간

Brewnet 처리 방법:
  - DNS 생성 후 최대 60초 폴링으로 전파 확인
  - 전파 미완료 시 "DNS가 전파되는 중입니다 (보통 몇 분)" 안내
  - 전파 완료 시 브라우저 자동 열기
```

### API 토큰 관리

```
초기 설정 시 사용자가 최초 1회만 수동으로 수행:
  Cloudflare → My Profile → API Tokens → Create Token
  → 토큰을 Brewnet Dashboard의 Settings에 붙여넣기
  → ~/.brewnet/config.yml에 저장 (chmod 600)

이후 모든 도메인 연결/해제는 자동화
```

---

## 시나리오별 비교표

| 항목 | A-1 (CF Registrar) | A-2 (GoDaddy → CF) | B (기존 도메인 이전) | C (CNAME only) |
|------|:------------------:|:------------------:|:-------------------:|:--------------:|
| 도메인 비용 | at-cost (마진 없음) | 등록기관 정가 | 기존 비용 유지 | 기존 비용 유지 |
| 네임서버 변경 | ❌ 불필요 | ✅ 필요 | ✅ 필요 | ❌ 불필요 |
| Cloudflare 플랜 | Free | Free | Free | Free |
| 자동 DNS 생성 | ✅ 가능 | ✅ 가능 | ✅ 가능 | ⚠️ 기존 DNS에서 수동 |
| SSL | ✅ 자동 | ✅ 자동 | ✅ 자동 | ✅ 자동 (터널 경유) |
| 초기 설정 시간 | 즉시 | 수 분~24시간 | 수 분~24시간 | 즉시 |
| 설정 난이도 | ⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Brewnet 자동화 | ✅ 완전 | ✅ 완전 | ✅ 완전 | △ 부분 (DNS 수동) |
| 권장 대상 | 신규 도메인 구매 | .io 등 CF 미지원 TLD | 도메인 보유자 | 기업/팀 도메인 |

---

## CLAUDE.md (Claude Code 에이전트용 컨텍스트)

```markdown
# Brewnet Domain Connection — Claude Code Context

## 작업 범위
로컬 앱 → Cloudflare Tunnel → 외부 도메인 자동 연결 기능 구현

## 도메인 획득 전제
- 시나리오 A-1: Cloudflare Registrar에서 직접 구매 (권장)
- 시나리오 A-2: GoDaddy 등 타 등록기관 구매 → Cloudflare NS 이전
- 시나리오 B: 기존 도메인 → Cloudflare NS 이전
- 시나리오 C: 기존 도메인 (NS 변경 불가) → CNAME only
- DigitalPlat 무료 도메인은 지원하지 않음

## 핵심 파일
- src/cloudflare/domain-connect.ts : 터널 ingress + DNS API 자동화
- src/cloudflare/api-client.ts     : Cloudflare API 래퍼
- src/traefik/label-generator.ts   : 외부 도메인 Traefik 라벨 생성

## API 엔드포인트
터널 설정 GET/PUT:
  GET/PUT https://api.cloudflare.com/client/v4/accounts/{id}/cfd_tunnel/{tunnel_id}/configurations

DNS 레코드 생성:
  POST https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records
  Body: { type: "CNAME", name: "{subdomain}", content: "{tunnel_id}.cfargotunnel.com", proxied: true }

## 중요 제약
1. 터널 ingress 업데이트는 개별 추가 API 없음 → 반드시 GET 후 전체 PUT 방식
2. catch-all 규칙({ service: 'http_status:404' })은 항상 마지막에 위치
3. DNS CNAME은 터널 설정과 독립적 → 반드시 별도 API 호출로 생성
4. API 토큰은 ~/.brewnet/config.yml에만 저장 (chmod 600)
```

---

**문서 관리**: brewnet.dev | contact: brewnet.dev@gmail.com  
**라이선스**: Business Source License 1.1 → Apache 2.0 (2029)
