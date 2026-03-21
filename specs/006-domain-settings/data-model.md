# Data Model: Domain Settings — Cloudflare Tunnel & External Domain Integration

**Feature**: 006-domain-settings
**Date**: 2026-03-20

---

## Existing Entities (No Schema Change Required)

### CloudflareConfig (in WizardState — already persisted)

Lives at `~/.brewnet/projects/<name>/selections.json` → `domain.cloudflare`.

```typescript
// From packages/shared/src/types/wizard-state.ts
interface CloudflareConfig {
  enabled: boolean;            // true when Named Tunnel is active
  tunnelMode: 'quick' | 'named' | 'none';
  quickTunnelUrl: string;      // runtime-only
  accountId: string;           // Cloudflare Account ID
  apiToken: string;            // API Token — server-side only, never exposed to browser
  tunnelId: string;            // Cloudflare Tunnel UUID
  tunnelToken: string;         // connector token for cloudflared docker service
  tunnelName: string;          // human-readable tunnel name
  zoneId: string;              // Cloudflare Zone ID
  zoneName: string;            // domain name, e.g. "myserver.com"
}
```

**No changes to this type.** All fields are already present.

### DomainConnection (in WizardState — already persisted)

Lives at `domain.domainConnections[]`.

```typescript
interface DomainConnection {
  appName: string;
  hostname: string;        // full hostname: "my-app.myserver.com"
  connectedAt?: string;    // ISO datetime
}
```

**No changes to this type.**

---

## New Frontend Types (admin-ui only — not persisted)

### SetupStep (wizard progress enum)

```typescript
// packages/admin-ui/src/features/domain/types.ts

type SetupStep = 'token' | 'zone' | 'tunnel' | 'complete';
```

### CloudflareSetupStatus (loaded from GET /api/settings/cloudflare)

```typescript
interface CloudflareSetupStatus {
  configured: boolean;       // all three main fields set
  apiTokenSet: boolean;      // step 1 complete
  zoneName: string;          // step 2 complete when non-empty
  zoneId?: string;           // masked or absent
  tunnelId?: string;         // masked or absent
  tunnelName: string;        // step 3 complete when non-empty
  accountId?: string;        // masked or absent
}
```

**Derivation**: Current step = first step where field indicates incomplete state:
- `!apiTokenSet` → 'token'
- `!zoneName` → 'zone'
- `!tunnelName` → 'tunnel'
- else → 'complete'

### CloudflareZone (from GET /api/cloudflare/zones)

```typescript
interface CloudflareZone {
  id: string;
  name: string;
  status: string;  // 'active' | 'pending' | ...
}
```

### SetupStepState (wizard local state)

```typescript
interface SetupStepState {
  currentStep: SetupStep;
  token: string;             // user input — cleared after save
  tokenValidating: boolean;
  tokenError: string | null;
  tokenEmail: string | null; // returned by server after validation

  zones: CloudflareZone[];
  zonesLoading: boolean;
  selectedZoneId: string;

  tunnelName: string;        // user-editable, pre-filled
  tunnelCreating: boolean;
  tunnelError: string | null;
}
```

### AppDomainState (per-app domain panel local state)

```typescript
interface AppDomainState {
  connections: DomainConnection[];
  loading: boolean;
  subdomain: string;          // user input (pre-filled with suggestion)
  subdomainError: string | null;
  connecting: boolean;
  disconnecting: boolean;
  cfConfigured: boolean;      // from /api/domain/list credentialsConfigured
}
```

---

## Step Resume Logic (Stateless Derivation)

The wizard derives its starting step from the saved server state. No additional persistence is needed.

```
GET /api/settings/cloudflare response → derive currentStep:

if (!apiTokenSet)      → start at 'token'
else if (!zoneName)    → start at 'zone'   (fetch zones immediately)
else if (!tunnelName)  → start at 'tunnel' (pre-fill tunnel name from project)
else                   → show 'complete'   (summary card)
```

---

## Validation Rules

### Subdomain (FR-015)

| Rule | Constraint |
|------|-----------|
| Characters | Lowercase `a-z`, digits `0-9`, hyphens `-` only |
| Start/End | Must start and end with alphanumeric character |
| Length | 1–63 characters |
| Reserved | Cannot be empty, cannot be `www`, `mail`, `ftp` |

### Tunnel Name

| Rule | Constraint |
|------|-----------|
| Characters | Alphanumeric and hyphens only |
| Length | 1–63 characters |
| Default | `brewnet-{projectName}` (projectName lowercased, spaces → hyphens) |

### API Token

| Rule | Constraint |
|------|-----------|
| Format | Non-empty string, minimum 32 characters |
| Validation | Server-side only via Cloudflare `/user/tokens/verify` |

---

## State Transitions

### Wizard Setup Flow

```
[token] → (token saved & valid) → [zone]
[zone]  → (zone selected & saved) → [tunnel]
[tunnel] → (tunnel created) → [complete]
[complete] → (Edit button) → [token] (full restart)
```

### Per-App Domain

```
[disconnected] → (connect: subdomain confirmed) → [connecting] → [connected]
[connected]    → (disconnect: confirmed) → [disconnecting] → [disconnected]
```

### Error States (all steps)

Each step has an error state that shows inline (red border + message) without blocking navigation to a previous step. Error clears when user edits the field.
