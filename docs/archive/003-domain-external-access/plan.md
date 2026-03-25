# Implementation Plan: Domain External Access

**Branch**: `003-domain-external-access` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-domain-external-access/spec.md`

## Summary

Extend Brewnet's existing Cloudflare Tunnel integration with full domain lifecycle management: CLI commands for connect/disconnect/list/status, Admin Server web UI with dedicated "Domains" section and Settings area, REST API endpoints for domain management, and persistent domain connection tracking in `selections.json`. Builds on the existing `cloudflare-client.ts`, `domain.ts`, and `admin-server.ts` modules.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+ (ESM)
**Primary Dependencies**: Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, zod
**Storage**: `~/.brewnet/projects/<name>/selections.json` (project state, adding `domainConnections[]`)
**Testing**: Jest 29.x (unit/integration), existing test patterns in `tests/unit/cli/` and `tests/integration/`
**Target Platform**: macOS (darwin), Linux (Ubuntu/Debian, CentOS/RHEL)
**Project Type**: CLI + embedded HTTP admin server (monorepo: packages/cli, packages/shared)
**Performance Goals**: Domain connect in <2 min, disconnect reflected in <5 min (DNS TTL)
**Constraints**: Cloudflare free plan limits, DNS propagation latency (up to 60s polling), localhost-only admin server
**Scale/Scope**: Single home server, <20 services, single Cloudflare tunnel per project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero Config | ✅ PASS | Domain connect works with single command; Admin UI provides guided flow with defaults |
| II. Secure by Default | ✅ PASS | API tokens stored with chmod 600; Admin domain/settings APIs protected by admin password; tokens never logged |
| III. Transparent Operations | ✅ PASS | All domain operations logged to tunnel audit log; real-time progress in CLI and Admin UI; generated configs inspectable |
| IV. Reversible Actions | ✅ PASS | Disconnect reverses connect (removes ingress + DNS); atomic rollback on partial failure |
| V. Offline First | ✅ PASS | Domain commands require internet (Cloudflare API) but degrade gracefully with clear errors; core CLI unaffected |
| Phase Discipline | ✅ PASS | Phase 2 scope (Networking, domain, SSL) — this feature is within Phase 2 |
| Architecture Rules | ✅ PASS | Monorepo structure maintained; shared types in packages/shared; CLI independent of dashboard |
| Guardrails | ✅ PASS | No destructive operations; credential storage follows security rules |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-domain-external-access/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (REST API contracts)
│   └── admin-api.md     # Domain management API contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   └── wizard-state.ts          # ADD: DomainConnection interface, domainConnections[] to WizardState
└── schemas/
    └── wizard-state.schema.ts   # UPDATE: Add domainConnections Zod schema

packages/cli/src/
├── commands/
│   └── domain.ts                # EXTEND: Add disconnect, list, status subcommands
├── services/
│   ├── cloudflare-client.ts     # EXTEND: Add deleteDnsRecord(), getDnsRecords() functions
│   ├── admin-server.ts          # EXTEND: Add Domains section HTML, Settings area, domain REST API endpoints, admin auth middleware
│   └── domain-manager.ts        # NEW: Domain connection lifecycle logic (connect/disconnect/list/status) shared between CLI and Admin API
└── utils/
    └── tunnel-logger.ts         # EXISTING: Already supports DOMAIN_CONNECT events

tests/
├── unit/cli/
│   ├── services/
│   │   ├── domain-manager.test.ts       # NEW: Domain lifecycle unit tests
│   │   └── cloudflare-client.test.ts    # EXTEND: deleteDnsRecord, getDnsRecords tests
│   └── commands/
│       └── domain-connect.test.ts       # EXTEND: disconnect, list, status tests
└── integration/
    ├── domain-config.test.ts            # EXTEND: Full lifecycle integration tests
    └── admin-domain-api.test.ts         # NEW: Admin REST API integration tests
```

**Structure Decision**: Extend existing monorepo structure. New `domain-manager.ts` service extracts shared domain lifecycle logic from `domain.ts` command to enable reuse by both CLI commands and Admin Server API endpoints. All other changes are extensions of existing files.

## Complexity Tracking

No violations to justify. All changes follow existing patterns.
