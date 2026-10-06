// Bunker checks: infantry get in, can't be hurt inside, shoot out (Infantry Rockets against armor, within their
// range), get out on U, and survive the bunker being destroyed. Usage: npx tsx sim/bunker-check.ts
import * as THREE from 'three';
import { TILE, type Team, type UnitType } from '../src/config';
import { Game } from '../src/game/game';
import type { Building, Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

/** A game with nothing on the map but a bunker for team 0 in open ground in the middle. */
function setup(): { g: Game; bunker: Building } {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1003);
  for (const u of [...g.units]) {
    u.hp = 0;
    (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  for (const b of g.buildings) b.hp = b.maxHp = 1e9; // the yards stay out of it
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const c = m.nearestCell(mid, mid, (x, z) => [0, 1, 2, 3].every((k) => m.canEnter(x + (k % 2), z + (k >> 1), 'vehicle')) && m.tile(x, z) !== 3, 20)!;
  const bunker = g.placeBuilding('bunker', 0, c.cx, c.cz);
  return { g, bunker };
}

function spawn(g: Game, type: UnitType, team: Team, x: number, z: number): Unit {
  const m = g.map;
  const c = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, 'vehicle'), 10)!;
  return g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
}

function run(g: Game, seconds: number, until?: () => boolean): void {
  const end = g.time + seconds;
  while (g.time < end && !until?.()) g.update(0.05);
}

// Getting in, and not being hurt inside.
{
  const { g, bunker } = setup();
  const squad = [0, 1, 2, 3].map((k) => spawn(g, 'infantry', 0, bunker.x + 8 + k * 2, bunker.z + 8));
  for (const u of squad) u.command(g, { kind: 'enter', target: bunker });
  run(g, 20, () => bunker.occupants.length === 3);
  check(bunker.occupants.length === 3, 'three infantry walk over and get in', `${bunker.occupants.length} inside`);
  check(squad.filter((u) => !u.carrier).length === 1, 'the fourth stays outside, the bunker is full');

  const raiders = [0, 1, 2, 3, 4, 5].map((k) => spawn(g, 'infantry', 1, bunker.x - 14 + k * 2, bunker.z - 14));
  for (const r of raiders) r.command(g, { kind: 'attack', target: bunker });
  run(g, 60, () => raiders.every((r) => r.dead));
  const inside = bunker.occupants;
  check(raiders.every((r) => r.dead), 'six attacking infantry are shot down from the bunker');
  check(inside.every((u) => u.hp === u.maxHp), 'nobody inside is hurt', `bunker at ${Math.round((100 * bunker.hp) / bunker.maxHp)}%`);

  g.unloadBunker(bunker);
  check(inside.every((u) => !u.carrier && u.root.visible) && bunker.occupants.length === 0, 'U: everyone gets out');
}

// Infantry Rockets against a tank: it can hit the bunker from 9 units, out of the rockets' reach (8); closer, it gets hit.
{
  const { g, bunker } = setup();
  g.teams[0].upgrades.add('rockets');
  for (let k = 0; k < 3; k++) g.enterBunker(spawn(g, 'infantry', 0, bunker.x + 4, bunker.z + 4), bunker);
  const half = (bunker.size * TILE) / 2;
  const far = spawn(g, 'tank', 1, bunker.x + half + 9 + 1.1, bunker.z);
  far.command(g, { kind: 'attack', target: bunker });
  // Hold it where it is: it fires as soon as it's in range anyway.
  run(g, 10);
  const farHurt = far.hp < far.maxHp;
  check(!farHurt && bunker.hp < bunker.maxHp, 'a tank 9 out shells the bunker and takes nothing back', `bunker ${Math.round(bunker.maxHp - bunker.hp)} damage, tank ${Math.round(far.maxHp - far.hp)}`);
  far.hp = 0;
  (g as unknown as { kill(e: unknown, by: null): void }).kill(far, null);
  const near = spawn(g, 'tank', 1, bunker.x + half + 6 + 1.1, bunker.z);
  near.command(g, { kind: 'attack', target: bunker });
  run(g, 10);
  check(near.hp < near.maxHp, 'a tank 6 out gets hit by the rockets', `tank ${Math.round(near.maxHp - near.hp)} damage`);
}

// The bunker destroyed: the infantry inside get out alive.
{
  const { g, bunker } = setup();
  const squad = [0, 1, 2].map(() => spawn(g, 'infantry', 0, bunker.x + 4, bunker.z + 4));
  for (const u of squad) g.enterBunker(u, bunker);
  bunker.hp = 1;
  const t = spawn(g, 'tank', 1, bunker.x + 12, bunker.z);
  t.command(g, { kind: 'attack', target: bunker });
  run(g, 20, () => bunker.dead);
  check(bunker.dead && squad.every((u) => !u.dead && !u.carrier), 'the bunker falls; its infantry get out alive');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
