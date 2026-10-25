// Atreides mirror: one build order (sim/ava-strats.ts) against another, each random map played from both sides.
// One JSON line per game: result, length, what each side built and researched (and when), and who killed what
// (credits, by killer type). Usage: npx tsx sim/ava.ts <strat> <oppStrat> <games> [offset]
// SEEDS=<first map seed> (default 1000); SIZE=96 for medium maps. In parallel, with a summary: sim/ava.sh
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { Building, Unit } from '../src/entities';
import type { MapSize, Team, UnitType } from '../src/config';
import './tune';
import { makeStrat } from './ava-strats';

const [a, b, gamesArg, offsetArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 10);
const offset = Number(offsetArg ?? 0);
const first = Number(process.env.SEEDS ?? 1000);
const MAX_TIME = 30 * 60;

for (let k = 0; k < games; k++) {
  const n = k + offset;
  const side = (n % 2) as Team; // a's team
  const seed = first + Math.floor(n / 2);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed, ['atreides', 'atreides']);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const ais = ([0, 1] as Team[]).map((t) => makeStrat(g, t, t === side ? a : b));
  const built: Partial<Record<UnitType, number>>[] = [{}, {}];
  const kills: Record<string, number>[] = [{}, {}]; // per killer team: killer type -> credits killed
  const deaths: Record<string, number>[] = [{}, {}]; // per victim team: victim type -> credits lost
  const tech: Record<string, number>[] = [{}, {}];
  const kv: Record<string, number> = {}; // 'killer>victim' -> credits, both sides
  const air: Record<string, number>[] = [{}, {}]; // per team: Carryall-seconds by what it's doing
  const hdeaths: Record<string, unknown>[][] = [[], []]; // per team: each harvester lost, and how

  const seen = new Set<number>();
  const kill = (g as any).kill.bind(g);
  (g as any).kill = (e: any, by: any) => {
    if (e instanceof Unit && !e.dead && by && by.team !== e.team) {
      const k = by instanceof Unit ? by.type : by instanceof Building ? by.type : 'other';
      kills[by.team][k] = (kills[by.team][k] ?? 0) + e.def.cost;
      deaths[e.team][e.type] = (deaths[e.team][e.type] ?? 0) + e.def.cost;
      kv[`${k}>${e.type}`] = (kv[`${k}>${e.type}`] ?? 0) + e.def.cost;
      if (e.type === 'harvester') {
        const ref = g.nearestBuilding(e.team, 'refinery', e.x, e.z);
        const f = g.ferryFor(e) as any;
        hdeaths[e.team].push({ t: Math.round(g.time), by: k, ferried: !!f, rescue: !!f?.task?.rescue, carried: !!e.carrier, state: (e as any).hstate, ref: ref ? Math.round(Math.hypot(ref.x - e.x, ref.z - e.z) / 2) : -1 });
      }
    }
    kill(e, by);
  };
  let tick = 0;
  while (g.winner === null && g.time < MAX_TIME) {
    g.update(0.05);
    for (const ai of ais) ai.update(0.05);
    if (++tick % 20) continue;
    for (const u of g.units) if (!seen.has(u.id)) { seen.add(u.id); built[u.team][u.type] = (built[u.team][u.type] ?? 0) + 1; }
    for (const u of g.units) {
      if (u.type !== 'carryall') continue;
      const c = u as any;
      const k = c.load.length ? (c.load[0].type === 'harvester' ? 'lifting' : 'carrying') : c.task.kind;
      air[u.team][k] = (air[u.team][k] ?? 0) + 1;
    }
    for (const t of [0, 1] as Team[]) {
      for (const up of g.teams[t].upgrades) if (tech[t][up] === undefined) tech[t][up] = Math.round(g.time);
      for (const l of ['conyard', 'factory'] as const) if (g.techLevel(t, l) >= 2 && tech[t][l + '2'] === undefined) tech[t][l + '2'] = Math.round(g.time);
    }
  }
  const o = (1 - side) as Team;
  console.log(JSON.stringify({
    a, b, seed, side, result: g.winner === null ? 'timeout' : g.winner === side ? 'win' : 'loss', time: Math.round(g.time),
    spice: [Math.round(g.teams[side].stats.spiceHarvested), Math.round(g.teams[o].stats.spiceHarvested)],
    built: [built[side], built[o]], kills: [kills[side], kills[o]], deaths: [deaths[side], deaths[o]], tech: [tech[side], tech[o]], kv,
    stats: [(ais[side] as any).stats, (ais[o] as any).stats], air: [air[side], air[o]], hdeaths: [hdeaths[side], hdeaths[o]],
  }));
}
