// One side's economy every 30 s in Hard vs Hard games (income, camps, crews, enemy harvesters). FACTIONS=fremen,corrino npx tsx sim/eco-trace.ts <games> <offset>
import * as THREE from 'three';
import { createAI } from '../src/game/hard-ai';
import { Game } from '../src/game/game';
import type { Faction, MapSize, Team } from '../src/config';
const [gamesArg, offArg] = process.argv.slice(2);
const [mine, theirs] = (process.env.FACTIONS ?? 'fremen,corrino').split(',') as Faction[];
for (let k = 0; k < Number(gamesArg ?? 4); k++) {
  const i = k + Number(offArg ?? 0);
  const me = (i % 2) as Team;
  const factions: Faction[] = me === 0 ? [mine, theirs] : [theirs, mine];
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, 1000 + Math.floor(i / 2), factions);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ais = ([0, 1] as Team[]).map((t) => createAI(g, t, 'hard'));
  const campsSeen = new Set<number>(); const crewsSeen = new Set<number>();
  let last = [0, 0]; const rows: unknown[] = [];
  while (g.winner === null && g.time < 15 * 60) {
    g.update(0.05); for (const a of ais) a.update(0.05);
    for (const b of g.buildings) if (b.team === me && b.type === 'camp') campsSeen.add(b.id);
    for (const u of g.units) if (u.team === me && u.type === 'crew') crewsSeen.add(u.id);
    if (Math.round(g.time * 20) % (30 * 20) === 0) {
      const camps = g.buildings.filter((b) => b.team === me && b.type === 'camp');
      const working = camps.filter((b) => !b.dry);
      const crews = g.units.filter((u) => u.team === me && u.type === 'crew');
      const spice = [me, 1 - me].map((t) => g.teams[t].stats.spiceHarvested);
      const rate = spice.map((s, t) => Math.round((s - last[t]) * 2)); last = spice;
      const harv = g.units.filter((u) => u.team !== me && u.type === 'harvester').length;
      const reach = working.map((b) => g.spiceAround(b.x, b.z));
      rows.push({ t: g.time / 60, rate, camps: working.length, dry: camps.length - working.length, crews: crews.length, harv, credits: Math.round(g.teams[me].credits), reach: reach.join(',') });
    }
  }
  console.log(JSON.stringify({ seed: 1000 + Math.floor(i / 2), side: me, winner: g.winner === me ? 'win' : 'loss', t: Math.round(g.time), campsBuilt: campsSeen.size, crewsTotal: crewsSeen.size, rows }));
}
