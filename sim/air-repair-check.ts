// Checks repair, infantry regeneration and the Carryall: pickups, heavy touch-and-go drops, infantry fly-by
// parachute drops, two-trike parachute drops, harvester ferrying and rescue, and anti-air.
// Usage: npx tsx sim/air-repair-check.ts
import * as THREE from 'three';
import type { UnitType } from '../src/config';
import { Carryall, type Unit } from '../src/entities';
import { Game } from '../src/game/game';
import { ROCK, SAND, SPICE } from '../src/map';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

/** A game on flat open sand with no starting units or buildings. */
function flatGame(): Game {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
  for (const u of g.units) u.dead = true;
  for (const b of g.buildings) {
    b.dead = true;
    for (let z = b.cz; z < b.cz + b.size; z++) for (let x = b.cx; x < b.cx + b.size; x++) g.map.occupied[g.map.idx(x, z)] = 0;
  }
  g.update(0.01);
  const m = g.map;
  m.tiles.fill(SAND);
  m.level.fill(0);
  m.ramp.fill(0);
  m.spice.fill(0);
  return g;
}

function run(g: Game, seconds: number, until?: () => boolean): number {
  let t = 0;
  while (t < seconds && !(until && until())) {
    g.update(0.05);
    t += 0.05;
  }
  return t;
}

const at = (g: Game, cx: number) => g.map.center(cx);

// ---- Repair -------------------------------------------------------------------
{
  const g = flatGame();
  const tank = g.spawnUnit('tank', 0, at(g, 20), at(g, 20));
  tank.hp = 100;
  const mech = g.spawnUnit('repair', 0, at(g, 24), at(g, 20));
  const credits0 = g.teams[0].credits;
  const t = run(g, 30, () => tank.hp >= tank.maxHp);
  check('idle repair vehicle mends a nearby tank on its own', tank.hp >= tank.maxHp, `${t.toFixed(1)}s, spent ${(credits0 - g.teams[0].credits).toFixed(0)}`);
  check('repair costs credits', credits0 - g.teams[0].credits > 50);

  for (let z = 30; z < 36; z++) for (let x = 30; x < 36; x++) g.map.tiles[g.map.idx(x, z)] = ROCK;
  const bar = g.placeBuilding('barracks', 0, 31, 31);
  bar.hp = 200;
  mech.command(g, { kind: 'repair', target: bar });
  const tb = run(g, 40, () => bar.hp >= bar.maxHp);
  check('ordered repair of a building', bar.hp >= bar.maxHp, `${tb.toFixed(1)}s`);

  const inf = g.spawnUnit('infantry', 0, at(g, 10), at(g, 10));
  inf.hp = 20;
  inf.lastHurt = g.time;
  run(g, 4);
  const early = inf.hp;
  run(g, 30);
  check('infantry wait out the delay, then regenerate', early <= 20.01 && inf.hp > 60, `${early.toFixed(0)} -> ${inf.hp.toFixed(0)}`);
  mech.command(g, { kind: 'idle' });
  inf.hp = 20;
  run(g, 2);
  check('repair vehicles leave infantry alone', mech.order.kind === 'idle');
}

// ---- Carryall: heavy pickup and touch-and-go drop -----------------------------
for (const type of ['tank', 'harvester', 'rocket'] as UnitType[]) {
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, at(g, 10), at(g, 10)) as Carryall;
  const u = g.spawnUnit(type, 0, at(g, 16), at(g, 12));
  u.command(g, { kind: 'idle' });
  if (type === 'harvester') u.order = { kind: 'idle' };
  // Harvesters become a ferry assignment instead; check plain lifting with the others.
  if (type !== 'harvester') {
    c.orderPickup(g, [u]);
    const tp = run(g, 20, () => u.carrier === c);
    check(`carryall picks up a ${type}`, u.carrier === c, `${tp.toFixed(1)}s`);
    run(g, 2);
    const back = { x: c.x, z: c.z };
    c.orderDrop(g, at(g, 45), at(g, 40));
    const td = run(g, 30, () => !u.carrier);
    const off = Math.hypot(u.x - at(g, 45), u.z - at(g, 40));
    check(`  ...and sets it down at the drop point`, !u.carrier && off < 3, `${td.toFixed(1)}s, ${off.toFixed(1)} from the point`);
    run(g, 2);
    check(`  ...landed ${type} is on the ground and can drive`, Math.abs(u.y - g.map.surfaceAt(u.x, u.z)) < 0.2 && u.order.kind === 'idle');
    run(g, 25);
    check(`  ...carryall flies back to where it was ordered`, Math.hypot(c.x - back.x, c.z - back.z) < 8, `${Math.hypot(c.x - back.x, c.z - back.z).toFixed(1)} away`);
  }
}

// ---- Carryall: a heavy drop is quick and low only for a moment ---------------
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, at(g, 10), at(g, 10)) as Carryall;
  const tank = g.spawnUnit('tank', 0, at(g, 16), at(g, 12));
  c.orderPickup(g, [tank]);
  run(g, 20, () => tank.carrier === c);
  run(g, 3);
  c.orderDrop(g, at(g, 40), at(g, 40));
  let low = 0;
  let slowest = Infinity;
  let last = { x: c.x, z: c.z };
  run(g, 30, () => {
    const ground = g.map.surfaceAt(c.x, c.z);
    const speed = Math.hypot(c.x - last.x, c.z - last.z) / 0.05;
    last = { x: c.x, z: c.z };
    if (c.y < ground + 3) {
      low += 0.05;
      slowest = Math.min(slowest, speed);
    }
    return !tank.carrier && c.task.kind !== 'drop' && c.task.kind !== 'climb';
  });
  check('heavy drop: low over the drop zone only briefly', low < 2.5, `${low.toFixed(1)}s below 3 units`);
  check('  ...and never slows to a hover', slowest > 3.5, `slowest ${slowest.toFixed(1)} while low`);
}

// ---- Carryall: two trikes apart are gathered and picked up in one pass ---------
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, at(g, 10), at(g, 10)) as Carryall;
  const pair = [g.spawnUnit('trike', 0, at(g, 20), at(g, 20)), g.spawnUnit('trike', 0, at(g, 26), at(g, 23))];
  c.orderPickup(g, pair);
  const t = run(g, 25, () => c.load.length === 2);
  check('two trikes six tiles apart are both picked up', c.load.length === 2, `${t.toFixed(1)}s`);
}

// ---- Carryall: at the map edge -------------------------------------------------
{
  const g = flatGame();
  const size = g.map.worldSize();
  const c = g.spawnUnit('carryall', 0, size / 2, size / 2) as Carryall;
  c.command(g, { kind: 'move', x: 0.5, z: 0.5 });
  run(g, 20);
  c.command(g, { kind: 'move', x: size / 2, z: size / 2 });
  const t = run(g, 20, () => Math.hypot(c.x - size / 2, c.z - size / 2) < 10);
  check('carryall sent into a map corner comes back out when ordered', Math.hypot(c.x - size / 2, c.z - size / 2) < 10, `${t.toFixed(1)}s`);
  const squad = [0, 1, 2].map((k) => g.spawnUnit('infantry', 0, at(g, 30 + k), at(g, 30)));
  c.orderPickup(g, squad);
  run(g, 30, () => c.load.length === 3);
  c.orderDrop(g, at(g, 1), at(g, 1));
  const td = run(g, 40, () => c.load.length === 0 && c.task.kind === 'move');
  check('  ...and a fly-by drop in the corner ends with it heading home', c.load.length === 0 && c.task.kind !== 'drop', `${td.toFixed(1)}s`);
}

// ---- Carryall: six infantry, fly-by parachute drop ----------------------------
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, at(g, 10), at(g, 10)) as Carryall;
  const squad: Unit[] = [];
  for (let k = 0; k < 7; k++) squad.push(g.spawnUnit('infantry', 0, at(g, 18 + (k % 3)), at(g, 14 + Math.floor(k / 3))));
  const taken = c.orderPickup(g, squad);
  check('carryall takes six infantry, not seven', taken.length === 6);
  const tp = run(g, 30, () => c.load.length === 6);
  check('  ...and loads all six', c.load.length === 6, `${tp.toFixed(1)}s`);
  run(g, 1);
  const back = { x: c.x, z: c.z };
  c.orderDrop(g, at(g, 45), at(g, 45));
  let sawFalling = false;
  const td = run(g, 30, () => {
    if (squad.some((u) => u.falling)) sawFalling = true;
    return c.load.length === 0 && !squad.some((u) => u.falling);
  });
  const landed = taken.filter((u) => !u.carrier && !u.falling && !u.dead);
  const spread = Math.max(...landed.map((u) => Math.hypot(u.x - at(g, 45), u.z - at(g, 45))));
  check('  ...troopers parachute down near the point', sawFalling && landed.length === 6 && spread < 11, `${td.toFixed(1)}s, furthest ${spread.toFixed(1)}`);
  run(g, 30);
  check('  ...carryall returns to where it was ordered', Math.hypot(c.x - back.x, c.z - back.z) < 8);
  const trikes = [g.spawnUnit('trike', 0, at(g, 20), at(g, 30)), g.spawnUnit('trike', 0, at(g, 21), at(g, 30)), g.spawnUnit('trike', 0, at(g, 22), at(g, 30))];
  const tt = c.orderPickup(g, trikes);
  run(g, 30, () => c.load.length === 2);
  check('carryall lifts two trikes at once (not three)', tt.length === 2 && c.load.length === 2);
  c.orderDrop(g, at(g, 40), at(g, 20));
  let trikeChutes = false;
  const tf = run(g, 40, () => {
    if (tt.some((u) => u.falling)) trikeChutes = true;
    return c.load.length === 0 && !tt.some((u) => u.falling);
  });
  const far = Math.max(...tt.map((u) => Math.hypot(u.x - at(g, 40), u.z - at(g, 20))));
  check('  ...and parachutes both down on a fly-by', trikeChutes && tt.every((u) => !u.carrier && !u.falling) && far < 8, `${tf.toFixed(1)}s, furthest ${far.toFixed(1)}`);
  run(g, 1);
  check('  ...landed trikes are on the ground', tt.every((u) => Math.abs(u.y - g.map.surfaceAt(u.x, u.z)) < 0.2));
}

// ---- Harvester ferry -----------------------------------------------------------
{
  const g = flatGame();
  const m = g.map;
  for (let z = 4; z < 12; z++) for (let x = 4; x < 12; x++) m.tiles[m.idx(x, z)] = ROCK;
  for (let z = 44; z < 50; z++) for (let x = 44; x < 50; x++) {
    m.tiles[m.idx(x, z)] = SPICE;
    m.spice[m.idx(x, z)] = 500;
  }
  const ref = g.placeBuilding('refinery', 0, 5, 5);
  const h = g.units.find((u) => u.type === 'harvester')!;
  const c = g.spawnUnit('carryall', 0, ref.x, ref.z) as Carryall;
  c.orderPickup(g, [h]);
  check('picking up a harvester assigns the carryall to it', c.task.kind === 'ferry');
  let lifts = 0;
  let wasCarried = false;
  let groundDrive = 0;
  let last = { x: h.x, z: h.z };
  const credits0 = g.teams[0].credits;
  run(g, 120, () => {
    if (h.carrier && !wasCarried) lifts++;
    wasCarried = !!h.carrier;
    if (!h.carrier) groundDrive += Math.hypot(h.x - last.x, h.z - last.z);
    last = { x: h.x, z: h.z };
    return false;
  });
  check('  ...it ferries the harvester both ways', lifts >= 3, `${lifts} lifts, +${(g.teams[0].credits - credits0).toFixed(0)} credits in 120s`);
  check('  ...the harvester waits for its lift instead of driving off', groundDrive < 60, `drove ${groundDrive.toFixed(0)} units on the ground`);

  // Under fire on the field: it calls the Carryall and is flown home.
  run(g, 60, () => h.order.kind === 'harvest' && h.hstate === 'harvest' && !h.carrier);
  const raider = g.spawnUnit('trike', 1, h.x + 4, h.z);
  raider.command(g, { kind: 'attack', target: h });
  const tr = run(g, 30, () => !!h.carrier);
  raider.dead = true;
  check('harvester under attack signals its carryall for pickup', !!h.carrier, `${tr.toFixed(1)}s`);
  run(g, 30, () => !h.carrier);
  check('  ...and is set down by the refinery', Math.hypot(h.x - ref.x, h.z - ref.z) < 8 * 2, `${Math.hypot(h.x - ref.x, h.z - ref.z).toFixed(1)} from it`);

  // The same trip by road, for comparison.
  const g2 = flatGame();
  const m2 = g2.map;
  for (let z = 4; z < 12; z++) for (let x = 4; x < 12; x++) m2.tiles[m2.idx(x, z)] = ROCK;
  for (let z = 44; z < 50; z++) for (let x = 44; x < 50; x++) {
    m2.tiles[m2.idx(x, z)] = SPICE;
    m2.spice[m2.idx(x, z)] = 500;
  }
  g2.placeBuilding('refinery', 0, 5, 5);
  const c2 = g2.teams[0].credits;
  run(g2, 120);
  check('  ...and earns more than driving', g.teams[0].credits - credits0 > g2.teams[0].credits - c2, `by road +${(g2.teams[0].credits - c2).toFixed(0)}`);
}

// ---- Anti-air ------------------------------------------------------------------
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, at(g, 30), at(g, 30)) as Carryall;
  const tank = g.spawnUnit('tank', 1, at(g, 33), at(g, 30));
  run(g, 5);
  check('tanks ignore aircraft', c.hp === c.maxHp && tank.target === null);
  const squad: Unit[] = [];
  for (let k = 0; k < 4; k++) squad.push(g.spawnUnit('infantry', 0, at(g, 30 + k), at(g, 31)));
  c.orderPickup(g, squad);
  run(g, 20, () => c.load.length === 4);
  for (let k = 0; k < 6; k++) g.spawnUnit('infantry', 1, at(g, 28 + k), at(g, 26));
  const tk = run(g, 60, () => c.dead);
  const bailed = squad.filter((u) => !u.carrier && (u.falling || !u.dead)).length;
  check('enemy infantry shoot the carryall down', c.dead, `${tk.toFixed(1)}s`);
  check('  ...passengers bail out by parachute', bailed > 0 && squad.every((u) => !u.carrier), `${bailed} of 4`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
