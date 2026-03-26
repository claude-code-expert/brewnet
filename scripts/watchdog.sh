#!/bin/bash
# =============================================================================
# Brewnet Watchdog — 1분 간격으로 admin-server 상태 및 프로젝트 파일 감시
#
# 사용법:
#   bash scripts/watchdog.sh              # 포그라운드 실행
#   bash scripts/watchdog.sh &            # 백그라운드 실행
#   bash scripts/watchdog.sh --once       # 1회 실행 후 종료
#
# 로그: ~/.brewnet/logs/watchdog-YYYY-MM-DD.log
# =============================================================================

set -u

INTERVAL=60  # seconds
LOG_DIR="$HOME/.brewnet/logs"
BREWNET_DIR="$HOME/.brewnet"
CONFIG_JSON="$BREWNET_DIR/config.json"
PROJECTS_DIR="$BREWNET_DIR/projects"
ADMIN_PORT=8088
ONCE=false

[ "${1:-}" = "--once" ] && ONCE=true

mkdir -p "$LOG_DIR"

# ─── Logging ──────────────────────────────────────────────────────────────────

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local level="$1"
  shift
  local msg="$*"
  local logfile="$LOG_DIR/watchdog-$(date '+%Y-%m-%d').log"
  printf '[%s] [%s] %s\n' "$ts" "$level" "$msg" >> "$logfile"
  printf '[%s] [%s] %s\n' "$ts" "$level" "$msg"
}

# ─── Check Functions ──────────────────────────────────────────────────────────

check_admin_process() {
  local pid
  pid=$(lsof -ti :"$ADMIN_PORT" 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    local uptime
    uptime=$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ')
    echo "UP pid=$pid uptime=$uptime"
  else
    echo "DOWN"
  fi
}

check_admin_http() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$ADMIN_PORT/" 2>/dev/null)
  echo "$code"
}

check_config_json() {
  if [ ! -f "$CONFIG_JSON" ]; then
    echo "MISSING"
    return
  fi
  local lastProject
  lastProject=$(python3 -c "import json; print(json.load(open('$CONFIG_JSON')).get('lastProject',''))" 2>/dev/null || echo "PARSE_ERROR")
  if [ -z "$lastProject" ]; then
    echo "EMPTY_LASTPROJECT"
  else
    echo "OK lastProject=$lastProject"
  fi
}

check_projects_dir() {
  if [ ! -d "$PROJECTS_DIR" ]; then
    echo "MISSING"
    return
  fi
  local projects
  projects=$(ls "$PROJECTS_DIR" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
  if [ -z "$projects" ]; then
    echo "EMPTY"
  else
    echo "OK projects=$projects"
  fi
}

check_selections_json() {
  local found
  found=$(find "$PROJECTS_DIR" -name "selections.json" 2>/dev/null)
  if [ -z "$found" ]; then
    echo "NONE"
  else
    echo "$found" | while read -r f; do
      local proj
      proj=$(python3 -c "import json; print(json.load(open('$f')).get('projectName','?'))" 2>/dev/null || echo "?")
      local size
      size=$(wc -c < "$f" | tr -d ' ')
      echo "$proj(${size}B)"
    done | tr '\n' ',' | sed 's/,$//'
  fi
}

check_docker_containers() {
  local count
  count=$(docker ps --filter "name=brewnet" --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" = "0" ]; then
    echo "NONE"
  else
    local names
    names=$(docker ps --filter "name=brewnet" --format '{{.Names}}' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    echo "${count} running: $names"
  fi
}

check_brewnet_dir_contents() {
  if [ ! -d "$BREWNET_DIR" ]; then
    echo "MISSING"
    return
  fi
  ls -1 "$BREWNET_DIR" 2>/dev/null | tr '\n' ',' | sed 's/,$//'
}

# ─── Snapshot ─────────────────────────────────────────────────────────────────

take_snapshot() {
  local admin_proc admin_http config_status projects_status selections docker_status dir_contents

  admin_proc=$(check_admin_process)
  admin_http=$(check_admin_http)
  config_status=$(check_config_json)
  projects_status=$(check_projects_dir)
  selections=$(check_selections_json)
  docker_status=$(check_docker_containers)
  dir_contents=$(check_brewnet_dir_contents)

  # Determine overall health
  local health="HEALTHY"
  local alerts=""

  if [[ "$admin_proc" == "DOWN" ]]; then
    health="CRITICAL"
    alerts="${alerts}[ADMIN_DOWN] "
  fi
  if [[ "$admin_http" != "200" ]]; then
    health="CRITICAL"
    alerts="${alerts}[HTTP_${admin_http}] "
  fi
  if [[ "$config_status" == "MISSING" ]]; then
    health="CRITICAL"
    alerts="${alerts}[CONFIG_MISSING] "
  fi
  if [[ "$config_status" == "EMPTY_LASTPROJECT" ]]; then
    health="CRITICAL"
    alerts="${alerts}[LASTPROJECT_EMPTY] "
  fi
  if [[ "$projects_status" == "MISSING" ]]; then
    health="CRITICAL"
    alerts="${alerts}[PROJECTS_DIR_MISSING] "
  fi
  if [[ "$selections" == "NONE" ]]; then
    health="CRITICAL"
    alerts="${alerts}[NO_SELECTIONS_JSON] "
  fi

  # Log based on health
  if [ "$health" = "HEALTHY" ]; then
    log "INFO" "admin=$admin_proc http=$admin_http config=$config_status projects=$projects_status selections=$selections docker=$docker_status"
  else
    log "ALERT" "health=$health ${alerts}| admin=$admin_proc http=$admin_http config=$config_status projects=$projects_status selections=$selections docker=$docker_status dir=$dir_contents"
  fi
}

# ─── File System Watcher (inotify/fswatch) ────────────────────────────────────

# If fswatch is available (macOS), watch for deletions in ~/.brewnet/
start_fswatch() {
  if ! command -v fswatch >/dev/null 2>&1; then
    log "INFO" "fswatch not available — using polling only"
    return
  fi

  log "INFO" "Starting fswatch on $BREWNET_DIR"
  fswatch -r --event Removed --event Renamed "$BREWNET_DIR" 2>/dev/null | while read -r event; do
    log "ALERT" "FILE_EVENT: $event"
    # Take immediate snapshot on file deletion
    take_snapshot
  done &
  FSWATCH_PID=$!
  log "INFO" "fswatch started (pid=$FSWATCH_PID)"
}

# ─── Main Loop ────────────────────────────────────────────────────────────────

log "INFO" "=== Watchdog started (interval=${INTERVAL}s) ==="
log "INFO" "Monitoring: admin-server(:$ADMIN_PORT), $CONFIG_JSON, $PROJECTS_DIR"

# Initial snapshot
take_snapshot

if $ONCE; then
  exit 0
fi

# Start filesystem watcher if available
FSWATCH_PID=""
start_fswatch

# Cleanup on exit
cleanup() {
  [ -n "$FSWATCH_PID" ] && kill "$FSWATCH_PID" 2>/dev/null
  log "INFO" "=== Watchdog stopped ==="
  exit 0
}
trap cleanup INT TERM

# Polling loop
while true; do
  sleep "$INTERVAL"
  take_snapshot
done
