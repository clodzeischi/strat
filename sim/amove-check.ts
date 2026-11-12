// Checks attack-move carries on after a fight: a unit that stops in range to kill an enemy near its line, or drives
// off to chase one, must still arrive at its destination afterwards. Usage: npx tsx sim/amove-check.ts
import * as THREE from 'three';
import type { UnitType } from '../src/config';
import { Game } from '../src/game/game';
import { SAND } from '../src/map';
import { TILE } from '../src/config/rules';

let fail = false;
for (const type of ['trooper', 'trike', 'tank', 'rocket'] as UnitType[]) {
  for (const off of [1, 6]) {
    const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
    for (const u of g.units) u.dead = true; // clear the starting units
    const m = g.map;
    m.tiles.fill(SAND);
    m.level.fill(0);
    m.ramp.fill(0);
    const N = m.size;
    const row = (N / 2) | 0;
    const z = m.center(row);
    const goalX = m.center(N - 15);
    const unit = g.spawnUnit(type, 0, m.center(14), z, 0);
    // An unarmed enemy beside the line, `off` cells away: 1 is shot from the line, 6 may be chased off it.
    const victim = g.spawnUnit('harvester', 1, m.center((N / 2) | 0), m.center(row + off), 0);
    unit.command(g, { kind: 'amove', x: goalX, z });
    let t = 0;
    while (t < 240 && unit.order.kind === 'amove' && !unit.dead) {
      g.update(0.05);
      t += 0.05;
    }
    const left = Math.hypot(unit.x - goalX, unit.z - z);
    // Only the one beside the line has to die: further off, a fast unit may pass it by.
    const ok = (victim.dead || off > 1) && left < TILE * 2;
    if (!ok) fail = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${type} offset ${off}: enemy killed ${victim.dead}, ${left.toFixed(0)} m short of the goal after ${t.toFixed(0)}s`);
  }
}
process.exit(fail ? 1 : 0);
