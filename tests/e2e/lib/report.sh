#!/usr/bin/env bash
# lib/report.sh — Terminal summary table and JSON report writer.
# Requires STEP_RESULTS and APP_RESULTS arrays from assert.sh.

REPORT_DIR="${REPORT_DIR:-tests/e2e/reports}"

print_summary() {
  echo ""
  echo -e "${CYAN}${BOLD}═══════════════════════ SUMMARY ═══════════════════════${NC}"
  echo -e "${BOLD}  Installation Steps:${NC}"
  for entry in "${STEP_RESULTS[@]+"${STEP_RESULTS[@]}"}"; do
    IFS=: read -r sid sname sstatus sdur <<< "$entry"
    if [[ "$sstatus" == "pass" ]]; then
      printf "  ${GREEN}✓${NC} [%s] %-22s ${GREEN}PASS${NC} (%ss)\n" "$sid" "$sname" "$sdur"
    elif [[ "$sstatus" == "skip" ]]; then
      printf "  ${YELLOW}⚠${NC} [%s] %-22s ${YELLOW}SKIP${NC}\n" "$sid" "$sname"
    else
      printf "  ${RED}✗${NC} [%s] %-22s ${RED}FAIL${NC} (%ss)\n" "$sid" "$sname" "$sdur"
    fi
  done

  if [[ ${#APP_RESULTS[@]} -gt 0 ]]; then
    echo -e "\n${BOLD}  App Lifecycle:${NC}"
    for entry in "${APP_RESULTS[@]}"; do
      IFS=: read -r astack astatus <<< "$entry"
      if [[ "$astatus" == "pass" ]]; then
        printf "  ${GREEN}✓${NC} %-30s ${GREEN}PASS${NC}\n" "$astack"
      else
        printf "  ${RED}✗${NC} %-30s ${RED}FAIL${NC}\n" "$astack"
      fi
    done
  fi

  local total=$(( ASSERT_PASS + ASSERT_FAIL + ASSERT_SKIP ))
  echo ""
  echo -e "  Assertions: ${GREEN}${ASSERT_PASS} pass${NC} / ${RED}${ASSERT_FAIL} fail${NC} / ${YELLOW}${ASSERT_SKIP} skip${NC} (total: ${total})"
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════${NC}"
}

write_json_report() {
  local scenario="$1" ts; ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  mkdir -p "$REPORT_DIR"
  local outfile="${REPORT_DIR}/${scenario}-$(date '+%Y%m%d-%H%M%S').json"

  python3 -c "
import json, sys
steps = []
for e in sys.argv[1].split('|'):
    if not e: continue
    parts = e.split(':')
    steps.append({'id': parts[0], 'name': parts[1], 'status': parts[2], 'duration_s': int(parts[3])})
apps = []
for e in sys.argv[2].split('|'):
    if not e: continue
    parts = e.split(':')
    apps.append({'stack': parts[0], 'status': parts[1]})
report = {
    'scenario': sys.argv[3],
    'timestamp': sys.argv[4],
    'steps': steps,
    'apps': apps,
    'summary': {
        'total': int(sys.argv[5]) + int(sys.argv[6]) + int(sys.argv[7]),
        'pass': int(sys.argv[5]), 'fail': int(sys.argv[6]), 'skip': int(sys.argv[7])
    }
}
print(json.dumps(report, indent=2))
" \
    "$(IFS='|'; echo "${STEP_RESULTS[*]+${STEP_RESULTS[*]}}")" \
    "$(IFS='|'; echo "${APP_RESULTS[*]+${APP_RESULTS[*]}}")" \
    "$scenario" "$ts" "$ASSERT_PASS" "$ASSERT_FAIL" "$ASSERT_SKIP" \
    > "$outfile" 2>/dev/null
  echo "$outfile"
}
