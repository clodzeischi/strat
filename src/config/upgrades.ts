import type { UpgradeDef, UpgradeType } from './types';

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons1: { line: 'weapons', name: 'Weapons I', short: 'Weapons I', cost: 700, time: 25, requires: ['factory'], desc: 'Every weapon hits 15% harder, bonus damage included (armor still comes off each hit).' },
  weapons2: { line: 'weapons', name: 'Weapons II', short: 'Weapons II', cost: 1200, time: 45, requires: ['conyard2'], after: 'weapons1', desc: 'Every weapon hits 30% harder in all, bonus damage included.' },
  armor1: { line: 'armor', name: 'Armor I', short: 'Armor I', cost: 700, time: 25, requires: ['factory'], desc: '+1 armor for all units and buildings: one less damage from every hit.' },
  armor2: { line: 'armor', name: 'Armor II', short: 'Armor II', cost: 1200, time: 45, requires: ['conyard2'], after: 'armor1', desc: '+2 armor in all for units and buildings.' },
  rockets: { name: 'Infantry Rockets', short: 'Inf. Rockets', cost: 800, time: 25, requires: ['barracks', 'factory'], desc: 'Infantry switch to rocket launchers against Armored targets.' },
  nitro: { name: 'Trike Nitro', short: 'Trike Nitro', cost: 500, time: 20, requires: ['factory'], desc: 'Trikes move 50% faster and fire 50% faster.' },
  harvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['conyard2', 'refinery'], desc: 'Harvesters carry 25% more, move 25% faster and pick up spice 50% faster.' },

  // ---- Corrino: one level each ----
  cWeapons: { line: 'weapons', name: 'Weapons +1', short: 'Weapons +1', cost: 1100, time: 40, requires: ['fab'], desc: 'Every weapon hits 15% harder, bonus damage included (armor still comes off each hit).' },
  cArmor: { line: 'armor', name: 'Armor +1', short: 'Armor +1', cost: 700, time: 25, requires: ['fab'], desc: '+1 armor for all units and buildings: one less damage from every hit (from shields too).' },
  cShields: { line: 'shields', name: 'Shields +1', short: 'Shields +1', cost: 400, time: 20, requires: ['tleilaxu'], desc: 'Shields take one less damage from every hit.' },
  cHarvest: { line: 'harvest', name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['refinery', 'fab'], desc: 'Harvesters carry 25% more, move 25% faster and pick up spice 50% faster.' },
  flame: { name: 'Razor Flame Range', short: 'Flame Range', cost: 500, time: 20, requires: ['fab'], desc: 'Razor flamethrowers reach one tile further.' },

  // ---- Fremen: two levels of Weapons and Armor, one per Sietch level after the first ----
  fWeapons: { line: 'weapons', name: 'Weapons +1', short: 'Weapons +1', cost: 350, time: 20, requires: ['sietch2'], desc: 'Every weapon hits 15% harder, bonus damage included (armor still comes off each hit).' },
  fWeapons2: { line: 'weapons', name: 'Weapons +2', short: 'Weapons +2', cost: 550, time: 30, requires: ['sietch3'], after: 'fWeapons', desc: 'Every weapon hits 30% harder in all, bonus damage included.' },
  fArmor: { line: 'armor', name: 'Armor +1', short: 'Armor +1', cost: 350, time: 20, requires: ['sietch2'], desc: '+1 armor for all units and buildings: one less damage from every hit.' },
  fArmor2: { line: 'armor', name: 'Armor +2', short: 'Armor +2', cost: 550, time: 30, requires: ['sietch3'], after: 'fArmor', desc: '+2 armor in all for units and buildings.' },
  fHarvest: { line: 'harvest', name: 'Spice Mining', short: 'Spice Mining', cost: 600, time: 20, requires: [], desc: 'Spice Camps turn spice into credits 25% faster.' },
  stillsuit: { name: 'Stillsuits', short: 'Stillsuits', cost: 400, time: 20, requires: ['sietch2'], desc: 'Fremen units heal twice as fast, and start sooner after being hurt.' },
  sandwalk: { name: 'Sandwalk', short: 'Sandwalk', cost: 500, time: 20, requires: [], desc: 'Fremen infantry move a further 25% faster on sand and spice.' },
  ambush: { name: 'Ambush', short: 'Ambush', cost: 400, time: 30, requires: ['sietch3'], desc: 'Units striking out of hiding deal +75% damage for 4 s.' },
};
