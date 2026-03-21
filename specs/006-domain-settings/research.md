# Research: Domain Settings — Cloudflare Tunnel & External Domain Integration

**Feature**: 006-domain-settings
**Date**: 2026-03-20
**Status**: Complete — all unknowns resolved

---

## Finding 1: Cloudflare API Call Architecture — Proxy Pattern (Server-Side)

**Decision**: All Cloudflare API calls MUST go through the admin-server proxy. The frontend NEVER calls the Cloudflare API directly.

**Evidence**:
- `DomainSettingModal.tsx` only calls `/api/settings/cloudflare` (admin-server endpoint) — no direct CF calls
- `handleSettingsCloudflarePut()` in `admin-server.ts:1920` receives `{apiToken}` from frontend, then calls `verifyToken(apiToken)` server-side via `cloudflare-client.ts`
- The CF token is stored at `~/.brewnet/projects/<name>/selections.json` → `state.domain.cloudflare.apiToken`
- `GET /api/settings/cloudflare` returns masked values only (`"akz***abc"`) — the browser never sees the real token after saving

**Rationale**: Exposing the Cloudflare API token to browser JavaScript would allow XSS attacks and browser extension sniffing to extract tunnel management credentials. The admin-server is localhost-only, making server-side storage the correct security model.

**Implication for new endpoints**: Two new admin-server endpoints are required:
1. `GET /api/cloudflare/zones` — uses stored token, returns zone list (dropdown data for Step 2)
2. `POST /api/cloudflare/tunnel` — uses stored token + accountId + zoneId, creates tunnel with given name

**Alternatives considered**:
- Direct browser → Cloudflare calls: Rejected. Security violation. Token exposed to JS runtime.
- Re-entering token each time: Rejected. Token is already persisted server-side.

---

## Finding 2: `domain-connect` Already Does Cloudflare Automation

**Decision**: `POST /api/domain/connect` with `{appName, subdomain, domain}` is sufficient for per-app domain connection. No new endpoint needed.

**Evidence**:
`DomainManager.connect(appName, subdomain, domain)` (domain-manager.ts) executes 6 steps:
1. Local app health check (HTTP ping)
2. **`configureTunnelIngress()`** — updates Cloudflare tunnel ingress rules via CF API
3. **`createDnsRecord()`** — creates Cloudflare CNAME DNS record via CF API
4. Traefik label injection into compose file
5. State persistence (domainConnections array in WizardState)
6. DNS propagation polling (dig lookup)

**Implication**: The `AppDomainTab` replacement just needs to call the existing `/api/domain/connect` and `/api/domain/disconnect` endpoints — no new backend work for per-app connection.

---

## Finding 3: WizardState Cloudflare Config Fields

**Decision**: The cloudflare config object in WizardState has 10 fields. The step wizard completion can be inferred from these fields without any schema change.

**Complete field list** (`WizardState.domain.cloudflare`):
```typescript
{
  enabled: boolean;          // Named tunnel active
  tunnelMode: 'quick' | 'named' | 'none';
  quickTunnelUrl: string;    // runtime-only, not persisted
  accountId: string;         // CF Account ID
  apiToken: string;          // CF API Token (server-side only)
  tunnelId: string;          // CF Tunnel ID
  tunnelToken: string;       // CF connector token (for cloudflared docker)
  tunnelName: string;        // Human-readable tunnel name
  zoneId: string;            // CF Zone ID
  zoneName: string;          // Domain name (e.g., "myserver.com")
}
```

**Step completion inference** (for wizard resume logic):
- Step 1 complete: `apiToken` is set (returned as `apiTokenSet: true` by GET /api/settings/cloudflare)
- Step 2 complete: `zoneId` and `zoneName` are set
- Step 3 complete: `tunnelId` and `tunnelName` are set

**Implication**: `GET /api/settings/cloudflare` already returns `{apiTokenSet, configured, tunnelId, tunnelName, zoneName}` — the frontend can determine wizard position from this response without changes.

---

## Finding 4: Admin-UI Testing — No Framework Exists

**Decision**: New pure utility tests go in `tests/unit/admin-ui/` using the existing Jest + ts-jest setup. React component tests are out of scope for this feature.

**Evidence**:
- `packages/admin-ui/package.json` has no Jest, Vitest, or testing-library dependency
- Root `jest.config.js` covers `tests/` directory with Node.js environment
- CLI service tests follow the pattern: `describe/it/expect` + `jest.fn<typeof fetch>()` mock + `.js` import paths

**Implication**:
- Pure utility functions (`subdomain.ts`: `toSubdomainSlug()`, `validateSubdomainLabel()`) → `tests/unit/admin-ui/domain-utils.test.ts`
- New admin-server endpoint handlers → `tests/unit/cli/services/domain-settings.test.ts` (extends existing cloudflare-client.test.ts pattern)
- React component tests deferred — no testing library installed, adding it is out of scope

---

## Finding 5: New Backend Endpoints Required

**Decision**: Two new endpoints in admin-server.ts, both auth-gated.

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/cloudflare/zones` | GET | List zones using stored token | Required |
| `/api/cloudflare/tunnel` | POST | Create tunnel with given name | Required |

**Existing endpoints that cover everything else:**

| Endpoint | Used For |
|----------|---------|
| `GET /api/settings/cloudflare` | Load saved config + step resume logic |
| `PUT /api/settings/cloudflare` | Save token (Step 1), save zoneId (Step 2) |
| `POST /api/domain/connect` | Per-app subdomain connection + DNS + ingress |
| `DELETE /api/domain/disconnect/:appName` | Remove domain connection |
| `GET /api/domain/list` | List all connections + tunnel health |
| `GET /api/domain/apps` | List connectable apps with connection status |

---

## Finding 6: Frontend Module Structure Decision

**Decision**: New `features/domain/` module in `packages/admin-ui/src/` with flat-ish component tree.

**Structure**:
```
packages/admin-ui/src/features/domain/
├── index.ts                        # barrel re-exports
├── types.ts                        # CloudflareSetupStatus, SetupStep, DomainConnectResult
├── utils/
│   └── subdomain.ts               # toSubdomainSlug(), validateSubdomainLabel()
├── api/
│   └── domain-api.ts              # typed fetch helpers wrapping admin-server
├── hooks/
│   ├── useCloudflareSetup.ts      # wizard step state machine
│   └── useAppDomain.ts            # per-app connect/disconnect state
└── components/
    ├── HelpTooltip.tsx             # reusable HelpCircle icon + hover tooltip + CF link
    ├── StepIndicator.tsx           # visual 1-2-3 step progress bar
    ├── CloudflareTunnelModal.tsx   # replaces DomainSettingModal — wizard container
    ├── TokenStep.tsx              # Step 1: token input, validation feedback
    ├── ZoneStep.tsx               # Step 2: zone dropdown from fetched list
    ├── TunnelStep.tsx             # Step 3: tunnel name input + create button
    └── AppDomainTab.tsx           # replaces DomainTab — per-app domain panel
```

**Integration surgery (minimal):**
- `pages/Apps.tsx`: Replace `DomainSettingModal` import with `features/domain/components/CloudflareTunnelModal`
- `components/AppDetailModal.tsx`: Replace `DomainTab` import with `features/domain/components/AppDomainTab`
- Both existing files change only 2 lines each (import + JSX tag name)

**Rationale**: Feature module pattern keeps domain logic self-contained. All styling uses existing CSS variables (`--teal`, `--red`, `--bdr`, `--txt`, `--r`, `--mono`). No new dependencies needed.
