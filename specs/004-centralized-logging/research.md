# Research: Centralized Logging System

**Feature**: 004-centralized-logging
**Date**: 2026-03-15

## R1: Docker json-file Log Driver Configuration

**Decision**: Use Docker's built-in `json-file` log driver with `max-size: 10m` and `max-file: 3` per container.

**Rationale**: The json-file driver is Docker's default and requires no additional infrastructure. It supports automatic rotation via max-size/max-file options. At 3×10MB per container, a 10-service deployment uses ~300MB for Docker logs — well within the 700MB total budget.

**Alternatives considered**:
- `local` driver: Better compression but less portable, not available on older Docker versions
- `syslog`/`journald`: Requires host-level syslog configuration, violates Zero Config principle
- Loki driver: Requires Loki container, violates "zero additional containers" constraint

## R2: Traefik Access Log Format and Field Selection

**Decision**: JSON format with `bufferingsize=100`, dropping all headers by default and keeping only `User-Agent` and `X-Forwarded-For`.

**Rationale**: JSON format enables direct parsing by the log-aggregator without regex. Buffering (100 lines) reduces disk I/O. Dropping headers by default follows Secure by Default principle — prevents accidental credential/cookie leakage into logs while keeping the two most useful diagnostic headers.

**Alternatives considered**:
- CLF (Common Log Format): Human-readable but requires regex parsing, less structured
- Keep all headers: Privacy/security risk, bloats log files
- No buffering: Higher disk I/O on busy servers

## R3: Log Aggregator Read-Time vs Collection Architecture

**Decision**: Read-time aggregation — the aggregator reads from all 4 sources on each query, with no background daemon.

**Rationale**: Home servers have low log volume (compared to enterprise). Read-time aggregation avoids a background process, reduces complexity, and aligns with Offline First principle (no daemon to crash/restart). The 2-second performance target (SC-002) is achievable for 10k entries with file scanning.

**Alternatives considered**:
- Background collector writing to SQLite: More complex, requires daemon management, but enables faster queries
- Tailing with inotify: Real-time but adds OS-specific dependency and daemon requirement

## R4: copytruncate Rotation Strategy for Tunnel/Access Logs

**Decision**: Use copytruncate (copy file then truncate original) with max 50MB × 5 rotated copies.

**Rationale**: Traefik and tunnel-logger hold open file handles. Standard rename-based rotation would cause the writing process to lose its file descriptor. copytruncate preserves the original file's inode so writers continue without interruption. This is the same strategy used by logrotate's `copytruncate` directive.

**Alternatives considered**:
- SIGHUP-based rotation: Requires access to container process, not feasible for Traefik inside Docker
- Rename + reopen: Would require Traefik restart to pick up new file
- Size-only check without rotation: Disk would fill unbounded

## R5: Docker Container Log Reading via dockerode

**Decision**: Use `container.logs()` API with `stdout: true, stderr: true, timestamps: true, tail: N` options. Parse the multiplexed stream by handling the 8-byte header per Docker stream protocol.

**Rationale**: dockerode is already a project dependency (used in admin-server.ts L18, L583). The container.logs() API returns a multiplexed stream where each frame has an 8-byte header: byte 0 is stream type (0=stdin, 1=stdout, 2=stderr), bytes 4-7 are frame size (big-endian uint32). stdout maps to `level: 'info'`, stderr maps to `level: 'error'`.

**Alternatives considered**:
- `docker compose logs` via execa: Text-only output, harder to parse, no programmatic access to individual container logs
- Reading Docker's json-file logs directly from `/var/lib/docker/containers/`: Requires root access, path varies by platform

## R6: ComposeService Interface Extension Strategy

**Decision**: Add optional `logging?: ComposeLogging` field to existing `ComposeService` interface. Apply via `getLoggingConfig()` helper called in `buildComposeService()`.

**Rationale**: Making the field optional ensures zero breaking changes to existing code that constructs `ComposeService` objects. The helper function pattern follows the existing conventions (`getServiceVolumes()`, `getServicePorts()`, `getServiceEnvironment()`). Tests that check specific fields via `toHaveProperty()` or `toMatch()` will not break.

**Alternatives considered**:
- Required field: Would break any code that constructs ComposeService without logging
- Post-processing pass: Would add logging after service construction, but splits related logic

## R7: Admin Panel Logs Tab vs Existing #log Div

**Decision**: Add a new "Logs" tab alongside existing "Services" tab in the dashboard. Keep the existing `#log` div as "Activity" for in-session operation logs.

**Rationale**: The existing `#log` div serves a different purpose — it shows real-time actions performed in the current admin session (start/stop containers, install services). The new Logs tab shows aggregated historical logs from all sources. Merging them would conflate two different UX needs.

**Alternatives considered**:
- Replace #log entirely: Would lose real-time action feedback
- Embed logs within Services tab: Would make the page too long and conflate concerns

## R8: CLI --since Duration Parser

**Decision**: Simple regex parser supporting `Nh` (hours), `Nm` (minutes), `Nd` (days), and ISO 8601 date strings. No external dependency.

**Rationale**: The supported formats cover 95%+ of use cases. A regex `/^(\d+)([hmd])$/` handles duration shorthand. Anything not matching is passed to `new Date()` for ISO parsing. Invalid values result in a clear error message with examples.

**Alternatives considered**:
- `ms` npm package: Adds a dependency for minimal gain
- `dayjs`/`date-fns`: Overkill for duration parsing
- Full cron-style expressions: Over-engineered for log filtering
