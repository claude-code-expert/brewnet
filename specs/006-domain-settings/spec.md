# Feature Specification: Domain Settings — Cloudflare Tunnel & External Domain Integration

**Feature Branch**: `006-domain-settings`
**Created**: 2026-03-20
**Status**: Draft
**Input**: Redesign Domain Settings modal (Cloudflare-only) to support sequential Cloudflare Tunnel automation and per-app subdomain connection with full help system, validation, and isolated component architecture. External domain (non-Cloudflare) support is out of scope.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cloudflare Tunnel First-Time Setup (Priority: P1)

An admin opens Domain Settings for the first time. They have a Cloudflare account and a domain but have never configured a tunnel. They want to make their Brewnet apps accessible from the internet with a permanent URL — without touching Cloudflare manually beyond pasting one token.

**Why this priority**: This is the primary value proposition of the domain settings feature. Without a configured tunnel, no app can have a public domain. All other stories depend on this being done first.

**Independent Test**: Can be tested by opening Domain Settings → Cloudflare tab → completing the wizard flow → verifying the tunnel appears in Cloudflare Dashboard as active, with no other app connection needed.

**Acceptance Scenarios**:

1. **Given** no Cloudflare credentials are configured, **When** the admin opens Domain Settings, **Then** the Cloudflare tab is shown as the primary view with a guided setup flow starting at Step 1 (API Token)
2. **Given** the admin enters a valid API token, **When** they complete token entry, **Then** the system validates the token within 5 seconds and auto-fetches the list of available zones (domains) — no manual Account ID or Zone ID entry required
3. **Given** token validation succeeds, **When** the zone list loads, **Then** the admin can select their domain from a dropdown — manual ID lookup is not required
4. **Given** the admin selects a domain and confirms, **Then** the system automatically creates the Cloudflare Tunnel and configures ingress with no additional form fields required
5. **Given** any step fails (invalid token, domain not found, tunnel creation error), **When** the failure occurs, **Then** the field turns red, an inline error explains exactly what is wrong with a concrete remediation step, and a toast notification appears
6. **Given** setup completes successfully, **When** the success state is shown, **Then** the admin sees a summary card with the tunnel name, domain, and a shortcut to connect apps

---

### User Story 2 — Per-App Subdomain Connection (Priority: P2)

An admin has Cloudflare credentials configured. They open an app's detail panel and want to give that app a public URL like `my-app.yourdomain.com`.

**Why this priority**: This is the day-to-day action that turns the tunnel configuration into tangible value — each app gets its own reachable address.

**Independent Test**: Can be tested in the app detail panel Domain tab, given credentials are pre-configured. Connect one app to a subdomain and verify the external URL is accessible.

**Acceptance Scenarios**:

1. **Given** Cloudflare is configured and an app is running, **When** the admin opens the app's Domain tab, **Then** they see a subdomain input field pre-filled with a suggestion based on the app name (e.g., app `my-blog` → suggests `my-blog`)
2. **Given** the admin confirms the subdomain and clicks Connect, **Then** the system creates the DNS CNAME record and updates tunnel ingress automatically — the admin never visits the Cloudflare Dashboard
3. **Given** the connection succeeds, **When** the Domain tab refreshes, **Then** the external URL appears as a clickable link (e.g., `https://my-blog.yourdomain.com`)
4. **Given** a subdomain is already in use by another app, **When** the admin tries to connect with the same subdomain, **Then** the system shows a conflict error naming the conflicting app
5. **Given** Cloudflare credentials are NOT configured, **When** the admin opens the Domain tab, **Then** they see an informational banner explaining credentials must be set up first, with a direct link to open Domain Settings

---

### User Story 3 — Domain Disconnect (Priority: P3)

An admin wants to remove a domain connection from an app — because they are retiring the app, changing its subdomain, or reusing the subdomain elsewhere.

**Why this priority**: Lifecycle management — users must be able to undo connections cleanly without manual Cloudflare cleanup.

**Independent Test**: Can be tested by connecting then disconnecting a domain on any app. Verify the DNS record is removed and the external URL disappears from the app detail.

**Acceptance Scenarios**:

1. **Given** an app has a connected domain, **When** the admin clicks Disconnect, **Then** a confirmation dialog appears showing the hostname that will be removed and the consequences (DNS record deleted, external access removed)
2. **Given** the admin confirms disconnect, **When** the system processes the request, **Then** the Cloudflare DNS CNAME record is deleted and the tunnel ingress rule is removed
3. **Given** disconnect completes, **When** the Domain tab refreshes, **Then** the subdomain field returns to the suggestion state and no external URL is shown

---

### Edge Cases

- What happens when the API token is valid but lacks Tunnel:Edit or DNS:Edit permission? (System must name the missing permission)
- What happens when a tunnel with the same name already exists in the Cloudflare account? → **Resolved (FR-024)**: Inline error on tunnel name field; admin must choose a different name. No auto-rename or reuse.
- What happens when DNS propagation is delayed and the external URL is not immediately reachable after connection?
- What happens when the admin enters a subdomain with invalid characters (spaces, uppercase, special characters)?
- What happens when the app is stopped or unhealthy when the admin tries to connect a domain? → **Resolved (FR-023)**: Connect button disabled; admin must start the app first.
- What happens when the admin closes the modal mid-wizard and reopens it — does setup resume or restart?
- What happens when the token has access to zero zones (token scoped incorrectly)?
- What happens when the network is offline during a Cloudflare API call? → **Resolved (FR-025)**: Immediate error + "Retry" button; no automatic retries.

---

## Requirements *(mandatory)*

### Functional Requirements

**Domain Settings Modal — Cloudflare Tab**

- **FR-001**: System MUST guide the admin through Cloudflare setup as a sequential step flow where each step only activates after the previous step succeeds
- **FR-002**: System MUST validate the Cloudflare API token against the Cloudflare verification API before saving or advancing to the next step; validation must complete within 5 seconds under normal network conditions
- **FR-003**: System MUST automatically retrieve and display the list of domains (zones) associated with the validated token — the admin MUST NOT be required to find or copy Zone IDs manually
- **FR-004**: System MUST automatically create the Cloudflare Tunnel after domain selection; the tunnel name MUST be pre-filled with a suggestion derived from the project name (e.g., `brewnet-my-homeserver`) and the admin MUST be able to edit it before confirming
- **FR-005**: Each input step MUST display a contextual help tooltip via a help icon that explains what the field is, why it is needed, and provides a direct link to the relevant Cloudflare Dashboard page
- **FR-006**: Each validated step MUST show a visual success indicator when verified, and a visual error state (red highlight + inline message) when validation fails — error messages MUST name the specific failure and a remediation action
- **FR-007**: System MUST preserve saved credentials across modal open/close cycles — if credentials were previously saved, the modal MUST display the current configuration state, not a blank form
- **FR-008**: System MUST display a toast notification for both success and failure outcomes of every async operation (token validation, tunnel creation, domain selection)
- **FR-009**: When credentials are partially configured from a prior session, the wizard MUST resume from the last incomplete step rather than requiring the admin to start over

<!-- FR-010~FR-012: intentionally removed — external domain (non-Cloudflare) tab requirements descoped on 2026-03-20 per /speckit.clarify session -->

**Per-App Domain Connection (App Detail → Domain Tab)**

- **FR-013**: The per-app Domain tab MUST indicate whether Cloudflare credentials are configured; if not, it MUST show a prompt directing the admin to Domain Settings
- **FR-014**: System MUST pre-fill a suggested subdomain based on the app's name when no domain is yet connected
- **FR-015**: System MUST validate the subdomain input client-side before submission, rejecting values that violate DNS label rules (uppercase characters, spaces, leading/trailing hyphens, length exceeding 63 characters)
- **FR-016**: System MUST display the full external URL as a clickable link immediately after a domain is successfully connected
- **FR-017**: System MUST automatically provision the DNS CNAME record and update the tunnel ingress configuration when the admin connects a subdomain — no manual Cloudflare Dashboard action required
- **FR-018**: System MUST display an actionable conflict error when a subdomain is already in use — conflict detection MUST first check Brewnet's local domain records, then perform a secondary check against Cloudflare DNS API if no local conflict is found; the error MUST name the conflicting app (if local) or indicate an external DNS conflict (if Cloudflare-detected)
- **FR-023**: System MUST disable the Connect button and display an inline error when the target app is in `stopped` or unhealthy state; the error message MUST instruct the admin to start the app before connecting a domain
- **FR-024**: When tunnel creation fails because a tunnel with the same name already exists in the Cloudflare account, the system MUST show an inline error on the tunnel name field with red border and a message stating the name is already taken — the system MUST NOT auto-rename or reuse the existing tunnel
- **FR-025**: When any Cloudflare API call fails due to a network error, timeout, or rate limit response, the system MUST immediately display an error message with a "Retry" button — the system MUST NOT perform automatic retries without explicit user action

**Domain Disconnect**

- **FR-019**: System MUST require explicit confirmation before disconnecting a domain, showing the hostname that will be removed
- **FR-020**: System MUST automatically remove the DNS CNAME record and the tunnel ingress entry when a domain connection is removed

**Code Isolation**

- **FR-021**: All new domain management UI components MUST reside in a dedicated `features/domain/` module; no existing component files may be modified except to update import references that previously pointed to the replaced component
- **FR-022**: The new domain module MUST include automated unit tests covering all validation logic and all Cloudflare API interaction helpers

### Key Entities

- **CloudflareCredential**: Stores the API token (never displayed in full after save — displayed as partial mask: first 4 characters + `...` + last 4 characters, e.g., `a1b2...z9y8`), the selected account reference, and the selected zone (domain name and ID). One credential set per project.
- **Tunnel**: A named Cloudflare Tunnel that routes external HTTPS traffic to the home server. One tunnel is shared across all connected apps within a project.
- **DomainConnection**: An association between one app and one public hostname. Includes subdomain, base domain, external URL, connection method (Cloudflare / External), and creation timestamp.
- **IngressRule**: An entry in the tunnel configuration that maps a public hostname to an internal service endpoint. Created and removed automatically with domain connections.
- **DNSRecord**: A CNAME record in Cloudflare DNS pointing a subdomain to the tunnel address. Created and removed automatically with domain connections.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin with no prior Cloudflare API experience can complete the full Cloudflare Tunnel setup (token entry → domain selection → tunnel created) in under 3 minutes
- **SC-002**: Token validation and zone list population completes within 5 seconds after the admin enters a token on a typical home broadband connection
- **SC-003**: DNS record and tunnel ingress are automatically provisioned within 30 seconds of domain selection confirmation, with no manual Cloudflare Dashboard action
- **SC-004**: An admin can connect a subdomain to a running app in under 60 seconds from opening the app's Domain tab, given credentials are already configured
- **SC-005**: Every failed validation or API call produces a user-visible message that names the specific error and describes a concrete remediation step — generic "something went wrong" messages are not acceptable
- **SC-006**: Zero previously working app deployments, health checks, or monitoring functions are disrupted when domain settings are added, modified, or removed
- **SC-007**: All pure utility functions (`utils/`) and typed API wrappers (`api/`) in the new domain module are covered by automated tests with no untested code paths; React component rendering behavior is excluded from automated coverage

---

## Assumptions

- The admin has completed Brewnet initialization (project state exists, admin password is set). Domain settings requires an authenticated admin session.
- The admin's Cloudflare account has at least one domain registered and managed through Cloudflare DNS. Quick Tunnel functionality is out of scope for this feature.
- One Cloudflare Tunnel is shared across all apps in a project. Multi-tunnel setups per project are out of scope.
- External domain tab assumes the user manages their own DNS and is responsible for pointing records to the Brewnet server's public address. The server does not manage external registrar records.
- Subdomain suggestions are derived from the app name by lowercasing and replacing non-DNS-safe characters with hyphens.
- The existing backend API endpoints (`/api/domain/connect`, `/api/domain/disconnect`, `/api/settings/cloudflare`) remain as authoritative persistence handlers. New backend additions are additive only.
- The existing `DomainTab.tsx` is replaced by a new `features/domain/AppDomainTab.tsx`. The new component must preserve all existing behavior (connect/disconnect/list) plus the enhancements defined in this spec. Only the import reference in the files that currently use `DomainTab` is changed — all other existing files remain unmodified.
- External domain (non-Cloudflare) connection is out of scope. The Domain Settings modal is Cloudflare-only.

---

## Clarifications

### Session 2026-03-20

- Q: What happens when the app is stopped or unhealthy when the admin tries to connect a domain? → A: Connect button is disabled with an inline error instructing the admin to start the app first (Option A)
- Q: What happens when a tunnel with the same name already exists in the Cloudflare account? → A: Inline error on the tunnel name field (red border); admin must choose a different name — no auto-rename, no reuse (Option B)
- Q: How should a saved API token be displayed in the UI? → A: Partial mask — first 4 chars + `...` + last 4 chars (e.g., `a1b2...z9y8`) (Option B)
- Q: What is the retry policy when a Cloudflare API call fails (network error, timeout, rate limit)? → A: Immediate error + "Retry" button; no automatic retries (Option B)
- Q: What is the scope of subdomain conflict detection? → A: Local Brewnet records first, then Cloudflare DNS API as secondary check if no local conflict (Option C)
