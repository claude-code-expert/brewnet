# Brewnet IMPLEMENT_SPEC (Software Design Document)

> **Version**: 2.1
> **Schema Version**: 4 (bumped from 3)
> **Last Updated**: 2026-02-22
> **Status**: Draft
> **Constitution**: [constitution.md](../.specify/memory/constitution.md) v1.0.0
> **Base**: [USER-STORY.md](USER-STORY.md), [REQUIREMENT.md](REQUIREMENT.md)

---

## 1. Purpose & Scope

이 문서는 Brewnet CLI의 전체 사용자 플로우를 **구현 가능한 Feature 단위**로
분해한 SDD(Software Design Document)이다. Spec Kit의 specify → plan →
task → analyze → implement → test 파이프라인에서 각 Feature를
독립적으로 실행할 수 있도록 설계되었다.

### 1.1 Document Hierarchy

```
USER-STORY.md    → 사용자 관점 (What the user sees)
IMPLEMENT_SPEC.md → 구현 관점 (What to build)      ← 이 문서
  └─ /speckit.specify  → Feature별 spec.md 생성
  └─ /speckit.plan     → Feature별 plan.md 생성
  └─ /speckit.tasks    → Feature별 tasks.md 생성
  └─ /speckit.analyze  → 일관성 검증
  └─ /speckit.implement → 구현 실행
```

### 1.2 Constitution Compliance

모든 Feature는 다음 원칙을 준수해야 한다:

| # | Principle | Implementation Impact |
|---|-----------|----------------------|
| I | Zero Config | 모든 프롬프트에 sensible default 제공 |
| II | Secure by Default | 생성된 설정에 보안 best practice 적용 |
| III | Transparent Operations | 모든 동작을 실시간 출력 + 로그 기록 |
| IV | Reversible Actions | 모든 단계에서 뒤로가기/되돌리기 지원 |
| V | Offline First | 핵심 CLI 기능은 오프라인 동작 |

---

## 2. Wizard Navigation Architecture

### 2.1 Step Navigation State Machine

모든 위저드 단계는 **양방향 네비게이션**을 지원한다. 사용자는
현재 단계에서 이전 단계로 돌아가거나, 전체 설치를 취소할 수 있다.
위저드는 **8단계** (Step 0 ~ Step 7)로 구성된다.

```
┌──────────────────────────────────────────────────────────┐
│                    WIZARD STATE MACHINE                    │
│                                                          │
│  [System Check] ──→ [Project Setup] ──→ [Server Comps]   │
│       │                   │ ↑                │ ↑         │
│       │              back/undo          back/undo        │
│       │                   │                  │           │
│       │              [Runtime & BP] ──→ [Domain & CF]    │
│       │                   │ ↑              │ ↑           │
│       │              back/undo        back/undo          │
│       │                   │                │             │
│       │                   └────[Review]────┘             │
│       │                          │                       │
│       │                ┌─────────┼─────────┐             │
│       │           [Generate] [Modify] [Export]           │
│       │                │                                 │
│       │           [Startup]                              │
│       │                │                                 │
│       ├──── [Cancel] ←─┤                                 │
│       │                │                                 │
│       └── [Uninstall/Cleanup] ←─┘                        │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Navigation Controls (모든 단계 공통)

각 위저드 단계에서 사용자에게 제공되는 네비게이션:

```
  Navigation:
    Enter     — Confirm and proceed to next step
    Backspace — Go back to previous step
    Ctrl+C    — Cancel wizard (with confirmation)

  ? Cancel setup? All selections will be lost.
    > No, continue setup
      Yes, cancel and exit
      Yes, cancel and clean up created files
```

### 2.3 WizardContext (상태 관리)

```typescript
interface WizardContext {
  currentStep: WizardStep;
  history: WizardStep[];           // 뒤로가기용 스택
  selections: WizardSelections;    // 각 단계 선택값
  canGoBack: boolean;
  canCancel: boolean;
}

interface AdminAccount {
  username: string;                                  // default: 'admin'
  password: string;                                  // auto-generated 20 chars on first visit
  storage: 'local';                                  // stored in local .env (chmod 600)
}

interface WizardSelections {
  projectName: string;
  projectPath: string;
  setupType: 'full' | 'partial';
  admin: AdminAccount;                               // NEW: admin credentials (Step 2)
  serverComponents: ServerComponentSelection;
  devStack: DevStackSelection | null;
  boilerplate: BoilerplateOptions | null;
  domain: DomainSelection | null;
}

interface ServerComponentSelection {
  webServer: 'traefik' | 'nginx' | 'caddy';          // required
  fileServer: 'nextcloud' | 'minio' | null;           // optional
  appServer: boolean;                                  // optional, user app deployment
  dbServer: DbServerSelection | null;                  // optional
  media: 'jellyfin' | null;                            // optional
  sshServer: SshServerSelection;                       // optional (v4)
  mailServer: MailServerSelection;                     // optional (v4)
  gitServer: GitServerSelection;                       // required (v2.1)
  fileBrowser: FileBrowserSelection | null;              // auto-included with appServer (v2.1)
}

interface SshServerSelection {
  enabled: boolean;                                    // default: false
  port: number;                                        // default: 2222
  passwordAuth: boolean;                               // default: false (key-only)
  sftp: boolean;                                       // default: false, auto-suggested when file/media enabled
}

interface MailServerSelection {
  enabled: boolean;                                    // default: false
  service: string;                                     // default: 'docker-mailserver'
}

interface GitServerSelection {
  enabled: true;         // 항상 true (필수 컴포넌트)
  service: 'gitea';      // fixed
  port: number;          // default: 3000 (web UI)
  sshPort: number;       // default: 3022 (git SSH, separate from SSH Server 2222)
}

interface DbServerSelection {
  primary: 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' | null;
  cache: 'redis' | 'valkey' | 'keydb' | null;
  primaryVersion?: string;
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;                                 // auto-generated
}

interface BoilerplateOptions {
  generateProject: boolean;
  sampleData: boolean;
  devMode: boolean;                                    // hot-reload vs production
}

interface DomainSelection {
  provider: 'local' | 'freedomain' | 'custom';      // NEW: domain provider type
  freeDomainTld: '.dpdns.org' | '.qzz.io' | '.us.kg'; // NEW: free domain TLD choice
  name: string;                                       // default: 'brewnet.local'
  ssl: 'none' | 'self-signed' | 'letsencrypt' | 'cloudflare'; // expanded SSL options
  cloudflare: {
    enabled: boolean;                                 // default: true (required for external access)
    tunnelToken: string;                              // from Cloudflare Zero Trust
    tunnelName: string;
  };
}

type WizardStep =
  | 'system-check'       // Step 0
  | 'project-setup'      // Step 1
  | 'server-components'  // Step 2
  | 'runtime-boilerplate'// Step 3
  | 'domain'             // Step 4
  | 'review'             // Step 5
  | 'generate'           // Step 6
  | 'startup'            // Step 7
  | 'complete';
```

#### 2.4 DEFAULT_STATE (wizard.js, Schema v4 → v2.1)

위저드의 기본 상태. Schema version 4.2에서 2.1로 변경되었다.

```javascript
const DEFAULT_STATE = {
  // ... other fields ...
  admin: {
    username: 'admin',
    password: '',          // auto-generated 20 chars on first visit
    storage: 'local',      // stored in local .env (chmod 600)
  },
  servers: {
    // ... webServer, fileServer, appServer, dbServer, media (unchanged) ...
    sshServer: {
      enabled: false,
      port: 2222,            // default SSH port (avoids conflict with host sshd)
      passwordAuth: false,   // key-only by default (Constitution II)
      sftp: false,           // auto-suggested when fileServer or media enabled
    },
    mailServer: {
      enabled: false,
      service: 'docker-mailserver',  // ghcr.io/docker-mailserver/docker-mailserver:latest
    },
    gitServer: {
      enabled: true,        // required — always enabled
      service: 'gitea',     // fixed
      port: 3000,           // web UI port
      sshPort: 3022,        // git SSH port (separate from SSH Server 2222)
    },
  },
  domain: {
    provider: 'local',      // 'local' | 'freedomain' | 'custom'
    freeDomainTld: '.dpdns.org',
    name: 'brewnet.local',
    ssl: 'cloudflare',      // 'none' | 'self-signed' | 'letsencrypt' | 'cloudflare'
    cloudflare: {
      enabled: true,         // required for external access
      tunnelToken: '',
      tunnelName: '',
    },
  },
  // Schema version
  _schemaVersion: 4,
};
```

**Schema v4.2 → v2.1 Migration Notes**:
- `gitServer.enabled` changed to always `true` (required component — like webServer)
- FileBrowser (`filebrowser/filebrowser:latest`) added — auto-included when `appServer` enabled
- `servers.fileBrowser` 필드 추가 (신규): FileBrowser 설정 (`enabled`, `service`)
- Admin credentials propagated to FileBrowser service

**Schema v4 → v4.2 Migration Notes**:
- `servers.gitServer` 필드 추가 (신규): Git 서버 설정 (`enabled`, `service`, `port`, `sshPort`)
- `gitServer.enabled` auto-ON when `appServer` is enabled
- `gitServer.sshPort` (3022) is separate from SSH Server port (2222)
- Admin credentials propagated to Gitea service

**Schema v3 → v4 Migration Notes**:
- `servers.sshServer` 필드 추가 (신규): SSH 서버 설정 (`enabled`, `port`, `passwordAuth`, `sftp`)
- `servers.mailServer` 필드 추가 (신규): 메일 서버 설정 (`enabled`, `service`)
- `sshServer.sftp` auto-suggested when `fileServer` or `media` is enabled
- `mailServer` only shown when `domain.provider !== 'local'`
- Admin credentials propagated to SSH and Mail services
- `_schemaVersion` bumped from 3 to 4

**Schema v2 → v3 Migration Notes** (previous):
- `admin` 필드 추가 (신규)
- `domain.provider` 추가 (`'local'` | `'freedomain'` | `'custom'`)
- `domain.freeDomainTld` 추가 (Free Domain 전용)
- `domain.ssl` 타입 변경: `boolean` → `'none' | 'self-signed' | 'letsencrypt' | 'cloudflare'`
- `domain.cloudflare` 객체로 확장 (이전: `cloudflareTunnel: boolean`)
- `domain.cloudflare.enabled` 기본값 `true` (이전: `false`)

---

## 3. Feature Breakdown

전체 구현을 **9개 Feature**로 분해한다. 각 Feature는 Spec Kit의
`/speckit.specify` 명령으로 독립적인 spec.md를 생성할 수 있다.

### Feature Map

```
F01  CLI Bootstrap & Entry Point
F02  System Check (Step 0)
F03  Project Setup & Setup Type (Step 1)
F04  Server Component Selection (Step 2)
F05  Runtime & Boilerplate (Step 3)
F06  Domain & Cloudflare Configuration (Step 4)
F07  Review, Confirm & Generate (Step 5)
F08  Docker Compose Generation & Service Startup (Step 6-7)
F09  Post-Setup Service Management
```

### Dependency Graph

```
F01 ──→ F02 ──→ F03 ──→ F04 ──→ F05 ──→ F06 ──→ F07 ──→ F08
                  │                                 ↑       │
                  │        (Partial) ───────────────┘       │
                  │                                         │
                  └────────────────────────────────────────→ F09
```

---

## 4. Feature Specifications

---

### F01: CLI Bootstrap & Entry Point

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.1.1, REQ-1.1.2

#### Description

Brewnet CLI의 진입점. `brewnet` 명령어를 글로벌로 등록하고
Commander.js 기반 서브커맨드 라우팅을 설정한다.

#### Key Entities

| Entity | File | Description |
|--------|------|-------------|
| CLI Entry | `packages/cli/src/index.ts` | Commander.js 프로그램 등록 |
| Config | `packages/cli/src/config/defaults.ts` | 기본값 상수 |
| ErrorHandler | `packages/cli/src/utils/error-handler.ts` | BN 에러 코드 처리 |
| Logger | `packages/cli/src/utils/logger.ts` | chalk/ora 기반 출력 |

#### Acceptance Criteria

1. `npm install -g brewnet` 후 `brewnet --version` 출력 성공
2. `brewnet --help` 에 모든 서브커맨드 목록 표시
3. 알 수 없는 명령어 입력 시 BN008 에러 코드 + 도움말 표시
4. `brewnet init`, `brewnet up`, `brewnet down`, `brewnet status`,
   `brewnet add`, `brewnet remove`, `brewnet logs` 서브커맨드 등록

#### Source Structure

```
packages/cli/
├── src/
│   ├── index.ts                   # Entry: Commander program
│   ├── commands/
│   │   ├── init.ts                # brewnet init
│   │   ├── up.ts                  # brewnet up
│   │   ├── down.ts                # brewnet down
│   │   ├── status.ts              # brewnet status
│   │   ├── add.ts                 # brewnet add <service>
│   │   ├── remove.ts              # brewnet remove <service>
│   │   └── logs.ts                # brewnet logs [service]
│   ├── config/
│   │   ├── defaults.ts            # Default values
│   │   └── paths.ts               # ~/.brewnet/ paths
│   └── utils/
│       ├── error-handler.ts       # BN error codes
│       ├── logger.ts              # chalk + ora output
│       └── system-info.ts         # OS/arch detection
├── package.json
├── tsconfig.json
└── tsup.config.ts                 # Build config
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T01-01 | Unit | Commander 서브커맨드 등록 확인 |
| T01-02 | Unit | 에러 핸들러 BN 코드 매핑 |
| T01-03 | Integration | `brewnet --version` 출력 |
| T01-04 | Integration | `brewnet --help` 출력 |

---

### F02: System Check (Step 0)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.2.1 ~ REQ-1.2.7

#### Description

`brewnet init` 실행 시 가장 먼저 수행되는 시스템 요구사항 확인.
배너를 출력하고 OS, Docker, 메모리, 디스크, 포트 등을 검증한다.

#### Key Entities

| Entity | File | Description |
|--------|------|-------------|
| SystemChecker | `packages/cli/src/services/system-checker.ts` | 시스템 검증 로직 |
| BannerRenderer | `packages/cli/src/utils/banner.ts` | 배너 출력 |
| CheckResult | `packages/shared/src/types/system.ts` | 검증 결과 타입 |

#### System Check Items

| # | Check | Command / Method | Pass Criteria |
|---|-------|------------------|---------------|
| 1 | OS Detection | `process.platform`, `os.release()` | macOS 12+ / Ubuntu 20.04+ |
| 2 | Memory | `os.totalmem()` | >= 2GB |
| 3 | Disk | `fs.statfs()` / `execa('df')` | >= 20GB available |
| 4 | Docker | `dockerode.ping()` | Docker daemon responding |
| 5 | Docker Compose | `execa('docker compose version')` | v2.x+ |
| 6 | Node.js | `process.version` | >= 20.0.0 |
| 7 | Git | `execa('git --version')` | Any version |
| 8 | Port 80 | `net.createServer().listen(80)` | Available |
| 9 | Port 443 | `net.createServer().listen(443)` | Available |

#### Failure Behavior

- 각 체크 실패 시: 해당 항목에 `[FAIL]` 표시 + 설치 가이드 출력
- Docker 미설치 (필수): BN001 에러 → 설치 URL 안내 후 종료
- 메모리/디스크 부족: 경고 출력 → 사용자 확인 후 계속 진행 가능

#### Navigation

```
[System Check]
  ├── All pass    → Auto-proceed to Project Setup
  ├── Warn only   → "Continue anyway? (y/N)"
  └── Fatal fail  → Exit with error code + install guide
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T02-01 | Unit | OS 감지 (macOS, Linux) |
| T02-02 | Unit | 메모리/디스크 체크 로직 |
| T02-03 | Unit | Docker ping mock 테스트 |
| T02-04 | Unit | 포트 사용 가능 여부 체크 |
| T02-05 | Integration | 전체 시스템 체크 플로우 |

---

### F03: Project Setup & Setup Type (Step 1)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.3.1, REQ-1.3.2

#### Description

프로젝트 이름, 경로, 설정 유형(Full / Partial)을 입력받는다.
Setup Type에 따라 이후 위저드 단계의 흐름이 결정된다.

- **Full**: 모든 단계를 순서대로 진행한다 (Step 2 → 3 → 4 → 5).
- **Partial**: 사용자가 원하는 단계만 선택하여 진행한다. Server Components(Step 2)는
  필수이며, Runtime & Boilerplate(Step 3)와 Domain & Cloudflare(Step 4)는
  건너뛸 수 있다.

#### Prompts

| Prompt | Type | Default | Validation |
|--------|------|---------|------------|
| Project name | input | `my-homeserver` | `^[a-z0-9-]+$`, 1-64 chars |
| Location | input | `~/brewnet/{name}` | 유효한 경로, 기존 디렉토리 아님 |
| Setup type | select | `Full` | 2개 옵션 중 택 1 |

#### Setup Type Routing

```typescript
function getNextStep(setupType: SetupType): WizardStep {
  switch (setupType) {
    case 'full':
      return 'server-components';   // Step 2 → 3 → 4 → 5
    case 'partial':
      return 'server-components';   // Step 2 → (optional 3) → (optional 4) → 5
  }
}
```

#### Navigation

```
[Project Setup]
  ├── Enter       → Proceed to Server Components (Step 2)
  ├── Backspace   → Back to System Check (re-run not needed)
  └── Ctrl+C      → Cancel wizard
```

#### Undo/Rollback

- 이전 단계로 돌아오면 이전 입력값이 기본값으로 유지됨
- 경로에 디렉토리가 이미 생성된 경우 없음 (아직 파일 생성 전)

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T03-01 | Unit | 프로젝트 이름 유효성 검증 |
| T03-02 | Unit | 경로 유효성 검증 + 중복 체크 |
| T03-03 | Unit | Setup Type별 다음 단계 라우팅 (full / partial) |
| T03-04 | Integration | 프롬프트 입력 → 상태 저장 플로우 |

---

### F04: Server Component Selection (Step 2)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.3.3, REQ-2.1.2

#### Description

**Admin Account 설정** 후 8개 서버 컴포넌트를 **토글 카드** 형태로 선택한다.
Admin 자격증명은 이 단계 최상단에서 설정되며, Web Server와 Git Server는 필수이고,
나머지 컴포넌트는 선택 사항이다(FileBrowser는 App Server 활성화 시 자동 포함).
DB Server 선택 시 Primary DB와 Cache를 인라인으로 구성한다.

#### Admin Account (Step 2 상단)

Admin 계정은 서버 컴포넌트 토글 이전에 설정된다. 이 자격증명은
Nextcloud, pgAdmin 등 설치되는 서비스들의 기본 관리자 비밀번호로 사용된다.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Username | input | `admin` | 관리자 사용자명 |
| Password | input (masked) | (auto-generated) | 20자 자동 생성, 첫 방문 시 |
| Storage | — | `local` | 로컬 `.env` 파일에 저장 (chmod 600) |

**Auto-generated Password**:
- 첫 방문(위저드 최초 진입) 시 20자 비밀번호 자동 생성
- `crypto.randomBytes(15).toString('base64url').slice(0, 20)` 사용
- 사용자가 원하면 수정 가능
- `.env` 파일에 `BREWNET_ADMIN_USERNAME`, `BREWNET_ADMIN_PASSWORD`로 저장
- `.env` 파일 퍼미션: `chmod 600` (소유자만 읽기/쓰기)

**Admin Password 전파**:
- Nextcloud: `NEXTCLOUD_ADMIN_USER` / `NEXTCLOUD_ADMIN_PASSWORD`
- pgAdmin: `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`
- 기타 서비스: 각 서비스의 admin env var에 매핑

```
  ┌──────────────────────────────────────────────────────┐
  │  Admin Account                                       │
  │                                                      │
  │  Username:  admin                                    │
  │  Password:  ******************** [Show] [Regenerate] │
  │                                                      │
  │  ℹ This password will be used as the default admin   │
  │    password for Nextcloud, pgAdmin, and other        │
  │    services.                                         │
  └──────────────────────────────────────────────────────┘
```

#### Server Components

| # | Component | Required | Options | Default |
|---|-----------|:--------:|---------|---------|
| 1 | **Web Server** | Yes | Traefik, Nginx, Caddy | Traefik |
| 2 | **File Server** | No | Nextcloud, MinIO | — |
| 3 | **App Server** | No | (user app deployment) | — |
| 4 | **DB Server** | No | Primary DB + Cache (see below) | — |
| 5 | **Media** | No | Jellyfin | — |
| 6 | **SSH Server** | No | Port, Password Auth, SFTP | Port 2222, key-only |
| 7 | **Git Server** | Yes | Gitea (항상 활성화) | Port 3000 (web), 3022 (SSH) |
| 8 | **FileBrowser** | No (default with App Server) | filebrowser/filebrowser:latest | files.{DOMAIN} |

#### DB Server Inline Configuration

DB Server 토글을 활성화하면 인라인으로 추가 설정을 입력받는다:

```
[DB Server] ON
  ├── Primary DB: (select one)
  │     PostgreSQL / MySQL / MariaDB / SQLite
  ├── Cache: (select one, optional)
  │     Redis / Valkey / KeyDB / None
  ├── DB Name:     mydb          (auto-generated default)
  ├── DB User:     brewnet       (auto-generated default)
  └── DB Password: ************  (auto-generated, shown once)
```

#### Component Registry

```typescript
interface ServerComponent {
  id: string;
  name: string;
  type: ServerComponentType;
  required: boolean;
  dockerImage: string;
  defaultPort: number;
  subdomainPrefix?: string;
  volumes: VolumeMapping[];
  envVars: EnvVar[];
  healthcheck: HealthcheckConfig;
  traefikLabels: TraefikLabel[];
}

type ServerComponentType =
  | 'webServer'
  | 'fileServer'
  | 'appServer'
  | 'dbServer'
  | 'media'
  | 'sshServer'
  | 'gitServer'
  | 'fileBrowser';
```

#### Toggle Card UI

Admin Account 섹션이 최상단에 표시되고, 그 아래에 각 컴포넌트가
토글 카드로 표시된다:

```
  ┌──────────────────────────────────────────────────────┐
  │  Admin Account                                       │
  │  Username: admin          Password: ******** [Show]  │
  ├══════════════════════════════════════════════════════╡
  │ ● Web Server (required)                [Traefik ▾]   │
  │   Reverse proxy and SSL termination                  │
  ├──────────────────────────────────────────────────────┤
  │ ○ File Server                          [Nextcloud ▾] │
  │   Cloud storage and file sync                        │
  ├──────────────────────────────────────────────────────┤
  │ ○ App Server                           [ON/OFF]      │
  │   Deploy your own applications                       │
  ├──────────────────────────────────────────────────────┤
  │ ○ DB Server                            [ON/OFF]      │
  │   Database and cache services                        │
  ├──────────────────────────────────────────────────────┤
  │ ○ Media                                [ON/OFF]      │
  │   Media streaming with Jellyfin                      │
  ├──────────────────────────────────────────────────────┤
  │ ○ SSH Server                           [ON/OFF]      │
  │   Remote access via SSH/SFTP                         │
  ├──────────────────────────────────────────────────────┤
  │ ● Git Server (required)                [Gitea]        │
  │   Self-hosted Git (항상 활성화)                       │
  ├──────────────────────────────────────────────────────┤
  │ ○ FileBrowser                         [ON/OFF]      │
  │   Web-based file manager (default with App Server)   │
  └──────────────────────────────────────────────────────┘
```

#### SSH Server Inline Configuration

SSH Server 토글을 활성화하면 인라인으로 추가 설정을 입력받는다:

```
[SSH Server] ON
  ├── Port:           2222          (default, avoids conflict with host sshd)
  ├── Password Auth:  [ ] Disabled  (key-only by default, Constitution II)
  ├── SFTP:           [ ] Disabled  (auto-suggested when File/Media enabled)
  └── Login:          Uses admin credentials
```

**SFTP Auto-suggestion**: File Server 또는 Media가 활성화된 경우,
SSH Server 토글 시 SFTP가 자동으로 권장(suggested)된다:

```
  ℹ File Server / Media is enabled.
    SFTP is recommended for remote file management.
    ? Enable SFTP subsystem? (Y/n)
```

**SSH Authentication**: SSH 서버는 admin credentials를 사용하여 로그인한다.
별도의 SSH 사용자 생성은 `brewnet ssh add-user` 명령으로 설치 후 수행.

> **Note**: Admin credentials entered once, propagated to all services.
> SSH, Nextcloud, pgAdmin, DB Server 등 모든 서비스가 동일한 admin 자격증명을 사용한다.

#### Git Server 위자드 통합

**컴포넌트 카드 (Step 2):**
- Git Server — 항상 활성화 (필수 컴포넌트, Web Server와 동일)
- 토글 OFF 불가 (required)

**State 필드:**
```typescript
interface GitServerState {
  enabled: true;         // 항상 true (필수 컴포넌트)
  service: 'gitea';      // fixed
  port: number;          // default: 3000 (web UI)
  sshPort: number;       // default: 3022 (git SSH, separate from SSH Server 2222)
}
```

**Docker Compose 생성 (gitea):**
```yaml
  gitea:
    image: gitea/gitea:latest
    container_name: brewnet-gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - GITEA__database__DB_TYPE=postgres
      - GITEA__database__HOST=brewnet-postgres:5432
      - GITEA__database__NAME=${DB_NAME}
      - GITEA__database__USER=${DB_USER}
      - GITEA__database__PASSWD=${DB_PASSWORD}
      - GITEA__server__ROOT_URL=https://git.${DOMAIN}
      - GITEA__server__SSH_DOMAIN=${DOMAIN}
      - GITEA__server__SSH_PORT=3022
    volumes:
      - gitea-data:/data
      - gitea-config:/etc/gitea
    ports:
      - "3000:3000"
      - "3022:22"
    networks:
      - brewnet
    depends_on:
      - brewnet-postgres
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gitea.rule=Host(`git.${DOMAIN}`)"
      - "traefik.http.routers.gitea.entrypoints=websecure"
      - "traefik.http.services.gitea.loadbalancer.server.port=3000"
      - "traefik.http.routers.gitea.tls=true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/version"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**자동 배포 Webhook 설정:**
```typescript
interface WebhookConfig {
  repoUrl: string;        // git repository URL
  targetBranch: string;    // default: 'main'
  deployCommand: string;   // e.g., 'docker-compose up -d --build app'
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
}
```

#### FileBrowser 위자드 통합 (v2.1)

**컴포넌트 카드 (Step 2):**
- App Server 활성화 시 FileBrowser 자동 포함 (default)
- 독립 비활성화 가능 (`appServer` ON 상태에서 FileBrowser만 OFF)

**State 필드:**
```typescript
interface FileBrowserSelection {
  enabled: boolean;      // default: true when appServer enabled
  service: 'filebrowser'; // fixed
}
```

**Docker Compose 생성 (filebrowser):**
```yaml
  filebrowser:
    image: filebrowser/filebrowser:latest
    container_name: brewnet-filebrowser
    volumes:
      - ./storage:/srv
      - ./config/filebrowser.json:/config/filebrowser.json
      - ./data/filebrowser/database.db:/database.db
    environment:
      - FB_ROOT=/srv
      - FB_CONFIG=/config/filebrowser.json
      - FB_DATABASE=/database.db
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.filebrowser.rule=Host(`files.${DOMAIN}`)"
      - "traefik.http.routers.filebrowser.entrypoints=websecure"
      - "traefik.http.services.filebrowser.loadbalancer.server.port=80"
      - "traefik.http.routers.filebrowser.tls=true"
    networks:
      - brewnet
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**filebrowser.json 설정 파일:**
```json
{
  "port": 80,
  "baseURL": "",
  "address": "0.0.0.0",
  "log": "stdout",
  "database": "/database.db",
  "root": "/srv",
  "auth": {
    "method": "json",
    "header": ""
  },
  "branding": {
    "name": "Brewnet Files",
    "disableExternal": false
  }
}
```

**FileBrowser API Reference:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | JWT 인증 (body: `{ username, password }`) |
| `/api/resources/{path}` | GET | 디렉토리 목록 / 파일 메타데이터 조회 |
| `/api/resources/{path}` | POST | 파일 업로드 (multipart) |
| `/api/resources/{path}` | DELETE | 파일/디렉토리 삭제 |
| `/api/raw/{path}` | GET | 파일 다운로드 (raw content) |

**Admin Credential Propagation:**
- FileBrowser 최초 실행 시 기본 admin 계정 (`admin` / `admin`) 생성됨
- Brewnet 설치 과정에서 admin 자격증명으로 자동 변경:
  ```bash
  # FileBrowser API를 통한 admin 비밀번호 변경
  curl -X PUT http://localhost:80/api/users/1 \
    -H "Authorization: Bearer ${JWT_TOKEN}" \
    -d '{"username":"${BREWNET_ADMIN_USERNAME}","password":"${BREWNET_ADMIN_PASSWORD}"}'
  ```
- 사용자 격리: `scope` 필드를 통해 사용자별 디렉토리 제한 가능

#### Auto-generated Credentials (Constitution II)

DB Server 선택 시 비밀번호 자동 생성:
- `crypto.randomBytes(24).toString('base64url')` 사용
- 최소 16자 보장
- `.env` 파일에 기록, 콘솔에는 마스킹 없이 1회 표시

#### Navigation

```
[Server Components]
  ├── ↑/↓       → Navigate between component cards
  ├── Space      → Toggle component ON/OFF
  ├── Enter      → Confirm selections, proceed to next step
  ├── Backspace  → Back to Project Setup
  └── Ctrl+C     → Cancel wizard

[DB Server Inline Config] (shown when DB Server is toggled ON)
  ├── Tab        → Next field
  ├── Enter      → Confirm DB config
  └── Backspace  → Cancel DB config (toggle OFF)
```

#### Resource Estimation

선택된 컴포넌트 목록과 Cloudflare Tunnel 활성화 여부로 리소스를 추정한다.
Cloudflare Tunnel이 활성화되면 `cloudflared` 컨테이너가 추가된다:

```typescript
interface ResourceEstimate {
  containers: number;        // cloudflared 포함 시 +1
  estimatedRamMB: number;   // cloudflared: ~128MB
  estimatedDiskGB: number;  // cloudflared: ~0.2GB
}

// cloudflared 리소스 상수
const CLOUDFLARED_RESOURCES = {
  ramMB: 128,
  diskGB: 0.2,
};

// SSH Server 리소스 상수 (v4)
const OPENSSH_SERVER_RESOURCES = {
  ramMB: 16,
  diskGB: 0.05,
};

// Mail Server 리소스 상수 (v4)
const DOCKER_MAILSERVER_RESOURCES = {
  ramMB: 256,
  diskGB: 0.5,
};

// Git Server 리소스 상수 (v4.2)
const GITEA_RESOURCES = {
  ramMB: 256,
  diskGB: 1.0,
};

// FileBrowser 리소스 상수 (v2.1)
const FILEBROWSER_RESOURCES = {
  ramMB: 50,
  diskGB: 0.1,
};

function estimateResources(
  components: ServerComponentSelection,
  domain: DomainSelection,
): ResourceEstimate;
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T04-01 | Unit | ServerComponent 레지스트리에 모든 컴포넌트 등록 확인 |
| T04-02 | Unit | Web Server 필수 선택 검증 |
| T04-03 | Unit | DB Server 인라인 설정 (Primary DB + Cache 조합) |
| T04-04 | Unit | 비밀번호 자동 생성 (길이, 랜덤성) |
| T04-05 | Unit | 리소스 추정 계산 |
| T04-06 | Unit | Traefik 라벨 생성 로직 |
| T04-07 | Integration | 8개 컴포넌트 토글 + DB 인라인 설정 플로우 |
| T04-08 | Unit | Admin 비밀번호 자동 생성 (20자, 첫 방문 시) |
| T04-09 | Unit | Admin 자격증명 `.env` 저장 (chmod 600) |
| T04-10 | Unit | Admin 비밀번호 서비스 전파 (Nextcloud, pgAdmin 등) |
| T04-11 | Integration | Admin Account + 컴포넌트 선택 통합 플로우 |
| T04-12 | Unit | SSH Server toggle should add openssh-server to collectAllServices |
| T04-13 | Unit | SFTP auto-suggested when File Server or Media enabled |
| T04-14 | Unit | SSH Server inline config (port, passwordAuth, sftp) |
| T04-15 | Integration | SSH Server toggle + SFTP auto-suggestion 플로우 |
| T04-16 | Unit | Git Server 위자드 통합 — 항상 활성화 (required 컴포넌트) |
| T04-17 | Unit | Git Server SSH 포트 충돌 방지 — SSH Server(2222)와 Git SSH(3022) 분리 |
| T04-18 | Unit | FileBrowser — App Server ON 시 자동 포함 (default enabled) |
| T04-19 | Unit | FileBrowser — App Server OFF 시 비활성화 |
| T04-20 | Unit | FileBrowser Traefik 라벨 생성 (files.{DOMAIN}) |

---

### F05: Runtime & Boilerplate (Step 3)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.3.4, REQ-12.1.1 ~ REQ-12.1.6

#### Description

개발 언어와 프레임워크를 선택하고, 보일러플레이트 옵션을 설정한다.
언어 선택 → 프레임워크 선택 → 보일러플레이트 옵션 순서.
App Server가 선택되지 않은 경우에도 이 단계를 진행할 수 있으며,
이 경우 보일러플레이트만 로컬에 생성된다.

#### Framework Registry

```typescript
interface FrameworkDefinition {
  id: string;
  name: string;
  language: Language;
  license: string;
  dockerBaseImage: string;
  defaultPort: number;
  buildCommand: string;
  startCommand: string;
  packageManager: string;
  templateDir: string;          // packages/cli/templates/{id}/
}

type Language = 'python' | 'nodejs' | 'java' | 'rust' | 'go';
```

| Language | Frameworks | Default Port |
|----------|-----------|:------------:|
| Python | FastAPI, Django, Flask | 8000 |
| Node.js | Next.js, Express, NestJS, Fastify | 3000 |
| Java | Spring Boot, Quarkus, Micronaut | 8080 |
| Rust | Actix Web, Axum | 8080 |
| Go | Gin, Echo, Fiber | 8080 |

#### Boilerplate Options

프레임워크 선택 후 보일러플레이트 옵션을 설정한다:

| Option | Type | Choices | Default |
|--------|------|---------|---------|
| Generate Project | confirm | Yes / No | Yes |
| Sample Data | confirm | Yes / No | Yes |
| Dev Mode | select | Hot-reload / Production | Hot-reload |

**Generate Project**: 선택한 프레임워크의 보일러플레이트 코드를
프로젝트 디렉토리에 생성한다.

**Sample Data**: 데이터베이스 시드 데이터 및 예제 API 엔드포인트를
포함한다.

**Dev Mode**: Hot-reload 선택 시 `docker-compose.dev.yml` 오버라이드
파일을 생성하여 소스 볼륨 마운트 + 핫리로드 명령어를 적용한다.

#### Hot-reload Implementation

Hot-reload 선택 시 `docker-compose.dev.yml` 오버라이드 파일 생성:

```yaml
# docker-compose.dev.yml
services:
  fastapi-app:
    volumes:
      - ./apps/fastapi-app/src:/app/src   # Source mount
    command: uvicorn src.main:app --reload --host 0.0.0.0
```

#### App Storage 구현 스펙

**State 필드:**
```typescript
interface AppStorageState {
  enabled: boolean;      // default: true when appServer enabled
  path: string;          // default: './storage' (project-relative)
  maxSize: string;       // default: '' (unlimited), e.g., '10GB'
  fileBrowser: boolean;  // default: true
}
```

**디렉토리 구조 생성:**
```
{projectPath}/storage/
├── uploads/
│   ├── public/           # 공개 파일 (인증 불필요)
│   └── .gitkeep
├── temp/                 # 임시 파일 (cron 자동 정리)
│   └── .gitkeep
└── backups/
    └── .gitkeep
```

**보일러플레이트 API 엔드포인트 (프레임워크별):**

| Framework | Upload Endpoint | File Browser |
|-----------|----------------|-------------|
| FastAPI | `fastapi-app/src/routers/files.py` | Jinja2 template |
| Express | `express-app/src/routes/files.js` | EJS template |
| NestJS | `nestjs-app/src/files/files.controller.ts` | Handlebars template |
| Spring Boot | `spring-app/src/main/java/.../FileController.java` | Thymeleaf template |
| Gin | `gin-app/handlers/files.go` | Go template |

**FastAPI 예시 (files.py):**
```python
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import shutil

router = APIRouter(prefix="/api/files", tags=["files"])
STORAGE_PATH = Path("/app/storage/uploads")

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    user_dir = STORAGE_PATH / str(current_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    dest = user_dir / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": str(dest.relative_to(STORAGE_PATH)), "size": dest.stat().st_size}

@router.get("/")
async def list_files(
    dir: str = "/",
    current_user = Depends(get_current_user)
):
    target = STORAGE_PATH / str(current_user.id) / dir.lstrip("/")
    if not target.exists():
        raise HTTPException(404, "Directory not found")
    entries = []
    for item in sorted(target.iterdir()):
        entries.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else 0,
            "modified": item.stat().st_mtime
        })
    return {"path": dir, "entries": entries}

@router.get("/{file_path:path}")
async def download_file(
    file_path: str,
    current_user = Depends(get_current_user)
):
    target = STORAGE_PATH / str(current_user.id) / file_path
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)

@router.delete("/{file_path:path}")
async def delete_file(
    file_path: str,
    current_user = Depends(get_current_user)
):
    target = STORAGE_PATH / str(current_user.id) / file_path
    if not target.exists():
        raise HTTPException(404, "File not found")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"deleted": file_path}
```

**Docker 볼륨 매핑:**
```yaml
  app:
    volumes:
      - ./storage:/app/storage
    environment:
      - STORAGE_PATH=/app/storage
      - STORAGE_MAX_SIZE=${STORAGE_MAX_SIZE:-}
```

**파일 브라우저 UI:**
- 로그인 필수 (Admin 크리덴셜 또는 사용자 계정)
- 디렉토리 트리 네비게이션
- 파일 업로드 (드래그 앤 드롭 지원)
- 파일 다운로드, 삭제, 이름 변경
- 이미지 미리보기
- 접근 URL: `https://{app}.{DOMAIN}/files/browse`

#### Navigation

```
[Language Select]
  ├── Enter     → Proceed to Framework Select
  ├── Backspace → Back to Server Components
  └── Ctrl+C    → Cancel wizard

[Framework Select]
  ├── Enter     → Proceed to Boilerplate Options
  ├── Backspace → Back to Language Select
  └── Ctrl+C    → Cancel wizard

[Boilerplate Options]
  ├── Enter     → Proceed to Domain & Cloudflare (Step 4)
  ├── Backspace → Back to Framework Select
  └── Ctrl+C    → Cancel wizard
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T05-01 | Unit | 언어별 프레임워크 필터링 |
| T05-02 | Unit | FrameworkDefinition 유효성 (모든 필드) |
| T05-03 | Unit | 템플릿 디렉토리 존재 확인 |
| T05-04 | Unit | 보일러플레이트 옵션 조합별 docker-compose.dev.yml 오버라이드 생성 |
| T05-05 | Unit | Hot-reload 볼륨 마운트 경로 정확성 |
| T05-06 | Integration | 언어 → 프레임워크 → 보일러플레이트 옵션 플로우 |
| T05-07 | Unit | App Storage 경로 설정 — 기본 ./storage, 커스텀 경로 지원 |
| T05-08 | Integration | App Storage 파일 업로드/다운로드 API 동작 확인 |
| T05-09 | Integration | App Storage 파일 브라우저 — 로그인 후 디렉토리 조회 |

---

### F06: Domain & Cloudflare Configuration (Step 4)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.3.5

#### Description

도메인 제공자 선택, 도메인 이름, SSL 인증서 설정, Cloudflare Tunnel 구성을
입력받는다. 이 단계에서 외부 접근 경로가 결정된다. **3가지 도메인 제공자**를
지원하며, 외부 접근이 필요한 경우(local 이외) Cloudflare Tunnel이
**기본적으로 활성화**된다.

#### Domain Providers (3가지)

| # | Provider | Description | Recommended |
|---|----------|-------------|:-----------:|
| 1 | **Local Only** (.local) | 외부 접근 없음, `brewnet.local` 사용 | — |
| 2 | **Free Domain (DigitalPlat)** | 무료 도메인 등록 (.dpdns.org, .qzz.io, .us.kg) | **RECOMMENDED** |
| 3 | **Own Domain** | 사용자 소유 도메인 사용 | — |

#### Free Domain (DigitalPlat) Flow

Free Domain 선택 시 사용자를 다음 단계로 안내한다:

```
[Free Domain Setup Guide]
  1. Cloudflare 계정 생성/로그인
     → https://dash.cloudflare.com/sign-up
  2. DigitalPlat FreeDomain 등록
     → https://freedomain.digitalplat.org
  3. 도메인 등록 시 Cloudflare 네임서버 설정
     → 할당된 CF 네임서버 2개를 DigitalPlat에 입력
  4. DNS 전파 대기 (최대 24시간, 보통 수 분)
     → 위저드에서 DNS 전파 상태 확인 가능
```

**Free Domain TLD 선택**:

| TLD | Example | Description |
|-----|---------|-------------|
| `.dpdns.org` | `myserver.dpdns.org` | 기본값, 가장 안정적 |
| `.qzz.io` | `myserver.qzz.io` | 짧은 도메인 |
| `.us.kg` | `myserver.us.kg` | 대안 TLD |

#### Prompts

| Prompt | Type | Default | Validation |
|--------|------|---------|------------|
| Domain provider | select | `Local Only` | 3개 옵션 중 택 1 |
| Free Domain TLD | select (freedomain만) | `.dpdns.org` | 3개 TLD 중 택 1 |
| Domain name | input | `brewnet.local` (local) / (입력필요) | 유효한 도메인 형식 |
| SSL method | select | `cloudflare` | `none` / `self-signed` / `letsencrypt` / `cloudflare` |
| Cloudflare Tunnel | toggle | ON (external) / OFF (local) | Required for external access |
| Tunnel Token | input (masked) | — | 비어있지 않을 것 (tunnel 활성 시) |
| Tunnel Name | input | (auto from domain) | 선택사항 |

#### Domain Configuration Flow

```
[Domain Provider Select]
  ├── Local Only (.local)
  │     → name: 'brewnet.local'
  │     → ssl: 'none' | 'self-signed'
  │     → cloudflare.enabled: false
  │     → Summary
  │
  ├── Free Domain (DigitalPlat) — RECOMMENDED
  │     → [TLD Select] (.dpdns.org / .qzz.io / .us.kg)
  │     → [Domain Name Input] (e.g., myserver)
  │     → [Setup Guide Display] (Cloudflare + DigitalPlat 등록 안내)
  │     → ssl: 'cloudflare'
  │     → cloudflare.enabled: true (default ON, required)
  │     → [Tunnel Token Input]
  │     → Summary
  │
  ├── Own Domain
  │     → [Domain Name Input]
  │     → [SSL Select] (letsencrypt / cloudflare / self-signed)
  │     → cloudflare.enabled: true (default ON, required)
  │     → [Tunnel Token Input]
  │     → Summary
  │
  └── Backspace → Back to Runtime & Boilerplate (or Server Components)
```

#### Cloudflare Tunnel Integration (Essential for External Access)

Cloudflare Tunnel은 non-local 도메인에서 **기본 활성화**되며,
"Required for external access"로 표시된다. `cloudflared` 컨테이너가
docker-compose에 추가된다:

**Benefits**:
- 포트 포워딩 불필요 (no port forwarding needed)
- NAT/CGNAT 뒤에서도 동작
- 자동 HTTPS (auto HTTPS)
- DDoS 보호
- 실제 IP 숨김 (hides real IP)

**Tunnel Token 획득 경로**:
Cloudflare Zero Trust → Networks → Tunnels → Create Tunnel → Token 복사

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brewnet-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - brewnet
    depends_on:
      traefik:
        condition: service_healthy
```

#### DigitalPlat API Integration

FreeDomain 등록은 현재 수동 프로세스 (사용자가 DigitalPlat 대시보드를 방문).
향후 API 연동 로드맵:

| 단계 | 현재 (v1.0) | 향후 (v2.0+) |
|------|-------------|-------------|
| 도메인 검색 | 수동 (DigitalPlat 대시보드) | `brewnet domain free search myserver` |
| 도메인 등록 | 수동 (DigitalPlat 대시보드) | `brewnet domain free register myserver.dpdns.org` |
| 네임서버 설정 | 수동 (DigitalPlat 패널) | Cloudflare NS 자동 위임 via DigitalPlat API |
| DNS 전파 확인 | `dig +short NS {domain}` | `brewnet domain verify {domain}` |

> **참고**: DigitalPlat은 현재 공개 API를 제공하지 않음. 위저드에서 단계별 가이드를 제공하고, API가 공개되면 인라인 등록을 구현할 계획.

**Free Domain 등록 가이드 (위저드 Step 4에서 표시)**:
1. Cloudflare 계정 생성 (dash.cloudflare.com)
2. DigitalPlat FreeDomain 방문 (dash.domain.digitalplat.org)
3. 계정 등록/로그인
4. 도메인명 검색 및 TLD 선택 (.dpdns.org 권장)
5. 도메인 등록 완료
6. DigitalPlat 패널에서 Cloudflare 네임서버 설정
7. DNS 전파 대기 (15분~24시간, `dig +short NS {domain}` 으로 확인)
8. 위저드로 돌아와 도메인명 입력

#### Cloudflare Access Policy Configuration (Phase 2+)

서비스별 접근 제한을 위한 Cloudflare Access 설정:

| 정책 유형 | 설명 | 구현 Phase |
|-----------|------|:----------:|
| Email Whitelist | 특정 이메일 주소만 서비스 접근 허용 | 2 |
| One-Time PIN (OTP) | 이메일 기반 일회성 인증 코드로 접근 | 2 |
| Service-level Policy | 개별 서비스에 대한 접근 정책 (예: DB Admin은 관리자 이메일만) | 3 |

**구현 방식**: Cloudflare Access API + `ofetch` HTTP 클라이언트
**CLI**: `brewnet acl cloudflare-access setup --email admin@example.com`

```typescript
// Phase 2+ implementation
interface CloudflareAccessPolicy {
  serviceName: string;
  allowedEmails: string[];
  requireOTP: boolean;
  sessionDuration: string; // e.g., '24h'
}
```

#### SSL Configuration

도메인 제공자와 SSL 방식에 따라 Web Server에 SSL 설정이 자동 적용된다:

| SSL Method | Use Case | Implementation |
|------------|----------|----------------|
| `none` | Local only | SSL 없음, HTTP만 |
| `self-signed` | Local dev/testing | OpenSSL 자체 서명 인증서 생성 |
| `letsencrypt` | Own Domain (direct) | ACME + Certbot auto-renewal |
| `cloudflare` | Free Domain / Own Domain + CF Tunnel | Cloudflare가 SSL 처리, 내부는 HTTP |

Web Server별 적용:
- **Traefik**: ACME resolver + Let's Encrypt 라벨 (letsencrypt) / CF proxy (cloudflare)
- **Nginx**: Certbot auto-renewal cron + nginx conf (letsencrypt) / CF origin cert (cloudflare)
- **Caddy**: 자동 HTTPS (기본 내장)

#### Mail Server Configuration (v4)

Mail Server 설정은 Domain & Network 단계에서 표시되며,
**도메인 제공자가 `local`이 아닌 경우에만** 활성화 가능하다.
외부 도메인이 있어야 메일 서비스가 의미가 있기 때문이다.

**Visibility Condition**: `domain.provider !== 'local'`

```
[Mail Server] — Shown only when domain provider is not 'local'
  ┌──────────────────────────────────────────────────────┐
  │  ○ Mail Server                          [ON/OFF]     │
  │    Self-hosted email with docker-mailserver           │
  │                                                      │
  │    Image: ghcr.io/docker-mailserver/docker-mailserver │
  │    Ports: 25 (SMTP), 587 (Submission), 993 (IMAP)   │
  │                                                      │
  │    Postmaster: admin@{domain}                        │
  │    ℹ Uses admin credentials as postmaster account    │
  │                                                      │
  │    DNS Records (auto-configured via Cloudflare):     │
  │      MX  {domain}  → mail.{domain}                  │
  │      A   mail.{domain} → (tunnel/server IP)         │
  │      TXT {domain}  → "v=spf1 mx ~all"              │
  └──────────────────────────────────────────────────────┘
```

**Mail Server Details**:

| Setting | Value |
|---------|-------|
| Docker Image | `ghcr.io/docker-mailserver/docker-mailserver:latest` |
| SMTP Port | 25 |
| Submission Port | 587 (STARTTLS) |
| IMAP Port | 993 (SSL/TLS) |
| Postmaster Account | `admin@{domain}` (uses admin credentials) |
| DNS MX Record | Auto-configured via Cloudflare API |

**Mail Server Docker Compose** (generated when enabled):

```yaml
services:
  mailserver:
    image: ghcr.io/docker-mailserver/docker-mailserver:latest
    container_name: brewnet-mailserver
    hostname: mail.${BREWNET_DOMAIN}
    restart: unless-stopped
    ports:
      - "25:25"
      - "587:587"
      - "993:993"
    volumes:
      - mailserver-data:/var/mail
      - mailserver-state:/var/mail-state
      - mailserver-logs:/var/log/mail
      - ./infrastructure/mailserver/:/tmp/docker-mailserver/
    environment:
      - ENABLE_SPAMASSASSIN=1
      - ENABLE_CLAMAV=0
      - ENABLE_FAIL2BAN=1
      - SSL_TYPE=manual
      - SSL_CERT_PATH=/etc/letsencrypt/live/${BREWNET_DOMAIN}/fullchain.pem
      - SSL_KEY_PATH=/etc/letsencrypt/live/${BREWNET_DOMAIN}/privkey.pem
    networks:
      - brewnet
```

#### Navigation

```
[Domain & Cloudflare]
  ├── Enter     → Proceed to Review (Step 5)
  ├── Backspace → Back to Runtime & Boilerplate (or Server Components if partial)
  └── Ctrl+C    → Cancel wizard
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T06-01 | Unit | 도메인 유효성 검증 (정규식, edge case) |
| T06-02 | Unit | SSL 설정 생성 (Traefik / Nginx / Caddy 각각, 4가지 SSL 방식) |
| T06-03 | Unit | Cloudflare Tunnel 컨테이너 설정 생성 |
| T06-04 | Unit | Local Only 폴백 (brewnet.local, no SSL, no tunnel) |
| T06-05 | Unit | Free Domain TLD 선택 및 도메인 조합 |
| T06-06 | Unit | Domain provider별 cloudflare.enabled 기본값 검증 |
| T06-07 | Unit | Tunnel Token 유효성 검증 |
| T06-08 | Integration | Local Only 도메인 설정 플로우 |
| T06-09 | Integration | Free Domain → CF Tunnel 전체 플로우 |
| T06-10 | Integration | Own Domain → SSL → CF Tunnel 전체 플로우 |
| T06-11 | Unit | Mail Server shown only when domain provider != 'local' |
| T06-12 | Unit | Mail Server DNS MX record generation |
| T06-13 | Integration | Mail Server + Free Domain 전체 플로우 |
| T06-14 | Unit | Free Domain TLD 입력 유효성 검증 (.dpdns.org, .qzz.io, .us.kg만 허용) |

---

### F07: Review, Confirm & Generate (Step 5)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-1.3.6, REQ-1.3.7

#### Description

모든 선택 내용을 요약 표시하고 최종 확인을 받는다.
Generate / Modify / Export 3가지 액션 중 선택.

#### Review Display

WizardContext.selections 전체를 테이블/리스트로 렌더링.
리소스 예상치, 라이선스 확인 포함.

#### Actions

| Action | Description | Next |
|--------|-------------|------|
| **Generate** | 파일 생성 + 서비스 시작 | → F08 |
| **Modify** | 이전 단계로 돌아가 수정 | → 첫 번째 단계 (F03) |
| **Export** | 설정을 `brewnet.config.json`으로 저장 | → Exit |

#### Review Display Details (v4 additions)

Review 화면에 다음 행이 추가된다:

**SSH Server Row**:
```
SSH Server:     Enabled
  Port:         2222
  Auth:         Key-only (no password)
  SFTP:         Enabled
```

**Mail Server Row** (domain provider != 'local' 일 때만):
```
Mail Server:    Enabled
  Service:      docker-mailserver
  Postmaster:   admin@myserver.dpdns.org
  Ports:        25 (SMTP), 587 (Submission), 993 (IMAP)
```

**Credential Propagation Section**:

Admin 자격증명이 어떤 서비스에 전파되는지 명시적으로 표시한다:

```
┌──────────────────────────────────────────────────────┐
│  Credential Propagation                               │
│                                                      │
│  Admin credentials (admin / ********) will be used   │
│  as the default login for:                           │
│                                                      │
│    ● Nextcloud          (admin account)              │
│    ● pgAdmin            (admin email/password)       │
│    ● SSH Server          (SSH login)                  │
│    ● Mail Server         (postmaster account)         │
│    ● Gitea               (admin account)              │
│    ● FileBrowser         (admin account)              │
│    ● PostgreSQL          (superuser)                  │
│    ● Jellyfin            (admin account)              │
│                                                      │
│  ℹ Only services you have enabled are listed above.  │
│    You can change individual service credentials     │
│    after setup via `brewnet config`.                  │
└──────────────────────────────────────────────────────┘
```

#### Confirm Before Generate

```
? Ready to generate? This will create files in ~/brewnet/my-homeserver/
  > Generate — Create all files and start services
    Modify  — Go back and change selections
    Export  — Save configuration to brewnet.config.json
```

#### Uninstall/Cancel at This Stage

만약 사용자가 Cancel을 선택하면:

```
? Cancel setup?
  > No, continue
    Yes, just exit (selections are not saved)
    Yes, exit and export config for later
```

Export 선택 시 `~/.brewnet/configs/my-homeserver.config.json`에
설정이 저장되며, 나중에 `brewnet init --config <file>` 로 재사용 가능.

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T07-01 | Unit | WizardSelections → Review 텍스트 렌더링 |
| T07-02 | Unit | 리소스 예상치 계산 정확성 |
| T07-03 | Unit | Config JSON export/import 직렬화 |
| T07-04 | Integration | Review → Generate/Modify/Export 분기 |
| T07-05 | Unit | SSH Server row renders port, auth method, SFTP status |
| T07-06 | Unit | Mail Server row renders postmaster and ports |
| T07-07 | Unit | Credential propagation lists correct services (only enabled ones) |

---

### F08: Docker Compose Generation & Service Startup (Step 6-7)

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-2.1.1 ~ REQ-2.1.6, REQ-1.3.7

#### Description

선택된 서버 컴포넌트와 런타임을 기반으로 `docker-compose.yml`, `.env`,
인프라 설정 파일, 보일러플레이트 소스를 생성하고, Docker Compose를
실행하여 서비스를 기동한다.

#### Generation Pipeline

```
WizardSelections
  │
  ├─→ ComposeGenerator        → docker-compose.yml
  ├─→ EnvGenerator             → .env + .env.example
  ├─→ ComponentConfigGenerator → infrastructure/**/*
  ├─→ BoilerplateGenerator     → apps/{framework-app}/**/*
  ├─→ ScriptGenerator          → scripts/*.sh
  └─→ DocGenerator             → docs/*.md
```

#### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| ComposeGenerator | `services/compose-generator.ts` | docker-compose.yml 조립 |
| EnvGenerator | `services/env-generator.ts` | .env 파일 생성 + 시크릿 |
| BoilerplateGenerator | `services/boilerplate-generator.ts` | 템플릿 복사 + 변수 치환 |
| DockerOrchestrator | `services/docker-orchestrator.ts` | pull → build → up 실행 |
| HealthChecker | `services/health-checker.ts` | 컨테이너 헬스체크 |

#### ComposeGenerator Details

```typescript
interface ComposeService {
  image?: string;
  build?: { context: string; dockerfile: string };
  container_name: string;
  restart: 'unless-stopped';
  networks: string[];
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  depends_on?: Record<string, { condition: string }>;
  labels?: string[];
  healthcheck?: HealthcheckConfig;
  security_opt?: string[];        // ['no-new-privileges:true']
}

function generateCompose(selections: WizardSelections): ComposeDocument;
```

**Cloudflared Service Generation**: `domain.cloudflare.enabled === true`일 때
`cloudflared` 서비스가 자동으로 docker-compose에 추가된다:

```yaml
# Generated when cloudflare tunnel is enabled
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: brewnet-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - brewnet
    depends_on:
      traefik:
        condition: service_healthy
```

#### Traefik Labels Generation

각 서비스에 대해 Traefik 라우팅 라벨을 자동 생성:

**Nextcloud 예시:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.nextcloud.rule=Host(`files.${DOMAIN}`)"
  - "traefik.http.routers.nextcloud.entrypoints=websecure"
  - "traefik.http.routers.nextcloud.tls=true"
  - "traefik.http.services.nextcloud.loadbalancer.server.port=80"
  - "traefik.http.middlewares.nextcloud-headers.headers.stsSeconds=31536000"
```

**라벨 생성 규칙:**
| 필드 | 값 | 소스 |
|------|-----|------|
| `Host()` | `{subdomain}.${DOMAIN}` | ServerComponent.subdomain |
| `entrypoints` | `websecure` (HTTPS) 또는 `web` (HTTP) | DomainSelection.ssl |
| `server.port` | 서비스 기본 포트 | ServerComponent.defaultPort |
| `tls` | `true` (Cloudflare 또는 Let's Encrypt 사용 시) | DomainSelection.ssl |

#### Service Docker Compose Templates

각 서비스의 docker-compose.yml 서비스 정의 템플릿:

**Nextcloud:**
```yaml
nextcloud:
  image: nextcloud:29-apache
  container_name: ${PROJECT_NAME}-nextcloud
  restart: unless-stopped
  depends_on:
    - db
    - redis
  environment:
    - NEXTCLOUD_ADMIN_USER=${ADMIN_USERNAME}
    - NEXTCLOUD_ADMIN_PASSWORD=${ADMIN_PASSWORD}
    - POSTGRES_HOST=db
    - POSTGRES_DB=${DB_NAME}
    - POSTGRES_USER=${DB_USER}
    - POSTGRES_PASSWORD=${DB_PASSWORD}
    - REDIS_HOST=redis
  volumes:
    - nextcloud_data:/var/www/html
  networks:
    - brewnet
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost/status.php"]
    interval: 30s
    timeout: 10s
    retries: 3
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.nextcloud.rule=Host(`files.${DOMAIN}`)"
    - "traefik.http.routers.nextcloud.entrypoints=websecure"
    - "traefik.http.services.nextcloud.loadbalancer.server.port=80"
```

**PostgreSQL:**
```yaml
db:
  image: postgres:17-alpine
  container_name: ${PROJECT_NAME}-db
  restart: unless-stopped
  environment:
    - POSTGRES_DB=${DB_NAME}
    - POSTGRES_USER=${DB_USER}
    - POSTGRES_PASSWORD=${DB_PASSWORD}
  volumes:
    - db_data:/var/lib/postgresql/data
    - ./config/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
  networks:
    - brewnet-internal
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
    interval: 10s
    timeout: 5s
    retries: 5
```

**Jellyfin:**
```yaml
jellyfin:
  image: jellyfin/jellyfin:latest
  container_name: ${PROJECT_NAME}-jellyfin
  restart: unless-stopped
  environment:
    - JELLYFIN_PublishedServerUrl=https://media.${DOMAIN}
  volumes:
    - jellyfin_config:/config
    - jellyfin_cache:/cache
    - /path/to/media:/media:ro
  # GPU 가속 (선택, Phase 3+)
  # devices:
  #   - /dev/dri:/dev/dri    # Intel QSV / VAAPI
  networks:
    - brewnet
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8096/health"]
    interval: 30s
    timeout: 10s
    retries: 3
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.jellyfin.rule=Host(`media.${DOMAIN}`)"
    - "traefik.http.services.jellyfin.loadbalancer.server.port=8096"
```

**Redis:**
```yaml
redis:
  image: redis:7-alpine
  container_name: ${PROJECT_NAME}-redis
  restart: unless-stopped
  command: redis-server --requirepass ${REDIS_PASSWORD:-""}
  volumes:
    - redis_data:/data
  networks:
    - brewnet-internal
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 3
```

**Traefik:**
```yaml
traefik:
  image: traefik:v3.0
  container_name: ${PROJECT_NAME}-traefik
  restart: unless-stopped
  command:
    - "--api.dashboard=true"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
  ports:
    - "80:80"
    - "443:443"
    - "8080:8080"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - traefik_certs:/letsencrypt
  networks:
    - brewnet
  healthcheck:
    test: ["CMD", "traefik", "healthcheck"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Docker Networks:**
```yaml
networks:
  brewnet:
    name: brewnet
    driver: bridge
  brewnet-internal:
    name: brewnet-internal
    driver: bridge
    internal: true    # 외부 접근 차단 (DB, Cache 등)
```

**Admin Credentials in .env**: `admin` 자격증명이 `.env`에 포함되며,
활성화된 서비스별 admin 환경 변수로 매핑된다:

```env
# Admin Account
BREWNET_ADMIN_USERNAME=admin
BREWNET_ADMIN_PASSWORD=<auto-generated-20-chars>

# Cloudflare Tunnel (if enabled)
CLOUDFLARE_TUNNEL_TOKEN=<user-provided>

# Service-specific admin mappings
NEXTCLOUD_ADMIN_USER=${BREWNET_ADMIN_USERNAME}
NEXTCLOUD_ADMIN_PASSWORD=${BREWNET_ADMIN_PASSWORD}
```

#### SSH Server Generation (v4)

SSH Server가 활성화된 경우 다음 파일/설정이 생성된다:

```
Generation Phase: SSH Server
  ├── [OK] sshd_config generated
  │         → infrastructure/ssh/sshd_config
  │         → Port {sshServer.port} (default 2222)
  │         → PasswordAuthentication {yes|no}
  │         → PubkeyAuthentication yes
  │         → PermitRootLogin no
  ├── [OK] SSH host keys generated
  │         → infrastructure/ssh/ssh_host_rsa_key
  │         → infrastructure/ssh/ssh_host_ed25519_key
  ├── [OK] Admin SSH credentials configured
  │         → User: {admin.username}
  │         → Auth: key-only (or key+password if passwordAuth enabled)
  ├── [OK] SFTP subsystem configured (if sftp enabled)
  │         → Subsystem sftp internal-sftp
  │         → ChrootDirectory /home/%u
  │         → ForceCommand internal-sftp (for sftp-only users)
  └── [OK] openssh-server added to docker-compose.yml
```

**SSH Docker Compose** (generated):

```yaml
services:
  openssh-server:
    image: linuxserver/openssh-server:latest
    container_name: brewnet-ssh
    restart: unless-stopped
    ports:
      - "${SSH_PORT:-2222}:2222"
    volumes:
      - ssh-config:/config
      - ./infrastructure/ssh/sshd_config:/etc/ssh/sshd_config:ro
    environment:
      - PUID=1000
      - PGID=1000
      - USER_NAME=${BREWNET_ADMIN_USERNAME}
      - USER_PASSWORD=${BREWNET_ADMIN_PASSWORD}
      - PASSWORD_ACCESS=${SSH_PASSWORD_AUTH:-false}
      - SUDO_ACCESS=true
    networks:
      - brewnet
```

#### Mail Server Generation (v4)

Mail Server가 활성화된 경우 다음 파일/설정이 생성된다:

```
Generation Phase: Mail Server
  ├── [OK] Postfix config generated
  │         → infrastructure/mailserver/postfix-main.cf
  │         → myhostname = mail.{domain}
  │         → mydomain = {domain}
  ├── [OK] Dovecot config generated
  │         → infrastructure/mailserver/dovecot.cf
  │         → protocols = imap
  │         → ssl = required
  ├── [OK] Postmaster account created
  │         → {admin.username}@{domain}
  │         → Password: {admin.password}
  ├── [OK] docker-mailserver added to docker-compose.yml
  └── [OK] DNS MX records queued for Cloudflare API
```

#### Git Server Generation (v4.2)

Git Server가 활성화된 경우 다음 파일/설정이 생성된다:

```
Generation Phase: Git Server
  ├── [OK] Gitea configuration generated
  │         → infrastructure/gitea/app.ini
  │         → ROOT_URL = https://git.{domain}
  │         → SSH_PORT = 3022
  ├── [OK] Gitea admin account configured
  │         → User: {admin.username}
  │         → Password: {admin.password}
  ├── [OK] gitea service added to docker-compose.yml
  │         → Web UI: port 3000
  │         → Git SSH: port 3022
  └── [OK] Auto-deploy webhook configured (if appServer enabled)
```

#### FileBrowser Generation (v2.1)

FileBrowser가 활성화된 경우 (App Server 활성화 시 기본 포함) 다음 파일/설정이 생성된다:

```
Generation Phase: FileBrowser
  ├── [OK] filebrowser.json configuration generated
  │         → config/filebrowser.json
  │         → port: 80, root: /srv
  ├── [OK] FileBrowser admin credentials configured
  │         → User: {admin.username}
  │         → Password: {admin.password} (API PUT after first start)
  ├── [OK] Storage directory created
  │         → ./storage/ (shared with app)
  ├── [OK] filebrowser service added to docker-compose.yml
  │         → Web UI: https://files.{domain}
  └── [OK] Traefik routing configured
          → Host(`files.${DOMAIN}`)
```

#### Credential Propagation Phase (v4)

모든 서비스의 admin 자격증명을 일괄 설정하는 단계:

```
Generation Phase: Credential Propagation
  ├── [OK] .env admin credentials written
  │         BREWNET_ADMIN_USERNAME=admin
  │         BREWNET_ADMIN_PASSWORD=********
  ├── [OK] Nextcloud admin mapped → NEXTCLOUD_ADMIN_USER/PASSWORD
  ├── [OK] pgAdmin admin mapped → PGADMIN_DEFAULT_EMAIL/PASSWORD
  ├── [OK] SSH admin mapped → USER_NAME/USER_PASSWORD
  ├── [OK] Mail postmaster mapped → postmaster@{domain}
  ├── [OK] Gitea admin mapped → GITEA__admin (first-run setup)
  ├── [OK] FileBrowser admin mapped → API PUT /api/users/1
  ├── [OK] PostgreSQL superuser mapped → POSTGRES_USER/PASSWORD
  └── [OK] Jellyfin admin mapped → (first-run wizard credentials)
```

#### External Access Verification Phase (v4)

non-local 도메인에서 외부 접근을 검증하는 단계:

```
Generation Phase: External Access Verification
  ├── [..] DNS propagation check
  │         → dig +short {domain} (A record)
  │         → dig +short MX {domain} (MX record, if mail enabled)
  ├── [..] Cloudflare Tunnel status
  │         → cloudflared tunnel info {tunnelName}
  │         → Status: healthy / degraded / offline
  ├── [..] HTTPS endpoint check
  │         → curl -sI https://{domain} (expected: 200 or 301)
  └── [..] Results summary
          → All checks passed / N warnings / N failures
```

**Note**: External access verification은 non-local 도메인에서만 수행된다.
DNS 전파에 시간이 걸릴 수 있으므로, 실패 시 재시도 안내를 제공한다.

#### Startup Sequence

1. **File Generation** -- 모든 파일 생성 (각 파일마다 `[OK]` 출력)
2. **SSH Config Generation** -- sshd_config, host keys, SFTP subsystem (if enabled)
3. **Mail Config Generation** -- postfix, dovecot, postmaster account (if enabled)
4. **Credential Propagation** -- admin credentials to all enabled services
5. **Image Pull** -- `docker compose pull` (진행률 표시)
6. **App Build** -- `docker compose build` (보일러플레이트 앱)
7. **Service Start** -- `docker compose up -d`
8. **Health Check** -- 모든 컨테이너 healthy 상태 대기 (timeout 120s)
9. **DNS Setup** -- `/etc/hosts` 업데이트 제안 (sudo 요청)
10. **External Access Verification** -- DNS, tunnel, HTTPS endpoint check (non-local only)
11. **Endpoint Display** -- 접근 가능한 URL 목록 출력

#### Failure & Rollback (Constitution IV)

```
서비스 시작 실패 시:
  ├── 실패한 컨테이너 로그 출력
  ├── "Retry failed service? (Y/n)"
  │     ├── Y → 해당 컨테이너만 재시작
  │     └── N → 나머지 서비스는 유지, 실패 서비스 건너뜀
  └── "Remove all and start over? (y/N)"
        ├── Y → docker compose down + 생성 파일 삭제
        └── N → 현재 상태 유지 (수동 디버깅)
```

#### Generated .env Security (Constitution II)

```typescript
function generateSecret(length: number = 24): string {
  return crypto.randomBytes(length).toString('base64url');
}

// 모든 비밀번호/시크릿은 자동 생성
// .env 파일 퍼미션: 0600 (소유자만 읽기/쓰기)
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T08-01 | Unit | ComposeGenerator — 서버 컴포넌트 조합별 YAML 생성 |
| T08-02 | Unit | EnvGenerator — 시크릿 자동 생성 + 형식 |
| T08-03 | Unit | BoilerplateGenerator — 템플릿 변수 치환 |
| T08-04 | Unit | 네트워크 설정 (brewnet, brewnet-internal) |
| T08-05 | Unit | Traefik 라벨 생성 정확성 |
| T08-06 | Unit | 헬스체크 설정 포함 확인 |
| T08-07 | Integration | 전체 생성 파이프라인 (mock Docker) |
| T08-08 | Integration | 시작 실패 → 롤백 플로우 |
| T08-09 | Unit | SSH sshd_config generation (port, passwordAuth, SFTP) |
| T08-10 | Unit | SSH host key generation |
| T08-11 | Unit | Mail postfix/dovecot config generation |
| T08-12 | Unit | Mail postmaster account creation |
| T08-13 | Unit | Credential propagation maps admin to all enabled services |
| T08-14 | Unit | External access verification phase (DNS, tunnel, HTTPS) |
| T08-15 | Unit | External access verification skipped for local domain |
| T08-16 | Integration | SSH + Mail + Credential propagation 전체 플로우 |
| T08-17 | Unit | Git Server gitea config generation (app.ini, admin account) |
| T08-18 | Unit | Git Server auto-deploy webhook configuration |
| T08-19 | Integration | Git Server + App Server 연동 전체 플로우 |
| T08-20 | Unit | FileBrowser filebrowser.json config generation |
| T08-21 | Unit | FileBrowser admin credential propagation via API |
| T08-22 | Integration | FileBrowser + App Server 연동 전체 플로우 |

---

### F09: Post-Setup Service Management

**Phase**: 1 (MVP)
**REQ Coverage**: REQ-2.2.1 ~ REQ-2.2.8, REQ-13.1.1 ~ REQ-13.1.3

#### Description

설치 완료 후 일상적인 서비스 관리 명령어.
`brewnet up/down/status/add/remove/logs/update/backup/restore`.

#### Post-Setup Display (v4 additions)

설치 완료 후 표시되는 엔드포인트 및 정보가 확장된다:

**Remote Access Section** (SSH/SFTP):

```
Remote Access:
  SSH:   ssh admin@{domain} -p 2222
  SFTP:  sftp -P 2222 admin@{domain}
         or use FileZilla: sftp://{domain}:2222
```

**FileBrowser Endpoints** (FileBrowser 활성화 시):

```
FileBrowser:
  Web UI:   https://files.{domain}
  API:      https://files.{domain}/api/
  Account:  admin / ********
```

**Git Server Endpoints** (Git Server 활성화 시):

```
Git Server:
  Web UI:   https://git.{domain}
  Git SSH:  ssh://git@{domain}:3022/{user}/{repo}.git
  Git HTTP: https://git.{domain}/{user}/{repo}.git
  Account:  admin / ********
```

**Mail Endpoints** (Mail Server 활성화 시):

```
Mail Server:
  SMTP:     mail.{domain}:587 (STARTTLS)
  IMAP:     mail.{domain}:993 (SSL/TLS)
  Webmail:  https://mail.{domain} (if webmail enabled)
  Account:  admin@{domain} / ********
```

**Credentials Summary Section**:

모든 서비스의 자격증명을 한 곳에 요약 표시:

```
┌──────────────────────────────────────────────────────────┐
│  Credentials Summary                                      │
│                                                          │
│  Admin Account:                                          │
│    Username:  admin                                      │
│    Password:  ******************** (saved in .env)       │
│                                                          │
│  Service Credentials:                                    │
│    Nextcloud:    admin / ********  → https://cloud.{domain}   │
│    pgAdmin:      admin@local / ** → https://pgadmin.{domain}  │
│    SSH:          admin             → ssh -p 2222 {domain}     │
│    Gitea:        admin / ********  → https://git.{domain}     │
│    FileBrowser:  admin / ********  → https://files.{domain}   │
│    Mail:         admin@{domain}    → IMAP/SMTP                │
│    PostgreSQL:   brewnet / *****   → localhost:5432            │
│                                                          │
│  ⚠ Credentials are stored in .env (chmod 600).           │
│    Run `brewnet credentials` to view them again.         │
└──────────────────────────────────────────────────────────┘
```

**External Access Verification Section** (non-local 도메인만):

```
┌──────────────────────────────────────────────────────────┐
│  External Access Verification                             │
│                                                          │
│  DNS:      ✓ A record resolves (104.xx.xx.xx)            │
│  Tunnel:   ✓ Cloudflare Tunnel active                    │
│  HTTPS:    ✓ https://{domain} responds (200)             │
│  Mail MX:  ✓ MX record found (mail.{domain})            │
│                                                          │
│  Verification Commands:                                  │
│    dig +short {domain}                                   │
│    dig +short MX {domain}                                │
│    curl -sI https://{domain}                             │
│    brewnet domain tunnel status                          │
│    brewnet status                                        │
└──────────────────────────────────────────────────────────┘
```

**Troubleshooting Section**:

```
┌──────────────────────────────────────────────────────────┐
│  Troubleshooting                                          │
│                                                          │
│  DNS not resolving?                                      │
│    → DNS propagation can take up to 24 hours             │
│    → Check: dig +short {domain}                          │
│    → Verify nameservers at your domain registrar         │
│                                                          │
│  Cloudflare Tunnel not connecting?                       │
│    → Check tunnel status: brewnet domain tunnel status   │
│    → View tunnel logs: docker logs brewnet-cloudflared   │
│    → Verify token: Cloudflare Zero Trust → Tunnels       │
│                                                          │
│  Services not accessible externally?                     │
│    → Ensure Cloudflare Tunnel is running                 │
│    → Check: curl -sI https://{domain}                    │
│    → Verify public hostnames in Cloudflare dashboard     │
│                                                          │
│  Mail not working?                                       │
│    → Check MX record: dig +short MX {domain}            │
│    → View mail logs: docker logs brewnet-mailserver      │
│    → Test SMTP: brewnet mail test admin@{domain}         │
│                                                          │
│  SSH connection refused?                                 │
│    → Check port: brewnet status (SSH port)               │
│    → View logs: docker logs brewnet-ssh                  │
│    → Test: ssh -v admin@{domain} -p 2222                 │
└──────────────────────────────────────────────────────────┘
```

#### Command Specifications

##### `brewnet status`

```typescript
interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  cpu: string;
  memory: string;
  uptime: string;
  port: number;
  url: string;
}

// dockerode.listContainers() + docker.getContainer().stats()
// cli-table3로 테이블 렌더링
```

##### `brewnet add <service>`

```
brewnet add <service-id>

1. ServiceRegistry에서 서비스 조회
2. docker-compose.yml에 서비스 블록 추가
3. .env에 필요한 환경 변수 추가
4. docker compose pull <service>
5. docker compose up -d <service>
6. Traefik 라우팅 자동 등록
7. 성공 메시지 + 접근 URL 표시
```

##### `brewnet remove <service>` (Constitution IV)

```
brewnet remove <service-id>

1. 서비스 존재 확인
2. 확인 프롬프트:
   ? Remove {service}?
     > Remove service only (keep data)
       Remove service and data (--purge)
       Cancel
3. docker compose stop <service>
4. docker compose rm <service>
5. docker-compose.yml에서 서비스 블록 제거
6. Traefik 라우팅 제거
7. 데이터 보존 안내 (data 경로 표시)
```

##### `brewnet backup` / `brewnet restore`

```
brewnet backup
  → ~/.brewnet/backups/backup-{timestamp}.tar.gz
  → 포함: docker-compose.yml, .env, infrastructure/, databases/config

brewnet restore <backup-id>
  1. 확인 프롬프트 (현재 설정 덮어쓰기 경고)
  2. 서비스 중지
  3. 파일 복원
  4. 서비스 재시작
```

#### Uninstall (전체 제거)

```
brewnet uninstall

? This will remove all Brewnet services and configurations.
  Your application data will be preserved unless you choose to purge.

  > Remove services only (keep ~/brewnet/my-homeserver/ data)
    Remove everything including data (IRREVERSIBLE)
    Cancel

Removing services...
  [OK] Stopped all containers
  [OK] Removed all containers
  [OK] Removed Docker networks
  [OK] Removed Docker volumes (if purge)
  [OK] Removed ~/.brewnet/ configuration

Brewnet has been uninstalled.
  Your project files remain at: ~/brewnet/my-homeserver/
```

#### Tests

| Test ID | Type | Description |
|---------|------|-------------|
| T09-01 | Unit | Status 테이블 렌더링 |
| T09-02 | Unit | Add — compose.yml 서비스 블록 추가 |
| T09-03 | Unit | Remove — compose.yml 서비스 블록 제거 |
| T09-04 | Unit | Backup — tar.gz 생성 로직 |
| T09-05 | Unit | Restore — tar.gz 해제 + 파일 복원 |
| T09-06 | Integration | Add → Status → Remove 플로우 |
| T09-07 | Integration | Backup → Restore 라운드트립 |
| T09-08 | Integration | Uninstall 플로우 (purge / keep data) |
| T09-09 | Unit | SSH/SFTP endpoints rendered in Remote Access section |
| T09-10 | Unit | Mail endpoints rendered (SMTP, IMAP, Webmail) |
| T09-11 | Unit | Credentials Summary lists all enabled services |
| T09-12 | Unit | External access verification section shown only for non-local domains |
| T09-13 | Unit | Troubleshooting section renders correct commands |
| T09-14 | Integration | Post-setup display with SSH + Mail + Credentials 플로우 |

---

## 5. Cross-Cutting Concerns

### 5.1 Error Handling (Constitution III)

모든 Feature에서 공통으로 사용하는 에러 체계:

```typescript
class BrewnetError extends Error {
  constructor(
    public code: ErrorCode,
    public httpStatus: number,
    message: string,
    public resolution?: string,
  ) {
    super(message);
  }
}

enum ErrorCode {
  BN001 = 'BN001',  // Docker daemon not running
  BN002 = 'BN002',  // Port already in use
  BN003 = 'BN003',  // SSL issuance failed
  BN004 = 'BN004',  // Invalid license key
  BN005 = 'BN005',  // Rate limit exceeded
  BN006 = 'BN006',  // Build failed
  BN007 = 'BN007',  // Invalid Git repository
  BN008 = 'BN008',  // Resource not found
  BN009 = 'BN009',  // Database error
  BN010 = 'BN010',  // Feature requires Pro plan
}
```

### 5.2 Logging (Constitution III)

```typescript
// All operations logged to ~/.brewnet/logs/
interface LogEntry {
  timestamp: string;    // ISO 8601
  level: 'info' | 'warn' | 'error';
  command: string;      // e.g. 'init', 'add'
  message: string;
  metadata?: Record<string, unknown>;
}
```

### 5.3 Configuration Persistence (Constitution V)

```
~/.brewnet/
├── config.json              # Global CLI config (conf library)
├── projects/
│   └── my-homeserver/
│       └── selections.json  # Wizard selections snapshot
├── registry/
│   └── services.json        # Cached service registry (offline)
├── backups/
│   └── backup-*.tar.gz
└── logs/
    └── brewnet.log
```

### 5.4 Docker Image Registry

모든 서비스에서 사용하는 Docker 이미지 목록:

| Service | Docker Image | Default Tag |
|---------|-------------|-------------|
| Traefik | `traefik` | `latest` |
| Nginx | `nginx` | `latest` |
| Caddy | `caddy` | `latest` |
| Nextcloud | `nextcloud` | `latest` |
| MinIO | `minio/minio` | `latest` |
| PostgreSQL | `postgres` | `16` |
| MySQL | `mysql` | `8` |
| MariaDB | `mariadb` | `11` |
| Redis | `redis` | `7-alpine` |
| Valkey | `valkey/valkey` | `latest` |
| KeyDB | `eqalpha/keydb` | `latest` |
| Jellyfin | `jellyfin/jellyfin` | `latest` |
| Cloudflared | `cloudflare/cloudflared` | `latest` |
| **openssh-server** | `linuxserver/openssh-server` | `latest` |
| **docker-mailserver** | `ghcr.io/docker-mailserver/docker-mailserver` | `latest` |
| **Gitea** | `gitea/gitea` | `latest` |
| **FileBrowser** | `filebrowser/filebrowser` | `latest` |

### 5.5 Wizard State Persistence

위저드 중간에 종료(Ctrl+C)되어도 진행 상태가 보존된다:

```typescript
// 각 단계 완료 시 selections.json에 자동 저장
function saveWizardState(context: WizardContext): void;

// 재시작 시 이전 상태 감지
// brewnet init → "Resume previous setup? (Y/n)"
function loadWizardState(projectName: string): WizardContext | null;
```

---

## 6. Spec Kit Execution Plan

각 Feature를 Spec Kit 파이프라인으로 실행하는 순서:

### Phase 1: Foundation (F01 → F02)

```bash
# F01: CLI Bootstrap
/speckit.specify "CLI entry point with Commander.js, error handling, logger"
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
# Test: brewnet --version, brewnet --help

# F02: System Check
/speckit.specify "System requirement checker for brewnet init Step 0"
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
# Test: brewnet init → system check output
```

### Phase 2: Wizard Steps (F03 → F06)

```bash
# F03: Project Setup
/speckit.specify "Project name, path, setup type (full/partial) with navigation"
# ...

# F04: Server Component Selection
/speckit.specify "Admin account setup (auto-generated 20-char password) + 8 server component toggle cards (web/file/app/db/media/ssh/git/filebrowser) with inline DB config, Git Server required, FileBrowser default with App Server"
# ...

# F05: Runtime & Boilerplate
/speckit.specify "Language and framework selection with boilerplate options (generate, sample data, dev mode)"
# ...

# F06: Domain & Cloudflare
/speckit.specify "3 domain providers (local/freedomain/custom), DigitalPlat free domain flow, Cloudflare tunnel as default for external access"
# ...
```

### Phase 3: Generation & Management (F07 → F09)

```bash
# F07: Review & Confirm
/speckit.specify "Review summary with generate/modify/export actions"
# ...

# F08: Compose Generation & Startup
/speckit.specify "docker-compose.yml generation and service orchestration"
# ...

# F09: Post-Setup Management
/speckit.specify "brewnet up/down/status/add/remove/logs/backup/restore/uninstall"
# ...
```

### Final: Cross-Feature Analysis

```bash
/speckit.analyze   # All specs, plans, tasks 일관성 검증
```

---

## 7. Test Strategy

### 7.1 Coverage Targets (Constitution)

| Scope | Target |
|-------|--------|
| `packages/cli` core modules | 90%+ |
| Overall project | 80%+ |

### 7.2 Test Categories

| Category | Tool | Location | Scope |
|----------|------|----------|-------|
| Unit | Jest | `tests/unit/` | 개별 함수/클래스 |
| Integration | Jest | `tests/integration/` | 컴포넌트 조합 |
| E2E | Jest + execa | `tests/e2e/` | CLI 명령어 end-to-end |

### 7.3 Mock Strategy

| Dependency | Mock Method |
|------------|-------------|
| Docker Engine | `dockerode` mock (jest.mock) |
| File System | `memfs` 또는 temp directory |
| User Input | `@inquirer/testing` |
| Shell Commands | `execa` mock |
| Network | `nock` 또는 mock server |

### 7.4 E2E Test Scenarios

| # | Scenario | Commands |
|---|----------|----------|
| E2E-01 | Full install | `init → status → add → remove → down` |
| E2E-02 | Partial install | `init (partial) → status → up → down` |
| E2E-03 | Backup/Restore | `init → backup → modify → restore` |
| E2E-04 | Wizard resume | `init → Ctrl+C → init (resume)` |
| E2E-05 | Uninstall | `init → uninstall (keep) / uninstall (purge)` |

---

## 8. Implementation Priority

| Order | Feature | Effort | Dependency |
|:-----:|---------|:------:|:----------:|
| 1 | F01 CLI Bootstrap | S | None |
| 2 | F02 System Check | S | F01 |
| 3 | F03 Project Setup | S | F01 |
| 4 | F04 Server Component Selection | M | F03 |
| 5 | F08 Compose Generation | L | F04 |
| 6 | F09 Service Management | M | F08 |
| 7 | F05 Runtime & Boilerplate | M | F03 |
| 8 | F06 Domain & Cloudflare | M | F05 |
| 9 | F07 Review & Confirm | M | F04+F06 |

**MVP Milestone**: F01 + F02 + F03 + F04 + F08 + F09
= CLI로 서버 컴포넌트 선택 → Compose 생성 → 서비스 기동 → 관리

---

## Related Documents

- [USER-STORY.md](USER-STORY.md) — 사용자 관점 플로우
- [PRD.md](PRD.md) — 제품 요구사항
- [TRD.md](TRD.md) — 기술 요구사항
- [REQUIREMENT.md](REQUIREMENT.md) — 기능 요구사항 (REQ ID)
- [constitution.md](../.specify/memory/constitution.md) — 프로젝트 원칙
