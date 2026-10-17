// What a Fremen AI does over a game, every 30 s: credits, income, army by type, rites under way, tech, worms.
// Usage: OPP=corrino npx tsx sim/fremen-trace.ts [games] [level]
import * as THREE from 'three';
import './fremen-variants';
import { createAI } from '../src/game/brutal';
import { Game, type Difficulty } from '../src/game/game';
import type { Faction, Team } from '../src/config';

const opp = (process.env.OPP ?? 'corrino') as Faction;
const games = Number(process.argv[2] ?? 2);
const level = (process.argv[3] ?? 'hard') as Difficulty;
for (let i = 0; i < games; i++) {
  const f = (i % 2) as Team;
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 1000 + (i >> 1), f === 0 ? ['fremen', opp] : [opp, 'fremen']);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ais = ([0, 1] as Team[]).map((t) => createAI(g, t, level));
  let next = 30;
  let spice = 0;
  console.log(`game ${i}: fremen are team ${f} vs ${opp}`);
  while (g.time < 1800 && g.winner === null) {
    for (const a of ais) a.update(0.05);
    g.update(0.05);
    if (g.time < next) continue;
    next += 30;
    const mine = g.units.filter((u) => u.team === f && !u.dead);
    const theirs = g.units.filter((u) => u.team !== f && !u.dead);
    const count = (us: typeof mine) => Object.entries(us.reduce((m, u) => ({ ...m, [u.type]: (m[u.type] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k}${v}`).join(' ');
    const ts = g.teams[f];
    const inc = ((ts.stats.spiceHarvested - spice) / 30).toFixed(1);
    spice = ts.stats.spiceHarvested;
    const val = (us: typeof mine) => us.reduce((a, u) => a + u.def.cost, 0);
    console.log(`${Math.round(g.time / 60 * 10) / 10}m cr${Math.round(ts.credits)} inc${inc}/s lvl${g.techLevel(f, 'sietch')} rites${mine.filter((u) => u.rite).length} ups[${[...ts.upgrades].join(',')}] | ${count(mine)} (${val(mine)}) vs ${count(theirs)} (${val(theirs)})`);
  }
  console.log(`  -> winner ${g.winner === f ? 'FREMEN' : g.winner === null ? 'none' : opp} at ${(g.time / 60).toFixed(1)}m, ridden ${g.wormLog.length}`);
}
