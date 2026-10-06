// The AI against scripted player strategies (sim/bots.ts), each map played from both sides.
// Usage: npx tsx sim/gauntlet.ts <difficulty> <bot> <games> [offset]     prints one JSON line per game
// All bots, in parallel: sim/gauntlet.sh <games-per-bot> [difficulty...]
import * as THREE from 'three';
import { AI, profileFor } from '../src/game/ai';
import type { MapSize, Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';
import { BOTS } from './bots';

const [difficulty, bot, gamesArg, offsetArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 10);
const offset = Number(offsetArg ?? 0);
for (let k = 0; k < games; k++) {
  const n = k + offset;
  const side = (n % 2) as Team; // the AI's team
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, 1000 + Math.floor(n / 2));
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ai = new AI(g, side, profileFor(difficulty as Difficulty));
  const player = new BOTS[bot](g, (1 - side) as Team);
  let lostHarv = 0;
  while (g.winner === null && g.time < 30 * 60) {
    g.update(0.05);
    ai.update(0.05);
    player.update(0.05);
  }
  lostHarv = g.teams[side].stats.unitsLost;
  console.log(JSON.stringify({
    difficulty, bot, seed: 1000 + Math.floor(n / 2), side,
    result: g.winner === null ? 'timeout' : g.winner === side ? 'win' : 'loss', surrendered: g.surrendered === side, time: Math.round(g.time),
    killed: g.teams[side].stats.unitsKilled, lost: lostHarv,
  }));
}
