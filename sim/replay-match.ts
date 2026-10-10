// AI-vs-AI games played through the same Match the browser uses, each saved as a replay file. One JSON line per game.
// Usage: npx tsx sim/replay-match.ts <faction>,<faction> <level>,<level> <games> [offset]
//   e.g. SAVE=replays npx tsx sim/replay-match.ts fremen,corrino brutal,brutal 8      (map seeds 1000, 1001, …)
// Each game's sides swap with the seed's parity, as in the other sims; SAVE=<dir> writes <dir>/<seed>-<winner>.json.
// Watch one in the browser (title screen, Replays), or check it plays back the same: npx tsx sim/replay-check.ts <file>
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Faction, MapSize, Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';
import { Match } from '../src/net/replay';

const [factionsArg, levelsArg, gamesArg, offsetArg] = process.argv.slice(2);
const pair = (factionsArg ?? 'fremen,corrino').split(',') as Faction[];
const levels = (levelsArg ?? 'brutal,brutal').split(',') as Difficulty[];
const games = Number(gamesArg ?? 4);
const offset = Number(offsetArg ?? 0);
const MAX_TICKS = 30 * 60 * 20;

for (let k = 0; k < games; k++) {
  const i = k + offset;
  // The first faction plays team (i % 2).
  const first = (i % 2) as Team;
  const factions = first === 0 ? pair : [pair[1], pair[0]];
  const ai = first === 0 ? levels : [levels[1], levels[0]];
  const seed = 1000 + Math.floor(i / 2);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed, factions);
  g.difficulty = ai[1];
  const m = new Match(g, ai);
  while (g.winner === null && g.ticks < MAX_TICKS) m.step();
  const names = ai.map((d) => `${d[0].toUpperCase()}${d.slice(1)} AI`);
  const replay = m.replay(names);
  const winner = g.winner === null ? 'timeout' : factions[g.winner];
  let file = '';
  if (process.env.SAVE) {
    mkdirSync(process.env.SAVE, { recursive: true });
    file = `${process.env.SAVE}/${seed}-${factions[0]}-vs-${factions[1]}-${winner}.json`;
    writeFileSync(file, JSON.stringify(replay));
  }
  const s = g.teams.map((t) => t.stats);
  console.log(JSON.stringify({
    seed, factions: factions.join('-'), winner, surrendered: g.surrendered === null ? null : factions[g.surrendered], time: Math.round(g.time),
    spice: s.map((x) => Math.round(x.spiceHarvested)), killed: s.map((x) => x.unitsKilled), file,
  }));
}
