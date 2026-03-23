# E2E Test Framework Design
**Date**: 2026-03-23
**Scope**: Installation flow (Step 0-7) + 16-stack app lifecycle automation
**Status**: Approved (v2 — post spec-review)

---

## Problem

`test-cycle.sh` (1996줄) is monolithic, hardcoded to one scenario, and cannot easily test different configurations. Manual CLI installation is inefficient for regression testing.

## Goals

1. JSON-driven test scenarios — swap configurations without editing scripts
2. Modular step execution — run any single step independently
3. 16-stack app lifecycle — create/start/stop/deploy/delete per stack
4. Local-first with CI-ready flag (`--ci`)
5. Clear pass/fail report per step + summary JSON artifact

## Out of Scope

- Interactive wizard UI testing (TTY-dependent, handled separately by `wizard-smoke.sh`)
- Dashboard UI (Playwright tests, separate)

---

## Architecture

```
tests/e2e/
├── run.sh                      # Main entry point
├── scenarios/
│   ├── full-install.json       # Full: Traefik + PostgreSQL + AppServer + boilerplate
│   ├── partial-no-db.json      # Partial: Traefik + Gitea only (applyPartialInstallDefaults)
│   └── quick-smoke.json        # Fast: nodejs-express + go-gin + python-fastapi, skip slow lifecycle
├── steps/
│   ├── 00-system-check.sh      # OS, Docker, ports 80/443, disk/RAM assertions
│   ├── 01-project-setup.sh     # Write selections.json from scenario, verify dir structure
│   ├── 02-admin-components.sh  # Validate admin fields + component flags in selections.json
│   ├── 03-dev-stack.sh         # Validate stackId ∈ STACK_CATALOG, boilerplate config
│   ├── 04-domain-network.sh    # Validate domain.provider value in selections.json
│   ├── 05-review.sh            # Validate selections.json completeness (pre-generation lint)
│   ├── 06-generate-start.sh    # Generate Docker Compose, start services, health check
│   └── 07-complete.sh          # Endpoint verification, Gitea accessible, admin dashboard up
├── apps/
│   ├── lifecycle.sh            # Single stack: create→health→gitea→deploy→stop→start→delete
│   ├── stacks.sh               # Iterate scenario stacks[] sequentially
│   └── matrix.sh               # stacks × scenarios cross-run
└── lib/
    ├── assert.sh               # ok/fail/skip, PASS/FAIL counters, trap-based cleanup
    ├── api.sh                  # Admin API curl wrappers (X-Admin-Password header)
    ├── scenario.sh             # JSON field extraction via python3
    └── report.sh               # Color terminal + JSON report generation
```

---

## Key Design Decision: State Injection

`brewnet init` uses `@inquirer/prompts` select prompts requiring TTY. Piping stdin is fragile.

**Approach**:
1. `step 01` generates `~/.brewnet/projects/<name>/selections.json` from scenario JSON
2. `step 06` runs: `brewnet admin --foreground --no-open &` → waits for `:8088` → calls `POST /api/generate` (or equivalent admin API endpoint) to trigger Docker Compose generation and service startup
3. Steps 02–05 are **pre-generation validation** steps: they lint the selections.json against expected values. No admin server is running yet at these steps.
4. Steps 06–07 assume the admin server is running.

> Note: If `POST /api/generate` does not exist, `step 06` directly runs `brewnet init --config <path>` with a pre-created answers file as fallback. The exact trigger mechanism is resolved during implementation.

---

## Scenario JSON Schema (aligned to WizardState)

```json
{
  "name": "full-install",
  "description": "Full installation with all components",
  "admin": {
    "username": "admin",
    "password": "skagml12!@"
  },
  "project": {
    "name": "my-homeserver",
    "path": "~/brewnet/my-homeserver",
    "setupType": "full"
  },
  "components": {
    "webServer": "traefik",
    "database": "postgresql",
    "appServer": true,
    "fileServer": null,
    "mediaServer": null,
    "ssh": false
  },
  "devStack": { "language": "nodejs", "framework": "express" },
  "domain": { "provider": "quick-tunnel" },
  "apps": {
    "stacks": ["nodejs-express", "go-gin", "python-fastapi"],
    "lifecycle": ["create", "start", "stop", "deploy", "delete"]
  }
}
```

**Field notes**:
- `project.setupType`: `"full"` | `"partial"` (Zod enum; `"minimal"` is internal-only, not Zod-registered)
- `domain.provider`: `"quick-tunnel"` | `"tunnel"` | `"local"` (matches `DomainProvider` type; Named Tunnel = `"tunnel"`)
- `partial-no-db` scenario uses `setupType: "partial"` which maps to `applyPartialInstallDefaults()` → Traefik + Gitea included, DB/media excluded

---

## Failure Handling and Cleanup

### Step-level failure policy

| Step | On failure | Cleanup |
|------|-----------|---------|
| 00–05 | Log fail, continue remaining steps | None needed (no side effects) |
| 06 generate-start | Log fail, run `docker compose down` + delete `~/.brewnet/projects/<name>` | Full teardown |
| 07 complete | Log fail, continue | Admin server left running for debugging |
| apps/lifecycle | Log fail for that stack, continue next stack | `DELETE /api/apps/<app>` + Gitea repo delete |

### Global cleanup (trap on EXIT)
`lib/assert.sh` registers `trap cleanup_on_exit EXIT` that:
1. Kills background admin server process
2. Runs `docker compose down` if any containers remain from this run
3. Removes tmp state files

### Abort vs continue
- `--fail-fast` flag: abort on first step failure (default: continue)
- `--ci` mode implies `--fail-fast`

---

## CLI Interface

```bash
# Full run
./tests/e2e/run.sh --scenario full-install

# Install only / apps only
./tests/e2e/run.sh --scenario full-install --only install
./tests/e2e/run.sh --scenario full-install --only apps

# Override stacks from CLI
./tests/e2e/run.sh --scenario full-install --stacks nodejs-express,go-gin

# All 16 stacks (expected: ~35 min, CI timeout: 45 min)
./tests/e2e/run.sh --scenario full-install --stacks all

# Single step
./tests/e2e/run.sh --scenario full-install --step 06

# CI mode: no color, JSON report, --fail-fast
./tests/e2e/run.sh --scenario full-install --ci

# Keep environment after test (skip teardown)
./tests/e2e/run.sh --scenario full-install --no-teardown
```

---

## What Each Step Tests

| Step | Runs | Asserts |
|------|------|---------|
| 00 system-check | `uname`, `docker info`, `lsof`/`nc` port check | OS ∈ {darwin,linux}, Docker running, ports 80/443 free, disk ≥ 20GB, RAM ≥ 4GB |
| 01 project-setup | Write `selections.json` from scenario JSON | File exists, `project.name` matches, path expanded correctly |
| 02 admin-components | Read selections.json | `admin.password` non-empty, selected components present in `components.*` |
| 03 dev-stack | Read selections.json + check `STACK_CATALOG` | `devStack.language` valid, if `appServer=true` then stack config present |
| 04 domain-network | Read selections.json | `domain.provider` ∈ valid values, tunnel config fields present |
| 05 review | Read + validate full selections.json | No required fields missing, JSON valid, paths expanded |
| 06 generate-start | Start admin server, trigger generation, `docker ps` | All expected containers running, `GET /health` → 200 for each service |
| 07 complete | curl Traefik URLs, Gitea API, admin dashboard | Traefik `http://localhost` → 200, Gitea `http://localhost/git` → 200, admin `:8088` → 200 |
| apps lifecycle | Admin API: create→deploy→stop→start→delete | Per step: job completes, containers match expected state, Traefik routes respond |

---

## Stack Timeouts (apps lifecycle)

| Stack group | Timeout | Stacks |
|-------------|---------|--------|
| Standard | 120s | go-*, nodejs-*, python-* |
| JVM | 300s | java-springboot, java-spring, kotlin-ktor, kotlin-springboot |
| Rust | 600s | rust-actix-web, rust-axum |

`--stacks all` (16 stacks) estimated total: **~35 minutes**. Recommend CI `timeout-minutes: 45`.

`quick-smoke.json` uses: `["nodejs-express", "go-gin", "python-fastapi"]` — estimated: **~5 minutes**.

---

## Report Format

**Terminal**: Color per assertion (✓ green / ✗ red / ⚠ yellow), summary table at end.

**JSON artifact** (`tests/e2e/reports/<scenario>-<timestamp>.json`):
```json
{
  "scenario": "full-install",
  "timestamp": "2026-03-23T09:00:00Z",
  "duration_s": 1842,
  "steps": [
    { "id": "00", "name": "system-check",   "status": "pass", "duration_s": 3,   "assertions": 5, "failed": 0 },
    { "id": "01", "name": "project-setup",  "status": "pass", "duration_s": 1,   "assertions": 3, "failed": 0 },
    { "id": "02", "name": "admin-components","status": "pass", "duration_s": 1,   "assertions": 4, "failed": 0 },
    { "id": "03", "name": "dev-stack",       "status": "pass", "duration_s": 1,   "assertions": 2, "failed": 0 },
    { "id": "04", "name": "domain-network",  "status": "pass", "duration_s": 1,   "assertions": 2, "failed": 0 },
    { "id": "05", "name": "review",          "status": "pass", "duration_s": 1,   "assertions": 6, "failed": 0 },
    { "id": "06", "name": "generate-start",  "status": "pass", "duration_s": 142, "assertions": 8, "failed": 0 },
    { "id": "07", "name": "complete",        "status": "pass", "duration_s": 5,   "assertions": 5, "failed": 0 }
  ],
  "apps": [
    {
      "stack": "nodejs-express",
      "status": "pass",
      "duration_s": 65,
      "steps": {
        "create": "pass", "health": "pass", "gitea": "pass",
        "deploy": "pass", "stop": "pass", "start": "pass", "delete": "pass"
      }
    }
  ],
  "summary": { "total": 36, "pass": 35, "fail": 1, "skip": 0 }
}
```

---

## Swapping Test Configurations

```bash
# MySQL instead of PostgreSQL
cp tests/e2e/scenarios/full-install.json tests/e2e/scenarios/mysql-install.json
# Edit: "database": "mysql"
./tests/e2e/run.sh --scenario mysql-install

# Partial install (no DB, applyPartialInstallDefaults behavior)
./tests/e2e/run.sh --scenario partial-no-db

# All 16 stacks
./tests/e2e/run.sh --scenario full-install --stacks all

# Quick 3-stack smoke only
./tests/e2e/run.sh --scenario quick-smoke --only apps
```
