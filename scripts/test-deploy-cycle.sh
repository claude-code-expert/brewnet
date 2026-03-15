#!/usr/bin/env bash
# scripts/test-deploy-cycle.sh
# 보일러플레이트 → Gitea 레포 생성 → 앱 배포 → 헬스체크 반복 테스트
#
# 사전 조건:
#   - brewnet init 완료 (보일러플레이트 설치됨)
#   - Admin 패널이 ADMIN_PORT 에서 실행 중
#   - Docker 및 Gitea 서비스가 실행 중
#
# 사용법:
#   ./scripts/test-deploy-cycle.sh           # 기본 실행
#   ./scripts/test-deploy-cycle.sh --clean   # 기존 테스트 앱 삭제 후 재실행

set -uo pipefail

ADMIN_PORT=8088
ADMIN_URL="http://localhost:${ADMIN_PORT}"
CLEAN_FIRST=false
for arg in "$@"; do
  case $arg in --clean) CLEAN_FIRST=true ;; esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

ts()   { date '+%H:%M:%S'; }
ok()   { echo -e "${GREEN}  ✔ [$(ts)] $1${NC}"; }
fail() { echo -e "${RED}  ✗ [$(ts)] $1${NC}"; }
info() { echo -e "${BLUE}  ℹ [$(ts)] $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ [$(ts)] $1${NC}"; }
hdr()  { echo -e "\n${CYAN}${BOLD}━━━  $1  ━━━${NC}"; }
divider() { echo -e "  ${DIM}──────────────────────────────────────────${NC}"; }

# ── Helpers ──────────────────────────────────────────────────────────────────
api_get() {
  curl -s --max-time 10 "${ADMIN_URL}${1}" 2>/dev/null
}

api_post() {
  local endpoint="$1"; shift
  curl -s --max-time 10 -X POST \
    -H 'Content-Type: application/json' \
    -d "$1" \
    "${ADMIN_URL}${endpoint}" 2>/dev/null
}

api_delete() {
  curl -s --max-time 10 -X DELETE "${ADMIN_URL}${1}" 2>/dev/null
}

# Poll job until done/failed (max_wait seconds)
wait_job() {
  local job_id="$1" max_wait="${2:-300}" label="${3:-job}"
  local elapsed=0
  while (( elapsed < max_wait )); do
    local resp
    resp=$(api_get "/api/apps/jobs/${job_id}")
    local status
    status=$(echo "$resp" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.status||'unknown')" 2>/dev/null || echo "error")
    if [ "$status" = "done" ]; then
      return 0
    elif [ "$status" = "failed" ]; then
      local err
      err=$(echo "$resp" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.error||'')" 2>/dev/null || echo "")
      echo "$err"
      return 1
    fi
    sleep 5
    (( elapsed += 5 ))
    if (( elapsed % 30 == 0 )); then
      warn "${label}: 대기 중... (${elapsed}s / ${max_wait}s)"
    fi
  done
  echo "timeout after ${max_wait}s"
  return 2
}

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}${BOLD}  ☕ Brewnet Deploy Cycle Test${NC}"
echo -e "  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')  |  Admin: ${ADMIN_URL}${NC}"
divider

# ── STEP 0: Admin 패널 확인 ──────────────────────────────────────────────────
hdr "STEP 0 — Admin 패널 연결 확인"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${ADMIN_URL}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  fail "Admin 패널 응답 없음 (HTTP ${HTTP_CODE}). 먼저 'brewnet admin' 실행 필요."
  exit 1
fi
ok "Admin 패널 HTTP ${HTTP_CODE}"

# ── STEP 1: /api/git/repos 확인 ──────────────────────────────────────────────
hdr "STEP 1 — Gitea 연결 확인"
REPOS_RESP=$(api_get "/api/git/repos")
REPOS_STATUS=$(echo "$REPOS_RESP" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
if(d.repos!==undefined) { console.log('ok:'+d.repos.length); }
else { console.log('fail:'+(d.error||'unknown')); }
" 2>/dev/null || echo "fail:parse-error")

if [[ "$REPOS_STATUS" == ok:* ]]; then
  EXISTING_COUNT="${REPOS_STATUS#ok:}"
  ok "Gitea 연결 OK — 기존 레포: ${EXISTING_COUNT}개"
else
  warn "Gitea 응답: ${REPOS_STATUS#fail:} — 레포 생성 시 실패할 수 있음"
fi

# ── STEP 2: 보일러플레이트 목록 ──────────────────────────────────────────────
hdr "STEP 2 — 설치된 보일러플레이트 목록"
BP_RESP=$(api_get "/api/apps/boilerplates")
BOILERPLATES=$(echo "$BP_RESP" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const bps=d.boilerplates||[];
bps.forEach(bp=>{
  // Prefer explicit port field; fall back to parsing backendUrl (e.g. http://127.0.0.1:3000)
  const port = bp.port || parseInt((bp.backendUrl||'').split(':').pop()||'8080') || 8080;
  console.log(bp.stackId+'|'+bp.appDir+'|'+port+'|'+(bp.lang||'?')+'|'+(bp.frameworkId||'?'));
});
" 2>/dev/null || echo "")

if [ -z "$BOILERPLATES" ]; then
  fail "설치된 보일러플레이트 없음 — brewnet init 먼저 실행 필요"
  exit 1
fi

BP_COUNT=$(echo "$BOILERPLATES" | wc -l | tr -d ' ')
ok "보일러플레이트 ${BP_COUNT}개 발견"
echo "$BOILERPLATES" | while IFS='|' read -r sid _dir port lang fw; do
  echo -e "  ${DIM}  • ${sid} (${lang}/${fw}, port=${port})${NC}"
done

# ── STEP 3: 기존 테스트 앱 정리 ──────────────────────────────────────────────
hdr "STEP 3 — 기존 테스트 앱 정리"
EXISTING_APPS=$(api_get "/api/apps" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const apps=(d.apps||[]).filter(a=>a.name.startsWith('test-'));
apps.forEach(a=>console.log(a.name));
" 2>/dev/null || echo "")

if [ -z "$EXISTING_APPS" ]; then
  info "정리할 테스트 앱 없음"
else
  echo "$EXISTING_APPS" | while read -r appname; do
    info "삭제 중: ${appname}"
    api_delete "/api/apps/${appname}" > /dev/null
    ok "삭제 완료: ${appname}"
  done
fi

# ── STEP 4: 각 보일러플레이트로 앱 생성 → Gitea 레포 → 배포 ─────────────────
hdr "STEP 4 — 보일러플레이트 → 앱 생성 (Gitea + Docker)"

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

while IFS='|' read -r STACK_ID _dir PORT _lang _fw; do
  APP_NAME="test-$(echo "$STACK_ID" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | cut -c1-20)"
  divider
  info "앱 생성 중: ${APP_NAME}  (stack: ${STACK_ID}, port: ${PORT})"

  # Create app
  CREATE_BODY="{\"mode\":\"boilerplate\",\"appName\":\"${APP_NAME}\",\"stackId\":\"${STACK_ID}\",\"port\":${PORT}}"
  CREATE_RESP=$(api_post "/api/apps/create" "$CREATE_BODY")
  JOB_ID=$(echo "$CREATE_RESP" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
process.stdout.write(d.jobId||'');
" 2>/dev/null || echo "")

  if [ -z "$JOB_ID" ]; then
    fail "${APP_NAME}: 잡 생성 실패 — 응답: ${CREATE_RESP}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    RESULTS+=("❌ ${APP_NAME} (${STACK_ID}) — job create failed")
    continue
  fi
  info "${APP_NAME}: Job ID = ${JOB_ID}"

  # Poll job (max 600s for Rust builds)
  JOB_ERR=$(wait_job "$JOB_ID" 600 "$APP_NAME")
  JOB_EXIT=$?

  if [ $JOB_EXIT -eq 0 ]; then
    # Verify health
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo "ERR")

    # Verify Gitea repo was created
    REPO_CHECK=$(api_get "/api/git/repos" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const found=(d.repos||[]).some(r=>r.name==='${APP_NAME}');
console.log(found?'yes':'no');
" 2>/dev/null || echo "no")

    if [ "$HEALTH" = "200" ] && [ "$REPO_CHECK" = "yes" ]; then
      ok "${APP_NAME}: ✅ 배포 완료 (health=${HEALTH}, gitea=✅)"
      PASS_COUNT=$(( PASS_COUNT + 1 ))
      RESULTS+=("✅ ${APP_NAME} (${STACK_ID}) — health=${HEALTH}, gitea=OK")
    elif [ "$HEALTH" = "200" ]; then
      warn "${APP_NAME}: health=✅ 200, gitea 레포 확인 실패"
      PASS_COUNT=$(( PASS_COUNT + 1 ))
      RESULTS+=("⚠  ${APP_NAME} (${STACK_ID}) — health=200, gitea=MISSING")
    else
      fail "${APP_NAME}: health=${HEALTH}, gitea=${REPO_CHECK}"
      FAIL_COUNT=$(( FAIL_COUNT + 1 ))
      RESULTS+=("❌ ${APP_NAME} (${STACK_ID}) — health=${HEALTH}, gitea=${REPO_CHECK}")
    fi
  elif [ $JOB_EXIT -eq 2 ]; then
    fail "${APP_NAME}: 타임아웃 (600s)"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    RESULTS+=("❌ ${APP_NAME} (${STACK_ID}) — timeout")
  else
    fail "${APP_NAME}: 잡 실패 — ${JOB_ERR}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    RESULTS+=("❌ ${APP_NAME} (${STACK_ID}) — ${JOB_ERR}")
  fi

done <<< "$BOILERPLATES"

# ── SUMMARY ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ═══ Deploy Cycle 결과 ═══${NC}"
echo -e "  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
for r in "${RESULTS[@]}"; do
  echo -e "    ${r}"
done
echo ""
echo -e "  통과: ${GREEN}${BOLD}${PASS_COUNT}${NC}  실패: ${RED}${BOLD}${FAIL_COUNT}${NC}  전체: $((PASS_COUNT + FAIL_COUNT))"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
  ok "✅ 전체 Deploy Cycle 통과"
  exit 0
else
  fail "❌ ${FAIL_COUNT}개 스택 실패"
  exit 1
fi
