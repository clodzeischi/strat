#!/usr/bin/env bash
# Brutal variants (sim/brutal-match.ts) against an opponent, in parallel, with a summary table.
# Usage: sim/brutal.sh <games> <opponent[,opponent...]> variant...
cd "$(dirname "$0")/.."
GAMES=${1:-20}; OPPS=${2:-hard}; shift 2
VARS=${@:-brutal}
OUT=$(mktemp)
CHUNK=5
for o in ${OPPS//,/ }; do for v in $VARS; do for ((s = 0; s < GAMES; s += CHUNK)); do echo "$v $o $CHUNK $s"; done; done; done \
  | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/brutal-match.ts $0 $1 $2 $3' >> "$OUT"
python3 - "$OUT" <<'PY'
import json, sys
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
by = defaultdict(list)
for r in rows: by[(r['opponent'], r['variant'])].append(r)
print('vs        variant          games  win%  t/o%  min   K/D   spice/opp @5m  harv lost/killed  snipes paras op-kills op-lost$ extr bails  air-lost  mends  flanks')
for (o, v), rs in sorted(by.items()):
    n = len(rs)
    pct = lambda k: 100 * sum(r['result'] == k for r in rs) // n
    kd = sum(r['killed'] for r in rs) / max(1, sum(r['lost'] for r in rs))
    avg = lambda k: sum(r.get(k, 0) for r in rs) / n
    print(f"{o:9} {v:16} {n:5} {pct('win'):5} {pct('timeout'):5} {avg('time')/60:4.1f} {kd:5.2f}  {avg('spice')/max(1,avg('oppSpice')):9.2f} {avg('spice300'):4.2f}  {avg('harvLost'):5.1f} / {avg('oppHarvLost'):5.1f}     {avg('snipes'):6.1f} {avg('paras'):5.1f} {avg('opKills'):8.1f} {avg('opLosses'):8.0f} {avg('extractions'):4.1f} {avg('paraBails'):5.1f}  {avg('carryallsLost'):8.1f}  {avg('mends'):5.1f}  {avg('flanks'):6.1f}")
PY
echo "raw: $OUT"
