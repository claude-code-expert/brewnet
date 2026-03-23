#!/usr/bin/env bash
# Step 05 — Review: full config JSON completeness lint (required fields present)

step_begin "05" "review"
STEP_FAIL=0

cfg="$E2E_CONFIG_FILE"
# Full JSON completeness lint using python3
python3 - "$cfg" <<'PYEOF'
import sys, json
required = [
    ('schemaVersion',), ('projectName',), ('projectPath',), ('setupType',),
    ('admin', 'username'), ('admin', 'password'),
    ('servers', 'webServer', 'service'),
    ('servers', 'gitServer', 'enabled'),
    ('domain', 'provider'),
]
try:
    d = json.load(open(sys.argv[1]))
    missing = []
    for path in required:
        cur = d
        try:
            for k in path: cur = cur[k]
            if cur == '' or cur is None: missing.append('.'.join(path))
        except (KeyError, TypeError):
            missing.append('.'.join(path))
    if missing:
        print(f"MISSING: {', '.join(missing)}")
        sys.exit(1)
    else:
        print("OK")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
PYEOF
[[ $? -eq 0 ]] && ok "JSON lint passed" || { fail "JSON lint failed"; STEP_FAIL=1; }

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
