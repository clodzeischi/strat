#!/usr/bin/env bash
# One variant against another on random maps (each map from both sides), on every core, with a summary.
# Usage: sim/versus.sh <games> <variant> [opponent]      (default opponent: hard)
cd "$(dirname "$0")/.."
GAMES=${1:-40}; A=$2; B=${3:-hard}
OUT=$(mktemp)
CHUNK=10
for ((o = 0; o < GAMES; o += CHUNK)); do echo "$A $CHUNK $o $B"; done \
  | MAPS=random xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/match.ts $0 $1 $2 $3' >> "$OUT"
npx tsx sim/summary.ts "$OUT" | head -2
