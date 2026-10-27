#!/usr/bin/env bash
# Everything that should pass before a push: the typechecks (game, sims, server), then every check script
# (sim/*-check.ts, determinism, the manual being up to date) in parallel, judged by exit code. Exits 1 if any failed.
# Usage: npm run check
cd "$(dirname "$0")/.."
LOG=$(mktemp -d)
fail=0
for p in tsconfig.json tsconfig.sim.json server/tsconfig.json; do
  if npx tsc --noEmit -p "$p" > "$LOG/tsc" 2>&1; then echo "ok    typecheck $p"; else echo "FAIL  typecheck $p"; head -20 "$LOG/tsc"; fail=1; fi
done
run() { # one check: its log, and a .failed marker if it exits non-zero
  local name=${1//[\/ ]/_}
  if npx tsx $1 > "$LOG/$name.log" 2>&1; then echo "ok    $1"; else echo "FAIL  $1"; touch "$LOG/$name.failed"; fi
}
export -f run; export LOG
{ ls sim/*-check.ts; echo sim/determinism.ts; echo "sim/manual.ts --check"; } |
  xargs -P "$(sysctl -n hw.ncpu 2>/dev/null || nproc)" -I{} bash -c 'run "{}"'
ls "$LOG"/*.failed > /dev/null 2>&1 && fail=1
if [ $fail = 0 ]; then echo "all checks passed"; else echo "some checks failed: logs in $LOG"; fi
exit $fail
