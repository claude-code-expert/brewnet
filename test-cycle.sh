
#!/usr/bin/env bash
# test-cycle.sh — Full brewnet test cycle with per-step logging
# Usage:
#   ./test-cycle.sh                  # 완전 자동 (non-interactive)
#   ./test-cycle.sh --interactive    # 반자동 (Enter로 확인)
#   ./test-cycle.sh --skip-build     # 빌드 건너뜀
#   ./test-cycle.sh --skip-uninstall # 언인스톨 건너뜀
#   ./test-cycle.sh --skip-init      # Init/설치 건너뜀 (기존 환경 유지)

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
SKIP_INIT=false
for arg in "$@"; do
  case $arg in
    --interactive)     INTERACTIVE=true  ;;
    --skip-build)      SKIP_BUILD=true   ;;
    --skip-uninstall)  SKIP_UNINSTALL=true ;;
    --skip-init)       SKIP_INIT=true; SKIP_BUILD=true; SKIP_UNINSTALL=true ;;
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
const langs = cfg.devStack?.languages || [];
const devItems = langs.length === 0
  ? [['선택 없음', '(appServer disabled)', false]]
  : langs.map(lang => [
      lang,
      `프레임워크: ${cfg.devStack.frameworks[lang] || '(없음)'}`,
      true,
    ]);
devItems.push(['boilerplate', cfg.boilerplate?.generate ? 'generate' : 'skip', cfg.boilerplate?.generate]);
devItems.push(['devMode', cfg.boilerplate?.devMode, true]);
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
if (cfg.boilerplate?.generate && langs.length > 0) {
  console.log(`       ${DIM}→ 보일러플레이트 클론: ${langs.map(l => `${l}/${cfg.devStack?.frameworks?.[l]||''}`).join(', ')}${NC}`);
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
echo -e "  ${DIM}Flags → interactive=${INTERACTIVE} skip-build=${SKIP_BUILD} skip-uninstall=${SKIP_UNINSTALL} skip-init=${SKIP_INIT}${NC}"
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

if [ "$SKIP_INIT" = true ]; then
  step_skipped
  # ── --skip-init: lastProject 자동 복원 ──────────────────────────────────
  # admin-server는 시작 시 wizardState를 한 번 로드한다. lastProject가 빈 값이면
  # wizardState=null → Gitea 패스워드 없음 → create-app 전체 실패.
  # selections.json 백업에서 자동 복원해 이 문제를 예방한다.
  BREWNET_CFG="$HOME/.brewnet/config.json"
  LAST_PROJECT_VAL=$(node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      process.stdout.write(d.lastProject || '');
    } catch(e) { process.stdout.write(''); }
  " "$BREWNET_CFG" 2>/dev/null || true)

  NEED_ADMIN_RESTART=false

  if [ -z "$LAST_PROJECT_VAL" ] && [ -f "$CONFIG_BACKUP" ]; then
    PROJECT_NAME_RESTORE=$(node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
        process.stdout.write(d.projectName || '');
      } catch(e) { process.stdout.write(''); }
    " "$CONFIG_BACKUP" 2>/dev/null || true)
    if [ -n "$PROJECT_NAME_RESTORE" ]; then
      RESTORE_DIR="$HOME/.brewnet/projects/$PROJECT_NAME_RESTORE"
      mkdir -p "$RESTORE_DIR"
      cp "$CONFIG_BACKUP" "$RESTORE_DIR/selections.json"
      # Use conf package API to set lastProject (direct JSON write gets overwritten by conf)
      CONF_JS=$(ls "$(cd "$(dirname "$0")"; pwd)"/node_modules/.pnpm/conf@*/node_modules/conf/dist/source/index.js 2>/dev/null | head -1)
      if [ -n "$CONF_JS" ]; then
        node -e "
          const confMod = require(process.argv[1]);
          const Conf = confMod.default || confMod;
          const c = new Conf({ cwd: require('path').join(require('os').homedir(), '.brewnet'), configName: 'config', defaults: {lastProject:''} });
          c.set('lastProject', process.argv[2]);
        " "$CONF_JS" "$PROJECT_NAME_RESTORE" 2>/dev/null
      else
        # Fallback: direct JSON write
        node -e "
          const fs=require('fs'), path=require('path'), os=require('os');
          const cfg = path.join(os.homedir(), '.brewnet', 'config.json');
          try { const d = JSON.parse(fs.readFileSync(cfg, 'utf8')); d.lastProject = process.argv[1]; fs.writeFileSync(cfg, JSON.stringify(d, null, '\t')); } catch(e) {}
        " "$PROJECT_NAME_RESTORE" 2>/dev/null
      fi
      warn "lastProject 빈값 감지 → '${PROJECT_NAME_RESTORE}'으로 자동 복원 (conf API)"
      sub "  소스: ${CONFIG_BACKUP} → ${RESTORE_DIR}/selections.json"
      NEED_ADMIN_RESTART=true
    fi
  elif [ -n "$LAST_PROJECT_VAL" ]; then
    # selections.json 누락 시 복원
    RESTORE_DIR2="$HOME/.brewnet/projects/$LAST_PROJECT_VAL"
    if [ ! -f "$RESTORE_DIR2/selections.json" ] && [ -f "$CONFIG_BACKUP" ]; then
      mkdir -p "$RESTORE_DIR2"
      cp "$CONFIG_BACKUP" "$RESTORE_DIR2/selections.json"
      warn "selections.json 누락 감지 → '${LAST_PROJECT_VAL}' 복원"
      NEED_ADMIN_RESTART=true
    else
      sub "  lastProject='${LAST_PROJECT_VAL}' 및 selections.json 확인됨"
    fi
  fi

  # 이미 실행 중인 admin-server가 null wizardState로 시작됐으면 재시작
  # (admin-server는 시작 시 한 번만 wizardState 로드 → 복원 후 재시작 필요)
  if [ "$NEED_ADMIN_RESTART" = true ]; then
    EXISTING_PORT=$(lsof -ti :"$ADMIN_PORT" 2>/dev/null || true)
    if [ -n "$EXISTING_PORT" ]; then
      warn "admin-server 재시작 필요 (wizardState null 상태로 기동됨)"
      echo "$EXISTING_PORT" | xargs kill -9 2>/dev/null || true
      sleep 2
    fi
    ADMIN_RESTART_LOG=$(mktemp /tmp/brewnet-admin-restart.XXXXXX)
    "${BREWNET[@]}" admin --foreground --no-open > "$ADMIN_RESTART_LOG" 2>&1 &
    ADMIN_RESTART_PID=$!
    sub "  admin-server 재시작 PID: ${ADMIN_RESTART_PID}"
    for i in $(seq 1 15); do
      sleep 2
      HTTP_CHK=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$ADMIN_PORT" 2>/dev/null || echo "000")
      if [ "$HTTP_CHK" = "200" ]; then
        ok "admin-server 재시작 완료 → HTTP 200 (${i}번째 확인)"
        break
      fi
    done
  fi
else

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

fi  # end SKIP_INIT else block

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
  # JS syntax check — SPA uses external bundle (no inline script)
  info "JavaScript 문법 검사 중..."
  JS_BUNDLE=$(curl -s "http://localhost:${ADMIN_PORT}" 2>/dev/null \
    | grep -o 'src="/assets/[^"]*\.js"' | head -1 | sed 's/src="//;s/"//')
  if [ -n "$JS_BUNDLE" ]; then
    SYNTAX_CHECK=$(curl -s "http://localhost:${ADMIN_PORT}${JS_BUNDLE}" 2>/dev/null \
      | node --check /dev/stdin 2>&1 && echo "OK" || echo "FAIL")
    if [ "$SYNTAX_CHECK" = "OK" ]; then
      ok "JS 문법 검사 통과 — SyntaxError 없음 (bundle: ${JS_BUNDLE})"
    else
      fail "JS 문법 오류 감지:"
      echo "$SYNTAX_CHECK" | head -5 | while IFS= read -r line; do
        echo -e "  ${RED}  $line${NC}"
      done
    fi
  else
    ok "JS 문법 검사 건너뜀 — 번들 URL 없음 (React SPA 번들 서빙 중)"
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
#  PHASE 5: Apps 페이지 & Gitea 연결 검증
# ─────────────────────────────────────────────────────────────────────────────
step_start 5 "Apps 페이지 & Gitea 연결 검증"

GITEA_BASE="http://localhost/git"
TEST_APP_NAME="brewnet-gitea-test"
TEST_APP_PORT=19988
TEST_APP_DIR="$HOME/brewnet/my-homeserver/apps/${TEST_APP_NAME}"
GITEA_TOKEN_PATH="$HOME/.brewnet/gitea-token"
SECRETS_FILE="$HOME/brewnet/my-homeserver/secrets/admin_password"
PHASE5_OK=true

# ── 5.1 /apps 페이지 로드 ──────────────────────────────────────────────────
label "5.1 /apps 페이지 로드"
APPS_PAGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:${ADMIN_PORT}/apps" 2>/dev/null || echo "000")
if [ "$APPS_PAGE_CODE" = "200" ]; then
  ok "/apps → HTTP 200"
else
  fail "/apps → HTTP ${APPS_PAGE_CODE} (예상: 200)"
fi

# ── 5.2 /api/apps JSON 구조 ────────────────────────────────────────────────
label "5.2 /api/apps JSON 구조 확인"
_APPS_TMP=$(mktemp)
API_APPS_CODE=$(curl -s -o "$_APPS_TMP" -w "%{http_code}" \
  "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null || echo "000")
if [ "$API_APPS_CODE" = "200" ]; then
  APP_COUNT=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('${_APPS_TMP}','utf8'));
    process.stdout.write(Array.isArray(d.apps) ? String(d.apps.length) : 'ERR');
  " 2>/dev/null || echo "ERR")
  if [ "$APP_COUNT" != "ERR" ]; then
    ok "/api/apps → HTTP 200 | apps 배열 확인 (${APP_COUNT}개)"
  else
    fail "/api/apps → HTTP 200이지만 apps 배열 없음"
    sub "응답: $(cat "$_APPS_TMP" | head -c 200)"
  fi
else
  fail "/api/apps → HTTP ${API_APPS_CODE}"
fi
rm -f "$_APPS_TMP"

# ── 5.3 /api/git/repos 심화 검증 ──────────────────────────────────────────
label "5.3 /api/git/repos 검증"
_REPOS_TMP=$(mktemp)
GIT_REPOS_CODE=$(curl -s -o "$_REPOS_TMP" -w "%{http_code}" \
  "http://localhost:${ADMIN_PORT}/api/git/repos" 2>/dev/null || echo "000")
if [ "$GIT_REPOS_CODE" = "200" ]; then
  REPO_COUNT=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('${_REPOS_TMP}','utf8'));
    process.stdout.write(Array.isArray(d.repos) ? String(d.repos.length) : 'ERR');
  " 2>/dev/null || echo "ERR")
  if [ "$REPO_COUNT" != "ERR" ]; then
    ok "/api/git/repos → HTTP 200 | repos 배열 확인 (${REPO_COUNT}개)"
  else
    GIT_ERR=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('${_REPOS_TMP}','utf8'));
      process.stdout.write(d.error || '(no error field)');
    " 2>/dev/null || echo "parse error")
    fail "/api/git/repos → repos 배열 없음 — error: ${GIT_ERR}"
  fi
else
  GIT_ERR=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('${_REPOS_TMP}','utf8'));
    process.stdout.write(d.error || '(no error field)');
  " 2>/dev/null || echo "parse error")
  fail "/api/git/repos → HTTP ${GIT_REPOS_CODE} — error: ${GIT_ERR}"
fi
rm -f "$_REPOS_TMP"

# ── 5.4 Gitea 직접 연결 ───────────────────────────────────────────────────
label "5.4 Gitea 직접 연결 검증"

# 패스워드 우선순위: secrets/admin_password > selections.json (backup)
GITEA_PASS=""
if [ -f "$SECRETS_FILE" ]; then
  GITEA_PASS=$(cat "$SECRETS_FILE" 2>/dev/null | tr -d '[:space:]' || true)
  [ -n "$GITEA_PASS" ] && sub "패스워드 소스: ${SECRETS_FILE}"
fi
if [ -z "$GITEA_PASS" ] && [ -f "$CONFIG_BACKUP" ]; then
  GITEA_PASS=$(node -e "
    const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
    process.stdout.write(d.admin?.password || '');
  " "$CONFIG_BACKUP" 2>/dev/null || true)
  [ -n "$GITEA_PASS" ] && sub "패스워드 소스: selections.json (backup)"
fi

if [ -z "$GITEA_PASS" ]; then
  echo -e "${YELLOW}  ⚠ [$(ts)] Gitea 패스워드를 찾을 수 없음 — 5.4 건너뜀${NC}"
else
  _GITEA_USER_TMP=$(mktemp)
  GITEA_USER_CODE=$(curl -s -o "$_GITEA_USER_TMP" -w "%{http_code}" \
    -u "admin:${GITEA_PASS}" \
    "${GITEA_BASE}/api/v1/user" 2>/dev/null || echo "000")
  if [ "$GITEA_USER_CODE" = "200" ]; then
    GITEA_LOGIN=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('${_GITEA_USER_TMP}','utf8'));
      process.stdout.write(d.login || '?');
    " 2>/dev/null || echo "?")
    ok "Gitea Basic Auth → HTTP 200 (login: ${GITEA_LOGIN})"
  elif [ "$GITEA_USER_CODE" = "403" ]; then
    echo -e "${YELLOW}  ⚠ [$(ts)] Gitea → HTTP 403 — mustChangePassword=true 가능성${NC}"
    sub "수동 확인: curl -u admin:<pass> ${GITEA_BASE}/api/v1/user"
  else
    fail "Gitea Basic Auth → HTTP ${GITEA_USER_CODE} (예상: 200)"
    sub "엔드포인트: ${GITEA_BASE}/api/v1/user"
  fi
  rm -f "$_GITEA_USER_TMP"

  # Token 재검증 (파일 존재 시)
  if [ -f "$GITEA_TOKEN_PATH" ]; then
    GITEA_TOKEN=$(cat "$GITEA_TOKEN_PATH" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -n "$GITEA_TOKEN" ]; then
      TOKEN_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: token ${GITEA_TOKEN}" \
        "${GITEA_BASE}/api/v1/user" 2>/dev/null || echo "000")
      if [ "$TOKEN_CODE" = "200" ]; then
        ok "Gitea Token Auth → HTTP 200 (token 파일: ${GITEA_TOKEN_PATH})"
      else
        fail "Gitea Token Auth → HTTP ${TOKEN_CODE} (토큰 파일: ${GITEA_TOKEN_PATH})"
      fi
    fi
  else
    sub "Gitea 토큰 파일 없음 (${GITEA_TOKEN_PATH}) — token 재검증 건너뜀"
  fi
fi

# ── 5.5 create-app End-to-End (Gitea 스텝 검증) ───────────────────────────
label "5.5 create-app E2E (Gitea 스텝 검증)"

# 사전 정리: 이전 테스트 앱 삭제 (API + 파일시스템)
sub "사전 정리: 기존 '${TEST_APP_NAME}' 앱 삭제..."
PRE_CLEANUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "http://localhost:${ADMIN_PORT}/api/apps/${TEST_APP_NAME}" 2>/dev/null || echo "000")
if [ "$PRE_CLEANUP_CODE" = "200" ]; then
  sub "기존 테스트 앱 API 삭제 완료 (HTTP 200)"
elif [ "$PRE_CLEANUP_CODE" = "404" ]; then
  sub "기존 테스트 앱 없음 (HTTP 404) — 정상"
else
  sub "API 삭제 응답: HTTP ${PRE_CLEANUP_CODE}"
fi
# 파일시스템 디렉토리 강제 정리 (API 실패 여부 무관)
if [ -d "$TEST_APP_DIR" ]; then
  rm -rf "$TEST_APP_DIR"
  sub "앱 디렉토리 삭제 완료: ${TEST_APP_DIR}"
fi
# Docker 컨테이너/네트워크 잔재 정리 (이전 실패 런 대비)
docker rm -f "${TEST_APP_NAME}-backend-1" "${TEST_APP_NAME}-frontend-1" "${TEST_APP_NAME}-db-1" 2>/dev/null || true
docker network rm "${TEST_APP_NAME}_default" "${TEST_APP_NAME}_brewnet-internal" 2>/dev/null || true

# POST /api/apps/create
info "create-app 시작: ${TEST_APP_NAME} (nodejs/express, port ${TEST_APP_PORT})"
_CREATE_TMP=$(mktemp)
CREATE_CODE=$(curl -s -o "$_CREATE_TMP" -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"appName\":\"${TEST_APP_NAME}\",\"mode\":\"new-project\",\"language\":\"nodejs\",\"frameworkId\":\"express\",\"port\":${TEST_APP_PORT}}" \
  "http://localhost:${ADMIN_PORT}/api/apps/create" 2>/dev/null || echo "000")
CREATE_BODY=$(cat "$_CREATE_TMP")
rm -f "$_CREATE_TMP"

JOB_ID=$(echo "$CREATE_BODY" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(d.jobId || '');
" 2>/dev/null || true)

if [ -z "$JOB_ID" ]; then
  fail "create-app → jobId 없음 (HTTP ${CREATE_CODE}, 응답: $(echo "$CREATE_BODY" | head -c 200))"
  PHASE5_OK=false
else
  ok "create-app → jobId: ${JOB_ID}"

  # 폴링: 3초 간격, 최대 60회 (3분)
  GITEA_STEPS_OK=false
  JOB_DONE=false
  JOB_FAILED=false

  for poll in $(seq 1 60); do
    sleep 3
    _JOB_TMP=$(mktemp)
    curl -s -o "$_JOB_TMP" \
      "http://localhost:${ADMIN_PORT}/api/apps/jobs/${JOB_ID}" 2>/dev/null || true
    JOB_STATUS=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
      process.stdout.write(d.status || 'unknown');
    " 2>/dev/null || echo "unknown")

    # 스텝 상태 1줄 출력
    STEP_LINE=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
      const icons = { done: '✔', 'in-progress': '⏳', failed: '✗', pending: '·' };
      const steps = d.steps || [];
      process.stdout.write(steps.map(s => (icons[s.status]||'?') + ' ' + s.label).join(' | '));
    " 2>/dev/null || echo "steps parse error")
    sub "[${poll}/60] ${STEP_LINE}"

    if [ "$JOB_STATUS" = "failed" ]; then
      # Job 실패여도 Gitea 스텝 완료 여부를 먼저 확인 (Docker up 실패는 Gitea와 무관)
      GITEA_CHECK_FAIL=$(node -e "
        const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
        const steps = d.steps || [];
        const setup = steps.find(s => s.label === 'Gitea setup');
        const repo  = steps.find(s => s.label === 'Gitea repo');
        process.stdout.write(
          setup?.status === 'done' && repo?.status === 'done'
            ? 'ok'
            : 'fail:' + (setup?.status||'?') + '/' + (repo?.status||'?')
        );
      " 2>/dev/null || echo "fail:parse")
      JOB_ERR=$(node -e "
        const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
        process.stdout.write(d.error || d.message || '(no error message)');
      " 2>/dev/null || echo "parse error")
      rm -f "$_JOB_TMP"
      if [ "$GITEA_CHECK_FAIL" = "ok" ]; then
        ok "Gitea setup + Gitea repo 스텝 완료 → Gitea 연결 성공"
        GITEA_STEPS_OK=true
        fail "create-app Docker/Health 실패 (Gitea 검증과 무관): $(echo "$JOB_ERR" | head -c 120)"
      else
        fail "create-app 실패 + Gitea 스텝도 실패: $(echo "$JOB_ERR" | head -c 80) (${GITEA_CHECK_FAIL})"
        PHASE5_OK=false
      fi
      JOB_FAILED=true
      JOB_DONE=true
      break
    fi

    if [ "$JOB_STATUS" = "done" ]; then
      # Gitea setup + Gitea repo 스텝 done 확인
      GITEA_CHECK=$(node -e "
        const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
        const steps = d.steps || [];
        const setup = steps.find(s => s.label === 'Gitea setup');
        const repo  = steps.find(s => s.label === 'Gitea repo');
        process.stdout.write(
          setup?.status === 'done' && repo?.status === 'done'
            ? 'ok'
            : 'fail:' + (setup?.status||'?') + '/' + (repo?.status||'?')
        );
      " 2>/dev/null || echo "fail:parse")

      if [ "$GITEA_CHECK" = "ok" ]; then
        ok "Gitea setup + Gitea repo 스텝 완료 → Gitea 연결 성공"
        GITEA_STEPS_OK=true
      else
        fail "Gitea 스텝 실패 — ${GITEA_CHECK}"
        PHASE5_OK=false
      fi

      # Docker up / Health check 결과 별도 경고 출력 (Gitea 검증과 무관)
      DOCKER_CHECK=$(node -e "
        const d = JSON.parse(require('fs').readFileSync('${_JOB_TMP}','utf8'));
        const steps = d.steps || [];
        const docker = steps.find(s => s.label === 'Docker up');
        const health = steps.find(s => s.label === 'Health check');
        process.stdout.write((docker?.status||'?') + '/' + (health?.status||'?'));
      " 2>/dev/null || echo "?/?")
      sub "Docker up / Health check: ${DOCKER_CHECK} (Gitea 검증과 무관)"
      rm -f "$_JOB_TMP"
      JOB_DONE=true
      break
    fi

    rm -f "$_JOB_TMP"
  done

  if [ "$JOB_DONE" = false ]; then
    fail "create-app 타임아웃 (3분) — 마지막 상태: ${JOB_STATUS:-unknown}"
    PHASE5_OK=false
  fi

  # 사후 정리: 테스트 앱 삭제 (API + 파일시스템)
  sub "사후 정리: '${TEST_APP_NAME}' 삭제..."
  POST_CLEANUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "http://localhost:${ADMIN_PORT}/api/apps/${TEST_APP_NAME}" 2>/dev/null || echo "000")
  if [ "$POST_CLEANUP_CODE" = "200" ]; then
    sub "테스트 앱 API 삭제 완료"
  else
    sub "테스트 앱 API 삭제 응답: HTTP ${POST_CLEANUP_CODE}"
  fi
  # 파일시스템 디렉토리도 정리
  if [ -d "$TEST_APP_DIR" ]; then
    rm -rf "$TEST_APP_DIR"
    sub "앱 디렉토리 삭제 완료: ${TEST_APP_DIR}"
  fi
  # Docker 컨테이너/네트워크 잔재 정리
  docker rm -f "${TEST_APP_NAME}-backend-1" "${TEST_APP_NAME}-frontend-1" "${TEST_APP_NAME}-db-1" 2>/dev/null || true
  docker network rm "${TEST_APP_NAME}_default" "${TEST_APP_NAME}_brewnet-internal" 2>/dev/null || true
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 6: Boilerplate Endpoint Verification
# ─────────────────────────────────────────────────────────────────────────────
step_start 6 "보일러플레이트 엔드포인트 검증"

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

# Phase 5 Gitea 검증 실패 시 false로 시작
ALL_PASS="$PHASE5_OK"

for entry in "${STACKS[@]}"; do
  STACK_ID="${entry%%:*}"
  IS_UNIFIED="${entry##*:}"
  STACK_DIR="${MY_HS}/${STACK_ID}"

  # Skip stacks that were not installed in this run
  if [ ! -d "$STACK_DIR" ]; then
    printf "  %-24s %-10s %-10s %-12s %-10s\n" "$STACK_ID" "— skip" "— skip" "— skip" "— skip"
    continue
  fi

  # Resolve actual host ports from docker port (boilerplate stacks use direct ports, not Traefik)
  # Backend container: <stack>-backend-1, Frontend container: <stack>-frontend-1
  BE_CONTAINER="${STACK_ID}-backend-1"
  FE_CONTAINER="${STACK_ID}-frontend-1"
  # Backend internal port: 8080 for most stacks, 3000 for unified (nextjs)
  if [ "$IS_UNIFIED" = "1" ]; then
    BE_HOST_PORT=$(docker port "${BE_CONTAINER}" 3000 2>/dev/null | head -1 | cut -d: -f2 || true)
  else
    BE_HOST_PORT=$(docker port "${BE_CONTAINER}" 8080 2>/dev/null | head -1 | cut -d: -f2 || true)
  fi
  FE_HOST_PORT=$(docker port "${FE_CONTAINER}" 80 2>/dev/null | head -1 | cut -d: -f2 || true)

  # ── a. Backend ───────────────────────────────────────────────────────────
  # Unified (Next.js) stacks use basePath /apps/{stackId}, so health is at /apps/{stackId}/health
  if [ "$IS_UNIFIED" = "1" ]; then
    BE_HEALTH_PATH="/apps/${STACK_ID}/health"
  else
    BE_HEALTH_PATH="/health"
  fi
  if [ -n "$BE_HOST_PORT" ]; then
    BE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      "http://127.0.0.1:${BE_HOST_PORT}${BE_HEALTH_PATH}" 2>/dev/null || echo "ERR")
    if [ "$BE_CODE" = "200" ]; then BE_ICON="${GREEN}✅ ${BE_CODE}${NC}"; else BE_ICON="${RED}❌ ${BE_CODE}${NC}"; ALL_PASS=false; fi
  else
    BE_ICON="${RED}❌ no-port${NC}"; ALL_PASS=false
  fi

  # ── b. Frontend ──────────────────────────────────────────────────────────
  if [ "$IS_UNIFIED" = "1" ]; then
    FE_ICON="${DIM}— (통합)${NC}"
  elif [ -n "$FE_HOST_PORT" ]; then
    FE_CODE=$(curl -sL -o /tmp/fe_test.html -w "%{http_code}" --max-time 10 \
      "http://127.0.0.1:${FE_HOST_PORT}/" 2>/dev/null || echo "ERR")
    if [ "$FE_CODE" = "200" ] && grep -q '<div id="root">' /tmp/fe_test.html 2>/dev/null; then
      FE_ICON="${GREEN}✅ ${FE_CODE}${NC}"
    elif [ "$FE_CODE" = "200" ]; then
      FE_ICON="${YELLOW}⚠ ${FE_CODE}${NC}"
    else
      FE_ICON="${RED}❌ ${FE_CODE}${NC}"; ALL_PASS=false
    fi
  else
    FE_ICON="${RED}❌ no-port${NC}"; ALL_PASS=false
  fi

  # ── c. Image ─────────────────────────────────────────────────────────────
  # Unified (Next.js) uses basePath /apps/{stackId} for all static assets
  if [ "$IS_UNIFIED" = "1" ] && [ -n "$BE_HOST_PORT" ]; then
    IMG_PATH="http://127.0.0.1:${BE_HOST_PORT}/apps/${STACK_ID}/brewnet-site-banner.png"
  elif [ -n "$FE_HOST_PORT" ]; then
    IMG_PATH="http://127.0.0.1:${FE_HOST_PORT}/brewnet-site-banner.png"
  else
    IMG_PATH=""
  fi
  if [ -n "$IMG_PATH" ]; then
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
  else
    IMG_ICON="${RED}❌ no-port${NC}"; ALL_PASS=false
  fi

  # ── d. External (Quick Tunnel at /apps/{stackId}) ────────────────────────
  if [ -n "$TUNNEL_URL" ]; then
    EXT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      "${TUNNEL_URL}/apps/${STACK_ID}" 2>/dev/null || echo "ERR")
    if [ "$EXT_CODE" = "200" ]; then
      EXT_ICON="${GREEN}✅ ${EXT_CODE}${NC}"
    else
      EXT_ICON="${RED}❌ ${EXT_CODE}${NC}"
    fi
  else
    EXT_ICON="${DIM}— N/A${NC}"
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
#  PHASE 7: Apps 페이지 React SPA + API 검증 (React 빌드 후 서빙 방식)
# ─────────────────────────────────────────────────────────────────────────────
step_start 7 "Apps 페이지 SPA + API 엔드포인트 검증"

# 7.1 /apps HTTP 200 확인 (React SPA — HTML 파싱 불필요)
label "7.1 /apps 페이지 HTTP 응답"
APPS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/apps" 2>/dev/null || echo "000")
if [ "$APPS_HTTP" = "200" ]; then
  ok "/apps → HTTP 200 (React SPA 서빙 정상)"
else
  fail "/apps → HTTP ${APPS_HTTP} (예상: 200)"
  ALL_PASS=false
fi

# 7.2 React SPA 번들 파일 서빙 확인 (index.html에서 assets JS 경로 추출)
label "7.2 React SPA 에셋 번들 서빙 확인"
SPA_HTML=$(curl -s "http://localhost:${ADMIN_PORT}/" 2>/dev/null)
SPA_JS_PATH=$(echo "$SPA_HTML" | grep -oE 'src="/assets/index-[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
if [ -n "$SPA_JS_PATH" ]; then
  SPA_JS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}${SPA_JS_PATH}" 2>/dev/null || echo "000")
  if [ "$SPA_JS_CODE" = "200" ]; then
    ok "React SPA 번들 서빙 확인: ${SPA_JS_PATH} → HTTP 200"
  else
    fail "React SPA 번들 → HTTP ${SPA_JS_CODE}: ${SPA_JS_PATH}"
    ALL_PASS=false
  fi
else
  echo -e "${YELLOW}  ⚠ [$(ts)] SPA JS 경로 감지 실패 (index.html에 assets/index-*.js 없음)${NC}"
fi

# 7.3 /api/apps 앱 목록 API
label "7.3 /api/apps 앱 목록"
_APPS7=$(mktemp)
curl -s -o "$_APPS7" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
APP7_COUNT=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_APPS7}','utf8'));
  process.stdout.write(String(Array.isArray(d.apps)?d.apps.length:0));
" 2>/dev/null || echo "0")
ok "등록된 앱: ${APP7_COUNT}개"
rm -f "$_APPS7"

# 7.4 Gitea 자동 로그인 엔드포인트
label "7.4 /api/gitea/autologin 엔드포인트"
AUTOLOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "http://localhost:${ADMIN_PORT}/api/gitea/autologin?redirect=/git" 2>/dev/null || echo "000")
if [ "$AUTOLOGIN_CODE" = "302" ]; then
  ok "Gitea autologin → HTTP 302 (리다이렉트 정상)"
elif [ "$AUTOLOGIN_CODE" = "200" ]; then
  ok "Gitea autologin → HTTP 200"
else
  echo -e "${YELLOW}  ⚠ [$(ts)] Gitea autologin → HTTP ${AUTOLOGIN_CODE}${NC}"
fi

# 7.5 Quick Tunnel External URL 검증 (/apps/{stackId})
label "7.5 Quick Tunnel /apps/{stackId} External 검증"
if [ -n "$TUNNEL_URL" ]; then
  for entry in "${STACKS[@]}"; do
    STACK_ID="${entry%%:*}"
    STACK_DIR="${MY_HS}/${STACK_ID}"
    [ ! -d "$STACK_DIR" ] && continue
    QT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      "${TUNNEL_URL}/apps/${STACK_ID}" 2>/dev/null || echo "ERR")
    if [ "$QT_CODE" = "200" ]; then
      ok "Quick Tunnel /apps/${STACK_ID} → HTTP ${QT_CODE}"
    else
      fail "Quick Tunnel /apps/${STACK_ID} → HTTP ${QT_CODE}"
    fi
  done
else
  info "터널 URL 없음 — Quick Tunnel 검증 건너뜀"
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 8: Apps 배포 E2E — 보일러플레이트별 External + Apps 연결 + Git 접근
# ─────────────────────────────────────────────────────────────────────────────
step_start 8 "Apps 배포 E2E (External 비교 + Apps 연결 + Start/Stop + Gitea 접근)"

TUNNEL_URL=$(docker logs brewnet-cloudflared 2>&1 \
  | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' \
  | tail -1 || true)
GITEA_TOKEN=$(cat "$HOME/.brewnet/gitea-token" 2>/dev/null | tr -d '[:space:]' || true)

# 8.1 보일러플레이트별 Local vs External 비교
label "8.1 Local vs External 페이지 비교"
for entry in "${STACKS[@]}"; do
  STACK_ID="${entry%%:*}"
  IS_UNIFIED="${entry##*:}"
  STACK_DIR="${MY_HS}/${STACK_ID}"
  [ ! -d "$STACK_DIR" ] && continue

  BE_CONTAINER="${STACK_ID}-backend-1"
  BE_HOST_PORT=$(docker port "$BE_CONTAINER" 8080 2>/dev/null | head -1 | cut -d: -f2 || true)
  [ "$IS_UNIFIED" = "1" ] && BE_HOST_PORT=$(docker port "$BE_CONTAINER" 3000 2>/dev/null | head -1 | cut -d: -f2 || true)
  [ -z "$BE_HOST_PORT" ] && continue

  # Local backend response — unified stacks use basePath /apps/{stackId}
  if [ "$IS_UNIFIED" = "1" ]; then
    LOCAL_BODY=$(curl -s --max-time 5 "http://127.0.0.1:${BE_HOST_PORT}/apps/${STACK_ID}/health" 2>/dev/null || echo "ERR")
  else
    LOCAL_BODY=$(curl -s --max-time 5 "http://127.0.0.1:${BE_HOST_PORT}/health" 2>/dev/null || echo "ERR")
  fi

  if [ -n "$TUNNEL_URL" ]; then
    # External backend response
    EXT_BODY=$(curl -sL --max-time 15 "${TUNNEL_URL}/apps/${STACK_ID}/health" 2>/dev/null || echo "ERR")
    # Compare status field only (timestamp differs per request)
    LOCAL_STATUS=$(echo "$LOCAL_BODY" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.status||'')}catch{}" 2>/dev/null || true)
    EXT_STATUS=$(echo "$EXT_BODY" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.status||'')}catch{}" 2>/dev/null || true)
    if [ -n "$LOCAL_STATUS" ] && [ "$LOCAL_STATUS" = "$EXT_STATUS" ]; then
      ok "${STACK_ID}: Local == External (health.status=${LOCAL_STATUS})"
    elif [ -z "$LOCAL_STATUS" ] && [ -z "$EXT_STATUS" ]; then
      ok "${STACK_ID}: Local == External (HTML 응답)"
    else
      fail "${STACK_ID}: Local ≠ External (local.status=${LOCAL_STATUS:-?} ext.status=${EXT_STATUS:-?})"
      sub "  Local:    $(echo "$LOCAL_BODY" | head -c 80)"
      sub "  External: $(echo "$EXT_BODY" | head -c 80)"
    fi
  else
    info "${STACK_ID}: 터널 없음 — Local만 확인 (${LOCAL_BODY:0:60})"
  fi
done

# 8.2 Apps 페이지 — 앱 목록 확인 + 미등록 앱 자동 연결
label "8.2 배포앱 목록 및 자동 연결"
_APPS8=$(mktemp)
curl -s -o "$_APPS8" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
APP8_LIST=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_APPS8}','utf8'));
  (d.apps||[]).forEach(a=>console.log(a.name+'|'+a.status+'|'+(a.giteaRepoUrl||'—')));
" 2>/dev/null || true)
rm -f "$_APPS8"

APP8_COUNT=$(echo "$APP8_LIST" | grep -c '|' || echo "0")
ok "등록된 앱: ${APP8_COUNT}개"
echo "$APP8_LIST" | while IFS='|' read -r name status repo; do
  [ -z "$name" ] && continue
  sub "  ${name}: status=${status} repo=${repo}"
done

# Gitea 레포 중 미연결 앱 자동 연결 시도
if [ -n "$GITEA_TOKEN" ]; then
  _REPOS8=$(mktemp)
  curl -s -o "$_REPOS8" "http://localhost:${ADMIN_PORT}/api/git/repos" 2>/dev/null
  UNLINKED=$(node -e "
    const d=JSON.parse(require('fs').readFileSync('${_REPOS8}','utf8'));
    (d.repos||[]).filter(r=>!r.appName).forEach(r=>console.log(r.name));
  " 2>/dev/null || true)
  rm -f "$_REPOS8"

  if [ -n "$UNLINKED" ]; then
    echo "$UNLINKED" | while read -r repo; do
      [ -z "$repo" ] && continue
      info "미연결 레포 '${repo}' → 자동 연결 시도..."
      CONN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{\"appName\":\"${repo}\"}" \
        "http://localhost:${ADMIN_PORT}/api/git/repos/${repo}/connect" 2>/dev/null || echo "000")
      if [ "$CONN_CODE" = "200" ]; then
        ok "레포 '${repo}' → 앱 '${repo}' 연결 완료"
      else
        echo -e "${YELLOW}  ⚠ [$(ts)] 연결 실패: HTTP ${CONN_CODE}${NC}"
      fi
    done
  fi
fi

# 8.3 Start / Stop / Deploy 동작 테스트 (첫 번째 running 앱)
label "8.3 Start / Stop / Deploy 동작 테스트"
_APPS8b=$(mktemp)
curl -s -o "$_APPS8b" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
TEST_APP_NAME8=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_APPS8b}','utf8'));
  const a=(d.apps||[]).find(x=>x.status==='running');
  if(a)process.stdout.write(a.name);
" 2>/dev/null || true)
rm -f "$_APPS8b"

if [ -n "$TEST_APP_NAME8" ]; then
  # Stop
  STOP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${TEST_APP_NAME8}/stop" 2>/dev/null || echo "000")
  if [ "$STOP_CODE" = "200" ]; then
    ok "${TEST_APP_NAME8}: Stop → HTTP 200"
  else
    fail "${TEST_APP_NAME8}: Stop → HTTP ${STOP_CODE}"
  fi
  sleep 2

  # Start
  START_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${TEST_APP_NAME8}/start" 2>/dev/null || echo "000")
  if [ "$START_CODE" = "200" ]; then
    ok "${TEST_APP_NAME8}: Start → HTTP 200"
  else
    fail "${TEST_APP_NAME8}: Start → HTTP ${START_CODE}"
  fi
  sleep 3

  # Deploy
  DEPLOY_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${TEST_APP_NAME8}/deploy" 2>/dev/null || echo "000")
  if [ "$DEPLOY_CODE" = "202" ]; then
    ok "${TEST_APP_NAME8}: Deploy → HTTP 202 (job started)"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${TEST_APP_NAME8}: Deploy → HTTP ${DEPLOY_CODE}${NC}"
  fi
else
  info "running 상태 앱 없음 — Start/Stop/Deploy 테스트 건너뜀"
fi

# 8.4 Gitea 레포 접근 확인 (autologin 경유 + API 직접)
label "8.4 Gitea 레포 접근 검증"
if [ -n "$GITEA_TOKEN" ]; then
  _REPOS8b=$(mktemp)
  curl -s -H "Authorization: token ${GITEA_TOKEN}" \
    "http://localhost/git/api/v1/user/repos" -o "$_REPOS8b" 2>/dev/null
  REPO_NAMES=$(node -e "
    const d=JSON.parse(require('fs').readFileSync('${_REPOS8b}','utf8'));
    d.forEach(r=>console.log(r.name));
  " 2>/dev/null || true)
  rm -f "$_REPOS8b"

  echo "$REPO_NAMES" | while read -r rname; do
    [ -z "$rname" ] && continue
    # API access
    API_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: token ${GITEA_TOKEN}" \
      "http://localhost/git/api/v1/repos/admin/${rname}" 2>/dev/null || echo "000")
    # Autologin redirect
    AUTO_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "http://localhost:${ADMIN_PORT}/api/gitea/autologin?redirect=/git/admin/${rname}" 2>/dev/null || echo "000")
    if [ "$API_CODE" = "200" ] && [ "$AUTO_CODE" = "302" ]; then
      ok "Gitea/${rname}: API=200 Autologin=302"
    else
      fail "Gitea/${rname}: API=${API_CODE} Autologin=${AUTO_CODE}"
    fi
  done
else
  echo -e "${YELLOW}  ⚠ [$(ts)] Gitea 토큰 없음 — 레포 접근 검증 건너뜀${NC}"
fi

# 8.5 Gitea Web UI 접근 (Traefik 경유)
label "8.5 Gitea Web UI (/git/) 접근"
GIT_HOME_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/git/" 2>/dev/null || echo "000")
GIT_LOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/git/user/login" 2>/dev/null || echo "000")
GIT_EXPLORE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/git/explore/repos" 2>/dev/null || echo "000")
if [ "$GIT_HOME_CODE" = "200" ] && [ "$GIT_LOGIN_CODE" = "200" ] && [ "$GIT_EXPLORE_CODE" = "200" ]; then
  ok "Gitea Web UI: home=200 login=200 explore=200"
else
  fail "Gitea Web UI: home=${GIT_HOME_CODE} login=${GIT_LOGIN_CODE} explore=${GIT_EXPLORE_CODE}"
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 9: Modal API + CreateApp 필드명 검증 + 16종 스택 ID + Domain Settings
# ─────────────────────────────────────────────────────────────────────────────
step_start 9 "Modal API / 16종 스택 / Domain Settings / Toast 관련 API 검증"

# 9.1 /api/apps/boilerplates — 설치된 보일러플레이트 목록
label "9.1 /api/apps/boilerplates — 설치된 스택 조회"
_BP9=$(mktemp)
BP_CODE=$(curl -s -o "$_BP9" -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/apps/boilerplates" 2>/dev/null || echo "000")
if [ "$BP_CODE" = "200" ]; then
  BP_COUNT=$(node -e "
    const d=JSON.parse(require('fs').readFileSync('${_BP9}','utf8'));
    process.stdout.write(String((d.boilerplates||[]).length));
  " 2>/dev/null || echo "0")
  ok "/api/apps/boilerplates → HTTP 200 (${BP_COUNT}개 설치됨)"
else
  fail "/api/apps/boilerplates → HTTP ${BP_CODE}"
  ALL_PASS=false
fi
rm -f "$_BP9"

# 9.2 Create-app appName 필드 검증 (올바른 필드명 사용 확인)
label "9.2 create-app API — appName/language/frameworkId 필드명 검증"
_CREATE9=$(mktemp)
C9_APP="brewnet-field-test"
# 포트 충돌 방지: 임시 포트
C9_PORT=19977
# 사전 정리
curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${C9_APP}" 2>/dev/null || true
rm -rf "$HOME/brewnet/my-homeserver/apps/${C9_APP}" 2>/dev/null || true

C9_CODE=$(curl -s -o "$_CREATE9" -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"appName\":\"${C9_APP}\",\"mode\":\"new-project\",\"language\":\"nodejs\",\"frameworkId\":\"express\",\"port\":${C9_PORT}}" \
  "http://localhost:${ADMIN_PORT}/api/apps/create" 2>/dev/null || echo "000")
C9_JOB=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_CREATE9}','utf8'));
  process.stdout.write(d.jobId||'');
" 2>/dev/null || echo "")
rm -f "$_CREATE9"

if [ -n "$C9_JOB" ] && ([ "$C9_CODE" = "200" ] || [ "$C9_CODE" = "202" ]); then
  ok "create-app (appName/language/frameworkId) → HTTP ${C9_CODE} | jobId: ${C9_JOB}"
  # Gitea steps 완료 확인 (최대 2분 폴링)
  C9_GITEA_OK=false
  for p9 in $(seq 1 24); do
    sleep 5
    _J9=$(mktemp)
    curl -s -o "$_J9" "http://localhost:${ADMIN_PORT}/api/apps/jobs/${C9_JOB}" 2>/dev/null || true
    C9_STATUS=$(node -e "
      const d=JSON.parse(require('fs').readFileSync('${_J9}','utf8'));
      process.stdout.write(d.status||'unknown');
    " 2>/dev/null || echo "unknown")
    if [ "$C9_STATUS" = "done" ] || [ "$C9_STATUS" = "failed" ]; then
      C9_GITEA=$(node -e "
        const d=JSON.parse(require('fs').readFileSync('${_J9}','utf8'));
        const steps=d.steps||[];
        const s=steps.find(x=>x.label==='Gitea setup');
        const r=steps.find(x=>x.label==='Gitea repo');
        process.stdout.write(s?.status==='done'&&r?.status==='done'?'ok':'fail');
      " 2>/dev/null || echo "fail")
      rm -f "$_J9"
      if [ "$C9_GITEA" = "ok" ]; then
        ok "create-app Gitea 스텝 완료 (status=${C9_STATUS})"
        C9_GITEA_OK=true
      else
        fail "create-app Gitea 스텝 실패 (status=${C9_STATUS})"
        ALL_PASS=false
      fi
      break
    fi
    rm -f "$_J9"
    sub "[${p9}/24] status=${C9_STATUS}"
  done
  if [ "$C9_GITEA_OK" = false ] && [ -z "${C9_GITEA+x}" ]; then
    fail "create-app 타임아웃 (2분)"
    ALL_PASS=false
  fi
else
  fail "create-app → HTTP ${C9_CODE} | jobId 없음"
  ALL_PASS=false
fi
# 사후 정리
curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${C9_APP}" 2>/dev/null || true
rm -rf "$HOME/brewnet/my-homeserver/apps/${C9_APP}" 2>/dev/null || true

# 9.3 App 상세 모달 API 검증 (첫 번째 앱 기준)
label "9.3 App 상세 모달 API (overview/git/logs/domain)"
_APPS9=$(mktemp)
curl -s -o "$_APPS9" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
FIRST_APP=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_APPS9}','utf8'));
  const a=(d.apps||[])[0];
  if(a)process.stdout.write(a.name);
" 2>/dev/null || echo "")
rm -f "$_APPS9"

if [ -n "$FIRST_APP" ]; then
  # Overview (GET /api/apps/:name)
  OV_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}" 2>/dev/null || echo "000")
  if [ "$OV_CODE" = "200" ]; then ok "  Overview /api/apps/${FIRST_APP} → 200"; else fail "  Overview → ${OV_CODE}"; ALL_PASS=false; fi

  # Git info (GET /api/apps/:name/git)
  GIT_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/git" 2>/dev/null || echo "000")
  if [ "$GIT_CODE" = "200" ]; then ok "  Git /api/apps/${FIRST_APP}/git → 200"; else echo -e "${YELLOW}  ⚠ [$(ts)] Git → ${GIT_CODE} (Gitea 미연결 가능)${NC}"; fi

  # Logs SSE (GET /api/apps/:name/logs — Content-Type: text/event-stream)
  # Use verbose GET (not HEAD) to capture actual streaming response headers
  LOGS_CT=$(curl -s -v --max-time 2 \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/logs" 2>&1 \
    | grep -i '^< content-type' | head -1 || true)
  if echo "$LOGS_CT" | grep -qi 'event-stream'; then
    ok "  Logs /api/apps/${FIRST_APP}/logs → SSE (text/event-stream) ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] Logs SSE Content-Type: ${LOGS_CT:-없음}${NC}"
  fi

  # Deploy settings (GET /api/apps/:name/deploy/settings)
  DS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/deploy/settings" 2>/dev/null || echo "000")
  if [ "$DS_CODE" = "200" ]; then ok "  Deploy settings → 200"; else fail "  Deploy settings → ${DS_CODE}"; fi

  # Start/Stop/Deploy 응답 코드 확인 (toast 연동 핵심 경로)
  STA_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/start" 2>/dev/null || echo "000")
  if [ "$STA_CODE" = "200" ]; then ok "  Start /api/apps/${FIRST_APP}/start → 200 (toast 트리거 경로 정상)"; else fail "  Start → ${STA_CODE}"; ALL_PASS=false; fi
  sleep 1

  STO_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/stop" 2>/dev/null || echo "000")
  if [ "$STO_CODE" = "200" ]; then ok "  Stop /api/apps/${FIRST_APP}/stop → 200 (toast 트리거 경로 정상)"; else fail "  Stop → ${STO_CODE}"; ALL_PASS=false; fi
  sleep 1

  DEP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://localhost:${ADMIN_PORT}/api/apps/${FIRST_APP}/deploy" 2>/dev/null || echo "000")
  if [ "$DEP_CODE" = "202" ]; then ok "  Deploy /api/apps/${FIRST_APP}/deploy → 202 (job 시작됨)";
  elif [ "$DEP_CODE" = "200" ]; then ok "  Deploy → 200"; else fail "  Deploy → ${DEP_CODE}"; fi

else
  info "등록된 앱 없음 — 모달 API 검증 건너뜀"
fi

# 9.4 Domain 관련 API 검증
label "9.4 Domain Settings + Domain List API"
# Domain list
DL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/domain/list" 2>/dev/null || echo "000")
if [ "$DL_CODE" = "200" ]; then ok "/api/domain/list → 200"; else fail "/api/domain/list → ${DL_CODE}"; ALL_PASS=false; fi

# Domain apps
DA_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/domain/apps" 2>/dev/null || echo "000")
if [ "$DA_CODE" = "200" ]; then ok "/api/domain/apps → 200"; else echo -e "${YELLOW}  ⚠ /api/domain/apps → ${DA_CODE}${NC}"; fi

# Cloudflare settings (Domain Setting Modal 백엔드) — X-Admin-Password 헤더 필요
CF_PASS=""
if [ -f "$SECRETS_FILE" ]; then CF_PASS=$(cat "$SECRETS_FILE" 2>/dev/null | tr -d '[:space:]' || true); fi
CF_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Admin-Password: ${CF_PASS}" \
  "http://localhost:${ADMIN_PORT}/api/settings/cloudflare" 2>/dev/null || echo "000")
if [ "$CF_CODE" = "200" ]; then ok "/api/settings/cloudflare → 200 (Domain Setting 모달 백엔드 정상)"; else fail "/api/settings/cloudflare → ${CF_CODE}"; ALL_PASS=false; fi

# Domain connect endpoint 존재 확인 (POST /api/domain/connect)
# 잘못된 데이터로 호출 — 400/422가 정상 (endpoint 존재 확인)
DC_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"appName":"__test__","hostname":""}' \
  "http://localhost:${ADMIN_PORT}/api/domain/connect" 2>/dev/null || echo "000")
if [ "$DC_CODE" = "400" ] || [ "$DC_CODE" = "422" ] || [ "$DC_CODE" = "200" ]; then
  ok "/api/domain/connect → HTTP ${DC_CODE} (endpoint 존재 확인)"
else
  fail "/api/domain/connect → HTTP ${DC_CODE} (예상: 400/422)"
fi

# 9.5 16종 Stack ID 유효성 검증 (create-app API 기준)
label "9.5 16종 Boilerplate Stack ID 검증 (/api/apps/check-port 활용)"
ALL16_STACKS=(
  "go-gin" "go-echo" "go-fiber"
  "rust-actix-web" "rust-axum"
  "java-springboot" "java-spring"
  "kotlin-ktor" "kotlin-springboot"
  "nodejs-express" "nodejs-nestjs" "nodejs-nextjs" "nodejs-nextjs-full"
  "python-fastapi" "python-django" "python-flask"
)
VALID_STACK_COUNT=0
for sid in "${ALL16_STACKS[@]}"; do
  # 각 stackId로 boilerplate 모드 create 시도 — 설치 여부에 따라 200/400/500 분기
  # 여기서는 스택 ID가 서버에서 인식되는지만 확인 (빈 appName으로 400을 유도, 500은 stackId 자체 오류)
  _SID_TMP=$(mktemp)
  SID_CODE=$(curl -s -o "$_SID_TMP" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"appName\":\"\",\"mode\":\"boilerplate\",\"stackId\":\"${sid}\",\"port\":3000}" \
    "http://localhost:${ADMIN_PORT}/api/apps/create" 2>/dev/null || echo "000")
  SID_ERR=$(node -e "
    try{const d=JSON.parse(require('fs').readFileSync('${_SID_TMP}','utf8'));process.stdout.write(d.error||'');}catch(e){}
  " 2>/dev/null || echo "")
  rm -f "$_SID_TMP"
  # appName 빈 경우 → 202(jobId 반환, 이후 실패) 또는 400/500
  # stackId 자체가 없는 경우 → 특정 에러 메시지 ("not found" 등)
  # 여기서는 jobId가 오면 스택 ID는 형식상 유효하다고 판단
  if [ "$SID_CODE" = "202" ] || [ "$SID_CODE" = "200" ] || ([ "$SID_CODE" = "400" ] && echo "$SID_ERR" | grep -qv "Unknown stack"); then
    VALID_STACK_COUNT=$((VALID_STACK_COUNT + 1))
    sub "  ${sid} → HTTP ${SID_CODE} (인식됨)"
    # 생성된 job이 있으면 정리 (빈 이름으로 생성된 앱)
    sleep 0.5
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${sid} → HTTP ${SID_CODE} err=${SID_ERR}${NC}"
  fi
done
ok "16종 스택 ID 확인: ${VALID_STACK_COUNT}/16 인식됨"
if [ "$VALID_STACK_COUNT" -lt 12 ]; then
  fail "스택 ID 인식률 낮음 (${VALID_STACK_COUNT}/16)"
  ALL_PASS=false
fi

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 10: 앱 생성 전체 라이프사이클 (Create → Start → Stop → Deploy → Delete)
# ─────────────────────────────────────────────────────────────────────────────
step_start 10 "Create App 라이프사이클 (nodejs-express: create/start/stop/deploy/delete)"

LC_APP="tc-lifecycle-test"
LC_PORT=19978
GITEA_USER_LC="admin"
ADMIN_PASS_LC=""
if [ -f "$SECRETS_FILE" ]; then ADMIN_PASS_LC=$(cat "$SECRETS_FILE" 2>/dev/null | tr -d '[:space:]' || true); fi

# 사전 정리
label "10.0 사전 정리"
curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}" 2>/dev/null || true
rm -rf "$HOME/brewnet/my-homeserver/apps/${LC_APP}" 2>/dev/null || true
if [ -n "$ADMIN_PASS_LC" ]; then
  curl -s -o /dev/null -X DELETE -u "${GITEA_USER_LC}:${ADMIN_PASS_LC}" \
    "http://localhost/git/api/v1/repos/${GITEA_USER_LC}/${LC_APP}" 2>/dev/null || true
fi
sleep 1

# 10.1 앱 생성
label "10.1 Create App (nodejs-express, port auto-select from ${LC_PORT})"
_LC1=$(mktemp)
LC1_CODE=$(curl -s -o "$_LC1" -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"appName\":\"${LC_APP}\",\"mode\":\"new-project\",\"language\":\"nodejs\",\"frameworkId\":\"express\",\"port\":${LC_PORT}}" \
  "http://localhost:${ADMIN_PORT}/api/apps/create" 2>/dev/null || echo "000")
LC1_JOB=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_LC1}','utf8'));
  process.stdout.write(d.jobId||'');
" 2>/dev/null || echo "")
rm -f "$_LC1"

if [ -n "$LC1_JOB" ] && ([ "$LC1_CODE" = "200" ] || [ "$LC1_CODE" = "202" ]); then
  ok "create-app → HTTP ${LC1_CODE} | jobId: ${LC1_JOB}"
else
  fail "create-app 실패 → HTTP ${LC1_CODE}"
  ALL_PASS=false
  step_done
fi

# 10.2 Job 완료 대기 (최대 3분)
label "10.2 앱 생성 완료 대기 (job ${LC1_JOB}, 최대 3분)"
LC2_STATUS="pending"
LC2_APP_PORT=""
for p10 in $(seq 1 36); do
  sleep 5
  _J10=$(mktemp)
  curl -s -o "$_J10" "http://localhost:${ADMIN_PORT}/api/apps/jobs/${LC1_JOB}" 2>/dev/null || true
  LC2_STATUS=$(node -e "
    const d=JSON.parse(require('fs').readFileSync('${_J10}','utf8'));
    process.stdout.write(d.status||'unknown');
  " 2>/dev/null || echo "unknown")
  rm -f "$_J10"
  if [ "$LC2_STATUS" = "done" ] || [ "$LC2_STATUS" = "failed" ]; then
    break
  fi
  sub "[${p10}/36] status=${LC2_STATUS}"
done

if [ "$LC2_STATUS" = "done" ]; then
  ok "앱 생성 완료 (${p10}*5초 소요)"
else
  fail "앱 생성 실패 또는 타임아웃 (status=${LC2_STATUS})"
  ALL_PASS=false
  # 정리하고 스킵
  curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}" 2>/dev/null || true
  step_done
fi

# 앱 포트 조회
_APP10=$(mktemp)
curl -s -o "$_APP10" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
LC2_APP_PORT=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('${_APP10}','utf8'));
  const a=(d.apps||[]).find(x=>x.name==='${LC_APP}');
  if(a)process.stdout.write(String(a.port||''));
" 2>/dev/null || echo "")
rm -f "$_APP10"
info "앱 포트: ${LC2_APP_PORT:-알 수 없음}"

# 10.3 localhost 접속 확인
label "10.3 localhost 접속 확인 (http://127.0.0.1:${LC2_APP_PORT:-${LC_PORT}}/health)"
if [ -n "$LC2_APP_PORT" ]; then
  # Health check
  HC_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${LC2_APP_PORT}/health" 2>/dev/null || echo "000")
  if [ "$HC_CODE" = "200" ]; then
    ok "localhost health → 200 ✅"
  else
    fail "localhost health → ${HC_CODE}"
    ALL_PASS=false
  fi
  # 프론트엔드 접속 (port 기준)
  FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${LC2_APP_PORT}/" 2>/dev/null || echo "000")
  sub "frontend port ${LC2_APP_PORT} → HTTP ${FE_CODE}"
else
  echo -e "${YELLOW}  ⚠ [$(ts)] 포트 정보 없음 — 접속 확인 건너뜀${NC}"
fi

# 10.4 Gitea 레포 생성 확인
label "10.4 Gitea 레포 생성 확인"
if [ -n "$ADMIN_PASS_LC" ]; then
  GR_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${GITEA_USER_LC}:${ADMIN_PASS_LC}" \
    "http://localhost/git/api/v1/repos/${GITEA_USER_LC}/${LC_APP}" 2>/dev/null || echo "000")
  if [ "$GR_CODE" = "200" ]; then
    ok "Gitea 레포 ${GITEA_USER_LC}/${LC_APP} 존재 확인 ✅"
  else
    fail "Gitea 레포 없음 → HTTP ${GR_CODE}"
    ALL_PASS=false
  fi
else
  echo -e "${YELLOW}  ⚠ [$(ts)] admin_password 없음 — Gitea 레포 확인 건너뜀${NC}"
fi

# 10.5 AppDetailModal API 검증 (git, logs SSE, deploy settings)
label "10.5 AppDetailModal 백엔드 API"
GIT10_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}/git" 2>/dev/null || echo "000")
if [ "$GIT10_CODE" = "200" ]; then ok "  /api/apps/${LC_APP}/git → 200"; else echo -e "${YELLOW}  ⚠ [$(ts)] git → ${GIT10_CODE}${NC}"; fi

LOGS10_CT=$(curl -s -v --max-time 2 \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}/logs" 2>&1 \
  | grep -i '^< content-type' | head -1 || true)
if echo "$LOGS10_CT" | grep -qi 'event-stream'; then
  ok "  /api/apps/${LC_APP}/logs → SSE ✅"
else
  echo -e "${YELLOW}  ⚠ [$(ts)] Logs SSE Content-Type: ${LOGS10_CT:-없음}${NC}"
fi

DS10_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}/deploy/settings" 2>/dev/null || echo "000")
if [ "$DS10_CODE" = "200" ]; then ok "  /api/apps/${LC_APP}/deploy/settings → 200"; else fail "  deploy/settings → ${DS10_CODE}"; ALL_PASS=false; fi

# 10.6 Stop/Start 토스트 API 검증
label "10.6 Stop / Start (toast 연동 API)"
STO10=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}/stop" 2>/dev/null || echo "000")
if [ "$STO10" = "200" ]; then ok "  Stop → 200 ✅ (toast '${LC_APP} stopped' 트리거 경로)"; else fail "  Stop → ${STO10}"; ALL_PASS=false; fi
sleep 2

DEP10=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}/deploy" 2>/dev/null || echo "000")
if [ "$DEP10" = "202" ] || [ "$DEP10" = "200" ]; then
  ok "  Deploy → ${DEP10} ✅ (ProgressModal 트리거 경로)"
  # 재배포 완료 대기 (최대 3분)
  DEP10_STATUS="pending"
  for dp in $(seq 1 36); do
    sleep 5
    _APPS10b=$(mktemp)
    curl -s -o "$_APPS10b" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
    DEP10_APP_STATUS=$(node -e "
      const d=JSON.parse(require('fs').readFileSync('${_APPS10b}','utf8'));
      const a=(d.apps||[]).find(x=>x.name==='${LC_APP}');
      process.stdout.write(a?.status||'unknown');
    " 2>/dev/null || echo "unknown")
    rm -f "$_APPS10b"
    if [ "$DEP10_APP_STATUS" = "running" ]; then DEP10_STATUS="done"; break; fi
    sub "[${dp}/36] deploy status=${DEP10_APP_STATUS}"
  done
  if [ "$DEP10_STATUS" = "done" ]; then
    ok "  재배포 완료 → running ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] 재배포 완료 타임아웃 (status=${DEP10_APP_STATUS})${NC}"
  fi
else
  fail "  Deploy → ${DEP10}"; ALL_PASS=false
fi

# 10.7 Delete 토스트 API 검증 + 정리
label "10.7 Delete (toast 연동 API + 정리)"
DEL10=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "http://localhost:${ADMIN_PORT}/api/apps/${LC_APP}" 2>/dev/null || echo "000")
if [ "$DEL10" = "200" ]; then
  ok "  Delete → 200 ✅ (toast 'App ${LC_APP} has been deleted.' 트리거 경로)"
else
  fail "  Delete → ${DEL10}"
  ALL_PASS=false
fi
# 앱 디렉토리 정리
rm -rf "$HOME/brewnet/my-homeserver/apps/${LC_APP}" 2>/dev/null || true

step_done

# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 11: 16종 보일러플레이트 전체 라이프사이클 테스트
#  각 스택: create → health → Gitea레포 → 모달API → start/stop/deploy → delete
# ─────────────────────────────────────────────────────────────────────────────
step_start 11 "16종 boilerplate 전체 생성/health/modal/start/stop/deploy/delete"

ADMIN_PASS11=""
if [ -f "$SECRETS_FILE" ]; then ADMIN_PASS11=$(cat "$SECRETS_FILE" 2>/dev/null | tr -d '[:space:]' || true); fi

# Format: appName|language|frameworkId|resolvedStackId|isUnified|port|maxPoll(×5s)
# timeout: Go/Node/Python=24(2min), Java/Kotlin=72(6min), Rust=144(12min)
ALL16_ENTRIES=(
  "tc11-go-gin|go|gin|go-gin|0|20000|24"
  "tc11-go-echo|go|echo|go-echo|0|20100|24"
  "tc11-go-fiber|go|fiber|go-fiber|0|20200|24"
  "tc11-rust-actix|rust|actix-web|rust-actix-web|0|20300|144"
  "tc11-rust-axum|rust|axum|rust-axum|0|20400|144"
  "tc11-java-sboot|java|springboot|java-springboot|0|20500|72"
  "tc11-java-spring|java|spring|java-spring|0|20600|72"
  "tc11-kotlin-ktor|kotlin|ktor|kotlin-ktor|0|20700|72"
  "tc11-kotlin-spbt|kotlin|springboot-kt|kotlin-springboot|0|20800|72"
  "tc11-node-expr|nodejs|express|nodejs-express|0|20900|24"
  "tc11-node-nest|nodejs|nestjs|nodejs-nestjs|0|21000|24"
  "tc11-node-nx-app|nodejs|nextjs-app|nodejs-nextjs|1|21100|24"
  "tc11-node-nx-full|nodejs|nextjs|nodejs-nextjs-full|1|21200|24"
  "tc11-py-fastapi|python|fastapi|python-fastapi|0|21300|24"
  "tc11-py-django|python|django|python-django|0|21400|24"
  "tc11-py-flask|python|flask|python-flask|0|21500|24"
)

P11_PASS=0
P11_FAIL=0
P11_RESULTS=""   # "STACK:RESULT " space-separated, built up in loop

for entry in "${ALL16_ENTRIES[@]}"; do
  IFS='|' read -r S_APP S_LANG S_FW S_STACK S_UNIFIED S_PORT S_MAXPOLL <<< "$entry"

  label "── [${S_STACK}] (${S_APP}) lang=${S_LANG}/${S_FW} port=${S_PORT}"
  S_PASS=true

  # ① 사전 정리
  curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}" 2>/dev/null || true
  rm -rf "$HOME/brewnet/my-homeserver/apps/${S_APP}" "$HOME/brewnet/my-homeserver/${S_APP}" 2>/dev/null || true
  if [ -n "$ADMIN_PASS11" ]; then
    curl -s -o /dev/null -X DELETE -u "admin:${ADMIN_PASS11}" \
      "http://localhost/git/api/v1/repos/admin/${S_APP}" 2>/dev/null || true
  fi

  # ② 앱 생성 (new-project 모드 — UI의 "New Project" 탭과 동일)
  _S1=$(mktemp)
  S1_CODE=$(curl -s -o "$_S1" -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" \
    -d "{\"appName\":\"${S_APP}\",\"mode\":\"new-project\",\"language\":\"${S_LANG}\",\"frameworkId\":\"${S_FW}\",\"port\":${S_PORT}}" \
    "http://localhost:${ADMIN_PORT}/api/apps/create" 2>/dev/null || echo "000")
  S1_JOB=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('${_S1}','utf8'));process.stdout.write(d.jobId||'')}catch(e){}" 2>/dev/null || echo "")
  rm -f "$_S1"

  if [ -z "$S1_JOB" ]; then
    fail "${S_STACK}: create-app 실패 (HTTP ${S1_CODE})"
    P11_RESULTS="${P11_RESULTS}${S_STACK}:FAIL-create "
    P11_FAIL=$((P11_FAIL + 1))
    ALL_PASS=false
    continue
  fi
  sub "${S_STACK}: create-app jobId=${S1_JOB}"

  # ③ 완료 폴링 (스택별 타임아웃)
  S_STATUS="pending"
  S_POLL_ITER=0
  for poll in $(seq 1 "${S_MAXPOLL}"); do
    sleep 5
    S_POLL_ITER=$poll
    _SJ=$(mktemp)
    curl -s -o "$_SJ" "http://localhost:${ADMIN_PORT}/api/apps/jobs/${S1_JOB}" 2>/dev/null || true
    S_STATUS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('${_SJ}','utf8'));process.stdout.write(d.status||'unknown')}catch(e){process.stdout.write('unknown')}" 2>/dev/null || echo "unknown")
    rm -f "$_SJ"
    if [ "$S_STATUS" = "done" ] || [ "$S_STATUS" = "failed" ]; then break; fi
    # 30초마다 진행 출력
    if (( poll % 6 == 0 )); then sub "[${poll}/${S_MAXPOLL}] ${S_STACK} 생성 중... (${S_LANG}/${S_FW})"; fi
  done

  if [ "$S_STATUS" != "done" ]; then
    fail "${S_STACK}: 생성 실패/타임아웃 (status=${S_STATUS}, $((S_POLL_ITER*5))s 경과)"
    P11_RESULTS="${P11_RESULTS}${S_STACK}:FAIL-timeout "
    P11_FAIL=$((P11_FAIL + 1))
    ALL_PASS=false
    curl -s -o /dev/null -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}" 2>/dev/null || true
    continue
  fi
  ok "${S_STACK}: 생성 완료 ($((S_POLL_ITER*5))s 소요)"

  # ④ 앱 포트 조회 (auto-select 반영)
  _SAPPS=$(mktemp)
  curl -s -o "$_SAPPS" "http://localhost:${ADMIN_PORT}/api/apps" 2>/dev/null
  S_ACTUAL_PORT=$(node -e "
    try{const d=JSON.parse(require('fs').readFileSync('${_SAPPS}','utf8'));
    const a=(d.apps||[]).find(x=>x.name==='${S_APP}');
    process.stdout.write(String(a?.port||''))}catch(e){}
  " 2>/dev/null || echo "")
  rm -f "$_SAPPS"
  [ -z "$S_ACTUAL_PORT" ] && S_ACTUAL_PORT="$S_PORT"

  # ⑤ localhost 접속 — Health check (404/에러 없는지 확인)
  if [ "$S_UNIFIED" = "1" ]; then
    HC_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_APP}/health"
  else
    HC_URL="http://127.0.0.1:${S_ACTUAL_PORT}/health"
  fi
  HC_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${HC_URL}" 2>/dev/null || echo "000")
  if [ "$HC_CODE" = "200" ]; then
    ok "  ${S_STACK}: localhost health → 200 ✅ (${HC_URL})"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: localhost health → ${HC_CODE} (${HC_URL})${NC}"
    S_PASS=false
  fi

  # ⑥ 페이지 로드 확인 (404/에러가 없는지)
  if [ "$S_UNIFIED" = "1" ]; then
    PAGE_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_APP}/"
  else
    PAGE_URL="http://127.0.0.1:${S_ACTUAL_PORT}/"
  fi
  PAGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${PAGE_URL}" 2>/dev/null || echo "000")
  if [ "$PAGE_CODE" = "200" ] || [ "$PAGE_CODE" = "301" ] || [ "$PAGE_CODE" = "302" ] || [ "$PAGE_CODE" = "308" ]; then
    ok "  ${S_STACK}: 페이지 로드 → ${PAGE_CODE} ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: 페이지 → ${PAGE_CODE} (${PAGE_URL})${NC}"
  fi

  # ⑦ Gitea 레포 생성 확인
  if [ -n "$ADMIN_PASS11" ]; then
    GR11_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -u "admin:${ADMIN_PASS11}" \
      "http://localhost/git/api/v1/repos/admin/${S_APP}" 2>/dev/null || echo "000")
    if [ "$GR11_CODE" = "200" ]; then
      ok "  ${S_STACK}: Gitea 레포 admin/${S_APP} 생성 확인 ✅"
    else
      fail "  ${S_STACK}: Gitea 레포 없음 → ${GR11_CODE}"
      S_PASS=false
    fi
  fi

  # ⑧ 모달 API 검증 (Overview + git URL + Logs SSE)
  _SOV=$(mktemp)
  OV11=$(curl -s -o "$_SOV" -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}" 2>/dev/null || echo "000")
  S_GIT_URL=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('${_SOV}','utf8'));process.stdout.write(d.app?.giteaRepoUrl||'')}catch(e){}" 2>/dev/null || echo "")
  S_OV_PORT=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('${_SOV}','utf8'));process.stdout.write(String(d.app?.port||''))}catch(e){}" 2>/dev/null || echo "")
  rm -f "$_SOV"

  GI11=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/git" 2>/dev/null || echo "000")
  LOGS11_CT=$(curl -s -v --max-time 2 "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/logs" 2>&1 \
    | grep -i '^< content-type' | head -1 || true)
  DS11=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/deploy/settings" 2>/dev/null || echo "000")

  # Overview 필드 검증 (git URL, port 존재)
  if [ "$OV11" = "200" ] && [ -n "$S_GIT_URL" ] && [ -n "$S_OV_PORT" ]; then
    ok "  ${S_STACK}: Overview → 200 (giteaUrl=${S_GIT_URL} port=${S_OV_PORT}) ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: Overview=${OV11} gitUrl=${S_GIT_URL:-없음} port=${S_OV_PORT:-없음}${NC}"
    [ "$OV11" != "200" ] && S_PASS=false
  fi

  if [ "$GI11" = "200" ]; then
    ok "  ${S_STACK}: Git info → 200 ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: Git info → ${GI11}${NC}"
  fi

  if echo "$LOGS11_CT" | grep -qi 'event-stream'; then
    ok "  ${S_STACK}: Logs → SSE (text/event-stream) ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: Logs SSE Content-Type: ${LOGS11_CT:-없음}${NC}"
  fi

  if [ "$DS11" = "200" ]; then
    ok "  ${S_STACK}: Deploy settings → 200 ✅"
  else
    echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: Deploy settings → ${DS11}${NC}"
  fi

  # ⑨ Domain 탭 확인 (connect endpoint 응답)
  DOM11=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_PORT}/api/domain/apps" 2>/dev/null || echo "000")
  [ "$DOM11" = "200" ] && ok "  ${S_STACK}: Domain tab /api/domain/apps → 200 ✅" || echo -e "${YELLOW}  ⚠ [$(ts)] ${S_STACK}: domain/apps → ${DOM11}${NC}"

  # ⑩ Start / Stop / Deploy 토스트 API 경로 검증
  STO11=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/stop" 2>/dev/null || echo "000")
  if [ "$STO11" = "200" ]; then ok "  ${S_STACK}: Stop → 200 ✅ (toast 트리거)"; else fail "  ${S_STACK}: Stop → ${STO11}"; S_PASS=false; fi
  sleep 2

  STA11=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/start" 2>/dev/null || echo "000")
  if [ "$STA11" = "200" ]; then ok "  ${S_STACK}: Start → 200 ✅ (toast 트리거)"; else fail "  ${S_STACK}: Start → ${STA11}"; S_PASS=false; fi
  sleep 2

  DEP11=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}/deploy" 2>/dev/null || echo "000")
  if [ "$DEP11" = "202" ] || [ "$DEP11" = "200" ]; then
    ok "  ${S_STACK}: Deploy → ${DEP11} ✅ (ProgressModal 트리거)"
  else
    fail "  ${S_STACK}: Deploy → ${DEP11}"
    S_PASS=false
  fi
  sleep 2

  # ⑪ Delete (toast 트리거 경로)
  DEL11=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:${ADMIN_PORT}/api/apps/${S_APP}" 2>/dev/null || echo "000")
  if [ "$DEL11" = "200" ]; then
    ok "  ${S_STACK}: Delete → 200 ✅ (toast '${S_APP} deleted' 트리거)"
  else
    fail "  ${S_STACK}: Delete → ${DEL11}"
    S_PASS=false
  fi

  # 정리 (파일시스템 + Gitea)
  rm -rf "$HOME/brewnet/my-homeserver/apps/${S_APP}" "$HOME/brewnet/my-homeserver/${S_APP}" 2>/dev/null || true
  if [ -n "$ADMIN_PASS11" ]; then
    curl -s -o /dev/null -X DELETE -u "admin:${ADMIN_PASS11}" \
      "http://localhost/git/api/v1/repos/admin/${S_APP}" 2>/dev/null || true
  fi

  # 스택별 최종 결과
  if [ "$S_PASS" = "true" ]; then
    ok "✅ ${S_STACK} 모든 항목 통과"
    P11_RESULTS="${P11_RESULTS}${S_STACK}:PASS "
    P11_PASS=$((P11_PASS + 1))
  else
    fail "❌ ${S_STACK} 일부 실패"
    P11_RESULTS="${P11_RESULTS}${S_STACK}:FAIL "
    P11_FAIL=$((P11_FAIL + 1))
    ALL_PASS=false
  fi
done

# Phase 11 요약
label "Phase 11 결과 (${P11_PASS}/16 통과)"
for entry in "${ALL16_ENTRIES[@]}"; do
  IFS='|' read -r _ _ _ S_STACK _ _ _ <<< "$entry"
  RES=$(echo "$P11_RESULTS" | tr ' ' '\n' | grep "^${S_STACK}:" | cut -d: -f2 | head -1)
  case "${RES:-SKIP}" in
    PASS)             ok "  ${S_STACK}: ✅ PASS" ;;
    FAIL|FAIL-create|FAIL-timeout) fail "  ${S_STACK}: ❌ ${RES}" ;;
    *)                sub "  ${S_STACK}: — SKIP" ;;
  esac
done
if [ "$P11_FAIL" -eq 0 ]; then
  ok "Phase 11: 전체 16종 스택 통과 ✅"
else
  fail "Phase 11: ${P11_FAIL}개 스택 실패 (${P11_PASS}개 통과)"
  ALL_PASS=false
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
  echo -e "  ${RED}${BOLD}❌ 일부 스택 실패 — 위 Phase 6 결과 확인${NC}"
fi
echo -e "  ${DIM}컨테이너 상태: docker ps --filter name=brewnet${NC}"
echo -e "  ${DIM}서비스 로그:   tail -f ~/brewnet/my-homeserver/logs/*.log${NC}"
echo -e "  ${DIM}Admin 종료:    kill \$(lsof -ti :${ADMIN_PORT})${NC}"
echo ""
