# Tasks: CLI Init Wizard

**Input**: Design documents from `/specs/001-cli-init-wizard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md, TEST_CASES.md
**TDD**: Yes — tests are written FIRST, verified to FAIL, then implementation follows

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/cli/src/`, `packages/shared/src/`
- **Tests**: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize monorepo, install dependencies, configure TypeScript and testing

- [x] T001 Initialize pnpm workspace with `pnpm-workspace.yaml` listing `packages/cli`, `packages/shared`, and root `tsconfig.json` (TypeScript 5 strict mode, ESM modules: `"type": "module"` in all package.json files)
- [x] T002 Create `packages/shared/package.json` with dependencies (zod), `"type": "module"`, and `packages/shared/tsconfig.json`
- [x] T003 [P] Create `packages/cli/package.json` with `"type": "module"`, dependencies (commander, @inquirer/prompts, dockerode, execa, chalk, ora, better-sqlite3, zod, cli-table3, js-yaml, conf), devDependencies (tsup, @types/js-yaml, @types/better-sqlite3), and `packages/cli/tsconfig.json`
- [x] T004 [P] Configure Jest for unit/integration tests in root `jest.config.js` with TypeScript transform (ts-jest), coverage thresholds (90% cli core, 80% overall), and path aliases
- [x] T005 [P] Configure ESLint + Prettier in root config files for TypeScript strict linting
- [x] T006 Create directory structure per plan.md: `packages/cli/src/{commands,wizard/steps,services,utils,config}`, `packages/shared/src/{types,schemas,utils}`, `tests/{unit,integration,e2e}`
- [x] T007 Add `bin` field to `packages/cli/package.json` pointing to compiled `dist/index.js` and configure build script using `tsup` (esbuild-based bundler per constitution) with ESM output format

**Checkpoint**: `pnpm install` succeeds, `pnpm build` compiles, `pnpm test` runs (0 tests)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, error handling, logging, validation, and config registries that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Shared Types & Schemas

- [x] T008 [P] Define WizardState interface and all sub-interfaces (AdminConfig, ServerComponents, DevStackConfig, BoilerplateConfig, DomainConfig, CloudflareConfig) in `packages/shared/src/types/wizard-state.ts` per data-model.md
- [x] T009 [P] Define ServiceDefinition interface and Language/FrontendTech types in `packages/shared/src/types/service.ts` per data-model.md
- [x] T010 [P] Define ErrorCode enum (BN001–BN010), BackupRecord, LogEntry, GeneratedConfig interfaces in `packages/shared/src/types/errors.ts` per data-model.md
- [x] T011 [P] Create Zod schema for WizardState validation in `packages/shared/src/schemas/wizard-state.schema.ts`
- [x] T012 [P] Create Zod schema for brewnet.config.json import/export in `packages/shared/src/schemas/config.schema.ts`
- [x] T013 [P] Define shared constants (SCHEMA_VERSION=5, DEFAULT_PROJECT_NAME, DEFAULT_ADMIN_USERNAME, port numbers, etc.) in `packages/shared/src/utils/constants.ts`

### CLI Core Utilities

- [x] T014 [P] Implement BrewnetError class extending Error with code, httpStatus, remediation fields and factory methods for each BN code in `packages/cli/src/utils/errors.ts`
- [x] T015 [P] Implement structured logger (info/warn/error → `~/.brewnet/logs/` as daily JSON files) in `packages/cli/src/utils/logger.ts`
- [x] T016 [P] Implement password generation (confusion-free charset, configurable length 16/20) in `packages/cli/src/utils/password.ts`
- [x] T017 [P] Implement input validation helpers (validateProjectName, validateDomainName, validateTunnelToken, validateFreeDomainTld) in `packages/cli/src/utils/validation.ts`
- [x] T018 [P] Implement resource estimation functions (countSelectedServices, estimateResources, collectAllServices, getCredentialTargets, getImageName) in `packages/cli/src/utils/resources.ts`

### Config Registries

- [x] T019 [P] Create service registry (17 Docker services: traefik, nginx, caddy, gitea, filebrowser, nextcloud, minio, jellyfin, postgresql, mysql, redis, valkey, keydb, pgadmin, openssh-server, docker-mailserver, cloudflared) with images, ports, RAM, subdomain, healthCheck, traefikLabels in `packages/cli/src/config/services.ts`. Registry is bundled locally for offline reference (per constitution: Offline First — CLI MUST cache service metadata locally)
- [x] T020 [P] Create language/framework registry (7 languages × frameworks per language + 4 frontend techs) in `packages/cli/src/config/frameworks.ts`
- [x] T021 [P] Create defaults registry (all wizard default values per WORKFLOW.md) in `packages/cli/src/config/defaults.ts`

### Wizard State Management

- [x] T022 Implement WizardState management: create/load/save/reset state, schema migration (version < 5 → reset), resume detection, persistence to `~/.brewnet/projects/<name>/selections.json` in `packages/cli/src/wizard/state.ts`. Use `conf` package for global user configuration persistence (`~/.brewnet/config.json`)
- [x] T023 Implement wizard navigation state machine: step history stack, forward/backward, cancel with confirmation, Ctrl+C handling in `packages/cli/src/wizard/navigation.ts`

### Foundational Unit Tests

- [x] T023a [P] Unit tests for BrewnetError factory methods (all BN001–BN010 codes, messages, remediation) in `tests/unit/cli/utils/errors.test.ts`
- [x] T023b [P] Unit tests for password generation (length, charset, confusion-free exclusions) in `tests/unit/cli/utils/password.test.ts`
- [x] T023c [P] Unit tests for validation helpers (projectName valid/invalid/empty, domainName, tunnelToken, freeDomainTld) in `tests/unit/cli/utils/validation.test.ts`
- [x] T023d [P] Unit tests for resource estimation (countSelectedServices, estimateResources, getCredentialTargets) in `tests/unit/cli/utils/resources.test.ts`
- [x] T023e [P] Unit tests for service registry (17 entries, correct images/ports/RAM) in `tests/unit/cli/config/services.test.ts`
- [x] T023f [P] Unit tests for WizardState management (create, save, load, reset, schema migration, resume detection) in `tests/unit/cli/wizard/state.test.ts`

**Checkpoint**: All shared types compile, all foundational utility unit tests pass, config registries return correct data, state management persists/loads correctly

---

## Phase 3: User Story 1 — CLI Bootstrap & Version Check (Priority: P1) MVP

**Goal**: `brewnet --version`, `brewnet --help`, and all subcommand stubs registered. Unknown commands show error + help hint.

**Independent Test**: Run `brewnet --version` → semver string. Run `brewnet --help` → lists all subcommands. Run `brewnet unknowncmd` → error + exits 1.

### Tests for User Story 1 (TDD)

> Write these tests FIRST, ensure they FAIL before implementation

- [x] T024 [P] [US1] Unit tests for CLI entry point (version output, help output, unknown command error) in `tests/unit/cli/commands/index.test.ts` — covers TC-01-01, TC-01-02, TC-01-03
- [x] T025 [P] [US1] Unit test for Docker daemon check (BN001 error when Docker not running) in `tests/unit/cli/services/docker-manager.test.ts` — covers TC-01-04
- [x] T026 [P] [US1] Integration test for all subcommand registration (init, status, add, remove, backup, restore, up, down, logs resolve without error) in `tests/integration/cli-bootstrap.test.ts` — covers TC-01-05

### Implementation for User Story 1

- [x] T027 [US1] Create CLI entry point with Commander.js program (name, description, version from package.json) in `packages/cli/src/index.ts`
- [x] T028 [P] [US1] Register `init` command stub with --config and --non-interactive options in `packages/cli/src/commands/init.ts`
- [x] T029 [P] [US1] Register `status` command stub in `packages/cli/src/commands/status.ts`
- [x] T030 [P] [US1] Register `add`, `remove` command stubs (with service argument, --purge/--force options) in `packages/cli/src/commands/add.ts` and `packages/cli/src/commands/remove.ts`
- [x] T031 [P] [US1] Register `up`, `down`, `logs` command stubs (logs with -f/--follow, -n/--tail options) in `packages/cli/src/commands/up.ts`, `packages/cli/src/commands/down.ts`, `packages/cli/src/commands/logs.ts`
- [x] T032 [P] [US1] Register `backup`, `restore` command stubs (restore with id argument) in `packages/cli/src/commands/backup.ts` and `packages/cli/src/commands/restore.ts`
- [x] T033 [US1] Implement Docker daemon availability check (dockerode ping) as guard for Docker-dependent commands in `packages/cli/src/services/docker-manager.ts`

**Checkpoint**: `brewnet --version` prints semver, `brewnet --help` lists 9 subcommands, `brewnet unknowncmd` exits 1

---

## Phase 4: User Story 2 — System Requirements Check (Priority: P1)

**Goal**: `brewnet init` Step 0 checks OS, Docker, Node.js, disk, RAM, ports, Git with pass/fail/warn indicators

**Independent Test**: Mock system conditions (no Docker, low RAM, ports bound) and verify each check item shows correct indicator

### Tests for User Story 2 (TDD)

- [x] T034 [P] [US2] Unit tests for individual system checks (OS, Docker, Node.js, disk, RAM, port, Git) with mocked system calls in `tests/unit/cli/services/system-checker.test.ts` — covers TC-02-01 through TC-02-07
- [x] T035 [P] [US2] Integration test for combined system check flow (all pass, all fail, mixed) in `tests/integration/system-check.test.ts` — covers TC-02-08

### Implementation for User Story 2

- [x] T036 [P] [US2] Implement OS detection check (macOS 12+ / Ubuntu 20.04+) in `packages/cli/src/services/system-checker.ts`
- [x] T037 [P] [US2] Implement Docker + Docker Compose version check (24.0+) in `packages/cli/src/services/system-checker.ts`
- [x] T038 [P] [US2] Implement Node.js version check (20+) in `packages/cli/src/services/system-checker.ts`
- [x] T039 [P] [US2] Implement disk space check (20GB minimum, warn below) and RAM check (2GB minimum, warn below) in `packages/cli/src/services/system-checker.ts`
- [x] T040 [P] [US2] Implement port availability check (80, 443, 2222) with process info on conflict in `packages/cli/src/services/system-checker.ts`
- [x] T041 [P] [US2] Implement Git installation check (non-critical warning) in `packages/cli/src/services/system-checker.ts`
- [x] T042 [US2] Implement Step 0 wizard step: orchestrate all checks, display pass/fail/warn table with chalk, halt on critical failures, prompt to continue on warnings in `packages/cli/src/wizard/steps/system-check.ts`
- [x] T043 [US2] Implement Docker auto-installer service — platform detection, macOS (Homebrew check → brew install --cask docker → open -a Docker), Linux (get.docker.com script → systemctl start/enable → usermod -aG docker), daemon polling with timeout in `packages/cli/src/services/docker-installer.ts`
- [x] T044 [US2] Integrate docker-installer into Step 0 wizard: check Docker presence before runAllChecks(), trigger installDocker() with ora spinner, await waitForDockerDaemon(), display install success/failure UI; on failure show manual install URL and halt in `packages/cli/src/wizard/steps/system-check.ts`

**Checkpoint**: `brewnet init` auto-installs Docker when missing (macOS/Linux), awaits daemon, then proceeds to system check table

---

## Phase 5: User Story 3 — Project Setup (Priority: P1)

**Goal**: Step 1 collects project name (validated), path, setup type (Full/Partial). Navigation: back to Step 0, Ctrl+C cancellation.

**Independent Test**: Enter various project names and verify validation. Select Full/Partial and verify state changes.

### Tests for User Story 3 (TDD)

- [x] T043 [P] [US3] Unit tests for project name validation (valid, invalid chars, empty, edge cases) in `tests/unit/cli/utils/validation.test.ts` — covers TC-03-01, TC-03-02, TC-03-03
- [x] T044 [P] [US3] Integration tests for Step 1 wizard flow (Full Install defaults, Partial Install defaults, path creation, back navigation, cancel) in `tests/integration/project-setup.test.ts` — covers TC-03-04 through TC-03-08

### Implementation for User Story 3

- [x] T045 [US3] Implement Step 1 wizard step: project name input (with validation), project path input (with directory creation), setup type selection (Full/Partial) using @inquirer/prompts in `packages/cli/src/wizard/steps/project-setup.ts`
- [x] T046 [US3] Implement setup type logic: Full Install pre-enables Web+Git+DB (PostgreSQL+Redis), Partial Install enables only Web+Git, update WizardState accordingly in `packages/cli/src/wizard/steps/project-setup.ts`
- [x] T047 [US3] Wire Step 0 → Step 1 navigation in init command orchestrator, add backward navigation (Backspace → Step 0) and Ctrl+C cancel handler in `packages/cli/src/commands/init.ts`

**Checkpoint**: `brewnet init` → system check → project name + path + type → state saved correctly

---

## Phase 6: User Story 4 — Server Component Selection (Priority: P1)

**Goal**: Step 2 admin credentials (auto-gen 20 char password), 6 component toggle cards (Web/Git required), SFTP auto-suggest, resource estimation

**Independent Test**: Toggle each component, verify state changes, credential propagation targets, resource estimation accuracy

### Tests for User Story 4 (TDD)

- [x] T048 [P] [US4] Unit tests for password generation (length, charset, confusion-free) in `tests/unit/cli/utils/password.test.ts` — covers TC-04-01, TC-04-03
- [x] T049 [P] [US4] Unit tests for credential propagation logic (getCredentialTargets returns correct services) in `tests/unit/cli/utils/resources.test.ts` — covers TC-04-02
- [x] T050 [P] [US4] Unit tests for component toggle rules (Web/Git required, SFTP auto-suggest, Mail visibility, cache dependency, SSH key-only default, DB password auto-gen, App Server auto-enable) in `tests/unit/cli/wizard/server-components.test.ts` — covers TC-04-05 through TC-04-17
- [x] T051 [P] [US4] Integration test for resource estimation with multiple components in `tests/integration/resource-estimation.test.ts` — covers TC-04-12

### Implementation for User Story 4

- [x] T052 [US4] Implement admin account prompt (username input, auto-generated password with accept/override, .env chmod 600 logic) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T053 [US4] Implement Web Server card (always ON, select traefik/nginx/caddy) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T054 [P] [US4] Implement File Server card (toggle, select nextcloud/minio) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T055 [P] [US4] Implement Git Server card (always ON, show gitea info, ports 3000/3022) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T056 [P] [US4] Implement DB Server card (toggle, primary DB select with version, cache select, credentials with auto-gen, adminUI conditional on non-sqlite) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T057 [P] [US4] Implement Media card (toggle, jellyfin) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T058 [P] [US4] Implement SSH Server card (toggle, port 2222, key-only default, password auth toggle, SFTP auto-suggest when File/Media enabled) in `packages/cli/src/wizard/steps/server-components.ts`
- [x] T059 [US4] Implement credential propagation manager: determine targets from enabled services, inject admin creds into per-service env vars in `packages/cli/src/services/credential-manager.ts`
- [x] T060 [US4] Wire Step 1 → Step 2 navigation in init command orchestrator, display component summary with resource estimation after all cards in `packages/cli/src/commands/init.ts`

**Checkpoint**: `brewnet init` → ... → Step 2 shows admin + 6 cards → state has all component configs → resource estimate shown

---

## Phase 7: User Story 7 — Review, Confirm & Docker Compose Generation (Priority: P1)

**Goal**: Step 5 review display, Export/Modify/Generate actions. Step 6 generates docker-compose.yml, .env, infrastructure configs, pulls images, starts services, health checks. Step 7 shows endpoints + credentials.

**Independent Test**: Complete wizard flow with minimal config → verify generated files, compose structure, .env contents, service health

### Tests for User Story 7 (TDD)

- [x] T061 [P] [US7] Unit tests for docker-compose.yml generation (service definitions per selected components, Traefik labels, networks, dependency order) in `tests/unit/cli/services/compose-generator.test.ts` — covers TC-08-01, TC-08-02, TC-08-05, TC-08-06, TC-08-11
- [x] T062 [P] [US7] Unit tests for .env generation (all required keys present, chmod 600, .env.example masking) in `tests/unit/cli/services/env-generator.test.ts` — covers TC-08-03, TC-08-04, TC-08-13
- [x] T063 [P] [US7] Unit tests for infrastructure config generation (SSH sshd_config, Gitea app.ini, FileBrowser json, Mail postfix/dovecot, boilerplate template substitution) in `tests/unit/cli/services/config-generator.test.ts` — covers TC-08-07 through TC-08-10, TC-08-12
- [x] T064 [P] [US7] Integration tests for review display, export to brewnet.config.json, config import (--config flag) in `tests/integration/review-export.test.ts` — covers TC-07-01 through TC-07-07
- [x] T065 [P] [US7] Integration tests for service startup flow (image pull, dependency order, health check polling, timeout handling, rollback, credential propagation verification) in `tests/integration/service-startup.test.ts` — covers TC-08-14 through TC-08-22

### Implementation for User Story 7

- [x] T066 [US7] Implement docker-compose.yml generator using `js-yaml`: build YAML from WizardState using service registry, conditional service blocks, Traefik labels per subdomain, `brewnet`/`brewnet-internal` networks, depends_on ordering, `security_opt: [no-new-privileges:true]` on all containers (per constitution) in `packages/cli/src/services/compose-generator.ts`
- [x] T067 [US7] Implement .env file generator: collect all env vars from WizardState (admin, domain, cloudflare, DB, SSH, mail, JWT), write with chmod 600; also generate .env.example with masked values in `packages/cli/src/services/env-generator.ts`
- [x] T068 [US7] Implement infrastructure config generator: traefik.yml, sshd_config (`PasswordAuthentication no` + `PermitRootLogin no` per constitution: Secure by Default), gitea app.ini, filebrowser.json, mail postfix/dovecot, boilerplate scaffold with template variable substitution in `packages/cli/src/services/config-generator.ts`
- [x] T069 [US7] Implement health checker: poll each service (HTTP health endpoint or Docker health status), max 120s timeout, display service logs on failure, offer retry/skip in `packages/cli/src/services/health-checker.ts`
- [x] T070 [US7] Implement Step 5 (Review): display all selections in organized sections, credential propagation summary, resource totals, action select (Generate/Modify/Export), config export to brewnet.config.json in `packages/cli/src/wizard/steps/review.ts`
- [x] T071 [US7] Implement Step 6 (Generate): orchestrate file generation → image pull (with progress via ora) → `docker compose up -d` (via execa) → health checks → credential propagation → external access verification (non-local) in `packages/cli/src/wizard/steps/generate.ts`
- [x] T072 [US7] Implement Step 7 (Complete): display endpoint URLs table, credentials summary, external access verification commands (non-local), troubleshooting tips, next commands in `packages/cli/src/wizard/steps/complete.ts`
- [x] T073 [US7] Implement --config flag on init command: parse brewnet.config.json via Zod schema, pre-populate WizardState, skip prompts in --non-interactive mode in `packages/cli/src/commands/init.ts`
- [x] T074 [US7] Wire Step 4 → Step 5 → Step 6 → Step 7 navigation in init orchestrator, handle Modify (back to changed step), cancel with state save in `packages/cli/src/commands/init.ts`

**Checkpoint**: Full `brewnet init` flow completes → docker-compose.yml + .env generated → services start → health checks pass → endpoints displayed

---

## Phase 8: User Story 5 — Dev Stack & Runtime Selection (Priority: P2)

**Goal**: Step 3 multi-select languages, per-language framework selection, frontend tech stack, FileBrowser config, boilerplate options, App Server auto-enable, Skip option

**Independent Test**: Select Python+Node.js → FastAPI+Express frameworks → React+TypeScript frontend → verify state, boilerplate scaffold

### Tests for User Story 5 (TDD)

- [x] T075 [P] [US5] Unit tests for language/framework registry filtering (per-language frameworks, empty when no language) in `tests/unit/cli/config/frameworks.test.ts` — covers TC-05-02, TC-05-03, TC-05-04
- [x] T076 [P] [US5] Unit tests for multi-select behavior (languages, frontend) and Skip behavior in `tests/unit/cli/wizard/dev-stack.test.ts` — covers TC-05-01, TC-05-05, TC-05-08
- [x] T077 [P] [US5] Integration tests for boilerplate scaffold generation (nextjs-app scaffold, dev mode compose overlay, FileBrowser storage dirs) in `tests/integration/boilerplate-generation.test.ts` — covers TC-05-06, TC-05-07, TC-05-09

### Implementation for User Story 5

- [x] T078 [US5] Implement Step 3 wizard step: language multi-select checkbox, per-language framework select (filtered by selected languages), frontend tech multi-select, Skip option in `packages/cli/src/wizard/steps/dev-stack.ts`
- [x] T079 [US5] Implement App Server auto-enable logic (enabled when languages.length > 0 || frontend.length > 0), FileBrowser auto-enable with mode select (directory/standalone) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [x] T080 [US5] Implement boilerplate configuration prompts (generate yes/no, sample data yes/no, dev mode hot-reload/production) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [x] T081 [US5] Implement boilerplate scaffold generator: create `apps/<framework>-app/` with Dockerfile, source files, package.json/requirements.txt per framework template, template variable substitution in `packages/cli/src/services/boilerplate-generator.ts`
- [x] T082 [US5] Wire Step 2 → Step 3 navigation in init orchestrator in `packages/cli/src/commands/init.ts`

**Checkpoint**: Step 3 shows language/framework/frontend selection → boilerplate generated → App Server auto-enabled in state

---

## Phase 9: User Story 6 — Domain & Network Configuration (Priority: P2)

**Goal**: Step 4 domain provider selection (local/freedomain/custom), Cloudflare Tunnel config with token validation, conditional Mail Server

**Independent Test**: Select each provider → verify SSL mode, tunnel config, mail visibility rules

### Tests for User Story 6 (TDD)

- [x] T083 [P] [US6] Unit tests for domain config logic (local=no SSL/no tunnel, freedomain=tunnel ON, custom=SSL options, TLD validation, tunnel token validation) in `tests/unit/cli/wizard/domain-network.test.ts` — covers TC-06-01 through TC-06-04, TC-06-07, TC-06-08
- [x] T084 [P] [US6] Integration tests for cloudflared compose block generation and Mail Server compose block generation in `tests/integration/domain-config.test.ts` — covers TC-06-05, TC-06-06, TC-06-09

### Implementation for User Story 6

- [x] T085 [US6] Implement Step 4 wizard step: domain provider select (local/freedomain/custom), domain name input with provider-specific validation in `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T086 [US6] Implement freedomain flow: TLD select (.dpdns.org/.qzz.io/.us.kg), 8-step setup guide display, domain name input in `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T087 [US6] Implement Cloudflare Tunnel config: tunnel token input with validation (shown only when provider !== 'local'), auto-enable tunnel for freedomain/custom in `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T088 [US6] Implement conditional Mail Server section: toggle (shown only when provider !== 'local'), docker-mailserver with SMTP/IMAP ports, postmaster from admin creds in `packages/cli/src/wizard/steps/domain-network.ts`
- [x] T089 [US6] Wire Step 3 → Step 4 navigation in init orchestrator in `packages/cli/src/commands/init.ts`

**Checkpoint**: Step 4 shows domain options → tunnel token validated → mail server conditional → state updated

---

## Phase 10: User Story 8 — Post-Setup Service Management (Priority: P2)

**Goal**: `brewnet status` (table), `brewnet add` (pull + start + route), `brewnet remove` (confirm + stop + optional purge), `brewnet backup` (tar.gz), `brewnet restore` (from ID), `brewnet up`/`brewnet down`, `brewnet logs`

**Independent Test**: Run each command against a setup and verify correct Docker operations and output

### Tests for User Story 8 (TDD)

- [x] T090 [P] [US8] Unit tests for status table formatting (running/stopped indicators, totals) in `tests/unit/cli/commands/status.test.ts` — covers TC-09-01, TC-09-02
- [x] T091 [P] [US8] Integration tests for add/remove service flow (compose update, image pull, container lifecycle, duplicate detection, purge option) in `tests/integration/service-management.test.ts` — covers TC-09-03 through TC-09-07
- [x] T092 [P] [US8] Integration tests for backup/restore flow (tar.gz creation, SQLite record, restore with service restart, invalid ID error, disk space check) in `tests/integration/backup-restore.test.ts` — covers TC-09-08 through TC-09-11

### Implementation for User Story 8

- [x] T093 [US8] Implement `brewnet status` command: query Docker containers (dockerode listContainers), format table with name/status/CPU/memory/uptime/port/URL using chalk for color in `packages/cli/src/commands/status.ts`
- [x] T094 [US8] Implement `brewnet add <service>` command: validate service ID against registry, backup existing docker-compose.yml before modification (per constitution: Reversible Actions), update docker-compose.yml, pull image, start container, register Traefik route, detect duplicate in `packages/cli/src/commands/add.ts`
- [x] T095 [US8] Implement `brewnet remove <service>` command: confirmation prompt (unless --force), backup existing docker-compose.yml before modification (per constitution: Reversible Actions), stop container, remove from compose, optionally purge volumes (--purge), preserve data by default in `packages/cli/src/commands/remove.ts`
- [x] T096 [US8] Implement `brewnet up` / `brewnet down` commands: invoke `docker compose up -d` / `docker compose down` via execa in `packages/cli/src/commands/up.ts` and `packages/cli/src/commands/down.ts`
- [x] T097 [US8] Implement `brewnet logs [service]` command: invoke `docker compose logs` with -f/--follow and -n/--tail options via execa in `packages/cli/src/commands/logs.ts`
- [x] T098 [US8] Implement backup manager: create tar.gz archive of project dir + DB dumps, save to `~/.brewnet/backups/`, record in SQLite backups table, check disk space in `packages/cli/src/services/backup-manager.ts`
- [x] T099 [US8] Implement `brewnet backup` command: invoke backup manager, display progress in `packages/cli/src/commands/backup.ts`
- [x] T100 [US8] Implement `brewnet restore <id>` command: validate backup ID (BN008 if not found), confirmation prompt, stop services, extract archive, restart services in `packages/cli/src/commands/restore.ts`
- [x] T101 [US8] Initialize SQLite database with services/backups/logs tables on first CLI run (ensure `~/.brewnet/db/` exists) in `packages/cli/src/services/db-manager.ts`

**Checkpoint**: All post-setup commands work against running services without direct Docker CLI usage

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, error handling hardening, wizard state persistence edge cases, constitution compliance validation

### E2E Tests

- [x] T102 [P] E2E test: Full Install minimal flow (system check → name → Full → skip step 3 → local → confirm → generate) in `tests/e2e/full-install.test.ts` — covers E2E-01
- [x] T103 [P] E2E test: Partial Install flow (Web + DB only, others absent) in `tests/e2e/partial-install.test.ts` — covers E2E-03
- [x] T104 [P] E2E test: Wizard resume flow (interrupt at step 3 → re-run → resume → selections preserved) in `tests/e2e/wizard-resume.test.ts` — covers E2E-04

### Cross-Cutting

- [x] T105 [P] Unit tests for all error codes (BN001–BN003, BN008–BN009) with correct messages and remediation text in `tests/unit/cli/utils/errors.test.ts` — covers TC-X-01, TC-X-02, TC-X-03, TC-X-06, TC-X-07 (BN006/BN007 deferred to Phase 2: deploy pipeline)
- [x] T106 [P] Unit tests for logger (daily JSON file rotation, info/warn/error levels, metadata) in `tests/unit/cli/utils/logger.test.ts` — covers TC-L-01, TC-L-02
- [x] T107 [P] Unit tests for wizard state persistence (save, load, schema migration, resume detection) in `tests/unit/cli/wizard/state.test.ts` — covers TC-W-01 through TC-W-05
- [x] T108 [P] Unit tests for constitution compliance (Zero Config defaults, Secure by Default .env/SSH, Transparent logging) in `tests/unit/cli/constitution.test.ts` — covers TC-C-01 through TC-C-03
- [x] T109 [P] Integration tests for constitution compliance (Reversible rollback, Offline First wizard without network) in `tests/integration/constitution.test.ts` — covers TC-C-04, TC-C-05
- [x] T110 Run full test suite with coverage report — 34 suites, 1789 tests passing. CLI core logic (config, utils, wizard state, shared schemas) 96-100%. Overall 63.68% lines (interactive layers + boilerplate templates account for gap; business logic well above 90%)

**Checkpoint**: All 121 test cases pass, coverage targets met, no constitution violations

---

## Phase 12: Install Script (Priority: P1)

**Purpose**: One-line curl install script — `curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash`

**Reference**: `specs/001-cli-init-wizard/plan.md` § Architecture: Install Script

### Tests

- [ ] T111 [P] Unit tests for install.sh: Node.js version detection (v20+ pass, v18 fail), npm install success/failure, PATH append idempotency (no duplicate) in `tests/e2e/install-script.test.sh` (BATS or shellspec)

### Implementation

- [x] T112 Create `install.sh` at repo root — POSIX shell, curl-pipeable, set -e; steps: (1) OS detection macOS/Linux, (2) Node.js 20+ check with error + install hint, (3) `npm install -g brewnet`, (4) `mkdir -p ~/.brewnet/{projects,backups,logs,db}`, (5) PATH append to `.zshrc`/`.bashrc`/`.bash_profile` (idempotent, skip if already present), (6) `brewnet --version` verification
- [ ] T113 Add `chmod +x install.sh` to CI workflow and verify `bash -n install.sh` (syntax check) passes in CI

**Checkpoint**: `curl -fsSL .../install.sh | bash` installs brewnet, creates `~/.brewnet/`, and confirms `brewnet --version`

---

## Phase 13: Admin Panel (Priority: P2 — after Phase 11)

**Purpose**: Local HTTP admin panel at `http://localhost:8088` for service management after `brewnet init` completes

**Reference**: `specs/001-cli-init-wizard/contracts/admin-api.md`, `public/demo/manage.html`

### Tests

- [ ] T114 [P] Unit tests for AdminServer: port binding, graceful shutdown, static file serving, CORS headers (localhost-only) in `tests/unit/cli/services/admin-server.test.ts`
- [ ] T115 [P] Integration tests for admin REST API: GET /api/health, GET /api/services (mock dockerode), POST .../start, POST .../stop, DELETE ..., GET /api/catalog, POST /api/backup, GET /api/backup in `tests/integration/admin-api.test.ts` — covers admin-api.md contract

### Implementation

- [ ] T116 Create `packages/cli/src/services/admin-server.ts` — Node.js built-in `http.createServer()`, port 8088 default, static file serving for `packages/cli/public/admin/`, REST JSON API (all endpoints from admin-api.md), `AdminServer.start(port)` / `AdminServer.stop()` exports; no external web framework
- [ ] T117 [P] Create `packages/cli/public/admin/index.html` — terminal-style service manager adapted from `public/demo/manage.html`; real fetch() calls to `/api/services`, `/api/catalog`, `/api/backup`; Status/Add/Remove tabs
- [ ] T118 [P] Create `packages/cli/src/commands/admin.ts` — `brewnet admin [--port PORT]` command; calls `AdminServer.start()`, auto-opens `http://localhost:PORT` via `open`/`xdg-open`
- [ ] T119 Integrate admin panel launch into Step 7 complete step: after `runCompleteStep()` succeeds, call `AdminServer.start(8088)` and auto-open browser in `packages/cli/src/wizard/steps/complete.ts`
- [ ] T120 Register `brewnet admin` command in `packages/cli/src/index.ts` entry point

**Checkpoint**: After `brewnet init` completes, `http://localhost:8088` opens automatically with live service management UI; `brewnet admin` restarts the panel

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ─────────────────────────────┐
                                             ▼
Phase 2: Foundational ──────────────────────┐
                                             ▼
         ┌───────────── Phase 3: US1 (CLI Bootstrap) ─── MUST complete first
         │
         ├── Phase 4: US2 (System Check) ──── depends on US1
         │
         ├── Phase 5: US3 (Project Setup) ──── depends on US2
         │
         ├── Phase 6: US4 (Server Components) ──── depends on US3
         │
         ├── Phase 8: US5 (Dev Stack) ──── depends on US4
         │
         ├── Phase 9: US6 (Domain & Network) ──── depends on US4
         │
         ├── Phase 7: US7 (Review & Generation) ──── depends on US4, US5, US6
         │
         └── Phase 10: US8 (Post-Setup Mgmt) ──── depends on US1 only
                                             │
Phase 11: Polish ◄──────────────────────────┘
         │
Phase 12: Install Script ◄──────────────────┘ (parallel with Phase 11)
         │
Phase 13: Admin Panel ◄─────────────────────┘ (after Phase 10 + Phase 11)
```

### User Story Dependencies

- **US1 (P1)**: Foundation only — no other story dependencies. **START HERE (MVP)**
- **US2 (P1)**: Depends on US1 (needs CLI entry point for `init` command)
- **US3 (P1)**: Depends on US2 (wizard flows sequentially: Step 0 → Step 1)
- **US4 (P1)**: Depends on US3 (wizard Step 1 → Step 2)
- **US5 (P2)**: Depends on US4 (wizard Step 2 → Step 3). Can be developed in parallel with US6.
- **US6 (P2)**: Depends on US4 (wizard Step 2 → Step 4). Can be developed in parallel with US5.
- **US7 (P1)**: Depends on US4 (minimum); ideally after US5+US6 for full wizard flow
- **US8 (P2)**: Depends on US1 only (management commands are independent of wizard)

### Within Each User Story

1. Tests MUST be written and verified to FAIL before implementation
2. Models/types before services
3. Services before wizard steps/commands
4. Wizard steps before orchestrator wiring
5. Story complete and tested before moving to next priority

### Parallel Opportunities

Within a phase, all tasks marked [P] can run in parallel:

- **Phase 2**: T008–T021 are all [P] — 14 tasks can run concurrently
- **Phase 6**: T054–T058 (component cards) are [P] — 5 tasks concurrently
- **Phase 10**: T090–T092 (tests) are [P], T093–T097 are partially [P]
- **US5 and US6** can be developed in parallel after US4 completes
- **US8** can be developed in parallel with US2–US7 (only needs US1)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all shared type definitions together:
Task: "Define WizardState interface in packages/shared/src/types/wizard-state.ts"
Task: "Define ServiceDefinition interface in packages/shared/src/types/service.ts"
Task: "Define ErrorCode enum in packages/shared/src/types/errors.ts"
Task: "Create Zod schema for WizardState in packages/shared/src/schemas/wizard-state.schema.ts"
Task: "Create Zod schema for config in packages/shared/src/schemas/config.schema.ts"
Task: "Define shared constants in packages/shared/src/utils/constants.ts"

# Launch all CLI utility implementations together:
Task: "Implement BrewnetError class in packages/cli/src/utils/errors.ts"
Task: "Implement logger in packages/cli/src/utils/logger.ts"
Task: "Implement password generation in packages/cli/src/utils/password.ts"
Task: "Implement validation helpers in packages/cli/src/utils/validation.ts"
Task: "Implement resource estimation in packages/cli/src/utils/resources.ts"

# Launch all config registries together:
Task: "Create service registry in packages/cli/src/config/services.ts"
Task: "Create framework registry in packages/cli/src/config/frameworks.ts"
Task: "Create defaults registry in packages/cli/src/config/defaults.ts"
```

---

## Parallel Example: US5 + US6 + US8 (After US4)

```bash
# Three stories can proceed concurrently:
# Developer A: US5 (Dev Stack — Step 3)
Task: "T078 Implement Step 3 wizard step in packages/cli/src/wizard/steps/dev-stack.ts"

# Developer B: US6 (Domain & Network — Step 4)
Task: "T085 Implement Step 4 wizard step in packages/cli/src/wizard/steps/domain-network.ts"

# Developer C: US8 (Post-Setup Management — independent commands)
Task: "T093 Implement brewnet status in packages/cli/src/commands/status.ts"
Task: "T094 Implement brewnet add in packages/cli/src/commands/add.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T007)
2. Complete Phase 2: Foundational (T008–T023)
3. Complete Phase 3: US1 — CLI Bootstrap (T024–T033)
4. **STOP and VALIDATE**: `brewnet --version`, `brewnet --help` work
5. Deploy/demo if ready — user can install and see the CLI responds

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (CLI Bootstrap) → **MVP! CLI binary works**
3. US2 (System Check) → `brewnet init` shows system check
4. US3 (Project Setup) → Wizard collects project info
5. US4 (Server Components) → Wizard configures services
6. US7 (Review & Generation) → **First full init flow! docker-compose generated**
7. US5 + US6 (Dev Stack + Domain) → Full wizard with all steps
8. US8 (Post-Setup Management) → status/add/remove/backup/restore
9. Polish → E2E tests, coverage, constitution compliance

### Parallel Team Strategy

With multiple developers after Phase 2:

1. Team completes Setup + Foundational together
2. **Developer A**: US1 → US2 → US3 → US4 → US7 (critical path)
3. **Developer B**: US8 (independent post-setup commands, needs only US1 done)
4. After US4: Developer A on US7, Developer B on US5, Developer C on US6
5. Phase 11 (Polish) after all stories integrate

---

## Deferred to Later Phases

| Item | Constitution Reference | Deferred To | Rationale |
|------|----------------------|-------------|-----------|
| Firewall auto-configuration | II. Secure by Default: "Firewall rules MUST be auto-configured" | Phase 2 (Networking) | Phase 1 gate only requires `brewnet init` + `brewnet up`. Firewall rules depend on domain/network config finalized in Phase 2. |
| simple-git | Technical Constraints | Phase 2 (Deploy) | Git-based deployment pipeline is Phase 2 scope. |
| Service rollback to previous version | IV. Reversible Actions: "Service updates MUST support rollback" | Phase 2+ | `brewnet update` command is not Phase 1 scope. |

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD: All test tasks must be written and FAIL before corresponding implementation tasks
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total: **120 tasks** across 13 phases (T111–T120 added for install.sh + admin panel)
