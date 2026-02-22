# HomeHub - Technical Architecture

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HOMEHUB ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

                              Internet
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐            ┌──────▼──────┐
              │  License  │            │   GitHub    │
              │  Server   │            │   Webhook   │
              └─────┬─────┘            └──────┬──────┘
                    │                         │
══════════════════════════════════════════════════════════════════════
                    │        Home Network     │
                    │                         │
        ┌───────────▼─────────────────────────▼───────────┐
        │                HOME SERVER                       │
        │                                                  │
        │  ┌────────────────────────────────────────────┐ │
        │  │            @homehub/dashboard               │ │
        │  │            (Next.js :3000)                  │ │
        │  └─────────────────────┬──────────────────────┘ │
        │                        │ API                    │
        │  ┌─────────────────────▼──────────────────────┐ │
        │  │              @homehub/cli                   │ │
        │  │                                             │ │
        │  │  ┌────────┐ ┌────────┐ ┌────────┐         │ │
        │  │  │ Docker │ │  Git   │ │ Nginx  │         │ │
        │  │  │ Manager│ │ Deploy │ │ Config │         │ │
        │  │  └────────┘ └────────┘ └────────┘         │ │
        │  │  ┌────────┐ ┌────────┐ ┌────────┐         │ │
        │  │  │  ACL   │ │  SSL   │ │Runtime │         │ │
        │  │  │ Manager│ │ Manager│ │ Manager│         │ │
        │  │  └────────┘ └────────┘ └────────┘         │ │
        │  └─────────────────────┬──────────────────────┘ │
        │                        │                        │
        │  ┌─────────────────────▼──────────────────────┐ │
        │  │               SQLite Database               │ │
        │  │           ~/.homehub/homehub.db             │ │
        │  └────────────────────────────────────────────┘ │
        │                                                  │
        │  ┌────────────────────────────────────────────┐ │
        │  │             Managed Services                │ │
        │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │ │
        │  │  │Nginx│ │ App │ │ DB  │ │Redis│         │ │
        │  │  │:80  │ │:3001│ │:5432│ │:6379│         │ │
        │  │  └─────┘ └─────┘ └─────┘ └─────┘         │ │
        │  └────────────────────────────────────────────┘ │
        └──────────────────────────────────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │   Router    │
                          └──────┬──────┘
                                 │
                              Internet
```

---

## 2. Technology Stack

### 2.1 CLI Package (@homehub/cli)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | TypeScript 5 | Type safety |
| Runtime | Node.js 20 | Execution |
| CLI Framework | Commander.js | Command parsing |
| Shell | execa | Process execution |
| HTTP | ofetch | API calls |
| Config | conf | Local storage |
| UI | chalk, ora | Terminal styling |
| Database | better-sqlite3 | Local persistence |

### 2.2 Dashboard Package (@homehub/dashboard)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React |
| UI | Tailwind CSS | Styling |
| Components | shadcn/ui | UI library |
| State | Zustand | Client state |
| Data | TanStack Query | Server state |
| Forms | React Hook Form + Zod | Validation |
| Charts | Recharts | Monitoring |
| Terminal | xterm.js | Web terminal |
| Editor | Monaco Editor | Config editing |

### 2.3 System Integration

| Component | Technology | Purpose |
|-----------|------------|---------|
| Docker | dockerode | Container management |
| Git | simple-git | Repository operations |
| Reverse Proxy | nginx | Traffic routing |
| SSL | certbot (Let's Encrypt) | Certificates |
| Process | PM2 | Daemon management |
| GeoIP | maxmind/geoip2 | Country detection |

---

## 3. Project Structure

```
homehub/
├── packages/
│   ├── cli/                      # 🆓 Free CLI
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/
│   │   │   └── homehub.ts        # Entry point
│   │   └── src/
│   │       ├── commands/
│   │       │   ├── init.ts
│   │       │   ├── doctor.ts
│   │       │   ├── runtime/
│   │       │   │   ├── install.ts
│   │       │   │   ├── list.ts
│   │       │   │   └── use.ts
│   │       │   ├── docker/
│   │       │   │   ├── ps.ts
│   │       │   │   ├── logs.ts
│   │       │   │   └── exec.ts
│   │       │   ├── deploy/
│   │       │   │   ├── init.ts
│   │       │   │   ├── run.ts
│   │       │   │   └── rollback.ts
│   │       │   ├── domain/
│   │       │   │   ├── add.ts
│   │       │   │   ├── ssl.ts
│   │       │   │   └── ddns.ts
│   │       │   ├── acl/
│   │       │   │   ├── allow.ts
│   │       │   │   ├── deny.ts
│   │       │   │   └── logs.ts
│   │       │   └── dashboard.ts
│   │       ├── lib/
│   │       │   ├── config.ts
│   │       │   ├── device.ts
│   │       │   ├── license.ts
│   │       │   ├── docker/
│   │       │   │   ├── client.ts
│   │       │   │   └── compose.ts
│   │       │   ├── runtime/
│   │       │   │   ├── manager.ts
│   │       │   │   ├── node.ts
│   │       │   │   ├── python.ts
│   │       │   │   └── java.ts
│   │       │   ├── deploy/
│   │       │   │   ├── detector.ts
│   │       │   │   ├── dockerfile.ts
│   │       │   │   └── builder.ts
│   │       │   ├── nginx/
│   │       │   │   ├── manager.ts
│   │       │   │   └── templates.ts
│   │       │   ├── ssl/
│   │       │   │   └── certbot.ts
│   │       │   ├── acl/
│   │       │   │   ├── manager.ts
│   │       │   │   └── geoip.ts
│   │       │   ├── database/
│   │       │   │   ├── index.ts
│   │       │   │   ├── schema.ts
│   │       │   │   └── migrations/
│   │       │   └── shell.ts
│   │       └── types/
│   │           └── index.ts
│   │
│   ├── dashboard/                # 💎 Pro Dashboard
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx
│   │       │   ├── (auth)/
│   │       │   │   └── activate/
│   │       │   ├── docker/
│   │       │   ├── deploy/
│   │       │   ├── domains/
│   │       │   ├── security/
│   │       │   ├── monitoring/
│   │       │   ├── settings/
│   │       │   └── api/
│   │       │       ├── system/
│   │       │       ├── docker/
│   │       │       ├── deploy/
│   │       │       ├── domain/
│   │       │       ├── acl/
│   │       │       └── license/
│   │       ├── components/
│   │       │   ├── ui/           # shadcn
│   │       │   ├── layout/
│   │       │   ├── docker/
│   │       │   ├── deploy/
│   │       │   └── security/
│   │       ├── lib/
│   │       ├── hooks/
│   │       └── stores/
│   │
│   └── shared/                   # Shared utilities
│       ├── package.json
│       └── src/
│           ├── types/
│           ├── constants/
│           └── utils/
│
├── scripts/
│   └── install.sh                # curl installer
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Database Schema

### 4.1 SQLite Tables

```sql
-- 시스템 설정
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 라이선스 정보
CREATE TABLE license (
    id INTEGER PRIMARY KEY,
    device_id TEXT UNIQUE NOT NULL,
    license_key TEXT,
    plan TEXT DEFAULT 'free',
    features TEXT,           -- JSON array
    issued_at DATETIME,
    expires_at DATETIME,
    last_check DATETIME,
    offline_token TEXT
);

-- 설치된 런타임
CREATE TABLE runtimes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,      -- node, python, java
    version TEXT NOT NULL,
    path TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, version)
);

-- 배포된 앱
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
    env_vars TEXT,           -- JSON (encrypted)
    container_id TEXT,
    status TEXT DEFAULT 'stopped',
    current_version TEXT,
    deployed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 배포 이력
CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    version TEXT NOT NULL,
    commit_hash TEXT,
    commit_message TEXT,
    status TEXT NOT NULL,    -- pending, building, running, failed
    started_at DATETIME,
    finished_at DATETIME,
    logs TEXT,
    error TEXT
);

-- 도메인
CREATE TABLE domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    app_id TEXT REFERENCES apps(id),
    ssl_enabled BOOLEAN DEFAULT FALSE,
    ssl_cert_path TEXT,
    ssl_expires_at DATETIME,
    ssl_auto_renew BOOLEAN DEFAULT TRUE,
    ddns_provider TEXT,
    ddns_config TEXT,        -- JSON (encrypted)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ACL 규칙
CREATE TABLE acl_rules (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,      -- allow, deny
    scope TEXT NOT NULL,     -- global, domain, path
    target TEXT,
    source_ip TEXT,
    source_cidr TEXT,
    source_country TEXT,
    user_agent TEXT,
    rate_limit_requests INTEGER,
    rate_limit_period TEXT,
    schedule_start TEXT,
    schedule_end TEXT,
    schedule_days TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 100,
    description TEXT,
    hit_count INTEGER DEFAULT 0,
    last_hit DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 접근 로그
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
    rule_id TEXT REFERENCES acl_rules(id),
    request_id TEXT
);

-- 인덱스
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp);
CREATE INDEX idx_access_logs_ip ON access_logs(source_ip);
CREATE INDEX idx_access_logs_blocked ON access_logs(blocked);
CREATE INDEX idx_deployments_app ON deployments(app_id);

-- 시스템 메트릭
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_usage REAL,
    memory_used INTEGER,
    memory_total INTEGER,
    disk_used INTEGER,
    disk_total INTEGER,
    network_in INTEGER,
    network_out INTEGER
);

CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
```

### 4.2 Data Directory Structure

```
~/.homehub/
├── homehub.db              # SQLite database
├── config.json             # User configuration
├── license.json            # License token (encrypted)
├── logs/
│   ├── homehub.log         # CLI logs
│   ├── access.log          # Access logs (symlink to nginx)
│   └── error.log           # Error logs
├── backups/
│   ├── db-2024-01-15.sql   # Database backups
│   └── config-2024-01-15/  # Config backups
├── nginx/
│   ├── sites-available/    # Site configs
│   └── sites-enabled/      # Enabled sites
├── ssl/
│   └── acme/               # Let's Encrypt data
└── secrets/
    └── .env.encrypted      # Encrypted secrets
```

---

## 5. Core Components

### 5.1 Docker Manager

```typescript
interface DockerManager {
  // Connection
  isRunning(): Promise<boolean>;
  getVersion(): Promise<string>;
  
  // Containers
  listContainers(options?: { all?: boolean }): Promise<Container[]>;
  getContainer(id: string): Promise<Container>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string): Promise<void>;
  removeContainer(id: string): Promise<void>;
  getLogs(id: string, options?: LogOptions): Promise<string>;
  exec(id: string, command: string[]): Promise<ExecResult>;
  getStats(id: string): Promise<ContainerStats>;
  
  // Images
  listImages(): Promise<Image[]>;
  pullImage(name: string, tag?: string): Promise<void>;
  buildImage(path: string, tag: string): Promise<void>;
  removeImage(id: string): Promise<void>;
  
  // Compose
  composeUp(path: string, options?: ComposeOptions): Promise<void>;
  composeDown(path: string): Promise<void>;
  composeLogs(path: string): Promise<string>;
}
```

### 5.2 Runtime Manager

```typescript
interface RuntimeManager {
  name: string;
  displayName: string;
  
  // Manager lifecycle
  isManagerInstalled(): Promise<boolean>;
  installManager(): Promise<void>;
  
  // Version management
  listInstalled(): Promise<RuntimeVersion[]>;
  listAvailable(): Promise<RuntimeVersion[]>;
  install(version: string): Promise<void>;
  uninstall(version: string): Promise<void>;
  
  // Active version
  getCurrent(): Promise<string | null>;
  setDefault(version: string): Promise<void>;
  use(version: string): Promise<void>;
  
  // Detection
  detectFromProject(dir: string): Promise<string | null>;
}

// Implementations
class NodeManager implements RuntimeManager { ... }
class PythonManager implements RuntimeManager { ... }
class JavaManager implements RuntimeManager { ... }
```

### 5.3 Deploy Manager

```typescript
interface DeployManager {
  // Detection
  detectProject(dir: string): Promise<ProjectInfo>;
  
  // Build
  generateDockerfile(info: ProjectInfo): string;
  buildImage(dir: string, tag: string): Promise<void>;
  
  // Deploy
  deploy(options: DeployOptions): Promise<Deployment>;
  rollback(appId: string, version?: string): Promise<Deployment>;
  
  // Management
  listApps(): Promise<App[]>;
  getApp(id: string): Promise<App>;
  startApp(id: string): Promise<void>;
  stopApp(id: string): Promise<void>;
  removeApp(id: string): Promise<void>;
  getLogs(id: string): Promise<string>;
  
  // History
  getDeployments(appId: string): Promise<Deployment[]>;
}
```

### 5.4 ACL Manager

```typescript
interface ACLManager {
  // Rules
  addRule(rule: ACLRuleInput): Promise<ACLRule>;
  removeRule(id: string): Promise<void>;
  toggleRule(id: string, enabled: boolean): Promise<void>;
  listRules(): Promise<ACLRule[]>;
  
  // Evaluation
  evaluateRequest(request: IncomingRequest): Promise<ACLResult>;
  
  // Rate limiting
  checkRateLimit(ip: string, rule: ACLRule): Promise<boolean>;
  
  // GeoIP
  getCountry(ip: string): Promise<string | null>;
  
  // Logging
  logAccess(entry: AccessLogEntry): Promise<void>;
  queryLogs(options: LogQueryOptions): Promise<AccessLogEntry[]>;
  getStats(options: StatsOptions): Promise<AccessStats>;
  
  // Nginx integration
  updateNginxACL(): Promise<void>;
}
```

### 5.5 SSL Manager

```typescript
interface SSLManager {
  // Certificate management
  issueCertificate(domain: string, options?: SSLOptions): Promise<void>;
  renewCertificate(domain: string): Promise<void>;
  revokeCertificate(domain: string): Promise<void>;
  
  // Status
  checkExpiry(domain: string): Promise<Date | null>;
  listCertificates(): Promise<SSLCertificate[]>;
  
  // Auto-renewal
  setupAutoRenewal(): Promise<void>;
  runRenewalCheck(): Promise<void>;
}
```

### 5.6 Nginx Manager

```typescript
interface NginxManager {
  // Site management
  addSite(config: NginxSiteConfig): Promise<void>;
  removeSite(domain: string): Promise<void>;
  listSites(): Promise<string[]>;
  
  // Configuration
  generateConfig(config: NginxSiteConfig): string;
  
  // Operations
  test(): Promise<boolean>;
  reload(): Promise<void>;
  restart(): Promise<void>;
}
```

---

## 6. Security Architecture

### 6.1 Data Encryption

```typescript
// Secrets encryption using system keychain or password
class SecretsManager {
  // Store encrypted
  async set(key: string, value: string): Promise<void>;
  
  // Retrieve and decrypt
  async get(key: string): Promise<string | null>;
  
  // Delete
  async delete(key: string): Promise<void>;
}

// Usage
await secrets.set('DATABASE_URL', 'postgres://...');
const dbUrl = await secrets.get('DATABASE_URL');
```

### 6.2 License Token

```typescript
// JWT structure
interface LicenseToken {
  sub: string;        // Device ID
  plan: string;       // free, pro, team
  features: string[]; // Enabled features
  iat: number;        // Issued at
  exp: number;        // Expires at
  
  // Signature using server private key
}

// Validation
function validateToken(token: string): LicenseInfo | null {
  // 1. Verify JWT signature (embedded public key)
  // 2. Check expiry
  // 3. Check device ID
  // 4. Return license info
}
```

### 6.3 Dashboard Authentication

```typescript
// Local-only access by default
// Pro: Optional password protection

interface DashboardAuth {
  // Password-based
  setPassword(password: string): Promise<void>;
  validatePassword(password: string): Promise<boolean>;
  
  // Session
  createSession(): string;
  validateSession(token: string): boolean;
  
  // 2FA (Pro)
  enable2FA(): Promise<{ secret: string; qrCode: string }>;
  verify2FA(code: string): boolean;
}
```

---

## 7. Error Handling

### 7.1 Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| HH001 | Docker not running | Start Docker daemon |
| HH002 | Port in use | Change port or stop service |
| HH003 | SSL issuance failed | Check DNS, port 80 accessible |
| HH004 | License invalid | Check key or contact support |
| HH005 | Rate limit exceeded | Wait or upgrade |
| HH006 | Build failed | Check logs, dependencies |
| HH007 | Git clone failed | Check URL, credentials |
| HH008 | Runtime not found | Install with `runtime install` |
| HH009 | Database error | Check disk space, permissions |
| HH010 | Network unreachable | Check internet connection |

### 7.2 Error Response Format

```typescript
interface HomeHubError {
  code: string;        // HH001
  message: string;     // Human-readable
  details?: string;    // Technical details
  recoverable: boolean;
  suggestion?: string; // How to fix
}
```

---

## 8. Environment Variables

```bash
# Data directory
HOMEHUB_DATA_DIR=~/.homehub

# Dashboard port
HOMEHUB_PORT=3000

# Logging
HOMEHUB_LOG_LEVEL=info  # debug, info, warn, error

# License server
HOMEHUB_LICENSE_SERVER=https://license.homehub.io

# Feature flags
HOMEHUB_ENABLE_TELEMETRY=true
HOMEHUB_ENABLE_AUTO_UPDATE=true

# Development
HOMEHUB_DEV_MODE=false
```
