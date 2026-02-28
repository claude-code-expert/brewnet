# Implementation Plan: Cloudflare Tunnel Setup — 4-Scenario Initial Install Flow

**Branch**: `001-cf-tunnel-setup` | **Date**: 2026-02-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-cf-tunnel-setup/spec.md`

---

## Summary

Extend the `brewnet init` Step 4 wizard and add new post-install tunnel management commands to support four external access scenarios:
1. **Quick Tunnel** — zero-prereq `*.trycloudflare.com` URL via Traefik path-prefix routing
2. **Named Tunnel + existing domain** — full CF API automation (already ~80% done)
3. **Named Tunnel + guided domain purchase** — single-session wait with Quick Tunnel bridge
4. **Named Tunnel only** — create tunnel without DNS, attach domain later via `brewnet domain connect`

Core technical additions: retry/rollback on CF API calls, Quick Tunnel URL parsing from Docker logs, Traefik path-prefix labels for Quick Tunnel mode, `tunnel-logger.ts` for audit events, and a new `domain.ts` command file.

---

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+ (ESM)
**Primary Dependencies**: Commander.js, @inquirer/prompts, chalk, ora, execa, dockerode, js-yaml, better-sqlite3, zod
**Storage**: `~/.brewnet/config.json` (wizard state), `~/.brewnet/logs/tunnel.log` (new tunnel audit log)
**Testing**: Jest 29.x (unit + integration)
**Target Platform**: macOS (darwin), Linux (Ubuntu 22.04+, Debian 12+)
**Project Type**: CLI tool (pnpm monorepo: packages/cli, packages/shared, packages/dashboard)
**Performance Goals**: Quick Tunnel active < 2 min from Step 4; Named Tunnel fully live < 5 min from Step 4
**Constraints**: No API token persistence; offline core operations unaffected; single pnpm monorepo with no new packages
**Scale/Scope**: 1 tunnel per brewnet project, 4–8 Docker services, ≤ 15 CF API calls per setup session

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Zero Config** | ✅ PASS | Quick Tunnel requires zero config. Named Tunnel requires one token paste. All defaults auto-applied. |
| **II. Secure by Default** | ✅ PASS | FR-015: API token never persisted. FR-027: `tunnel.log` never contains raw tokens. Docker containers use existing `no-new-privileges` security option. |
| **III. Transparent Operations** | ✅ PASS | FR-027 adds `~/.brewnet/logs/tunnel.log`. All CF API calls show ora spinners. Step 7 lists all service paths/URLs explicitly. |
| **IV. Reversible Actions** | ⚠️ JUSTIFIED EXCEPTION | FR-014a auto-rollback deletes a CF tunnel without explicit user confirmation. **Justification**: the tunnel was created seconds earlier in the same session; user already confirmed the overall init flow; prompt-then-delete would add unnecessary friction mid-wizard for a resource that has zero existing data; alternative (leave orphaned tunnel) causes accumulating clutter in the CF account. |
| **V. Offline First** | ✅ PASS | Tunnel setup inherently requires internet (by design). Core commands (`status`, `up`, `down`, `logs`) are unaffected. Failures produce clear error messages. |

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| FR-014a auto-rollback (Principle IV exception) | Orphaned CF tunnels accumulate silently in user's account; CF disallows same-name tunnel re-creation without deletion | Prompt-then-delete would halt the wizard mid-flow for a just-created zero-data resource; user has already consented to the init flow |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-cf-tunnel-setup/
├── plan.md              ← This file
├── research.md          ← Phase 0 findings
├── data-model.md        ← Phase 1 type definitions
├── quickstart.md        ← Phase 1 dev guide
├── contracts/           ← CLI command schemas
│   ├── domain-connect.md
│   └── tunnel-commands.md
└── tasks.md             ← Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code Changes

```text
packages/shared/src/
└── types/
    └── wizard-state.ts              [MODIFY] + tunnelMode, quickTunnelUrl on CloudflareConfig
                                              + 'quick-tunnel' to DomainProvider union

packages/cli/src/
├── commands/
│   └── domain.ts                   [CREATE] Commander subcommands: connect, tunnel status, tunnel restart
├── services/
│   ├── cloudflare-client.ts        [MODIFY] + fetchWithRetry(), + deleteTunnel()
│   ├── quick-tunnel.ts             [CREATE] QuickTunnel lifecycle: start container, parse URL from logs
│   ├── tunnel-manager.ts           [CREATE] Scenario orchestrator (wraps 4 flows + rollback)
│   └── compose-generator.ts        [MODIFY] + Quick Tunnel cloudflared service variant
│                                            + Traefik path-prefix labels for Quick Tunnel mode
├── utils/
│   └── tunnel-logger.ts            [CREATE] Appends structured events to ~/.brewnet/logs/tunnel.log
└── wizard/
    └── steps/
        └── domain-network.ts       [MODIFY] Replace binary local/tunnel choice with 5-option selector
                                             Integrate scenarios 1 (Quick), 3 (buy first), 4 (no DNS)

tests/
├── unit/
│   └── cli/
│       └── services/
│           ├── cloudflare-client.test.ts   [MODIFY] + retry + rollback tests
│           ├── quick-tunnel.test.ts        [CREATE] URL parsing, container lifecycle
│           └── tunnel-logger.test.ts       [CREATE] Event format, no-token assertion
└── integration/
    └── wizard/
        └── domain-network.test.ts          [CREATE] Scenario 1-4 wizard flows (mocked CF API)
```

---

## Implementation Phases

### Phase 1 — Type Foundation *(no dependencies)*

Extend shared types first so all downstream files have correct signatures.

| Task | File | Change |
|------|------|--------|
| T-001 | `packages/shared/src/types/wizard-state.ts` | Add `tunnelMode: 'quick' \| 'named' \| 'none'` and `quickTunnelUrl: string` to `CloudflareConfig`; add `'quick-tunnel'` to `DomainProvider` |
| T-002 | `packages/shared/src/types/wizard-state.ts` | Add `TunnelHealth` and `TunnelLogEvent` interfaces |

### Phase 2 — Core Services *(depends on Phase 1)*

| Task | File | Change |
|------|------|--------|
| T-003 | `packages/cli/src/services/cloudflare-client.ts` | Add `fetchWithRetry()` helper (max 3, exponential backoff 1s/2s/4s ±10% jitter) |
| T-004 | `packages/cli/src/services/cloudflare-client.ts` | Add `deleteTunnel(apiToken, accountId, tunnelId)` for rollback |
| T-005 | `packages/cli/src/utils/tunnel-logger.ts` | Create `TunnelLogger` class: appends `TunnelLogEvent` entries to `~/.brewnet/logs/tunnel.log`; must never log raw API tokens |
| T-006 | `packages/cli/src/services/quick-tunnel.ts` | Create `QuickTunnelManager`: starts `cloudflared` container with `--url http://traefik:80`, streams Docker logs, extracts URL with regex `/https?:\/\/([\w-]+\.trycloudflare\.com)/i`, exposes `start()/stop()/getUrl()` |

### Phase 3 — Compose Generator Update *(depends on Phase 1)*

| Task | File | Change |
|------|------|--------|
| T-007 | `packages/cli/src/services/compose-generator.ts` | Modify cloudflared service generation: `tunnelMode=quick` → `command: tunnel --no-autoupdate --url http://traefik:80` (no TUNNEL_TOKEN env); `tunnelMode=named` → `command: tunnel --no-autoupdate run` + `TUNNEL_TOKEN` env |
| T-008 | `packages/cli/src/services/compose-generator.ts` | Add Traefik path-prefix routing labels for Quick Tunnel mode. Only path-friendly services get prefix routes: FileBrowser (`/files`), Gitea (`/git`), Uptime Kuma (`/status`), Grafana (`/grafana`). Services not supporting path prefixes well (Nextcloud, Jellyfin) are noted as "Named Tunnel recommended" in Step 7. |

### Phase 4 — Wizard Step 4 Refactor *(depends on Phases 2 & 3)*

| Task | File | Change |
|------|------|--------|
| T-009 | `packages/cli/src/wizard/steps/domain-network.ts` | Replace binary `local/tunnel` `select` prompt with 5-option scenario selector: (1) Quick Tunnel, (2) Named Tunnel + existing domain, (3) Named Tunnel + buy domain first, (4) Named Tunnel only, (5) Local only |
| T-010 | `packages/cli/src/wizard/steps/domain-network.ts` | Implement Scenario 1 flow: set `tunnelMode='quick'`, `provider='quick-tunnel'`, start `QuickTunnelManager`, capture URL into `quickTunnelUrl`, display warning + `brewnet domain connect` next-step hint in Step 7 |
| T-011 | `packages/cli/src/wizard/steps/domain-network.ts` | Wrap existing Named Tunnel API flow (Scenario 2) with: `fetchWithRetry` on each CF API call, `deleteTunnel()` rollback on any step failure after tunnel creation, `TunnelLogger` events |
| T-012 | `packages/cli/src/wizard/steps/domain-network.ts` | Implement Scenario 3 flow: display domain purchase guide, offer Quick Tunnel bridge, await single Enter press within same session, then resume Scenario 2 flow; stop Quick Tunnel on Named Tunnel success |
| T-013 | `packages/cli/src/wizard/steps/domain-network.ts` | Implement Scenario 4 flow: set `tunnelMode='named'`, run CF API token + tunnel creation only (no ingress, no DNS records), deploy cloudflared with TUNNEL_TOKEN, display `brewnet domain connect` hint |

### Phase 5 — New Commands *(depends on Phase 2)*

| Task | File | Change |
|------|------|--------|
| T-014 | `packages/cli/src/commands/domain.ts` | Create file. Implement `brewnet domain connect`: reads existing state, determines if tunnel exists (named/quick/none), runs appropriate path (upsert DNS only vs create new tunnel + DNS), logs events, confirms success |
| T-015 | `packages/cli/src/commands/domain.ts` | Implement `brewnet domain tunnel status`: queries CF API for tunnel health, displays connector count + per-service URL accessibility |
| T-016 | `packages/cli/src/commands/domain.ts` | Implement `brewnet domain tunnel restart`: restarts cloudflared Docker container via dockerode, waits for reconnect confirmation |
| T-017 | `packages/cli/src/index.ts` (or root command file) | Register `domain` command with Commander.js |

### Phase 6 — Tests *(depends on all phases)*

| Task | File | Type |
|------|------|------|
| T-018 | `tests/unit/cli/services/cloudflare-client.test.ts` | Unit: retry behavior (3× then fail), rollback (deleteTunnel called on failure), non-retryable errors (401/403 not retried) |
| T-019 | `tests/unit/cli/services/quick-tunnel.test.ts` | Unit: URL regex parsing (valid/invalid output), container lifecycle (start/stop) with mocked dockerode |
| T-020 | `tests/unit/cli/utils/tunnel-logger.test.ts` | Unit: event format correctness, no API token in log, file created if missing |
| T-021 | `tests/integration/wizard/domain-network.test.ts` | Integration: all 4 scenario selection paths with mocked CF API responses and Docker API |
| T-022 | `tests/unit/cli/commands/domain-connect.test.ts` | Unit: domain connect with existing named tunnel (upsert path), with Quick Tunnel (new tunnel + migration path), CNAME upsert on conflict |

---

## Dependency Graph

```
Phase 1 (Types)
  └── Phase 2 (Core Services)
        ├── Phase 4 (Wizard Refactor)
        │     └── Phase 6 (Tests)
        └── Phase 5 (New Commands)
              └── Phase 6 (Tests)
  └── Phase 3 (Compose Generator)
        └── Phase 4 (Wizard Refactor)
```

**Critical path**: T-001 → T-003/T-004 → T-009~T-013 → T-021

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---------|--------|-----------|
| Quick Tunnel routing | Path-prefix via Traefik (only path-friendly services) | Single URL constraint; Nextcloud/Jellyfin noted as "Named Tunnel recommended" in Step 7 |
| CF API retry | Max 3×, exponential backoff 1s/2s/4s ±10% jitter | Industry standard; 401/403 skip retry (token issues need user action) |
| Rollback trigger | Any step failure AFTER tunnel creation | Prevents orphaned tunnels accumulating in CF account |
| Scenario 3 session model | Single-session wait (Enter prompt) | Avoids state serialization complexity; Quick Tunnel runs in background |
| domain.ts command | New file in commands/ | Follows existing Commander.js pattern (init.ts, add.ts, etc.) |
| Tunnel event logging | Append-only `tunnel.log`, no raw tokens | Aligns with Constitution III (Transparent Operations) + security |
