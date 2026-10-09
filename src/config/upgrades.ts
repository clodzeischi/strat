import type { UpgradeDef, UpgradeType } from './types';

export const UPGRADE_ORDER: UpgradeType[] = [
  'weapons1', 'weapons2', 'armor1', 'armor2', 'rockets', 'nitro', 'harvest', 'cWeapons', 'cArmor', 'cShields', 'cHarvest', 'flame',
];

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons1: { line: 'weapons', name: 'Weapons I', short: 'Weapons I', cost: 700, time: 25, requires: ['factory'], desc: '+20% damage for all units.' },
  weapons2: { line: 'weapons', name: 'Weapons II', short: 'Weapons II', cost: 1200, time: 45, requires: ['factory2'], after: 'weapons1', desc: '+40% damage for all units (total).' },
  armor1: { line: 'armor', name: 'Armor I', short: 'Armor I', cost: 700, time: 25, requires: ['factory'], desc: 'Units and buildings take 15% less damage.' },
  armor2: { line: 'armor', name: 'Armor II', short: 'Armor II', cost: 1200, time: 45, requires: ['factory2'], after: 'armor1', desc: 'Units and buildings take 30% less damage (total).' },
  rockets: { name: 'Infantry Rockets', short: 'Inf. Rockets', cost: 600, time: 25, requires: ['conyard2', 'barracks'], desc: 'Infantry switch to rocket launchers against Armored targets.' },
  nitro: { name: 'Trike Nitro', short: 'Trike Nitro', cost: 500, time: 20, requires: ['factory'], desc: 'Trikes move 40% faster and fire 50% faster.' },
  harvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['conyard2', 'refinery'], desc: 'Harvesters carry 20% more and move 20% faster.' },

  // ---- Corrino: one level each ----
  cWeapons: { line: 'weapons', name: 'Weapons +1', short: 'Weapons +1', cost: 900, time: 35, requires: ['fab'], desc: '+20% damage for all units.' },
  cArmor: { line: 'armor', name: 'Armor +1', short: 'Armor +1', cost: 900, time: 35, requires: ['fab'], desc: 'Units and buildings take 15% less damage to health.' },
  cShields: { line: 'shields', name: 'Shields +1', short: 'Shields +1', cost: 900, time: 35, requires: ['tleilaxu'], desc: 'Shields take 20% less damage.' },
  cHarvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['refinery', 'fab'], desc: 'Harvesters carry 20% more and move 20% faster.' },
  flame: { name: 'Razor Flame Range', short: 'Flame Range', cost: 500, time: 20, requires: ['fab'], desc: 'Razor flamethrowers reach one tile further.' },
};
