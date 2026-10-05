// Checks the high-ground range modifier: a tank on high ground vs one below, at distances around 10 range.
import * as THREE from 'three';
import { Game } from '../src/game';
import { UNITS } from '../src/config';

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
const m = g.map;
// Find a high cell with low ground straight east of it, far enough for the test.
let spot: { hx: number; hz: number; lx: number } | null = null;
for (let i = 0; i < m.level.length && !spot; i++) {
  const cx = i % m.size, cz = (i / m.size) | 0;
  if (m.level[i] !== 1 || m.ramp[i] || !m.canEnter(cx, cz, 'vehicle')) continue;
  for (let k = 5; k <= 7 && !spot; k++) {
    const j = m.idx(cx + k, cz);
    if (cx + k < m.size && m.level[j] === 0 && !m.ramp[j] && m.canEnter(cx + k, cz, 'vehicle')) spot = { hx: cx, hz: cz, lx: cx + k };
  }
}
if (!spot) throw new Error('no test spot');
const high = g.spawnUnit('tank', 0, m.center(spot.hx), m.center(spot.hz));
const low = g.spawnUnit('tank', 1, m.center(spot.lx), m.center(spot.hz));
const w = UNITS.tank.weapon!;
console.log('levels', g.levelOf(high), g.levelOf(low));
console.log('base range', w.range, '| high shooting down', g.rangeFor(high, w, low).toFixed(1), '| low shooting up', g.rangeFor(low, w, high).toFixed(1));
