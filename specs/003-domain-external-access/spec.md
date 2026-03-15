# Feature Specification: Domain External Access

**Feature Branch**: `003-domain-external-access`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "External domain connection automation: After local server setup, connect apps to external domains via Cloudflare Tunnel. Implements `brewnet domain connect/disconnect/list/status` CLI commands, Cloudflare API automation (tunnel ingress + DNS CNAME), Traefik external label generation, DNS propagation polling, and Dashboard UI domain connection modal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a Local App to an External Domain (Priority: P1)

A home server operator has verified that their app (e.g., a REST API) is running locally and accessible via `http://localhost:8080/health`. They want to make it publicly accessible at `https://my-api.yourdomain.com` without port forwarding, with automatic HTTPS and DDoS protection via Cloudflare.

The user runs a single CLI command specifying the app name and target domain. The system automatically configures the Cloudflare Tunnel ingress rule, creates a DNS CNAME record, updates Traefik routing labels, and verifies the external URL is reachable — all without restarting existing containers.

**Why this priority**: This is the core value proposition. Without the ability to connect a local app to an external domain, none of the other features (disconnect, list, status) have purpose. This single story delivers the complete "local to public" journey.

**Independent Test**: Can be fully tested by running `brewnet domain connect my-api --domain my-api.yourdomain.com` against a running local app with valid Cloudflare credentials, then verifying `https://my-api.yourdomain.com` returns the expected response.

**Acceptance Scenarios**:

1. **Given** a locally running app with a healthy endpoint and valid Cloudflare API credentials configured, **When** the user runs the domain connect command with app name and target domain, **Then** the system adds a tunnel ingress rule, creates a CNAME DNS record, updates Traefik labels, and the external URL becomes accessible via HTTPS.
2. **Given** Cloudflare credentials are missing or invalid, **When** the user attempts to connect, **Then** the system displays a clear error message with instructions on how to create and configure the API token.
3. **Given** the app is not running locally, **When** the user attempts to connect, **Then** the system warns that the local health check failed and asks for confirmation before proceeding.
4. **Given** a CNAME record already exists for the target subdomain, **When** the user attempts to connect, **Then** the system detects the conflict, informs the user, and offers to overwrite or abort.

---

### User Story 2 - Disconnect an App from External Domain (Priority: P2)

A user wants to remove external access for a specific app. They run a disconnect command, and the system automatically removes the tunnel ingress rule, deletes the DNS CNAME record, and removes the external Traefik labels — while keeping the app running locally.

**Why this priority**: Disconnect is the natural complement to connect. Users need a clean way to revoke external access without manually editing Cloudflare settings. This is critical for security (revoking access to compromised services) and operational hygiene.

**Independent Test**: Can be tested by disconnecting a previously connected app, then verifying the external URL returns an error while the local endpoint remains accessible.

**Acceptance Scenarios**:

1. **Given** an app with an active external domain connection, **When** the user runs the disconnect command, **Then** the tunnel ingress rule is removed, the CNAME record is deleted, Traefik external labels are removed, and the local service continues running unaffected.
2. **Given** an app with no external domain connection, **When** the user runs disconnect, **Then** the system informs the user that no external connection exists for this app.
3. **Given** the Cloudflare API is temporarily unreachable, **When** the user runs disconnect, **Then** the system retries with exponential backoff and reports the failure if all retries are exhausted, without leaving the system in a partially disconnected state.

---

### User Story 3 - View Domain Connection Status (Priority: P2)

A user wants to see the current state of all domain connections across their apps — which apps have external domains, whether tunnel connections are healthy, and whether DNS records are properly propagated. They run a status command and receive a consolidated view.

**Why this priority**: Observability is essential for troubleshooting. When external access stops working, users need to quickly identify whether the issue is with the tunnel, DNS, or the local service. Tied with P2 because it supports the connect/disconnect workflow.

**Independent Test**: Can be tested by running the status command and verifying the output accurately reflects the current state of tunnel connections, DNS records, and local service health.

**Acceptance Scenarios**:

1. **Given** multiple apps with mixed connection states (some connected, some local-only), **When** the user runs `brewnet domain status`, **Then** the system displays each app with its local URL, external URL (if connected), tunnel health, and DNS propagation status.
2. **Given** a specific app name is provided, **When** the user runs `brewnet domain status my-api`, **Then** the system shows detailed status for only that app including local accessibility, external URL, tunnel connector count, and CNAME record verification.
3. **Given** the tunnel is unhealthy (zero active connectors), **When** the user checks status, **Then** the system clearly indicates the tunnel is down and suggests troubleshooting steps (e.g., restart tunnel, check credentials).

---

### User Story 4 - List All Connected Domains (Priority: P3)

A user wants a quick overview of all apps that currently have external domain connections. They run a list command and see a compact table of app names, external URLs, and connection timestamps.

**Why this priority**: Convenience feature. Status already shows this information in detail; list provides a lightweight summary for quick reference.

**Independent Test**: Can be tested by connecting multiple apps to domains, running the list command, and verifying all connections appear in the output.

**Acceptance Scenarios**:

1. **Given** several apps with external domain connections, **When** the user runs `brewnet domain list`, **Then** the system displays a table with app name, external URL, and connection date for each.
2. **Given** no apps have external domain connections, **When** the user runs `brewnet domain list`, **Then** the system displays a message indicating no external connections exist, with a hint on how to connect one.

---

### User Story 5 - Admin Server Domain Management Section (Priority: P2)

A user opens the Brewnet Admin page (`localhost:8088`) after initial setup and wants to manage external domain connections from the web UI — without switching to the terminal. The Admin page has a dedicated "Domains" section that shows all connected domains, their health status, and provides connect/disconnect actions.

Currently the Admin Server displays external URLs in read-only mode within the Services table. The new "Domains" section provides a dedicated area where users can view all domain connections at a glance, initiate new connections, and disconnect existing ones — all from the same browser-based admin interface they already use for service management.

**Why this priority**: The Admin Server is the primary UI that every user sees after setup (no Pro license required). Adding domain management here bridges the gap between CLI-only domain operations and the web-based admin experience users already rely on. Elevated to P2 because it directly supports the core connect/disconnect workflow (Story 1 & 2) through the UI channel most users will prefer.

**Independent Test**: Can be tested by opening the Admin page, navigating to the "Domains" section, verifying it shows current domain connections, and performing a connect/disconnect action through the UI.

**Acceptance Scenarios**:

1. **Given** the Admin Server is running, **When** the user opens the Admin page, **Then** a "Domains" section is visible showing all currently connected domains with app name, external URL, tunnel health, and DNS status.
2. **Given** no domains are connected, **When** the user views the Domains section, **Then** a helpful empty state is shown with guidance on how to connect a domain (including a "Connect Domain" action).
3. **Given** Cloudflare credentials are configured (via Admin Settings or CLI), **When** the user clicks "Connect Domain" for a specific app, **Then** a form allows entering the target domain/subdomain, and the system performs the connection with real-time progress feedback.
4. **Given** an app has an active external domain, **When** the user clicks "Disconnect" in the Domains section, **Then** the system removes the tunnel ingress rule, deletes the CNAME record, and updates the UI to reflect the disconnected state.
5. **Given** no Cloudflare credentials are configured, **When** the user tries to connect a domain, **Then** the system redirects to the Settings area where the user can input their API token, account ID, and zone ID.
6. **Given** a user's domain cannot use Cloudflare nameservers (Scenario C), **When** the user clicks the "CNAME Guide" button in the Domains section, **Then** a modal displays the tunnel UUID CNAME value to copy, step-by-step instructions for adding a CNAME record at common DNS providers (with examples), and the equivalent CLI commands for reference.

---

### User Story 6 - Dashboard Domain Connection Modal (Priority: P4)

A Dashboard (Pro) user wants to connect an app to an external domain through the full-featured Pro Dashboard. From the app detail page, they click "Connect External Domain," enter their domain and Cloudflare API token, and the system performs the same automation as the CLI — with real-time progress indicators.

**Why this priority**: Dashboard is a Pro feature and builds on top of both the CLI core and the Admin Server domain management. The Pro Dashboard adds richer UI/UX but the core functionality is already available via CLI (P1) and Admin Server (P2). Deferred to P4.

**Independent Test**: Can be tested by opening the Pro Dashboard, navigating to an app's detail page, clicking Connect External Domain, filling in the domain form, and verifying the external URL becomes accessible.

**Acceptance Scenarios**:

1. **Given** a running app visible in the Dashboard, **When** the user clicks "Connect External Domain" and enters a valid domain and API token, **Then** the modal shows real-time progress (API verification, ingress update, DNS creation, propagation check) and the final external URL.
2. **Given** an app already connected to an external domain, **When** the user views the app detail page, **Then** the external URL is displayed with a "Disconnect" option and connection health indicator.
3. **Given** DNS propagation is still in progress, **When** the connection process reaches the verification step, **Then** the modal shows a polling indicator with estimated wait time, and auto-completes when propagation succeeds.

---

### Edge Cases

- What happens when the user's Cloudflare free plan encounters rate limits during rapid connect/disconnect cycles?
- How does the system handle a tunnel token that has expired or been revoked?
- What happens when two apps attempt to claim the same subdomain simultaneously?
- How does the system behave when the local Docker network (`brewnet-network`) is missing or misconfigured?
- What happens when DNS propagation exceeds the polling timeout (60 seconds)?
- How does the system handle Cloudflare API downtime during a connect operation (partial state: ingress updated but DNS not created)?
- What happens when the user tries to connect an app that uses a non-standard port or protocol (e.g., TCP/SSH instead of HTTP)?
- How does the system handle media streaming apps (e.g., Jellyfin) given Cloudflare's Terms of Service restrictions on large media proxying?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST connect a local app to an external domain via a single CLI command (`brewnet domain connect <app> --domain <subdomain.domain.com>`), automating tunnel ingress configuration, DNS CNAME creation, and Traefik label updates.
- **FR-002**: System MUST disconnect an app from its external domain via `brewnet domain disconnect <app>`, removing the tunnel ingress rule, deleting the DNS CNAME record, and cleaning up Traefik external labels.
- **FR-003**: System MUST display per-app domain connection status via `brewnet domain status [app]`, showing local URL, external URL, tunnel health (connector count), and DNS propagation state.
- **FR-004**: System MUST list all externally connected apps via `brewnet domain list` in a compact table format.
- **FR-005**: System MUST verify local app health (health endpoint check) before initiating an external domain connection, warning the user if the check fails.
- **FR-006**: System MUST handle DNS CNAME conflicts by detecting existing records for the target subdomain and offering the user a choice to overwrite or abort.
- **FR-007**: System MUST poll for DNS propagation after creating a CNAME record, with a maximum polling duration of 60 seconds, and provide clear feedback on propagation progress.
- **FR-008**: System MUST ensure atomic operations — if a connect or disconnect operation partially fails (e.g., ingress updated but DNS creation fails), the system rolls back completed steps and reports the failure clearly.
- **FR-009**: System MUST store Cloudflare credentials (API token, account ID, zone ID, tunnel ID) securely in the local configuration file with restricted file permissions (owner-only read/write).
- **FR-010**: System MUST add external Traefik router labels (Host-based routing for the external domain) to the app's container definition without restarting unrelated services.
- **FR-011**: System MUST support all three domain scenarios: (A) Cloudflare-managed domains with instant DNS, (B) third-party domains with Cloudflare nameserver transfer, and (C) CNAME-only tunnel connections without nameserver changes.
- **FR-011a**: Admin Server Domains section MUST support automated connect/disconnect for Scenario A and B only. For Scenario C, the Domains section MUST provide a dedicated guide modal (accessible via button) containing step-by-step instructions, CNAME value to copy (tunnel UUID + `.cfargotunnel.com`), example DNS configurations for common providers, and relevant CLI commands — without attempting automated DNS creation.
- **FR-012**: System MUST warn users when connecting media streaming services (e.g., Jellyfin) about Cloudflare's Terms of Service restrictions on proxying large media content.
- **FR-013**: System MUST log all domain connection and disconnection events to the tunnel audit log with timestamps, app names, domains, and operation results.
- **FR-014**: Admin Server MUST include a dedicated "Domains" section showing all domain connections with app name, external URL, tunnel health, and DNS propagation status.
- **FR-015**: Admin Server "Domains" section MUST provide connect and disconnect actions, triggering the same automation as the CLI commands with real-time progress feedback in the browser.
- **FR-016**: Admin Server MUST expose domain management REST API endpoints (list connections, connect, disconnect, status) to support the Domains section UI.
- **FR-016a**: Admin Server MUST include a Settings area where users can input, update, and verify Cloudflare API credentials (API token, account ID, zone ID) directly from the web UI, with the same secure storage as CLI-configured credentials.
- **FR-016b**: Admin Server MUST require admin password verification for all domain management and Settings API endpoints. Existing service management endpoints (start/stop/remove) remain unauthenticated. The admin password is the one configured during the Brewnet setup wizard.
- **FR-017**: Dashboard (Pro) MUST provide a domain connection modal accessible from the app detail page, with fields for domain, subdomain, and API token, showing real-time operation progress.
- **FR-018**: Dashboard (Pro) MUST display the external domain URL and connection health on the app detail page for connected apps, with a one-click disconnect option.

### Key Entities

- **Domain Connection**: Represents the link between a local app and an external domain; includes app name, subdomain, domain, tunnel ID, CNAME record ID, connection timestamp, and health status. Stored as a `domainConnections` array within the existing project state file (`selections.json`).
- **Cloudflare Credentials**: Account-level configuration for API access; includes API token, account ID, zone ID, tunnel ID, and tunnel token. Stored locally with restricted permissions.
- **Tunnel Ingress Rule**: A routing entry within the Cloudflare Tunnel configuration that maps an external hostname to an internal service URL (e.g., `my-api.domain.com` → `http://traefik:80`).
- **DNS CNAME Record**: A Cloudflare DNS record that points a subdomain to the tunnel endpoint (`{tunnel-id}.cfargotunnel.com`), enabling external traffic to reach the tunnel.

### Assumptions

- Users have already completed the Brewnet setup wizard and have a running local server with Traefik as the reverse proxy.
- A Cloudflare Tunnel (Quick or Named) has already been created during the initial setup wizard (domain-network step).
- The existing `cloudflare-client.ts` API wrapper provides the foundation for tunnel and DNS operations; new functions will extend this module.
- The Cloudflare free plan is sufficient for all tunnel and DNS operations (no Business plan features required except for Scenario C's Partial Setup, which uses direct CNAME instead).
- All external traffic flows through the path: Cloudflare Edge → cloudflared container → Traefik → app container.
- Users will create their own Cloudflare API token with the required permissions (Tunnel:Edit, DNS:Edit, Zone:Read, Account Settings:Read) via the Cloudflare dashboard.

## Clarifications

### Session 2026-03-15

- Q: Admin Server에서 도메인 관리 UI를 어떤 형태로 제공할 것인가? → A: Admin Server에 별도 "Domains" 섹션을 추가 (서비스 테이블과 분리된 독립 영역으로, 연결된 도메인 목록 + connect/disconnect 기능 포함). Pro Dashboard 모달은 P4로 분리.
- Q: Admin Server에서 Cloudflare API 토큰을 어떻게 다룰 것인가? → A: Admin UI에 Settings 영역을 추가하여 토큰을 웹에서 직접 입력/저장 가능하게 함. CLI와 동일한 보안 저장소 사용.
- Q: Admin Server Domains 섹션에서 어떤 도메인 시나리오를 지원할 것인가? → A: 시나리오 A/B만 자동화 지원. 시나리오 C는 별도 가이드 모달(버튼 클릭)로 안내 — CNAME 값 복사, 주요 DNS 프로바이더별 예시, 단계별 설명, CLI 명령어 포함.
- Q: Admin Server 도메인 관리 API의 접근 보안 수준은? → A: 도메인/Settings API에만 admin 비밀번호 확인 추가. 기존 서비스 관리 API는 현행 유지(인증 없음).
- Q: 도메인 연결 상태를 어디에 영속 저장할 것인가? → A: 기존 `selections.json` 내에 `domainConnections` 배열로 추가. 별도 파일이나 DB 테이블 없이 기존 프로젝트 상태 패턴 유지.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect a local app to an external domain in under 2 minutes using a single command, without manual Cloudflare dashboard interaction.
- **SC-002**: Users can disconnect an app and have its external URL become unreachable within 5 minutes (accounting for DNS TTL).
- **SC-003**: Domain status command accurately reflects the real-time state of tunnel health, DNS propagation, and local service availability with zero false positives.
- **SC-004**: 95% of domain connections with Cloudflare-managed domains (Scenario A) complete successfully on the first attempt without user intervention beyond the initial command.
- **SC-005**: All connect/disconnect operations maintain system consistency — no partial states remain after any failure scenario (full rollback on error).
- **SC-006**: Credential storage meets minimum security requirements: configuration files are not world-readable, API tokens are never logged or committed to version control.
- **SC-007**: Dashboard domain connection modal provides real-time feedback for each step of the connection process, completing within the same time bounds as the CLI equivalent.
