// Brutal against Hard (or a scripted bot from sim/bots.ts), each random map played from both sides.
// Usage: npx tsx sim/brutal-match.ts <variant> <opponent> <games> [offset]     one JSON line per game
//   variant: a name from VARIANTS below (Brutal option / profile overrides); opponent: hard, normal, or a bot name.
// In parallel with a summary: sim/brutal.sh <games> <opponent> variant...
import * as THREE from 'three';
import { AI, HARD_PROFILE, NORMAL_PROFILE } from '../src/game/ai';
import { BRUTAL_OPTIONS, BRUTAL_PROFILE, BrutalAI, type BrutalOptions } from '../src/game/brutal';
import type { AIProfile } from '../src/game/ai';
import type { MapSize, Team } from '../src/config';
import { Game } from '../src/game/game';
import { BOTS } from './bots';

const MICRO: Partial<BrutalOptions> = { micro: true, mend: 0, harvesterRetreat: false, carryalls: 0, snipe: false, para: false, ferry: false, flank: false, march: false, think: 1 };

export const VARIANTS: Record<string, { opts?: Partial<BrutalOptions>; profile?: Partial<AIProfile> }> = {
  brutal: {},
  // Hard's own behavior run through the Brutal class: every Brutal switch off (should play Hard even, ~50%).
  'hard-as-brutal': { opts: { ...MICRO, micro: false }, profile: HARD_PROFILE },
  // Hard plus kiting and focus fire only.
  'micro-only': { opts: MICRO, profile: HARD_PROFILE },
  // Brutal with one thing taken away.
  'no-micro': { opts: { micro: false } },
  'no-mend': { opts: { mend: 0 } },
  'no-march': { opts: { march: false } },
  'no-hretreat': { opts: { harvesterRetreat: false } },
  'no-flank': { opts: { flank: false } },
  'no-air': { opts: { carryalls: 0 } },
  'no-snipe': { opts: { snipe: false } },
  'no-para': { opts: { para: false } },
  'no-ferry': { opts: { ferry: false } },
  'think-1': { opts: { think: 1 } },
  'hard-economy': { profile: { rallyOut: HARD_PROFILE.rallyOut, more: HARD_PROFILE.more } },
  // Alternatives that were tried.
  'snipe-tank': { opts: { sniper: 'tank' } },
  'air-early': { opts: { hitechAt: 360, hitechAtLarge: 360 } },
  'para-wave': { opts: { paraWithWave: true } },
  'harv-7': { profile: { harvesters: 7 } },
  'outmatched-1.6': { profile: { sustain: { ...BRUTAL_PROFILE.sustain, outmatched: 1.6 } } },
  'mix-turret': { profile: { mix: { infantry: 0.4, trike: 0.3, tank: 1.2, rocket: 1.2 } } },
};

const [variant, opponent, gamesArg, offsetArg] = process.argv.slice(2);
const games = Number(gamesArg ?? 10);
const offset = Number(offsetArg ?? 0);
const v = VARIANTS[variant];
if (!v) throw new Error(`unknown variant ${variant}`);
for (let k = 0; k < games; k++) {
  const n = k + offset;
  const side = (n % 2) as Team;
  // SEEDS=2000 plays a different set of maps (tuning on one set and checking on another catches overfitting).
  const seed = Number(process.env.SEEDS ?? 1000) + Math.floor(n / 2);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), Number(process.env.SIZE ?? 64) as MapSize, seed);
  g.onSurrenderOffer = (t) => g.acceptSurrender(t);
  const brutal = new BrutalAI(g, side, { ...BRUTAL_PROFILE, ...v.profile }, { ...BRUTAL_OPTIONS, ...v.opts });
  const other = (1 - side) as Team;
  const opp = opponent === 'hard' ? new AI(g, other, HARD_PROFILE)
    : opponent === 'normal' ? new AI(g, other, NORMAL_PROFILE)
    : opponent === 'brutal' ? new BrutalAI(g, other)
    : new BOTS[opponent](g, other);
  // Harvesters each side has lost, and the spice ratio at 5 and 10 minutes.
  const harvLost = [0, 0];
  const stuck = [0, 0];
  const lastPos = new Map<number, { x: number; z: number }>();
  let alive = new Map<number, Team>();
  const snap: Record<string, number> = {};
  while (g.winner === null && g.time < 30 * 60) {
    g.update(0.05);
    brutal.update(0.05);
    opp.update(0.05);
    if (g.ticks % 100 === 0) {
      // Harvesters driving to spice or a refinery that got nowhere in the last 5 seconds: stuck in traffic.
      for (const u of g.units) {
        if (u.type !== 'harvester' || u.carrier) continue;
        const p = lastPos.get(u.id);
        if (p && (u.hstate === 'toSpice' || u.hstate === 'toRefinery') && Math.hypot(u.x - p.x, u.z - p.z) < 1) stuck[u.team] += 5;
        lastPos.set(u.id, { x: u.x, z: u.z });
      }
    }
    if (g.ticks % 20 === 0) {
      const now = new Map<number, Team>();
      for (const u of g.units) if (u.type === 'harvester') now.set(u.id, u.team);
      for (const [id, t] of alive) if (!now.has(id)) harvLost[t]++;
      alive = now;
    }
    for (const t of [300, 600]) if (!snap[`spice${t}`] && g.time >= t) {
      snap[`spice${t}`] = Math.round((g.teams[side].stats.spiceHarvested / Math.max(1, g.teams[other].stats.spiceHarvested)) * 100) / 100;
    }
  }
  const me = g.teams[side].stats;
  const them = g.teams[other].stats;
  console.log(JSON.stringify({
    variant, opponent, seed, side, result: g.winner === null ? 'timeout' : g.winner === side ? 'win' : 'loss', time: Math.round(g.time),
    killed: me.unitsKilled, lost: me.unitsLost, spice: Math.round(me.spiceHarvested), oppSpice: Math.round(them.spiceHarvested), harvLost: harvLost[side], oppHarvLost: harvLost[other], stuck: stuck[side], oppStuck: stuck[other], ...snap, ...brutal.stats,
  }));
}
