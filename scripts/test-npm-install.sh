#!/bin/bash
# Test npm install flow locally without publishing to npm.
# Simulates: npm install -g @brewnet/cli
#
# Usage: bash scripts/test-npm-install.sh
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; exit 1; }
info() { printf "  ${DIM}%s${RESET}\n" "$1"; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$ROOT/packages/cli"

printf "\n${BOLD}=== npm install 시뮬레이션 ===${RESET}\n\n"

# 1. Build admin-ui + shared + cli
info "Step 1: Build all packages"
pnpm --dir "$ROOT" --filter @brewnet/admin-ui build 2>&1 | tail -1
pnpm --dir "$ROOT" --filter @brewnet/shared build 2>&1 | tail -1
pnpm --dir "$ROOT" --filter @brewnet/cli build 2>&1 | tail -1

# Verify admin-ui bundled
if [ -f "$CLI_DIR/dist/admin-ui/index.html" ]; then
  ok "admin-ui bundled in cli/dist/admin-ui"
else
  fail "admin-ui NOT bundled — tsup onSuccess failed"
fi

# 2. Create tarball (same as npm publish)
info "Step 2: npm pack"
cd "$CLI_DIR"
TARBALL=$(npm pack --pack-destination /tmp 2>&1 | tail -1)
TARBALL_PATH="/tmp/$TARBALL"
ok "Tarball: $TARBALL_PATH ($(du -h "$TARBALL_PATH" | cut -f1))"

# 3. Check tarball contents
info "Step 3: Verify tarball contents"
ADMIN_FILES=$(tar tzf "$TARBALL_PATH" | grep "admin-ui" | wc -l | tr -d ' ')
if [ "$ADMIN_FILES" -gt 0 ]; then
  ok "admin-ui files in tarball: $ADMIN_FILES"
else
  fail "admin-ui files NOT in tarball"
fi

INDEX_IN_TAR=$(tar tzf "$TARBALL_PATH" | grep "dist/index.js" | head -1)
if [ -n "$INDEX_IN_TAR" ]; then
  ok "dist/index.js present"
else
  fail "dist/index.js missing from tarball"
fi

# 4. Install globally from tarball
info "Step 4: npm install -g (from tarball)"
npm install -g "$TARBALL_PATH" 2>&1 | tail -2
INSTALLED_PATH=$(which brewnet 2>/dev/null || echo "")
if [ -n "$INSTALLED_PATH" ]; then
  ok "brewnet installed at $INSTALLED_PATH"
else
  fail "brewnet not found in PATH after install"
fi

# 5. Test CLI
info "Step 5: Smoke tests"

VERSION=$(brewnet --version 2>&1)
if [ -n "$VERSION" ]; then
  ok "brewnet --version → $VERSION"
else
  fail "brewnet --version returned empty"
fi

HELP=$(brewnet --help 2>&1 | head -1)
if echo "$HELP" | grep -q "Usage"; then
  ok "brewnet --help → works"
else
  fail "brewnet --help failed: $HELP"
fi

# 6. Test admin UI path resolution
info "Step 6: Admin UI path check"
NPM_GLOBAL="$(npm root -g)"
ADMIN_CHECK=$(node -e "
  const {join} = require('path');
  const {existsSync} = require('fs');
  const adminUi = join('${NPM_GLOBAL}', '@brewnet/cli/dist/admin-ui/index.html');
  console.log(existsSync(adminUi) ? 'FOUND:' + adminUi : 'MISSING:' + adminUi);
" 2>&1)

if echo "$ADMIN_CHECK" | grep -q "^FOUND"; then
  ok "admin-ui/index.html: $(echo "$ADMIN_CHECK" | sed 's/FOUND://')"
else
  fail "admin-ui/index.html: $(echo "$ADMIN_CHECK" | sed 's/MISSING://')"
fi

# 7. Cleanup
info "Step 7: Cleanup"
npm uninstall -g @brewnet/cli 2>&1 | tail -1
rm -f "$TARBALL_PATH"
ok "Uninstalled + tarball removed"

printf "\n${GREEN}${BOLD}✓ All checks passed${RESET}\n\n"
