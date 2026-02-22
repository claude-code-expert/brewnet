# HomeHub - Complete Specification Document

## Document Info
- **Version**: 2.0
- **Last Updated**: 2024
- **Status**: Draft

---

# Part 1: Executive Summary

## 1.1 프로젝트 비전

**HomeHub**는 개인 홈서버를 전문 지식 없이도 쉽게 구축하고 관리할 수 있는 올인원 솔루션입니다.

```
"로컬에서 개발하고, 홈서버에서 운영하고, 세상에 공개한다"
```

## 1.2 핵심 가치 제안

| 기존 방식 | HomeHub |
|-----------|---------|
| Docker 명령어 암기 | GUI 클릭으로 컨테이너 관리 |
| nginx.conf 수동 편집 | 도메인 입력만으로 자동 설정 |
| certbot 수동 실행 | SSL 인증서 자동 발급/갱신 |
| iptables 규칙 작성 | 체크박스로 방화벽 설정 |
| 여러 터미널 창 | 단일 대시보드 |

## 1.3 타겟 사용자

1. **Primary**: 사이드 프로젝트를 셀프호스팅하려는 개발자
2. **Secondary**: 홈랩을 구축하려는 기술 애호가
3. **Tertiary**: 소규모 팀의 내부 서버 관리자

---

# Part 2: Business Model

## 2.1 Freemium 티어 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HomeHub Pricing Tiers                           │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│    🆓 Free        │  │    💎 Pro         │  │    🏢 Team        │
│    CLI Edition    │  │    Dashboard      │  │    Multi-Server   │
├───────────────────┤  ├───────────────────┤  ├───────────────────┤
│                   │  │                   │  │                   │
│ CLI 설치/관리 도구 │  │ 웹 대시보드       │  │ 멀티 서버 관리     │
│ 기본 스크립트     │  │ 실시간 모니터링    │  │ 팀 멤버 권한       │
│ Docker 기본       │  │ Git 배포 파이프라인│  │ 중앙 집중 관리     │
│ 수동 DDNS        │  │ 자동 SSL          │  │ 감사 로그         │
│ 커뮤니티 지원     │  │ ACL GUI          │  │ 우선 지원 + SLA   │
│                   │  │ 이메일 지원       │  │                   │
│                   │  │                   │  │                   │
│      $0/월        │  │     $9/월         │  │    $29/월/서버    │
│                   │  │   (1 서버)        │  │                   │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

## 2.2 기능별 티어 매핑

| Category | Feature | Free | Pro | Team |
|----------|---------|:----:|:---:|:----:|
| **설치** | Shell 스크립트 설치 | ✅ | ✅ | ✅ |
| | Docker 자동 설치 | ✅ | ✅ | ✅ |
| | 개발환경 버전 관리 | ✅ | ✅ | ✅ |
| **런타임** | Node.js (nvm) | ✅ | ✅ | ✅ |
| | Python (pyenv) | ✅ | ✅ | ✅ |
| | Java (SDKMAN) | ✅ | ✅ | ✅ |
| | Go, Rust, Ruby | ✅ | ✅ | ✅ |
| **관리** | CLI 명령어 | ✅ | ✅ | ✅ |
| | 웹 대시보드 | ❌ | ✅ | ✅ |
| | 실시간 모니터링 | ❌ | ✅ | ✅ |
| | 리소스 알림 | ❌ | ✅ | ✅ |
| **Docker** | 컨테이너 관리 (CLI) | ✅ | ✅ | ✅ |
| | 컨테이너 관리 (GUI) | ❌ | ✅ | ✅ |
| | Compose 스택 | ✅ | ✅ | ✅ |
| | 이미지 레지스트리 | ❌ | ✅ | ✅ |
| **Git/배포** | Git 저장소 연결 | ✅ | ✅ | ✅ |
| | 수동 배포 | ✅ | ✅ | ✅ |
| | 자동 배포 (Webhook) | ❌ | ✅ | ✅ |
| | 롤백 | ❌ | ✅ | ✅ |
| | 배포 이력 | ❌ | ✅ | ✅ |
| **도메인** | DDNS 설정 | ✅ (수동) | ✅ (자동) | ✅ |
| | 커스텀 도메인 | ✅ (수동) | ✅ | ✅ |
| | 서브도메인 관리 | ❌ | ✅ | ✅ |
| | 와일드카드 SSL | ❌ | ✅ | ✅ |
| **네트워크** | 포트 포워딩 가이드 | ✅ | ✅ | ✅ |
| | 리버스 프록시 | ❌ | ✅ | ✅ |
| | 로드 밸런싱 | ❌ | ❌ | ✅ |
| **보안** | 기본 방화벽 | ✅ | ✅ | ✅ |
| | IP 화이트/블랙리스트 | ✅ (CLI) | ✅ (GUI) | ✅ |
| | Rate Limiting | ❌ | ✅ | ✅ |
| | Geo Blocking | ❌ | ✅ | ✅ |
| | 접근 로그 | ❌ | ✅ | ✅ |
| | 2FA | ❌ | ✅ | ✅ |
| **팀** | 멀티 서버 | ❌ | ❌ | ✅ |
| | 팀 멤버 관리 | ❌ | ❌ | ✅ |
| | 역할 기반 권한 | ❌ | ❌ | ✅ |
| | 감사 로그 | ❌ | ❌ | ✅ |

## 2.3 라이선스 시스템

### 기기 식별 (Device Fingerprint)

```typescript
interface DeviceFingerprint {
  macAddress: string;          // Primary network interface MAC
  hardwareUUID: string;        // macOS: IOPlatformUUID
  hostname: string;            // Computer name
  username: string;            // Current user
  platform: string;            // darwin/linux/win32
  arch: string;                // arm64/x64
}

// Combined hash for device ID
const deviceId = sha256(JSON.stringify(fingerprint));
```

### 라이선스 검증 플로우

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Local CLI   │         │   License    │         │   Payment    │
│  / Dashboard │         │   Server     │         │   (Stripe)   │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ 1. Activate Request    │                        │
       │  {licenseKey,deviceId} │                        │
       │───────────────────────>│                        │
       │                        │                        │
       │                        │ 2. Validate Key        │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │<───────────────────────│
       │                        │ 3. Subscription Status │
       │                        │                        │
       │ 4. License Token       │                        │
       │  {valid, features,     │                        │
       │   expiresAt, offline}  │                        │
       │<───────────────────────│                        │
       │                        │                        │
       │ 5. Store locally       │                        │
       │ ~/.homehub/license     │                        │
       │                        │                        │
```

### 오프라인 지원

```typescript
interface LocalLicense {
  token: string;              // JWT signed by license server
  deviceId: string;
  plan: 'free' | 'pro' | 'team';
  features: string[];
  issuedAt: Date;
  expiresAt: Date;
  offlineGracePeriod: number; // 7 days default
  lastOnlineCheck: Date;
}
```

---

# Part 3: Architecture

## 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          HomeHub Architecture                            │
└─────────────────────────────────────────────────────────────────────────┘

                              Internet
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐            ┌──────▼──────┐
              │  License  │            │   GitHub    │
              │  Server   │            │   Webhook   │
              │  (Cloud)  │            │             │
              └─────┬─────┘            └──────┬──────┘
                    │                         │
════════════════════╪═════════════════════════╪═══════════════════════════
                    │         Home Network    │
                    │                         │
              ┌─────▼─────────────────────────▼─────┐
              │           Home Server (Mac/Linux)   │
              │  ┌─────────────────────────────┐    │
              │  │     HomeHub Dashboard       │    │
              │  │     (Next.js :3000)         │    │
              │  └─────────────┬───────────────┘    │
              │                │                    │
              │  ┌─────────────▼───────────────┐    │
              │  │        HomeHub Core         │    │
              │  │  ┌───────┐ ┌───────┐        │    │
              │  │  │Docker │ │ Git   │        │    │
              │  │  │Manager│ │Deploy │        │    │
              │  │  └───────┘ └───────┘        │    │
              │  │  ┌───────┐ ┌───────┐        │    │
              │  │  │Reverse│ │ ACL   │        │    │
              │  │  │Proxy  │ │Manager│        │    │
              │  │  └───────┘ └───────┘        │    │
              │  └─────────────┬───────────────┘    │
              │                │                    │
              │  ┌─────────────▼───────────────┐    │
              │  │      Managed Services       │    │
              │  │  ┌─────┐ ┌─────┐ ┌─────┐   │    │
              │  │  │Nginx│ │ App │ │ DB  │   │    │
              │  │  │Proxy│ │ :8080│ │:5432│   │    │
              │  │  └─────┘ └─────┘ └─────┘   │    │
              │  └─────────────────────────────┘    │
              │                                     │
              │  ┌─────────────────────────────┐    │
              │  │        SQLite DB            │    │
              │  │   ~/.homehub/homehub.db     │    │
              │  └─────────────────────────────┘    │
              └─────────────────────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │   Router    │
                          │ Port Forward│
                          └──────┬──────┘
                                 │
                              Internet
                                 │
                          ┌──────▼──────┐
                          │   Users     │
                          │ app.domain  │
                          └─────────────┘
```

## 3.2 Technology Stack

### CLI Package (`@homehub/cli`)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | TypeScript 5 | Type safety |
| Runtime | Node.js 20 LTS | Execution |
| CLI Framework | Commander.js | Command parsing |
| Shell | execa | Process execution |
| HTTP | ofetch | API calls |
| Config | conf | Local storage |
| UI | chalk, ora | Terminal styling |

### Dashboard Package (`@homehub/dashboard`)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React |
| UI | Tailwind CSS + shadcn/ui | Styling |
| State | Zustand | Client state |
| Data Fetching | TanStack Query | Server state |
| Forms | React Hook Form + Zod | Validation |
| Charts | Recharts | Monitoring graphs |
| Terminal | xterm.js | Web terminal |
| Editor | Monaco Editor | Config editing |

### System Integration

| Component | Technology | Purpose |
|-----------|------------|---------|
| Docker | dockerode | Container management |
| Git | simple-git | Repository operations |
| Reverse Proxy | nginx (auto-configured) | Traffic routing |
| SSL | Let's Encrypt (certbot) | Certificates |
| Database | SQLite (better-sqlite3) | Local persistence |
| Process | PM2 | Daemon management |

## 3.3 Project Structure

```
homehub/
├── packages/
│   ├── cli/                          # 🆓 Free CLI Tool
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/
│   │   │   └── homehub.ts            # Entry point
│   │   └── src/
│   │       ├── commands/
│   │       │   ├── init.ts           # Initialize server
│   │       │   ├── install.ts        # Install dependencies
│   │       │   ├── runtime/
│   │       │   │   ├── node.ts       # Node.js management
│   │       │   │   ├── python.ts     # Python management
│   │       │   │   └── java.ts       # Java management
│   │       │   ├── docker.ts         # Docker commands
│   │       │   ├── deploy.ts         # Deployment
│   │       │   ├── domain.ts         # Domain setup
│   │       │   ├── acl.ts            # Access control
│   │       │   ├── status.ts         # System status
│   │       │   ├── activate.ts       # License activation
│   │       │   └── dashboard.ts      # Start dashboard
│   │       ├── lib/
│   │       │   ├── config.ts         # Configuration
│   │       │   ├── device.ts         # Device fingerprint
│   │       │   ├── license.ts        # License checking
│   │       │   ├── docker.ts         # Docker client
│   │       │   ├── git.ts            # Git operations
│   │       │   ├── nginx.ts          # Nginx config
│   │       │   ├── ssl.ts            # SSL management
│   │       │   └── shell.ts          # Shell utilities
│   │       └── types/
│   │           └── index.ts
│   │
│   ├── dashboard/                    # 💎 Pro Web Dashboard
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx          # Dashboard home
│   │       │   ├── (auth)/
│   │       │   │   └── activate/     # License activation
│   │       │   ├── docker/
│   │       │   │   ├── page.tsx      # Container list
│   │       │   │   └── [id]/         # Container detail
│   │       │   ├── deploy/
│   │       │   │   ├── page.tsx      # Deployments
│   │       │   │   └── new/          # New deployment
│   │       │   ├── domains/
│   │       │   │   ├── page.tsx      # Domain list
│   │       │   │   └── [domain]/     # Domain settings
│   │       │   ├── security/
│   │       │   │   ├── page.tsx      # Security overview
│   │       │   │   ├── firewall/     # Firewall rules
│   │       │   │   ├── acl/          # Access control
│   │       │   │   └── logs/         # Access logs
│   │       │   ├── monitoring/
│   │       │   │   └── page.tsx      # System monitoring
│   │       │   ├── settings/
│   │       │   │   └── page.tsx      # App settings
│   │       │   └── api/
│   │       │       ├── system/
│   │       │       ├── docker/
│   │       │       ├── deploy/
│   │       │       ├── domain/
│   │       │       ├── acl/
│   │       │       └── license/
│   │       ├── components/
│   │       │   ├── ui/               # shadcn components
│   │       │   ├── layout/
│   │       │   ├── docker/
│   │       │   ├── deploy/
│   │       │   ├── domain/
│   │       │   └── security/
│   │       ├── lib/
│   │       │   ├── db.ts             # Database client
│   │       │   ├── docker.ts
│   │       │   ├── nginx.ts
│   │       │   └── utils.ts
│   │       ├── hooks/
│   │       └── stores/
│   │
│   └── shared/                       # Shared utilities
│       ├── package.json
│       └── src/
│           ├── types/
│           ├── constants/
│           └── utils/
│
├── scripts/
│   ├── install.sh                    # curl | bash installer
│   └── setup-nginx.sh
│
├── docker/
│   ├── templates/                    # Compose templates
│   │   ├── nextjs.yml
│   │   ├── nodejs.yml
│   │   ├── python.yml
│   │   ├── java.yml
│   │   └── static.yml
│   └── nginx/
│       └── templates/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

# Part 4: Feature Specifications

## 4.1 Installation & Setup

### 4.1.1 One-Line Installer

```bash
# Primary installation method
curl -fsSL https://get.homehub.io | bash

# Alternative: npm global
npm install -g @homehub/cli

# Alternative: Homebrew (macOS)
brew install homehub
```

### 4.1.2 Installation Script Flow

```bash
#!/bin/bash
# install.sh

echo "🏠 HomeHub Installer"

# 1. System detection
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unsupported" ;;
  esac
}

# 2. Prerequisites check
check_prerequisites() {
  # Node.js
  if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    # Install via nvm or package manager
  fi
  
  # Docker
  if ! command -v docker &> /dev/null; then
    echo "Docker not found. Install Docker Desktop first."
    exit 1
  fi
}

# 3. Install HomeHub CLI
install_homehub() {
  npm install -g @homehub/cli
}

# 4. Initialize
initialize() {
  homehub init
}

main() {
  detect_os
  check_prerequisites
  install_homehub
  initialize
  
  echo "✅ HomeHub installed successfully!"
  echo "Run 'homehub status' to check system"
  echo "Run 'homehub dashboard' to start web UI (Pro)"
}

main
```

### 4.1.3 Initialize Command

```typescript
// commands/init.ts

interface InitOptions {
  port?: number;
  dataDir?: string;
  skipDocker?: boolean;
}

async function init(options: InitOptions) {
  console.log('🏠 Initializing HomeHub...\n');
  
  // 1. Create data directory
  const dataDir = options.dataDir || '~/.homehub';
  await fs.mkdir(dataDir, { recursive: true });
  
  // 2. Initialize database
  await initDatabase(dataDir);
  
  // 3. Check Docker
  if (!options.skipDocker) {
    const dockerOk = await checkDocker();
    if (!dockerOk) {
      console.log('⚠️  Docker not running. Some features disabled.');
    }
  }
  
  // 4. Detect network
  const networkInfo = await detectNetwork();
  console.log(`📡 Public IP: ${networkInfo.publicIP}`);
  console.log(`🏠 Local IP: ${networkInfo.localIP}`);
  
  // 5. Generate device ID
  const deviceId = await generateDeviceId();
  await saveConfig({ deviceId, dataDir, ...networkInfo });
  
  // 6. Display summary
  console.log('\n✅ HomeHub initialized!');
  console.log('\nNext steps:');
  console.log('  homehub runtime install node 20  # Install Node.js');
  console.log('  homehub docker status            # Check Docker');
  console.log('  homehub deploy                   # Deploy an app');
}
```

## 4.2 Runtime Environment Management

### 4.2.1 Supported Runtimes

| Runtime | Manager | Versions |
|---------|---------|----------|
| Node.js | nvm | 18, 20, 22 (LTS) |
| Python | pyenv | 3.9, 3.10, 3.11, 3.12 |
| Java | SDKMAN | 11, 17, 21 (LTS) |
| Go | goenv | 1.21, 1.22 |
| Ruby | rbenv | 3.2, 3.3 |
| Rust | rustup | stable, nightly |

### 4.2.2 Runtime CLI Commands

```bash
# List available runtimes
homehub runtime list

# Install specific version
homehub runtime install node 20
homehub runtime install python 3.12
homehub runtime install java 21

# Set default version
homehub runtime default node 20

# Check installed versions
homehub runtime status

# Use specific version in project
homehub runtime use node 18
```

### 4.2.3 Runtime Management Implementation

```typescript
// lib/runtime.ts

interface RuntimeManager {
  name: string;
  checkInstalled(): Promise<boolean>;
  install(): Promise<void>;
  listVersions(): Promise<string[]>;
  installVersion(version: string): Promise<void>;
  setDefault(version: string): Promise<void>;
  getCurrentVersion(): Promise<string | null>;
}

class NodeManager implements RuntimeManager {
  name = 'node';
  
  async checkInstalled(): Promise<boolean> {
    return commandExists('nvm') || commandExists('node');
  }
  
  async install(): Promise<void> {
    // Install nvm
    await exec('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash');
  }
  
  async listVersions(): Promise<string[]> {
    const { stdout } = await exec('nvm ls-remote --lts');
    return parseVersions(stdout);
  }
  
  async installVersion(version: string): Promise<void> {
    await exec(`nvm install ${version}`);
  }
  
  async setDefault(version: string): Promise<void> {
    await exec(`nvm alias default ${version}`);
  }
  
  async getCurrentVersion(): Promise<string | null> {
    try {
      const { stdout } = await exec('node --version');
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

class PythonManager implements RuntimeManager {
  name = 'python';
  
  async checkInstalled(): Promise<boolean> {
    return commandExists('pyenv');
  }
  
  async install(): Promise<void> {
    if (process.platform === 'darwin') {
      await exec('brew install pyenv');
    } else {
      await exec('curl https://pyenv.run | bash');
    }
  }
  
  async installVersion(version: string): Promise<void> {
    await exec(`pyenv install ${version}`);
  }
  
  async setDefault(version: string): Promise<void> {
    await exec(`pyenv global ${version}`);
  }
}

class JavaManager implements RuntimeManager {
  name = 'java';
  
  async install(): Promise<void> {
    await exec('curl -s "https://get.sdkman.io" | bash');
  }
  
  async installVersion(version: string): Promise<void> {
    await exec(`sdk install java ${version}-tem`); // Temurin
  }
}

// Factory
function getRuntimeManager(runtime: string): RuntimeManager {
  switch (runtime) {
    case 'node': return new NodeManager();
    case 'python': return new PythonManager();
    case 'java': return new JavaManager();
    default: throw new Error(`Unknown runtime: ${runtime}`);
  }
}
```

## 4.3 Git Integration & Deployment

### 4.3.1 Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Deployment Pipeline                               │
└─────────────────────────────────────────────────────────────────────────┘

[Git Repository]          [HomeHub]                    [Running Service]
      │                       │                              │
      │ 1. git push           │                              │
      │──────────────────────>│                              │
      │                       │                              │
      │                       │ 2. Webhook received          │
      │                       │    (Pro only)                │
      │                       ▼                              │
      │              ┌─────────────────┐                     │
      │              │ Clone/Pull repo │                     │
      │              └────────┬────────┘                     │
      │                       │                              │
      │                       ▼                              │
      │              ┌─────────────────┐                     │
      │              │ Detect runtime  │                     │
      │              │ (package.json,  │                     │
      │              │  requirements,  │                     │
      │              │  pom.xml, etc)  │                     │
      │              └────────┬────────┘                     │
      │                       │                              │
      │                       ▼                              │
      │              ┌─────────────────┐                     │
      │              │ Build container │                     │
      │              │ (Dockerfile or  │                     │
      │              │  auto-generate) │                     │
      │              └────────┬────────┘                     │
      │                       │                              │
      │                       ▼                              │
      │              ┌─────────────────┐                     │
      │              │ Health check    │                     │
      │              └────────┬────────┘                     │
      │                       │                              │
      │                       ▼                              │
      │              ┌─────────────────┐     4. Route       │
      │              │ Update proxy    │───────────────────>│
      │              │ (zero-downtime) │                     │
      │              └─────────────────┘                     │
      │                       │                              │
      │                       ▼                              │
      │              ┌─────────────────┐                     │
      │              │ Cleanup old     │                     │
      │              │ containers      │                     │
      │              └─────────────────┘                     │
```

### 4.3.2 Deployment Configuration

```yaml
# homehub.yml - Project deployment config

name: my-nextjs-app
runtime: node
version: 20

# Build settings
build:
  command: npm run build
  output: .next

# Start command
start:
  command: npm start
  port: 3000

# Environment variables
env:
  NODE_ENV: production
  DATABASE_URL: ${DATABASE_URL}  # From secrets

# Domain configuration
domains:
  - app.mydomain.com
  - www.mydomain.com

# Health check
healthcheck:
  path: /api/health
  interval: 30s
  timeout: 5s
  retries: 3

# Resource limits
resources:
  memory: 512M
  cpu: 0.5

# Auto-deploy settings (Pro)
deploy:
  branch: main
  auto: true
```

### 4.3.3 Deployment CLI Commands

```bash
# Initialize deployment in project
homehub deploy init

# Deploy current directory
homehub deploy

# Deploy specific branch
homehub deploy --branch main

# Deploy from Git URL
homehub deploy https://github.com/user/repo.git

# List deployments
homehub deploy list

# View deployment logs
homehub deploy logs my-app

# Rollback to previous version
homehub deploy rollback my-app

# Stop deployment
homehub deploy stop my-app
```

### 4.3.4 Auto-Detection Logic

```typescript
// lib/detect.ts

interface ProjectInfo {
  runtime: 'node' | 'python' | 'java' | 'go' | 'ruby' | 'static';
  framework?: string;
  version?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
}

async function detectProject(dir: string): Promise<ProjectInfo> {
  const files = await fs.readdir(dir);
  
  // Node.js
  if (files.includes('package.json')) {
    const pkg = await readJson(join(dir, 'package.json'));
    
    // Detect framework
    if (pkg.dependencies?.next) {
      return {
        runtime: 'node',
        framework: 'nextjs',
        version: pkg.engines?.node || '20',
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        port: 3000
      };
    }
    
    if (pkg.dependencies?.express) {
      return {
        runtime: 'node',
        framework: 'express',
        buildCommand: pkg.scripts?.build ? 'npm run build' : undefined,
        startCommand: 'npm start',
        port: 3000
      };
    }
    
    // Generic Node.js
    return {
      runtime: 'node',
      startCommand: pkg.scripts?.start || 'node index.js',
      port: 3000
    };
  }
  
  // Python
  if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
    // Django
    if (files.includes('manage.py')) {
      return {
        runtime: 'python',
        framework: 'django',
        startCommand: 'gunicorn myproject.wsgi:application',
        port: 8000
      };
    }
    
    // FastAPI
    const requirements = await readFile(join(dir, 'requirements.txt'), 'utf-8');
    if (requirements.includes('fastapi')) {
      return {
        runtime: 'python',
        framework: 'fastapi',
        startCommand: 'uvicorn main:app --host 0.0.0.0',
        port: 8000
      };
    }
    
    // Flask
    if (requirements.includes('flask') || files.includes('app.py')) {
      return {
        runtime: 'python',
        framework: 'flask',
        startCommand: 'gunicorn app:app',
        port: 5000
      };
    }
  }
  
  // Java
  if (files.includes('pom.xml')) {
    return {
      runtime: 'java',
      framework: 'spring',
      buildCommand: './mvnw package -DskipTests',
      startCommand: 'java -jar target/*.jar',
      port: 8080
    };
  }
  
  if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
    return {
      runtime: 'java',
      framework: 'spring',
      buildCommand: './gradlew build -x test',
      startCommand: 'java -jar build/libs/*.jar',
      port: 8080
    };
  }
  
  // Go
  if (files.includes('go.mod')) {
    return {
      runtime: 'go',
      buildCommand: 'go build -o app',
      startCommand: './app',
      port: 8080
    };
  }
  
  // Static
  if (files.includes('index.html')) {
    return {
      runtime: 'static',
      port: 80
    };
  }
  
  throw new Error('Could not detect project type');
}
```

### 4.3.5 Dockerfile Generation

```typescript
// lib/dockerfile.ts

const TEMPLATES = {
  node: (info: ProjectInfo) => `
FROM node:${info.version || '20'}-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
${info.buildCommand ? `RUN ${info.buildCommand}` : ''}

EXPOSE ${info.port || 3000}
CMD ${JSON.stringify((info.startCommand || 'npm start').split(' '))}
`,

  python: (info: ProjectInfo) => `
FROM python:${info.version || '3.12'}-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${info.port || 8000}
CMD ${JSON.stringify((info.startCommand || 'python app.py').split(' '))}
`,

  java: (info: ProjectInfo) => `
FROM eclipse-temurin:${info.version || '21'}-jdk-alpine AS build

WORKDIR /app
COPY . .
RUN ${info.buildCommand || './mvnw package -DskipTests'}

FROM eclipse-temurin:${info.version || '21'}-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

EXPOSE ${info.port || 8080}
CMD ["java", "-jar", "app.jar"]
`,

  static: () => `
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`
};

function generateDockerfile(info: ProjectInfo): string {
  const template = TEMPLATES[info.runtime];
  if (!template) {
    throw new Error(`No template for runtime: ${info.runtime}`);
  }
  return template(info);
}
```

## 4.4 Domain & SSL Management

### 4.4.1 Domain Configuration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Domain Setup Flow                                   │
└─────────────────────────────────────────────────────────────────────────┘

                        User Choice
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │   DDNS     │   │  Custom    │   │ HomeHub    │
     │ (Free)     │   │  Domain    │   │ Subdomain  │
     │            │   │            │   │ (Pro)      │
     └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
           │                │                │
           ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │ DuckDNS    │   │ DNS A/CNAME│   │ *.homehub  │
     │ No-IP      │   │ Record     │   │   .app     │
     │ Cloudflare │   │            │   │            │
     └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  SSL via Let's  │
                   │  Encrypt        │
                   │  (Auto-renewal) │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Nginx Reverse  │
                   │  Proxy Config   │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Service Ready  │
                   │  https://domain │
                   └─────────────────┘
```

### 4.4.2 Domain CLI Commands

```bash
# Add custom domain
homehub domain add myapp.example.com --app my-app

# Add subdomain (routes to specific app)
homehub domain add api.example.com --app my-api
homehub domain add www.example.com --app my-frontend

# Setup DDNS
homehub domain ddns setup duckdns --token YOUR_TOKEN --domain myserver

# Verify domain
homehub domain verify example.com

# Issue SSL certificate
homehub domain ssl example.com

# List domains
homehub domain list

# Remove domain
homehub domain remove example.com
```

### 4.4.3 SSL Management

```typescript
// lib/ssl.ts

interface SSLConfig {
  domain: string;
  email: string;
  staging?: boolean;  // Use Let's Encrypt staging for testing
}

class SSLManager {
  async issueCertificate(config: SSLConfig): Promise<void> {
    const { domain, email, staging } = config;
    
    // Check DNS resolution
    const resolved = await this.verifyDNS(domain);
    if (!resolved) {
      throw new Error(`DNS not resolving for ${domain}`);
    }
    
    // Issue certificate using certbot
    const stagingFlag = staging ? '--staging' : '';
    await exec(`certbot certonly --nginx \
      -d ${domain} \
      --email ${email} \
      --agree-tos \
      --non-interactive \
      ${stagingFlag}`);
    
    // Update nginx config
    await this.updateNginxSSL(domain);
    
    // Setup auto-renewal cron
    await this.setupAutoRenewal();
  }
  
  async checkExpiry(domain: string): Promise<Date | null> {
    const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`;
    try {
      const { stdout } = await exec(
        `openssl x509 -enddate -noout -in ${certPath}`
      );
      // Parse "notAfter=Mar 25 12:00:00 2025 GMT"
      const match = stdout.match(/notAfter=(.+)/);
      return match ? new Date(match[1]) : null;
    } catch {
      return null;
    }
  }
  
  async renewAll(): Promise<void> {
    await exec('certbot renew --quiet');
    await exec('nginx -s reload');
  }
  
  private async setupAutoRenewal(): Promise<void> {
    // Add cron job for twice-daily renewal check
    const cronJob = '0 0,12 * * * certbot renew --quiet && nginx -s reload';
    await exec(`(crontab -l 2>/dev/null; echo "${cronJob}") | crontab -`);
  }
}
```

### 4.4.4 Nginx Configuration

```typescript
// lib/nginx.ts

interface NginxSite {
  domain: string;
  upstream: string;  // localhost:port or container name
  ssl: boolean;
  http2?: boolean;
  websocket?: boolean;
}

class NginxManager {
  private sitesDir = '/etc/nginx/sites-available';
  private enabledDir = '/etc/nginx/sites-enabled';
  
  async addSite(site: NginxSite): Promise<void> {
    const config = this.generateConfig(site);
    const filename = site.domain.replace(/\./g, '_');
    
    // Write config
    await fs.writeFile(`${this.sitesDir}/${filename}`, config);
    
    // Enable site
    await fs.symlink(
      `${this.sitesDir}/${filename}`,
      `${this.enabledDir}/${filename}`
    );
    
    // Test and reload
    await exec('nginx -t');
    await exec('nginx -s reload');
  }
  
  private generateConfig(site: NginxSite): string {
    return `
# ${site.domain} - Generated by HomeHub
upstream ${site.domain.replace(/\./g, '_')} {
    server ${site.upstream};
}

server {
    listen 80;
    server_name ${site.domain};
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

${site.ssl ? `
server {
    listen 443 ssl${site.http2 ? ' http2' : ''};
    server_name ${site.domain};
    
    ssl_certificate /etc/letsencrypt/live/${site.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${site.domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://${site.domain.replace(/\./g, '_')};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        ${site.websocket ? `
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        ` : ''}
    }
}
` : ''}
`;
  }
  
  async removeSite(domain: string): Promise<void> {
    const filename = domain.replace(/\./g, '_');
    await fs.unlink(`${this.enabledDir}/${filename}`);
    await fs.unlink(`${this.sitesDir}/${filename}`);
    await exec('nginx -s reload');
  }
  
  async listSites(): Promise<string[]> {
    const files = await fs.readdir(this.enabledDir);
    return files.map(f => f.replace(/_/g, '.'));
  }
}
```

## 4.5 Security & Access Control

### 4.5.1 Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Security Layers                                   │
└─────────────────────────────────────────────────────────────────────────┘

                              Internet
                                 │
                    ┌────────────▼────────────┐
                    │    1. DDoS Protection   │
                    │    (Cloudflare/etc)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    2. Geo Blocking      │
                    │    (Country-level)      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    3. IP Whitelist/     │
                    │       Blacklist         │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    4. Rate Limiting     │
                    │    (per IP/endpoint)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    5. WAF Rules         │
                    │    (SQL injection,      │
                    │     XSS, etc)           │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    6. Authentication    │
                    │    (Basic/OAuth/2FA)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    7. SSL/TLS           │
                    │    (Encryption)         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                           Application
```

### 4.5.2 ACL Data Model

```typescript
// Database schema for ACL

interface ACLRule {
  id: string;
  type: 'allow' | 'deny';
  scope: 'global' | 'domain' | 'path';
  target?: string;           // Domain or path pattern
  
  // Conditions
  sourceIP?: string;         // IP or CIDR
  sourceCountry?: string;    // ISO country code
  userAgent?: string;        // Regex pattern
  
  // Rate limiting
  rateLimit?: {
    requests: number;
    period: 'second' | 'minute' | 'hour';
  };
  
  // Time-based
  schedule?: {
    startTime?: string;      // HH:MM
    endTime?: string;
    days?: number[];         // 0-6 (Sun-Sat)
  };
  
  enabled: boolean;
  priority: number;          // Lower = higher priority
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Access log entry
interface AccessLog {
  id: string;
  timestamp: Date;
  sourceIP: string;
  country?: string;
  method: string;
  path: string;
  domain: string;
  userAgent: string;
  statusCode: number;
  responseTime: number;
  bytesIn: number;
  bytesOut: number;
  blocked: boolean;
  blockReason?: string;
  ruleId?: string;
}
```

### 4.5.3 ACL CLI Commands

```bash
# IP Management
homehub acl allow ip 192.168.1.0/24 --description "Home network"
homehub acl deny ip 45.33.32.156 --description "Suspicious activity"
homehub acl allow ip 0.0.0.0/0 --domain api.example.com  # Public API

# Country blocking (Pro)
homehub acl deny country CN,RU --description "Block high-risk countries"
homehub acl allow country US,KR,JP

# Rate limiting (Pro)
homehub acl ratelimit 100/minute --path "/api/*"
homehub acl ratelimit 10/second --path "/api/login"

# View rules
homehub acl list
homehub acl list --domain example.com

# View logs
homehub acl logs
homehub acl logs --blocked
homehub acl logs --ip 45.33.32.156

# Toggle rule
homehub acl disable <rule-id>
homehub acl enable <rule-id>

# Remove rule
homehub acl remove <rule-id>
```

### 4.5.4 Firewall Integration

```typescript
// lib/firewall.ts

interface FirewallManager {
  addRule(rule: FirewallRule): Promise<void>;
  removeRule(id: string): Promise<void>;
  listRules(): Promise<FirewallRule[]>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

// macOS implementation using pf
class PFFirewall implements FirewallManager {
  private anchorName = 'com.homehub';
  private rulesFile = '/etc/pf.anchors/homehub';
  
  async addRule(rule: FirewallRule): Promise<void> {
    const pfRule = this.toPfRule(rule);
    await fs.appendFile(this.rulesFile, pfRule + '\n');
    await this.reload();
  }
  
  private toPfRule(rule: FirewallRule): string {
    const action = rule.type === 'allow' ? 'pass' : 'block';
    const direction = 'in';
    const proto = rule.protocol || 'tcp';
    
    let pfRule = `${action} ${direction} proto ${proto}`;
    
    if (rule.sourceIP) {
      pfRule += ` from ${rule.sourceIP}`;
    } else {
      pfRule += ' from any';
    }
    
    if (rule.port) {
      pfRule += ` to any port ${rule.port}`;
    }
    
    return pfRule;
  }
  
  async reload(): Promise<void> {
    await exec(`pfctl -a ${this.anchorName} -f ${this.rulesFile}`);
  }
}

// Linux implementation using iptables/nftables
class NFTablesFirewall implements FirewallManager {
  async addRule(rule: FirewallRule): Promise<void> {
    const nftRule = this.toNftRule(rule);
    await exec(nftRule);
  }
  
  private toNftRule(rule: FirewallRule): string {
    const action = rule.type === 'allow' ? 'accept' : 'drop';
    let cmd = `nft add rule inet filter input`;
    
    if (rule.sourceIP) {
      cmd += ` ip saddr ${rule.sourceIP}`;
    }
    
    if (rule.port) {
      cmd += ` tcp dport ${rule.port}`;
    }
    
    cmd += ` ${action}`;
    return cmd;
  }
}
```

### 4.5.5 Nginx Security Configuration

```typescript
// lib/nginx-security.ts

function generateSecurityConfig(): string {
  return `
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

# Connection limiting
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# Geo blocking (requires GeoIP module)
# geoip_country /usr/share/GeoIP/GeoIP.dat;
# map $geoip_country_code $blocked_country {
#     default 0;
#     CN 1;
#     RU 1;
# }

# Block bad user agents
map $http_user_agent $bad_bot {
    default 0;
    ~*malicious 1;
    ~*scanner 1;
    ~*sqlmap 1;
}
`;
}

function generateLocationSecurity(config: SecurityConfig): string {
  let rules = '';
  
  // Rate limiting
  if (config.rateLimit) {
    rules += `limit_req zone=${config.rateLimit.zone} burst=${config.rateLimit.burst} nodelay;\n`;
  }
  
  // Connection limit
  if (config.connLimit) {
    rules += `limit_conn conn_limit ${config.connLimit};\n`;
  }
  
  // IP whitelist/blacklist
  if (config.allowedIPs?.length) {
    for (const ip of config.allowedIPs) {
      rules += `allow ${ip};\n`;
    }
    rules += 'deny all;\n';
  }
  
  if (config.deniedIPs?.length) {
    for (const ip of config.deniedIPs) {
      rules += `deny ${ip};\n`;
    }
  }
  
  // Geo blocking
  if (config.geoBlock) {
    rules += `
    if ($blocked_country) {
        return 403;
    }
    `;
  }
  
  // Bot protection
  if (config.blockBots) {
    rules += `
    if ($bad_bot) {
        return 403;
    }
    `;
  }
  
  return rules;
}
```

## 4.6 Monitoring & Logging

### 4.6.1 Dashboard Metrics

```typescript
// Real-time metrics displayed on dashboard

interface SystemMetrics {
  cpu: {
    usage: number;        // Percentage
    cores: number;
    load: number[];       // 1, 5, 15 min
  };
  memory: {
    used: number;         // Bytes
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;      // Per second
    bytesOut: number;
    connections: number;
  };
}

interface ServiceMetrics {
  name: string;
  status: 'running' | 'stopped' | 'error';
  cpu: number;
  memory: number;
  uptime: number;
  requests: number;        // Per minute
  errors: number;
  responseTime: number;    // Average ms
}

interface TrafficMetrics {
  totalRequests: number;
  uniqueVisitors: number;
  bandwidth: number;
  topPaths: Array<{ path: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  statusCodes: Record<number, number>;
  blockedRequests: number;
}
```

### 4.6.2 Log Aggregation

```typescript
// lib/logs.ts

interface LogQuery {
  service?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  startTime?: Date;
  endTime?: Date;
  search?: string;
  limit?: number;
}

class LogManager {
  private logDir = '/var/log/homehub';
  
  async query(query: LogQuery): Promise<LogEntry[]> {
    // Implementation using SQLite FTS or file parsing
  }
  
  async streamLogs(service: string, onLog: (log: LogEntry) => void): Promise<() => void> {
    // Real-time log streaming using tail -f
    const proc = spawn('tail', ['-f', `${this.logDir}/${service}.log`]);
    
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        onLog(this.parseLine(line));
      }
    });
    
    return () => proc.kill();
  }
  
  async getContainerLogs(containerId: string, tail = 100): Promise<string> {
    const { stdout } = await exec(`docker logs --tail ${tail} ${containerId}`);
    return stdout;
  }
}
```

---

# Part 5: Database Schema

## 5.1 Complete Schema

```sql
-- HomeHub SQLite Schema

-- System configuration
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- License information
CREATE TABLE license (
    id INTEGER PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    license_key TEXT,
    plan TEXT DEFAULT 'free',
    features TEXT,  -- JSON array
    issued_at DATETIME,
    expires_at DATETIME,
    last_check DATETIME,
    offline_token TEXT
);

-- Installed runtimes
CREATE TABLE runtimes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- node, python, java, etc.
    version TEXT NOT NULL,
    path TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, version)
);

-- Deployed applications
CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    runtime TEXT NOT NULL,
    framework TEXT,
    repo_url TEXT,
    repo_branch TEXT DEFAULT 'main',
    build_command TEXT,
    start_command TEXT,
    port INTEGER,
    env_vars TEXT,  -- JSON object (encrypted)
    
    -- Deployment info
    container_id TEXT,
    status TEXT DEFAULT 'stopped',
    current_version TEXT,
    deployed_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deployment history
CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    version TEXT NOT NULL,
    commit_hash TEXT,
    commit_message TEXT,
    status TEXT NOT NULL,  -- pending, building, running, failed, rolled_back
    started_at DATETIME,
    finished_at DATETIME,
    logs TEXT,
    error TEXT,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

-- Domains
CREATE TABLE domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    app_id TEXT REFERENCES apps(id),
    
    -- SSL
    ssl_enabled BOOLEAN DEFAULT FALSE,
    ssl_cert_path TEXT,
    ssl_key_path TEXT,
    ssl_expires_at DATETIME,
    ssl_auto_renew BOOLEAN DEFAULT TRUE,
    
    -- DDNS
    ddns_provider TEXT,
    ddns_config TEXT,  -- JSON (encrypted)
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
);

-- ACL Rules
CREATE TABLE acl_rules (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- allow, deny
    scope TEXT NOT NULL,  -- global, domain, path
    target TEXT,  -- domain or path pattern
    
    -- Conditions
    source_ip TEXT,
    source_cidr TEXT,
    source_country TEXT,
    user_agent TEXT,
    
    -- Rate limiting
    rate_limit_requests INTEGER,
    rate_limit_period TEXT,
    
    -- Schedule
    schedule_start TEXT,
    schedule_end TEXT,
    schedule_days TEXT,
    
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 100,
    description TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Access Logs
CREATE TABLE access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_ip TEXT NOT NULL,
    country TEXT,
    method TEXT,
    path TEXT,
    domain TEXT,
    user_agent TEXT,
    status_code INTEGER,
    response_time INTEGER,
    bytes_in INTEGER,
    bytes_out INTEGER,
    blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    rule_id TEXT REFERENCES acl_rules(id)
);

-- Create indexes for access logs
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp);
CREATE INDEX idx_access_logs_ip ON access_logs(source_ip);
CREATE INDEX idx_access_logs_domain ON access_logs(domain);
CREATE INDEX idx_access_logs_blocked ON access_logs(blocked);

-- Docker containers managed by HomeHub
CREATE TABLE containers (
    id TEXT PRIMARY KEY,
    docker_id TEXT,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    app_id TEXT REFERENCES apps(id),
    status TEXT,
    ports TEXT,  -- JSON
    volumes TEXT,  -- JSON
    env_vars TEXT,  -- JSON (encrypted)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System metrics history
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_usage REAL,
    memory_used INTEGER,
    memory_total INTEGER,
    disk_used INTEGER,
    disk_total INTEGER,
    network_in INTEGER,
    network_out INTEGER,
    connections INTEGER
);

CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);

-- Scheduled tasks
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- ddns_update, ssl_renew, backup, cleanup
    schedule TEXT NOT NULL,  -- cron expression
    last_run DATETIME,
    next_run DATETIME,
    enabled BOOLEAN DEFAULT TRUE,
    config TEXT  -- JSON
);
```

---

# Part 6: API Reference

## 6.1 CLI Commands Summary

```bash
# ══════════════════════════════════════════════════════════════════
# HOMEHUB CLI REFERENCE
# ══════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# Installation & Setup
# ─────────────────────────────────────────────────────────────────
homehub init                        # Initialize HomeHub
homehub status                      # System status
homehub upgrade                     # Upgrade CLI
homehub activate <LICENSE_KEY>      # Activate Pro license
homehub dashboard                   # Start web dashboard (Pro)

# ─────────────────────────────────────────────────────────────────
# Runtime Management
# ─────────────────────────────────────────────────────────────────
homehub runtime list                # List available runtimes
homehub runtime status              # Show installed versions
homehub runtime install <runtime> <version>
homehub runtime default <runtime> <version>
homehub runtime use <runtime> <version>
homehub runtime remove <runtime> <version>

# ─────────────────────────────────────────────────────────────────
# Docker Management
# ─────────────────────────────────────────────────────────────────
homehub docker status               # Docker daemon status
homehub docker ps                   # List containers
homehub docker logs <container>     # View logs
homehub docker exec <container>     # Enter container
homehub docker stats                # Resource usage

# ─────────────────────────────────────────────────────────────────
# Deployment
# ─────────────────────────────────────────────────────────────────
homehub deploy init                 # Initialize deployment config
homehub deploy                      # Deploy current project
homehub deploy <repo-url>           # Deploy from Git URL
homehub deploy list                 # List deployments
homehub deploy logs <app>           # Deployment logs
homehub deploy stop <app>           # Stop app
homehub deploy start <app>          # Start app
homehub deploy restart <app>        # Restart app
homehub deploy rollback <app>       # Rollback to previous
homehub deploy remove <app>         # Remove deployment

# ─────────────────────────────────────────────────────────────────
# Domain & SSL
# ─────────────────────────────────────────────────────────────────
homehub domain list                 # List configured domains
homehub domain add <domain> --app <app>
homehub domain remove <domain>
homehub domain verify <domain>      # Check DNS
homehub domain ssl <domain>         # Issue SSL cert
homehub domain ssl-status           # Check certificates

# DDNS
homehub domain ddns setup <provider> --token <token> --domain <subdomain>
homehub domain ddns update          # Force update
homehub domain ddns status          # Check status

# ─────────────────────────────────────────────────────────────────
# Security & ACL
# ─────────────────────────────────────────────────────────────────
homehub acl list                    # List rules
homehub acl allow ip <ip/cidr>      # Whitelist IP
homehub acl deny ip <ip/cidr>       # Blacklist IP
homehub acl deny country <codes>    # Block countries (Pro)
homehub acl ratelimit <rate> --path <pattern>  # Rate limit (Pro)
homehub acl enable <rule-id>        # Enable rule
homehub acl disable <rule-id>       # Disable rule
homehub acl remove <rule-id>        # Remove rule
homehub acl logs                    # View access logs
homehub acl logs --blocked          # View blocked requests

# ─────────────────────────────────────────────────────────────────
# Monitoring
# ─────────────────────────────────────────────────────────────────
homehub monitor                     # Real-time stats
homehub logs <app>                  # App logs
homehub logs --service nginx        # Service logs
```

## 6.2 Dashboard API Routes

```typescript
// Next.js App Router API structure

// System
GET  /api/system/info              // System information
GET  /api/system/stats             // Real-time metrics
GET  /api/system/health            // Health check

// License
POST /api/license/activate         // Activate license
GET  /api/license/status           // License status
POST /api/license/refresh          // Refresh token

// Docker
GET  /api/docker/containers        // List containers
GET  /api/docker/containers/:id    // Container details
POST /api/docker/containers/:id/start
POST /api/docker/containers/:id/stop
POST /api/docker/containers/:id/restart
GET  /api/docker/containers/:id/logs
GET  /api/docker/containers/:id/stats
GET  /api/docker/images            // List images

// Apps & Deployments
GET  /api/apps                     // List apps
POST /api/apps                     // Create app
GET  /api/apps/:id                 // App details
PUT  /api/apps/:id                 // Update app
DELETE /api/apps/:id               // Delete app
POST /api/apps/:id/deploy          // Trigger deployment
POST /api/apps/:id/rollback        // Rollback
GET  /api/apps/:id/deployments     // Deployment history
GET  /api/apps/:id/logs            // App logs

// Domains
GET  /api/domains                  // List domains
POST /api/domains                  // Add domain
GET  /api/domains/:id              // Domain details
DELETE /api/domains/:id            // Remove domain
POST /api/domains/:id/verify       // Verify DNS
POST /api/domains/:id/ssl          // Issue SSL

// ACL
GET  /api/acl/rules                // List rules
POST /api/acl/rules                // Create rule
PUT  /api/acl/rules/:id            // Update rule
DELETE /api/acl/rules/:id          // Delete rule
GET  /api/acl/logs                 // Access logs

// Runtimes
GET  /api/runtimes                 // List runtimes
POST /api/runtimes/install         // Install version
DELETE /api/runtimes/:type/:version
```

---

# Part 7: Development Roadmap

## 7.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Development Roadmap                               │
└─────────────────────────────────────────────────────────────────────────┘

Phase 1: Foundation (4 weeks)
├── CLI scaffold
├── Docker integration
├── Basic deployment
└── System monitoring

Phase 2: Networking (3 weeks)
├── Domain management
├── SSL automation
├── Reverse proxy
└── DDNS integration

Phase 3: Security (3 weeks)
├── ACL system
├── Firewall integration
├── Rate limiting
└── Access logging

Phase 4: Dashboard (4 weeks)
├── Next.js setup
├── License system
├── UI components
└── Real-time updates

Phase 5: Polish (2 weeks)
├── Testing
├── Documentation
├── Performance
└── Beta release
```

## 7.2 Detailed Milestones

### Phase 1: Foundation (Weeks 1-4)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Project setup | Monorepo, CLI scaffold, CI/CD |
| 2 | Docker integration | Container CRUD, logs, exec |
| 3 | Runtime management | Node, Python, Java support |
| 4 | Basic deployment | Git clone, auto-detect, build |

### Phase 2: Networking (Weeks 5-7)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 5 | Domain setup | DNS verification, subdomain support |
| 6 | SSL automation | Let's Encrypt integration, auto-renewal |
| 7 | Reverse proxy | Nginx config generation, routing |

### Phase 3: Security (Weeks 8-10)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 8 | ACL foundation | IP whitelist/blacklist, rules engine |
| 9 | Advanced security | Rate limiting, geo blocking |
| 10 | Logging & audit | Access logs, analytics |

### Phase 4: Dashboard (Weeks 11-14)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 11 | Dashboard setup | Next.js, auth, license check |
| 12 | Core UI | Docker, deploy, domain pages |
| 13 | Security UI | ACL management, logs viewer |
| 14 | Monitoring | Real-time metrics, charts |

### Phase 5: Polish (Weeks 15-16)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 15 | Testing | E2E tests, edge cases, security audit |
| 16 | Release prep | Documentation, beta launch |

---

# Part 8: Appendix

## A. Supported DDNS Providers

| Provider | Free Tier | API | Notes |
|----------|-----------|-----|-------|
| DuckDNS | ✅ 5 domains | Simple HTTP | Recommended |
| No-IP | ✅ 3 domains | HTTP Update | Needs refresh every 30 days |
| Cloudflare | ✅ Unlimited | REST API | Requires domain ownership |
| Dynu | ✅ 4 domains | HTTP Update | Good uptime |
| FreeDNS | ✅ 5 domains | HTTP Update | Community-driven |

## B. Port Reference

| Port | Service | Default |
|------|---------|---------|
| 22 | SSH | System |
| 80 | HTTP | Nginx |
| 443 | HTTPS | Nginx |
| 3000 | HomeHub Dashboard | Internal |
| 3001-3100 | User Apps | Dynamic |
| 5432 | PostgreSQL | Container |
| 3306 | MySQL | Container |
| 6379 | Redis | Container |

## C. Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| HH001 | Docker not running | Start Docker Desktop/daemon |
| HH002 | Port already in use | Change port or stop conflicting service |
| HH003 | SSL issuance failed | Check DNS, ensure port 80 accessible |
| HH004 | License invalid | Check key, contact support |
| HH005 | Rate limit exceeded | Wait or upgrade plan |
| HH006 | Build failed | Check logs, verify dependencies |
| HH007 | Git clone failed | Check URL, credentials |

## D. Environment Variables

```bash
# HomeHub configuration
HOMEHUB_DATA_DIR=~/.homehub          # Data directory
HOMEHUB_PORT=3000                    # Dashboard port
HOMEHUB_LOG_LEVEL=info               # Logging level
HOMEHUB_LICENSE_SERVER=https://license.homehub.io

# Feature flags
HOMEHUB_ENABLE_TELEMETRY=true        # Anonymous usage stats
HOMEHUB_ENABLE_AUTO_UPDATE=true      # Auto-update CLI
```

---

# Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial Electron-based spec |
| 2.0 | 2024-01 | Rewrite for CLI + Next.js architecture |

---

*End of Document*
