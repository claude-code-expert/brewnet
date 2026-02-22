# HomeHub - API Specification

## 1. CLI Commands Reference

### 1.1 Global Commands

```bash
# Installation & Setup
homehub init                     # Initialize HomeHub
homehub doctor                   # System health check
homehub status                   # Current status
homehub upgrade                  # Upgrade CLI
homehub --version               # Show version
homehub --help                  # Show help

# License
homehub activate <LICENSE_KEY>   # Activate Pro license
homehub license status           # Show license info
homehub deactivate              # Deactivate license

# Dashboard (Pro)
homehub dashboard               # Start web dashboard
homehub dashboard --port 8080   # Custom port
```

### 1.2 Runtime Commands

```bash
# List & Status
homehub runtime list             # Available runtimes
homehub runtime status           # Installed versions
homehub runtime versions <type>  # Available versions

# Installation
homehub runtime install <type> <version>
homehub runtime install node 20
homehub runtime install python 3.12 --default

# Version Management
homehub runtime use <type> <version>
homehub runtime default <type> <version>
homehub runtime local <type> <version>  # Project-specific

# Removal
homehub runtime remove <type> <version>
homehub runtime remove node --all

# Detection
homehub runtime detect           # Detect from project
```

### 1.3 Docker Commands

```bash
# Containers
homehub docker ps               # List containers
homehub docker ps -a            # Include stopped
homehub docker start <id>       # Start container
homehub docker stop <id>        # Stop container
homehub docker restart <id>     # Restart container
homehub docker rm <id>          # Remove container
homehub docker logs <id>        # View logs
homehub docker logs <id> -f     # Follow logs
homehub docker exec <id> <cmd>  # Execute command
homehub docker stats            # Resource usage

# Images
homehub docker images           # List images
homehub docker pull <image>     # Pull image
homehub docker build -t <tag> . # Build image
homehub docker rmi <id>         # Remove image
homehub docker prune            # Remove unused

# Compose
homehub docker compose up       # Start stack
homehub docker compose up -d    # Detached
homehub docker compose down     # Stop stack
homehub docker compose ps       # Stack status
homehub docker compose logs     # Stack logs
```

### 1.4 Deploy Commands

```bash
# Initialization
homehub deploy init             # Create homehub.yml

# Deployment
homehub deploy                  # Deploy current directory
homehub deploy <git-url>        # Deploy from Git
homehub deploy --branch staging # Specific branch
homehub deploy --commit abc123  # Specific commit
homehub deploy --env production # Environment

# Management
homehub deploy list             # List deployed apps
homehub deploy status <app>     # App status
homehub deploy logs <app>       # App logs
homehub deploy logs <app> -f    # Follow logs
homehub deploy start <app>      # Start app
homehub deploy stop <app>       # Stop app
homehub deploy restart <app>    # Restart app

# Rollback (Pro)
homehub deploy history <app>    # Deployment history
homehub deploy rollback <app>   # Rollback to previous
homehub deploy rollback <app> --to v1.2.1

# Removal
homehub deploy remove <app>     # Remove deployment
```

### 1.5 Domain Commands

```bash
# Domain Management
homehub domain list             # List domains
homehub domain add <domain> --app <app>
homehub domain verify <domain>  # Check DNS
homehub domain remove <domain>  # Remove domain

# DDNS
homehub domain ddns providers   # List providers
homehub domain ddns setup <provider>
homehub domain ddns status      # DDNS status
homehub domain ddns update      # Force update

# SSL
homehub domain ssl status       # Certificate status
homehub domain ssl issue <domain>
homehub domain ssl issue "*.domain" --dns cloudflare
homehub domain ssl renew        # Renew all
homehub domain ssl renew --force <domain>
```

### 1.6 ACL Commands

```bash
# IP Rules
homehub acl allow ip <ip>       # Whitelist IP
homehub acl deny ip <ip>        # Blacklist IP
homehub acl allow ip <ip> --domain <domain>
homehub acl deny ip <ip> --path "/admin/*"

# Country Rules (Pro)
homehub acl deny country CN,RU,KP
homehub acl allow country US,KR,JP

# Rate Limiting (Pro)
homehub acl ratelimit 100/minute --global
homehub acl ratelimit 10/second --path "/api/login"

# Rule Management
homehub acl list                # List all rules
homehub acl enable <rule-id>    # Enable rule
homehub acl disable <rule-id>   # Disable rule
homehub acl remove <rule-id>    # Remove rule

# Logs (Pro)
homehub acl logs                # View access logs
homehub acl logs --blocked      # Blocked only
homehub acl logs --ip <ip>      # Filter by IP
homehub acl logs --country <code>
homehub acl logs --since 1h     # Time filter
homehub acl stats               # Statistics

# Export
homehub acl logs export --format csv > logs.csv
```

### 1.7 Firewall Commands

```bash
homehub firewall status         # Firewall status
homehub firewall allow <port>   # Open port
homehub firewall deny <port>    # Block port
homehub firewall check <port>   # Check port status
```

---

## 2. Dashboard API Routes

### 2.1 System APIs

```typescript
// System Information
GET /api/system/info
Response: {
  os: string;
  arch: string;
  hostname: string;
  uptime: number;
  homeHubVersion: string;
}

// Real-time Stats
GET /api/system/stats
Response: {
  cpu: { usage: number; cores: number; load: number[] };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { bytesIn: number; bytesOut: number };
}

// Health Check
GET /api/system/health
Response: {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    docker: boolean;
    database: boolean;
    nginx: boolean;
  };
}
```

### 2.2 License APIs

```typescript
// Activate License
POST /api/license/activate
Body: { licenseKey: string }
Response: {
  valid: boolean;
  plan: string;
  features: string[];
  expiresAt: string;
}

// License Status
GET /api/license/status
Response: {
  activated: boolean;
  plan: string;
  features: string[];
  expiresAt: string | null;
  deviceId: string;
}

// Refresh Token
POST /api/license/refresh
Response: {
  valid: boolean;
  token: string;
}
```

### 2.3 Docker APIs

```typescript
// List Containers
GET /api/docker/containers?all=true
Response: Container[]

// Container Details
GET /api/docker/containers/:id
Response: ContainerDetail

// Container Actions
POST /api/docker/containers/:id/start
POST /api/docker/containers/:id/stop
POST /api/docker/containers/:id/restart
DELETE /api/docker/containers/:id

// Container Logs
GET /api/docker/containers/:id/logs?tail=100&follow=false
Response: { logs: string } | Stream

// Container Stats
GET /api/docker/containers/:id/stats
Response: { cpu: number; memory: number; network: {...} }

// List Images
GET /api/docker/images
Response: Image[]

// Pull Image
POST /api/docker/images/pull
Body: { image: string; tag?: string }

// Remove Image
DELETE /api/docker/images/:id
```

### 2.4 Deploy APIs

```typescript
// List Apps
GET /api/apps
Response: App[]

// Create/Deploy App
POST /api/apps
Body: {
  name: string;
  source: { type: 'git' | 'local'; url?: string; path?: string };
  branch?: string;
  env?: Record<string, string>;
}

// App Details
GET /api/apps/:id
Response: AppDetail

// Update App
PUT /api/apps/:id
Body: Partial<AppConfig>

// Delete App
DELETE /api/apps/:id

// Deploy App
POST /api/apps/:id/deploy
Body: { branch?: string; commit?: string }

// Rollback App
POST /api/apps/:id/rollback
Body: { version?: string }

// App Logs
GET /api/apps/:id/logs?tail=100&follow=false
Response: { logs: string } | Stream

// Deployment History
GET /api/apps/:id/deployments
Response: Deployment[]
```

### 2.5 Domain APIs

```typescript
// List Domains
GET /api/domains
Response: Domain[]

// Add Domain
POST /api/domains
Body: { domain: string; appId?: string }

// Domain Details
GET /api/domains/:id
Response: DomainDetail

// Delete Domain
DELETE /api/domains/:id

// Verify DNS
POST /api/domains/:id/verify
Response: { valid: boolean; records: DNSRecord[] }

// Issue SSL
POST /api/domains/:id/ssl
Body: { provider?: 'letsencrypt'; challenge?: 'http' | 'dns' }

// DDNS Status
GET /api/domains/ddns
Response: { provider: string; domain: string; ip: string; lastUpdate: string }

// Update DDNS
POST /api/domains/ddns/update
Response: { success: boolean; ip: string }
```

### 2.6 ACL APIs

```typescript
// List Rules
GET /api/acl/rules
Response: ACLRule[]

// Create Rule
POST /api/acl/rules
Body: {
  type: 'allow' | 'deny';
  scope: 'global' | 'domain' | 'path';
  target?: string;
  conditions: {
    ip?: string;
    country?: string[];
    userAgent?: string;
  };
  rateLimit?: { requests: number; period: string };
  description?: string;
}

// Update Rule
PUT /api/acl/rules/:id
Body: Partial<ACLRule>

// Delete Rule
DELETE /api/acl/rules/:id

// Toggle Rule
PATCH /api/acl/rules/:id
Body: { enabled: boolean }

// Access Logs
GET /api/acl/logs?blocked=true&ip=x&limit=100
Response: AccessLogEntry[]

// Access Stats
GET /api/acl/stats?period=24h
Response: {
  totalRequests: number;
  blockedRequests: number;
  topBlockedIPs: { ip: string; count: number }[];
  topBlockedCountries: { country: string; count: number }[];
  statusCodes: Record<number, number>;
}
```

### 2.7 Monitoring APIs

```typescript
// Metrics History
GET /api/monitoring/metrics?period=1h
Response: {
  timestamps: string[];
  cpu: number[];
  memory: number[];
  disk: number[];
  network: { in: number[]; out: number[] };
}

// Service Health
GET /api/monitoring/services
Response: {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number;
  lastCheck: string;
}[]

// Alerts
GET /api/monitoring/alerts
Response: Alert[]

// Alert Config
PUT /api/monitoring/alerts/config
Body: {
  cpu: { threshold: number; enabled: boolean };
  memory: { threshold: number; enabled: boolean };
  disk: { threshold: number; enabled: boolean };
  // ...
}
```

---

## 3. WebSocket APIs

### 3.1 Real-time Logs

```typescript
// Container Logs
WS /api/ws/docker/containers/:id/logs
Message: { type: 'log'; data: string; timestamp: string }

// App Logs
WS /api/ws/apps/:id/logs
Message: { type: 'log'; data: string; timestamp: string }

// Access Logs
WS /api/ws/acl/logs
Message: { type: 'access'; entry: AccessLogEntry }
```

### 3.2 Real-time Stats

```typescript
// System Stats
WS /api/ws/system/stats
Message: {
  type: 'stats';
  data: {
    cpu: number;
    memory: number;
    network: { in: number; out: number };
  };
  timestamp: string;
}

// Container Stats
WS /api/ws/docker/containers/:id/stats
Message: {
  type: 'stats';
  data: { cpu: number; memory: number };
  timestamp: string;
}
```

### 3.3 Deployment Progress

```typescript
// Deployment Status
WS /api/ws/apps/:id/deploy
Message: {
  type: 'progress' | 'log' | 'complete' | 'error';
  step?: string;
  progress?: number;
  message?: string;
  error?: string;
}
```

---

## 4. Data Types

### 4.1 Container

```typescript
interface Container {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'exited' | 'paused' | 'created';
  state: string;
  created: string;
  ports: { host: number; container: number; protocol: string }[];
  labels: Record<string, string>;
}

interface ContainerDetail extends Container {
  config: {
    env: string[];
    cmd: string[];
    workingDir: string;
    entrypoint: string[];
  };
  hostConfig: {
    memory: number;
    cpuShares: number;
    restartPolicy: string;
  };
  networkSettings: {
    networks: Record<string, { ipAddress: string }>;
  };
  mounts: { source: string; destination: string; mode: string }[];
}
```

### 4.2 App

```typescript
interface App {
  id: string;
  name: string;
  runtime: string;
  framework?: string;
  status: 'running' | 'stopped' | 'building' | 'failed';
  version?: string;
  port?: number;
  domains: string[];
  deployedAt?: string;
  createdAt: string;
}

interface AppDetail extends App {
  repoUrl?: string;
  repoBranch?: string;
  buildCommand?: string;
  startCommand?: string;
  envVars: Record<string, string>;
  containerId?: string;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}
```

### 4.3 Domain

```typescript
interface Domain {
  id: string;
  domain: string;
  appId?: string;
  appName?: string;
  sslEnabled: boolean;
  sslExpiresAt?: string;
  status: 'active' | 'pending' | 'error';
  createdAt: string;
}

interface DomainDetail extends Domain {
  sslCertPath?: string;
  sslAutoRenew: boolean;
  ddnsProvider?: string;
  ddnsConfig?: {
    subdomain: string;
    lastUpdate: string;
  };
  nginxConfig?: string;
}
```

### 4.4 ACL

```typescript
interface ACLRule {
  id: string;
  type: 'allow' | 'deny';
  scope: 'global' | 'domain' | 'path';
  target?: string;
  conditions: {
    ip?: string;
    cidr?: string;
    country?: string[];
    userAgent?: string;
  };
  rateLimit?: {
    requests: number;
    period: 'second' | 'minute' | 'hour';
    burst?: number;
  };
  enabled: boolean;
  priority: number;
  description?: string;
  hitCount: number;
  lastHit?: string;
  createdAt: string;
}

interface AccessLogEntry {
  id: string;
  timestamp: string;
  sourceIP: string;
  country?: string;
  method: string;
  path: string;
  domain: string;
  userAgent: string;
  statusCode: number;
  responseTime: number;
  blocked: boolean;
  blockReason?: string;
}
```

### 4.5 Deployment

```typescript
interface Deployment {
  id: string;
  appId: string;
  version: string;
  commitHash?: string;
  commitMessage?: string;
  status: 'pending' | 'building' | 'deploying' | 'running' | 'failed' | 'rolled_back';
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  error?: string;
}
```

---

## 5. Error Responses

### 5.1 Format

```typescript
interface ErrorResponse {
  error: {
    code: string;       // HH001
    message: string;    // Human-readable message
    details?: string;   // Technical details
    suggestion?: string; // How to fix
  };
}
```

### 5.2 HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (Delete) |
| 400 | Bad Request |
| 401 | Unauthorized (License) |
| 403 | Forbidden (Feature not in plan) |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Internal Error |
| 503 | Service Unavailable |

### 5.3 Error Codes

| Code | Status | Message |
|------|--------|---------|
| HH001 | 503 | Docker daemon not running |
| HH002 | 409 | Port already in use |
| HH003 | 500 | SSL issuance failed |
| HH004 | 401 | Invalid license key |
| HH005 | 429 | Rate limit exceeded |
| HH006 | 500 | Build failed |
| HH007 | 400 | Invalid Git repository |
| HH008 | 404 | Resource not found |
| HH009 | 500 | Database error |
| HH010 | 403 | Feature requires Pro plan |
