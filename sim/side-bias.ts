// Spawn fairness: the same AI on both sides, each map played several times. On a fair map each side wins about half.
// Usage: npx tsx sim/side-bias.ts [maps=20] [repeats=6] [firstSeed=1000] [difficulty=hard]
// Prints one JSON line per map: { seed, team0 wins, games }, then the mean deviation from 50%.
import * as THREE from 'three';
import { AI, profileFor } from '../src/game/ai';
import type { MapSize, Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';

const [mapsArg, repsArg, firstArg, diffArg] = process.argv.slice(2);
const maps = Number(mapsArg ?? 20);
const reps = Number(repsArg ?? 6);
const first = Number(firstArg ?? 1000);
const profile = profileFor((diffArg ?? 'hard') as Difficulty);
let dev = 0;
for (let m = 0; m < maps; m++) {
  const seed = first + m;
  let wins0 = 0;
  let decided = 0;
  for (let r = 0; r < reps; r++) {
    const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed);
    g.onSurrenderOffer = (t) => g.acceptSurrender(t);
    const ais = [0, 1].map((t) => new AI(g, t as Team, profile));
    while (g.winner === null && g.time < 1800) {
      g.update(0.05);
      for (const a of ais) a.update(0.05);
    }
    if (g.winner !== null) decided++;
    if (g.winner === 0) wins0++;
  }
  dev += Math.abs(wins0 / Math.max(1, decided) - 0.5);
  console.log(JSON.stringify({ seed, team0: wins0, games: decided }));
}
console.log(JSON.stringify({ meanDeviation: +(dev / maps).toFixed(3) }));
