# TEST_CASES.md — Brewnet CLI Phase 1 MVP (TDD)

**Feature**: CLI Init Wizard (001-cli-init-wizard)
**Base**: spec.md, IMPLEMENT_SPEC.md v2.2, Constitution v1.0.0
**Approach**: Test-Driven Development — write tests before implementation
**Created**: 2026-02-23

---

## Test Type Legend
- **U** = Unit (Jest, isolated)
- **I** = Integration (Jest, component combination)
- **E** = E2E (Jest + execa, full CLI flow)

## Coverage Targets
- packages/cli core: **90%+**
- overall: **80%+**

---

## F01: CLI Bootstrap & Entry Point

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-01-01 | U | CLI binary installed | `brewnet --version` | Prints semver string (e.g. `1.0.0`) | FR-01 |
| TC-01-02 | U | CLI binary installed | `brewnet --help` | Lists all subcommands with descriptions | FR-01 |
| TC-01-03 | U | CLI binary installed | `brewnet unknowncmd` | Prints error + help hint, exits 1 | FR-01 |
| TC-01-04 | U | Docker daemon not running | Any command requiring Docker | Error printed with code `BN001`, exits 1 | FR-01 |
| TC-01-05 | I | All subcommands registered | `brewnet init`, `brewnet status`, `brewnet add`, `brewnet remove`, `brewnet backup`, `brewnet restore` | Each subcommand resolves without "unknown command" error | FR-01 |

---

## F02: System Check (Step 0)

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-02-01 | I | All requirements met | `brewnet init` starts | Each check item shows pass indicator | FR-02 |
| TC-02-02 | I | Docker daemon stopped | `brewnet init` starts | Docker check shows fail, error `BN001`, wizard halts | FR-02 |
| TC-02-03 | I | System RAM = 1.5GB (below 2GB) | `brewnet init` starts | Memory check shows warn, user prompted to confirm before continuing | FR-02 |
| TC-02-04 | I | Available disk = 15GB (below 20GB) | `brewnet init` starts | Disk check shows warn, user prompted to confirm before continuing | FR-02 |
| TC-02-05 | I | Node.js version 18.x installed | `brewnet init` starts | Node.js check shows fail, error with install instructions, wizard halts | FR-02 |
| TC-02-06 | I | Port 80 already bound | `brewnet init` starts | Port 80 check shows warn with process info | FR-02 |
| TC-02-07 | I | Git not installed | `brewnet init` starts | Git check shows warn (non-critical), user prompted | FR-02 |
| TC-02-08 | I | All checks fail simultaneously | `brewnet init` starts | All failures listed, first critical failure halts wizard | FR-02 |

---

## F03: Project Setup (Step 1)

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-03-01 | U | — | Project name `my-server` entered | Accepted (alphanumeric + hyphens) | FR-03 |
| TC-03-02 | U | — | Project name `my server!` entered | Rejected with validation message | FR-03 |
| TC-03-03 | U | — | Project name empty | Rejected, re-prompt | FR-03 |
| TC-03-04 | I | Valid name + path | Full Install selected | All 8 wizard steps will execute | FR-03 |
| TC-03-05 | I | Valid name + path | Partial Install selected | Optional steps (3, 4) flagged as skippable | FR-03 |
| TC-03-06 | I | Non-existent path provided | User confirms path creation | Directory created before proceeding | FR-03 |
| TC-03-07 | I | Step 1 active | Backspace pressed | Returns to Step 0 (System Check) | FR-03 |
| TC-03-08 | I | Step 1 active | Ctrl+C pressed | Confirmation prompt: "Cancel setup?" | FR-03 |

---

## F04: Server Component Selection (Step 2)

### Admin Account
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-04-01 | U | First visit to Step 2 | Step renders | Admin password auto-generated (20 chars, confusion-free charset per data-model.md) | FR-04 |
| TC-04-02 | U | Admin password set | Any service enabled | Credential propagated to all enabled service configs | FR-04 |
| TC-04-03 | U | Custom password entered | Wizard proceeds | Custom password used instead of auto-generated | FR-04 |
| TC-04-04 | U | Admin credentials set | `.env` generated | `.env` file permissions = 600 (owner read-only) | FR-04 |

### Component Toggle Rules
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-04-05 | U | Web Server card rendered | User attempts to disable | Toggle blocked, card shows "Required" | FR-05 |
| TC-04-06 | U | Git Server card rendered | User views step | Git Server shows as always enabled | FR-05 |
| TC-04-07 | U | File Server enabled | SSH Server viewed | SFTP checkbox auto-suggested (checked by default) | FR-05 |
| TC-04-08 | U | Media Server enabled | SSH Server viewed | SFTP checkbox auto-suggested | FR-05 |
| TC-04-09 | U | Local domain configured | Mail Server card | Mail Server option hidden | FR-05 |
| TC-04-10 | U | Non-local domain configured | Mail Server card | Mail Server option visible | FR-05 |
| TC-04-11 | U | DB Server enabled | Primary DB selected | Cache layer selection becomes available | FR-05 |
| TC-04-12 | I | Resource estimation renders | Multiple components toggled | RAM/disk estimates update in real time | FR-05 |
| TC-04-13 | U | SSH Server enabled | Default config | Password auth = disabled (key-only) | FR-05 |
| TC-04-14 | U | DB Server enabled | DB password field | Password auto-generated if not provided | FR-04 |

### App Server Auto-Enable
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-04-15 | U | No language selected in Step 3 | Step 2 re-visited | App Server = disabled (not auto-enabled) | FR-05 |
| TC-04-16 | I | Language selected in Step 3 | Return to Step 2 | App Server = auto-enabled, cannot be disabled while language selected | FR-05 |
| TC-04-17 | U | App Server auto-enabled | FileBrowser viewed | FileBrowser auto-enabled alongside App Server | FR-05 |

---

## F05: Runtime & Boilerplate (Step 3)

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-05-01 | U | Language list rendered | Python + Node.js both selected | Both selections retained (multi-select) | FR-06 |
| TC-05-02 | U | Python selected | Framework list shown | Only Python frameworks listed (FastAPI, Django, Flask) | FR-06 |
| TC-05-03 | U | Node.js selected | Framework list shown | Only Node.js frameworks listed (Next.js, Express, NestJS, etc.) | FR-06 |
| TC-05-04 | U | No language selected | Framework list shown | Empty (no frameworks available) | FR-06 |
| TC-05-05 | U | Frontend stack rendered | React.js + TypeScript both selected | Both retained (multi-select) | FR-06 |
| TC-05-06 | I | Node.js + Next.js + "Generate Project" | Boilerplate generated | `apps/nextjs-app/` scaffold created with package.json | FR-06 |
| TC-05-07 | I | Dev Mode selected | docker-compose.dev.yml | Source mount volume + dev command configured | FR-06 |
| TC-05-08 | U | "Skip" option selected | Step 3 skipped | devStack = empty, App Server remains disabled | FR-06 |
| TC-05-09 | I | App storage configured | FileBrowser enabled | `apps/storage/uploads/`, `temp/`, `backups/` directories in config | FR-06 |

---

## F06: Domain & Network Configuration (Step 4)

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-06-01 | U | Local domain selected | Domain config generated | Self-signed SSL (Secure by Default), no cloudflared service, `.local` hostname | FR-07 |
| TC-06-03 | U | Tunnel provider selected | SSL method selector | Options: self-signed, letsencrypt, cloudflare; Tunnel enabled by default | FR-07 |
| TC-06-05 | I | Cloudflare tunnel enabled | Tunnel token field | Empty token → validation error before proceeding | FR-07 |
| TC-06-06 | I | cloudflared enabled | Compose generated | `cloudflared` service with tunnel token in docker-compose.yml | FR-07 |
| TC-06-07 | U | letsencrypt SSL selected | Compose generated | Traefik ACME config included, HTTP challenge configured | FR-07 |
| TC-06-08 | U | Local domain | Mail Server step | Mail Server option not shown | FR-05, FR-07 |
| TC-06-09 | I | Non-local domain + Mail Server | Compose generated | `docker-mailserver` service with ports 25, 587, 993 | FR-07 |

---

## F07: Review & Confirm (Step 5)

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-07-01 | I | All steps completed | Step 5 renders | All selections displayed in organized sections | FR-08 |
| TC-07-02 | I | 5 services selected | Resource estimate shown | RAM/disk totals match sum of service estimates | FR-08 |
| TC-07-03 | I | Review screen shown | "Export configuration" selected | `brewnet.config.json` written to project directory | FR-08 |
| TC-07-04 | I | Exported config exists | `brewnet init --config brewnet.config.json` | All wizard fields pre-populated from config | FR-08 |
| TC-07-05 | I | Admin credentials set | Credential propagation section | Lists all services receiving admin credentials | FR-04 |
| TC-07-06 | I | Review screen shown | "Modify" selected | Returns to step where user last made a change | FR-08 |
| TC-07-07 | I | Review screen shown | Ctrl+C → "Cancel" | Wizard state saved, user can resume later | FR-03 |

---

## F08: Docker Compose Generation & Service Startup (Step 6–7)

### File Generation
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-08-01 | U | Web Server + DB Server selected | Compose generated | `docker-compose.yml` contains both service definitions | FR-08 |
| TC-08-02 | U | All services selected | Compose generated | All 9 service definitions present | FR-08 |
| TC-08-03 | U | Any config generated | `.env` file | All required secret keys present | FR-08 |
| TC-08-04 | U | `.env` generated | File permissions checked | chmod 600 applied | FR-04 |
| TC-08-05 | U | Traefik selected | Service with `Host()` label | Traefik routing labels present per service | FR-08 |
| TC-08-06 | U | Cloudflare tunnel enabled | Compose generated | `cloudflared` service block present | FR-07, FR-08 |
| TC-08-07 | U | SSH Server enabled | SSH config generated | `sshd_config` has `PasswordAuthentication no` and `PermitRootLogin no` | FR-05 |
| TC-08-08 | U | Non-local domain + Mail | Mail config generated | Postfix/Dovecot configs in `infrastructure/mail/` | FR-08 |
| TC-08-09 | U | Gitea enabled | Git config generated | `gitea/app.ini` with admin account | FR-08 |
| TC-08-10 | U | FileBrowser enabled | FileBrowser config | `filebrowser.json` with admin credential API call | FR-08 |
| TC-08-11 | U | Any compose generated | Networks section | `brewnet` (external) and `brewnet-internal` networks defined | FR-08 |
| TC-08-11b | U | Any compose generated | Security options checked | All containers have `security_opt: [no-new-privileges:true]` | FR-08 |
| TC-08-12 | U | Boilerplate selected | Template substitution | `${PROJECT_NAME}`, `${DOMAIN}` etc. replaced in scaffold | FR-08 |
| TC-08-13 | U | .env.example generated | Contents compared | All keys present, values masked | FR-08 |

### Service Startup & Health
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-08-14 | I | Compose file valid | Docker images pulled | All selected images downloaded, progress shown | FR-09 |
| TC-08-15 | I | Images pulled | Services started | Services start in dependency order (DB before App) | FR-09 |
| TC-08-16 | I | Service started | Health check runs | Each service polled until healthy (max 120s) | FR-09 |
| TC-08-17 | I | Health check reaches 120s | Service still unhealthy | Timeout error + service logs displayed, retry/skip offered | FR-09 |
| TC-08-18 | I | Service fails to start | User selects "Rollback" | All started containers stopped and removed | FR-09 |
| TC-08-19 | I | Non-local domain | Post-startup | DNS check + HTTPS endpoint verification runs | FR-07, FR-09 |
| TC-08-20 | I | All services healthy | Step 7 renders | All endpoint URLs and credentials displayed | FR-09 |

### Credential Propagation
| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-08-21 | I | 5 services enabled | Credential propagation phase | Admin password set in each service's env config | FR-04 |
| TC-08-22 | I | Credentials propagated | `.env` verified | NEXTCLOUD_ADMIN_PASSWORD, POSTGRES_PASSWORD etc. match admin password | FR-04 |

---

## F09: Post-Setup Service Management

| TC | Type | Given | When | Then | Linked FR |
|----|------|-------|------|------|-----------|
| TC-09-01 | I | Services running | `brewnet status` | Table: name, status, CPU%, memory, uptime, port, URL | FR-10 |
| TC-09-02 | I | Service stopped | `brewnet status` | Stopped service shown with red/stopped indicator | FR-10 |
| TC-09-03 | I | Setup complete | `brewnet add jellyfin` | Jellyfin image pulled, started, Traefik routing registered | FR-10 |
| TC-09-03b | I | Setup complete | `brewnet add jellyfin` | Existing docker-compose.yml backed up before modification | FR-10 |
| TC-09-04 | I | Service already running | `brewnet add <same-service>` | Error: service already exists | FR-10 |
| TC-09-05 | I | Jellyfin running | `brewnet remove jellyfin` | Confirmation prompt shown, docker-compose.yml backed up before modification | FR-10 |
| TC-09-06 | I | Remove confirmed with keep-data | `brewnet remove jellyfin` | Container removed, volume data preserved | FR-10 |
| TC-09-07 | I | Remove confirmed with purge | `brewnet remove jellyfin` | Container + volumes both removed | FR-10 |
| TC-09-08 | I | Services running | `brewnet backup` | `.tar.gz` archive created in `~/.brewnet/backups/` | FR-10 |
| TC-09-09 | I | Backup archive exists | `brewnet restore <id>` | Services stopped, data restored, services restarted | FR-10 |
| TC-09-10 | I | Invalid backup ID | `brewnet restore nonexistent` | Error `BN008` (resource not found) | FR-10 |
| TC-09-11 | I | Insufficient disk for backup | `brewnet backup` | Error with available vs required space shown | FR-10 |
| TC-09-12 | E | Full install completed | All post-setup commands run | All commands execute without Docker CLI | FR-10 |

---

## Cross-Cutting Concerns

### Error Handling
| TC | Type | Given | When | Then |
|----|------|-------|------|------|
| TC-X-01 | U | Docker daemon stopped | Any Docker operation | Error code `BN001`, exit 1 |
| TC-X-02 | U | Port conflict detected | Port check | Error code `BN002`, port info shown |
| TC-X-03 | U | SSL issuance fails | Certbot call | Error code `BN003`, fallback options shown |
| TC-X-06 | U | Resource not found | `brewnet restore` bad ID | Error code `BN008` |
| TC-X-07 | U | Database error | SQLite operation fails | Error code `BN009` |

### Logging
| TC | Type | Given | When | Then |
|----|------|-------|------|------|
| TC-L-01 | U | Any CLI operation | Command executes | Entry logged to `~/.brewnet/logs/` with timestamp + level + command |
| TC-L-02 | U | Error occurs | Command fails | Error details logged with metadata |

### Wizard State Persistence
| TC | Type | Given | When | Then |
|----|------|-------|------|------|
| TC-W-01 | U | Step 3 completed | State saved | `~/.brewnet/projects/<name>/selections.json` written |
| TC-W-02 | I | Previous incomplete setup | `brewnet init` run | "Resume previous setup?" prompt shown |
| TC-W-03 | I | Resume selected | Wizard starts | All previous selections pre-populated |
| TC-W-04 | I | "Start fresh" selected | Wizard starts | Previous state discarded |
| TC-W-05 | U | Schema version < 5 | State loaded | Old state auto-reset (migration) |

### Constitution Compliance
| TC | Type | Principle | Test |
|----|------|-----------|------|
| TC-C-01 | U | Zero Config | All wizard prompts have sensible defaults — user can press Enter through all prompts and get a valid config |
| TC-C-02 | U | Secure by Default | Default SSH = key-only, no root login, `.env` = chmod 600 |
| TC-C-03 | U | Transparent | All file generations logged and user-inspectable |
| TC-C-04 | I | Reversible | Any started service can be rolled back to pre-init state |
| TC-C-05 | I | Offline First | Wizard completes configuration without internet (Docker pulls excluded) |

---

## E2E Scenarios

| Scenario | Steps | Pass Criteria |
|----------|-------|---------------|
| E2E-01: Full Install (minimal) | System check → name → Full → Web only → skip step 3 → local → confirm → generate | Services start, endpoints accessible |
| E2E-02: Full Install (maximal) | All components enabled, all languages, custom domain + tunnel | All 9 services running, external access verified |
| E2E-03: Partial Install | Web + DB only | Only 2 services in compose, others absent |
| E2E-04: Wizard Resume | Interrupt at step 3, re-run, select resume | Step 3 selections preserved |
| E2E-05: Backup & Restore | Full install → backup → remove data → restore | All service data recovered |

---

## Test Count Summary

| Category | Unit | Integration | E2E | Total |
|----------|------|-------------|-----|-------|
| F01: CLI Bootstrap | 4 | 1 | — | 5 |
| F02: System Check | — | 8 | — | 8 |
| F03: Project Setup | 3 | 5 | — | 8 |
| F04: Server Components | 14 | 3 | — | 17 |
| F05: Runtime & Boilerplate | 5 | 4 | — | 9 |
| F06: Domain & Network | 5 | 4 | — | 9 |
| F07: Review & Confirm | — | 7 | — | 7 |
| F08: Generation & Startup | 14 | 9 | — | 23 |
| F09: Post-Setup Management | — | 12 | 1 | 13 |
| Cross-Cutting: Errors | 5 | — | — | 5 |
| Cross-Cutting: Logging | 2 | — | — | 2 |
| Cross-Cutting: State | 2 | 3 | — | 5 |
| Cross-Cutting: Constitution | 2 | 3 | — | 5 |
| E2E Scenarios | — | — | 5 | 5 |
| **Total** | **56** | **59** | **6** | **121** |
