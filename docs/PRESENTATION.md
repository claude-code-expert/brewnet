# Brewnet Presentation

> 20-page presentation document
> Last updated: 2026-03-28

---

<!-- ====================================================================== -->
<!-- PAGE 1: 표지                                                            -->
<!-- ====================================================================== -->

<div align="center">

# Brewnet

### Your Home Server, Brewed Fresh

**셀프 호스팅 홈 서버 관리 플랫폼**

```
  ____                                _
 | __ ) _ __ _____      ___ __   ___| |_
 |  _ \| '__/ _ \ \ /\ / / '_ \ / _ \ __|
 | |_) | | |  __/\ V  V /| | | |  __/ |_
 |____/|_|  \___| \_/\_/ |_| |_|\___|\__|
```

**Version 1.0** | **Apache 2.0 License**

GitHub: [github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet)
Website: [brewnet.dev](https://brewnet.dev)

*CLI 하나로 Docker 기반 홈 서버를 3분 안에 구축하세요.*

</div>

---

<!-- ====================================================================== -->
<!-- PAGE 2: 문제 정의                                                       -->
<!-- ====================================================================== -->

## 문제 정의 -- 셀프 호스팅의 어려움

### 왜 홈 서버를 직접 운영하기 어려운가?

셀프 호스팅은 데이터 주권, 비용 절감, 프라이버시 보호 측면에서 매력적입니다.
하지만 실제로 시작하면 수많은 장벽에 부딪힙니다.

### Pain Points

| 문제 영역 | 구체적 어려움 |
|-----------|-------------|
| Docker 설정 | Compose 파일 수동 작성, 이미지 선택, 볼륨/네트워크 구성 |
| 네트워크 | 포트 포워딩, NAT Traversal, 방화벽 설정, DDNS |
| 보안 | TLS 인증서, 컨테이너 격리, 자격 증명 관리 |
| 도메인 연결 | DNS 레코드, 리버스 프록시, SSL 갱신 자동화 |
| 유지보수 | 이미지 업데이트, 백업/복원, 로그 모니터링 |

### 기존 솔루션의 한계

```
  기존 방식: 수동 Docker Compose
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  1. Docker 설치          ← 15분                      │
  │  2. docker-compose.yml 작성  ← 30분~1시간            │
  │  3. Traefik 설정 파일 작성   ← 30분                  │
  │  4. SSL 인증서 발급         ← 15분                   │
  │  5. 환경 변수 설정          ← 15분                   │
  │  6. 네트워크 분리 설정       ← 15분                  │
  │  7. 방화벽 / 포트포워딩      ← 30분                  │
  │  8. DNS 레코드 설정         ← 15분                   │
  │  9. 헬스 체크 / 디버깅       ← 30분~1시간            │
  │                                                      │
  │  총 소요 시간: 2~4시간 (경험자 기준)                  │
  │  초보자: 1~2일                                       │
  └──────────────────────────────────────────────────────┘
```

**Portainer** -- 설치 후에도 docker-compose를 직접 작성해야 하며, 터널/도메인 설정 미지원.
**CasaOS** -- 제한된 앱 생태계, 커스텀 앱 배포 불가, 개발자 워크플로우 부재.
**Coolify** -- 클라우드 지향 설계, 홈 서버 특화 기능(터널, 로컬 Git) 부족.

---

<!-- ====================================================================== -->
<!-- PAGE 3: 솔루션                                                          -->
<!-- ====================================================================== -->

## 솔루션 -- Brewnet이 해결하는 것

### 핵심 가치: 복잡한 인프라를 명령어 하나로

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   Before Brewnet              After Brewnet                 │
  │                                                             │
  │   Docker docs 숙지  ───┐                                    │
  │   Compose 파일 작성 ───┤                                    │
  │   Traefik 설정     ───┤     ┌────────────────────┐         │
  │   SSL 인증서 발급  ───┼────>│  npx brewnet init  │         │
  │   DNS 레코드 설정  ───┤     └────────┬───────────┘         │
  │   방화벽 구성      ───┤              │                      │
  │   터널 설정        ───┤        3분 후 완료                   │
  │   보안 강화        ───┘              │                      │
  │                               ┌──────┴──────┐              │
  │   2~4시간 소요                 │ 서버 가동중  │              │
  │                               └─────────────┘              │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

### Brewnet의 4가지 핵심 접근

**1. One-Command Install**
- `npx brewnet init` 하나로 전체 스택 구축
- Docker 미설치 시 자동 설치 (macOS: Homebrew, Linux: get.docker.com)
- 의존성 검증, 포트 충돌 감지, 디스크/RAM 체크 자동 수행

**2. Interactive Wizard**
- 8단계 대화형 설치 마법사
- Full Install(전체 스택) 또는 Partial Install(선택 컴포넌트) 지원
- 초보자도 질문에 답하는 것만으로 서버 완성

**3. Web Dashboard**
- React SPA 기반 어드민 패널 (`http://localhost:8088`)
- 서비스 상태 모니터링, 앱 관리, 실시간 로그, 배포 이력
- 앱별 도메인 연결/해제 UI

**4. Auto-Security**
- 컨테이너 `no-new-privileges` 정책 자동 적용
- 내부/외부 Docker 네트워크 분리 (brewnet / brewnet-internal)
- 자격 증명 자동 생성 + 파일 권한 `chmod 600` 적용
- Cloudflare Tunnel로 포트 노출 없는 외부 접속

---

<!-- ====================================================================== -->
<!-- PAGE 4: 핵심 기능 요약                                                   -->
<!-- ====================================================================== -->

## 핵심 기능 요약

### Brewnet이 제공하는 4가지 핵심 기능

```
  ┌─────────────────────┐    ┌─────────────────────┐
  │                     │    │                     │
  │  1. 대화형 설치      │    │  2. 웹 대시보드      │
  │     마법사           │    │                     │
  │                     │    │  서비스 모니터링     │
  │  8단계 위저드       │    │  실시간 로그         │
  │  Docker 자동 설치   │    │  앱 관리 UI         │
  │  컴포넌트 선택      │    │  배포 이력           │
  │  Full/Partial 모드  │    │  도메인 연결         │
  │                     │    │                     │
  └─────────────────────┘    └─────────────────────┘

  ┌─────────────────────┐    ┌─────────────────────┐
  │                     │    │                     │
  │  3. Cloudflare      │    │  4. 보일러플레이트    │
  │     Tunnel 자동화    │    │     앱 생성          │
  │                     │    │                     │
  │  Quick Tunnel       │    │  16개 스택 지원      │
  │  Named Tunnel       │    │  6개 언어            │
  │  DNS 자동 설정      │    │  Gitea 저장소 연동   │
  │  Zero-Trust 보안    │    │  Docker + 라우팅     │
  │                     │    │                     │
  └─────────────────────┘    └─────────────────────┘
```

### 기능 상세

| 기능 | 설명 | 핵심 가치 |
|------|------|----------|
| **대화형 설치 마법사** | 8단계 위저드로 서버 컴포넌트, 개발 스택, 도메인을 선택하면 docker-compose.yml 자동 생성 | 전문 지식 없이 서버 구축 |
| **웹 대시보드** | React SPA 기반 관리 패널. 서비스 상태, 앱 배포, 로그, 도메인을 브라우저에서 관리 | CLI 없이도 서버 운영 |
| **Cloudflare Tunnel** | API Token 하나로 터널 생성, DNS 레코드, 인그레스 규칙 자동 설정. 포트 포워딩 불필요 | 공인 IP 없이 외부 공개 |
| **보일러플레이트 생성** | `brewnet create-app`으로 프로젝트 생성. Gitea 저장소, Docker 서비스, Traefik 라우팅 한 번에 구성 | 코드 작성 즉시 배포 |

---

<!-- ====================================================================== -->
<!-- PAGE 5: 아키텍처 개요                                                    -->
<!-- ====================================================================== -->

## 아키텍처 개요

### 시스템 전체 구조

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                        Cloudflare Edge                          │
  │                                                                 │
  │   사용자 요청 ──> Cloudflare DNS ──> CNAME ──> Tunnel Endpoint  │
  │                                                                 │
  └───────────────────────────┬──────────────────────────────────────┘
                              │
                    encrypted tunnel (QUIC)
                              │
  ┌───────────────────────────┴──────────────────────────────────────┐
  │                       Home Server                                │
  │                                                                  │
  │  ┌──────────────┐                                                │
  │  │  cloudflared  │  Tunnel connector daemon                      │
  │  └──────┬───────┘                                                │
  │         │                                                        │
  │  ┌──────┴───────┐                                                │
  │  │   Traefik    │  Reverse proxy + TLS termination               │
  │  │  (port 80)   │  Auto-discovery via Docker labels              │
  │  └──┬───┬───┬───┘                                                │
  │     │   │   │                                                    │
  │  ┌──┴┐ ┌┴──┐ ┌┴──────┐  ┌─────────┐  ┌──────────┐              │
  │  │App│ │Git│ │  File  │  │   DB    │  │  Media   │              │
  │  │   │ │ea │ │ Server │  │ Server  │  │  Server  │              │
  │  │   │ │   │ │NextCloud│ │PostgreSQL│ │ Jellyfin │              │
  │  └───┘ └───┘ └────────┘  │ + Redis │  └──────────┘              │
  │                           └─────────┘                            │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────┐        │
  │  │              Docker Network (brewnet)                 │        │
  │  │  External-facing services: Traefik, cloudflared       │        │
  │  └──────────────────────────────────────────────────────┘        │
  │  ┌──────────────────────────────────────────────────────┐        │
  │  │          Docker Network (brewnet-internal)            │        │
  │  │  Internal-only: DB, Redis, backend services           │        │
  │  └──────────────────────────────────────────────────────┘        │
  │                                                                  │
  │  ┌──────────────┐                                                │
  │  │ Admin Panel   │  React SPA (localhost:8088)                   │
  │  │ (brewnet      │  서비스 상태 / 앱 관리 / 로그 / 도메인        │
  │  │  admin)       │                                               │
  │  └──────────────┘                                                │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

### 컴포넌트 설명

| 컴포넌트 | 역할 | 기본 설정 |
|----------|------|----------|
| **Traefik** | 리버스 프록시, TLS termination, Docker 라벨 기반 자동 라우팅 | 포트 80/443 |
| **cloudflared** | Cloudflare Tunnel 커넥터, 암호화된 QUIC 터널 유지 | Outbound only |
| **Gitea** | 셀프 호스팅 Git 서버, 웹훅 기반 배포 트리거 | `/git` path |
| **App Server** | 사용자 앱 (보일러플레이트 생성 또는 직접 배포) | `/apps/{name}` |
| **DB Server** | PostgreSQL/MySQL + Redis/Valkey 캐시 | Internal only |
| **File Server** | Nextcloud/MinIO 파일 저장소 | `/files` path |
| **Media Server** | Jellyfin 미디어 스트리밍 | `/media` path |
| **Admin Panel** | React SPA 관리 대시보드 | localhost:8088 |

---

<!-- ====================================================================== -->
<!-- PAGE 6: 기술 스택                                                        -->
<!-- ====================================================================== -->

## 기술 스택

### Monorepo 구조 (pnpm workspace)

```
  brewnet/
  ├── packages/
  │   ├── cli/           # CLI 애플리케이션
  │   ├── dashboard/     # Web Dashboard (Pro)
  │   └── shared/        # 공유 타입 & 유틸리티
  ├── docker/            # Docker 관련 설정
  ├── tests/             # 테스트 (unit / integration / e2e)
  └── spec/              # 기획 문서
```

### 계층별 기술 스택

| 계층 | 기술 | 용도 |
|------|------|------|
| **CLI** | TypeScript 5, Node.js 20+, Commander.js | 명령어 파싱 및 실행 |
| | @inquirer/prompts | 대화형 위저드 UI |
| | execa, dockerode | Docker 제어 |
| | better-sqlite3 | 설정/상태 저장 |
| | simple-git | Git 저장소 관리 |
| **Dashboard** | Next.js 14 (App Router) | 웹 프레임워크 |
| | Tailwind CSS + shadcn/ui | UI 컴포넌트 |
| | Zustand | 상태 관리 |
| | TanStack Query | 서버 상태 동기화 |
| | React Hook Form + Zod | 폼 검증 |
| | xterm.js | 웹 터미널 |
| | Monaco Editor | 코드 에디터 |
| **Shared** | TypeScript types | 패키지 간 타입 공유 |
| | Zod schemas | 런타임 데이터 검증 |
| **인프라** | Docker Compose | 컨테이너 오케스트레이션 |
| | Traefik | 리버스 프록시 + Auto TLS |
| | Cloudflare Tunnel | 외부 접속 터널 |
| **서비스** | Gitea | 셀프 호스팅 Git |
| | PostgreSQL / MySQL / MariaDB | 관계형 데이터베이스 |
| | Redis / Valkey / KeyDB | 캐시 레이어 |
| | Nextcloud / MinIO | 파일 저장소 |
| | Jellyfin | 미디어 스트리밍 |
| **설정 DB** | SQLite | 프로젝트 메타데이터 |

### Core Modules (10개)

```
  ┌────────────────────────────────────────────────────────┐
  │                    CLI Core Modules                    │
  │                                                        │
  │  docker-manager ──── 컨테이너 라이프사이클, Compose 생성  │
  │  runtime-manager ─── 언어 런타임 (Node, Python, Go...) │
  │  deploy-manager ──── Git 기반 배포 파이프라인            │
  │  ssl-manager ─────── Let's Encrypt / Certbot 자동화    │
  │  nginx-manager ───── 리버스 프록시 가상 호스트           │
  │  acl-manager ─────── 접근 제어, 사용자 권한, 방화벽      │
  │  git-server ──────── Gitea 통합, 저장소 관리            │
  │  file-manager ────── Nextcloud, MinIO, SFTP            │
  │  db-manager ──────── PostgreSQL, MySQL, Redis 관리      │
  │  sso-auth ────────── 싱글 사인온 인증                   │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

---

<!-- ====================================================================== -->
<!-- PAGE 7: 설치 과정                                                       -->
<!-- ====================================================================== -->

## 설치 과정 -- 3분 만에 서버 구축

### 설치 명령어

```bash
# 방법 A -- curl (권장)
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash

# 방법 B -- npm
npm install -g @brewnet/cli

# 설치 시작
brewnet init
```

### 설치 흐름 다이어그램

```
  npx brewnet init
       │
       ▼
  ┌──────────────────────────┐
  │ Step 0: 시스템 체크       │  OS, Docker, 포트 80/443,
  │                          │  디스크 20GB+, RAM 2GB+
  └────────────┬─────────────┘
               │  Docker 없음? → 자동 설치
               ▼
  ┌──────────────────────────┐
  │ Step 1: 프로젝트 설정     │  이름, 경로,
  │                          │  Full / Partial 선택
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 2: 서버 컴포넌트     │  웹 서버, 파일 서버,
  │         + 어드민 계정     │  DB, 미디어 선택
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 3: 개발 스택         │  언어 + 프레임워크
  │  (App Server 활성화 시)   │  Python/Node/Go/Rust/Java/Kotlin
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 4: 도메인 & 네트워크 │  로컬(LAN) 또는
  │                          │  Cloudflare Tunnel
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 5: 검토 & 확인       │  선택 사항 최종 확인
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 6: 자동 구성         │  Compose 생성 → 이미지 Pull
  │                          │  → 서비스 시작 → 헬스 체크
  └────────────┬─────────────┘
               ▼
  ┌──────────────────────────┐
  │ Step 7: 완료!             │  접속 URL 출력
  │                          │  계정 정보, 터널 상태
  └──────────────────────────┘
```

### 시간 비교

```
  수동 설치 (경험자)              Brewnet
  ━━━━━━━━━━━━━━━━━━━━━━━━━    ━━━━━━━━━━━━━━━━
  Docker 설치        15분       ┐
  Compose 작성    30~60분       │
  Traefik 설정       30분       │   brewnet init
  SSL 인증서 발급    15분       ├── 실행 후 3분
  환경 변수 설정     15분       │
  네트워크 분리      15분       │
  방화벽/포트포워딩  30분       │
  DNS 레코드 설정    15분       │
  디버깅          30~60분       ┘
  ─────────────────────────    ─────────────────
  총합: 2~4시간                 총합: 약 3분
```

---

<!-- ====================================================================== -->
<!-- PAGE 8: 대화형 설치 마법사                                               -->
<!-- ====================================================================== -->

## 대화형 설치 마법사

### 단계별 위저드 상세

#### Step 0 -- 시스템 체크

```
  ┌─────────────────────────────────────────────────┐
  │  Brewnet System Check                           │
  │                                                 │
  │  [PASS] OS: macOS 14.2 (Darwin arm64)           │
  │  [PASS] Docker: v27.1.1                         │
  │  [PASS] Port 80: available                      │
  │  [PASS] Port 443: available                     │
  │  [PASS] Disk: 234GB free (min 20GB)             │
  │  [PASS] RAM: 16GB (min 2GB)                     │
  │                                                 │
  │  All checks passed. Ready to proceed.           │
  └─────────────────────────────────────────────────┘
```

#### Step 1 -- 프로젝트 설정

```
  ┌─────────────────────────────────────────────────┐
  │  Project Setup                                  │
  │                                                 │
  │  ? Project name: my-homeserver                  │
  │  ? Project path: ~/brewnet/my-homeserver        │
  │                                                 │
  │  ? Installation type:                           │
  │    > Full Install (모든 서비스)                   │
  │      Partial Install (선택적 설치)               │
  └─────────────────────────────────────────────────┘
```

#### Step 2 -- 서버 컴포넌트 + 어드민 계정

```
  ┌─────────────────────────────────────────────────┐
  │  Server Components                              │
  │                                                 │
  │  ? Admin username: admin                        │
  │  ? Admin password: (auto-generated 20 chars)    │
  │                                                 │
  │  ? Web Server:                                  │
  │    > Traefik (권장)                              │
  │      Nginx                                      │
  │      Caddy                                      │
  │                                                 │
  │  ? Enable File Server?                          │
  │    > Nextcloud                                  │
  │      MinIO                                      │
  │      Skip                                       │
  │                                                 │
  │  ? Database:                                    │
  │    > PostgreSQL + Redis (권장)                   │
  │      MySQL + Redis                              │
  │      MariaDB + Valkey                           │
  │      Skip                                       │
  │                                                 │
  │  ? Enable Media Server (Jellyfin)? Yes / No     │
  └─────────────────────────────────────────────────┘
```

#### Step 3 -- 개발 스택

```
  ┌─────────────────────────────────────────────────┐
  │  Development Stack                              │
  │                                                 │
  │  ? Backend language: (복수 선택 가능)            │
  │    [x] Node.js                                  │
  │    [ ] Python                                   │
  │    [x] Go                                       │
  │    [ ] Rust                                     │
  │    [ ] Java                                     │
  │    [ ] Kotlin                                   │
  │                                                 │
  │  ? Node.js framework:                           │
  │    > Next.js (App Router)                       │
  │      Express                                    │
  │      Fastify                                    │
  │                                                 │
  │  ? Go framework:                                │
  │    > Gin                                        │
  │      Echo                                       │
  │      Fiber                                      │
  └─────────────────────────────────────────────────┘
```

### Full Install vs Partial Install

| 항목 | Full Install | Partial Install |
|------|-------------|----------------|
| 웹 서버 (Traefik) | 자동 포함 | 자동 포함 |
| Git 서버 (Gitea) | 자동 포함 | 선택 |
| 파일 서버 | Nextcloud 기본 | 선택 |
| 데이터베이스 | PostgreSQL + Redis | 선택 |
| 미디어 서버 | Jellyfin 포함 | 선택 |
| 앱 서버 | 포함 | 선택 |
| Cloudflare Tunnel | 활성화 | 선택 |
| 소요 시간 | ~3분 | ~2분 |

---

<!-- ====================================================================== -->
<!-- PAGE 9: 웹 대시보드                                                      -->
<!-- ====================================================================== -->

## 웹 대시보드

### Admin Panel 개요

`brewnet admin` 명령으로 `http://localhost:8088`에서 접근 가능한 React SPA 대시보드입니다.

### 대시보드 레이아웃

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Brewnet Admin Panel                    [Dashboard] [Apps]  │
  ├──────────────────────────────────────────────────────────────┤
  │                                                              │
  │  Dashboard Tab                                               │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ Service Status                                        │  │
  │  │                                                        │  │
  │  │ NAME          STATUS    PORT    EXTERNAL URL           │  │
  │  │ ─────────── ────────── ────── ─────────────────────── │  │
  │  │ traefik       running   80     -                       │  │
  │  │ gitea         running   3000   https://git.example.com │  │
  │  │ nextcloud     running   8080   https://files.exmpl.com │  │
  │  │ postgresql    running   5432   (internal)              │  │
  │  │ redis         running   6379   (internal)              │  │
  │  │ my-app        running   3001   https://app.example.com │  │
  │  │ jellyfin      running   8096   https://media.exmpl.com│  │
  │  │ cloudflared   running   -      tunnel active           │  │
  │  │                                                        │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### Apps Tab -- App Detail Modal

```
  ┌──────────────────────────────────────────────────────────────┐
  │  App: my-express-app                           [x] Close    │
  ├──────────────────────────────────────────────────────────────┤
  │  [Overview]  [Deploy]  [Logs]  [Domain]                     │
  │                                                              │
  │  Overview Tab:                                               │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ Status:       running                                  │  │
  │  │ Container:    brewnet-my-express-app                    │  │
  │  │ Port:         3001                                     │  │
  │  │ Internal URL: http://localhost:3001                     │  │
  │  │ External URL: https://app.example.com                  │  │
  │  │ Stack:        Node.js + Express                        │  │
  │  │ Created:      2026-03-15 14:30                         │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Deploy Tab:                                                 │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ [Deploy Now]                                           │  │
  │  │                                                        │  │
  │  │ Deployment History                                     │  │
  │  │ #3  2026-03-28 10:15  success  commit: feat: add auth  │  │
  │  │ #2  2026-03-27 16:42  success  commit: fix: db conn    │  │
  │  │ #1  2026-03-15 14:30  success  commit: initial setup   │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Domain Tab:                                                 │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ Tunnel Mode:  Named Tunnel                             │  │
  │  │ Domain:       app.example.com                          │  │
  │  │ Status:       Connected                                │  │
  │  │                                                        │  │
  │  │ [Disconnect]  [Switch to Quick Tunnel]                 │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### 대시보드 핵심 기능

| 기능 | 설명 |
|------|------|
| **서비스 모니터링** | 전체 컨테이너 상태, 포트, External URL을 실시간 테이블로 표시 |
| **앱 관리** | 앱별 상세 모달 (Overview / Deploy / Logs / Domain 4개 탭) |
| **실시간 로그** | 컨테이너 로그 실시간 스트리밍 (xterm.js 기반 웹 터미널) |
| **원클릭 배포** | Deploy 버튼으로 최신 코드 빌드 및 배포 |
| **도메인 관리** | Quick Tunnel / Named Tunnel 전환, 앱별 서브도메인 연결/해제 |
| **배포 이력** | 커밋 메시지, 시간, 성공/실패 상태를 포함한 배포 히스토리 |

---

<!-- ====================================================================== -->
<!-- PAGE 10: 보일러플레이트 앱 생성                                           -->
<!-- ====================================================================== -->

## 보일러플레이트 앱 생성

### 16개 지원 스택

```bash
brewnet create-app my-app              # 대화형 스택 선택
brewnet create-app my-app --stack go-gin --database postgres  # 직접 지정
```

| 언어 | 프레임워크 | Stack ID | 특징 |
|------|-----------|----------|------|
| **Node.js** | Express | `node-express` | 가장 보편적인 Node.js 백엔드 |
| | Fastify | `node-fastify` | 고성능 HTTP 프레임워크 |
| | Next.js (App Router) | `node-nextjs-app` | React 풀스택 (App Router) |
| | Next.js (Pages) | `node-nextjs-pages` | React 풀스택 (Pages Router) |
| **Go** | Gin | `go-gin` | 가장 인기 있는 Go 프레임워크 |
| | Echo | `go-echo` | 미니멀 Go 프레임워크 |
| | Fiber | `go-fiber` | Express 스타일 Go 프레임워크 |
| **Rust** | Actix-web | `rust-actix` | 고성능 Rust 프레임워크 |
| | Axum | `rust-axum` | Tokio 기반 모던 Rust |
| **Python** | FastAPI | `python-fastapi` | 비동기 Python + 자동 문서화 |
| | Flask | `python-flask` | 경량 Python 웹 프레임워크 |
| **Kotlin** | Spring Boot | `kotlin-spring` | JVM + Kotlin 조합 |
| **Java** | Spring Boot | `java-spring` | 엔터프라이즈 표준 |

### 생성부터 배포까지의 흐름

```
  brewnet create-app my-api --stack go-gin --database postgres
       │
       ▼
  ┌──────────────────────────────────────────────────────┐
  │  1. 프로젝트 스캐폴딩                                │
  │     - 소스코드, Dockerfile, docker-compose.yml 생성   │
  │     - health check 엔드포인트 자동 포함              │
  │     - .gitignore, README.md 포함                     │
  └────────────────┬─────────────────────────────────────┘
                   ▼
  ┌──────────────────────────────────────────────────────┐
  │  2. Gitea 저장소 생성                                │
  │     - 로컬 Gitea에 저장소 자동 생성                  │
  │     - 초기 커밋 + 푸시                               │
  │     - 웹훅 자동 등록 (push → 자동 배포)              │
  └────────────────┬─────────────────────────────────────┘
                   ▼
  ┌──────────────────────────────────────────────────────┐
  │  3. Docker 서비스 등록                               │
  │     - docker-compose.yml에 서비스 추가               │
  │     - Traefik 라우팅 라벨 자동 설정                  │
  │     - Docker 이미지 빌드 + 컨테이너 시작             │
  └────────────────┬─────────────────────────────────────┘
                   ▼
  ┌──────────────────────────────────────────────────────┐
  │  4. 접속 확인                                        │
  │     - Health check 통과 대기                         │
  │     - Internal URL: http://localhost/apps/my-api     │
  │     - External URL: https://my-api.example.com       │
  └──────────────────────────────────────────────────────┘

  전체 소요 시간: 약 30초
```

### 생성되는 파일 구조 (예: Go + Gin)

```
  my-api/
  ├── main.go              # 메인 소스코드 (health + sample API)
  ├── go.mod               # Go 모듈 정의
  ├── go.sum               # 의존성 체크섬
  ├── Dockerfile           # Multi-stage Docker 빌드
  ├── docker-compose.yml   # 서비스 정의 (Traefik 라벨 포함)
  ├── .gitignore           # Go 기본 gitignore
  └── README.md            # 프로젝트 설명
```

---

<!-- ====================================================================== -->
<!-- PAGE 11: Git 기반 배포 파이프라인                                         -->
<!-- ====================================================================== -->

## Git 기반 배포 파이프라인

### 배포 흐름

```
  개발자 워크스테이션                    홈 서버
  ┌──────────────────┐            ┌──────────────────────────────┐
  │                  │            │                              │
  │  코드 수정       │            │  Gitea (셀프 호스팅 Git)     │
  │       │          │  git push  │       │                      │
  │       ▼          │ ─────────> │       ▼                      │
  │  git commit      │            │  Webhook 트리거              │
  │  git push origin │            │       │                      │
  │                  │            │       ▼                      │
  └──────────────────┘            │  Docker Build               │
                                  │  (multi-stage)              │
                                  │       │                      │
                                  │       ▼                      │
                                  │  Health Check               │
                                  │  (GET /health 200 OK)       │
                                  │       │                      │
                                  │       ▼                      │
                                  │  컨테이너 교체               │
                                  │  (zero-downtime)            │
                                  │       │                      │
                                  │       ▼                      │
                                  │  LIVE!                       │
                                  │  https://app.example.com    │
                                  │                              │
                                  └──────────────────────────────┘
```

### 배포 과정 상세

```
  Code Push ──> Gitea ──> Webhook ──> Docker Build ──> Health Check ──> Live
       │           │          │            │                │            │
       │           │          │            │                │            │
   git push    저장소에     POST 요청    이미지 빌드     GET /health   트래픽
   to origin   코드 저장   deploy API   + 컨테이너 생성   200 OK 확인  전환
```

### 배포 관리 기능

| 기능 | 설명 | 명령어 |
|------|------|--------|
| **자동 배포** | git push 시 웹훅을 통해 자동 빌드 & 배포 | (자동) |
| **수동 배포** | CLI 또는 대시보드에서 수동 트리거 | `brewnet deploy <path>` |
| **배포 이력** | 커밋 해시, 시간, 성공/실패 기록 | 대시보드 Deploy 탭 |
| **롤백** | 이전 배포 버전으로 즉시 복원 | `brewnet restore <id>` |
| **로그 확인** | 빌드/런타임 로그 실시간 스트리밍 | `brewnet logs <service>` |

### 지원하는 배포 방식

```
  ┌─────────────────────────────────────────────────────┐
  │  방식 1: Git Push (권장)                             │
  │                                                     │
  │  로컬 개발 → git push → Gitea webhook → 자동 배포   │
  │  CI/CD 없이도 push-to-deploy 워크플로우 완성        │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │  방식 2: CLI Deploy                                 │
  │                                                     │
  │  brewnet deploy ./my-project                        │
  │  언어 자동 감지 → Docker 빌드 → 컨테이너 배포       │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │  방식 3: Dashboard Deploy                           │
  │                                                     │
  │  Admin Panel → Apps → 앱 선택 → Deploy Now 클릭     │
  │  웹 UI에서 원클릭 배포                              │
  └─────────────────────────────────────────────────────┘
```

---

<!-- ====================================================================== -->
<!-- PAGE 12: 보안 아키텍처                                                   -->
<!-- ====================================================================== -->

## 보안 아키텍처

### 다계층 보안 모델

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Layer 1: Cloudflare Edge                                   │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  DDoS 보호 | WAF | Bot 관리 | SSL/TLS 종단           │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Layer 2: Tunnel (Zero Trust)                               │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  Outbound-only 연결 | 인바운드 포트 노출 제로          │  │
  │  │  QUIC 암호화 프로토콜 | Cloudflare Access 연동 가능   │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Layer 3: Traefik (Reverse Proxy)                           │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  TLS Termination | 서비스별 라우팅 | Rate Limiting    │  │
  │  │  Docker 라벨 기반 자동 발견 | HTTPS 리다이렉트         │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Layer 4: Docker Network Isolation                          │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  brewnet (외부): Traefik ↔ 앱 서비스                   │  │
  │  │  brewnet-internal (내부): DB ↔ 앱 (외부 접근 차단)     │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Layer 5: Container Security                                │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  no-new-privileges | read-only rootfs (선택)           │  │
  │  │  non-root 사용자 | 리소스 제한                         │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Layer 6: Credential Management                             │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │  자동 생성 (20자 랜덤) | chmod 600 파일 보호           │  │
  │  │  서비스 간 자격 증명 자동 전파 | .env 소스코드 미포함  │  │
  │  └────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
```

### 네트워크 분리 구조

```
  Internet
     │
     ▼
  ┌─────────────────────────────────────────────────┐
  │  Docker Network: brewnet (외부 노출용)           │
  │                                                 │
  │  cloudflared ──> Traefik ──> App Services       │
  │                     │                           │
  │                     ├──> Gitea                  │
  │                     ├──> Nextcloud              │
  │                     ├──> Jellyfin               │
  │                     └──> User Apps              │
  └────────────────────┬────────────────────────────┘
                       │ (브리지 연결)
  ┌────────────────────┴────────────────────────────┐
  │  Docker Network: brewnet-internal (내부 전용)    │
  │                                                 │
  │  PostgreSQL  ←──> App Services                  │
  │  MySQL       ←──> App Services                  │
  │  Redis       ←──> App Services                  │
  │                                                 │
  │  외부에서 직접 접근 불가                         │
  └─────────────────────────────────────────────────┘
```

### 보안 기능 요약

| 보안 영역 | 구현 방식 | 자동화 여부 |
|-----------|----------|------------|
| TLS/SSL | Traefik + Let's Encrypt 자동 갱신 | 자동 |
| 컨테이너 격리 | `security_opt: no-new-privileges` | 자동 |
| 네트워크 분리 | 이중 Docker 네트워크 (brewnet / brewnet-internal) | 자동 |
| 자격 증명 | 20자 랜덤 생성, `chmod 600` 보호 | 자동 |
| 포트 노출 | Tunnel 모드: 인바운드 포트 0개 | 자동 |
| DB 접근 | 내부 네트워크에서만 접근 가능 | 자동 |
| 서비스 전파 | Admin 자격 증명 → 모든 서비스 자동 동기화 | 자동 |

---

<!-- ====================================================================== -->
<!-- PAGE 13: Cloudflare Tunnel                                              -->
<!-- ====================================================================== -->

## Cloudflare Tunnel -- 공인 IP 없이 외부 공개

### Cloudflare Tunnel 동작 원리

```
  사용자 (브라우저)
       │
       │ HTTPS 요청
       ▼
  ┌───────────────────────────────────────┐
  │         Cloudflare Edge Network       │
  │                                       │
  │  1. DNS 조회 (CNAME → tunnel)         │
  │  2. DDoS 보호 + WAF 필터링           │
  │  3. TLS 종단                          │
  │  4. 터널 라우팅                       │
  │                                       │
  └──────────────┬────────────────────────┘
                 │
        QUIC 암호화 터널 (outbound 연결)
        ※ 인바운드 포트 개방 불필요
                 │
  ┌──────────────┴────────────────────────┐
  │          Home Server                  │
  │                                       │
  │  cloudflared (connector)              │
  │       │                               │
  │       ▼                               │
  │  Traefik → 각 서비스로 라우팅          │
  │                                       │
  │  ※ 공인 IP 불필요                     │
  │  ※ 포트 포워딩 불필요                 │
  │  ※ NAT/방화벽 통과                    │
  └───────────────────────────────────────┘
```

### Quick Tunnel vs Named Tunnel

| 항목 | Quick Tunnel | Named Tunnel |
|------|-------------|-------------|
| **설정 난이도** | 즉시 사용 (계정 불필요) | API Token 필요 |
| **URL 형태** | `random-words.trycloudflare.com` | `myapp.yourdomain.com` |
| **URL 지속성** | 매번 변경됨 (임시) | 영구 고정 |
| **커스텀 도메인** | 불가 | 가능 |
| **DNS 자동 관리** | 해당 없음 | CNAME 자동 생성/삭제 |
| **추천 용도** | 테스트, 임시 공유 | 프로덕션, 영구 운영 |
| **비용** | 무료 | 무료 (Cloudflare 계정 필요) |
| **Cloudflare Access** | 불가 | 연동 가능 (Zero Trust) |

### Zero-Trust 보안 모델

```
  전통적 VPN 방식                    Cloudflare Tunnel (Zero Trust)
  ━━━━━━━━━━━━━━━━                  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Internet                          Internet
     │                                 │
  [방화벽 포트 개방]                    │ (포트 개방 없음)
     │                                 │
  [포트 포워딩 설정]               [Cloudflare Edge]
     │                                 │
  [VPN 서버 운영]                  [Outbound-only 터널]
     │                                 │
  [서버 공인 IP 노출]              [서버 IP 비공개]
     │                                 │
  홈 서버                           홈 서버

  공격 표면: 넓음                   공격 표면: 최소화
  관리 비용: 높음                   관리 비용: 제로
```

### Brewnet에서의 터널 전환

```bash
# Quick Tunnel (기본) → Named Tunnel 마이그레이션
brewnet domain connect

# 앱별 도메인 연결
brewnet domain connect my-app --domain app.example.com

# 터널 상태 확인
brewnet domain tunnel status
```

---

<!-- ====================================================================== -->
<!-- PAGE 14: 도메인 연결                                                     -->
<!-- ====================================================================== -->

## 도메인 연결 -- 3단계로 완료

### 도메인 연결 흐름

```
  Step 1                    Step 2                    Step 3
  ┌────────────────┐       ┌────────────────┐       ┌────────────────┐
  │  Cloudflare    │       │  Zone 선택      │       │  Tunnel 생성    │
  │  API Token     │ ────> │                │ ────> │                │
  │  입력          │       │  보유 도메인 중  │       │  자동 생성 후   │
  │                │       │  하나 선택      │       │  DNS 레코드     │
  │  dash.cloud    │       │                │       │  자동 등록      │
  │  flare.com     │       │  example.com   │       │                │
  │  에서 발급     │       │  mysite.dev    │       │  app.example   │
  │                │       │  ...           │       │  .com → 터널   │
  └────────────────┘       └────────────────┘       └────────────────┘
```

### Step 1: Cloudflare API Token 발급

```
  Cloudflare Dashboard
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  1. dash.cloudflare.com 로그인                   │
  │  2. Websites → Add a site → 도메인 등록          │
  │  3. 네임서버 변경 (Cloudflare NS로)              │
  │  4. 프로필 → My Profile → API Tokens            │
  │  5. Create Token                                 │
  │  6. "Edit Cloudflare Tunnel" 템플릿 선택         │
  │  7. 사용할 도메인 지정                           │
  │  8. Create Token → 토큰 복사                     │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

### Step 2: Zone 선택

위저드가 API Token으로 보유한 Zone(도메인) 목록을 자동 조회합니다.

```
  ┌──────────────────────────────────────────────────┐
  │  ? Select your Cloudflare zone:                  │
  │    > example.com                                 │
  │      mysite.dev                                  │
  │      another-domain.io                           │
  └──────────────────────────────────────────────────┘
```

### Step 3: Tunnel 생성 + DNS 자동 등록

```
  자동 실행 과정:
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  1. Cloudflare Tunnel 생성                       │
  │     → tunnel-id: abc123-def456-...               │
  │                                                  │
  │  2. Tunnel Token 발급                            │
  │     → cloudflared 컨테이너에 자동 주입           │
  │                                                  │
  │  3. Ingress Rule 설정                            │
  │     → 서비스별 라우팅 규칙 자동 등록             │
  │                                                  │
  │  4. DNS CNAME 레코드 생성                        │
  │     → git.example.com  → tunnel-id.cfargotunnel  │
  │     → app.example.com  → tunnel-id.cfargotunnel  │
  │     → files.example.com → tunnel-id.cfargotunnel │
  │                                                  │
  │  5. 연결 확인                                    │
  │     → tunnel status: healthy                     │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

### 이후: 앱별 서브도메인 연결

```bash
# 새 앱 생성 시 자동으로 서브도메인 할당
brewnet create-app my-api --stack go-gin
# → https://my-api.example.com 자동 연결

# 기존 앱에 도메인 연결
brewnet domain connect my-api --domain api.example.com

# 도메인 해제
# Admin Panel → Apps → my-api → Domain 탭 → Disconnect

# 터널 상태 확인
brewnet domain tunnel status
# ┌──────────────┬───────────┬──────────────────────────┐
# │ Service      │ Status    │ External URL             │
# ├──────────────┼───────────┼──────────────────────────┤
# │ gitea        │ reachable │ https://git.example.com  │
# │ my-api       │ reachable │ https://api.example.com  │
# │ nextcloud    │ reachable │ https://files.example.com│
# └──────────────┴───────────┴──────────────────────────┘
```

---

<!-- ====================================================================== -->
<!-- PAGE 15: 비용 비교                                                       -->
<!-- ====================================================================== -->

## 비용 비교

### 월간 비용: 클라우드 호스팅 vs Brewnet (홈 서버)

| 항목 | 클라우드 호스팅 | Brewnet (홈 서버) | 절감액 |
|------|----------------|-------------------|--------|
| **서버** | $20-100/월 (VPS/클라우드) | 전기료 ~$5/월 | $15-95/월 |
| **도메인** | $10-15/년 | $10-15/년 | $0 |
| **SSL 인증서** | $0-50/년 | $0 (자동 발급) | ~$25/년 |
| **Git 호스팅** | $4-20/월 (GitHub Teams 등) | $0 (Gitea 셀프 호스팅) | $4-20/월 |
| **파일 저장소** | $5-20/월 (S3, Google Drive 등) | $0 (Nextcloud 로컬) | $5-20/월 |
| **데이터베이스** | $7-50/월 (managed DB) | $0 (로컬 PostgreSQL) | $7-50/월 |
| **미디어 서버** | $5-15/월 (Plex Pass 등) | $0 (Jellyfin 무료) | $5-15/월 |
| **CDN/터널** | $0-20/월 | $0 (Cloudflare 무료 플랜) | $0-20/월 |
| **총합** | **$40-200+/월** | **~$5-6/월** | **$35-195/월** |

### 연간 비용 비교

```
  클라우드 호스팅 (연간)
  ┌────────────────────────────────────────────────────────────┐
  │████████████████████████████████████████████████████████████│ $480-2,400
  └────────────────────────────────────────────────────────────┘

  Brewnet 홈 서버 (연간)
  ┌████┐                                                        $60-72
  └────┘

  연간 절약액: $420 ~ $2,340
```

### 3년 TCO (Total Cost of Ownership)

| 항목 | 클라우드 | Brewnet |
|------|---------|---------|
| **초기 투자** | $0 | ~$200-500 (미니 PC 또는 기존 PC 활용 시 $0) |
| **1년차 비용** | $480-2,400 | $60-72 |
| **2년차 비용** | $480-2,400 | $60-72 |
| **3년차 비용** | $480-2,400 | $60-72 |
| **3년 총합** | **$1,440-7,200** | **$180-716** |
| **3년 절약** | - | **$1,260-6,484** |

### 기존 하드웨어 활용 시 추가 비용 $0

```
  추천 홈 서버 하드웨어:

  ┌────────────────────────────────────────────────┐
  │  옵션 1: 기존 PC / 노트북 재활용                │
  │  비용: $0 | RAM 4GB+, 디스크 20GB+ 이면 충분   │
  ├────────────────────────────────────────────────┤
  │  옵션 2: Raspberry Pi 5 (8GB)                  │
  │  비용: ~$80 | 저전력, 24/7 운영에 적합          │
  ├────────────────────────────────────────────────┤
  │  옵션 3: Intel NUC / Mini PC                   │
  │  비용: ~$200-500 | 고성능, 낮은 전력 소비       │
  └────────────────────────────────────────────────┘
```

---

<!-- ====================================================================== -->
<!-- PAGE 16: 성능 비교                                                       -->
<!-- ====================================================================== -->

## 성능 비교

### 홈 서버 vs 클라우드 성능 지표

| 지표 | 클라우드 호스팅 | Brewnet (홈 서버) | 비교 |
|------|----------------|-------------------|------|
| **네트워크 지연 (LAN)** | 20-50ms (인터넷 왕복) | <1ms (로컬 네트워크) | **20-50배 빠름** |
| **스토리지 I/O** | 100-500 MB/s (네트워크 스토리지) | 2,000-7,000 MB/s (NVMe SSD) | **4-70배 빠름** |
| **Cold Start** | 5-30초 (서버리스) | 0초 (항시 가동) | **즉시 응답** |
| **대역폭** | 제한됨 (전송량 과금) | 무제한 (가정 인터넷) | **비용 제한 없음** |
| **스토리지 용량** | 비례 과금 ($0.02-0.10/GB) | 무제한 (디스크 크기) | **비용 무관** |

### 지연 시간 비교 다이어그램

```
  로컬 네트워크 접근 (Brewnet)
  ┌─────────┐     <1ms      ┌─────────┐
  │  Client │ ────────────> │  Server │
  │ (같은   │               │ (홈 서버)│
  │  네트워크)│              │         │
  └─────────┘               └─────────┘


  클라우드 접근
  ┌─────────┐  10-25ms  ┌─────┐  10-25ms  ┌─────────┐
  │  Client │ ────────> │ ISP │ ────────> │  Cloud  │
  │         │           │     │           │  Server │
  └─────────┘           └─────┘           └─────────┘
                     총 왕복: 20-50ms


  Cloudflare Tunnel 외부 접근
  ┌─────────┐  10ms  ┌────────┐  5-15ms  ┌─────────┐
  │ 외부    │ ─────> │ CF     │ ───────> │  홈 서버 │
  │ 사용자  │        │ Edge   │  tunnel  │         │
  └─────────┘        └────────┘          └─────────┘
                  총 왕복: 15-25ms (클라우드와 유사)
```

### 스토리지 성능 비교

```
  NVMe SSD (로컬 디스크)
  ┌────────────────────────────────────────────────────────────┐
  │████████████████████████████████████████████████████████████│ 3,500 MB/s
  └────────────────────────────────────────────────────────────┘

  SATA SSD (로컬 디스크)
  ┌────────────────────┐
  │████████████████████│ 550 MB/s
  └────────────────────┘

  클라우드 SSD (네트워크)
  ┌████████████┐
  │████████████│ 200-500 MB/s (IOPS 제한)
  └────────────┘

  클라우드 HDD (네트워크)
  ┌████┐
  │████│ 80-160 MB/s
  └────┘
```

### 확장 유연성

| 항목 | 클라우드 | 홈 서버 (Brewnet) |
|------|---------|-------------------|
| **RAM 추가** | 요금제 변경 (즉시, 비용 증가) | RAM 장착 (1회 비용) |
| **디스크 추가** | 과금 방식 변경 | SSD/HDD 추가 (1회 비용) |
| **GPU 활용** | 고가 ($1-4/시간) | 기존 GPU 활용 ($0) |
| **항시 가동** | 기본 지원 | Docker `restart: unless-stopped` |

---

<!-- ====================================================================== -->
<!-- PAGE 17: 완전한 삭제                                                     -->
<!-- ====================================================================== -->

## 완전한 삭제 -- 흔적 없는 제거

### One Command Uninstall

```bash
brewnet uninstall
```

### 삭제 과정

```
  brewnet uninstall
       │
       ▼
  ┌──────────────────────────────────────────┐
  │  1. 확인 프롬프트                        │
  │     "정말 모든 서비스를 삭제하시겠습니까?" │
  │     [Y/N]                                │
  └────────────┬─────────────────────────────┘
               ▼
  ┌──────────────────────────────────────────┐
  │  2. Docker 컨테이너 중지 & 제거          │
  │     docker compose down --volumes        │
  │     모든 서비스 컨테이너 종료            │
  └────────────┬─────────────────────────────┘
               ▼
  ┌──────────────────────────────────────────┐
  │  3. Docker 볼륨 삭제                     │
  │     PostgreSQL, Redis, Gitea, Nextcloud  │
  │     등 모든 named volumes 제거           │
  └────────────┬─────────────────────────────┘
               ▼
  ┌──────────────────────────────────────────┐
  │  4. Docker 네트워크 제거                  │
  │     brewnet, brewnet-internal 삭제       │
  └────────────┬─────────────────────────────┘
               ▼
  ┌──────────────────────────────────────────┐
  │  5. 프로젝트 디렉터리 삭제                │
  │     ~/brewnet/<project-name>/ 전체 삭제  │
  └────────────┬─────────────────────────────┘
               ▼
  ┌──────────────────────────────────────────┐
  │  6. 완료                                 │
  │     "All services removed."              │
  └──────────────────────────────────────────┘
```

### 삭제 옵션

| 옵션 | 동작 | 사용 시나리오 |
|------|------|-------------|
| `brewnet uninstall` | 전체 삭제 (컨테이너 + 볼륨 + 디렉터리) | 깨끗한 재설치 |
| `--dry-run` | 삭제 대상 미리 확인 (실제 변경 없음) | 삭제 전 확인 |
| `--keep-data` | Docker 볼륨(DB, 파일) 보존 | DB 데이터 유지하며 재구성 |
| `--keep-config` | 프로젝트 디렉터리 보존 (컨테이너만 중지) | 설정 유지하며 컨테이너 재생성 |
| `--force` | 확인 프롬프트 없이 강제 삭제 | 스크립트/자동화 |

### dry-run 출력 예시

```
  $ brewnet uninstall --dry-run

  Dry-run mode — no changes will be made.

  Installed projects:
    > homeserver  /Users/username/brewnet/homeserver

  The following will be removed:
    [remove] Docker containers + volumes
    [remove] Docker networks: brewnet, brewnet-internal
    [remove] Project directory: /Users/username/brewnet/homeserver

  Dry-run complete. No changes made.
```

### 재설치

삭제 후 새 설치는 `brewnet init` 하나로 충분합니다.
`install.sh`를 다시 실행할 필요가 없습니다.

```bash
# 삭제
brewnet uninstall

# 새 설치
brewnet init
```

---

<!-- ====================================================================== -->
<!-- PAGE 18: 다국어 지원 (i18n)                                              -->
<!-- ====================================================================== -->

## 다국어 지원 (i18n)

### 지원 언어

```
  ┌─────────────────────┐    ┌─────────────────────┐
  │                     │    │                     │
  │   한국어 (KO)       │    │   English (EN)      │
  │                     │    │                     │
  │   기본 언어         │    │   글로벌 지원        │
  │   전체 UI 번역      │    │   전체 UI 번역       │
  │                     │    │                     │
  └─────────────────────┘    └─────────────────────┘
```

### 언어 전환 방식

```
  ┌──────────────────────────────────────────────────────────┐
  │  Brewnet Admin Panel                      [KO ▾] [EN]   │
  │                                                          │
  │  헤더 우측의 언어 토글로 즉시 전환                       │
  │                                                          │
  │  ┌──────────────────────────────────────────────────┐    │
  │  │  자동 감지:                                      │    │
  │  │  1. 브라우저 Accept-Language 헤더 확인            │    │
  │  │  2. navigator.language 값 참조                   │    │
  │  │  3. ko/ko-KR → 한국어 | 기타 → English          │    │
  │  │                                                  │    │
  │  │  수동 전환:                                      │    │
  │  │  헤더의 KO/EN 토글 클릭 → localStorage 저장      │    │
  │  │  다음 방문 시 저장된 설정 우선 적용              │    │
  │  └──────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────┘
```

### 구현 특징

| 특성 | 설명 |
|------|------|
| **번들 크기** | ~4.5KB 추가 오버헤드 (두 언어 JSON 포함) |
| **외부 의존성** | 없음 (자체 구현, i18next 등 미사용) |
| **자동 감지** | 브라우저 언어 설정 기반 자동 언어 선택 |
| **즉시 전환** | 페이지 새로고침 없이 실시간 언어 전환 |
| **영속성** | localStorage에 선택 저장, 다음 방문 시 유지 |
| **CLI 언어** | CLI 출력은 English 고정 (터미널 호환성) |

### 번역 범위

```
  번역 대상:
  ┌──────────────────────────────────────────────┐
  │  Dashboard UI                                │
  │  ├── 네비게이션 메뉴                         │
  │  ├── 서비스 상태 라벨                        │
  │  ├── 버튼 텍스트                             │
  │  ├── 모달 제목 및 설명                       │
  │  ├── 폼 라벨 및 플레이스홀더                 │
  │  ├── 에러 메시지                             │
  │  ├── 성공/경고 알림                          │
  │  └── 도움말 텍스트                           │
  └──────────────────────────────────────────────┘

  번역 비대상 (영어 고정):
  ┌──────────────────────────────────────────────┐
  │  CLI 출력                                    │
  │  기술 용어 (Docker, Traefik, Tunnel 등)     │
  │  서비스 이름 (Gitea, Nextcloud 등)          │
  │  에러 코드 (BN001, BN002 등)                │
  │  API 응답                                    │
  └──────────────────────────────────────────────┘
```

---

<!-- ====================================================================== -->
<!-- PAGE 19: 로드맵                                                         -->
<!-- ====================================================================== -->

## 로드맵

### 현재 상태 및 향후 계획

```
  2025                         2026                         2027
  ──┬────────────┬─────────────┬────────────┬──────────────┬──────
    │            │             │            │              │
    ▼            ▼             ▼            ▼              ▼
  v0.1         v0.5          v1.0         v1.5           v2.0
  CLI MVP    CLI 안정화     정식 출시    Dashboard    Multi-node
                                          Pro

  [완료] ──────────────────> [현재] ─────────────────> [계획]
```

### Phase 1: CLI 안정화 (완료)

- [x] 8단계 대화형 설치 마법사
- [x] Docker 자동 설치 (macOS + Linux)
- [x] 16개 보일러플레이트 스택 지원
- [x] Cloudflare Tunnel (Quick + Named)
- [x] Git 기반 배포 파이프라인 (Gitea + Webhook)
- [x] React SPA Admin Dashboard
- [x] 19개 CLI 명령어

### Phase 2: Dashboard Pro (진행 중)

```
  ┌──────────────────────────────────────────────────────────┐
  │  Next.js 14 App Router 기반 Pro Dashboard                │
  │                                                          │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
  │  │ 브라우저  │ │ 실시간   │ │ 코드     │ │ 팀       │   │
  │  │ 기반     │ │ 모니터링 │ │ 에디터   │ │ 관리     │   │
  │  │ 설치     │ │          │ │          │ │          │   │
  │  │ 위저드   │ │ 서비스   │ │ Monaco   │ │ RBAC     │   │
  │  │          │ │ 메트릭   │ │ Editor   │ │ 접근     │   │
  │  │ Step-by  │ │ 컨테이너 │ │ Git diff │ │ 제어     │   │
  │  │ -step UI │ │ 리소스   │ │ 웹 편집  │ │          │   │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
  │                                                          │
  │  기술 스택:                                              │
  │  Next.js 14 | Tailwind + shadcn/ui | Zustand            │
  │  TanStack Query | xterm.js | Monaco Editor              │
  └──────────────────────────────────────────────────────────┘
```

### Phase 3: 모바일 앱

- 모바일에서 서버 상태 확인
- 푸시 알림 (서비스 다운, 배포 완료 등)
- 원격 서비스 시작/중지
- iOS + Android (React Native)

### Phase 4: Multi-node Clustering

```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Node 1    │     │   Node 2    │     │   Node 3    │
  │  (Primary)  │ ←──>│  (Worker)   │ ←──>│  (Worker)   │
  │             │     │             │     │             │
  │  Traefik    │     │  App Server │     │  DB Server  │
  │  Gitea      │     │  Media      │     │  Backup     │
  │  Dashboard  │     │             │     │             │
  └─────────────┘     └─────────────┘     └─────────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                    Docker Swarm / K3s
```

### Phase 5: Marketplace (커뮤니티 스택)

| 기능 | 설명 |
|------|------|
| **커뮤니티 스택** | 사용자가 만든 Docker 스택 공유/설치 |
| **원클릭 설치** | `brewnet add community/wordpress` 형태 |
| **스택 템플릿** | 검증된 Compose 템플릿 저장소 |
| **버전 관리** | 스택 업데이트 알림 + 안전한 업그레이드 |

### Phase 6: 자동 업데이트

- CLI 자동 업데이트 메커니즘
- Docker 이미지 자동 업데이트 (선택적)
- 업데이트 전 자동 백업
- 롤백 지원

---

<!-- ====================================================================== -->
<!-- PAGE 20: 마무리                                                         -->
<!-- ====================================================================== -->

<div align="center">

## Your Home Server, Brewed Fresh

### 복잡한 인프라, 명령어 하나로 끝.

```
  ┌──────────────────────────────────────────┐
  │                                          │
  │         npx brewnet init                 │
  │                                          │
  │   3분이면 나만의 서버가 완성됩니다.      │
  │                                          │
  └──────────────────────────────────────────┘
```

---

### 프로젝트 정보

| 항목 | 내용 |
|------|------|
| **GitHub** | [github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet) |
| **Website** | [brewnet.dev](https://brewnet.dev) |
| **License** | Apache License 2.0 |
| **Language** | TypeScript |
| **Runtime** | Node.js 20+ |
| **Platform** | macOS 12+ / Ubuntu 20.04+ |

---

### 주요 수치

```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │              │  │              │  │              │  │              │
  │   19개       │  │   16개       │  │   8단계      │  │   ~3분       │
  │   CLI 명령어 │  │   앱 스택    │  │   설치 위저드│  │   설치 시간  │
  │              │  │              │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │              │  │              │  │              │  │              │
  │   6개        │  │   $5/월      │  │   0개        │  │   100%       │
  │   프로그래밍 │  │   운영 비용  │  │   노출 포트  │  │   오픈소스   │
  │   언어 지원  │  │   (전기료만) │  │   (터널 모드)│  │   (Apache2.0)│
  │              │  │              │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

### 시작하기

```bash
# 설치
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash

# 서버 구축
brewnet init

# 앱 생성
brewnet create-app my-first-app

# 관리 대시보드
brewnet admin
```

---

**Star on GitHub**

프로젝트가 도움이 되었다면, GitHub Star로 응원해 주세요.

[github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet)

</div>

---

*Brewnet -- Your Home Server, Brewed Fresh*
*Copyright 2025-2026 Brewnet (codevillain) | Apache License 2.0*
