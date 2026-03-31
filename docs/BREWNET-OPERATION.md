# Brewnet Operation Guide

> 설치, 초기화, 서비스 관리, 도메인 연결까지의 전체 운영 가이드.
> Last updated: 2026-03-26

---

## 1. 설치 (Installation)

### 방법 A: npm 글로벌 설치 (권장)

```bash
npm install -g @brewnet/cli
```

### 방법 B: 설치 스크립트

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

**스크립트 수행 단계:**

| Step | 내용 |
|------|------|
| 1 | OS 감지 (macOS / Linux) |
| 2 | Node.js 20+ 확인 |
| 3 | pnpm 설치 (없으면 자동 설치) |
| 4 | git 확인 |
| 5 | 소스 클론 → `~/.brewnet/source/` |
| 6 | `pnpm install` 의존성 설치 |
| 7 | admin-ui + shared + CLI 빌드 |
| 8 | `/usr/local/bin/brewnet` 래퍼 설치 |
| 9 | PATH 설정 및 검증 |

### 사전 요구사항

| 항목 | 요구 버전 |
|------|----------|
| Node.js | 20.0.0+ |
| Docker | 27+ (Docker Desktop 또는 Docker Engine) |
| git | any |
| OS | macOS 12+ / Ubuntu/Debian / CentOS/RHEL |

### 업데이트

```bash
# npm — 표준 업데이트
npm update -g @brewnet/cli

# 스크립트 설치 — 동일 명령어 재실행 (git pull → rebuild)
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

---

## 2. 초기화 (brewnet init)

```bash
brewnet init                      # 대화형 마법사
brewnet init --config config.yml  # 설정 파일 기반
brewnet init --non-interactive --config config.yml  # 비대화형
```

### 설치 유형 선택 (Pre-step)

| 유형 | 설명 |
|------|------|
| **Full Install** | 모든 컴포넌트 대화형 설정 (7단계 마법사) |
| **Minimal Install** | Traefik + Gitea + Quick Tunnel 즉시 설치 |

### 마법사 단계 (Full Install)

```
Pre-Step: Admin Account (사용자명/비밀번호)
Step 0: System Check (OS, Docker, 포트, 디스크)
Step 1: Project Setup (이름, 경로)
Step 2: Server Components
         ├── Web Server: Traefik(기본) / Nginx / Caddy
         ├── Git Server: Gitea (필수)
         ├── File Server: Nextcloud / MinIO (선택)
         ├── Database: PostgreSQL / MySQL (선택)
         └── Media: Jellyfin (선택)
Step 3: Dev Stack & Runtime (appServer 선택 시만)
Step 4: Domain & Network
         ├── Local (*.local)
         ├── Quick Tunnel (*.trycloudflare.com)
         └── Named Tunnel (커스텀 도메인)
Step 5: Review & Confirm
Step 6: Generate & Start (docker-compose.yml 생성, 서비스 시작)
Step 7: Complete (엔드포인트, 자격증명 요약)
```

### 생성되는 구조

```
~/brewnet/<project-name>/
├── docker-compose.yml
├── .env                          # chmod 600
├── .brewnet-boilerplate.json     # 스택 메타데이터
├── traefik/
│   └── traefik.yml
├── landing/                      # 랜딩 페이지
└── <stack-id>/                   # 보일러플레이트 앱
```

---

## 3. CLI 명령어 (Commands)

### 서비스 관리

```bash
brewnet up                        # 모든 서비스 시작
brewnet down                      # 모든 서비스 중지
brewnet down --volumes            # 볼륨 포함 중지
brewnet status                    # 서비스 상태 테이블
brewnet status --json             # JSON 출력
brewnet logs [service]            # 로그 보기
brewnet logs -f                   # 실시간 스트리밍
brewnet logs --all --source cli --level error --since 1h
brewnet update                    # 이미지 업데이트 + 재시작
brewnet list                      # 사용 가능한 서비스/스택 목록
```

### 서비스 추가/제거

```bash
brewnet add jellyfin              # 서비스 추가
brewnet remove jellyfin           # 서비스 제거
brewnet remove jellyfin --purge   # 볼륨 포함 제거
```

### 앱 관리

```bash
brewnet create-app my-app                        # 대화형 앱 생성
brewnet create-app my-app --stack nodejs-nextjs   # 스택 지정
brewnet deploy ./my-project -n my-app -p 3000    # 로컬 프로젝트 배포
```

### 백업/복원

```bash
brewnet backup                    # 백업 생성
brewnet backup --list             # 백업 목록
brewnet restore <backup-id>       # 복원
brewnet export                    # tar.gz 아카이브 내보내기
```

### 관리 대시보드

```bash
brewnet admin                     # 대시보드 시작 (localhost:8088)
brewnet admin --port 9000         # 커스텀 포트
brewnet admin --foreground        # 포그라운드 실행
brewnet admin --no-open           # 브라우저 자동 오픈 스킵
brewnet shutdown                  # 대시보드 데몬 중지
```

### 제거

```bash
brewnet uninstall                 # 전체 제거 (확인 프롬프트)
brewnet uninstall --force         # 확인 없이 제거
brewnet uninstall --dry-run       # 제거 예상 목록만 표시
brewnet uninstall --keep-data     # Docker 볼륨 보존
brewnet uninstall --keep-config   # 프로젝트 디렉토리 보존
```

**제거 범위:**
- Docker 컨테이너, 볼륨, 네트워크
- 프로젝트 디렉토리 (`~/brewnet/<name>/`)
- Cloudflare Tunnel + DNS 레코드 (apiToken 있으면 자동)
- cloudflared 시스템 서비스 (macOS LaunchDaemon / Linux systemd)

---

## 4. 도메인 연결 (Domain & Tunnel)

### 터널 모드

| 모드 | 설정 | URL | 영구성 |
|------|------|-----|--------|
| **Local** | 없음 | `http://<name>.local` | N/A |
| **Quick Tunnel** | 없음 (기본) | `https://<random>.trycloudflare.com` | 재시작 시 변경 |
| **Named Tunnel** | CF API 토큰 | `https://git.yourdomain.com` | 영구 |

### Quick Tunnel → Named Tunnel 마이그레이션

```bash
brewnet domain connect
```

대화형으로 진행:
1. Cloudflare API 토큰 입력 (Zone:Read, DNS:Edit, Tunnel:Edit 권한)
2. 계정 선택 (자동 감지)
3. DNS 존 선택
4. 터널 이름 입력
5. 터널 생성 + Ingress 구성 + DNS 레코드 생성
6. Quick Tunnel 컨테이너 중지

### 개별 앱 도메인 연결

```bash
brewnet domain connect my-app --domain my-app.example.com
brewnet domain connect my-app --domain my-app.example.com --force  # 기존 CNAME 덮어쓰기
```

**동작 흐름:**
1. 로컬 health check
2. Cloudflare Tunnel ingress 업데이트
3. DNS CNAME 레코드 생성
4. Traefik 외부 라벨 추가
5. State 저장
6. (Nextcloud인 경우) occ 설정 자동 수정
7. DNS 전파 대기 (30초)

**Apex 도메인 연결 (루트 도메인):**
```bash
brewnet domain connect my-app --domain @.example.com
```
→ `example.com` + `www.example.com` 두 개 CNAME 자동 생성

### 도메인 관리

```bash
brewnet domain list               # 모든 연결 목록
brewnet domain status             # 연결 상태 (DNS, HTTPS, 터널)
brewnet domain status my-app      # 특정 앱 상태
brewnet domain disconnect my-app  # 도메인 연결 해제
brewnet domain tunnel status      # 터널 상태 (healthy/inactive)
brewnet domain tunnel restart     # cloudflared 재시작
```

### API 토큰 생성 (Cloudflare)

1. https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → **Custom token**
3. 권한 설정:

| 권한 | 레벨 |
|------|------|
| Zone → Zone → Read | All zones |
| Zone → DNS → Edit | All zones |
| Account → Cloudflare Tunnel → Edit | 해당 계정 |

---

## 5. 관련 파일 경로

### 데이터 디렉토리

```
~/.brewnet/
├── config.json                   # 전역 설정 (lastProject)
├── apps.json                     # 앱 레지스트리 (create-app으로 생성된 앱)
├── source/                       # CLI 소스 (스크립트 설치 시)
├── projects/
│   └── <name>/
│       └── selections.json       # 마법사 상태 (WizardState)
├── backups/
├── logs/
│   └── tunnel.log                # 터널 감사 로그
└── db/                           # SQLite
```

### 프로젝트 디렉토리

```
~/brewnet/<name>/
├── docker-compose.yml            # 생성된 compose
├── .env                          # 환경 변수 (chmod 600)
├── .brewnet-manifest.json        # 제거 시 참조
├── .brewnet-boilerplate.json     # 보일러플레이트 메타
├── traefik/traefik.yml
├── landing/                      # 랜딩 페이지
├── apps/<app-name>/              # create-app 앱
└── secrets/                      # 비밀 파일
```

### 소스 코드 구조

```
packages/
├── cli/src/
│   ├── index.ts                  # CLI 진입점
│   ├── commands/                 # Commander.js 명령어
│   │   ├── init.ts               # brewnet init
│   │   ├── domain.ts             # brewnet domain *
│   │   ├── deploy.ts             # brewnet deploy
│   │   ├── create-app.ts         # brewnet create-app
│   │   ├── uninstall.ts          # brewnet uninstall
│   │   └── ...
│   ├── services/                 # 핵심 서비스 모듈
│   │   ├── admin-server.ts       # 관리 대시보드 서버
│   │   ├── domain-manager.ts     # 도메인 연결 오케스트레이터
│   │   ├── compose-generator.ts  # docker-compose.yml 생성
│   │   ├── cloudflare-client.ts  # CF API 클라이언트
│   │   ├── app-manager.ts        # 앱 생성/배포
│   │   ├── boilerplate-manager.ts # 보일러플레이트 관리
│   │   └── ...
│   ├── wizard/                   # 마법사 단계
│   │   └── steps/
│   ├── config/                   # 서비스 레지스트리, 스택 카탈로그
│   └── utils/                    # 유틸리티
├── admin-ui/src/                 # React 대시보드
├── shared/src/                   # 공유 타입, Zod 스키마
└── infra/telemetry-worker/       # 설치 텔레메트리 (CF Worker)
```

---

## 6. Docker 서비스 레지스트리

| 카테고리 | 서비스 | 이미지 | 포트 |
|---------|--------|--------|------|
| **Web** | Traefik (기본) | traefik:v2.11 | 80, 443, 8080 |
| | Nginx | nginx:1.25-alpine | 80, 443 |
| | Caddy | caddy:2-alpine | 80, 443 |
| **Git** | Gitea (필수) | gitea:latest | 3000, 3022 |
| **File** | Nextcloud | nextcloud:29-apache | 80 |
| | MinIO | minio:latest | 9000, 9001 |
| | FileBrowser | filebrowser:latest | 80 |
| **DB** | PostgreSQL | postgres:latest | 5432 |
| | MySQL | mysql:latest | 3306 |
| **Admin** | pgAdmin | pgadmin:latest | 80 |
| | phpMyAdmin | phpmyadmin:latest | 80 |
| **Media** | Jellyfin | jellyfin:latest | 8096 |
| **Tunnel** | cloudflared | cloudflare/cloudflared:latest | — |
| **Landing** | brewnet-landing | (빌드) | 80 |

---

## 7. 보일러플레이트 스택 (16종)

```bash
brewnet create-app my-app --stack <STACK_ID>
```

| Language | Stack ID | Framework | Unified | Build |
|----------|----------|-----------|---------|-------|
| Go | `go-gin` | Gin | No | Fast |
| Go | `go-echo` | Echo | No | Fast |
| Go | `go-fiber` | Fiber | No | Fast |
| Java | `java-springboot` | Spring Boot 3.3 | No | Normal |
| Java | `java-spring` | Spring 6.2 | No | Normal |
| Kotlin | `kotlin-ktor` | Ktor 3.1 | No | Normal |
| Kotlin | `kotlin-springboot` | Spring Boot 3.4 | No | Normal |
| Node.js | `nodejs-express` | Express 5 | No | Fast |
| Node.js | `nodejs-nestjs` | NestJS 11 | No | Fast |
| Node.js | `nodejs-nextjs` | Next.js 15 | **Yes** | Fast |
| Node.js | `nodejs-nextjs-full` | Next.js 15 Full | **Yes** | Fast |
| Python | `python-django` | Django 5 | No | Fast |
| Python | `python-fastapi` | FastAPI | No | Fast |
| Python | `python-flask` | Flask 3 | No | Fast |
| Rust | `rust-actix` | Actix-web | No | **Slow** (600s) |
| Rust | `rust-axum` | Axum | No | **Slow** (600s) |

**Unified**: frontend+backend 하나의 포트(3000)로 동작. basePath 자동 주입.

---

## 8. 텔레메트리 (설치 카운터)

### 수집 경로

- `install.sh` → `GET /telemetry/install?v=VERSION&os=PLATFORM&source=curl`
- `npm postinstall` → `GET /telemetry/install?v=VERSION&os=PLATFORM&source=npm`

### 확인

```bash
# 전체 통계
curl https://brewnet-telemetry.villainscode.workers.dev/telemetry/stats

# 일별 상세 (최근 30일)
curl https://brewnet-telemetry.villainscode.workers.dev/telemetry/stats/details?days=30
```

### 인프라

- Cloudflare Worker + KV (`infra/telemetry-worker/`)
- 무료 tier: 100k req/day, 1k KV writes/day
- 개인 데이터 수집 없음 (버전, OS, 소스만)

---

## 9. 트러블슈팅 Quick Reference

| 증상 | 원인 | 해결 |
|------|------|------|
| `brewnet: command not found` | PATH 미설정 | `source ~/.zshrc` 또는 재설치 |
| 서비스 시작 안 됨 | Docker 미실행 | `open -a Docker` (macOS) |
| 외부 접근 404 | Tunnel ingress 누락 | `brewnet domain tunnel restart` |
| Nextcloud "페이지를 찾을 수 없음" | `overwritewebroot=/cloud` 잔존 | `domain connect`가 자동 수정 (v0.0.10+) |
| 터널 삭제 불가 "active connections" | cloudflared 실행 중 | `brewnet uninstall`이 cascade 삭제 처리 |
| Next.js 앱 도메인 404 | basePath 미반영 | `domain connect`가 자동 감지 (v0.0.10+) |
| Admin 대시보드 401 | lastProject 빈값 | `~/.brewnet/config.json`에서 lastProject 확인 |
