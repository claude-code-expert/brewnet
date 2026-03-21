# Developer Quickstart: Domain Settings Feature

**Feature**: 006-domain-settings
**Branch**: `006-domain-settings`

---

## What Is Being Built

A redesigned domain management system for the Brewnet admin UI. The main changes:

1. **`CloudflareTunnelModal`** (replaces `DomainSettingModal.tsx`) — a 3-step guided wizard for Cloudflare Tunnel setup
2. **`AppDomainTab`** (replaces `DomainTab.tsx`) — per-app subdomain connection panel with smart defaults
3. **2 new backend endpoints** in `admin-server.ts` — zone listing and tunnel creation
4. **New `features/domain/` module** — all new code lives here, no surgery on existing components

---

## Prerequisites

- Brewnet initialized (admin password set, docker running)
- Node.js 20+, pnpm installed
- A Cloudflare account with at least one registered domain (for manual testing)

---

## Development Setup

```bash
# 1. Ensure you're on the correct branch
git checkout 006-domain-settings

# 2. Install dependencies (from repo root)
pnpm install

# 3. Build CLI (needed for admin-server)
pnpm --filter @brewnet/cli build

# 4. Start admin-server (in background)
node packages/cli/dist/index.js admin --foreground --no-open &

# 5. Start admin-ui dev server
pnpm --filter admin-ui dev
# → Opens http://localhost:5173

# 6. Run existing tests (ensure nothing is broken)
pnpm test
```

---

## New File Locations

### Frontend (packages/admin-ui/src/features/domain/)

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript types for wizard state, CF zones, setup steps |
| `utils/subdomain.ts` | `toSubdomainSlug(name)`, `validateSubdomainLabel(s)` |
| `api/domain-api.ts` | Typed fetch wrappers for all domain API calls |
| `hooks/useCloudflareSetup.ts` | Wizard step state machine (token→zone→tunnel) |
| `hooks/useAppDomain.ts` | Per-app connect/disconnect state |
| `components/HelpTooltip.tsx` | Reusable HelpCircle icon + tooltip + CF link |
| `components/StepIndicator.tsx` | Visual 1-2-3 progress indicator |
| `components/TokenStep.tsx` | Step 1 UI — token input with validation feedback |
| `components/ZoneStep.tsx` | Step 2 UI — zone dropdown from fetched list |
| `components/TunnelStep.tsx` | Step 3 UI — tunnel name input + create button |
| `components/CloudflareTunnelModal.tsx` | Wizard container modal |
| `components/AppDomainTab.tsx` | Per-app domain panel (subdomain + external URL) |
| `index.ts` | Barrel re-exports |

### Backend (packages/cli/src/services/admin-server.ts)

Two new route handlers added to the existing dispatch block:

| Endpoint | Handler Function |
|----------|----------------|
| `GET /api/cloudflare/zones` | `handleCloudflareZones()` |
| `POST /api/cloudflare/tunnel` | `handleCreateTunnel()` |

### Tests

| File | What It Tests |
|------|--------------|
| `tests/unit/admin-ui/domain-utils.test.ts` | `toSubdomainSlug()`, `validateSubdomainLabel()` edge cases |
| `tests/unit/cli/services/domain-settings.test.ts` | `handleCloudflareZones()`, `handleCreateTunnel()` with mocked fetch |

---

## Integration Points (Minimal Surgery)

Only 2 files need import changes:

```typescript
// packages/admin-ui/src/pages/Apps.tsx
// Before:
import { DomainSettingModal } from '../components/DomainSettingModal.js';
// After:
import { CloudflareTunnelModal } from '../features/domain/index.js';

// packages/admin-ui/src/components/AppDetailModal.tsx
// Before:
import { DomainTab } from './DomainTab.js';
// After:
import { AppDomainTab } from '../features/domain/index.js';
```

The old `DomainSettingModal.tsx` and `DomainTab.tsx` files stay in place until the feature is complete and verified, then they can be removed.

---

## Key Implementation Notes

### 1. Wizard Resume Logic

On modal open, always call `GET /api/settings/cloudflare` first. Derive `currentStep` from response:

```typescript
function deriveCurrentStep(status: CloudflareSetupStatus): SetupStep {
  if (!status.apiTokenSet) return 'token';
  if (!status.zoneName) return 'zone';
  if (!status.tunnelName) return 'tunnel';
  return 'complete';
}
```

If `currentStep === 'zone'`, immediately call `GET /api/cloudflare/zones` to pre-load the dropdown.

### 2. Subdomain Suggestion

```typescript
// utils/subdomain.ts
export function toSubdomainSlug(appName: string): string {
  return appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}
```

### 3. HelpTooltip CSS Pattern

Use CSS variables only — no new stylesheets:

```tsx
// Tooltip shown via CSS :hover, positioned absolute relative to the icon wrapper
<div style={{ position: 'relative', display: 'inline-block' }}>
  <HelpCircle size={14} color="var(--txt3)" />
  <div className="help-tooltip">
    {text}
    {link && <a href={link} target="_blank" rel="noreferrer">{linkLabel}</a>}
  </div>
</div>
```

### 4. Step Validation — Token Step

On blur or Enter:
1. Call `PUT /api/settings/cloudflare` with `{ apiToken: value }`
2. On success: advance to zone step, show inline checkmark + email
3. On error: show `tokenError` with specific message from server (`INVALID_TOKEN` → "Token invalid. Check permissions: Tunnel:Edit, DNS:Edit")

### 5. Tunnel Name Default

```typescript
// Derived from project name in WizardState
const defaultTunnelName = `brewnet-${wizardState.projectName
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '-')}`;
```

Returned by `GET /api/settings/cloudflare` if not yet set (server can provide the default in response).

### 6. Error Message Mapping

```typescript
const CF_ERROR_MESSAGES: Record<string, string> = {
  'INVALID_TOKEN': 'API token invalid or expired. Check that it has Tunnel:Edit and DNS:Edit permissions.',
  'NO_TOKEN': 'Complete Step 1 (API Token) before loading zones.',
  'TOKEN_INVALID': 'Your saved API token is no longer valid. Re-enter it in Step 1.',
  'TUNNEL_NAME_CONFLICT': 'A tunnel with this name already exists. Try a different name.',
  'CREDENTIALS_INCOMPLETE': 'Complete Steps 1 and 2 before creating a tunnel.',
  'CNAME_CONFLICT': 'This subdomain is already in use. Choose a different one.',
  'INVALID_SUBDOMAIN': 'Subdomain must be lowercase letters, numbers, and hyphens only.',
};
```

---

## Running Tests

```bash
# All tests (must pass before PR)
pnpm test

# New domain util tests only
npx jest tests/unit/admin-ui/domain-utils

# New admin-server endpoint tests only
npx jest tests/unit/cli/services/domain-settings

# Build check (no TypeScript errors)
pnpm --filter admin-ui build
pnpm --filter @brewnet/cli build
```

---

## Definition of Done

- [ ] `CloudflareTunnelModal` opens from Apps page "Domain Settings" button
- [ ] 3-step wizard completes for a real Cloudflare account
- [ ] After Step 3: tunnel appears in Cloudflare Dashboard
- [ ] Wizard resumes from correct step on re-open
- [ ] `AppDomainTab` shows suggestion, connects subdomain, shows external URL link
- [ ] Disconnect removes DNS record (verified in Cloudflare Dashboard)
- [ ] All error states show specific messages (no "Something went wrong")
- [ ] `tests/unit/admin-ui/domain-utils.test.ts` passes
- [ ] `tests/unit/cli/services/domain-settings.test.ts` passes
- [ ] `pnpm test` passes (no regressions)
- [ ] `pnpm --filter admin-ui build` succeeds (TypeScript strict, no errors)
