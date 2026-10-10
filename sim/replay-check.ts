// Plays replay files back headlessly and checks they rebuild the recorded game: every stored checksum matches and
// the match ends the same way. Usage: npx tsx sim/replay-check.ts <file.json>...
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/game';
import { Match, parseReplay } from '../src/net/replay';

let failures = 0;
for (const file of process.argv.slice(2)) {
  const r = parseReplay(readFileSync(file, 'utf8'));
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), r.size, r.seed, r.factions);
  const m = Match.playback(g, r);
  while (g.winner === null && g.ticks < r.ticks) m.step();
  const ok = m.driftedAt === null && m.hashes.length === r.hashes.length && g.ticks === r.ticks && g.winner === r.winner;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${file}  (${r.factions.join(' vs ')}, ${g.ticks}/${r.ticks} ticks, ${m.hashes.length}/${r.hashes.length} checksums` +
    `${m.driftedAt === null ? '' : `, drifted at tick ${m.driftedAt}`}, winner ${g.winner === null ? 'none' : r.factions[g.winner]})`);
}
process.exit(failures ? 1 : 0);
