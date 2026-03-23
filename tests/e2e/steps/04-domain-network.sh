#!/usr/bin/env bash
# Step 04 — Domain & network: validate domain.provider is valid value

VALID_PROVIDERS="local quick-tunnel tunnel"
step_begin "04" "domain-network"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
provider=$(python3 -c "import json; print(json.load(open('$cfg'))['domain']['provider'])" 2>/dev/null)
assert_nonempty "domain.provider" "$provider"
[[ " $VALID_PROVIDERS " =~ " $provider " ]] && ok "domain.provider valid: ${provider}" || { fail "Invalid provider: ${provider}"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
