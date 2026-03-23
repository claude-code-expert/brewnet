#!/usr/bin/env bash
# Step 03 — Dev stack: validate devStack languages/frameworks exist in STACK_CATALOG

VALID_LANGS="nodejs go python java kotlin rust"
step_begin "03" "dev-stack"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
app_enabled=$(python3 -c "import json; print(json.load(open('$cfg'))['servers']['appServer']['enabled'])" 2>/dev/null)
if [[ "$app_enabled" == "True" || "$app_enabled" == "true" ]]; then
  langs=$(python3 -c "import json; print(' '.join(json.load(open('$cfg'))['devStack']['languages']))" 2>/dev/null)
  assert_nonempty "devStack.languages" "$langs"
  for lang in $langs; do
    [[ " $VALID_LANGS " =~ " $lang " ]] && ok "language valid: ${lang}" || { fail "Unknown language: ${lang}"; STEP_FAIL=1; }
  done
else
  skip "appServer disabled — devStack not required"
fi

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
