// Equal-cost duels between Corrino and Atreides combat units, in open ground (both armies attack-move at each
// other), on a few maps with the sides swapped. Score: (Corrino value left - Atreides value left) / starting value,
// counting shields as part of a unit's value; +1 means Corrino won without a scratch, -1 the reverse.
// Usage: npx tsx sim/faction-duels.ts [budget]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { unitDef, type Faction, type Team, type UnitType } from '../src/config';

const CORRINO: UnitType[] = ['trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery'];
const ATREIDES: UnitType[] = ['infantry', 'trike', 'tank', 'rocket'];
const BUDGET = Number(process.argv[2] ?? 4500); // divides evenly by most unit prices
const SEEDS = [1003, 1007, 1012];

function duel(c: UnitType, a: UnitType, seed: number, swap: boolean): number {
  const factions: Faction[] = swap ? ['atreides', 'corrino'] : ['corrino', 'atreides'];
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, factions);
  for (const u of [...g.units]) {
    u.hp = 0;
    (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  const [tc, ta]: Team[] = swap ? [1, 0] : [0, 1];
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const spawn = (team: Team, type: UnitType, row: number, dir: number) => {
    const n = Math.max(1, Math.round(BUDGET / unitDef(g.teams[team].faction, type).cost));
    for (let k = 0; k < n; k++) {
      const cell = m.nearestCell(mid - 8 + (k % 16), row + Math.floor(k / 16) * dir, (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      const u = g.spawnUnit(type, team, m.center(cell.cx), m.center(cell.cz));
      u.command(g, { kind: 'amove', x: m.center(mid), z: m.center(row - dir * 30) });
    }
  };
  spawn(tc, c, mid - 10, -1);
  spawn(ta, a, mid + 10, 1);
  const value = (t: Team) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * ((u.hp + u.shields) / (u.maxHp + u.maxShields)), 0);
  const start = Math.min(value(tc), value(ta));
  while (g.time < 120 && g.units.some((u) => u.team === tc) && g.units.some((u) => u.team === ta)) g.update(0.05);
  return (value(tc) - value(ta)) / start;
}

console.log(`Corrino vs Atreides, equal cost ($${BUDGET} a side). +1: Corrino wins untouched, -1: Atreides does.\n`);
console.log(''.padEnd(11) + ATREIDES.map((a) => a.padStart(9)).join(''));
for (const c of CORRINO) {
  const row = ATREIDES.map((a) => {
    let sum = 0;
    let n = 0;
    for (const seed of SEEDS) for (const swap of [false, true]) {
      sum += duel(c, a, seed, swap);
      n++;
    }
    return (sum / n).toFixed(2).padStart(9);
  });
  console.log(c.padEnd(11) + row.join(''));
}
