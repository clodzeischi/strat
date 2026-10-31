// Checks area damage hits friend and foe alike (not the unit that set it off), and that a unit caught in its own
// side's blast doesn't turn on the ally who fired.
// Usage: npx tsx sim/friendly-fire-check.ts
import * as THREE from 'three';
import { UNITS } from '../src/config';
import { Game } from '../src/game/game';
import { SAND } from '../src/map';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
for (const u of g.units) u.dead = true;
for (const b of g.buildings) {
  b.dead = true;
  for (let z = b.cz; z < b.cz + b.size; z++) for (let x = b.cx; x < b.cx + b.size; x++) g.map.occupied[g.map.idx(x, z)] = 0;
}
g.update(0.01);
g.map.tiles.fill(SAND);

const shooter = g.spawnUnit('artillery', 0, 30, 60, 0);
const foe = g.spawnUnit('infantry', 1, 50, 60, 0);
const friend = g.spawnUnit('infantry', 0, 51, 60, 0);
const far = g.spawnUnit('infantry', 0, 60, 60, 0);
const shell = UNITS.artillery.deploy!.weapon;
g.blast(50, 60, shell, 1, shooter);
check('a Soulcrusher shell hurts the enemy it lands on', foe.hp < foe.maxHp || foe.dead);
check('and our own trooper next to it', friend.hp < friend.maxHp || friend.dead);
check('but not one outside the blast', far.hp === far.maxHp);
check('the one who fired is never caught in it', (() => { g.blast(shooter.x, shooter.z, shell, 1, shooter); return shooter.hp === shooter.maxHp; })());
check("our trooper doesn't turn on the ally who fired", friend.dead || friend.target !== shooter);

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all friendly-fire checks passed');
