// Checks firing on the move: turreted units (tank, rocket launcher) on a plain move order shoot enemies they pass
// without stopping; units without a turret don't. Usage: npx tsx sim/move-fire-check.ts
import * as THREE from 'three';
import type { UnitType } from '../src/config';
import { Game } from '../src/game';
import { SAND } from '../src/map';

for (const type of ['tank', 'rocket', 'trike'] as UnitType[]) {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
  for (const u of g.units) u.dead = true; // clear the starting units
  const m = g.map;
  // Flat open ground everywhere (this checks turrets, not terrain), with an enemy harvester parked beside the line.
  m.tiles.fill(SAND);
  m.level.fill(0);
  m.ramp.fill(0);
  const N = m.size;
  const row = (N / 2) | 0;
  const z = m.center(row);
  const unit = g.spawnUnit(type, 0, m.center(14), z, 0);
  const victim = g.spawnUnit('harvester', 1, m.center((N / 2) | 0), m.center(row + 4), 0);
  const hp0 = victim.hp;
  unit.command(g, { kind: 'move', x: m.center(N - 15), z });
  let t = 0;
  while (t < 40 && unit.order.kind === 'move') {
    g.update(0.05);
    t += 0.05;
  }
  console.log(`${type}: arrived ${unit.order.kind === 'idle'} in ${t.toFixed(1)}s, damage dealt to passing harvester ${(hp0 - victim.hp).toFixed(0)}`);
}
