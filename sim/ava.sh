#!/usr/bin/env bash
# Round robin of Atreides build orders (sim/ava-strats.ts) in the mirror, on every core, with a summary.
# Usage: sim/ava.sh <games-per-pair> [strat...]      (default: every strategy; SEEDS, SIZE as in sim/ava.ts)
# Long batches: sim/snap.sh <name> sim/ava.sh ...  Raw lines are kept in $OUT (printed at the end).
cd "$(dirname "$0")/.."
GAMES=${1:-20}; shift
STRATS=(${@:-$(npx tsx -e "import {STRATS} from './sim/ava-strats'; console.log(Object.keys(STRATS).join(' '))")})
OUT=${OUT:-$(mktemp)}
CHUNK=2
for ((i = 0; i < ${#STRATS[@]}; i++)); do for ((j = i; j < ${#STRATS[@]}; j++)); do
  for ((o = 0; o < GAMES; o += CHUNK)); do echo "${STRATS[i]} ${STRATS[j]} $CHUNK $o"; done
done; done | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/ava.ts $0 $1 $2 $3' >> "$OUT"
npx tsx sim/ava-summary.ts "$OUT"
echo "raw: $OUT"
