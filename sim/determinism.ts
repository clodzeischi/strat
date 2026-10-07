// Lockstep needs the simulation to be deterministic: the same seed and the same commands must give the same game,
// bit for bit. This plays Hard-vs-Hard AI games twice, one after the other and then side by side (two games
// stepping in turn, which catches state shared between games), and compares state checksums every second.
// Usage: npx tsx sim/determinism.ts [games] [minutes]
import * as THREE from 'three';
import { AI, HARD_PROFILE } from '../src/game/ai';
import type { Team } from '../src/config';
import { Game } from '../src/game/game';
import { TICK } from '../src/net/lockstep';

const games = Number(process.argv[2] ?? 3);
const minutes = Number(process.argv[3] ?? 8);
const TICKS = Math.round((minutes * 60) / TICK);

function setup(seed: number) {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ais = [0, 1].map((t) => new AI(g, t as Team, HARD_PROFILE));
  const hashes: number[] = [];
  const step = () => {
    if (g.winner !== null) return;
    for (const ai of ais) ai.update(TICK);
    g.update(TICK);
    if (g.ticks % 20 === 0) hashes.push(g.hash());
  };
  return { g, hashes, step };
}

function firstDiff(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}

let failures = 0;
for (let k = 0; k < games; k++) {
  const seed = 2000 + k;
  const a = setup(seed);
  for (let t = 0; t < TICKS; t++) a.step();
  const b = setup(seed);
  for (let t = 0; t < TICKS; t++) b.step();
  // Side by side: two more copies stepping in turn.
  const c = setup(seed);
  const d = setup(seed);
  for (let t = 0; t < TICKS; t++) {
    c.step();
    d.step();
  }
  const runs = [b, c, d].map((r) => firstDiff(a.hashes, r.hashes));
  const ok = runs.every((i) => i < 0);
  if (!ok) failures++;
  const diverged = runs.filter((i) => i >= 0);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  seed ${seed}: ${a.hashes.length} checksums, ${a.g.units.length} units at the end, winner ${a.g.winner ?? 'none'}${ok ? '' : `  (first difference at ${Math.min(...diverged)} s)`}`);
}
console.log(failures ? `\n${failures} game(s) not deterministic` : '\nall games deterministic');
process.exitCode = failures ? 1 : 0;
