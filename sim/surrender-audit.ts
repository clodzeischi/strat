// Surrender audit: computer-against-computer games where offers to surrender are noted but never accepted, so every
// game plays on to its end. For each game: who offered and when, who won in the end, and how long the game dragged
// on after the loser's first offer. An offer from the side that went on to win (or that was still fighting at the
// time limit) gave up too soon.
// Usage: npx tsx sim/surrender-audit.ts [games=24] [firstSeed=1000] [difficulty=normal]
import * as THREE from 'three';
import { createAI } from '../src/game/hard-ai';
import { FACTION_LIST, type Faction, type MapSize, type Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';

const games = Number(process.argv[2] ?? 24);
const first = Number(process.argv[3] ?? 1000);
const difficulty = (process.argv[4] ?? 'easy') as Difficulty;
const LIMIT = 30 * 60;

let early = 0;
let noOffer = 0;
const tails: number[] = [];
for (let k = 0; k < games; k++) {
  const seed = first + k;
  // Every pairing of factions in turn, each side.
  const factions: Faction[] = [FACTION_LIST[k % 3], FACTION_LIST[Math.floor(k / 3) % 3]];
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed, factions);
  const offers: { team: Team; t: number }[] = [];
  g.onSurrenderOffer = (team) => offers.push({ team, t: g.time });
  const ais = [0, 1].map((t) => createAI(g, t as Team, difficulty));
  while (g.winner === null && g.time < LIMIT) {
    g.update(0.05);
    for (const a of ais) a.update(0.05);
  }
  const loser = g.winner === null ? null : 1 - g.winner;
  const bad = offers.filter((o) => o.team !== loser);
  const firstByLoser = offers.find((o) => o.team === loser);
  if (bad.length) early++;
  if (loser !== null && !firstByLoser) noOffer++;
  if (firstByLoser) tails.push(g.time - firstByLoser.t);
  const when = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  console.log(JSON.stringify({
    seed, factions: factions.join('-'), winner: g.winner, end: when(g.time),
    offers: offers.map((o) => `${o.team}@${when(o.t)}`).join(' '), tooSoon: bad.length > 0,
  }));
}
const mean = tails.length ? tails.reduce((a, b) => a + b, 0) / tails.length : 0;
console.log(JSON.stringify({
  games, offeredTooSoon: early, loserNeverOffered: noOffer,
  meanGameLeftAfterOffer: `${Math.round(mean)} s`, longestAfterOffer: `${Math.round(Math.max(0, ...tails))} s`,
}));
