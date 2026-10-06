import type { UpgradeDef, UpgradeType } from './types';

export const UPGRADE_ORDER: UpgradeType[] = ['weapons1', 'weapons2', 'armor1', 'armor2', 'rockets', 'nitro', 'harvest'];

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons1: { name: 'Weapons I', short: 'Weapons I', cost: 700, time: 25, requires: ['factory'], desc: '+20% damage for all units.' },
  weapons2: { name: 'Weapons II', short: 'Weapons II', cost: 1200, time: 45, requires: ['factory2'], after: 'weapons1', desc: '+40% damage for all units (total).' },
  armor1: { name: 'Armor I', short: 'Armor I', cost: 700, time: 25, requires: ['factory'], desc: 'Units and buildings take 15% less damage.' },
  armor2: { name: 'Armor II', short: 'Armor II', cost: 1200, time: 45, requires: ['factory2'], after: 'armor1', desc: 'Units and buildings take 30% less damage (total).' },
  rockets: { name: 'Infantry Rockets', short: 'Inf. Rockets', cost: 600, time: 25, requires: ['conyard2', 'barracks'], desc: 'Infantry switch to rocket launchers against Armored targets.' },
  nitro: { name: 'Trike Nitro', short: 'Trike Nitro', cost: 500, time: 20, requires: ['factory'], desc: 'Trikes move 40% faster and fire 50% faster.' },
  harvest: { name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['conyard2', 'refinery'], desc: 'Harvesters carry 20% more and move 20% faster.' },
};
