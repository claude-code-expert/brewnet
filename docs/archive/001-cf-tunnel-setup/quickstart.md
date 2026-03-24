# Quickstart: Cloudflare Tunnel Setup Feature Development

**Branch**: `001-cf-tunnel-setup` | **Date**: 2026-02-27

---

## Prerequisites

```bash
node --version   # 20+
pnpm --version   # 8+
docker --version # 24+
```

---

## Getting Started

```bash
git checkout 001-cf-tunnel-setup
pnpm install
pnpm build
```

---

## Implementation Order

Follow the task phases in this order to avoid TypeScript compilation errors from missing types:

### 1. Shared Types First (Phase 1)

```bash
# Edit packages/shared/src/types/wizard-state.ts
# Add: tunnelMode, quickTunnelUrl to CloudflareConfig
# Add: 'quick-tunnel' to DomainProvider
# Add: TunnelHealth, TunnelLogEvent interfaces

pnpm --filter @brewnet/shared build
```

### 2. Core Services (Phase 2)

New files to create:
```bash
# packages/cli/src/utils/tunnel-logger.ts
# packages/cli/src/services/quick-tunnel.ts
```

Files to modify:
```bash
# packages/cli/src/services/cloudflare-client.ts
# Add fetchWithRetry() and deleteTunnel()
```

### 3. Compose Generator (Phase 3)

```bash
# packages/cli/src/services/compose-generator.ts
# Branch on state.domain.cloudflare.tunnelMode for cloudflared service
```

### 4. Wizard Step 4 (Phase 4)

```bash
# packages/cli/src/wizard/steps/domain-network.ts
# Replace binary select with 5-option scenario selector
```

### 5. New domain.ts Command (Phase 5)

```bash
# packages/cli/src/commands/domain.ts  ← CREATE
# Register in packages/cli/src/index.ts
```

---

## Running Tests

```bash
# All tests
pnpm test

# Specific unit tests for this feature
pnpm --filter @brewnet/cli test -- --testPathPattern="cloudflare-client|quick-tunnel|tunnel-logger|domain-connect"

# Integration tests (wizard scenarios)
pnpm --filter @brewnet/cli test -- --testPathPattern="domain-network"
```

---

## Key File Locations

| Purpose | File |
|---------|------|
| Shared types (modify) | `packages/shared/src/types/wizard-state.ts` |
| CF API client (modify) | `packages/cli/src/services/cloudflare-client.ts` |
| Compose generator (modify) | `packages/cli/src/services/compose-generator.ts` |
| Wizard Step 4 (modify) | `packages/cli/src/wizard/steps/domain-network.ts` |
| Quick Tunnel manager (new) | `packages/cli/src/services/quick-tunnel.ts` |
| Tunnel logger (new) | `packages/cli/src/utils/tunnel-logger.ts` |
| Domain commands (new) | `packages/cli/src/commands/domain.ts` |

---

## Testing Cloudflare API Locally

Use environment variables to avoid real API calls in development:

```bash
# .env.test (never commit)
CF_API_TOKEN=test-token-mock
CF_ACCOUNT_ID=test-account-id
CF_ZONE_ID=test-zone-id
```

All tests mock `fetch` to avoid real CF API calls. See existing `cloudflare-client.test.ts` for the mock pattern.

---

## Tunnel Log Format (for reference)

Log file: `~/.brewnet/logs/tunnel.log`

```jsonl
{"timestamp":"2026-02-27T12:34:56.789Z","event":"CREATE","tunnelMode":"named","tunnelId":"c1744f8b-...","tunnelName":"brewnet-homeserver","detail":"Named tunnel created successfully"}
{"timestamp":"2026-02-27T12:35:01.123Z","event":"ROLLBACK","tunnelMode":"named","tunnelId":"c1744f8b-...","detail":"Rollback triggered: DNS record creation failed","error":"HTTP 400: zone inactive"}
{"timestamp":"2026-02-27T12:40:00.000Z","event":"QUICK_START","tunnelMode":"quick","detail":"Quick Tunnel started","quickTunnelUrl":"https://purple-meadow.trycloudflare.com"}
```

**Rule**: Never include `apiToken`, `tunnelToken`, or any credentials in log entries.

---

## Acceptance Test Checklist

Before submitting PR, manually verify:

- [ ] `brewnet init` Step 4 shows all 5 options
- [ ] Scenario 1: Quick Tunnel URL appears in Step 7 with per-service paths
- [ ] Scenario 2: Named Tunnel with API token → all DNS records created → tunnel healthy
- [ ] Scenario 2 failure: tunnel is deleted (check CF dashboard) and error shown
- [ ] Scenario 3: Quick Tunnel bridge starts → Enter waits → Named Tunnel activates → Quick Tunnel stops
- [ ] Scenario 4: Tunnel created but no DNS records in CF dashboard
- [ ] `brewnet domain connect` after Scenario 1: migrates to Named Tunnel
- [ ] `brewnet domain connect` after Scenario 4: creates DNS records
- [ ] `brewnet domain tunnel status` shows correct health
- [ ] `brewnet domain tunnel restart` restarts container and confirms reconnect
- [ ] `~/.brewnet/logs/tunnel.log` has events, no tokens
