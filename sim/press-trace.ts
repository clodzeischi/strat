// Traces a PressureAI game (sim/ava-strats.ts): every 30 s, each squad's size, state and distance to the enemy
// base, the backup group, and both sides' harvesters. Usage: FACTION=corrino npx tsx sim/press-trace.ts <press> <opp> [seed]
import * as THREE from 'three';
import { Game } from '../src/game/game';
import type { Team } from '../src/config';
import { makeStrat } from './ava-strats';
import { hypot } from '../src/game/hypot';
import './tune';

const [a, b, seedArg] = process.argv.slice(2);
const f = (process.env.FACTION ?? 'corrino') as 'corrino';
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, Number(seedArg ?? 1000), [f, f]);
g.onSurrenderOffer = (t) => g.acceptSurrender(t);
const ais = [makeStrat(g, 0, a), makeStrat(g, 1, b)];
let tick = 0;
while (g.winner === null && g.time < 1800) {
  g.update(0.05);
  for (const ai of ais) ai.update(0.05);
  if (++tick % 600) continue;
  const p = ais[0] as any;
  const base = g.buildings.find((x) => x.team === 1 && x.type === 'conyard');
  const d = (u: { x: number; z: number }) => (base ? Math.round(hypot(u.x - base.x, u.z - base.z) / 2) : -1);
  const sq = (p.squads ?? []).map((s: any) => `${s.units.size}${s.regroup ? 'R' : 'O'}@${s.units.size ? d(p.centroid(s.units)) : '-'}`).join(' ');
  const harv = ([0, 1] as Team[]).map((t) => g.count(t, 'harvester'));
  const army = ([0, 1] as Team[]).map((t) => g.units.filter((u) => u.team === t && u.def.weapon && !u.dead).reduce((s, u) => s + u.def.cost, 0));
  const razors = g.count(0, 'razor');
  console.log(`${Math.round(g.time)}s squads ${sq} backup ${p.backup?.size ?? 0}@${p.backup?.size ? d(p.centroid(p.backup)) : '-'} razors ${razors} harv ${harv} army ${army} stats ${JSON.stringify(Object.fromEntries(Object.entries(p.stats).filter(([k]) => /press|backup/.test(k))))}`);
}
console.log('winner', g.winner, Math.round(g.time));
