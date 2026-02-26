# Brewnet REQUIREMENT.md (Functional Requirements)

> **Version**: 2.2
> **Last Updated**: 2026-02-22
> **Status**: Draft

---

## 1. CLI 설치 및 초기 설정

### REQ-1.1 설치 방법

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.1.1 | npm global install (`npm install -g brewnet`) | Must | 1 |
| REQ-1.1.2 | npx 실행 (`npx brewnet init`) | Must | 1 |
| REQ-1.1.3 | Homebrew 지원 (`brew install brewnet`) | Should | 5 |
| REQ-1.1.4 | curl 원라인 설치 스크립트 | Should | 5 |

### REQ-1.2 시스템 체크 (`brewnet doctor`)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.2.1 | OS 감지 (macOS, Linux) | Must | 1 |
| REQ-1.2.2 | Docker / Docker Compose 설치 여부 확인 | Must | 1 |
| REQ-1.2.3 | Node.js 버전 확인 (20+) | Must | 1 |
| REQ-1.2.4 | 디스크 용량 확인 (최소 20GB) | Must | 1 |
| REQ-1.2.5 | 메모리 확인 (최소 2GB) | Must | 1 |
| REQ-1.2.6 | 필수 포트 사용 가능 여부 확인 (80, 443, 2222) | Should | 1 |
| REQ-1.2.7 | Git 설치 여부 확인 | Should | 1 |
| REQ-1.2.8 | Docker 미설치 시 플랫폼별 자동 설치 — macOS: Homebrew(brew install --cask docker), Linux: 공식 convenience script(get.docker.com) | Must | 1 |
| REQ-1.2.9 | Homebrew 미설치(macOS) 시 Homebrew 먼저 자동 설치 후 Docker 설치 | Must | 1 |
| REQ-1.2.10 | Docker 설치 후 데몬 기동 확인 — macOS 90초, Linux 30초 타임아웃 폴링 | Must | 1 |
| REQ-1.2.11 | Linux Docker 설치 시 docker 그룹에 현재 사용자 추가(usermod -aG docker), 재로그인 안내 표시 | Must | 1 |
| REQ-1.2.12 | Docker 자동 설치 실패 시 수동 설치 URL(플랫폼별) 안내 후 종료 | Must | 1 |

### REQ-1.3 인터랙티브 위저드 (`brewnet init`)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.3.1 | Step 0: 시스템 체크 자동 실행 | Must | 1 |
| REQ-1.3.2 | Step 1: 프로젝트 설정 — 설치 유형 선택 (Full Install / Partial Install) | Must | 1 |
| REQ-1.3.3 | Step 2: 관리자 계정 설정 — username 입력 + 20자 비밀번호 자동 생성, .env 파일 저장 (chmod 600) | Must | 1 |
| REQ-1.3.4 | Step 3: 서버 컴포넌트 선택 (7개 컴포넌트 (Web Server + Git Server 필수, 5개 선택): File/Web/Git/DB/Media/SSH — App Server는 Step 4에서 자동 설정) | Must | 1 |
| REQ-1.3.5 | Step 4: Dev Stack & 런타임 선택 (다중 언어/프레임워크, Frontend 기술 스택, FileBrowser) — 항상 표시 | Must | 1 |
| REQ-1.3.6 | Step 5: 도메인 & Cloudflare 설정 (DigitalPlat 무료 도메인 또는 커스텀 도메인) | Must | 1 |
| REQ-1.3.7 | Step 6: 설정 확인 및 최종 승인 | Must | 1 |
| REQ-1.3.8 | Step 7: docker-compose.yml 자동 생성 (cloudflared 터널 컨테이너 포함) | Must | 1 |
| REQ-1.3.9 | Step 8: 완료 (서비스 시작 및 접속 정보 표시) | Must | 1 |
| REQ-1.3.10 | `--non-interactive` 플래그로 기본값 자동 선택 | Should | 1 |

### REQ-1.4 설치 유형

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.4.1 | Full Install — 모든 서버 컴포넌트 포함 (권장 구성) | Must | 1 |
| REQ-1.4.2 | Partial Install — 사용자가 개별 컴포넌트 선택 | Must | 1 |

### REQ-1.5 서버 컴포넌트 (8개)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.5.1 | File Server 컴포넌트 — Nextcloud, MinIO 중 선택 | Must | 1 |
| REQ-1.5.2 | Web Server 컴포넌트 — Traefik, Nginx, Caddy 중 선택 | Must | 1 |
| REQ-1.5.3 | App Server 컴포넌트 — Dev Stack 선택 시 자동 활성화 (Step 3에서 설정) | Must | 1 |
| REQ-1.5.4 | Database 컴포넌트 — Primary DB + Cache Layer 선택 | Must | 1 |
| REQ-1.5.5 | Media 컴포넌트 — Jellyfin 미디어 서버 | Should | 1 |
| REQ-1.5.6 | SSH Server 컴포넌트 — Step 2에서 카드 표시, 포트 설정 및 인증 방식 선택 | Must | 1 | → REQ-1.11 참조 |
| REQ-1.5.7 | Mail Server 섹션 — Step 4에서 표시 (조건: domain != local) | Must | 1 | → REQ-1.12 참조 |
| REQ-1.5.8 | Git Server 컴포넌트 — 항상 활성화 (필수). Web Server와 함께 필수 컴포넌트. 홈서버 코드 버전 관리 및 배포 파이프라인 핵심 인프라 | Must | 1 | → REQ-4.1 참조 |

### REQ-1.6 데이터베이스 선택

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.6.1 | Primary DB 선택 — PostgreSQL, MySQL, SQLite | Must | 1 |
| REQ-1.6.2 | Cache Layer 선택 — Redis, Valkey, KeyDB (선택사항) | Should | 1 |

### REQ-1.7 도메인 & Cloudflare 설정

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.7.1 | 도메인 설정 방식 선택: DigitalPlat 무료 도메인 / 커스텀 도메인 / 나중에 설정 | Must | 1 |
| REQ-1.7.2 | Cloudflare API 토큰 연동 | Must | 1 |
| REQ-1.7.3 | Cloudflare DNS 레코드 자동 생성 | Must | 1 |
| REQ-1.7.4 | Cloudflare Tunnel 기본 활성화 (외부 접근 기본 경로) | Must | 1 |
| REQ-1.7.5 | Cloudflare 프록시 (CDN/DDoS 보호) 설정 | Should | 2 |
| REQ-1.7.6 | 서브도메인 / 경로 기반 URL 모드 선택 | Should | 2 |

### REQ-1.8 관리자 계정 (Admin Account)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.8.1 | 위저드 Step 2에서 관리자 username 입력 (기본값: `admin`) | Must | 1 |
| REQ-1.8.2 | 20자 비밀번호 자동 생성 (영문 대소문자 + 숫자 + 특수문자) | Must | 1 |
| REQ-1.8.3 | 사용자가 자동 생성 비밀번호 수락 또는 직접 입력 선택 가능 | Must | 1 |
| REQ-1.8.4 | 관리자 크리덴셜을 `~/.brewnet/.env` 파일에 저장 | Must | 1 |
| REQ-1.8.5 | `.env` 파일 권한 `chmod 600` 자동 설정 (소유자만 읽기/쓰기) | Must | 1 |
| REQ-1.8.6 | 관리자 계정을 모든 서비스의 기본 인증으로 사용 (Gitea, Nextcloud, DB 등) | Must | 1 |
| REQ-1.8.7 | 완료 화면에서 관리자 계정 정보 표시 (비밀번호 마스킹 옵션) | Must | 1 |
| REQ-1.8.8 | `brewnet admin reset-password` 비밀번호 재설정 명령어 | Should | 1 |

### REQ-1.9 무료 도메인 (DigitalPlat FreeDomain)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.9.1 | DigitalPlat FreeDomain API 연동으로 무료 도메인 등록 | Must | 1 |
| REQ-1.9.2 | 지원 TLD: `.dpdns.org` (권장), `.qzz.io`, `.us.kg` | Must | 1 |
| REQ-1.9.3 | 위저드 Step 5에서 "무료 도메인 등록" / "기존 도메인 사용" / "나중에 설정" 선택 | Must | 1 |
| REQ-1.9.4 | 등록된 무료 도메인을 Cloudflare DNS에 자동 연결 | Must | 1 |
| REQ-1.9.5 | `brewnet domain free register <name>.<tld>` CLI 명령어 | Must | 1 |
| REQ-1.9.6 | `brewnet domain free list` 등록된 무료 도메인 목록 조회 | Should | 1 |
| REQ-1.9.7 | 무료 도메인 갱신 알림 (만료 전 자동 갱신 또는 사용자 알림) | Should | 2 |

### REQ-1.10 Cloudflare Tunnel (기본 활성화)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.10.1 | Cloudflare Tunnel 기본 활성화 (외부 접근 필수 구성) | Must | 1 |
| REQ-1.10.2 | `cloudflare/cloudflared:latest` Docker 컨테이너로 실행 | Must | 1 |
| REQ-1.10.3 | docker-compose.yml에 cloudflared 서비스 자동 포함 | Must | 1 |
| REQ-1.10.4 | 포트포워딩 불필요 — NAT/CGNAT 환경 지원 | Must | 1 |
| REQ-1.10.5 | Cloudflare 경유 자동 HTTPS 제공 | Must | 1 |
| REQ-1.10.6 | Cloudflare API 토큰으로 터널 자동 생성/구성 | Must | 1 |
| REQ-1.10.7 | `brewnet tunnel status` 터널 상태 확인 명령어 | Should | 1 |
| REQ-1.10.8 | `brewnet tunnel disable` / `brewnet tunnel enable` 토글 명령어 | Should | 1 |
| REQ-1.10.9 | 서비스 추가/제거 시 터널 ingress 규칙 자동 업데이트 | Must | 2 |
| REQ-1.10.10 | Cloudflare Access Policy — 이메일 화이트리스트를 통한 서비스 접근 제어 | Should | 2 |
| REQ-1.10.11 | One-Time PIN (OTP) 인증 지원 — Cloudflare Access 이메일 기반 OTP | Could | 2 |
| REQ-1.10.12 | 서비스별 접근 정책 — 개별 서비스에 대한 Cloudflare Access 정책 설정 | Could | 3 |

### REQ-1.11 SSH 서버 (SSH Server)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.11.1 | Step 2에서 SSH Server 토글 표시, 포트 설정 가능 (기본값: 2222) | Must | 1 |
| REQ-1.11.2 | 키 기반 인증 기본 활성화, 패스워드 인증은 선택사항 (기본 OFF) | Must | 1 |
| REQ-1.11.3 | SFTP 서브시스템 토글 — File Server 또는 Media Server 활성화 시 자동 권장 | Must | 1 |
| REQ-1.11.4 | 관리자 크리덴셜(REQ-1.8)을 SSH 로그인 계정으로 사용 | Must | 1 |
| REQ-1.11.5 | SFTP 사용자에 대한 Chroot Jail 설정 (홈 디렉토리 제한) | Should | 1 |
| REQ-1.11.6 | 호스트 키 자동 생성 (RSA, ECDSA, ED25519) | Must | 1 |
| REQ-1.11.7 | SSH 사용자 역할 기반 권한 — canDeployApps, canAccessDatabase, canManageFiles 권한 관리 | Should | 3 |
| REQ-1.11.8 | SSH IP 화이트리스트 — 사용자별 허용 IP 목록 설정 | Could | 3 |
| REQ-1.11.9 | SSH 접근 감사 로깅 — 모든 SSH 세션 연결/해제 시간, 소스 IP 기록 | Should | 3 |

### REQ-1.12 메일 서버 (Mail Server)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.12.1 | Step 4(도메인 설정)에서 Mail Server 섹션 표시 — 도메인이 `local`이 아닌 경우에만 표시 | Must | 1 |
| REQ-1.12.2 | `ghcr.io/docker-mailserver/docker-mailserver:latest` Docker 이미지 사용, SMTP (25/587), IMAP (993) 포트 | Must | 1 |
| REQ-1.12.3 | 관리자 크리덴셜(REQ-1.8)을 postmaster 계정으로 사용 (예: `admin@mydomain.com`) | Must | 1 |
| REQ-1.12.4 | Cloudflare API를 통한 DNS MX 레코드 자동 구성 | Should | 1 |
| REQ-1.12.5 | Anti-spam (SpamAssassin) 및 DKIM 서명 지원 | Should | 2 |
| REQ-1.12.6 | SPF DNS TXT 레코드 자동 생성 — `v=spf1 mx ~all` 레코드 Cloudflare API로 생성 | Should | 2 |
| REQ-1.12.7 | DKIM 키 생성 및 DNS TXT 레코드 생성 — 도메인 서명용 키 쌍 생성 및 Cloudflare DNS에 등록 | Should | 2 |
| REQ-1.12.8 | DMARC DNS TXT 레코드 생성 — `v=DMARC1; p=quarantine` 정책 자동 설정 | Could | 2 |
| REQ-1.12.9 | 메일 DNS 레코드 검증 (`brewnet mail dns-check`) — MX, SPF, DKIM, DMARC 레코드 확인 명령어 | Should | 2 |

### REQ-1.13 크리덴셜 전파 (Credential Propagation)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.13.1 | 관리자 크리덴셜(username/password)을 Step 2에서 1회만 입력 | Must | 1 |
| REQ-1.13.2 | 활성화된 모든 서비스에 관리자 크리덴셜 자동 전파 (Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, SSH Server, Mail Server 등) | Must | 1 |
| REQ-1.13.3 | Step 5(설정 확인)에서 크리덴셜 전파 대상 목록 표시 (어떤 서비스에 어떤 계정이 설정되는지 확인) | Must | 1 |
| REQ-1.13.4 | Database는 별도 크리덴셜 사용 가능하나, 미입력 시 관리자 비밀번호가 자동으로 채워짐 | Must | 1 |

### REQ-1.14 외부 접근 검증 (External Access Verification)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-1.14.1 | DNS 전파 검증 명령어 — `dig`/`nslookup` 기반 DNS 레코드 확인 | Must | 1 |
| REQ-1.14.2 | Cloudflare Tunnel 연결 상태 확인 — 터널 컨테이너 상태 및 Cloudflare API 연결 테스트 | Must | 1 |
| REQ-1.14.3 | HTTPS 엔드포인트 헬스체크 — 도메인 접근 가능 여부 및 SSL 인증서 유효성 확인 | Must | 1 |
| REQ-1.14.4 | SSH 연결 테스트 — SSH Server 활성화 시 포트 연결 및 키 인증 테스트 | Should | 1 |
| REQ-1.14.5 | Step 7(완료)에서 검증 섹션 표시 — non-local 도메인(FreeDomain/Custom) 사용 시에만 표시 | Must | 1 |
| REQ-1.14.6 | 문제 해결 가이드 — DNS 미전파, 터널 연결 실패, SSL 오류, SSH 접속 불가 등 일반적 문제에 대한 해결 방법 표시 | Should | 1 |

---

## 2. Docker 관리

### REQ-2.1 docker-compose.yml 자동 생성

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-2.1.1 | 선택한 서비스 기반 docker-compose.yml 생성 | Must | 1 |
| REQ-2.1.2 | Traefik 리버스 프록시 자동 포함 | Must | 1 |
| REQ-2.1.3 | 볼륨 매핑 자동 설정 | Must | 1 |
| REQ-2.1.4 | 네트워크 설정 자동 구성 | Must | 1 |
| REQ-2.1.5 | 환경 변수 .env 파일 자동 생성 (관리자 크리덴셜 포함, chmod 600) | Must | 1 |
| REQ-2.1.6 | `cloudflare/cloudflared:latest` 컨테이너 기본 포함 (Cloudflare Tunnel) | Must | 1 |
| REQ-2.1.7 | 헬스체크 설정 포함 | Should | 1 |

### REQ-2.2 서비스 관리 명령어

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-2.2.1 | `brewnet up` — 전체 서비스 시작 | Must | 1 |
| REQ-2.2.2 | `brewnet down` — 전체 서비스 중지 | Must | 1 |
| REQ-2.2.3 | `brewnet status` — 서비스 상태 표시 (테이블 형식) | Must | 1 |
| REQ-2.2.4 | `brewnet add <service>` — 서비스 추가 | Must | 1 |
| REQ-2.2.5 | `brewnet remove <service>` — 서비스 제거 | Must | 1 |
| REQ-2.2.6 | `brewnet logs [service]` — 로그 확인 | Must | 1 |
| REQ-2.2.7 | `brewnet update` — 서비스 이미지 업데이트 | Should | 1 |
| REQ-2.2.8 | `brewnet export` — 설정 내보내기 | Could | 5 |

### REQ-2.3 컨테이너 직접 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-2.3.1 | 컨테이너 목록 조회 (`brewnet docker ps`) | Should | 1 |
| REQ-2.3.2 | 컨테이너 시작/중지/재시작 | Should | 1 |
| REQ-2.3.3 | 컨테이너 로그 확인 (`-f` follow 지원) | Should | 1 |
| REQ-2.3.4 | 컨테이너 리소스 사용량 확인 | Could | 4 |

### REQ-2.4 Docker Network Configuration

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-2.4.1 | `brewnet` Docker 네트워크 생성 — 서비스 간 통신용 브릿지 네트워크 | Must | 1 |
| REQ-2.4.2 | 데이터베이스 컨테이너 외부 접근 격리 — internal 네트워크로 DB 직접 접근 차단 | Should | 1 |
| REQ-2.4.3 | 컨테이너 DNS 해석 — Docker 서비스명으로 컨테이너 간 통신 | Must | 1 |

---

## 3. 배포 (Deploy)

### REQ-3.1 앱 배포

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-3.1.1 | 로컬 디렉토리 배포 (`brewnet deploy ./my-app`) | Must | 2 |
| REQ-3.1.2 | Git URL 배포 (`brewnet deploy <git-url>`) | Must | 2 |
| REQ-3.1.3 | 프레임워크 자동 감지 (Next.js, FastAPI, Spring 등) | Must | 2 |
| REQ-3.1.4 | Dockerfile 자동 생성 (멀티스테이지 빌드) | Must | 2 |
| REQ-3.1.5 | 배포된 앱 목록/상태 확인 | Must | 2 |
| REQ-3.1.6 | 앱 중지/재시작/삭제 | Must | 2 |
| REQ-3.1.7 | 배포 이력 조회 | Should | 2 |
| REQ-3.1.8 | 롤백 (Pro) | Should | 2 |
| REQ-3.1.9 | Blue-Green 배포 (Team) | Could | 4 |

### REQ-3.2 배포 설정 파일 (`brewnet.yml`)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-3.2.1 | `name`, `type`, `version` 필드 | Must | 2 |
| REQ-3.2.2 | `build.command`, `build.output` 필드 | Must | 2 |
| REQ-3.2.3 | `start.command`, `start.port` 필드 | Must | 2 |
| REQ-3.2.4 | `env` 환경 변수 필드 | Must | 2 |
| REQ-3.2.5 | `domains` 도메인 연결 필드 | Should | 2 |
| REQ-3.2.6 | `healthcheck` 필드 | Should | 2 |
| REQ-3.2.7 | `resources` (메모리/CPU 제한) 필드 | Could | 4 |

### REQ-3.3 프레임워크 자동 감지

| 프레임워크 | 감지 파일 | 빌드 명령 | 기본 포트 |
|-----------|----------|----------|:--------:|
| Next.js | package.json (next) | `npm run build` | 3000 |
| NestJS | @nestjs/core | `npm run build` | 3000 |
| Express | package.json (express) | — | 3000 |
| FastAPI | fastapi (requirements.txt) | `pip install` | 8000 |
| Django | manage.py | `pip install` | 8000 |
| Spring Boot | pom.xml | `mvn package` | 8080 |
| Go (Gin) | go.mod | `go build` | 8080 |

---

## 4. Git Server

### REQ-4.1 Gitea 통합

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-4.1.1 | Gitea Docker 설치 — Step 2에서 Git Server 카드 토글 또는 `brewnet git install` CLI 명령 | Must | 1 |
| REQ-4.1.2 | Git 서버 시작/중지 | Must | 2 |
| REQ-4.1.3 | 저장소 CRUD (`brewnet git repo create/list/delete`) | Must | 2 |
| REQ-4.1.4 | SSH 키 기반 Push/Pull (포트 3022, SSH Server 2222와 분리) | Must | 1 |
| REQ-4.1.5 | 사용자 관리 (`brewnet git user add/remove`) | Should | 2 |
| REQ-4.1.6 | Webhook으로 배포 연동 (`brewnet git hook setup`) | Must | 2 |
| REQ-4.1.7 | 웹 UI 접근 (서브도메인: `git.{DOMAIN}`, 포트 3000) | Should | 1 |

### REQ-4.2 자동 배포 파이프라인

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-4.2.1 | `git push` → Webhook → 빌드 → 배포 자동화 | Must | 2 |
| REQ-4.2.2 | 런타임 자동 감지 (Node/Python/Java/Go) | Must | 2 |
| REQ-4.2.3 | 배포 성공/실패 알림 | Should | 2 |
| REQ-4.2.4 | 배포 로그 실시간 스트리밍 | Could | 4 |

---

## 5. 도메인 & SSL & Cloudflare

### REQ-5.1 도메인 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-5.1.1 | 커스텀 도메인 추가 (`brewnet domain add`) | Must | 2 |
| REQ-5.1.2 | DNS 검증 (`brewnet domain verify`) | Should | 2 |
| REQ-5.1.3 | 서브도메인 / 경로 기반 URL 모드 선택 | Should | 2 |

### REQ-5.2 Cloudflare 연동

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-5.2.1 | Cloudflare API 토큰 설정 (`brewnet domain cloudflare setup --token`) | Must | 1 |
| REQ-5.2.2 | DNS 레코드 자동 생성/업데이트 | Must | 1 |
| REQ-5.2.3 | Cloudflare Tunnel 기본 활성화 (`cloudflare/cloudflared:latest` Docker 컨테이너) | Must | 1 |
| REQ-5.2.4 | Cloudflare 프록시 모드 (CDN/DDoS 보호) 토글 | Should | 2 |
| REQ-5.2.5 | DDNS 자동 업데이트 (IP 변경 감지 시 Cloudflare DNS 갱신) | Should | 2 |
| REQ-5.2.6 | DigitalPlat FreeDomain으로 등록된 도메인의 Cloudflare DNS 자동 연동 | Must | 1 |

### REQ-5.3 SSL 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-5.3.1 | Let's Encrypt 인증서 발급 (`brewnet domain ssl`) | Must | 2 |
| REQ-5.3.2 | 인증서 자동 갱신 (Pro) | Must | 2 |
| REQ-5.3.3 | 와일드카드 SSL (Pro) | Should | 2 |
| REQ-5.3.4 | SSL 상태/만료일 확인 | Must | 2 |
| REQ-5.3.5 | Cloudflare Origin Certificate 지원 | Could | 2 |

### REQ-5.4 리버스 프록시

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-5.4.1 | 도메인 → 컨테이너 포트 자동 매핑 | Must | 2 |
| REQ-5.4.2 | HTTP → HTTPS 리다이렉트 | Must | 2 |
| REQ-5.4.3 | Security headers 자동 설정 (HSTS, X-Frame-Options) | Should | 2 |
| REQ-5.4.4 | WebSocket 프록시 지원 | Should | 2 |

---

## 6. 네트워크

### REQ-6.1 네트워크 진단

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-6.1.1 | 공인 IP / 로컬 IP / 게이트웨이 확인 | Must | 1 |
| REQ-6.1.2 | 포트 개방 상태 확인 (`brewnet network check --port 80`) | Must | 1 |
| REQ-6.1.3 | 공유기 자동 감지 (IPTIME, ASUS, TP-Link 등) | Should | 2 |
| REQ-6.1.4 | 공유기별 포트포워딩 가이드 표시 | Should | 2 |
| REQ-6.1.5 | UPnP 자동 포트포워딩 | Could | 2 |

---

## 7. 보안 & ACL

### REQ-7.1 SSH 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-7.1.1 | SSH 서버 자동 설정 (`brewnet ssh enable`) | Must | 3 |
| REQ-7.1.2 | SSH 사용자 추가/제거 (`brewnet ssh add-user`) | Must | 3 |
| REQ-7.1.3 | 공개키 인증만 허용 (패스워드 비활성화) | Must | 3 |
| REQ-7.1.4 | Root 로그인 비활성화 | Must | 3 |
| REQ-7.1.5 | SSH 사용자 목록/상태 확인 | Should | 3 |
| REQ-7.1.6 | SSH 접속 가이드 표시 (`brewnet ssh connect`) | Should | 3 |

### REQ-7.2 ACL (접근 제어)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-7.2.1 | IP 화이트/블랙리스트 (`brewnet acl allow/deny ip`) | Must | 3 |
| REQ-7.2.2 | CIDR 범위 지원 | Must | 3 |
| REQ-7.2.3 | 도메인/경로별 ACL 규칙 | Should | 3 |
| REQ-7.2.4 | 국가별 차단 (Pro) | Should | 3 |
| REQ-7.2.5 | Rate Limiting (Pro) | Should | 3 |
| REQ-7.2.6 | 접근 로그 조회 (Pro) | Should | 3 |
| REQ-7.2.7 | 규칙 활성화/비활성화/삭제 | Must | 3 |

### REQ-7.3 방화벽

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-7.3.1 | 방화벽 상태 확인 (`brewnet firewall status`) | Should | 3 |
| REQ-7.3.2 | 포트 허용/차단 (`brewnet firewall allow/deny`) | Should | 3 |

---

## 8. 인증 (SSO)

### REQ-8.1 사용자 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-8.1.1 | 초기 관리자 계정은 위저드 Step 2에서 생성 (REQ-1.8 참조) — Phase 3에서는 SSO 연동 | Must | 1 |
| REQ-8.1.2 | 사용자 추가/제거 (`brewnet auth user add/remove`) | Must | 3 |
| REQ-8.1.3 | 비밀번호 변경 | Must | 3 |
| REQ-8.1.4 | 서비스별 권한 부여/해제 (dashboard, git, files, db) | Must | 3 |

### REQ-8.2 인증 기능

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-8.2.1 | 세션 기반 로그인 | Must | 3 |
| REQ-8.2.2 | JWT 토큰 발급 | Must | 3 |
| REQ-8.2.3 | 2FA / TOTP (Pro) | Should | 3 |
| REQ-8.2.4 | API Key 관리 (Pro) | Should | 3 |
| REQ-8.2.5 | OAuth2 Provider (Pro) | Could | 4 |
| REQ-8.2.6 | 팀 멤버 관리 + RBAC (Team) | Could | 5 |
| REQ-8.2.7 | 감사 로그 (Team) | Could | 5 |

---

## 9. 파일 관리

### REQ-9.1 파일 서버

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-9.1.1 | 웹 파일 브라우저 (Nextcloud 기반) | Should | 3 |
| REQ-9.1.2 | 파일 업로드/다운로드 | Should | 3 |
| REQ-9.1.3 | SFTP 서버 지원 | Should | 3 |
| REQ-9.1.4 | MinIO (S3 호환) 객체 스토리지 | Could | 3 |
| REQ-9.1.5 | Jellyfin 동영상 스트리밍 | Could | 3 |
| REQ-9.1.6 | 공유 링크 (Pro) | Could | 4 |
| REQ-9.1.7 | WebDAV (Pro) | Could | 4 |
| REQ-9.1.8 | 저장소 용량 알림 | Could | 4 |
| REQ-9.1.9 | Nextcloud Redis 캐시 통합 — 파일 잠금 및 세션 스토리지용 Redis 연동 | Should | 3 |
| REQ-9.1.10 | Nextcloud OPCache 및 APCu 메모리 캐시 설정 — PHP 성능 최적화 | Could | 3 |
| REQ-9.1.11 | MinIO 버킷 생성 및 수명주기 정책 설정 — S3 API 버킷 관리 | Could | 3 |
| REQ-9.1.12 | MinIO 오브젝트 버전 관리 지원 — 파일 히스토리 유지 | Could | 4 |
| REQ-9.1.13 | Jellyfin FFmpeg 트랜스코딩 설정 — 소프트웨어/하드웨어 인코딩 옵션 | Could | 3 |
| REQ-9.1.14 | Jellyfin GPU 가속 지원 — Intel QSV, NVIDIA NVENC, VAAPI | Could | 4 |
| REQ-9.1.15 | Jellyfin 미디어 라이브러리 자동 탐색 — 폴더 구조 기반 자동 카테고리화 | Could | 3 |

### REQ-9.2 Storage Management

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-9.2.1 | 스토리지 초기화 (`brewnet storage init`) — 파일 서버 스토리지 볼륨 생성 및 권한 설정 | Should | 2 |
| REQ-9.2.2 | 스토리지 추가 (`brewnet storage add <path>`) — 추가 스토리지 볼륨 마운트 | Should | 2 |
| REQ-9.2.3 | 스토리지 쿼터 설정 (`brewnet storage quota set <size>`) — 사용자/서비스별 용량 제한 | Could | 3 |
| REQ-9.2.4 | 스토리지 모니터링 (`brewnet storage monitor`) — 사용량, 증가율, 예상 가득참 날짜 표시 | Could | 3 |
| REQ-9.2.5 | 스토리지 정리 (`brewnet storage cleanup`) — 불필요한 임시 파일, 캐시 정리 | Could | 3 |

### REQ-9.3 App Storage (애플리케이션 파일 스토리지)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-9.3.1 | App Storage 자동 활성화 — App Server 활성화 시 로컬 파일 스토리지 자동 구성 | Must | 1 |
| REQ-9.3.2 | 스토리지 경로 설정 — 기본 `./storage`, 사용자가 커스텀 경로 지정 가능 | Must | 1 |
| REQ-9.3.3 | Docker 볼륨 매핑 — `./storage:/app/storage`로 앱 컨테이너에서 파일 접근 | Must | 1 |
| REQ-9.3.4 | 용량 제한 설정 — 선택적 최대 용량 설정 (기본: 무제한) | Could | 2 |
| REQ-9.3.5 | FileBrowser (`filebrowser/filebrowser:latest`) — 웹 기반 파일 관리 UI, `files.{DOMAIN}` 서브도메인 | Must | 1 |
| REQ-9.3.6 | FileBrowser REST API 제공 (`/api/login`, `/api/resources/{path}`, `/api/raw/{path}`) | Must | 1 |
| REQ-9.3.7 | 사용자별 디렉토리 격리 — 각 사용자는 자신의 디렉토리만 접근 가능 | Should | 2 |
| REQ-9.3.8 | 공개 파일 디렉토리 — `/uploads/public/` 경로는 인증 없이 접근 가능 | Should | 2 |
| REQ-9.3.9 | 파일 크기 제한 및 확장자 검증 — 업로드 시 파일 크기/타입 제한 설정 | Should | 1 |

---

## 10. 데이터베이스 관리

### REQ-10.1 DB 인스턴스 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-10.1.1 | MySQL Docker 설치 (`brewnet db install mysql`) | Should | 3 |
| REQ-10.1.2 | PostgreSQL Docker 설치 | Should | 3 |
| REQ-10.1.3 | SQLite 로컬 DB 지원 | Should | 3 |
| REQ-10.1.4 | Redis / Valkey / KeyDB 캐시 레이어 설치 | Could | 3 |
| REQ-10.1.5 | DB 시작/중지/재시작 | Should | 3 |
| REQ-10.1.6 | 연결 정보 출력 (`brewnet db connect`) | Should | 3 |

### REQ-10.2 DB 웹 관리 (Pro)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-10.2.1 | 웹 쿼리 에디터 (Monaco Editor) | Could | 4 |
| REQ-10.2.2 | 테이블 구조/데이터 조회 | Could | 4 |
| REQ-10.2.3 | 데이터 내보내기 (CSV, JSON) | Could | 4 |

### REQ-10.3 백업

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-10.3.1 | 수동 백업 (`brewnet db backup`) | Should | 3 |
| REQ-10.3.2 | 백업 복원 (`brewnet db restore`) | Should | 3 |
| REQ-10.3.3 | 자동 백업 스케줄 (Pro) | Could | 4 |

---

## 11. Dashboard (Pro)

### REQ-11.1 시스템 메트릭

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-11.1.1 | CPU/메모리/디스크 사용률 (CLI) | Should | 1 |
| REQ-11.1.2 | 컨테이너별 리소스 사용량 | Could | 4 |

### REQ-11.2 웹 대시보드 (Pro)

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-11.2.1 | Next.js 14 기반 웹 대시보드 | Should | 4 |
| REQ-11.2.2 | 실시간 시스템 메트릭 차트 | Should | 4 |
| REQ-11.2.3 | 컨테이너 관리 GUI | Should | 4 |
| REQ-11.2.4 | 실시간 로그 뷰어 | Should | 4 |
| REQ-11.2.5 | 웹 터미널 (xterm.js) | Could | 4 |
| REQ-11.2.6 | 배포 위저드 GUI | Could | 4 |

---

## 12. 보일러플레이트 생성

### REQ-12.1 앱 스캐폴딩

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-12.1.1 | `brewnet create-app <name>` 인터랙티브 생성 | Could | 2 |
| REQ-12.1.2 | Backend 템플릿 (FastAPI, NestJS, Spring Boot) | Could | 2 |
| REQ-12.1.3 | Frontend 템플릿 (Next.js, Nuxt) | Could | 2 |
| REQ-12.1.4 | 자동 Dockerfile 포함 | Could | 2 |
| REQ-12.1.5 | 자동 docker-compose.yml 포함 | Could | 2 |
| REQ-12.1.6 | 템플릿 변수 치환 (`{{PROJECT_NAME}}`) | Could | 2 |

---

## 13. 백업 & 복원

### REQ-13.1 백업 관리

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-13.1.1 | 전체 설정 백업 (`brewnet backup`) | Should | 1 |
| REQ-13.1.2 | 백업 복원 (`brewnet restore <id>`) | Should | 1 |
| REQ-13.1.3 | 백업 목록 조회 | Should | 1 |
| REQ-13.1.4 | 자동 백업 스케줄 (Pro) | Could | 4 |
| REQ-13.1.5 | 백업 보관 정책 — 최근 N개 백업 보관, 초과분 자동 삭제 | Should | 2 |
| REQ-13.1.6 | 증분 백업 지원 — 변경된 데이터만 백업하여 디스크 절약 | Could | 4 |
| REQ-13.1.7 | 백업 암호화 — 선택적 AES-256 암호화로 민감 데이터 보호 | Could | 4 |
| REQ-13.1.8 | 백업 무결성 검증 (`brewnet backup verify <id>`) — SHA-256 체크섬 검증 | Should | 2 |

---

## 14. API (Dashboard 전용)

### REQ-14.1 REST API

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-14.1.1 | `/api/system/info` — 시스템 정보 | Should | 4 |
| REQ-14.1.2 | `/api/system/stats` — 실시간 메트릭 | Should | 4 |
| REQ-14.1.3 | `/api/docker/containers` — 컨테이너 CRUD | Should | 4 |
| REQ-14.1.4 | `/api/apps` — 앱 배포 관리 | Should | 4 |
| REQ-14.1.5 | `/api/domains` — 도메인 관리 | Should | 4 |
| REQ-14.1.6 | `/api/acl/rules` — ACL 규칙 관리 | Should | 4 |
| REQ-14.1.7 | `/api/db/instances` — DB 인스턴스 관리 | Should | 4 |
| REQ-14.1.8 | `/api/files` — 파일 관리 | Should | 4 |

### REQ-14.2 WebSocket API

| ID | 요구사항 | 우선순위 | Phase |
|----|---------|:--------:|:-----:|
| REQ-14.2.1 | `/api/ws/system/stats` — 실시간 시스템 메트릭 | Could | 4 |
| REQ-14.2.2 | `/api/ws/docker/containers/:id/logs` — 실시간 로그 | Could | 4 |
| REQ-14.2.3 | `/api/ws/apps/:id/deploy` — 배포 진행 상태 | Could | 4 |

---

## 15. 비기능 요구사항

### REQ-15.1 성능

| ID | 요구사항 | 목표 |
|----|---------|------|
| REQ-15.1.1 | CLI 명령어 응답 시간 | < 2초 (95th percentile) |
| REQ-15.1.2 | docker-compose.yml 생성 시간 | < 5초 |
| REQ-15.1.3 | 앱 배포 시간 (빌드 제외) | < 30초 |
| REQ-15.1.4 | Dashboard API 응답 시간 | < 500ms |

### REQ-15.2 안정성

| ID | 요구사항 | 목표 |
|----|---------|------|
| REQ-15.2.1 | 서비스 가용성 | 99.5% uptime |
| REQ-15.2.2 | 데이터 손실 방지 | 백업 + 복원 기능 |
| REQ-15.2.3 | 실패 시 자동 롤백 | 배포 실패 → 이전 버전 유지 |

### REQ-15.3 보안

| ID | 요구사항 | 목표 |
|----|---------|------|
| REQ-15.3.1 | 비밀번호 해시 (bcrypt) | 최소 12 rounds |
| REQ-15.3.2 | JWT 토큰 만료 | 24시간 (갱신 가능) |
| REQ-15.3.3 | SSH 키 인증만 허용 | 패스워드 인증 비활성화 |
| REQ-15.3.4 | HTTPS 강제 (Pro) | TLS 1.2+ only |
| REQ-15.3.5 | DB 접속 포트 ACL 제한 | IP 화이트리스트 필수 |
| REQ-15.3.6 | `.env` 파일 권한 보호 | chmod 600 (소유자만 읽기/쓰기) |
| REQ-15.3.7 | 관리자 비밀번호 자동 생성 강도 | 최소 20자 (영문 대소문자 + 숫자 + 특수문자) |

### REQ-15.4 호환성

| ID | 요구사항 | 목표 |
|----|---------|------|
| REQ-15.4.1 | 지원 OS | macOS 12+, Ubuntu 20.04+, Debian 11+ |
| REQ-15.4.2 | Node.js | 20.x, 22.x LTS |
| REQ-15.4.3 | Docker | 24.0+ |
| REQ-15.4.4 | 아키텍처 | x64, arm64 (Apple Silicon) |

### REQ-15.5 테스트

| ID | 요구사항 | 목표 |
|----|---------|------|
| REQ-15.5.1 | 테스트 커버리지 | 80%+ 전체, 90%+ CLI 핵심 |
| REQ-15.5.2 | 단위 테스트 실행 시간 | < 2분 |
| REQ-15.5.3 | PR 체크 실행 시간 | < 5분 |
| REQ-15.5.4 | 전체 테스트 실행 시간 | < 10분 |

---

## 16. Database Schema (SQLite)

### 핵심 테이블

| 테이블 | 용도 | Phase |
|--------|------|:-----:|
| `services` | 설치된 서비스 관리 | 1 |
| `deployments` | 배포 이력 | 2 |
| `domains` | 도메인/SSL 관리 | 2 |
| `git_repositories` | Git 저장소 관리 | 2 |
| `git_users` | Git 사용자 관리 | 2 |
| `deploy_triggers` | 배포 트리거 로그 | 2 |
| `auth_users` | 인증 사용자 | 3 |
| `auth_permissions` | 서비스별 권한 | 3 |
| `auth_sessions` | 로그인 세션 | 3 |
| `acl_rules` | 접근 제어 규칙 | 3 |
| `db_instances` | DB 인스턴스 관리 | 3 |
| `db_backups` | DB 백업 이력 | 3 |
| `file_shares` | 파일 공유 링크 (Pro) | 4 |
| `auth_api_keys` | API 키 (Pro) | 4 |
| `auth_audit_logs` | 감사 로그 (Team) | 5 |
| `backups` | 전체 백업 관리 | 1 |
| `logs` | 애플리케이션 로그 | 1 |

---

## Related Documents

- [PRD.md](PRD.md) — 제품 요구사항 개요
- [TRD.md](TRD.md) — 기술 요구사항 (기술 스택, 의존성, 시스템 요구사항)
- [CLAUDE.md](CLAUDE.md) — AI 개발 컨텍스트
- [spec/](spec/) — 상세 사양서 (16개 문서)
