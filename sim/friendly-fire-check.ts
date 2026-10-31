// Checks area damage hits friend and foe alike (not the unit that set it off), and that a unit caught in its own
// side's blast doesn't turn on the ally who fired; a computer player never fires a blast into its own side (a person
// may).
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

// A computer player's Soulcrusher holds a shell that would land on its own trooper; a person's fires it.
for (const human of [false, true]) {
  g.teams[0].human = human;
  const foe2 = g.spawnUnit('infantry', 1, 50, 80, 0);
  const friend2 = g.spawnUnit('infantry', 0, 51, 80, 0);
  const lone = g.spawnUnit('infantry', 1, 70, 80, 0);
  const who = human ? 'a person' : 'a computer player';
  check(`${who}: ${human ? 'fires' : 'holds'} a shell that would hit its own trooper`, g.holdsFire(shooter, foe2, shell) === !human);
  g.fire(shooter, foe2, { ...shell, unguided: false, speed: 0, cannon: true });
  check(`${who}: ${human ? 'the shot goes off' : 'no shot goes off'}`, (foe2.hp < foe2.maxHp) === human);
  check(`${who}: still free to shell an enemy standing alone`, !g.holdsFire(shooter, lone, shell));
  // (A Mortar, set up, picks its own targets: its rockets burst on what they hit. Both enemies in range, the lone one further.)
  const mortar = g.spawnUnit('mortar', 0, 42, 80, 0);
  (mortar as { deployState: string }).deployState = 'deployed';
  lone.x = 48;
  lone.z = 88;
  g.vision.update(g.units, g.buildings, g.ticks);
  const pick = g.nearestEnemy(0, mortar.x, mortar.z, 14, mortar);
  check(`${who}: a Mortar goes for ${human ? 'the nearer enemy' : 'the lone enemy, not the one by its trooper'}`, pick === (human ? foe2 : lone), pick ? `${pick.x}` : 'none');
  for (const u of [foe2, friend2, lone, mortar]) u.dead = true;
  g.update(0.01);
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all friendly-fire checks passed');
