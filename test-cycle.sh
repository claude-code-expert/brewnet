#!/usr/bin/env bash
# test-cycle.sh — Full brewnet test cycle with per-step logging
# Usage:
#   ./test-cycle.sh                  # 완전 자동 (non-interactive)
#   ./test-cycle.sh --interactive    # 반자동 (Enter로 확인)
#   ./test-cycle.sh --skip-build     # 빌드 건너뜀
#   ./test-cycle.sh --skip-uninstall # 언인스톨 건너뜀

set -euo pipefail
IFS=$'\n\t'

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BREWNET=(node "${REPO_DIR}/packages/cli/dist/index.js")
CONFIG_BACKUP="/tmp/brewnet-test-config.json"
SELECTIONS="$HOME/.brewnet/projects/my-homeserver/selections.json"
ADMIN_PORT=8088
HEARTBEAT_INTERVAL=5  # seconds of silence before printing "⏳ 대기 중"

# ── Flags ────────────────────────────────────────────────────────────────────
INTERACTIVE=false
SKIP_BUILD=false
SKIP_UNINSTALL=false
for arg in "$@"; do
  case $arg in
    --interactive)     INTERACTIVE=true  ;;
    --skip-build)      SKIP_BUILD=true   ;;
    --skip-uninstall)  SKIP_UNINSTALL=true ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; MAGENTA='\033[0;35m'
DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

# ── Logging helpers ──────────────────────────────────────────────────────────
ts()     { date '+%H:%M:%S'; }
hdr()    { echo -e "\n${CYAN}${BOLD}━━━  $1  ━━━${NC}"; }
ok()     { echo -e "${GREEN}  ✔ [$(ts)] $1${NC}"; }
fail()   { echo -e "${RED}  ✗ [$(ts)] $1${NC}"; }
info()   { echo -e "${BLUE}  ℹ [$(ts)] $1${NC}"; }
wait_()  { echo -e "${YELLOW}  ⏳ [$(ts)] $1${NC}"; }
label()  { echo -e "${MAGENTA}${BOLD}  $1${NC}"; }
sub()    { echo -e "  ${DIM}$1${NC}"; }
divider(){ echo -e "  ${DIM}──────────────────────────────────────────${NC}"; }

# ── Heartbeat (background process) ───────────────────────────────────────────
# Shared file: last line timestamp
LAST_LINE_FILE=$(mktemp)
HB_PID=""

start_heartbeat() {
  echo "$(date +%s)" > "$LAST_LINE_FILE"
  (
    while true; do
      sleep "$HEARTBEAT_INTERVAL"
      [ -f "$LAST_LINE_FILE" ] || break
      LAST=$(cat "$LAST_LINE_FILE" 2>/dev/null || echo 0)
      NOW=$(date +%s)
      ELAPSED=$(( NOW - LAST ))
      if (( ELAPSED >= HEARTBEAT_INTERVAL )); then
        echo -e "${YELLOW}  ⏳ [$(ts)] 처리 중... (${ELAPSED}초째 응답 없음)${NC}" >&2
      fi
    done
  ) &
  HB_PID=$!
}

stop_heartbeat() {
  if [ -n "$HB_PID" ]; then
    kill "$HB_PID" 2>/dev/null || true
    wait "$HB_PID" 2>/dev/null || true
    HB_PID=""
  fi
  rm -f "$LAST_LINE_FILE"
}

# ── Line colorizer ────────────────────────────────────────────────────────────
# Applies color to a single line based on content patterns.
colorize_line() {
  local raw="$1"
  local stripped
  # Strip ANSI codes to match content
  stripped="$(echo "$raw" | sed 's/\x1b\[[0-9;]*m//g')"

  local prefix="  [$(ts)] "

  # Step transitions
  if echo "$stripped" | grep -qE 'Step [0-9]+/[0-9]+ —|Step [0-9]+/[0-9]+ -'; then
    echo -e "${CYAN}${BOLD}${prefix}${stripped}${NC}"
    return
  fi
  # Success indicators
  if echo "$stripped" | grep -qE '^[ ]*[✔✓✅]|succeed|complete|성공|완료|running|healthy|generated|pulled|started|created'; then
    echo -e "${GREEN}${prefix}${stripped}${NC}"
    return
  fi
  # Error / failure indicators
  if echo "$stripped" | grep -qE '^[ ]*[✗✘❌]|fail|error|Error|오류|failed'; then
    echo -e "${RED}${prefix}${stripped}${NC}"
    return
  fi
  # Warning / waiting indicators
  if echo "$stripped" | grep -qE 'pull|Pull|Starting|Waiting|health|Health|대기|checking|Checking|timeout|Timeout'; then
    echo -e "${YELLOW}${prefix}${stripped}${NC}"
    return
  fi
  # Dim for purely decorative lines
  if echo "$stripped" | grep -qE '^[ ]*$|^[ ]*[─━=]+[ ]*$'; then
    echo -e "${DIM}${prefix}${stripped}${NC}"
    return
  fi
  # Default
  echo -e "${DIM}${prefix}${NC}${stripped}"
}

# ── Streamed command runner ───────────────────────────────────────────────────
# Runs a command, timestamps every output line, starts heartbeat.
# Returns exit code of the command.
run_streamed() {
  local EXIT_CODE=0
  start_heartbeat

  # We pipe through a while-read loop to timestamp each line.
  # Subshell exit code captured via PIPESTATUS.
  set +e
  "$@" 2>&1 | while IFS= read -r line || [[ -n "$line" ]]; do
    echo "$(date +%s)" > "$LAST_LINE_FILE"
    colorize_line "$line"
  done
  # PIPESTATUS[0] = exit code of the command before the pipe
  EXIT_CODE="${PIPESTATUS[0]}"
  set -e

  stop_heartbeat
  return "${EXIT_CODE:-0}"
}

# ── Config summary display ────────────────────────────────────────────────────
show_config_summary() {
  local cfg="$1"

  echo ""
  label "═══ 설치 계획 (Wizard Steps Preview) ═══"
  echo ""

  node - "$cfg" <<'NODE_EOF'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const s = cfg.servers;
const CYAN='\x1b[36m', GREEN='\x1b[32m', DIM='\x1b[2m', BOLD='\x1b[1m', NC='\x1b[0m', YELLOW='\x1b[33m', RED='\x1b[31m';

function row(step, name, items) {
  console.log(`  ${CYAN}${BOLD}[${step}]${NC} ${BOLD}${name}${NC}`);
  items.forEach(([k, v, ok]) => {
    const icon = ok === false ? `${RED}✗${NC}` : `${GREEN}✔${NC}`;
    console.log(`       ${icon}  ${DIM}${k}:${NC} ${v}`);
  });
  console.log('');
}

// Pre-Step: Admin Setup
row('Pre', 'Admin Setup', [
  ['username', cfg.admin.username, true],
  ['password', cfg.admin.password ? '●●●●●●●● (set)' : '(empty — will be generated)', !!cfg.admin.password],
  ['storage',  cfg.admin.storage,  true],
]);

// Step 0: System Check (automatic)
console.log(`  ${CYAN}${BOLD}[0]${NC} ${BOLD}System Check${NC}`);
console.log(`       ${GREEN}✔${NC}  ${DIM}(자동 실행 — OS / Docker / 포트 / 디스크 확인)${NC}`);
console.log('');

// Step 1: Project Setup
row('1', 'Project Setup', [
  ['name',  cfg.projectName,  true],
  ['path',  cfg.projectPath,  true],
  ['type',  cfg.setupType,    true],
]);

// Step 2: Server Components
const svcMap = {
  webServer:   `웹 서버   → ${s.webServer?.service  || '—'}`,
  fileServer:  `파일 서버  → ${s.fileServer?.service || '—'}`,
  gitServer:   `Git 서버  → ${s.gitServer?.service  || '—'} (포트 ${s.gitServer?.port || 3000})`,
  dbServer:    `DB 서버   → ${s.dbServer?.primary   || '—'} ${s.dbServer?.primaryVersion || ''} + ${s.dbServer?.cache || '—'}`,
  media:       `미디어 서버 → ${(s.media?.services || []).join(', ') || '—'}`,
  sshServer:   `SSH 서버  → 포트 ${s.sshServer?.port || 2222}`,
  mailServer:  `메일 서버  → ${s.mailServer?.service || '—'}`,
  appServer:   `앱 서버   → (boilerplate 활성화)`,
  fileBrowser: `파일 브라우저 → ${s.fileBrowser?.mode || '—'}`,
};
const svcItems = Object.entries(svcMap).map(([k, label]) => {
  const enabled = s[k]?.enabled ?? false;
  return [label, enabled ? 'enabled' : 'disabled', enabled];
});
row('2', 'Server Components', svcItems);

// Step 3: Dev Stack
const langs = cfg.devStack.languages;
const devItems = langs.length === 0
  ? [['선택 없음', '(appServer disabled)', false]]
  : langs.map(lang => [
      lang,
      `프레임워크: ${cfg.devStack.frameworks[lang] || '(없음)'}`,
      true,
    ]);
devItems.push(['boilerplate', cfg.boilerplate.generate ? 'generate' : 'skip', cfg.boilerplate.generate]);
devItems.push(['devMode', cfg.boilerplate.devMode, true]);
row('3', 'Dev Stack & Runtime', devItems);

// Step 4: Domain & Network
const d = cfg.domain;
row('4', 'Domain & Network', [
  ['provider',    d.provider,                                  true],
  ['domain name', d.name,                                      true],
  ['SSL',         d.ssl,                                       true],
  ['cloudflare',  d.cloudflare?.enabled ? `tunnelMode=${d.cloudflare.tunnelMode}` : 'disabled', true],
]);

// Step 5: Review → auto-confirmed in non-interactive
console.log(`  ${CYAN}${BOLD}[5]${NC} ${BOLD}Review & Confirm${NC}`);
console.log(`       ${GREEN}✔${NC}  ${DIM}(non-interactive 모드: 자동 확인)${NC}`);
console.log('');

// Step 6: Generate (what will run)
console.log(`  ${CYAN}${BOLD}[6]${NC} ${BOLD}Generate & Start${NC}`);
console.log(`       ${DIM}→ docker-compose.yml 생성${NC}`);
console.log(`       ${DIM}→ .env + secret 파일 생성${NC}`);
console.log(`       ${DIM}→ Docker 이미지 Pull (시간 소요)${NC}`);
console.log(`       ${DIM}→ 컨테이너 시작 (docker compose up -d)${NC}`);
console.log(`       ${DIM}→ Health check 대기${NC}`);
if (cfg.boilerplate.generate && langs.length > 0) {
  console.log(`       ${DIM}→ 보일러플레이트 클론: ${langs.map(l => `${l}/${cfg.devStack.frameworks[l]||''}`).join(', ')}${NC}`);
}
console.log('');

// Step 7: Complete
console.log(`  ${CYAN}${BOLD}[7]${NC} ${BOLD}Complete${NC}`);
console.log(`       ${DIM}→ 서비스 URL 요약 + Admin 패널 오픈${NC}`);
console.log('');
NODE_EOF
}

# ── Step gate ─────────────────────────────────────────────────────────────────
# Prints a step banner and checks if previous step succeeded.
CURRENT_STEP=0
step_start() {
  local num="$1"; shift
  local name="$*"
  CURRENT_STEP=$num
  hdr "STEP ${num} — ${name}"
}

step_done() {
  ok "Step ${CURRENT_STEP} 완료 → 다음 단계로 진입"
  divider
}

step_skipped() {
  info "Step ${CURRENT_STEP} 건너뜀 (flag 설정됨) → 다음 단계로 진입"
  divider
}

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}${BOLD}  ☕ Brewnet Test Cycle${NC}"
echo -e "  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')  |  Repo: ${REPO_DIR}${NC}"
echo -e "  ${DIM}Flags → interactive=${INTERACTIVE} skip-build=${SKIP_BUILD} skip-uninstall=${SKIP_UNINSTALL}${NC}"
divider

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 0: Config backup
# ─────────────────────────────────────────────────────────────────────────────
step_start 0 "Config 백업"

if [ -f "$SELECTIONS" ]; then
  cp "$SELECTIONS" "$CONFIG_BACKUP"
  ok "selections.json → ${CONFIG_BACKUP}"
else
  warn() { echo -e "${YELLOW}  ⚠ [$(ts)] $1${NC}"; }
  warn "기존 selections.json 없음 → full-install 기본값 사용"
  cat > "$CONFIG_BACKUP" <<'JSON'
{
  "schemaVersion": 7,
  "projectName": "my-homeserver",
  "projectPath": "~/brewnet/my-homeserver",
  "setupType": "full",
  "admin": { "username": "admin", "password": "skagml12!@", "storage": "local" },
  "servers": {
    "webServer":  { "enabled": true,  "service": "traefik" },
    "fileServer": { "enabled": true,  "service": "nextcloud" },
    "gitServer":  { "enabled": true,  "service": "gitea", "port": 3000, "sshPort": 3022 },
    "dbServer": {
      "enabled": true, "primary": "postgresql", "primaryVersion": "17",
      "dbName": "brewnet_db", "dbUser": "brewnet", "dbPassword": "",
      "adminUI": true, "pgadminEmail": "brewnet.dev@gmail.com", "cache": "redis"
    },
    "media":       { "enabled": true,  "services": ["jellyfin"] },
    "sshServer":   { "enabled": true,  "port": 2222, "passwordAuth": true, "sftp": true },
    "mailServer":  { "enabled": false, "service": "docker-mailserver",
                     "port25Blocked": false, "relayProvider": "", "relayHost": "",
                     "relayPort": 587, "relayUser": "", "relayPassword": "" },
    "appServer":   { "enabled": true },
    "fileBrowser": { "enabled": true,  "mode": "standalone" }
  },
  "portRemapping": {},
  "devStack": {
    "languages": ["nodejs", "go", "python", "java", "kotlin", "rust"],
    "frameworks": {
      "nodejs":  "nextjs",
      "go":      "gin",
      "python":  "fastapi",
      "java":    "springboot",
      "kotlin":  "ktor",
      "rust":    "axum"
    },
    "frontend": null
  },
  "boilerplate": { "generate": true, "sampleData": false, "devMode": "production" },
  "domain": {
    "provider": "quick-tunnel", "name": "brewnet.local", "ssl": "cloudflare",
    "cloudflare": { "enabled": true, "tunnelMode": "quick", "quickTunnelUrl": "",
      "accountId": "", "apiToken": "", "tunnelId": "", "tunnelToken": "",
      "tunnelName": "", "zoneId": "", "zoneName": "" }
  }
}
JSON
  ok "기본 full-install config 생성 완료 (6개 언어: nodejs/go/python/java/kotlin/rust)"
fi

# Show full step-by-step plan
show_config_summary "$CONFIG_BACKUP"
step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 1: Build
# ─────────────────────────────────────────────────────────────────────────────
step_start 1 "Build (pnpm run build)"

if [ "$SKIP_BUILD" = true ]; then
  step_skipped
else
  sub "Working dir: ${REPO_DIR}"
  cd "$REPO_DIR"

  info "pnpm run build 시작..."
  run_streamed pnpm run build

  SIZE=$(wc -c < packages/cli/dist/index.js | tr -d ' ')
  ok "dist/index.js: ${SIZE} bytes"

  # Verify hardlink is still intact
  LOCAL_INODE=$(ls -i packages/cli/dist/index.js | awk '{print $1}')
  GLOBAL_BIN="$HOME/.nvm/versions/node/v22.20.0/lib/node_modules/@brewnet/cli/dist/index.js"
  if [ -f "$GLOBAL_BIN" ]; then
    GLOBAL_INODE=$(ls -i "$GLOBAL_BIN" | awk '{print $1}')
    if [ "$LOCAL_INODE" = "$GLOBAL_INODE" ]; then
      ok "글로벌 바이너리 hardlink 확인 (inode: ${LOCAL_INODE}) → brewnet 명령 자동 갱신됨"
    else
      echo -e "${YELLOW}  ⚠ [$(ts)] 글로벌 바이너리가 별개 파일 (hardlink 아님) — 내용 비교 중...${NC}"
      if diff -q packages/cli/dist/index.js "$GLOBAL_BIN" > /dev/null 2>&1; then
        ok "내용 동일 → 문제 없음"
      else
        echo -e "${RED}  ✗ [$(ts)] 글로벌 바이너리가 구버전! 복사 중...${NC}"
        cp packages/cli/dist/index.js "$GLOBAL_BIN"
        ok "글로벌 바이너리 갱신 완료"
      fi
    fi
  fi

  step_done
fi

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 2: Uninstall
# ─────────────────────────────────────────────────────────────────────────────
step_start 2 "Uninstall (brewnet uninstall --force)"

if [ "$SKIP_UNINSTALL" = true ]; then
  step_skipped
else
  info "모든 Docker 컨테이너/볼륨/네트워크 + 프로젝트 파일 제거 시작..."
  sub "제거 대상: ~/brewnet/my-homeserver  •  ~/.brewnet/  •  brewnet-* 컨테이너/볼륨"

  set +e
  run_streamed "${BREWNET[@]}" uninstall --force
  UNINSTALL_RC=$?
  set -e

  if [ $UNINSTALL_RC -eq 0 ]; then
    ok "Uninstall 완료"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] Uninstall 중 일부 오류 발생 (RC=${UNINSTALL_RC}) — 계속 진행${NC}"
  fi

  step_done
fi

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 3: Init
# ─────────────────────────────────────────────────────────────────────────────
step_start 3 "Init"

if [ "$INTERACTIVE" = true ]; then
  info "모드: interactive (값 자동 채워짐, 각 단계에서 Enter로 확인)"
  sub "명령: brewnet init --config ${CONFIG_BACKUP}"
  echo ""
  # Interactive mode: pass through terminal directly (no timestamp wrapping)
  "${BREWNET[@]}" init --config "$CONFIG_BACKUP"
  ok "Init 완료"
else
  info "모드: non-interactive (프롬프트 없음, 자동 실행)"
  sub "명령: brewnet init --config ${CONFIG_BACKUP} --non-interactive --no-open (background)"
  echo ""

  # Kill any existing admin server on the port — init will start a new one
  EXISTING_ADMIN=$(lsof -ti :"$ADMIN_PORT" 2>/dev/null || true)
  if [ -n "$EXISTING_ADMIN" ]; then
    info "포트 ${ADMIN_PORT} 사용 중인 프로세스 종료 중... (PID: ${EXISTING_ADMIN})"
    echo "$EXISTING_ADMIN" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  # brewnet init starts an admin HTTP server that never exits — run in background
  # Note: macOS mktemp requires XXXXXX at the very end — suffix after XXXXXX breaks it
  INIT_LOG=$(mktemp /tmp/brewnet-init.XXXXXX)
  info "Init 백그라운드 실행 시작 → 로그: ${INIT_LOG}"
  "${BREWNET[@]}" init --config "$CONFIG_BACKUP" --non-interactive --no-open > "$INIT_LOG" 2>&1 &
  INIT_PID=$!
  info "Init PID: ${INIT_PID}"
  divider

  # Stream init log in background with colorizer
  tail -f "$INIT_LOG" 2>/dev/null | while IFS= read -r line; do
    colorize_line "$line"
  done &
  TAIL_PID=$!

  # Wait for admin panel to come up — up to 25 minutes (300 × 5s)
  # Rust axum takes 15-20 min to compile; Java/Kotlin ~5 min; allow generous margin.
  info "Admin 패널 기동 대기 중 (최대 25분 — Rust 컴파일 포함)..."
  INIT_OK=false
  for i in $(seq 1 300); do
    sleep 5
    if ! kill -0 "$INIT_PID" 2>/dev/null; then
      fail "Init 프로세스 비정상 종료 (PID ${INIT_PID})"
      break
    fi
    HTTP_CHK=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$ADMIN_PORT" 2>/dev/null || echo "000")
    if [ "$HTTP_CHK" = "200" ]; then
      ok "Admin 패널 기동 확인 → HTTP 200 (${i}번째 확인, $((i*5))초 = $((i*5/60))분 $((i*5%60))초 경과)"
      INIT_OK=true
      break
    fi
    # Print elapsed time every 60 iterations (5 min)
    if (( i % 12 == 0 )); then
      wait_ "Admin 패널 대기... HTTP ${HTTP_CHK} (${i}/300 — $((i*5/60))분 경과)"
    else
      wait_ "Admin 패널 대기... HTTP ${HTTP_CHK} (${i}/300)"
    fi
  done

  kill "$TAIL_PID" 2>/dev/null || true

  if [ "$INIT_OK" = true ]; then
    ok "Init 완료 (Admin 패널 응답 확인됨)"
    INIT_RC=0
  else
    fail "Init 실패 또는 Admin 패널 기동 타임아웃 (25분)"
    echo -e "${DIM}  Init 로그: ${INIT_LOG}${NC}"
    INIT_RC=1
  fi
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 4: Admin panel verification
# ─────────────────────────────────────────────────────────────────────────────
step_start 4 "Admin Panel 검증 (http://localhost:${ADMIN_PORT})"

info "HTTP 응답 대기 중..."

ADMIN_OK=false
for i in $(seq 1 15); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "HTTP 200 응답 확인 (시도 ${i}/15)"
    ADMIN_OK=true
    break
  fi
  wait_ "응답 대기 중... HTTP ${HTTP_CODE} (${i}/15 — 1초 후 재시도)"
  sleep 1
done

if [ "$ADMIN_OK" = false ]; then
  fail "Admin 패널 응답 없음 (15초 타임아웃)"
  sub "수동 시작: brewnet admin"
else
  # JS syntax check
  info "JavaScript 문법 검사 중..."
  SYNTAX_CHECK=$(curl -s "http://localhost:${ADMIN_PORT}" 2>/dev/null \
    | sed -n '/<script>/,/<\/script>/p' \
    | grep -v '<\/\?script>' \
    | node --check /dev/stdin 2>&1 && echo "OK" || echo "FAIL")

  if [ "$SYNTAX_CHECK" = "OK" ]; then
    ok "JS 문법 검사 통과 — SyntaxError 없음"
  else
    fail "JS 문법 오류 감지:"
    echo "$SYNTAX_CHECK" | while IFS= read -r line; do
      echo -e "  ${RED}  $line${NC}"
    done
  fi

  # Check key sections load (fetch API endpoints)
  info "API 엔드포인트 확인 중..."
  for endpoint in "/api/services" "/api/deploy/history" "/api/git/repos"; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}${endpoint}" 2>/dev/null || echo "000")
    if [ "$CODE" = "200" ]; then
      ok "GET ${endpoint} → ${CODE}"
    else
      echo -e "${YELLOW}  ⚠ [$(ts)] GET ${endpoint} → ${CODE}${NC}"
    fi
  done
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 5: Boilerplate Endpoint Verification
# ─────────────────────────────────────────────────────────────────────────────
step_start 5 "보일러플레이트 엔드포인트 검증"

MY_HS="${HOME}/brewnet/my-homeserver"

# Get tunnel URL from cloudflared logs
TUNNEL_URL=$(docker logs brewnet-cloudflared 2>&1 \
  | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' \
  | tail -1 || true)
if [ -n "$TUNNEL_URL" ]; then
  info "터널 URL: ${TUNNEL_URL}"
else
  echo -e "${YELLOW}  ⚠ [$(ts)] 터널 URL 없음 — 외부 접근 테스트 건너뜀${NC}"
fi

# Print table header
printf "\n  %-24s %-10s %-10s %-12s %-10s\n" "Stack" "Backend" "Frontend" "Image" "External"
printf "  %-24s %-10s %-10s %-12s %-10s\n" "────────────────────────" "─────────" "─────────" "───────────" "─────────"

# Stack metadata: "stackId:isUnified:frontendPath"
#   isUnified=1 → Next.js (no -ui suffix, image under /apps/<id>/)
#   isUnified=0 → separate frontend container at /apps/<id>-ui/
STACKS=(
  "nodejs-nextjs-full:1"
  "go-gin:0"
  "python-fastapi:0"
  "java-springboot:0"
  "kotlin-ktor:0"
  "rust-axum:0"
)

ALL_PASS=true

for entry in "${STACKS[@]}"; do
  STACK_ID="${entry%%:*}"
  IS_UNIFIED="${entry##*:}"
  STACK_DIR="${MY_HS}/${STACK_ID}"

  # Skip stacks that were not installed in this run
  if [ ! -d "$STACK_DIR" ]; then
    printf "  %-24s %-10s %-10s %-12s %-10s\n" "$STACK_ID" "— skip" "— skip" "— skip" "— skip"
    continue
  fi

  # ── a. Backend ───────────────────────────────────────────────────────────
  BE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "http://localhost/apps/${STACK_ID}/health" 2>/dev/null || echo "ERR")
  if [ "$BE_CODE" = "200" ]; then BE_ICON="${GREEN}✅ ${BE_CODE}${NC}"; else BE_ICON="${RED}❌ ${BE_CODE}${NC}"; ALL_PASS=false; fi

  # ── b. Frontend ──────────────────────────────────────────────────────────
  if [ "$IS_UNIFIED" = "1" ]; then
    FE_ICON="${DIM}— (통합)${NC}"
  else
    FE_CODE=$(curl -sL -o /tmp/fe_test.html -w "%{http_code}" --max-time 10 \
      "http://localhost/apps/${STACK_ID}-ui/" 2>/dev/null || echo "ERR")
    if [ "$FE_CODE" = "200" ] && grep -q '<div id="root">' /tmp/fe_test.html 2>/dev/null; then
      FE_ICON="${GREEN}✅ ${FE_CODE}${NC}"
    elif [ "$FE_CODE" = "200" ]; then
      FE_ICON="${YELLOW}⚠ ${FE_CODE}${NC}"
    else
      FE_ICON="${RED}❌ ${FE_CODE}${NC}"; ALL_PASS=false
    fi
  fi

  # ── c. Image ─────────────────────────────────────────────────────────────
  if [ "$IS_UNIFIED" = "1" ]; then
    IMG_PATH="http://localhost/apps/${STACK_ID}/brewnet-site-banner.png"
  else
    IMG_PATH="http://localhost/apps/${STACK_ID}-ui/brewnet-site-banner.png"
  fi
  IMG_HDR=$(curl -sI --max-time 10 "$IMG_PATH" 2>/dev/null || true)
  IMG_CODE=$(echo "$IMG_HDR" | grep -oE 'HTTP/[0-9.]+ [0-9]+' | tail -1 | awk '{print $2}')
  IMG_CT=$(echo "$IMG_HDR" | grep -i 'content-type' | grep -o 'image/png' || true)
  if [ "$IMG_CODE" = "200" ] && [ "$IMG_CT" = "image/png" ]; then
    IMG_ICON="${GREEN}✅ png${NC}"
  elif [ "$IMG_CODE" = "200" ]; then
    IMG_ICON="${YELLOW}⚠ 200/${IMG_CT:-?}${NC}"; ALL_PASS=false
  else
    IMG_ICON="${RED}❌ ${IMG_CODE:-ERR}${NC}"; ALL_PASS=false
  fi

  # ── d. External ──────────────────────────────────────────────────────────
  if [ -n "$TUNNEL_URL" ]; then
    EXT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
      "${TUNNEL_URL}/apps/${STACK_ID}/health" 2>/dev/null || echo "ERR")
    if [ "$EXT_CODE" = "200" ]; then EXT_ICON="${GREEN}✅ ${EXT_CODE}${NC}"; else EXT_ICON="${RED}❌ ${EXT_CODE}${NC}"; ALL_PASS=false; fi
  else
    EXT_ICON="${DIM}— skip${NC}"
  fi

  printf "  %-24s " "$STACK_ID"
  printf "${BE_ICON}  "
  printf "${FE_ICON}  "
  printf "${IMG_ICON}  "
  printf "${EXT_ICON}\n"
done

echo ""
if [ "$ALL_PASS" = true ]; then
  ok "✅ [$(ts)] 전체 보일러플레이트 테스트 통과"
else
  fail "일부 스택 검증 실패 — 위 표에서 ❌ 항목 확인"
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ═══ 테스트 사이클 완료 ═══${NC}"
echo -e "  ${DIM}종료 시각: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
if [ "$ADMIN_OK" = true ]; then
  echo -e "  ${GREEN}${BOLD}Admin 패널: http://localhost:${ADMIN_PORT}${NC}"
else
  echo -e "  ${YELLOW}Admin 패널을 수동으로 시작하세요: brewnet admin${NC}"
fi
if [ "$ALL_PASS" = true ]; then
  echo -e "  ${GREEN}${BOLD}✅ [$(ts)] 전체 테스트 통과${NC}"
else
  echo -e "  ${RED}${BOLD}❌ 일부 스택 실패 — 위 Phase 5 결과 확인${NC}"
fi
echo -e "  ${DIM}컨테이너 상태: docker ps --filter name=brewnet${NC}"
echo -e "  ${DIM}서비스 로그:   tail -f ~/brewnet/my-homeserver/logs/*.log${NC}"
echo -e "  ${DIM}Admin 종료:    kill \$(lsof -ti :${ADMIN_PORT})${NC}"
echo ""
