// Checks Fremen mechanics: the tech tree, building on sand, Spice Crews setting up camps that earn and pack up again,
// hiding in the sand (and being found, and coming out to fire), Ambush, sand walking, Death Commandos, the Sandworm
// keeping to the sand and its limit, Fremen healing, and that it all stays deterministic.
// Usage: npx tsx sim/fremen-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, FACTIONS, HIDE, TILE, UNITS, type BuildingType, type Team } from '../src/config';
import { Building, Unit } from '../src/entities';
import { hypot } from '../src/game/hypot';
import { ROCK, SAND, SPICE } from '../src/map';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) g.update(0.05);
};
const F: Team = 0;
const A: Team = 1;
const m = g.map;

check(g.units.filter((u) => u.team === F).map((u) => u.type).join() === FACTIONS.fremen.start.join(), 'Fremen start with their own units');
check(!g.canBuild(F, 'refinery') && !g.canTrain(F, 'harvester') && !g.canBuild(A, 'sietch'), 'no refinery or harvesters for Fremen, no Sietch for others');

// A spot of a given ground near the team's yard.
function place(team: Team, type: BuildingType, ground?: number): Building {
  const yard = g.buildings.find((b) => b.team === team && b.type === 'conyard')!;
  for (let r = 2; r < 20; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = yard.cx + dx;
      const cz = yard.cz + dz;
      if (ground !== undefined && (!m.inBounds(cx, cz) || m.tile(cx, cz) !== ground)) continue;
      if (g.canPlace(type, team, cx, cz)) return g.placeBuilding(type, team, cx, cz);
    }
  }
  throw new Error(`no room for ${type}`);
}

g.teams[F].credits = 100000;
g.teams[A].credits = 100000;
const bks = place(F, 'barracks');
// Build on sand: a Fremen structure on sand next to the barracks is fine; Atreides can't do that.
let sandOk = false;
let sandNo = true;
for (let cz = 0; cz < m.size - 2 && !sandOk; cz++) for (let cx = 0; cx < m.size - 2; cx++) {
  if (m.tile(cx, cz) !== SAND || m.tile(cx + 1, cz + 1) !== SAND || m.tile(cx + 1, cz) !== SAND || m.tile(cx, cz + 1) !== SAND) continue;
  if (g.canPlace('barracks', F, cx, cz)) { sandOk = true; if (g.canPlace('barracks', A, cx, cz)) sandNo = false; break; }
}
check(sandOk, 'Fremen can build on open sand near their structures');
check(sandNo && FACTIONS.atreides.buildOnSand === undefined, "Atreides can't build on sand");
check(!g.canPlace('camp', F, bks.cx + 4, bks.cz), 'a Spice Camp is not built at the yard');
check(g.canTrain(F, 'warrior') && g.canTrain(F, 'crew') && !g.canTrain(F, 'fedaykin') && !g.canTrain(F, 'commando'), 'Barracks trains Warriors and Crews; Fedaykin and Commandos need a Sietch');
place(F, 'sietch');
check(g.canTrain(F, 'fedaykin') && g.canTrain(F, 'commando') && !g.canBuild(F, 'thumper'), 'the Sietch unlocks Fedaykin and Commandos, not yet the Thumper');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(BUILDINGS.sietch.levelUp!.time + 1);
check(g.canBuild(F, 'thumper'), 'the Great Sietch unlocks the Thumper');
const thumper = place(F, 'thumper', SAND);
check(m.tile(thumper.cx, thumper.cz) === SAND, 'the Thumper stands on sand');
let rockThumper = false;
for (let cz = 0; cz < m.size; cz++) for (let cx = 0; cx < m.size; cx++) if (m.tile(cx, cz) === ROCK && g.canPlace('thumper', F, cx, cz)) rockThumper = true;
check(!rockThumper, "a Thumper can't go on rock");
check(g.canTrain(F, 'worm'), 'the Thumper calls Sandworms');

// ---- Spice Crew -> camp -> credits -> pack up ----
const crew = g.units.find((u) => u.team === F && u.type === 'crew')!;
const yard = g.buildings.find((b) => b.team === F && b.type === 'conyard')!;
const field = m.nearestCell(yard.cx, yard.cz, (x, z) => m.tile(x, z) === SPICE && g.spiceAround(m.center(x), m.center(z)) > 15, 40)!;
crew.command(g, { kind: 'move', x: m.center(field.cx), z: m.center(field.cz) });
run(60);
check(g.campSpot(crew) !== null, 'the crew can set up on the spice field');
const before = g.teams[F].credits;
const harvested = g.teams[F].stats.spiceHarvested;
applyCommand(g, F, { c: 'deploy', units: [crew.id], on: true });
const camp = g.buildings.find((b) => b.team === F && b.type === 'camp');
check(!!camp && crew.dead, 'the crew turns into a Spice Camp');
run(30);
const earned = g.teams[F].stats.spiceHarvested - harvested;
console.log(`      camp earned ${earned.toFixed(0)} in 30 s (${(earned / 30).toFixed(1)}/s), credits ${before.toFixed(0)} -> ${g.teams[F].credits.toFixed(0)}`);
check(earned > 30 * BUILDINGS.camp.extract!.rate * 0.8, 'the camp turns spice into credits');
applyCommand(g, F, { c: 'pack', buildings: [camp!.id] });
check(camp!.dead && g.units.some((u) => u.team === F && u.type === 'crew' && !u.dead), 'the camp packs up into a crew again');
const crew2 = g.units.find((u) => u.team === F && u.type === 'crew' && !u.dead)!;
crew2.command(g, { kind: 'move', x: yard.x, z: yard.z });
run(40);
check(g.campSpot(crew2) === null, 'no camp away from spice');

// ---- Hiding ----
// An open patch of sand away from both bases, with a Fremen warrior standing still on it.
const sandSpot = m.nearestCell(m.size >> 1, m.size >> 1, (x, z) => {
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (!m.inBounds(x + dx, z + dz) || m.tile(x + dx, z + dz) !== SAND) return false;
  return true;
}, 40)!;
const sx = m.center(sandSpot.cx);
const sz = m.center(sandSpot.cz);
const w = g.spawnUnit('warrior', F, sx, sz);
run(1);
check(!w.hidden, 'a fresh warrior is not hidden');
run(HIDE.delay);
check(w.hidden, 'standing still on sand, it digs in');
const watcher = g.spawnUnit('harvester', A, sx + 7, sz); // unarmed, in sight, outside detection
watcher.command(g, { kind: 'move', x: sx + 7, z: sz });
run(0.5);
check(!g.sees(A, w), 'the enemy, looking right at the spot, does not see it');
const scout = g.spawnUnit('harvester', A, sx + HIDE.detect, sz + 0.5);
scout.command(g, { kind: 'move', x: sx + HIDE.detect, z: sz + 0.5 });
run(0.3);
check(g.sees(A, w), 'an enemy right next to it finds it');
for (const e of [scout, watcher]) g.damage(e, UNITS.tank.weapon!, 100, null);
w.command(g, { kind: 'move', x: sx, z: sz });
run(HIDE.delay + 2);
check(w.hidden, 'hidden again once the enemy is gone');
const gunner = g.spawnUnit('infantry', A, sx + 9, sz);
gunner.command(g, { kind: 'move', x: sx + 9, z: sz });
run(1);
check(gunner.target === null && w.hidden && w.target === null, "an enemy in sight can't target it, and it lies in wait rather than go after one out of range");
gunner.x = sx + 4;
gunner.command(g, { kind: 'move', x: sx + 4, z: sz });
run(0.8);
check(!w.hidden && g.sees(A, w), 'firing at what walks into range brings it out of hiding');
g.damage(gunner, UNITS.tank.weapon!, 100, null);
const wr = g.spawnUnit('warrior', F, m.center(yard.cx - 1), m.center(yard.cz - 1));
run(HIDE.delay + 0.5);
check(!wr.hidden, "Fremen don't hide on rock");

// Ambush: the first shots out of hiding hit harder.
const shots = (ambush: boolean) => {
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  if (ambush) t.teams[F].upgrades.add('ambush');
  const a = t.spawnUnit('warrior', F, sx, sz);
  for (let k = 0; k < 80; k++) t.update(0.05);
  const v = t.spawnUnit('tank', A, sx + 4.5, sz);
  v.command(t, { kind: 'move', x: sx + 4.5, z: sz });
  for (let k = 0; k < 40; k++) t.update(0.05);
  void a;
  return v.maxHp - v.hp;
};
const plain = shots(false);
const amb = shots(true);
console.log(`      2 s of warrior fire on a tank: ${plain.toFixed(0)} plain, ${amb.toFixed(0)} with Ambush`);
check(amb > plain * 1.3, 'Ambush adds damage to shots out of hiding');

// Sand walking: a warrior crosses sand faster than rock.
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const a = t.spawnUnit('warrior', F, sx, sz);
  check(Math.abs(a.speed(t) - UNITS.warrior.speed * 1.2) < 1e-6, 'Fremen infantry are 20% faster on sand');
  t.teams[F].upgrades.add('sandwalk');
  check(Math.abs(a.speed(t) - UNITS.warrior.speed * 1.45) < 1e-6, 'Sandwalk makes it 45%');
  const r = t.spawnUnit('warrior', F, m.center(yard.cx - 1), m.center(yard.cz - 1));
  check(r.speed(t) === UNITS.warrior.speed, 'normal speed on rock');
}

// ---- Death Commando ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const ayard = t.buildings.find((b) => b.team === A && b.type === 'conyard')!;
  const c = t.spawnUnit('commando', F, ayard.x + 8, ayard.z + 8);
  c.command(t, { kind: 'attack', target: ayard });
  const hp = ayard.hp;
  for (let k = 0; k < 200 && !c.dead; k++) t.update(0.05);
  console.log(`      commando did ${(hp - ayard.hp).toFixed(0)} to a Construction Yard`);
  check(c.dead && hp - ayard.hp >= 150, 'a Death Commando runs in and blows itself up on a structure');
  check(!t.enterBunker(c, ayard), "commandos don't get into bunkers");
}

// ---- Sandworm ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const worm = t.spawnUnit('worm', F, sx, sz);
  const ayard = t.buildings.find((b) => b.team === A && b.type === 'conyard')!;
  worm.command(t, { kind: 'move', x: ayard.x, z: ayard.z });
  let onRock = false;
  for (let k = 0; k < 1200; k++) {
    t.update(0.05);
    const tile = t.map.tile(t.map.cellOf(worm.x), t.map.cellOf(worm.z));
    if (tile !== SAND && tile !== SPICE) onRock = true;
  }
  check(!onRock && worm.x !== sx, 'a Sandworm travels, but never leaves sand and spice');
  // A fresh worm out in the sand, the Atreides base out of the way.
  for (const u of t.units) if (u.team === A) u.hp = 0, t.damage(u, UNITS.tank.weapon!, 100, null);
  worm.x = sx;
  worm.z = sz;
  worm.command(t, { kind: 'idle' });
  const prey = t.spawnUnit('tank', A, worm.x + 3, worm.z);
  const prey2 = t.spawnUnit('tank', A, worm.x + 3, worm.z + 1.5);
  for (let k = 0; k < 120; k++) t.update(0.05);
  console.log(`      worm vs tanks: ${prey.hp.toFixed(0)} ${prey2.hp.toFixed(0)} worm ${worm.hp.toFixed(0)} at ${t.map.tile(t.map.cellOf(prey.x), t.map.cellOf(prey.z))} order ${worm.order.kind} target ${worm.target?.id}`);
  check(prey.dead && prey2.hp < prey2.maxHp, 'its bite wrecks a tank and hurts the one next to it');
  t.teams[F].credits = 100000;
  const tt = t.teams[F];
  void tt;
}
check(g.atLimit(F, 'worm') === false, 'no worms yet: not at the limit');
g.spawnUnit('worm', F, sx, sz);
applyCommand(g, F, { c: 'train', type: 'worm' });
check(g.atLimit(F, 'worm') && !g.queueUnit(F, 'worm'), 'at most two Sandworms, counting the one being called');

// ---- Healing ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const a = t.spawnUnit('fedaykin', F, sx, sz);
  a.hp = 50;
  const y = t.buildings.find((b) => b.team === F)!;
  y.hp = y.maxHp / 2;
  for (let k = 0; k < 400; k++) t.update(0.05);
  check(a.hp > 50 && y.hp > y.maxHp / 2, 'Fremen units and structures heal on their own');
  const h1 = a.hp;
  a.hp = 50;
  a.lastHurt = t.time;
  t.teams[F].upgrades.add('stillsuit');
  for (let k = 0; k < 400; k++) t.update(0.05);
  check(a.hp - 50 > (h1 - 50) * 1.5, 'Stillsuits heal faster');
}

// ---- Setting up off the field, queued orders, dry camps moving on ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tm = t.map;
  for (const u of t.units) if (u.team === A) u.dead = true;
  const ty = t.buildings.find((b) => b.team === F && b.type === 'conyard')!;
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  // Off the spice, but with a good spot within reach: Set Up Camp walks there and sets up.
  const near = tm.nearestCell(ty.cx, ty.cz, (x, z) => tm.canEnter(x, z, 'foot') && t.spiceAround(tm.center(x), tm.center(z)) === 0
    && !!t.campSpotNear(tm.center(x), tm.center(z), 'camp', F), 60)!;
  const c1 = t.spawnUnit('crew', F, tm.center(near.cx), tm.center(near.cz));
  check(t.campSpot(c1) === null, 'a crew off the field has no spot right where it stands');
  applyCommand(t, F, { c: 'deploy', units: [c1.id], on: true });
  check(!c1.dead && c1.order.kind === 'move' && c1.queue[0]?.kind === 'deploy', 'Set Up Camp off the field: it walks to a spot nearby');
  tick(30);
  check(c1.dead && c1.becomes instanceof Building && !c1.becomes.dead, 'and sets up there (and the selection can follow it into the camp)');
  const camp1 = c1.becomes as Building;
  // Too far: nothing within reach, it stays put and says so.
  let far = tm.nearestCell(ty.cx - 2, ty.cz - 2, (x, z) => tm.canEnter(x, z, 'foot'), 10)!;
  let none = true;
  for (let k = 0; k < tm.size * tm.size; k++) {
    const x = k % tm.size;
    const z = Math.floor(k / tm.size);
    if (tm.canEnter(x, z, 'foot') && t.spiceAround(tm.center(x), tm.center(z)) === 0 && !t.campSpotNear(tm.center(x), tm.center(z), 'camp', F)) {
      far = { cx: x, cz: z };
      none = false;
      break;
    }
  }
  const c2 = t.spawnUnit('crew', F, tm.center(far.cx), tm.center(far.cz));
  if (!none) {
    applyCommand(t, F, { c: 'deploy', units: [c2.id], on: true });
    check(!c2.dead && c2.order.kind === 'idle' && !c2.queue.length, 'no spice field near: the crew stays where it is');
  }
  // Queued: walk somewhere first (Shift), then set up.
  applyCommand(t, F, { c: 'go', units: [c2.id], x: tm.center(near.cx), z: tm.center(near.cz), target: null, attack: false });
  applyCommand(t, F, { c: 'deploy', units: [c2.id], on: true, queue: true });
  check(!c2.dead && c2.queue.length === 1, 'Shift + Set Up Camp waits for the move');
  tick(60);
  check(c2.dead && c2.becomes instanceof Building, 'then sets up camp at the end of it');
  // Waypoints: a queued move after a move; a plain order or Stop drops the queue.
  const w1 = t.spawnUnit('warrior', F, ty.x + 6, ty.z + 6);
  const a = tm.nearestCell(tm.cellOf(w1.x) + 6, tm.cellOf(w1.z), (x, z) => tm.canEnter(x, z, 'foot'), 10)!;
  const b = tm.nearestCell(tm.cellOf(w1.x) + 6, tm.cellOf(w1.z) + 6, (x, z) => tm.canEnter(x, z, 'foot'), 10)!;
  applyCommand(t, F, { c: 'go', units: [w1.id], x: tm.center(a.cx), z: tm.center(a.cz), target: null, attack: false });
  applyCommand(t, F, { c: 'go', units: [w1.id], x: tm.center(b.cx), z: tm.center(b.cz), target: null, attack: false, queue: true });
  check(w1.queue.length === 1, 'Shift + right click queues a move behind the current one');
  tick(25);
  check(hypot(w1.x - tm.center(b.cx), w1.z - tm.center(b.cz)) < 1.5 * TILE && !w1.queue.length, 'the unit walks both legs');
  applyCommand(t, F, { c: 'go', units: [w1.id], x: tm.center(a.cx), z: tm.center(a.cz), target: null, attack: false });
  applyCommand(t, F, { c: 'go', units: [w1.id], x: ty.x, z: ty.z, target: null, attack: false, queue: true });
  applyCommand(t, F, { c: 'stop', units: [w1.id] });
  check(w1.order.kind === 'idle' && !w1.queue.length, 'Stop drops the queue');
  // Run a camp dry: it packs up and its crew sets up again on fresh spice nearby.
  for (const i of camp1.reach) if (tm.tiles[i] === SPICE) tm.takeSpice(i % tm.size, Math.floor(i / tm.size), 1e9);
  tick(0.1);
  const crew3 = camp1.becomes;
  check(camp1.dead && crew3 instanceof Unit && crew3.queue[0]?.kind === 'deploy', 'a camp run dry packs up and heads for spice nearby');
  tick(40);
  check(!!crew3 && crew3.dead && crew3.becomes instanceof Building && !crew3.becomes.dead, 'and sets up again there');
}

// ---- Determinism ----
const hashes = [0, 1].map(() => {
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 11, ['fremen', 'corrino']);
  const c = t.units.find((u) => u.type === 'crew')!;
  c.command(t, { kind: 'move', x: sx, z: sz });
  for (let k = 0; k < 600; k++) t.update(0.05);
  t.deployCamp(c);
  for (let k = 0; k < 600; k++) t.update(0.05);
  return t.hash();
});
check(hashes[0] === hashes[1], 'same seed, same game');
void TILE;
void ((u: Unit) => u);

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
