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
  return 0
}

fail() {
  ASSERT_FAIL=$(( ASSERT_FAIL + 1 ))
  echo -e "${RED}  ✗ [$(ts)] $*${NC}"
  if [[ "${FAIL_FAST:-false}" == "true" ]]; then
    echo -e "${RED}  FAIL FAST — aborting${NC}"; exit 1
  fi
  return 0
}

skip() {
  ASSERT_SKIP=$(( ASSERT_SKIP + 1 ))
  echo -e "${YELLOW}  ⚠ [$(ts)] SKIP: $*${NC}"
  return 0
}

info() { echo -e "${BLUE}  ℹ [$(ts)] $*${NC}"; }
log()  { echo -e "  ${DIM}[$(ts)] $*${NC}"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    ok "${label}: '${actual}'"
  else
    fail "${label}: got '${actual}', want '${expected}'"
  fi
  return 0
}

assert_nonempty() {
  local label="$1" val="$2"
  if [[ -n "$val" ]]; then
    ok "${label} is set"
  else
    fail "${label} is empty"
  fi
  return 0
}

assert_http() {
  local label="$1" url="$2" want="${3:-200}"
  local got; got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "$url" 2>/dev/null || echo "000")
  if [[ "$got" == "$want" ]]; then
    ok "${label} → HTTP ${got}"
  else
    fail "${label} → HTTP ${got} (want ${want})"
  fi
  return 0
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
  return 0
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
