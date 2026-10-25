// Summary of sim/ava.ts lines: strategy win rates (overall and head to head), game length, unit mix, what each unit
// type killed for what it lost, and tech timings. Usage: npx tsx sim/ava-summary.ts <file>
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
const strats = [...new Set(rows.flatMap((r) => [r.a, r.b]))];
const pad = (s: string | number, n: number) => String(s).padStart(n);
// Each game seen from both sides: [me, opp, result, sideIndex]
const views = rows.flatMap((r) => [[r.a, r.b, r.result, 0, r], [r.b, r.a, r.result === 'win' ? 'loss' : r.result === 'loss' ? 'win' : 'timeout', 1, r]] as const);
const games = rows.length;
const len = rows.reduce((s, r) => s + r.time, 0) / games / 60;
const lens = rows.map((r) => r.time / 60).sort((x, y) => x - y);
console.log(`${games} games, avg ${len.toFixed(1)} min (median ${lens[Math.floor(games / 2)].toFixed(1)}, under 8 min ${Math.round((100 * lens.filter((l) => l < 8).length) / games)}%, over 20 min ${Math.round((100 * lens.filter((l) => l > 20).length) / games)}%), timeouts ${Math.round((100 * rows.filter((r) => r.result === 'timeout').length) / games)}%`);
console.log('\nRow win% vs column (draws half)'.padEnd(26) + strats.map((s) => pad(s.slice(0, 6), 7)).join('') + '    avg');
for (const s of strats) {
  const cells = strats.map((o) => {
    const v = views.filter(([m, op]) => m === s && op === o);
    if (!v.length || s === o) return null;
    return (100 * v.reduce((x, [, , r]) => x + (r === 'win' ? 1 : r === 'timeout' ? 0.5 : 0), 0)) / v.length;
  });
  const vals = cells.filter((c): c is number => c !== null);
  console.log(s.padEnd(26) + cells.map((c) => (c === null ? pad('.', 7) : pad(Math.round(c), 7))).join('') + pad(Math.round(vals.reduce((x, y) => x + y, 0) / Math.max(1, vals.length)), 7));
}
// Unit mix, and kill value / loss value per unit type, over all sides.
const UT = ['infantry', 'trike', 'tank', 'rocket', 'repair', 'carryall', 'harvester'];
console.log('\nUnits built per game, by strategy');
console.log(''.padEnd(10) + UT.map((u) => pad(u.slice(0, 7), 9)).join('') + '   avg min');
for (const s of strats) {
  const v = views.filter(([m]) => m === s);
  console.log(s.padEnd(10) + UT.map((u) => pad((v.reduce((x, [, , , i, r]) => x + (r.built[i][u] ?? 0), 0) / v.length).toFixed(1), 9)).join('') + pad((v.reduce((x, [, , , , r]) => x + r.time, 0) / v.length / 60).toFixed(1), 10));
}
console.log('\nKilled / lost (credits per game), by unit type, all games');
const kill: Record<string, number> = {}, lost: Record<string, number> = {};
for (const r of rows) for (const i of [0, 1]) {
  for (const [k, v] of Object.entries(r.kills[i])) kill[k] = (kill[k] ?? 0) + (v as number);
  for (const [k, v] of Object.entries(r.deaths[i])) lost[k] = (lost[k] ?? 0) + (v as number);
}
for (const u of [...new Set([...Object.keys(kill), ...Object.keys(lost)])].sort((x, y) => (kill[y] ?? 0) - (kill[x] ?? 0))) {
  console.log(`  ${u.padEnd(10)} killed ${pad(Math.round((kill[u] ?? 0) / games), 6)}  lost ${pad(Math.round((lost[u] ?? 0) / games), 6)}  ratio ${((kill[u] ?? 0) / Math.max(1, lost[u] ?? 0)).toFixed(2)}`);
}
console.log('\nTech: share of sides that got it, and avg time (s)');
const T = ['conyard2', 'factory2', 'rockets', 'nitro', 'weapons1', 'armor1', 'weapons2', 'armor2', 'harvest'];
console.log(''.padEnd(10) + T.map((t) => pad(t.slice(0, 8), 12)).join(''));
for (const s of strats) {
  const v = views.filter(([m]) => m === s);
  console.log(s.padEnd(10) + T.map((t) => {
    const got = v.filter(([, , , i, r]) => r.tech[i][t] !== undefined);
    return pad(got.length ? `${Math.round((100 * got.length) / v.length)}%@${Math.round(got.reduce((x, [, , , i, r]) => x + r.tech[i][t], 0) / got.length)}` : '-', 12);
  }).join(''));
}
// Tech payoff: win% of sides that reached factory2 / conyard2 before the opponent did, in games both reached minute 10.
const payoff = (t: string) => {
  let w = 0, n = 0;
  for (const [, , res, i, r] of views) {
    const mine = r.tech[i][t], theirs = r.tech[1 - i][t];
    if (mine !== undefined && (theirs === undefined || theirs > mine + 60)) { n++; if (res === 'win') w++; }
  }
  return n ? `${Math.round((100 * w) / n)}% of ${n}` : '-';
};
console.log(`\nWin% when a side got it a minute+ before the other (or alone): factory2 ${payoff('factory2')}, conyard2 ${payoff('conyard2')}, weapons2 ${payoff('weapons2')}, rockets ${payoff('rockets')}, nitro ${payoff('nitro')}`);

// Who kills whom (credits per game), all games.
const KV: Record<string, number> = {};
for (const r of rows) for (const [k, v] of Object.entries(r.kv ?? {})) KV[k] = (KV[k] ?? 0) + (v as number);
if (Object.keys(KV).length) {
  const V = ['infantry', 'trike', 'tank', 'rocket', 'repair', 'harvester', 'carryall'];
  console.log('\nKiller (row) x victim (column), credits per game');
  console.log(''.padEnd(10) + V.map((v) => pad(v.slice(0, 7), 9)).join(''));
  for (const k of [...new Set(Object.keys(KV).map((x) => x.split('>')[0]))]) console.log(k.padEnd(10) + V.map((v) => pad(Math.round((KV[`${k}>${v}`] ?? 0) / games), 9)).join(''));
}
