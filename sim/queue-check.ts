// Checks the production queue: it holds 5 units per production building, each building works on an item of its own
// (the one the screen shows under it) and the unit comes out of that building, and a lost building's item moves on.
// Usage: npx tsx sim/queue-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { QUEUE_MAX, type BuildingType, type Team } from '../src/config';
import type { Building } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['atreides', 'atreides']);
const T: Team = 0;
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) g.update(0.05);
};

function place(type: BuildingType): Building {
  const yard = g.buildings.find((b) => b.team === T && b.type === 'conyard')!;
  for (let r = 3; r < 14; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.canPlace(type, T, yard.cx + dx, yard.cz + dz)) return g.placeBuilding(type, T, yard.cx + dx, yard.cz + dz);
    }
  }
  throw new Error(`no room for ${type}`);
}

g.teams[T].credits = 100000;
while (g.count(T, 'barracks') < 2) place('barracks');
const queue = g.teams[T].queues.barracks;
let accepted = 0;
for (let i = 0; i < 2 * QUEUE_MAX + 3; i++) if (g.queueUnit(T, 'infantry')) accepted++;
check(accepted === 2 * QUEUE_MAX, `two Barracks queue ${2 * QUEUE_MAX} infantry`, `${accepted}`);

run(0.2);
const [a, b] = queue;
check(!!a.site && !!b.site && a.site !== b.site, 'each Barracks works on its own item');
check(queue.slice(2).every((q) => !q.site), 'waiting items hold no Barracks');

// The first two come out of the Barracks that made them.
const sites = [a.site!, b.site!];
const before = g.units.filter((u) => u.team === T && u.type === 'infantry').length;
const infantry = () => g.units.filter((u) => u.team === T && u.type === 'infantry');
for (let t = 0; t < 60 && infantry().length < before + 2; t += 0.05) g.update(0.05);
const fresh = infantry().slice(before, before + 2);
const near = (s: Building) => fresh.some((u) => Math.hypot(u.x - s.x, u.z - s.z) < 12);
check(fresh.length === 2 && sites.every(near), 'units come out of the Barracks that made them');

// One Barracks lost: its item moves to the other once that's free, and the cap goes back to 5.
run(0.1);
const lost = queue[0].site!;
const kept = queue[1].site!;
(g as unknown as { kill(e: unknown, by: null): void }).kill(lost, null);
run(0.2);
check(lost.dead, 'a Barracks is destroyed');
check(queue[0].site === kept && !queue[1]?.site, 'its item goes on at the other Barracks', `${queue[0].site?.id} vs ${kept.id}`);
while (queue.length > QUEUE_MAX - 1) queue.pop();
check(g.queueUnit(T, 'infantry') && !g.queueUnit(T, 'infantry'), `one Barracks queues ${QUEUE_MAX} again`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
