# Brewnet PRD (Product Requirements Document)

> **Version**: 2.2
> **Last Updated**: 2026-02-22
> **Status**: Draft

---

## 1. Executive Summary

### 1.1 Problem Statement

홈서버 구축에는 다음과 같은 장벽이 존재한다:

| 영역 | 필요 작업 | 어려움 |
|------|----------|--------|
| 네트워크 | 포트포워딩, DDNS, 방화벽 | 라우터 설정, CLI 명령어 |
| Docker | 컨테이너 관리, Compose 작성 | 명령어 암기, YAML 문법 |
| 개발환경 | Node/Python/Java 설치 | 버전 충돌, 의존성 관리 |
| 배포 | Git clone, 빌드, 실행 | 프로세스 관리, 로그 |
| 도메인 | DNS, SSL, 리버스 프록시 | Nginx 설정, 인증서 관리 |

**핵심 문제**: 각 단계마다 다른 도구, 다른 문법, 다른 학습 곡선이 요구됨.

### 1.2 Solution

**Brewnet** = 인터랙티브 CLI 위저드 + Docker Compose 자동 생성 + 홈서버 관리

```bash
npm install -g brewnet
brewnet init
```

8단계(Step 0-7) 인터랙티브 위저드를 통해 서비스를 선택하면, 최적화된 docker-compose.yml이 자동 생성되고 서비스가 기동된다. 관리자 계정이 자동 생성되며, DigitalPlat 무료 도메인과 Cloudflare Tunnel을 통해 포트포워딩 없이 외부 접근이 가능하다.

### 1.3 Value Proposition

| Before | After (Brewnet) |
|--------|-----------------|
| 서버 설정 2-3일 | 30분 내 완료 |
| Docker/Nginx CLI 암기 | 인터랙티브 위저드 |
| 설정 파일 직접 편집 | docker-compose.yml 자동 생성 |
| 수동 SSL 갱신 | 자동 발급/갱신 (Pro) |
| 분산된 도구들 | 통합 CLI + Dashboard (Pro) |
| 포트포워딩/NAT 설정 | Cloudflare Tunnel 자동 구성 (기본 ON) |
| 도메인 구매 필요 | DigitalPlat 무료 도메인 제공 |
| 서비스별 계정 설정 | 관리자 계정 자동 생성 + 서비스 연동 |

---

## 2. Product Vision

### 2.1 Vision Statement

> "누구나 자신만의 클라우드를 소유할 수 있는 세상"

**Slogan**: "Your Home Server, Brewed Fresh"

### 2.2 Core Principles

1. **Zero Config** — 기본값으로 바로 동작, 설정 없이 시작 가능
2. **Secure by Default** — SSH 키 인증, root 로그인 비활성화, 방화벽 자동 설정
3. **Transparent** — 모든 동작이 로그로 기록, 생성된 설정 파일 직접 확인/수정 가능
4. **Reversible** — 모든 작업 되돌리기 가능 (rollback, restore)
5. **Offline First** — 핵심 CLI 기능은 인터넷 없이 동작 (Docker pull 제외)

### 2.3 Target Users

| 구분 | 사용자 | 특징 |
|------|--------|------|
| **Primary** | 사이드 프로젝트 개발자 | 개인 프로젝트 셀프호스팅, 클라우드 비용 절감 |
| **Secondary** | 홈랩 입문자 | NAS 확장, 백엔드 경험 부족, GUI 선호 |
| **Tertiary** | 소규모 팀 리드 | 내부 도구 셀프호스팅, 접근 권한 관리 |

---

## 3. Business Model

### 3.1 Pricing Tiers (Freemium)

| | Free | Pro | Team |
|---|:---:|:---:|:---:|
| **가격** | $0/월 | $9/월 | $29/월/서버 |
| **대상** | 개인 학습/실험 | 개인 운영 | 팀 운영 |
| CLI 전체 기능 | O | O | O |
| 웹 대시보드 | X | O | O |
| 자동 배포 (Webhook) | X | O | O |
| SSL 자동 발급/갱신 | X | O | O |
| Rate Limiting / Geo Block | X | O | O |
| 접근 로그 / 알림 | X | O | O |
| 2FA / API Key | X | O | O |
| 팀 멤버 관리 | X | X | O |
| 멀티 서버 | X | X | O |
| 감사 로그 / RBAC | X | X | O |

### 3.2 License

- **License**: BUSL-1.1 (Business Source License 1.1)
- **Licensor**: Brewnet (codevillain)
- **Change Date**: 2029-01-01
- **Change License**: Apache License 2.0
- 개인 비상업적 사용 자유, 상업적 사용 시 별도 라이선스 필요

---

## 4. User Journey

### 4.1 핵심 사용자 플로우

```
[설치] → [초기 설정 위저드] → [서비스 선택] → [docker-compose 생성] → [서비스 기동]
   │                                                                        │
   │     ┌──────────────────────────────────────────────────────────────────┘
   ▼     ▼
[서비스 관리] → [도메인/Cloudflare 설정] → [보안 설정] → [Pro 업그레이드]
```

### 4.2 설치 및 초기 설정

```bash
# 1. 설치
npm install -g brewnet

# 2. 인터랙티브 위저드 실행 (8단계: Step 0-7)
brewnet init
#   Step 0: 시스템 체크 (OS, Docker, Node.js, Git, 포트, 디스크)
#   Step 1: 프로젝트 설정 (이름, 경로, Full Install / Partial Install)
#   Step 2: 관리자 계정 + 서버 컴포넌트 (Web(필수)/Git(필수)/File/DB/Media/SSH)
#   Step 3: Dev Stack & 런타임 (다중 선택, Frontend, FileBrowser) — 항상 표시
#   Step 4: 도메인 & 네트워크 (Local/FreeDomain/Custom, Cloudflare Tunnel, Mail Server)
#   Step 5: 리뷰 & 확인 (자격증명 전파 대상, 리소스 추정, 설정 내보내기)
#   Step 6: 생성 & 시작 (docker-compose.yml, 이미지 풀, 컨테이너 시작, 헬스체크)
#   Step 7: 완료 (엔드포인트, 자격증명, 외부 접근 검증, 다음 단계)

# 3. 서비스 관리
brewnet status
brewnet add jellyfin
brewnet logs
```

### 4.3 서비스 관리 (일상 사용)

```bash
brewnet up                    # 전체 서비스 시작
brewnet down                  # 전체 서비스 중지
brewnet status                # 서비스 상태 확인
brewnet add <service>         # 서비스 추가
brewnet remove <service>      # 서비스 제거
brewnet logs [service]        # 로그 확인
brewnet update                # 서비스 업데이트
brewnet backup                # 백업 생성
brewnet restore <backup-id>   # 백업 복원
```

### 4.4 배포 (개발자 플로우)

```bash
# Git 기반 배포
brewnet deploy ./my-app
brewnet deploy https://github.com/user/repo.git

# Gitea 연동 자동 배포
brewnet git install
brewnet git repo create my-app
brewnet git hook setup my-app --app my-app
git push brewnet main         # → 자동 빌드/배포
```

### 4.5 도메인 + Cloudflare

```bash
# 무료 도메인 등록 (DigitalPlat FreeDomain)
brewnet domain free register myserver.dpdns.org
# → 지원 TLD: .dpdns.org (권장), .qzz.io, .us.kg

# 기존 도메인 사용
brewnet domain add app.example.com --app my-app

# Cloudflare 연동
brewnet domain cloudflare setup --token xxx

# Cloudflare Tunnel (기본 활성화 — 포트포워딩 불필요)
brewnet tunnel status
# → cloudflared 컨테이너가 docker-compose에 자동 포함됨
# → NAT/CGNAT 환경에서도 외부 접근 가능
# → Cloudflare 경유 자동 HTTPS

brewnet domain ssl app.example.com
# → HTTPS 자동 설정 완료
```

---

## 5. Feature Overview

### 5.1 Core Modules (15개)

| # | 모듈 | 설명 | Phase |
|---|------|------|:-----:|
| 1 | **Docker Manager** | 컨테이너 CRUD, docker-compose 생성, 헬스체크 | 1 |
| 2 | **Runtime Manager** | 언어 런타임 지원 (Node/Python/Java/Go/Ruby/Rust) | 1 |
| 3 | **Deploy Manager** | Git 기반 배포 파이프라인, 롤백 | 2 |
| 4 | **SSL Manager** | Let's Encrypt / Certbot 자동 구성 | 2 |
| 5 | **Nginx Manager** | 리버스 프록시 자동 구성, 가상 호스트 | 2 |
| 6 | **ACL Manager** | 접근 제어, 사용자 권한, 방화벽 규칙 | 3 |
| 7 | **Git Server** | Gitea 통합 (필수), 저장소 관리, 자동 배포 | 1 |
| 8 | **File Manager** | Nextcloud, MinIO (S3), SFTP, Jellyfin 스트리밍 | 3 |
| 9 | **Database Manager** | PostgreSQL, MySQL, SQLite, Redis, Valkey, KeyDB 관리 | 3 |
| 10 | **SSH Manager** | OpenSSH 설정, 키 인증, 사용자 관리 | 3 |
| 11 | **SSO Auth** | 통합 인증 (세션, JWT, OAuth2, 2FA) | 3 |
| 12 | **Admin Account** | 마스터 관리자 계정 (위저드 Step 2, 자동 생성 20자 비밀번호, .env 저장 chmod 600) | 1 |
| 13 | **Cloudflare Tunnel** | 외부 접근용 터널 (기본 활성화, NAT/CGNAT 지원, 포트포워딩 불필요) | 1 |
| 14 | **Credential Propagation** | 단일 관리자 크리덴셜(username/password)을 Step 2에서 1회 입력, Nextcloud/pgAdmin/Jellyfin/Gitea/FileBrowser/SSH Server/Mail Server에 자동 전파. DB는 별도 크리덴셜이나 미입력 시 관리자 비밀번호 자동 적용 | 1 |
| 15 | **External Access Verification** | DNS 전파 확인, Cloudflare Tunnel 연결 테스트, HTTPS 엔드포인트 헬스체크, SSH 연결 테스트. Step 7(완료)에서 non-local 도메인 대상 표시 | 1 |

### 5.2 Supported Infrastructure Services

| 카테고리 | 서비스 |
|----------|--------|
| 파일 서버 | Nextcloud, MinIO |
| 웹 서버 | Traefik, Nginx, Caddy |
| Git 서버 | Gitea (필수, 버전 관리, 자동 배포 파이프라인) |
| 파일 관리 | FileBrowser (`filebrowser/filebrowser:latest`) — 파일 관리 웹 UI (App Server 시 기본 포함) |
| 미디어 | Jellyfin |
| 데이터베이스 | PostgreSQL, MySQL, SQLite, Redis, Valkey, KeyDB |
| SSH 서버 | OpenSSH Server (`linuxserver/openssh-server:latest`) — 포트 2222, 키 기반 인증, SFTP 서브시스템, 관리자 크리덴셜 사용 |
| 메일 서버 | docker-mailserver (`ghcr.io/docker-mailserver/docker-mailserver:latest`) — SMTP 587, IMAP 993, 도메인 필수, 관리자 계정을 postmaster로 사용 |
| 터널/프록시 | Cloudflare Tunnel (`cloudflare/cloudflared:latest`) — 기본 활성화 |
| 도메인 | DigitalPlat FreeDomain (.dpdns.org, .qzz.io, .us.kg) + Cloudflare DNS |

### 5.3 Cloudflare Tunnel Architecture

Brewnet은 Cloudflare Tunnel을 기본 외부 접근 수단으로 채택한다. NAT/CGNAT 환경에서도 포트포워딩 없이 외부 접근이 가능하다.

#### 5.3.1 아키텍처

```
[External User] → [Cloudflare Edge] → [Cloudflare Tunnel (outbound)] → [Home Server]
                        ↓                                                    ↓
                  Auto HTTPS/DDoS                              cloudflared container
                  Access Policies                              (docker-compose 포함)
```

- **Outbound-only**: cloudflared 컨테이너가 Cloudflare 엣지로 아웃바운드 연결을 유지
- **포트포워딩 불필요**: 인바운드 포트 개방 없이 외부 서비스 노출
- **자동 HTTPS**: Cloudflare 경유 SSL/TLS 자동 적용
- **DDoS 보호**: Cloudflare 글로벌 네트워크 경유

#### 5.3.2 Zero Trust Access Policy (Phase 2+)

| 정책 유형 | 설명 | Phase |
|-----------|------|:-----:|
| Email Whitelist | 특정 이메일 주소만 접근 허용 | 2 |
| One-Time PIN (OTP) | 이메일 기반 일회성 인증 코드 | 2 |
| Service-level Policy | 서비스별 개별 접근 제어 (예: DB Admin은 관리자만) | 3 |

#### 5.3.3 Ingress Rule (서비스별 Public Hostname)

docker-compose 생성 시 활성화된 서비스에 대해 Cloudflare Tunnel ingress rule을 자동 생성:

| 서비스 | Public Hostname | 내부 서비스 |
|--------|----------------|------------|
| Dashboard | `mydomain.com` | `http://traefik:80` |
| File Server | `files.mydomain.com` | `http://nextcloud:80` |
| FileBrowser | `files.mydomain.com` | `http://filebrowser:80` |
| App | `app.mydomain.com` | `http://app:PORT` |
| DB Admin | `db.mydomain.com` | `http://pgadmin:5050` |
| Media | `media.mydomain.com` | `http://jellyfin:8096` |
| Webmail | `mail.mydomain.com` | `http://roundcube:80` |

#### 5.3.4 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 502 Bad Gateway | 서비스 컨테이너 미실행 또는 포트 불일치 | `docker ps` 확인, 서비스가 `brewnet` 네트워크에 연결되었는지 확인 |
| SSL 무한 리다이렉트 | Cloudflare SSL 모드가 "Flexible" | Cloudflare 대시보드에서 SSL 모드를 "Full" 로 변경 |
| 터널 연결 끊김 | 토큰 만료 또는 네트워크 문제 | `docker logs brewnet-cloudflared` 확인, 토큰 재발급 |
| DNS 미전파 | 전파 대기 중 (15분~48시간) | `https://dnschecker.org`에서 전파 상태 확인 |

### 5.4 Free Domain Registration Flow (DigitalPlat)

DigitalPlat FreeDomain + Cloudflare DNS를 통한 무료 도메인 등록 플로우:

#### 지원 TLD

| TLD | 특징 | 권장 |
|-----|------|:----:|
| `.dpdns.org` | 가장 안정적, 즉시 등록 | **권장** |
| `.qzz.io` | 짧은 도메인, 즉시 등록 | O |
| `.us.kg` | 무료, GitHub 승인 필요 | △ |

#### 등록 8단계

1. **Cloudflare 계정 생성** — dash.cloudflare.com 에서 무료 계정 생성
2. **DigitalPlat 가입** — dash.domain.digitalplat.org 에서 계정 생성
3. **도메인 검색** — 원하는 도메인명 + TLD 선택
4. **도메인 등록** — DigitalPlat에서 도메인 등록 완료
5. **Cloudflare NS 위임** — DigitalPlat 패널에서 Cloudflare 네임서버 설정
6. **DNS 전파 대기** — 15분~24시간 (확인: `dig +short NS mydomain.dpdns.org`)
7. **Cloudflare Tunnel 생성** — Zero Trust Dashboard에서 터널 생성, 토큰 복사
8. **Brewnet 설정** — 위저드 Step 4에서 도메인 + 터널 토큰 입력

> **참고**: DigitalPlat은 현재 공개 API를 제공하지 않습니다. 위저드에서 가이드를 제공하고, 향후 API 연동을 계획합니다.

### 5.5 External Access Strategy

Brewnet은 외부 접근을 위해 6가지 솔루션을 검토하고 Cloudflare Tunnel을 채택했다.

| 솔루션 | 방식 | 무료 | 포트포워딩 불필요 | 도메인 필요 | 셀프호스팅 |
|--------|------|:----:|:-----------------:|:-----------:|:----------:|
| **Cloudflare Tunnel** | 리버스 프록시 | O (무제한) | O | O (CF 관리) | X |
| Tailscale | Mesh VPN | O (100대) | O | X | △ (Headscale) |
| ZeroTier | Virtual LAN | O (25대) | O | X | O |
| frp | 리버스 프록시 | O (셀프) | △ (VPS 필요) | X | O |
| ngrok | 터널 | △ (제한) | O | X | X |
| WireGuard | VPN | O (셀프) | O | X | O |

**Cloudflare Tunnel 선정 이유**: 무료 무제한 + 포트포워딩 불필요 + 자동 HTTPS + DDoS 보호 + Docker 네이티브 통합

> 상세 분석은 `docs/spec/home-server-external-access-solutions.md` 참조

### 5.6 Feature Matrix by Tier

| 모듈 | 기능 | Free | Pro | Team |
|------|------|:----:|:---:|:----:|
| **설치** | CLI 설치 + 위저드 | O | O | O |
| | 자동 업데이트 | X | O | O |
| **네트워크** | 외부 접근 진단 | O | O | O |
| | 공유기 가이드 / UPnP | O | O | O |
| **Git Server** | Gitea 설치/관리 | O | O | O |
| | Git Push 자동 배포 | O | O | O |
| **배포** | 자동 감지/빌드/배포 | O | O | O |
| | 롤백 | X | O | O |
| | Blue-Green | X | X | O |
| **도메인** | Cloudflare 연동 + 서브도메인 관리 | O | O | O |
| | SSL 자동 발급/갱신 | X | O | O |
| | 와일드카드 SSL | X | O | O |
| **파일 관리** | FileBrowser 웹 파일 관리 UI | O | O | O |
| | 웹 파일 브라우저 + SFTP | O | O | O |
| | 공유 링크 / WebDAV | X | O | O |
| **DB 관리** | PostgreSQL/MySQL/SQLite 설치/관리 | O | O | O |
| | 웹 쿼리 에디터 / 자동 백업 | X | O | O |
| **인증** | 로컬 로그인 + 서비스별 권한 | O | O | O |
| | 2FA / API Key / OAuth2 | X | O | O |
| | 팀 관리 / RBAC / 감사 로그 | X | X | O |
| **관리자 계정** | 자동 생성 마스터 관리자 (20자 비밀번호) | O | O | O |
| | 서비스 기본 인증 연동 | O | O | O |
| **Cloudflare Tunnel** | 외부 접근 터널 (기본 ON, NAT/CGNAT 지원) | O | O | O |
| | 자동 HTTPS (Cloudflare) | O | O | O |
| **무료 도메인** | DigitalPlat FreeDomain (.dpdns.org, .qzz.io, .us.kg) | O | O | O |
| | Cloudflare DNS 자동 연동 | O | O | O |
| **SSH 서버** | OpenSSH Server (포트 2222, 키 기반 인증) | O | O | O |
| | SFTP 서브시스템 | O | O | O |
| **메일 서버** | docker-mailserver (SMTP/IMAP, 도메인 필수) | O | O | O |
| | DKIM 서명 / Anti-spam | O | O | O |
| **크리덴셜 전파** | 관리자 계정 1회 입력 → 전체 서비스 자동 전파 | O | O | O |
| | Step 5 Review에서 전파 대상 목록 표시 | O | O | O |
| **외부 접근 검증** | DNS/Tunnel/HTTPS/SSH 연결 테스트 (Step 7) | O | O | O |
| **Docker** | CLI 관리 | O | O | O |
| | 웹 UI (Dashboard) | X | O | O |

---

## 6. Development Roadmap

| Phase | 기간 | 핵심 목표 | 주요 산출물 |
|-------|------|----------|------------|
| **Phase 1** (MVP) | 2주 | CLI 기초 + Docker 관리 | 설치 위저드, docker-compose 생성, 서비스 관리, Git 서버 (Gitea) |
| **Phase 2** | 2주 | 네트워킹 + 배포 | 도메인/SSL, Cloudflare, Nginx, 자동 배포 |
| **Phase 3** | 2주 | 보안 + 데이터 관리 | SSH, ACL, 방화벽, 파일/DB 관리, SSO |
| **Phase 4** | 2주 | Dashboard (Pro) | Next.js 웹 대시보드, 실시간 로그 |
| **Phase 5** | 2주 | 고도화 | 테스트, 문서화, 성능 최적화, 모니터링 통합 (Grafana/Prometheus 선택적 add-on), 베타 출시 |

### Phase 1 완료 시나리오

```bash
npm install -g brewnet
brewnet init
# → 위저드로 서비스 선택 → docker-compose.yml 생성 → 서비스 기동

brewnet status
# → 모든 서비스 상태 확인

brewnet add jellyfin
# → Jellyfin 서비스 추가 + 자동 시작
```

### Phase 2 완료 시나리오

```bash
brewnet domain cloudflare setup --token xxx
brewnet domain add myserver.example.com
brewnet domain ssl myserver.example.com
brewnet git install
brewnet git repo create my-app
git push brewnet main
# → https://my-app.myserver.example.com 에 자동 배포
```

---

## 7. Service URL Structure

### 7.1 서브도메인 기반 (기본)

| 서비스 | URL |
|--------|-----|
| Dashboard | `https://mydomain.com` |
| File Manager | `https://files.mydomain.com` |
| FileBrowser | `https://files.mydomain.com` |
| Git Web | `https://git.mydomain.com` |
| DB Manager | `https://db.mydomain.com` |
| 배포된 앱 | `https://[app-name].mydomain.com` |
| Media | `https://media.mydomain.com` |
| Webmail | `https://mail.mydomain.com` |
| SSH | `ssh admin@mydomain.com -p 2222` |
| SFTP | `sftp://admin@mydomain.com:2222` |
| SMTP | `smtp.mydomain.com:587` |
| IMAP | `imap.mydomain.com:993` |

### 7.2 경로 기반 (단일 도메인)

| 서비스 | URL |
|--------|-----|
| Dashboard | `https://mydomain.com/` |
| File Manager | `https://mydomain.com/files` |
| Git Web | `https://mydomain.com/git` |
| DB Manager | `https://mydomain.com/db` |
| 배포된 앱 | `https://mydomain.com/apps/[app-name]` |

---

## 8. Data Directory

```
~/.brewnet/
├── .env                  # 관리자 계정 및 서비스 크리덴셜 (chmod 600)
├── config.json           # 글로벌 설정
├── docker-compose.yml    # 생성된 Compose 파일 (cloudflared 포함)
├── services/             # 서비스별 설정
├── ssh/                  # SSH 키, 사용자 데이터
├── storage/              # 파일 저장소 데이터
├── backups/              # 백업 데이터
├── logs/                 # 애플리케이션 로그
└── db/                   # SQLite 데이터베이스
```

---

## 9. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| BN001 | 503 | Docker daemon not running |
| BN002 | 409 | Port already in use |
| BN003 | 500 | SSL issuance failed |
| BN004 | 401 | Invalid license key |
| BN005 | 429 | Rate limit exceeded |
| BN006 | 500 | Build failed |
| BN007 | 400 | Invalid Git repository |
| BN008 | 404 | Resource not found |
| BN009 | 500 | Database error |
| BN010 | 403 | Feature requires Pro plan |

---

## Related Documents

- [TRD.md](TRD.md) — 기술 요구사항 (기술 스택, 의존성, 시스템 요구사항)
- [REQUIREMENT.md](REQUIREMENT.md) — 기능 요구사항 상세
- [CLAUDE.md](CLAUDE.md) — AI 개발 컨텍스트
- [spec/](spec/) — 초기 리서치 참조 문서 (20개)

> **참고**: `docs/spec/` 하위 문서는 초기 리서치 단계에서 작성된 참조 문서입니다. 일부 문서에서 "homehub" 명칭이 사용되나 프로젝트명은 "brewnet"으로 확정되었습니다.
