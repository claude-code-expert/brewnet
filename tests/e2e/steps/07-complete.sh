#!/usr/bin/env bash
# Step 07 — Complete: verify all endpoints are reachable

step_begin "07" "complete"
STEP_FAIL=0

assert_http_wait "Traefik HTTP" "http://localhost" "200" 15
assert_http_wait "Gitea"        "http://localhost/git" "200" 15

# Admin dashboard
admin_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:8088" 2>/dev/null || echo "000")
[[ "$admin_code" == "200" ]] && ok "Admin dashboard → ${admin_code}" || { fail "Admin dashboard → ${admin_code}"; STEP_FAIL=1; }

# Apps list API
apps_json=$(api_get "/api/apps" 2>/dev/null || echo "[]")
apps_count=$(python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d) if isinstance(d,list) else len(d.get('apps',[])))" <<< "$apps_json" 2>/dev/null || echo "0")
ok "Apps registered: ${apps_count}"

[[ $STEP_FAIL -eq 0 ]] && step_end "pass" || step_end "fail"
