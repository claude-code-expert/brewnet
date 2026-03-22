#!/bin/bash
# npm install simulation test — builds, packs, installs, verifies (~30 seconds)
# Catches: missing admin-ui in tarball, broken bin symlink, path bugs
#
# Usage: bash tests/install/npm-install.test.sh
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL_COUNT=0

ok()   { PASS=$((PASS + 1)); printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf "  ${RED}✗${RESET} %s\n" "$1"; }
info() { printf "  ${DIM}%s${RESET}\n" "$1"; }

cleanup() {
  npm uninstall -g @brewnet/cli 2>/dev/null || true
  rm -f /tmp/brewnet-cli-*.tgz
}
trap cleanup EXIT

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI_DIR="$ROOT/packages/cli"

printf "\n${BOLD}=== npm install simulation ===${RESET}\n\n"

# 1. Build all packages
info "Step 1: Build all packages"
pnpm --dir "$ROOT" --filter @brewnet/admin-ui build 2>&1 | tail -1
pnpm --dir "$ROOT" --filter @brewnet/shared build 2>&1 | tail -1
pnpm --dir "$ROOT" --filter @brewnet/cli build 2>&1 | tail -1

if [ -f "$CLI_DIR/dist/admin-ui/index.html" ]; then
  ok "admin-ui bundled in cli/dist/admin-ui"
else
  fail "admin-ui NOT bundled — tsup onSuccess failed"
fi

# 2. Create tarball
info "Step 2: npm pack"
cd "$CLI_DIR"
TARBALL=$(npm pack --pack-destination /tmp 2>&1 | tail -1)
TARBALL_PATH="/tmp/$TARBALL"
ok "Tarball: $TARBALL_PATH ($(du -h "$TARBALL_PATH" | cut -f1))"

# 3. Verify tarball contents
info "Step 3: Verify tarball contents"

ADMIN_FILES=$(tar tzf "$TARBALL_PATH" | grep "admin-ui" | wc -l | tr -d ' ')
if [ "$ADMIN_FILES" -gt 0 ]; then
  ok "admin-ui files in tarball: $ADMIN_FILES"
else
  fail "admin-ui files NOT in tarball"
fi

if tar tzf "$TARBALL_PATH" | grep -q "dist/index.js"; then
  ok "dist/index.js in tarball"
else
  fail "dist/index.js missing from tarball"
fi

# Check no wrong admin-ui path in tarball contents
if tar xzf "$TARBALL_PATH" --to-stdout 2>/dev/null | grep -q '../../admin-ui'; then
  fail "WRONG ../../admin-ui path found in tarball code"
else
  ok "no ../../admin-ui path in tarball"
fi

# package.json files field includes dist
if node -e "const p=require('$CLI_DIR/package.json'); if(!p.files.includes('dist')) process.exit(1)" 2>/dev/null; then
  ok "package.json files includes 'dist'"
else
  fail "package.json files missing 'dist'"
fi

# bin target exists
BIN_PATH=$(node -e "process.stdout.write(require('$CLI_DIR/package.json').bin.brewnet)" 2>/dev/null)
if [ -f "$CLI_DIR/$BIN_PATH" ]; then
  ok "bin target $BIN_PATH exists"
else
  fail "bin target $BIN_PATH not found"
fi

# 4. Install globally
info "Step 4: npm install -g (from tarball)"
npm install -g "$TARBALL_PATH" 2>&1 | tail -2
INSTALLED_PATH=$(which brewnet 2>/dev/null || echo "")
if [ -n "$INSTALLED_PATH" ]; then
  ok "brewnet installed at $INSTALLED_PATH"
else
  fail "brewnet not found in PATH"
fi

# 5. Smoke tests
info "Step 5: Smoke tests"

VERSION=$(brewnet --version 2>&1)
if [ -n "$VERSION" ]; then
  ok "brewnet --version → $VERSION"
else
  fail "brewnet --version returned empty"
fi

if brewnet --help 2>&1 | grep -q "Usage:"; then
  ok "brewnet --help works"
else
  fail "brewnet --help broken"
fi

# 6. Admin UI path check
info "Step 6: Admin UI path check"
NPM_GLOBAL="$(npm root -g)"
ADMIN_UI_PATH="$NPM_GLOBAL/@brewnet/cli/dist/admin-ui/index.html"
if [ -f "$ADMIN_UI_PATH" ]; then
  ok "admin-ui/index.html at $ADMIN_UI_PATH"
else
  fail "admin-ui/index.html missing at $ADMIN_UI_PATH"
fi

# Summary
printf "\n"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "${RED}${BOLD}✗ $FAIL_COUNT failed${RESET}, $PASS passed\n\n"
  exit 1
else
  printf "${GREEN}${BOLD}✓ All $PASS checks passed${RESET}\n\n"
fi
