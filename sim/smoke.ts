import * as THREE from 'three';
import { Game } from '../src/game/game';
import { AI } from '../src/game/ai';
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
const a = new AI(g, 0), b = new AI(g, 1);
const t0 = performance.now();
for (let i = 0; i < 20 * 60 * 20 && g.winner === null; i++) { g.update(0.05); a.update(0.05); b.update(0.05); }
console.log('time', g.time.toFixed(0), 'winner', g.winner, 'wall ms', (performance.now() - t0).toFixed(0));
for (const ts of g.teams) console.log(ts.team, Math.round(ts.credits), ts.stats);
