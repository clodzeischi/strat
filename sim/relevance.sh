#!/usr/bin/env bash
# The mixed-army relevance test (sim/relevance.ts) for every unit of every faction against every faction, on every
# core, with a summary: per unit and enemy faction, the delta against each enemy composition, and how often it's
# positive. Usage: sim/relevance.sh [factions...]      (OUT=<file> keeps the raw lines; TUNE as usual)
cd "$(dirname "$0")/.."
FACTIONS=(${@:-atreides corrino fremen})
OUT=${OUT:-$(mktemp)}
for fa in "${FACTIONS[@]}"; do
  for x in $(npx tsx -e "import {REF} from './sim/relevance'; console.log(Object.keys(REF['$fa' as 'atreides']).join(' '))" 2>/dev/null); do
    for fb in atreides corrino fremen; do echo "$fa $fb $x"; done
  done
done | xargs -P "$(nproc)" -L1 sh -c 'npx tsx sim/relevance.ts $0 $1 $2 2>/dev/null' > "$OUT"
node -e '
const rows = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").filter((l) => l.startsWith("{")).map(JSON.parse);
const key = (r) => r.fa + " " + r.x;
const units = [...new Set(rows.map(key))];
console.log("Delta in fight score with the unit at 25% vs without it (+ = worth having), per enemy composition");
for (const fb of ["atreides", "corrino", "fremen"]) {
  console.log(`\nvs ${fb}`);
  for (const u of units) {
    const rs = rows.filter((r) => key(r) === u && r.fb === fb);
    if (!rs.length) continue;
    const pos = rs.filter((r) => r.d > 0.02).length, neg = rs.filter((r) => r.d < -0.1).length;
    console.log("  " + u.padEnd(20) + rs.map((r) => (r.d >= 0 ? "+" : "") + r.d.toFixed(2)).join(" ").padEnd(46) + ` worth it ${pos}/${rs.length}, big loss ${neg}`);
  }
}
const all = units.map((u) => { const rs = rows.filter((r) => key(r) === u); return [u, rs.filter((r) => r.d > 0.02).length / rs.length]; });
console.log("\nShare of enemy compositions where the unit is worth it: " + all.map(([u, v]) => `${u.split(" ")[1]} ${Math.round(v * 100)}%`).join(", "));
' "$OUT"
echo "raw: $OUT"
