// How many harvesters can one refinery feed before income stops scaling, and how long the spice lasts.
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { SPICE } from '../src/map';
import { BUILDINGS, type Team } from '../src/config';

const g0 = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
let tiles = 0, spice = 0;
for (let i = 0; i < g0.map.tiles.length; i++) if (g0.map.tiles[i] === SPICE) { tiles++; spice += g0.map.spice[i]; }
console.log(`map: ${tiles} spice tiles, ${Math.round(spice)} total spice`);

for (const n of [1, 4, 7, 10, 13, 16, 20]) {
  for (const team of [0] as Team[]) {
    const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
    const yard = g.buildings.find((b) => b.team === team)!;
    // Place a refinery instantly next to the yard, then n-1 extra harvesters at its dock.
    const spot = g.map.nearestCell(yard.cx, yard.cz, (cx, cz) => g.canPlace('refinery', team, cx, cz) && Math.abs(cx - yard.cx) + Math.abs(cz - yard.cz) > 4, 10)!;
    const ref = g.placeBuilding('refinery', team, spot.cx, spot.cz);
    const dock = g.dockCell(ref);
    for (let k = 1; k < n; k++) g.spawnUnit('harvester', team, g.map.center(dock.cx), g.map.center(dock.cz)).commandHarvest(g, null);
    const marks: string[] = [];
    let prev = 0;
    for (const m of [2, 5, 10, 15, 20, 30]) {
      while (g.time < m * 60) g.update(0.05);
      const h = g.teams[team].stats.spiceHarvested;
      marks.push(`${m}m:${Math.round((h - prev) / 1000)}k`);
      prev = h;
    }
    console.log(`${String(n).padStart(2)} harvesters, 1 refinery  income per interval  ${marks.join('  ')}`);
  }
}
