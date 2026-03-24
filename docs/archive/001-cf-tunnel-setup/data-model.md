# Data Model: Cloudflare Tunnel Setup — 4-Scenario Initial Install Flow

**Date**: 2026-02-27 | **Branch**: `001-cf-tunnel-setup`

---

## Modified Types (`packages/shared/src/types/wizard-state.ts`)

### DomainProvider (extended)

```typescript
// Before
type DomainProvider = 'local' | 'tunnel';

// After
type DomainProvider = 'local' | 'tunnel' | 'quick-tunnel';
```

| Value | Meaning |
|-------|---------|
| `'local'` | No external access; domain = `{projectName}.local` |
| `'tunnel'` | Named Tunnel with Cloudflare-managed domain (Scenarios 2, 3, 4) |
| `'quick-tunnel'` | Quick Tunnel via `*.trycloudflare.com` (Scenario 1) |

---

### CloudflareConfig (extended)

```typescript
interface CloudflareConfig {
  enabled: boolean;

  // NEW: discriminates Quick vs Named vs none
  tunnelMode: 'quick' | 'named' | 'none';

  // NEW: populated at runtime when tunnelMode='quick'; empty string otherwise
  // Never persisted after server restart (URL changes)
  quickTunnelUrl: string;

  // Existing fields (unchanged)
  accountId: string;   // CF account ID; empty when tunnelMode='quick' or 'none'
  apiToken: string;    // NEVER persisted; cleared immediately after tunnel creation
  tunnelId: string;    // CF tunnel UUID; empty when tunnelMode='quick'
  tunnelToken: string; // Connector token for cloudflared container
  tunnelName: string;  // Human-readable tunnel name (= projectName)
  zoneId: string;      // CF zone ID for the domain; empty when tunnelMode='quick' or Scenario 4 pre-connect
  zoneName: string;    // Actual domain (e.g. "myserver.com"); empty same as zoneId
}
```

**Field lifecycle by scenario:**

| Field | Scenario 1 (Quick) | Scenario 2 (Named+Domain) | Scenario 3 (Buy Domain) | Scenario 4 (No Domain) |
|-------|-------------------|--------------------------|------------------------|----------------------|
| `tunnelMode` | `'quick'` | `'named'` | `'named'` | `'named'` |
| `quickTunnelUrl` | set at runtime | `''` | `''` | `''` |
| `accountId` | `''` | set | set | set |
| `apiToken` | `''` | cleared after use | cleared after use | cleared after use |
| `tunnelId` | `''` | set | set | set |
| `tunnelToken` | `''` | set | set | set |
| `tunnelName` | `''` | set | set | set |
| `zoneId` | `''` | set | set | `''` until `domain connect` |
| `zoneName` | `''` | set | set | `''` until `domain connect` |

---

### TunnelLogEvent (new)

```typescript
interface TunnelLogEvent {
  timestamp: string;  // ISO 8601 UTC, e.g. "2026-02-27T12:34:56.789Z"
  event:
    | 'CREATE'          // Named tunnel successfully created via CF API
    | 'ROLLBACK'        // Auto-rollback: tunnel deleted after partial failure
    | 'DOMAIN_CONNECT'  // brewnet domain connect executed
    | 'RESTART'         // brewnet domain tunnel restart executed
    | 'STATUS_CHANGE'   // Tunnel health changed (e.g., healthy → degraded)
    | 'QUICK_START'     // Quick Tunnel container started, URL captured
    | 'QUICK_STOP';     // Quick Tunnel container stopped
  tunnelMode: 'quick' | 'named';
  tunnelId?: string;   // CF tunnel UUID (absent for Quick Tunnel events)
  tunnelName?: string; // Human-readable name (absent for Quick Tunnel events)
  domain?: string;     // Domain name (absent before domain connect)
  detail: string;      // Human-readable description of what happened
  error?: string;      // Error message if event represents a failure (no tokens)
}
```

**Log file location**: `~/.brewnet/logs/tunnel.log`
**Format**: One JSON object per line (NDJSON). Never contains `apiToken` or `tunnelToken`.

---

### TunnelHealth (new, runtime-only — not persisted)

```typescript
interface TunnelHealth {
  status: 'healthy' | 'degraded' | 'inactive';
  connectorCount: number;           // Number of active cloudflared connections
  tunnelId: string;
  tunnelName: string;
  lastChecked: string;              // ISO 8601 UTC timestamp
  services: TunnelServiceStatus[];  // Per-service accessibility
}

interface TunnelServiceStatus {
  name: string;          // e.g. "FileBrowser"
  url: string;           // e.g. "https://files.myserver.com" or "https://abc.trycloudflare.com/files"
  subdomain?: string;    // e.g. "files" (Named Tunnel only)
  path?: string;         // e.g. "/files" (Quick Tunnel only)
  accessible: boolean;   // Result of HTTP HEAD check (best-effort)
}
```

---

## State Transitions

### TunnelMode Transitions

```
Initial (none)
  ├─→ 'quick'   (Scenario 1: Quick Tunnel selected at init)
  │     └─→ 'named'  (via brewnet domain connect: new tunnel created, Quick stopped)
  ├─→ 'named'   (Scenarios 2, 3, 4: Named Tunnel created at init)
  └─→ 'none'    (Scenario 5: Local only selected)
```

### DomainProvider Transitions

```
'local'          (Local only — no external access)
'quick-tunnel'   (Quick Tunnel — temporary URL)
  └─→ 'tunnel'   (via brewnet domain connect)
'tunnel'         (Named Tunnel — permanent subdomain URLs)
```

### Tunnel Setup Rollback States

```
CREATING_TUNNEL
  → SUCCESS: CONFIGURING_INGRESS
  → FAIL: ROLLBACK_INITIATED → ROLLBACK_COMPLETE (tunnelId deleted)

CONFIGURING_INGRESS
  → SUCCESS: CREATING_DNS
  → FAIL: ROLLBACK_INITIATED → ROLLBACK_COMPLETE

CREATING_DNS
  → SUCCESS (some records): STARTING_CONTAINER
  → FAIL ALL: ROLLBACK_INITIATED → ROLLBACK_COMPLETE (tunnel + created records deleted)

STARTING_CONTAINER
  → SUCCESS: VERIFYING_HEALTH
  → FAIL: ROLLBACK_INITIATED → ROLLBACK_COMPLETE

VERIFYING_HEALTH
  → 'healthy': COMPLETE
  → timeout/degraded: ROLLBACK_INITIATED → ROLLBACK_COMPLETE
```

---

## Zod Schema Changes

```typescript
// In packages/shared/src/schemas/wizard-state.schema.ts (new or existing)

const TunnelModeSchema = z.enum(['quick', 'named', 'none']);

const CloudflareConfigSchema = z.object({
  enabled: z.boolean(),
  tunnelMode: TunnelModeSchema,
  quickTunnelUrl: z.string().default(''),
  accountId: z.string().default(''),
  apiToken: z.string().default(''),   // Always cleared before persist
  tunnelId: z.string().default(''),
  tunnelToken: z.string().default(''),
  tunnelName: z.string().default(''),
  zoneId: z.string().default(''),
  zoneName: z.string().default(''),
});

const DomainProviderSchema = z.enum(['local', 'tunnel', 'quick-tunnel']);

const DomainConfigSchema = z.object({
  provider: DomainProviderSchema,
  name: z.string(),
  ssl: z.enum(['self-signed', 'letsencrypt', 'cloudflare']),
  cloudflare: CloudflareConfigSchema,
});
```

---

## ServiceRoute (existing, unchanged)

```typescript
// packages/cli/src/services/cloudflare-client.ts
interface ServiceRoute {
  subdomain: string;    // e.g. "files"
  containerName: string; // e.g. "brewnet-filebrowser"
  port: number;          // e.g. 80
}
```

Used for: Named Tunnel ingress rule generation and DNS CNAME record creation.
Not used for: Quick Tunnel (which uses Traefik path labels instead).
