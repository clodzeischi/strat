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

// ---- Stage 2 abilities, each on a fresh map with just the units involved ----
function arena(): { g2: Game; at: (dx: number, dz: number) => { x: number; z: number }; step: (s: number) => void } {
  const g2 = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['corrino', 'atreides']);
  for (const u of [...g2.units]) {
    u.hp = 0;
    (g2 as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  g2.update(0.05);
  const m = g2.map;
  const mid = m.size / 2;
  const at = (dx: number, dz: number) => {
    const c = m.nearestCell(Math.round(mid + dx), Math.round(mid + dz), (x, z) => m.canEnter(x, z, 'vehicle'), 20)!;
    return { x: m.center(c.cx), z: m.center(c.cz) };
  };
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) g2.update(0.05);
  };
  return { g2, at, step };
}

{
  const { g2, at, step } = arena();
  const p0 = at(0, -6);
  const arty = g2.spawnUnit('artillery', C, p0.x, p0.z, Math.PI / 2);
  applyCommand(g2, C, { c: 'deploy', units: [arty.id], on: true });
  step(UNITS.artillery.deploy!.time + 0.2);
  check(arty.deployState === 'deployed', 'Artillery deploys');
  const x0 = arty.x;
  applyCommand(g2, C, { c: 'go', units: [arty.id], x: arty.x + 20, z: arty.z, target: null, attack: false });
  step(1);
  check(arty.x === x0, 'deployed Artillery ignores move orders');
  // A spotter by the target, so the Artillery's side can see it.
  const spot = at(0, 5);
  g2.spawnUnit('trooper', C, spot.x, spot.z);
  const pt = at(0, 6);
  const sitter = g2.spawnUnit('tank', A, pt.x, pt.z);
  sitter.order = { kind: 'idle' };
  (sitter.def as { weapon: unknown }) === sitter.def; // keep the tank from wandering: it has no target in sight
  step(8);
  check(sitter.dead || sitter.hp < sitter.maxHp, 'deployed Artillery shells a target its side can see, out of its own sight');
  // A target off to the side: the turret swings round, the hull doesn't.
  const side = at(12, -6);
  g2.spawnUnit('trooper', C, side.x - 3, side.z).hp = 1e6;
  const flank = g2.spawnUnit('tank', A, side.x, side.z);
  flank.hp = 1e6;
  arty.target = flank;
  const hull = arty.heading;
  step(4);
  const toFlank = Math.atan2(flank.z - arty.z, flank.x - arty.x);
  check(arty.heading === hull && Math.abs(arty.turretHeading - toFlank) < 0.15, 'it aims by turning its turret, the hull stays put');
  // Something driving straight through it doesn't shove it.
  const ax = arty.x;
  const az = arty.z;
  const bully = g2.spawnUnit('tank', C, arty.x - 6, arty.z);
  bully.command(g2, { kind: 'move', x: arty.x + 6, z: arty.z });
  step(4);
  check(arty.x === ax && arty.z === az, 'a deployed Soulcrusher is not pushed by other units');
  applyCommand(g2, C, { c: 'deploy', units: [arty.id], on: false });
  step(UNITS.artillery.deploy!.time + 0.2);
  check(arty.deployState === 'mobile', 'and packs up again');
}
{
  // Unguided: a trike driving across the line of fire gets away; one parked doesn't.
  const { g2, at, step } = arena();
  const p0 = at(-12, 0);
  const arty = g2.spawnUnit('artillery', C, p0.x, p0.z, 0);
  arty.setDeployed(true);
  step(UNITS.artillery.deploy!.time + 0.2);
  const pt = at(2, -8);
  const mover = g2.spawnUnit('trike', A, pt.x, pt.z);
  const goal = at(2, 8);
  const spot = at(0, 0);
  g2.spawnUnit('trooper', C, spot.x, spot.z).hp = 1e6; // spotter that survives the trike
  let hits = 0;
  const dmg = g2.damage.bind(g2);
  (g2 as { damage: Game['damage'] }).damage = (t, w, mult, by) => {
    if (t === mover && w === UNITS.artillery.deploy!.weapon) hits++;
    dmg(t, w, mult, by);
  };
  arty.target = mover;
  mover.command(g2, { kind: 'move', x: goal.x, z: goal.z });
  step(2);
  check(hits === 0, 'a moving trike drives out from under the shells');
}
{
  const { g2, at, step } = arena();
  const p0 = at(0, 0);
  const razor = g2.spawnUnit('razor', C, p0.x, p0.z, Math.PI / 2);
  const inf: Unit[] = [];
  for (const dx of [-0.6, 0, 0.6]) inf.push(g2.spawnUnit('infantry', A, p0.x + dx, p0.z + 3));
  for (const u of inf) u.hp = 1e4;
  step(1.5);
  check(inf.filter((u) => u.hp < 1e4).length >= 2, 'the Razor flamethrower burns several infantry at once');
  void razor;
}
{
  const { g2, at, step } = arena();
  const p0 = at(-6, 0);
  const dev = g2.spawnUnit('devastator', C, p0.x, p0.z, 0);
  const pi = at(-6, 2);
  const inf = g2.spawnUnit('infantry', A, pi.x, pi.z);
  inf.hp = 1e4;
  const pt = at(-2, 3);
  const tank = g2.spawnUnit('tank', A, pt.x, pt.z);
  tank.hp = 1e4;
  let mainOnMove = 0;
  let mainStill = 0;
  const fire = g2.fire.bind(g2);
  (g2 as { fire: Game['fire'] }).fire = (u, t, w) => {
    if (u === dev && w === dev.def.weapon) {
      if (dev.path.length > 0) mainOnMove++;
      else mainStill++;
    }
    fire(u, t, w);
  };
  const far = at(-6, 14);
  dev.command(g2, { kind: 'move', x: far.x, z: far.z });
  step(2);
  check(inf.hp < 1e4, 'the Devastator machine gun fires on the move');
  check(mainOnMove === 0, 'its main gun does not');
  dev.command(g2, { kind: 'idle' });
  step(4);
  check(mainStill > 0, 'standing still, the main gun fires');
}
{
  const { g2, at, step } = arena();
  const p0 = at(0, 0);
  const dev = g2.spawnUnit('devastator', C, p0.x, p0.z);
  dev.shields = 1e6; // keep it alive until it blows
  const near: Unit[] = [];
  for (const [dx, dz] of [[2, 0], [-2, 1], [0, 3]]) {
    const p = at(dx, dz);
    near.push(g2.spawnUnit('tank', A, p.x, p.z));
  }
  const pf = at(14, 0);
  const far = g2.spawnUnit('tank', A, pf.x, pf.z);
  applyCommand(g2, C, { c: 'detonate', units: [dev.id] });
  step(UNITS.devastator.detonate!.delay - 0.3);
  check(!dev.dead, 'self-destruct waits for its delay');
  step(0.6);
  check(dev.dead && near.every((u) => u.dead || u.hp < u.maxHp * 0.4) && !far.dead && far.hp === far.maxHp, 'then wrecks what is near and spares what is far');
}
{
  const { g2, at, step } = arena();
  const p0 = at(0, 0);
  const raider = g2.spawnUnit('raider', C, p0.x, p0.z);
  applyCommand(g2, C, { c: 'mine', units: [raider.id] });
  applyCommand(g2, C, { c: 'mine', units: [raider.id] });
  check(g2.mines.length === 1, 'a Sky Raider lays a mine, then waits for its cooldown');
  const ph = at(8, 0);
  const harv = g2.spawnUnit('harvester', A, ph.x, ph.z);
  const pi = at(-6, 0);
  const inf = g2.spawnUnit('infantry', A, pi.x, pi.z);
  step(1.5);
  inf.command(g2, { kind: 'move', x: p0.x + 4, z: p0.z });
  step(4);
  check(inf.dead && g2.mines.length === 0, 'an infantryman walking over a mine is killed');
  raider.nextMine = 0;
  raider.x = harv.x - 4;
  raider.z = harv.z;
  applyCommand(g2, C, { c: 'mine', units: [raider.id] });
  step(1.5);
  harv.command(g2, { kind: 'move', x: harv.x - 8, z: harv.z });
  step(4);
  check(!harv.dead && harv.hp < harv.maxHp, 'a harvester survives a mine, worn down');
}
{
  const { g2, at, step } = arena();
  g2.teams[C].credits = 1e5;
  const yard = g2.placeBuilding('conyard', C, 4, 4);
  const bk = g2.placeBuilding('barracks', C, 9, 4);
  bk.setLevel(2);
  void yard;
  const rally = at(4, 4);
  g2.spawnUnit('trooper', C, rally.x + 1, rally.z); // eyes on the rally point
  step(0.5);
  applyCommand(g2, C, { c: 'rally', buildings: [bk.id], x: rally.x, z: rally.z });
  applyCommand(g2, C, { c: 'train', type: 'trooper' });
  let sawPod = false;
  for (let t = 0; t < UNITS.trooper.buildTime + 5; t += 0.05) {
    g2.update(0.05);
    if (g2.units.some((u) => u.falling?.pod)) sawPod = true;
  }
  const landed = g2.units.filter((u) => u.team === C && u.type === 'trooper' && Math.hypot(u.x - rally.x, u.z - rally.z) < 10 && !u.falling);
  check(sawPod && landed.length === 2, 'Imperial Barracks drop new infantry by pod on a visible rally point');
}

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
