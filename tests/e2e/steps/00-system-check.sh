#!/usr/bin/env bash
# Step 00 — System check: OS, Docker, ports 80/443, disk, RAM
# Sources lib/assert.sh before running.

step_begin "00" "system-check"
STEP_FAIL=0

# OS
OS_TYPE=$(uname -s)
[[ "$OS_TYPE" == "Darwin" || "$OS_TYPE" == "Linux" ]] && ok "OS: ${OS_TYPE}" || { fail "Unsupported OS: ${OS_TYPE}"; STEP_FAIL=1; }

# Docker
docker info > /dev/null 2>&1 && ok "Docker: running" || { fail "Docker daemon not running"; STEP_FAIL=1; }

# Ports 80 and 443 — check LISTEN only (not outbound connections)
for port in 80 443; do
  if lsof -ti tcp:"$port" -sTCP:LISTEN > /dev/null 2>&1; then
    # Allow if it's traefik already running from a previous install
    proc=$(lsof -ti tcp:"$port" -sTCP:LISTEN | xargs ps -p 2>/dev/null | grep -v grep | grep -v "ps -p" | tail -1 || true)
    if echo "$proc" | grep -qi "traefik\|docker"; then
      skip "Port ${port} used by Traefik/Docker (OK)"
    else
      fail "Port ${port} in use: ${proc}"; STEP_FAIL=1
    fi
  else
    ok "Port ${port}: free"
  fi
done

# Disk (≥ 20GB free in home directory)
if [[ "$(uname -s)" == "Darwin" ]]; then
  FREE_GB=$(df -g "$HOME" 2>/dev/null | awk 'NR==2{print $4}' || echo "0")
else
  FREE_GB=$(df -BG "$HOME" 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4}' || echo "0")
fi
(( FREE_GB >= 20 )) && ok "Disk: ${FREE_GB}GB free" || { fail "Disk: ${FREE_GB}GB free (need ≥ 20GB)"; STEP_FAIL=1; }

# RAM (≥ 4GB)
if [[ "$(uname -s)" == "Darwin" ]]; then
  RAM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024 ))
else
  RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0) / 1024 / 1024 ))
fi
(( RAM_GB >= 4 )) && ok "RAM: ${RAM_GB}GB" || { fail "RAM: ${RAM_GB}GB (need ≥ 4GB)"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
