# Brewnet USER-STORY

> **Version**: 2.2
> **Last Updated**: 2026-02-22
> **Status**: Draft

---

## Overview

This document walks through the complete user journey of Brewnet — from installation to a fully running home server. It serves as a step-by-step manual showing every option, selection, and outcome.

Wizard는 총 8단계(STEP 0~7)로 구성되며, 이전 버전(9단계) 대비 간소화된 구조를 따른다.

---

## STEP 0: Installation

### 0.1 Prerequisites

Brewnet requires only the following on your machine before install:

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| OS | macOS 12+ / Ubuntu 20.04+ | Windows not supported |
| Node.js | 20.x | Required for the install script |
| RAM | 2GB | 8GB+ recommended |
| Disk | 20GB | 100GB+ recommended |
| Docker | 24.0+ | **Auto-installed by `brewnet init` if missing** |
| Docker Compose | v2.x | **Included with Docker auto-install** |

> Docker and Docker Compose do **not** need to be pre-installed.
> `brewnet init` will detect if Docker is missing and install it automatically
> (macOS: via Homebrew → Docker Desktop, Linux: via official install script).

### 0.2 Install Brewnet CLI

```bash
# One-line install (Recommended)
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

The install script will:
1. Check for Node.js 20+ and pnpm (required for build)
2. Clone source from GitHub → `~/.brewnet/source/`
3. Build CLI locally (`pnpm install && pnpm build`)
4. Create global wrapper at `/usr/local/bin/brewnet` (or `~/.local/bin/brewnet`)
5. Set up `~/.brewnet/` data directory
6. Verify installation and print version

```bash
# To update Brewnet later, run the same command again:
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

### 0.3 Verify Installation

```bash
brewnet --version
# Brewnet CLI v1.0.0
```

---

## STEP 1: Launch the Setup Wizard

```bash
brewnet init
```

The interactive wizard starts with a system check banner:

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║    Brewnet v1.0.0                                                ║
║    Your Home Server, Brewed Fresh                                ║
║                                                                  ║
║    License: BUSL-1.1                                             ║
║    GitHub:  https://github.com/claude-code-expert/brewnet        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Scenario A: Docker not installed (auto-install)**

```
  ⚠  Docker가 설치되지 않았습니다. 자동으로 설치합니다.
  [macOS] Homebrew를 통해 Docker Desktop을 설치합니다.

  ... (Homebrew install output) ...

  ✓  Docker Desktop installed (macOS)
  ⠋  Waiting for Docker daemon...
  ✓  Docker daemon ready.
```

**Scenario B: All requirements met (normal flow)**

```
Checking system requirements...

  [OK] OS: macOS 15.1 (Apple Silicon M4 Pro)
  [OK] Memory: 24GB RAM
  [OK] Disk: 512GB (420GB available)
  [OK] Docker: v27.0.3 installed
  [OK] Docker Compose: v2.23.0 installed
  [OK] Node.js: v22.5.0
  [OK] Git: v2.42.0
  [OK] Port 80: available
  [OK] Port 443: available

All checks passed! Press Enter to continue...
```

> Docker is **automatically installed** if not found — no manual installation required.
> If auto-install fails (network issue, permissions), the wizard displays the manual install URL and exits.

---

## STEP 2: Project Setup (STEP 1/7)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1/7: Project Setup                                        │
└─────────────────────────────────────────────────────────────────┘

? Project name: › my-homeserver
? Location: › ~/brewnet/my-homeserver
```

### 2.1 Setup Type Selection

Setup Type은 서버 구성 범위를 결정하는 첫 번째 선택이다. 두 가지 옵션만 제공한다:

```
? What type of setup do you need?

  > Full Install (Recommended)
    Partial Install
```

| Option | Description | Pre-enabled Components | Wizard Steps |
|--------|-------------|----------------------|:------------:|
| **Full Install** | 모든 핵심 서버 컴포넌트를 포함한 완전한 설치 | Web + Git + DB (PostgreSQL + Redis defaults) | Step 2 ~ 7 |
| **Partial Install** | Web + Git Server 필수, 나머지는 선택적으로 토글 | Web + Git (required) | Step 2 ~ 7 |

#### Scenario A: User selects "Full Install"

Full Install을 선택하면 Web Server, Git Server, DB Server가 기본으로 활성화된다. Web Server와 Git Server는 항상 필수(required)이다. DB Server는 PostgreSQL(Primary) + Redis(Cache)가 기본 선택된 상태로 시작된다. App Server는 Step 3에서 Dev Stack 선택 시 자동 활성화된다. File Server와 Media는 비활성화 상태이며 사용자가 토글할 수 있다.

#### Scenario B: User selects "Partial Install"

Partial Install을 선택하면 Web Server와 Git Server가 필수(required)로 활성화된다. App Server, DB Server, File Server, Media 모두 비활성화 상태이며 사용자가 원하는 컴포넌트만 토글하여 구성할 수 있다.

> 이 문서의 나머지 부분은 **Scenario A (Full Install)** 를 기준으로 전체 흐름을 보여준다. Scenario B는 동일한 단계를 거치되, 초기 토글 상태만 다르다.

---

## STEP 3: Infrastructure Services (STEP 2/7)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2/7: Server Components                                    │
└─────────────────────────────────────────────────────────────────┘

Toggle the server components you need.
Each card can be expanded to configure options.
```

이전 버전에서는 8개 카테고리에 약 40개 서비스를 선택하는 방식이었으나, 간소화된 구조에서는 **7개의 서버 컴포넌트 토글 카드**로 재구성되었다.

### 3.1 Admin Account

서버 컴포넌트를 선택하기 전에, 관리자 계정을 먼저 설정한다. 이 계정은 Brewnet 전체의 관리자 계정이며, 선택한 서비스(Nextcloud, pgAdmin 등)의 기본 관리자 계정으로도 사용된다.

```
─── Admin Account ─────────────────────────────────────────────────

  Set up your server admin credentials.
  This password will be used as the default admin password
  for all services (Nextcloud, pgAdmin, etc.).

? Admin username: › admin
? Admin password: › ••••••••••••••••••••

  Password auto-generated (20 characters).
  Press Enter to accept, or type your own.

  Generated: Xk9mP2vQ8nL4wR7jTb5s

  [OK] Credentials saved to .env (chmod 600)
```

처음 방문 시 20자의 보안 비밀번호가 자동 생성된다. 사용자는 Enter를 눌러 자동 생성된 비밀번호를 수락하거나, 직접 입력할 수 있다. 비밀번호는 프로젝트의 `.env` 파일에 저장되며, 파일 권한은 `chmod 600`으로 설정되어 소유자만 읽기/쓰기가 가능하다.

> 이 비밀번호는 Nextcloud admin, pgAdmin login, Jellyfin admin, Gitea admin, FileBrowser admin 등 모든 서비스의 기본 관리자 비밀번호로 전파된다. 서비스별로 개별 변경이 필요하면 설치 후 각 서비스의 관리 패널에서 변경할 수 있다.

### 3.2 Component Cards Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  [ON]  Web Server          (Required)                             │
│        Traefik (recommended) / Nginx / Caddy                      │
├──────────────────────────────────────────────────────────────────┤
│  [OFF] File Server         (Optional)                             │
│        Nextcloud (recommended) / MinIO                            │
├──────────────────────────────────────────────────────────────────┤
│  [ON]  Git Server          (Required)                             │
│        Gitea (version control, auto-deploy pipeline)              │
├──────────────────────────────────────────────────────────────────┤
│  [ON]  DB Server           (Optional)                             │
│        Primary DB + Cache + Credentials                           │
├──────────────────────────────────────────────────────────────────┤
│  [OFF] Media               (Optional)                             │
│        Jellyfin                                                   │
├──────────────────────────────────────────────────────────────────┤
│  [OFF] SSH Server          (Optional)                             │
│        Port 2222, key-based auth, SFTP subsystem                  │
└──────────────────────────────────────────────────────────────────┘
```

> Web Server와 Git Server는 항상 ON (Required) 상태이다. Full Install 선택 시 추가로 App + DB가 기본 ON 상태이다. Partial Install 선택 시 Web + Git만 ON이다.

### 3.3 Web Server (Required)

Web Server는 필수 컴포넌트로, 항상 활성화되어 있다. Reverse proxy 역할을 담당한다.

```
? Select web server:

  > Traefik            — Cloud-native reverse proxy (MIT) [Recommended]
    Nginx              — High performance proxy (BSD-2)
    Caddy              — Automatic HTTPS (Apache-2.0)
```

**Example selection**: User selects `Traefik` (recommended default).

> Traefik은 Docker label 기반 자동 서비스 디스커버리를 제공하며, HTTP/HTTPS 라우팅을 자동 처리한다.

### 3.4 File Server (Optional)

파일 서버 컴포넌트. 토글하여 활성화할 수 있다.

```
? Enable File Server? (toggle)  [OFF] → [ON]

? Select file server:

  > Nextcloud          — Full cloud suite (AGPL-3.0) [Recommended]
    MinIO              — S3-compatible object storage (AGPL-3.0)
```

**Example selection**: User enables the toggle and selects `Nextcloud`.

| Service | Port | Access URL |
|---------|:----:|------------|
| Nextcloud | 443 | `http://nextcloud.{DOMAIN}` |
| MinIO | 9000 | `http://minio.{DOMAIN}` |

### 3.5 App Server (Step 3에서 자동 설정)

App Server는 더 이상 Step 2의 토글 카드가 아니다. Step 3(Dev Stack & Runtime)에서 언어 또는 Frontend 기술 스택을 선택하면 자동으로 활성화된다.

> Step 3에서 Dev Stack 선택 시 `servers.appServer.enabled = true` 자동 설정.

### 3.6 DB Server (Optional)

DB Server를 활성화하면 Primary DB, Cache, 그리고 credentials를 하나의 카드에서 구성한다.

```
? Enable DB Server? (toggle)  [ON]

─── Primary Database ──────────────────────────────────────────────

? Select primary database:

  > PostgreSQL         — Advanced open source database [Recommended]
    MySQL              — Popular relational database
    SQLite             — File-based, no server needed

─── Cache ─────────────────────────────────────────────────────────

? Select cache:

  > Redis              — In-memory cache & message broker (BSD-3) [Recommended]
    Valkey             — Redis fork by Linux Foundation (BSD-3)
    KeyDB              — Redis fork, multi-threaded (BSD-3)

─── Credentials ───────────────────────────────────────────────────

? Database name: › brewnet_db
? Database user: › brewnet
? Database password: › (auto-generate) [Enter for auto]

  Generated password: xK9mP2vQ8nL4wR7j
```

**Example selection**: User selects `PostgreSQL` + `Redis` with auto-generated credentials.

> Full Install에서는 PostgreSQL + Redis가 기본 선택된 상태로 시작된다.

### 3.7 Media (Optional)

미디어 컴포넌트. Jellyfin만 제공한다.

```
? Enable Media? (toggle)  [OFF] → [ON]

  Jellyfin — Media streaming server (GPL-2.0)
  Port: 8096
  Access: http://jellyfin.{DOMAIN}
```

**Example selection**: User enables Media (Jellyfin).

### 3.8 SSH Server (Optional)

SSH Server 컴포넌트. 원격 접속 및 SFTP 파일 전송을 위한 서버를 제공한다.

```
? Enable SSH Server? (toggle)  [OFF] → [ON]

  SSH Server — OpenSSH-based access (BSD)
  Port: 2222
  Auth: Key-based authentication (default)

  ┌────────────────────────────────────────────────────────────────┐
  │  SSH Configuration                                             │
  ├────────────────────────────────────────────────────────────────┤
  │  Port:            2222                                         │
  │  Auth Method:     Key-based (default)                          │
  │  Password Auth:   [OFF] (toggle to enable)                     │
  │                                                                │
  │  [ON]  SFTP       File transfer subsystem                      │
  │        Auto-suggested: File Server or Media is enabled         │
  └────────────────────────────────────────────────────────────────┘

? Enable password authentication? (toggle)  [OFF]
  (Key-based auth is more secure and recommended)

? Enable SFTP? (toggle)  [ON]
  (Auto-suggested because File Server / Media is enabled)
```

> SSH Server는 포트 2222에서 실행되며, 기본적으로 key-based 인증만 허용한다. Password 인증은 선택적으로 활성화할 수 있다.
> SFTP는 File Server(Nextcloud/MinIO) 또는 Media(Jellyfin)가 활성화된 경우 자동으로 ON이 제안된다.
> Admin credentials entered once → propagated to Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, SSH, Mail.

### 3.9 Git Server (Required — 항상 ON)

Git Server 컴포넌트. Web Server와 함께 항상 활성화되는 필수 컴포넌트로, 코드 버전 관리 및 자동 배포 파이프라인을 제공한다.

```
  [ON]  Git Server     (required — always enabled)

  Git Server — Gitea-based version control
  Web UI: https://git.{DOMAIN} (port 3000)
  Git SSH: port 3022

  ┌────────────────────────────────────────────────────────────────┐
  │  Git Server Configuration                                      │
  ├────────────────────────────────────────────────────────────────┤
  │  Service:         Gitea                                        │
  │  Web UI:          https://git.{DOMAIN}                         │
  │  Git SSH Port:    3022                                         │
  │  Git HTTP:        https://git.{DOMAIN}/{user}/{repo}.git       │
  │                                                                │
  │  [ON]  Auto-deploy    git push → webhook → build → deploy      │
  │        Triggers automatic deployment on push to main branch    │
  └────────────────────────────────────────────────────────────────┘
```

> Git Server는 Web Server와 마찬가지로 항상 활성화되는 필수 컴포넌트이다.
> Admin credentials → Gitea admin 계정으로 전파.
> SSH 포트는 3022로 SSH Server(2222)와 분리되어 공존 가능.

### 3.10 Component Summary

모든 카드 설정 후, 요약을 표시한다:

```
Selected Server Components:

  Admin Account:  admin / •••••••••••••••••••• (saved to .env)

  Web Server:     Traefik (reverse proxy)
  File Server:    Nextcloud
  App Server:     (auto-enabled from Dev Stack in Step 3)
  DB Server:      PostgreSQL + Redis
  Media:          Jellyfin
  SSH Server:     Enabled (port 2222, key-based auth, SFTP on)
  Git Server:     Gitea (required, web: git.{DOMAIN}, SSH: port 3022, auto-deploy on)

  Credential Propagation:
    Admin credentials → Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, SSH, Mail

  Estimated Resources:
    Containers: 7 (+ app container and FileBrowser in next step)
    RAM:        ~3.5GB
    Storage:    ~4GB (base, excluding media/files)

? Proceed with these components? (Y/n) › Y
```

---

## STEP 4: Dev Stack & Runtime (STEP 3/7)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3/7: Dev Stack & Runtime                                    │
└─────────────────────────────────────────────────────────────────┘

Select your development languages, frameworks, and frontend tech stack.
Multiple selections are supported.
```

> 이 단계는 항상 표시된다. Dev Stack이 필요 없으면 "Skip" 버튼으로 건너뛸 수 있다. 언어/Frontend를 선택하면 App Server가 자동 활성화된다.

### 4.1 Language Selection

```
? Select backend languages (multi-select):

  [x] Python
  [ ] Node.js
  [x] Java
  [ ] PHP
  [ ] .NET
  [ ] Rust
  [ ] Go
```

**Example selection**: User selects `Python` and `Java`.

### 4.2 Framework Selection

선택한 언어에 따라 프레임워크 옵션이 표시된다:

#### If Python is selected:

```
? Select Python framework:

  > FastAPI            — Modern async API framework (MIT)
    Django             — Full-featured web framework (BSD-3)
    Flask              — Lightweight micro framework (BSD-3)
```

**Example selection**: User selects `FastAPI`.

#### If Node.js is selected:

```
? Select Node.js framework:

    Next.js            — React full-stack (SSR/SSG) (MIT)
    Next.js API Routes — API-only backend (MIT)
    Express            — Minimal web framework (MIT)
    NestJS             — Enterprise Node.js framework (MIT)
    Fastify            — Fast web framework (MIT)
```

#### If Java is selected:

```
? Select Java framework:

    Pure Java          — No framework
    Spring             — Enterprise framework (Apache-2.0)
    Spring Boot        — Opinionated Spring (Apache-2.0)
```

#### If Rust is selected:

```
? Select Rust framework:

    Actix Web          — High performance (MIT)
    Axum               — Ergonomic framework (MIT)
```

#### If Go is selected:

```
? Select Go framework:

    Gin                — HTTP web framework (MIT)
    Echo               — High performance framework (MIT)
    Fiber              — Express-inspired framework (MIT)
```

#### If PHP is selected:

```
? Select PHP framework:

    Laravel            — Full-stack framework (MIT)
    Symfony            — Enterprise PHP framework (MIT)
```

#### If .NET is selected:

```
? Select .NET framework:

    ASP.NET Core       — Cross-platform web framework (MIT)
    Blazor             — Full-stack web UI (MIT)
```

### 4.2.1 Frontend Tech Stack (Multi-select)

```
? Select frontend technologies (multi-select):

  [ ] Vue.js           — Progressive framework
  [ ] React.js         — UI library by Meta
  [ ] TypeScript       — Typed JavaScript
  [ ] JavaScript       — Vanilla JS
```

### 4.3 Boilerplate Options

프레임워크 선택 후, boilerplate 관련 추가 옵션을 구성한다. 이전 버전에서는 별도 Integration 단계(STEP 5/6)에 있던 항목들이 이 단계에 통합되었다.

```
─── Boilerplate Configuration ─────────────────────────────────────

? Generate boilerplate?
  > Yes — Generate project scaffolding with selected framework
    No  — Skip boilerplate generation

? Include sample data (User/Post entities)?
  > Yes — Include sample models, routes, and seed data
    No  — Empty boilerplate only

? Development mode:
  > Hot-reload enabled (source code volume mount)
    Production-style deployment
```

**Example selection**: User selects `Yes` (generate), `Yes` (sample data), `Hot-reload enabled`.

> Hot-reload를 선택하면 로컬 소스 디렉토리가 컨테이너에 마운트되어, 코드 변경이 리빌드 없이 즉시 반영된다.

### 4.4 FileBrowser (선택)

FileBrowser는 두 가지 모드로 선택할 수 있다: Web Server 디렉토리 방식(정적 파일 서빙) 또는 별도 FileBrowser 컨테이너(`filebrowser/filebrowser:latest`). 웹 기반 파일 매니저로 파일 업로드/다운로드/관리 기능을 제공하며, Admin credentials로 로그인하여 사용한다. 사용자별 `scope` 설정으로 디렉토리 격리가 가능하다.

```
─── FileBrowser Configuration ─────────────────────────────────────

  [ON]  FileBrowser     (auto-included with App Server)

  Docker Image:    filebrowser/filebrowser:latest (~50MB RAM)
  Web UI:          https://files.{DOMAIN}
  Internal Port:   80
  Traefik Route:   Host(`files.{DOMAIN}`)

  Storage Path:    ./storage (project-relative)
  User Isolation:  scope setting per user

  REST API:
    - POST /api/login              JWT authentication
    - GET  /api/resources/{path}   File/directory listing (JSON)
    - GET  /api/raw/{path}         Raw file download
    - POST /api/resources/{path}   File upload
    - DELETE /api/resources/{path} File deletion

  Credentials:
    Admin credentials → FileBrowser admin login
```

### 4.5 Runtime Summary

```
Selected Runtime & Boilerplate:

  Backend:        Python 3.12 (FastAPI), Java 21 (Spring Boot)
  Frontend:       Vue.js, TypeScript
  Runtime:        Docker (python:3.12-slim)
  Port:           8000
  Boilerplate:    Yes (generate scaffolding)
  Sample Data:    Yes (User/Post models)
  Dev Mode:       Hot-reload enabled
  FileBrowser:    Enabled (https://files.{DOMAIN})

  Generated boilerplate includes:
    - Dockerfile (multi-stage build)
    - Health check endpoint (/api/health)
    - Sample CRUD endpoints (/api/users)
    - Database integration (SQLAlchemy async)
    - Redis cache integration
    - CORS configuration
    - Swagger UI (/docs)

? Proceed? (Y/n) › Y
```

---

## STEP 5: Domain & Network (STEP 4/7)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4/7: Domain & Network                                      │
└─────────────────────────────────────────────────────────────────┘

Configure your domain and network access method.
```

이전 버전에서는 Database 선택이 이 위치에 있었으나, DB 설정은 Server Components 카드(STEP 2/7)로 통합되었다. 대신 도메인과 네트워크 설정이 독립된 단계로 추가되었다.

### 5.1 Domain Provider Selection

도메인 접근 방식을 3가지 옵션 중 선택한다:

```
? How would you like to access your server?

    Local Only (.local)       — Home network only, no external access
  > Free Domain (DigitalPlat) — Get a free domain (.dpdns.org) [RECOMMENDED]
    Own Domain                — Use your existing domain
```

| Provider | Description | External Access | Cost |
|----------|-------------|:---------------:|------|
| **Local Only** | `.local` 도메인으로 홈 네트워크 내에서만 접근 | No | Free |
| **Free Domain (DigitalPlat)** | DigitalPlat FreeDomain에서 무료 도메인 발급 (.dpdns.org 추천) | Yes | Free |
| **Own Domain** | 사용자가 이미 보유한 도메인 사용 | Yes | Varies |

#### Scenario A: Local Only (.local)

```
? Enter your local domain: › brewnet.local

  Your server will be accessible only within your home network.
  Subdomains will be auto-configured:
    traefik.brewnet.local
    git.brewnet.local
    nextcloud.brewnet.local
    jellyfin.brewnet.local
    fastapi.brewnet.local
    files.brewnet.local

  SSL: Self-signed certificate (auto-generated)
  Cloudflare Tunnel: Not available (local only)
```

#### Scenario B: Free Domain (DigitalPlat) — RECOMMENDED

```
┌─────────────────────────────────────────────────────────┐
│  Free Domain Setup Guide (8 Steps)                      │
│                                                         │
│  1. Cloudflare 계정 생성                                │
│     → dash.cloudflare.com (무료)                        │
│                                                         │
│  2. DigitalPlat FreeDomain 방문                         │
│     → dash.domain.digitalplat.org                       │
│                                                         │
│  3. DigitalPlat 계정 등록/로그인                        │
│                                                         │
│  4. 도메인명 검색                                       │
│     → 원하는 이름 입력, 가용성 확인                    │
│                                                         │
│  5. 도메인 등록 (TLD 선택)                              │
│     → .dpdns.org (권장) / .qzz.io / .us.kg             │
│                                                         │
│  6. Cloudflare 네임서버 설정                            │
│     → DigitalPlat 패널에서 Cloudflare NS 입력          │
│     → NS: xxx.ns.cloudflare.com                        │
│                                                         │
│  7. DNS 전파 대기 (15분~24시간)                         │
│     → 확인: dig +short NS mydomain.dpdns.org           │
│                                                         │
│  8. 위저드로 돌아와 도메인명 입력                       │
└─────────────────────────────────────────────────────────┘

  Tip: .dpdns.org domains are free and work immediately
       with Cloudflare for DNS and Tunnel.

? Have you completed the steps above? (Y/n) › Y

? Enter your free domain: › myserver.dpdns.org

  Subdomains will be auto-configured:
    traefik.myserver.dpdns.org
    git.myserver.dpdns.org
    nextcloud.myserver.dpdns.org
    jellyfin.myserver.dpdns.org
    fastapi.myserver.dpdns.org
    files.myserver.dpdns.org
```

**Example selection**: User registers at DigitalPlat and enters `myserver.dpdns.org`.

#### Scenario C: Own Domain

```
? Enter your domain name: › homeserver.example.com

  Ensure your domain's nameservers point to Cloudflare
  for Tunnel integration.

  Subdomains will be auto-configured:
    traefik.homeserver.example.com
    git.homeserver.example.com
    nextcloud.homeserver.example.com
    jellyfin.homeserver.example.com
    fastapi.homeserver.example.com
    files.homeserver.example.com
```

### 5.2 Cloudflare Tunnel

Free Domain 또는 Own Domain을 선택한 경우, Cloudflare Tunnel이 기본으로 활성화된다. Tunnel은 외부 접근을 위한 필수 요소로, 포트 포워딩 없이 NAT/CGNAT 환경에서도 서비스를 외부에 노출할 수 있다.

```
─── Cloudflare Tunnel ─────────────────────────────────────────────

  [ON] Cloudflare Tunnel     (Required for external access)

  Benefits:
    • No port forwarding needed
    • Works behind NAT/CGNAT
    • Automatic HTTPS encryption
    • DDoS protection included

  Setup:
    1. Go to Cloudflare Zero Trust dashboard:
       https://one.dash.cloudflare.com
    2. Navigate to: Networks → Tunnels → Create a Tunnel
    3. Copy the Tunnel Token

? Enter your Cloudflare Tunnel Token: › eyJhIjoiNz...

  [OK] Tunnel token validated
  [OK] cloudflared container will be auto-configured
```

> Cloudflare Tunnel은 Free Domain과 Own Domain 선택 시 기본 ON이며, "Required for external access"로 표시된다. Local Only 선택 시에는 표시되지 않는다.

| Provider | Tunnel Default | SSL |
|----------|:--------------:|-----|
| **Local Only** | N/A (not shown) | Self-signed (auto) |
| **Free Domain** | ON (required) | Auto HTTPS via Cloudflare |
| **Own Domain** | ON (required) | Auto HTTPS via Cloudflare |

### 5.3 Mail Server (Conditional)

Mail Server는 도메인 프로바이더가 **Local Only가 아닌 경우**에만 표시된다. Free Domain 또는 Own Domain을 선택한 경우 메일 서버를 활성화할 수 있다.

```
─── Mail Server ──────────────────────────────────────────────────

  Available because you have an external domain configured.

? Enable Mail Server? (toggle)  [OFF] → [ON]

  docker-mailserver — Full-featured mail server
  Protocols: SMTP (587) + IMAP (993)
  Webmail:   Roundcube (optional)

  ┌────────────────────────────────────────────────────────────────┐
  │  Mail Configuration                                            │
  ├────────────────────────────────────────────────────────────────┤
  │  SMTP:           Port 587 (STARTTLS)                           │
  │  IMAP:           Port 993 (SSL/TLS)                            │
  │  Postmaster:     admin@myserver.dpdns.org                      │
  │                  (using admin credentials from Step 2)          │
  │                                                                │
  │  [ON]  Webmail   Roundcube web interface                       │
  │        Access:   https://mail.myserver.dpdns.org               │
  └────────────────────────────────────────────────────────────────┘

  [OK] Postmaster account: admin@myserver.dpdns.org
  [OK] Admin credentials will be used for postmaster login
```

> Mail Server는 docker-mailserver를 사용하며, SMTP(587)와 IMAP(993)을 제공한다.
> Admin credentials가 postmaster@{DOMAIN} 계정의 비밀번호로 자동 전파된다.
> Local Only 선택 시에는 이 섹션이 표시되지 않는다 (메일 서버는 외부 도메인이 필요).

**Updated Preview URLs** (with Mail and SSH):

```
  Subdomains will be auto-configured:
    traefik.myserver.dpdns.org
    git.myserver.dpdns.org
    nextcloud.myserver.dpdns.org
    jellyfin.myserver.dpdns.org
    fastapi.myserver.dpdns.org
    files.myserver.dpdns.org
    mail.myserver.dpdns.org          (webmail)

  SSH Access:
    ssh admin@myserver.dpdns.org -p 2222

  Mail Endpoints:
    SMTP: smtp.myserver.dpdns.org:587
    IMAP: imap.myserver.dpdns.org:993
```

### 5.4 Domain Summary

```
Domain & Network Configuration:

  Provider:      Free Domain (DigitalPlat)
  Domain:        myserver.dpdns.org
  Tunnel:        Cloudflare Tunnel (enabled)
  SSL:           Auto HTTPS via Cloudflare
  Mail Server:   Enabled (docker-mailserver)
  Postmaster:    admin@myserver.dpdns.org

? Proceed? (Y/n) › Y
```

---

## STEP 6: Review (STEP 5/7)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5/7: Review                                                │
└─────────────────────────────────────────────────────────────────┘

  Project:       my-homeserver
  Location:      ~/brewnet/my-homeserver
  Setup Type:    Full Install

  ─── Admin Account ─────────────────────────────────────────────
  Username:      admin
  Password:      ••••••••••••••••••••  (stored in .env, chmod 600)

  ─── Server Components ──────────────────────────────────────────
  Web Server:    Traefik v3.0
  Git Server:    Gitea (required, git.myserver.dpdns.org)
  File Server:   Nextcloud
  App Server:    Enabled
  FileBrowser:   Enabled (files.myserver.dpdns.org)
  DB Server:     PostgreSQL 16 + Redis 7 (brewnet_db)
  Media:         Jellyfin
  SSH Server:    Enabled (port 2222, key-based auth, SFTP on)
  Mail Server:   Enabled (docker-mailserver, postmaster@myserver.dpdns.org)

  ─── Runtime & Boilerplate ──────────────────────────────────────
  Language:      Python 3.12
  Framework:     FastAPI
  Boilerplate:   Yes (with sample data)
  Dev Mode:      Hot-reload enabled

  ─── Domain & Network ───────────────────────────────────────────
  Provider:      Free Domain (DigitalPlat)
  Domain:        myserver.dpdns.org
  Tunnel:        Cloudflare Tunnel (enabled)
  SSL:           Auto HTTPS via Cloudflare

  ─── Credential Propagation ─────────────────────────────────────
  Admin credentials (admin / ••••••••••) are used by:
    • Nextcloud      — Admin login
    • pgAdmin        — Admin login
    • Jellyfin       — Admin login
    • Gitea          — Admin login
    • FileBrowser    — Admin login
    • SSH Server     — Admin user (key-based + optional password)
    • Mail Server    — Postmaster (admin@myserver.dpdns.org)

  ─── Resources ──────────────────────────────────────────────────
  Total Containers: 10
  Estimated RAM:    ~5GB
  Estimated Disk:   ~6GB (base)

  ─── Licenses ───────────────────────────────────────────────────
  All selected services use OSI-approved open source licenses.

? Action:
  > Generate — Create all files and start services
    Modify  — Go back and change selections
    Export  — Save configuration to brewnet.config.json
```

**Example selection**: User selects `Generate`.

---

## STEP 7: File Generation & Service Startup (STEP 6/7)

### 7.1 File Generation

```
Generating project files...

  [OK] Created ~/brewnet/my-homeserver/
  [OK] Created docker-compose.yml
  [OK] Created docker-compose.dev.yml
  [OK] Created .env (secrets auto-generated)
  [OK] Created .env.example
  [OK] Created Makefile
  [OK] Created README.md

  [OK] Created infrastructure/traefik/traefik.yml
  [OK] Created infrastructure/traefik/dynamic/

  [OK] Created databases/postgres/init/01-init.sql
  [OK] Created databases/redis/redis.conf

  [OK] Created apps/fastapi-app/Dockerfile
  [OK] Created apps/fastapi-app/requirements.txt
  [OK] Created apps/fastapi-app/src/main.py
  [OK] Created apps/fastapi-app/src/config.py
  [OK] Created apps/fastapi-app/src/database.py
  [OK] Created apps/fastapi-app/src/models/user.py
  [OK] Created apps/fastapi-app/src/routers/health.py
  [OK] Created apps/fastapi-app/src/routers/users.py
  [OK] Created apps/fastapi-app/src/schemas/user.py

  [OK] Created infrastructure/filebrowser/filebrowser.json
  [OK] Created infrastructure/filebrowser/database.db

  [OK] Created infrastructure/ssh/sshd_config
  [OK] Created infrastructure/ssh/host_keys/
  [OK] Created infrastructure/ssh/authorized_keys/
  [OK] Created infrastructure/ssh/sftp.conf

  [OK] Created infrastructure/mail/postfix/main.cf
  [OK] Created infrastructure/mail/dovecot/dovecot.conf
  [OK] Created infrastructure/mail/postmaster.conf
  [OK] Created infrastructure/mail/roundcube/config.inc.php

  [OK] Created scripts/backup.sh
  [OK] Created scripts/restore.sh
  [OK] Created scripts/update.sh
  [OK] Created scripts/health-check.sh

  [OK] Created docs/SETUP.md
  [OK] Created docs/SERVICES.md
  [OK] Created docs/TROUBLESHOOTING.md

  Total: 34 files generated
```

### 7.2 Generated Project Structure

```
~/brewnet/my-homeserver/
├── docker-compose.yml          # Main Compose file (all services)
├── docker-compose.dev.yml      # Dev overrides (hot-reload)
├── .env                        # Environment variables (auto-generated secrets)
├── .env.example                # Template for reference
├── Makefile                    # Common commands
├── README.md                   # Project documentation
│
├── infrastructure/
│   ├── traefik/
│   │   ├── traefik.yml
│   │   └── dynamic/
│   ├── filebrowser/
│   │   ├── filebrowser.json
│   │   └── database.db
│   ├── ssh/
│   │   ├── sshd_config
│   │   ├── sftp.conf
│   │   ├── host_keys/
│   │   └── authorized_keys/
│   └── mail/
│       ├── postfix/
│       │   └── main.cf
│       ├── dovecot/
│       │   └── dovecot.conf
│       ├── postmaster.conf
│       └── roundcube/
│           └── config.inc.php
│
├── databases/
│   ├── postgres/
│   │   ├── init/
│   │   │   └── 01-init.sql
│   │   └── backups/
│   └── redis/
│       └── redis.conf
│
├── apps/
│   └── fastapi-app/
│       ├── Dockerfile
│       ├── requirements.txt
│       └── src/
│           ├── main.py
│           ├── config.py
│           ├── database.py
│           ├── models/
│           ├── routers/
│           └── schemas/
│
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   ├── update.sh
│   └── health-check.sh
│
└── docs/
    ├── SETUP.md
    ├── SERVICES.md
    └── TROUBLESHOOTING.md
```

### 7.3 Service Startup

```
Starting services...

  Pulling images...
    [OK] traefik:v3.0
    [OK] postgres:16-alpine
    [OK] redis:7-alpine
    [OK] jellyfin/jellyfin:latest
    [OK] nextcloud:latest
    [OK] linuxserver/openssh-server:latest
    [OK] docker-mailserver/docker-mailserver:latest
    [OK] roundcube/roundcubemail:latest
    [OK] gitea/gitea:latest
    [OK] filebrowser/filebrowser:latest

  Building applications...
    [OK] fastapi-app (Python 3.12)

  Configuring SSH Server...
    [OK] Generated sshd_config (port 2222, key-based auth)
    [OK] Generated SSH host keys (ed25519, rsa)
    [OK] Configured SFTP subsystem
    [OK] Created admin user SSH access

  Configuring Mail Server...
    [OK] Generated postfix configuration (main.cf)
    [OK] Generated dovecot configuration (dovecot.conf)
    [OK] Created postmaster account (admin@myserver.dpdns.org)
    [OK] Configured Roundcube webmail

  Propagating credentials...
    [OK] Admin credentials → Nextcloud (admin login)
    [OK] Admin credentials → pgAdmin (admin login)
    [OK] Admin credentials → Jellyfin (admin login)
    [OK] Admin credentials → Gitea (admin login)
    [OK] Admin credentials → FileBrowser (admin login)
    [OK] Admin credentials → SSH Server (admin user)
    [OK] Admin credentials → Mail Server (postmaster@myserver.dpdns.org)

  Starting containers...
    [OK] brewnet-traefik         (web server / reverse proxy)
    [OK] brewnet-postgres        (primary database)
    [OK] brewnet-redis           (cache)
    [OK] brewnet-fastapi         (application)
    [OK] brewnet-nextcloud       (file server)
    [OK] brewnet-jellyfin        (media)
    [OK] brewnet-gitea           (git server)
    [OK] brewnet-filebrowser    (file browser)
    [OK] brewnet-ssh             (SSH server)
    [OK] brewnet-mailserver      (mail server)
    [OK] brewnet-roundcube       (webmail)

  Running health checks...
    [OK] All 10 containers are healthy

  Verifying external access...
    [OK] Cloudflare Tunnel connected
    [OK] DNS records configured for myserver.dpdns.org
    [OK] HTTPS certificate active
    [OK] SSH port 2222 reachable via tunnel
    [OK] Mail ports (587, 993) configured

  Setup complete!
```

---

## STEP 8: Access Your Services (STEP 7/7)

After setup completes, the wizard displays all available endpoints:

```
╔══════════════════════════════════════════════════════════════════╗
║  Your Home Server is Ready!                                      ║
╚══════════════════════════════════════════════════════════════════╝

  Domain: myserver.dpdns.org (via Cloudflare Tunnel)

  ─── Admin Account ──────────────────────────────────────────────
  Username:         admin
  Password:         (see .env file — ADMIN_PASSWORD)
  Used by:          Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, etc.

  ─── Applications ─────────────────────────────────────────────
  FastAPI App       https://fastapi.myserver.dpdns.org
  FastAPI Docs      https://fastapi.myserver.dpdns.org/docs   (Swagger UI)
  FileBrowser       https://files.myserver.dpdns.org

  ─── Web Server ─────────────────────────────────────────────
  Traefik           https://traefik.myserver.dpdns.org

  ─── File Server ─────────────────────────────────────────────
  Nextcloud         https://nextcloud.myserver.dpdns.org

  ─── Media ───────────────────────────────────────────────────
  Jellyfin          https://jellyfin.myserver.dpdns.org

  ─── Git Server ───────────────────────────────────────────────
  Gitea Web UI      https://git.myserver.dpdns.org
  Git SSH           ssh://git@myserver.dpdns.org:3022/{user}/{repo}.git
  Git HTTP          https://git.myserver.dpdns.org/{user}/{repo}.git

  ─── Databases ────────────────────────────────────────────────
  PostgreSQL        localhost:5432   (user: brewnet)
  Redis             localhost:6379

  ─── Remote Access (SSH) ──────────────────────────────────────
  SSH:              ssh admin@myserver.dpdns.org -p 2222
  SFTP:             sftp -P 2222 admin@myserver.dpdns.org
  Auth:             Key-based (password auth: off)

  ─── Mail ─────────────────────────────────────────────────────
  SMTP:             smtp.myserver.dpdns.org:587 (STARTTLS)
  IMAP:             imap.myserver.dpdns.org:993 (SSL/TLS)
  Webmail:          https://mail.myserver.dpdns.org
  Postmaster:       admin@myserver.dpdns.org

  ─── Credentials Summary ─────────────────────────────────────
  Admin credentials are used across all services:

  ┌─────────────────┬────────────────────────────────────────────┐
  │ Service         │ Login                                      │
  ├─────────────────┼────────────────────────────────────────────┤
  │ Nextcloud       │ admin / (see .env ADMIN_PASSWORD)          │
  │ pgAdmin         │ admin / (see .env ADMIN_PASSWORD)          │
  │ Jellyfin        │ admin / (see .env ADMIN_PASSWORD)          │
  │ Gitea           │ admin / (see .env ADMIN_PASSWORD)          │
  │ FileBrowser     │ admin / (see .env ADMIN_PASSWORD)          │
  │ SSH Server      │ admin (key-based auth)                     │
  │ Mail Server     │ admin@myserver.dpdns.org / ADMIN_PASSWORD  │
  │ Roundcube       │ admin@myserver.dpdns.org / ADMIN_PASSWORD  │
  └─────────────────┴────────────────────────────────────────────┘

  All passwords stored in .env (chmod 600).
  Change per-service passwords in each service's admin panel.

  ─── External Access Verification ─────────────────────────────
  Verify your server is accessible from the internet:

  1. DNS Resolution:
     $ dig myserver.dpdns.org +short
     # Should return Cloudflare IP

  2. HTTPS Access:
     $ curl -I https://fastapi.myserver.dpdns.org
     # Should return HTTP/2 200

  3. Tunnel Status:
     $ brewnet domain tunnel status
     # Should show "connected"

  4. SSH Access:
     $ ssh -p 2222 admin@myserver.dpdns.org "echo connected"
     # Should print "connected"

  5. Mail Server:
     $ brewnet status mailserver
     # Should show "running"

  Troubleshooting:
    • DNS not resolving?  Wait 5-10 min for DNS propagation.
    • HTTPS not working?  Check Cloudflare dashboard for domain status.
    • Tunnel offline?     Run `brewnet logs cloudflared` for tunnel logs.
    • SSH refused?        Verify port 2222 is exposed in tunnel config.

    • 502 Bad Gateway?
      서비스 컨테이너가 실행 중이 아니거나 포트 매핑 오류.
      `docker ps`로 확인하고 서비스가 `brewnet` 네트워크에 연결되었는지 확인.

    • SSL 무한 리다이렉트?
      Cloudflare SSL 모드가 "Flexible"로 설정됨.
      Cloudflare 대시보드에서 SSL → Full 로 변경.

    • 터널 연결 끊김?
      토큰 만료 또는 네트워크 문제.
      `docker logs brewnet-cloudflared --tail 50` 으로 확인.

    • DNS 미전파?
      전파에 15분~48시간 소요.
      `https://dnschecker.org`에서 전파 상태 전세계 확인.

    • 특정 서비스만 접근 불가?
      Cloudflare Tunnel → Public Hostname에서
      해당 서비스가 등록되었는지 확인.

  ─── SSH Management ───────────────────────────────────────────
  Tip: Run `brewnet ssh add-user <name>` to add SSH users.
  Tip: Run `brewnet ssh list` to see all SSH users.
  Tip: Run `brewnet ssh remove-user <name>` to remove an SSH user.

  ─── Admin Panel ──────────────────────────────────────────────
  Local admin panel is now running:

    http://localhost:8088

  Opening browser automatically...
  (Use `brewnet admin` to reopen, or `brewnet admin --port <PORT>` to change port)

  ─── Quick Start ──────────────────────────────────────────────
  Tip: Run `brewnet status` to check all services.
  Tip: Run `brewnet logs <service>` to view logs.
```

> Free Domain 또는 Own Domain + Cloudflare Tunnel을 선택한 경우 모든 서비스가 HTTPS로 자동 제공된다. Local Only를 선택한 경우에는 self-signed 인증서로 `http://*.brewnet.local` 형태로 표시된다.

### 8.1 Admin Panel (Local Service Manager)

Setup 완료 후 브라우저가 자동으로 로컬 관리자 패널을 열어준다.

```
http://localhost:8088
```

관리자 패널은 Brewnet CLI가 내장 웹 서버(`brewnet admin`)로 제공하며, 서비스 관리 UI를 포함한다.

#### 관리자 패널 기능

```
┌──────────────────────────────────────────────────────────────────┐
│  Brewnet — Service Manager        [ Status | Add | Remove ]       │
├──────────────────────────────────────────────────────────────────┤
│  Service        Status    CPU    Memory   Uptime     Action       │
│  ─────────────────────────────────────────────────────────────   │
│  traefik        running   0.1%   45MB     2m         [Stop]       │
│  postgres       running   0.3%   120MB    2m         [Stop]       │
│  redis          running   0.1%   12MB     2m         [Stop]       │
│  gitea          running   0.4%   130MB    2m         [Stop]       │
│  nextcloud      running   0.8%   256MB    2m         [Stop]       │
│  jellyfin       running   1.2%   256MB    2m         [Stop]       │
├──────────────────────────────────────────────────────────────────┤
│  [ Backup / Restore ]  [ Stop All ]  [ Uninstall ]               │
└──────────────────────────────────────────────────────────────────┘
```

| 탭 | 기능 |
|----|------|
| **Status** | 모든 컨테이너 상태, CPU/메모리/업타임, 서비스 URL, 개별 Start/Stop |
| **Add Service** | 추가 서비스 카탈로그 — 클릭으로 설치 및 자동 시작 |
| **Remove Service** | 서비스 제거 (데이터 볼륨 보존, `--purge`로 완전 삭제) |

Action Bar:
- **Backup / Restore** — 전체 설정/데이터 백업 및 복원
- **Stop All** → `brewnet down`
- **Start All** → `brewnet up`
- **Uninstall** — Brewnet 전체 제거 (데이터 보존 선택 가능)

> Admin Panel은 로컬 네트워크에서만 접근 가능하며, 외부에 노출되지 않는다.
> 기본 포트 `8088`. 변경: `brewnet admin --port 9000`

### 8.2 Local DNS Setup (Local Only 선택 시)

Local Only 도메인을 선택한 경우, 로컬 접근을 위해 `/etc/hosts`에 다음을 추가한다:

```
127.0.0.1   brewnet.local
127.0.0.1   fastapi.brewnet.local
127.0.0.1   traefik.brewnet.local
127.0.0.1   nextcloud.brewnet.local
127.0.0.1   jellyfin.brewnet.local
127.0.0.1   git.brewnet.local
127.0.0.1   files.brewnet.local
```

> Brewnet can optionally auto-configure `/etc/hosts` with `sudo` permission.
> Free Domain 또는 Own Domain을 선택한 경우, Cloudflare Tunnel을 통해 DNS가 자동으로 처리되므로 이 단계는 필요 없다.

### 8.2 Generated .env File

```bash
# Brewnet Environment Variables
# Auto-generated by Brewnet CLI
# File permissions: chmod 600

# Admin Account (used as default for all services)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Xk9mP2vQ8nL4wR7jTb5s    # auto-generated (20 chars)

# Domain
DOMAIN=myserver.dpdns.org
DOMAIN_PROVIDER=freedomain              # local | freedomain | custom
SSL_MODE=cloudflare                     # self-signed | letsencrypt | cloudflare

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiNz...   # from Cloudflare Zero Trust dashboard

# Database
DB_NAME=brewnet_db
DB_USER=brewnet
DB_PASSWORD=xK9mP2vQ8nL4wR7j    # auto-generated

# Redis
REDIS_PASSWORD=

# SSH Server
SSH_PORT=2222
SSH_AUTH_METHOD=key                 # key | password | both
SSH_SFTP_ENABLED=true

# Mail Server
MAIL_DOMAIN=myserver.dpdns.org
MAIL_POSTMASTER=admin@myserver.dpdns.org
MAIL_SMTP_PORT=587
MAIL_IMAP_PORT=993

# Application
JWT_SECRET=mN2pQ4rS6tU8vW0x       # auto-generated
```

---

## Post-Setup: Service Management

### Check Service Status

```bash
brewnet status
```

```
┌─────────────┬──────────┬────────┬──────────┬──────────────────┐
│ Service     │ Status   │ CPU    │ Memory   │ Uptime           │
├─────────────┼──────────┼────────┼──────────┼──────────────────┤
│ traefik     │ running  │ 0.1%   │ 45MB     │ 2 minutes        │
│ postgres    │ running  │ 0.3%   │ 120MB    │ 2 minutes        │
│ redis       │ running  │ 0.1%   │ 12MB     │ 2 minutes        │
│ fastapi-app │ running  │ 0.5%   │ 85MB     │ 1 minute         │
│ nextcloud   │ running  │ 0.8%   │ 256MB    │ 2 minutes        │
│ jellyfin    │ running  │ 1.2%   │ 256MB    │ 2 minutes        │
├─────────────┼──────────┼────────┼──────────┼──────────────────┤
│ Total       │ 6/6      │ 3.0%   │ 774MB    │                  │
└─────────────┴──────────┴────────┴──────────┴──────────────────┘
```

### Add a Service

```bash
brewnet add minio
```

```
Adding MinIO (S3-compatible storage)...

  [OK] Updated docker-compose.yml
  [OK] Pulled minio/minio:latest
  [OK] Started brewnet-minio
  [OK] Added Traefik route: http://minio.brewnet.local

  MinIO is now running at http://minio.brewnet.local
```

### Remove a Service

```bash
brewnet remove jellyfin
```

```
? Remove Jellyfin and its data? (y/N) › y

  [OK] Stopped brewnet-jellyfin
  [OK] Removed container
  [OK] Updated docker-compose.yml
  [OK] Removed Traefik route

  Jellyfin has been removed.
  Note: Media data in ~/brewnet/my-homeserver/data/jellyfin/ was preserved.
```

### View Logs

```bash
# All service logs
brewnet logs

# Specific service logs
brewnet logs fastapi-app

# Follow logs in real-time
brewnet logs fastapi-app -f
```

### Start / Stop All Services

```bash
# Stop all services
brewnet down

# Start all services
brewnet up
```

### Update Service Images

```bash
brewnet update
```

```
Checking for updates...

  traefik:v3.0        up to date
  postgres:16-alpine  update available (16.2 -> 16.3)
  redis:7-alpine      up to date
  jellyfin:latest     update available
  ...

? Update 2 services? (Y/n) › Y

  [OK] Updated postgres (16.2 -> 16.3)
  [OK] Updated jellyfin (latest)
  [OK] Restarted updated services
```

### Backup

```bash
brewnet backup
```

```
Creating backup...

  [OK] Backed up configuration files
  [OK] Backed up docker-compose.yml
  [OK] Backed up .env
  [OK] Backed up PostgreSQL database
  [OK] Backed up Redis data

  Backup saved: ~/.brewnet/backups/backup-2026-02-22-143052.tar.gz
  Size: 8.2MB
```

### Restore

```bash
brewnet restore backup-2026-02-22-143052
```

```
? Restore from backup-2026-02-22-143052? This will replace current configuration. (y/N) › y

  [OK] Stopped all services
  [OK] Restored configuration files
  [OK] Restored docker-compose.yml
  [OK] Restored .env
  [OK] Restored PostgreSQL database
  [OK] Restored Redis data
  [OK] Started all services

  Restore complete. All services are running.
```

---

## Appendix A: Full Install vs Partial Install

### Full Install

Full Install은 가장 일반적인 설치 방식이다. Web + Git + DB가 기본으로 활성화되며, DB는 PostgreSQL + Redis가 기본 선택된다. 사용자는 File Server(Nextcloud/MinIO)와 Media(Jellyfin)를 추가로 토글할 수 있다. App Server는 Step 3에서 Dev Stack 선택 시 자동 활성화된다.

```
Required:     Web Server (Traefik) + Git Server (Gitea)
Default ON:   DB Server (PostgreSQL + Redis)
Default OFF:  File Server, Media, App Server (auto-enabled from Step 3)
```

전형적인 사용 사례: API 서버 개발 + 데이터베이스가 포함된 완전한 홈서버.

### Partial Install

Partial Install은 최소한의 구성으로 시작하고 싶은 사용자를 위한 방식이다. Web Server와 Git Server가 필수이며, 나머지 모든 컴포넌트를 선택적으로 토글할 수 있다.

```
Required:     Web Server (Traefik/Nginx/Caddy) + Git Server (Gitea)
Optional:     File Server, App Server, DB Server, Media
```

전형적인 사용 사례:
- Reverse proxy + 파일 서버만: Web + File Server (Nextcloud)
- Reverse proxy + 미디어 서버만: Web + Media (Jellyfin)
- Reverse proxy + DB만: Web + DB (PostgreSQL)

---

## Appendix B: Available Server Components

아래는 각 컴포넌트에서 선택 가능한 서비스 목록이다:

| Component | Options | Default |
|-----------|---------|---------|
| **Web Server** | Traefik, Nginx, Caddy | Traefik (recommended) |
| **File Server** | Nextcloud, MinIO | Nextcloud (recommended) |
| **App Server** | (toggle only) | - |
| **DB Server -- Primary** | PostgreSQL, MySQL, SQLite | PostgreSQL (recommended) |
| **DB Server -- Cache** | Redis, Valkey, KeyDB | Redis (recommended) |
| **Media** | Jellyfin | Jellyfin |
| **Git Server** | Gitea | Gitea (required, always ON) |
| **FileBrowser** | FileBrowser (with App Server) | filebrowser/filebrowser:latest |
| **SSH Server** | OpenSSH (port 2222, key-based auth, SFTP) | Key-based auth |
| **Mail Server** | docker-mailserver (SMTP/IMAP, Roundcube) | Shown when domain is not local |

> 이전 버전에 포함되었던 Monitoring (Grafana, Prometheus, Uptime Kuma), DevOps (Gitea, Drone CI), Home Automation (Home Assistant, Node-RED), Security (AdGuard Home, Vaultwarden, Authelia), Downloads (qBittorrent, Sonarr, Radarr), 추가 Storage (Syncthing, Seafile), 추가 Media (Navidrome, Immich, PhotoPrism), Search Engine, Message Queue, MongoDB 등은 간소화된 아키텍처에서 제거되었다.
>
> v2.2에서 Step 3(Dev Stack & Runtime)에 PHP, .NET이 백엔드 언어로 추가되었다.

---

## Appendix C: Non-Interactive Mode

For automated or scripted setups, use the `--non-interactive` flag with a config file:

```bash
# Export current config
brewnet export > brewnet.config.json

# Use config for non-interactive setup
brewnet init --config brewnet.config.json --non-interactive
```

This skips the wizard and directly generates files based on the saved configuration.

---

## Appendix D: Quick Reference Commands

| Command | Description |
|---------|-------------|
| `brewnet init` | Launch interactive setup wizard |
| `brewnet up` | Start all services |
| `brewnet down` | Stop all services |
| `brewnet status` | Show service status table |
| `brewnet add <service>` | Add a new service |
| `brewnet remove <service>` | Remove a service |
| `brewnet logs [service]` | View service logs |
| `brewnet update` | Update service images |
| `brewnet backup` | Create a backup |
| `brewnet restore <id>` | Restore from backup |
| `brewnet doctor` | Run system diagnostics |
| `brewnet admin` | Open local admin panel (http://localhost:8088) |
| `brewnet admin --port <PORT>` | Start admin panel on custom port |
| `brewnet export` | Export configuration |
| `brewnet ssh add-user <name>` | Add an SSH user |
| `brewnet ssh list` | List all SSH users |
| `brewnet ssh remove-user <name>` | Remove an SSH user |
| `brewnet git repo create <name>` | Git 저장소 생성 |
| `brewnet git repo list` | Git 저장소 목록 |
| `brewnet git hook setup <repo>` | Webhook 자동 배포 설정 |
| `brewnet domain free register <name>` | 무료 도메인 등록 (DigitalPlat) |
| `brewnet domain tunnel status` | Cloudflare Tunnel 상태 확인 |
| `brewnet credentials` | 전체 서비스 자격증명 표시 |
| `brewnet mail test <email>` | 테스트 메일 전송 |
| `brewnet mail dns-check` | 메일 DNS 레코드 확인 (MX, SPF, DKIM, DMARC) |
| `brewnet storage monitor` | 스토리지 사용량 모니터링 |
| `brewnet backup verify <id>` | 백업 무결성 검증 |
| `brewnet --help` | Show help |

---

## Appendix E: Wizard Step Summary

| Step | Title | Description |
|------|-------|-------------|
| STEP 0 | Installation | `curl -fsSL .../install.sh \| bash` 원라인 설치 |
| STEP 1 | System Check | `brewnet init` 실행, 시스템 체크 (Docker 미설치 시 자동 설치) |
| STEP 2 (1/7) | Project Setup | 프로젝트 이름, 위치, Setup Type (Full/Partial) |
| STEP 3 (2/7) | Server Components | Admin 계정 설정 + 6개 서버 컴포넌트 토글 카드 (Web/File/Git/DB/Media/SSH), credential propagation |
| STEP 4 (3/7) | Dev Stack & Runtime | 다중 언어/프레임워크 선택, Frontend 기술 스택, FileBrowser, boilerplate 옵션 — 항상 표시 |
| STEP 5 (4/7) | Domain & Network | 도메인 프로바이더 선택 (Local/.dpdns.org/Own), Cloudflare Tunnel, Mail Server 설정 |
| STEP 6 (5/7) | Review | 전체 설정 검토 (SSH/Mail/Credential Propagation 포함), Generate/Modify/Export 선택 |
| STEP 7 (6/7) | Generate | 파일 생성 (SSH/Mail 포함), credential propagation, external access verification, 서비스 시작 |
| STEP 8 (7/7) | Complete | 서비스 접속 정보 표시 + Admin Panel(http://localhost:8088) 자동 오픈 — Service Manager로 서비스 start/stop/install/uninstall |

---

## Related Documents

- [PRD.md](PRD.md) — Product Requirements Document
- [TRD.md](TRD.md) — Technical Requirements Document
- [REQUIREMENT.md](REQUIREMENT.md) — Functional Requirements
- [CLAUDE.md](CLAUDE.md) — AI Development Context
- [spec/](spec/) — Detailed Specifications
