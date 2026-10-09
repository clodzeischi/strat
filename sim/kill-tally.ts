// Who kills whom, by credits: a few Hard-vs-Hard games, tallied by victim and killer type, and where Fremen units die.
// Usage: F=fremen,corrino npx tsx sim/kill-tally.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { createAI } from '../src/game/brutal';
import { Building, Unit } from '../src/entities';
import type { Faction } from '../src/config';
const fac = (process.env.F ?? 'fremen,atreides').split(',') as Faction[];
const tally = [new Map<string, number>(), new Map<string, number>()]; // per victim team: "victim<-killer" cost
const where = [0, 0, 0]; // fremen losses: on sand / rock / near enemy building
for (const seed of [1001, 1002, 1003, 1004]) {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, fac);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const kill = (g as any).kill.bind(g);
  (g as any).kill = (e: any, by: any) => {
    const v = e instanceof Building ? e.type : e.type;
    const k = by instanceof Unit ? by.type : by instanceof Building ? by.type : 'none';
    const cost = e instanceof Unit ? e.def.cost : 0;
    const key = `${v}<-${k}`;
    tally[e.team].set(key, (tally[e.team].get(key) ?? 0) + (cost || 1));
    if (e instanceof Unit && fac[e.team] === 'fremen' && e.type !== 'crew') {
      const enemyB = g.buildings.some((b) => b.team !== e.team && Math.hypot(b.x - e.x, b.z - e.z) < 24);
      where[enemyB ? 2 : e.onSand(g) ? 0 : 1]++;
    }
    kill(e, by);
  };
  const ais = [createAI(g, 0, 'hard'), createAI(g, 1, 'hard')];
  while (g.winner === null && g.time < 1500) { g.update(0.05); for (const a of ais) a.update(0.05); }
  console.log(seed, 'winner', fac[g.winner ?? 0], Math.round(g.time));
}
for (const t of [0, 1]) {
  console.log(`--- ${fac[t]} losses (credits, victim<-killer)`);
  console.log([...tally[t]].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k} ${v}`).join('\n'));
}
console.log('fremen unit deaths: open sand', where[0], 'rock', where[1], 'near enemy buildings', where[2]);
