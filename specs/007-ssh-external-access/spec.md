> **[DEPRECATED]** SSH 기능은 현재 진행하지 않습니다.

<!--
# Feature Specification: SSH External Access via Cloudflare DNS Automation

**Feature Branch**: `007-ssh-external-access`
**Created**: 2026-03-22
**Status**: Draft

---

## 배경 및 문제 정의

### 현재 상황

brewnet SSH 서비스(`OpenSSH`, 포트 2222)는 설치 후 `ssh -p 2222 admin@localhost`로만 접근 가능하다.

Named Tunnel(Cloudflare)을 설정하더라도 SSH는 HTTP/HTTPS 트래픽만 프록시하는 Cloudflare Tunnel을 통해 라우팅되지 않는다. 결과적으로:

- 서버와 같은 네트워크가 아니면 SSH 접속이 불가능
- 외부에서 서버를 관리하려면 별도의 포트 포워딩이나 VPN이 필요
- 대시보드 SSH 카드에 `ssh -p 2222 admin@localhost`만 표시 — 외부 사용자에게 무의미한 정보

### 해결 방법

Cloudflare Named Tunnel이 설정된 경우, Cloudflare API를 이용해 **프록시 OFF(회색 구름) A 레코드**를 자동 생성한다:

```
ssh.{zoneName} → {서버 공인 IP}  (proxied: false)
```

Cloudflare가 TCP 포트를 프록시하지 않기 때문에 반드시 `proxied: false`여야 한다.
서버에 방화벽 포트 2222가 오픈되어 있으면, 생성 즉시 외부에서 SSH 접속이 가능하다.

---

## 아키텍처

### 전체 흐름

```
[관리자 — SSH 서비스 상세 모달]
  ↓ "외부 SSH 접속 설정" 버튼 클릭
[POST /api/domain/ssh-record]
  → 1. 서버 공인 IP 감지: fetch('https://api.ipify.org?format=json')
  → 2. Cloudflare API: POST /zones/{zoneId}/dns_records
       { type: 'A', name: 'ssh.{zoneName}', content: '{publicIp}', proxied: false }
  → 3. wizardState에 sshExternalHostname 저장
  ↓ 응답: { hostname: 'ssh.simplite.net', ip: '123.45.67.89', command: 'ssh -p 2222 admin@ssh.simplite.net' }
[SSH 서비스 상세 모달 — 결과 표시]
  → How to Connect 섹션에 외부 SSH 명령어 추가
```

### Cloudflare 레코드 타입 비교

| 레코드 | 타입 | proxied | 용도 |
|--------|------|---------|------|
| `git.simplite.net` | CNAME | ✅ true | Named Tunnel HTTP 라우팅 |
| `cloud.simplite.net` | CNAME | ✅ true | Named Tunnel HTTP 라우팅 |
| `ssh.simplite.net` | **A** | ❌ false | SSH TCP 직접 연결 |

---

## 전제 조건

| 조건 | 미충족 시 동작 |
|------|---------------|
| `tunnelMode === 'named'` | 버튼 비활성화 + 안내 메시지 |
| `wizardState.domain.cloudflare.apiToken` 존재 | 오류: "Cloudflare 설정을 먼저 완료하세요" |
| `wizardState.domain.cloudflare.zoneId` 존재 | 오류: "도메인(Zone)이 설정되지 않았습니다" |
| 서버에 공인 IP 존재 | 오류: "공인 IP를 감지할 수 없습니다" |
| 서버 방화벽 포트 2222 오픈 여부 | 감지 불가 — 사용자에게 수동 확인 안내 |

---

## 구현 계획

### Phase 1 — `cloudflare-client.ts`: A 레코드 생성 함수 추가

**파일**: `packages/cli/src/services/cloudflare-client.ts`

기존 `createDnsRecord()` (CNAME 전용) 옆에 `createARecord()` 추가:

```typescript
/**
 * Create an A DNS record (NOT proxied) for direct TCP access.
 * Used for SSH external access: ssh.{domain} → {serverPublicIp}
 *
 * proxied: false — Cloudflare does not proxy TCP ports (SSH).
 */
export async function createARecord(
  apiToken: string,
  zoneId: string,
  name: string,        // e.g. 'ssh.simplite.net'
  ipAddress: string,   // server public IP
): Promise<void>
```

- 이미 동일한 A 레코드가 존재하면 → `PATCH`로 IP 업데이트 (idempotent)
- 오류 시 `Error` throw (호출부에서 catch)

### Phase 2 — `admin-server.ts`: 새 엔드포인트 추가

**엔드포인트**: `POST /api/domain/ssh-record`

**요청 바디**: 없음 (wizardState에서 모든 정보 취득)

**처리 순서**:

```typescript
1. wizardState 확인 — tunnelMode, apiToken, zoneId, zoneName
2. fetch('https://api.ipify.org?format=json') — 공인 IP 감지 (5초 타임아웃)
3. createARecord(apiToken, zoneId, `ssh.${zoneName}`, publicIp)
4. wizardState 업데이트: sshExternalHostname = `ssh.${zoneName}`
5. 저장: saveState(projectPath, wizardState)
```

**응답**:

```json
{
  "success": true,
  "hostname": "ssh.simplite.net",
  "ip": "123.45.67.89",
  "command": "ssh -p 2222 admin@ssh.simplite.net"
}
```

**오류 응답**:

```json
{
  "success": false,
  "error": "공인 IP를 감지할 수 없습니다. 서버가 공인 IP를 보유한 환경인지 확인하세요."
}
```

### Phase 3 — SSH ServiceDetailModal UI

**파일**: `packages/admin-ui/src/components/ServiceDetailModal.tsx`

SSH 서비스(`service.id === 'ssh'` 또는 `service.name === 'SSH Server'`)에서만 표시:

#### 버튼 (미설정 상태)

```
[⚡ 외부 SSH 접속 설정]
   tunnelMode !== 'named' → 비활성화 + "Named Tunnel 설정 후 사용 가능"
```

#### 결과 표시 (설정 완료 상태)

```
How to Connect
  [Terminal only]

  로컬:    ssh -p 2222 admin@localhost
  외부:    ssh -p 2222 admin@ssh.simplite.net  ← 추가됨
           [copy]
```

#### 방화벽 안내 메시지

설정 완료 후 항상 표시:

```
⚠ 외부 SSH 접속을 위해 서버 방화벽에서 TCP 포트 2222가 허용되어 있어야 합니다.
```

---

## WizardState 변경

`packages/shared/src/types/wizard-state.ts`에 SSH 외부 설정 필드 추가:

```typescript
// WizardState.domain 또는 최상위에 추가
sshExternalHostname?: string;  // 'ssh.simplite.net' — 설정 완료 시 저장
```

---

## 엣지 케이스

| 케이스 | 처리 방법 |
|--------|----------|
| 이미 `ssh.{zoneName}` A 레코드 존재 | IP가 변경된 경우 PATCH로 업데이트, 동일하면 성공 처리 |
| 공인 IP 감지 실패 (NAT, 방화벽) | 오류 메시지 + 수동 IP 입력 필드 표시 |
| Named Tunnel 미설정 | 버튼 비활성화 + 안내 |
| Cloudflare API 오류 (권한 부족) | 오류 메시지: "DNS 편집 권한이 필요합니다. API 토큰에 Zone:DNS:Edit 권한을 추가하세요." |
| 서버가 사설 IP만 보유 | 공인 IP 감지 결과가 사설 IP 대역(10.x, 192.168.x)이면 오류 처리 |

---

## API 권한 요구사항

기존 Cloudflare API 토큰에 이미 포함된 권한:
- `Zone:DNS:Edit` ← A 레코드 생성에 필요 (CNAME 생성 시 이미 사용)
- `Zone:Zone:Read` ← 이미 있음

추가 권한 불필요.

---

## 영향 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/cloudflare-client.ts` | `createARecord()` 함수 추가 |
| `packages/cli/src/services/admin-server.ts` | `POST /api/domain/ssh-record` 엔드포인트 추가 |
| `packages/shared/src/types/wizard-state.ts` | `sshExternalHostname?: string` 필드 추가 |
| `packages/admin-ui/src/components/ServiceDetailModal.tsx` | SSH 서비스 외부 접속 설정 UI |
| `packages/admin-ui/src/types.ts` | `ServiceStatus`에 `sshExternalHostname` 전달 (필요 시) |

---

## 검증 시나리오

### 테스트 1: 정상 흐름
1. Named Tunnel 설정 완료 상태에서 SSH 서비스 카드 클릭
2. 상세 모달 → "외부 SSH 접속 설정" 버튼 클릭
3. 로딩 중 버튼 비활성화
4. 성공 시: `ssh.{zoneName}` A 레코드가 Cloudflare Dashboard에 생성됨 확인
5. 모달에 외부 SSH 명령어 표시 확인
6. 서버에서 `ssh -p 2222 admin@ssh.{zoneName}` 접속 성공 확인

### 테스트 2: Named Tunnel 미설정
1. Quick Tunnel 모드 또는 터널 없는 상태에서 SSH 모달 열기
2. "외부 SSH 접속 설정" 버튼이 비활성화(grey)로 표시됨 확인
3. 버튼 hover 시 "Named Tunnel 설정 후 사용 가능" 툴팁 표시

### 테스트 3: 서버 재시작 후 상태 유지
1. 외부 SSH 설정 완료 후 admin 서버 재시작
2. SSH 서비스 모달을 다시 열었을 때 외부 명령어가 그대로 표시됨 (wizardState에 저장됨)

### 테스트 4: 공인 IP 변경 시 재설정
1. 서버 공인 IP 변경 후 "외부 SSH 접속 설정" 버튼 재클릭
2. Cloudflare DNS A 레코드가 새 IP로 업데이트됨 확인
-->
