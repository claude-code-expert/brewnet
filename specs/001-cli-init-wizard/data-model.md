# Data Model: CLI Init Wizard

**Feature**: 001-cli-init-wizard
**Date**: 2026-02-23
**Source**: spec.md, WORKFLOW.md v2.2, IMPLEMENT_SPEC.md v2.2

---

## Entity Overview

```
WizardState (central)
├── AdminConfig
├── ServerComponents
│   ├── WebServerConfig
│   ├── FileServerConfig
│   ├── GitServerConfig
│   ├── DbServerConfig
│   ├── MediaConfig
│   ├── SshServerConfig
│   ├── MailServerConfig
│   ├── AppServerConfig
│   └── FileBrowserConfig
├── DevStackConfig
├── BoilerplateConfig
└── DomainConfig
    └── CloudflareConfig

ServiceDefinition (registry)
GeneratedConfig (output)
BackupRecord (persistence)
BrewnetError (error handling)
LogEntry (logging)

--- New (2026-02-25) ---
DockerInstallResult (docker-installer.ts)
AdminServerConfig (admin-server.ts)
ServiceStatus (admin API response)
```

---

## WizardState

The central state object persisted across wizard steps. Schema version 5.

```typescript
interface WizardState {
  schemaVersion: 5;
  projectName: string;          // e.g., "my-homeserver"
  projectPath: string;          // e.g., "~/brewnet/my-homeserver"
  setupType: 'full' | 'partial';
  admin: AdminConfig;
  servers: ServerComponents;
  devStack: DevStackConfig;
  boilerplate: BoilerplateConfig;
  domain: DomainConfig;
}
```

### AdminConfig

```typescript
interface AdminConfig {
  username: string;             // default: "admin"
  password: string;             // auto-generated 20 chars
  storage: 'local';            // stored in .env (chmod 600)
}
```

Password generation rules:
- Length: 20 characters (admin), 16 characters (service-specific)
- Charset: a-n, p-z (exclude o), A-H, J-N, P-Z (exclude I, O), 2-9 (exclude 0, 1)
- Purpose: confusion-free (no 0/O, 1/l/I ambiguity)

### ServerComponents

```typescript
interface ServerComponents {
  webServer: WebServerConfig;
  fileServer: FileServerConfig;
  gitServer: GitServerConfig;
  dbServer: DbServerConfig;
  media: MediaConfig;
  sshServer: SshServerConfig;
  mailServer: MailServerConfig;
  appServer: AppServerConfig;
  fileBrowser: FileBrowserConfig;
}
```

#### WebServerConfig (Required — always ON)

```typescript
interface WebServerConfig {
  enabled: true;                        // always true, cannot disable
  service: 'traefik' | 'nginx' | 'caddy';  // default: 'traefik'
}
```

#### FileServerConfig

```typescript
interface FileServerConfig {
  enabled: boolean;                     // default: false
  service: 'nextcloud' | 'minio' | ''; // default: ''
}
```

#### GitServerConfig (Required — always ON)

```typescript
interface GitServerConfig {
  enabled: true;                        // always true, cannot disable
  service: 'gitea';                     // fixed
  port: number;                         // default: 3000 (web UI)
  sshPort: number;                      // default: 3022 (Git SSH)
}
```

#### DbServerConfig

```typescript
interface DbServerConfig {
  enabled: boolean;                     // Full→true, Partial→false
  primary: 'postgresql' | 'mysql' | 'sqlite' | '';
  primaryVersion: string;               // e.g., "17", "8.4", "3"
  dbName: string;                       // default: "brewnet_db"
  dbUser: string;                       // default: "brewnet"
  dbPassword: string;                   // auto-generated 16 chars
  adminUI: boolean;                     // default: true (pgAdmin, disabled for sqlite)
  cache: 'redis' | 'valkey' | 'keydb' | '';
}
```

#### MediaConfig

```typescript
interface MediaConfig {
  enabled: boolean;                     // default: false
  services: string[];                   // ['jellyfin']
}
```

#### SshServerConfig

```typescript
interface SshServerConfig {
  enabled: boolean;                     // default: false
  port: number;                         // default: 2222
  passwordAuth: boolean;                // default: false (key-only)
  sftp: boolean;                        // default: false, auto-suggested when File/Media enabled
}
```

#### MailServerConfig

```typescript
interface MailServerConfig {
  enabled: boolean;                     // default: false
  service: 'docker-mailserver';         // fixed
}
```

Visibility rule: only shown when `domain.provider !== 'local'`

#### AppServerConfig

```typescript
interface AppServerConfig {
  enabled: boolean;                     // auto-set from devStack
}
```

Auto-enable rule: `devStack.languages.length > 0 || devStack.frontend.length > 0`

#### FileBrowserConfig

```typescript
interface FileBrowserConfig {
  enabled: boolean;                     // default: false
  mode: 'directory' | 'standalone' | ''; // default: ''
}
```

### DevStackConfig

```typescript
interface DevStackConfig {
  languages: Language[];                // multi-select: python, nodejs, java, php, dotnet, rust, go
  frameworks: Record<Language, string>; // per-language: { nodejs: 'nextjs', python: 'fastapi' }
  frontend: FrontendTech[];             // multi-select: vuejs, reactjs, typescript, javascript
}

type Language = 'python' | 'nodejs' | 'java' | 'php' | 'dotnet' | 'rust' | 'go';
type FrontendTech = 'vuejs' | 'reactjs' | 'typescript' | 'javascript';
```

### BoilerplateConfig

```typescript
interface BoilerplateConfig {
  generate: boolean;                    // default: true
  sampleData: boolean;                  // default: true
  devMode: 'hot-reload' | 'production'; // default: 'hot-reload'
}
```

### DomainConfig

```typescript
interface DomainConfig {
  provider: 'local' | 'tunnel';
  name: string;                         // e.g., "myserver.example.com"
  ssl: 'self-signed' | 'letsencrypt' | 'cloudflare';
  cloudflare: CloudflareConfig;
}

interface CloudflareConfig {
  enabled: boolean;                     // default: true for tunnel
  tunnelToken: string;                  // eyJ... format
  tunnelName: string;
}
```

---

## ServiceDefinition (Registry)

Static registry of all supported Docker services.

```typescript
interface ServiceDefinition {
  id: string;                           // e.g., "traefik", "postgresql"
  name: string;                         // display name
  image: string;                        // Docker image with tag
  ports: number[];                      // exposed ports
  subdomain: string;                    // e.g., "traefik", "git", "cloud"
  ramMB: number;                        // estimated RAM usage
  diskGB: number;                       // estimated disk usage
  networks: ('brewnet' | 'brewnet-internal')[];
  healthCheck?: {
    endpoint: string;                   // e.g., "/api/health"
    interval: number;                   // seconds
    timeout: number;                    // seconds
    retries: number;
  };
  requiredEnvVars: string[];            // env vars this service needs
  traefikLabels?: Record<string, string>; // Traefik routing labels
}
```

### Service Registry (17 entries)

| ID | Image | Ports | Subdomain | RAM (MB) |
|----|-------|-------|-----------|----------|
| traefik | `traefik:v3.0` | 80, 443, 8080 | traefik | 64 |
| nginx | `nginx:1.25-alpine` | 80, 443 | — | 32 |
| caddy | `caddy:2-alpine` | 80, 443 | — | 32 |
| gitea | `gitea/gitea:latest` | 3000, 3022 | git | 256 |
| filebrowser | `filebrowser/filebrowser:latest` | 80 | files | 50 |
| nextcloud | `nextcloud:29-apache` | 443 | cloud | 256 |
| minio | `minio/minio:latest` | 9000 | minio | 128 |
| jellyfin | `jellyfin/jellyfin:latest` | 8096 | jellyfin | 256 |
| postgresql | `postgres:17-alpine` | 5432 | — | 120 |
| mysql | `mysql:8.4` | 3306 | — | 256 |
| redis | `redis:7-alpine` | 6379 | — | 12 |
| valkey | `valkey/valkey:7-alpine` | 6379 | — | 12 |
| keydb | `eqalpha/keydb:latest` | 6379 | — | 16 |
| pgadmin | `dpage/pgadmin4:latest` | 5050 | pgadmin | 128 |
| openssh-server | `linuxserver/openssh-server:latest` | 2222 | — | 16 |
| docker-mailserver | `ghcr.io/docker-mailserver/docker-mailserver:latest` | 25, 587, 993 | mail | 256 |
| cloudflared | `cloudflare/cloudflared:latest` | — | — | 32 |

---

## GeneratedConfig (Output)

```typescript
interface GeneratedConfig {
  projectPath: string;
  files: GeneratedFile[];
}

interface GeneratedFile {
  path: string;                         // relative to projectPath
  content: string;                      // file content
  permissions?: number;                 // e.g., 0o600 for .env
}
```

Key generated files:
- `docker-compose.yml` — main compose with all service definitions
- `docker-compose.dev.yml` — dev overrides (hot-reload volumes)
- `.env` — secret env vars (chmod 600)
- `.env.example` — template with masked values
- `infrastructure/<service>/` — per-service config files
- `apps/<framework>-app/` — boilerplate scaffold

---

## BackupRecord

```typescript
interface BackupRecord {
  id: string;                           // timestamp-based: "backup-2026-02-23-143052"
  path: string;                         // ~/.brewnet/backups/<id>.tar.gz
  size: number;                         // bytes
  services: string[];                   // service IDs included
  createdAt: Date;
  projectName: string;
  projectPath: string;
}
```

Stored in SQLite `backups` table.

---

## BrewnetError

```typescript
class BrewnetError extends Error {
  code: ErrorCode;
  httpStatus: number;
  remediation: string;
}

enum ErrorCode {
  BN001 = 'BN001', // Docker daemon not running (503)
  BN002 = 'BN002', // Port already in use (409)
  BN003 = 'BN003', // SSL issuance failed (500)
  BN004 = 'BN004', // Invalid license key (401)
  BN005 = 'BN005', // Rate limit exceeded (429)
  BN006 = 'BN006', // Build failed (500)
  BN007 = 'BN007', // Invalid Git repository (400)
  BN008 = 'BN008', // Resource not found (404)
  BN009 = 'BN009', // Database error (500)
  BN010 = 'BN010', // Feature requires Pro plan (403)
}
```

---

## LogEntry

```typescript
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  command: string;                      // e.g., "init", "add jellyfin"
  message: string;
  metadata?: Record<string, unknown>;   // additional context
}
```

Stored in `~/.brewnet/logs/` as structured JSON files (one per day).

---

## Utility Functions

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `generatePassword(len)` | number (default 16, admin 20) | string | Confusion-free password generation |
| `countSelectedServices(state)` | WizardState | number | Total container count |
| `estimateResources(state)` | WizardState | `{containers, ramMB, ramGB, diskGB}` | Resource prediction |
| `collectAllServices(state)` | WizardState | string[] | Service IDs for compose generation |
| `getCredentialTargets(state)` | WizardState | string[] | Services receiving admin credentials |
| `getImageName(serviceId)` | string | string | Service → Docker image mapping |
| `validateProjectName(name)` | string | `{valid: boolean, error?: string}` | Project name validation |

---

## Database Schema (SQLite)

```sql
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  status TEXT DEFAULT 'stopped',
  port INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  services TEXT NOT NULL,  -- JSON array
  project_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  level TEXT NOT NULL,
  command TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT  -- JSON object
);
```
