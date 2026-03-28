
## Project Structure (Monorepo with pnpm)

```
brewnet/
├── CLAUDE.md
├── README.md
├── LICENSE                    # Apache 2.0
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

--- 

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
| Domain & Network | Local / Custom + Cloudflare Tunnel (default ON) |

--- 