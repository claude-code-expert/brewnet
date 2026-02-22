# HomeHub - Feature Specifications

## 1. Installation System

### 1.1 Installation Methods

```bash
# Method 1: curl (Recommended)
curl -fsSL https://get.homehub.io | bash

# Method 2: npm global
npm install -g @homehub/cli

# Method 3: Homebrew (macOS)
brew tap homehub/tap && brew install homehub
```

### 1.2 Install Script Flow

1. **System Detection**
   - OS: macOS, Linux
   - Arch: x64, arm64
   
2. **Prerequisites Check**
   - Node.js (required) - 없으면 nvm으로 설치
   - Docker (recommended)
   - Git (recommended)

3. **Installation**
   - npm global install
   - Data directory 생성 (~/.homehub)
   - Database 초기화

4. **Verification**
   ```bash
   $ homehub doctor
   ✓ OS: macOS 14.0
   ✓ Docker: 24.0.5
   ✓ Git: 2.42.0
   ✓ Network: Ready
   ```

---

## 2. Runtime Environment Management

### 2.1 Supported Runtimes

| Runtime | Manager | Versions |
|---------|---------|----------|
| Node.js | nvm | 18, 20, 22 |
| Python | pyenv | 3.9-3.12 |
| Java | SDKMAN | 11, 17, 21 |
| Go | goenv | 1.21, 1.22 |
| Ruby | rbenv | 3.2, 3.3 |
| Rust | rustup | stable |
| PHP | phpenv | 8.2, 8.3 |
| .NET | dotnet-sdk | 6.0, 8.0 |

### 2.2 CLI Commands

```bash
# 목록
homehub runtime list
homehub runtime status

# 설치
homehub runtime install node 20
homehub runtime install python 3.12 --default

# 버전 관리
homehub runtime use node 18
homehub runtime default node 20

# 프로젝트 감지
homehub runtime detect
```

### 2.3 Auto-Detection

| 파일 | 런타임 | 버전 소스 |
|------|--------|----------|
| package.json | Node.js | engines.node |
| .nvmrc | Node.js | 파일 내용 |
| requirements.txt | Python | - |
| pyproject.toml | Python | python 필드 |
| pom.xml | Java | java.version |
| build.gradle | Java | sourceCompatibility |
| go.mod | Go | go 버전 |
| Gemfile | Ruby | ruby 버전 |

---

## 3. Docker Management

### 3.1 CLI Commands

```bash
# 컨테이너
homehub docker ps                    # 목록
homehub docker start <container>     # 시작
homehub docker stop <container>      # 중지
homehub docker logs <container>      # 로그
homehub docker exec <container> sh   # 접속

# 이미지
homehub docker images                # 목록
homehub docker pull nginx:latest     # 다운로드
homehub docker build -t app:v1 .     # 빌드

# Compose
homehub docker compose up -d
homehub docker compose down
homehub docker compose logs
```

### 3.2 Dashboard Features (Pro)

#### Container List
- 상태별 필터 (running/stopped)
- 정렬 (name, cpu, memory, uptime)
- 일괄 작업 (start, stop, remove)

#### Container Detail Tabs
- **Overview**: 기본 정보, 포트, 볼륨
- **Logs**: 실시간 로그 뷰어
- **Terminal**: 웹 터미널 (xterm.js)
- **Stats**: CPU/Memory 그래프
- **Env**: 환경변수 편집

#### Image Management
- Pull from registry
- Build from Dockerfile
- Remove unused
- Vulnerability scan

---

## 4. Git Integration & Deployment

### 4.1 Deployment Configuration

```yaml
# homehub.yml
name: my-app
runtime: node
version: "20"

build:
  command: npm run build
  output: .next

start:
  command: npm start
  port: 3000

env:
  NODE_ENV: production
  DATABASE_URL: ${secrets.DATABASE_URL}

domains:
  - app.example.com

healthcheck:
  path: /api/health
  interval: 30s

resources:
  memory: 512M
  cpu: 0.5

deploy:
  git:
    branch: main
    auto: true  # Pro: Webhook 자동 배포
```

### 4.2 CLI Commands

```bash
# 초기화
homehub deploy init

# 배포
homehub deploy                        # 현재 디렉토리
homehub deploy https://github.com/... # Git URL
homehub deploy --branch staging

# 관리
homehub deploy list
homehub deploy status my-app
homehub deploy logs my-app
homehub deploy stop my-app
homehub deploy restart my-app

# 롤백 (Pro)
homehub deploy history my-app
homehub deploy rollback my-app
homehub deploy rollback my-app --to v1.2.1

# 삭제
homehub deploy remove my-app
```

### 4.3 Auto-Detection

| 프레임워크 | 감지 파일 | 빌드 명령 | 시작 명령 | 포트 |
|-----------|----------|----------|----------|------|
| Next.js | package.json (next) | npm run build | npm start | 3000 |
| Nuxt | package.json (nuxt) | npm run build | npm start | 3000 |
| Express | package.json (express) | - | npm start | 3000 |
| NestJS | @nestjs/core | npm run build | npm run start:prod | 3000 |
| Django | manage.py | pip install | gunicorn | 8000 |
| FastAPI | fastapi | pip install | uvicorn | 8000 |
| Flask | flask | pip install | gunicorn | 5000 |
| Spring | pom.xml | mvnw package | java -jar | 8080 |
| Go | go.mod | go build | ./app | 8080 |

### 4.4 Dockerfile Auto-Generation

프레임워크별 최적화된 Dockerfile 자동 생성:
- Multi-stage build
- Non-root user
- Layer caching
- Production 설정

---

## 5. Domain & SSL Management

### 5.1 CLI Commands

```bash
# 도메인
homehub domain list
homehub domain add app.example.com --app my-app
homehub domain verify example.com
homehub domain remove example.com

# DDNS
homehub domain ddns providers
homehub domain ddns setup duckdns
homehub domain ddns status
homehub domain ddns update

# SSL
homehub domain ssl status
homehub domain ssl issue example.com
homehub domain ssl issue "*.example.com" --dns cloudflare
homehub domain ssl renew
```

### 5.2 DDNS Providers

| Provider | 무료 | 설정 난이도 | 특징 |
|----------|:----:|:----------:|------|
| DuckDNS | ✅ 5개 | 쉬움 | 추천 |
| Cloudflare | ✅ 무제한 | 중간 | 도메인 필요 |
| No-IP | ✅ 3개 | 쉬움 | 30일 갱신 필요 |
| Dynu | ✅ 4개 | 쉬움 | 안정적 |

### 5.3 SSL Features

| Feature | Free | Pro |
|---------|:----:|:---:|
| Let's Encrypt 수동 발급 | ✅ | ✅ |
| 자동 발급 | ❌ | ✅ |
| 자동 갱신 | ❌ | ✅ (만료 30일 전) |
| 와일드카드 | ❌ | ✅ |
| 상태 모니터링 | ❌ | ✅ |

### 5.4 Nginx Auto-Configuration

자동 생성되는 설정:
- HTTP → HTTPS 리다이렉트
- SSL/TLS 최적화 (TLS 1.2+)
- Security headers (HSTS, X-Frame-Options)
- Proxy headers (X-Real-IP, X-Forwarded-For)
- WebSocket 지원
- ACME challenge 경로

---

## 6. Security & Access Control

### 6.1 CLI Commands

```bash
# IP 관리
homehub acl allow ip 192.168.1.0/24
homehub acl deny ip 45.33.32.156

# 도메인/경로별
homehub acl allow ip 0.0.0.0/0 --domain api.example.com
homehub acl deny ip 0.0.0.0/0 --path "/admin/*"

# 국가 차단 (Pro)
homehub acl deny country CN,RU,KP

# Rate Limiting (Pro)
homehub acl ratelimit 100/minute --global
homehub acl ratelimit 10/second --path "/api/login"

# 규칙 관리
homehub acl list
homehub acl enable <rule-id>
homehub acl disable <rule-id>
homehub acl remove <rule-id>

# 로그 (Pro)
homehub acl logs
homehub acl logs --blocked
homehub acl logs --ip 45.33.32.156
homehub acl stats
```

### 6.2 ACL Rule Types

| Type | Free | Pro | 설명 |
|------|:----:|:---:|------|
| IP Allow | ✅ | ✅ | 특정 IP 허용 |
| IP Deny | ✅ | ✅ | 특정 IP 차단 |
| CIDR Range | ✅ | ✅ | IP 범위 |
| Country Block | ❌ | ✅ | 국가별 차단 |
| Rate Limit | ❌ | ✅ | 요청 제한 |
| User-Agent Block | ❌ | ✅ | 봇 차단 |
| Time-based | ❌ | ✅ | 시간대별 규칙 |

### 6.3 Security Layers

```
Internet
    │
    ▼
[1. DDoS Protection] - Cloudflare 등 (선택)
    │
    ▼
[2. Geo Blocking] - 국가 차단 (Pro)
    │
    ▼
[3. IP Whitelist/Blacklist] - IP 규칙
    │
    ▼
[4. Rate Limiting] - 요청 제한 (Pro)
    │
    ▼
[5. WAF Rules] - SQL injection, XSS 차단
    │
    ▼
[6. Authentication] - Basic/OAuth/2FA
    │
    ▼
[7. SSL/TLS] - 암호화
    │
    ▼
Application
```

### 6.4 Access Logging (Pro)

로그 필드:
- timestamp, source_ip, country
- method, path, domain
- user_agent, referer
- status_code, response_time
- blocked, block_reason

필터:
- --blocked: 차단된 요청만
- --ip: 특정 IP
- --country: 특정 국가
- --path: 경로 패턴
- --since: 시간 범위

내보내기:
- CSV, JSON 형식

---

## 7. Monitoring & Dashboard (Pro)

### 7.1 System Metrics

| 메트릭 | 실시간 | 히스토리 |
|--------|:------:|:--------:|
| CPU 사용률 | ✅ | 1h/1d/1w |
| 메모리 사용량 | ✅ | 1h/1d/1w |
| 디스크 사용량 | ✅ | 1d/1w |
| 네트워크 I/O | ✅ | 1h/1d |
| 컨테이너별 리소스 | ✅ | 1h/1d |

### 7.2 Dashboard Pages

```
/ (Dashboard)
├── System Metrics Cards
├── Running Services List
├── Domain Status
├── Security Overview
└── Recent Activity

/docker
├── Container List
├── Image Management
└── Compose Editor

/deploy
├── App List
├── New Deployment Wizard
└── Deployment History

/domains
├── Domain List
├── DDNS Status
└── SSL Overview

/security
├── Firewall Rules
├── ACL Rules
└── Access Logs

/monitoring
├── Detailed Charts
├── Service Health
└── Uptime History

/settings
├── General
├── License
├── Notifications
└── Backup
```

### 7.3 Notifications (Pro)

| 채널 | 이벤트 |
|------|--------|
| Email | 배포 실패, SSL 만료 임박, 서비스 다운 |
| Slack | 배포 시작/완료/실패, 보안 알림 |
| Discord | Webhook 지원 |

### 7.4 Alerts

| 알림 | 조건 |
|------|------|
| CPU 경고 | > 80% (5분 지속) |
| 메모리 경고 | > 90% |
| 디스크 경고 | > 85% |
| 서비스 다운 | Health check 3회 실패 |
| SSL 만료 | 30일 이내 |
| 의심 활동 | 1시간 내 100회+ 차단 |

---

## 8. Team Features (Team Plan)

### 8.1 Member Management

```bash
homehub team invite user@example.com --role member
homehub team list
homehub team remove user@example.com
homehub team role user@example.com --set admin
```

### 8.2 Roles

| 권한 | Viewer | Member | Admin | Owner |
|------|:------:|:------:|:-----:|:-----:|
| 대시보드 보기 | ✅ | ✅ | ✅ | ✅ |
| 로그 보기 | ✅ | ✅ | ✅ | ✅ |
| 앱 배포 | ❌ | ✅ | ✅ | ✅ |
| 설정 변경 | ❌ | ❌ | ✅ | ✅ |
| 멤버 관리 | ❌ | ❌ | ✅ | ✅ |
| 결제 관리 | ❌ | ❌ | ❌ | ✅ |

### 8.3 Audit Log

기록되는 이벤트:
- 로그인/로그아웃
- 배포 시작/완료/실패
- 설정 변경
- 규칙 추가/수정/삭제
- 멤버 초대/삭제

### 8.4 Multi-Server

- 중앙 대시보드에서 여러 서버 관리
- 서버별 권한 설정
- Cross-server 모니터링
