#!/usr/bin/env bash
# Every pair of named variants plays <games> matches (alternating sides).
# Usage: sim/roundrobin.sh <games> variant...
cd "$(dirname "$0")/.."
GAMES=$1; shift
VARS=("$@"); OUT=$(mktemp)
for ((i = 0; i < ${#VARS[@]}; i++)); do for ((j = i + 1; j < ${#VARS[@]}; j++)); do
  for c in 0 1; do echo "${VARS[i]} $((GAMES / 2)) $c ${VARS[j]}"; done
done; done | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/match.ts $0 $1 $2 $3' >> "$OUT"
npx tsx sim/summary.ts "$OUT" | sed -n '/Row win/,$p'
