#!/usr/bin/env bash
# Runs every variant (or the ones named) in parallel and prints a summary table.
# Usage: sim/run.sh <games-per-chunk> <chunks> [variant...]
cd "$(dirname "$0")/.."
GAMES=${1:-10}; CHUNKS=${2:-4}; shift 2
VARS=${@:-$(npx tsx -e "import {VARIANTS} from './sim/variants'; console.log(Object.keys(VARIANTS).join(' '))")}
OUT=$(mktemp)
for v in $VARS; do for c in $(seq 0 $((CHUNKS-1))); do echo "$v $GAMES $c"; done; done \
  | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/match.ts $0 $1 $2' >> "$OUT"
npx tsx sim/summary.ts "$OUT"
