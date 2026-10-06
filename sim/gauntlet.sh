#!/usr/bin/env bash
# The AI against every scripted player strategy in sim/bots.ts, in parallel, with a summary table.
# Usage: sim/gauntlet.sh <games-per-bot> [difficulty...]      (default: normal hard)
cd "$(dirname "$0")/.."
GAMES=${1:-20}; shift
DIFFS=${@:-normal hard}
BOTS=$(npx tsx -e "import {BOTS} from './sim/bots'; console.log(Object.keys(BOTS).join(' '))")
OUT=$(mktemp)
CHUNK=10
for d in $DIFFS; do for b in $BOTS; do for ((o = 0; o < GAMES; o += CHUNK)); do echo "$d $b $CHUNK $o"; done; done; done \
  | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/gauntlet.ts $0 $1 $2 $3' >> "$OUT"
python3 - "$OUT" <<'PY'
import json, sys
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
by = defaultdict(list)
for r in rows: by[(r['difficulty'], r['bot'])].append(r)
print('AI       vs bot     games  AI win%  timeout%  surrendered  avg min  AI K/D')
for (d, b), rs in sorted(by.items()):
    n = len(rs)
    pct = lambda k: 100 * sum(r['result'] == k for r in rs) // n
    kd = sum(r['killed'] for r in rs) / max(1, sum(r['lost'] for r in rs))
    print(f"{d:8} {b:9} {n:6} {pct('win'):7}  {pct('timeout'):8}  {sum(r['surrendered'] for r in rs):11}  {sum(r['time'] for r in rs) / n / 60:7.1f}  {kd:6.2f}")
PY
