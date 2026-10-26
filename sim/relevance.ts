// Mixed-army relevance test (docs/damage-redesign.md): is unit X worth having along, against each enemy composition?
// Our reference army (REF shares of BUDGET credits) fights an enemy composition in the open, Brutal's Micro on both
// sides, siege units setting up as the AI sets them up. Two versions of our army: X at 25% of the value (the rest
// scaled down in proportion), and without X (its share spread over the rest). Score of a fight: (our value left - theirs)
// / starting value, health + shields, -1..+1. Delta = score with X - score without X, averaged over maps and sides.
// Enemy compositions: their REF, and their REF skewed to each of their units (half that unit).
// One JSON line per enemy composition. Usage: npx tsx sim/relevance.ts <faction> <enemyFaction> <unit>
// All of it in parallel with a summary: sim/relevance.sh       (TUNE as usual)
import * as THREE from 'three';
import { Game } from '../src/game/game';
import './tune';
import { Micro } from '../src/game/micro';
import { unitDef, type Faction, type Team, type UnitType } from '../src/config';

export const REF: Record<Faction, Partial<Record<UnitType, number>>> = {
  atreides: { infantry: 0.3, trike: 0.2, tank: 0.3, rocket: 0.2 },
  corrino: { trooper: 0.3, sardaukar: 0.15, razor: 0.15, devastator: 0.2, raider: 0.1, artillery: 0.1 },
  fremen: { warrior: 0.45, fedaykin: 0.3, mortar: 0.15, sandrider: 0.1 },
};
const BUDGET = Number(process.env.BUDGET ?? 6000);
const SEEDS = [1003, 1007, 1012];
type Mix = Partial<Record<UnitType, number>>;

const without = (m: Mix, x: UnitType): Mix => {
  const rest = Object.entries(m).filter(([t]) => t !== x) as [UnitType, number][];
  const sum = rest.reduce((s, [, v]) => s + v, 0);
  return Object.fromEntries(rest.map(([t, v]) => [t, v / sum]));
};
const withShare = (m: Mix, x: UnitType, share: number): Mix => {
  const rest = without(m, x);
  return { ...Object.fromEntries(Object.entries(rest).map(([t, v]) => [t, v! * (1 - share)])), [x]: share };
};

function fight(fa: Faction, ma: Mix, fb: Faction, mb: Mix, seed: number, swap: boolean): number {
  const [ta, tb]: Team[] = swap ? [1, 0] : [0, 1];
  const factions: Faction[] = [];
  factions[ta] = fa;
  factions[tb] = fb;
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed, factions);
  for (const u of [...g.units]) { u.hp = 0; (g as any).kill(u, null); }
  const m = g.map;
  const mid = Math.round(m.size / 2);
  const spawn = (team: Team, f: Faction, mix: Mix, row: number, dir: number) => {
    const list: UnitType[] = [];
    for (const [t, share] of Object.entries(mix) as [UnitType, number][]) {
      const n = Math.round((BUDGET * share) / unitDef(f, t).cost);
      for (let k = 0; k < n; k++) list.push(t);
    }
    // Short reach in front, long reach (and siege) at the back.
    const reach = (t: UnitType) => { const d = unitDef(f, t); return d.deploy ? 99 : d.weapon?.range ?? 0; };
    list.sort((a, b) => reach(a) - reach(b));
    list.forEach((t, k) => {
      const c = m.nearestCell(mid - 10 + (k % 20), row + Math.floor(k / 20) * dir, (x, z) => m.canEnter(x, z, 'vehicle'), 12)!;
      const u = g.spawnUnit(t, team, m.center(c.cx), m.center(c.cz));
      u.command(g, { kind: 'amove', x: m.center(mid), z: m.center(row - dir * 30) });
    });
  };
  spawn(ta, fa, ma, mid - 9, -1);
  spawn(tb, fb, mb, mid + 9, 1);
  const micro = [new Micro(g, 0), new Micro(g, 1)];
  const value = (t: Team) => g.units.filter((u) => u.team === t).reduce((s, u) => s + u.def.cost * ((u.hp + u.shields) / (u.maxHp + u.maxShields)), 0);
  const start = Math.max(1, Math.min(value(ta), value(tb)));
  let acc = 0;
  while (g.time < 150 && g.units.some((u) => u.team === ta) && g.units.some((u) => u.team === tb)) {
    g.update(0.05);
    for (const u of g.units) if (u.def.lockOn && u.target?.kind === 'unit' && g.time >= u.nextLock) g.lockOn(u, u.target);
    // Siege units set up with an enemy in reach and none close, and pack up when one gets inside their minimum range.
    for (const u of g.units) {
      const w = u.def.deploy?.weapon;
      if (!w) continue;
      let nearest = Infinity;
      for (const e of g.units) if (e.team !== u.team && !e.def.air) nearest = Math.min(nearest, Math.hypot(e.x - u.x, e.z - u.z));
      if (u.deployState === 'mobile' && nearest <= w.range * 0.9 && nearest > w.minRange + 4) u.setDeployed(true);
      else if (u.deployState === 'deployed' && nearest < w.minRange) u.setDeployed(false);
    }
    if ((acc += 0.05) >= 0.2) {
      acc = 0;
      for (const t of [0, 1] as Team[]) micro[t].update(g.units.filter((u) => u.team === t));
    }
  }
  return (value(ta) - value(tb)) / start;
}

const mean = (fa: Faction, ma: Mix, fb: Faction, mb: Mix) => {
  let s = 0, n = 0;
  for (const seed of SEEDS) for (const swap of [false, true]) { s += fight(fa, ma, fb, mb, seed, swap); n++; }
  return s / n;
};

if (process.argv[1]?.endsWith('relevance.ts') && process.argv.length >= 5) {
  const [fa, fb, x] = process.argv.slice(2) as [Faction, Faction, UnitType];
  const comps: [string, Mix][] = [['ref', REF[fb]], ...Object.keys(REF[fb]).map((t): [string, Mix] => [`${t}-heavy`, withShare(REF[fb], t as UnitType, 0.5)])];
  for (const [name, mb] of comps) {
    const s25 = mean(fa, withShare(REF[fa], x, 0.25), fb, mb);
    const s0 = mean(fa, without(REF[fa], x), fb, mb);
    console.log(JSON.stringify({ fa, fb, x, comp: name, s25: +s25.toFixed(3), s0: +s0.toFixed(3), d: +(s25 - s0).toFixed(3) }));
  }
}
