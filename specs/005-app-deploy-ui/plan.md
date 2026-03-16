# Implementation Plan: App Deploy UI

**Branch**: `005-app-deploy-ui` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-app-deploy-ui/spec.md`

## Summary

Replace the current `apps-page.ts` GitHub-dark-theme HTML generator with the UI design from `brewnet-app-deploy.html`. Connect all 42 JS functions to the real backend APIs already implemented in `admin-server.ts` and `app-manager.ts`. Fix known bugs (delete button always disabled, `connectRepoToApp` no-op), and add port-conflict UI feedback. No new backend routes are needed — all required endpoints already exist.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 20+
**Primary Dependencies**: `packages/cli` — no new dependencies. Inline HTML/CSS/JS generation via template literal in `apps-page.ts`
**Storage**: `~/.brewnet/apps.json` (AppEntry[] registry), in-memory AppJob Map
**Testing**: Jest 29.x — unit tests for `apps-page.ts` HTML generation, integration tests via test-cycle.sh
**Target Platform**: Browser (served by admin HTTP server at `http://localhost:<adminPort>/apps`)
**Project Type**: Web UI page embedded in CLI admin server
**Performance Goals**: Page load < 1s, job status poll interval 700ms, stats bar refresh on each page load
**Constraints**: No external JS/CSS libraries — all inline (no CDN dependencies for offline support). Fonts from Google Fonts only (graceful degradation if offline).
**Scale/Scope**: Single-user home server, max ~50 registered apps

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Zero Config** | ✅ PASS | Page loads with no configuration. Stats and app list auto-populate from existing `apps.json`. |
| **II. Secure by Default** | ✅ PASS | No credentials exposed in page HTML. Domain modal token fields use `type="password"`. Delete requires name confirmation. |
| **III. Transparent Operations** | ✅ PASS | Build/Deploy progress modal shows all steps with real-time log output. Every action visible in UI. |
| **IV. Reversible Actions** | ✅ PASS | App deletion requires name confirmation. Running/building apps cannot be deleted. |
| **V. Offline First** | ✅ PASS | All HTML/CSS/JS inline — no CDN JS. Google Fonts degrade gracefully offline. Core page renders offline. |

**Post-design re-check**: ✅ No violations introduced in Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/005-app-deploy-ui/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── admin-api.md     ← Phase 1 output
├── checklists/
│   └── requirements.md  ← Quality checklist
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/cli/src/services/
├── apps-page.ts          ← PRIMARY CHANGE: full rewrite of generateAppsPageHtml()
├── app-manager.ts        ← MINOR CHANGE: add isPortAvailable() helper
└── admin-server.ts       ← NO CHANGE: all required routes already exist

public/demo/
└── brewnet-app-deploy.html  ← READ-ONLY reference (UI design source)

tests/unit/cli/services/
└── apps-page.test.ts     ← NEW: unit tests for HTML generation
```

**Structure Decision**: Single package (packages/cli). The UI is generated server-side as a single HTML string — no separate frontend build step. This follows the existing pattern used by all other admin pages.

## Complexity Tracking

> No Constitution violations — table not required.
