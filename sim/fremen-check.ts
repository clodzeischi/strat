// Checks Fremen mechanics: the tech tree, building on sand, Spice Crews setting up camps that earn and pack up again,
// hiding in the sand (and being found, and coming out to fire), Ambush, sand walking, Thumpers and the wild Sandworm
// they call (who it eats and who it leaves alone), Hold Position, Fremen healing, and that it all stays deterministic.
// Usage: npx tsx sim/fremen-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, FACTIONS, HIDE, THUMPER, TILE, UNITS, WORM, type BuildingType, type Team } from '../src/config';
import { Building, Unit } from '../src/entities';
import { hypot } from '../src/game/hypot';
import { findPath } from '../src/game/pathfinding';
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
check(g.canTrain(F, 'warrior') && g.canTrain(F, 'crew') && !g.canTrain(F, 'fedaykin'), 'Barracks trains Warriors and Crews; Fedaykin need a Sietch');
check(g.thumpBlocked(F) === 'Thumpers need a Sietch.', 'no Thumpers before the Sietch');
place(F, 'sietch');
check(g.canTrain(F, 'fedaykin') && g.thumpBlocked(F) === null, 'the Sietch unlocks Fedaykin and Thumpers');
check(!g.canBuild(F, 'thumper') && !g.canPlace('thumper', F, bks.cx + 4, bks.cz), 'Thumpers are planted by infantry, not built at the yard');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(BUILDINGS.sietch.levelUp!.time + 1);
check(g.canResearch(F, 'ambush'), 'the Great Sietch unlocks Ambush');

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

// ---- Thumpers and the wild Sandworm ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tm = t.map;
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  t.teams[F].credits = 100000;
  const fy = t.buildings.find((b) => b.team === F && b.type === 'conyard')!;
  const sietchSpot = tm.nearestCell(fy.cx, fy.cz, (x, z) => t.canPlace('sietch', F, x, z), 12)!;
  t.placeBuilding('sietch', F, sietchSpot.cx, sietchSpot.cz);
  const wormGround = (x: number, z: number) => tm.canEnter(tm.cellOf(x), tm.cellOf(z), 'worm');
  // The open patch of sand from the hiding checks; spots on it the worm can get to from there, for its prey.
  const reach = (x: number, z: number) => wormGround(x, z) && (() => {
    const p = findPath(tm, sx, sz, x, z, 'worm');
    const end = p[p.length - 1];
    return !!end && hypot(end.x - x, end.z - z) < 1;
  })();
  const spots: { x: number; z: number }[] = [];
  for (let cz = 0; cz < tm.size; cz++) for (let cx = 0; cx < tm.size; cx++) {
    const x = tm.center(cx);
    const z = tm.center(cz);
    const d = hypot(x - sx, z - sz);
    if (d >= 7 && d <= WORM.range - 2 && reach(x, z) && spots.every((s) => hypot(s.x - x, s.z - z) >= 9)) spots.push({ x, z });
  }
  console.log(`      ${spots.length} separate spots on the sand around the Thumper`);
  check(spots.length >= 3, "test setup: room on the sand for the worm's prey");
  const [p1, p2, p3, p4] = spots;
  const planter = t.spawnUnit('warrior', F, sx + 3, sz);
  const credits = t.teams[F].credits;
  applyCommand(t, F, { c: 'thump', units: [planter.id], x: sx, z: sz });
  check(planter.order.kind === 'plant', 'Plant Thumper: the warrior walks to the spot');
  tick(3);
  const thumper = t.buildings.find((b) => b.type === 'thumper' && !b.dead);
  check(!!thumper && hypot(thumper.x - sx, thumper.z - sz) < 2 * TILE && t.teams[F].credits === credits - THUMPER.cost, 'and plants a Thumper there, for its price');
  check(t.thumpBlocked(F) !== null, 'one Thumper at a time');
  // Prey: an enemy tank driving to and fro, one parked, a harvester parked, our own warrior walking about, all on the
  // sand within reach; the planter goes back to the rock by the yard and holds position there.
  const mover = t.spawnUnit('tank', A, p1.x, p1.z);
  const parked = t.spawnUnit('tank', A, p2.x, p2.z);
  const harv = t.spawnUnit('harvester', A, p3.x, p3.z);
  const own = p4 ? t.spawnUnit('warrior', F, p4.x, p4.z) : null;
  planter.x = fy.x;
  planter.z = fy.z + 3 * TILE;
  planter.command(t, { kind: 'hold' });
  let flip = false;
  const shuttle = () => {
    flip = !flip;
    const to = flip ? sx : p1.x;
    const tz = flip ? sz : p1.z;
    if (!mover.dead) mover.command(t, { kind: 'move', x: (to + p1.x) / 2, z: (tz + p1.z) / 2 });
    if (own && !own.dead) own.command(t, { kind: 'move', x: flip ? p4!.x + 2 : p4!.x - 2, z: p4!.z });
  };
  for (let k = 0; k < THUMPER.delay - 3 - 0.5; k += 1) { shuttle(); tick(1); }
  check(t.worms.length === 0 && !thumper!.dead, 'nothing comes until the Thumper has drummed its time');
  tick(1);
  check(t.worms.length === 1 && thumper!.dead, 'then a Sandworm comes up where the Thumper stood');
  for (let k = 0; k < WORM.hunt + 2; k++) { shuttle(); tick(1); }
  console.log(`      after the hunt: moving tank ${mover.dead ? 'eaten' : mover.hp.toFixed(0)}, parked tank ${parked.dead ? 'eaten' : parked.hp.toFixed(0)}, harvester ${harv.dead ? 'eaten' : harv.hp.toFixed(0)}, own warrior ${own ? (own.dead ? 'eaten' : own.hp.toFixed(0)) : '-'}`);
  check(mover.dead, 'it swallows an enemy tank that keeps moving');
  check(harv.dead, 'and a harvester, even standing still');
  check(!parked.dead && parked.hp === parked.maxHp, 'but leaves a unit that stands still alone');
  if (own) check(own.dead, 'and it eats our own units too, when they move on the sand');
  check(!planter.dead && planter.hp === planter.maxHp, 'off the sand, the planter is safe');
  check(t.worms.length === 0 && t.wormLog.length === 1 && t.wormLog[0].eatenEnemy >= UNITS.tank.cost + UNITS.harvester.cost, 'it goes back down after its hunt, and the log has what it ate');
  check(t.thumpBlocked(F) === null || t.thumpBlocked(F)!.startsWith('Next Thumper'), 'the next Thumper waits for the cooldown');
  // A Thumper destroyed before the worm comes calls nothing.
  t.teams[F].nextThumper = 0;
  const p2b = t.spawnUnit('warrior', F, sx, sz);
  check(t.plantThumper(p2b, sx, sz), 'a second Thumper, once the cooldown is over');
  const th2 = t.buildings.find((b) => b.type === 'thumper' && !b.dead)!;
  t.damage(th2, UNITS.tank.weapon!, 100, null);
  tick(THUMPER.delay + 1);
  check(th2.dead && t.worms.length === 0, 'destroyed in time, its worm never comes');
  // Not on rock.
  t.teams[F].nextThumper = 0;
  const rocky = tm.nearestCell(fy.cx, fy.cz, (x, z) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!tm.inBounds(x + dx, z + dz) || tm.tile(x + dx, z + dz) !== ROCK) return false;
    return true;
  }, 20)!;
  const p3b = t.spawnUnit('warrior', F, tm.center(rocky.cx), tm.center(rocky.cz));
  check(!t.plantThumper(p3b, p3b.x, p3b.z), "no Thumper on rock");
}

// ---- Hold Position ----
{
  // An enemy warrior in sight but out of reach: on Hold Position the infantry stays put; just standing about, it goes after it.
  const setup = (hold: boolean) => {
    const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
    const u = t.spawnUnit('infantry', A, sx - 4, sz);
    if (hold) applyCommand(t, A, { c: 'hold', units: [u.id] });
    const e = t.spawnUnit('warrior', F, sx + 4.5, sz);
    e.command(t, { kind: 'hold' });
    for (let k = 0; k < 40; k++) t.update(0.05);
    return { t, u, e };
  };
  const free = setup(false);
  check(hypot(free.u.x - (sx - 4), free.u.z - sz) > 1, 'a unit standing about goes after an enemy in sight');
  const { t, u: holder, e } = setup(true);
  check(hypot(holder.x - (sx - 4), holder.z - sz) < 0.3 && holder.target === null, 'on Hold Position, it stays put and leaves the enemy out of reach alone');
  e.x = sx + 1;
  for (let k = 0; k < 20; k++) t.update(0.05);
  check(e.hp < e.maxHp && hypot(holder.x - (sx - 4), holder.z - sz) < 0.3, 'it shoots what comes within reach, without moving');
  applyCommand(t, A, { c: 'go', units: [holder.id], x: sx - 6, z: sz, target: null, attack: false });
  check(holder.order.kind === 'move', 'a new order ends it');
}

// ---- Wind Glider ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  check(!t.canTrain(F, 'glider'), 'no gliders before the Sietch');
  const gl = t.spawnUnit('glider', F, sx, sz);
  const goal = { x: sx + 30, z: sz };
  applyCommand(t, F, { c: 'go', units: [gl.id], x: goal.x, z: goal.z, target: null, attack: false });
  tick(4);
  check(hypot(gl.x - goal.x, gl.z - goal.z) < 12 && gl.order.kind === 'idle', 'a glider flies to where it is sent');
  let still = 0;
  let far = 0;
  let lx = gl.x;
  let lz = gl.z;
  for (let k = 0; k < 200; k++) {
    t.update(0.05);
    if (hypot(gl.x - lx, gl.z - lz) < 0.05 * gl.def.speed * 0.9) still++;
    if (hypot(gl.x - goal.x, gl.z - goal.z) > gl.def.glides!.orbit * 1.6) far++;
    lx = gl.x;
    lz = gl.z;
  }
  check(still === 0, 'it never stops');
  check(far === 0, 'it circles the spot');
  applyCommand(t, F, { c: 'go', units: [gl.id], x: 0, z: 0, target: null, attack: false });
  tick(12);
  check(gl.x >= TILE && gl.z >= TILE && gl.x <= t.map.worldSize() - TILE && hypot(gl.x, gl.z) < 25, 'sent to a corner, it circles there, over the map');
  check(!gl.def.weapon && gl.def.speed > UNITS.raider.speed && gl.def.sight > UNITS.raider.sight, 'unarmed, but faster and sharper-eyed than a Sky Raider');
}

// ---- Fremen Mortar ----
{
  check(g.canTrain(F, 'mortar'), 'the Great Sietch unlocks the Fremen Mortar');
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  check(!t.canTrain(F, 'mortar'), 'not before');
  const mo = t.spawnUnit('mortar', F, sx - 5, sz);
  const d = mo.def.deploy!;
  applyCommand(t, F, { c: 'deploy', units: [mo.id], on: true });
  tick(d.time - 0.2);
  check(mo.deployState === 'deploying', `it takes ${d.time} s to set up`);
  tick(0.4);
  check(mo.deployState === 'deployed', 'then it is set up');
  applyCommand(t, F, { c: 'go', units: [mo.id], x: sx - 15, z: sz, target: null, attack: false });
  tick(1);
  check(hypot(mo.x - (sx - 5), mo.z - sz) < 0.1, 'set up, it ignores move orders');
  // A tank driving across, out beyond the tank's own reach: guided rockets follow it.
  const tank = t.spawnUnit('tank', A, sx + 6, sz - 6);
  tank.command(t, { kind: 'move', x: sx + 6, z: sz + 6 });
  tick(4);
  const hurt = tank.maxHp - tank.hp;
  console.log(`      mortar set up: ${hurt.toFixed(0)} damage to a tank crossing at range ~11 in 4 s`);
  check(hurt >= 80, 'set up, it hits a moving tank at long range with guided rockets');
  const close = t.spawnUnit('infantry', A, mo.x + 2, mo.z);
  close.command(t, { kind: 'hold' });
  const before = close.hp;
  t.damage(tank, UNITS.tank.weapon!, 100, null);
  tick(2);
  check(close.hp === before, 'it cannot fire at something right next to it');
  t.damage(close, UNITS.tank.weapon!, 100, null);
  applyCommand(t, F, { c: 'deploy', units: [mo.id], on: false });
  tick(d.time + 0.1);
  check(mo.deployState === 'mobile', 'it packs up again');
  // Mobile it fights with a pistol: far less damage than set up.
  check(mo.def.weapon!.damage < d.weapon.damage / 3 && mo.def.weapon!.range < d.weapon.range / 2, 'on the move it only has a pistol');
  // Set up in the sand, it digs in like any Fremen.
  applyCommand(t, F, { c: 'deploy', units: [mo.id], on: true });
  tick(d.time + HIDE.delay + 0.5);
  check(mo.hidden, 'set up and still on the sand, it hides');
}

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
