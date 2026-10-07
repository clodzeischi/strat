// Fog of war rules: low ground can't see up onto high ground, high ground sees down, high cells block sight lines
// on low ground, aircraft are seen by anyone in range, and an attacker is revealed to the side it hits.
// Usage: npx tsx sim/vision-check.ts [seed]
import * as THREE from 'three';
import { TILE, type Team, type UnitType } from '../src/config';
import { Game } from '../src/game/game';
import type { Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const seed = Number(process.argv[2] ?? 7);

/** A map with no units, and the bases out of the way (they see too). */
function setup(): Game {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
  for (const u of [...g.units]) {
    u.hp = 0;
    (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  for (const b of g.buildings) b.hp = b.maxHp = 1e9;
  g.update(0.05);
  return g;
}

const g0 = setup();
const m = g0.map;
const N = m.size;
const high = (x: number, z: number) => m.inBounds(x, z) && m.level[m.idx(x, z)] === 1 && !m.ramp[m.idx(x, z)];
const low = (x: number, z: number) => m.inBounds(x, z) && m.level[m.idx(x, z)] === 0 && !m.ramp[m.idx(x, z)] && m.canEnter(x, z, 'vehicle');
const nearBase = (x: number, z: number) => g0.buildings.some((b) => Math.hypot(b.cx - x, b.cz - z) < 16);

// A cliff: low ground with high ground 3 cells away in a straight line (no ramp between), away from the bases.
let cliff: { lx: number; lz: number; hx: number; hz: number } | null = null;
for (let z = 2; z < N - 2 && !cliff; z++) {
  for (let x = 2; x < N - 2 && !cliff; x++) {
    if (!low(x, z) || nearBase(x, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (low(x + dx, z + dz) && high(x + 2 * dx, z + 2 * dz) && high(x + 3 * dx, z + 3 * dz) && m.canEnter(x + 3 * dx, z + 3 * dz, 'vehicle')) {
        cliff = { lx: x, lz: z, hx: x + 3 * dx, hz: z + 3 * dz };
        break;
      }
    }
  }
}
if (!cliff) throw new Error(`no cliff found on seed ${seed}`);

function spawn(g: Game, type: UnitType, team: Team, cx: number, cz: number): Unit {
  return g.spawnUnit(type, team, g.map.center(cx), g.map.center(cz));
}

// Up and down a cliff.
{
  const g = setup();
  const below = spawn(g, 'tank', 0, cliff.lx, cliff.lz);
  const above = spawn(g, 'infantry', 1, cliff.hx, cliff.hz);
  // Keep them from fighting for this part.
  below.cooldown = 1e9;
  above.cooldown = 1e9;
  g.update(0.05);
  for (let k = 0; k < 4; k++) g.update(0.05);
  check(!g.sees(0, above), 'a tank below a cliff can\'t see infantry on top of it', `${3 * TILE} units apart`);
  check(g.sees(1, below), 'the infantry on top sees the tank below');
}

// Shot at from above: the attacker shows up, and the tank fires back.
{
  const g = setup();
  const below = spawn(g, 'tank', 0, cliff.lx, cliff.lz);
  const above = spawn(g, 'infantry', 1, cliff.hx, cliff.hz);
  let saw = false;
  for (let k = 0; k < 20 * 15 && !above.dead; k++) {
    g.update(0.05);
    if (g.sees(0, above)) saw = true;
  }
  check(saw, 'once the infantry opens fire, the tank sees it');
  check(above.dead, 'and shoots back until it\'s dead', `tank at ${Math.round((100 * below.hp) / below.maxHp)}%`);
}

// A Carryall over the cliff top is seen from below.
{
  const g = setup();
  spawn(g, 'infantry', 0, cliff.lx, cliff.lz);
  const c = spawn(g, 'carryall', 1, cliff.hx, cliff.hz);
  c.y = g.map.surfaceAt(c.x, c.z) + 6;
  for (let k = 0; k < 5; k++) g.update(0.05);
  check(g.sees(0, c), 'a Carryall above the cliff is seen from below');
}

// Behind high ground: a low unit can't see low ground past a mesa or shelf.
{
  const g = setup();
  // Low cell, then a run of high cells, then low again, in a line, within sight.
  let found: { a: [number, number]; b: [number, number] } | null = null;
  for (let z = 2; z < N - 2 && !found; z++) {
    for (let x = 2; x < N - 2 && !found; x++) {
      if (!low(x, z) || nearBase(x, z)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let len = 3; len <= 4 && !found; len++) {
          const run = Array.from({ length: len }, (_, k) => high(x + (k + 1) * dx, z + (k + 1) * dz)).every(Boolean);
          const bx = x + (len + 1) * dx;
          const bz = z + (len + 1) * dz;
          if (run && low(bx, bz) && !nearBase(bx, bz)) found = { a: [x, z], b: [bx, bz] };
        }
      }
    }
  }
  if (!found) console.log('skip  no thin ridge on this map');
  else {
    const viewer = spawn(g, 'tank', 0, ...found.a);
    viewer.cooldown = 1e9;
    const hidden = spawn(g, 'infantry', 1, ...found.b);
    hidden.cooldown = 1e9;
    for (let k = 0; k < 5; k++) g.update(0.05);
    check(!g.sees(0, hidden), 'high ground between them blocks a low unit\'s view', `${Math.abs(found.a[0] - found.b[0]) + Math.abs(found.a[1] - found.b[1])} cells apart`);
  }
}

// In the open, sight works as before: a tank sees an enemy within its sight range, not beyond.
{
  const g = setup();
  let spot: [number, number] | null = null;
  for (let z = 4; z < N - 4 && !spot; z++) for (let x = 4; x < N - 12 && !spot; x++) {
    if (!nearBase(x, z) && Array.from({ length: 9 }, (_, k) => low(x + k, z)).every(Boolean)) spot = [x, z];
  }
  const t = spawn(g, 'tank', 0, spot![0], spot![1]);
  t.cooldown = 1e9;
  const near = spawn(g, 'infantry', 1, spot![0] + 5, spot![1]);
  const far = spawn(g, 'infantry', 1, spot![0] + 8, spot![1]);
  near.cooldown = far.cooldown = 1e9;
  for (let k = 0; k < 5; k++) g.update(0.05);
  check(g.sees(0, near) && !g.sees(0, far), 'open ground: seen within sight range only', `sight ${t.def.sight}, at ${5 * TILE} and ${8 * TILE}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
