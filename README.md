# 🍺 Brewnet — Your Server on Tap. Just Brew It.

Self-hosted stack bootstrapper · Docker Compose · Git server · File manager · App Server · DB Server · One command setup

[English](#english) | [한국어](#한국어)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-codevillain%2Fbrewnet-black?logo=github)](https://github.com/claude-code-expert/brewnet)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-27%2B-2496ed?logo=docker)](https://www.docker.com/)

---

## English

**Your Home Server, Brewed Fresh**

A fully self-hosted home server management platform. Set up and manage a personal server with Docker-based services through a single CLI tool — Git server, file storage, databases, reverse proxy, and external access via Cloudflare Tunnel, all in one interactive wizard.

<table>
<tr>
<td width="50%">

**CLI Tool** 🖥️
- One-command setup wizard (7 steps)
- Docker auto-install (macOS + Linux)
- Local Git, DB, file, media services
- Open source (MIT)

</td>
<td width="50%">

**Pro Dashboard** 💼
- Web-based management interface
- Real-time monitoring
- Team access control
- Paid features (Freemium)

</td>
</tr>
</table>

### Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

```bash
brewnet init
```

### Requirements

| Item | Min Version | Notes |
|------|-------------|-------|
| Node.js | 20+ | `node --version` |
| Docker | 27+ | Auto-installed if missing |
| OS | macOS 12+ / Ubuntu 20.04+ | |
| RAM | 2GB+ | 4GB+ recommended |
| Disk | 20GB+ | Varies by services |

> Docker is not required before running `brewnet init` — it will be installed automatically.

### Installation

The installer will prompt for your `sudo` password to place the binary at `/usr/local/bin/brewnet`. No shell reload needed afterward.

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
brewnet --version
brewnet init
```

### Init Wizard — 7 Steps

| Step | Description |
|------|-------------|
| **Step 0** | System check — OS, Docker, ports 80/443, disk/RAM |
| **Step 1** | Project setup — name, path, Full / Partial install |
| **Step 2** | Server components — Web server, File server, DB, Media, SSH |
| **Step 3** | Dev stack — backend language + framework, frontend tech *(optional)* |
| **Step 4** | Domain & network — Local (LAN) or Cloudflare Tunnel (external) |
| **Step 5** | Review & confirm |
| **Step 6** | Generate config, pull images, start services |
| **Step 7** | Done — endpoints, credentials, status page |

#### Cloudflare Tunnel Setup (Step 4)

No port forwarding required. To enable external access:

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Websites → Add a site** → register your domain and update nameservers
3. Top-right profile → **My Profile → API Tokens → Create Token**
   → Select "Edit Cloudflare Tunnel" template → your domain → **Create Token** → copy
4. Paste into the wizard — tunnel creation, ingress rules, and DNS records are handled automatically

> **Manual mode**: Create a tunnel at [one.dash.cloudflare.com](https://one.dash.cloudflare.com) and paste the Connector Token instead.

### Service Management

```bash
brewnet status              # Show service status table
brewnet up                  # Start all services
brewnet down                # Stop all services (data preserved)
brewnet logs [service]      # View logs (-f for follow)
brewnet add <service>       # Add a service (e.g. jellyfin, nextcloud)
brewnet remove <service>    # Remove a service
brewnet backup              # Create backup (tar.gz)
brewnet restore <id>        # Restore from backup
brewnet admin               # Open local admin panel (http://localhost:8088)
```

### Stopping Services

```bash
brewnet down          # Stop containers — data preserved in Docker volumes
brewnet down && brewnet up   # Restart
```

All containers use `restart: unless-stopped`. After a server reboot, Docker automatically restarts them.

### Uninstall

```bash
# Preview what will be removed (no changes)
brewnet uninstall --dry-run

# Full removal
brewnet uninstall

# Preserve database/file volumes
brewnet uninstall --keep-data

# Preserve project directory (stop containers only)
brewnet uninstall --keep-config

# Skip confirmation prompt
brewnet uninstall --force
```

> **Cloudflare Tunnel**: Not removed automatically. Delete manually at [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → Networks → Tunnels, and remove the CNAME records under DNS.

After uninstall, run `brewnet init` to set up a new installation. No need to re-run `install.sh`.

### FAQ

**Q: Does Docker need to be installed beforehand?**
A: No. `brewnet init` detects a missing Docker and offers to install it automatically (macOS: Homebrew, Linux: get.docker.com).

**Q: I forgot the admin password.**
A: Check `~/.brewnet/status/index.html` (auto-opened after setup) or the `.env` file in your project directory.

**Q: Will data be lost when I stop services?**
A: No. `brewnet down` stops containers without deleting Docker volumes. All data is restored when you run `brewnet up` again.

**Q: Ports 80/443 are already in use.**
A: Step 0 of the wizard detects port conflicts and guides you through resolving them.

---

## 한국어

**Your Home Server, Brewed Fresh**

완전히 자체 호스팅되는 홈 서버 관리 플랫폼. CLI 도구 하나로 Git 서버, 파일 저장소, 데이터베이스, 리버스 프록시, Cloudflare Tunnel 외부 접속까지 대화형 위저드로 한 번에 설정합니다.

<table>
<tr>
<td width="50%">

**CLI Tool** 🖥️
- 7단계 원커맨드 설정 위저드
- Docker 자동 설치 (macOS + Linux)
- Git / DB / 파일 / 미디어 서비스
- 오픈소스 (MIT)

</td>
<td width="50%">

**Pro Dashboard** 💼
- 웹 기반 관리 인터페이스
- 실시간 모니터링
- 팀 접근 권한 관리
- 유료 기능 (Freemium)

</td>
</tr>
</table>

### 빠른 시작

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

```bash
brewnet init
```

### 사전 요구사항

| 항목 | 최소 버전 | 비고 |
|------|-----------|------|
| Node.js | 20+ | `node --version` |
| Docker | 27+ | 없으면 자동 설치 |
| OS | macOS 12+ / Ubuntu 20.04+ | |
| RAM | 2GB+ | 권장 4GB+ |
| 디스크 | 20GB+ | 서비스 수에 따라 다름 |

> `brewnet init` 실행 전에 Docker가 없어도 됩니다 — 자동으로 설치합니다.

### 설치

설치 중 `sudo` 비밀번호를 입력하면 `/usr/local/bin/brewnet`에 설치됩니다. 셸 재로드(`source ~/.zshrc`) 없이 바로 사용 가능합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
brewnet --version
brewnet init
```

### 초기 설정 위저드 — 7단계

| 단계 | 내용 |
|------|------|
| **Step 0** | 시스템 체크 — OS, Docker, 포트 80/443, 디스크/RAM |
| **Step 1** | 프로젝트 설정 — 이름, 경로, Full / Partial 설치 유형 |
| **Step 2** | 서버 컴포넌트 — 웹 서버, 파일 서버, DB, 미디어, SSH |
| **Step 3** | 개발 스택 — 백엔드 언어 + 프레임워크, 프론트엔드 *(선택)* |
| **Step 4** | 도메인 & 네트워크 — 로컬(LAN) 또는 Cloudflare Tunnel(외부 접속) |
| **Step 5** | 검토 및 확인 |
| **Step 6** | 설정 파일 생성, 이미지 pull, 서비스 시작 |
| **Step 7** | 완료 — 접속 URL, 계정 정보, 상태 페이지 |

#### Step 2 — 서버 컴포넌트 선택지

| 컴포넌트 | 선택지 | 기본값 |
|----------|--------|--------|
| 웹 서버 (필수) | Traefik / Nginx / Caddy | Traefik |
| 파일 서버 | Nextcloud / MinIO | 비활성 |
| DB 서버 | PostgreSQL / MySQL + Redis/Valkey | PostgreSQL + Redis |
| 미디어 | Jellyfin | 비활성 |
| SSH 서버 | OpenSSH (포트 2222) | 비활성 |
| 관리자 계정 | 사용자명 + 비밀번호 자동 생성 | admin / 20자 랜덤 |

#### Step 3 — 개발 스택 선택지

- **백엔드 언어**: Python / Node.js / Java / PHP / .NET / Rust / Go (복수 선택)
- **언어별 프레임워크**:
  - Python: FastAPI / Django / Flask
  - Node.js: Next.js / Express / NestJS / Fastify
  - Java: Spring Boot / Spring / Pure Java
  - PHP: Laravel / Symfony
  - .NET: ASP.NET Core / Blazor
  - Rust / Go: 프레임워크 없음
- **프론트엔드**: Vue.js / React / TypeScript / JavaScript (복수 선택)
- 필요 없으면 **Skip** 선택

#### Step 4 — Cloudflare Tunnel 설정 방법

포트포워딩 없이 외부 접속을 활성화합니다.

1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인
2. **Websites → Add a site** → 도메인 등록 후 네임서버 변경
3. 우측 상단 프로필 → **My Profile → API Tokens → Create Token**
   → "Edit Cloudflare Tunnel" 템플릿 선택 → 사용할 도메인 → **Create Token** → 토큰 복사
4. 위저드에 토큰 붙여넣기 → 터널 생성, 인그레스 규칙, DNS 레코드 자동 처리

> **Manual 모드**: [one.dash.cloudflare.com](https://one.dash.cloudflare.com) 에서 직접 터널을 만들고 Connector Token을 붙여넣을 수도 있습니다.

### 서비스 관리

```bash
brewnet status              # 서비스 상태 테이블 확인
brewnet up                  # 모든 서비스 시작
brewnet down                # 모든 서비스 중지 (데이터 유지)
brewnet logs [service]      # 로그 확인 (-f 옵션으로 실시간)
brewnet add <service>       # 서비스 추가 (예: jellyfin, nextcloud)
brewnet remove <service>    # 서비스 제거
brewnet backup              # 백업 생성 (tar.gz)
brewnet restore <id>        # 백업으로 복원
brewnet admin               # 로컬 관리 패널 열기 (http://localhost:8088)
```

### 서비스 종료

```bash
brewnet down                    # 컨테이너 중지 — Docker 볼륨(데이터) 유지
brewnet down && brewnet up      # 재시작
```

모든 컨테이너는 `restart: unless-stopped` 정책을 사용합니다. 서버 재부팅 후 Docker가 시작되면 컨테이너도 자동으로 재시작됩니다.

### 언인스톨

```bash
# 삭제 전 미리 확인 (아무것도 지우지 않음)
brewnet uninstall --dry-run

# 완전 제거
brewnet uninstall

# Docker 볼륨(DB, 파일 데이터) 보존
brewnet uninstall --keep-data

# 프로젝트 디렉터리 보존 (컨테이너만 중지)
brewnet uninstall --keep-config

# 확인 프롬프트 없이 강제 제거
brewnet uninstall --force
```

dry-run 출력 예시:

```
Dry-run mode — no changes will be made.

Installed projects:
  ▶ homeserver  /Users/username/brewnet/homeserver

The following will be removed:
  [remove] Docker containers + volumes
  [remove] Docker networks: brewnet, brewnet-internal
  [remove] Project directory: /Users/username/brewnet/homeserver

Dry-run complete. No changes made.
```

> **Cloudflare Tunnel**: 자동으로 삭제되지 않습니다. [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → Networks → Tunnels 에서 수동으로 삭제하고, DNS 탭에서 CNAME 레코드도 삭제하세요.

언인스톨 후 새 설치는 `brewnet init`을 실행하면 됩니다. `install.sh`를 다시 실행할 필요는 없습니다.

### 자주 묻는 질문

**Q: Docker를 미리 설치해야 하나요?**
A: 아니요. `brewnet init`이 Docker 없음을 감지하고 자동 설치를 제안합니다 (macOS: Homebrew, Linux: get.docker.com).

**Q: 관리자 비밀번호를 잊어버렸어요.**
A: `~/.brewnet/status/index.html`(설정 완료 후 자동 생성) 또는 프로젝트 디렉터리의 `.env` 파일에서 확인하세요.

**Q: 서비스를 중지하면 데이터가 사라지나요?**
A: 아니요. `brewnet down`은 Docker 볼륨을 삭제하지 않습니다. `brewnet up`으로 다시 시작하면 모든 데이터가 그대로 복원됩니다.

**Q: 포트 80/443이 이미 사용 중이에요.**
A: Step 0에서 포트 충돌을 감지하고 해결 방법을 안내합니다.

**Q: `brewnet admin`에 접속이 안 돼요.**
A: `brewnet up`으로 서비스가 실행 중인지 확인하세요. 관리 패널은 로컬 전용입니다 (`http://localhost:8088`).

---

## License

MIT License — Copyright (c) 2025 Brewnet (codevillain)

See [LICENSE](LICENSE) for the full text.
