// Summary of sim/cross-detail.ts lines: win rate, length, spice, per side what it built, killed and lost by type, the
// top killer>victim pairs, tech timings, and army value by minute. Usage: npx tsx sim/cross-summary.ts <file>
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
const n = rows.length;
const [a, b] = rows[0].factions as string[];
const avg = (f: (r: any) => number) => rows.reduce((s, r) => s + f(r), 0) / n;
const wins = rows.filter((r) => r.result === 'win').length;
console.log(`${a} vs ${b}: ${n} games, ${a} wins ${Math.round((100 * wins) / n)}%, avg ${(avg((r) => r.time) / 60).toFixed(1)} min (${a} wins ${(rows.filter((r) => r.result === 'win').reduce((s, r) => s + r.time, 0) / Math.max(1, wins) / 60).toFixed(1)}), spice ${Math.round(avg((r) => r.spice[0]))} / ${Math.round(avg((r) => r.spice[1]))}`);
const sum = (i: number, k: string) => { const m: Record<string, number> = {}; for (const r of rows) for (const [t, v] of Object.entries(r[k][i])) m[t] = (m[t] ?? 0) + (v as number); return m; };
const fmt = (m: Record<string, number>, div = n) => Object.entries(m).sort((x, y) => y[1] - x[1]).map(([t, v]) => `${t} ${Math.round(v / div)}`).join(', ');
for (const i of [0, 1]) {
  const f = i ? b : a;
  console.log(`\n${f}`);
  console.log(`  built/game:  ${Object.entries(sum(i, 'built')).sort((x, y) => y[1] - x[1]).map(([t, v]) => `${t} ${(v / n).toFixed(1)}`).join(', ')}`);
  const k = sum(i, 'kills'), d = sum(i, 'deaths');
  console.log(`  killed/game: ${fmt(k)}  (total ${Math.round(Object.values(k).reduce((x, y) => x + y, 0) / n)})`);
  console.log(`  lost/game:   ${fmt(d)}  (total ${Math.round(Object.values(d).reduce((x, y) => x + y, 0) / n)})`);
  console.log(`  top kills:   ${Object.entries(sum(i, 'kv')).filter(([t]) => !t.includes('[')).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([t, v]) => `${t} ${Math.round(v / n)}`).join(', ')}`);
  const tech = sum(i, 'tech'), cnt: Record<string, number> = {};
  for (const r of rows) for (const t of Object.keys(r.tech[i])) cnt[t] = (cnt[t] ?? 0) + 1;
  console.log(`  tech:        ${Object.entries(tech).sort((x, y) => x[1] / cnt[x[0]] - y[1] / cnt[y[0]]).map(([t, v]) => `${t} ${Math.round((100 * cnt[t]) / n)}%@${Math.round(v / cnt[t])}`).join(', ')}`);
  const mins = Math.max(...rows.map((r) => r.army[i].length));
  console.log(`  army by min: ${Array.from({ length: Math.min(mins, 14) }, (_, m) => { const v = rows.filter((r) => r.army[i].length > m); return v.length >= n / 2 ? Math.round(v.reduce((s, r) => s + r.army[i][m], 0) / v.length) : '-'; }).join(' ')}`);
}
