// Checks the AI doesn't answer an air attack with units that can't shoot aircraft: Sky Raiders hitting an Atreides
// AI base draw out its infantry (rifles hit aircraft), not its tanks and trikes. Usage: npx tsx sim/ai-air-defense-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { AI, HARD_PROFILE } from '../src/game/ai';
import type { Team } from '../src/config';
import type { Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const A: Team = 0;
const C: Team = 1;
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['atreides', 'corrino']);
const ai = new AI(g, A, HARD_PROFILE);
const yard = g.buildings.find((b) => b.team === A && b.type === 'conyard')!;
for (const u of [...g.units]) {
  u.hp = 0;
  (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
}
const m = g.map;
const near = (dx: number, dz: number) => {
  const c = m.nearestCell(yard.cx + dx, yard.cz + dz, (x, z) => m.canEnter(x, z, 'vehicle'), 20)!;
  return { x: m.center(c.cx), z: m.center(c.cz) };
};
// The AI's army at home.
const home: Unit[] = [];
for (const [type, dx] of [['tank', 6], ['tank', 7], ['trike', 8], ['trike', 9], ['infantry', 6], ['infantry', 7], ['infantry', 8]] as const) {
  const p = near(dx, 6);
  home.push(g.spawnUnit(type, A, p.x, p.z));
}
for (let t = 0; t < 3; t += 0.05) {
  g.update(0.05);
  ai.update(0.05);
}
// Sky Raiders over the yard.
const raiders: Unit[] = [];
for (const dx of [-2, 0, 2]) {
  const p = near(dx, -2);
  const r = g.spawnUnit('raider', C, p.x, p.z);
  r.hp = 1e6; // they stay for the whole check
  r.command(g, { kind: 'attack', target: yard });
  raiders.push(r);
}
const sent = new Set<Unit>();
for (let t = 0; t < 12; t += 0.05) {
  g.update(0.05);
  ai.update(0.05);
  const roles = (ai as unknown as { roles: Map<Unit, string> }).roles;
  for (const u of home) if (!u.dead && roles.get(u) === 'defend') sent.add(u);
}
const types = (pred: (u: Unit) => boolean) => [...sent].filter(pred).length;
check(types((u) => u.type === 'infantry') > 0, `infantry go after the Sky Raiders (${types((u) => u.type === 'infantry')} of 3)`);
check(types((u) => u.type !== 'infantry') === 0, `tanks and trikes stay put (${types((u) => u.type !== 'infantry')} sent)`);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
