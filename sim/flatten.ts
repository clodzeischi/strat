// Damage spread of every weapon across target kinds, and a flattened matrix for tests: FLATTEN=<k> scales every
// weapon's tag bonuses by k and moves the base so the weapon's average over the target kinds stays the same.
// `npx tsx sim/flatten.ts` prints the spread table; `npx tsx sim/flatten.ts 0.5` prints a TUNE for k = 0.5.
import { UNITS, BUILDINGS, type Tag } from '../src/config';
import type { WeaponDef } from '../src/config/types';

const KINDS: [string, Tag[]][] = [['infantry', ['biological', 'light']], ['light veh', ['mechanical', 'light']], ['armored', ['mechanical', 'armored']], ['structure', ['structure']]];
const dmg = (w: WeaponDef, tags: Tag[]) => Math.max(1, w.damage + tags.reduce((s, t) => s + (w.bonus[t] ?? 0), 0));

export function weapons(): [string, string, WeaponDef][] {
  const out: [string, string, WeaponDef][] = [];
  for (const [t, d] of Object.entries(UNITS)) {
    if (d.weapon) out.push([d.name, `units.${t}.weapon`, d.weapon]);
    if (d.antiArmor) out.push([d.name + ' (Rockets)', `units.${t}.antiArmor`, d.antiArmor]);
    if (d.secondary) out.push([d.name + ' (MG)', `units.${t}.secondary`, d.secondary]);
    if (d.deploy) out.push([d.name + ' (set up)', `units.${t}.deploy.weapon`, d.deploy.weapon]);
  }
  for (const [t, b] of Object.entries(BUILDINGS)) if (b.weapon) out.push([b.name, `buildings.${t}.weapon`, b.weapon]);
  return out;
}

const k = process.argv[2];
if (k !== undefined) {
  const tune: Record<string, unknown> = {};
  for (const [, path, w] of weapons()) {
    if (w.only || w.damage >= 300) continue; // the knife and blasts stay as they are
    const avg = KINDS.reduce((s, [, tags]) => s + dmg(w, tags), 0) / KINDS.length;
    const bonus = Object.fromEntries(Object.entries(w.bonus).map(([t, v]) => [t, (v as number) * Number(k)]));
    const w2 = { ...w, bonus } as WeaponDef;
    const avg2 = KINDS.reduce((s, [, tags]) => s + dmg(w2, tags), 0) / KINDS.length;
    tune[`${path}.damage`] = Math.round((w.damage + avg - avg2) * 10) / 10;
    for (const [t, v] of Object.entries(bonus)) tune[`${path}.bonus.${t}`] = Math.round(v * 10) / 10;
  }
  console.log(JSON.stringify(tune));
} else {
  console.log('weapon'.padEnd(28) + KINDS.map(([n]) => n.padStart(11)).join('') + '   best/worst');
  for (const [name, , w] of weapons()) {
    const ds = KINDS.map(([, tags]) => dmg(w, tags));
    console.log(name.padEnd(28) + ds.map((d) => String(d).padStart(11)).join('') + (Math.max(...ds) / Math.min(...ds)).toFixed(1).padStart(10) + 'x');
  }
}
