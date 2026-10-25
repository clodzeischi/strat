// Atreides counter table: equal-cost armies of two unit types meet in the open, both sides driven by Brutal's Micro
// (kiting, focus fire), on a few maps with the sides swapped. Score: (value A has left - value B has left) / value
// at the start, from -1 to +1, averaged with the mirrored fight. Done early (no upgrades) and late (both sides with
// everything: Weapons/Armor cancel out, Infantry Rockets and Trike Nitro don't). Usage: npx tsx sim/ava-duels.ts [budget]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import './tune';
import { Micro } from '../src/game/micro';
import { UNITS, type Team, type UnitType, type UpgradeType } from '../src/config';

const TYPES: UnitType[] = ['infantry', 'trike', 'tank', 'rocket'];
const BUDGET = Number(process.argv[2] ?? 3000);
const SEEDS = [1003, 1007, 1012, 1020];
const STATES: [string, UpgradeType[]][] = [['early', []], ['late', ['rockets', 'nitro', 'weapons1', 'weapons2', 'armor1', 'armor2']]];

function fight(a: UnitType, b: UnitType, ups: UpgradeType[], seed: number, swap: boolean): number {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, ['atreides', 'atreides']);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  const [ta, tb]: Team[] = swap ? [1, 0] : [0, 1];
  for (const t of [0, 1] as Team[]) for (const up of ups) g.teams[t].upgrades.add(up);
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const spawn = (team: Team, type: UnitType, row: number, dir: number) => {
    const n = Math.round(BUDGET / UNITS[type].cost);
    for (let k = 0; k < n; k++) {
      const c = m.nearestCell(mid - 8 + (k % 16), row + Math.floor(k / 16) * dir, (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      const u = g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
      u.command(g, { kind: 'amove', x: m.center(mid), z: m.center(row - dir * 30) });
    }
  };
  spawn(ta, a, mid - 10, -1);
  spawn(tb, b, mid + 10, 1);
  const micro = [new Micro(g, 0), new Micro(g, 1)];
  const value = (t: Team) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * (u.hp / u.maxHp), 0);
  const start = Math.min(value(ta), value(tb));
  let acc = 0;
  while (g.time < 150 && g.units.some((u) => u.team === ta) && g.units.some((u) => u.team === tb)) {
    g.update(0.05);
    for (const u of g.units) if (u.def.lockOn && u.target?.kind === 'unit' && g.time >= u.nextLock) g.lockOn(u, u.target);
    if ((acc += 0.05) >= 0.2) {
      acc = 0;
      for (const t of [0, 1] as Team[]) micro[t].update(g.units.filter((u) => u.team === t));
    }
  }
  return (value(ta) - value(tb)) / start;
}

for (const [name, ups] of STATES) {
  console.log(`${name} (budget ${BUDGET})`.padEnd(18) + TYPES.map((t) => t.padStart(9)).join(''));
  for (const a of TYPES) {
    const cells = TYPES.map((b) => {
      if (a === b) return '        .';
      let s = 0, n = 0;
      for (const seed of SEEDS) for (const swap of [false, true]) { s += fight(a, b, ups, seed, swap) - fight(b, a, ups, seed, !swap); n += 2; }
      return (s / n).toFixed(2).padStart(9);
    });
    console.log(a.padEnd(18) + cells.join(''));
  }
}
