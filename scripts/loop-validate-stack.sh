#!/usr/bin/env bash
# loop-validate-stack.sh — 20-minute cron: validate one boilerplate stack per cycle
#
# State file: ~/.brewnet/loop-state.json
# Report:     <brewnet-root>/docs/reports/boilerplate-validation-report.md
#
# Prints "ALL_STACKS_VALIDATED" and exits 0 when every stack has passed.
# All other exits: 0 (cycle complete), 1 (config/setup error).
#
# Usage:
#   bash scripts/loop-validate-stack.sh [--admin-url URL] [--password PW]
# Env vars:
#   BREWNET_PASSWORD   Admin panel password (default: reads from e2e test default)
#   BREWNET_ADMIN_URL  (default: http://localhost:8088)
#   GITEA_URL          (default: http://localhost/git)
#   GITEA_USER         (default: admin)
#   TRAEFIK_URL        (default: http://localhost)
#
# Compatible with bash 3.2+ (macOS default — no associative arrays, no declare -A).
# NOTE: We deliberately avoid set -e due to bash 3.2 quirk where
#       VAR=$(failing_cmd) triggers exit even in assignment context.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BREWNET_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$HOME/.brewnet/loop-state.json"
REPORT_FILE="$BREWNET_DIR/docs/reports/boilerplate-validation-report.md"

ADMIN_URL="${BREWNET_ADMIN_URL:-http://localhost:8088}"
ADMIN_PW="${BREWNET_PASSWORD:-skagml12!@}"
GITEA_URL="${GITEA_URL:-http://localhost/git}"
GITEA_USER="${GITEA_USER:-admin}"
GITEA_PW="$ADMIN_PW"
GITEA_TOKEN="$(cat "$HOME/.brewnet/gitea-token" 2>/dev/null || echo '')"
TRAEFIK_URL="${TRAEFIK_URL:-http://localhost}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --admin-url) ADMIN_URL="$2"; shift 2 ;;
    --password)  ADMIN_PW="$2"; GITEA_PW="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$REPORT_FILE")"

# ─── Stack list ───────────────────────────────────────────────────────────────
ALL_STACKS=(
  go-gin go-echo go-fiber
  rust-actix-web rust-axum
  java-springboot java-spring
  kotlin-ktor kotlin-springboot
  nodejs-express nodejs-nestjs nodejs-nextjs nodejs-nextjs-full
  python-fastapi python-django python-flask
)

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { log "  ✓ $*"; }
err()  { log "  ✗ $*"; }

is_unified() { [[ "$1" == "nodejs-nextjs" || "$1" == "nodejs-nextjs-full" ]]; }

get_timeout() {
  case "$1" in
    rust-actix-web|rust-axum)      echo 600 ;;
    java-springboot|java-spring)   echo 300 ;;
    kotlin-ktor|kotlin-springboot) echo 300 ;;
    *)                             echo 120 ;;
  esac
}

api() {
  local method="$1" path="$2"; shift 2
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
  local job_id="$1" timeout_s="$2" elapsed=0 status=""
  while (( elapsed < timeout_s )); do
    status=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
    [[ "$status" == "done" ]]   && return 0
    [[ "$status" == "failed" ]] && return 1
    sleep 5; (( elapsed += 5 ))
  done
  return 1
}

http_code() { curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "$1" 2>/dev/null || echo "000"; }

wait_http_200() {
  local url="$1" timeout_s="${2:-30}" elapsed=0
  while (( elapsed < timeout_s )); do
    [[ "$(http_code "$url")" == "200" ]] && return 0
    sleep 5; (( elapsed += 5 ))
  done
  return 1
}

gitea_has_code() {
  local count
  count=$(gitea_curl "$GITEA_URL/api/v1/repos/$GITEA_USER/$1/contents/" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  (( count > 0 ))
}

cleanup_app() {
  api DELETE "/api/apps/$1" --data-binary '{}' 2>/dev/null || true
  gitea_curl -X DELETE "$GITEA_URL/api/v1/repos/$GITEA_USER/$1" 2>/dev/null || true
}

# ─── State management ────────────────────────────────────────────────────────
# All state ops use python3 so JSON stays consistent.

state_init() {
  python3 - "$STATE_FILE" "${ALL_STACKS[@]}" <<'PYEOF'
import json, sys, datetime
path = sys.argv[1]
stacks = list(sys.argv[2:])
state = {
    "round": 1,
    "pending": stacks,
    "passed": [],
    "failed": [],
    "allPassed": [],
    "startedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
}
with open(path, "w") as f:
    json.dump(state, f, indent=2)
print("State initialized: %d stacks pending" % len(stacks))
PYEOF
}

state_get() {
  # state_get FIELD  →  prints value (int or json list as space-separated strings)
  python3 - "$STATE_FILE" "$1" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f: d = json.load(f)
field = sys.argv[2]
val = d.get(field)
if isinstance(val, list):
    print(len(val))
else:
    print(int(val) if val is not None else 0)
PYEOF
}

state_get_list() {
  # state_get_list FIELD  →  space-separated items
  python3 - "$STATE_FILE" "$1" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f: d = json.load(f)
print(" ".join(d.get(sys.argv[2], [])))
PYEOF
}

state_next_pending() {
  python3 - "$STATE_FILE" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f: d = json.load(f)
pending = d.get("pending", [])
print(pending[0] if pending else "")
PYEOF
}

state_pop_pending() {
  # Pops and prints the first pending stack; updates state file
  python3 - "$STATE_FILE" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f: d = json.load(f)
pending = d.get("pending", [])
if not pending:
    sys.exit(1)
stack = pending[0]
d["pending"] = pending[1:]
with open(path, "w") as f:
    json.dump(d, f, indent=2)
print(stack, end="")
PYEOF
}

state_mark_passed() {
  python3 - "$STATE_FILE" "$1" <<'PYEOF'
import json, sys
path, stack = sys.argv[1], sys.argv[2]
with open(path) as f: d = json.load(f)
d.setdefault("passed", []).append(stack)
d.setdefault("allPassed", []).append(stack)
with open(path, "w") as f:
    json.dump(d, f, indent=2)
PYEOF
}

state_mark_failed() {
  python3 - "$STATE_FILE" "$1" <<'PYEOF'
import json, sys
path, stack = sys.argv[1], sys.argv[2]
with open(path) as f: d = json.load(f)
d.setdefault("failed", []).append(stack)
with open(path, "w") as f:
    json.dump(d, f, indent=2)
PYEOF
}

state_advance_round() {
  python3 - "$STATE_FILE" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f: d = json.load(f)
d["pending"] = d.get("failed", [])
d["failed"] = []
d["passed"] = []
d["round"] = d.get("round", 1) + 1
with open(path, "w") as f:
    json.dump(d, f, indent=2)
PYEOF
}

# ─── Report helpers ───────────────────────────────────────────────────────────
report_header() {
  [[ -f "$REPORT_FILE" ]] && return
  {
    echo "# Boilerplate Validation Report"
    echo ""
    echo "> Auto-generated by \`scripts/loop-validate-stack.sh\`"
    echo "> Started: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "> Stacks: ${#ALL_STACKS[@]} (go×3, rust×2, java×2, kotlin×2, nodejs×4, python×3)"
    echo ""
    echo "---"
    echo ""
  } > "$REPORT_FILE"
}

report_pass() {
  local stack="$1" round="$2" dur="$3"
  {
    echo "## ✅ ${stack} — Round ${round} — $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "- **Result**: PASS"
    echo "- **Duration**: ${dur}s"
    echo "- **Steps verified**: create → health → frontend → gitea → deploy → stop/start"
    echo ""
    echo "---"
    echo ""
  } >> "$REPORT_FILE"
}

report_fail() {
  local stack="$1" round="$2" reasons="$3"
  {
    echo "## ❌ ${stack} — Round ${round} — $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "- **Result**: FAIL"
    echo "- **Failed steps**: \`${reasons}\`"
    echo ""
    echo "### Failure Analysis"
    echo ""
  } >> "$REPORT_FILE"

  for reason in $reasons; do
    case "$reason" in
      create-no-job)
        echo "- **[create-app]** Admin API returned no jobId. Check admin server is running: \`curl -sf -H 'X-Admin-Password: PW' $ADMIN_URL/api/apps\`" >> "$REPORT_FILE" ;;
      create-failed:*)
        local detail="${reason#create-failed:}"
        echo "- **[create-app]** Job failed: \`${detail//_/ }\`. Check Docker build logs and available disk/memory." >> "$REPORT_FILE" ;;
      containers:*)
        local st="${reason#containers:}"
        echo "- **[containers]** Expected \`running\`, got \`${st}\`. Run \`docker ps -a\` and \`docker logs <container>\`." >> "$REPORT_FILE" ;;
      backend-health:*)
        local code="${reason#backend-health:}"
        echo "- **[backend-health]** \`GET /apps/${stack}/health\` via Traefik → HTTP ${code}. Check: app health endpoint, Traefik PathPrefix label, container started." >> "$REPORT_FILE" ;;
      unified-page:*)
        local code="${reason#unified-page:}"
        echo "- **[unified-page]** Next.js page \`/apps/${stack}\` → HTTP ${code}. Check: \`basePath\` in next.config.js, Traefik noStrip label." >> "$REPORT_FILE" ;;
      frontend:*)
        local code="${reason#frontend:}"
        echo "- **[frontend]** \`/apps/${stack}-ui/\` → HTTP ${code}. Check: React build output, Traefik trailing-slash redirect middleware." >> "$REPORT_FILE" ;;
      gitea-empty)
        echo "- **[gitea]** Repo exists but 0 files. Git push during create-app likely failed. Check: \`~/.brewnet/gitea-token\`, SSH key in project DB, Gitea accessibility." >> "$REPORT_FILE" ;;
      deploy-no-job)
        echo "- **[deploy]** \`POST /api/apps/${stack}/deploy\` returned no jobId. App may not be in runnable state." >> "$REPORT_FILE" ;;
      deploy-failed)
        echo "- **[deploy]** Re-deploy job failed. Check Docker build output. Try: \`docker system prune -f\` if disk is full." >> "$REPORT_FILE" ;;
      stop-failed)
        echo "- **[stop]** \`POST /api/apps/${stack}/stop\` failed. Container may have already crashed." >> "$REPORT_FILE" ;;
      start-failed)
        echo "- **[start]** \`POST /api/apps/${stack}/start\` failed. Possible port conflict after stop." >> "$REPORT_FILE" ;;
      *)
        echo "- **[unknown]** \`${reason}\` — manual inspection required." >> "$REPORT_FILE" ;;
    esac
  done

  {
    echo ""
    echo "---"
    echo ""
  } >> "$REPORT_FILE"
}

report_jest() {
  local stack="$1" status="$2" output="$3"
  {
    echo "### Jest after ${stack}: ${status}"
    echo ""
    echo "\`\`\`"
    echo "$output"
    echo "\`\`\`"
    echo ""
  } >> "$REPORT_FILE"
}

report_all_done() {
  local round="$1" all_passed="$2"
  {
    echo "---"
    echo ""
    echo "## 🎉 ALL STACKS VALIDATED"
    echo ""
    echo "- **Completed**: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "- **Total rounds**: ${round}"
    echo "- **All passed**: ${all_passed}"
    echo ""
  } >> "$REPORT_FILE"
}

# ─── Single stack lifecycle test ─────────────────────────────────────────────
# Outputs: "duration:N" on success, "reason1 reason2 ..." on failure
# Returns: 0=pass, 1=fail
# NOTE: Caller must NOT have set -e active when capturing output of this function.
test_stack() {
  local stack="$1"
  local app_name="val-$(echo "$stack" | tr '_' '-')-$$"
  local timeout fail_reasons="" start_ts end_ts job_id app_status code deploy_job
  timeout=$(get_timeout "$stack")
  start_ts=$(date +%s)

  log "━━━ Testing: $stack  (app=$app_name  timeout=${timeout}s) ━━━"
  cleanup_app "$app_name" 2>/dev/null || true

  # [1/7] create-app
  log "  [1/7] create-app..."
  job_id=$(api POST "/api/apps/create" \
    --data-binary "{\"appName\":\"$app_name\",\"mode\":\"boilerplate\",\"stackId\":\"$stack\"}" 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")

  if [[ -z "$job_id" ]]; then
    cleanup_app "$app_name" 2>/dev/null || true
    echo "create-no-job"
    return 1
  fi

  if ! wait_job "$job_id" "$timeout"; then
    local job_err
    job_err=$(api GET "/api/apps/jobs/$job_id" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown')[:80].replace(' ','_'))" 2>/dev/null || echo "unknown")
    cleanup_app "$app_name" 2>/dev/null || true
    echo "create-failed:${job_err}"
    return 1
  fi
  ok "create-app done (job=$job_id)"

  # [2/7] container status
  log "  [2/7] container status..."
  app_status=$(api GET "/api/apps/$app_name" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); a=d.get('app',d); print(a.get('status','unknown'))" 2>/dev/null || echo "unknown")
  if [[ "$app_status" != "running" ]]; then
    fail_reasons="${fail_reasons} containers:${app_status}"
    err "containers: $app_status"
  else
    ok "containers running"
  fi

  # [3/7] backend health via Traefik
  log "  [3/7] backend /health..."
  if wait_http_200 "${TRAEFIK_URL}/apps/${app_name}/health" 60; then
    ok "backend /health → 200"
  else
    code=$(http_code "${TRAEFIK_URL}/apps/${app_name}/health")
    fail_reasons="${fail_reasons} backend-health:${code}"
    err "backend /health → $code"
  fi

  # [4/7] frontend
  log "  [4/7] frontend..."
  if is_unified "$stack"; then
    if wait_http_200 "${TRAEFIK_URL}/apps/${app_name}" 30; then
      ok "unified page → 200"
    else
      code=$(http_code "${TRAEFIK_URL}/apps/${app_name}")
      fail_reasons="${fail_reasons} unified-page:${code}"
      err "unified page → $code"
    fi
  else
    if wait_http_200 "${TRAEFIK_URL}/apps/${app_name}-ui/" 30; then
      ok "frontend → 200"
    else
      code=$(http_code "${TRAEFIK_URL}/apps/${app_name}-ui/")
      fail_reasons="${fail_reasons} frontend:${code}"
      err "frontend → $code"
    fi
  fi

  # [5/7] Gitea source push
  log "  [5/7] Gitea source..."
  if gitea_has_code "$app_name"; then
    ok "Gitea repo has files"
  else
    fail_reasons="${fail_reasons} gitea-empty"
    err "Gitea repo empty"
  fi

  # [6/7] deploy
  log "  [6/7] deploy..."
  deploy_job=$(api POST "/api/apps/$app_name/deploy" --data-binary '{}' 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
  if [[ -z "$deploy_job" ]]; then
    fail_reasons="${fail_reasons} deploy-no-job"
    err "deploy: no jobId"
  elif ! wait_job "$deploy_job" "$timeout"; then
    fail_reasons="${fail_reasons} deploy-failed"
    err "deploy failed"
  else
    ok "deploy done"
  fi

  # [7/7] stop → start
  log "  [7/7] stop / start..."
  if api POST "/api/apps/$app_name/stop" --data-binary '{}' 2>/dev/null | \
    python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
    ok "stop ok"
  else
    fail_reasons="${fail_reasons} stop-failed"
    err "stop failed"
  fi
  sleep 3
  if api POST "/api/apps/$app_name/start" --data-binary '{}' 2>/dev/null | \
    python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
    ok "start ok"
  else
    fail_reasons="${fail_reasons} start-failed"
    err "start failed"
  fi

  cleanup_app "$app_name" 2>/dev/null || true

  end_ts=$(date +%s)
  fail_reasons="${fail_reasons# }"  # trim leading space

  if [[ -n "$fail_reasons" ]]; then
    echo "$fail_reasons"
    return 1
  fi
  echo "duration:$(( end_ts - start_ts ))"
  return 0
}

# ─── Jest runner ──────────────────────────────────────────────────────────────
run_jest() {
  local stack="$1" output="" jest_exit=0
  log "Running Jest unit tests (post-validation for $stack)..."
  output=$(cd "$BREWNET_DIR" && \
    NODE_OPTIONS='--experimental-vm-modules' \
    pnpm --filter @brewnet/cli test --passWithNoTests 2>&1 | tail -15) || jest_exit=$?
  if [[ $jest_exit -eq 0 ]]; then
    ok "Jest passed"
    report_jest "$stack" "PASS" "$output"
  else
    err "Jest failed — non-blocking (source code issue, not stack issue)"
    report_jest "$stack" "FAIL (non-blocking)" "$output"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
report_header

# Init state if missing
if [[ ! -f "$STATE_FILE" ]]; then
  state_init
fi

ROUND=$(state_get "round")
PENDING_COUNT=$(state_get "pending")

# If pending exhausted from previous cycle, check round transition
if [[ "$PENDING_COUNT" -eq 0 ]]; then
  FAILED_COUNT=$(state_get "failed")
  if [[ "$FAILED_COUNT" -eq 0 ]]; then
    log "✓ ALL_STACKS_VALIDATED — all ${#ALL_STACKS[@]} stacks passed!"
    echo ""
    echo "ALL_STACKS_VALIDATED"
    exit 0
  fi
  log "Round $ROUND exhausted — $FAILED_COUNT stacks failed. Starting round $(( ROUND + 1 ))..."
  state_advance_round
  ROUND=$(state_get "round")
  PENDING_COUNT=$(state_get "pending")
fi

# Pop next stack
STACK=$(state_pop_pending 2>/dev/null || echo "")
if [[ -z "$STACK" ]]; then
  log "ERROR: no stack to test (state may be corrupted — delete $STATE_FILE to reset)"
  exit 1
fi

log ""
log "Round $ROUND | Testing: $STACK | Remaining after: $(( PENDING_COUNT - 1 )) stacks"
log ""

# Run test — temporarily disable set -e to capture both output and exit code
# (bash 3.2 on macOS triggers set -e even for VAR=$(cmd) assignments)
RESULT="" STATUS=0
RESULT=$(test_stack "$STACK" 2>&1) || STATUS=$?

if [[ $STATUS -eq 0 ]]; then
  DURATION=$(echo "$RESULT" | grep -o 'duration:[0-9]*' | cut -d: -f2 || echo "0")
  log ""
  ok "$STACK  PASSED in ${DURATION}s"
  echo "$RESULT"
  state_mark_passed "$STACK"
  report_pass "$STACK" "$ROUND" "$DURATION"
  run_jest "$STACK"
else
  log ""
  err "$STACK  FAILED"
  echo "$RESULT"
  state_mark_failed "$STACK"
  # Extract just the reason lines (skip log lines that start with '[')
  REASONS=$(echo "$RESULT" | grep -v '^\[' | head -1 || echo "unknown")
  report_fail "$STACK" "$ROUND" "$REASONS"
fi

# Check if round is complete
NEW_PENDING=$(state_get "pending")
if [[ "$NEW_PENDING" -eq 0 ]]; then
  NEW_FAILED=$(state_get "failed")
  if [[ "$NEW_FAILED" -eq 0 ]]; then
    log ""
    log "All stacks in round $ROUND passed!"
    report_all_done "$ROUND" "$(state_get_list "allPassed")"
    echo ""
    echo "ALL_STACKS_VALIDATED"
    exit 0
  else
    log ""
    log "Round $ROUND done — $NEW_FAILED stacks failed, queued for round $(( ROUND + 1 ))"
    state_advance_round
  fi
else
  NEXT=$(state_next_pending)
  log ""
  log "Next stack: $NEXT ($(( NEW_PENDING )) remaining)"
fi

log "State: $STATE_FILE"
log "Report: $REPORT_FILE"
exit 0
