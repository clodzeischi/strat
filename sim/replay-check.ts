// Plays replay files back headlessly and checks they rebuild the recorded game: every stored checksum matches and
// the match ends the same way. Usage: npx tsx sim/replay-check.ts [file.json...]
// With no files it records a fresh Brutal-vs-Brutal game in this build and checks that replay instead, then lists how
// the bundled replays (src/public/replays) fare: those were recorded on older builds, so drifting there is reported
// but isn't a failure (the viewer warns about it).
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/game/game';
import { Match, parseReplay, type Replay } from '../src/net/replay';

/** Plays a replay back; returns whether it matched, and prints a line about it. */
function check(name: string, r: Replay, strict: boolean): boolean {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), r.size, r.seed, r.factions);
  const m = Match.playback(g, r);
  while (g.winner === null && g.ticks < r.ticks) m.step();
  const ok = m.driftedAt === null && m.hashes.length === r.hashes.length && g.ticks === r.ticks && g.winner === r.winner;
  console.log(`${ok ? 'ok  ' : strict ? 'FAIL' : 'old '}  ${name}  (${r.factions.join(' vs ')}, ${g.ticks}/${r.ticks} ticks, ${m.hashes.length}/${r.hashes.length} checksums` +
    `${m.driftedAt === null ? '' : `, drifted at tick ${m.driftedAt}`}, winner ${g.winner === null ? 'none' : r.factions[g.winner]})`);
  return ok;
}

let failures = 0;
const files = process.argv.slice(2);
if (files.length) {
  for (const file of files) if (!check(file, parseReplay(readFileSync(file, 'utf8')), true)) failures++;
} else {
  // Record a game the way the browser does (through Match), round-trip it through JSON, play it back.
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1000, ['fremen', 'corrino']);
  g.difficulty = 'brutal';
  const m = new Match(g, ['brutal', 'brutal']);
  while (g.winner === null && g.ticks < 20 * 60 * 6) m.step();
  const r = parseReplay(JSON.stringify(m.replay(['Brutal AI', 'Brutal AI'])));
  if (!check(`fresh recording (seed 1000, ${r.commands.length} commands)`, r, true)) failures++;
  const dir = 'src/public/replays';
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { file: string }[];
  for (const e of index) check(`bundled ${e.file}`, parseReplay(readFileSync(join(dir, e.file), 'utf8')), false);
}
console.log(failures ? `\n${failures} replay(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
