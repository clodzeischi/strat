// Checks the damage rules of docs/damage-redesign.md on src/config: every weapon has at most one bonus, and it's
// positive (armor makes a weapon weak against heavy targets, not negative bonuses). Prints every breach; exits 1 if any.
// Usage: npx tsx sim/config-check.ts
import { BUILDINGS, UNITS, WORM } from '../src/config';
import type { WeaponDef } from '../src/config/types';

const weapons: [string, WeaponDef][] = [];
for (const [t, d] of Object.entries(UNITS)) {
  for (const [k, w] of [['', d.weapon], ['.antiArmor', d.antiArmor], ['.secondary', d.secondary], ['.deploy', d.deploy?.weapon], ['.detonate', d.detonate?.weapon], ['.mines', d.mines?.weapon]] as const) {
    if (w) weapons.push([t + k, w]);
  }
}
for (const [t, b] of Object.entries(BUILDINGS)) if (b.weapon) weapons.push([t, b.weapon]);
weapons.push(['sandworm', WORM.weapon]);

let bad = 0;
for (const [name, w] of weapons) {
  const b = Object.entries(w.bonus) as [string, number][];
  const problems = [...b.filter(([, v]) => v < 0).map(([t, v]) => `${v} vs ${t}`), ...(b.length > 1 ? [`${b.length} bonuses`] : [])];
  if (problems.length) {
    bad++;
    console.log(`${name.padEnd(22)} ${problems.join(', ')}`);
  }
}
console.log(bad ? `\n${bad} of ${weapons.length} weapons break the rules` : `all ${weapons.length} weapons ok`);
process.exit(bad ? 1 : 0);
