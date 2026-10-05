// Same harvester count, one vs two refineries, no enemy: does a second dock raise income?
import * as THREE from 'three';
import { Game } from '../src/game';
import type { Team } from '../src/config';

const team: Team = 0;
for (const n of [4, 8, 12]) {
  for (const refs of [1, 2]) {
    const runs: number[] = [];
    for (let k = 0; k < 4; k++) {
      const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
      const yard = g.buildings.find((b) => b.team === team)!;
      let harvesters = 0;
      for (let r = 0; r < refs; r++) {
        const spot = g.map.nearestCell(yard.cx, yard.cz, (cx, cz) => {
          if (!g.canPlace('refinery', team, cx, cz)) return false;
          for (let z = cz - 1; z <= cz + 3; z++) for (let x = cx - 1; x <= cx + 3; x++) if (g.map.inBounds(x, z) && g.map.occupied[g.map.idx(x, z)] !== 0) return false;
          return true;
        }, 10)!;
        g.placeBuilding('refinery', team, spot.cx, spot.cz);
        harvesters++;
      }
      const ref = g.buildings.find((b) => b.type === 'refinery')!;
      const dock = g.dockCell(ref);
      for (; harvesters < n; harvesters++) g.spawnUnit('harvester', team, g.map.center(dock.cx), g.map.center(dock.cz)).commandHarvest(g, null);
      while (g.time < 600) g.update(0.05);
      runs.push(g.teams[team].stats.spiceHarvested);
    }
    const avg = runs.reduce((s, x) => s + x, 0) / runs.length;
    console.log(`${String(n).padStart(2)} harvesters, ${refs} refinery: ${Math.round(avg / 10)} credits/min over 10 min (${Math.round(avg / 10 / n)} per harvester)`);
  }
}
