// AI-vs-AI matches: a candidate profile against the stock Normal AI, alternating map sides.
// Usage: npx tsx sim/match.ts <variant> <games> [startSeed] [opponentVariant]
import * as THREE from 'three';
import { AI, NORMAL_PROFILE, type AIProfile } from '../src/ai';
import { UNITS, type MapSize, type Team } from '../src/config';
import { Game } from '../src/game';
import { VARIANTS } from './variants';

const [name, gamesArg, offsetArg, oppName = 'normal'] = process.argv.slice(2);
const profile: AIProfile = { ...NORMAL_PROFILE, ...VARIANTS[name] };
const opponent: AIProfile = { ...NORMAL_PROFILE, ...VARIANTS[oppName] };
const games = Number(gamesArg ?? 20);
const offset = Number(offsetArg ?? 0);
const MAX_TIME = 30 * 60;
// Balance experiments: HARV_COST=600 npx tsx sim/match.ts ...; SIZE=96 for a bigger map
if (process.env.HARV_COST) UNITS.harvester.cost = Number(process.env.HARV_COST);
const AT = 300; // economy snapshot time

for (let k = 0; k < games; k++) {
  const side = ((k + offset) % 2) as Team;
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize);
  const ais = [0, 1].map((t) => new AI(g, t as Team, t === side ? profile : opponent));
  let spiceAt5 = 0;
  let armyAt5 = 0;
  let ref2 = -1;
  let noRefAt = -1;
  let incomeStalled = 0; // seconds with harvesters loaded but no refinery
  while (g.winner === null && g.time < MAX_TIME) {
    g.update(0.05);
    for (const ai of ais) ai.update(0.05);
    if (!spiceAt5 && g.time >= AT) {
      spiceAt5 = g.teams[side].stats.spiceHarvested;
      armyAt5 = g.units.filter((u) => u.team === side && u.def.weapon).reduce((s, u) => s + u.def.cost, 0);
    }
    if (ref2 < 0 && g.count(side, 'refinery') >= 2) ref2 = Math.round(g.time);
    if (g.time > 60 && g.count(side, 'refinery') === 0) {
      if (noRefAt < 0) noRefAt = Math.round(g.time);
      if (g.count(side, 'harvester') > 0) incomeStalled += 0.05;
    }
  }
  const me = g.teams[side].stats;
  console.log(JSON.stringify({
    variant: name, opponent: oppName, side, result: g.winner === null ? 'timeout' : g.winner === side ? 'win' : 'loss', time: Math.round(g.time),
    spiceAt5: Math.round(spiceAt5), armyAt5, ref2, noRefAt, incomeStalled: Math.round(incomeStalled), killed: me.unitsKilled, lost: me.unitsLost, refineries: g.count(side, 'refinery'),
  }));
}
