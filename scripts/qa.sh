#!/usr/bin/env bash
# QA gate: lint, typecheck, build, unit tests, e2e tests.
# Passing sections log to .qa/<name>.log only; failing sections print their output.
# Exit code is non-zero if any section failed. Run from anywhere.
set -u
cd "$(dirname "$0")/.."

LOG_DIR=.qa
mkdir -p "$LOG_DIR"
failed=0
summary=""

run() {
  local name=$1
  shift
  local log="$LOG_DIR/$name.log"
  echo "== $name"
  if "$@" >"$log" 2>&1; then
    echo "PASS $name (log: $log)"
    summary="$summary
PASS $name"
  else
    echo "FAIL $name (exit $?, log: $log)"
    cat "$log"
    failed=1
    summary="$summary
FAIL $name"
  fi
}

run lint npm run lint
run typecheck npm run typecheck
run build npm run build
run unit npm test
run e2e npm run test:e2e

echo
echo "== summary"
echo "${summary#?}"
if [ "$failed" -eq 0 ]; then
  echo "QA PASSED"
else
  echo "QA FAILED"
  exit 1
fi
