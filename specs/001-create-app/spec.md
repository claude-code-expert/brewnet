# Feature Specification: Brewnet Create-App — App Scaffolding Command

**Feature Branch**: `001-create-app`
**Created**: 2026-03-02
**Status**: Draft
**Input**: Add brewnet create-app command to scaffold full-stack apps from 16 pre-built boilerplate stacks

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zero-Config App Scaffold with Interactive Stack Selection (Priority: P1)

A developer wants to start a new project but is not sure which stack to use. They run `brewnet create-app my-project` without any flags. The tool presents a guided menu where they first select a programming language, then a framework. Once selected, the tool automatically downloads the boilerplate, configures environment variables with secure secrets, starts the containerized application, and confirms it is running by checking its health endpoint. The developer ends up with a working, runnable project in their current directory without writing a single line of configuration.

**Why this priority**: This is the primary value proposition. A developer can go from zero to a running full-stack application in a single command. It unlocks the feature's core benefit — zero-config project scaffolding — and is the most common entry point for new users.

**Independent Test**: Run `brewnet create-app demo-app` on a clean machine with Docker installed. The interactive prompts appear, language and framework can be selected, and within 2 minutes (non-Rust stacks) a running application is accessible at a printed URL with no manual steps required.

**Acceptance Scenarios**:

1. **Given** a developer has Docker running and runs `brewnet create-app my-project` without `--stack`, **When** the command executes, **Then** the tool presents a language selection menu followed by a framework selection menu filtered to that language.
2. **Given** the developer selects a language and framework, **When** selection is confirmed, **Then** the tool downloads the boilerplate, generates environment variables, starts containers, and prints a success message with accessible URLs — all without the developer entering any further input.
3. **Given** the containers start successfully, **When** the tool verifies the application, **Then** it confirms the app responds at the expected URL and prints the project directory path and management commands.

---

### User Story 2 - Direct Stack Specification for Power Users (Priority: P2)

A developer already knows exactly which stack they need (e.g., `go-gin` or `python-fastapi`) and wants to skip the interactive menu. They run `brewnet create-app my-api --stack go-gin` and the tool proceeds directly to scaffolding without any prompts. They get the same zero-configuration experience but faster, suitable for automated scripts or CI environments.

**Why this priority**: Power users and CI pipelines need fully non-interactive execution. Without this, the tool cannot be used in scripts or when the desired stack is already known, which limits its utility.

**Independent Test**: Run `brewnet create-app test-api --stack nodejs-express` in a script (non-interactive shell). The command completes without any prompts, all steps execute sequentially, and the final success URL is printed to stdout.

**Acceptance Scenarios**:

1. **Given** a developer runs `brewnet create-app my-api --stack go-gin`, **When** the command executes, **Then** no interactive prompts appear and the scaffolding proceeds immediately.
2. **Given** an unknown stack ID is provided via `--stack invalid-id`, **When** the command executes, **Then** the tool rejects the command immediately with a clear error listing the 16 valid stack identifiers.
3. **Given** a valid `--stack` and `--database` flag are provided, **When** the command executes, **Then** the tool configures the app to use the specified database driver and all secrets are auto-generated without user input.

---

### User Story 3 - Database Driver Selection (Priority: P2)

A developer needs their new project to use PostgreSQL or MySQL instead of the default SQLite. They run `brewnet create-app my-project --stack nodejs-nestjs --database postgres`. The tool configures the project with the specified database, generates a secure database password, and starts both the application container and the corresponding database container together.

**Why this priority**: SQLite is appropriate for quick demos, but real projects need PostgreSQL or MySQL. Allowing database selection at creation time avoids manual environment file editing and ensures credentials are secure from the start.

**Independent Test**: Run `brewnet create-app pg-app --stack nodejs-express --database postgres`. Verify that the app starts with a PostgreSQL container, the health endpoint reports `db_connected: true`, and no database password appears in plain text in any user-visible output.

**Acceptance Scenarios**:

1. **Given** a developer runs `create-app` with `--database postgres`, **When** the app starts, **Then** a PostgreSQL database container is running alongside the backend and the app connects to it successfully.
2. **Given** `--database` flag is omitted, **When** the app starts, **Then** the app uses SQLite with no external database container, and startup completes fastest.
3. **Given** `--database mysql` is provided, **When** the app starts, **Then** a MySQL database container is running and the backend connects to it using auto-generated credentials.
4. **Given** an invalid database driver (e.g., `--database oracle`) is provided, **When** the command executes, **Then** the tool rejects the command with a clear error listing the three valid options: `sqlite3`, `postgres`, `mysql`.

---

### User Story 4 - Rust Stack with Extended Build Warning (Priority: P3)

A developer wants to use a Rust framework. Because Rust compilation takes significantly longer on first build, the tool proactively warns them before starting. After confirmation, the build proceeds with an extended timeout and progress indication so the developer knows the tool is still working and has not hung.

**Why this priority**: Without a clear warning, developers may assume the tool has crashed during a 3–10 minute Rust compilation and force-quit it. A well-informed user tolerates the wait; an uninformed one loses work.

**Independent Test**: Run `brewnet create-app rust-app --stack rust-actix-web --database sqlite3`. Before containers start, a visible warning about build duration appears. The tool waits up to 10 minutes (not 2 minutes) for the health check, and the developer is not prompted for any input during this time.

**Acceptance Scenarios**:

1. **Given** a Rust stack is selected, **When** the tool is about to start the build, **Then** a warning is displayed stating that the first build may take 3–10 minutes due to compilation.
2. **Given** a Rust stack build is in progress, **When** the health check begins, **Then** the timeout is 600 seconds (not the default 120 seconds), and a progress indicator shows elapsed time.
3. **Given** the Rust build completes, **When** the health check passes, **Then** the success message displays the running app URL identically to all other stacks.

---

### User Story 5 - Conflict Detection and Safe Abort (Priority: P3)

A developer accidentally tries to scaffold into a directory that already exists. The tool detects the conflict before downloading anything and exits with a clear, actionable error message explaining what to do.

**Why this priority**: Overwriting an existing project — even accidentally — could destroy work. The tool must never destructively modify pre-existing directories. Early failure is safest.

**Independent Test**: Create a directory called `existing-project`, then run `brewnet create-app existing-project`. Verify the command exits immediately with a non-zero status, an error message naming the conflicting path, and no files downloaded or modified.

**Acceptance Scenarios**:

1. **Given** a directory with the project name already exists, **When** `create-app` is run, **Then** the tool exits immediately with an error before any network requests are made.
2. **Given** Docker is not running or not installed, **When** `create-app` is run, **Then** the tool detects this pre-flight condition and exits with a clear error before downloading anything.

---

### Edge Cases

- What happens when the `brewnet-boilerplate` repository is unreachable (no internet, GitHub down)?
- What happens if Docker runs out of disk space during the image build?
- What happens if ports 3000 or 8080 are already in use on the host machine?
- What happens if the user cancels the command mid-way (Ctrl+C) — are partial directories cleaned up?
- What happens when the health check times out — does the tool leave containers running or tear them down?
- How does the tool handle unified stacks (`nodejs-nextjs*`) that have no separate backend port?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST accept a required `<project-name>` argument that becomes the project directory name.
- **FR-002**: The tool MUST accept an optional `--stack <STACK_ID>` flag allowing selection of any of the 16 supported stacks by their exact identifier.
- **FR-003**: The tool MUST accept an optional `--database <DB_DRIVER>` flag with three valid values: `sqlite3` (default), `postgres`, `mysql`.
- **FR-004**: When `--stack` is not provided, the tool MUST present an interactive two-step selection: first by programming language, then by framework within that language.
- **FR-005**: The tool MUST reject an invalid `--stack` value immediately with an error listing all 16 valid stack identifiers.
- **FR-006**: The tool MUST reject an invalid `--database` value immediately with an error listing the three valid options.
- **FR-007**: The tool MUST fail immediately with a clear error if the target project directory already exists.
- **FR-008**: The tool MUST check that Docker is available and running before proceeding; if not, it MUST exit with a clear, actionable error.
- **FR-009**: The tool MUST download the selected stack as a shallow clone (no full history) into the named project directory.
- **FR-010**: The tool MUST automatically generate a `.env` file from the template provided in the boilerplate, replacing all sensitive credentials (database passwords) with securely generated random values — the user MUST NOT be prompted to enter any credentials.
- **FR-011**: The tool MUST configure the database connection environment variables to match the selected `--database` driver without user interaction. (Distinct from FR-010 which generates random secret values: FR-011 sets structural variables such as `DB_DRIVER`, `PRISMA_DB_PROVIDER`, and `DATABASE_URL` that determine which database engine the application connects to.)
- **FR-012**: The tool MUST start the application containers in detached mode with a fresh image build after scaffolding.
- **FR-013**: The tool MUST poll the application's health endpoint after containers start, waiting up to 120 seconds for non-Rust stacks and up to 600 seconds for Rust stacks.
- **FR-014**: The tool MUST display a visible warning before building Rust stacks, indicating the first build may take 3–10 minutes.
- **FR-015**: The tool MUST verify the application is responding correctly after startup by checking three endpoints: the health endpoint (`GET /health`, must return `status: ok`), the API hello endpoint (`GET /api/hello`, must return a response with a `message` field), and the API echo endpoint (`POST /api/echo` with `{"test":"brewnet"}`, must echo back `{"test":"brewnet"}`).
- **FR-016**: Upon successful startup, the tool MUST display a success summary showing the accessible URL(s), stack name, and basic management commands (`make logs`, `make down`).
- **FR-017**: For unified stacks (`nodejs-nextjs`, `nodejs-nextjs-full`), the tool MUST use port 3000 for all health and API verification — there is no separate backend port.
- **FR-018**: The tool MUST re-initialize the git history in the scaffolded project so the user starts with a clean commit history unconnected to the boilerplate repository.
- **FR-019**: Generated credentials (database passwords) MUST NOT appear in any user-visible output, log, or terminal display.
- **FR-020**: The tool MUST use `127.0.0.1` (not `localhost`) when polling health endpoints to avoid IPv6 resolution failures on Alpine-based containers.

### Key Entities

- **Stack**: One of 16 pre-built application templates identified by a unique `STACK_ID` (e.g., `go-gin`, `nodejs-nextjs`). Attributes: language, framework, unified flag (single port vs. split backend/frontend ports).
- **Project**: A scaffolded application directory created from a stack. Attributes: name, path, selected stack, selected database driver, generated environment configuration.
- **Database Driver**: The storage backend used by the project. Options: `sqlite3` (no external container), `postgres` (external container on port 5433), `mysql` (external container on port 3307).
- **Health Status**: The liveness result for a running stack. Attributes: reachable (boolean), status field value, db_connected field value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with Docker installed can go from running `brewnet create-app` to having a browser-accessible application in under 2 minutes for non-Rust stacks (Go, Java, Kotlin, Node.js, Python), measured on a machine with a broadband internet connection (≥10 Mbps) and Docker image layers not yet cached. Subsequent runs using a cached image may be significantly faster.
- **SC-002**: All 16 stacks successfully pass health check verification (`/health` returns `status: ok`) after the `create-app` command completes.
- **SC-003**: Zero credentials (database passwords, secrets) appear in terminal output or logs at any point during or after the `create-app` command.
- **SC-004**: A developer with no prior knowledge of the stack catalog can select a language and framework through the interactive prompts and arrive at a running application without consulting documentation.
- **SC-005**: Running `create-app` against an already-existing directory name produces an error and exits without downloading any files or modifying any files on disk.
- **SC-006**: The scaffolded project is fully self-contained — running `make up` inside it after `create-app` completes starts the application identically, with no further configuration required.
- **SC-007**: All three database options (`sqlite3`, `postgres`, `mysql`) produce a healthy application where the health endpoint reports `db_connected: true` (or `false` only for SQLite with no active query yet).

## Assumptions

- Docker and Docker Compose are installed on the user's machine; the tool validates this as a pre-flight check.
- The `brewnet-boilerplate` GitHub repository is publicly accessible and the 16 stack branches (`stack/<STACK_ID>`) exist.
- Each stack's `.env.example` file contains all required variable names so the CLI can safely replace values by regex line substitution.
- Port conflicts (8080, 3000, 5433, 3307) on the host machine are treated as a runtime error that the user must resolve; the tool does not attempt automatic port remapping.
- The `create-app` command creates the project in the current working directory; a `--path` override is out of scope for this feature.
- Cloudflare tunnel integration and Brewnet admin panel registration after scaffolding are out of scope for the core `create-app` flow (optional follow-up).
