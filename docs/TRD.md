# Brewnet TRD (Technical Requirements Document)

> **Version**: 2.2
> **Last Updated**: 2026-02-22
> **Status**: Draft

---

## 1. 개요

### 1.1 프로젝트 요약

Brewnet은 셀프 호스팅 홈서버 관리 CLI 도구로, 사용자가 터미널에서 인터랙티브 위저드를 통해 단계별로 홈서버를 구축할 수 있도록 한다.

### 1.2 사용자 설치 및 사용 흐름

```
# 1. 설치
npm install -g brewnet
# 또는
git clone https://github.com/codevillain/brewnet.git
cd brewnet && npm install -g .

# 2. 초기화 (인터랙티브 위저드)
brewnet init

# 3. 서비스 선택 → docker-compose.yml 자동 생성 → 서비스 기동
brewnet up

# 4. 서비스 관리
brewnet status
brewnet add jellyfin
brewnet logs
```

### 1.3 설치 위저드 단계 (8 Steps: 0-7)

| Step | 내용 | 설명 |
|------|------|------|
| 0 | System Check | OS, Docker, Node.js, Git, 포트, 디스크 확인 |
| 1 | Project Setup | 프로젝트 이름, 경로, 설치 유형 (Full / Partial) |
| 2 | Server Components | 관리자 계정 + 서버 컴포넌트 (Web(필수)/Git(필수)/File/DB/Media/SSH) |
| 3 | Dev Stack & Runtime | 다중 언어/프레임워크 선택, Frontend 기술 스택, FileBrowser, 보일러플레이트 — 항상 표시 |
| 4 | Domain & Network | 도메인 (Local/FreeDomain/Custom), Cloudflare Tunnel, Mail Server |
| 5 | Review | 설정 확인, 자격증명 전파 대상 표시, 리소스 추정, 내보내기 |
| 6 | Generate | docker-compose.yml 생성, 이미지 풀, 컨테이너 시작, 헬스체크 |
| 7 | Complete | 엔드포인트, 자격증명, 외부 접근 검증, 다음 단계 안내 |

---

## 2. 기술 스택

### 2.1 핵심 런타임

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **Node.js** | 20+ | CLI 런타임 환경 | MVP 필수 |
| **TypeScript** | 5.x | 타입 안전성 (strict mode) | MVP 필수 |

### 2.2 CLI 프레임워크 & 인터랙티브 UX

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **Commander.js** | 12.x | 명령어 파싱, 서브커맨드 구조 | MVP 필수 |
| **@inquirer/prompts** | 7.x | 인터랙티브 위저드 (선택, 체크박스, 입력) | MVP 필수 |
| **chalk** | 5.x | 터미널 컬러 출력 | MVP 필수 |
| **ora** | 8.x | 로딩 스피너 (설치/배포 진행 상태) | MVP 필수 |
| **cli-table3** | 0.6.x | 테이블 형식 출력 (상태, 목록) | MVP 필수 |
| **boxen** | 8.x | 박스 형태 메시지 출력 | 선택 |

### 2.3 Docker 통합

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **dockerode** | 4.x | Docker Engine API 클라이언트 (컨테이너 CRUD) | MVP 필수 |
| **js-yaml** | 4.x | docker-compose.yml 생성/파싱 | MVP 필수 |

### 2.4 시스템 통합

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **execa** | 9.x | 셸 명령어 실행 (docker-compose, certbot 등) | MVP 필수 |
| **simple-git** | 3.x | Git 작업 (Gitea 연동, 배포 파이프라인) | Phase 2+ |
| **ofetch** | 1.x | HTTP 요청 (Cloudflare API, 업데이트 확인) | MVP 필수 |

### 2.4.1 외부 시스템 의존성 (npm 패키지 아님)

| 기술 | Docker 이미지 | 용도 | Phase |
|------|--------------|------|:-----:|
| **Traefik** | `traefik:v3.0` | 리버스 프록시, 서비스 라우팅 (기본) | 1 |
| **Nginx** | `nginx:1.25-alpine` | 리버스 프록시 (대안) | 1 |
| **Caddy** | `caddy:2-alpine` | 리버스 프록시 (대안) | 1 |
| **Cloudflare Tunnel** | `cloudflare/cloudflared:latest` | 외부 접근 터널 (NAT/CGNAT 우회, 기본 활성화) | 1 |
| **Nextcloud** | `nextcloud:29-apache` | 파일 서버 (WebDAV, 공유) | 1 |
| **MinIO** | `minio/minio:latest` | S3 호환 오브젝트 스토리지 | 1 |
| **Jellyfin** | `jellyfin/jellyfin:latest` | 미디어 서버 (비디오 스트리밍, 트랜스코딩) | 1 |
| **PostgreSQL** | `postgres:17-alpine` | 관계형 데이터베이스 (기본 권장) | 1 |
| **MySQL** | `mysql:8.4` | 관계형 데이터베이스 (대안) | 1 |
| **Redis** | `redis:7-alpine` | 캐시 서버 (기본 권장) | 1 |
| **Valkey** | `valkey/valkey:7-alpine` | 캐시 서버 (Redis 대안, BSD) | 1 |
| **KeyDB** | `eqalpha/keydb:latest` | 캐시 서버 (Redis 대안, 멀티스레드) | 1 |
| **pgAdmin** | `dpage/pgadmin4:latest` | 데이터베이스 관리 UI | 1 |
| **OpenSSH Server** | `linuxserver/openssh-server:latest` | SSH 서버 (포트 2222, 키 기반 인증, SFTP) | 1 |
| **docker-mailserver** | `ghcr.io/docker-mailserver/docker-mailserver:latest` | 메일 서버 (SMTP/IMAP, DKIM/SPF) | 1 |
| **Roundcube** | `roundcube/roundcubemail:latest` | 웹메일 클라이언트 (선택) | 2 |
| **Certbot** | 시스템 패키지 | Let's Encrypt SSL 인증서 발급/갱신 | 2 |
| **FileBrowser** | `filebrowser/filebrowser:latest` | 파일 관리 웹 UI (App Server 기본 포함) | 1 |
| **Gitea** | `gitea/gitea:latest` | 자체 Git 서버 (필수, 저장소 관리, 자동 배포) | 1 |

### 2.5 데이터 & 설정

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **better-sqlite3** | 11.x | 로컬 상태 관리 (서비스, 배포, 사용자) | Phase 2+ |
| **zod** | 3.x | 설정 파일 / 입력값 스키마 검증 | MVP 필수 |
| **dotenv** | 16.x | .env 환경 변수 관리 | MVP 필수 |
| **conf** | 13.x | 사용자 설정 저장 (~/.brewnet/config.json) | MVP 필수 |

### 2.6 네트워크 & HTTP

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **ofetch** | 1.x | HTTP 요청 (Cloudflare API, 터널 토큰 검증, 업데이트 확인) | MVP 필수 |

### 2.7 빌드 & 패키징

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **pnpm** | 9.x | 패키지 관리 (모노레포 워크스페이스) | MVP 필수 |
| **tsup** | 8.x | TypeScript 번들링 → 실행 가능한 CLI | MVP 필수 |

### 2.8 테스트

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **Jest** | 29.x | 단위/통합 테스트 | MVP 필수 |
| **ts-jest** | 29.x | TypeScript Jest 트랜스포머 | MVP 필수 |
| **Playwright** | 1.x | E2E 테스트 (Dashboard) | Phase 4+ |

### 2.9 코드 품질

| 기술 | 버전 | 용도 | 필수 여부 |
|------|------|------|-----------|
| **ESLint** | 9.x | 코드 린팅 | MVP 필수 |
| **Prettier** | 3.x | 코드 포맷팅 | MVP 필수 |

---

## 3. Phase별 기술 스택 분류

### MVP (Phase 1) — CLI 기초 + Docker 관리 + 외부 접근

```
[필수 의존성]
├── 런타임: Node.js 20+, TypeScript 5
├── CLI: Commander.js, @inquirer/prompts, chalk, ora, cli-table3
├── Docker: dockerode, js-yaml, execa
├── 설정: zod, dotenv, conf
├── HTTP: ofetch (Cloudflare API, 터널 토큰 검증)
├── 빌드: pnpm, tsup
├── 테스트: Jest, ts-jest
└── 품질: ESLint, Prettier

[Docker 서비스]
├── 웹 서버: Traefik (기본) / Nginx / Caddy
├── Git 서버: Gitea (필수)
├── 파일 서버: Nextcloud / MinIO
├── 파일 관리: FileBrowser (App Server 시 기본)
├── 미디어: Jellyfin
├── DB: PostgreSQL / MySQL + 캐시 (Redis / Valkey / KeyDB)
├── 외부 접근: cloudflare/cloudflared (Cloudflare Tunnel)
├── SSH: linuxserver/openssh-server
├── 메일: docker-mailserver
└── 관리: pgAdmin
```

### Phase 2 — 네트워킹 (도메인, SSL)

```
[추가 의존성]
├── Git: simple-git
├── SSL: certbot (시스템 패키지)
└── 웹메일: Roundcube
```

### Phase 3 — 보안 (ACL, 방화벽, SSO)

```
[추가 의존성]
├── DB: better-sqlite3
└── Auth: jsonwebtoken, bcrypt
```

### Phase 4 — Dashboard (Pro)

```
[추가 의존성 — packages/dashboard]
├── UI: Next.js 14, React 18, Tailwind CSS, shadcn/ui
├── 상태: Zustand, TanStack Query
├── 폼: React Hook Form, Zod
├── 차트: Recharts
├── 터미널: xterm.js
├── 에디터: Monaco Editor
└── 테스트: Playwright
```

### Phase 5 — 고도화

```
[추가 의존성]
├── 성능: k6 (부하 테스트)
├── 보안: OWASP dependency-check
└── 모니터링: Grafana, Prometheus (선택적 add-on 서비스)
```

---

## 4. 의존성 목록 (packages/cli/package.json 기준)

### dependencies

```json
{
  "commander": "^12.0.0",
  "@inquirer/prompts": "^7.0.0",
  "chalk": "^5.0.0",
  "ora": "^8.0.0",
  "cli-table3": "^0.6.0",
  "dockerode": "^4.0.0",
  "js-yaml": "^4.0.0",
  "execa": "^9.0.0",
  "zod": "^3.0.0",
  "dotenv": "^16.0.0",
  "conf": "^13.0.0",
  "ofetch": "^1.0.0"
}
```

### devDependencies

```json
{
  "typescript": "^5.0.0",
  "tsup": "^8.0.0",
  "jest": "^29.0.0",
  "ts-jest": "^29.0.0",
  "@types/node": "^20.0.0",
  "@types/dockerode": "^3.0.0",
  "@types/js-yaml": "^4.0.0",
  "eslint": "^9.0.0",
  "prettier": "^3.0.0"
}
```

---

## 5. 시스템 요구사항

### 서버 (사용자 환경)

| 항목 | 최소 사양 | 권장 사양 |
|------|-----------|-----------|
| OS | Ubuntu 20.04+ / macOS 12+ | Ubuntu 22.04 LTS |
| CPU | 2 cores | 4+ cores |
| RAM | 2GB | 8GB+ |
| Disk | 20GB | 100GB+ (미디어 서비스 사용 시) |
| Docker | 24.0+ | 최신 |
| Node.js | 20.x | 22.x LTS |

### 네트워크

| 항목 | 용도 | 필수 여부 |
|------|------|-----------|
| 인터넷 연결 | Docker 이미지 다운로드, Cloudflare Tunnel | 초기 설정 시 필수 |
| Cloudflare 계정 (무료) | 외부 접근, DNS 관리, Tunnel | non-local 도메인 시 필수 |
| DigitalPlat 계정 (무료) | 무료 도메인 등록 | Free Domain 사용 시 필수 |

### 포트

| 포트 | 서비스 | 필수 여부 |
|------|--------|-----------|
| 80 | HTTP (웹 서버) | 필수 |
| 443 | HTTPS (웹 서버) | 필수 |
| 3000 | Gitea Web UI | 필수 (Git Server) |
| 3022 | Gitea SSH | 필수 (Git Server) |
| 8080 | Traefik Dashboard | 선택 |
| 5432 | PostgreSQL | DB 선택 시 |
| 3306 | MySQL | DB 선택 시 |
| 6379 | Redis/Valkey/KeyDB | 캐시 선택 시 |
| 8096 | Jellyfin | 미디어 선택 시 |
| 9000/9001 | MinIO (API/Console) | MinIO 선택 시 |
| 2222 | SSH/SFTP | SSH 활성화 시 |
| 25 | SMTP (메일 수신) | 메일 서버 활성화 시 |
| 587 | SMTP Submission (메일 발송) | 메일 서버 활성화 시 |
| 993 | IMAP (메일 수신) | 메일 서버 활성화 시 |

> **참고**: Cloudflare Tunnel 사용 시 포트포워딩이 필요하지 않습니다. Tunnel은 아웃바운드 연결만 사용하므로 NAT/CGNAT 환경에서도 외부 접근이 가능합니다.

---

## 6. 기술 선정 근거

| 기술 | 선정 이유 | 대안 (불채택) |
|------|-----------|---------------|
| Commander.js | 성숙한 생태계, 서브커맨드 지원, TypeScript 지원 | yargs, oclif |
| @inquirer/prompts | 모던 API, ESM 지원, 풍부한 프롬프트 타입 | prompts, enquirer |
| dockerode | Docker Engine API 직접 통합, 타입 지원 | docker-compose CLI wrapper |
| js-yaml | YAML 생성/파싱 표준, 가벼움 | yaml (더 무거움) |
| execa | 모던 프로세스 실행, Promise 기반, ESM | child_process (저수준) |
| better-sqlite3 | 동기 API, 빠른 성능, 서버 불필요 | sqlite3 (비동기, C++ 빌드 이슈) |
| zod | TypeScript 네이티브, 런타임 검증 | joi, yup |
| tsup | esbuild 기반 빠른 번들링, 설정 간단 | rollup, webpack |
| pnpm | 빠른 설치, 디스크 효율, 모노레포 지원 | npm, yarn |
| ofetch | 경량 HTTP 클라이언트, auto-retry, TypeScript 네이티브 | axios, node-fetch |
| cloudflared | 아웃바운드 전용 터널, 포트포워딩 불필요, 무료 플랜, DDoS 보호 | Tailscale, ngrok, frp |
| openssh-server | LinuxServer.io 에코시스템, 사전 구성된 Docker SSH, SFTP 서브시스템 내장 | 호스트 OpenSSH 직접 설정 |
| docker-mailserver | Docker 네이티브 풀스택 메일 서버, Postfix+Dovecot, DKIM/SPF/DMARC 지원 | Mailu, iRedMail |

---

## 7. 프로젝트 구조

```
brewnet/
├── package.json              # 루트 워크스페이스
├── pnpm-workspace.yaml
├── tsconfig.json
├── CLAUDE.md                 # AI 컨텍스트
├── README.md
├── LICENSE                   # BUSL-1.1
│
├── docs/
│   ├── PRD.md                # 제품 요구사항
│   ├── TRD.md                # 기술 요구사항 (이 문서)
│   ├── REQUIREMENT.md        # 기능 요구사항 상세
│   ├── USER-STORY.md         # 사용자 여정
│   ├── IMPLEMENT_SPEC.md     # 구현 스펙
│   └── spec/                 # 초기 리서치 참조 문서 (20개)
│
├── public/
│   └── demo/                 # CLI 위저드 데모 (HTML + vanilla JS)
│       ├── js/wizard.js      # 상태 관리 & 유틸리티
│       ├── css/terminal.css  # 터미널 UI 스타일시트
│       └── step0~7, manage, index.html
│
├── packages/
│   ├── cli/                  # CLI 애플리케이션
│   │   ├── src/
│   │   │   ├── index.ts      # 진입점
│   │   │   ├── commands/     # Commander.js 명령어
│   │   │   │   ├── init.ts
│   │   │   │   ├── add.ts / remove.ts
│   │   │   │   ├── up.ts / down.ts
│   │   │   │   ├── status.ts / logs.ts
│   │   │   │   ├── deploy.ts / domain.ts
│   │   │   │   ├── ssh/      # SSH 관련 명령어
│   │   │   │   └── storage/  # 스토리지 관련 명령어
│   │   │   ├── services/     # 핵심 서비스 모듈
│   │   │   │   ├── docker-manager.ts
│   │   │   │   ├── runtime-manager.ts
│   │   │   │   ├── deploy-manager.ts
│   │   │   │   ├── ssl-manager.ts
│   │   │   │   ├── nginx-manager.ts
│   │   │   │   ├── acl-manager.ts
│   │   │   │   ├── git-server.ts
│   │   │   │   ├── file-manager.ts
│   │   │   │   ├── db-manager.ts
│   │   │   │   └── ssh-manager.ts
│   │   │   ├── boilerplate/  # 앱 스캐폴딩 템플릿
│   │   │   ├── utils/
│   │   │   └── config/
│   │   ├── templates/        # 보일러플레이트 템플릿
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared/               # 공유 타입/유틸
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── schemas/      # Zod 스키마
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── dashboard/            # (Phase 4) Web Dashboard — Pro
│       ├── src/
│       │   ├── app/          # Next.js App Router
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── stores/       # Zustand stores
│       │   └── lib/
│       └── package.json
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 8. Docker Image Registry

위저드에서 선택 가능한 모든 Docker 이미지 목록:

| 서비스 ID | Docker 이미지 | 기본 포트 | 카테고리 |
|-----------|--------------|-----------|----------|
| `traefik` | `traefik:v3.0` | 80, 443, 8080 | Web Server |
| `nginx` | `nginx:1.25-alpine` | 80, 443 | Web Server |
| `caddy` | `caddy:2-alpine` | 80, 443 | Web Server |
| `nextcloud` | `nextcloud:29-apache` | 80 | File Server |
| `minio` | `minio/minio:latest` | 9000, 9001 | File Server |
| `postgresql` | `postgres:17-alpine` | 5432 | Database |
| `mysql` | `mysql:8.4` | 3306 | Database |
| `redis` | `redis:7-alpine` | 6379 | Cache |
| `valkey` | `valkey/valkey:7-alpine` | 6379 | Cache |
| `keydb` | `eqalpha/keydb:latest` | 6379 | Cache |
| `pgadmin` | `dpage/pgadmin4:latest` | 5050 | DB Admin |
| `jellyfin` | `jellyfin/jellyfin:latest` | 8096 | Media |
| `openssh-server` | `linuxserver/openssh-server:latest` | 2222 | SSH/SFTP |
| `docker-mailserver` | `ghcr.io/docker-mailserver/docker-mailserver:latest` | 25, 587, 993 | Mail |
| `gitea` | `gitea/gitea:latest` | 3000, 3022 | Git Server (필수) |
| `filebrowser` | `filebrowser/filebrowser:latest` | 80 | File Manager |
| `cloudflared` | `cloudflare/cloudflared:latest` | — (outbound) | Tunnel |

---

## 9. Configuration Schema

위저드 상태 관리에 사용되는 주요 타입 정의 (IMPLEMENT_SPEC.md의 WizardSelections 참조):

```typescript
interface WizardState {
  schemaVersion: 5;
  projectName: string;
  projectPath: string;
  setupType: 'full' | 'partial';

  admin: {
    username: string;      // 기본값: 'admin'
    password: string;      // 자동 생성 20자, .env 저장 (chmod 600)
    storage: 'local';      // .env 파일 기반
  };

  servers: {
    webServer: { enabled: true; service: 'traefik' | 'nginx' | 'caddy' };
    gitServer: { enabled: true };     // 항상 true (필수 컴포넌트)
    fileServer: { enabled: boolean; service: 'nextcloud' | 'minio' | '' };
    appServer: { enabled: boolean };
    dbServer: {
      enabled: boolean;
      primary: 'postgresql' | 'mysql' | 'sqlite' | '';
      primaryVersion: string;
      dbName: string;       // 기본값: 'brewnet_db'
      dbUser: string;       // 기본값: 'brewnet'
      dbPassword: string;   // 별도 생성 (미입력 시 admin 비밀번호 적용)
      adminUI: boolean;     // pgAdmin / phpMyAdmin
      cache: 'redis' | 'valkey' | 'keydb' | '';
    };
    media: { enabled: boolean; services: string[] };  // ['jellyfin']
    sshServer: {
      enabled: boolean;
      port: number;          // 기본값: 2222
      passwordAuth: boolean; // 기본값: false (키 기반만)
      sftp: boolean;         // File/Media 활성 시 자동 제안
    };
    mailServer: {
      enabled: boolean;
      service: 'docker-mailserver';
    };
    fileBrowser: {
      enabled: boolean;
      mode: 'directory' | 'standalone' | '';
    };
  };

  devStack: {
    languages: string[];          // e.g. ['nodejs', 'python'] — multi-select
    frameworks: Record<string, string>;  // e.g. { nodejs: 'nextjs' } — one per language
    frontend: string[];           // e.g. ['reactjs', 'typescript'] — multi-select
  };
  boilerplate: { generate: boolean; sampleData: boolean; devMode: 'hot-reload' | 'production' };

  domain: {
    provider: 'local' | 'freedomain' | 'custom';
    freeDomainTld: '.dpdns.org' | '.qzz.io' | '.us.kg';
    name: string;
    ssl: 'none' | 'self-signed' | 'letsencrypt' | 'cloudflare';
    cloudflare: {
      enabled: boolean;
      tunnelToken: string;
      tunnelName: string;   // 기본값: 'brewnet-tunnel'
    };
  };
}
```

---

## 10. 외부 접근 전략

### 10.1 솔루션 비교

| 솔루션 | 방식 | 무료 | 포트포워딩 불필요 | 도메인 필요 | 선정 |
|--------|------|:----:|:-----------------:|:-----------:|:----:|
| **Cloudflare Tunnel** | 리버스 프록시 | O (무제한) | O | O (CF 관리) | **채택** |
| Tailscale | Mesh VPN | O (100 디바이스) | O | X | 대안 |
| ZeroTier | Virtual LAN | O (25 디바이스) | O | X | 대안 |
| frp | 리버스 프록시 | O (셀프호스팅) | △ (VPS 필요) | X | 미채택 |
| ngrok | 터널 | △ (제한) | O | X | 미채택 |
| WireGuard | VPN | O (셀프호스팅) | O | X | 미채택 |

### 10.2 Cloudflare Tunnel 선정 이유

1. **포트포워딩 불필요** — 아웃바운드 전용 연결, NAT/CGNAT 환경 완벽 지원
2. **무료 플랜** — 무제한 트래픽, 무제한 터널
3. **자동 HTTPS** — Cloudflare 경유 SSL 자동 적용
4. **DDoS 보호** — Cloudflare 글로벌 네트워크 경유
5. **Zero Trust** — Access Policy로 세밀한 접근 제어 가능
6. **Docker 네이티브** — `cloudflared` 컨테이너로 docker-compose에 통합

---

## 11. 버전 관리 전략

- **Node.js**: LTS 버전만 지원 (20.x, 22.x)
- **의존성**: 주요 버전 고정, 마이너/패치는 caret(^) 허용
- **TypeScript**: strict mode 필수
- **ESM**: 전체 프로젝트 ESM (type: "module")
- **Docker 이미지**: 주요 버전 태그 고정 (예: `postgres:17-alpine`), `latest`는 유틸리티 서비스만

---

## Related Documents

- [PRD.md](PRD.md) — 제품 요구사항 (비전, 사용자 여정, 비즈니스 모델)
- [REQUIREMENT.md](REQUIREMENT.md) — 기능 요구사항 상세
- [USER-STORY.md](USER-STORY.md) — 사용자 여정 & 위저드 플로우
- [IMPLEMENT_SPEC.md](IMPLEMENT_SPEC.md) — 구현 스펙 (Feature별 상세)
- [spec/](spec/) — 초기 리서치 참조 문서 (20개)
