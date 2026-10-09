#!/usr/bin/env bash
# Corrino AI against Atreides AI in parallel (sim/faction-match.ts), with a summary.
# Usage: sim/faction-match.sh <games> <corrinoLevel> <atreidesLevel>      e.g. sim/faction-match.sh 40 hard hard
cd "$(dirname "$0")/.."
GAMES=${1:-20}; C=${2:-hard}; A=${3:-hard}
OUT=$(mktemp)
CHUNK=2
for ((s = 0; s < GAMES; s += CHUNK)); do echo "$C $A $CHUNK $s"; done \
  | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/faction-match.ts $0 $1 $2 $3' >> "$OUT"
python3 - "$OUT" <<'PY'
import json, sys
from collections import Counter
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
n = len(rows)
if not n: sys.exit('no games')
res = Counter(r['result'] for r in rows)
avg = lambda k: sum(r[k] for r in rows) / n
built = Counter()
for r in rows: built.update(r['built'])
print(f"Corrino {rows[0]['corrino']} vs Atreides {rows[0]['atreides']}: {n} games, Corrino wins {100*res['win']//n}%, losses {100*res['loss']//n}%, timeouts {100*res['timeout']//n}%")
print(f"  avg minutes {avg('time')/60:.1f}, K/D {sum(r['killed'] for r in rows)/max(1,sum(r['lost'] for r in rows)):.2f}, spice vs opponent {avg('spice')/max(1,avg('oppSpice')):.2f}")
print(f"  per game: deploys {avg('deploys'):.1f}, self-destructs {avg('detonations'):.1f}, mines {avg('mines'):.1f}, pod drops {avg('pods'):.1f}, pad-seconds {avg('padSeconds'):.0f}, self-repair seconds {avg('selfRepairSeconds'):.0f}")
print('  built per game: ' + ', '.join(f"{t} {c/n:.1f}" for t, c in built.most_common()))
PY
echo "raw: $OUT"
