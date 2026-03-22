#!/usr/bin/env bash
# test-all-stacks.sh — Test all 16 boilerplate stacks end-to-end
#
# For each stack:
#   create-app → containers running → backend /health via Traefik
#   → frontend page via Traefik → Gitea source pushed → deploy → stop → start → logs
#
# Repeats until all pass, then exits 0. Run on the actual homeserver.
# Compatible with bash 3.2+ (macOS default — no associative arrays).
#
# Usage:
#   bash scripts/test-all-stacks.sh [--admin-url http://localhost:8088] [--password <pw>]
#
# Env vars (alternative to flags):
#   BREWNET_ADMIN_URL  (default: http://localhost:8088)
#   BREWNET_PASSWORD   (required — admin panel password)
#   GITEA_URL          (default: http://localhost/git — Quick Tunnel path via Traefik)
#   GITEA_USER         (default: admin)
#   TRAEFIK_URL        (default: http://localhost — used for endpoint checks)

set -euo pipefail

ADMIN_URL="${BREWNET_ADMIN_URL:-http://localhost:8088}"
ADMIN_PW="${BREWNET_PASSWORD:-}"
GITEA_URL="${GITEA_URL:-http://localhost/git}"
GITEA_USER="${GITEA_USER:-admin}"
GITEA_PW="${BREWNET_PASSWORD:-}"
GITEA_TOKEN="$(cat ~/.brewnet/gitea-token 2>/dev/null || echo '')"
TRAEFIK_URL="${TRAEFIK_URL:-http://localhost}"
RESULTS_DIR="$(mktemp -d)"

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --admin-url) ADMIN_URL="$2"; shift 2 ;;
    --password)  ADMIN_PW="$2"; GITEA_PW="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$ADMIN_PW" ]]; then
  echo "ERROR: BREWNET_PASSWORD env var or --password flag required"
  exit 1
fi

# ─── Stack list (16 stacks) ─────────────────────────────────────────────────
STACKS=(
  go-gin
  go-echo
  go-fiber
  rust-actix-web
  rust-axum
  java-springboot
  java-spring
  kotlin-ktor
  kotlin-springboot
  nodejs-express
  nodejs-nestjs
  nodejs-nextjs
  nodejs-nextjs-full
  python-fastapi
  python-django
  python-flask
)

# nodejs-nextjs and nodejs-nextjs-full are unified (no separate frontend service)
is_unified() {
  [[ "$1" == "nodejs-nextjs" || "$1" == "nodejs-nextjs-full" ]]
}

# Build/health timeout per stack (bash 3.2 compatible — no declare -A)
get_timeout() {
  case "$1" in
    rust-actix-web|rust-axum)             echo 600 ;;
    java-springboot|java-spring)          echo 300 ;;
    kotlin-ktor|kotlin-springboot)        echo 300 ;;
    *)                                    echo 120 ;;
  esac
}

# ─── Result storage (temp files — bash 3.2 compatible) ─────────────────────
set_result() { echo "$2" > "$RESULTS_DIR/$1"; }
get_result() { cat "$RESULTS_DIR/$1" 2>/dev/null || echo "SKIP"; }

# ─── Helpers ────────────────────────────────────────────────────────────────
PASS=0
FAIL=0

log() { echo "[$(date '+%H:%M:%S')] $*"; }
ok()  { log "  ✓ $*"; }
err() { log "  ✗ $*"; }

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf -X "$method" \
    -H "X-Admin-Password: $ADMIN_PW" \
    -H "Content-Type: application/json" \
    "$ADMIN_URL$path" "$@"
}

gitea_curl() {
  if [[ -n "$GITEA_TOKEN" ]]; then
    curl -sf -H "Authorization: token $GITEA_TOKEN" "$@"
  else
    curl -sf -u "$GITEA_USER:$GITEA_PW" "$@"
  fi
}

wait_job() {
  local job_id="$1" timeout="$2"
  local elapsed=0
  while (( elapsed < timeout )); do
    local status
    status=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
    case "$status" in
      done)    return 0 ;;
      failed)  return 1 ;;
    esac
    sleep 5
    (( elapsed += 5 ))
  done
  return 1  # timeout
}

# Returns HTTP status code (no -f: returns actual code even for 4xx/5xx)
http_code() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "$1" 2>/dev/null || echo "000"
}

# Poll URL until it returns 200, up to timeout_s seconds. Returns 0 on success.
wait_http_200() {
  local url="$1" timeout_s="${2:-30}" elapsed=0
  while (( elapsed < timeout_s )); do
    local code
    code=$(http_code "$url")
    [[ "$code" == "200" ]] && return 0
    sleep 5; (( elapsed += 5 ))
  done
  return 1
}

gitea_has_code() {
  local repo="$1"
  local count
  count=$(gitea_curl \
    "$GITEA_URL/api/v1/repos/$GITEA_USER/$repo/contents/" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  (( count > 0 ))
}

cleanup_app() {
  local name="$1"
  api DELETE "/api/apps/$name" 2>/dev/null || true
  gitea_curl -X DELETE "$GITEA_URL/api/v1/repos/$GITEA_USER/$name" 2>/dev/null || true
}

# ─── Test a single stack ─────────────────────────────────────────────────────
test_stack() {
  local stack="$1"
  local app_name="test-$(echo "$stack" | tr '_' '-')-$$"
  local timeout
  timeout=$(get_timeout "$stack")
  local fail_reasons=""

  log "━━━ Testing $stack (app: $app_name, timeout: ${timeout}s) ━━━"

  # Pre-cleanup in case a previous run left debris
  cleanup_app "$app_name" 2>/dev/null || true

  # 1. Create app — no port field so auto-allocation kicks in
  log "  [1/7] create-app..."
  local job_id
  job_id=$(api POST "/api/apps/create" \
    --data-binary "{\"appName\":\"$app_name\",\"mode\":\"boilerplate\",\"stackId\":\"$stack\"}" \
    2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])" 2>/dev/null || echo "")

  if [[ -z "$job_id" ]]; then
    set_result "$stack" "FAIL: create-app no jobId"
    return 1
  fi

  if ! wait_job "$job_id" "$timeout"; then
    local job_err
    job_err=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "unknown")
    set_result "$stack" "FAIL: create-app failed: $job_err"
    cleanup_app "$app_name"
    return 1
  fi
  ok "create-app done"

  # 2. Verify containers running
  log "  [2/7] checking containers..."
  local app_info
  app_info=$(api GET "/api/apps/$app_name" 2>/dev/null || echo "{}")
  local app_status
  # API wraps in {"app": {...}} envelope
  app_status=$(echo "$app_info" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); a=d.get('app',d); print(a.get('status',''))" 2>/dev/null || echo "")

  if [[ "$app_status" != "running" ]]; then
    fail_reasons="${fail_reasons}containers:${app_status} "
    err "containers: $app_status"
  else
    ok "containers running"
  fi

  # 3. Endpoint checks via Traefik (same URL the browser/user sees)
  log "  [3/7] endpoint checks via Traefik ($TRAEFIK_URL)..."

  # Backend health — Traefik strips /apps/{name} prefix for non-unified;
  # Next.js basePath handles /apps/{name}/health internally for unified stacks.
  local be_health_url="${TRAEFIK_URL}/apps/${app_name}/health"
  if wait_http_200 "$be_health_url" 30; then
    ok "backend /health → 200"
  else
    local be_code
    be_code=$(http_code "$be_health_url")
    fail_reasons="${fail_reasons}backend-health:${be_code} "
    err "backend /health → $be_code"
  fi

  # Frontend page — separate frontend at /apps/{name}-ui/ or unified at /apps/{name}
  # Frontend starts after backend is healthy (depends_on) — allow up to 30s extra
  if is_unified "$stack"; then
    local page_url="${TRAEFIK_URL}/apps/${app_name}"
    if wait_http_200 "$page_url" 30; then
      ok "unified page → 200"
    else
      fail_reasons="${fail_reasons}unified-page:$(http_code "$page_url") "
      err "unified page → $(http_code "$page_url")"
    fi
  else
    local fe_url="${TRAEFIK_URL}/apps/${app_name}-ui/"
    if wait_http_200 "$fe_url" 30; then
      ok "frontend page → 200"
    else
      fail_reasons="${fail_reasons}frontend:$(http_code "$fe_url") "
      err "frontend page → $(http_code "$fe_url")"
    fi
  fi

  # 4. Verify Gitea source push
  log "  [4/7] checking Gitea source ($GITEA_URL)..."
  if ! gitea_has_code "$app_name"; then
    fail_reasons="${fail_reasons}gitea-empty "
    err "Gitea repo is empty"
  else
    ok "Gitea source pushed"
  fi

  # 5. Deploy (re-deploy, uses same build timeout)
  log "  [5/7] deploy..."
  local deploy_job
  deploy_job=$(api POST "/api/apps/$app_name/deploy" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])" 2>/dev/null || echo "")
  if [[ -z "$deploy_job" ]]; then
    fail_reasons="${fail_reasons}deploy-no-job "
  elif ! wait_job "$deploy_job" "$timeout"; then
    fail_reasons="${fail_reasons}deploy-failed "
    err "deploy failed"
  else
    ok "deploy done"
  fi

  # 6. Stop
  log "  [6/7] stop..."
  if api POST "/api/apps/$app_name/stop" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null | grep -q True; then
    ok "stop ok"
  else
    fail_reasons="${fail_reasons}stop-failed "
    err "stop failed"
  fi
  sleep 3

  # Start
  if api POST "/api/apps/$app_name/start" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null | grep -q True; then
    ok "start ok"
  else
    fail_reasons="${fail_reasons}start-failed "
    err "start failed"
  fi
  sleep 5

  # 7. Logs check
  log "  [7/7] logs..."
  local log_output log_lines
  log_output=$(curl -s -N \
    -H "X-Admin-Password: $ADMIN_PW" \
    "$ADMIN_URL/api/apps/$app_name/logs?lines=5&format=plain" \
    --max-time 5 2>/dev/null || true)
  log_lines=$(echo "$log_output" | grep -c . || true)
  if [[ "$log_lines" -gt 0 ]]; then
    ok "logs reachable ($log_lines lines)"
  else
    fail_reasons="${fail_reasons}logs-empty "
    err "logs returned nothing"
  fi

  # Cleanup
  cleanup_app "$app_name"

  if [[ -n "$fail_reasons" ]]; then
    set_result "$stack" "FAIL: ${fail_reasons% }"
    return 1
  fi
  set_result "$stack" "PASS"
  return 0
}

# ─── Main loop ───────────────────────────────────────────────────────────────
ROUND=1
while true; do
  log "═══════════════════════════════════════════════"
  log " Round $ROUND — testing ${#STACKS[@]} stacks"
  log "═══════════════════════════════════════════════"

  PASS=0; FAIL=0
  FAILED_STACKS=()

  for stack in "${STACKS[@]}"; do
    if test_stack "$stack"; then
      (( PASS++ ))
    else
      (( FAIL++ ))
      FAILED_STACKS+=("$stack")
    fi
    echo ""
  done

  # ─── Round summary ──
  log "═══════ Round $ROUND Summary ═══════"
  for stack in "${STACKS[@]}"; do
    printf "  %-28s %s\n" "$stack" "$(get_result "$stack")"
  done
  log "Passed: $PASS / ${#STACKS[@]}   Failed: $FAIL"

  if (( FAIL == 0 )); then
    log "✓ ALL STACKS PASSED — stopping loop"
    rm -rf "$RESULTS_DIR"
    exit 0
  fi

  log "Retrying in 10 minutes: ${FAILED_STACKS[*]}"
  # Only retry failed stacks
  STACKS=("${FAILED_STACKS[@]}")
  (( ROUND++ ))
  sleep 600
done
