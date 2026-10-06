// Economy-only experiment: one team follows a fixed build order with no army, the other idles.
// Compares adding harvesters to one refinery against building more refineries.
import * as THREE from 'three';
import { BUILDINGS, UNITS, type BuildingType, type Team } from '../src/config';
import { Game } from '../src/game/game';

type Step = BuildingType | 'harvester';

function findSpot(g: Game, team: Team, type: BuildingType) {
  const size = BUILDINGS[type].size;
  const anchor = g.buildings.find((b) => b.team === team && b.type === 'conyard')!;
  return g.map.nearestCell(anchor.cx, anchor.cz, (cx, cz) => {
    if (!g.canPlace(type, team, cx, cz)) return false;
    for (let z = cz - 1; z <= cz + size; z++)
      for (let x = cx - 1; x <= cx + size; x++)
        if (g.map.inBounds(x, z) && g.map.occupied[g.map.idx(x, z)] !== 0) return false;
    return true;
  }, 10);
}

function run(order: Step[], team: Team, checkpoints: number[]) {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera());
  const ts = g.teams[team];
  let i = 0;
  const out: number[] = [];
  let think = 0;
  for (let t = 0; out.length < checkpoints.length; t += 0.05) {
    g.update(0.05);
    if ((think -= 0.05) <= 0) {
      think = 0.5;
      if (ts.building?.ready) {
        const s = findSpot(g, team, ts.building.type);
        if (s) g.finishPlacement(team, s.cx, s.cz);
      }
      const step = order[i];
      if (step === 'harvester') {
        if (ts.queues.factory.length === 0 && ts.credits >= UNITS.harvester.cost && g.queueUnit(team, 'harvester')) i++;
      } else if (step && !ts.building && ts.credits >= BUILDINGS[step].cost && g.startBuilding(team, step)) i++;
    }
    if (g.time >= checkpoints[out.length]) out.push(Math.round(ts.credits + ts.stats.creditsSpent));
  }
  return { harvested: out, harvesters: g.count(team, 'harvester') };
}

const base: Step[] = ['refinery', 'barracks', 'factory'];
const h = (n: number): Step[] => Array(n).fill('harvester');
const variants: Record<string, Step[]> = {};
for (let n = 0; n <= 6; n++) variants[`1 ref + ${n} harv`] = [...base, ...h(n)];
for (let n = 0; n <= 4; n++) variants[`2 ref + ${n} harv`] = [...base, 'refinery', ...h(n)];
variants['3 ref + 0 harv'] = [...base, 'refinery', 'refinery'];

const checkpoints = [180, 300, 420, 600, 900];
console.log('Gross income (credits + spent - start) at', checkpoints.map((c) => c / 60 + 'm').join(' / '), 'minus economy spend = net');
for (const [name, order] of Object.entries(variants)) {
  for (const team of [0, 1] as Team[]) {
    const r = run(order, team, checkpoints);
    const econCost = order.reduce((s, x) => s + (x === 'harvester' ? UNITS.harvester.cost : x === 'refinery' ? BUILDINGS.refinery.cost : 0), 0);
    const income = r.harvested.map((v) => v - 2500);
    console.log(`${name.padEnd(16)} side ${team}  income ${income.map((v) => String(v).padStart(6)).join(' ')}   net@10m ${income[3] - econCost}  net@15m ${income[4] - econCost}`);
  }
}
