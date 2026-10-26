// One mirror game between two build orders (sim/ava-strats.ts), printed every 60 s: per side its credits, units by type,
// structures, upgrades, waves out, and how far its army stands from the enemy hub (tiles, median).
// Usage: FACTION=fremen npx tsx sim/mirror-trace.ts <strat> <oppStrat> [seed] [side]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { FACTIONS, TILE, type Faction, type Team } from '../src/config';
import './tune';
import { makeStrat } from './ava-strats';

const [a, b, seedArg, sideArg] = process.argv.slice(2);
const FACTION = (process.env.FACTION ?? 'atreides') as Faction;
const side = Number(sideArg ?? 0) as Team;
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as 64, Number(seedArg ?? 1000), [FACTION, FACTION]);
g.onSurrenderOffer = (t) => g.acceptSurrender(t);
const ais = ([0, 1] as Team[]).map((t) => makeStrat(g, t, t === side ? a : b));
const hub = FACTIONS[FACTION].hub;
let next = 60;
while (g.winner === null && g.time < 1800) {
  g.update(0.05);
  for (const ai of ais) ai.update(0.05);
  if (g.time < next) continue;
  next += 60;
  console.log(`${Math.round(g.time / 60)}m`);
  for (const t of [side, 1 - side] as Team[]) {
    const us = g.units.filter((u) => u.team === t && !u.dead);
    const count = Object.entries(us.reduce((m, u) => ({ ...m, [u.type]: (m[u.type] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k}${v}`).join(' ');
    const bs = g.buildings.filter((x) => x.team === t && !x.dead);
    const bcount = Object.entries(bs.reduce((m, x) => ({ ...m, [x.type]: (m[x.type] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k}${v}`).join(' ');
    const eh = g.buildings.find((x) => x.team !== t && x.type === hub && !x.dead);
    const ds = eh ? us.filter((u) => u.def.weapon).map((u) => Math.hypot(u.x - eh.x, u.z - eh.z) / TILE).sort((p, q) => p - q) : [];
    const hidden = us.filter((u) => u.hidden).length;
    const ai = ais[t] as unknown as { waves: { units: Set<unknown> }[] };
    console.log(`  ${t === side ? a : b}: cr${Math.round(g.teams[t].credits)} ups${g.teams[t].upgrades.size} waves${ai.waves.length}(${ai.waves.reduce((s, w) => s + w.units.size, 0)}) hidden${hidden} dist${ds.length ? Math.round(ds[ds.length >> 1]) : '-'} | ${count} | ${bcount}`);
  }
}
console.log(`winner ${g.winner === null ? 'none' : g.winner === side ? a : b} at ${(g.time / 60).toFixed(1)}m`);
