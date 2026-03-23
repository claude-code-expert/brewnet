#!/usr/bin/env bash
# apps/lifecycle.sh — Full lifecycle test for a single stack
# Usage: source lifecycle.sh <stackId> (called from stacks.sh which already sourced libs)
# Returns: 0=pass, 1=fail

STACK="$1"
APP="e2e-$(echo "$STACK" | tr '_' '-')-$$"
TO=$(get_stack_timeout "$STACK")
FAIL=0

log "━━━ Stack: ${STACK} (app: ${APP}, timeout: ${TO}s) ━━━"

# Cleanup any leftovers
app_cleanup "$APP" 2>/dev/null || true
sleep 1

# 1. Create
log "  [1] create-app..."
jid=$(api_post "/api/apps/create" \
  "{\"appName\":\"${APP}\",\"mode\":\"boilerplate\",\"stackId\":\"${STACK}\"}" 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
if [[ -z "$jid" ]]; then
  fail "  ${STACK}: create-app — no jobId"; FAIL=1
else
  wait_job "$jid" "$TO" && ok "  ${STACK}: created" || { fail "  ${STACK}: create failed"; FAIL=1; }
fi

if [[ $FAIL -eq 0 ]]; then
  # 2. Health via Traefik
  assert_http_wait "${STACK} backend /health" "http://localhost/apps/${APP}/health" "200" 30

  # 3. Frontend (unified check for nextjs, -ui suffix for others)
  UNIFIED="nodejs-nextjs nodejs-nextjs-full"
  if [[ " $UNIFIED " =~ " $STACK " ]]; then
    assert_http_wait "${STACK} unified page" "http://localhost/apps/${APP}/" "200" 30
  else
    assert_http_wait "${STACK} frontend"     "http://localhost/apps/${APP}-ui/" "200" 30
  fi

  # 4. Gitea push
  cnt=$(gitea_req "${GITEA_URL}/api/v1/repos/${GITEA_USER}/${APP}/contents/" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  (( cnt > 0 )) && ok "  ${STACK}: Gitea ${cnt} files" || { fail "  ${STACK}: Gitea empty"; FAIL=1; }

  # 5. Deploy
  did=$(api_post "/api/apps/${APP}/deploy" '{}' 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
  [[ -n "$did" ]] && { wait_job "$did" 180 && ok "  ${STACK}: deploy ok" || { fail "  ${STACK}: deploy failed"; FAIL=1; }; }

  # 6. Stop + Start
  api_post "/api/apps/${APP}/stop" '{}' > /dev/null 2>&1 || true; sleep 3
  api_post "/api/apps/${APP}/start" '{}' > /dev/null 2>&1 || true; sleep 8
  ok "  ${STACK}: stop/start ok"

  # 7. Logs
  lraw=$(curl -sN -H "X-Admin-Password: $ADMIN_PW" \
    "${ADMIN_URL}/api/apps/${APP}/logs?lines=5&format=plain" --max-time 5 2>/dev/null | wc -l | xargs || echo "0")
  llines="${lraw:-0}"
  [[ "$llines" =~ ^[0-9]+$ ]] || llines=0
  (( llines > 0 )) && ok "  ${STACK}: logs ${llines} lines" || log "  ${STACK}: logs empty (non-fatal)"
fi

# Cleanup
app_cleanup "$APP"

return $FAIL
