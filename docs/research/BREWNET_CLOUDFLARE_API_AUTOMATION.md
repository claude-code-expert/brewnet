# Brewnet × Cloudflare API 자동화 분석

> Brewnet CLI에서 Cloudflare Tunnel 설정을 원클릭으로 자동화할 수 있는가?

---

## 결론 요약

| 단계 | API 자동화 | 방법 |
|------|:----------:|------|
| ① Cloudflare 로그인/인증 | ⚠️ 부분적 | 유저가 API Token 1회 생성 필요 (or `cloudflared login`) |
| ② 터널 생성 | ✅ 완전 자동화 | `POST /accounts/{id}/cfd_tunnel` |
| ③ 터널 토큰 발급 | ✅ 완전 자동화 | `GET /accounts/{id}/cfd_tunnel/{tunnel_id}/token` |
| ④ 서비스 라우팅 (ingress) | ✅ 완전 자동화 | `PUT /accounts/{id}/cfd_tunnel/{tunnel_id}/configurations` |
| ⑤ DNS 레코드 생성 | ✅ 완전 자동화 | `POST /zones/{zone_id}/dns_records` |
| ⑥ cloudflared 실행 | ✅ 완전 자동화 | Docker Compose 자동 생성 |

**핵심: 유저가 해야 할 일은 "API Token 복붙" 딱 1번뿐. 나머지는 Brewnet CLI가 전부 처리 가능.**

---

## 1. 인증 문제: 왜 완전 자동화가 안 되는가?

### Cloudflare는 제3자 앱용 OAuth를 지원하지 않음

GitHub 같은 서비스는 OAuth로 "Login with GitHub" → 권한 승인 → 토큰 자동 발급이 가능합니다. 하지만 Cloudflare는 **외부 앱이 사용할 수 있는 OAuth 흐름을 제공하지 않습니다** (2025년 기준).

따라서 Brewnet CLI가 "Cloudflare 로그인 페이지 열기 → 유저가 승인 → 토큰 자동 수신" 같은 흐름을 구현할 수 없습니다.

### 가능한 인증 방식 2가지

#### 방식 A: API Token 직접 입력 (⭐ 권장)

유저가 Cloudflare 대시보드에서 **1번만** API Token을 생성하고, Brewnet CLI에 붙여넣습니다.

```
장점: 가장 안전, 최소 권한 원칙 적용 가능, 도메인별 스코프 제한 가능
단점: 유저가 Cloudflare 대시보드에 1번은 가야 함
```

#### 방식 B: `cloudflared login` 활용

`cloudflared login` 명령어는 브라우저를 열어 Cloudflare에 로그인하고 `cert.pem` 인증서를 다운로드합니다. 이 인증서로 터널 생성/삭제가 가능합니다.

```
장점: 브라우저만 열면 끝, 토큰 복붙 불필요
단점: cert.pem은 계정 전체 권한 (최소 권한 원칙 위반), 
      API Token보다 관리가 복잡, 
      headless 서버에서 브라우저 열기 어려움
```

---

## 2. 권장 UX 플로우: "API Token 1회 복붙" 모델

### 유저 경험 (전체 ~5분)

```
$ brewnet init

🍺 Brewnet - Your server on tap. Just brew it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 외부 접근 설정

외부에서 홈서버에 접속하려면 Cloudflare 계정이 필요합니다.
Cloudflare는 무료이며, 포트 포워딩 없이 안전하게 서버를 노출합니다.

? Cloudflare 계정이 있나요? (Y/n): Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 Cloudflare API Token 설정 (1회만 하면 됩니다)

  1. 아래 링크를 브라우저에서 열어주세요:

     👉 https://dash.cloudflare.com/profile/api-tokens

  2. [Create Token] → [Custom Token] 선택

  3. 아래 권한을 설정하세요:

     ┌──────────────────────────────────────────────┐
     │  Token name:  brewnet-tunnel                  │
     │                                               │
     │  Permissions:                                  │
     │    Account │ Cloudflare Tunnel │ Edit          │
     │    Zone    │ DNS              │ Edit          │
     │                                               │
     │  Zone Resources:                               │
     │    Include │ Specific zone │ yourdomain.com   │
     └──────────────────────────────────────────────┘

  4. 생성된 토큰을 복사하세요

? Cloudflare API Token: █

✅ 토큰 검증 완료! (Account: john@example.com)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 도메인 선택

Cloudflare에 등록된 도메인을 찾았습니다:

  1. myserver.com
  2. example.dev

? 사용할 도메인: 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚇 터널 생성 중...

  ✅ 터널 생성 완료 (brewnet-homeserver)
  ✅ 터널 토큰 발급 완료
  ✅ DNS 레코드 생성 완료
     - files.myserver.com → FileBrowser
     - git.myserver.com → Gitea
     - status.myserver.com → Uptime Kuma
  ✅ Docker Compose 생성 완료
  ✅ 서비스 시작 완료

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 설정 완료! 아래 주소로 접속하세요:

  📁 파일 관리    https://files.myserver.com
  🐙 Git 서버    https://git.myserver.com
  📊 모니터링    https://status.myserver.com

  모든 서비스는 HTTPS로 자동 보호됩니다 🔒
```

### 유저가 직접 해야 하는 것 vs CLI가 자동 처리하는 것

```
유저의 할 일 (5분)                    Brewnet CLI가 자동 처리
─────────────────────                ────────────────────────
1. Cloudflare 계정 있어야 함          1. API Token 검증
2. 도메인이 Cloudflare에 등록되어     2. Account ID / Zone ID 자동 탐지
   있어야 함                          3. Tunnel 생성 (POST API)
3. API Token 생성 → CLI에 붙여넣기    4. Tunnel Token 발급 (GET API)
                                      5. Ingress 규칙 설정 (PUT API)
                                      6. DNS CNAME 레코드 생성 (POST API)
                                      7. .env 파일 자동 생성
                                      8. docker-compose.yml 자동 생성
                                      9. docker compose up -d 실행
```

---

## 3. API 자동화 상세 구현

### 3-1. 토큰 검증 + Account/Zone 정보 조회

```typescript
// 토큰이 유효한지 확인
const verifyToken = async (apiToken: string) => {
  const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  });
  const data = await res.json();
  return data.success; // true/false
};

// Account ID 조회
const getAccounts = async (apiToken: string) => {
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  });
  const data = await res.json();
  return data.result; // [{ id, name }, ...]
};

// Zone (도메인) 목록 조회
const getZones = async (apiToken: string) => {
  const res = await fetch('https://api.cloudflare.com/client/v4/zones', {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  });
  const data = await res.json();
  return data.result; // [{ id, name, status }, ...]
};
```

### 3-2. 터널 생성

```typescript
import crypto from 'crypto';

const createTunnel = async (apiToken: string, accountId: string, tunnelName: string) => {
  // 32바이트 랜덤 시크릿 생성
  const tunnelSecret = crypto.randomBytes(32).toString('base64');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: tunnelName,
        tunnel_secret: tunnelSecret,
        config_src: 'cloudflare'  // 중요: 리모트 관리 모드
      })
    }
  );

  const data = await res.json();
  return {
    tunnelId: data.result.id,
    tunnelToken: data.result.token,  // Docker에서 사용할 토큰
    tunnelSecret
  };
};
```

### 3-3. Ingress 규칙 설정 (Public Hostname)

```typescript
interface ServiceRoute {
  subdomain: string;
  containerName: string;
  port: number;
}

const configureTunnel = async (
  apiToken: string,
  accountId: string,
  tunnelId: string,
  domain: string,
  services: ServiceRoute[]
) => {
  const ingress = [
    // 서비스별 라우팅 규칙
    ...services.map(svc => ({
      hostname: `${svc.subdomain}.${domain}`,
      service: `http://${svc.containerName}:${svc.port}`,
      originRequest: {}
    })),
    // catch-all (필수)
    { service: 'http_status:404' }
  ];

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ config: { ingress } })
    }
  );

  return res.json();
};
```

### 3-4. DNS CNAME 레코드 생성

> ⚠️ **중요**: 최근 Cloudflare SDK 업데이트로 ingress 설정 시 DNS 레코드가 자동 생성되지 않음.
> 반드시 별도 API 호출로 CNAME 레코드를 만들어야 함.

```typescript
const createDnsRecord = async (
  apiToken: string,
  zoneId: string,
  tunnelId: string,
  subdomain: string,
  domain: string
) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: `${subdomain}.${domain}`,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true  // 반드시 true (Cloudflare 프록시 활성화)
      })
    }
  );

  return res.json();
};
```

### 3-5. 전체 오케스트레이션

```typescript
// brewnet tunnel setup 핵심 로직
const setupTunnel = async (config: BrewnetConfig) => {
  const { apiToken } = config.cloudflare;

  // Step 1: 토큰 검증
  spinner.start('API Token 검증 중...');
  const valid = await verifyToken(apiToken);
  if (!valid) throw new Error('유효하지 않은 API Token입니다.');
  spinner.succeed('토큰 검증 완료');

  // Step 2: Account & Zone 탐지
  spinner.start('계정 정보 조회 중...');
  const accounts = await getAccounts(apiToken);
  const accountId = accounts[0].id;

  const zones = await getZones(apiToken);
  // 유저에게 도메인 선택하게 함
  const zone = await promptZoneSelection(zones);
  spinner.succeed(`도메인 선택: ${zone.name}`);

  // Step 3: 터널 생성
  spinner.start('터널 생성 중...');
  const tunnel = await createTunnel(apiToken, accountId, `brewnet-${config.name}`);
  spinner.succeed(`터널 생성 완료 (ID: ${tunnel.tunnelId.slice(0, 8)}...)`);

  // Step 4: Ingress 규칙 설정
  spinner.start('서비스 라우팅 설정 중...');
  const services = getSelectedServices(config); // 유저가 선택한 서비스
  await configureTunnel(apiToken, accountId, tunnel.tunnelId, zone.name, services);
  spinner.succeed('라우팅 설정 완료');

  // Step 5: DNS 레코드 생성
  spinner.start('DNS 레코드 생성 중...');
  for (const svc of services) {
    await createDnsRecord(apiToken, zone.id, tunnel.tunnelId, svc.subdomain, zone.name);
  }
  spinner.succeed('DNS 레코드 생성 완료');

  // Step 6: .env 파일 생성
  await writeEnvFile({
    CLOUDFLARE_TUNNEL_TOKEN: tunnel.tunnelToken,
    DOMAIN: zone.name,
    // ... 기타 환경변수
  });

  // Step 7: Docker Compose 생성 & 실행
  await generateDockerCompose(config, services);
  await exec('docker compose up -d');

  // 완료!
  printSuccessBanner(zone.name, services);
};
```

---

## 4. API Token 생성을 더 쉽게 만드는 방법

### 방법 1: Pre-filled Token URL (⭐ 가장 현실적)

Cloudflare는 API Token 생성 페이지에 **미리 채워진 URL**을 지원합니다:

```
https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=[
  {"key":"cloudflare_tunnel","type":"edit"},
  {"key":"dns","type":"edit"}
]&name=brewnet-tunnel
```

Brewnet CLI가 이 URL을 자동으로 브라우저에서 열어주면, 유저는 **"Create Token" 버튼만 누르면** 됩니다.

```typescript
import open from 'open';

const tokenCreationUrl = buildCloudflareTokenUrl({
  name: 'brewnet-tunnel',
  permissions: [
    { group: 'cloudflare_tunnel', access: 'edit' },
    { group: 'dns', access: 'edit' }
  ]
});

console.log('브라우저에서 Cloudflare Token 생성 페이지를 열었습니다.');
console.log('권한이 미리 설정되어 있으니, [Create Token] 버튼만 누르세요!\n');

await open(tokenCreationUrl);

const token = await promptInput('생성된 토큰을 붙여넣으세요:');
```

### 방법 2: `cloudflared login` 래핑

```typescript
// cloudflared가 설치되어 있으면 브라우저 기반 로그인 활용
const loginWithCloudflared = async () => {
  // 브라우저가 열리고 유저가 로그인하면 cert.pem 다운로드됨
  await exec('cloudflared tunnel login');

  // cert.pem으로 터널 생성
  await exec('cloudflared tunnel create brewnet-homeserver');

  // 이후는 동일한 자동화 플로우
};
```

### 방법 3: QR 코드 (헤드리스 서버용)

```typescript
import qrcode from 'qrcode-terminal';

// 헤드리스 서버에서 브라우저를 열 수 없는 경우
console.log('아래 QR 코드를 스마트폰으로 스캔하세요:');
qrcode.generate(tokenCreationUrl, { small: true });
console.log(`\n또는 이 URL을 다른 기기 브라우저에서 열어주세요:\n${tokenCreationUrl}`);
```

---

## 5. 보안 고려사항

### API Token 저장

```typescript
// API Token은 ~/.brewnet/credentials에 암호화하여 저장
const CREDENTIALS_PATH = path.join(os.homedir(), '.brewnet', 'credentials');

// 저장 시
const saveCredentials = (apiToken: string) => {
  const encrypted = encrypt(apiToken, getMachineId());
  fs.writeFileSync(CREDENTIALS_PATH, encrypted, { mode: 0o600 });
};

// 삭제 명령어 제공
// $ brewnet auth logout → credentials 파일 삭제
```

### 최소 권한 원칙

```
필요한 권한 (이것만 요구):
  ✅ Account > Cloudflare Tunnel > Edit   (터널 생성/삭제)
  ✅ Zone > DNS > Edit                    (DNS 레코드 생성)

불필요한 권한 (절대 요구하지 않음):
  ❌ Zone > Zone > Edit                   (도메인 설정 변경)
  ❌ Account > Account Settings > Edit    (계정 설정)
  ❌ Zone > SSL and Certificates > Edit   (SSL 설정)
```

### Token Scope 제한

```
Zone Resources: Include > Specific zone > [유저의 도메인만]

→ 다른 도메인에는 접근 불가
→ 유저가 여러 도메인을 가지고 있어도 선택한 도메인만 영향
```

---

## 6. 경쟁사 비교

| 도구 | 외부 접근 설정 방식 | 유저 행동 |
|------|---------------------|-----------|
| **CasaOS** | 수동 포트 포워딩 | 유저가 직접 라우터 설정 |
| **Coolify** | 자체 서버 필요 (VPS) | VPS IP 직접 입력 |
| **Cosmos Server** | cloudflared 번들 | 유저가 직접 `cloudflared login` |
| **Brewnet (제안)** | API Token 1회 입력 | ✅ Token 복붙 → 나머지 자동 |

---

## 7. 미래: Cloudflare OAuth 지원 시

Cloudflare가 제3자 앱용 OAuth를 지원하게 되면 (wrangler처럼):

```
현재: 유저가 Token 생성 → CLI에 붙여넣기
미래: brewnet login → 브라우저 열림 → "Brewnet에 권한 허용?" → 자동 완료

# 완전 제로 설정이 가능해짐
$ brewnet init
→ 브라우저가 열림
→ Cloudflare 로그인
→ "Brewnet에 Tunnel + DNS 권한을 허용하시겠습니까?" [Allow]
→ 자동으로 모든 설정 완료
```

이 경우를 대비해 인증 레이어를 추상화해두면 좋습니다:

```typescript
interface AuthProvider {
  authenticate(): Promise<CloudflareCredentials>;
}

class ApiTokenAuth implements AuthProvider { /* 현재 */ }
class OAuthAuth implements AuthProvider { /* 미래 */ }
class CloudflaredLoginAuth implements AuthProvider { /* 대안 */ }
```

---

## 8. 최종 권장 구현 우선순위

```
Phase 1 (MVP): API Token 입력 방식
  - Pre-filled URL로 토큰 생성 간소화
  - 토큰 검증 → 터널 생성 → 라우팅 → DNS → Docker 전부 자동
  - 유저 행동: Token 복붙 1회

Phase 2: cloudflared login 대안 추가
  - 브라우저가 있는 환경에서 더 쉬운 인증
  - cert.pem 기반 터널 생성

Phase 3: Cloudflare OAuth 지원 시 업그레이드
  - 완전 제로 설정 달성
```
