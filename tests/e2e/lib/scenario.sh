#!/usr/bin/env bash
# lib/scenario.sh — JSON field extractor for scenario files.
# Usage: source scenario.sh; scen_load /path/to/scenario.json; scen_get .admin.username

SCENARIO_FILE=""

scen_load() { SCENARIO_FILE="$1"; }

scen_get() {
  local field="$1"
  python3 -c "
import sys, json
try:
    d = json.load(open('${SCENARIO_FILE}'))
    val = d
    for k in '${field}'.lstrip('.').split('.'):
        val = val[k] if isinstance(val, dict) else None
    if val is None:
        print('')
    elif isinstance(val, bool):
        print(str(val).lower())
    elif isinstance(val, list):
        print(' '.join(str(x) for x in val))
    else:
        print(val)
except Exception:
    print('')
" 2>/dev/null
}

# Strip _e2e section and write clean BrewnetConfig to target path
scen_write_config() {
  local target="$1"
  python3 -c "
import sys, json
d = json.load(open('${SCENARIO_FILE}'))
d.pop('_e2e', None)
with open('${target}', 'w') as f:
    json.dump(d, f, indent=2)
" 2>/dev/null
}

# Get _e2e.apps.stacks as space-separated string, or default stacks
scen_get_stacks() {
  local override="${STACKS_OVERRIDE:-}"
  if [[ -n "$override" ]]; then echo "$override" | tr ',' ' '; return; fi
  python3 -c "
import sys, json
try:
    d = json.load(open('${SCENARIO_FILE}'))
    stacks = d.get('_e2e', {}).get('apps', {}).get('stacks', [])
    print(' '.join(stacks))
except Exception:
    print('')
" 2>/dev/null
}

# Get all 16 stacks
ALL_STACKS="go-gin go-echo go-fiber rust-actix-web rust-axum java-springboot java-spring kotlin-ktor kotlin-springboot nodejs-express nodejs-nestjs nodejs-nextjs nodejs-nextjs-full python-fastapi python-django python-flask"

get_stack_timeout() {
  case "$1" in
    rust-actix-web|rust-axum) echo 600 ;;
    java-springboot|java-spring|kotlin-ktor|kotlin-springboot) echo 300 ;;
    *) echo 120 ;;
  esac
}
