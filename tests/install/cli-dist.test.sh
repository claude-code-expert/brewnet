#!/bin/bash
# CLI dist bundle integrity checks — runs after build, ~5 seconds
# Catches: admin-ui path bugs, missing shebang, version mismatch, missing bundles
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI_DIST="$ROOT/packages/cli/dist"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${RED}✗${RESET} %s\n" "$1"; }

printf "\n${BOLD}=== CLI dist integrity ===${RESET}\n\n"

# 1. dist/index.js exists + has shebang
if [ -f "$CLI_DIST/index.js" ]; then
  ok "dist/index.js exists"
else
  fail "dist/index.js missing"
fi

if head -1 "$CLI_DIST/index.js" 2>/dev/null | grep -q "#!/usr/bin/env node"; then
  ok "shebang present"
else
  fail "shebang missing in dist/index.js"
fi

# 2. admin-ui bundle
if [ -f "$CLI_DIST/admin-ui/index.html" ]; then
  ok "admin-ui/index.html bundled"
else
  fail "admin-ui/index.html missing from dist"
fi

if [ -d "$CLI_DIST/admin-ui/assets" ]; then
  ok "admin-ui/assets/ directory present"
else
  fail "admin-ui/assets/ missing from dist"
fi

# 3. admin-server path validation (prevent ../../admin-ui regression)
ADMIN_CHUNK=$(ls "$CLI_DIST"/admin-server-*.js 2>/dev/null | head -1)
if [ -n "$ADMIN_CHUNK" ]; then
  ok "admin-server chunk found"
  if grep -q "../../admin-ui" "$ADMIN_CHUNK"; then
    fail "WRONG path ../../admin-ui in admin-server chunk (should be ../admin-ui)"
  else
    ok "no ../../admin-ui path (correct)"
  fi
else
  fail "admin-server chunk not found in dist"
fi

# 4. version matches package.json
PKG_VER=$(node -e "process.stdout.write(require('$ROOT/packages/cli/package.json').version)" 2>/dev/null)
CLI_VER=$(node "$CLI_DIST/index.js" --version 2>&1)
if [ "$PKG_VER" = "$CLI_VER" ]; then
  ok "version match: $PKG_VER"
else
  fail "version mismatch: package.json=$PKG_VER cli=$CLI_VER"
fi

# 5. --help works
if node "$CLI_DIST/index.js" --help 2>&1 | grep -q "Usage:"; then
  ok "--help shows Usage"
else
  fail "--help missing Usage output"
fi

# 6. init subcommand registered
if node "$CLI_DIST/index.js" --help 2>&1 | grep -q "init"; then
  ok "init subcommand registered"
else
  fail "init subcommand not in --help"
fi

# 7. admin subcommand registered
if node "$CLI_DIST/index.js" --help 2>&1 | grep -q "admin"; then
  ok "admin subcommand registered"
else
  fail "admin subcommand not in --help"
fi

# Summary
printf "\n"
if [ "$FAIL" -gt 0 ]; then
  printf "${RED}${BOLD}✗ $FAIL failed${RESET}, $PASS passed\n\n"
  exit 1
else
  printf "${GREEN}${BOLD}✓ All $PASS checks passed${RESET}\n\n"
fi
