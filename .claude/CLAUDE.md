# CLAUDE.md - Brewnet Project Context

## Project Overview

**Brewnet** — "Your Home Server, Brewed Fresh"

A self-hosted home server management platform that provides an interactive CLI tool and Web Dashboard (Pro) for setting up and managing personal servers with Docker-based services.

- **License**: MIT
- **Licensor**: Brewnet (codevillain)
- **Target Platforms**: macOS (darwin), Linux (Ubuntu/Debian, CentOS/RHEL)


## Investigation Rules

- When the same problem recurs and resolution is requested again, always perform a thorough source-level deep dive before responding.
- Never claim to have confirmed a fix without actually reading the relevant source code.

## Session Continuity

- After /compact completes and a new session context begins, always re-read CLAUDE.md to re-establish project context before proceeding.


## Tech Stack

### CLI (packages/cli)
- TypeScript 5, Node.js 20+
- Commander.js (CLI framework)
- @inquirer/prompts (interactive prompts)
- execa (process execution)
- chalk / ora (terminal styling)
- better-sqlite3 (local DB)
- dockerode (Docker API)
- simple-git (Git operations)

### Dashboard (packages/dashboard) — Pro Feature
- Next.js 14 (App Router)
- Tailwind CSS + shadcn/ui
- Zustand (state management)
- TanStack Query (data fetching)
- React Hook Form + Zod (forms/validation)
- Recharts (charts)
- xterm.js (web terminal)
- Monaco Editor (code editor)

### Shared (packages/shared)
- Common TypeScript types and utilities
- Shared validation schemas (Zod)

### System Integration (external, not npm)
- Docker / Docker Compose
- Nginx (reverse proxy, auto-configured)
- Traefik (service routing, alternative to Nginx)
- Certbot / Let's Encrypt (SSL)
- SQLite (local database via better-sqlite3)
- Gitea (Git server, Docker container, SSH port 2222)

## Project Structure (Monorepo with pnpm)

```
brewnet/
├── CLAUDE.md
├── README.md
├── LICENSE                    # MIT
├── package.json               # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.json              # Root TypeScript config
├── spec/                      # Specification documents
│
├── packages/
│   ├── cli/                   # CLI application
│   │   ├── src/
│   │   │   ├── index.ts       # Entry point
│   │   │   ├── commands/      # CLI commands (Commander.js)
│   │   │   │   ├── init.ts
│   │   │   │   ├── add.ts
│   │   │   │   ├── remove.ts
│   │   │   │   ├── up.ts / down.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── logs.ts
│   │   │   │   ├── deploy.ts
│   │   │   │   ├── domain.ts
│   │   │   │   ├── ssh/
│   │   │   │   └── storage/
│   │   │   ├── services/      # Core service modules
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
│   │   │   ├── boilerplate/   # App scaffolding templates
│   │   │   ├── utils/
│   │   │   └── config/
│   │   ├── templates/         # Boilerplate templates
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dashboard/             # Web Dashboard (Pro)
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── stores/        # Zustand stores
│   │   │   ├── lib/
│   │   │   └── types/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                # Shared types and utilities
│       ├── src/
│       │   ├── types/
│       │   ├── schemas/       # Zod schemas
│       │   └── utils/
│       ├── package.json
│       └── tsconfig.json
│
├── docker/                    # Docker-related configs
│   └── docker-compose.yml
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## CLI Commands

```bash
brewnet init                   # Interactive setup wizard (7-step flow)
brewnet add <service>          # Add a service (e.g., jellyfin, nextcloud)
brewnet remove <service>       # Remove a service
brewnet up                     # Start all services (docker-compose up)
brewnet down                   # Stop all services
brewnet status                 # Show service status
brewnet logs [service]         # View logs
brewnet update                 # Update services
brewnet backup                 # Create backup
brewnet restore <backup-id>    # Restore from backup
brewnet export                 # Export configuration
brewnet deploy <path>          # Deploy an application
brewnet domain add <domain>    # Add custom domain
brewnet domain ssl <domain>    # Configure SSL
brewnet domain tunnel setup    # Configure Cloudflare Tunnel
brewnet domain tunnel status   # Check tunnel status
brewnet domain tunnel expose   # Add public hostname
brewnet ssh enable             # Enable SSH server
brewnet ssh add-user <name>    # Add SSH user
brewnet storage init           # Initialize file storage
brewnet create-app <name>      # Scaffold a new app project
```

## Core Modules

1. **Docker Manager** — Container lifecycle, docker-compose generation, health checks
2. **Runtime Manager** — Language runtime support (Node.js, Python, Java, Go, Ruby, Rust)
3. **Deploy Manager** — Git-based deployment pipeline, rollback support
4. **SSL Manager** — Let's Encrypt / Certbot auto-configuration
5. **Nginx Manager** — Reverse proxy auto-configuration, virtual hosts
6. **ACL Manager** — Access control, user permissions, firewall rules
7. **Git Server** — Gitea integration, repository management
8. **File Manager** — Nextcloud, MinIO (S3), SFTP, Jellyfin streaming
9. **Database Manager** — PostgreSQL, MySQL, MariaDB, Redis management
10. **SSH Manager** — OpenSSH setup, key-based auth, user management
11. **SSO Auth** — Single sign-on authentication system

## Server Components

| Component | Options |
|-----------|---------|
| Admin Account (required) | Username/password, stored in .env (chmod 600), propagated to all services |
| Web Server (required) | Traefik (default), Nginx, Caddy |
| File Server | Nextcloud, MinIO |
| App Server | Custom app (Docker container) |
| Database | PostgreSQL, MySQL, MariaDB, SQLite + Cache: Redis, Valkey, KeyDB |
| Media (optional) | Jellyfin |
| SSH Server | OpenSSH (port 2222), key-based auth, SFTP subsystem (auto-suggested if File/Media enabled) |
| Mail Server | docker-mailserver (SMTP/IMAP), requires domain (shown in Step 4) |
| Domain & Network | Local / Custom + Cloudflare Tunnel (default ON) |

## Installation Flow (7-step wizard)

```
Step 0: System check (OS, Docker, ports, disk)
Step 1: Project setup (name, path, Full Install / Partial Install)
Step 2: Admin account + Server components (Web/File/App/DB/Media/SSH toggle cards)
Step 3: Runtime & Boilerplate (language, framework, scaffolding) — conditional: appServer only
Step 4: Domain & Network (provider: Local/Custom with Cloudflare Tunnel, SSL, Mail Server)
Step 5: Review & Confirm (includes credential propagation summary)
Step 6: Docker Compose generation, service startup, credential propagation, external access verification
Step 7: Complete (endpoints, credentials summary, tunnel status, external access verification commands)
```

## Database Schema (SQLite)

Key tables: `services`, `deployments`, `domains`, `users`, `acl_rules`, `backups`, `logs`

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| BN001 | 503 | Docker daemon not running |
| BN002 | 409 | Port already in use |
| BN003 | 500 | SSL issuance failed |
| BN004 | 401 | Invalid license key |
| BN005 | 429 | Rate limit exceeded |
| BN006 | 500 | Build failed |
| BN007 | 400 | Invalid Git repository |
| BN008 | 404 | Resource not found |
| BN009 | 500 | Database error |
| BN010 | 403 | Feature requires Pro plan |

## Data Directory

```
~/.brewnet/
├── config.json           # Global configuration
├── docker-compose.yml    # Generated compose file
├── services/             # Service-specific configs
├── ssh/                  # SSH keys and user data
├── storage/              # File storage data
├── backups/              # Backup data
├── logs/                 # Application logs
└── db/                   # SQLite database
```

## Development Conventions

- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm (monorepo workspaces)
- **Formatting**: Prettier
- **Linting**: ESLint
- **Testing**: Jest (unit/integration), Playwright (E2E)
- **Coverage Target**: 80%+ overall, 90%+ for CLI core
- **Build**: tsc for CLI, next build for dashboard
- **Node.js Version**: 20+

## Key Design Principles

1. **Zero Config** — Works out of the box with sensible defaults
2. **Secure by Default** — SSH key-only auth, no root login, firewall auto-config
3. **Transparent** — All operations logged, user can inspect/modify generated configs
4. **Reversible** — Every action can be undone (rollback, restore)
5. **Offline First** — Core CLI works without internet (except Docker pulls)

## Development Phases

| Phase | Focus | Duration |
|-------|-------|----------|
| 1 (MVP) | CLI foundation, Docker management, basic services | 2 weeks |
| 2 | Networking (domain, SSL, Nginx, Traefik) | 2 weeks |
| 3 | Security (SSH, ACL, firewall, SSO) | 2 weeks |
| 4 | Dashboard (Pro), monitoring, file/DB management | 2 weeks |
| 5 | Polish, testing, documentation, performance | 2 weeks |

## Config File Format

Projects deployed via Brewnet use `brewnet.yml`:

```yaml
name: my-app
type: nodejs
version: "20"
build:
  command: npm run build
  output: dist
start:
  command: npm start
  port: 3000
env:
  NODE_ENV: production
domain: myapp.example.com
ssl: true
```

## Spec Documents Reference

All detailed specifications are in the `spec/` directory:
- `SPEC.md` — Complete technical specification (v2.0)
- `PRD.md` — Product Requirements Document
- `PRD_FEATURES.md` — Feature specifications
- `PRD_TECHNICAL.md` — Technical architecture
- `PRD_API.md` — API specification (CLI + Dashboard REST/WebSocket)
- `PRD_VALIDATION.md` — Validation & gap analysis, revised MVP phases
- `brewnet-project-spec.md` — CLI wizard & docker-compose generation spec
- `IMPLEMENTATION_CHECKLIST.md` — UX improvement tasks
- `BREWNET_UX_SUMMARY.md` — UX summary & execution plan
- `UX_IMPROVEMENTS.md` — 13 UX improvement items
- `FINAL-SUMMARY.md` — Summary of 4 critical gaps found
- `brewnet_user_workflow_simulation.md` — 8-step user workflow simulation
- `ssh-complete-guide.md` — SSH server implementation guide
- `file-server-complete-guide.md` — File server (Nextcloud/MinIO/Jellyfin/SFTP) guide
- `boilerplate-complete-guide.md` — App scaffolding/template generation guide
- `testing-complete-guide.md` — Testing strategy & CI/CD pipeline guide

## Language Policy

- Internal reasoning and planning: English
- Code and technical artifacts: English (variable names, comments, logs, error messages)
- Git commits: English, follow Conventional Commits (e.g., feat:, fix:, refactor:)
- User-facing responses: Korean (한국어)
  - Task summaries, explanations, and clarifying questions in Korean
  - When reporting errors or issues, describe the problem in Korean but keep the original error message in English

## Response Format

When completing a task, always end with a Korean summary:
- 무엇을 변경했는지
- 왜 그렇게 했는지
- 주의할 점이 있는지