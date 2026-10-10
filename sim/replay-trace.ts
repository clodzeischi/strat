// A replay, minute by minute: each side's spice mined, kills, structures standing and units by type.
// Usage: npx tsx sim/replay-trace.ts <file.json>
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/game';
import { Match, parseReplay } from '../src/net/replay';
const r = parseReplay(readFileSync(process.argv[2], 'utf8'));
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), r.size, r.seed, r.factions);
const m = Match.playback(g, r);
const line = () => {
  const s = [0, 1].map((t) => {
    const us = g.units.filter((u) => u.team === t && !u.dead);
    const c: Record<string, number> = {};
    for (const u of us) c[u.type] = (c[u.type] ?? 0) + 1;
    const st = g.teams[t].stats;
    return `${r.factions[t].slice(0, 3)} sp${Math.round(st.spiceHarvested / 1000)}k k${st.unitsKilled} b${g.buildings.filter((b) => b.team === t && !b.dead).length} ${Object.entries(c).map(([k, v]) => k + v).join(',')}`;
  });
  console.log(`${Math.round(g.ticks / 1200)}m  ${s.join('  |  ')}`);
};
while (g.winner === null && g.ticks < r.ticks) { m.step(); if (g.ticks % 1200 === 0) line(); }
line();
console.log('winner', g.winner === null ? 'none' : r.factions[g.winner], 'surrendered', g.surrendered);
