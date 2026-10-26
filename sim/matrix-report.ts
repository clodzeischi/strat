// The damage matrix as it stands in src/config: every combat unit against every combat unit (and harvesters and a
// structure), each fighting for its own faction (Corrino with shields), no upgrades. For each pair, the attacker's
// DPS per 1000 credits against the target's whole health + shields (armor and piercing counted; splash, cones and range
// left out). Then, per attacker, the spread between its best and worst target, and per pair of factions,
// how much of a roster is "crippled" (below FLOOR of its own best) against the other faction's units on average.
// Usage: npx tsx sim/matrix-report.ts [floor=0.4]      (TUNE as usual; RAW=1 prints per-hit damage instead of DPS)
import './tune';
import { BUILDINGS, FACTIONS, MIN_HIT, unitDef, shieldsFor, type Faction, type UnitType } from '../src/config';
import type { UnitDef, WeaponDef, Tag } from '../src/config/types';

const FLOOR = Number(process.argv[2] ?? 0.4);
const ROSTER: Record<Faction, UnitType[]> = {
  atreides: ['infantry', 'trike', 'tank', 'rocket'],
  corrino: ['trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery'],
  fremen: ['warrior', 'fedaykin', 'mortar', 'sandrider'],
};
const factionOf = (t: UnitType) => (Object.keys(ROSTER) as Faction[]).find((f) => ROSTER[f].includes(t))!;
interface Target { name: string; faction: Faction; tags: Tag[]; hp: number; shields: number; armor: number; air: boolean; cost: number }
const target = (f: Faction, t: UnitType, name: string = t): Target => {
  const d = unitDef(f, t);
  return { name, faction: f, tags: d.tags, hp: d.hp, shields: shieldsFor(f, d), armor: d.armor ?? 0, air: !!d.air, cost: d.cost };
};
const TARGETS: Target[] = [
  ...(Object.keys(ROSTER) as Faction[]).flatMap((f) => ROSTER[f].map((t) => target(f, t))),
  target('atreides', 'harvester', 'harv(A)'), target('corrino', 'harvester', 'harv(C)'),
  { name: 'refinery', faction: 'atreides', tags: ['structure'], hp: BUILDINGS.refinery.hp, shields: 0, armor: BUILDINGS.refinery.armor ?? 0, air: false, cost: BUILDINGS.refinery.cost },
];

/** One hit before armor (the game's weaponDamage). */
const perHit = (w: WeaponDef, tags: Tag[]) => (w.airDamage !== undefined && tags.includes('air') ? w.airDamage : w.damage + tags.reduce((s, t) => s + (w.bonus[t] ?? 0), 0));
/** Seconds one weapon needs to empty a target's health and shields (Infinity if it can't hit it). */
function timeToKill(w: WeaponDef, tg: Target): number {
  if (tg.air && !w.air) return Infinity;
  if (w.only && !tg.tags.some((t) => w.only!.includes(t))) return Infinity;
  const d = perHit(w, tg.tags);
  const hits = (w.pierce || !tg.shields ? 0 : tg.shields / Math.max(MIN_HIT, d)) + tg.hp / Math.max(MIN_HIT, d - tg.armor);
  return hits * w.cooldown;
}
/** The weapons a unit fights with against a target (Atreides infantry: with Infantry Rockets; set-up weapons for siege). */
function weaponsVs(d: UnitDef, tg: Target, rockets: boolean): WeaponDef[] {
  const main = d.deploy ? d.deploy.weapon : d.antiArmor && rockets && tg.tags.includes('armored') ? d.antiArmor : d.weapon;
  return [main, d.secondary].filter((w): w is WeaponDef => !!w);
}
/** DPS per 1000 credits against the target's whole pool, as a share of its pool per second. */
function dps(t: UnitType, tg: Target, rockets = false): number {
  const d = unitDef(factionOf(t), t);
  const rate = weaponsVs(d, tg, rockets).reduce((s, w) => s + 1 / timeToKill(w, tg), 0); // targets killed per second
  return (rate * (tg.hp + tg.shields) * 1000) / d.cost;
}

const ATTACKERS: [string, UnitType, boolean][] = [
  ...ROSTER.atreides.map((t): [string, UnitType, boolean] => [t, t, false]), ['infantry+R', 'infantry', true],
  ...ROSTER.corrino.map((t): [string, UnitType, boolean] => [t, t, false]), ...ROSTER.fremen.map((t): [string, UnitType, boolean] => [t, t, false]),
];
const pad = (s: string | number, n: number) => String(s).padStart(n);
const raw = !!process.env.RAW;
// Per-hit view: after the target's armor (to health).
const afterArmor = (w: WeaponDef, tg: Target) => Math.max(MIN_HIT, perHit(w, tg.tags) - tg.armor);
console.log(`${raw ? 'Per-hit damage (main weapon)' : 'DPS per 1000 credits vs whole pool (health + shields)'}; '-' = can't hit\n`);
console.log('attacker'.padEnd(12) + TARGETS.map((t) => pad(t.name.slice(0, 7), 8)).join('') + pad('spread', 9) + pad(`<${Math.round(FLOOR * 100)}%`, 6));
const spread: Record<string, number[]> = {};
for (const [name, t, r] of ATTACKERS) {
  const vals = TARGETS.map((tg) => (raw ? (() => { const w = weaponsVs(unitDef(factionOf(t), t), tg, r)[0]; return timeToKill(w, tg) === Infinity ? 0 : afterArmor(w, tg); })() : dps(t, tg, r)));
  const units = vals.slice(0, TARGETS.length - 3).filter((v) => v > 0 && isFinite(v));
  const best = Math.max(...units), worst = Math.min(...units);
  spread[name] = vals;
  console.log(name.padEnd(12) + vals.map((v) => pad(v > 0 && isFinite(v) ? Math.round(v) : '-', 8)).join('') + pad((best / worst).toFixed(1) + 'x', 9) + pad(units.filter((v) => v < best * FLOOR).length + '/' + units.length, 6));
}

console.log('\nToughness: health + shields per 1000 credits (armor)');
console.log(TARGETS.slice(0, -1).map((t) => `${t.name} ${Math.round(((t.hp + t.shields) * 1000) / t.cost)}${t.armor ? ` (${t.armor})` : ''}`).join(', '));

// Per pair of factions: each attacker's average effectiveness against the defender's combat units (equal weights), as
// a share of its own best against any combat unit in the game.
console.log(`\nAgainst each faction (its combat units, equally weighted): each unit's average DPS as a share of its best; * = under ${Math.round(FLOOR * 100)}%`);
const factions = Object.keys(ROSTER) as Faction[];
for (const af of factions) {
  for (const df of factions) {
    const defenders = TARGETS.filter((t) => ROSTER[df].includes(t.name as UnitType) && factionOf(t.name as UnitType) === df);
    const parts = ATTACKERS.filter(([, t]) => factionOf(t) === af).map(([name, t, r]) => {
      const all = TARGETS.slice(0, TARGETS.length - 3).map((tg) => dps(t, tg, r)).filter((v) => isFinite(v) && v > 0);
      const best = Math.max(...all);
      const vs = defenders.map((tg) => dps(t, tg, r)).map((v) => (isFinite(v) ? v : 0));
      const share = vs.reduce((s, v) => s + v, 0) / vs.length / best;
      return `${name} ${Math.round(share * 100)}%${share < FLOOR ? '*' : ''}`;
    });
    const crippled = parts.filter((p) => p.endsWith('*')).length;
    console.log(`  ${af.padEnd(9)} vs ${df.padEnd(9)} ${crippled}/${parts.length} crippled: ${parts.join(', ')}`);
  }
}
void FACTIONS;
