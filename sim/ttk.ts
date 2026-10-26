// Time to kill: a squad attacks one target (a harvester or a structure) in the open, no defenders. Prints seconds per
// attacker setup and target, without upgrades and with Weapons (+1 / both levels). Usage: npx tsx sim/ttk.ts
// TUNE as usual (sim/tune.ts).
import * as THREE from 'three';
import { Game } from '../src/game/game';
import './tune';
import { type BuildingType, type Faction, type Team, type UnitType, type UpgradeType } from '../src/config';

const SQUADS: [string, Faction, UnitType, number, UpgradeType[][]][] = [
  ['6 Fedaykin (1200)', 'fremen', 'fedaykin', 6, [[], ['fWeapons'], ['fWeapons', 'fWeapons2']]],
  ['15 Warriors (1200)', 'fremen', 'warrior', 15, [[], ['fWeapons', 'fWeapons2']]],
  ['5 Mortars set up (1250)', 'fremen', 'mortar', 5, [[], ['fWeapons', 'fWeapons2']]],
  ['2 tanks (1000)', 'atreides', 'tank', 2, [[], ['weapons1', 'weapons2']]],
  ['5 Razors (1250)', 'corrino', 'razor', 5, [[], ['cWeapons']]],
];
const TARGETS: [string, Faction, UnitType | BuildingType, boolean][] = [
  ['Atreides harvester', 'atreides', 'harvester', false], ['Corrino harvester', 'corrino', 'harvester', false],
  ['Atreides refinery', 'atreides', 'refinery', true], ['Atreides conyard', 'atreides', 'conyard', true], ['Corrino fab', 'corrino', 'fab', true],
];

function ttk(f: Faction, type: UnitType, n: number, ups: UpgradeType[], tf: Faction, target: string, building: boolean): number {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1003, [f, tf]);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  for (const b of [...g.buildings]) { b.hp = 0; (g as any).kill(b, null); }
  for (const up of ups) g.teams[0].upgrades.add(up);
  const m = g.map;
  const c = m.nearestCell(32, 32, (x, z) => [-1, 0, 1, 2].every((dx) => [-1, 0, 1, 2].every((dz) => m.canEnter(x + dx, z + dz, 'vehicle'))), 20)!;
  const t: any = building ? g.placeBuilding(target as BuildingType, 1 as Team, c.cx - 1, c.cz - 1) : g.spawnUnit(target as UnitType, 1 as Team, m.center(c.cx), m.center(c.cz));
  for (let k = 0; k < n; k++) {
    const p = m.nearestCell(c.cx - 7 + (k % 4), c.cz - 4 + Math.floor(k / 4), (x, z) => m.canEnter(x, z, 'vehicle'), 10)!;
    const u = g.spawnUnit(type, 0 as Team, m.center(p.cx), m.center(p.cz));
    u.command(g, { kind: 'attack', target: t });
  }
  let start = -1;
  while (!t.dead && g.time < 300) {
    g.update(0.05);
    for (const u of g.units) {
      const w = u.def.deploy?.weapon;
      if (w && u.deployState === 'mobile' && Math.hypot(u.x - t.x, u.z - t.z) < w.range * 0.8) u.setDeployed(true);
      if (w && u.deployState === 'deployed' && !u.target) u.command(g, { kind: 'attack', target: t });
    }
    if (start < 0 && t.hp < t.maxHp + (t.maxShields ?? 0) && (t.hp < t.maxHp || t.shields < t.maxShields)) start = g.time;
  }
  return t.dead ? g.time - start : NaN;
}

console.log(''.padEnd(34) + TARGETS.map(([n]) => n.padStart(19)).join(''));
for (const [name, f, type, n, upSets] of SQUADS) for (const ups of upSets) {
  console.log(`${name} ${ups.length ? '+' + ups.length : ''}`.padEnd(34) + TARGETS.map(([, tf, tt, b]) => ttk(f, type, n, ups, tf, tt, b).toFixed(1).padStart(19)).join(''));
}
