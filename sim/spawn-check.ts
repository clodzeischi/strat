// Checks random spawns over many seeds: symmetric maps, both bases on rock with a vehicle route between them,
// starting yards and units placed. Usage: npx tsx sim/spawn-check.ts [seeds per size]
import * as THREE from 'three';
import { Game } from '../src/game';
import { findPath } from '../src/pathfinding';
import { GameMap, ROCK } from '../src/map';
for (const size of [64, 96, 128] as const) {
  let bad = 0, asym = 0, dmin = 1e9, dmax = 0, fails = 0;
  const spots = new Set<string>();
  const S = Number(process.argv[2] ?? (size === 64 ? 150 : 40));
  for (let seed = 1000; seed < 1000 + S; seed++) {
    let g: Game;
    try { g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), size, seed); } catch (e) { fails++; console.log('crash', size, seed, (e as Error).message); continue; }
    const m = g.map, N = m.size, [a, b] = m.bases;
    spots.add(`${a.cx},${a.cz}`);
    const d = Math.hypot(a.cx - b.cx, a.cz - b.cz); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
    for (let i = 0; i < N * N; i++) {
      const j = m.idx(N - 1 - (i % N), N - 1 - ((i / N) | 0));
      if (m.tiles[i] !== m.tiles[j] || m.level[i] !== m.level[j] || m.ramp[i] !== m.ramp[j] || Math.abs(m.spice[i] - m.spice[j]) > 1e-3) { asym++; break; }
    }
    const yards = g.buildings.filter((x) => x.type === 'conyard').length;
    const onRock = m.bases.every((c) => m.tiles[m.idx(c.cx, c.cz)] === ROCK);
    // Route check on a fresh map: in the game, the base centers are covered by the Construction Yards.
    const bare = new GameMap(size, seed);
    const path = findPath(bare, m.center(a.cx), m.center(a.cz), m.center(b.cx), m.center(b.cz), 'vehicle');
    const end = path[path.length - 1];
    const route = !!end && Math.hypot(end.x - m.center(b.cx), end.z - m.center(b.cz)) <= 4;
    const units = g.units.filter((u) => m.passable(m.cellOf(u.x), m.cellOf(u.z))).length;
    if (yards !== 2 || !onRock || !route || units !== 8) {
      if (++bad <= 5) console.log('bad', size, seed, { yards, onRock, route, units });
    }
  }
  console.log(`size ${size}: ${S} seeds, bad ${bad}, asymmetric ${asym}, crashes ${fails}, distinct base spots ${spots.size}, base distance ${dmin.toFixed(0)}-${dmax.toFixed(0)} tiles (${(dmin / size).toFixed(2)}-${(dmax / size).toFixed(2)} map widths)`);
}
