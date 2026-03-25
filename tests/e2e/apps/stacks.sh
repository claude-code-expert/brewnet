#!/usr/bin/env bash
# apps/stacks.sh — Run lifecycle.sh for each stack in scenario._e2e.apps.stacks

stacks=$(scen_get_stacks)
[[ "$stacks" == "all" || "$stacks" == " all " ]] && stacks="$ALL_STACKS"

if [[ -z "$stacks" ]]; then
  skip "No stacks defined in scenario._e2e.apps.stacks"
  return
fi

info "Stacks to test: ${stacks}"
for stack in $stacks; do
  STACK_PASS=true
  # Source lifecycle in subshell to isolate per-stack FAIL variable
  if ( source "$(dirname "${BASH_SOURCE[0]}")/lifecycle.sh" "$stack" ); then
    ok "Stack ${stack}: PASS"
    APP_RESULTS+=("${stack}:pass")
  else
    fail "Stack ${stack}: FAIL"
    APP_RESULTS+=("${stack}:fail")
  fi
  echo ""
done
