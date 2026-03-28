
## Database Location

Project-level SQLite at `<projectPath>/.brewnet.db` (e.g. `~/brewnet/my-homeserver/.brewnet.db`).

- Initialized by `db-manager.ts` → `initDatabase()`
- CRUD via `project-db.ts`
- WAL mode + foreign keys enabled
- File permissions: `0o600` (contains admin password and CF tokens)

## Tables

### `apps`
Deployed application registry.

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT PK | App name (unique) |
| `mode` | TEXT | `'git'` \| `'docker'` \| `'upload'` |
| `stack_id` | TEXT | Boilerplate stack ID (nullable) |
| `source_url` | TEXT | Git repo URL (nullable) |
| `app_dir` | TEXT | Absolute path to app directory |
| `lang` | TEXT | Runtime language (nullable) |
| `framework` | TEXT | Framework name (nullable) |
| `port` | INTEGER | Host port the app listens on |
| `gitea_repo_url` | TEXT | Gitea repo URL (nullable) |
| `status` | TEXT | `'creating'` \| `'running'` \| `'stopped'` \| `'error'` |
| `deploy_settings` | TEXT | JSON blob (reserved, nullable) |
| `created_at` | TEXT | ISO 8601 datetime |

### `domain_connections`
Custom domain mappings for deployed apps (Cloudflare Named Tunnel).

| Column | Type | Description |
|--------|------|-------------|
| `app_name` | TEXT PK → `apps.name` | FK with CASCADE DELETE |
| `subdomain` | TEXT | Subdomain part (e.g. `nest`) |
| `domain` | TEXT | Zone apex (e.g. `simplite.net`) |
| `hostname` | TEXT | Full public hostname |
| `tunnel_id` | TEXT | Cloudflare tunnel UUID (nullable) |
| `cname_record_id` | TEXT | CF DNS record ID for subdomain (nullable) |
| `www_cname_record_id` | TEXT | CF DNS record ID for `www.*` (nullable) |
| `container_port` | INTEGER | Internal container port (nullable) |
| `connected_at` | TEXT | ISO 8601 datetime |
| `scenario` | TEXT | `'A'` (subdomain) \| `'B'` (apex) \| `'C'` (custom) |
| `base_path` | TEXT | Traefik path prefix e.g. `/apps/myapp` (nullable) |

> Built-in services (Gitea, Nextcloud, Jellyfin, etc.) are routed via Traefik ingress rules, **not** tracked here.

### `deploy_history`
CI/CD deployment audit log (capped at 500 entries per app).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `app_name` | TEXT → `apps.name` | FK with CASCADE DELETE |
| `commit_hash` | TEXT | |
| `commit_message` | TEXT | |
| `status` | TEXT | `'success'` \| `'failed'` \| `'running'` |
| `deployed_at` | TEXT | ISO 8601 datetime |

### `settings`
Key-value store for project configuration and secrets.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Dot-notation key |
| `value` | TEXT | String value |

**Known keys:**

| Key | Description |
|-----|-------------|
| `admin.username` | Admin dashboard username |
| `admin.password` | Admin dashboard password (bcrypt hash) |
| `project.name` | Brewnet project name |
| `project.path` | Absolute project path |
| `domain.provider` | `'local'` \| `'quick-tunnel'` \| `'named-tunnel'` |
| `domain.name` | Custom domain apex (e.g. `simplite.net`) |
| `cf.enabled` | `'true'` if Cloudflare tunnel active |
| `cf.tunnelMode` | `'quick'` \| `'named'` |
| `cf.quickTunnelUrl` | Quick tunnel public URL |
| `cf.accountId` | Cloudflare account ID |
| `cf.apiToken` | Cloudflare API token (**sensitive**) |
| `cf.tunnelId` | Named tunnel UUID |
| `cf.tunnelToken` | Named tunnel credential token (**sensitive**) |
| `cf.tunnelName` | Named tunnel display name |
| `cf.zoneId` | Cloudflare zone ID |
| `cf.zoneName` | Zone apex domain |
| `gitea.baseUrl` | Internal Gitea API base URL (e.g. `http://localhost/git`) |
| `gitea.username` | Gitea admin username |
| `gitea.writtenAt` | ISO 8601 timestamp of last Gitea credential write |
| `deploy.<name>.autoDeploy` | `'true'`\|`'false'` — auto deploy on push |
| `deploy.<name>.deployBranch` | Branch to watch for auto deploy |
| `deploy.<name>.webhookSecret` | Gitea webhook HMAC secret |

## Indexes

- `idx_deploy_history_app_name` on `deploy_history(app_name)`
- `idx_deploy_history_deployed_at` on `deploy_history(deployed_at)`
- `idx_domain_connections_hostname` on `domain_connections(hostname)`
