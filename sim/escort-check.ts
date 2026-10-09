// Checks Repair Vehicles in an attack-move: they keep station behind the group's longest-range unit (here an MLRS)
// instead of driving into the fight, mend what comes within reach, and fix the group up once the fight is over.
// Usage: npx tsx sim/escort-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import type { Team } from '../src/config';
import type { Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const A: Team = 0;
const E: Team = 1;
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1003, ['atreides', 'atreides']);
for (const u of [...g.units]) {
  u.hp = 0;
  (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
}
const m = g.map;
const mid = m.size / 2;
const at = (dx: number, dz: number) => {
  const c = m.nearestCell(Math.round(mid + dx), Math.round(mid + dz), (x, z) => m.canEnter(x, z, 'vehicle'), 20)!;
  return { x: m.center(c.cx), z: m.center(c.cz) };
};
const group: Unit[] = [];
for (const dx of [-3, -1, 1, 3]) {
  const p = at(dx, -14);
  group.push(g.spawnUnit('tank', A, p.x, p.z, Math.PI / 2));
}
const pm = at(0, -17);
const mlrs = g.spawnUnit('rocket', A, pm.x, pm.z, Math.PI / 2);
group.push(mlrs);
const pr = at(0, -19);
const mech = g.spawnUnit('repair', A, pr.x, pr.z, Math.PI / 2);
const enemies: Unit[] = [];
for (const dx of [-4, -2, 0, 2, 4]) {
  const p = at(dx, 6);
  enemies.push(g.spawnUnit('infantry', E, p.x, p.z));
  const q = at(dx, 8);
  enemies.push(g.spawnUnit('tank', E, q.x, q.z));
}
g.teams[A].credits = 1e5;
g.update(0.05);
const goal = at(0, 10);
applyCommand(g, A, { c: 'go', units: [...group, mech].map((u) => u.id), x: goal.x, z: goal.z, target: null, attack: true });
check(mech.order.kind === 'escort', 'a Repair Vehicle in an attack-move escorts the group');

// The enemy line is along +z; "closer to the fight" is a larger z.
let aheadOfLead = 0;
let samples = 0;
for (let t = 0; t < 90 && enemies.some((e) => !e.dead) && group.some((u) => !u.dead); t += 0.05) {
  g.update(0.05);
  if (!mlrs.dead && !mech.dead && g.ticks % 10 === 0) {
    samples++;
    if (mech.z > mlrs.z + 0.5) aheadOfLead++;
  }
}
check(!mech.dead, 'it survives the fight');
check(samples > 0 && aheadOfLead / samples < 0.05, `it stays behind the MLRS (ahead of it ${aheadOfLead}/${samples} times)`);
const hurt = group.filter((u) => !u.dead && u.hp < u.maxHp);
const before = hurt.reduce((s, u) => s + u.hp, 0);
for (let t = 0; t < 30; t += 0.05) g.update(0.05);
check(!hurt.length || hurt.reduce((s, u) => s + u.hp, 0) > before, 'after the fight it mends the group');

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
