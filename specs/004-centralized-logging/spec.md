# Feature Specification: Centralized Logging System

**Feature Branch**: `004-centralized-logging`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "Centralized logging system — unify 4 log sources (CLI, Tunnel, Traefik access, Docker containers) into a single queryable interface via Admin Panel and CLI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Log Viewing via CLI (Priority: P1)

A server administrator wants to view logs from all sources in one place via the CLI to quickly diagnose issues without switching between multiple log files and tools.

**Why this priority**: This is the core value proposition — without unified log aggregation, every other feature (UI, filtering, rotation) has no foundation. The CLI is the primary interface for Brewnet operators.

**Independent Test**: Can be fully tested by running `brewnet logs --all` and verifying that entries from CLI JSONL, Tunnel NDJSON, Traefik access log, and Docker container logs appear together, sorted by timestamp.

**Acceptance Scenarios**:

1. **Given** a running Brewnet project with multiple services, **When** the user runs `brewnet logs --all`, **Then** log entries from all 4 sources are displayed in reverse chronological order with source labels.
2. **Given** a running project, **When** the user runs `brewnet logs --source access --level error`, **Then** only Traefik access log entries with HTTP status >= 500 are displayed.
3. **Given** a running project, **When** the user runs `brewnet logs --since 1h --json`, **Then** only entries from the last hour are output as JSON lines.
4. **Given** no new CLI flags are used (`brewnet logs` or `brewnet logs -f`), **When** the user runs the command, **Then** the existing `docker compose logs` behavior is preserved exactly.

---

### User Story 2 - Docker Log Rotation & Access Logging (Priority: P1)

A server administrator needs Docker container logs to be automatically rotated to prevent disk exhaustion, and needs HTTP access logs from Traefik to track who accessed which service and when.

**Why this priority**: Without log rotation, long-running home servers fill their disks. Without access logging, there is no record of external requests. Both are prerequisites for the aggregator to have meaningful data.

**Independent Test**: Can be tested by generating a docker-compose.yml and verifying that all services include the `logging` configuration with json-file driver and size limits, and that Traefik includes access log flags and volume mount.

**Acceptance Scenarios**:

1. **Given** any Brewnet project, **When** docker-compose.yml is generated, **Then** every service has a `logging` section with `driver: json-file`, `max-size: 10m`, and `max-file: 3`.
2. **Given** a project with Traefik as web server, **When** docker-compose.yml is generated, **Then** Traefik's command includes access log flags (`--accesslog=true`, `--accesslog.filepath=/logs/access.log`, `--accesslog.format=json`, `--accesslog.bufferingsize=100`) and a `./logs:/logs` volume mount.
3. **Given** a running project with Traefik, **When** an HTTP request hits any service, **Then** a JSON log entry is written to `<projectPath>/logs/access.log` containing timestamp, client address, request method/path, status code, and router name.
4. **Given** a long-running container, **When** its log output exceeds 10MB, **Then** Docker automatically rotates the log file, keeping at most 3 files (30MB total per container).

---

### User Story 3 - Admin Panel Log Viewer (Priority: P2)

A server administrator wants to view and filter logs from the web dashboard without needing terminal access, especially when managing the server remotely.

**Why this priority**: The Admin Panel is the secondary interface. While CLI covers power users, the dashboard serves users who prefer a graphical interface. It depends on the Log Aggregator (P1) being complete.

**Independent Test**: Can be tested by opening the Admin Panel, navigating to the Logs tab, and verifying that logs from all sources appear with working filter controls and auto-refresh.

**Acceptance Scenarios**:

1. **Given** the Admin Panel is open, **When** the user clicks the "Logs" tab, **Then** a log viewer displays the most recent 100 log entries from all sources.
2. **Given** the Logs tab is active, **When** the user selects "Access" from the source filter, **Then** only Traefik access log entries are displayed.
3. **Given** the Logs tab is active with auto-refresh enabled, **When** 5 seconds elapse, **Then** new log entries are fetched and prepended to the log view.
4. **Given** the Logs tab is active, **When** the user selects "error" from the level filter and a specific service from the service dropdown, **Then** only error-level entries for that service are shown.

---

### User Story 4 - Log Rotation for Non-Docker Sources (Priority: P2)

A server administrator expects that all log files (not just Docker containers) are automatically managed to prevent disk exhaustion during long-term operation.

**Why this priority**: Complements Docker's built-in rotation (P1) by covering CLI, Tunnel, and Traefik access logs. Important for production reliability but not blocking core functionality.

**Independent Test**: Can be tested by creating oversized log files and verifying that rotation is triggered — CLI logs older than 30 days are deleted, and Tunnel/Access logs exceeding 50MB are rotated with copytruncate.

**Acceptance Scenarios**:

1. **Given** CLI log files older than 30 days exist, **When** the logger is initialized, **Then** those old log files are deleted.
2. **Given** the tunnel.log file exceeds 50MB, **When** the aggregator reads logs, **Then** the file is rotated using copytruncate, keeping at most 5 rotated copies.
3. **Given** the access.log file exceeds 50MB, **When** the aggregator reads logs, **Then** the file is rotated using copytruncate, keeping at most 5 rotated copies.
4. **Given** a project with 10 services running for extended periods, **When** all log sources are at their maximum, **Then** total disk usage does not exceed approximately 700MB.

---

### Edge Cases

- What happens when a log file is empty or does not exist? The aggregator returns an empty array for that source without errors.
- What happens when Docker daemon is not running? The service log reader gracefully skips Docker container logs and returns entries from file-based sources only.
- What happens when log files contain malformed JSON lines? The aggregator skips unparseable lines and continues processing, logging a warning for each skipped line.
- What happens when the user specifies an invalid `--since` value? The CLI displays a clear error message with usage examples (e.g., `1h`, `30m`, `1d`, `2026-03-01`).
- What happens when `--all` and a specific service argument are used together? The `--all` flag takes precedence, showing all sources filtered by that service name.
- What happens when the logs directory does not exist? The aggregator creates it if needed or returns empty results without crashing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate docker-compose.yml with `logging` configuration (json-file driver, max-size 10MB, max-file 3) for every service.
- **FR-002**: System MUST configure Traefik to write HTTP access logs in JSON format to `<projectPath>/logs/access.log`.
- **FR-003**: System MUST define shared types (UnifiedLogEntry, LogQuery, LogQueryResult, LogStats) in the shared package for use by both CLI and Admin Panel.
- **FR-004**: System MUST provide a Log Aggregator module that reads and unifies logs from 4 sources: CLI JSONL, Tunnel NDJSON, Traefik access log, and Docker container logs.
- **FR-005**: The Log Aggregator MUST support filtering by source, level, service, time range, and text search.
- **FR-006**: The Log Aggregator MUST sort all entries by timestamp in descending order (newest first) and support pagination (limit + offset).
- **FR-007**: System MUST convert Traefik access log HTTP status codes to log levels: >= 500 → error, >= 400 → warn, others → info.
- **FR-008**: System MUST rotate CLI log files by deleting entries older than 30 days.
- **FR-009**: System MUST rotate Tunnel and Access log files using copytruncate strategy (50MB max, 5 rotated copies).
- **FR-010**: The Admin Panel MUST provide a Logs tab with source, level, and service filter controls.
- **FR-011**: The Admin Panel MUST expose `/api/logs` and `/api/logs/stats` endpoints returning structured log data.
- **FR-012**: The Admin Panel Logs tab MUST auto-refresh every 5 seconds (with a toggle to disable).
- **FR-013**: The `brewnet logs` CLI command MUST support `--all`, `--source` (single value: cli|tunnel|access|service), `--level`, `--since`, and `--json` options. To view all sources, use `--all`.
- **FR-014**: The `brewnet logs` CLI command MUST preserve existing behavior (delegating to `docker compose logs`) when none of the new options are specified.
- **FR-015**: The Log Aggregator MUST gracefully handle missing files, empty files, malformed JSON lines, and unavailable Docker daemon without crashing.

### Key Entities

- **UnifiedLogEntry**: A normalized log record with timestamp (ISO 8601), source (cli/tunnel/access/service), level (info/warn/error/debug), optional service name, message text, and arbitrary metadata.
- **LogQuery**: A filter/pagination specification with optional source list, service list, level list, time range (since/until), result limit (default 100, max 1000), offset, and text search term.
- **LogQueryResult**: A paginated response containing an array of UnifiedLogEntry, total count, and hasMore flag.
- **LogStats**: Aggregated statistics including total count, counts by source, counts by level, recent error entries, and last-updated timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view logs from all 4 sources in a single unified view (CLI or Admin Panel) without manually opening individual log files.
- **SC-002**: Log filtering by source, level, service, and time range returns relevant results within 2 seconds for up to 10,000 log entries.
- **SC-003**: Total disk usage for all log sources does not exceed 700MB for a deployment with 10 services running continuously.
- **SC-004**: Existing `brewnet logs` users experience zero behavior change when not using new options — backward compatibility is fully preserved.
- **SC-005**: The Admin Panel Logs tab displays new log entries within 10 seconds of their creation (one polling cycle + processing).
- **SC-006**: No log file grows unbounded — every source has a defined rotation strategy that caps storage automatically.
- **SC-007**: The system handles degraded conditions (missing files, offline Docker, malformed data) without crashing, returning partial results from available sources.

## Assumptions

- Traefik is always the web server when access logging is enabled (Brewnet defaults to Traefik).
- The `<projectPath>/logs/` directory already exists at compose generation time (confirmed: `generate.ts` creates it at L208-209 and L569-570).
- Docker daemon is expected to be running for service log reading, but its absence is handled gracefully.
- The existing in-memory activity log (`#log` div) in the Admin Panel is preserved as-is and coexists with the new Logs tab.
- Log aggregation is performed at read time (no background collection daemon), which is suitable for home server scale.
- The `--since` duration parser supports shorthand formats: `Nh` (hours), `Nm` (minutes), `Nd` (days), and ISO 8601 date strings.

## Clarifications

### Session 2026-03-15

- Q: `--source` 플래그가 단일 값만 허용하는가, 다중 값(쉼표 구분 또는 반복 플래그)을 지원하는가? → A: 단일 값만 허용 (`--source access`). 전체 소스 조회는 `--all` 사용.
