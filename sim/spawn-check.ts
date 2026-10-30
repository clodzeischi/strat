// Checks random spawns over many seeds: maps symmetric under all their symmetries (spots 2/4/8 by size), every spot
// on rock with a vehicle route to all the others, the two bases at different spots, starting yards and units placed. Usage: npx tsx sim/spawn-check.ts [seeds per size]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { findPath } from '../src/game/pathfinding';
import { GameMap, ROCK } from '../src/map';
for (const size of [64, 96, 128] as const) {
  let bad = 0, asym = 0, dmin = 1e9, dmax = 0, fails = 0, noM = 0, noS = 0;
  const spots = new Set<string>();
  const S = Number(process.argv[2] ?? (size === 64 ? 150 : 40));
  for (let seed = 1000; seed < 1000 + S; seed++) {
    let g: Game;
    try { g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), size, seed); } catch (e) { fails++; console.log('crash', size, seed, (e as Error).message); continue; }
    const m = g.map, N = m.size, [a, b] = m.bases;
    spots.add(`${a.cx},${a.cz}`);
    const d = Math.hypot(a.cx - b.cx, a.cz - b.cz); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
    const syms = (m as unknown as { syms: object[]; image(x: number, z: number, s: object): { cx: number; cz: number } });
    sym: for (const s of syms.syms) {
      for (let i = 0; i < N * N; i++) {
        const c = syms.image(i % N, (i / N) | 0, s);
        const j = m.idx(c.cx, c.cz);
        if (m.tiles[i] !== m.tiles[j] || m.level[i] !== m.level[j] || m.ramp[i] !== m.ramp[j] || Math.abs(m.spice[i] - m.spice[j]) > 1e-3) { asym++; break sym; }
      }
    }
    const yards = g.buildings.filter((x) => x.type === 'conyard').length;
    const onRock = m.spots.every((c) => m.tiles[m.idx(c.cx, c.cz)] === ROCK) && m.spots.length === ({ 64: 2, 96: 4, 128: 8 } as const)[size];
    // Route check on a fresh map: in the game, the base centers are covered by the Construction Yards.
    const bare = new GameMap(size, seed);
    const route = a !== b && bare.spots.every((c) => {
      const path = findPath(bare, m.center(m.spots[0].cx), m.center(m.spots[0].cz), m.center(c.cx), m.center(c.cz), 'vehicle');
      const end = path[path.length - 1];
      return c === bare.spots[0] || (!!end && Math.hypot(end.x - m.center(c.cx), end.z - m.center(c.cz)) <= 4);
    });
    const units = g.units.filter((u) => m.passable(m.cellOf(u.x), m.cellOf(u.z))).length;
    // Every spot has its own home field (L) next to it; medium and small fields are counted where they didn't fit.
    const homes = m.spots.every((c) => m.fields.some((f) => f.kind === 'L' && Math.hypot(f.cx - c.cx, f.cz - c.cz) < 26))
      && m.fields.filter((f) => f.kind === 'L').length === m.spots.length;
    if (!m.fields.some((f) => f.kind === 'M')) noM++;
    if (!m.fields.some((f) => f.kind === 'S')) noS++;
    if (yards !== 2 || !onRock || !route || units !== 8 || !homes) {
      if (++bad <= 5) console.log('bad', size, seed, { yards, onRock, route, units, homes });
    }
  }
  console.log(`size ${size}: ${S} seeds, bad ${bad}, asymmetric ${asym}, crashes ${fails}, no M field ${noM}, no S field ${noS}, distinct base spots ${spots.size}, base distance ${dmin.toFixed(0)}-${dmax.toFixed(0)} tiles (${(dmin / size).toFixed(2)}-${(dmax / size).toFixed(2)} map widths)`);
}
