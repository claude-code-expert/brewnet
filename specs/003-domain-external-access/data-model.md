# Data Model: Domain External Access

**Feature**: 003-domain-external-access
**Date**: 2026-03-15

## Entities

### DomainConnection

Represents a single app-to-domain mapping managed by Brewnet.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| appName | string | Name of the local app/service (e.g., "my-api", "gitea") | Required, unique within project |
| subdomain | string | Subdomain prefix (e.g., "my-api", "git") | Required, valid DNS label |
| domain | string | Base domain (e.g., "yourdomain.com") | Required, must match configured zone |
| hostname | string | Full hostname (e.g., "my-api.yourdomain.com") | Derived: `${subdomain}.${domain}` |
| tunnelId | string | Cloudflare Tunnel ID used for this connection | Required, from CloudflareConfig |
| cnameRecordId | string | Cloudflare DNS record ID for the CNAME | Set after DNS creation, used for deletion |
| containerPort | number | Internal container port for Traefik routing | Required, from service definition |
| connectedAt | string | ISO 8601 timestamp of connection creation | Auto-set on connect |
| scenario | "A" \| "B" \| "C" | Which domain scenario was used | Required |

**Storage location**: `~/.brewnet/projects/<name>/selections.json` → `domainConnections[]`

**Relationships**:
- Belongs to one `WizardState` (project)
- References `CloudflareConfig` for tunnel/zone credentials
- Maps to one Traefik external router label set
- Maps to one Cloudflare Tunnel ingress rule

### CloudflareConfig (existing, extended usage)

Already defined in `packages/shared/src/types/wizard-state.ts`. No schema changes needed — only operational usage changes.

| Field | Type | Usage in this feature |
|-------|------|----------------------|
| apiToken | string | Used for all Cloudflare API calls (connect, disconnect, status) |
| accountId | string | Tunnel API path parameter |
| tunnelId | string | Ingress configuration target |
| tunnelToken | string | cloudflared container authentication |
| zoneId | string | DNS record API path parameter |
| zoneName | string | Base domain for hostname construction |

**Admin Settings input**: These fields are populated via CLI wizard or Admin Settings UI, stored in `selections.json` under `domain.cloudflare`.

## State Transitions

### DomainConnection Lifecycle

```
[Not Connected]
    │
    │ connect (CLI or Admin UI)
    │   ├─ Validate local health
    │   ├─ Update tunnel ingress (Cloudflare API)
    │   ├─ Create CNAME record (Cloudflare API)
    │   ├─ Add Traefik external labels
    │   ├─ Persist to domainConnections[]
    │   └─ Poll DNS propagation
    ▼
[Connected]
    │
    │ disconnect (CLI or Admin UI)
    │   ├─ Remove tunnel ingress rule (Cloudflare API)
    │   ├─ Delete CNAME record (Cloudflare API)
    │   ├─ Remove Traefik external labels
    │   └─ Remove from domainConnections[]
    ▼
[Not Connected]
```

### Rollback on Failure

```
connect attempt
    │
    ├─ Step 1: Ingress updated ✅
    ├─ Step 2: DNS creation ❌ FAIL
    │   └─ Rollback: Remove ingress rule added in Step 1
    └─ Result: [Not Connected] (clean state)
```

## Validation Rules

- `appName` must correspond to a running or defined service in the project
- `subdomain` must be a valid DNS label (lowercase alphanumeric + hyphens, no leading/trailing hyphens, max 63 chars)
- `domain` must match `CloudflareConfig.zoneName`
- `hostname` must be unique across all `domainConnections[]` in the project
- `cnameRecordId` must be preserved for reliable deletion (fallback: lookup by hostname)
- `containerPort` must match the service's exposed port in docker-compose.yml

## Data Volume Assumptions

- Maximum ~20 domain connections per project (one per service)
- Single Cloudflare tunnel per project
- Array stored in JSON (no pagination needed)
