// Checks that harvesters pick refineries and spice by the drive, not as the crow flies: a cliff wall puts one
// refinery and one spice patch close by but far around, the others farther off but straight ahead.
// Usage: npx tsx sim/harvest-path-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { CLIFF, SAND, SPICE } from '../src/map';

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
for (const u of g.units) u.dead = true; // clear the starting units and buildings
for (const b of g.buildings) b.dead = true;
const m = g.map;
m.tiles.fill(SAND);
m.level.fill(0);
m.ramp.fill(0);
m.occupied.fill(0);
m.spice.fill(0);
const N = m.size;
// A wall down x = 30 from the top edge, open only near the bottom.
for (let z = 0; z < N - 8; z++) m.tiles[m.idx(30, z)] = CLIFF;
const near = g.placeBuilding('refinery', 0, 33, 20); // 8 tiles away, behind the wall
const far = g.placeBuilding('refinery', 0, 10, 46); // ~30 tiles away, straight ahead
const set = (cx: number, cz: number) => {
  m.tiles[m.idx(cx, cz)] = SPICE;
  m.spice[m.idx(cx, cz)] = 500;
};
set(34, 12); // behind the wall
set(14, 38); // on this side
g.update(0.05);

let fail = 0;
const h = g.spawnUnit('harvester', 0, m.center(26), m.center(20), 0);
const ref = g.refineryFor(h);
console.log(`refinery: ${ref === far ? 'the one straight ahead' : ref === near ? 'the one behind the wall' : 'none'}`);
if (ref !== far) fail = 1;
const cell = g.findSpice(26, 20, h);
console.log(`spice: ${cell ? `(${cell.cx}, ${cell.cz})` : 'none'}`);
if (!cell || cell.cx !== 14 || cell.cz !== 38) fail = 1;

// The other way round: from behind the wall, the near refinery and spice are the drive's nearest too.
const h2 = g.spawnUnit('harvester', 0, m.center(36), m.center(16), 0);
if (g.refineryFor(h2) !== near) {
  console.log('from behind the wall: wrong refinery');
  fail = 1;
}
const c2 = g.findSpice(36, 16, h2);
if (!c2 || c2.cx !== 34 || c2.cz !== 12) {
  console.log('from behind the wall: wrong spice');
  fail = 1;
}
console.log(fail ? 'FAIL' : 'ok');
process.exit(fail);
