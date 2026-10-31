// Checks a shot-down Carryall's crash: it flies on in a straight line, sinking, and blows up where it hits the ground,
// hurting everyone there, its own side too (not ones further off); a vehicle it carried goes down with it. One
// killed on the ground just blows up.
// Usage: npx tsx sim/crash-check.ts
import * as THREE from 'three';
import { CRASH } from '../src/config/rules';
import type { WeaponDef } from '../src/config';
import { Carryall } from '../src/entities';
import { Game } from '../src/game/game';
import { SAND } from '../src/map';

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
  g.map.tiles.fill(SAND);
  g.map.spice.fill(0);
  return g;
}

const SHOT: WeaponDef = { range: 0, minRange: 0, damage: 0, airDamage: 99999, bonus: {}, cooldown: 0, projectile: 'bullet', speed: 0, splash: 0, air: true, pierce: true };

// Flying east at speed, hit: where should it come down?
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, 40, 60, 0) as Carryall;
  const trike = g.spawnUnit('trike', 0, 40, 60, 0);
  c.orderPickup(g, [trike]);
  let t = 0;
  while (t < 30 && !trike.carrier) { g.update(0.05); t += 0.05; }
  check('the Carryall picks up a trike to carry down with it', trike.carrier === c);
  c.command(g, { kind: 'move', x: 200, z: 60 });
  for (let k = 0; k < 120; k++) g.update(0.05);
  const ground = g.map.surfaceAt(c.x, c.z);
  const fall = (c.y - ground - 0.4) / CRASH.sink;
  const land = { x: c.x + Math.cos(c.heading) * Math.max(c.airspeed, CRASH.minSpeed) * fall, z: c.z + Math.sin(c.heading) * Math.max(c.airspeed, CRASH.minSpeed) * fall };
  const under = g.spawnUnit('infantry', 1, land.x, land.z, 0);
  const far = g.spawnUnit('infantry', 1, land.x, land.z + 12, 0);
  const own = g.spawnUnit('infantry', 0, land.x + 0.5, land.z, 0);
  for (const u of [under, far, own]) u.command(g, { kind: 'stop' } as never);
  const start = { x: c.x, z: c.z, h: c.heading };
  g.damage(c, SHOT, 1, null);
  check('shot down, it dies at once', c.dead && trike.dead);
  check('and starts a crash', g.crashes.length === 1);
  let steps = 0;
  let straight = true;
  while (g.crashes.length && steps < 400) {
    const k = g.crashes[0];
    // How far it strays off the line it was flying along.
    const off = Math.abs(-Math.sin(start.h) * (k.x - start.x) + Math.cos(start.h) * (k.z - start.z));
    if (off > 0.05) straight = false;
    g.update(0.05);
    steps++;
  }
  check('it goes down in a straight line', straight);
  check('and lands about when and where it should', Math.abs(steps * 0.05 - fall) < 0.2, `${(steps * 0.05).toFixed(2)} s vs ${fall.toFixed(2)} s`);
  check('the enemy it lands on is hurt', under.hp < under.maxHp || under.dead, `${under.hp}/${under.maxHp}`);
  check('one further off is not', far.hp === far.maxHp);
  check('its own side under it is hurt too', own.hp < own.maxHp || own.dead);
}

// Hit while sitting on the ground (low for a pickup): no crash, it just blows up.
{
  const g = flatGame();
  const c = g.spawnUnit('carryall', 0, 40, 60, 0) as Carryall;
  c.y = g.map.surfaceAt(c.x, c.z) + 0.5;
  g.damage(c, SHOT, 1, null);
  check('killed on the ground it just blows up', c.dead && g.crashes.length === 0);
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all crash checks passed');
