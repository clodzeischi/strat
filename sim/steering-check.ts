// Checks steering and group moves: harvesters at work drive through each other ("mineral walk", as StarCraft's
// workers), two vehicles meeting head-on sidestep past each other, and group moves keep the group's shape when sent
// somewhere outside it (StarCraft's "magic box") but gather when sent inside it or when spread out.
// Usage: npx tsx sim/steering-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { SPICE } from '../src/map';
import type { Team } from '../src/config';
import type { Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}
const A: Team = 0;
function fresh(): Game {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1003, ['atreides', 'atreides']);
  for (const u of [...g.units]) (g as unknown as { remove(e: unknown): void }).remove(u);
  return g;
}
/** An open stretch of ground: cells x0..x0+len along one row, all enterable by vehicles (and on one level). */
function openRow(g: Game, len: number): { x: number; z: number; step: number } {
  const m = g.map;
  for (let cz = 8; cz < m.size - 8; cz++) for (let cx = 8; cx < m.size - 8 - len; cx++) {
    let ok = true;
    for (let k = -2; k <= len + 2 && ok; k++) for (let w = -2; w <= 2 && ok; w++) {
      ok = m.canEnter(cx + k, cz + w, 'vehicle') && m.level[m.idx(cx + k, cz + w)] === m.level[m.idx(cx, cz)];
    }
    if (ok) return { x: m.center(cx), z: m.center(cz), step: m.center(1) - m.center(0) };
  }
  throw new Error('no open row');
}

// ---- Head-on: two Tanks driving straight at each other pass and arrive -------------------------------------------
{
  const g = fresh();
  const r = openRow(g, 14);
  const a = g.spawnUnit('tank', A, r.x, r.z, 0);
  const b = g.spawnUnit('tank', A, r.x + 14 * r.step, r.z, Math.PI);
  applyCommand(g, A, { c: 'go', units: [a.id], x: b.x, z: b.z, target: null, attack: false });
  applyCommand(g, A, { c: 'go', units: [b.id], x: a.x, z: a.z, target: null, attack: false });
  const ga = { x: b.x, z: b.z };
  const gb = { x: a.x, z: a.z };
  let t = 0;
  for (; t < 30 && (a.path.length || b.path.length); t += 0.05) g.update(0.05);
  const da = Math.hypot(a.x - ga.x, a.z - ga.z);
  const db = Math.hypot(b.x - gb.x, b.z - gb.z);
  check(da < 2.5 && db < 2.5, `two Tanks meeting head-on pass each other and arrive (${t.toFixed(1)} s, ${da.toFixed(1)} / ${db.toFixed(1)} m off)`);
  check(t < (14 * r.step) / a.def.speed + 8, 'without a long standoff');
}

// ---- Mineral walk: two harvesters at work don't push each other --------------------------------------------------
{
  const g = fresh();
  const m = g.map;
  const N = m.size;
  let spice: { cx: number; cz: number } | null = null;
  for (let i = 0; i < N * N && !spice; i++) if (m.tiles[i] === SPICE && m.canEnter(i % N, (i / N) | 0, 'vehicle')) spice = { cx: i % N, cz: (i / N) | 0 };
  const p = { x: m.center(spice!.cx), z: m.center(spice!.cz) };
  const h1 = g.spawnUnit('harvester', A, p.x, p.z, 0);
  const h2 = g.spawnUnit('harvester', A, p.x + 0.2, p.z, 0);
  h1.commandHarvest(g, spice!);
  h2.commandHarvest(g, spice!);
  const tank = g.spawnUnit('tank', A, p.x - 0.2, p.z, 0);
  const t0 = { x: tank.x, z: tank.z };
  g.update(0.05);
  check(Math.hypot(h1.x - h2.x, h1.z - h2.z) < h1.radius, 'harvesters at work drive through each other');
  check(Math.hypot(tank.x - t0.x, tank.z - t0.z) < 0.01, 'and through their own army');
  h2.command(g, { kind: 'idle' });
  for (let k = 0; k < 20; k++) g.update(0.05);
  check(Math.hypot(h1.x - h2.x, h1.z - h2.z) > h1.radius, 'a harvester taken off work is solid again');
}

// ---- Magic box -----------------------------------------------------------------------------------------------------
{
  const g = fresh();
  const r = openRow(g, 20);
  const s = r.step;
  const offsets = [[0, 0], [2, 0], [0, 2], [2, 2]].map(([dx, dz]) => ({ dx: dx * s, dz: dz * s }));
  const group: Unit[] = offsets.map((o) => g.spawnUnit('tank', A, r.x + o.dx, r.z + o.dz - s, 0));
  const ids = group.map((u) => u.id);
  const far = { x: r.x + 16 * s, z: r.z };
  applyCommand(g, A, { c: 'go', units: ids, x: far.x, z: far.z, target: null, attack: false });
  const spots = group.map((u) => u.order as { x: number; z: number });
  const kept = group.every((u, i) => Math.abs(spots[i].x - spots[0].x - (u.x - group[0].x)) < 0.01 && Math.abs(spots[i].z - spots[0].z - (u.z - group[0].z)) < 0.01);
  check(kept, 'sent outside its box, a group keeps its shape');
  const mean = (k: 'x' | 'z') => spots.reduce((a, p) => a + p[k], 0) / spots.length;
  check(Math.abs(mean('x') - far.x) < 0.01 && Math.abs(mean('z') - far.z) < 0.01, 'centred on the click');
  const inside = { x: group[0].x + s * 0.5, z: group[0].z + s * 0.5 };
  applyCommand(g, A, { c: 'go', units: ids, x: inside.x, z: inside.z, target: null, attack: false });
  const near = group.map((u) => u.order as { x: number; z: number });
  check(near.every((p) => Math.hypot(p.x - inside.x, p.z - inside.z) < 3 * s), 'sent inside its box, it gathers on the point');
  check(new Set(near.map((p) => `${p.x},${p.z}`)).size === 4, 'each on a cell of its own');
  // Spread wider than the box limit: it gathers too.
  group[3].x += 30;
  applyCommand(g, A, { c: 'go', units: ids, x: far.x, z: far.z, target: null, attack: false });
  const spread = group.map((u) => u.order as { x: number; z: number });
  check(spread.every((p) => Math.hypot(p.x - far.x, p.z - far.z) < 3 * s), 'spread out, it gathers on the point');
}

console.log(failures ? `\n${failures} failed` : '\nall ok');
process.exit(failures ? 1 : 0);
