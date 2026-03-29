#!/bin/bash
# =============================================================================
# Brewnet Release Pipeline — Build, verify, tag, publish
#
# Executes each release step sequentially with status reporting.
# Subsumes test-npm-install.sh functionality with correct paths.
#
# Usage:
#   bash scripts/release.sh            # dry-run (build + verify only)
#   bash scripts/release.sh --publish  # full release (build + verify + tag + push)
#
# Prerequisites:
#   - On main branch, up to date with remote
#   - NPM_TOKEN configured in GitHub Secrets (for CI publish)
#   - pnpm installed
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL_COUNT=0
PUBLISH=false

[[ "${1:-}" == "--publish" ]] && PUBLISH=true

ok()   { PASS=$((PASS + 1)); printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf "  ${RED}✗${RESET} %s\n" "$1"; }
info() { printf "\n${BOLD}━━━ %s${RESET}\n\n" "$1"; }
dim()  { printf "  ${DIM}%s${RESET}\n" "$1"; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$ROOT/packages/cli"

cleanup() {
  npm uninstall -g @brewnet/cli 2>/dev/null || true
  rm -f /tmp/brewnet-cli-*.tgz
}
trap cleanup EXIT

VERSION=$(node -e "process.stdout.write(require('$CLI_DIR/package.json').version)")
printf "\n${BOLD}╔══════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}║  Brewnet Release Pipeline  v${VERSION}        ║${RESET}\n"
printf "${BOLD}╚══════════════════════════════════════════╝${RESET}\n"

# ─── Step 1: Pre-flight checks ───────────────────────────────────────────────

info "Step 1: Pre-flight checks"

BRANCH=$(git -C "$ROOT" branch --show-current)
if [ "$BRANCH" = "main" ]; then
  ok "On main branch"
else
  fail "Not on main branch (current: $BRANCH)"
fi

if git -C "$ROOT" diff --quiet HEAD 2>/dev/null; then
  ok "Working tree clean"
else
  fail "Uncommitted changes detected"
fi

if git -C "$ROOT" tag -l "v$VERSION" | grep -q "v$VERSION"; then
  dim "Tag v$VERSION already exists"
else
  ok "Tag v$VERSION available"
fi

dim "Package: @brewnet/cli@$VERSION"

# ─── Step 2: Build ────────────────────────────────────────────────────────────

info "Step 2: Build all packages"

dim "Installing dependencies..."
pnpm --dir "$ROOT" install --frozen-lockfile 2>&1 | tail -1

dim "Building @brewnet/shared..."
if pnpm --dir "$ROOT" --filter @brewnet/shared build 2>&1 | tail -1; then
  ok "@brewnet/shared built"
else
  fail "@brewnet/shared build failed"
fi

dim "Building @brewnet/admin-ui..."
ADMIN_BUILD=$(pnpm --dir "$ROOT" --filter @brewnet/admin-ui build 2>&1 | tail -1)
if echo "$ADMIN_BUILD" | grep -q "built in"; then
  ok "@brewnet/admin-ui built ($ADMIN_BUILD)"
else
  fail "@brewnet/admin-ui build failed"
fi

dim "Building @brewnet/cli..."
CLI_BUILD=$(pnpm --dir "$ROOT" --filter @brewnet/cli build 2>&1 | grep "Build success" | head -1)
if [ -n "$CLI_BUILD" ]; then
  ok "@brewnet/cli built ($CLI_BUILD)"
else
  fail "@brewnet/cli build failed"
fi

# ─── Step 3: Verify bundle ───────────────────────────────────────────────────

info "Step 3: Verify bundle contents"

# admin-ui bundled
if [ -f "$CLI_DIR/dist/admin-ui/index.html" ]; then
  ok "admin-ui/index.html bundled in cli/dist"
else
  fail "admin-ui NOT bundled — tsup onSuccess failed"
fi

# bin entry
BIN_PATH=$(node -e "process.stdout.write(require('$CLI_DIR/package.json').bin.brewnet)" 2>/dev/null)
if [ -f "$CLI_DIR/$BIN_PATH" ]; then
  ok "bin entry $BIN_PATH exists"
else
  fail "bin entry $BIN_PATH missing"
fi

# package.json files
if node -e "const p=require('$CLI_DIR/package.json'); if(!p.files.includes('dist')) process.exit(1)" 2>/dev/null; then
  ok "package.json files includes 'dist'"
else
  fail "package.json files missing 'dist'"
fi

# ─── Step 4: npm pack & tarball verify ────────────────────────────────────────

info "Step 4: npm pack & tarball verify"

cd "$CLI_DIR"
TARBALL=$(npm pack --pack-destination /tmp 2>&1 | tail -1)
TARBALL_PATH="/tmp/$TARBALL"
TARBALL_SIZE=$(du -h "$TARBALL_PATH" | cut -f1)
ok "Packed: $TARBALL ($TARBALL_SIZE)"

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

TOTAL_FILES=$(tar tzf "$TARBALL_PATH" | wc -l | tr -d ' ')
dim "Total files in tarball: $TOTAL_FILES"

# ─── Step 5: Install & smoke test ────────────────────────────────────────────

info "Step 5: Install & smoke test"

npm install -g "$TARBALL_PATH" 2>&1 | tail -1
INSTALLED_PATH=$(which brewnet 2>/dev/null || echo "")
if [ -n "$INSTALLED_PATH" ]; then
  ok "brewnet installed at $INSTALLED_PATH"
else
  fail "brewnet not found in PATH"
fi

INSTALLED_VERSION=$(brewnet --version 2>&1 || echo "")
if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
  ok "brewnet --version → $INSTALLED_VERSION"
else
  fail "Version mismatch: expected $VERSION, got $INSTALLED_VERSION"
fi

if brewnet --help 2>&1 | grep -q "Usage:"; then
  ok "brewnet --help works"
else
  fail "brewnet --help broken"
fi

NPM_GLOBAL="$(npm root -g)"
ADMIN_UI_INSTALLED="$NPM_GLOBAL/@brewnet/cli/dist/admin-ui/index.html"
if [ -f "$ADMIN_UI_INSTALLED" ]; then
  ok "admin-ui accessible at install path"
else
  fail "admin-ui missing at install path"
fi

# ─── Step 6: Tag & publish ───────────────────────────────────────────────────

if [ "$PUBLISH" = true ]; then
  info "Step 6: Tag & push (triggers GitHub Actions publish)"

  cd "$ROOT"
  if git tag -l "v$VERSION" | grep -q "v$VERSION"; then
    dim "Tag v$VERSION already exists, skipping"
  else
    git tag "v$VERSION"
    ok "Created tag v$VERSION"
  fi

  git push origin "v$VERSION" 2>&1
  ok "Pushed tag v$VERSION → GitHub Actions will publish to npm"

  dim "Monitor: gh run list --limit 1"
  dim "Verify:  npm view @brewnet/cli version"
else
  info "Step 6: Publish (skipped — dry-run mode)"
  dim "Run with --publish to create tag and trigger npm publish"
  dim "  bash scripts/release.sh --publish"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

printf "\n${BOLD}━━━ Summary ━━━${RESET}\n\n"
printf "  Package:  @brewnet/cli@${VERSION}\n"
printf "  Tarball:  ${TARBALL_SIZE}\n"
printf "  Files:    ${TOTAL_FILES}\n"
printf "  Publish:  %s\n" "$( [ "$PUBLISH" = true ] && echo "YES" || echo "dry-run" )"
printf "\n"

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "  ${RED}${BOLD}✗ $FAIL_COUNT failed${RESET}, $PASS passed\n\n"
  exit 1
else
  printf "  ${GREEN}${BOLD}✓ All $PASS checks passed${RESET}\n\n"
fi
