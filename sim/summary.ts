import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const by = new Map<string, any[]>();
for (const r of rows) by.set(r.variant, [...(by.get(r.variant) ?? []), r]);
console.log('variant          games  win%  loss%  timeout%  avgLen  spice@5m  army@5m  2nd-ref  K/D');
for (const [v, rs] of by) {
  const pct = (k: string) => ((100 * rs.filter((r) => r.result === k).length) / rs.length).toFixed(0).padStart(4);
  const avg = (f: (r: any) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  const kd = avg((r) => r.killed) / Math.max(1, avg((r) => r.lost));
  console.log(`${v.padEnd(16)} ${String(rs.length).padStart(5)}  ${pct('win')}  ${pct('loss')}   ${pct('timeout')}    ${String(Math.round(avg((r) => r.time) / 60)).padStart(4)}m  ${String(Math.round(avg((r) => r.spiceAt5))).padStart(9)}  ${String(Math.round(avg((r) => r.armyAt5))).padStart(7)}  ${(() => { const t = rs.filter((r) => r.ref2 >= 0); return t.length ? `${Math.round((100 * t.length) / rs.length)}%@${Math.round(t.reduce((s, r) => s + r.ref2, 0) / t.length)}s` : '-'; })().padStart(8)}  ${kd.toFixed(2)}`);
}

// Round-robin matrix when matches had different opponents: row's win% against each column.
const names = [...new Set(rows.map((r) => r.variant))];
const opps = [...new Set(rows.map((r) => r.opponent))];
if (opps.length > 1) {
  const cell = (a: string, b: string) => {
    let w = 0, n = 0;
    for (const r of rows) {
      if (r.variant === a && r.opponent === b) { n++; if (r.result === 'win') w++; }
      if (r.variant === b && r.opponent === a) { n++; if (r.result === 'loss') w++; }
    }
    return n ? String(Math.round((100 * w) / n)).padStart(6) : '     -';
  };
  const all = [...new Set([...names, ...opps])];
  console.log('\nRow win% vs column' + ' '.repeat(2) + all.map((n) => n.slice(0, 6).padStart(6)).join(''));
  for (const a of all) {
    const total = all.filter((b) => b !== a).map((b) => Number(cell(a, b))).filter((x) => !isNaN(x));
    console.log(a.padEnd(20) + all.map((b) => (a === b ? '     .' : cell(a, b))).join('') + '   avg ' + Math.round(total.reduce((s, x) => s + x, 0) / total.length));
  }
}
