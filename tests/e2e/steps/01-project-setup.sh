#!/usr/bin/env bash
# Step 01 — Project setup: write clean BrewnetConfig from scenario (strip _e2e)

E2E_CONFIG_FILE="/tmp/brewnet-e2e-config.json"

step_begin "01" "project-setup"
STEP_FAIL=0

# Strip _e2e and write config
scen_write_config "$E2E_CONFIG_FILE"
[[ -f "$E2E_CONFIG_FILE" ]] && ok "Config written: ${E2E_CONFIG_FILE}" || { fail "Failed to write config"; STEP_FAIL=1; }

# Validate required top-level fields
for field in schemaVersion projectName projectPath setupType; do
  val=$(python3 -c "import json; d=json.load(open('${E2E_CONFIG_FILE}')); print(d.get('${field}',''))" 2>/dev/null || echo "")
  assert_nonempty "$field" "$val" || STEP_FAIL=1
done

proj_name=$(python3 -c "import json; print(json.load(open('${E2E_CONFIG_FILE}')).get('projectName',''))" 2>/dev/null)
E2E_PROJECT_NAME="$proj_name"   # used by cleanup trap
export E2E_PROJECT_NAME

ok "Project: '${proj_name}'"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
