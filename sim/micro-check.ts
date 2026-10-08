// Micro on vs off: equal-cost armies meet in the open (like sim/duel.ts), one side driven by the Brutal AI's Micro,
// the other plain attack-move; then the sides swap. Prints the value each side has left.
// Usage: npx tsx sim/micro-check.ts [seed...]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { Micro } from '../src/game/micro';
import type { Team, UnitType, UpgradeType } from '../src/config';

type Army = [UnitType, number][];

function fight(a: Army, b: Army, microOn: Team | null, seed: number, ups: [UpgradeType[], UpgradeType[]] = [[], []], bunkers = 0): [number, number] {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  for (const t of [0, 1] as Team[]) for (const up of ups[t]) g.teams[t].upgrades.add(up);
  const m = g.map;
  const mid = m.size / 2;
  const spawn = (team: Team, list: Army, cz: number) => {
    let k = 0;
    for (const [type, n] of list) for (let i = 0; i < n; i++, k++) {
      const c = m.nearestCell(Math.round(mid - 6 + (k % 12)), cz + Math.floor(k / 12) * (team ? 1 : -1), (x, z) => m.canEnter(x, z, 'vehicle'), 10)!;
      const u = g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
      u.command(g, { kind: 'amove', x: mid * 2, z: (team ? cz - 24 : cz + 24) * 2 });
    }
  };
  spawn(0, a, Math.round(mid) - 10);
  spawn(1, b, Math.round(mid) + 10);
  // B digs in: bunkers in front of its line, filled from its infantry.
  for (let i = 0; i < bunkers; i++) {
    const c = m.nearestCell(Math.round(mid - 4 + i * 5), Math.round(mid) + 6, (x, z) => g.canPlace('bunker', 1, x, z) || (m.canEnter(x, z, 'vehicle') && m.canEnter(x + 1, z + 1, 'vehicle')), 10)!;
    const bk = g.placeBuilding('bunker', 1, c.cx, c.cz);
    for (const u of g.units.filter((u) => u.team === 1 && u.def.infantry && !u.carrier).slice(0, 3)) g.enterBunker(u, bk);
  }
  const micro = microOn === null ? null : new Micro(g, microOn);
  const value = (t: number) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * (u.hp / u.maxHp), 0);
  const start = [value(0), value(1)];
  let acc = 0;
  while (g.time < 150 && g.units.some((u) => u.team === 0) && g.units.some((u) => u.team === 1)) {
    g.update(0.05);
    acc += 0.05;
    if (micro && acc >= 0.2) {
      acc = 0;
      micro.update(g.units.filter((u) => u.team === microOn));
    }
  }
  return [value(0) / start[0], value(1) / start[1]];
}

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1003, 1011, 1020);
const cases: [string, Army, Army, [UpgradeType[], UpgradeType[]]?, number?][] = [
  ['tank vs infantry', [['tank', 9]], [['infantry', 40]]],
  ['tank vs infantry(R)', [['tank', 9]], [['infantry', 40]], [[], ['rockets']]],
  ['rocket vs tank', [['rocket', 8]], [['tank', 10]]],
  ['rocket vs infantry', [['rocket', 6]], [['infantry', 33]]],
  ['tank vs tank', [['tank', 8]], [['tank', 8]]],
  ['mix vs mix', [['tank', 4], ['rocket', 3], ['infantry', 6]], [['tank', 4], ['rocket', 3], ['infantry', 6]]],
  ['tank+rkt vs inf+trike', [['tank', 5], ['rocket', 3]], [['infantry', 25], ['trike', 8]]],
  ['trike vs infantry', [['trike', 12]], [['infantry', 20]]],
  ['tank vs rocket', [['tank', 10]], [['rocket', 8]]],
  ['tank+trike vs rkt+tank', [['tank', 5], ['trike', 13]], [['rocket', 4], ['tank', 5]]],
  ['tank vs 2 bunkers(R)', [['tank', 10]], [['infantry', 12], ['tank', 2]], [[], ['rockets']], 2],
];
const pct = (x: number) => String(Math.round(x * 100)).padStart(4) + '%';
console.log('case                     micro side: left (own / enemy)   no micro: left (A / B)');
for (const [name, a, b, ups, bunkers] of cases) {
  let on = [0, 0];
  let off = [0, 0];
  for (const s of seeds) {
    // Micro on A's side.
    const r1 = fight(a, b, 0, s, ups, bunkers);
    // Micro off.
    const r0 = fight(a, b, null, s, ups, bunkers);
    on = [on[0] + r1[0], on[1] + r1[1]];
    off = [off[0] + r0[0], off[1] + r0[1]];
  }
  const n = seeds.length;
  // And micro on B's side, against the same army.
  let onB = [0, 0];
  for (const s of seeds) {
    const r = fight(a, b, 1, s, ups, bunkers);
    onB = [onB[0] + r[0], onB[1] + r[1]];
  }
  console.log(`${name.padEnd(24)} A micro: ${pct(on[0] / n)} /${pct(on[1] / n)}   B micro: ${pct(onB[0] / n)} /${pct(onB[1] / n)}   none: ${pct(off[0] / n)} /${pct(off[1] / n)}`);
}
