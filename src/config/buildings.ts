import type { BuildingDef, BuildingType, Req, Tag } from './types';

export const BUILDING_ORDER: BuildingType[] = ['conyard', 'refinery', 'barracks', 'factory'];

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  conyard: {
    name: 'Construction Yard', short: 'Const. Yard', cost: 2500, buildTime: 25, hp: 1600, size: 3, requires: [],
    desc: 'Builds structures, one at a time. Lose all of these and you cannot build.',
    levelUp: { name: 'HQ Level 2', short: 'HQ Level 2', cost: 1500, time: 45, desc: 'Upgrades a Construction Yard. Unlocks Harvesting and Infantry Rockets.' },
  },
  refinery: {
    name: 'Refinery', short: 'Refinery', cost: 1200, buildTime: 14, hp: 1000, size: 3, requires: [],
    desc: 'Processes spice into credits. Comes with a free Harvester.',
  },
  barracks: {
    name: 'Barracks', short: 'Barracks', cost: 500, buildTime: 10, hp: 800, size: 2, requires: [],
    desc: 'Trains infantry. Each Barracks adds a production line.',
  },
  factory: {
    name: 'Factory', short: 'Factory', cost: 1000, buildTime: 14, hp: 1100, size: 3, requires: ['refinery', 'barracks'],
    desc: 'Builds vehicles. Each Factory adds a production line.',
    levelUp: { name: 'Factory Level 2', short: 'Factory Lv 2', cost: 1200, time: 40, desc: 'Upgrades a Factory. Unlocks Rocket Launchers, Weapons II and Armor II.' },
  },
};

export const BUILDING_TAGS: Tag[] = ['structure'];

/** Display name for a requirement. */
export function reqName(r: Req): string {
  if (r === 'conyard2') return BUILDINGS.conyard.levelUp!.name;
  if (r === 'factory2') return BUILDINGS.factory.levelUp!.name;
  return BUILDINGS[r].name;
}
