#!/usr/bin/env bash
# test-all-stacks.sh — Test all 16 boilerplate stacks end-to-end
#
# For each stack: create-app → verify containers → verify Gitea push → deploy → stop → start → logs
# Repeats until all pass, then exits 0. Run on the actual homeserver.
#
# Usage:
#   bash scripts/test-all-stacks.sh [--admin-url http://localhost:8088] [--password <pw>]
#
# Env vars (alternative to flags):
#   BREWNET_ADMIN_URL  (default: http://localhost:8088)
#   BREWNET_PASSWORD   (required — admin panel password)
#   GITEA_URL          (default: http://localhost:3000)
#   GITEA_USER         (default: admin)

set -euo pipefail

ADMIN_URL="${BREWNET_ADMIN_URL:-http://localhost:8088}"
ADMIN_PW="${BREWNET_PASSWORD:-}"
GITEA_URL="${GITEA_URL:-http://localhost:3000}"
GITEA_USER="${GITEA_USER:-admin}"
GITEA_PW="${BREWNET_PASSWORD:-}"

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

# Rust/Java/Kotlin need longer timeouts
declare -A HEALTH_TIMEOUT
HEALTH_TIMEOUT[rust-actix-web]=600
HEALTH_TIMEOUT[rust-axum]=600
HEALTH_TIMEOUT[java-springboot]=300
HEALTH_TIMEOUT[java-spring]=300
HEALTH_TIMEOUT[kotlin-ktor]=300
HEALTH_TIMEOUT[kotlin-springboot]=300

get_timeout() {
  local stack="$1"
  echo "${HEALTH_TIMEOUT[$stack]:-120}"
}

# ─── Helpers ────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
declare -A RESULTS

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

wait_job() {
  local job_id="$1" timeout="$2"
  local elapsed=0
  while (( elapsed < timeout )); do
    local status
    status=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
    case "$status" in
      done)    return 0 ;;
      failed)  return 1 ;;
    esac
    sleep 5
    (( elapsed += 5 ))
  done
  return 1  # timeout
}

gitea_has_code() {
  local repo="$1"
  local count
  count=$(curl -sf \
    -u "$GITEA_USER:$GITEA_PW" \
    "$GITEA_URL/api/v1/repos/$GITEA_USER/$repo/contents/" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  (( count > 0 ))
}

cleanup_app() {
  local name="$1"
  api DELETE "/api/apps/$name" 2>/dev/null || true
  curl -sf -u "$GITEA_USER:$GITEA_PW" \
    -X DELETE "$GITEA_URL/api/v1/repos/$GITEA_USER/$name" 2>/dev/null || true
}

# ─── Test a single stack ─────────────────────────────────────────────────────
test_stack() {
  local stack="$1"
  local app_name="test-$(echo "$stack" | tr '_' '-')-$$"
  local timeout
  timeout=$(get_timeout "$stack")
  local errors=()

  log "━━━ Testing $stack (app: $app_name, timeout: ${timeout}s) ━━━"

  # 1. Create app
  log "  [1/6] create-app..."
  local job_id
  job_id=$(api POST "/api/apps/create" \
    --data-binary "{\"appName\":\"$app_name\",\"mode\":\"boilerplate\",\"stackId\":\"$stack\",\"port\":0}" \
    2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])" 2>/dev/null || echo "")

  if [[ -z "$job_id" ]]; then
    errors+=("create-app: failed to get jobId")
    RESULTS[$stack]="FAIL: ${errors[*]}"
    return 1
  fi

  if ! wait_job "$job_id" "$timeout"; then
    local job_err
    job_err=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "unknown")
    errors+=("create-app failed: $job_err")
    cleanup_app "$app_name"
    RESULTS[$stack]="FAIL: ${errors[*]}"
    return 1
  fi
  ok "create-app done"

  # 2. Verify containers running
  log "  [2/6] checking containers..."
  local app_status
  app_status=$(api GET "/api/apps/$app_name" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
  if [[ "$app_status" != "running" ]]; then
    errors+=("containers not running (status=$app_status)")
  else
    ok "containers running"
  fi

  # 3. Verify Gitea source push
  log "  [3/6] checking Gitea source..."
  if ! gitea_has_code "$app_name"; then
    errors+=("Gitea repo is empty — source not pushed")
    err "Gitea repo is empty"
  else
    ok "Gitea source pushed"
  fi

  # 4. Deploy (re-deploy)
  log "  [4/6] deploy..."
  local deploy_job
  deploy_job=$(api POST "/api/apps/$app_name/deploy" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])" 2>/dev/null || echo "")
  if [[ -z "$deploy_job" ]]; then
    errors+=("deploy: failed to start")
  elif ! wait_job "$deploy_job" 180; then
    errors+=("deploy: job failed or timed out")
    err "deploy failed"
  else
    ok "deploy done"
  fi

  # 5. Stop
  log "  [5/6] stop..."
  if api POST "/api/apps/$app_name/stop" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null | grep -q True; then
    ok "stop ok"
  else
    errors+=("stop failed")
    err "stop failed"
  fi
  sleep 3

  # 6. Start + logs check
  log "  [6/6] start + logs..."
  if api POST "/api/apps/$app_name/start" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null | grep -q True; then
    ok "start ok"
  else
    errors+=("start failed")
    err "start failed"
  fi
  sleep 5

  local log_lines
  log_lines=$(curl -sf -N \
    -H "X-Admin-Password: $ADMIN_PW" \
    "$ADMIN_URL/api/apps/$app_name/logs?lines=5&format=plain" \
    --max-time 5 2>/dev/null | wc -l || echo "0")
  if (( log_lines > 0 )); then
    ok "logs reachable ($log_lines lines)"
  else
    errors+=("logs: no output")
    err "logs returned nothing"
  fi

  # Cleanup
  cleanup_app "$app_name"

  if (( ${#errors[@]} > 0 )); then
    RESULTS[$stack]="FAIL: $(IFS=', '; echo "${errors[*]}")"
    return 1
  fi
  RESULTS[$stack]="PASS"
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
    printf "  %-28s %s\n" "$stack" "${RESULTS[$stack]:-SKIP}"
  done
  log "Passed: $PASS / ${#STACKS[@]}   Failed: $FAIL"

  if (( FAIL == 0 )); then
    log "✓ ALL STACKS PASSED — stopping loop"
    exit 0
  fi

  log "Retrying in 10 minutes: ${FAILED_STACKS[*]}"
  # Only retry failed stacks
  STACKS=("${FAILED_STACKS[@]}")
  (( ROUND++ ))
  sleep 600
done
