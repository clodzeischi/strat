// Measures how each combat unit type fares against each other one, and writes src/game/matchups.ts, which the AI
// uses to pick counters. Rerun after changing unit stats: npx tsx sim/matchups.ts
//
// Each matchup is an equal-cost duel in open ground (both armies attack-move at each other), played on a few maps
// with both sides swapped, then averaged with the mirrored matchup. The score is (value A has left - value B has
// left) / starting value, shields counted with health: +1 means A won without a scratch, -1 the reverse. Done four
// times: with and without Infantry Rockets on each side (which only changes anything for Atreides infantry).
// Every unit fights for its own faction, so Corrino units have their shields. Rows run in parallel processes.
import * as THREE from 'three';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { Game } from '../src/game/game';
import { FACTIONS, unitDef, type Faction, type Team, type UnitType } from '../src/config';

const TYPES: UnitType[] = ['infantry', 'trike', 'tank', 'rocket', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery'];
const BUDGET = 4000;
const SEEDS = [1003, 1007, 1012];
const KEYS = ['--', '-R', 'R-', 'RR'];

const factionOf = (t: UnitType): Faction => (FACTIONS.corrino.train.includes(t) && t !== 'harvester' ? 'corrino' : 'atreides');

function duel(a: UnitType, b: UnitType, rocketsA: boolean, rocketsB: boolean, seed: number, swap: boolean): number {
  const [ta, tb]: Team[] = swap ? [1, 0] : [0, 1];
  const factions: Faction[] = [];
  factions[ta] = factionOf(a);
  factions[tb] = factionOf(b);
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, factions);
  for (const u of [...g.units]) {
    u.hp = 0;
    (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  if (rocketsA) g.teams[ta].upgrades.add('rockets');
  if (rocketsB) g.teams[tb].upgrades.add('rockets');
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const spawnArmy = (team: Team, type: UnitType, row: number, dir: number) => {
    const n = Math.round(BUDGET / unitDef(factions[team], type).cost);
    for (let k = 0; k < n; k++) {
      const c = m.nearestCell(mid - 8 + (k % 16), row + Math.floor(k / 16) * dir, (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      const u = g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
      u.command(g, { kind: 'amove', x: m.center(mid), z: m.center(row - dir * 30) });
    }
  };
  spawnArmy(ta, a, mid - 10, -1);
  spawnArmy(tb, b, mid + 10, 1);
  const value = (t: Team) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * ((u.hp + u.shields) / (u.maxHp + u.maxShields)), 0);
  const start = Math.min(value(ta), value(tb));
  while (g.time < 120 && g.units.some((u) => u.team === ta) && g.units.some((u) => u.team === tb)) {
    g.update(0.05);
    // MLRS lock on to the units they shoot at as soon as they can, as the AI does.
    for (const u of g.units) if (u.def.lockOn && u.target?.kind === 'unit' && g.time >= u.nextLock) g.lockOn(u, u.target);
  }
  return (value(ta) - value(tb)) / start;
}

/** One row (attacker type a) of every key: { key: { b: score } }. Rockets only matter for Atreides infantry. */
function row(a: UnitType): Record<string, Record<string, number>> {
  const cache = new Map<string, number>();
  const out: Record<string, Record<string, number>> = {};
  for (const key of KEYS) {
    out[key] = {};
    for (const b of TYPES) {
      const ra = key[0] === 'R' && a === 'infantry';
      const rb = key[1] === 'R' && b === 'infantry';
      const id = `${b}${+ra}${+rb}`;
      if (!cache.has(id)) {
        let sum = 0;
        let n = 0;
        for (const seed of SEEDS) for (const swap of [false, true]) {
          sum += duel(a, b, ra, rb, seed, swap);
          n++;
        }
        cache.set(id, sum / n);
      }
      out[key][b] = cache.get(id)!;
    }
  }
  return out;
}

const rowArg = process.argv.indexOf('--row');
if (rowArg >= 0) {
  process.stdout.write(JSON.stringify(row(process.argv[rowArg + 1] as UnitType)));
} else {
  // Run each row in its own process, as many at a time as there are cores.
  const runRow = (a: UnitType) => new Promise<Record<string, Record<string, number>>>((resolve, reject) => {
    const p = spawn(process.execPath, [...process.execArgv, new URL(import.meta.url).pathname, '--row', a], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(text)) : reject(new Error(`row ${a} failed`))));
  });
  const rows: Record<string, Record<string, Record<string, number>>> = {};
  const queue = [...TYPES];
  const workers = Array.from({ length: Math.min(cpus().length, TYPES.length) }, async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      rows[a] = await runRow(a);
      console.log('done', a);
    }
  });
  await Promise.all(workers);

  // A fight is zero-sum, so a vs b must be -(b vs a). The raw duels aren't quite (the two armies start on different
  // ground), so average each pair with its mirror; a type against itself comes out 0.
  const table: Record<string, Record<string, Record<string, number>>> = {};
  for (const key of KEYS) {
    const mirror = key[1] + key[0];
    table[key] = {};
    for (const a of TYPES) {
      table[key][a] = {};
      for (const b of TYPES) table[key][a][b] = Math.round(((rows[a][key][b] - rows[b][mirror][a]) / 2) * 100) / 100;
    }
  }
  for (const key of KEYS) for (const a of TYPES) console.log(key, a.padEnd(10), TYPES.map((b) => `${table[key][a][b].toFixed(2).padStart(5)}`).join(' '));

  const body = KEYS.map((k) => `  '${k}': {\n${TYPES.map((a) => `    ${a}: { ${TYPES.map((b) => `${b}: ${table[k][a][b]}`).join(', ')} },`).join('\n')}\n  },`).join('\n');
  writeFileSync(new URL('../src/game/matchups.ts', import.meta.url), `// Generated by sim/matchups.ts from equal-cost duels. Do not edit; rerun it after changing unit stats.
import type { UnitType } from '../config';

export type Matchup = ${TYPES.map((t) => `'${t}'`).join(' | ')};

/**
 * MATCHUPS[key][a][b]: how an army of a fares against an equal-cost army of b in the open, from -1 (wiped out without
 * a scratch on b) to +1 (the reverse). Each fights for its own faction. key: Infantry Rockets on a's side, then b's
 * ('R' researched, '-' not).
 */
export const MATCHUPS: Record<string, Record<Matchup, Record<Matchup, number>>> = {
${body}
};

export const MATCHUP_TYPES: UnitType[] = ${JSON.stringify(TYPES)};
`);
  console.log('wrote src/game/matchups.ts');
}
