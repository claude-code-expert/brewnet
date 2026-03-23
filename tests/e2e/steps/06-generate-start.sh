#!/usr/bin/env bash
# Step 06 — Generate + Start: run brewnet init --config --non-interactive --no-open
# Waits for admin panel (up to 25 min — Rust compile), then health-checks all containers.

ADMIN_PORT=8088
INIT_LOG=$(mktemp /tmp/brewnet-e2e-init.XXXXXX)

step_begin "06" "generate-start"
STEP_FAIL=0

# Kill any existing admin server
lsof -ti :"$ADMIN_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Locate CLI
CLI_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/../../packages/cli/dist/index.js"
if [[ ! -f "$CLI_PATH" ]]; then
  # Try via git root
  REPO_ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || echo "")
  CLI_PATH="${REPO_ROOT}/packages/cli/dist/index.js"
fi

if [[ ! -f "$CLI_PATH" ]]; then
  fail "brewnet CLI not found at: ${CLI_PATH}"; STEP_FAIL=1
  step_end "fail"; return 1
fi

# Start brewnet init in background
info "Running: node ${CLI_PATH} init --config ${E2E_CONFIG_FILE} --non-interactive --no-open"
info "Init log: ${INIT_LOG}"

node "$CLI_PATH" init --config "$E2E_CONFIG_FILE" --non-interactive --no-open \
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
