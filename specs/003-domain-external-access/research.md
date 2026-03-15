# Research: Domain External Access

**Feature**: 003-domain-external-access
**Date**: 2026-03-15

## R-001: Domain Connection State Persistence

**Decision**: Add `domainConnections: DomainConnection[]` array to existing `WizardState` in `selections.json`

**Rationale**: Brewnet already persists all project state in `~/.brewnet/projects/<name>/selections.json`. Adding a `domainConnections` array keeps data co-located with the project state, avoids introducing a new storage mechanism, and is consistent with how other state (services, cloudflare config) is stored. Each entry tracks app name, subdomain, domain, CNAME record ID (for deletion), and timestamp.

**Alternatives considered**:
- Separate `domains.json` file — rejected: fragments state, increases file management complexity
- SQLite `domains` table — rejected: overkill for <20 entries per project; better-sqlite3 is available but not used for runtime state

## R-002: Domain Lifecycle Extraction Pattern

**Decision**: Extract domain connect/disconnect logic into new `domain-manager.ts` service, keeping `domain.ts` as thin CLI wrapper

**Rationale**: The Admin Server REST API needs to perform the same connect/disconnect operations as the CLI. Extracting the core logic (Cloudflare API calls, ingress update, DNS record management, Traefik label update, state persistence) into a service module enables both CLI and Admin API to share the same implementation. This follows the existing pattern where `commands/*.ts` are thin wrappers over `services/*.ts`.

**Alternatives considered**:
- Calling CLI commands from Admin API via `execa` — rejected: brittle, loses error context, no progress streaming
- Duplicating logic — rejected: maintenance burden, inconsistency risk

## R-003: Cloudflare DNS Record Deletion API

**Decision**: Add `deleteDnsRecord()` and `getDnsRecords()` to existing `cloudflare-client.ts`

**Rationale**: The disconnect flow requires removing CNAME records. Cloudflare API provides:
- `GET /zones/{zone_id}/dns_records?type=CNAME&name={hostname}` — find record ID
- `DELETE /zones/{zone_id}/dns_records/{record_id}` — delete record

These follow the same pattern as existing `createDnsRecord()`. The `getDnsRecords()` function is also needed for status checks (verifying DNS propagation) and conflict detection (FR-006).

**Alternatives considered**:
- Store record ID at creation time and skip lookup — rejected: fragile if state gets out of sync; lookup is cheap and reliable

## R-004: Admin Server Authentication for Domain Endpoints

**Decision**: Simple admin password verification via request header, checked by middleware on `/api/domain/*` and `/api/settings/*` routes only

**Rationale**: The Admin Server runs on localhost only (127.0.0.1:8088). Full session-based auth is overkill. The admin password (already stored in `state.admin.password`) is sent as a header (`X-Admin-Password`) from the browser UI. This protects sensitive operations (credential storage, domain management) while keeping the existing service management endpoints frictionless.

**Alternatives considered**:
- Session cookies with login page — rejected: overengineered for localhost-only server
- No auth at all — rejected: domain management involves API tokens and DNS changes; minimum protection needed
- HTTP Basic Auth — rejected: browser caches credentials aggressively, harder to log out

## R-005: Admin Server Domains Section UI Pattern

**Decision**: Inline HTML section in existing `admin-server.ts` single-page approach, using fetch() for AJAX calls to domain API endpoints

**Rationale**: The Admin Server is a single-file embedded HTTP server generating inline HTML. The existing Services and Dev Stack sections follow this pattern. Adding a Domains section with the same approach maintains consistency. The section includes:
- Domain connection table (app, external URL, tunnel health, DNS status)
- Connect Domain form (app selector, domain/subdomain inputs)
- Disconnect button per connection
- CNAME Guide modal for Scenario C
- Real-time progress display via polling

**Alternatives considered**:
- Separate HTML file — rejected: breaks current single-file embedded pattern
- WebSocket for real-time updates — rejected: adds complexity; polling every 2s during operations is sufficient for the admin use case

## R-006: Traefik External Label Management

**Decision**: Extend `compose-generator.ts` to support adding/removing external router labels dynamically, with `docker compose up -d` for hot reload

**Rationale**: When connecting a domain, Traefik needs a new router rule like `Host(\`app.domain.com\`)`. The existing compose-generator already supports Named Tunnel labels via `resolveTraefikLabels()`. The connect flow will:
1. Read current docker-compose.yml
2. Add external router labels to the target service
3. Write updated docker-compose.yml
4. Run `docker compose up -d` (only recreates changed service, no restart for others)

**Alternatives considered**:
- Traefik dynamic file provider — rejected: adds another config mechanism; label-based routing is already the Brewnet standard
- Docker API label update — rejected: doesn't persist across container recreation

## R-007: DNS Propagation Polling Strategy

**Decision**: Poll DNS resolution (dig/nslookup via `execa`) every 3 seconds for up to 60 seconds, with clear progress feedback

**Rationale**: After creating a CNAME record via Cloudflare API, DNS propagation is nearly instant for Cloudflare-managed domains (Scenario A) but can take minutes for Scenario B. Polling with `dig` against public resolvers (8.8.8.8, 1.1.1.1) provides real feedback. After 60 seconds, show "propagation in progress" message and let user proceed.

**Alternatives considered**:
- Cloudflare API verification only — rejected: doesn't confirm actual DNS resolution
- No polling, just show URL — rejected: bad UX when URL doesn't work yet

## R-008: Admin Settings Credential Storage

**Decision**: Store Cloudflare credentials in the existing `selections.json` under `domain.cloudflare` (already defined in `CloudflareConfig` interface), input via Admin Settings UI, saved via `/api/settings/cloudflare` endpoint

**Rationale**: The `CloudflareConfig` interface already has fields for `apiToken`, `accountId`, `zoneId`, `tunnelId`, etc. The Admin Settings area provides a form to input these values, which are saved to the same location the CLI uses. This ensures CLI and Admin UI share the same credential source. File permissions (chmod 600) are enforced on write.

**Alternatives considered**:
- Separate credentials file — rejected: fragments configuration, inconsistent with existing pattern
- Environment variables only — rejected: requires server restart, poor UX for web UI input
