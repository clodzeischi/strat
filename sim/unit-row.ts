// Quick matchup rows for a few unit types, without regenerating the whole table: npx tsx sim/unit-row.ts fedaykin warrior
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { FACTIONS, unitDef, type Faction, type Team, type UnitType } from '../src/config';
const OPP: UnitType[] = ['infantry', 'trike', 'tank', 'rocket', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery', 'warrior', 'fedaykin'];
const factionOf = (t: UnitType): Faction => (FACTIONS.corrino.train.includes(t) ? 'corrino' : FACTIONS.fremen.train.includes(t) ? 'fremen' : 'atreides');
function duel(a: UnitType, b: UnitType, seed: number, swap: boolean): number {
  const [ta, tb]: Team[] = swap ? [1, 0] : [0, 1];
  const factions: Faction[] = [];
  factions[ta] = factionOf(a);
  factions[tb] = factionOf(b);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, factions);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const army = (team: Team, type: UnitType, row: number, dir: number) => {
    const n = Math.round(4000 / unitDef(factions[team], type).cost);
    for (let k = 0; k < n; k++) {
      const c = m.nearestCell(mid - 8 + (k % 16), row + Math.floor(k / 16) * dir, (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz)).command(g, { kind: 'amove', x: m.center(mid), z: m.center(row - dir * 30) });
    }
  };
  army(ta, a, mid - 10, -1);
  army(tb, b, mid + 10, 1);
  const value = (t: Team) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * ((u.hp + u.shields) / (u.maxHp + u.maxShields)), 0);
  const start = Math.min(value(ta), value(tb));
  while (g.time < 120 && g.units.some((u) => u.team === ta) && g.units.some((u) => u.team === tb)) {
    g.update(0.05);
    for (const u of g.units) if (u.def.lockOn && u.target?.kind === 'unit' && g.time >= u.nextLock) g.lockOn(u, u.target);
  }
  return (value(ta) - value(tb)) / start;
}
for (const a of process.argv.slice(2) as UnitType[]) {
  const out = OPP.map((b) => {
    let s = 0;
    for (const seed of [1003, 1007, 1012]) for (const sw of [false, true]) s += duel(a, b, seed, sw) - duel(b, a, seed, sw);
    return `${b} ${(s / 12).toFixed(2)}`;
  });
  console.log(a.padEnd(9), out.join('  '));
}
