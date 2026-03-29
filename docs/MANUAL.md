# Brewnet 사용 매뉴얼

> **Your Home Server, Brewed Fresh**
>
> 이 문서는 Brewnet의 설치부터 운영까지 모든 과정을 안내하는 공식 사용 매뉴얼입니다.
> 최종 업데이트: 2026-03-28

---

## 목차

- [1. 소개](#1-소개)
- [2. 설치](#2-설치)
- [3. 관리자 대시보드](#3-관리자-대시보드)
- [4. 앱 생성 및 배포](#4-앱-생성-및-배포)
- [5. 도메인 설정 (Cloudflare Tunnel)](#5-도메인-설정-cloudflare-tunnel)
- [6. 서비스 관리](#6-서비스-관리)
- [7. CLI 명령어 레퍼런스](#7-cli-명령어-레퍼런스)
- [8. 문제 해결 (FAQ)](#8-문제-해결-faq)
- [9. 완전 삭제 (Uninstall)](#9-완전-삭제-uninstall)

---

## 1. 소개

### 1.1 Brewnet이란?

Brewnet은 오픈소스로 개발된 셀프 호스팅 홈 서버 관리 플랫폼입니다. 단일 CLI 명령어와 웹 기반 대시보드를 통해 Docker 기반 서비스들을 손쉽게 설치, 관리, 배포할 수있고 클라우드 플레어 터널을 통해 외부 도메인을 연결, 접근할 수 있습니다. 가볍고 빠르고 쉽습니다.

- Docker 미 설치시 도커 자동 설치(인터넷 속도에 따라 2분~ 소요), 도커가 있을 경우 자동으로 호출 
- minimum install 기준 : 필수 설치 (Gitea, WebSesrver) 후 도메인 연결까지 3분 이내 소요 
- full install 기준 : CLI 설정 및 도메인 연결까지 5분 이내 소요 

### 1.2 주요 기능 개요

| 기능 | 설명 |
|------|------|
| **인터랙티브 설정 마법사** | 7단계 대화형 마법사로 서버 환경을 자동 구성 |
| **Docker 자동 설치** | Docker가 없으면 macOS / Linux에서 자동 설치 |
| **Git 서버 (Gitea)** | 내장 Git 서버로 코드 관리 및 배포 파이프라인 구축 |
| **파일 서버** | Nextcloud, MinIO를 통한 파일 저장 및 공유 |
| **데이터베이스** | PostgreSQL, MySQL, MariaDB + Redis/Valkey/KeyDB 캐시 |
| **미디어 서버** | Jellyfin을 통한 미디어 스트리밍 |
| **앱 서버** | 16개 보일러플레이트 스택으로 즉시 앱 생성 |
| **리버스 프록시** | Traefik(기본), Nginx, Caddy 자동 구성 |
| **외부 접근** | Cloudflare Tunnel로 공인 IP 없이 외부 도메인 연결 |
| **관리자 대시보드** | 웹 브라우저 기반 실시간 모니터링 및 관리 |
| **백업/복원** | 프로젝트 전체를 .tar.gz로 백업 및 복원 |
| **앱 배포** | Git 기반 자동 빌드, 배포, 롤백 지원 |

### 1.3 시스템 요구사항

| 항목 | 최소 버전 | 비고 |
|------|-----------|------|
| **Node.js** | 20+ | `node --version`으로 확인 |
| **Docker** | 27+ | `brewnet init` 시 자동 설치 가능 |
| **운영체제** | macOS 12+ / Ubuntu 20.04+ | Linux (Debian/Ubuntu 계열) 권장 |
| **RAM** | 2GB 이상 | 4GB 이상 권장 |
| **디스크** | 20GB 이상 | 설치 서비스에 따라 상이 |

> Docker는 `brewnet init` 실행 전에 미리 설치할 필요가 없습니다. 마법사가 자동으로 감지하고 설치합니다.

---

## 2. 설치

### 2.1 Brewnet 설치

Brewnet을 설치하는 방법은 두 가지입니다.

#### 방법 A: curl (권장)

가장 간단한 방법입니다. 설치 스크립트가 바이너리를 `/usr/local/bin/brewnet`에 배치하며, `sudo` 비밀번호를 요청할 수 있습니다. 설치 후 셸 재시작이 필요하지 않습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

#### 방법 B: npm

Node.js가 이미 설치되어 있다면 npm을 통해 전역 설치할 수 있습니다.

```bash
npm install -g @brewnet/cli
```

#### 설치 확인

설치가 완료되면 다음 명령어로 정상 설치 여부를 확인합니다.

```bash
brewnet --version
```

버전 번호가 출력되면 설치가 성공한 것입니다.

### 2.2 초기 설정 마법사 (7-Step Wizard)

Brewnet의 핵심은 7단계 인터랙티브 설정 마법사입니다. 다음 명령어로 시작합니다.

```bash
brewnet init
```

마법사는 각 단계에서 사용자의 입력을 받아 프로젝트 환경을 자동으로 구성합니다. 진행 중 언제든지 이전 단계로 돌아갈 수 있으며, `Ctrl+C`로 중단할 수도 있습니다. 중단된 마법사는 다시 `brewnet init`을 실행하면 이어서 진행할 수 있습니다.

#### Step 0: 시스템 체크

마법사가 시작되면 먼저 현재 시스템 환경을 자동으로 점검합니다.

**점검 항목:**
- **운영체제**: macOS 12+ 또는 Ubuntu 20.04+ 인지 확인
- **Docker**: Docker Engine이 설치되어 있는지, 설치되어 있지 않으면 자동 설치 제안
- **포트 사용**: 기본 포트(80, 443, 8080, 8088 등)가 이미 사용 중인지 확인
- **디스크 공간**: 최소 20GB 이상의 여유 공간이 있는지 확인
- **Node.js 버전**: Node.js 20 이상인지 확인

Docker가 설치되어 있지 않은 경우, Brewnet이 운영체제에 맞는 방법으로 자동 설치를 시도합니다.

모든 점검 항목이 통과되면 다음 단계로 자동 진행됩니다.

#### Step 1: 프로젝트 설정

프로젝트의 기본 정보를 설정합니다.

**입력 항목:**
- **프로젝트 이름**: 영문 소문자, 숫자, 하이픈으로 구성 (예: `my-server`, `home-lab`)
- **프로젝트 경로**: 프로젝트 파일이 저장될 디렉토리 (기본값: `~/brewnet/<프로젝트명>/`)
- **설치 유형**: Full Install 또는 Partial Install 선택

**Full Install vs Partial Install:**

| 구분 | Full Install | Partial Install |
|------|-------------|-----------------|
| 설명 | 모든 핵심 서비스를 한 번에 설치 | 필요한 서비스만 선택적으로 설치 |
| 포함 서비스 | Web Server + Git Server + File Server + DB + App Server | 사용자가 직접 선택 |
| 적합한 경우 | 처음 시작하는 사용자, 올인원 환경 원하는 경우 | 리소스가 제한적이거나 특정 서비스만 필요한 경우 |
| 설치 시간 | 상대적으로 오래 걸림 | 선택 서비스에 따라 다름 |

#### Step 2: 관리자 계정 + 서버 구성요소 선택

관리자 계정을 설정하고 서버에 설치할 구성요소를 선택합니다.

**관리자 계정 설정:**
- **사용자 이름**: 관리자 ID 입력 (기본값: `admin`)
- **비밀번호**: 관리자 비밀번호 입력 (최소 8자, 영문+숫자 조합 권장)
- 설정된 자격증명은 `.env` 파일에 `chmod 600` 권한으로 저장되며, 모든 서비스에 자동 전파됩니다.

**서버 구성요소:**

| 구성요소 | 옵션 | 필수 여부 | 설명 |
|---------|------|---------|------|
| **Web Server** | Traefik (기본), Nginx, Caddy | 필수 | HTTP/HTTPS 리버스 프록시 |
| **File Server** | Nextcloud, MinIO | 선택 | 파일 저장 및 공유 |
| **App Server** | 사용자 정의 앱 | 선택 | Docker 컨테이너 기반 앱 실행 |
| **Database** | PostgreSQL, MySQL, MariaDB | 선택 | 관계형 데이터베이스 |
| **Cache** | Redis, Valkey, KeyDB | 선택 | 인메모리 캐시 |
| **Media** | Jellyfin | 선택 | 미디어 스트리밍 서버 |

각 서비스를 선택하면 해당 서비스의 리소스 요구사항(RAM, 디스크)이 표시됩니다.

**서비스별 리소스 요구사항:**

| 서비스 | 예상 RAM | 예상 디스크 |
|--------|---------|-----------|
| Traefik | 64 MB | 0.1 GB |
| Gitea | 256 MB | 1 GB |
| Nextcloud | 256 MB | 2 GB |
| MinIO | 128 MB | 1 GB |
| PostgreSQL | 120 MB | 1 GB |
| MySQL | 256 MB | 1 GB |
| Jellyfin | 256 MB | 2 GB |
| pgAdmin | 128 MB | 0.5 GB |

#### Step 3: 런타임 & 보일러플레이트 설정

App Server를 선택한 경우에만 이 단계가 나타납니다. 앱 개발에 사용할 프로그래밍 언어와 프레임워크를 선택합니다.

**지원 언어 및 프레임워크:**

Brewnet은 16개의 사전 구축된 보일러플레이트 스택을 제공합니다. 먼저 언어를 선택하면 해당 언어에서 사용 가능한 프레임워크 목록이 표시됩니다.

| 언어 | 프레임워크 | 버전 | ORM |
|------|----------|------|-----|
| **Go** | Gin | Go 1.22 | GORM |
| **Go** | Echo v4 | Go 1.24 | GORM |
| **Go** | Fiber v3 | Go 1.25 | GORM |
| **Rust** | Actix-web 4 | Rust 1.88 | SQLx |
| **Rust** | Axum 0.8 | Rust 1.88 | SQLx |
| **Java** | Spring Boot 3.3 | Java 21 | JPA / JDBC |
| **Java** | Spring Framework 6.2 | Java 21 | JDBC / HikariCP |
| **Kotlin** | Ktor 3.1 | Kotlin 2.1 | Exposed ORM |
| **Kotlin** | Spring Boot 3.4 | Kotlin 2.1 | JDBC / HikariCP |
| **Node.js** | Express 5 | Node 22 | Prisma 6 |
| **Node.js** | NestJS 11 | Node 22 | Prisma 6 |
| **Node.js** | Next.js 15 (API Routes) | Node 22 | Prisma 6 |
| **Node.js** | Next.js 15 (Full-Stack) | Node 22 | Prisma 6 |
| **Python** | FastAPI | Python 3.12 | SQLAlchemy 2.0 |
| **Python** | Django 6 | Python 3.13 | Django ORM |
| **Python** | Flask 3.1 | Python 3.13 | Flask-SQLAlchemy |

**Unified vs Non-unified 스택:**

- **Unified 스택** (`isUnified: true`): 프론트엔드와 백엔드가 하나의 컨테이너에서 실행됩니다. Next.js 15 (API Routes)와 Next.js 15 (Full-Stack)이 이에 해당합니다. 단일 포트로 프론트엔드와 API를 모두 제공합니다.
- **Non-unified 스택** (`isUnified: false`): 백엔드 API만 제공하는 순수 서버 애플리케이션입니다. 프론트엔드가 필요하면 별도로 구성해야 합니다. 나머지 14개 스택이 이에 해당합니다.

**데이터베이스 드라이버 선택:**

| 드라이버 | 설명 |
|---------|------|
| `sqlite3` | 기본값. 별도 컨테이너 불필요, 파일 기반 데이터베이스 |
| `postgres` | PostgreSQL 컨테이너 자동 생성 |
| `mysql` | MySQL 컨테이너 자동 생성 |

> Rust 스택(Actix-web, Axum)은 빌드 시간이 상대적으로 오래 걸립니다. 첫 빌드 시 수 분이 소요될 수 있으며, 마법사에서 경고 메시지가 표시됩니다.

#### Step 4: 도메인 & 네트워크

외부에서 서버에 접근하는 방법을 설정합니다. 세 가지 모드 중 하나를 선택합니다.

**Local Only 모드:**
- 외부 접근 없이 로컬 네트워크에서만 사용
- `http://localhost` 또는 `http://<내부IP>` 로 접근
- 추가 설정이 필요 없어 가장 간단
- 개인 개발 환경이나 내부 네트워크 전용으로 적합

**Quick Tunnel 모드:**
- Cloudflare 계정 없이 즉시 사용 가능한 임시 터널
- `https://<random-subdomain>.trycloudflare.com` 형태의 임시 URL 자동 생성
- 서버를 재시작하면 URL이 변경됨
- 테스트 용도나 임시 외부 공유에 적합
- 별도 설정 불필요 — 자동으로 cloudflared가 구성됨

**Named Tunnel 모드:**
- Cloudflare 계정과 도메인이 필요한 영구 터널
- `https://app.yourdomain.com` 형태의 고정 URL
- 서버를 재시작해도 URL이 유지됨
- 프로덕션 환경에 적합
- Cloudflare API Token, 도메인(Zone) 설정이 필요 (자세한 설정은 [5. 도메인 설정](#5-도메인-설정-cloudflare-tunnel) 참조)

| 비교 항목 | Local Only | Quick Tunnel | Named Tunnel |
|---------|------------|-------------|-------------|
| 외부 접근 | 불가 | 임시 URL | 고정 도메인 |
| Cloudflare 계정 | 불필요 | 불필요 | 필요 |
| 도메인 구매 | 불필요 | 불필요 | 필요 |
| URL 지속성 | N/A | 재시작 시 변경 | 영구 |
| 용도 | 개발/내부 | 테스트/임시 공유 | 프로덕션 |
| 설정 난이도 | 쉬움 | 쉬움 | 보통 |

#### Step 5: 리뷰 & 확인

지금까지 설정한 모든 항목을 한눈에 보여주는 리뷰 화면입니다.

표시 항목:
- 프로젝트 이름 및 경로
- 선택된 서비스 목록
- 관리자 계정 정보
- 런타임/프레임워크 (선택한 경우)
- 도메인/네트워크 모드
- 예상 리소스 사용량

이 단계에서 "Confirm"을 선택하면 설치가 시작됩니다. 변경이 필요한 경우 이전 단계로 돌아갈 수 있습니다.

또한 `--config` 옵션을 사용하면 JSON 파일로 사전에 정의된 설정값을 불러올 수도 있습니다.

```bash
brewnet init --config ./my-config.json
```

#### Step 6: Docker Compose 생성 & 서비스 시작

확인이 완료되면 Brewnet이 자동으로 다음 작업을 순차적으로 수행합니다.

1. **Docker Compose 파일 생성**: 선택한 서비스들에 맞는 `docker-compose.yml`을 자동 생성
2. **Docker 네트워크 생성**: `brewnet` 및 `brewnet-internal` 네트워크 구성
3. **서비스 컨테이너 시작**: `docker compose up -d`로 모든 컨테이너 백그라운드 실행
4. **자격증명 전파**: 관리자 계정 정보를 Gitea, Nextcloud, 데이터베이스 등 각 서비스에 자동 전파
5. **Health Check**: 모든 서비스가 정상적으로 시작될 때까지 health check 수행
6. **접근 확인**: 각 서비스의 엔드포인트에 접근 가능한지 자동 확인

이 과정은 선택한 서비스 수와 네트워크 환경에 따라 1분에서 수 분이 소요될 수 있습니다.

#### Step 7: 완료

모든 설치가 완료되면 다음 정보가 표시됩니다.

- **서비스 엔드포인트 목록**: 각 서비스에 접근할 수 있는 URL
  - 관리자 대시보드: `http://localhost:8088`
  - Traefik 대시보드: `http://localhost:8080`
  - Gitea: `http://localhost/git`
  - Nextcloud: `http://localhost/cloud` (설치한 경우)
  - Jellyfin: `http://localhost:8096` (설치한 경우)
- **관리자 자격증명**: 설정한 관리자 ID/비밀번호
- **터널 상태**: Quick Tunnel URL 또는 Named Tunnel 도메인 정보
- **다음 단계 안내**: 관리자 대시보드 접속 방법, 앱 생성 방법 등

설정이 완료되면 자동으로 브라우저에서 관리자 대시보드가 열립니다. (`--no-open` 옵션으로 비활성화 가능)

---

## 3. 관리자 대시보드

### 3.1 접속 방법

관리자 대시보드는 웹 브라우저에서 접근합니다.

**기본 접속 주소:**
```
http://localhost:8088
```

접속하면 로그인 화면이 나타납니다. Step 2에서 설정한 관리자 비밀번호를 입력하여 로그인합니다.

**접속이 안 되는 경우:**
1. 서비스가 실행 중인지 확인: `brewnet status`
2. 포트 8088이 사용 가능한지 확인
3. 서비스를 재시작: `brewnet up`

### 3.2 Dashboard 페이지

Dashboard는 관리자 대시보드의 메인 페이지로, 서버 전체 상태를 한눈에 파악할 수 있습니다.

**서비스 상태 카드:**

각 Docker 서비스의 현재 상태가 카드 형태로 표시됩니다.

| 상태 | 표시 | 설명 |
|------|------|------|
| Running | 녹색 | 서비스가 정상 실행 중 |
| Stopped | 빨간색 | 서비스가 중지됨 |
| Restarting | 노란색 | 서비스가 재시작 중 |
| Created | 노란색 | 컨테이너가 생성되었으나 아직 시작되지 않음 |
| Error | 빨간색 | 서비스에 오류 발생 |

각 카드를 클릭하면 해당 서비스의 상세 정보(이미지, 포트, 로그 등)를 확인할 수 있습니다.

**터널 배너:**

현재 터널 모드에 따라 상단에 배너가 표시됩니다.

- **Quick Tunnel**: 현재 임시 URL이 표시되며, 클릭하면 해당 URL로 이동합니다.
- **Named Tunnel**: 연결된 도메인 정보가 표시됩니다.
- **Local Only**: 터널 배너가 표시되지 않습니다.

**서비스 관리:**

Dashboard에서 바로 서비스를 설치하거나 제거할 수 있습니다. 서비스 카드의 상세 모달에서 시작/중지/제거 작업을 수행할 수 있습니다.

**Logs 탭:**

Dashboard 하단에는 Logs 탭이 있어 전체 서비스의 통합 로그를 실시간으로 확인할 수 있습니다.

### 3.3 Apps 페이지

Apps 페이지에서는 사용자가 생성한 앱 애플리케이션을 관리합니다.

**앱 카드 목록:**

각 앱이 카드 형태로 표시되며, 다음 정보를 포함합니다.
- 앱 이름
- 실행 상태 (Running / Stopped)
- 사용 중인 스택/프레임워크
- 앱 접속 URL
- 외부 도메인 연결 상태 (연결된 경우)

**앱 관리 기능:**

| 기능 | 설명 |
|------|------|
| **Start** | 중지된 앱을 시작합니다 |
| **Stop** | 실행 중인 앱을 중지합니다 |
| **Deploy** | 최신 코드를 빌드하여 배포합니다 |
| **Delete** | 앱과 관련 컨테이너를 삭제합니다 (확인 필요) |

앱 카드를 클릭하면 상세 모달이 열리며, 다음 탭에서 세부 정보를 확인할 수 있습니다.
- **Overview**: 앱 기본 정보, 상태, 접속 URL
- **Deployment**: 배포 이력, 현재 배포 버전, 롤백
- **Logs**: 해당 앱의 실시간 로그
- **Domain**: 외부 도메인 연결 관리

**Create New App 버튼:**

우측 상단의 "Create New App" 버튼을 클릭하여 새 앱을 생성할 수 있습니다. 자세한 내용은 [4. 앱 생성 및 배포](#4-앱-생성-및-배포)를 참조하세요.

**외부 도메인 목록:**

Apps 페이지 하단에는 현재 연결된 외부 도메인 목록이 표시됩니다. 각 항목에서 호스트명, 연결된 앱, 서브도메인 정보를 확인할 수 있습니다.

### 3.4 Catalog 페이지

Catalog 페이지에서는 설치 가능한 서비스 목록을 카테고리별로 브라우징하고 원클릭으로 설치/제거할 수 있습니다.

**카테고리:**

| 카테고리 | 서비스 |
|---------|-------|
| **Database** | PostgreSQL, MySQL |
| **File Server** | Nextcloud, MinIO, FileBrowser |
| **Media** | Jellyfin |
| **Admin** | pgAdmin |
| **Other** | OpenSSH Server, Cloudflare Tunnel |

**서비스 카드 정보:**

각 서비스 카드에는 다음 정보가 표시됩니다.
- 서비스 이름 및 Docker 이미지
- 예상 RAM 사용량 (MB)
- 현재 설치 여부

**원클릭 설치:**

아직 설치되지 않은 서비스의 "Install" 버튼을 클릭하면, docker-compose.yml에 해당 서비스가 자동으로 추가되고 컨테이너가 시작됩니다. 이미 설치된 서비스는 "Remove" 버튼으로 제거할 수 있습니다.

---

## 4. 앱 생성 및 배포

### 4.1 Boilerplate로 앱 생성

Brewnet은 16개의 사전 구축된 보일러플레이트 스택을 제공합니다. 이를 통해 즉시 실행 가능한 앱 프로젝트를 생성할 수 있습니다.

#### 대시보드에서 생성

1. Apps 페이지에서 **"Create New App"** 버튼 클릭
2. **Boilerplate** 모드 선택
3. 앱 이름 입력 (영문 소문자, 숫자, 하이픈만 허용)
4. 언어 선택 (Go, Rust, Java, Kotlin, Node.js, Python)
5. 해당 언어의 프레임워크 선택
6. 포트 설정 (기본값: 3000)
7. 데이터베이스 드라이버 선택 (sqlite3, postgres, mysql)
8. "Create" 클릭

#### CLI에서 생성

```bash
# 인터랙티브 모드 (언어/프레임워크 선택 프롬프트)
brewnet create-app my-app

# 스택 직접 지정
brewnet create-app my-app --stack nodejs-express

# 스택 + 데이터베이스 지정
brewnet create-app my-app --stack python-fastapi --database postgres
```

#### 16개 지원 스택 목록

**Go 스택:**

| Stack ID | 프레임워크 | ORM | Go 버전 |
|----------|----------|-----|---------|
| `go-gin` | Gin | GORM | 1.22 |
| `go-echo` | Echo v4 | GORM | 1.24 |
| `go-fiber` | Fiber v3 | GORM | 1.25 |

**Rust 스택:**

| Stack ID | 프레임워크 | ORM | Rust 버전 |
|----------|----------|-----|----------|
| `rust-actix-web` | Actix-web 4 | SQLx | 1.88 |
| `rust-axum` | Axum 0.8 | SQLx | 1.88 |

> Rust 스택은 첫 빌드 시 컴파일 시간이 상당히 소요될 수 있습니다 (수 분~십수 분). Docker 빌드 캐시가 적용되면 이후 빌드는 빨라집니다.

**Java 스택:**

| Stack ID | 프레임워크 | ORM | Java 버전 |
|----------|----------|-----|----------|
| `java-springboot` | Spring Boot 3.3 | JPA / JDBC | 21 |
| `java-spring` | Spring Framework 6.2 | JDBC / HikariCP | 21 |

**Kotlin 스택:**

| Stack ID | 프레임워크 | ORM | Kotlin 버전 |
|----------|----------|-----|------------|
| `kotlin-ktor` | Ktor 3.1 | Exposed ORM | 2.1 |
| `kotlin-springboot` | Spring Boot 3.4 | JDBC / HikariCP | 2.1 |

**Node.js 스택:**

| Stack ID | 프레임워크 | ORM | Node 버전 |
|----------|----------|-----|----------|
| `nodejs-express` | Express 5 | Prisma 6 | 22 |
| `nodejs-nestjs` | NestJS 11 | Prisma 6 | 22 |
| `nodejs-nextjs` | Next.js 15 (API Routes) | Prisma 6 | 22 |
| `nodejs-nextjs-full` | Next.js 15 (Full-Stack) | Prisma 6 | 22 |

> `nodejs-nextjs`와 `nodejs-nextjs-full`은 Unified 스택으로, 프론트엔드와 백엔드가 하나의 컨테이너에서 실행됩니다.

**Python 스택:**

| Stack ID | 프레임워크 | ORM | Python 버전 |
|----------|----------|-----|------------|
| `python-fastapi` | FastAPI | SQLAlchemy 2.0 | 3.12 |
| `python-django` | Django 6 | Django ORM | 3.13 |
| `python-flask` | Flask 3.1 | Flask-SQLAlchemy | 3.13 |

#### 앱 생성 후 실행 과정

앱이 생성되면 Brewnet이 자동으로 다음 작업을 수행합니다.

1. **Clone**: GitHub의 brewnet-boilerplate 레포지토리에서 해당 스택의 브랜치를 클론
2. **환경변수 생성**: `.env.example`에서 `.env` 파일을 생성하고 보안 시크릿을 자동 생성
3. **Git 초기화**: 클론 히스토리를 정리하고 새로운 Git 레포지토리로 초기화
4. **Docker 빌드**: `docker compose up -d --build`로 컨테이너 빌드 및 시작
5. **Health Check**: `/health` 엔드포인트로 앱이 준비될 때까지 폴링
6. **API 검증**: `/api/hello`과 `/api/echo` 엔드포인트로 정상 동작 확인

### 4.2 Git Clone으로 앱 생성

기존에 작성된 프로젝트를 Git URL로 직접 클론하여 앱을 생성할 수도 있습니다.

#### 대시보드에서 생성

1. Apps 페이지에서 **"Create New App"** 버튼 클릭
2. **Git Clone** 모드 선택
3. 앱 이름 입력
4. Git URL 입력 (예: `https://github.com/user/my-project.git`)
5. 포트 설정
6. "Create" 클릭

#### CLI에서 생성

```bash
brewnet deploy ./my-local-project
brewnet deploy ./my-local-project --name my-app --port 8080
```

**자동 Dockerfile 생성:**

프로젝트에 Dockerfile이 없는 경우, Brewnet이 프로젝트 구조를 분석하여 적절한 Dockerfile을 자동으로 생성합니다. `package.json`이 있으면 Node.js 프로젝트로, `requirements.txt`가 있으면 Python 프로젝트로 감지합니다.

### 4.3 배포 (Deploy)

앱 코드를 변경한 후 새 버전을 배포하는 방법입니다.

#### 대시보드에서 배포

1. Apps 페이지에서 배포할 앱의 카드를 찾습니다
2. **"Deploy"** 버튼을 클릭합니다
3. 배포 진행 상황이 Progress Modal에 실시간으로 표시됩니다

#### CLI에서 배포

```bash
brewnet deploy <path>
brewnet deploy ./my-project --name my-app --port 3000
```

#### 배포 과정

배포 시 다음 단계가 자동으로 수행됩니다.

1. **Gitea Push**: 로컬 코드가 내장 Gitea 서버에 자동으로 push됩니다
2. **Docker Build**: 새로운 Docker 이미지가 빌드됩니다
3. **Health Check**: 새 컨테이너가 health check를 통과하는지 확인합니다
4. **트래픽 전환**: health check 통과 후 트래픽이 새 컨테이너로 전환됩니다

배포 최대 시간은 3분이며, 이를 초과하면 타임아웃으로 처리됩니다.

#### 배포 이력 관리

앱 상세 모달의 **Deployment** 탭에서 이전 배포 이력을 확인할 수 있습니다. 각 배포 기록에는 커밋 해시, 배포 시간, 상태(성공/실패)가 포함됩니다.

#### Rollback (롤백)

문제가 발생한 경우 이전 배포 버전으로 롤백할 수 있습니다.

1. 앱 상세 모달의 Deployment 탭에서 이전 배포 항목을 선택
2. "Rollback" 버튼 클릭
3. 이전 버전의 Docker 이미지로 컨테이너가 교체됩니다

---

## 5. 도메인 설정 (Cloudflare Tunnel)

Cloudflare Tunnel을 사용하면 공인 IP나 포트 포워딩 없이 홈 서버의 앱을 외부 도메인(예: `myapp.example.com`)으로 안전하게 공개할 수 있습니다. 설정은 최초 1회만 필요하며, 이후 앱마다 서브도메인만 연결하면 됩니다.

### 5.1 사전 준비

Named Tunnel을 사용하려면 다음이 필요합니다.

1. **Cloudflare 계정 생성**: [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) 에서 무료 계정을 생성합니다.

2. **도메인 구매**: 도메인이 없다면 다음 방법으로 구매합니다.
   - **Cloudflare Registrar**에서 직접 구매 (가장 간단, 네임서버 설정 자동 완료)
   - 다른 등록기관(가비아, GoDaddy, Namecheap, AWS Route53 등)에서 구매

3. **Cloudflare 네임서버 설정**: 외부 등록기관에서 도메인을 구매한 경우, 해당 도메인의 네임서버를 Cloudflare에서 제공하는 네임서버로 변경해야 합니다.
   - Cloudflare 대시보드에 도메인 추가
   - 안내되는 네임서버 2개를 도메인 등록기관에서 설정
   - DNS 전파에 최대 24시간 소요 (보통 1~2시간 내 완료)
   - Cloudflare 대시보드에서 도메인 상태가 **Active**로 변경되면 완료

### 5.2 API Token 발급

Brewnet이 Cloudflare API를 통해 터널을 생성하고 DNS 레코드를 자동으로 관리하려면 API Token이 필요합니다. 계정 전체 권한의 Global API Key와 달리, 이 토큰은 특정 작업에만 범위가 제한된 안전한 토큰입니다.

#### 발급 절차

1. **Cloudflare 대시보드 접속**: [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   - 우측 상단 프로필 아이콘 클릭 → "My Profile" → 좌측 메뉴에서 "API Tokens" 클릭

2. **토큰 생성 시작**: "Create Token" 버튼 클릭 → 목록 맨 아래 "Custom token" 행에서 "Get started" 클릭

3. **토큰 이름 입력**: Token Name에 식별 가능한 이름을 입력합니다 (예: `brewnet`)

4. **권한 1 설정 — 터널 생성/관리:**
   ```
   ① 첫 번째 드롭다운 → Account 선택
   ② 두 번째 드롭다운 → Cloudflare Tunnel 선택
   ③ 세 번째 드롭다운 → Edit 선택
   ```

5. **"+ Add more" 클릭 → 권한 2 설정 — DNS 레코드 자동 생성:**
   ```
   ① 첫 번째 드롭다운 → Zone 선택
   ② 두 번째 드롭다운 → DNS 선택
   ③ 세 번째 드롭다운 → Edit 선택
   ```

6. **"+ Add more" 클릭 → 권한 3 설정 — 도메인 목록 조회:**
   ```
   ① 첫 번째 드롭다운 → Zone 선택
   ② 두 번째 드롭다운 → Zone 선택  ← 두 번째 드롭다운도 Zone입니다
   ③ 세 번째 드롭다운 → Read 선택
   ```

7. **Zone Resources — 토큰을 적용할 도메인 범위 지정:**
   ```
   "Include" → "All zones from an account" → 본인 계정 선택
   ```
   특정 도메인만 허용하려면:
   ```
   "Include" → "Specific zone" → 사용할 도메인 선택
   ```

8. **토큰 생성 완료**: "Continue to summary" → "Create Token" 클릭 → 표시된 토큰을 즉시 복사

#### 필요 권한 요약

| 카테고리 | 서비스 | 권한 레벨 | 용도 |
|---------|-------|---------|------|
| Account | Cloudflare Tunnel | Edit | 터널 생성, 수정, 삭제 |
| Zone | DNS | Edit | DNS 레코드 자동 생성/수정 |
| Zone | Zone | Read | 계정에 등록된 도메인 목록 조회 |

> **주의**: 토큰은 생성 직후 한 번만 표시됩니다. 창을 닫으면 다시 확인할 수 없으니 반드시 복사 후 안전한 곳에 보관하세요.

### 5.3 Zone(도메인) 선택

Cloudflare Zone은 Cloudflare에서 관리 중인 도메인(예: `example.com`)을 의미합니다. API Token이 유효하면 계정에 등록된 모든 도메인이 자동으로 목록에 불러와집니다.

#### 도메인이 없는 경우

Cloudflare Registrar에서 직접 구매하거나, 다른 업체(가비아, GoDaddy, AWS 등)에서 구매 후 네임서버를 Cloudflare로 이전하세요.

#### 이미 Cloudflare에 도메인이 있는 경우

관리자 대시보드에서 "Load Domains"를 누르면 자동으로 선택 목록에 표시됩니다.

#### 도메인 상태 확인

| 상태 | 설명 |
|------|------|
| **Active** | 네임서버 변경이 완료되어 DNS 레코드 생성이 가능한 상태 |
| **Pending** | 네임서버 변경이 아직 적용 중인 상태. DNS 레코드 생성 불가 |

Pending 상태에서는 DNS 레코드를 생성할 수 없습니다. Cloudflare 대시보드에서 도메인 상태가 Active인지 확인한 후 진행하세요.

### 5.4 Tunnel 생성

Cloudflare Tunnel은 공인 IP나 포트 포워딩 없이 로컬 서버를 안전하게 외부에 노출하는 기술입니다. 터널 이름은 Cloudflare Zero Trust 대시보드에서 이 연결을 식별하는 레이블로 사용됩니다.

#### 터널 생성 방법

**관리자 대시보드에서:**
1. Apps 페이지 상단의 "Domain Settings" 또는 터널 설정 버튼 클릭
2. API Token이 검증되고 Zone이 선택된 상태에서 터널 이름 입력
3. "Create Tunnel" 버튼 클릭
4. Cloudflare에 터널이 자동으로 생성됩니다

**CLI에서:**
```bash
brewnet domain connect
```

#### 터널 이름 규칙

- 영문 소문자, 숫자, 하이픈(`-`)만 사용 가능
- Cloudflare 계정 내에서 고유해야 합니다
- 프로젝트 이름을 기반으로 자동 입력되며, 원하는 이름으로 변경 가능

#### 생성 후 확인

Cloudflare Zero Trust 대시보드에서 생성된 터널과 상태를 확인할 수 있습니다.
- 접속: [https://one.dash.cloudflare.com/](https://one.dash.cloudflare.com/) → Networks → Tunnels

> 동일한 이름의 터널이 이미 있으면 오류가 발생합니다. 기존 터널을 삭제하거나 다른 이름을 사용하세요.

### 5.5 앱별 도메인 연결

터널이 생성된 후, 각 앱에 서브도메인을 연결하여 외부에서 접근할 수 있게 합니다.

#### 서브도메인이란?

서브도메인은 도메인 앞에 붙는 접두사입니다. 예를 들어 앱 이름이 "my-blog"이고 도메인이 `example.com`이면, `my-blog.example.com`으로 외부에서 접근할 수 있게 됩니다. 서브도메인마다 Cloudflare에 CNAME DNS 레코드가 자동으로 생성되며, Tunnel 인그레스 규칙도 함께 추가됩니다.

#### 연결 방법

**관리자 대시보드에서:**
1. Apps 페이지에서 도메인을 연결할 앱의 카드를 클릭
2. **Domain** 탭 선택
3. 서브도메인 입력 (앱 이름 기반으로 자동 제안됨)
4. "Connect" 버튼 클릭
5. DNS 레코드가 자동 생성되고 터널 인그레스 규칙이 추가됩니다

**CLI에서:**
```bash
brewnet domain connect my-api --domain my-api.example.com
```

#### 서브도메인 규칙

| 규칙 | 설명 |
|------|------|
| 허용 문자 | 영문 소문자, 숫자, 하이픈(`-`)만 |
| 금지 문자 | 대문자, 언더스코어(`_`), 공백 |
| 시작/끝 | 하이픈으로 시작하거나 끝날 수 없음 |
| 중복 | 같은 도메인에 동일한 서브도메인이 이미 다른 앱에 연결되어 있으면 오류 |
| 자동 제안 | 앱 이름을 기반으로 서브도메인이 자동 입력됨 |

#### DNS 전파 확인

연결 후 DNS 전파에 최대 수 분이 걸릴 수 있습니다. Cloudflare는 보통 즉시 반영됩니다.

확인 방법:
```bash
# DNS 레코드 확인
dig my-app.example.com CNAME

# 또는 터널 상태 확인
brewnet domain tunnel status
```

#### Quick Tunnel에서 Named Tunnel로 전환

처음에 Quick Tunnel로 시작한 경우, 나중에 Named Tunnel로 전환할 수 있습니다.

```bash
brewnet domain connect
```

이 명령어를 실행하면 대화형 마법사가 시작되어 API Token 입력, Zone 선택, Tunnel 생성 과정을 안내합니다. 기존 Quick Tunnel은 Named Tunnel로 자동 마이그레이션됩니다.

### 5.6 외부 DNS 프로바이더 설정 (선택사항)

도메인을 Cloudflare가 아닌 다른 등록기관에서 구매한 경우, 해당 등록기관에서 Cloudflare 네임서버를 가리키도록 설정해야 합니다. 또는 네임서버를 이전하지 않고 CNAME 레코드를 직접 설정하는 방법도 있습니다.

#### GoDaddy에서 CNAME 설정

1. GoDaddy 계정에 로그인합니다
2. "My Products" → 도메인 옆 "DNS" 버튼 클릭
3. "DNS Records" 섹션에서 "Add" 클릭
4. 다음과 같이 입력:
   - **Type**: CNAME
   - **Name**: 서브도메인 이름 (예: `my-app`)
   - **Value**: `<tunnel-id>.cfargotunnel.com`
   - **TTL**: 600초 (또는 Auto)
5. "Save" 클릭

> `<tunnel-id>`는 Cloudflare에서 생성한 터널의 UUID입니다. 관리자 대시보드의 Domain 설정에서 확인할 수 있습니다.

#### Namecheap에서 CNAME 설정

1. Namecheap 계정에 로그인합니다
2. "Domain List" → 도메인의 "Manage" 클릭
3. "Advanced DNS" 탭 선택
4. "ADD NEW RECORD" 클릭
5. 다음과 같이 입력:
   - **Type**: CNAME Record
   - **Host**: 서브도메인 이름 (예: `my-app`)
   - **Value**: `<tunnel-id>.cfargotunnel.com`
   - **TTL**: Automatic
6. 체크마크 클릭하여 저장

#### 가비아에서 CNAME 설정

1. 가비아 ([https://www.gabia.com](https://www.gabia.com)) 에 로그인합니다
2. "My 가비아" → "도메인 관리" → 해당 도메인의 "관리" 클릭
3. "DNS 관리" → "DNS 설정" 클릭
4. "레코드 추가" 클릭
5. 다음과 같이 입력:
   - **타입**: CNAME
   - **호스트**: 서브도메인 이름 (예: `my-app`)
   - **값/위치**: `<tunnel-id>.cfargotunnel.com`
   - **TTL**: 3600 (기본값)
6. "확인" → "적용" 클릭

> 가비아에서 Cloudflare 네임서버로 이전하려면: DNS 관리 → 네임서버 설정 → Cloudflare가 제공하는 네임서버 2개 입력 → 저장. 네임서버 전파에 24시간까지 소요될 수 있습니다.

#### Cafe24에서 CNAME 설정

1. Cafe24 나의서비스관리에 로그인합니다
2. "도메인 관리" → 해당 도메인 선택
3. "DNS 관리" 클릭
4. "DNS 레코드 추가" 클릭
5. 다음과 같이 입력:
   - **유형**: CNAME
   - **호스트명**: 서브도메인 이름 (예: `my-app`)
   - **값**: `<tunnel-id>.cfargotunnel.com`
6. "추가" → "적용" 클릭

> Cafe24에서 Cloudflare로 네임서버를 이전하려면: 도메인 관리 → 네임서버 변경 → Cloudflare 네임서버 입력 후 저장합니다.

---

## 6. 서비스 관리

### 6.1 서비스 시작/중지

#### 모든 서비스 시작

```bash
brewnet up
```

프로젝트 디렉토리의 `docker-compose.yml`에 정의된 모든 서비스를 `docker compose up -d`로 시작합니다. 다른 경로의 프로젝트를 시작하려면 `-p` 옵션을 사용합니다.

```bash
brewnet up -p /path/to/project
```

#### 모든 서비스 중지

```bash
brewnet down
```

실행 중인 모든 서비스 컨테이너를 중지합니다. 컨테이너는 중지되지만 데이터 볼륨은 보존됩니다.

#### 개별 서비스 관리

관리자 대시보드에서 개별 서비스의 시작/중지를 관리할 수 있습니다. Dashboard 페이지에서 서비스 카드를 클릭하면 상세 모달에서 해당 서비스만 제어할 수 있습니다.

### 6.2 서비스 추가

새로운 서비스를 기존 프로젝트에 추가합니다.

```bash
brewnet add <service>
```

**사용 예시:**
```bash
brewnet add jellyfin      # 미디어 서버 추가
brewnet add nextcloud     # 파일 서버 추가
brewnet add postgresql    # PostgreSQL 데이터베이스 추가
brewnet add pgadmin       # pgAdmin 관리 도구 추가
```

서비스가 추가되면 `docker-compose.yml`이 자동으로 업데이트되고, 변경 전 백업이 생성됩니다. 추가 후 `brewnet up`으로 서비스를 시작합니다.

관리자 대시보드의 Catalog 페이지에서도 "Install" 버튼으로 동일한 작업을 수행할 수 있습니다.

### 6.3 서비스 제거

```bash
brewnet remove <service>
```

서비스를 `docker-compose.yml`에서 제거합니다. 기본적으로 확인 프롬프트가 표시됩니다.

**옵션:**
- `--purge`: 관련 Docker 볼륨과 설정 데이터도 함께 삭제
- `--force`: 확인 프롬프트 건너뛰기

**사용 예시:**
```bash
# 서비스만 제거 (데이터 보존)
brewnet remove jellyfin

# 서비스 + 데이터 완전 삭제
brewnet remove jellyfin --purge

# 확인 없이 즉시 제거
brewnet remove jellyfin --force
```

> `--purge` 사용 시 해당 서비스의 데이터(데이터베이스, 업로드 파일 등)가 영구적으로 삭제됩니다. 중요 데이터가 있다면 먼저 백업하세요.

### 6.4 서비스 상태 확인

```bash
brewnet status
```

현재 프로젝트의 모든 Docker 서비스 상태를 테이블 형태로 표시합니다.

**출력 예시:**
```
Name        Status      Image                     Ports               Uptime
----------  ----------  ------------------------  ------------------  ------
traefik     ● Running   traefik:v2.11             80→80, 443→443      2h
gitea       ● Running   gitea/gitea:latest        3000→3000           2h
postgresql  ● Running   postgres:18.3-alpine      5432→5432           2h
nextcloud   ● Running   nextcloud:29-apache       80→80               2h
cloudflared ● Running   cloudflare/cloudflared    -                   2h

  5/5 services running
```

**옵션:**
- `-p, --path <path>`: 프로젝트 경로 지정 (기본값: 현재 디렉토리)
- `--json`: JSON 형식으로 출력 (스크립트 연동용)

```bash
# JSON 형식으로 상태 출력
brewnet status --json

# 특정 프로젝트 경로의 상태 확인
brewnet status -p ~/brewnet/my-server/
```

### 6.5 로그 확인

```bash
brewnet logs [service]
```

서비스 로그를 확인합니다. 서비스 이름을 생략하면 모든 서비스의 로그가 표시됩니다.

**기본 옵션:**
- `-f, --follow`: 실시간 로그 스트리밍 (tail -f 와 유사)
- `-n, --tail <lines>`: 마지막 N줄만 표시
- `-p, --path <path>`: 프로젝트 경로 지정

**사용 예시:**
```bash
# 모든 서비스 로그 확인
brewnet logs

# 특정 서비스 로그 확인
brewnet logs gitea

# 실시간 로그 스트리밍
brewnet logs -f

# 마지막 50줄만 표시
brewnet logs -n 50 traefik

# Gitea 로그를 실시간으로 스트리밍
brewnet logs -f gitea
```

**통합 로그 조회 (고급):**

Brewnet은 CLI 로그, Tunnel 로그, Traefik 접근 로그, Docker 서비스 로그를 통합하여 조회하는 기능을 제공합니다.

- `--all`: 모든 소스의 통합 로그 표시
- `--source <type>`: 소스별 필터링 (`cli`, `tunnel`, `access`, `service`)
- `--level <level>`: 심각도별 필터링 (`info`, `warn`, `error`, `debug`)
- `--since <duration>`: 시간 범위 지정 (`1h`, `30m`, `1d`, 또는 ISO 날짜)
- `--json`: JSON 라인 형식으로 출력

```bash
# 지난 1시간의 모든 로그
brewnet logs --all --since 1h

# 에러 로그만 표시
brewnet logs --all --level error

# 터널 관련 로그만 표시
brewnet logs --source tunnel

# 특정 서비스의 경고 로그를 JSON으로 출력
brewnet logs gitea --source service --level warn --json
```

### 6.6 백업 및 복원

#### 백업 생성

```bash
brewnet backup
```

현재 프로젝트 디렉토리 전체를 `.tar.gz` 아카이브로 백업합니다. 서비스 설정, 데이터, SQLite 데이터베이스가 모두 포함됩니다.

**옵션:**
- `-p, --path <path>`: 백업할 프로젝트 경로 (기본값: 현재 디렉토리)
- `--backups-dir <dir>`: 백업 저장 디렉토리 (기본값: `~/.brewnet/backups/`)
- `--list`: 기존 백업 목록 표시

```bash
# 백업 생성
brewnet backup

# 기존 백업 목록 확인
brewnet backup --list
```

**출력 예시:**
```
✓ Backup created: backup-20260328-143022-a1b2c3

  Project:  my-server
  Archive:  /Users/user/.brewnet/backups/backup-20260328-143022-a1b2c3.tar.gz
  Size:     45.23 MB

  Restore with: brewnet restore backup-20260328-143022-a1b2c3
```

#### 백업 복원

```bash
brewnet restore <backup-id>
```

지정된 백업 ID의 아카이브에서 프로젝트를 복원합니다.

**옵션:**
- `-p, --path <path>`: 복원할 대상 경로 (기본값: 현재 디렉토리)
- `--backups-dir <dir>`: 백업 저장 디렉토리
- `--force`: 확인 프롬프트 건너뛰기

```bash
# 백업 복원 (확인 프롬프트 표시)
brewnet restore backup-20260328-143022-a1b2c3

# 확인 없이 즉시 복원
brewnet restore backup-20260328-143022-a1b2c3 --force
```

복원 후 `brewnet up`을 실행하여 복원된 설정으로 서비스를 시작합니다.

> 복원 시 디스크 공간이 충분한지 자동으로 확인됩니다. 공간이 부족하면 오류 메시지와 함께 필요 용량/가용 용량이 표시됩니다.

---

## 7. CLI 명령어 레퍼런스

### 전체 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `brewnet init` | 인터랙티브 설정 마법사 실행 (7단계) |
| `brewnet add <service>` | 서비스 추가 (예: jellyfin, nextcloud, postgresql) |
| `brewnet remove <service>` | 서비스 제거 |
| `brewnet up` | 모든 서비스 시작 (docker compose up) |
| `brewnet down` | 모든 서비스 중지 |
| `brewnet status` | 서비스 상태 확인 |
| `brewnet logs [service]` | 로그 확인 |
| `brewnet update` | 서비스 업데이트 |
| `brewnet backup` | 백업 생성 |
| `brewnet restore <backup-id>` | 백업에서 복원 |
| `brewnet export` | 설정 내보내기 |
| `brewnet deploy <path>` | 로컬 프로젝트 배포 |
| `brewnet create-app <name>` | 보일러플레이트에서 앱 생성 |
| `brewnet domain connect` | 도메인 연결 / Quick→Named 터널 전환 |
| `brewnet domain tunnel status` | 터널 상태 확인 |
| `brewnet domain tunnel restart` | cloudflared 컨테이너 재시작 |
| `brewnet list` | 설치된 서비스 목록 |
| `brewnet shutdown` | 프로젝트 종료 |
| `brewnet uninstall` | 완전 삭제 |

### 주요 명령어 상세

#### brewnet init

```bash
brewnet init [options]
```

| 옵션 | 설명 |
|------|------|
| `-c, --config <path>` | 사전 정의된 JSON 설정 파일 경로 |
| `--non-interactive` | 비대화형 모드 (--config 필수) |
| `--no-open` | 설정 완료 후 브라우저 자동 열기 비활성화 |

#### brewnet create-app

```bash
brewnet create-app <project-name> [options]
```

| 옵션 | 설명 |
|------|------|
| `--stack <STACK_ID>` | 보일러플레이트 스택 직접 지정 (프롬프트 건너뛰기) |
| `--database <DB_DRIVER>` | 데이터베이스 드라이버 (sqlite3, postgres, mysql) |

사용 예시:
```bash
brewnet create-app my-api                              # 인터랙티브 선택
brewnet create-app my-api --stack go-gin               # Go Gin 스택
brewnet create-app my-api --stack python-fastapi --database postgres  # FastAPI + PostgreSQL
brewnet create-app my-blog --stack nodejs-nextjs-full   # Next.js Full-Stack
```

#### brewnet deploy

```bash
brewnet deploy <path> [options]
```

| 옵션 | 설명 |
|------|------|
| `-n, --name <name>` | 앱 이름 (기본값: 디렉토리 이름) |
| `-p, --port <port>` | 컨테이너 포트 (기본값: 3000) |

#### brewnet domain connect

```bash
brewnet domain connect [app] [options]
```

| 옵션 | 설명 |
|------|------|
| `--domain <hostname>` | 외부 호스트명 (예: my-api.example.com) |
| `--force` | 기존 CNAME 레코드 충돌 시 덮어쓰기 |

사용 예시:
```bash
# Quick Tunnel → Named Tunnel 전환
brewnet domain connect

# 특정 앱에 도메인 연결
brewnet domain connect my-api --domain my-api.example.com

# 기존 CNAME 충돌 시 강제 덮어쓰기
brewnet domain connect my-api --domain my-api.example.com --force
```

#### brewnet logs

```bash
brewnet logs [service] [options]
```

| 옵션 | 설명 |
|------|------|
| `-f, --follow` | 실시간 로그 스트리밍 |
| `-n, --tail <lines>` | 마지막 N줄 표시 |
| `-p, --path <path>` | 프로젝트 경로 |
| `--all` | 통합 로그 표시 |
| `--source <type>` | 소스 필터 (cli/tunnel/access/service) |
| `--level <level>` | 심각도 필터 (info/warn/error/debug) |
| `--since <duration>` | 시간 범위 (1h, 30m, 1d, ISO 날짜) |
| `--json` | JSON 라인 형식 출력 |

#### brewnet remove

```bash
brewnet remove <service> [options]
```

| 옵션 | 설명 |
|------|------|
| `--purge` | 관련 볼륨과 설정 데이터도 함께 삭제 |
| `--force` | 확인 프롬프트 건너뛰기 |
| `-p, --path <path>` | 프로젝트 경로 |

#### brewnet status

```bash
brewnet status [options]
```

| 옵션 | 설명 |
|------|------|
| `-p, --path <path>` | 프로젝트 경로 |
| `--json` | JSON 형식 출력 |

#### brewnet backup

```bash
brewnet backup [options]
```

| 옵션 | 설명 |
|------|------|
| `-p, --path <path>` | 백업할 프로젝트 경로 |
| `--backups-dir <dir>` | 백업 저장 디렉토리 |
| `--list` | 기존 백업 목록 표시 |

#### brewnet restore

```bash
brewnet restore <backup-id> [options]
```

| 옵션 | 설명 |
|------|------|
| `-p, --path <path>` | 복원 대상 경로 |
| `--backups-dir <dir>` | 백업 저장 디렉토리 |
| `--force` | 확인 프롬프트 건너뛰기 |

#### brewnet uninstall

```bash
brewnet uninstall [options]
```

| 옵션 | 설명 |
|------|------|
| `--dry-run` | 삭제 대상만 표시 (실제 변경 없음) |
| `--keep-data` | Docker 볼륨 보존 (데이터 유지) |
| `--keep-config` | 프로젝트 디렉토리 보존 (컨테이너만 중지) |
| `--force` | 확인 프롬프트 건너뛰기 |

---

## 8. 문제 해결 (FAQ)

### Q: `brewnet init` 실행 시 Docker가 설치되어 있지 않다고 나옵니다

**A:** Brewnet은 Docker가 없으면 자동으로 설치를 시도합니다. 자동 설치가 실패하는 경우 수동으로 설치하세요.

- **macOS**: [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) 설치
- **Ubuntu/Debian**:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```
  설치 후 로그아웃/로그인하여 docker 그룹 적용

### Q: 포트가 이미 사용 중이라고 나옵니다 (BN002)

**A:** 다른 프로그램이 해당 포트를 사용하고 있습니다.

```bash
# macOS/Linux에서 포트 사용 프로세스 확인
lsof -i :80
lsof -i :8088

# 해당 프로세스를 종료하거나, Brewnet 설정에서 다른 포트 사용
```

주로 충돌하는 서비스: Apache, Nginx, 다른 Docker 컨테이너

### Q: 관리자 대시보드에 접속이 안 됩니다

**A:** 다음을 순서대로 확인하세요.

1. 서비스가 실행 중인지 확인:
   ```bash
   brewnet status
   ```
2. 포트 8088이 열려 있는지 확인:
   ```bash
   curl http://localhost:8088
   ```
3. Docker 컨테이너 상태 확인:
   ```bash
   docker ps -a | grep brewnet
   ```
4. 서비스 재시작:
   ```bash
   brewnet down && brewnet up
   ```

### Q: Quick Tunnel URL이 변경되었습니다

**A:** Quick Tunnel의 URL은 임시이며, 서버를 재시작하면 변경됩니다. 이는 정상적인 동작입니다. 영구 URL이 필요하다면 Named Tunnel로 전환하세요.

```bash
brewnet domain connect
```

### Q: Named Tunnel 연결 후에도 도메인으로 접근이 안 됩니다

**A:** 다음을 확인하세요.

1. **DNS 전파 대기**: DNS 레코드가 전파되기까지 최대 수 분이 걸릴 수 있습니다.
   ```bash
   dig my-app.example.com CNAME
   ```
2. **Cloudflare 도메인 상태**: 도메인이 Active 상태인지 확인 (Pending이면 네임서버 전파 대기 중)
3. **터널 상태 확인**:
   ```bash
   brewnet domain tunnel status
   ```
4. **cloudflared 컨테이너 재시작**:
   ```bash
   brewnet domain tunnel restart
   ```

### Q: Nextcloud에 접속하면 "Access through untrusted domain" 오류가 나옵니다

**A:** Nextcloud의 trusted domains 설정에 현재 접속 URL이 등록되어 있지 않은 경우 발생합니다. Brewnet은 자동으로 `*.trycloudflare.com`을 trusted domain에 추가하지만, 커스텀 도메인을 사용하는 경우 추가 설정이 필요할 수 있습니다.

### Q: Jellyfin 초기 설정 화면이 나오지 않습니다

**A:** Jellyfin의 초기 설정 URL은 반드시 다음 형식을 사용해야 합니다.

```
http://<host>:8096/web/#/wizard/start
```

`/web/#/home` 경로를 사용하면 초기 설정 마법사가 나타나지 않습니다.

### Q: 앱 배포가 실패합니다 (BN006)

**A:** 배포 실패의 일반적인 원인:

1. **Dockerfile 오류**: 앱 디렉토리에 유효한 Dockerfile이 있는지 확인
2. **빌드 의존성 문제**: Docker 빌드 로그에서 구체적인 오류 확인
   ```bash
   brewnet logs <app-name>
   ```
3. **Health Check 실패**: 앱이 시작은 되지만 `/health` 엔드포인트가 응답하지 않는 경우
4. **포트 불일치**: 앱이 리스닝하는 포트와 설정된 포트가 다른 경우

### Q: 디스크 공간이 부족합니다

**A:** Docker 이미지와 컨테이너가 디스크 공간을 많이 차지할 수 있습니다.

```bash
# Docker 디스크 사용량 확인
docker system df

# 사용하지 않는 이미지 정리 (주의: 필요한 이미지까지 삭제될 수 있음)
docker image prune
```

> `docker system prune`은 모든 미사용 리소스를 삭제하므로 주의해서 사용하세요. 중요 데이터가 있는 볼륨은 절대 삭제하지 마세요.

### Q: Gitea에서 clone URL이 잘못 표시됩니다

**A:** Traefik strip-prefix 뒤의 Gitea는 `X-Forwarded-Host` 기반으로 subpath가 없는 URL을 반환할 수 있습니다 (예: `/git` 경로 누락). Brewnet 내부에서는 `authedCloneUrl()`이 올바른 URL을 자동 생성하므로, Gitea API에서 반환하는 `clone_url`을 직접 사용하지 마세요.

### 에러 코드 참조

| 코드 | HTTP | 설명 |
|------|------|------|
| BN001 | 503 | Docker 데몬이 실행되지 않음 |
| BN002 | 409 | 포트가 이미 사용 중 |
| BN003 | 500 | SSL 인증서 발급 실패 |
| BN004 | 401 | 유효하지 않은 라이선스 키 |
| BN005 | 429 | 요청 속도 제한 초과 |
| BN006 | 500 | 빌드 실패 |
| BN007 | 400 | 유효하지 않은 Git 레포지토리 |
| BN008 | 404 | 리소스를 찾을 수 없음 |
| BN009 | 500 | 데이터베이스 오류 |
| BN010 | 403 | Pro 플랜이 필요한 기능 |

---

## 9. 완전 삭제 (Uninstall)

Brewnet과 관련된 모든 리소스를 제거하려면 `brewnet uninstall` 명령어를 사용합니다.

### 기본 삭제

```bash
brewnet uninstall
```

이 명령어는 다음 작업을 수행합니다.

1. **확인 프롬프트**: 삭제 대상 목록을 표시하고 확인을 요청합니다
2. **Docker 컨테이너 중지 및 제거**: 모든 Brewnet 관련 컨테이너를 중지하고 제거합니다
3. **Docker 볼륨 제거**: 데이터베이스, 파일 서버 등의 데이터 볼륨을 삭제합니다
4. **Docker 네트워크 제거**: `brewnet`, `brewnet-internal` 네트워크를 삭제합니다
5. **프로젝트 디렉토리 제거**: 프로젝트 파일, 설정, docker-compose.yml을 삭제합니다
6. **Cloudflare 리소스 정리** (Named Tunnel인 경우):
   - DNS CNAME 레코드 자동 삭제
   - Cloudflare Tunnel 자동 삭제
   - cloudflared 시스템 서비스 제거 (macOS: LaunchDaemon, Linux: systemd)
7. **~/.brewnet 메타데이터 정리**: 전역 설정 및 상태 데이터 삭제

### 삭제 옵션

```bash
# 실제 변경 없이 삭제 대상만 미리 확인
brewnet uninstall --dry-run

# Docker 볼륨(데이터) 보존 — 재설치 시 데이터 복구 가능
brewnet uninstall --keep-data

# 프로젝트 디렉토리 보존 — 컨테이너만 중지/제거
brewnet uninstall --keep-config

# 확인 프롬프트 없이 즉시 삭제
brewnet uninstall --force
```

### 옵션 조합 예시

```bash
# 데이터와 설정 모두 보존하면서 컨테이너만 제거
brewnet uninstall --keep-data --keep-config

# 삭제 대상 미리 확인 (안전)
brewnet uninstall --dry-run

# 스크립트에서 비대화형 삭제
brewnet uninstall --force
```

### Cloudflare 리소스 자동 정리

Named Tunnel을 사용 중인 경우, `brewnet uninstall`이 자동으로 Cloudflare 리소스를 정리합니다.

**자동 정리 대상:**
- 앱에 연결된 DNS CNAME 레코드
- 내장 서비스(Gitea, Nextcloud, Jellyfin 등)의 DNS CNAME 레코드
- Apex 도메인 연결의 www DNS 레코드
- Cloudflare Tunnel 자체

**cloudflared 서비스 제거:**
- **macOS**: `/Library/LaunchDaemons/com.cloudflare.cloudflared.plist` 제거 (sudo 필요)
- **Linux**: `cloudflared` systemd 서비스 정지, 비활성화, 유닛 파일 제거 (sudo 필요)

**자동 정리가 실패하는 경우:**

API Token이 만료되었거나 삭제된 경우 자동 정리가 불가능합니다. 이 경우 수동으로 정리해야 합니다.

1. **터널 삭제**:
   - [Cloudflare Zero Trust 대시보드](https://one.dash.cloudflare.com/) 접속
   - Networks → Tunnels → 해당 터널 선택 → Delete

2. **DNS 레코드 삭제**:
   - [Cloudflare 대시보드](https://dash.cloudflare.com/) 접속
   - 도메인 선택 → DNS → Records
   - `*.cfargotunnel.com`을 가리키는 CNAME 레코드 삭제

### 재설치

삭제 후 다시 설치하려면:

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

또는:

```bash
npm install -g @brewnet/cli
brewnet init
```

---

## 부록: 데이터 디렉토리 구조

Brewnet은 `~/.brewnet/` 디렉토리에 전역 메타데이터를 저장합니다.

```
~/.brewnet/
├── config.json           # 전역 설정 (마지막 사용 프로젝트 등)
├── docker-compose.yml    # 생성된 Docker Compose 파일
├── services/             # 서비스별 설정 파일
├── storage/              # 파일 저장 데이터
├── backups/              # 백업 아카이브 (.tar.gz)
├── logs/                 # 애플리케이션 로그
└── db/                   # SQLite 데이터베이스
```

프로젝트 디렉토리는 `brewnet init` 시 지정한 경로에 생성되며, 각 프로젝트는 독립적인 `docker-compose.yml`, `.env`, 서비스 설정 파일을 포함합니다.

---

## 부록: 지원 서비스 목록

| 서비스 | Docker 이미지 | 카테고리 | 기본 포트 | 서브도메인 |
|--------|-------------|---------|---------|----------|
| Traefik | `traefik:v2.11` | Web Server | 80, 443, 8080 | `traefik` |
| Nginx | `nginx:1.25-alpine` | Web Server | 80, 443 | - |
| Caddy | `caddy:2-alpine` | Web Server | 80, 443 | - |
| Gitea | `gitea/gitea:latest` | Git Server | 3000, 3022 | `git` |
| FileBrowser | `filebrowser/filebrowser:latest` | File | 80 | `files` |
| Nextcloud | `nextcloud:29-apache` | File | 80 | `cloud` |
| MinIO | `minio/minio:latest` | File | 9000 | `minio` |
| Jellyfin | `jellyfin/jellyfin:latest` | Media | 8096 | `jellyfin` |
| PostgreSQL | `postgres:18.3-alpine` | Database | 5432 | - |
| MySQL | `mysql:8.4` | Database | 3306 | - |
| pgAdmin | `dpage/pgadmin4:latest` | Admin | 5050 | `pgadmin` |
| OpenSSH Server | `linuxserver/openssh-server:latest` | SSH | 2222 | - |
| Cloudflare Tunnel | `cloudflare/cloudflared:latest` | Tunnel | - | - |

---

*Brewnet은 Apache 2.0 라이선스 하에 공개된 오픈소스 프로젝트입니다.*
*GitHub: [https://github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet)*
