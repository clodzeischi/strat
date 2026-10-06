// Unit balance: equal-cost armies meet in the open (both attack-move at each other) and the value each side has
// left is printed. No upgrades. Usage: npx tsx sim/duel.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import type { UnitType } from '../src/config';

function duel(a: [UnitType, number][], b: [UnitType, number][], seed = 1003): string {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  const m = g.map;
  const mid = m.size / 2;
  const spawn = (team: 0 | 1, list: [UnitType, number][], cz: number) => {
    let k = 0;
    for (const [type, n] of list) for (let i = 0; i < n; i++, k++) {
      const c = m.nearestCell(Math.round(mid - 6 + (k % 12)), cz + Math.floor(k / 12) * (team ? 1 : -1), (x, z) => m.canEnter(x, z, 'vehicle'), 10)!;
      const u = g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
      u.command(g, { kind: 'amove', x: mid * 2, z: (team ? cz - 20 : cz + 20) * 2 });
    }
  };
  spawn(0, a, Math.round(mid) - 10);
  spawn(1, b, Math.round(mid) + 10);
  const value = (t: number) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * (u.hp / u.maxHp), 0);
  const start = [value(0), value(1)];
  while (g.time < 120 && g.units.some((u) => u.team === 0) && g.units.some((u) => u.team === 1)) g.update(0.05);
  return `${a.map(([t, n]) => n + ' ' + t).join('+')} (${start[0]}) vs ${b.map(([t, n]) => n + ' ' + t).join('+')} (${start[1]}): left ${Math.round(value(0))} / ${Math.round(value(1))} after ${Math.round(g.time)}s`;
}
console.log(duel([['rocket', 8]], [['tank', 10]]));
console.log(duel([['rocket', 8]], [['infantry', 66]]));
console.log(duel([['rocket', 8]], [['trike', 26]]));
console.log(duel([['tank', 10]], [['infantry', 66]]));
console.log(duel([['tank', 10]], [['trike', 26]]));
console.log(duel([['infantry', 66]], [['trike', 26]]));
console.log(duel([['rocket', 4], ['tank', 5]], [['tank', 5], ['trike', 13]]));
