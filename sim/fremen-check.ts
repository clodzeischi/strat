// Checks Fremen mechanics: the tech tree, building on sand, Spice Crews setting up camps that earn and pack up again,
// hiding in the sand (and being found, and coming out to fire), Ambush, sand walking, Thumpers and the wild Sandworm
// they call (who it eats and who it leaves alone), Hold Position, Fremen healing, and that it all stays deterministic.
// Usage: npx tsx sim/fremen-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, FACTIONS, HIDE, RIDE, THUMPER, TILE, UNITS, WORM, type BuildingType, type Team } from '../src/config';
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
  const yard = g.buildings.find((b) => b.team === team && b.type === FACTIONS[g.teams[team].faction].hub)!;
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
check(g.canTrain(F, 'warrior') && g.canTrain(F, 'crew'), 'Barracks trains Warriors and Crews');
// The tree: a Sietch to start, then the Great Sietch and Sietch III.
check(!g.requirementsMet(F, UNITS.fedaykin.requires) && !g.requirementsMet(F, UNITS.mortar.requires) && g.thumpBlocked(F) === 'Thumpers need Sietch III.', 'no Fedaykin, Mortars or Thumpers at level 1');
check(g.canResearch(F, 'fHarvest') && g.canResearch(F, 'sandwalk') && !g.canResearch(F, 'fWeapons') && !g.canResearch(F, 'stillsuit'), 'level 1 researches Spice Mining and Sandwalk');
check(g.canBuild(F, 'perch') && !g.canTrain(F, 'glider'), 'the High Perch can be built at once; Gliders need it');
check(!g.canBuild(F, 'thumper') && !g.canPlace('thumper', F, bks.cx + 4, bks.cz), 'Thumpers are planted by infantry, not built at the yard');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(BUILDINGS.sietch.levels![0].time + 1);
check(g.requirementsMet(F, UNITS.fedaykin.requires) && g.requirementsMet(F, UNITS.mortar.requires) && g.thumpBlocked(F) !== null, 'the Great Sietch unlocks the Fedaykin and Mortar rites, not Thumpers yet');
check(g.canResearch(F, 'fWeapons') && g.canResearch(F, 'fArmor') && g.canResearch(F, 'stillsuit') && !g.canResearch(F, 'ambush'), 'and Weapons +1, Armor +1, Stillsuits; not Ambush');
g.teams[F].upgrades.add('fWeapons');
check(!g.canResearch(F, 'fWeapons2'), 'Weapons +2 waits for Sietch III');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(BUILDINGS.sietch.levels![1].time + 1);
check(g.canResearch(F, 'ambush') && g.canResearch(F, 'fWeapons2') && !g.canResearch(F, 'fArmor2'), 'Sietch III unlocks Ambush and the second levels (after the first)');
check(g.thumpBlocked(F) === null && g.requirementsMet(F, UNITS.sandrider.requires), 'and the Sandrider rite, and Thumpers');
check(g.tier(F, 'weapons') === 1, 'Weapons +1 is tier 1');
g.teams[F].upgrades.delete('fWeapons');

// ---- Spice Crew -> camp -> credits -> pack up ----
const crew = g.units.find((u) => u.team === F && u.type === 'crew')!;
const yard = g.buildings.find((b) => b.team === F && b.type === 'sietch')!;
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
// Dig In: under at once, and it holds its fire (on its own patch of sand, in a game of its own).
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  const d = t.spawnUnit('warrior', F, sx, sz);
  applyCommand(t, F, { c: 'dig', units: [d.id] });
  tick(0.6);
  check(d.hidden && d.order.kind === 'dig', 'Dig In: under the sand at once');
  // Unarmed (an armed one this close would find it and shoot it out of the sand).
  const walker = t.spawnUnit('harvester', A, sx + UNITS.warrior.weapon!.range, sz);
  walker.command(t, { kind: 'hold' });
  tick(3);
  check(d.hidden && d.target === null && walker.hp === walker.maxHp, 'dug in, it holds its fire at an enemy in range');
  applyCommand(t, F, { c: 'stop', units: [d.id] });
  tick(1.5);
  check(walker.hp < walker.maxHp || walker.dead, 'any other order and it fights again');
}
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
  const fy = t.buildings.find((b) => b.team === F && b.type === 'sietch')!;
  fy.setLevel(2);
  fy.setLevel(3); // Thumpers need Sietch III (and a Sandrider)
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
  // The Atreides side plays on this screen: what alerts does it get?
  t.localTeam = A;
  const alerts: { text: string; x: number; z: number; kind: string }[] = [];
  t.onAlert = (text, x, z, kind) => alerts.push({ text, x, z, kind });
  const planter = t.spawnUnit('sandrider', F, sx + 3, sz);
  const credits = t.teams[F].credits;
  applyCommand(t, F, { c: 'thump', units: [planter.id], x: sx, z: sz });
  check(planter.order.kind === 'plant', 'Plant Thumper: the Sandrider walks to the spot');
  tick(3);
  const thumper = t.buildings.find((b) => b.type === 'thumper' && !b.dead);
  check(!!thumper && hypot(thumper.x - sx, thumper.z - sz) < 2 * TILE && t.teams[F].credits === credits - THUMPER.cost, 'and plants a Thumper there, for its price');
  check(t.thumpBlocked(F, planter) !== null, 'one Thumper at a time for a Sandrider');
  const heard = () => alerts.find((a) => a.text.startsWith('Thumper detected'));
  // Prey: an enemy tank driving to and fro, one parked, a harvester parked, our own warrior walking about, all on the
  // sand within reach; the planter goes back to the rock by the yard (too far to ride it) and holds position there.
  const mover = t.spawnUnit('tank', A, p1.x, p1.z);
  const parked = t.spawnUnit('tank', A, p2.x, p2.z);
  const harv = t.spawnUnit('harvester', A, p3.x, p3.z);
  const own = p4 ? t.spawnUnit('warrior', F, p4.x, p4.z) : null;
  // Ours, dug in right by our own warrior walking about (an enemy that close would find it and shoot it out of the
  // sand): the bites that take the walker leave it alone.
  const dug = p4 ? t.spawnUnit('warrior', F, p4.x, p4.z + 1.5) : null;
  if (dug) applyCommand(t, F, { c: 'dig', units: [dug.id] });
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
  const h = heard();
  check(!!h && h.kind === 'worm' && hypot(h.x - thumper!.x, h.z - thumper!.z) < 1, 'the enemy nearby gets "Thumper detected!", pinged where it drums');
  tick(1);
  check(t.worms.length === 1 && thumper!.dead, 'then a Sandworm comes up where the Thumper stood');
  for (let k = 0; k < WORM.hunt + 2; k++) { shuttle(); tick(1); }
  console.log(`      after the hunt: moving tank ${mover.dead ? 'eaten' : mover.hp.toFixed(0)}, parked tank ${parked.dead ? 'eaten' : parked.hp.toFixed(0)}, harvester ${harv.dead ? 'eaten' : harv.hp.toFixed(0)}, own warrior ${own ? (own.dead ? 'eaten' : own.hp.toFixed(0)) : '-'}`);
  check(mover.dead, 'it swallows an enemy tank that keeps moving');
  check(harv.dead, 'and a harvester');
  check(parked.dead, 'and a tank that stands still: keeping still does not hide anything on the sand');
  if (own) check(own.dead, 'and it eats our own units too');
  if (dug) check(dug.hidden && !dug.dead && dug.hp === dug.maxHp, 'but not Fremen dug into the sand: no worm hears them');
  check(!planter.dead && planter.hp === planter.maxHp, 'off the sand, the planter is safe');
  check(t.worms.length === 0 && t.wormLog.length === 1 && t.wormLog[0].eatenEnemy >= 2 * UNITS.tank.cost + UNITS.harvester.cost, 'it goes back down after its hunt, and the log has what it ate');
  check(t.thumpBlocked(F, planter)?.startsWith('Next Thumper') ?? true, 'the next Thumper waits for the cooldown');
  // A Thumper destroyed before the worm comes calls nothing.
  const p2b = t.spawnUnit('sandrider', F, sx, sz);
  check(t.plantThumper(p2b, sx, sz), 'a second Thumper, once the cooldown is over');
  const th2 = t.buildings.find((b) => b.type === 'thumper' && !b.dead)!;
  t.damage(th2, UNITS.tank.weapon!, 100, null);
  tick(THUMPER.delay + 1);
  check(th2.dead && t.worms.length === 0, 'destroyed in time, its worm never comes');
  // Not on rock.
  const rocky = tm.nearestCell(fy.cx, fy.cz, (x, z) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!tm.inBounds(x + dx, z + dz) || tm.tile(x + dx, z + dz) !== ROCK) return false;
    return true;
  }, 20)!;
  const p3b = t.spawnUnit('sandrider', F, tm.center(rocky.cx), tm.center(rocky.cz));
  check(!t.plantThumper(p3b, p3b.x, p3b.z), "no Thumper on rock");
}

// ---- The Sandrider: zealot rush, and riding the worm ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'corrino']);
  const tm = t.map;
  for (const u of t.units) if (u.team === A) u.dead = true;
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  t.teams[F].credits = 100000;
  const fy = t.buildings.find((b) => b.team === F && b.type === 'sietch')!;
  check(!FACTIONS.fremen.train.includes('sandrider') && UNITS.sandrider.rite?.from === 'fedaykin', 'Sandriders come from Fedaykin, by a rite');
  check(!UNITS.warrior.thumper && !UNITS.fedaykin.thumper && !!UNITS.sandrider.thumper, 'only Sandriders plant Thumpers');
  const fed = t.spawnUnit('fedaykin', F, sx, sz);
  fy.setLevel(2);
  check(t.riteBlocked(fed, 'sandrider') === 'Needs Sietch III.', 'the rite needs Sietch III');
  fy.setLevel(3);
  check(t.riteBlocked(fed, 'sandrider') === null, 'with it, a Fedaykin can become a Sandrider');
  fed.dead = true;
  // On foot: one stroke kills a shielded Sardaukar; it can't touch a vehicle.
  const r = t.spawnUnit('sandrider', F, sx, sz);
  const sard = t.spawnUnit('sardaukar', A, sx + 5, sz);
  const raz = t.spawnUnit('razor', A, sx - 5, sz);
  check(!t.weaponFor(r, raz) && !!t.weaponFor(r, sard), 'the crysknife is for infantry only');
  sard.command(t, { kind: 'hold' });
  let rushed = 0;
  for (let k = 0; k < 60 && !sard.dead; k++) {
    t.update(0.05);
    if (r.target === sard) rushed = Math.max(rushed, r.speed(t));
  }
  check(sard.dead, 'it rushes a Sardaukar and kills it with one stroke, through the shield');
  check(rushed >= UNITS.sandrider.speed * UNITS.sandrider.charge!.speed, 'running at double speed as it closes in');
  raz.dead = true;
  // Riding: plant, stay close, climb on.
  const pick = (d: number) => tm.nearestCell(tm.cellOf(sx + d), tm.cellOf(sz), (x, z) => tm.canEnter(x, z, 'worm'), 6)!;
  const pt = (c: { cx: number; cz: number }) => ({ x: tm.center(c.cx), z: tm.center(c.cz) });
  r.x = sx;
  r.z = sz;
  applyCommand(t, F, { c: 'thump', units: [r.id], x: sx + 2, z: sz });
  tick(2);
  r.command(t, { kind: 'hold' });
  const ownW = t.spawnUnit('warrior', F, pt(pick(6)).x, pt(pick(6)).z);
  tick(THUMPER.delay);
  check(t.ridden.length === 1 && t.worms.length === 0 && r.mount === t.ridden[0], 'the worm comes, and the Sandrider is up on it');
  const w = t.ridden[0];
  check(hypot(r.x - w.x, r.z - w.z) < RIDE.seat * RIDE.spacing + 1, 'riding on its back');
  // Left alone, it goes after an enemy on the sand nearby, even one standing still; our own warrior walking about is safe.
  const prey = t.spawnUnit('razor', A, pt(pick(-8)).x, pt(pick(-8)).z);
  prey.command(t, { kind: 'hold' });
  for (let k = 0; k < 10 && !prey.dead; k++) {
    ownW.command(t, { kind: 'move', x: ownW.x + (k % 2 ? 2 : -2), z: ownW.z });
    tick(1);
  }
  check(prey.dead, 'left alone it hunts: an enemy Razor holding still on the sand is swallowed');
  check(!ownW.dead && ownW.hp === ownW.maxHp, 'never its own side');
  // Steered: right-click an enemy standing still, and the worm goes for it.
  const sitter = t.spawnUnit('razor', A, pt(pick(10)).x, pt(pick(10)).z);
  sitter.command(t, { kind: 'hold' });
  applyCommand(t, F, { c: 'go', units: [r.id], x: sitter.x, z: sitter.z, target: sitter.id, attack: true });
  tick(8);
  check(sitter.dead, 'steered onto an enemy, it swallows it even standing still');
  // Moving it somewhere: it goes, and wanders round there after.
  const far = pt(pick(-12));
  applyCommand(t, F, { c: 'go', units: [r.id], x: far.x, z: far.z, target: null, attack: false });
  tick(6);
  check(hypot(w.x - far.x, w.z - far.z) < 8, 'sent somewhere on the sand, it goes there');
  const trail: number[] = [];
  for (let k = 0; k < 20; k++) { tick(0.5); trail.push(hypot(w.x - w.lairX, w.z - w.lairZ)); }
  check(Math.max(...trail) - Math.min(...trail) > 2 && Math.max(...trail) <= RIDE.wander, 'then wanders an irregular loop round there');
  tick(90);
  check(t.ridden.length === 1 && r.mount === w, 'it stays up as long as the rider keeps it');
  applyCommand(t, F, { c: 'release', units: [r.id] });
  tick(0.5);
  check(t.ridden.length === 0 && !r.mount && !r.dead && tm.canEnter(tm.cellOf(r.x), tm.cellOf(r.z), 'foot'), 'released, the worm dives and leaves the rider on the sand');
  check(t.thumpBlocked(F, r)?.startsWith('Next Thumper') ?? false, 'and the rider rests before calling again');
  // Its rider shot off its back: the worm goes wild.
  r.nextThumper = 0;
  r.command(t, { kind: 'idle' });
  applyCommand(t, F, { c: 'thump', units: [r.id], x: r.x + 2, z: r.z });
  tick(2);
  r.command(t, { kind: 'hold' });
  tick(THUMPER.delay);
  check(!!r.mount, 'up again on a second worm');
  while (!r.dead) t.damage(r, UNITS.tank.weapon!, 100, null);
  tick(0.5);
  check(t.ridden.length === 0 && t.worms.length === 1, 'shot off its back, the rider falls and the worm goes wild');
  tick(WORM.hunt + 2);
  check(t.worms.length === 0, 'for a wild worm\'s hunt, then it goes down');
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
  check(!t.canTrain(F, 'glider'), 'no gliders before a High Perch');
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
  check(g.requirementsMet(F, UNITS.mortar.requires), 'the Great Sietch unlocks the Fremen Mortar rite');
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
  const hit = d.weapon.damage + (d.weapon.bonus.armored ?? 0) + (d.weapon.bonus.mechanical ?? 0) - (UNITS.tank.armor ?? 0);
  check(hurt >= 2 * hit, 'set up, it hits a moving tank at long range with guided rockets (at least twice)');
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
  for (let k = 0; k < 240; k++) t.update(0.05);
  check(a.hp > 50 && y.hp > y.maxHp / 2, 'Fremen units and structures heal on their own');
  const h1 = a.hp;
  a.hp = 50;
  a.lastHurt = t.time;
  t.teams[F].upgrades.add('stillsuit');
  for (let k = 0; k < 240; k++) t.update(0.05);
  check(a.hp - 50 > (h1 - 50) * 1.5, 'Stillsuits heal faster');
}

// ---- Rites: Warriors become Fedaykin or Mortars in the sand, for good ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tm = t.map;
  for (const u of t.units) if (u.team === A) u.dead = true;
  const tick = (seconds: number) => {
    for (let k = 0; k < seconds * 20; k++) t.update(0.05);
  };
  t.teams[F].credits = 100000;
  const y = t.buildings.find((b) => b.team === F)!;
  const r = tm.nearestCell(y.cx, y.cz, (x, z) => tm.tile(x, z) === ROCK && tm.canEnter(x, z, 'foot'), 60)!;
  const w1 = t.spawnUnit('warrior', F, sx, sz);
  const onRock = t.spawnUnit('warrior', F, tm.center(r.cx), tm.center(r.cz));
  check(!t.canTrain(F, 'fedaykin') && !t.canTrain(F, 'mortar') && !FACTIONS.fremen.train.includes('fedaykin'), 'Fedaykin and Mortars are never trained');
  check(t.riteBlocked(w1, 'fedaykin') === 'Needs Great Sietch.', 'the Fedaykin rite needs a Great Sietch');
  y.setLevel(2);
  check(t.riteBlocked(w1, 'fedaykin') === null && t.riteBlocked(w1, 'mortar') === null, 'with it, a Warrior on the sand can become a Fedaykin or a Mortar');
  check(t.riteBlocked(onRock, 'fedaykin') === 'Rites are held in the sand, not on rock.', 'not on rock');
  w1.hp = w1.maxHp / 2;
  w1.kills = 3;
  const cr = t.teams[F].credits;
  applyCommand(t, F, { c: 'rite', units: [w1.id], to: 'fedaykin' });
  check(!!w1.rite && cr - t.teams[F].credits === UNITS.fedaykin.rite!.cost, 'the rite is paid up front');
  tick(1);
  check(w1.hidden, 'the Warrior digs straight into the sand');
  const at = { x: w1.x, z: w1.z };
  const foe = t.spawnUnit('infantry', A, w1.x + 3, w1.z);
  tick(2);
  check(foe.hp === foe.maxHp && hypot(w1.x - at.x, w1.z - at.z) < 0.01, 'in the rite it neither fights nor moves');
  foe.dead = true;
  tick(UNITS.fedaykin.rite!.time);
  const f = w1.becomes as Unit | null;
  check(w1.dead && !!f && f.type === 'fedaykin' && !f.dead, 'it comes out a Fedaykin');
  // (It went in at half health, was shot at, and has healed a little since coming out.)
  check(!!f && f.hp < f.maxHp * 0.5 && f.kills === 3, 'with its share of health and its kills');
  tick(1);
  check(!!f && f.hidden, 'still dug in');
  check(!!f && t.riteBlocked(f, 'mortar') === 'No such rite.' && !UNITS.warrior.rite, 'one way: a Fedaykin cannot become a Mortar, nor go back');
  // Called off: a move order, or Stop, gives the credits back.
  const w2 = t.spawnUnit('warrior', F, sx + 3, sz);
  const c2 = t.teams[F].credits;
  applyCommand(t, F, { c: 'rite', units: [w2.id], to: 'mortar' });
  tick(1);
  applyCommand(t, F, { c: 'go', units: [w2.id], x: w2.x + 6, z: w2.z, target: null, attack: false });
  tick(0.5);
  check(!w2.rite && w2.type === 'warrior' && t.teams[F].credits === c2, 'told to move, the rite is called off and refunded');
  tick(4);
  applyCommand(t, F, { c: 'rite', units: [w2.id], to: 'mortar' });
  check(!!w2.rite, 'it can start again');
  applyCommand(t, F, { c: 'stop', units: [w2.id] });
  check(!w2.rite && t.teams[F].credits === c2, 'Stop calls it off too');
  applyCommand(t, F, { c: 'rite', units: [w2.id], to: 'mortar' });
  tick(1);
  while (!w2.dead) t.damage(w2, UNITS.tank.weapon!, 100, null);
  tick(UNITS.mortar.rite!.time);
  check(!w2.becomes && !t.units.some((u) => u.team === F && u.type === 'mortar'), 'killed in the rite, nothing comes out');
}

// ---- Healing faster: dug into the sand, and near a High Perch ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tm = t.map;
  for (const u of t.units) if (u.team === A) u.dead = true;
  const y = t.buildings.find((b) => b.team === F)!;
  const rocks = (n: number, from: { cx: number; cz: number }) => tm.nearestCell(from.cx, from.cz, (x, z) => tm.tile(x, z) === ROCK && tm.canEnter(x, z, 'foot')
    && hypot(x - from.cx, z - from.cz) >= n, 60)!;
  const r1 = rocks(0, y);
  const onRock = t.spawnUnit('fedaykin', F, tm.center(r1.cx), tm.center(r1.cz));
  const onSand = t.spawnUnit('fedaykin', F, sx, sz);
  for (const u of [onRock, onSand]) u.hp = 50;
  for (let k = 0; k < 400; k++) t.update(0.05);
  check(onSand.hidden && !onRock.hidden, 'one dug into the sand, one on rock');
  check(onSand.hp - 50 > (onRock.hp - 50) * 1.7, 'dug into the sand, Fremen heal about twice as fast');
  // A High Perch next to a unit on rock.
  const spot = tm.nearestCell(r1.cx, r1.cz, (x, z) => t.canPlace('perch', F, x, z), 10)!;
  const wt = t.placeBuilding('perch', F, spot.cx, spot.cz);
  const far = rocks(30, r1);
  const away = t.spawnUnit('fedaykin', F, tm.center(far.cx), tm.center(far.cz));
  onRock.hp = 50;
  away.hp = 50;
  for (let k = 0; k < 200; k++) t.update(0.05);
  check(hypot(onRock.x - wt.x, onRock.z - wt.z) < 10 && hypot(away.x - wt.x, away.z - wt.z) > 20, 'one unit by the High Perch, one away');
  check(onRock.hp - 50 > (away.hp - 50) * 1.7, 'by a High Perch, Fremen heal about twice as fast');
}

// ---- Setting up off the field, queued orders, dry camps moving on ----
{
  const t = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
  const tm = t.map;
  for (const u of t.units) if (u.team === A) u.dead = true;
  const ty = t.buildings.find((b) => b.team === F && b.type === 'sietch')!;
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
