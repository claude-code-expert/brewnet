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

*CLI 하나로 Docker 기반 홈 서버를 3분 안에 구축하세요.*

</div>

---

<!-- ====================================================================== -->
<!-- PAGE 2: 문제 정의                                                       -->
<!-- ====================================================================== -->

## 문제 정의 -- 셀프 호스팅의 Pain Points

### 왜 홈 서버를 직접 운영하기 어려운가?

셀프 호스팅은 데이터 주권, 비용 절감, 프라이버시 보호 측면에서 매력적입니다.
하지만 실제로 시작하면 수많은 장벽에 부딪힙니다.

### Pain Points

| 문제 영역 | 구체적 어려움 |
|-----------|-------------|
| Docker 설정 | Compose 파일 수동 작성, 이미지 선택, 볼륨/네트워크 구성 |
| 네트워크 | 포트 포워딩, NAT Traversal, 방화벽 설정, DDNS |
| 보안 | TLS 인증서, 컨테이너 격리, 자격 증명 관리, 권한 에스컬레이션 방지 |
| 도메인 연결 | DNS 레코드, 리버스 프록시, SSL 갱신 자동화 |
| 유지보수 | 이미지 업데이트, 백업/복원, 로그 모니터링 |
| 앱 배포 | CI/CD 파이프라인, Git 서버 연동, 빌드 자동화 |

### 기존 솔루션의 한계

```
  기존 방식: 수동 Docker Compose
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  1. Docker 설치          <- 15분                     │
  │  2. docker-compose.yml 작성  <- 30분~1시간           │
  │  3. Traefik 설정 파일 작성   <- 30분                 │
  │  4. SSL 인증서 발급         <- 15분                  │
  │  5. 환경 변수 설정          <- 15분                  │
  │  6. 네트워크 분리 설정       <- 15분                 │
  │  7. 방화벽 / 포트포워딩      <- 30분                 │
  │  8. DNS 레코드 설정         <- 15분                  │
  │  9. 헬스 체크 / 디버깅       <- 30분~1시간           │
  │                                                      │
  │  총 소요 시간: 2~4시간 (경험자 기준)                 │
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
  │   Docker docs 숙지  ---+                                    │
  │   Compose 파일 작성 ---+                                    │
  │   Traefik 설정     ---+     +--------------------+         │
  │   SSL 인증서 발급  ---+---->|  npx brewnet init  |         │
  │   DNS 레코드 설정  ---+     +--------+-----------+         │
  │   방화벽 구성      ---+              |                      │
  │   터널 설정        ---+        3분 후 완료                  │
  │   보안 강화        ---+              |                      │
  │                               +------+------+              │
  │   2~4시간 소요                | 서버 가동중  |              │
  │                               +-------------+              │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

### Brewnet의 4가지 핵심 접근

**1. One-Command Install**
- `npx brewnet init` 하나로 전체 스택 구축
- Docker 미설치 시 자동 설치 (macOS: Homebrew, Linux: get.docker.com)
- 의존성 검증, 포트 충돌 감지, 디스크/RAM 체크 자동 수행

**2. 7-Step Interactive Wizard**
- 7단계 대화형 설치 마법사 (Step 0~6 + Complete)
- Full Install(전체 스택) 또는 Partial Install(선택 컴포넌트) 지원
- 초보자도 질문에 답하는 것만으로 서버 완성

**3. Web Dashboard**
- React SPA 기반 어드민 패널 (`http://localhost:8088`)
- 서비스 상태 모니터링, 앱 관리, 실시간 로그, 배포 이력
- 앱별 도메인 연결/해제 UI, 한국어/영어 전환

**4. Auto-Security**
- 컨테이너 `no-new-privileges:true` 정책 자동 적용
- 내부/외부 Docker 네트워크 분리 (brewnet / brewnet-internal)
- 자격 증명 자동 생성 + secret 파일 `chmod 600` 적용
- Cloudflare Tunnel로 포트 노출 없는 외부 접속

---

<!-- ====================================================================== -->
<!-- PAGE 4: 핵심 기능 요약                                                   -->
<!-- ====================================================================== -->

## 핵심 기능 4가지

```
  +---------------------+    +---------------------+
  |                     |    |                     |
  |  1. 대화형 설치      |    |  2. 웹 대시보드      |
  |     마법사           |    |                     |
  |                     |    |  서비스 모니터링     |
  |  7단계 위저드       |    |  실시간 로그         |
  |  Docker 자동 설치   |    |  앱 관리 UI         |
  |  컴포넌트 선택      |    |  배포 이력           |
  |  Full/Partial 모드  |    |  도메인 연결         |
  |                     |    |                     |
  +---------------------+    +---------------------+

  +---------------------+    +---------------------+
  |                     |    |                     |
  |  3. Cloudflare      |    |  4. 보일러플레이트    |
  |     Tunnel 자동화    |    |     앱 생성          |
  |                     |    |                     |
  |  Quick Tunnel       |    |  16개 스택 지원      |
  |  Named Tunnel       |    |  6개 언어            |
  |  DNS 자동 설정      |    |  Gitea 저장소 연동   |
  |  Zero-Trust 보안    |    |  Docker + 라우팅     |
  |                     |    |                     |
  +---------------------+    +---------------------+
```

### 기능 상세

| 기능 | 설명 | 핵심 가치 |
|------|------|----------|
| **대화형 설치 마법사** | 7단계 위저드로 서버 컴포넌트, 개발 스택, 도메인을 선택하면 docker-compose.yml + .env + 인프라 설정 자동 생성 | 전문 지식 없이 서버 구축 |
| **웹 대시보드** | React SPA 기반 관리 패널. 서비스 상태, 앱 배포, 로그, 도메인을 브라우저에서 관리. KO/EN 다국어 지원 | CLI 없이도 서버 운영 |
| **Cloudflare Tunnel** | API Token 하나로 터널 생성(`createTunnel`), 인그레스 규칙(`configureTunnelIngress`), DNS 레코드(`createDnsRecord`) 자동 설정. 포트 포워딩 불필요 | 공인 IP 없이 외부 공개 |
| **보일러플레이트 생성** | `brewnet create-app`으로 프로젝트 생성. Gitea 저장소, Docker 서비스, Traefik 라우팅 한 번에 구성. 6개 언어 16개 프레임워크 지원 | 코드 작성 즉시 배포 |

---

<!-- ====================================================================== -->
<!-- PAGE 5: 아키텍처 개요                                                    -->
<!-- ====================================================================== -->

## 시스템 아키텍처

### 전체 구조

```
  +------------------------------------------------------------------+
  |                        Cloudflare Edge                           |
  |                                                                  |
  |   사용자 요청 --> Cloudflare DNS --> CNAME --> Tunnel Endpoint   |
  |                                                                  |
  +-----------------------------+------------------------------------+
                                |
                      encrypted tunnel (QUIC)
                                |
  +-----------------------------+------------------------------------+
  |                       Home Server                                |
  |                                                                  |
  |  +-----------------------------------------------------------+  |
  |  |              Docker Network: brewnet (외부)                |  |
  |  |                                                           |  |
  |  |  cloudflared -------+                                     |  |
  |  |  (outbound-only)    |                                     |  |
  |  |                     v                                     |  |
  |  |  Traefik v2.11 (port 80/443)                              |  |
  |  |  +-- Docker label 기반 자동 라우팅                        |  |
  |  |  |                                                        |  |
  |  |  +----> /git           --> Gitea (port 3000)              |  |
  |  |  +----> /cloud         --> Nextcloud 29 (port 80)         |  |
  |  |  +----> /apps/{name}   --> User Apps (보일러플레이트)     |  |
  |  |  +----> jellyfin.*     --> Jellyfin (port 8096)           |  |
  |  |  +----> files.*        --> FileBrowser (port 80)          |  |
  |  |  +----> minio.*        --> MinIO Console (port 9001)      |  |
  |  |  +----> pgadmin.*      --> pgAdmin (port 5050)            |  |
  |  +-----------------------------------------------------------+  |
  |                           |                                      |
  |                     (bridge 연결)                                |
  |                           |                                      |
  |  +-----------------------------------------------------------+  |
  |  |         Docker Network: brewnet-internal (내부 전용)       |  |
  |  |                                                           |  |
  |  |  PostgreSQL 18 (port 5432) <---> App Services             |  |
  |  |  MySQL 8.4 (port 3306)     <---> App Services             |  |
  |  |  Redis / Valkey / KeyDB    <---> App Services             |  |
  |  |                                                           |  |
  |  |  외부에서 직접 접근 불가 (no host port exposed)           |  |
  |  +-----------------------------------------------------------+  |
  |                                                                  |
  |  +------------------+                                            |
  |  | Admin Panel      |  React SPA (localhost:8088)                |
  |  | (Node.js HTTP)   |  서비스 상태 / 앱 관리 / 로그 / 도메인    |
  |  +------------------+                                            |
  |                                                                  |
  +------------------------------------------------------------------+
```

### 컴포넌트 상세 (SERVICE_REGISTRY 기준)

| 컴포넌트 | Docker 이미지 | 역할 | 네트워크 |
|----------|--------------|------|----------|
| **Traefik** | `traefik:v2.11` | 리버스 프록시, TLS termination, Docker 라벨 자동 라우팅 | brewnet |
| **cloudflared** | `cloudflare/cloudflared:latest` | Cloudflare Tunnel 커넥터 (outbound-only QUIC) | brewnet |
| **Gitea** | `gitea/gitea:latest` | 셀프 호스팅 Git 서버, 웹훅 배포 트리거 | brewnet + internal |
| **Nextcloud** | `nextcloud:29-apache` | 클라우드 파일 저장소 (Google Drive 대안) | brewnet + internal |
| **MinIO** | `minio/minio:latest` | S3 호환 오브젝트 스토리지 | brewnet + internal |
| **PostgreSQL** | `postgres:18.3-alpine` | 관계형 데이터베이스 (내부 전용) | brewnet + internal |
| **MySQL** | `mysql:8.4` | 관계형 데이터베이스 (내부 전용) | brewnet + internal |
| **Jellyfin** | `jellyfin/jellyfin:latest` | 미디어 스트리밍 서버 (Plex 대안) | brewnet |
| **pgAdmin** | `dpage/pgadmin4:latest` | PostgreSQL 웹 관리 도구 | brewnet + internal |
| **FileBrowser** | `filebrowser/filebrowser:latest` | 경량 웹 기반 파일 관리자 | brewnet |
| **OpenSSH** | `linuxserver/openssh-server:latest` | SSH/SFTP 원격 접속 | brewnet |

---

<!-- ====================================================================== -->
<!-- PAGE 6: 기술 스택                                                        -->
<!-- ====================================================================== -->

## 기술 스택

### Monorepo 구조 (pnpm workspace)

```
  brewnet/
  ├── packages/
  │   ├── cli/           # CLI 애플리케이션 (19개 명령어)
  │   ├── admin-ui/      # React SPA Admin 대시보드
  │   ├── dashboard/     # Web Dashboard (Pro — Next.js 14)
  │   └── shared/        # 공유 타입 & Zod 스키마
  ├── docker/            # Docker 관련 설정
  ├── tests/             # 테스트 (unit / integration / e2e)
  └── spec/              # 기획 문서
```

### 계층별 기술 스택

| 계층 | 기술 | 용도 |
|------|------|------|
| **CLI** | TypeScript 5, Node.js 20+ | 타입 안전한 CLI 핵심 로직 |
| | Commander.js | 명령어 파싱 및 서브커맨드 라우팅 |
| | @inquirer/prompts | 대화형 위저드 UI (select, confirm, input) |
| | execa, dockerode | Docker 프로세스 제어 및 컨테이너 조회 |
| | better-sqlite3 | 프로젝트 메타데이터, 앱 목록, 도메인 설정 저장 |
| | simple-git | Gitea 저장소 관리 (clone, push, branch) |
| **Admin UI** | React + Vite | 경량 SPA 대시보드 (admin-server 내장) |
| | 자체 i18n (useI18n hook) | KO/EN 다국어 지원 (외부 의존성 없음) |
| **Dashboard Pro** | Next.js 14 (App Router) | 웹 프레임워크 |
| | Tailwind CSS + shadcn/ui | UI 컴포넌트 |
| | Zustand | 상태 관리 |
| | TanStack Query | 서버 상태 동기화 |
| | React Hook Form + Zod | 폼 검증 |
| | xterm.js | 웹 터미널 (실시간 로그) |
| | Monaco Editor | 코드 에디터 |
| **Shared** | TypeScript types | 패키지 간 타입 공유 (WizardState, StackEntry) |
| | Zod schemas | 런타임 데이터 검증 |
| **인프라** | Docker Compose | 컨테이너 오케스트레이션 |
| | Traefik v2.11 | 리버스 프록시 + Auto TLS + Docker label 라우팅 |
| | Cloudflare Tunnel | Zero-Trust 외부 접속 터널 |
| **설정 DB** | SQLite | 프로젝트 메타데이터, 앱 상태, 도메인 연결 정보 |

---

<!-- ====================================================================== -->
<!-- PAGE 7: 설치 과정                                                       -->
<!-- ====================================================================== -->

## 설치 과정 -- 7-Step Wizard

### 설치 명령어

```bash
# 방법 A -- curl (권장)
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash

# 방법 B -- npm
npm install -g @brewnet/cli

# 설치 시작
brewnet init
```

### 7단계 설치 흐름 (generate.ts 기준)

```
  npx brewnet init
       |
       v
  +----------------------------+
  | Step 0: 시스템 체크         |  OS, Docker 설치 여부,
  |                            |  포트 80/443, 디스크/RAM
  +------------+---------------+
               |  Docker 없음? -> 자동 설치
               v
  +----------------------------+
  | Step 1: 프로젝트 설정       |  프로젝트 이름, 경로,
  |                            |  Full / Partial 선택
  +------------+---------------+
               v
  +----------------------------+
  | Step 2: 어드민 계정         |  관리자 username/password
  |         + 서버 컴포넌트     |  웹/파일/DB/미디어 선택
  +------------+---------------+
               v
  +----------------------------+
  | Step 3: 개발 스택           |  언어 + 프레임워크 선택
  |  (App Server 선택 시)       |  Node/Python/Go/Rust/Java/Kotlin
  +------------+---------------+
               v
  +----------------------------+
  | Step 4: 도메인 & 네트워크   |  로컬(LAN) 또는
  |                            |  Cloudflare Tunnel
  +------------+---------------+
               v
  +----------------------------+
  | Step 5: 검토 & 확인         |  선택 사항 최종 확인
  +------------+---------------+
               v
  +----------------------------+
  | Step 6: 자동 구성           |  1. docker-compose.yml 생성
  | (Generate & Start)         |  2. .env + secret 파일 생성
  |                            |  3. 인프라 설정 생성
  |                            |  4. Docker 이미지 Pull
  |                            |  5. Docker 네트워크 생성
  |                            |  6. 서비스 시작 (의존성 순서)
  |                            |  7. 헬스 체크 + 자격 증명 검증
  +------------+---------------+
               v
  +----------------------------+
  | Step 7: 완료!               |  접속 URL, 계정 정보,
  |                            |  터널 상태 출력
  +----------------------------+
```

### Step 6 Generate 상세 흐름 (실제 코드 기준)

```
  generateComposeConfig(state) --> composeConfigToYaml() --> docker-compose.yml
  generateEnvFiles(state) --> .env (chmod 600) + .env.example + secrets/
  generateInfraConfigs(state) --> Traefik 설정, 네트워크 설정
  docker compose pull --> 이미지 다운로드 (네트워크 속도에 따라 수 분)
  docker network create brewnet --> 외부 네트워크 사전 생성
  PostgreSQL 사전 시작 --> gitea_db 생성 (Gitea 의존성)
  docker compose up -d --> 의존성 순서로 서비스 시작
  Health check polling --> 모든 서비스 정상 확인
```

---

<!-- ====================================================================== -->
<!-- PAGE 8: 웹 대시보드                                                      -->
<!-- ====================================================================== -->

## 웹 대시보드

### Admin Panel 개요

`brewnet admin` 명령으로 `http://localhost:8088`에서 접근 가능한 React SPA 대시보드입니다.
Node.js 내장 HTTP 서버 위에서 동작하며, 별도 웹 서버 없이 CLI에 포함됩니다.

### 대시보드 레이아웃

```
  +--------------------------------------------------------------+
  |  Brewnet Admin Panel                    [Dashboard] [Apps]   |
  |                                                    [KO | EN] |
  +--------------------------------------------------------------+
  |                                                              |
  |  Dashboard Tab                                               |
  |  +--------------------------------------------------------+  |
  |  | Service Status                                        |  |
  |  |                                                        |  |
  |  | NAME          STATUS    PORT    EXTERNAL URL           |  |
  |  | ----------- ---------- ------ ----------------------- |  |
  |  | traefik       running   80     http://localhost/       |  |
  |  | gitea         running   3000   https://git.example.com |  |
  |  | nextcloud     running   80     https://cloud.exmpl.com |  |
  |  | postgresql    running   5432   (internal)              |  |
  |  | redis         running   6379   (internal)              |  |
  |  | my-app        running   3001   https://app.example.com |  |
  |  | jellyfin      running   8096   https://jelly.exmpl.com |  |
  |  | cloudflared   running   -      tunnel active           |  |
  |  +--------------------------------------------------------+  |
  |                                                              |
  +--------------------------------------------------------------+
```

### 대시보드 핵심 기능

| 기능 | 설명 |
|------|------|
| **서비스 모니터링** | 전체 컨테이너 상태(CPU/메모리/업타임), 포트, External URL을 실시간 테이블로 표시 |
| **앱 관리** | 앱별 상세 모달 (Overview / Deploy / Logs / Domain 4개 탭) |
| **원클릭 배포** | Deploy 버튼으로 최신 코드 빌드 및 배포 |
| **실시간 로그** | 컨테이너 로그 실시간 스트리밍 |
| **도메인 관리** | Quick Tunnel / Named Tunnel 전환, 앱별 서브도메인 연결/해제 |
| **배포 이력** | 커밋 메시지, 시간, 성공/실패 상태를 포함한 배포 히스토리 |
| **서비스 카탈로그** | 설치 가능한 서비스 목록 표시, 원클릭 추가/제거 |
| **다국어 지원** | KO/EN 실시간 전환 (자체 구현 useI18n hook, 외부 라이브러리 없음) |

### REST API 엔드포인트 (admin-server.ts)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/services` | 모든 서비스 상태 조회 |
| GET | `/api/apps` | 앱 목록 + 상세 정보 |
| POST | `/api/apps` | 새 앱 생성 (create-app) |
| POST | `/api/apps/:name/deploy` | 앱 배포 트리거 |
| POST | `/api/apps/:name/rollback` | 이전 버전 롤백 |
| GET | `/api/catalog` | 설치 가능한 서비스 카탈로그 |
| POST | `/api/services/add` | 서비스 추가 |
| POST | `/api/services/remove` | 서비스 제거 |
| GET | `/api/domain/connections` | 도메인 연결 상태 |
| POST | `/api/domain/connect` | 앱 도메인 연결 |
| POST | `/api/domain/disconnect` | 앱 도메인 해제 |

---

<!-- ====================================================================== -->
<!-- PAGE 9: 보일러플레이트 스택                                               -->
<!-- ====================================================================== -->

## 16개 보일러플레이트 스택 (stacks.ts 기준)

### 스택 카탈로그

```bash
brewnet create-app my-app              # 대화형 스택 선택 (언어 -> 프레임워크)
brewnet create-app my-app --stack go-gin --database postgres  # 직접 지정
```

| # | Stack ID | 언어 | 프레임워크 | 버전 | ORM | Unified |
|---|----------|------|-----------|------|-----|---------|
| 1 | `go-gin` | Go | Gin | 1.22 | GORM | No |
| 2 | `go-echo` | Go | Echo v4 | 1.24 | GORM | No |
| 3 | `go-fiber` | Go | Fiber v3 | 1.25 | GORM | No |
| 4 | `rust-actix-web` | Rust | Actix-web 4 | 1.88 | SQLx | No |
| 5 | `rust-axum` | Rust | Axum 0.8 | 1.88 | SQLx | No |
| 6 | `java-springboot` | Java | Spring Boot 3.3 | 21 | JPA / JDBC | No |
| 7 | `java-spring` | Java | Spring Framework 6.2 | 21 | JDBC / HikariCP | No |
| 8 | `kotlin-ktor` | Kotlin | Ktor 3.1 | 2.1 | Exposed ORM | No |
| 9 | `kotlin-springboot` | Kotlin | Spring Boot 3.4 | 2.1 | JDBC / HikariCP | No |
| 10 | `nodejs-express` | Node.js | Express 5 | 22 | Prisma 6 | No |
| 11 | `nodejs-nestjs` | Node.js | NestJS 11 | 22 | Prisma 6 | No |
| 12 | `nodejs-nextjs` | Node.js | Next.js 15 (API Routes) | 22 | Prisma 6 | Yes |
| 13 | `nodejs-nextjs-full` | Node.js | Next.js 15 (Full-Stack) | 22 | Prisma 6 | Yes |
| 14 | `python-fastapi` | Python | FastAPI | 3.12 | SQLAlchemy 2.0 | No |
| 15 | `python-django` | Python | Django 6 | 3.13 | Django ORM | No |
| 16 | `python-flask` | Python | Flask 3.1 | 3.13 | Flask-SQLAlchemy | No |

> **Unified 스택**: 프론트엔드와 백엔드가 단일 서비스로 동작 (Next.js)
> **Non-Unified 스택**: 백엔드 API 전용 (별도 프론트엔드 연결 가능)

### 언어별 요약

| 언어 | 스택 수 | 프레임워크 |
|------|---------|-----------|
| **Go** | 3 | Gin, Echo v4, Fiber v3 |
| **Rust** | 2 | Actix-web 4, Axum 0.8 |
| **Java** | 2 | Spring Boot 3.3, Spring Framework 6.2 |
| **Kotlin** | 2 | Ktor 3.1, Spring Boot 3.4 |
| **Node.js** | 4 | Express 5, NestJS 11, Next.js 15 (API), Next.js 15 (Full-Stack) |
| **Python** | 3 | FastAPI, Django 6, Flask 3.1 |

### 지원 데이터베이스 드라이버

```
  VALID_DB_DRIVERS = ['sqlite3', 'postgres', 'mysql']
```

### Rust 빌드 참고

Rust 스택(`rust-actix-web`, `rust-axum`)은 `buildSlow: true` 플래그가 설정되어 있어
첫 Docker 이미지 빌드 시 컴파일 시간이 길 수 있습니다 (5~10분).

---

<!-- ====================================================================== -->
<!-- PAGE 10: Git 기반 배포                                                   -->
<!-- ====================================================================== -->

## Git 기반 배포 파이프라인

### 배포 흐름

```
  개발자 워크스테이션                    홈 서버
  +------------------+            +------------------------------+
  |                  |            |                              |
  |  코드 수정       |            |  Gitea (셀프 호스팅 Git)     |
  |       |          |  git push  |       |                      |
  |       v          | ---------> |       v                      |
  |  git commit      |            |  Webhook 트리거              |
  |  git push origin |            |       |                      |
  |                  |            |       v                      |
  +------------------+            |  Docker Build               |
                                  |  (multi-stage)              |
                                  |       |                      |
                                  |       v                      |
                                  |  Health Check               |
                                  |  (GET /health 200 OK)       |
                                  |       |                      |
                                  |       v                      |
                                  |  컨테이너 교체               |
                                  |  (zero-downtime)            |
                                  |       |                      |
                                  |       v                      |
                                  |  LIVE!                       |
                                  |  https://app.example.com    |
                                  |                              |
                                  +------------------------------+
```

### 배포 관리 기능

| 기능 | 설명 | 명령어 / UI |
|------|------|------------|
| **자동 배포** | git push 시 Gitea 웹훅을 통해 자동 빌드 & 배포 | (자동) |
| **수동 배포** | CLI 또는 대시보드에서 수동 트리거 | `brewnet deploy <path>` / Deploy 버튼 |
| **배포 이력** | 커밋 해시, 시간, 성공/실패 기록 | 대시보드 Deploy 탭 |
| **롤백** | 이전 배포 버전으로 즉시 복원 | 대시보드 Rollback 버튼 |
| **브랜치 선택** | 특정 브랜치에서 배포 | 대시보드 Deploy Settings |
| **로그 확인** | 빌드/런타임 로그 실시간 스트리밍 | `brewnet logs <service>` |

### 지원하는 배포 방식

| 방식 | 설명 |
|------|------|
| **Git Push** (권장) | 로컬 개발 -> git push -> Gitea webhook -> 자동 배포 |
| **CLI Deploy** | `brewnet deploy ./my-project` — 언어 자동 감지 -> Docker 빌드 -> 배포 |
| **Dashboard Deploy** | Admin Panel -> Apps -> 앱 선택 -> Deploy Now 클릭 |

---

<!-- ====================================================================== -->
<!-- PAGE 11: 보안 아키텍처                                                   -->
<!-- ====================================================================== -->

## 보안 아키텍처 (실제 코드 기반)

### 다계층 보안 모델

```
  +--------------------------------------------------------------+
  |  Layer 1: Cloudflare Edge                                    |
  |  DDoS 보호 | WAF | Bot 관리 | SSL/TLS 종단                  |
  +--------------------------------------------------------------+
  |  Layer 2: Tunnel (Zero Trust)                                |
  |  Outbound-only 연결 | QUIC 암호화 | 인바운드 포트 0개 노출   |
  +--------------------------------------------------------------+
  |  Layer 3: Traefik (Reverse Proxy)                            |
  |  Docker label 자동 발견 | HTTPS 리다이렉트 | Rate Limiting   |
  +--------------------------------------------------------------+
  |  Layer 4: Docker Network Isolation                           |
  |  brewnet (외부) + brewnet-internal (내부, external 차단)      |
  +--------------------------------------------------------------+
  |  Layer 5: Container Security                                 |
  |  security_opt: ['no-new-privileges:true'] (모든 컨테이너)    |
  +--------------------------------------------------------------+
  |  Layer 6: Credential Management                              |
  |  자동 생성 | chmod 600 | secrets/ 디렉터리 분리              |
  +--------------------------------------------------------------+
```

### 코드 수준 보안 구현 상세

**1. `no-new-privileges` (compose-generator.ts + service-manager.ts)**

모든 서비스의 `buildServiceBlock()` 함수에서 자동 적용:

```
  const svc: ComposeService = {
    image: def.image,
    container_name: `brewnet-${def.id}`,
    restart: 'unless-stopped',
    security_opt: ['no-new-privileges:true'],  // <-- 모든 컨테이너
    networks: [...def.networks],
  };
```

**2. 네트워크 분리 (services.ts + compose-generator.ts)**

| 네트워크 | 타입 | 연결 서비스 | 설명 |
|---------|------|-----------|------|
| `brewnet` | external | Traefik, cloudflared, 앱, Gitea, Nextcloud, Jellyfin, FileBrowser | 외부 요청 수신 가능 |
| `brewnet-internal` | internal | PostgreSQL, MySQL, Redis, Gitea, Nextcloud, MinIO, pgAdmin | 외부 접근 차단, 서비스 간 통신 전용 |

DB 서비스(postgresql, mysql)는 `brewnet-internal`만 연결 -- 호스트 포트 노출 없음.

**3. 자격 증명 관리 (env-generator.ts + generate.ts)**

- `generateEnvFiles(state)` -> `.env` + `secrets/` 디렉터리 생성
- Secret 파일은 `chmod 600` 적용 (소유자만 읽기/쓰기)
- `secrets/` 디렉터리는 `chmod 700` 적용
- `.gitignore`에 `.env`, `secrets/` 자동 포함
- Admin 자격 증명 -> 모든 서비스 자동 전파 (Nextcloud, pgAdmin, MinIO 등)

**4. API 보안 (cloudflare-client.ts)**

- `fetchWithRetry()` -- 5xx/429 자동 재시도 (exponential backoff + jitter)
- 400/401/403은 재시도 안 함 (클라이언트 에러)
- DNS 레코드 생성 시 upsert 패턴 (이미 존재하면 PATCH)

---

<!-- ====================================================================== -->
<!-- PAGE 12: Cloudflare Tunnel                                              -->
<!-- ====================================================================== -->

## Cloudflare Tunnel -- 공인 IP 없이 외부 공개

### 동작 원리

```
  사용자 (브라우저)
       |
       | HTTPS 요청
       v
  +---------------------------------------+
  |         Cloudflare Edge Network       |
  |                                       |
  |  1. DNS 조회 (CNAME -> tunnel)        |
  |  2. DDoS 보호 + WAF 필터링           |
  |  3. TLS 종단                          |
  |  4. 터널 라우팅                       |
  +----------------+----------------------+
                   |
          QUIC 암호화 터널 (outbound 연결)
          ※ 인바운드 포트 개방 불필요
                   |
  +----------------+----------------------+
  |          Home Server                  |
  |                                       |
  |  cloudflared (connector)              |
  |       |                               |
  |       v                               |
  |  Traefik -> 각 서비스로 라우팅        |
  |                                       |
  |  ※ 공인 IP 불필요                     |
  |  ※ 포트 포워딩 불필요                 |
  |  ※ NAT/방화벽 통과                    |
  +---------------------------------------+
```

### Quick Tunnel vs Named Tunnel

| 항목 | Quick Tunnel | Named Tunnel |
|------|-------------|-------------|
| **설정 난이도** | 즉시 사용 (계정 불필요) | Cloudflare API Token 필요 |
| **URL 형태** | `random-words.trycloudflare.com` | `myapp.yourdomain.com` |
| **URL 지속성** | 매번 변경됨 (임시) | 영구 고정 |
| **커스텀 도메인** | 불가 | 가능 |
| **DNS 관리** | 해당 없음 | `createDnsRecord()` CNAME 자동 생성 |
| **추천 용도** | 테스트, 임시 공유 | 프로덕션, 영구 운영 |
| **비용** | 무료 | 무료 (Cloudflare 계정 필요) |
| **Cloudflare Access** | 불가 | 연동 가능 (Zero Trust) |

### Brewnet의 터널 자동화 과정 (cloudflare-client.ts 기준)

```
  1. verifyToken(apiToken)        -> 토큰 유효성 + 이메일 확인
  2. getAccounts(apiToken)        -> 계정 목록 조회 / 자동 선택
  3. getZones(apiToken)           -> 도메인(Zone) 목록 조회
  4. createTunnel(apiToken, accountId, name)
     -> POST /accounts/{id}/cfd_tunnel
     -> tunnelId + tunnelToken 반환
  5. configureTunnelIngress(apiToken, accountId, tunnelId, domain, routes)
     -> PUT /accounts/{id}/cfd_tunnel/{id}/configurations
     -> 서비스별 인그레스 규칙 설정
  6. createDnsRecord(apiToken, zoneId, tunnelId, subdomain, domain)
     -> POST /zones/{id}/dns_records (upsert 패턴)
     -> CNAME: subdomain.domain -> tunnelId.cfargotunnel.com
```

---

<!-- ====================================================================== -->
<!-- PAGE 13: 도메인 연결                                                     -->
<!-- ====================================================================== -->

## 도메인 연결 3단계

### 도메인 연결 흐름

```
  Step 1                    Step 2                    Step 3
  +----------------+       +----------------+       +----------------+
  |  Cloudflare    |       |  Zone 선택      |       |  Tunnel 생성    |
  |  API Token     | ----> |                | ----> |                |
  |  입력          |       |  보유 도메인 중  |       |  자동 생성 후   |
  |                |       |  하나 선택      |       |  DNS 레코드     |
  |  dash.cloud    |       |                |       |  자동 등록      |
  |  flare.com     |       |  example.com   |       |                |
  |  에서 발급     |       |  mysite.dev    |       |  서비스별       |
  |                |       |  ...           |       |  CNAME 생성    |
  +----------------+       +----------------+       +----------------+
```

### Step 1: Cloudflare API Token 발급

필요한 권한:
- Account > Cloudflare Tunnel > Edit
- Zone > DNS > Edit

```
  1. dash.cloudflare.com 로그인
  2. Websites -> Add a site -> 도메인 등록
  3. 네임서버를 Cloudflare NS로 변경
  4. My Profile -> API Tokens -> Create Token
  5. "Edit Cloudflare Tunnel" 템플릿 선택
  6. 사용할 도메인(Zone) 지정
  7. Create Token -> 토큰 복사
```

### Step 2: Zone 선택

위저드가 `getZones(apiToken)`으로 보유한 Zone 목록을 자동 조회합니다.

### Step 3: Tunnel 생성 + DNS 자동 등록

```
  자동 실행 과정:

  1. createTunnel()        -> Tunnel ID + Token 발급
  2. cloudflared 컨테이너에 TUNNEL_TOKEN 자동 주입
  3. configureTunnelIngress() -> 서비스별 라우팅 규칙 등록
  4. createDnsRecord()     -> 서비스별 CNAME 자동 생성
     git.example.com    -> {tunnelId}.cfargotunnel.com
     cloud.example.com  -> {tunnelId}.cfargotunnel.com
     app.example.com    -> {tunnelId}.cfargotunnel.com
  5. 연결 확인             -> tunnel status: healthy
```

### 이후: 앱별 서브도메인 관리

```bash
# 새 앱 생성 시 자동 서브도메인 할당
brewnet create-app my-api --stack go-gin
# -> https://my-api.example.com 자동 연결

# 기존 앱에 도메인 연결
brewnet domain connect my-api --domain api.example.com

# 터널 상태 확인
brewnet domain tunnel status
```

---

<!-- ====================================================================== -->
<!-- PAGE 14: 비용 비교                                                       -->
<!-- ====================================================================== -->

## 비용 비교 -- 한눈에 보는 절약 효과

### Table 1: 월간 비용 비교

| 항목 | AWS/GCP (월) | Brewnet 홈 서버 (월) | 절약액 (월) |
|------|-------------|---------------------|------------|
| 서버 (EC2/VM) | $20~100 | 전기료 ~$5 | $15~95 |
| Git 호스팅 (GitHub Teams 등) | $4~20 | $0 (Gitea 셀프 호스팅) | $4~20 |
| 파일 저장소 (S3/Google Drive) | $5~20 | $0 (Nextcloud 로컬) | $5~20 |
| 데이터베이스 (RDS/Cloud SQL) | $7~50 | $0 (로컬 PostgreSQL) | $7~50 |
| 미디어 서버 (Plex Pass 등) | $5~15 | $0 (Jellyfin 무료) | $5~15 |
| CDN/터널 | $0~20 | $0 (Cloudflare 무료 플랜) | $0~20 |
| SSL 인증서 | $0~4 | $0 (Let's Encrypt 자동) | $0~4 |
| 도메인 | ~$1 | ~$1 | $0 |
| **합계** | **$42~230** | **~$6** | **$36~224** |

### Table 2: 시간 비교

| 작업 | 수동 설정 | Brewnet | 절약 시간 |
|------|----------|---------|----------|
| 서버 초기 구성 (Docker + Compose + Traefik) | 2~4시간 | 3분 (`brewnet init`) | 97% 절약 |
| SSL 인증서 설정 | 15~30분 | 자동 (Traefik + Let's Encrypt) | 100% 절약 |
| DNS + 터널 설정 | 30~60분 | 자동 (Cloudflare API 연동) | 100% 절약 |
| 새 앱 프로젝트 생성 + 배포 환경 | 1~2시간 | 30초 (`brewnet create-app`) | 98% 절약 |
| 서비스 추가 (DB, 파일서버 등) | 30~60분 | 10초 (`brewnet add`) | 99% 절약 |
| 배포 파이프라인 구축 (CI/CD) | 2~4시간 | 0분 (Git push -> 자동 배포) | 100% 절약 |
| 보안 설정 (네트워크 분리, 자격 증명) | 1~2시간 | 자동 (generate 단계에서 완료) | 100% 절약 |
| **총합** | **7~14시간** | **~5분** | **99% 절약** |

### Table 3: 자원 비교

| 자원 | 클라우드 호스팅 | Brewnet | 비고 |
|------|---------------|---------|------|
| 전문 지식 요구 | Docker + K8s + CI/CD + DNS + SSL | CLI 위저드 질문에 답변 | 진입 장벽 90% 감소 |
| 관리 도구 | AWS Console + GitHub + 별도 모니터링 | 단일 대시보드 (localhost:8088) | 관리 포인트 통합 |
| 설정 파일 수 | docker-compose + nginx.conf + CI yaml + .env ... | `brewnet init` 자동 생성 | 수동 작성 0개 |
| 데이터 주권 | 클라우드 사업자 서버에 저장 | 내 하드웨어에 100% 보관 | 완전한 소유권 |
| 확장 비용 | 월 과금 방식 (RAM/디스크/트래픽) | 하드웨어 1회 구매 | 지속 비용 없음 |
| 벤더 종속 | AWS/GCP/Azure 종속 | 표준 Docker Compose | 이식 자유 |

### 3년 TCO (Total Cost of Ownership)

| 항목 | 클라우드 | Brewnet |
|------|---------|---------|
| **초기 투자** | $0 | ~$0~500 (기존 PC 활용 시 $0) |
| **1년차 운영비** | $504~2,760 | ~$72 |
| **2년차 운영비** | $504~2,760 | ~$72 |
| **3년차 운영비** | $504~2,760 | ~$72 |
| **3년 총합** | **$1,512~8,280** | **$216~716** |
| **3년 절약** | - | **$1,296~7,564** |

---

<!-- ====================================================================== -->
<!-- PAGE 15: 성능 비교                                                       -->
<!-- ====================================================================== -->

## 성능 비교

### 홈 서버 vs 클라우드 성능 지표

| 지표 | 클라우드 호스팅 | Brewnet (홈 서버) | 비교 |
|------|----------------|-------------------|------|
| **네트워크 지연 (LAN)** | 20~50ms (인터넷 왕복) | <1ms (로컬 네트워크) | 20~50배 빠름 |
| **스토리지 I/O** | 100~500 MB/s (네트워크 스토리지) | 2,000~7,000 MB/s (NVMe SSD) | 4~70배 빠름 |
| **Cold Start** | 5~30초 (서버리스) | 0초 (항시 가동, `restart: unless-stopped`) | 즉시 응답 |
| **대역폭** | 제한됨 (전송량 과금) | 무제한 (가정 인터넷) | 비용 제한 없음 |
| **스토리지 용량** | 비례 과금 ($0.02~0.10/GB) | 디스크 크기까지 무제한 | 비용 무관 |

### 지연 시간 비교

```
  로컬 네트워크 접근 (Brewnet)
  +---------+     <1ms      +---------+
  |  Client | -----------> |  Server |
  | (같은   |              | (홈서버) |
  | 네트워크)|              |         |
  +---------+              +---------+


  클라우드 접근
  +---------+  10~25ms  +-----+  10~25ms  +---------+
  |  Client | --------> | ISP | --------> |  Cloud  |
  +---------+           +-----+           +---------+
                     총 왕복: 20~50ms


  Cloudflare Tunnel 외부 접근
  +---------+  ~10ms  +--------+  5~15ms  +---------+
  |  외부   | ------> |  CF    | -------> |  홈서버  |
  |  사용자 |         |  Edge  |  tunnel  |         |
  +---------+         +--------+          +---------+
                   총 왕복: 15~25ms
```

### 확장 유연성

| 항목 | 클라우드 | 홈 서버 (Brewnet) |
|------|---------|-------------------|
| **RAM 추가** | 요금제 변경 (즉시, 월 비용 증가) | RAM 장착 (1회 비용) |
| **디스크 추가** | GB 단위 과금 | SSD/HDD 추가 (1회 비용) |
| **GPU 활용** | 고가 ($1~4/시간) | 기존 GPU 활용 ($0, Jellyfin 하드웨어 트랜스코딩) |
| **항시 가동** | 기본 지원 | Docker `restart: unless-stopped` |

---

<!-- ====================================================================== -->
<!-- PAGE 16: 서비스 카탈로그                                                  -->
<!-- ====================================================================== -->

## 서비스 카탈로그 (SERVICE_REGISTRY + SERVICE_DETAIL_MAP)

### 인프라 서비스

| 서비스 | 설명 | 라이선스 |
|--------|------|---------|
| **Traefik** | Go 기반 리버스 프록시, Docker label 자동 발견, Let's Encrypt 자동 갱신 | MIT |
| **Nginx** | 고성능 HTTP 서버, 10K+ 동시 연결 지원 | BSD-2 |
| **Caddy** | 자동 HTTPS (Let's Encrypt zero-config), HTTP/2+HTTP/3 지원 | Apache-2.0 |
| **Cloudflare Tunnel** | 인바운드 포트 없이 서비스 외부 공개, DDoS 보호 포함 | Apache-2.0 |

### 애플리케이션 서비스

| 서비스 | 설명 | 라이선스 | 주요 기능 |
|--------|------|---------|----------|
| **Gitea** | 경량 셀프 호스팅 Git 서버 (~200MB 메모리) | MIT | GitHub-like 웹 UI, Actions CI/CD, OAuth2 |
| **Nextcloud** | 클라우드 파일 저장소 (Google Drive 대안) | AGPL-3.0 | 파일 동기화, 200+ 앱 확장, WebDAV |
| **MinIO** | S3 호환 오브젝트 스토리지 | AGPL-3.0 | S3 API, 웹 콘솔, IAM 정책 |
| **Jellyfin** | 미디어 스트리밍 서버 (Plex 대안) | GPL-2.0 | 영화/TV/음악, 하드웨어 트랜스코딩, DLNA |
| **FileBrowser** | 경량 웹 파일 관리자 | Apache-2.0 | 업로드/다운로드, 멀티 유저, 코드 에디터 |

### 데이터베이스 서비스

| 서비스 | 이미지 | 포트 | 네트워크 |
|--------|--------|------|----------|
| **PostgreSQL** | `postgres:18.3-alpine` | 5432 | brewnet-internal (호스트 미노출) |
| **MySQL** | `mysql:8.4` | 3306 | brewnet-internal (호스트 미노출) |
| **Redis** | redis (Nextcloud/Gitea 캐시용) | 6379 | brewnet-internal |
| **Valkey** | Redis 호환 포크 (Linux Foundation) | 6379 | brewnet-internal |
| **KeyDB** | 멀티스레드 Redis 호환 (더 높은 처리량) | 6379 | brewnet-internal |

### 관리 도구

| 서비스 | 설명 | 접근 |
|--------|------|------|
| **pgAdmin** | PostgreSQL 웹 관리 도구 (SQL 에디터, 백업/복원) | `pgadmin.*` 서브도메인 |
| **OpenSSH Server** | Docker 컨테이너 내 SSH/SFTP 원격 접속 | 포트 2222 |

---

<!-- ====================================================================== -->
<!-- PAGE 17: 다국어 지원                                                     -->
<!-- ====================================================================== -->

## 다국어 지원 (i18n)

### 구현 방식 (admin-ui/src/i18n/)

Brewnet Admin UI는 외부 라이브러리 없이 자체 구현한 i18n 시스템을 사용합니다.

```
  admin-ui/src/i18n/
  ├── context.tsx    # LocaleContext (React Context)
  ├── en.ts          # 영어 번역 키-값 맵
  ├── en-help.ts     # 영어 도움말 텍스트
  └── useI18n.ts     # useI18n() hook
```

### useI18n Hook 동작 원리

```typescript
  const { t, locale, setLocale } = useI18n();

  // 한국어가 기본 (fallback), 영어는 en.ts에서 조회
  t('key', '한국어 텍스트')             // KO: "한국어 텍스트", EN: en['key']
  t('key', '포트 {port}', { port })     // 변수 보간 지원
```

- **기본 언어**: 한국어 (코드에 inline으로 작성)
- **영어**: `en.ts` 파일에 키-값 매핑
- **변수 보간**: `{variable}` 형식 지원
- **언어 감지**: 브라우저 `navigator.language` 기반 자동 감지
- **영속성**: `localStorage`에 선택 저장, 다음 방문 시 유지
- **전환**: 페이지 새로고침 없이 실시간 전환 (React Context)

### 번역 범위

| 대상 | 언어 |
|------|------|
| Admin UI 전체 (메뉴, 버튼, 라벨, 모달, 에러 메시지) | 한국어 + 영어 |
| CLI 출력 | 영어 고정 (터미널 호환성) |
| 기술 용어 (Docker, Traefik, Tunnel 등) | 영어 고정 |
| 서비스 이름 (Gitea, Nextcloud 등) | 영어 고정 |
| 에러 코드 (BN001~BN010) | 영어 고정 |

---

<!-- ====================================================================== -->
<!-- PAGE 18: 완전한 삭제                                                     -->
<!-- ====================================================================== -->

## 완전한 삭제 -- 흔적 없는 제거

### One Command Uninstall

```bash
brewnet uninstall
```

### 삭제 과정

```
  brewnet uninstall
       |
       v
  +------------------------------------------+
  |  1. 확인 프롬프트                        |
  |     "정말 모든 서비스를 삭제하시겠습니까?" |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  2. Cloudflare 리소스 정리               |
  |     - Named Tunnel DNS 레코드 삭제       |
  |     - Tunnel 삭제 (deleteTunnel)         |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  3. Docker 컨테이너 중지 & 제거          |
  |     docker compose down --volumes        |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  4. Docker 볼륨 삭제                     |
  |     PostgreSQL, Redis, Gitea, Nextcloud  |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  5. Docker 네트워크 제거                  |
  |     brewnet, brewnet-internal             |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  6. 프로젝트 디렉터리 삭제                |
  |     ~/brewnet/<project-name>/ 전체 삭제  |
  +------------+-----------------------------+
               v
  +------------------------------------------+
  |  7. 완료                                 |
  |     "All services removed."              |
  +------------------------------------------+
```

### 삭제 옵션

| 옵션 | 동작 | 사용 시나리오 |
|------|------|-------------|
| `brewnet uninstall` | 전체 삭제 (컨테이너 + 볼륨 + CF 리소스 + 디렉터리) | 깨끗한 재설치 |
| `--dry-run` | 삭제 대상 미리 확인 (실제 변경 없음) | 삭제 전 확인 |
| `--keep-data` | Docker 볼륨(DB, 파일) 보존 | DB 데이터 유지하며 재구성 |
| `--keep-config` | 프로젝트 디렉터리 보존 (컨테이너만 중지) | 설정 유지하며 컨테이너 재생성 |
| `--force` | 확인 프롬프트 없이 강제 삭제 | 스크립트/자동화 |

### 재설치

```bash
# 삭제
brewnet uninstall

# 새 설치 (install.sh 재실행 불필요)
brewnet init
```

---

<!-- ====================================================================== -->
<!-- PAGE 19: 로드맵                                                         -->
<!-- ====================================================================== -->

## 로드맵

### Phase 1: CLI 안정화 (완료)

- [x] 7단계 대화형 설치 마법사
- [x] Docker 자동 설치 (macOS + Linux)
- [x] 6개 언어, 16개 보일러플레이트 스택
- [x] Cloudflare Tunnel (Quick + Named)
- [x] Git 기반 배포 파이프라인 (Gitea + Webhook)
- [x] React SPA Admin Dashboard (admin-ui)
- [x] 19개 CLI 명령어 (init ~ storage)
- [x] KO/EN 다국어 지원

### Phase 2: Dashboard Pro (진행 중)

```
  Next.js 14 App Router 기반 Pro Dashboard

  +----------+ +----------+ +----------+ +----------+
  | 브라우저  | | 실시간   | | 코드     | | 팀       |
  | 기반     | | 모니터링 | | 에디터   | | 관리     |
  | 설치     | |          | |          | |          |
  | 위저드   | | 서비스   | | Monaco   | | RBAC     |
  |          | | 메트릭   | | Editor   | | 접근     |
  | Step-by  | | 컨테이너 | | Git diff | | 제어     |
  | -step UI | | 리소스   | | 웹 편집  | |          |
  +----------+ +----------+ +----------+ +----------+

  기술 스택:
  Next.js 14 | Tailwind + shadcn/ui | Zustand
  TanStack Query | xterm.js | Monaco Editor
```

### Phase 3: 모바일 앱

- 모바일에서 서버 상태 확인 + 푸시 알림
- 원격 서비스 시작/중지
- iOS + Android (React Native)

### Phase 4: Multi-node Clustering

```
  +-------------+     +-------------+     +-------------+
  |   Node 1    |     |   Node 2    |     |   Node 3    |
  |  (Primary)  | <-->|  (Worker)   | <-->|  (Worker)   |
  |  Traefik    |     |  App Server |     |  DB Server  |
  |  Gitea      |     |  Media      |     |  Backup     |
  +-------------+     +-------------+     +-------------+
         |                   |                   |
         +-------------------+-------------------+
                    Docker Swarm / K3s
```

### Phase 5: Marketplace (커뮤니티 스택)

- 사용자가 만든 Docker 스택 공유/설치
- `brewnet add community/wordpress` 형태 원클릭 설치
- 검증된 Compose 템플릿 저장소 + 버전 관리

### Phase 6: 자동 업데이트

- CLI 자동 업데이트 메커니즘
- Docker 이미지 자동 업데이트 (선택적)
- 업데이트 전 자동 백업 + 롤백 지원

---

<!-- ====================================================================== -->
<!-- PAGE 20: 마무리                                                         -->
<!-- ====================================================================== -->

<div align="center">

## Your Home Server, Brewed Fresh

### 복잡한 인프라, 명령어 하나로 끝.

```
  +------------------------------------------+
  |                                          |
  |         npx brewnet init                 |
  |                                          |
  |   3분이면 나만의 서버가 완성됩니다.      |
  |                                          |
  +------------------------------------------+
```

---

### 핵심 수치

```
  +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
  | 19개  | | 16개  | | 6개   | | 7단계 | | ~3분  | | $5/월 |
  | CLI   | | 앱    | | 프로  | | 설치  | | 설치  | | 운영  |
  | 명령어| | 스택  | | 그래밍| | 위저드| | 시간  | | 비용  |
  |       | |       | | 언어  | |       | |       | |       |
  +-------+ +-------+ +-------+ +-------+ +-------+ +-------+

  +-------+ +-------+ +-------+ +-------+
  | 0개   | | 14개  | | KO/EN | | 100%  |
  | 노출  | | Docker| | 다국어| | 오픈  |
  | 포트  | | 서비스| | 지원  | | 소스  |
  |(터널) | |       | |       | |Apache |
  +-------+ +-------+ +-------+ +-------+
```

---

### 19개 CLI 명령어 (index.ts 기준)

| 명령어 | 설명 |
|--------|------|
| `brewnet init` | 대화형 설치 마법사 (7-Step Wizard) |
| `brewnet status` | 서비스 상태 확인 |
| `brewnet add <service>` | 서비스 추가 |
| `brewnet remove <service>` | 서비스 제거 |
| `brewnet up` | 전체 서비스 시작 (docker compose up) |
| `brewnet down` | 전체 서비스 중지 |
| `brewnet logs [service]` | 서비스 로그 확인 |
| `brewnet backup` | 백업 생성 |
| `brewnet restore <id>` | 백업 복원 |
| `brewnet admin` | 웹 대시보드 시작 (localhost:8088) |
| `brewnet shutdown` | Admin 서버 종료 |
| `brewnet uninstall` | 전체 삭제 (컨테이너 + 볼륨 + 설정) |
| `brewnet domain` | 도메인 관리 (connect/disconnect/tunnel) |
| `brewnet create-app <name>` | 보일러플레이트 앱 생성 |
| `brewnet list` | 앱 목록 조회 |
| `brewnet update` | 서비스 업데이트 |
| `brewnet deploy <path>` | 앱 배포 |
| `brewnet export` | 설정 내보내기 |
| `brewnet storage` | 파일 저장소 관리 |

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

### 프로젝트 정보

| 항목 | 내용 |
|------|------|
| **GitHub** | [github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet) |
| **License** | Apache License 2.0 |
| **Language** | TypeScript 5 |
| **Runtime** | Node.js 20+ |
| **Platform** | macOS 12+ / Ubuntu 20.04+ / Linux |

---

**Star on GitHub**

프로젝트가 도움이 되었다면, GitHub Star로 응원해 주세요.

[github.com/claude-code-expert/brewnet](https://github.com/claude-code-expert/brewnet)

</div>

---

*Brewnet -- Your Home Server, Brewed Fresh*
*Copyright 2025-2026 Brewnet (codevillain) | Apache License 2.0*
