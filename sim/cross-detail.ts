// Cross-faction games in detail: one AI level for both sides, each random map from both sides. One JSON line per game
// with, per side (the first faction first): units built, credits killed by killer type and lost by victim type,
// killer>victim credits, tech timings, spice, and army value every minute. Summary: sim/cross-summary.ts.
// Usage: FACTIONS=fremen,atreides npx tsx sim/cross-detail.ts <level> <games> [offset]
import * as THREE from 'three';
import './tune';
import { createAI } from '../src/game/brutal';
import { Game, type Difficulty } from '../src/game/game';
import { Building, Unit } from '../src/entities';
import { LEVEL_UP_ORDER, type Faction, type MapSize, type Team, type UnitType } from '../src/config';

const [level, gamesArg, offsetArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 2);
const offset = Number(offsetArg ?? 0);
const factions = (process.env.FACTIONS ?? 'fremen,atreides').split(',') as Faction[];

for (let k = 0; k < games; k++) {
  const n = k + offset;
  const side = (n % 2) as Team; // the first faction's team
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, 1000 + Math.floor(n / 2), side === 0 ? factions : [factions[1], factions[0]]);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ais = ([0, 1] as Team[]).map((t) => createAI(g, t, (level ?? 'hard') as Difficulty));
  const built: Partial<Record<UnitType, number>>[] = [{}, {}];
  const kills: Record<string, number>[] = [{}, {}];
  const deaths: Record<string, number>[] = [{}, {}];
  const tech: Record<string, number>[] = [{}, {}];
  const kv: Record<string, number>[] = [{}, {}]; // per killer team
  const army: number[][] = [[], []];
  const seen = new Set<number>();
  const kill = (g as any).kill.bind(g);
  (g as any).kill = (e: any, by: any) => {
    if (!e.dead && by && by.team !== e.team) {
      const kt = by instanceof Unit || by instanceof Building ? by.type : 'other';
      const cost = e instanceof Unit ? e.def.cost : 0;
      const vt = e instanceof Unit ? e.type : `[${e.type}]`;
      if (cost) {
        kills[by.team][kt] = (kills[by.team][kt] ?? 0) + cost;
        deaths[e.team][vt] = (deaths[e.team][vt] ?? 0) + cost;
      }
      kv[by.team][`${kt}>${vt}`] = (kv[by.team][`${kt}>${vt}`] ?? 0) + (cost || 1);
    }
    kill(e, by);
  };
  let tick = 0;
  while (g.winner === null && g.time < 1800) {
    g.update(0.05);
    for (const ai of ais) ai.update(0.05);
    if (++tick % 20) continue;
    for (const u of g.units) if (!seen.has(u.id)) { seen.add(u.id); built[u.team][u.type] = (built[u.team][u.type] ?? 0) + 1; }
    for (const t of [0, 1] as Team[]) {
      for (const up of g.teams[t].upgrades) tech[t][up] ??= Math.round(g.time);
      for (const l of LEVEL_UP_ORDER) for (const lv of [2, 3]) if (g.techLevel(t, l) >= lv) tech[t][l + lv] ??= Math.round(g.time);
    }
    if (tick % 1200 === 0) for (const t of [0, 1] as Team[]) army[t].push(Math.round(g.units.filter((u) => u.team === t && u.def.weapon).reduce((s, u) => s + u.def.cost, 0)));
  }
  const o = (1 - side) as Team;
  const pick = <T>(a: T[]) => [a[side], a[o]];
  console.log(JSON.stringify({
    factions, seed: 1000 + Math.floor(n / 2), side, result: g.winner === null ? 'timeout' : g.winner === side ? 'win' : 'loss', time: Math.round(g.time),
    spice: pick([0, 1].map((t) => Math.round(g.teams[t].stats.spiceHarvested))), built: pick(built), kills: pick(kills), deaths: pick(deaths), tech: pick(tech), kv: pick(kv), army: pick(army),
  }));
}
