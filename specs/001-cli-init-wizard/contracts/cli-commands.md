# CLI Command Contracts

**Feature**: 001-cli-init-wizard
**Date**: 2026-02-23
**Source**: spec.md FR-01 through FR-10, WORKFLOW.md, REQUIREMENT.md

---

## Contract Format

Each contract defines:
- **Command**: CLI invocation syntax
- **Input**: Arguments, options, and interactive prompts
- **Output**: Stdout format, generated files, side effects
- **Errors**: Error codes and exit codes
- **Examples**: Concrete invocation examples

---

## 1. `brewnet --version`

**Input**: None
**Output**: Semver string to stdout
**Exit code**: 0

```
$ brewnet --version
1.0.0
```

---

## 2. `brewnet --help`

**Input**: None
**Output**: Help text listing all subcommands with descriptions
**Exit code**: 0

```
$ brewnet --help
Usage: brewnet [options] [command]

Your Home Server, Brewed Fresh

Options:
  -V, --version       output the version number
  -h, --help          display help for command

Commands:
  init [options]      Interactive setup wizard
  status              Show service status
  add <service>       Add a service
  remove <service>    Remove a service
  up                  Start all services
  down                Stop all services
  logs [service]      View service logs
  backup              Create a backup
  restore <id>        Restore from backup
  help [command]      display help for command
```

---

## 3. `brewnet init`

**Input**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--config <path>` | string | — | Pre-populate wizard from config file |
| `--non-interactive` | boolean | false | Use defaults for all prompts (requires --config) |

**Interactive Prompts** (8 steps):

### Step 0: System Check
- **Output**: Table of check items with pass/fail/warn indicators
- **Blocking failures**: Docker not installed (`BN001`), Node.js < 20
- **Warnings**: Low RAM (<2GB), low disk (<20GB), port conflicts, Git not installed

### Step 1: Project Setup
- `projectName` — input (default: `my-homeserver`, validated: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`)
- `projectPath` — input (default: `~/brewnet/<projectName>`)
- `setupType` — select: `full` | `partial`

### Step 2: Admin + Server Components
- `admin.username` — input (default: `admin`)
- `admin.password` — password (default: auto-generated 20 chars, user can override)
- Per-component toggles and sub-option selects (see spec.md FR-04, FR-05)

### Step 3: Dev Stack & Runtime
- `devStack.languages` — checkbox (multi-select)
- `devStack.frameworks` — select per language
- `devStack.frontend` — checkbox (multi-select)
- `boilerplate.*` — confirm/select
- `fileBrowser.*` — toggle + select mode
- Skip option available

### Step 4: Domain & Network
- `domain.provider` — select: `local` | `freedomain` | `custom`
- `domain.name` — input
- `domain.cloudflare.tunnelToken` — password (when provider !== 'local')
- `mailServer.enabled` — confirm (when provider !== 'local')

### Step 5: Review & Confirm
- Display all selections
- Action select: `Generate` | `Modify` | `Export`

### Step 6: Generate
- Progress output for file generation, image pull, container start, health checks
- Credential propagation status

### Step 7: Complete
- Endpoint URLs table
- Credentials summary
- External access verification commands (non-local only)

**Output (Generate path)**:
```
Generated files:
  docker-compose.yml
  docker-compose.dev.yml
  .env (chmod 600)
  .env.example
  infrastructure/...
  apps/...
  scripts/...
  docs/...

Services started: <count>/<total> healthy
```

**Output (Export path)**:
```
Configuration exported to: <projectPath>/brewnet.config.json
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| BN002 | Port conflict | 1 (after retry offer) |
| BN006 | Build failed | 1 (build logs shown) |

**Side effects**:
- Creates project directory at `<projectPath>`
- Writes `.env` with chmod 600
- Pulls Docker images
- Starts Docker containers
- Saves wizard state to `~/.brewnet/projects/<name>/selections.json`
- Logs all operations to `~/.brewnet/logs/`

---

## 4. `brewnet status`

**Input**: None (reads from active project config)

**Output**: Table to stdout

```
$ brewnet status
┌─────────────┬──────────┬────────┬──────────┬──────────────────┬───────┬────────────────────────────┐
│ Service     │ Status   │ CPU    │ Memory   │ Uptime           │ Port  │ URL                        │
├─────────────┼──────────┼────────┼──────────┼──────────────────┼───────┼────────────────────────────┤
│ traefik     │ running  │ 0.1%   │ 45MB     │ 2 hours          │ 80    │ traefik.myserver.dpdns.org │
│ postgres    │ running  │ 0.3%   │ 120MB    │ 2 hours          │ 5432  │ localhost:5432             │
│ redis       │ running  │ 0.1%   │ 12MB     │ 2 hours          │ 6379  │ localhost:6379             │
├─────────────┼──────────┼────────┼──────────┼──────────────────┼───────┼────────────────────────────┤
│ Total       │ 3/3      │ 0.5%   │ 177MB    │                  │       │                            │
└─────────────┴──────────┴────────┴──────────┴──────────────────┴───────┴────────────────────────────┘
```

**Exit code**: 0 (even if some services are stopped)

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |

---

## 5. `brewnet add <service>`

**Input**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `service` | string | yes | Service ID (e.g., `jellyfin`, `minio`, `redis`) |

**Output**:
```
$ brewnet add jellyfin
Adding Jellyfin (media streaming server)...

  [OK] Updated docker-compose.yml
  [OK] Pulled jellyfin/jellyfin:latest
  [OK] Started brewnet-jellyfin
  [OK] Added Traefik route: https://jellyfin.myserver.dpdns.org

  Jellyfin is now running at https://jellyfin.myserver.dpdns.org
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| BN002 | Port conflict | 1 |
| — | Service already exists | 1 (message: "Service <name> is already running") |
| BN008 | Unknown service ID | 1 |

**Side effects**:
- Updates `docker-compose.yml`
- Pulls Docker image
- Starts container
- Registers Traefik route
- Logs operation

---

## 6. `brewnet remove <service>`

**Input**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `service` | string | yes | Service ID to remove |

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--purge` | boolean | false | Remove volumes and data (default: keep data) |
| `--force` | boolean | false | Skip confirmation prompt |

**Interactive**: Confirmation prompt (unless `--force`)
```
? Remove Jellyfin? (y/N) › y
? Also remove data volumes? (y/N) › N
```

**Output**:
```
$ brewnet remove jellyfin
  [OK] Stopped brewnet-jellyfin
  [OK] Removed container
  [OK] Updated docker-compose.yml
  [OK] Removed Traefik route

  Jellyfin has been removed.
  Note: Data in ./data/jellyfin/ was preserved. Use --purge to remove.
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| BN008 | Service not found | 1 |

---

## 7. `brewnet up`

**Input**: None

**Output**:
```
$ brewnet up
Starting all services...
  [OK] brewnet-traefik
  [OK] brewnet-postgres
  [OK] brewnet-redis

All 3 services started.
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |

---

## 8. `brewnet down`

**Input**: None

**Output**:
```
$ brewnet down
Stopping all services...
  [OK] brewnet-redis
  [OK] brewnet-postgres
  [OK] brewnet-traefik

All services stopped.
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |

---

## 9. `brewnet logs [service]`

**Input**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `service` | string | no | Service ID (omit for all) |

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-f, --follow` | boolean | false | Follow log output |
| `-n, --tail <lines>` | number | 100 | Number of lines to show |

**Output**: Docker container logs to stdout

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| BN008 | Service not found | 1 |

---

## 10. `brewnet backup`

**Input**: None (interactive confirmation)

**Output**:
```
$ brewnet backup
Creating backup...

  [OK] Backed up configuration files
  [OK] Backed up docker-compose.yml
  [OK] Backed up .env
  [OK] Backed up PostgreSQL database
  [OK] Backed up Redis data

  Backup saved: ~/.brewnet/backups/backup-2026-02-23-143052.tar.gz
  Size: 8.2MB
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| — | Insufficient disk space | 1 (shows available vs required) |

**Side effects**:
- Creates `.tar.gz` archive in `~/.brewnet/backups/`
- Records backup in SQLite `backups` table
- Logs operation

---

## 11. `brewnet restore <id>`

**Input**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | Backup ID (e.g., `backup-2026-02-23-143052`) |

**Interactive**: Confirmation prompt
```
? Restore from backup-2026-02-23-143052? This will replace current configuration. (y/N) › y
```

**Output**:
```
$ brewnet restore backup-2026-02-23-143052
  [OK] Stopped all services
  [OK] Restored configuration files
  [OK] Restored docker-compose.yml
  [OK] Restored .env
  [OK] Restored PostgreSQL database
  [OK] Restored Redis data
  [OK] Started all services

  Restore complete. All services are running.
```

**Errors**:
| Code | Condition | Exit |
|------|-----------|------|
| BN001 | Docker not running | 1 |
| BN008 | Backup not found | 1 |

**Side effects**:
- Stops all running services
- Extracts backup archive
- Replaces config and data files
- Restarts all services
- Logs operation

---

## Common Error Response Format

All errors follow a consistent format:

```
Error [BN001]: Docker daemon is not running

  Docker is required to manage services. Please start Docker and try again.

  Fix:
    macOS:  Open Docker Desktop
    Linux:  sudo systemctl start docker

  Documentation: https://docs.brewnet.dev/errors/BN001
```

**Exit codes**:
- `0` — Success
- `1` — Error (with error code and remediation)
