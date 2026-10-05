// Runs AI-vs-AI matches and audits movement: units stuck with a path, units spawned where they can't stand,
// and every individual movement step (path following and separation pushes) against the map's step rules.
import * as THREE from 'three';
import { AI } from '../src/ai';
import { Game } from '../src/game';
import { Unit } from '../src/entities';

// Wrap the two places units move, so each single step is checked (a frame can hold several legal steps).
let g!: Game;
const audit = (u: Unit, x0: number, z0: number) => {
  const m = g.map;
  const ax = m.cellOf(x0), az = m.cellOf(z0), bx = m.cellOf(u.x), bz = m.cellOf(u.z);
  if (ax === bx && az === bz || !m.canEnter(ax, az, u.moveClass)) return;
  // A push moves x then z, so allow the path through either intermediate cell.
  const via = (cx: number, cz: number) => (cx === ax && cz === az) || m.canStep(ax, az, cx, cz, u.moveClass);
  const legal = Math.abs(bx - ax) <= 1 && Math.abs(bz - az) <= 1 &&
    ((via(bx, az) && (bz === az || m.canStep(bx, az, bx, bz, u.moveClass))) || m.canStep(ax, az, bx, bz, u.moveClass));
  if (!legal && ++illegal <= 5) console.log(`illegal step t=${g.time.toFixed(1)} ${u.type} (${ax},${az})->(${bx},${bz})`);
};
const nudge = (Game.prototype as any).nudge;
(Game.prototype as any).nudge = function (u: Unit, dx: number, dz: number) {
  const x = u.x, z = u.z;
  nudge.call(this, u, dx, dz);
  audit(u, x, z);
};

let illegal = 0, stuckEvents = 0, wrongLevelSpawns = 0;
for (let k = 0; k < Number(process.argv[2] ?? 4); k++) {
  g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
  const ais = [new AI(g, 0), new AI(g, 1)];
  const last = new Map<number, { cx: number; cz: number; still: number; x: number; z: number }>();
  while (g.winner === null && g.time < 900) {
    g.update(0.05);
    for (const a of ais) a.update(0.05);
    const m = g.map;
    for (const u of g.units) {
      const cx = m.cellOf(u.x), cz = m.cellOf(u.z);
      const p = last.get(u.id);
      if (!p) {
        if (!m.canEnter(cx, cz, u.moveClass)) wrongLevelSpawns++;
      }
      const moved = p ? Math.hypot(u.x - p.x, u.z - p.z) : 1;
      const still = u.path.length && moved < 0.001 ? (p?.still ?? 0) + 0.05 : 0;
      if (still >= 10 && (p?.still ?? 0) < 10) {
        stuckEvents++;
        if (stuckEvents <= 5) console.log(`stuck 10s t=${g.time.toFixed(0)} ${u.type} at (${cx},${cz}) order ${u.order.kind} lv ${m.level[m.idx(cx, cz)]} ramp ${m.ramp[m.idx(cx, cz)]}`);
      }
      last.set(u.id, { cx, cz, still, x: u.x, z: u.z });
    }
  }
  console.log(`match ${k}: ${Math.round(g.time)}s winner ${g.winner}`);
}
console.log({ illegal, stuckEvents, wrongLevelSpawns });
