import * as THREE from 'three';
import { Game } from '../src/game/game';
import { AI } from '../src/game/ai';
const seed = Number(process.argv[2] ?? 7);
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
const ais = [new AI(g, 0), new AI(g, 1)];
let next = 0;
while (g.winner === null && g.time < 1800) {
  g.update(0.05); for (const a of ais) a.update(0.05);
  if (g.time >= next) {
    next += 60;
    const row = [0, 1].map((t) => {
      const army = g.units.filter((u) => u.team === t && u.def.weapon);
      const st: Record<string, number> = {};
      for (const u of army) st[u.order.kind] = (st[u.order.kind] ?? 0) + 1;
      return `T${t} cr${Math.round(g.teams[t].credits)} h${g.count(t as any, 'harvester')} r${g.count(t as any, 'refinery')} f${g.count(t as any, 'factory')} cy${g.count(t as any, 'conyard')} army${army.length} ${JSON.stringify(st)}`;
    });
    console.log(Math.round(g.time), row.join(' | '));
  }
}
console.log('winner', g.winner, Math.round(g.time));
