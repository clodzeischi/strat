// Checks Corrino's mechanics: the tech tree, shields soaking damage and recovering, health that only comes back at
// a Repair Pad, the auto turret, structures repairing themselves, and the Sky Raider flying over cliffs.
// Usage: npx tsx sim/corrino-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, FACTIONS, SHIELD_REGEN, UNITS, type BuildingType, type Team, type UnitType } from '../src/config';
import type { Building, Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['corrino', 'atreides']);
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) g.update(0.05);
};
const C: Team = 0;
const A: Team = 1;

check(g.units.filter((u) => u.team === C).map((u) => u.type).join() === FACTIONS.corrino.start.join(), 'Corrino starts with its own units');
check(g.units.filter((u) => u.team === C).every((u) => u.shields > 0 && u.shields === u.maxShields), 'Corrino units start with full shields');
check(g.units.filter((u) => u.team === A).every((u) => u.maxShields === 0), 'Atreides units have no shields');
check(!g.canBuild(C, 'factory') && !g.canBuild(C, 'bunker') && !g.canBuild(A, 'fab'), "neither side can build the other's structures");

// Place a structure next to the team's yard, wherever it fits.
function place(team: Team, type: BuildingType): Building {
  const yard = g.buildings.find((b) => b.team === team && b.type === 'conyard')!;
  for (let r = 3; r < 14; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.canPlace(type, team, yard.cx + dx, yard.cz + dz)) return g.placeBuilding(type, team, yard.cx + dx, yard.cz + dz);
    }
  }
  throw new Error(`no room for ${type}`);
}

g.teams[C].credits = 100000;
for (const t of ['refinery', 'barracks', 'fab'] as BuildingType[]) place(C, t);
check(g.canTrain(C, 'razor') && g.canTrain(C, 'trooper') && g.canTrain(C, 'harvester'), 'Barracks and Fab train Troopers, Razors and Harvesters');
check(!g.canTrain(C, 'raider') && !g.canTrain(C, 'devastator') && !g.canTrain(C, 'sardaukar'), 'Sky Raiders, Devastators and Sardaukar need more tech');
check(!g.canLevelUp(C, 'fab') && !g.canLevelUp(C, 'barracks'), 'Fab and Barracks level-ups need Tleilaxu Research');
place(C, 'tleilaxu');
check(g.canTrain(C, 'raider') && g.canTrain(C, 'artillery') && !g.canTrain(C, 'devastator'), 'Tleilaxu Research unlocks Sky Raiders and Artillery');
check(g.canLevelUp(C, 'fab') && g.canLevelUp(C, 'barracks') && !g.canLevelUp(C, 'conyard'), 'Corrino levels up Barracks and Fab, not the yard');
applyCommand(g, C, { c: 'levelUp', type: 'fab' });
run(BUILDINGS.fab.levelUp!.time + 1);
applyCommand(g, C, { c: 'levelUp', type: 'barracks' });
run(BUILDINGS.barracks.levelUp!.time + 1);
check(g.canTrain(C, 'devastator') && g.canTrain(C, 'sardaukar'), 'level-2 Fab and Barracks unlock Devastators and Sardaukar');

applyCommand(g, C, { c: 'train', type: 'harvester' });
run(UNITS.harvester.buildTime + 1);
check(g.teams[C].queues.fab.length === 0 && g.count(C, 'harvester') >= 2, 'a Corrino Harvester comes out of the Fab');

// Shields soak damage first, then recover; health doesn't.
const mid = g.map.worldSize() / 2;
const spot = (dx: number) => {
  const m = g.map;
  const c = m.nearestCell(m.cellOf(mid + dx), m.cellOf(mid), (x, z) => m.canEnter(x, z, 'vehicle'), 20)!;
  return { x: m.center(c.cx), z: m.center(c.cz) };
};
const p = spot(0);
const tank = g.spawnUnit('devastator', C, p.x, p.z);
const shot = UNITS.tank.weapon!;
g.damage(tank, shot, 1, null);
check(tank.hp === tank.maxHp && tank.shields < tank.maxShields, 'a hit on full shields leaves health alone');
tank.shields = 10;
g.damage(tank, shot, 1, null);
check(tank.shields === 0 && tank.hp < tank.maxHp, 'damage the shields cannot hold goes on to health');
const hpAfter = tank.hp;
run(SHIELD_REGEN.delay - 1);
check(tank.shields === 0, 'shields wait a few seconds after a hit');
run(SHIELD_REGEN.full + 2);
check(tank.shields === tank.maxShields, 'then refill');
check(tank.hp === hpAfter, 'health does not come back on its own');

// Repair Pad.
const padB = place(C, 'pad');
const before = g.teams[C].credits;
const pp = g.map.nearestCell(padB.cx + padB.size, padB.cz, (x, z) => g.map.canEnter(x, z, 'vehicle'), 6)!;
tank.x = g.map.center(pp.cx);
tank.z = g.map.center(pp.cz);
run(3);
check(tank.hp > hpAfter && g.teams[C].credits < before, 'the Repair Pad mends a unit parked next to it, for credits');
const hurt: Unit[] = [];
for (let k = 0; k < 3; k++) {
  const u = g.spawnUnit('trooper', C, tank.x, tank.z);
  u.hp = 20;
  hurt.push(u);
}
tank.hp = tank.maxHp;
run(0.2);
check(hurt.filter((u) => u.hp > 20).length === 2, 'two at a time');

// Self-repair.
const fab = g.buildings.find((b) => b.team === C && b.type === 'fab')!;
fab.shields = 0;
fab.hp = fab.maxHp / 2;
applyCommand(g, C, { c: 'mend', buildings: [fab.id], on: true });
run(5);
check(fab.repairing && fab.hp > fab.maxHp / 2, 'a damaged structure told to repair mends itself');

// Auto turret.
const tur = place(C, 'turret');
const trike = g.spawnUnit('trike', A, tur.x + 8, tur.z);
trike.order = { kind: 'idle' };
g.vision.update(g.units, g.buildings, g.ticks);
run(4);
check(trike.dead || trike.hp < trike.maxHp, 'the turret shoots an enemy in range');

// Sky Raider flies over cliffs.
const raider = g.spawnUnit('raider', C, 4, 4);
const far = g.map.worldSize() - 6;
raider.command(g, { kind: 'move', x: far, z: far });
run(30);
check(Math.hypot(raider.x - far, raider.z - far) < 2 && raider.y > g.map.surfaceAt(raider.x, raider.z) + 3, 'the Sky Raider flies straight across the map');

// Lockstep: the same mixed battle played twice gives the same game, checksum for checksum.
function battle(): number[] {
  const b = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 11, ['corrino', 'atreides']);
  const m = b.map;
  const mid = Math.round(m.size / 2);
  const army: [Team, UnitType[]][] = [
    [0, ['trooper', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery']],
    [1, ['infantry', 'infantry', 'trike', 'tank', 'rocket', 'rocket']],
  ];
  for (const [team, types] of army) {
    types.forEach((type, k) => {
      const c = m.nearestCell(mid - 4 + k, mid + (team ? 8 : -8), (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      b.spawnUnit(type, team, m.center(c.cx), m.center(c.cz)).command(b, { kind: 'amove', x: m.center(mid), z: m.center(mid + (team ? -20 : 20)) });
    });
  }
  const hashes: number[] = [];
  for (let t = 0; t < 1200; t++) {
    b.update(0.05);
    if (t % 20 === 0) hashes.push(b.hash());
  }
  return hashes;
}
const h1 = battle();
const h2 = battle();
check(h1.length > 0 && h1.every((h, i) => h === h2[i]), 'a Corrino vs Atreides battle is deterministic');

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
