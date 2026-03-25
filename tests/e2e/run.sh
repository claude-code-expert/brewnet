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
SCENARIO_PATH="${E2E_DIR}/scenarios/${SCENARIO}.json"
[[ -f "$SCENARIO_PATH" ]] || { echo "Scenario not found: ${SCENARIO_PATH}"; exit 1; }

# ── Source libs ───────────────────────────────────────────────────────────────
# shellcheck source=lib/assert.sh
source "${E2E_DIR}/lib/assert.sh"
# shellcheck source=lib/api.sh
source "${E2E_DIR}/lib/api.sh"
# shellcheck source=lib/scenario.sh
source "${E2E_DIR}/lib/scenario.sh"
# shellcheck source=lib/report.sh
source "${E2E_DIR}/lib/report.sh"

# ── Load scenario ─────────────────────────────────────────────────────────────
scen_load "$SCENARIO_PATH"
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
    # Find the step file matching the given step ID prefix
    step_file=""
    for f in "${E2E_DIR}/steps"/[0-9][0-9]-*.sh; do
      if [[ "$(basename "$f")" == "${SINGLE_STEP}-"* ]]; then
        step_file="$f"; break
      fi
    done
    if [[ -z "$step_file" ]]; then
      echo "Step not found: ${SINGLE_STEP}"; exit 1
    fi
    # shellcheck disable=SC1090
    source "$step_file"
  else
    for step_file in "${E2E_DIR}/steps"/[0-9][0-9]-*.sh; do
      # shellcheck disable=SC1090
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
    # shellcheck source=apps/stacks.sh
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
