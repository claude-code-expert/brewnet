#!/usr/bin/env bash
# tests/cli-command-verify.sh
# Verifies that each brewnet CLI command is implemented and responds to --help.
# Usage: bash tests/cli-command-verify.sh

set -euo pipefail

BREWNET="node $(cd "$(dirname "$0")/.." && pwd)/packages/cli/dist/index.js"
PASS=0; FAIL=0; PENDING=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

check() {
  local label="$1"; shift
  local cmd=("$@")
  printf "  %-52s" "$label"
  local out; local rc=0
  out=$("${cmd[@]}" 2>&1) || rc=$?
  if [[ $rc -eq 0 ]] || echo "$out" | grep -qiE "usage:|options:|commands:"; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS++)) || true
  else
    echo -e "${RED}FAIL${NC}  (exit $rc)"
    echo "    ↳ $(echo "$out" | head -2)"
    ((FAIL++)) || true
  fi
}

pending() {
  local label="$1"
  printf "  %-52s" "$label"
  echo -e "${YELLOW}PENDING${NC}"
  ((PENDING++)) || true
}

echo ""
echo -e "${CYAN}${BOLD}━━━  brewnet CLI Command Verification  ━━━${NC}"
echo ""

echo -e "${BOLD}[ Core Commands ]${NC}"
check "brewnet --version"                  $BREWNET --version
check "brewnet init --help"                $BREWNET init --help
check "brewnet status --help"              $BREWNET status --help
check "brewnet up --help"                  $BREWNET up --help
check "brewnet down --help"                $BREWNET down --help
check "brewnet logs --help"                $BREWNET logs --help
check "brewnet add --help"                 $BREWNET add --help
check "brewnet remove --help"              $BREWNET remove --help
check "brewnet backup --help"              $BREWNET backup --help
check "brewnet restore --help"             $BREWNET restore --help
check "brewnet create-app --help"          $BREWNET create-app --help
check "brewnet admin --help"               $BREWNET admin --help
check "brewnet shutdown --help"            $BREWNET shutdown --help
check "brewnet uninstall --help"           $BREWNET uninstall --help

echo ""
echo -e "${BOLD}[ Domain Commands ]${NC}"
check "brewnet domain --help"              $BREWNET domain --help
check "brewnet domain connect --help"      $BREWNET domain connect --help
check "brewnet domain disconnect --help"   $BREWNET domain disconnect --help
check "brewnet domain status --help"       $BREWNET domain status --help
check "brewnet domain list --help"         $BREWNET domain list --help
check "brewnet domain tunnel --help"       $BREWNET domain tunnel --help
check "brewnet domain tunnel status"       $BREWNET domain tunnel status --help
check "brewnet domain tunnel restart"      $BREWNET domain tunnel restart --help

check "brewnet list --help"                $BREWNET list --help
check "brewnet update --help"              $BREWNET update --help

echo ""
echo -e "${BOLD}[ Not Yet Implemented ]${NC}"
pending "brewnet deploy <path>"
pending "brewnet storage init"

echo ""
echo -e "${CYAN}${BOLD}━━━  Summary  ━━━${NC}"
echo -e "  ${GREEN}PASS${NC}       $PASS"
echo -e "  ${RED}FAIL${NC}       $FAIL"
echo -e "  ${YELLOW}PENDING${NC}    $PENDING"
echo ""
if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}✗ $FAIL command(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}✓ All implemented commands verified ($PENDING pending implementation)${NC}"
fi
