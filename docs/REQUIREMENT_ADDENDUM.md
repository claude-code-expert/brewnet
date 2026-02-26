# Brewnet REQUIREMENT_ADDENDUM.md

> **Version**: 1.0  
> **Last Updated**: 2026-02-24  
> **Status**: Draft  
> **기반**: Gemini 마스터플랜 vs Brewnet 프로젝트 비교 분석  
> **대상 문서**: REQUIREMENT.md v2.2에 병합

---

## 개요

Gemini가 작성한 홈서버 마스터플랜 문서와 Brewnet 기존 REQUIREMENT.md를 비교 분석한 결과, 4개 영역에서 추가/보강이 필요합니다. 이 문서는 기존 요구사항 체계(REQ-XX.XX.XX)를 확장하여 신규 요구사항을 정의합니다.

### 추가 영역 요약

| # | 영역 | 핵심 내용 | 기존 REQ 연관 |
|:-:|------|----------|:------------:|
| A | 설치 완료 상태 페이지 | 자동 브라우저 팝업 + 서비스 상태 대시보드 | REQ-1.3.9 확장 |
| B | WebAuthn / Device Trust | Authelia 생체인증 기반 기기 신뢰 등록 - 우선순위 낮음| REQ-8.2 확장 |
| C | 메일 서버 강화 | docker-mailserver 경량 옵션 + 25번 포트 차단 대응 | REQ-1.12 보강 |
| D | 무료 티어 자동 배포 | webhook + Docker rebuild 기반 git push 파이프라인 | REQ-4.2 재조정 |

---

## A. 설치 완료 상태 페이지 (Post-Install Status Page)

### 배경

Gemini 문서는 Phase 5에서 설치 종료와 동시에 `http://localhost:8080` 대시보드를 자동 팝업하여 Running 서비스, DB 자격증명, 네트워크 상태를 한눈에 보여줍니다. Brewnet의 현재 Step 8(완료)은 CLI 텍스트 출력만 제공하며, 사용자가 "다음에 뭘 해야 하지?"라는 상태에 놓입니다.

UX 개선 분석(UX-03)에서도 "셋업 완료 후 가이드 부족"을 심각 항목으로 식별했으나, 구체적인 상태 페이지 요구사항이 REQUIREMENT.md에 없습니다.

### REQ-1.15 설치 완료 상태 페이지

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.15.1 | Step 8 완료 후 로컬 상태 페이지 자동 생성 — 정적 HTML 파일(`~/.brewnet/status/index.html`) | Must | 1 |
| REQ-1.15.2 | 상태 페이지 자동 브라우저 오픈 — `open` (macOS) / `xdg-open` (Linux) 명령으로 브라우저 팝업 | Must | 1 |
| REQ-1.15.3 | 브라우저 오픈 실패 시 CLI에 URL 출력 (fallback) | Must | 1 |
| REQ-1.15.4 | `--no-open` 플래그로 자동 팝업 비활성화 | Should | 1 |
| REQ-1.15.5 | `brewnet status --web` 명령어로 상태 페이지 재생성 및 오픈 | Should | 1 |

### REQ-1.16 상태 페이지 표시 정보

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.16.1 | **서비스 상태 섹션** — 활성화된 모든 컨테이너의 Running/Stopped 상태, 컨테이너명, 포트 | Must | 1 |
| REQ-1.16.2 | **접속 URL 섹션** — 로컬 URL (`localhost:PORT`) + 외부 URL (`service.domain.com`), 클릭 가능한 링크 | Must | 1 |
| REQ-1.16.3 | **관리자 크리덴셜 섹션** — username 표시, 비밀번호는 "복사" 버튼 + 마스킹 토글 (REQ-1.8.7 연동) | Must | 1 |
| REQ-1.16.4 | **네트워크 섹션** — 도메인 연결 상태, Cloudflare Tunnel 활성 여부, DNS 전파 상태 | Should | 1 |
| REQ-1.16.5 | **다음 단계 가이드** — "첫 번째 앱 배포하기", "파일 업로드하기", "Git 저장소 만들기" 등 인터랙티브 링크 | Should | 1 |
| REQ-1.16.6 | **시스템 리소스** — CPU/메모리/디스크 사용률 요약 (Docker stats 기반) | Could | 2 |

### 구현 방안

```
┌─────────────────────────────────────────────────────────────────┐
│  Brewnet Status Page 구현 방식                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: 정적 HTML 생성 (Phase 1 권장)                          │
│  ├─ CLI가 설치 결과를 기반으로 HTML 파일 생성                       │
│  ├─ 외부 의존성 없음 (서버 프로세스 불필요)                         │
│  ├─ `file://` 프로토콜로 브라우저에서 직접 열기                     │
│  └─ 단점: 실시간 상태 반영 불가 (생성 시점 스냅샷)                   │
│                                                                  │
│  Option B: 경량 HTTP 서버 (Phase 2 이후)                          │
│  ├─ Node.js 내장 HTTP 서버로 실시간 상태 제공                      │
│  ├─ Docker API 연동으로 컨테이너 상태 실시간 반영                   │
│  ├─ `brewnet status --serve` 명령으로 서버 기동                    │
│  └─ Pro 대시보드(REQ-11.2)로 자연스럽게 확장                       │
│                                                                  │
│  ⚡ Phase 1에서는 Option A, Phase 2 이후 Option B로 전환           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 상태 페이지 생성 로직 (TypeScript 스케치)

```typescript
// src/commands/status-page.ts

interface StatusPageData {
  projectName: string;
  services: Array<{
    name: string;
    container: string;
    status: 'running' | 'stopped' | 'error';
    localUrl: string;
    externalUrl?: string;
    port: number;
  }>;
  credentials: {
    username: string;
    passwordHint: string; // 마지막 4자만 표시
  };
  network: {
    domain: string | null;
    tunnelActive: boolean;
    dnsVerified: boolean;
  };
  system: {
    os: string;
    dockerVersion: string;
    totalContainers: number;
  };
  generatedAt: string;
}

async function generateStatusPage(data: StatusPageData): Promise<string> {
  // Tailwind CDN 포함 단일 HTML 파일 생성
  // 클립보드 복사 기능 (vanilla JS)
  // 반응형 레이아웃
  return htmlContent;
}

async function openStatusPage(): Promise<void> {
  const statusPath = path.join(BREWNET_DIR, 'status', 'index.html');
  const data = await collectStatusData();
  const html = await generateStatusPage(data);
  
  await fs.writeFile(statusPath, html);
  
  // 플랫폼별 브라우저 오픈
  const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    execSync(`${openCmd} ${statusPath}`);
  } catch {
    console.log(`\n📊 상태 페이지: file://${statusPath}`);
  }
}
```

---

## B. WebAuthn / Device Trust (생체인증 기기 신뢰)

### 배경

Gemini 문서는 Phase 3에서 Authentik + WebAuthn을 활용하여 "비밀번호 없이 Touch ID / Face ID로 통과"하는 기기 신뢰(Device Trust) 플로우를 정의합니다. 외부에서 홈서버에 접속할 때 "어떻게 안전하게 인증하는가"는 핵심 사용자 경험이며, 현재 Brewnet의 Authelia 설정에는 이 부분이 빠져있습니다.

Authelia는 v4.38+부터 WebAuthn을 공식 지원하며, FIDO2 표준 기반으로 Touch ID (macOS), Windows Hello, Android 생체인증을 활용할 수 있습니다. 이를 Brewnet의 기존 인증 체계에 통합합니다.

### REQ-8.3 WebAuthn / Device Trust

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-8.3.1 | Authelia WebAuthn 활성화 — `authelia` 설정에 `webauthn` 섹션 자동 포함 | Must | 3 |
| REQ-8.3.2 | 기기 등록 플로우 — Authelia 웹 UI에서 "이 기기 신뢰하기" 버튼으로 생체인증 키 등록 | Must | 3 |
| REQ-8.3.3 | Touch ID / Face ID / Windows Hello / Android 생체인증 지원 (FIDO2/WebAuthn 표준) | Must | 3 |
| REQ-8.3.4 | 등록된 기기에서 2차 인증 시 비밀번호 없이 생체인증만으로 통과 가능 | Must | 3 |
| REQ-8.3.5 | 신뢰 기기 관리 — `brewnet auth devices list` 명령으로 등록된 기기 목록 조회 | Should | 3 |
| REQ-8.3.6 | 신뢰 기기 해제 — `brewnet auth devices revoke <device-id>` 명령으로 기기 신뢰 해제 | Should | 3 |
| REQ-8.3.7 | WebAuthn 등록 가이드 — 셋업 완료 후 또는 `brewnet auth setup-webauthn` 명령으로 등록 안내 표시 | Should | 3 |
| REQ-8.3.8 | Attestation 방식 — `none` (기본값, 프라이버시 우선) 또는 `direct` (기기 제조사 검증) 선택 | Could | 3 |

### REQ-8.4 인증 정책 (Authentication Policy)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-8.4.1 | 서비스별 인증 레벨 설정 — `one_factor` (비밀번호만) / `two_factor` (비밀번호 + WebAuthn) | Must | 3 |
| REQ-8.4.2 | 민감 서비스 기본 `two_factor` — DB 관리 (pgAdmin), 서버 관리 도구에 2차 인증 기본 적용 | Must | 3 |
| REQ-8.4.3 | 일반 서비스 기본 `one_factor` — 파일 브라우저, 미디어 서버 등은 1차 인증만 | Should | 3 |
| REQ-8.4.4 | 정책 커스터마이징 — `brewnet auth policy set <service> <level>` 명령으로 개별 서비스 인증 레벨 변경 | Should | 3 |
| REQ-8.4.5 | 로컬 네트워크 바이패스 — 같은 LAN 대역(192.168.x.x)에서 접속 시 인증 레벨 완화 옵션 | Could | 3 |

### Authelia WebAuthn 설정 예시

```yaml
# ~/.brewnet/config/authelia/configuration.yml

webauthn:
  disable: false
  display_name: 'Brewnet Home Server'
  attestation_conveyance_preference: 'indirect'
  user_verification: 'preferred'
  timeout: '60s'

access_control:
  default_policy: 'deny'
  rules:
    # 민감 서비스 — 2차 인증 필수
    - domain:
        - 'pgadmin.${DOMAIN}'
        - 'admin.${DOMAIN}'
      policy: 'two_factor'
    
    # 일반 서비스 — 1차 인증
    - domain:
        - 'files.${DOMAIN}'
        - 'git.${DOMAIN}'
        - 'media.${DOMAIN}'
      policy: 'one_factor'
    
    # API 엔드포인트 — 토큰 인증 (Authelia 바이패스)
    - domain: '*.${DOMAIN}'
      resources:
        - '^/api/.*'
      policy: 'bypass'
```

### Device Trust 사용자 플로우

```
[최초 설정 — 1회]

1. 관리자가 Mac/Phone 브라우저로 Authelia 로그인 페이지 접속
   https://auth.mydomain.com

2. 사용자명 + 비밀번호 로그인 (1차 인증)

3. "이 기기를 신뢰하시겠습니까?" 프롬프트
   ┌─────────────────────────────────────────────┐
   │  🔐 기기 신뢰 등록                            │
   │                                              │
   │  이 기기를 신뢰 기기로 등록하면                  │
   │  다음부터 생체인증만으로 로그인할 수 있습니다.     │
   │                                              │
   │  [ Touch ID로 등록 ]   [ 나중에 ]              │
   └─────────────────────────────────────────────┘

4. Touch ID / Face ID 인증 → WebAuthn 키 쌍 생성 및 등록

5. 등록 완료 확인

[이후 접속]

1. Authelia 로그인 페이지 접속
2. 사용자명 입력
3. "등록된 기기가 감지되었습니다" → Touch ID 팝업
4. 생체인증 통과 → 즉시 로그인 (비밀번호 입력 없음)
```

---

## C. 메일 서버 강화

### 배경

REQ-1.12에 docker-mailserver 기반 메일 서버가 이미 정의되어 있으나, Gemini 문서에서 언급한 25번 포트 차단 대응(SMTP 릴레이)과 운영 안정성 관련 요구사항이 부족합니다. 대부분의 ISP/클라우드 환경에서 25번 포트를 차단하므로, 이에 대한 대안 경로가 필수입니다.

### REQ-1.12 보강 항목

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.12.10 | **25번 포트 차단 감지** — 설치 시 SMTP 아웃바운드 포트(25) 자동 테스트 | Must | 1 |
| REQ-1.12.11 | **SMTP 릴레이 자동 구성** — 25번 포트 차단 시 외부 SMTP 릴레이 설정 가이드 표시 및 자동 구성 | Must | 1 |
| REQ-1.12.12 | **릴레이 프로바이더 프리셋** — Gmail SMTP, SendGrid, Mailgun, Amazon SES 등 주요 릴레이 서비스 설정 프리셋 | Should | 2 |
| REQ-1.12.13 | **Gmail App Password 가이드** — Gmail SMTP 릴레이 사용 시 앱 비밀번호 생성 절차 안내 | Should | 2 |
| REQ-1.12.14 | **메일 발송 테스트** — `brewnet mail test <email>` 명령으로 테스트 메일 발송 및 결과 확인 | Should | 2 |
| REQ-1.12.15 | **메일 큐 모니터링** — `brewnet mail queue` 명령으로 대기 중인 메일 목록 확인 | Could | 2 |
| REQ-1.12.16 | **Roundcube 웹메일 옵션** — 웹 기반 메일 클라이언트를 선택적 서비스로 제공 (`mail.{DOMAIN}`) | Could | 3 |

### 25번 포트 차단 감지 및 릴레이 구성 플로우

```
brewnet init → Step 4 (도메인 설정) → Mail Server 섹션

  ┌─────────────────────────────────────────────────────────────┐
  │  📧 메일 서버 설정                                           │
  │                                                              │
  │  SMTP 포트(25) 테스트 중...                                   │
  │                                                              │
  │  ⚠️  포트 25가 차단되어 있습니다.                               │
  │     (대부분의 ISP/홈 네트워크에서 스팸 방지를 위해 차단합니다)    │
  │                                                              │
  │  📌 외부 SMTP 릴레이를 설정하면 메일 발송이 가능합니다.          │
  │                                                              │
  │  ? SMTP 릴레이 설정:                                          │
  │                                                              │
  │    ◉ Gmail SMTP (무료, 하루 500통)                             │
  │    ○ SendGrid (무료 100통/일)                                  │
  │    ○ 직접 입력 (SMTP 호스트/포트/인증)                          │
  │    ○ 메일 서버 건너뛰기                                        │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘
```

### SMTP 릴레이 docker-compose 설정

```yaml
# docker-mailserver SMTP 릴레이 설정
services:
  mailserver:
    image: ghcr.io/docker-mailserver/docker-mailserver:latest
    container_name: brewnet-mail
    hostname: mail.${DOMAIN}
    environment:
      # 기본 설정
      - OVERRIDE_HOSTNAME=mail.${DOMAIN}
      - POSTMASTER_ADDRESS=admin@${DOMAIN}
      - ENABLE_SPAMASSASSIN=1
      - ENABLE_CLAMAV=0           # 리소스 절약 (홈서버)
      - ENABLE_FAIL2BAN=1
      
      # SMTP 릴레이 (25번 포트 차단 시)
      - DEFAULT_RELAY_HOST=[smtp.gmail.com]:587
      - RELAY_USER=${SMTP_RELAY_USER}
      - RELAY_PASSWORD=${SMTP_RELAY_PASSWORD}
    ports:
      - "587:587"     # SMTP Submission
      - "993:993"     # IMAPS
    volumes:
      - mail-data:/var/mail
      - mail-state:/var/mail-state
      - mail-config:/tmp/docker-mailserver
      - ./config/mail/dkim:/tmp/docker-mailserver/opendkim/keys
    networks:
      - brewnet
```

---

## D. 무료 티어 자동 배포 파이프라인

### 배경

현재 REQUIREMENT.md에서 `git push → 자동 빌드/배포`(REQ-4.2)는 Phase 2에 정의되어 있지만, Webhook 자동 배포(REQ-3.1.8)가 Pro 전용입니다. Gemini 문서는 Coolify + Nixpacks로 무료 사용자에게도 완전한 CI/CD를 제공합니다.

Coolify는 리소스를 많이 소비하고 추가 학습 곡선이 있으므로, Brewnet은 경량 대안으로 **Gitea Webhook + 자체 빌드 러너** 방식을 무료 티어에 기본 제공합니다. "코드 수정 → git push → 자동으로 새 버전 배포"라는 개발 루프를 무료 사용자도 즉시 경험할 수 있어야 합니다.

### REQ-4.2 재조정 (Free Tier 포함)

| ID | 요구사항 | 우선순위 | Phase | Tier |
|----|---------|:--------:|:-----:|:----:|
| REQ-4.2.1 | `git push` → Webhook → 빌드 → 배포 자동화 — **무료 티어 기본 제공** | Must | 2 | Free |
| REQ-4.2.2 | 런타임 자동 감지 (Node/Python/Java/Go) | Must | 2 | Free |
| REQ-4.2.3 | 배포 성공/실패 CLI 알림 (`brewnet deploy logs`) | Should | 2 | Free |
| REQ-4.2.4 | 배포 로그 실시간 스트리밍 (웹 대시보드) | Could | 4 | Pro |

### REQ-4.3 경량 빌드 러너 (Brewnet Builder)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-4.3.1 | `brewnet-builder` 서비스 — Gitea Webhook 수신 후 Docker 이미지 빌드/재배포하는 경량 컨테이너 | Must | 2 |
| REQ-4.3.2 | Webhook 엔드포인트 — `POST /hooks/deploy` (Gitea에서 push 이벤트 수신) | Must | 2 |
| REQ-4.3.3 | 빌드 전략 — Dockerfile 감지 시 `docker build`, 없으면 프레임워크별 자동 Dockerfile 생성 (REQ-3.1.4 연동) | Must | 2 |
| REQ-4.3.4 | 제로 다운타임 재배포 — `docker compose up -d --build <service>` 기반 롤링 업데이트 | Should | 2 |
| REQ-4.3.5 | 빌드 큐 — 동시 빌드 요청 시 순차 처리 (홈서버 리소스 보호) | Should | 2 |
| REQ-4.3.6 | 빌드 캐시 — Docker 레이어 캐시 활용으로 재빌드 시간 단축 | Should | 2 |
| REQ-4.3.7 | 빌드 타임아웃 — 최대 10분 (기본값), `brewnet.yml`에서 설정 가능 | Should | 2 |
| REQ-4.3.8 | 빌드 실패 시 이전 버전 유지 (자동 롤백) | Must | 2 |

### 자동 배포 아키텍처

```
┌────────────────────────────────────────────────────────────────────┐
│  Free Tier 자동 배포 파이프라인                                      │
└────────────────────────────────────────────────────────────────────┘

  개발자 로컬       Gitea (Git Server)     Brewnet Builder     Docker
  ──────────       ─────────────────      ───────────────     ──────

  git push ────→  push 이벤트 발생 ────→  Webhook 수신
                                          │
                                          ├─ 소스코드 clone
                                          ├─ Dockerfile 감지/생성
                                          ├─ docker build
                                          ├─ 헬스체크 대기
                                          │
                                          ├─ 성공 → 새 컨테이너 ────→  🟢 Running
                                          │         이전 컨테이너 제거
                                          │
                                          └─ 실패 → 이전 버전 유지 ──→  🟡 Rollback
                                                   에러 로그 저장


[Free vs Pro 차이점]

  Free:
  ├─ Webhook 기반 자동 빌드/배포 ✅
  ├─ CLI 로그 확인 (brewnet deploy logs) ✅
  ├─ 빌드 실패 시 자동 롤백 ✅
  └─ 동시 빌드 1개 제한

  Pro:
  ├─ 위 기능 모두 포함
  ├─ 웹 대시보드 실시간 로그 스트리밍
  ├─ 수동 롤백 (특정 버전으로)
  ├─ 동시 빌드 3개
  └─ 배포 알림 (Slack/Discord/Email)
```

### brewnet-builder Docker Compose

```yaml
# docker-compose.yml에 자동 포함 (Git Server + App 배포 시)
services:
  brewnet-builder:
    image: brewnet/builder:latest   # 또는 Node.js 기반 자체 빌드
    container_name: brewnet-builder
    restart: unless-stopped
    environment:
      - GITEA_URL=http://gitea:3000
      - GITEA_TOKEN=${GITEA_ADMIN_TOKEN}
      - DOCKER_HOST=unix:///var/run/docker.sock
      - BUILD_TIMEOUT=600            # 10분
      - MAX_CONCURRENT_BUILDS=1      # Free: 1, Pro: 3
      - COMPOSE_PROJECT_DIR=${BREWNET_DIR}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${BREWNET_DIR}/builds:/builds
      - ${BREWNET_DIR}/logs/builder:/logs
    networks:
      - brewnet
    labels:
      - "traefik.enable=false"       # 내부 전용 (외부 노출 안 함)
```

### Webhook 자동 설정 플로우

```
brewnet deploy ./my-app 실행 시:

  1. 소스코드를 Gitea에 push (로컬 Git 서버)
  2. Gitea 저장소에 Webhook 자동 등록
     POST http://brewnet-builder:9876/hooks/deploy
     Content-Type: application/json
     Secret: ${WEBHOOK_SECRET}
  3. brewnet-builder가 초기 빌드 수행
  4. 이후 git push 때마다 자동 재빌드/재배포

  ※ brewnet.yml 파일이 있으면 설정 우선 적용
  ※ 없으면 프레임워크 자동 감지 (REQ-3.3)
```

---

## 기존 REQ 수정사항

위 신규 요구사항 추가에 따라 기존 REQUIREMENT.md에서 수정이 필요한 항목입니다.

### REQ-1.3.9 (수정)

**변경 전:**
> Step 8: 완료 (서비스 시작 및 접속 정보 표시)

**변경 후:**
> Step 8: 완료 (서비스 시작, 접속 정보 표시, **상태 페이지 자동 생성 및 브라우저 오픈** — REQ-1.15 참조)

### REQ-3.1.8 (수정)

**변경 전:**
> 롤백 (Pro)

**변경 후:**
> 롤백 — **빌드 실패 시 자동 롤백은 Free 기본 제공**, 수동 롤백(특정 버전 지정)은 Pro

### REQ-4.2.1 (수정)

**변경 전:**
> `git push` → Webhook → 빌드 → 배포 자동화 (Phase 2)

**변경 후:**
> `git push` → Webhook → 빌드 → 배포 자동화 — **Free 티어 기본 제공** (brewnet-builder 경량 러너, REQ-4.3 참조)

### REQ-8.2.3 (수정)

**변경 전:**
> 2FA / TOTP (Pro)

**변경 후:**
> 2FA — **WebAuthn/생체인증은 Free 기본 제공** (REQ-8.3 참조), TOTP는 Pro

---

## 우선순위 및 Phase 매핑

| 영역 | Phase 1 (MVP) | Phase 2 | Phase 3 |
|------|:-------------:|:-------:|:-------:|
| A. 상태 페이지 | REQ-1.15 전체, REQ-1.16.1~5 | REQ-1.16.6 (실시간) | — |
| B. WebAuthn | — | — | REQ-8.3, REQ-8.4 전체 |
| C. 메일 강화 | REQ-1.12.10~11 | REQ-1.12.12~15 | REQ-1.12.16 |
| D. 자동 배포 | — | REQ-4.2 (재조정), REQ-4.3 전체 | — |

### 구현 예상 시간

| 영역 | 예상 공수 | 난이도 | 담당 |
|------|:--------:|:------:|:----:|
| A. 상태 페이지 (정적 HTML) | 2~3일 | ⭐⭐ | Frontend |
| B. WebAuthn / Device Trust | 3~5일 | ⭐⭐⭐ | Backend |
| C. 메일 서버 강화 | 2~3일 | ⭐⭐ | DevOps |
| D. 자동 배포 파이프라인 | 5~7일 | ⭐⭐⭐⭐ | Backend |

---

## Related Documents

- [REQUIREMENT.md](REQUIREMENT.md) — 기존 요구사항 (v2.2)
- [brewnet_user_workflow_simulation.md](brewnet_user_workflow_simulation.md) — UX 시뮬레이션
- [UX_IMPROVEMENTS.md](UX_IMPROVEMENTS.md) — UX 개선사항 (UX-03 연관)
- [brewnet-filebrowser-integration.md](brewnet-filebrowser-integration.md) — Authelia 연동 참조
- [HOMESERVER_CLOUDFLARE_TUNNEL.md](HOMESERVER_CLOUDFLARE_TUNNEL.md) — 외부 접근 설정 참조
- Gemini 마스터플랜 v1.0.1 — 비교 분석 원본
