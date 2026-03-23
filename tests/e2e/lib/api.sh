#!/usr/bin/env bash
# lib/api.sh — Admin API wrappers. Requires ADMIN_PW and ADMIN_URL to be set.

ADMIN_PW="${ADMIN_PW:-skagml12!@}"
ADMIN_URL="${ADMIN_URL:-http://localhost:8088}"
GITEA_URL="${GITEA_URL:-http://localhost/git}"
GITEA_USER="${GITEA_USER:-admin}"

_api() { curl -sf -X "$1" -H "X-Admin-Password: $ADMIN_PW" -H "Content-Type: application/json" "${ADMIN_URL}$2" "${@:3}"; }

api_get()    { _api GET    "$1"; }
api_post()   { _api POST   "$1" --data-binary "${2:-\{\}}"; }
api_delete() { _api DELETE "$1" > /dev/null 2>&1 || true; }

gitea_token() { cat ~/.brewnet/gitea-token 2>/dev/null || echo ""; }
gitea_req()   { curl -sf -H "Authorization: token $(gitea_token)" "$@"; }

wait_job() {
  local jid="$1" timeout_s="${2:-120}" elapsed=0
  while (( elapsed < timeout_s )); do
    local status; status=$(api_get "/api/apps/jobs/${jid}" 2>/dev/null | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    [[ "$status" == "done" ]]   && return 0
    [[ "$status" == "failed" ]] && return 1
    sleep 5; elapsed=$(( elapsed + 5 ))
  done
  return 1
}

app_cleanup() {
  local name="$1"
  api_delete "/api/apps/${name}"
  gitea_req -X DELETE "${GITEA_URL}/api/v1/repos/${GITEA_USER}/${name}" > /dev/null 2>&1 || true
}

admin_ready() {
  local timeout_s="${1:-60}" elapsed=0
  while (( elapsed < timeout_s )); do
    local code; code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${ADMIN_URL}" 2>/dev/null || echo "000")
    [[ "$code" == "200" ]] && return 0
    sleep 3; elapsed=$(( elapsed + 3 ))
  done
  return 1
}
