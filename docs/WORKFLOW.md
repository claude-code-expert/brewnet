# Brewnet WORKFLOW.md — Development Reference

> **Version**: 2.1
> **Last Updated**: 2026-02-22
> **Status**: Draft

---

## Context

REQUIREMENT.md (v2.1)와 USER-STORY.md (v2.1), wizard.js 데이터 구조를 교차 분석하여 `brewnet init` 위자드의 전체 플로우를 단계별로 정리한다. 이 문서는 CLI 개발 시 각 단계의 입력/출력/옵션/조건/데이터 흐름을 파악하기 위한 레퍼런스다.

---

## 전체 위자드 플로우 (8단계: Step 0~7)

```
Step 0: System Check
  ↓
Step 1: Project Setup (name, path, setupType)
  ↓
Step 2: Admin Account + Server Components (7개 카드, Web+Git 필수)
  ↓
Step 3: Runtime & Boilerplate + FileBrowser ← 조건부: appServer.enabled === true 일 때만
  ↓
Step 4: Domain & Network + Mail Server ← Mail은 조건부: provider !== 'local'
  ↓
Step 5: Review & Confirm
  ↓
Step 6: Generate (파일 생성 + 서비스 시작)
  ↓
Step 7: Complete (엔드포인트 + 자격증명 요약)
```

---

## Step 0: System Check

> REQ-1.2 / USER-STORY §1

### 검증 항목

| 항목 | 검증 | 최소 요구 | REQ |
|------|------|----------|-----|
| OS | macOS / Linux 감지 | macOS 12+ / Ubuntu 20.04+ | REQ-1.2.1 |
| Docker | docker + docker compose 설치 여부 | 24.0+ | REQ-1.2.2 |
| Node.js | 버전 확인 | v20+ | REQ-1.2.3 |
| Disk | 여유 공간 | 20GB 이상 | REQ-1.2.4 |
| RAM | 메모리 확인 | 2GB 이상 | REQ-1.2.5 |
| Ports | 80, 443, 2222 사용 가능 여부 | — | REQ-1.2.6 |
| Git | 설치 여부 | — | REQ-1.2.7 |

### 출력
- 각 항목 `[OK]` / `[FAIL]` 표시
- 하나라도 FAIL → 설치 가이드 표시 후 종료
- 모두 통과 → Enter로 다음 단계

### 데이터 저장
- 없음 (검증 결과는 저장하지 않음, 통과해야 다음으로 진행)

---

## Step 1: Project Setup

> REQ-1.3.2, REQ-1.4 / USER-STORY §2

### 입력 필드

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `projectName` | string | `'my-homeserver'` | 프로젝트 이름 |
| `projectPath` | string | `'~/brewnet/my-homeserver'` | 프로젝트 경로 (projectName 연동) |
| `setupType` | enum | `'full'` | `'full'` \| `'partial'` |

### Setup Type 차이

| | Full Install | Partial Install |
|--|-------------|-----------------|
| Web Server | ON (required) | ON (required) |
| Git Server | ON (required) | ON (required) |
| App Server | **ON** | OFF |
| DB Server | **ON** (PostgreSQL + Redis) | OFF |
| File Server | OFF | OFF |
| Media | OFF | OFF |
| SSH Server | OFF | OFF |

### 데이터 저장
```
state.projectName = 'my-homeserver'
state.projectPath = '~/brewnet/my-homeserver'
state.setupType = 'full'
```

---

## Step 2: Admin Account + Server Components

> REQ-1.3.3, REQ-1.3.4, REQ-1.5, REQ-1.8, REQ-1.11, REQ-1.13 / USER-STORY §3

이 단계는 **Admin Account** 입력 후 **7개 서버 컴포넌트 카드** (Web Server + Git Server 필수, 5개 선택)를 토글/설정한다.

### 2-A. Admin Account

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `admin.username` | string | `'admin'` | 관리자 사용자명 | REQ-1.8.1 |
| `admin.password` | string | (auto-gen 20자) | 자동 생성 비밀번호 (수락 또는 직접 입력) | REQ-1.8.2, 1.8.3 |
| `admin.storage` | enum | `'local'` | 저장 방식 (`local` = .env, chmod 600) | REQ-1.8.4, 1.8.5 |

**비밀번호 자동 생성 규칙** (wizard.js `generatePassword`):
- 길이: 16자 (관리자용은 20자)
- 문자셋: a-n,p-z (o제외) + A-H,J-N,P-Z (I,O제외) + 2-9 (0,1제외)
- 혼동 방지: 0/O, 1/l/I 제외

**크리덴셜 전파** (REQ-1.13): 이 계정이 아래 서비스들의 기본 관리자 계정으로 사용됨
- Nextcloud admin → `admin / ADMIN_PASSWORD`
- pgAdmin admin → `admin / ADMIN_PASSWORD`
- Jellyfin admin → `admin / ADMIN_PASSWORD`
- Gitea admin → `admin / ADMIN_PASSWORD`
- FileBrowser admin → `admin / ADMIN_PASSWORD`
- SSH Server → `admin` (key-based 인증)
- Mail Server → `admin@{DOMAIN} / ADMIN_PASSWORD`

### 2-B. Web Server (Required — 항상 ON)

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `servers.webServer.enabled` | boolean | `true` | 항상 true (비활성화 불가) |
| `servers.webServer.service` | enum | `'traefik'` | `'traefik'` \| `'nginx'` \| `'caddy'` |

| 옵션 | 설명 | 라이선스 | 포트 | Docker 이미지 |
|------|------|---------|------|---------------|
| **traefik** (권장) | Cloud-native reverse proxy, Docker label 자동 디스커버리 | MIT | 80, 443, 8080 | `traefik:v3.0` |
| nginx | High performance reverse proxy | BSD-2 | 80, 443 | `nginx:1.25-alpine` |
| caddy | Automatic HTTPS reverse proxy | Apache-2.0 | 80, 443 | `caddy:2-alpine` |

### 2-C. File Server (Optional)

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `servers.fileServer.enabled` | boolean | `false` | 토글 on/off |
| `servers.fileServer.service` | enum | `''` | `'nextcloud'` \| `'minio'` |

| 옵션 | 설명 | 라이선스 | 포트 | 서브도메인 | Docker 이미지 |
|------|------|---------|------|-----------|---------------|
| **nextcloud** (권장) | Full cloud suite (파일, 캘린더, 연락처) | AGPL-3.0 | 443 | `cloud.{DOMAIN}` | `nextcloud:29-apache` |
| minio | S3-compatible object storage | AGPL-3.0 | 9000 | `minio.{DOMAIN}` | `minio/minio:latest` |

### 2-D. App Server (Optional)

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `servers.appServer.enabled` | boolean | Full→`true`, Partial→`false` | 토글만. 상세 설정은 Step 3 |

- ON → Step 3 (Runtime & Boilerplate)가 활성화됨
- OFF → Step 3 스킵

### 2-E. DB Server (Optional)

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `servers.dbServer.enabled` | boolean | Full→`true`, Partial→`false` | 토글 |
| `servers.dbServer.primary` | enum | `''` | `'postgresql'` \| `'mysql'` \| `'mariadb'` \| `'sqlite'` |
| `servers.dbServer.primaryVersion` | string | `''` | 선택한 DB의 버전 |
| `servers.dbServer.dbName` | string | `'brewnet_db'` | 데이터베이스 이름 |
| `servers.dbServer.dbUser` | string | `'brewnet'` | DB 사용자 |
| `servers.dbServer.dbPassword` | string | (auto-gen 16자) | DB 비밀번호 |
| `servers.dbServer.adminUI` | boolean | `true` | pgAdmin 활성화 (SQLite 제외) |
| `servers.dbServer.cache` | enum | `''` | `'redis'` \| `'valkey'` \| `'keydb'` \| `''` |

**Primary DB 옵션:**

| ID | 이름 | 버전 | 이미지 | RAM | REQ |
|----|------|------|--------|-----|-----|
| **postgresql** (권장) | PostgreSQL | 17, 16, 15 | `postgres:17-alpine` | 120MB | REQ-1.6.1 |
| mysql | MySQL | 8.4, 8.0 | `mysql:8.4` | 256MB | REQ-1.6.1 |
| mariadb | MariaDB | 11, 10.11 | `mariadb:11` | 200MB | REQ-1.6.1 |
| sqlite | SQLite | 3 | (컨테이너 없음) | 0MB | REQ-1.6.1 |

**Cache 옵션:**

| ID | 이름 | 이미지 | RAM | REQ |
|----|------|--------|-----|-----|
| **redis** (권장) | Redis | `redis:7-alpine` | 12MB | REQ-1.6.2 |
| valkey | Valkey | `valkey/valkey:7-alpine` | 12MB | REQ-1.6.2 |
| keydb | KeyDB | `eqalpha/keydb:latest` | 16MB | REQ-1.6.2 |

**조건부 로직:**
- SQLite 선택 시: 컨테이너 생성 안 됨, adminUI(pgAdmin) 비활성화
- pgAdmin: primary가 sqlite가 아니고 adminUI===true 일 때만 → `dpage/pgadmin4:latest` (128MB)

### 2-F. Media (Optional)

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `servers.media.enabled` | boolean | `false` | 토글 |
| `servers.media.services` | string[] | `[]` | `['jellyfin']` |

| 옵션 | 설명 | 라이선스 | 포트 | 서브도메인 | Docker 이미지 | RAM |
|------|------|---------|------|-----------|---------------|-----|
| jellyfin | Media streaming server | GPL-2.0 | 8096 | `jellyfin.{DOMAIN}` | `jellyfin/jellyfin:latest` | 256MB |

### 2-G. SSH Server (Optional)

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `servers.sshServer.enabled` | boolean | `false` | 토글 | REQ-1.11.1 |
| `servers.sshServer.port` | number | `2222` | SSH 포트 | REQ-1.11.1 |
| `servers.sshServer.passwordAuth` | boolean | `false` | 패스워드 인증 (기본 OFF, key-only) | REQ-1.11.2 |
| `servers.sshServer.sftp` | boolean | `false` | SFTP 서브시스템 | REQ-1.11.3 |

**SFTP 자동 제안 조건:**
- `fileServer.enabled === true` OR `media.enabled === true` → SFTP ON 자동 권장
- Docker 이미지: `linuxserver/openssh-server:latest` (16MB)

### 2-H. Git Server (Required — 항상 ON)

> REQ-1.5.8, REQ-4.1 / USER-STORY §3

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `servers.gitServer.enabled` | boolean | `true` | 항상 true (비활성화 불가) | REQ-1.5.8 |
| `servers.gitServer.service` | string | `'gitea'` | 고정 (Gitea) | REQ-4.1.1 |
| `servers.gitServer.port` | number | `3000` | Gitea 웹 UI 포트 | REQ-4.1.7 |
| `servers.gitServer.sshPort` | number | `3022` | Git SSH 포트 (SSH Server 2222와 분리) | REQ-4.1.4 |

**필수 컴포넌트:**
- Web Server와 함께 항상 활성화 (비활성화 불가)
- 홈서버의 코드 버전 관리 및 배포 파이프라인의 핵심 인프라

| 항목 | 값 |
|------|-----|
| Docker 이미지 | `gitea/gitea:latest` (256MB) |
| 웹 UI | `https://git.{DOMAIN}` |
| Git SSH | `ssh://git@{DOMAIN}:3022/{user}/{repo}.git` |
| Git HTTP | `https://git.{DOMAIN}/{user}/{repo}.git` |

**기능:**
- Admin 크리덴셜 전파 → Gitea admin 계정
- 저장소 CRUD (`brewnet git repo create/list/delete`)
- Webhook → 자동 배포 파이프라인 (`git push` → 빌드 → 배포, REQ-4.2)
- SSH 키 기반 Push/Pull

**포트 분리 (SSH Server와 공존 시):**
- SSH Server (OpenSSH): 포트 `2222` — 쉘 접근, SFTP
- Git Server (Gitea): 포트 `3022` — Git SSH 전용

### Step 2 출력: Component Summary
- 필수 컴포넌트: Web Server, Git Server (항상 활성화)
- 선택된 추가 컴포넌트 목록
- `getCredentialTargets(state)` → 크리덴셜 전파 대상 목록 (Gitea, FileBrowser 포함)
- `estimateResources(state)` → 컨테이너 수, RAM, Disk 예측

---

## Step 3: Runtime & Boilerplate (조건부)

> REQ-1.3.5, REQ-12.1 / USER-STORY §4

**표시 조건:** `servers.appServer.enabled === true`
**스킵 조건:** `servers.appServer.enabled === false` → Step 4로 이동

### 3-A. Language Selection

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `devStack.language` | enum | `''` | `'python'` \| `'nodejs'` \| `'java'` \| `'rust'` \| `'go'` |

| Language | 표시명 | 기본 포트 |
|----------|--------|----------|
| python | Python 3.12 | 8000 |
| nodejs | Node.js 20 LTS | 3000 |
| java | Java 21 (Eclipse Temurin) | 8080 |
| rust | Rust (latest) | 8080 |
| go | Go 1.22 | 8080 |

### 3-B. Framework Selection (언어별 동적)

| 필드 | 타입 | 기본값 |
|------|------|--------|
| `devStack.framework` | enum | `''` |

**Python:**

| ID | 이름 | 설명 | 포트 |
|----|------|------|------|
| **fastapi** | FastAPI | Modern async API framework | 8000 |
| django | Django | Full-featured web framework | 8000 |
| flask | Flask | Lightweight micro framework | 5000 |

**Node.js:**

| ID | 이름 | 설명 | 포트 |
|----|------|------|------|
| nextjs | Next.js | React full-stack framework | 3000 |
| express | Express | Minimal web framework | 3000 |
| nestjs | NestJS | Enterprise Node.js framework | 3000 |
| fastify | Fastify | Fast web framework | 3000 |

**Java:**

| ID | 이름 | 설명 | 포트 |
|----|------|------|------|
| spring | Spring Boot | Enterprise Java framework | 8080 |
| quarkus | Quarkus | Cloud-native Java | 8080 |
| micronaut | Micronaut | Lightweight framework | 8080 |

**Rust:**

| ID | 이름 | 설명 | 포트 |
|----|------|------|------|
| actix | Actix Web | High performance | 8080 |
| axum | Axum | Ergonomic framework | 8080 |

**Go:**

| ID | 이름 | 설명 | 포트 |
|----|------|------|------|
| gin | Gin | HTTP web framework | 8080 |
| echo | Echo | High performance framework | 8080 |
| fiber | Fiber | Express-inspired framework | 8080 |

### 3-C. Boilerplate Options

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `boilerplate.generate` | boolean | `true` | 프로젝트 스캐폴딩 생성 여부 |
| `boilerplate.sampleData` | boolean | `true` | 샘플 데이터 (User/Post 엔티티) 포함 여부 |
| `boilerplate.devMode` | enum | `'hot-reload'` | `'hot-reload'` (소스 볼륨 마운트) \| `'production'` |

### 3-D. FileBrowser (App Server 기본 포함)

> REQ-9.3

App Server 활성화 시 **FileBrowser**가 기본으로 포함된다. `filebrowser/filebrowser:latest` Docker 이미지를 사용하여 웹 기반 파일 관리 UI를 제공하며, 앱의 파일 업로드/다운로드 스토리지와 연동된다.

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `appStorage.enabled` | boolean | `true` | App Server ON 시 자동 활성화 | REQ-9.3.1 |
| `appStorage.path` | string | `'./storage'` | 스토리지 경로 (프로젝트 상대 경로) | REQ-9.3.2 |
| `appStorage.maxSize` | string | `''` | 용량 제한 (빈 값 = 무제한) | REQ-9.3.4 |

**FileBrowser 정보:**

| 항목 | 값 |
|------|-----|
| Docker 이미지 | `filebrowser/filebrowser:latest` (~50MB RAM) |
| 웹 UI | `https://files.{DOMAIN}` |
| 내부 포트 | 80 |
| 인증 | JWT 기반 (Admin 크리덴셜 전파) |
| API | REST API (`/api/login`, `/api/resources/{path}`, `/api/raw/{path}`) |

**스토리지 디렉토리 구조:**

```
{projectPath}/storage/
├── {userId}/             ← 사용자별 디렉토리 격리 (FileBrowser scope)
│   ├── images/
│   ├── documents/
│   └── ...
├── public/               ← 공개 파일 (인증 불필요)
├── temp/                 ← 임시 파일 (자동 정리)
└── backups/              ← 파일 백업
```

**FileBrowser REST API:**

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/login` | JWT 토큰 발급 (username + password) |
| `GET` | `/api/resources/{path}` | 파일/디렉토리 메타데이터 조회 |
| `POST` | `/api/resources/{path}` | 파일 업로드 |
| `PUT` | `/api/resources/{path}` | 파일 수정/이동/이름변경 |
| `DELETE` | `/api/resources/{path}` | 파일/디렉토리 삭제 |
| `GET` | `/api/raw/{path}` | 파일 직접 다운로드 (raw) |

**Docker 볼륨 매핑:**
```yaml
volumes:
  - ./storage:/srv                          # 파일 데이터
  - ./config/filebrowser.json:/config/filebrowser.json  # 설정
  - ./data/filebrowser/database.db:/database.db         # FileBrowser DB
```

**사용자 디렉토리 격리:**
- FileBrowser의 `scope` 설정으로 사용자별 디렉토리 제한
- Admin: 전체 `/srv` 접근 가능
- 일반 사용자: `/srv/{username}` 만 접근 가능
- 앱 컨테이너에서는 `./storage:/app/storage` 볼륨으로 동일 디렉토리 접근

**Traefik 라우팅:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.filebrowser.rule=Host(`files.${DOMAIN}`)"
  - "traefik.http.services.filebrowser.loadbalancer.server.port=80"
```

---

## Step 4: Domain & Network

> REQ-1.3.6, REQ-1.7, REQ-1.9, REQ-1.10, REQ-1.12 / USER-STORY §5

### 4-A. Domain Provider Selection

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `domain.provider` | enum | `'local'` | `'local'` \| `'freedomain'` \| `'custom'` |

| Provider | 도메인 예시 | 외부 접근 | SSL | 비용 |
|----------|-----------|----------|-----|------|
| **local** | `brewnet.local` | 불가 (홈 네트워크만) | Self-signed | 무료 |
| **freedomain** (권장) | `myserver.dpdns.org` | 가능 (Cloudflare Tunnel) | Auto HTTPS | 무료 |
| **custom** | `homeserver.example.com` | 가능 (Cloudflare Tunnel) | Auto HTTPS | 도메인 비용 |

### 4-B. Local Only 선택 시

| 필드 | 값 |
|------|-----|
| `domain.name` | 사용자 입력 (기본: `brewnet.local`) |
| `domain.ssl` | `'self-signed'` |
| `domain.cloudflare.enabled` | `false` |

- `/etc/hosts` 설정 필요 (자동 설정 옵션 제공)
- 서브도메인: `{service}.brewnet.local`
- Mail Server 표시 안 됨 (외부 도메인 필요)

### 4-C. Free Domain (DigitalPlat) 선택 시

**Free Domain TLD 옵션:**

| 필드 | 타입 | 기본값 |
|------|------|--------|
| `domain.freeDomainTld` | enum | `'.dpdns.org'` |

| TLD | 설명 | 권장 |
|-----|------|:----:|
| `.dpdns.org` | 가장 안정적, 즉시 작동 | **권장** |
| `.qzz.io` | 짧은 확장자 | — |
| `.us.kg` | GitHub 계정 인증 필요 | — |

**등록 가이드 (8단계):**
1. Cloudflare 계정 생성 → dash.cloudflare.com
2. DigitalPlat FreeDomain 방문 → dash.domain.digitalplat.org
3. DigitalPlat 계정 등록/로그인
4. 도메인명 검색 → 가용성 확인
5. 도메인 등록 (TLD 선택)
6. Cloudflare 네임서버 설정 → NS 입력
7. DNS 전파 대기 (15분~24시간)
8. 위저드로 돌아와 도메인명 입력

| 필드 | 값 |
|------|-----|
| `domain.name` | 사용자 입력 (예: `myserver.dpdns.org`) |
| `domain.ssl` | `'cloudflare'` |
| `domain.cloudflare.enabled` | `true` (자동) |

### 4-D. Custom Domain 선택 시

| 필드 | 값 |
|------|-----|
| `domain.name` | 사용자 입력 (예: `homeserver.example.com`) |
| `domain.ssl` | `'cloudflare'` |
| `domain.cloudflare.enabled` | `true` (자동) |

### 4-E. Cloudflare Tunnel (freedomain / custom 전용)

> REQ-1.10 / USER-STORY §5.2

**표시 조건:** `domain.provider !== 'local'`

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `domain.cloudflare.enabled` | boolean | `true` (자동) | 외부 접근 필수 | REQ-1.10.1 |
| `domain.cloudflare.tunnelToken` | string | `''` | Cloudflare Zero Trust 터널 토큰 | REQ-1.10.6 |
| `domain.cloudflare.tunnelName` | string | `''` | 터널 이름 | — |

**터널 토큰 생성 방법:**
1. Cloudflare Zero Trust 대시보드 → one.dash.cloudflare.com
2. Networks → Tunnels → Create a Tunnel
3. 토큰 복사 (eyJ... 형태)

- Docker 이미지: `cloudflare/cloudflared:latest` (32MB)
- 포트포워딩 불필요 — NAT/CGNAT 우회
- 자동 HTTPS 제공

### 4-F. Mail Server (조건부)

> REQ-1.12 / USER-STORY §5.3

**표시 조건:** `domain.provider !== 'local'` (외부 도메인 필요)

| 필드 | 타입 | 기본값 | 설명 | REQ |
|------|------|--------|------|-----|
| `servers.mailServer.enabled` | boolean | `false` | 토글 | REQ-1.12.1 |
| `servers.mailServer.service` | string | `'docker-mailserver'` | 고정 | REQ-1.12.2 |

**Mail 설정 (자동):**

| 항목 | 값 | 포트 |
|------|-----|------|
| SMTP | `smtp.{DOMAIN}` | 587 (STARTTLS) |
| IMAP | `imap.{DOMAIN}` | 993 (SSL/TLS) |
| Webmail | `mail.{DOMAIN}` (Roundcube) | 443 |
| Postmaster | `admin@{DOMAIN}` | — |

- Docker 이미지: `ghcr.io/docker-mailserver/docker-mailserver:latest` (256MB)
- Webmail: `roundcube/roundcubemail:latest`
- Postmaster 비밀번호 = Admin 비밀번호 (크리덴셜 전파)
- DNS 레코드 (Phase 2): MX, SPF, DKIM, DMARC → REQ-1.12.6~9

---

## Step 5: Review & Confirm

> REQ-1.3.7 / USER-STORY §6

### 표시 항목
1. **Project 정보**: projectName, projectPath, setupType
2. **Admin Account**: username, password(마스킹)
3. **Server Components**: 필수(Web+Git) + 선택 카드 상태 + 옵션 값
4. **Runtime & Boilerplate** (appServer 활성화 시): language, framework, boilerplate 옵션
5. **FileBrowser** (appServer 활성화 시): `files.{DOMAIN}` URL, storage path
6. **Domain & Network**: provider, domain name, tunnel 상태, SSL
7. **Mail Server** (활성화 시): 프로토콜, postmaster
8. **Credential Propagation**: `getCredentialTargets(state)` → 대상 서비스 목록 (Gitea, FileBrowser 포함)
9. **Resources**: `estimateResources(state)` → 컨테이너 수, RAM, Disk

### 사용자 선택
- **Generate** → Step 6으로 진행
- **Modify** → 이전 단계로 돌아가 수정
- **Export** → `brewnet.config.json` 파일 다운로드 (REQ-2.2.8)

---

## Step 6: Generate

> REQ-1.3.8, REQ-2.1 / USER-STORY §7

### 6단계 실행 순서

| # | 단계 | 설명 | REQ |
|---|------|------|-----|
| 1 | 파일 생성 | docker-compose.yml, .env, Makefile, 서비스별 설정 파일 | REQ-2.1.1~7 |
| 2 | Docker 이미지 풀 | `collectAllServices(state)` 기반 이미지 다운로드 | — |
| 3 | 컨테이너 시작 | `docker-compose up -d` | REQ-2.2.1 |
| 4 | 헬스체크 | 모든 컨테이너 healthy 확인 | REQ-2.1.7 |
| 5 | 크리덴셜 전파 | Admin → Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, SSH, Mail | REQ-1.13.2 |
| 6 | 외부 접근 검증 | DNS, Tunnel, HTTPS, SSH 포트 확인 (non-local만) | REQ-1.14 |

### 생성 파일 목록

```
{projectPath}/
├── docker-compose.yml          ← 메인 Compose (모든 서비스)
├── docker-compose.dev.yml      ← 개발 오버라이드 (hot-reload)
├── .env                        ← 환경 변수 (chmod 600)
├── .env.example                ← 템플릿 (비밀 제외)
├── Makefile
├── README.md
├── infrastructure/
│   ├── traefik/                ← Web Server 설정
│   ├── ssh/                    ← SSH 설정 (sshd_config, host_keys, sftp.conf)
│   ├── mail/                   ← Mail 설정 (postfix, dovecot, roundcube)
│   └── filebrowser/            ← FileBrowser 설정 (filebrowser.json, database.db)
├── databases/
│   ├── {primary}/init/         ← DB 초기화 스크립트
│   └── {cache}/                ← 캐시 설정
├── apps/
│   └── {framework}-app/        ← 보일러플레이트 (Dockerfile, src/)
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   ├── update.sh
│   └── health-check.sh
└── docs/
    ├── SETUP.md
    ├── SERVICES.md
    └── TROUBLESHOOTING.md
```

### .env 파일 생성 내용

```bash
# Admin
ADMIN_USERNAME={admin.username}
ADMIN_PASSWORD={admin.password}

# Domain
DOMAIN={domain.name}
DOMAIN_PROVIDER={domain.provider}
SSL_MODE={domain.ssl}

# Cloudflare (freedomain/custom)
CLOUDFLARE_TUNNEL_TOKEN={domain.cloudflare.tunnelToken}

# Git Server (required)
GITEA_ADMIN_USER={admin.username}
GITEA_ADMIN_PASSWORD={admin.password}
GITEA_SSH_PORT=3022

# Database
DB_NAME={dbServer.dbName}
DB_USER={dbServer.dbUser}
DB_PASSWORD={dbServer.dbPassword}

# FileBrowser (appServer enabled)
FB_ROOT=/srv
FB_CONFIG=/config/filebrowser.json
FB_DATABASE=/database.db

# SSH
SSH_PORT={sshServer.port}
SSH_AUTH_METHOD={key|password|both}
SSH_SFTP_ENABLED={sshServer.sftp}

# Mail
MAIL_DOMAIN={domain.name}
MAIL_POSTMASTER=admin@{domain.name}
MAIL_SMTP_PORT=587
MAIL_IMAP_PORT=993

# App
JWT_SECRET=(auto-generated)
```

### Docker 네트워크 (REQ-2.4)

| 네트워크 | 타입 | 용도 |
|----------|------|------|
| `brewnet` | bridge | 서비스 간 통신 (기본) |
| `brewnet-internal` | internal | DB 격리 (외부 접근 차단) |

---

## Step 7: Complete

> REQ-1.3.9, REQ-1.14 / USER-STORY §8

### 표시 항목

**1. 서비스 엔드포인트:**

| 서비스 | URL 형태 | 조건 |
|--------|---------|------|
| Web Server | `https://traefik.{DOMAIN}` | 항상 (필수) |
| Git Server | `https://git.{DOMAIN}` | 항상 (필수) |
| Git SSH | `ssh://git@{DOMAIN}:3022/{user}/{repo}.git` | 항상 (필수) |
| File Server | `https://cloud.{DOMAIN}` (Nextcloud) / `https://minio.{DOMAIN}` | fileServer.enabled |
| App | `https://{framework}.{DOMAIN}` | appServer.enabled |
| FileBrowser | `https://files.{DOMAIN}` | appServer.enabled (기본 포함) |
| Media | `https://jellyfin.{DOMAIN}` | media.enabled |
| Webmail | `https://mail.{DOMAIN}` | mailServer.enabled |
| DB | `localhost:{port}` (외부 노출 안 됨) | dbServer.enabled |
| SSH | `ssh admin@{DOMAIN} -p {port}` | sshServer.enabled |
| SFTP | `sftp -P {port} admin@{DOMAIN}` | sshServer.sftp |
| SMTP | `smtp.{DOMAIN}:587` | mailServer.enabled |
| IMAP | `imap.{DOMAIN}:993` | mailServer.enabled |

**2. 크리덴셜 요약 테이블:**
- 서비스별 로그인 정보 (admin / .env 참조)

**3. 외부 접근 검증 (non-local만, REQ-1.14):**

| 검증 항목 | 명령어 | 기대 결과 | REQ |
|----------|--------|----------|-----|
| DNS Resolution | `dig {DOMAIN} +short` | Cloudflare IP | REQ-1.14.1 |
| HTTPS Access | `curl -I https://{service}.{DOMAIN}` | HTTP/2 200 | REQ-1.14.3 |
| Tunnel Status | `brewnet domain tunnel status` | "connected" | REQ-1.14.2 |
| SSH Access | `ssh -p {port} admin@{DOMAIN} "echo connected"` | "connected" | REQ-1.14.4 |
| Mail Status | `brewnet status mailserver` | "running" | — |

**4. 트러블슈팅:**
- DNS 미전파 → 5-10분 대기
- HTTPS 불가 → Cloudflare 대시보드 확인
- Tunnel 오프라인 → `brewnet logs cloudflared`
- SSH 거부 → 터널 config에 포트 2222 확인
- 502 Bad Gateway → 컨테이너 실행 상태 + 네트워크 확인
- SSL 무한 리다이렉트 → Cloudflare SSL 모드 Full로 변경
- 터널 끊김 → 토큰 만료/네트워크 문제 확인

**5. 다음 단계 명령어:**

| 명령어 | 설명 |
|--------|------|
| `brewnet status` | 전체 서비스 상태 |
| `brewnet logs <service>` | 서비스 로그 |
| `brewnet credentials` | 전체 크리덴셜 표시 |
| `brewnet ssh add-user <name>` | SSH 사용자 추가 |
| `brewnet mail test <email>` | 테스트 메일 발송 |
| `brewnet mail dns-check` | 메일 DNS 레코드 확인 |
| `brewnet storage monitor` | 스토리지 사용량 |
| `brewnet backup` | 백업 생성 |

---

## 데이터 흐름 요약

```
Step 0: (검증만, 데이터 저장 없음)
  ↓
Step 1: state.projectName, projectPath, setupType ← 사용자 입력
  ↓
Step 2: state.admin.{username,password}
         state.servers.webServer (필수), gitServer (필수)
         state.servers.{fileServer,appServer,dbServer,media,sshServer} ← 카드 토글+설정
  ↓
Step 3: state.devStack.{language,framework}
         state.boilerplate.{generate,sampleData,devMode}
         state.appStorage.{enabled,path,maxSize} + FileBrowser ← (조건부: appServer ON)
  ↓
Step 4: state.domain.{provider,name,ssl,freeDomainTld}
         state.domain.cloudflare.{enabled,tunnelToken,tunnelName}
         state.servers.mailServer.{enabled} ← (조건부: provider !== local)
  ↓
Step 5: 전체 state 읽기 → 리뷰 표시 (수정 가능)
  ↓
Step 6: state → docker-compose.yml, .env, 설정 파일 생성 → 서비스 시작
  ↓
Step 7: state → 엔드포인트 URL, 크리덴셜 요약 표시
```

---

## 핵심 유틸리티 함수 (개발 시 구현 필요)

| 함수 | 입력 | 출력 | 용도 |
|------|------|------|------|
| `generatePassword(len)` | 길이 (기본 16) | string | 비밀번호 자동 생성 |
| `countSelectedServices(state)` | state | number | 총 컨테이너 수 |
| `estimateResources(state)` | state | {containers, ramMB, ramGB, diskGB} | 리소스 예측 |
| `collectAllServices(state)` | state | string[] | docker-compose용 서비스 ID 목록 |
| `getCredentialTargets(state)` | state | string[] | 크리덴셜 전파 대상 서비스명 |
| `getImageName(serviceId)` | string | string | 서비스 → Docker 이미지 매핑 |

---

## Docker 이미지 전체 목록 (18개)

| ID | Docker Image | 포트 | 용도 |
|----|-------------|------|------|
| traefik | `traefik:v3.0` | 80, 443, 8080 | Web Server (필수) |
| nginx | `nginx:1.25-alpine` | 80, 443 | Web Server (대안) |
| caddy | `caddy:2-alpine` | 80, 443 | Web Server (대안) |
| gitea | `gitea/gitea:latest` | 3000, 3022 | Git Server (필수) |
| filebrowser | `filebrowser/filebrowser:latest` | 80 | FileBrowser (App Server 시 기본) |
| nextcloud | `nextcloud:29-apache` | 443 | File Server |
| minio | `minio/minio:latest` | 9000 | File Server |
| jellyfin | `jellyfin/jellyfin:latest` | 8096 | Media |
| postgresql | `postgres:17-alpine` | 5432 | Database |
| mysql | `mysql:8.4` | 3306 | Database |
| mariadb | `mariadb:11` | 3306 | Database |
| redis | `redis:7-alpine` | 6379 | Cache |
| valkey | `valkey/valkey:7-alpine` | 6379 | Cache |
| keydb | `eqalpha/keydb:latest` | 6379 | Cache |
| pgadmin | `dpage/pgadmin4:latest` | 5050 | DB Admin UI |
| openssh-server | `linuxserver/openssh-server:latest` | 2222 | SSH/SFTP |
| docker-mailserver | `ghcr.io/docker-mailserver/docker-mailserver:latest` | 25, 587, 993 | Mail |
| cloudflared | `cloudflare/cloudflared:latest` | — (outbound) | Tunnel |

---

## Related Documents

- [PRD.md](PRD.md) — Product Requirements Document
- [TRD.md](TRD.md) — Technical Requirements Document
- [REQUIREMENT.md](REQUIREMENT.md) — Functional Requirements
- [USER-STORY.md](USER-STORY.md) — User Story & Journey
- [IMPLEMENT_SPEC.md](IMPLEMENT_SPEC.md) — Implementation Specification
