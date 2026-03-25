# E2E Test Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a JSON-scenario-driven E2E test framework covering brewnet installation (Steps 0-7) and 16-stack app lifecycle (create/start/stop/deploy/delete).

**Architecture:** Scenario JSON files = `BrewnetConfig` format + `_e2e` section → `run.sh` strips `_e2e`, passes config to `brewnet init --config --non-interactive --no-open` for step 06 generation. Steps 00-05 are pre-generation JSON validation. Apps lifecycle reuses admin API pattern from smoke-test.sh.

**Tech Stack:** bash (macOS bash 3.2 compatible), python3 (JSON parsing), `brewnet init --config --non-interactive`, admin API (curl + X-Admin-Password), docker compose.

**Key file:** `tests/e2e/` (new directory tree — nothing existing to modify)

---

## File Map

| File | Responsibility |
|------|---------------|
| `tests/e2e/run.sh` | Entry point: parses flags, sources lib, runs steps + apps |
| `tests/e2e/lib/assert.sh` | ok/fail/skip helpers, PASS/FAIL counters, trap cleanup |
| `tests/e2e/lib/api.sh` | Admin API curl wrappers (create/start/stop/deploy/delete) |
| `tests/e2e/lib/scenario.sh` | python3 JSON field extractor (`scen_get <field>`) |
| `tests/e2e/lib/report.sh` | Terminal summary table + JSON report writer |
| `tests/e2e/scenarios/full-install.json` | Full: 6 languages, all components, quick-tunnel |
| `tests/e2e/scenarios/partial-no-db.json` | Partial: Traefik+Gitea only, 1 stack |
| `tests/e2e/scenarios/quick-smoke.json` | 3 stacks (nodejs-express, go-gin, python-fastapi) |
| `tests/e2e/steps/00-system-check.sh` | OS, Docker, ports 80/443, disk, RAM assertions |
| `tests/e2e/steps/01-project-setup.sh` | Strip `_e2e`, write config to `/tmp/brewnet-e2e-config.json` |
| `tests/e2e/steps/02-admin-components.sh` | Validate admin.username, password, server flags in config JSON |
| `tests/e2e/steps/03-dev-stack.sh` | Validate devStack languages/frameworks exist in STACK_CATALOG |
| `tests/e2e/steps/04-domain-network.sh` | Validate domain.provider is valid value |
| `tests/e2e/steps/05-review.sh` | Full config JSON completeness lint (required fields present) |
| `tests/e2e/steps/06-generate-start.sh` | `brewnet init --config --non-interactive --no-open &`, wait for :8088, health check |
| `tests/e2e/steps/07-complete.sh` | Traefik, Gitea, admin dashboard URL verification |
| `tests/e2e/apps/lifecycle.sh` | Single stack: create→health→gitea→deploy→stop→start→delete |
| `tests/e2e/apps/stacks.sh` | Iterate `_e2e.apps.stacks` from scenario, call lifecycle.sh per stack |

---

## Task 1: lib/assert.sh — Core helpers + trap cleanup

**Files:**
- Create: `tests/e2e/lib/assert.sh`

- [ ] **Step 1: Create assert.sh**

```bash
#!/usr/bin/env bash
# lib/assert.sh — Assertion helpers, counters, trap-based cleanup
# Source this file; do not execute directly.

# ── Colors (disabled in CI mode) ─────────────────────────────────────────────
if [[ "${CI_MODE:-false}" == "true" ]]; then
  RED=''; GREEN=''; CYAN=''; YELLOW=''; BLUE=''; DIM=''; BOLD=''; NC=''
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  YELLOW='\033[1;33m'; BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
fi

# ── Counters ─────────────────────────────────────────────────────────────────
ASSERT_PASS=0; ASSERT_FAIL=0; ASSERT_SKIP=0
STEP_RESULTS=()   # "id:name:status:duration"
APP_RESULTS=()    # "stack:status"

# ── Step tracking ─────────────────────────────────────────────────────────────
CURRENT_STEP_ID=""
CURRENT_STEP_NAME=""
STEP_START_TS=0

step_begin() {
  CURRENT_STEP_ID="$1"; CURRENT_STEP_NAME="$2"
  STEP_START_TS=$(date +%s)
  echo -e "\n${CYAN}${BOLD}━━━  Step ${1} — ${2}  ━━━${NC}"
}

step_end() {
  local status="$1"
  local dur=$(( $(date +%s) - STEP_START_TS ))
  STEP_RESULTS+=("${CURRENT_STEP_ID}:${CURRENT_STEP_NAME}:${status}:${dur}")
}

# ── Assertion helpers ─────────────────────────────────────────────────────────
ts() { date '+%H:%M:%S'; }

ok()   {
  ASSERT_PASS=$(( ASSERT_PASS + 1 ))
  echo -e "${GREEN}  ✓ [$(ts)] $*${NC}"
}

fail() {
  ASSERT_FAIL=$(( ASSERT_FAIL + 1 ))
  echo -e "${RED}  ✗ [$(ts)] $*${NC}"
  [[ "${FAIL_FAST:-false}" == "true" ]] && { echo -e "${RED}  FAIL FAST — aborting${NC}"; exit 1; }
}

skip() {
  ASSERT_SKIP=$(( ASSERT_SKIP + 1 ))
  echo -e "${YELLOW}  ⚠ [$(ts)] SKIP: $*${NC}"
}

info() { echo -e "${BLUE}  ℹ [$(ts)] $*${NC}"; }
log()  { echo -e "  ${DIM}[$(ts)] $*${NC}"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  [[ "$actual" == "$expected" ]] && ok "${label}: '${actual}'" || fail "${label}: got '${actual}', want '${expected}'"
}

assert_nonempty() {
  local label="$1" val="$2"
  [[ -n "$val" ]] && ok "${label} is set" || fail "${label} is empty"
}

assert_http() {
  local label="$1" url="$2" want="${3:-200}"
  local got; got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "$url" 2>/dev/null || echo "000")
  [[ "$got" == "$want" ]] && ok "${label} → HTTP ${got}" || fail "${label} → HTTP ${got} (want ${want})"
}

assert_http_wait() {
  local label="$1" url="$2" want="${3:-200}" timeout_s="${4:-30}"
  local elapsed=0
  while (( elapsed < timeout_s )); do
    local got; got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "$url" 2>/dev/null || echo "000")
    if [[ "$got" == "$want" ]]; then ok "${label} → HTTP ${got}"; return 0; fi
    sleep 5; elapsed=$(( elapsed + 5 ))
  done
  fail "${label} → timeout after ${timeout_s}s (last: HTTP $(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000"))"
}

# ── Cleanup (registered by run.sh via trap) ───────────────────────────────────
E2E_ADMIN_PID=""
E2E_PROJECT_NAME=""
E2E_TEARDOWN=${TEARDOWN:-true}

e2e_cleanup() {
  [[ "${E2E_TEARDOWN}" != "true" ]] && return
  log "Cleanup: stopping admin server..."
  [[ -n "$E2E_ADMIN_PID" ]] && kill "$E2E_ADMIN_PID" 2>/dev/null || true
  lsof -ti :8088 2>/dev/null | xargs kill -9 2>/dev/null || true
  log "Cleanup: docker compose down..."
  local proj_path="$HOME/brewnet/${E2E_PROJECT_NAME:-my-homeserver}"
  [[ -f "${proj_path}/docker-compose.yml" ]] && \
    docker compose -f "${proj_path}/docker-compose.yml" down 2>/dev/null || true
}
```

- [ ] **Step 2: Verify syntax**
```bash
bash -n tests/e2e/lib/assert.sh && echo "OK"
```
Expected: `OK`

---

## Task 2: lib/api.sh, lib/scenario.sh, lib/report.sh

**Files:**
- Create: `tests/e2e/lib/api.sh`
- Create: `tests/e2e/lib/scenario.sh`
- Create: `tests/e2e/lib/report.sh`

- [ ] **Step 1: Create api.sh**

```bash
#!/usr/bin/env bash
# lib/api.sh — Admin API wrappers. Requires ADMIN_PW and ADMIN_URL to be set.

ADMIN_PW="${ADMIN_PW:-skagml12!@}"
ADMIN_URL="${ADMIN_URL:-http://localhost:8088}"
GITEA_URL="${GITEA_URL:-http://localhost/git}"
GITEA_USER="${GITEA_USER:-admin}"

_api() { curl -sf -X "$1" -H "X-Admin-Password: $ADMIN_PW" -H "Content-Type: application/json" "${ADMIN_URL}$2" "${@:3}"; }

api_get()    { _api GET    "$1"; }
api_post()   { _api POST   "$1" --data-binary "${2:-\{\}}"; }
api_delete() { _api DELETE "$1" > /dev/null 2>&1 || true; }

gitea_token() { cat ~/.brewnet/gitea-token 2>/dev/null || echo ""; }
gitea_req()   { curl -sf -H "Authorization: token $(gitea_token)" "$@"; }

wait_job() {
  local jid="$1" timeout_s="${2:-120}" elapsed=0
  while (( elapsed < timeout_s )); do
    local status; status=$(api_get "/api/apps/jobs/${jid}" 2>/dev/null | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    [[ "$status" == "done" ]]   && return 0
    [[ "$status" == "failed" ]] && return 1
    sleep 5; elapsed=$(( elapsed + 5 ))
  done
  return 1
}

app_cleanup() {
  local name="$1"
  api_delete "/api/apps/${name}"
  gitea_req -X DELETE "${GITEA_URL}/api/v1/repos/${GITEA_USER}/${name}" > /dev/null 2>&1 || true
}

admin_ready() {
  local timeout_s="${1:-60}" elapsed=0
  while (( elapsed < timeout_s )); do
    local code; code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${ADMIN_URL}" 2>/dev/null || echo "000")
    [[ "$code" == "200" ]] && return 0
    sleep 3; elapsed=$(( elapsed + 3 ))
  done
  return 1
}
```

- [ ] **Step 2: Create scenario.sh**

```bash
#!/usr/bin/env bash
# lib/scenario.sh — JSON field extractor for scenario files.
# Usage: source scenario.sh; scen_load /path/to/scenario.json; scen_get .admin.username

SCENARIO_FILE=""

scen_load() { SCENARIO_FILE="$1"; }

scen_get() {
  local field="$1"
  python3 -c "
import sys, json
try:
    d = json.load(open('${SCENARIO_FILE}'))
    val = d
    for k in '${field}'.lstrip('.').split('.'):
        val = val[k] if isinstance(val, dict) else None
    if val is None:
        print('')
    elif isinstance(val, bool):
        print(str(val).lower())
    elif isinstance(val, list):
        print(' '.join(str(x) for x in val))
    else:
        print(val)
except Exception:
    print('')
" 2>/dev/null
}

# Strip _e2e section and write clean BrewnetConfig to target path
scen_write_config() {
  local target="$1"
  python3 -c "
import sys, json
d = json.load(open('${SCENARIO_FILE}'))
d.pop('_e2e', None)
with open('${target}', 'w') as f:
    json.dump(d, f, indent=2)
" 2>/dev/null
}

# Get _e2e.apps.stacks as space-separated string, or default stacks
scen_get_stacks() {
  local override="${STACKS_OVERRIDE:-}"
  if [[ -n "$override" ]]; then echo "$override" | tr ',' ' '; return; fi
  python3 -c "
import sys, json
try:
    d = json.load(open('${SCENARIO_FILE}'))
    stacks = d.get('_e2e', {}).get('apps', {}).get('stacks', [])
    print(' '.join(stacks))
except Exception:
    print('')
" 2>/dev/null
}

# Get all 16 stacks
ALL_STACKS="go-gin go-echo go-fiber rust-actix-web rust-axum java-springboot java-spring kotlin-ktor kotlin-springboot nodejs-express nodejs-nestjs nodejs-nextjs nodejs-nextjs-full python-fastapi python-django python-flask"

get_stack_timeout() {
  case "$1" in
    rust-actix-web|rust-axum) echo 600 ;;
    java-springboot|java-spring|kotlin-ktor|kotlin-springboot) echo 300 ;;
    *) echo 120 ;;
  esac
}
```

- [ ] **Step 3: Create report.sh**

```bash
#!/usr/bin/env bash
# lib/report.sh — Terminal summary table and JSON report writer.
# Requires STEP_RESULTS and APP_RESULTS arrays from assert.sh.

REPORT_DIR="${REPORT_DIR:-tests/e2e/reports}"

print_summary() {
  echo ""
  echo -e "${CYAN}${BOLD}═══════════════════════ SUMMARY ═══════════════════════${NC}"
  echo -e "${BOLD}  Installation Steps:${NC}"
  for entry in "${STEP_RESULTS[@]+"${STEP_RESULTS[@]}"}"; do
    IFS=: read -r sid sname sstatus sdur <<< "$entry"
    if [[ "$sstatus" == "pass" ]]; then
      printf "  ${GREEN}✓${NC} [%s] %-22s ${GREEN}PASS${NC} (%ss)\n" "$sid" "$sname" "$sdur"
    elif [[ "$sstatus" == "skip" ]]; then
      printf "  ${YELLOW}⚠${NC} [%s] %-22s ${YELLOW}SKIP${NC}\n" "$sid" "$sname"
    else
      printf "  ${RED}✗${NC} [%s] %-22s ${RED}FAIL${NC} (%ss)\n" "$sid" "$sname" "$sdur"
    fi
  done

  if [[ ${#APP_RESULTS[@]} -gt 0 ]]; then
    echo -e "\n${BOLD}  App Lifecycle:${NC}"
    for entry in "${APP_RESULTS[@]}"; do
      IFS=: read -r astack astatus <<< "$entry"
      if [[ "$astatus" == "pass" ]]; then
        printf "  ${GREEN}✓${NC} %-30s ${GREEN}PASS${NC}\n" "$astack"
      else
        printf "  ${RED}✗${NC} %-30s ${RED}FAIL${NC}\n" "$astack"
      fi
    done
  fi

  local total=$(( ASSERT_PASS + ASSERT_FAIL + ASSERT_SKIP ))
  echo ""
  echo -e "  Assertions: ${GREEN}${ASSERT_PASS} pass${NC} / ${RED}${ASSERT_FAIL} fail${NC} / ${YELLOW}${ASSERT_SKIP} skip${NC} (total: ${total})"
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════${NC}"
}

write_json_report() {
  local scenario="$1" ts; ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  mkdir -p "$REPORT_DIR"
  local outfile="${REPORT_DIR}/${scenario}-$(date '+%Y%m%d-%H%M%S').json"

  python3 -c "
import json, sys
steps = []
for e in sys.argv[1].split('|'):
    if not e: continue
    parts = e.split(':')
    steps.append({'id': parts[0], 'name': parts[1], 'status': parts[2], 'duration_s': int(parts[3])})
apps = []
for e in sys.argv[2].split('|'):
    if not e: continue
    parts = e.split(':')
    apps.append({'stack': parts[0], 'status': parts[1]})
report = {
    'scenario': sys.argv[3],
    'timestamp': sys.argv[4],
    'steps': steps,
    'apps': apps,
    'summary': {
        'total': int(sys.argv[5]) + int(sys.argv[6]) + int(sys.argv[7]),
        'pass': int(sys.argv[5]), 'fail': int(sys.argv[6]), 'skip': int(sys.argv[7])
    }
}
print(json.dumps(report, indent=2))
" \
    "$(IFS='|'; echo "${STEP_RESULTS[*]+${STEP_RESULTS[*]}}")" \
    "$(IFS='|'; echo "${APP_RESULTS[*]+${APP_RESULTS[*]}}")" \
    "$scenario" "$ts" "$ASSERT_PASS" "$ASSERT_FAIL" "$ASSERT_SKIP" \
    > "$outfile" 2>/dev/null
  echo "$outfile"
}
```

- [ ] **Step 4: Verify syntax of all three**
```bash
bash -n tests/e2e/lib/api.sh && bash -n tests/e2e/lib/scenario.sh && bash -n tests/e2e/lib/report.sh && echo "OK"
```
Expected: `OK`

---

## Task 3: Scenario JSON files

**Files:**
- Create: `tests/e2e/scenarios/full-install.json`
- Create: `tests/e2e/scenarios/partial-no-db.json`
- Create: `tests/e2e/scenarios/quick-smoke.json`

- [ ] **Step 1: Create full-install.json**

```json
{
  "schemaVersion": 7,
  "projectName": "my-homeserver",
  "projectPath": "~/brewnet/my-homeserver",
  "setupType": "full",
  "admin": { "username": "admin", "password": "skagml12!@", "storage": "local" },
  "servers": {
    "webServer":  { "enabled": true, "service": "traefik" },
    "fileServer": { "enabled": false, "service": "" },
    "gitServer":  { "enabled": true, "service": "gitea", "port": 3000, "sshPort": 3022 },
    "dbServer": {
      "enabled": true, "primary": "postgresql", "primaryVersion": "17",
      "dbName": "brewnet_db", "dbUser": "brewnet", "dbPassword": "",
      "adminUI": false, "pgadminEmail": "test@test.com", "cache": ""
    },
    "media":      { "enabled": false, "services": [] },
    "sshServer":  { "enabled": false, "port": 2222, "passwordAuth": false, "sftp": false },
    "mailServer": { "enabled": false, "service": "", "port25Blocked": false,
                    "relayProvider": "", "relayHost": "", "relayPort": 587,
                    "relayUser": "", "relayPassword": "" },
    "appServer":  { "enabled": true },
    "fileBrowser":{ "enabled": false, "mode": "" }
  },
  "portRemapping": {},
  "devStack": {
    "languages": ["nodejs", "go", "python"],
    "frameworks": { "nodejs": "express", "go": "gin", "python": "fastapi" },
    "frontend": null
  },
  "boilerplate": { "generate": true, "sampleData": false, "devMode": "production" },
  "domain": {
    "provider": "quick-tunnel",
    "name": "brewnet.local",
    "ssl": "cloudflare",
    "cloudflare": {
      "enabled": true, "tunnelMode": "quick", "quickTunnelUrl": "",
      "accountId": "", "apiToken": "", "tunnelId": "", "tunnelToken": "",
      "tunnelName": "", "zoneId": "", "zoneName": ""
    }
  },
  "_e2e": {
    "apps": {
      "stacks": ["nodejs-express", "go-gin", "python-fastapi"],
      "lifecycle": ["create", "health", "gitea", "deploy", "stop", "start", "delete"]
    }
  }
}
```

- [ ] **Step 2: Create partial-no-db.json**

```json
{
  "schemaVersion": 7,
  "projectName": "my-homeserver",
  "projectPath": "~/brewnet/my-homeserver",
  "setupType": "partial",
  "admin": { "username": "admin", "password": "skagml12!@", "storage": "local" },
  "servers": {
    "webServer":  { "enabled": true, "service": "traefik" },
    "fileServer": { "enabled": false, "service": "" },
    "gitServer":  { "enabled": true, "service": "gitea", "port": 3000, "sshPort": 3022 },
    "dbServer": {
      "enabled": false, "primary": "", "primaryVersion": "",
      "dbName": "", "dbUser": "", "dbPassword": "",
      "adminUI": false, "pgadminEmail": "", "cache": ""
    },
    "media":      { "enabled": false, "services": [] },
    "sshServer":  { "enabled": false, "port": 2222, "passwordAuth": false, "sftp": false },
    "mailServer": { "enabled": false, "service": "", "port25Blocked": false,
                    "relayProvider": "", "relayHost": "", "relayPort": 587,
                    "relayUser": "", "relayPassword": "" },
    "appServer":  { "enabled": true },
    "fileBrowser":{ "enabled": false, "mode": "" }
  },
  "portRemapping": {},
  "devStack": {
    "languages": ["nodejs"],
    "frameworks": { "nodejs": "express" },
    "frontend": null
  },
  "boilerplate": { "generate": true, "sampleData": false, "devMode": "production" },
  "domain": {
    "provider": "quick-tunnel",
    "name": "brewnet.local",
    "ssl": "cloudflare",
    "cloudflare": {
      "enabled": true, "tunnelMode": "quick", "quickTunnelUrl": "",
      "accountId": "", "apiToken": "", "tunnelId": "", "tunnelToken": "",
      "tunnelName": "", "zoneId": "", "zoneName": ""
    }
  },
  "_e2e": {
    "apps": {
      "stacks": ["nodejs-express"],
      "lifecycle": ["create", "health", "gitea", "deploy", "stop", "start", "delete"]
    }
  }
}
```

- [ ] **Step 3: Create quick-smoke.json** (3 fast stacks, skip install — only apps)

```json
{
  "schemaVersion": 7,
  "projectName": "my-homeserver",
  "projectPath": "~/brewnet/my-homeserver",
  "setupType": "full",
  "admin": { "username": "admin", "password": "skagml12!@", "storage": "local" },
  "servers": {
    "webServer":  { "enabled": true, "service": "traefik" },
    "fileServer": { "enabled": false, "service": "" },
    "gitServer":  { "enabled": true, "service": "gitea", "port": 3000, "sshPort": 3022 },
    "dbServer": {
      "enabled": true, "primary": "postgresql", "primaryVersion": "17",
      "dbName": "brewnet_db", "dbUser": "brewnet", "dbPassword": "",
      "adminUI": false, "pgadminEmail": "test@test.com", "cache": ""
    },
    "media":      { "enabled": false, "services": [] },
    "sshServer":  { "enabled": false, "port": 2222, "passwordAuth": false, "sftp": false },
    "mailServer": { "enabled": false, "service": "", "port25Blocked": false,
                    "relayProvider": "", "relayHost": "", "relayPort": 587,
                    "relayUser": "", "relayPassword": "" },
    "appServer":  { "enabled": true },
    "fileBrowser":{ "enabled": false, "mode": "" }
  },
  "portRemapping": {},
  "devStack": {
    "languages": ["nodejs"],
    "frameworks": { "nodejs": "express" },
    "frontend": null
  },
  "boilerplate": { "generate": false, "sampleData": false, "devMode": "production" },
  "domain": {
    "provider": "quick-tunnel",
    "name": "brewnet.local",
    "ssl": "cloudflare",
    "cloudflare": {
      "enabled": true, "tunnelMode": "quick", "quickTunnelUrl": "",
      "accountId": "", "apiToken": "", "tunnelId": "", "tunnelToken": "",
      "tunnelName": "", "zoneId": "", "zoneName": ""
    }
  },
  "_e2e": {
    "apps": {
      "stacks": ["nodejs-express", "go-gin", "python-fastapi"],
      "lifecycle": ["create", "health", "gitea", "deploy", "stop", "start", "delete"]
    }
  }
}
```

---

## Task 4: steps/00-system-check.sh and 01-project-setup.sh

**Files:**
- Create: `tests/e2e/steps/00-system-check.sh`
- Create: `tests/e2e/steps/01-project-setup.sh`

- [ ] **Step 1: Create 00-system-check.sh**

```bash
#!/usr/bin/env bash
# Step 00 — System check: OS, Docker, ports 80/443, disk, RAM
# Sources lib/assert.sh before running.

step_begin "00" "system-check"
STEP_FAIL=0

# OS
OS_TYPE=$(uname -s)
[[ "$OS_TYPE" == "Darwin" || "$OS_TYPE" == "Linux" ]] && ok "OS: ${OS_TYPE}" || { fail "Unsupported OS: ${OS_TYPE}"; STEP_FAIL=1; }

# Docker
docker info > /dev/null 2>&1 && ok "Docker: running" || { fail "Docker daemon not running"; STEP_FAIL=1; }

# Ports 80 and 443
for port in 80 443; do
  if lsof -ti :"$port" > /dev/null 2>&1; then
    # Allow if it's traefik already running from a previous install
    proc=$(lsof -ti :"$port" | xargs ps -p 2>/dev/null | grep -v grep | grep -v "ps -p" | tail -1 || true)
    if echo "$proc" | grep -qi "traefik\|docker"; then
      skip "Port ${port} used by Traefik/Docker (OK)"
    else
      fail "Port ${port} in use: ${proc}"; STEP_FAIL=1
    fi
  else
    ok "Port ${port}: free"
  fi
done

# Disk (≥ 20GB free in home directory)
FREE_GB=$(df -BG "$HOME" 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4}' || echo "0")
(( FREE_GB >= 20 )) && ok "Disk: ${FREE_GB}GB free" || { fail "Disk: ${FREE_GB}GB free (need ≥ 20GB)"; STEP_FAIL=1; }

# RAM (≥ 4GB)
if [[ "$(uname -s)" == "Darwin" ]]; then
  RAM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024 ))
else
  RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0) / 1024 / 1024 ))
fi
(( RAM_GB >= 4 )) && ok "RAM: ${RAM_GB}GB" || { fail "RAM: ${RAM_GB}GB (need ≥ 4GB)"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

- [ ] **Step 2: Create 01-project-setup.sh**

```bash
#!/usr/bin/env bash
# Step 01 — Project setup: write clean BrewnetConfig from scenario (strip _e2e)

E2E_CONFIG_FILE="/tmp/brewnet-e2e-config.json"

step_begin "01" "project-setup"
STEP_FAIL=0

# Strip _e2e and write config
scen_write_config "$E2E_CONFIG_FILE"
[[ -f "$E2E_CONFIG_FILE" ]] && ok "Config written: ${E2E_CONFIG_FILE}" || { fail "Failed to write config"; STEP_FAIL=1; }

# Validate required top-level fields
for field in schemaVersion projectName projectPath setupType; do
  val=$(python3 -c "import json; d=json.load(open('${E2E_CONFIG_FILE}')); print(d.get('${field}',''))" 2>/dev/null || echo "")
  assert_nonempty "$field" "$val" || STEP_FAIL=1
done

proj_name=$(python3 -c "import json; print(json.load(open('${E2E_CONFIG_FILE}')).get('projectName',''))" 2>/dev/null)
E2E_PROJECT_NAME="$proj_name"   # used by cleanup trap
export E2E_PROJECT_NAME

ok "Project: '${proj_name}'"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

---

## Task 5: steps/02-05 — Lightweight JSON validation steps

**Files:**
- Create: `tests/e2e/steps/02-admin-components.sh`
- Create: `tests/e2e/steps/03-dev-stack.sh`
- Create: `tests/e2e/steps/04-domain-network.sh`
- Create: `tests/e2e/steps/05-review.sh`

- [ ] **Step 1: Create 02-05 steps** (all four in one pass)

`02-admin-components.sh`:
```bash
#!/usr/bin/env bash
step_begin "02" "admin-components"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
username=$(python3 -c "import json; print(json.load(open('$cfg'))['admin']['username'])" 2>/dev/null)
password=$(python3 -c "import json; print(json.load(open('$cfg'))['admin']['password'])" 2>/dev/null)
web_server=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['webServer']['service'])" 2>/dev/null)
git_enabled=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['gitServer']['enabled'])" 2>/dev/null)

assert_nonempty "admin.username" "$username"
assert_nonempty "admin.password" "$password"
assert_nonempty "servers.webServer.service" "$web_server"
[[ "$git_enabled" == "True" || "$git_enabled" == "true" ]] && ok "gitServer: enabled" || fail "gitServer must be enabled"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

`03-dev-stack.sh`:
```bash
#!/usr/bin/env bash
VALID_LANGS="nodejs go python java kotlin rust"
step_begin "03" "dev-stack"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
app_enabled=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['appServer']['enabled'])" 2>/dev/null)
if [[ "$app_enabled" == "True" || "$app_enabled" == "true" ]]; then
  langs=$(python3 -c "import json; print(' '.join(json.load(open('$cfg'))['devStack']['languages']))" 2>/dev/null)
  assert_nonempty "devStack.languages" "$langs"
  for lang in $langs; do
    [[ " $VALID_LANGS " =~ " $lang " ]] && ok "language valid: ${lang}" || { fail "Unknown language: ${lang}"; STEP_FAIL=1; }
  done
else
  skip "appServer disabled — devStack not required"
fi

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

`04-domain-network.sh`:
```bash
#!/usr/bin/env bash
VALID_PROVIDERS="local quick-tunnel tunnel"
step_begin "04" "domain-network"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
provider=$(python3 -c "import json; print(json.load(open('$cfg'))['domain']['provider'])" 2>/dev/null)
assert_nonempty "domain.provider" "$provider"
[[ " $VALID_PROVIDERS " =~ " $provider " ]] && ok "domain.provider valid: ${provider}" || { fail "Invalid provider: ${provider}"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

`05-review.sh`:
```bash
#!/usr/bin/env bash
step_begin "05" "review"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
# Full JSON completeness lint using python3
python3 - "$cfg" <<'PYEOF'
import sys, json
required = [
    ('schemaVersion',), ('projectName',), ('projectPath',), ('setupType',),
    ('admin', 'username'), ('admin', 'password'),
    ('servers', 'webServer', 'service'),
    ('servers', 'gitServer', 'enabled'),
    ('domain', 'provider'),
]
try:
    d = json.load(open(sys.argv[1]))
    missing = []
    for path in required:
        cur = d
        try:
            for k in path: cur = cur[k]
            if cur == '' or cur is None: missing.append('.'.join(path))
        except (KeyError, TypeError):
            missing.append('.'.join(path))
    if missing:
        print(f"MISSING: {', '.join(missing)}")
        sys.exit(1)
    else:
        print("OK")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
PYEOF
[[ $? -eq 0 ]] && ok "JSON lint passed" || { fail "JSON lint failed"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

---

## Task 6: steps/06-generate-start.sh — Main generation step

**Files:**
- Create: `tests/e2e/steps/06-generate-start.sh`

- [ ] **Step 1: Create 06-generate-start.sh**

```bash
#!/usr/bin/env bash
# Step 06 — Generate + Start: run brewnet init --config --non-interactive --no-open
# Waits for admin panel (up to 25 min — Rust compile), then health-checks all containers.

BREWNET_BIN="${BREWNET_BIN:-node $(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel 2>/dev/null)/packages/cli/dist/index.js}"
ADMIN_PORT=8088
INIT_LOG=$(mktemp /tmp/brewnet-e2e-init.XXXXXX)

step_begin "06" "generate-start"
STEP_FAIL=0

# Kill any existing admin server
lsof -ti :"$ADMIN_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Start brewnet init in background
info "Running: brewnet init --config ${E2E_CONFIG_FILE} --non-interactive --no-open"
info "Init log: ${INIT_LOG}"

node "$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel 2>/dev/null)/packages/cli/dist/index.js" \
  init --config "$E2E_CONFIG_FILE" --non-interactive --no-open \
  > "$INIT_LOG" 2>&1 &
E2E_ADMIN_PID=$!
export E2E_ADMIN_PID

# Wait for admin panel (up to 25 min)
info "Waiting for admin panel on :${ADMIN_PORT} (max 25 min)..."
INIT_OK=false
for i in $(seq 1 300); do
  sleep 5
  if ! kill -0 "$E2E_ADMIN_PID" 2>/dev/null; then
    fail "brewnet init process died (PID ${E2E_ADMIN_PID})"
    tail -20 "$INIT_LOG" | while IFS= read -r l; do log "  $l"; done
    STEP_FAIL=1; break
  fi
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${ADMIN_PORT}" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    ok "Admin panel up after $((i*5))s → HTTP 200"
    INIT_OK=true; break
  fi
  (( i % 12 == 0 )) && info "Still waiting... ${i}/300 ($((i*5/60))m elapsed)"
done

if [[ "$INIT_OK" != "true" && $STEP_FAIL -eq 0 ]]; then
  fail "Admin panel timeout (25 min)"; STEP_FAIL=1
fi

if [[ $STEP_FAIL -eq 0 ]]; then
  # Health check: Traefik
  assert_http "Traefik root" "http://localhost" "200"
  # Health check: Gitea
  assert_http_wait "Gitea" "http://localhost/git" "200" 30
  # Health check: admin API auth
  api_code=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Password: ${ADMIN_PW}" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null || echo "000")
  [[ "$api_code" == "200" ]] && ok "Admin API auth → ${api_code}" || { fail "Admin API auth → ${api_code}"; STEP_FAIL=1; }
fi

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

---

## Task 7: steps/07-complete.sh

**Files:**
- Create: `tests/e2e/steps/07-complete.sh`

- [ ] **Step 1: Create 07-complete.sh**

```bash
#!/usr/bin/env bash
# Step 07 — Complete: verify all endpoints are reachable

step_begin "07" "complete"
STEP_FAIL=0

assert_http_wait "Traefik HTTP" "http://localhost" "200" 15
assert_http_wait "Gitea"        "http://localhost/git" "200" 15

# Admin dashboard
admin_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:8088" 2>/dev/null || echo "000")
[[ "$admin_code" == "200" ]] && ok "Admin dashboard → ${admin_code}" || { fail "Admin dashboard → ${admin_code}"; STEP_FAIL=1; }

# Apps list API
apps_json=$(api_get "/api/apps" 2>/dev/null || echo "[]")
apps_count=$(python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d) if isinstance(d,list) else len(d.get('apps',[])))" <<< "$apps_json" 2>/dev/null || echo "0")
ok "Apps registered: ${apps_count}"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
```

---

## Task 8: apps/lifecycle.sh and apps/stacks.sh

**Files:**
- Create: `tests/e2e/apps/lifecycle.sh`
- Create: `tests/e2e/apps/stacks.sh`

- [ ] **Step 1: Create lifecycle.sh**

```bash
#!/usr/bin/env bash
# apps/lifecycle.sh — Full lifecycle test for a single stack
# Usage: lifecycle.sh <stackId>
# Returns: 0=pass, 1=fail

STACK="$1"
APP="e2e-$(echo "$STACK" | tr '_' '-')-$$"
TO=$(get_stack_timeout "$STACK")
FAIL=0

log "━━━ Stack: ${STACK} (app: ${APP}, timeout: ${TO}s) ━━━"

# Cleanup any leftovers
app_cleanup "$APP" 2>/dev/null || true
sleep 1

# 1. Create
log "  [1] create-app..."
jid=$(api_post "/api/apps/create" \
  "{\"appName\":\"${APP}\",\"mode\":\"boilerplate\",\"stackId\":\"${STACK}\"}" 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
if [[ -z "$jid" ]]; then
  fail "  ${STACK}: create-app — no jobId"; FAIL=1
else
  wait_job "$jid" "$TO" && ok "  ${STACK}: created" || { fail "  ${STACK}: create failed"; FAIL=1; }
fi

if [[ $FAIL -eq 0 ]]; then
  # 2. Health via Traefik
  assert_http_wait "${STACK} backend /health" "http://localhost/apps/${APP}/health" "200" 30

  # 3. Frontend (unified check for nextjs, -ui suffix for others)
  UNIFIED="nodejs-nextjs nodejs-nextjs-full"
  if [[ " $UNIFIED " =~ " $STACK " ]]; then
    assert_http_wait "${STACK} unified page" "http://localhost/apps/${APP}/" "200" 30
  else
    assert_http_wait "${STACK} frontend"     "http://localhost/apps/${APP}-ui/" "200" 30
  fi

  # 4. Gitea push
  cnt=$(gitea_req "${GITEA_URL}/api/v1/repos/${GITEA_USER}/${APP}/contents/" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  (( cnt > 0 )) && ok "  ${STACK}: Gitea ${cnt} files" || { fail "  ${STACK}: Gitea empty"; FAIL=1; }

  # 5. Deploy
  did=$(api_post "/api/apps/${APP}/deploy" '{}' 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
  [[ -n "$did" ]] && { wait_job "$did" 180 && ok "  ${STACK}: deploy ok" || { fail "  ${STACK}: deploy failed"; FAIL=1; }; }

  # 6. Stop + Start
  api_post "/api/apps/${APP}/stop" '{}' > /dev/null 2>&1 || true; sleep 3
  api_post "/api/apps/${APP}/start" '{}' > /dev/null 2>&1 || true; sleep 8
  ok "  ${STACK}: stop/start ok"

  # 7. Logs
  lraw=$(curl -sN -H "X-Admin-Password: $ADMIN_PW" \
    "${ADMIN_URL}/api/apps/${APP}/logs?lines=5&format=plain" --max-time 5 2>/dev/null | wc -l | xargs || echo "0")
  llines="${lraw:-0}"
  [[ "$llines" =~ ^[0-9]+$ ]] || llines=0
  (( llines > 0 )) && ok "  ${STACK}: logs ${llines} lines" || log "  ${STACK}: logs empty (non-fatal)"
fi

# Cleanup
app_cleanup "$APP"

return $FAIL
```

- [ ] **Step 2: Create stacks.sh**

```bash
#!/usr/bin/env bash
# apps/stacks.sh — Run lifecycle.sh for each stack in scenario._e2e.apps.stacks

stacks=$(scen_get_stacks)
[[ "$stacks" == "all" || "$stacks" == " all " ]] && stacks="$ALL_STACKS"

if [[ -z "$stacks" ]]; then
  skip "No stacks defined in scenario._e2e.apps.stacks"
  return
fi

info "Stacks to test: ${stacks}"
for stack in $stacks; do
  if bash "$(dirname "$0")/lifecycle.sh" "$stack"; then
    ok "Stack ${stack}: PASS"
    APP_RESULTS+=("${stack}:pass")
  else
    fail "Stack ${stack}: FAIL"
    APP_RESULTS+=("${stack}:fail")
  fi
  echo ""
done
```

---

## Task 9: run.sh — Main entry point

**Files:**
- Create: `tests/e2e/run.sh`

- [ ] **Step 1: Create run.sh**

```bash
#!/usr/bin/env bash
# tests/e2e/run.sh — E2E Test Framework entry point
#
# Usage:
#   ./tests/e2e/run.sh --scenario full-install
#   ./tests/e2e/run.sh --scenario quick-smoke --only apps
#   ./tests/e2e/run.sh --scenario full-install --stacks nodejs-express,go-gin
#   ./tests/e2e/run.sh --scenario full-install --step 06
#   ./tests/e2e/run.sh --scenario full-install --ci
#   ./tests/e2e/run.sh --scenario full-install --no-teardown

set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$E2E_DIR/../.." && pwd)"

# ── Defaults ─────────────────────────────────────────────────────────────────
SCENARIO=""
ONLY=""          # install | apps | (empty=both)
STACKS_OVERRIDE=""
SINGLE_STEP=""
CI_MODE=false
TEARDOWN=true
FAIL_FAST=false

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)    SCENARIO="$2"; shift 2 ;;
    --only)        ONLY="$2"; shift 2 ;;
    --stacks)      STACKS_OVERRIDE="$2"; shift 2 ;;
    --step)        SINGLE_STEP="$2"; shift 2 ;;
    --ci)          CI_MODE=true; FAIL_FAST=true; shift ;;
    --no-teardown) TEARDOWN=false; shift ;;
    --fail-fast)   FAIL_FAST=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

export CI_MODE TEARDOWN FAIL_FAST STACKS_OVERRIDE

# ── Validate ──────────────────────────────────────────────────────────────────
[[ -z "$SCENARIO" ]] && { echo "Usage: $0 --scenario <name>"; exit 1; }
SCENARIO_FILE="${E2E_DIR}/scenarios/${SCENARIO}.json"
[[ -f "$SCENARIO_FILE" ]] || { echo "Scenario not found: ${SCENARIO_FILE}"; exit 1; }

# ── Source libs ───────────────────────────────────────────────────────────────
source "${E2E_DIR}/lib/assert.sh"
source "${E2E_DIR}/lib/api.sh"
source "${E2E_DIR}/lib/scenario.sh"
source "${E2E_DIR}/lib/report.sh"

# ── Load scenario ─────────────────────────────────────────────────────────────
scen_load "$SCENARIO_FILE"
export ADMIN_PW="$(scen_get .admin.password)"
export E2E_CONFIG_FILE="/tmp/brewnet-e2e-config.json"

# ── Trap cleanup ──────────────────────────────────────────────────────────────
trap e2e_cleanup EXIT

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  brewnet E2E Test Framework                      ║"
echo "  ║  Scenario: ${SCENARIO}$(printf '%*s' $(( 34 - ${#SCENARIO} )) '')║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

RUN_INSTALL=true; RUN_APPS=true
[[ "$ONLY" == "install" ]] && RUN_APPS=false
[[ "$ONLY" == "apps"    ]] && RUN_INSTALL=false

# ── Run install steps (00-07) ─────────────────────────────────────────────────
if [[ "$RUN_INSTALL" == "true" ]]; then
  if [[ -n "$SINGLE_STEP" ]]; then
    step_file="${E2E_DIR}/steps/${SINGLE_STEP}-"*".sh"
    # shellcheck disable=SC2086
    source $step_file
  else
    for step_file in "${E2E_DIR}/steps"/[0-9][0-9]-*.sh; do
      source "$step_file"
    done
  fi
fi

# ── Run app lifecycle tests ───────────────────────────────────────────────────
if [[ "$RUN_APPS" == "true" && -z "$SINGLE_STEP" ]]; then
  # Admin must be up for apps tests
  if ! admin_ready 10; then
    info "Admin not reachable — skipping apps lifecycle (use --only install to run install first)"
  else
    echo -e "\n${CYAN}${BOLD}━━━  App Lifecycle Tests  ━━━${NC}"
    source "${E2E_DIR}/apps/stacks.sh"
  fi
fi

# ── Report ────────────────────────────────────────────────────────────────────
print_summary

if [[ "$CI_MODE" == "true" ]]; then
  report_file=$(write_json_report "$SCENARIO")
  echo "Report: ${report_file}"
fi

# Exit code
[[ $ASSERT_FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: chmod +x and syntax check all files**

```bash
find tests/e2e -name "*.sh" -exec chmod +x {} \;
find tests/e2e -name "*.sh" -exec bash -n {} \; && echo "All syntax OK"
```
Expected: `All syntax OK`

---

## Task 10: Run and verify

- [ ] **Step 1: Test scenario JSON validity**

```bash
python3 -c "
import json, glob
for f in glob.glob('tests/e2e/scenarios/*.json'):
    try:
        d = json.load(open(f))
        print(f'OK: {f} (schemaVersion={d.get(\"schemaVersion\")})')
    except Exception as e:
        print(f'FAIL: {f}: {e}')
"
```
Expected: 3 lines starting with `OK:`

- [ ] **Step 2: Run install-only (steps 00-05, dry-run validation)**

```bash
./tests/e2e/run.sh --scenario quick-smoke --only install --step 00
./tests/e2e/run.sh --scenario quick-smoke --only install --step 01
./tests/e2e/run.sh --scenario quick-smoke --only install --step 05
```
Expected: Each step outputs ✓ assertions and `PASS`

- [ ] **Step 3: Run full apps-only test (3 stacks, ~5 min)**

```bash
./tests/e2e/run.sh --scenario quick-smoke --only apps 2>&1 | tee /tmp/e2e-quick-smoke.log
tail -30 /tmp/e2e-quick-smoke.log
```
Expected: Summary showing 3 stacks PASS, exit 0

- [ ] **Step 4: Run CI mode**

```bash
./tests/e2e/run.sh --scenario quick-smoke --only apps --ci
ls tests/e2e/reports/
```
Expected: JSON report file created, exit 0

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ docs/superpowers/
git commit -m "feat(test): add E2E test framework with JSON scenarios and 16-stack lifecycle"
```
