# Feature Specification: CLI Init Wizard

**Feature Branch**: `001-cli-init-wizard`
**Created**: 2026-02-23
**Status**: Draft
**Input**: WORKFLOW.md, USER-STORY.md, IMPLEMENT_SPEC.md v2.2, REQUIREMENT.md v2.2
**Constitution**: v1.0.0 (Zero Config, Secure by Default, Transparent, Reversible, Offline First)

---

## User Scenarios & Testing

### User Story 1 - CLI Bootstrap & Version Check (Priority: P1)

A user installs Brewnet CLI globally and runs `brewnet --version` to verify installation, or `brewnet --help` to discover available commands.

**Why this priority**: Without a working CLI entry point, no other feature can function. This is the absolute foundation.

**Independent Test**: Can be fully tested by running `brewnet --version` and `brewnet --help` after npm global install, delivering confirmation that the tool is operational.

**Acceptance Scenarios**:

1. **Given** CLI is installed globally, **When** `brewnet --version`, **Then** prints semver string (e.g., `1.0.0`) and exits 0
2. **Given** CLI is installed globally, **When** `brewnet --help`, **Then** lists all subcommands (init, status, add, remove, backup, restore) with descriptions
3. **Given** CLI is installed globally, **When** `brewnet unknowncmd`, **Then** prints error message with help hint and exits 1
4. **Given** Docker daemon is not running, **When** any Docker-dependent command executes, **Then** error `BN001` is printed and command exits 1

---

### User Story 2 - System Requirements Check (Priority: P1)

A user runs `brewnet init` and the wizard automatically checks OS, Docker, Node.js, disk, RAM, ports, and Git availability before proceeding.

**Why this priority**: System check prevents users from proceeding with an environment that will fail during service startup. Gate-keeping ensures all subsequent steps can succeed.

**Independent Test**: Can be tested by running `brewnet init` on various system configurations (missing Docker, low RAM, occupied ports) and verifying correct pass/fail/warn output for each check item.

**Acceptance Scenarios**:

1. **Given** all requirements met, **When** `brewnet init` starts, **Then** each check item shows pass indicator
2. **Given** Docker not installed, **When** `brewnet init` starts, **Then** Docker auto-install begins (macOS: brew cask, Linux: get.docker.com script), daemon start is awaited, then system check proceeds
3. **Given** Docker not installed on macOS and Homebrew not installed, **When** `brewnet init` starts, **Then** Homebrew is installed first, then Docker Desktop is installed
4. **Given** Docker install succeeds but daemon does not start within timeout, **When** `brewnet init` waits, **Then** timeout error displayed with manual start instructions, wizard halts
5. **Given** Docker auto-install fails, **When** `brewnet init` runs, **Then** failure message shown with platform-specific manual install URL, wizard halts
6. **Given** Docker already installed, **When** `brewnet init` starts, **Then** install step is skipped, system check proceeds directly
7. **Given** system RAM below 2GB, **When** `brewnet init` starts, **Then** memory check shows warning, user prompted to confirm before continuing
8. **Given** disk below 20GB, **When** `brewnet init` starts, **Then** disk check shows warning, user prompted to confirm
9. **Given** Node.js < 20, **When** `brewnet init` starts, **Then** Node.js check fails with install instructions, wizard halts
10. **Given** port 80 already bound, **When** `brewnet init` starts, **Then** port check shows warning with process info
11. **Given** Git not installed, **When** `brewnet init` starts, **Then** Git check shows non-critical warning

---

### User Story 3 - Project Setup (Priority: P1)

A user configures project name, path, and setup type (Full Install / Partial Install) to define the scope of their home server.

**Why this priority**: Project identity and scope must be defined before any component selection. This is the first user-facing wizard step.

**Independent Test**: Can be tested by entering project name/path combinations and verifying validation rules, directory creation, and setup type defaults.

**Acceptance Scenarios**:

1. **Given** wizard at Step 1, **When** valid project name `my-server` entered, **Then** name accepted (alphanumeric + hyphens)
2. **Given** wizard at Step 1, **When** invalid project name `my server!` entered, **Then** rejected with validation message
3. **Given** valid name + path, **When** Full Install selected, **Then** DB Server pre-enabled with PostgreSQL + Redis defaults
4. **Given** valid name + path, **When** Partial Install selected, **Then** only Web + Git required, all others off
5. **Given** non-existent path, **When** user confirms path creation, **Then** directory created before proceeding
6. **Given** Step 1 active, **When** Ctrl+C pressed, **Then** confirmation prompt "Cancel setup?" shown

---

### User Story 4 - Server Component Selection (Priority: P1)

A user configures admin credentials and toggles server components (Web Server, File Server, DB Server, Media, SSH Server, Git Server) with their sub-options.

**Why this priority**: Server component selection determines which Docker services will be generated. This is the core decision-making step.

**Independent Test**: Can be tested by toggling each component card and verifying state changes, credential propagation targets, and resource estimation.

**Acceptance Scenarios**:

1. **Given** first visit to Step 2, **When** step renders, **Then** admin password auto-generated (20 chars)
2. **Given** admin password set, **When** services enabled, **Then** credentials propagated to all enabled service configs
3. **Given** Web Server card, **When** user attempts to disable, **Then** toggle blocked, card shows "Required"
4. **Given** Git Server card, **When** user views step, **Then** Git Server shows as always enabled (Required)
5. **Given** File Server enabled, **When** SSH Server viewed, **Then** SFTP auto-suggested (checked by default)
6. **Given** DB Server enabled, **When** primary DB selected, **Then** cache selection becomes available
7. **Given** SSH Server enabled, **When** default config, **Then** password auth disabled (key-only)
8. **Given** local domain, **When** Mail Server card, **Then** Mail Server option hidden
9. **Given** multiple components toggled, **When** resource estimation renders, **Then** RAM/disk estimates update

---

### User Story 5 - Dev Stack & Runtime Selection (Priority: P2)

A user selects backend languages, frameworks, frontend tech stack, and configures boilerplate generation options. App Server auto-enables when any language or frontend is selected.

**Why this priority**: Dev stack determines the application layer and boilerplate generation. Important but not blocking — user can skip this step entirely.

**Independent Test**: Can be tested by selecting various language/framework combinations and verifying framework filtering, multi-select behavior, and boilerplate scaffold output.

**Acceptance Scenarios**:

1. **Given** language list rendered, **When** Python + Node.js both selected, **Then** both retained (multi-select)
2. **Given** Python selected, **When** framework list shown, **Then** only Python frameworks (FastAPI, Django, Flask) listed
3. **Given** Node.js + Next.js + generate boilerplate, **When** scaffold runs, **Then** `apps/nextjs-app/` created with package.json
4. **Given** "Skip" selected, **When** Step 3 completes, **Then** devStack empty, App Server remains disabled
5. **Given** frontend stack rendered, **When** React.js + TypeScript both selected, **Then** both retained (multi-select)

---

### User Story 6 - Domain & Network Configuration (Priority: P2)

A user selects domain provider (Local / FreeDomain / Custom), configures Cloudflare Tunnel for external access, and optionally enables Mail Server.

**Why this priority**: Domain and network determine how services are accessed. Critical for production use but local-only is a valid fallback.

**Independent Test**: Can be tested by selecting each domain provider and verifying SSL mode, tunnel configuration, and mail server visibility rules.

**Acceptance Scenarios**:

1. **Given** local domain selected, **When** config generated, **Then** self-signed SSL (Secure by Default), no cloudflared, `.local` hostname
2. **Given** free domain selected, **When** tunnel config, **Then** Cloudflare Tunnel enabled by default
3. **Given** custom domain, **When** SSL selector shown, **Then** options include self-signed, letsencrypt, cloudflare
4. **Given** cloudflare tunnel enabled, **When** empty tunnel token, **Then** validation error before proceeding
5. **Given** non-local domain + Mail Server enabled, **When** compose generated, **Then** docker-mailserver service present

---

### User Story 7 - Review, Confirm & Docker Compose Generation (Priority: P1)

A user reviews all selections, confirms, and the system generates docker-compose.yml, .env, infrastructure configs, and starts all services with health checks.

**Why this priority**: This is the culmination of the wizard — without generation and startup, the tool delivers no value.

**Independent Test**: Can be tested by completing a wizard flow and verifying generated file structure, docker-compose service definitions, .env contents, and service health check results.

**Acceptance Scenarios**:

1. **Given** all steps completed, **When** Step 5 renders, **Then** all selections displayed in organized sections
2. **Given** review screen shown, **When** "Export" selected, **Then** `brewnet.config.json` written to project directory
3. **Given** exported config exists, **When** `brewnet init --config <file>`, **Then** wizard fields pre-populated
4. **Given** Web + DB selected, **When** compose generated, **Then** both service definitions in docker-compose.yml
5. **Given** compose valid, **When** services started, **Then** services start in dependency order (DB before App)
6. **Given** service started, **When** health check runs, **Then** each service polled until healthy (max 120s timeout)
7. **Given** all services healthy, **When** Step 7 renders, **Then** all endpoint URLs and credentials displayed

---

### User Story 8 - Post-Setup Service Management (Priority: P2)

A user manages running services after initial setup: checking status, adding/removing services, creating backups, and restoring from backups.

**Why this priority**: Post-setup management is essential for ongoing server operation but only useful after a successful init.

**Independent Test**: Can be tested by running `brewnet status`, `brewnet add`, `brewnet remove`, `brewnet backup`, `brewnet restore` against a running setup and verifying correct behavior.

**Acceptance Scenarios**:

1. **Given** services running, **When** `brewnet status`, **Then** table with name, status, CPU%, memory, uptime, port, URL
2. **Given** setup complete, **When** `brewnet add jellyfin`, **Then** image pulled, started, Traefik routing registered
3. **Given** service running, **When** `brewnet remove jellyfin` confirmed, **Then** container removed, data optionally preserved
4. **Given** services running, **When** `brewnet backup`, **Then** `.tar.gz` archive created in `~/.brewnet/backups/`
5. **Given** backup exists, **When** `brewnet restore <id>`, **Then** services stopped, data restored, services restarted
6. **Given** invalid backup ID, **When** `brewnet restore nonexistent`, **Then** error `BN008` (resource not found)

---

### Edge Cases

- What happens when wizard is interrupted mid-step (Ctrl+C)? → State saved, user can resume later
- What happens when Docker daemon stops during service startup? → Error `BN001`, partial rollback offered
- What happens when port conflict is detected during startup? → Error `BN002` with port info, skip/retry offered
- What happens when disk fills up during image pull? → Error with available vs required space shown
- What happens when schema version of saved state is < 5? → Auto-reset (migration)
- What happens when same service is added twice? → Error: service already exists
- What happens when health check timeout (120s) is reached? → Timeout error + service logs displayed, retry/skip offered
- What happens when SSL issuance fails? → Error `BN003`, fallback to self-signed offered

---

## Requirements

### Functional Requirements

- **FR-01**: System MUST provide a CLI entry point (`brewnet`) with version, help, and subcommand routing (init, status, add, remove, backup, restore, up, down, logs)
- **FR-02**: System MUST perform system requirements check (OS, Docker, Node.js, disk, RAM, ports, Git) before wizard proceeds, with clear pass/fail/warn indicators
- **FR-03**: System MUST collect project name (validated: alphanumeric + hyphens), path, and setup type (Full/Partial) in Step 1, with sensible defaults
- **FR-04**: System MUST auto-generate admin credentials (20-char password, confusion-free charset), store in `.env` (chmod 600), and propagate to all enabled services (Nextcloud, pgAdmin, Jellyfin, Gitea, FileBrowser, SSH, Mail)
- **FR-05**: System MUST provide 6 server component toggle cards (Web Server required, Git Server required, File Server, DB Server, Media, SSH Server) with conditional logic (SFTP auto-suggest when File/Media enabled, Mail hidden for local domain, App Server auto-enabled from devStack)
- **FR-06**: System MUST support multi-select language/framework/frontend selection with per-language framework filtering, boilerplate generation, FileBrowser configuration, and Skip option
- **FR-07**: System MUST support 3 domain providers (local, freedomain with .dpdns.org/.qzz.io/.us.kg TLDs, custom) with Cloudflare Tunnel integration (token validation) and conditional Mail Server
- **FR-08**: System MUST generate docker-compose.yml, .env, .env.example, infrastructure configs, and boilerplate scaffolds based on wizard selections, with Traefik routing labels and Docker network definitions
- **FR-09**: System MUST pull Docker images, start services in dependency order, run health checks (max 120s per service), propagate credentials, and verify external access for non-local domains
- **FR-10**: System MUST provide post-setup management commands: `status` (table output), `add` (service addition with routing), `remove` (with data preservation option), `backup` (tar.gz archive), `restore` (from backup ID)

### Key Entities

- **WizardState**: Central state object (schemaVersion 5) containing all wizard selections — projectName, projectPath, setupType, admin credentials, server component configs, devStack selections, domain/network config
- **ServiceComponent**: Per-service configuration — enabled flag, service variant, ports, Docker image, resource estimates (RAM/disk)
- **GeneratedConfig**: Output of wizard — docker-compose.yml structure, .env key-value pairs, infrastructure config files, boilerplate scaffold paths
- **BackupRecord**: Backup archive metadata — ID (timestamp-based), path, size, service list, creation date
- **BrewnetError**: Structured error with code (BN001–BN010), HTTP status equivalent, user-facing message, and remediation steps
- **LogEntry**: Structured operation log — timestamp, level (info/warn/error), command, metadata, stored in `~/.brewnet/logs/`

---

## Success Criteria

### Measurable Outcomes

- **SC-01**: User can complete `brewnet init` wizard from start to running services in under 10 minutes (excluding Docker image download time)
- **SC-02**: All wizard prompts have sensible defaults — user can press Enter through all prompts and get a valid, working configuration (Zero Config principle)
- **SC-03**: Generated `.env` file has chmod 600 permissions, SSH defaults to key-only auth, no root login (Secure by Default principle)
- **SC-04**: Every file generation and service operation is logged to `~/.brewnet/logs/` with timestamp and user can inspect all generated configs (Transparent principle)
- **SC-05**: User can navigate backwards through wizard steps, cancel with state preservation, and resume later. Any started service can be rolled back (Reversible principle)
- **SC-06**: CLI core test coverage reaches 90%+, overall project coverage 80%+ (per testing-complete-guide.md)
- **SC-07**: All 9 service types (Web, Git, File, App, DB+Cache, Media, SSH, Mail, Tunnel) generate correct docker-compose service definitions with proper networking and Traefik labels
- **SC-08**: `brewnet status`, `brewnet add`, `brewnet remove`, `brewnet backup`, and `brewnet restore` work correctly against running services without requiring direct Docker CLI usage
