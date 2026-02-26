#!/bin/bash
# Brewnet Install Script v1.0.1
# Usage: curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
#
# What this script does:
#   1. Detect OS (macOS / Linux)
#   2. Check Node.js 20+
#   3. Clone source from GitHub into ~/.brewnet/source/
#   4. Build CLI (pnpm install + pnpm build)
#   5. Create global wrapper at /usr/local/bin/brewnet (or ~/.local/bin/brewnet)
#   6. Add to PATH (.zshrc / .bashrc / .bash_profile)
#
set -e

BREWNET_VERSION="1.0.1"
REPO_URL="https://github.com/claude-code-expert/brewnet.git"
BREWNET_SOURCE="$HOME/.brewnet/source"
BREWNET_BIN_DIR="$HOME/.local/bin"
BREWNET_DATA_DIR="$HOME/.brewnet"
MIN_NODE_MAJOR=20

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info()    { printf "  ${BLUE}→${RESET}  %s\n" "$1"; }
success() { printf "  ${GREEN}✓${RESET}  %s\n" "$1"; }
warn()    { printf "  ${YELLOW}⚠${RESET}  %s\n" "$1"; }
error()   { printf "  ${RED}✗${RESET}  %s\n" "$1" >&2; }
header()  { printf "\n${BOLD}%s${RESET}\n" "$1"; }
step()    { printf "  ${DIM}[%d/%d]${RESET} %s\n" "$1" "$TOTAL_STEPS" "$2"; }

TOTAL_STEPS=9

# ─── Spinner ───────────────────────────────────────────────────────────────────
SPINNER_PID=""
SPINNER_FRAMES='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
SPINNER_LOG=""

spinner_start() {
  local msg="$1"
  SPINNER_LOG="$(mktemp)"
  (
    i=0
    while true; do
      frame="${SPINNER_FRAMES:$((i % ${#SPINNER_FRAMES})):1}"
      printf "\r  ${BLUE}%s${RESET}  %s ... " "$frame" "$msg"
      sleep 0.1
      i=$((i + 1))
    done
  ) &
  SPINNER_PID=$!
  disown "$SPINNER_PID" 2>/dev/null || true
}

spinner_stop() {
  local status="${1:-0}"   # 0=success, 1=fail
  local msg="$2"
  if [ -n "$SPINNER_PID" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
  fi
  printf "\r\033[K"   # clear spinner line
  if [ "$status" -eq 0 ]; then
    success "$msg"
  else
    error "$msg"
  fi
  [ -n "$SPINNER_LOG" ] && rm -f "$SPINNER_LOG" 2>/dev/null
  SPINNER_LOG=""
}

# 에러 발생 시 스피너 정리
trap 'spinner_stop 1 "Installation interrupted" 2>/dev/null; exit 1' INT TERM

# ─── Banner ────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}Brewnet v${BREWNET_VERSION}${RESET} — Your Home Server, Brewed Fresh\n"
printf "  ${DIM}%s${RESET}\n" "$REPO_URL"
printf "\n"

# ─── Step 1: OS Detection ──────────────────────────────────────────────────────
step 1 "Detecting platform..."
OS="$(uname -s)"

case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *)
    error "Unsupported operating system: $OS"
    error "Brewnet supports macOS 12+ and Ubuntu/Debian/CentOS Linux."
    exit 1
    ;;
esac
success "Platform: ${PLATFORM}"

# ─── Step 2: Node.js 20+ ───────────────────────────────────────────────────────
step 2 "Checking Node.js 20+..."

if ! command -v node >/dev/null 2>&1; then
  error "Node.js ${MIN_NODE_MAJOR}+ is required but not found."
  printf "\n"
  if [ "$PLATFORM" = "macOS" ]; then
    printf "  Install Node.js:\n"
    printf "    ${BOLD}brew install node${RESET}\n"
    printf "    or: https://nodejs.org/en/download/\n"
  else
    printf "  Install Node.js:\n"
    printf "    ${BOLD}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${RESET}\n"
    printf "    ${BOLD}sudo apt-get install -y nodejs${RESET}\n"
  fi
  printf "\n"
  exit 1
fi

NODE_VER="$(node --version 2>/dev/null | sed 's/v//')"
NODE_MAJOR="$(echo "$NODE_VER" | cut -d. -f1)"

if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  error "Node.js ${MIN_NODE_MAJOR}+ required, found v${NODE_VER}"
  error "Please upgrade: https://nodejs.org/en/download/"
  exit 1
fi
success "Node.js v${NODE_VER}"

# ─── Step 3: pnpm ──────────────────────────────────────────────────────────────
step 3 "Checking pnpm..."

if ! command -v pnpm >/dev/null 2>&1; then
  spinner_start "Installing pnpm"
  npm install -g pnpm --silent 2>&1
  spinner_stop 0 "pnpm installed"
else
  success "pnpm $(pnpm --version)"
fi

# ─── Step 4: git ───────────────────────────────────────────────────────────────
step 4 "Checking git..."

if ! command -v git >/dev/null 2>&1; then
  error "git is required but not found."
  if [ "$PLATFORM" = "macOS" ]; then
    printf "  Install: ${BOLD}xcode-select --install${RESET}\n"
  else
    printf "  Install: ${BOLD}sudo apt-get install -y git${RESET}\n"
  fi
  exit 1
fi
success "git $(git --version | awk '{print $3}')"

# ─── Step 5: Clone / Update source ────────────────────────────────────────────
step 5 "Downloading Brewnet source..."

if [ -d "$BREWNET_SOURCE/.git" ]; then
  spinner_start "Updating source"
  git -C "$BREWNET_SOURCE" pull --ff-only --quiet 2>&1
  spinner_stop 0 "Source updated"
else
  mkdir -p "$(dirname "$BREWNET_SOURCE")"
  spinner_start "Cloning from GitHub"
  git clone --depth 1 --quiet "$REPO_URL" "$BREWNET_SOURCE" 2>&1
  spinner_stop 0 "Source downloaded to ~/.brewnet/source/"
fi

# ─── Step 6: Install dependencies ─────────────────────────────────────────────
step 6 "Installing dependencies..."

spinner_start "Running pnpm install"
pnpm install --dir "$BREWNET_SOURCE" --silent 2>&1
spinner_stop 0 "Dependencies installed"

# ─── Step 7: Build ─────────────────────────────────────────────────────────────
step 7 "Building Brewnet CLI..."

spinner_start "Compiling TypeScript"
pnpm --dir "$BREWNET_SOURCE" build 2>&1
if [ ! -f "$BREWNET_SOURCE/packages/cli/dist/index.js" ]; then
  spinner_stop 1 "Build failed: dist/index.js not found"
  exit 1
fi
spinner_stop 0 "Build complete"

# ─── Step 8: Install global wrapper ───────────────────────────────────────────
step 8 "Installing brewnet command..."

# /usr/local/bin 쓰기 가능하면 사용, 아니면 ~/.local/bin
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
elif sudo -n true 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=true
else
  INSTALL_DIR="$BREWNET_BIN_DIR"
  mkdir -p "$INSTALL_DIR"
fi

WRAPPER="$INSTALL_DIR/brewnet"
WRAPPER_CONTENT="#!/bin/bash
exec node \"$BREWNET_SOURCE/packages/cli/dist/index.js\" \"\$@\"
"

if [ "${USE_SUDO:-false}" = "true" ]; then
  printf '%s' "$WRAPPER_CONTENT" | sudo tee "$WRAPPER" > /dev/null
  sudo chmod +x "$WRAPPER"
else
  printf '%s' "$WRAPPER_CONTENT" > "$WRAPPER"
  chmod +x "$WRAPPER"
fi
success "Installed at $WRAPPER"

# ─── Step 8b: ~/.brewnet/ data directories ─────────────────────────────────────
mkdir -p "${BREWNET_DATA_DIR}/projects"
mkdir -p "${BREWNET_DATA_DIR}/backups"
mkdir -p "${BREWNET_DATA_DIR}/logs"
mkdir -p "${BREWNET_DATA_DIR}/db"

# ─── Step 9: PATH + Verify ─────────────────────────────────────────────────────
step 9 "Configuring environment..."

CONFIGURED_PROFILE=""

# ~/.local/bin 을 사용한 경우에만 PATH 추가 필요
if [ "$INSTALL_DIR" = "$BREWNET_BIN_DIR" ]; then
  PATH_LINE="export PATH=\"${BREWNET_BIN_DIR}:\$PATH\""

  add_to_profile() {
    local profile="$1"
    if [ -f "$profile" ]; then
      if grep -q "brewnet\|${BREWNET_BIN_DIR}" "$profile" 2>/dev/null; then
        return
      fi
      printf "\n# Added by Brewnet installer\n%s\n" "$PATH_LINE" >> "$profile"
      CONFIGURED_PROFILE="$profile"
    fi
  }

  if [ "$PLATFORM" = "macOS" ]; then
    [ -f "$HOME/.zshrc" ]        && add_to_profile "$HOME/.zshrc"
    [ -f "$HOME/.bash_profile" ] && add_to_profile "$HOME/.bash_profile"
    [ -z "$CONFIGURED_PROFILE" ] && { touch "$HOME/.zshrc"; add_to_profile "$HOME/.zshrc"; }
  else
    [ -f "$HOME/.bashrc" ]       && add_to_profile "$HOME/.bashrc"
    [ -f "$HOME/.bash_profile" ] && add_to_profile "$HOME/.bash_profile"
    [ -f "$HOME/.zshrc" ]        && add_to_profile "$HOME/.zshrc"
  fi

  export PATH="${BREWNET_BIN_DIR}:$PATH"
fi

# Verify
if command -v brewnet >/dev/null 2>&1; then
  INSTALLED_VER="$(brewnet --version 2>/dev/null || echo "$BREWNET_VERSION")"
  success "brewnet $INSTALLED_VER is ready"
else
  warn "brewnet not in current PATH yet"
  if [ -n "$CONFIGURED_PROFILE" ]; then
    info "Run: source $CONFIGURED_PROFILE"
  fi
fi

# ─── Done ──────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${GREEN}${BOLD}✓ Brewnet v${BREWNET_VERSION} installation complete!${RESET}\n"
printf "\n"
printf "  ${BOLD}Get started:${RESET}\n"
printf "    ${GREEN}brewnet init${RESET}\n"
printf "\n"
if [ -n "$CONFIGURED_PROFILE" ]; then
  printf "  ${YELLOW}Note:${RESET} Reload your shell first:\n"
  printf "    source %s\n" "$CONFIGURED_PROFILE"
  printf "\n"
fi
printf "  ${DIM}Source:  %s${RESET}\n" "$BREWNET_SOURCE"
printf "  ${DIM}Data:    %s${RESET}\n" "$BREWNET_DATA_DIR"
printf "  ${DIM}Binary:  %s${RESET}\n" "$WRAPPER"
printf "\n"
printf "  ${DIM}To update: curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash${RESET}\n"
printf "\n"
