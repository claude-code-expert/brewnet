# Feature Specification: Cloudflare Tunnel Setup — 4-Scenario Initial Install Flow

**Feature Branch**: `001-cf-tunnel-setup`
**Created**: 2026-02-27
**Status**: Draft
**Input**: User description: "Cloudflare Tunnel Setup Flow — 4-Scenario Initial Install Integration"

---

## Overview

During `brewnet init`, users need to configure external access to their home server. This feature introduces a structured, scenario-aware Cloudflare Tunnel setup flow that covers four distinct user situations — from zero prerequisites (Quick Tunnel) to a fully-automated named tunnel with an existing Cloudflare-managed domain. The feature also adds post-install domain attachment via `brewnet domain connect` for users who defer domain setup.

---

## Clarifications

### Session 2026-02-27

- Q: When Named Tunnel setup fails after tunnel creation in Cloudflare (partial failure), should the CLI automatically delete the orphaned tunnel or leave it for the user to retry? → A: Auto rollback — CLI deletes the created tunnel via Cloudflare API and prompts the user to retry cleanly.
- Q: In Quick Tunnel mode, how are multiple services accessible through a single `*.trycloudflare.com` URL? → A: Path-based routing via Traefik — cloudflared points to Traefik:80, and Traefik routes by URL path prefix (e.g., `/files`, `/git`, `/status`) to each service container.
- Q: When a Cloudflare API call fails mid-setup due to a transient error (network, 5xx), should the CLI auto-retry or fail immediately? → A: Auto-retry up to 3 times with exponential backoff; if all retries are exhausted, execute the auto-rollback (FR-014a) and display a clear error.
- Q: Should tunnel management events be recorded locally for diagnostics? → A: Yes — all domain connect executions, tunnel restarts, status transitions (healthy→degraded), and rollback events are logged with timestamps to `~/.brewnet/logs/tunnel.log`.
- Q: In Scenario 3 (buy domain first), does the wizard pause within the same session or save state and exit for later resumption? → A: Single session — CLI displays a "도메인 설정 완료 후 Enter를 누르세요" prompt and waits indefinitely; Quick Tunnel runs in the background during this wait. No state serialization or resume command needed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Quick Tunnel: Instant Access Without Domain or Account (Priority: P1)

A user with no domain name and no Cloudflare account wants to access their home server from outside their local network immediately after installation. They choose "Quick Tunnel" during `brewnet init` Step 4. The CLI starts a cloudflared container in Quick Tunnel mode, parses the temporary `*.trycloudflare.com` URL, and shows it in Step 7 (Complete). The user can access all installed services via this URL. The CLI displays a visible warning that the URL will change on restart and recommends `brewnet domain connect` for a permanent URL.

**Why this priority**: This is the lowest-friction entry point. Zero prerequisites — no account, no domain, no token. It maximises first-run success rate and provides immediate value, earning trust before asking users to invest in domain setup. Most new users will start here.

**Independent Test**: Can be fully tested by running `brewnet init`, selecting "Quick Tunnel" at Step 4, completing the wizard, and confirming a `*.trycloudflare.com` URL appears in Step 7 that successfully serves installed services in a browser.

**Acceptance Scenarios**:

1. **Given** a user at Step 4 (Domain & Network) with no domain and no Cloudflare account, **When** they select "Quick Tunnel (instant, temporary URL — no domain needed)", **Then** no API token or account credentials are requested.
2. **Given** Quick Tunnel mode selected, **When** docker-compose launches, **Then** a cloudflared container starts with the `--url` flag pointing to the local reverse proxy, and the URL is captured and displayed in Step 7.
3. **Given** services are running with Quick Tunnel active, **When** the user visits the displayed `*.trycloudflare.com` URL in a browser, **Then** they can access each installed service at its designated path prefix (e.g., `/files`, `/git`, `/status`) under that single URL, routed by the local reverse proxy.
4. **Given** Quick Tunnel is active, **When** Step 7 is displayed, **Then** a prominent warning states "이 URL은 서버 재시작 시 변경됩니다. 영구 주소를 원하면 `brewnet domain connect`를 실행하세요."
5. **Given** Quick Tunnel mode, **When** the server is restarted, **Then** a new random URL is generated and `brewnet status` shows the updated URL.

---

### User Story 2 — Named Tunnel: Existing Domain Already in Cloudflare (Priority: P2)

A user who already owns a domain and has it managed by Cloudflare (nameservers pointing to Cloudflare) wants to set up a permanent, human-readable URL for their home server. During `brewnet init` Step 4, they select "Named Tunnel with existing domain". The CLI opens a pre-filled Cloudflare API token creation URL in the browser, the user creates the token with one click and pastes it. The CLI automatically discovers the account, lists available zones, creates the tunnel, configures ingress rules for all enabled services, creates DNS CNAME records, deploys the cloudflared container with the tunnel token, and verifies the tunnel reaches "healthy" status.

**Why this priority**: This is the primary production-ready path for users who are ready to invest in a proper setup. It enables the full brewnet value proposition (multi-service routing under a real domain) and leverages the existing CF API client already ~80% complete.

**Independent Test**: Can be fully tested by running `brewnet init`, selecting "Named Tunnel with existing domain" at Step 4, pasting a valid CF API token, completing the wizard, and confirming all service subdomains resolve and serve content over HTTPS.

**Acceptance Scenarios**:

1. **Given** a user selects "Named Tunnel with existing domain", **When** they proceed, **Then** the CLI opens `https://dash.cloudflare.com/profile/api-tokens` with tunnel and DNS permissions pre-filled, and prompts for the token.
2. **Given** a valid API token is entered, **When** the CLI verifies it, **Then** it displays the associated account email and auto-detects available zones (domains).
3. **Given** the user has one domain in Cloudflare, **When** zone detection runs, **Then** it is selected automatically. **Given** multiple domains exist, **Then** the user is prompted to choose one.
4. **Given** account and zone are confirmed, **When** tunnel creation runs, **Then** a Cloudflare Named Tunnel is created via API, a tunnel token is received, and the cloudflared container is added to docker-compose with `TUNNEL_TOKEN` injected.
5. **Given** the tunnel is created, **When** ingress and DNS setup runs, **Then** CNAME records are created for every enabled service subdomain (e.g., `files.domain.com`, `git.domain.com`) pointing to the tunnel.
6. **Given** all services start, **When** Step 7 is displayed, **Then** the tunnel shows "healthy" status and all service URLs are listed with their permanent `https://subdomain.domain.com` addresses.
7. **Given** the API token setup completes, **When** wizard state is saved, **Then** the raw API token is NOT persisted (only tunnelId, tunnelToken, accountId, zoneId are retained).

---

### User Story 3 — Named Tunnel: Guided Domain Registration Before Setup (Priority: P3)

A user wants a permanent URL but does not yet own a domain. During `brewnet init` Step 4, they select "Named Tunnel — buy domain first (guided setup)". The CLI provides step-by-step instructions to register a domain at Cloudflare Registrar, wait for propagation, and return to complete the tunnel setup. While waiting, the CLI optionally starts a Quick Tunnel so the user has immediate (temporary) external access. Once the user confirms their domain is ready, the flow continues identically to User Story 2 (Named Tunnel with existing domain).

**Why this priority**: Removes the "I don't have a domain, now what?" dead-end. Users motivated enough to set up a home server will often be willing to purchase a domain ($10/year) given clear guidance. This bridges the gap between Quick Tunnel and full production setup.

**Independent Test**: Can be tested by selecting "buy domain first" at Step 4 and confirming: (a) a Quick Tunnel starts for immediate access, (b) clear domain registration instructions are displayed, (c) after the user confirms domain readiness, the Named Tunnel setup proceeds identically to User Story 2.

**Acceptance Scenarios**:

1. **Given** a user selects "Named Tunnel — buy domain first", **When** they proceed, **Then** the CLI displays: "아직 도메인이 없으신가요? Cloudflare에서 약 $10/년에 구입할 수 있습니다." with the registration URL.
2. **Given** the domain registration guide is shown, **When** the user is waiting, **Then** the CLI offers to start a Quick Tunnel for temporary access while the domain propagates.
3. **Given** the user accepts Quick Tunnel as a temporary bridge, **When** it starts, **Then** a `*.trycloudflare.com` URL is shown with a note that it will be replaced once the domain is connected.
4. **Given** the Quick Tunnel is running, **When** the CLI displays the "도메인 설정 완료 후 Enter를 누르세요" prompt, **Then** the CLI waits indefinitely within the same session; the user may take as long as needed to complete domain purchase and nameserver setup without losing wizard state.
5. **Given** the user presses Enter to confirm domain readiness, **When** they continue, **Then** the flow proceeds identically to User Story 2 (API token prompt → account/zone detection → tunnel creation → DNS setup).
6. **Given** the user confirms domain readiness and Named Tunnel setup completes, **When** the tunnel is activated, **Then** the Quick Tunnel is automatically stopped and replaced by the Named Tunnel.

---

### User Story 4 — Named Tunnel Only, Domain Connected Later (Priority: P4)

A user creates a Named Tunnel during `brewnet init` but defers domain configuration. They select "Named Tunnel only — connect domain later" at Step 4, provide their Cloudflare API token, and the CLI creates a tunnel and stores the tunnel token without setting up DNS records. The cloudflared container runs but no subdomains are accessible externally yet. Later, the user runs `brewnet domain connect`, provides their domain, and the CLI re-uses the existing tunnel to configure ingress and create DNS records — without re-creating the tunnel.

**Why this priority**: Supports users who want to start with tunnel infrastructure in place but aren't ready to commit to a domain. Also provides the `brewnet domain connect` command needed by Quick Tunnel users (User Story 1) who later acquire a domain.

**Independent Test**: Can be tested by: (1) completing init with "Named Tunnel only", verifying cloudflared starts with a tunnel token but no DNS records exist; (2) running `brewnet domain connect`, providing a domain, and verifying DNS CNAME records are created and service URLs become accessible.

**Acceptance Scenarios**:

1. **Given** a user selects "Named Tunnel only — connect domain later", **When** they provide a CF API token, **Then** a tunnel is created, the tunnel token is stored, and the cloudflared container starts — but no ingress rules or DNS records are configured.
2. **Given** a Named Tunnel-only install is complete, **When** Step 7 is shown, **Then** a note says "터널이 생성되었습니다. 도메인을 연결하려면 `brewnet domain connect`를 실행하세요."
3. **Given** a user runs `brewnet domain connect` after a Named-Tunnel-only install, **When** they enter a CF API token and select a domain, **Then** the CLI reuses the existing tunnelId to configure ingress and create DNS CNAME records (no new tunnel created).
4. **Given** a user runs `brewnet domain connect` after a Quick Tunnel install, **When** they enter a CF API token and select a domain, **Then** the CLI creates a new Named Tunnel, migrates cloudflared to use the Named Tunnel token, configures ingress, creates DNS records, and stops the Quick Tunnel.
5. **Given** `brewnet domain connect` runs and DNS records already exist for some subdomains, **When** the CLI creates records, **Then** existing CNAME records are updated (upserted) rather than failing with a duplicate error.
6. **Given** `brewnet domain connect` completes successfully, **When** the user checks `brewnet domain tunnel status`, **Then** tunnel health and all active service URLs are displayed.

---

### Edge Cases

- What happens when Quick Tunnel fails to start (Docker image unavailable or Docker daemon not running)?
- What happens when a CF API token has insufficient permissions (missing Tunnel:Edit or DNS:Edit)?
- What happens when the selected zone (domain) is inactive or pending propagation in Cloudflare?
- What happens when a DNS CNAME record already exists with a conflicting target value?
- What happens when tunnel creation API call succeeds but the cloudflared container fails to connect?
- What happens when the Quick Tunnel URL cannot be parsed from cloudflared container output?
- What happens when `brewnet domain connect` is run but no existing tunnel or token state is found?
- What happens when the user aborts the wizard mid-way through Named Tunnel setup (partial tunnel created in CF)?
- What happens when the user has zero active zones (domains) in their Cloudflare account?
- What happens when internet is unavailable at the moment Quick Tunnel tries to connect?

---

## Requirements *(mandatory)*

### Functional Requirements

**Step 4 Scenario Selection**

- **FR-001**: During `brewnet init` Step 4, the system MUST present five external access options: (1) Quick Tunnel — no domain needed, (2) Named Tunnel with existing Cloudflare domain, (3) Named Tunnel — buy domain first (guided), (4) Named Tunnel only — connect domain later, (5) Local only.
- **FR-002**: Each option MUST display a one-line description of its prerequisites and outcome so users can choose correctly without leaving the CLI.

**Quick Tunnel (Scenario 1)**

- **FR-003**: When Quick Tunnel is selected, the system MUST deploy a cloudflared container in Quick Tunnel mode without requiring a Cloudflare account or API token. The tunnel MUST forward all traffic to the local reverse proxy (Traefik).
- **FR-003a**: In Quick Tunnel mode, Traefik MUST be configured with path-prefix routing rules so each enabled service is accessible at a dedicated path under the single `*.trycloudflare.com` URL (e.g., `/files` → FileBrowser, `/git` → Gitea, `/status` → Uptime Kuma). Named Tunnel mode continues to use hostname-based routing (subdomain per service).
- **FR-004**: The system MUST capture the `*.trycloudflare.com` URL from cloudflared output and display it in the completion step (Step 7), along with the path for each enabled service (e.g., `https://abc.trycloudflare.com/files`).
- **FR-005**: The system MUST display a prominent warning that the Quick Tunnel URL changes on every server restart and is not suitable for production use.
- **FR-006**: Step 7 MUST display `brewnet domain connect` as the recommended next step for upgrading to a permanent URL.

**Named Tunnel — Existing Domain (Scenario 2)**

- **FR-007**: When Named Tunnel with existing domain is selected, the system MUST open a pre-filled Cloudflare API token creation URL in the user's default browser with Tunnel:Edit and DNS:Edit permissions pre-configured.
- **FR-008**: The system MUST verify the entered API token is valid and active before proceeding; invalid tokens MUST show a clear error and re-prompt.
- **FR-009**: The system MUST automatically discover the user's Cloudflare account ID and list available active zones; a single zone MUST be auto-selected, multiple zones MUST prompt for selection.
- **FR-010**: The system MUST create a Cloudflare Named Tunnel via API using the project name as the tunnel name.
- **FR-011**: The system MUST configure tunnel ingress rules for every enabled service using that service's default subdomain and internal container address.
- **FR-012**: The system MUST create DNS CNAME records (proxied) for every configured service subdomain pointing to `{tunnelId}.cfargotunnel.com`.
- **FR-013**: The system MUST deploy a cloudflared container with the tunnel token as an environment variable and confirm it starts successfully.
- **FR-014**: The system MUST verify the tunnel reaches "healthy" status via the Cloudflare API before showing the success screen.
- **FR-014a**: If any step after tunnel creation fails (ingress configuration, DNS record creation, or cloudflared container start), the system MUST automatically delete the created Cloudflare tunnel via the API (rollback) and display a clear error message with a prompt to retry. Partial state (e.g., some DNS records created) must also be cleaned up.
- **FR-014b**: All Cloudflare API calls MUST be retried up to 3 times with exponential backoff on transient failures (network errors, HTTP 5xx responses). Token authentication errors (HTTP 401/403) and invalid-request errors (HTTP 400) MUST NOT be retried and MUST trigger immediate rollback with a descriptive error message.
- **FR-015**: The system MUST NOT persist the raw Cloudflare API token in any state file, `.env` file, or log; only tunnelId, tunnelToken, accountId, and zoneId may be stored.

**Named Tunnel — Buy Domain First (Scenario 3)**

- **FR-016**: When "buy domain first" is selected, the system MUST display step-by-step instructions for purchasing and configuring a domain at Cloudflare Registrar.
- **FR-017**: The system MUST offer to start a Quick Tunnel as temporary access while the user waits for domain setup to complete. After displaying setup instructions, the CLI MUST present a "도메인 설정 완료 후 Enter를 누르세요" prompt and wait indefinitely within the same session; no state serialization or resume command is required.
- **FR-018**: After the user confirms domain readiness, the system MUST continue with the full Named Tunnel setup flow (same as Scenario 2, FR-007 through FR-015).
- **FR-019**: If a Quick Tunnel was started as a bridge, the system MUST automatically stop it upon successful Named Tunnel activation.

**Named Tunnel Only — Domain Later (Scenario 4)**

- **FR-020**: When "connect domain later" is selected, the system MUST create a Named Tunnel and deploy cloudflared with the tunnel token, but MUST NOT configure ingress rules or create DNS records.
- **FR-021**: Step 7 MUST display a message directing the user to run `brewnet domain connect` to attach a domain.
- **FR-022**: The `brewnet domain connect` command MUST accept a CF API token and domain name, then configure ingress rules and create DNS CNAME records for the existing tunnel.
- **FR-023**: If no named tunnel exists when `brewnet domain connect` is run (e.g., post Quick Tunnel install), the command MUST create a new Named Tunnel, update the cloudflared container to use it, and stop any running Quick Tunnel.
- **FR-024**: When creating DNS records via `brewnet domain connect`, the system MUST upsert records (update if exists, create if not) to avoid duplicate record errors.

**Tunnel Management Commands**

- **FR-025**: The `brewnet domain tunnel status` command MUST display: tunnel health status, number of active connections, and all service URLs with their accessibility status.
- **FR-026**: The `brewnet domain tunnel restart` command MUST restart the cloudflared container and confirm it successfully reconnects to the Cloudflare network.
- **FR-027**: All tunnel management events MUST be logged with a UTC timestamp to `~/.brewnet/logs/tunnel.log`. Logged events include: tunnel creation, rollback, `domain connect` execution (success or failure), `tunnel restart`, and tunnel health state transitions (e.g., `healthy` → `degraded`). The log file MUST be created if it does not exist and MUST NOT contain raw API tokens.

### Key Entities

- **TunnelMode**: Discriminated value (`quick` | `named` | `none`) added to CloudflareConfig; determines which docker-compose template is generated and which setup flow is activated.
- **CloudflareConfig**: Existing type extended with `tunnelMode: 'quick' | 'named' | 'none'` and `quickTunnelUrl: string` (populated at runtime from container output in Quick Tunnel mode).
- **DomainProvider**: Existing discriminated union extended with `'quick-tunnel'` value alongside `'local'` and `'tunnel'`.
- **ServiceRoute**: Mapping of an enabled service (container name + port) to its assigned subdomain; used for ingress rule generation and DNS record creation.
- **TunnelHealth**: Runtime snapshot of tunnel connectivity (`healthy` | `degraded` | `inactive`), connector count, and per-service DNS resolution status.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users selecting Quick Tunnel complete external access setup in under 2 minutes from the Step 4 prompt, with no Cloudflare account or domain required.
- **SC-002**: Users selecting Named Tunnel with an existing Cloudflare domain complete full setup (token entry → live HTTPS service URLs) in under 5 minutes from the Step 4 prompt.
- **SC-003**: 100% of enabled services receive a DNS CNAME record and are reachable via their subdomain URL immediately after Named Tunnel setup reports success.
- **SC-004**: The tunnel "healthy" verification passes before the completion screen is shown; users never see a success screen followed by a non-functional tunnel.
- **SC-005**: The raw Cloudflare API token is verifiably absent from all persisted files and logs after any tunnel setup path completes.
- **SC-006**: Users who completed a Quick Tunnel install can attach a permanent domain using `brewnet domain connect` without re-running `brewnet init` or losing any existing service configuration.
- **SC-007**: `brewnet domain connect` completes DNS record creation without manual intervention even when CNAME conflicts exist with the target subdomain.
- **SC-008**: All four access scenarios are selectable at Step 4 with clear descriptions, enabling users to choose the correct option for their situation on their first attempt.

---

## Assumptions

- The user has Docker installed and running (validated in Step 0 system check, existing behavior).
- Cloudflare's free plan is sufficient for all tunnel and DNS management operations used in this feature.
- A single Cloudflare tunnel can route traffic for multiple services via ingress rules (confirmed by existing cloudflare-client.ts).
- The cloudflared Docker image supports both Quick Tunnel (`--url` flag) and Named Tunnel (`run` command with `TUNNEL_TOKEN`) modes.
- The `*.trycloudflare.com` URL is parseable from cloudflared container stdout/stderr log output.
- `brewnet domain connect` reads existing tunnel state from `~/.brewnet/config.json` to determine whether a tunnel already exists.
- All user-facing prompts, warnings, and messages are written in Korean; all code, comments, variable names, and log output are in English.

---

## Out of Scope

- Cloudflare Zero Trust policies, access groups, or browser-based application authentication.
- Self-hosted `cloudflared` binary (non-Docker) deployment.
- SSH access over Cloudflare Tunnel (handled by the SSH Manager feature).
- Multi-tunnel configurations (one tunnel per brewnet project).
- Automatic tunnel token rotation or expiry detection.
- Cloudflare OAuth flow for third-party apps (not supported by Cloudflare as of 2026-02-27).
