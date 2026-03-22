#!/bin/bash
# install.sh structural integrity tests — no build needed, ~1 second
# Catches: hardcoded version, exec stdin bugs, missing build steps, sudo issues
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/install.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${RED}✗${RESET} %s\n" "$1"; }

printf "\n${BOLD}=== install.sh integrity ===${RESET}\n\n"

# 1. bash syntax valid
if bash -n "$SCRIPT" 2>/dev/null; then
  ok "bash syntax valid"
else
  fail "install.sh has syntax errors"
fi

# 2. no hardcoded BREWNET_VERSION (must read from package.json)
if grep -q 'BREWNET_VERSION="[0-9]' "$SCRIPT"; then
  fail "hardcoded BREWNET_VERSION found — must read from package.json"
else
  ok "no hardcoded version"
fi

# 3. no exec brewnet init (causes stdin pipe issues with curl | bash)
if grep -q "exec brewnet init" "$SCRIPT"; then
  fail "exec brewnet init found — causes ExitPromptError with curl | bash"
else
  ok "no exec brewnet init"
fi

# 4. no /dev/tty redirect (leftover from removed exec brewnet init)
if grep -q "< /dev/tty" "$SCRIPT"; then
  fail "leftover /dev/tty redirect found"
else
  ok "no /dev/tty redirect"
fi

# 5. sudo mkdir -p present (for /usr/local/bin creation)
if grep -q "sudo mkdir -p" "$SCRIPT"; then
  ok "sudo mkdir -p present"
else
  fail "sudo mkdir -p missing — /usr/local/bin may not exist on fresh systems"
fi

# 6. admin-ui build step exists
if grep -q "admin-ui" "$SCRIPT"; then
  ok "admin-ui build step present"
else
  fail "admin-ui build step missing"
fi

# 7. shared build step exists
if grep -q "@brewnet/shared" "$SCRIPT"; then
  ok "@brewnet/shared build step present"
else
  fail "@brewnet/shared build step missing"
fi

# 8. cli build step exists
if grep -q "@brewnet/cli" "$SCRIPT"; then
  ok "@brewnet/cli build step present"
else
  fail "@brewnet/cli build step missing"
fi

# 9. completion message has brewnet init
if grep -q "brewnet init" "$SCRIPT"; then
  ok "brewnet init instruction in completion message"
else
  fail "brewnet init instruction missing"
fi

# 10. uses --depth 1 for clone (fast download)
if grep -q "\-\-depth" "$SCRIPT"; then
  ok "shallow clone (--depth) used"
else
  fail "no --depth flag in git clone"
fi

# 11. dist/index.js check exists (build verification)
if grep -q "dist/index.js" "$SCRIPT"; then
  ok "build verification (dist/index.js check) present"
else
  fail "no build verification — script won't catch build failures"
fi

# Summary
printf "\n"
if [ "$FAIL" -gt 0 ]; then
  printf "${RED}${BOLD}✗ $FAIL failed${RESET}, $PASS passed\n\n"
  exit 1
else
  printf "${GREEN}${BOLD}✓ All $PASS checks passed${RESET}\n\n"
fi
