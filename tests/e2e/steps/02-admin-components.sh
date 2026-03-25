#!/usr/bin/env bash
# Step 02 — Admin & components: validate admin credentials and server flags in config JSON

step_begin "02" "admin-components"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
username=$(python3 -c "import json; print(json.load(open('$cfg'))['admin']['username'])" 2>/dev/null)
password=$(python3 -c "import json; print(json.load(open('$cfg'))['admin']['password'])" 2>/dev/null)
web_server=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['webServer']['service'])" 2>/dev/null)
git_enabled=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['gitServer']['enabled'])" 2>/dev/null)

assert_nonempty "admin.username" "$username"
assert_nonempty "admin.password" "$password"
assert_nonempty "servers.webServer.service" "$web_server"
[[ "$git_enabled" == "True" || "$git_enabled" == "true" ]] && ok "gitServer: enabled" || fail "gitServer must be enabled"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
