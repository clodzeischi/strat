// AI-vs-AI games between the factions: Corrino played by one AI level against Atreides played by another, each
// random map played from both sides. One JSON line per game, with what the Corrino side built and which of its
// abilities it used, so it's easy to see it plays the faction and not just its numbers.
// Usage: npx tsx sim/faction-match.ts <corrinoLevel> <atreidesLevel> <games> [offset]      levels: normal, hard, brutal, brutal-noair, brutal-nomicro
// In parallel with a summary: sim/faction-match.sh <games> <corrinoLevel> <atreidesLevel>
import * as THREE from 'three';
import { BRUTAL_OPTIONS, BRUTAL_PROFILE, BrutalAI, createAI } from '../src/game/brutal';
import type { Difficulty } from '../src/game/game';
import { Game } from '../src/game/game';
import type { Faction, MapSize, Team, UnitType } from '../src/config';

const [cLevel, aLevel, gamesArg, offsetArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 10);
const offset = Number(offsetArg ?? 0);
const MAX_TIME = 30 * 60;

for (let k = 0; k < games; k++) {
  const i = k + offset;
  const corrino = (i % 2) as Team;
  const factions: Faction[] = corrino === 0 ? ['corrino', 'atreides'] : ['atreides', 'corrino'];
  const seed = 1000 + Math.floor(i / 2);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed, factions);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  // 'brutal-noair': Brutal without Carryalls (no snipes, drops or ferrying), to see what they're worth.
  // 'brutal-nomicro': Brutal without kiting and focus fire.
  const make = (t: Team, level: string) => level === 'brutal-noair'
    ? new BrutalAI(g, t, BRUTAL_PROFILE, { ...BRUTAL_OPTIONS, carryalls: 0, snipe: false, para: false, ferry: false })
    : level === 'brutal-nomicro'
      ? new BrutalAI(g, t, BRUTAL_PROFILE, { ...BRUTAL_OPTIONS, micro: false })
      : createAI(g, t, level as Difficulty);
  const ais = ([0, 1] as Team[]).map((t) => make(t, t === corrino ? cLevel : aLevel));
  const built: Partial<Record<UnitType, number>> = {};
  const seen = new Set<number>();
  let deploys = 0, detonations = 0, mines = 0, pods = 0, padHeal = 0, mends = 0;
  const wasDeployed = new Set<number>();
  const startDet = g.startDetonation.bind(g);
  g.startDetonation = (u) => { if (u.detonateAt === null) detonations++; startDet(u); };
  const lay = g.layMine.bind(g);
  g.layMine = (u) => { const ok = lay(u); if (ok) mines++; return ok; };
  while (g.winner === null && g.time < MAX_TIME) {
    const before = g.units.filter((u) => u.team === corrino).reduce((s, u) => s + u.hp, 0);
    g.update(0.05);
    for (const ai of ais) ai.update(0.05);
    for (const u of g.units) {
      if (u.team !== corrino) continue;
      if (!seen.has(u.id)) {
        seen.add(u.id);
        built[u.type] = (built[u.type] ?? 0) + 1;
        if (u.falling?.pod) pods++;
      }
      if (u.deployState === 'deployed' && !wasDeployed.has(u.id)) { wasDeployed.add(u.id); deploys++; }
      if (u.deployState === 'mobile') wasDeployed.delete(u.id);
    }
    for (const b of g.buildings) if (b.team === corrino && b.repairing) mends += 0.05;
    for (const b of g.buildings) if (b.team === corrino && b.patients.length) padHeal += 0.05;
    void before;
  }
  const s = g.teams[corrino].stats;
  console.log(JSON.stringify({
    corrino: cLevel, atreides: aLevel, side: corrino, seed, result: g.winner === null ? 'timeout' : g.winner === corrino ? 'win' : 'loss', time: Math.round(g.time),
    killed: s.unitsKilled, lost: s.unitsLost, spice: Math.round(s.spiceHarvested), oppSpice: Math.round(g.teams[1 - corrino].stats.spiceHarvested),
    built, deploys, detonations, mines, pods, padSeconds: Math.round(padHeal), selfRepairSeconds: Math.round(mends),
  }));
}
