# Cloudflare 도메인 구입 → Named Tunnel 연동 시나리오 가이드

> brewnet 구현 기반 문서. 도메인 구입부터 Named Tunnel 완전 연동까지의 전체 흐름을 단계별로 기록합니다.
> 이 문서는 Named Tunnel 구현 및 테스트 계획의 기준 스펙으로 사용됩니다.

**작성일**: 2026-03-04 | **브랜치**: feature/boilerplate
**참조**: [Cloudflare Registrar Docs](https://developers.cloudflare.com/registrar/get-started/register-domain/) · [Tunnel API Docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)

---

## 목차

1. [시나리오 개요](#1-시나리오-개요)
2. [사전 조건](#2-사전-조건)
3. [Phase A — Cloudflare Registrar로 도메인 구입 (권장)](#3-phase-a--cloudflare-registrar로-도메인-구입-권장)
4. [Phase B — 외부 Registrar 도메인을 Cloudflare DNS로 이전](#4-phase-b--외부-registrar-도메인을-cloudflare-dns로-이전)
5. [Phase C — API 토큰 생성](#5-phase-c--api-토큰-생성)
6. [Phase D — Named Tunnel 생성 (API 플로우)](#6-phase-d--named-tunnel-생성-api-플로우)
7. [Phase E — 인그레스 설정 및 DNS CNAME 등록](#7-phase-e--인그레스-설정-및-dns-cname-등록)
8. [Phase F — cloudflared 컨테이너 실행](#8-phase-f--cloudflared-컨테이너-실행)
9. [Phase G — 헬스체크 및 서비스 접속 검증](#9-phase-g--헬스체크-및-서비스-접속-검증)
10. [brewnet init 통합 매핑](#10-brewnet-init-통합-매핑)
11. [brewnet domain connect 통합 매핑](#11-brewnet-domain-connect-통합-매핑)
12. [갭 분석 — 미구현 / 미테스트 항목](#12-갭-분석--미구현--미테스트-항목)
13. [테스트 계획](#13-테스트-계획)

---

## 1. 시나리오 개요

### 전체 플로우 요약

```
사용자
  │
  ├── [A] Cloudflare Registrar에서 도메인 구입
  │   └── DNS 자동 활성화 (~30초)
  │
  └── [B] 외부 Registrar에서 구입한 경우
      └── Cloudflare에 도메인 추가 → 네임서버 변경 → 전파 대기 (최대 24시간)
  │
  ├── [C] API 토큰 생성 (Tunnel:Edit + DNS:Edit + Zone:Read)
  │
  ├── [D] Named Tunnel 생성
  │   └── POST /accounts/{accountId}/cfd_tunnel → tunnelId + tunnelToken
  │
  ├── [E] 인그레스 설정 + DNS CNAME 레코드 등록
  │   ├── PUT /accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations
  │   └── POST /zones/{zoneId}/dns_records (subdomain per service)
  │
  ├── [F] cloudflared 컨테이너 실행
  │   └── docker run -e TUNNEL_TOKEN=<token> cloudflare/cloudflared tunnel run
  │
  └── [G] 헬스체크
      └── GET /accounts/{accountId}/cfd_tunnel/{tunnelId} → status: "healthy"
```

### 두 가지 진입 경로

| 경로 | 진입점 | 적용 시나리오 |
|------|--------|--------------|
| **Init-time** | `brewnet init` Step 4 | Scenario 2, 3 |
| **Post-install** | `brewnet domain connect` | Scenario 1→Named, 4→DNS |

---

## 2. 사전 조건

| 조건 | 설명 | 없을 때 |
|------|------|---------|
| Docker 설치 & 실행 | cloudflared 컨테이너 실행 필요 | Step 0 시스템 체크에서 차단 |
| Cloudflare 계정 (Free) | API 토큰 발급 + 터널 관리 | 계정 생성 안내 표시 |
| 도메인 소유 | DNS zone 필요 | Phase A 또는 B 안내 |
| API 토큰 | Tunnel:Edit + DNS:Edit + Zone:Read | Phase C 안내 |

> **비용**: Cloudflare 계정 무료 · 터널 무료 · 도메인 $8~15/년 (.com 기준)

---

## 3. Phase A — Cloudflare Registrar로 도메인 구입 (권장)

Cloudflare Registrar에서 직접 구입하면 DNS가 자동으로 Cloudflare에 연결되어 네임서버 전파 대기 없이 바로 사용 가능합니다.

### 단계

```
1. https://dash.cloudflare.com → 로그인 또는 계정 생성

2. 왼쪽 사이드바 → "Domain Registration" → "Register Domains"

3. 도메인 이름 검색 (예: myserver.com)
   └── 사용 가능한 도메인 목록 표시

4. 원하는 도메인 선택 → "Purchase" 클릭

5. 등록 기간 선택 (1~10년)

6. 연락처 정보 입력
   - 영문 ASCII 문자만 허용
   - 이름은 최소 2자 이상

7. 결제 수단 선택 → "Complete purchase"

8. 처리 완료 (최대 30초)
   └── 브라우저가 도메인 관리 페이지로 자동 이동
```

### 결과 상태

- DNS zone이 **즉시 active** 상태로 설정됨
- Cloudflare nameserver가 자동 적용 → 네임서버 변경 불필요
- API 토큰으로 즉시 zone 접근 가능

### brewnet 화면 표시

```
  도메인 구입 안내

  1. https://dash.cloudflare.com → 로그인 또는 계정 생성
  2. 도메인 검색 → 등록 (연 $8~15 수준, .com 기준)
  3. 도메인이 Cloudflare 네임서버로 자동 설정됩니다
  4. 등록 완료까지 1~5분 소요

  도메인 설정 완료 후 Enter를 누르세요: _
```

---

## 4. Phase B — 외부 Registrar 도메인을 Cloudflare DNS로 이전

Namecheap, GoDaddy 등 외부 Registrar에서 구입한 도메인을 Cloudflare DNS로 이전하는 경우입니다.

### 단계

```
1. Cloudflare 대시보드 → "Add a site" (또는 "Add domain")

2. 도메인 이름 입력 → Continue

3. 플랜 선택 → Free 선택 → Continue

4. Cloudflare가 기존 DNS 레코드를 자동 스캔하여 표시
   └── 기존 레코드 확인/수정 후 Continue

5. Cloudflare가 두 개의 네임서버를 제공:
   예) abby.ns.cloudflare.com
       will.ns.cloudflare.com

6. 현재 Registrar 관리자 페이지에서 네임서버를 위 두 개로 교체
   └── Registrar별 절차 상이 (Cloudflare 문서에 30개 이상 제공)

7. Cloudflare 대시보드에서 "Done, check nameservers" 클릭

8. 전파 대기: 수 시간 ~ 최대 24시간
   └── Cloudflare에서 확인 이메일 발송
```

### 중요 주의사항

- 네임서버 변경 **전에** 기존 DNS 제공자에서 DNSSEC를 비활성화해야 함
- 전파 중에는 API로 조회 시 zone status가 `pending` 상태임
- brewnet에서 getZones() 호출 시 `status === 'active'` 필터링 필요 (이미 구현됨)

### 전파 완료 확인

```bash
# 네임서버 전파 확인
dig NS myserver.com +short
# → abby.ns.cloudflare.com. 등이 나오면 완료

# 또는 Cloudflare 대시보드에서 zone status 확인
# "Active" 표시 시 완료
```

---

## 5. Phase C — API 토큰 생성

### 필요 권한

| 권한 | 수준 | 용도 |
|------|------|------|
| `Cloudflare Tunnel:Edit` | Account | 터널 생성/삭제/설정 |
| `DNS:Edit` | Zone (선택한 도메인) | CNAME 레코드 생성 |
| `Zone:Read` | Zone | zone ID 조회 |

> "Edit Cloudflare Tunnel" 템플릿을 사용하면 Tunnel:Edit + DNS:Edit + Zone:Read가 자동 포함됩니다.

### 생성 단계

```
1. Cloudflare 대시보드 → 우측 상단 프로필 아이콘
2. "My Profile" → "API Tokens" 탭
3. "Create Token" 버튼
4. "Edit Cloudflare Tunnel" 템플릿 선택 → "Use template"
5. Token Name: brewnet-{projectName} 권장
6. Zone Resources: "Specific zone" → 사용할 도메인 선택
7. "Continue to summary" → "Create Token"
8. 토큰을 복사 (한 번만 표시됨)
```

### 사전 설정된 URL (brewnet 자동 생성)

```
https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=[{"key":"cloudflare_tunnel","type":"edit"},{"key":"dns","type":"edit"}]&name=brewnet-{projectName}
```

구현 위치: `cloudflare-client.ts:buildTokenCreationUrl()`

### 토큰 검증 API

```http
GET https://api.cloudflare.com/client/v4/user/tokens/verify
Authorization: Bearer {token}

Response:
{
  "result": { "status": "active" },
  "success": true
}
```

### 보안 규칙

- **토큰은 state 파일, .env, 로그에 저장하지 않는다**
- `tunnelId`, `tunnelToken`, `accountId`, `zoneId` 만 저장
- 토큰 사용 후 `state.domain.cloudflare.apiToken = ''` 즉시 초기화

---

## 6. Phase D — Named Tunnel 생성 (API 플로우)

### 계정 ID 조회

```http
GET https://api.cloudflare.com/client/v4/accounts
Authorization: Bearer {token}

Response:
{
  "result": [{ "id": "ACCOUNT_ID", "name": "Account Name" }],
  "success": true
}
```

로직:
- 계정 1개: 자동 선택
- 계정 여러 개: 사용자 선택 프롬프트
- 조회 실패: Account ID 수동 입력 폴백

### Zone(도메인) 조회

```http
GET https://api.cloudflare.com/client/v4/zones
Authorization: Bearer {token}

Response:
{
  "result": [{ "id": "ZONE_ID", "name": "myserver.com", "status": "active" }]
}
```

로직:
- `status === 'active'` 필터링 (pending은 사용 불가)
- zone 1개: 자동 선택
- zone 여러 개: 사용자 선택 프롬프트
- active zone 없음 → 오류 + 도메인 등록 안내

### 터널 생성

```http
POST https://api.cloudflare.com/client/v4/accounts/{accountId}/cfd_tunnel
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "{projectName}",
  "config_src": "cloudflare",
  "tunnel_secret": "{base64(randomBytes(32))}"
}

Response:
{
  "result": {
    "id": "TUNNEL_ID",
    "token": "TUNNEL_TOKEN"
  },
  "success": true
}
```

저장 값: `tunnelId`, `tunnelToken` (apiToken 제외)

### 롤백 조건

터널 생성 이후 단계에서 실패 시:

```http
DELETE https://api.cloudflare.com/client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}
```

> 주의: 활성 connectors가 있으면 HTTP 400. cloudflared 컨테이너를 먼저 중지해야 함.

---

## 7. Phase E — 인그레스 설정 및 DNS CNAME 등록

### 인그레스 설정

```http
PUT https://api.cloudflare.com/client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations
Authorization: Bearer {token}

{
  "config": {
    "ingress": [
      { "hostname": "git.myserver.com",   "service": "http://gitea:3000" },
      { "hostname": "cloud.myserver.com", "service": "http://nextcloud:80" },
      { "hostname": "files.myserver.com", "service": "http://filebrowser:80" },
      { "hostname": "media.myserver.com", "service": "http://jellyfin:8096" },
      { "service": "http_status:404" }
    ]
  }
}
```

> **catch-all 규칙 필수**: 마지막 항목은 반드시 `{ "service": "http_status:404" }` 여야 합니다.

### 서비스별 subdomain 매핑

| 서비스 | subdomain | 내부 주소 | 활성화 조건 |
|--------|-----------|-----------|------------|
| Gitea | `git` | `gitea:3000` | 항상 포함 |
| Nextcloud | `cloud` | `nextcloud:80` | fileServer === 'nextcloud' |
| MinIO | `minio` | `minio:9001` | fileServer === 'minio' |
| Jellyfin | `media` | `jellyfin:8096` | media.enabled && jellyfin |
| pgAdmin | `pgadmin` | `pgadmin:80` | db.postgresql && adminUI |
| FileBrowser | `files` | `filebrowser:80` | fileBrowser.enabled |

구현 위치: `cloudflare-client.ts:getActiveServiceRoutes()`

### DNS CNAME 레코드 생성

```http
POST https://api.cloudflare.com/client/v4/zones/{zoneId}/dns_records
Authorization: Bearer {token}

{
  "type": "CNAME",
  "name": "git.myserver.com",
  "content": "{tunnelId}.cfargotunnel.com",
  "proxied": true
}
```

각 서비스마다 1건씩 반복. `proxied: true` 필수 (Cloudflare 프록시 경유).

### DNS 레코드 upsert 처리

- 레코드가 이미 존재하는 경우 (`"already exists"` 오류): non-fatal, 무시
- 다른 오류: 개별 레코드 실패는 non-fatal (전체 실패 시 롤백)
- 기존 레코드 업데이트: `PATCH /dns_records/{recordId}` 또는 DELETE + POST

---

## 8. Phase F — cloudflared 컨테이너 실행

### Docker 실행 방식

```yaml
# docker-compose.yml (Named Tunnel 모드)
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: brewnet-cloudflared
  restart: unless-stopped
  command: tunnel run
  environment:
    - TUNNEL_TOKEN=${TUNNEL_TOKEN}
  networks:
    - brewnet
```

```yaml
# docker-compose.yml (Quick Tunnel 모드)
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: brewnet-tunnel-quick
  restart: unless-stopped
  command: tunnel --no-autoupdate run --url http://traefik:80
  networks:
    - brewnet
```

### Named Tunnel vs Quick Tunnel 컨테이너 차이

| 항목 | Quick Tunnel | Named Tunnel |
|------|-------------|--------------|
| container_name | `brewnet-tunnel-quick` | `brewnet-cloudflared` |
| command | `tunnel --no-autoupdate run --url http://traefik:80` | `tunnel run` |
| environment | 없음 | `TUNNEL_TOKEN=${TUNNEL_TOKEN}` |
| TUNNEL_TOKEN in .env | 없음 | 있음 |

### .env에 TUNNEL_TOKEN 주입

`TUNNEL_TOKEN`은 `.env` 파일에 저장. **절대 state JSON 파일에 저장하지 않는다.**

```
# ~/.brewnet/projects/{name}/.env
TUNNEL_TOKEN=eyJhIjoiYWNjb3VudElkIiwidCI6InR1bm5lbElkIiwiYyI6InRva2VuIn0=
```

`state.domain.cloudflare.tunnelToken`은 .env 생성 후 메모리에서만 사용, 저장 안 함.

---

## 9. Phase G — 헬스체크 및 서비스 접속 검증

### Cloudflare API로 터널 상태 확인

```http
GET https://api.cloudflare.com/client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}
Authorization: Bearer {token}

Response:
{
  "result": {
    "status": "healthy",       // "healthy" | "degraded" | "inactive"
    "connections": [...]        // active connector 목록
  }
}
```

### 헬스체크 폴링 로직

```
pollInterval = 2초
timeout = 30초

while elapsed < timeout:
  status = getTunnelHealth(apiToken, accountId, tunnelId)
  if status === "healthy" AND connectorCount > 0:
    return SUCCESS
  wait 2초

throw TimeoutError
```

> **Note**: cloudflared는 최대 4개 connector를 Cloudflare에 연결함. connectorCount >= 1이면 정상.

### 서비스 접속 URL 검증

```bash
# 각 서비스 URL로 HTTP 200/302 응답 확인
curl -s -o /dev/null -w "%{http_code}" https://git.myserver.com      # → 200
curl -s -o /dev/null -w "%{http_code}" https://cloud.myserver.com    # → 302
curl -s -o /dev/null -w "%{http_code}" https://files.myserver.com    # → 200
```

---

## 10. brewnet init 통합 매핑

### Step 4 시나리오 선택 → Phase 매핑

| 사용자 선택 | Phase 실행 순서 | `domain-network.ts` 함수 |
|------------|----------------|--------------------------|
| Scenario 2: Named Tunnel (기존 도메인) | C → D → E → (F는 Step 6) → G | `runNamedTunnelWithDomainScenario()` |
| Scenario 3: 도메인 먼저 구입 | A or B → (대기) → C → D → E → G | `runGuidedDomainPurchaseScenario()` |
| Scenario 4: Named Tunnel only (도메인 나중에) | C → D → (F는 Step 6) | `runNamedTunnelOnlyScenario()` |

### Step 6 (Generate) — cloudflared 컨테이너 시작

`generate.ts`에서 `docker compose up -d` 실행 시:
- Named Tunnel 모드: cloudflared 컨테이너가 `TUNNEL_TOKEN` 환경변수로 자동 시작
- Quick Tunnel 모드: cloudflared 컨테이너가 `--url` 플래그로 시작, URL은 로그에서 파싱

### 컨테이너명 규칙

| tunnelMode | container_name |
|-----------|----------------|
| `quick` | `brewnet-tunnel-quick` |
| `named` | `brewnet-cloudflared` |

---

## 11. brewnet domain connect 통합 매핑

`domain.ts` 명령어의 Path A/B/C → Phase 매핑:

| Path | 상황 | 실행 Phase |
|------|------|-----------|
| Path A | Quick Tunnel → Named Tunnel 마이그레이션 | C → D → E → Quick Tunnel 중지 |
| Path B | Named Tunnel (도메인 없음) → 도메인 연결 | C → E (기존 tunnelId 재사용) |
| Path C | Named Tunnel (도메인 있음) → 재동기화 | C → E (인그레스+DNS upsert) |

---

## 12. 갭 분석 — 미구현 / 미테스트 항목

### 구현 상태 요약

| 항목 | 파일 | 상태 |
|------|------|------|
| API 토큰 검증 | `cloudflare-client.ts:verifyToken()` | ✅ 구현 + 테스트 |
| 계정 조회 | `cloudflare-client.ts:getAccounts()` | ✅ 구현 + 테스트 |
| Zone 조회 | `cloudflare-client.ts:getZones()` | ✅ 구현 + 테스트 |
| 터널 생성 | `cloudflare-client.ts:createTunnel()` | ✅ 구현 + 테스트 |
| 인그레스 설정 | `cloudflare-client.ts:configureTunnelIngress()` | ✅ 구현 + 테스트 |
| DNS CNAME 생성 | `cloudflare-client.ts:createDnsRecord()` | ✅ 구현 + 테스트 |
| 터널 헬스체크 | `cloudflare-client.ts:getTunnelHealth()` | ✅ 구현 + 테스트 |
| 터널 삭제(롤백) | `cloudflare-client.ts:deleteTunnel()` | ✅ 구현 + 테스트 |
| 재시도 로직 | `cloudflare-client.ts:fetchWithRetry()` | ✅ 구현 + 테스트 |
| Scenario 2 (init-time) | `domain-network.ts` | ✅ 구현 + 테스트 |
| Scenario 3 (buy domain) | `domain-network.ts` | ✅ 구현 + 테스트 |
| Scenario 4 (tunnel only) | `domain-network.ts` | ✅ 구현 + 테스트 |
| domain connect Path A | `domain.ts` | ✅ 구현 + 테스트 |
| domain connect Path B | `domain.ts` | ✅ 구현 + 테스트 |
| domain connect Path C | `domain.ts` | ✅ 구현 + 테스트 |
| Named Tunnel compose 생성 | `compose-generator.ts` | ✅ 구현 (Quick/Named 브랜치 분리됨) |
| **TUNNEL_TOKEN 변수명 불일치** | `env-generator.ts` vs `compose-generator.ts` | 🐛 **버그 확인됨** |
| DNS 레코드 upsert (PATCH) | `cloudflare-client.ts` | ⚠️ **미구현** |

### 버그 1: TUNNEL_TOKEN 변수명 불일치 (확인됨)

**`env-generator.ts`** (L210):
```typescript
entries['CLOUDFLARE_TUNNEL_TOKEN'] = state.domain.cloudflare.tunnelToken;
// → .env 파일에 CLOUDFLARE_TUNNEL_TOKEN=... 기록
```

**`compose-generator.ts:getCloudflaredEnv()`** (L387):
```typescript
return {
  TUNNEL_TOKEN: state.domain.cloudflare.tunnelToken || '${TUNNEL_TOKEN}',
  //                                                     ↑
  //  tunnelToken이 빈 값이면 .env의 ${TUNNEL_TOKEN}을 참조하려 하지만
  //  .env에는 CLOUDFLARE_TUNNEL_TOKEN만 있어서 치환 실패
};
```

**발생 시나리오**: 초기 생성 시에는 `tunnelToken` 값이 있으므로 정상 작동. 그러나 이후 compose 재생성 시 state에서 `tunnelToken`이 비어있으면 `${TUNNEL_TOKEN}`이 `.env`에서 resolve되지 않아 cloudflared가 빈 토큰으로 시작됨.

**수정 방법**: `env-generator.ts`에서 `.env` 변수명을 `CLOUDFLARE_TUNNEL_TOKEN` → `TUNNEL_TOKEN`으로 변경.

### 버그 2: DNS 레코드 내용 변경 시 업데이트 미지원 (미구현)

현재 `createDnsRecord()`는:
- 레코드 없음 → POST (정상)
- 레코드 있고 동일 내용 → `"already exists"` 오류 무시 (정상)
- **레코드 있고 다른 내용 → `"already exists"` 오류 무시 (버그: 기존 잘못된 레코드 업데이트 안 됨)**

**발생 시나리오**: `brewnet domain connect` 재실행 시 이전 터널의 CNAME이 있는 경우, 새 tunnelId로 교체되지 않음.

**완전한 upsert 구현 방법**:
1. `GET /zones/{zoneId}/dns_records?name={subdomain}.{domain}&type=CNAME` → 기존 레코드 확인
2. 존재하면 → `PATCH /zones/{zoneId}/dns_records/{recordId}` (content 업데이트)
3. 없으면 → `POST /zones/{zoneId}/dns_records` (신규 생성)

---

## 13. 테스트 계획

### 신규 구현 필요 테스트

#### T-NEW-01: TUNNEL_TOKEN .env 주입 검증

```typescript
// tests/unit/cli/services/env-generator.test.ts 추가
describe('generateEnv — Named Tunnel TUNNEL_TOKEN', () => {
  it('writes TUNNEL_TOKEN to .env when tunnelMode is named', () => {
    const state = createNamedTunnelState({ tunnelToken: 'abc123' });
    generateEnvFromState(dir, state);
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^TUNNEL_TOKEN=abc123$/m);
  });

  it('does NOT write TUNNEL_TOKEN for quick tunnel mode', () => {
    const state = createQuickTunnelState();
    generateEnvFromState(dir, state);
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).not.toContain('TUNNEL_TOKEN');
  });
});
```

#### T-NEW-02: Named Tunnel Compose 생성 검증

```typescript
// tests/unit/cli/services/compose-generator.test.ts 추가
describe('composeGenerator — Named Tunnel cloudflared service', () => {
  it('generates cloudflared service with TUNNEL_TOKEN env for named mode', () => {
    const config = generateCompose(namedTunnelState);
    const svc = config.services['cloudflared'];
    expect(svc.command).toBe('tunnel run');
    expect(svc.environment).toContain('TUNNEL_TOKEN=${TUNNEL_TOKEN}');
    expect(svc.container_name).toBe('brewnet-cloudflared');
  });

  it('generates cloudflared service with --url flag for quick mode', () => {
    const config = generateCompose(quickTunnelState);
    const svc = config.services['cloudflared'];
    expect(svc.command).toMatch(/--url http:\/\/traefik:80/);
    expect(svc.container_name).toBe('brewnet-tunnel-quick');
  });

  it('omits cloudflared service when tunnelMode is none', () => {
    const config = generateCompose(localOnlyState);
    expect(config.services['cloudflared']).toBeUndefined();
    expect(config.services['brewnet-tunnel-quick']).toBeUndefined();
  });
});
```

#### T-NEW-03: DNS 레코드 upsert (PATCH) 검증

```typescript
// tests/unit/cli/services/cloudflare-client.test.ts 추가
describe('upsertDnsRecord', () => {
  it('creates a new record when one does not exist', async () => {
    // mock GET → empty, POST → success
  });

  it('updates an existing record with PATCH when content differs', async () => {
    // mock GET → existing record with different content, PATCH → success
  });

  it('skips update when existing record has identical content', async () => {
    // mock GET → existing record with same content, no PATCH call
  });
});
```

#### T-NEW-04: 헬스체크 폴링 검증

```typescript
// tests/integration/domain-config.test.ts 추가
describe('Named Tunnel health verification', () => {
  it('resolves immediately when tunnel is healthy on first poll', async () => { });
  it('retries polling until healthy within timeout', async () => { });
  it('throws TimeoutError when not healthy within 30s', async () => { });
});
```

#### T-NEW-05: Scenario 3 (도메인 구입 안내) 통합 테스트 강화

```typescript
// tests/integration/wizard/domain-network.test.ts 추가
describe('T042 extended — Scenario 3 edge cases', () => {
  it('proceeds to Named Tunnel setup after user presses Enter without bridge', async () => { });
  it('falls back to local when Named Tunnel API fails after bridge started', async () => { });
  it('shows Cloudflare Registrar URL in guidance text', async () => { });
});
```

### 기존 테스트 보완

| 테스트 파일 | 추가 케이스 |
|------------|------------|
| `cloudflare-client.test.ts` | `getTunnelHealth` timeout/degraded/inactive 케이스 |
| `domain-connect.test.ts` | Path C (re-sync) 전체 플로우 |
| `domain-config.test.ts` | Named Tunnel compose 서비스 검증 |

---

## 14. 버그 상세 — 구현 전 참고

### BUG-01: TUNNEL_TOKEN 변수명 불일치

**심각도**: High — compose 재생성 시 cloudflared 무음 실패

**위치**

| 파일 | 라인 | 현재 코드 |
|------|------|-----------|
| `packages/cli/src/services/env-generator.ts` | L210 | `entries['CLOUDFLARE_TUNNEL_TOKEN'] = state.domain.cloudflare.tunnelToken;` |
| `packages/cli/src/services/compose-generator.ts` | L387 | `TUNNEL_TOKEN: state.domain.cloudflare.tunnelToken \|\| '${TUNNEL_TOKEN}'` |

**증상**

초기 설치(`brewnet init`) 시:
- `state.domain.cloudflare.tunnelToken`에 실제 토큰 값이 있음
- compose 서비스 환경변수 `TUNNEL_TOKEN = "eyJhI..."` (값 직접 포함) → 정상 작동

이후 compose 재생성 또는 `brewnet domain connect` 실행 후:
- `tunnelToken`이 state에서 비워진 경우 (또는 재생성 플로우 변경 시)
- compose 서비스 환경변수 `TUNNEL_TOKEN = "${TUNNEL_TOKEN}"` (변수 참조로 폴백)
- `.env` 파일에는 `CLOUDFLARE_TUNNEL_TOKEN=...` 로 저장되어 있음
- docker-compose가 `${TUNNEL_TOKEN}`을 `.env`에서 찾지 못함 → **빈 문자열**
- cloudflared가 토큰 없이 시작 → 연결 실패 (오류 메시지 없이 무음 실패)

**재현 방법**

```bash
# 1. Named Tunnel로 brewnet init 실행 (compose 생성됨)
# 2. tunnelToken을 state에서 지운 상태로 compose 재생성 시뮬레이션
# 3. .env 확인
grep TUNNEL_TOKEN ~/.brewnet/projects/my-homeserver/.env
# → CLOUDFLARE_TUNNEL_TOKEN=eyJh... (이름이 다름)

# 4. compose 파일 확인
grep TUNNEL_TOKEN ~/brewnet/my-homeserver/docker-compose.yml
# → TUNNEL_TOKEN: ${TUNNEL_TOKEN}  (resolve 불가)

# 5. docker compose 실행 시
docker compose up cloudflared
# → cloudflared가 빈 TUNNEL_TOKEN으로 시작, 연결 불가
```

**수정 방법**

`env-generator.ts`의 변수명을 `TUNNEL_TOKEN`으로 통일:

```typescript
// Before (env-generator.ts L210)
entries['CLOUDFLARE_TUNNEL_TOKEN'] = state.domain.cloudflare.tunnelToken;

// After
entries['TUNNEL_TOKEN'] = state.domain.cloudflare.tunnelToken;
```

> 참고: `env-generator.ts` L124/141의 주석도 함께 업데이트 필요
> `CLOUDFLARE_TUNNEL_TOKEN stays in .env` → `TUNNEL_TOKEN stays in .env`

**수정 후 테스트**

```typescript
// tests/unit/cli/services/env-generator.test.ts
describe('generateEnv — Named Tunnel TUNNEL_TOKEN', () => {
  it('writes TUNNEL_TOKEN (not CLOUDFLARE_TUNNEL_TOKEN) to .env', () => {
    const state = /* Named Tunnel state with tunnelToken = 'abc123' */;
    generateEnvFromState(dir, state);
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/^TUNNEL_TOKEN=abc123$/m);
    expect(env).not.toContain('CLOUDFLARE_TUNNEL_TOKEN');
  });

  it('does NOT write TUNNEL_TOKEN for quick tunnel mode', () => {
    // Quick Tunnel state → no tunnelToken in .env
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).not.toMatch(/^TUNNEL_TOKEN=/m);
  });

  it('does NOT write TUNNEL_TOKEN when tunnelMode is none', () => {
    // Local-only state → no tunnelToken in .env
  });
});
```

---

### BUG-02: DNS 레코드 upsert 미지원 (내용 변경 시 업데이트 안 됨)

**심각도**: Medium — `brewnet domain connect` 재실행 또는 터널 교체 시 DNS 레코드가 구 tunnelId를 계속 가리킴

**위치**

`packages/cli/src/services/cloudflare-client.ts:createDnsRecord()` (L354~386)

**현재 동작**

```typescript
// 현재: POST만 있음
POST /zones/{zoneId}/dns_records
→ 성공: 레코드 생성
→ "already exists": 무시 (non-fatal)
→ 다른 오류: throw
```

**문제 시나리오**

```
1. 첫 번째 Named Tunnel 설정:
   - tunnelId = "TUNNEL-A"
   - git.myserver.com → TUNNEL-A.cfargotunnel.com (CNAME 생성)

2. 터널 재생성 (도메인 connect 재실행 / 터널 교체):
   - 새 tunnelId = "TUNNEL-B"
   - createDnsRecord() 호출
   - POST → "already exists" 오류 발생
   - 오류 무시 (현재 동작)
   - git.myserver.com은 여전히 TUNNEL-A.cfargotunnel.com을 가리킴
   - TUNNEL-A는 삭제됨 → DNS 레코드 broken
```

**완전한 upsert 구현 방법**

신규 함수 `upsertDnsRecord()` 추가:

```typescript
// cloudflare-client.ts에 추가
export async function upsertDnsRecord(
  apiToken: string,
  zoneId: string,
  tunnelId: string,
  subdomain: string,
  domain: string,
): Promise<void> {
  const newContent = `${tunnelId}.cfargotunnel.com`;
  const recordName = `${subdomain}.${domain}`;

  // 1. 기존 레코드 조회
  const listUrl = `${CF_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(recordName)}`;
  const listResp = await fetchWithRetry(listUrl, { headers: cfHeaders(apiToken) });
  const listData = (await listResp.json()) as {
    success: boolean;
    result?: Array<{ id: string; content: string }>;
  };

  const existing = listData.success ? (listData.result ?? []) : [];

  if (existing.length > 0) {
    const record = existing[0];

    // 내용이 이미 같으면 스킵
    if (record.content === newContent) return;

    // 2-A. 내용이 다르면 PATCH
    const patchUrl = `${CF_BASE}/zones/${zoneId}/dns_records/${record.id}`;
    const patchResp = await fetchWithRetry(patchUrl, {
      method: 'PATCH',
      headers: cfHeaders(apiToken),
      body: JSON.stringify({ content: newContent }),
    });
    const patchData = (await patchResp.json()) as { success: boolean; errors?: Array<{ message: string }> };
    if (!patchResp.ok || !patchData.success) {
      const msg = patchData.errors?.[0]?.message ?? `HTTP ${patchResp.status}`;
      throw new Error(`DNS record update failed: ${msg}`);
    }
  } else {
    // 2-B. 없으면 POST
    await createDnsRecord(apiToken, zoneId, tunnelId, subdomain, domain);
  }
}
```

**기존 `createDnsRecord()` 호출 교체 위치**

| 파일 | 함수 | 교체 여부 |
|------|------|-----------|
| `commands/domain.ts:domainConnectPathA()` | `createDnsRecord` → `upsertDnsRecord` | ✅ 교체 필요 |
| `commands/domain.ts:domainConnectPathB()` | `createDnsRecord` → `upsertDnsRecord` | ✅ 교체 필요 |
| `commands/domain.ts:domainConnectPathC()` | `createDnsRecord` → `upsertDnsRecord` | ✅ 교체 필요 |
| `wizard/steps/domain-network.ts:runNamedTunnelApiFlow()` | `createDnsRecord` → `upsertDnsRecord` | ✅ 교체 필요 |

> `createDnsRecord()`는 삭제하지 않고 유지 (테스트 코드에서 참조 + 내부적으로 `upsertDnsRecord`가 호출)

**수정 후 테스트**

```typescript
// tests/unit/cli/services/cloudflare-client.test.ts
describe('upsertDnsRecord', () => {
  it('creates a new CNAME record when none exists', async () => {
    // mock GET → result: []
    // mock POST → success
    // POST 호출됐는지 확인
  });

  it('PATCHes the existing record when content differs', async () => {
    // mock GET → result: [{ id: 'rec1', content: 'OLD-TUNNEL.cfargotunnel.com' }]
    // mock PATCH → success
    // PATCH 호출됐는지, POST 호출 안 됐는지 확인
  });

  it('skips when existing record already has correct content', async () => {
    // mock GET → result: [{ id: 'rec1', content: 'SAME-TUNNEL.cfargotunnel.com' }]
    // PATCH, POST 모두 호출 안 됐는지 확인
  });

  it('throws when PATCH fails', async () => {
    // mock GET → existing, mock PATCH → error
    // await expect(upsertDnsRecord(...)).rejects.toThrow('DNS record update failed')
  });
});
```

---

### 버그 수정 우선순위

| 버그 | 심각도 | 영향 범위 | 수정 난이도 | 권장 순서 |
|------|--------|----------|------------|----------|
| BUG-01: TUNNEL_TOKEN 변수명 | High | Named Tunnel compose 재생성 | 낮음 (1줄 + 테스트) | **1순위** |
| BUG-02: DNS upsert 미지원 | Medium | domain connect 재실행 | 중간 (신규 함수 + 4곳 교체) | **2순위** |

---

## 참고 자료

- [Cloudflare Registrar: Register a domain](https://developers.cloudflare.com/registrar/get-started/register-domain/)
- [Cloudflare: Add a site (external registrar)](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/)
- [Cloudflare Tunnel: Create via API](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/)
- [Cloudflare Tunnel: DNS records](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)
- [cloudflared Docker image](https://hub.docker.com/r/cloudflare/cloudflared)
- [Tunnel run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/run-parameters/)
