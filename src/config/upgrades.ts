import type { UpgradeDef, UpgradeType } from './types';

export const UPGRADE_ORDER: UpgradeType[] = [
  'weapons1', 'weapons2', 'armor1', 'armor2', 'rockets', 'nitro', 'harvest', 'cWeapons', 'cArmor', 'cShields', 'cHarvest', 'flame',
  'fWeapons', 'fWeapons2', 'fArmor', 'fArmor2', 'fHarvest', 'stillsuit', 'sandwalk', 'ambush',
];

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons1: { line: 'weapons', name: 'Weapons I', short: 'Weapons I', cost: 700, time: 25, requires: ['factory'], desc: '+20% damage for all units.' },
  weapons2: { line: 'weapons', name: 'Weapons II', short: 'Weapons II', cost: 1200, time: 45, requires: ['conyard2'], after: 'weapons1', desc: '+40% damage for all units (total).' },
  armor1: { line: 'armor', name: 'Armor I', short: 'Armor I', cost: 700, time: 25, requires: ['factory'], desc: 'Units and buildings take 15% less damage.' },
  armor2: { line: 'armor', name: 'Armor II', short: 'Armor II', cost: 1200, time: 45, requires: ['conyard2'], after: 'armor1', desc: 'Units and buildings take 30% less damage (total).' },
  rockets: { name: 'Infantry Rockets', short: 'Inf. Rockets', cost: 800, time: 25, requires: ['barracks', 'factory'], desc: 'Infantry switch to rocket launchers against Armored targets.' },
  nitro: { name: 'Trike Nitro', short: 'Trike Nitro', cost: 500, time: 20, requires: ['factory'], desc: 'Trikes move 50% faster and fire 50% faster.' },
  harvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['conyard2', 'refinery'], desc: 'Harvesters carry 20% more and move 20% faster.' },

  // ---- Corrino: one level each ----
  cWeapons: { line: 'weapons', name: 'Weapons +1', short: 'Weapons +1', cost: 900, time: 35, requires: ['fab'], desc: '+20% damage for all units.' },
  cArmor: { line: 'armor', name: 'Armor +1', short: 'Armor +1', cost: 900, time: 35, requires: ['fab'], desc: 'Units and buildings take 15% less damage to health.' },
  cShields: { line: 'shields', name: 'Shields +1', short: 'Shields +1', cost: 900, time: 35, requires: ['tleilaxu'], desc: 'Shields take 20% less damage.' },
  cHarvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['refinery', 'fab'], desc: 'Harvesters carry 20% more and move 20% faster.' },
  flame: { name: 'Razor Flame Range', short: 'Flame Range', cost: 500, time: 20, requires: ['fab'], desc: 'Razor flamethrowers reach one tile further.' },

  // ---- Fremen: two levels of Weapons and Armor, one per Sietch level after the first ----
  fWeapons: { line: 'weapons', name: 'Weapons +1', short: 'Weapons +1', cost: 800, time: 30, requires: ['sietch2'], desc: '+20% damage for all units.' },
  fWeapons2: { line: 'weapons', name: 'Weapons +2', short: 'Weapons +2', cost: 1100, time: 40, requires: ['sietch3'], after: 'fWeapons', desc: '+40% damage for all units (total).' },
  fArmor: { line: 'armor', name: 'Armor +1', short: 'Armor +1', cost: 800, time: 30, requires: ['sietch2'], desc: 'Units and buildings take 15% less damage.' },
  fArmor2: { line: 'armor', name: 'Armor +2', short: 'Armor +2', cost: 1100, time: 40, requires: ['sietch3'], after: 'fArmor', desc: 'Units and buildings take 30% less damage (total).' },
  fHarvest: { line: 'harvest', name: 'Spice Mining', short: 'Spice Mining', cost: 600, time: 20, requires: [], desc: 'Spice Camps turn spice into credits 25% faster.' },
  stillsuit: { name: 'Stillsuits', short: 'Stillsuits', cost: 600, time: 25, requires: ['sietch2'], desc: 'Fremen units heal twice as fast, and start sooner after being hurt.' },
  sandwalk: { name: 'Sandwalk', short: 'Sandwalk', cost: 500, time: 20, requires: [], desc: 'Fremen infantry move a further 25% faster on sand and spice.' },
  ambush: { name: 'Ambush', short: 'Ambush', cost: 700, time: 30, requires: ['sietch3'], desc: 'Units striking out of hiding deal +50% damage for 4 s.' },
};
