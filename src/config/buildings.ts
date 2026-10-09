import type { BuildingDef, BuildingType, Req, Tag } from './types';

export const BUILDING_ORDER: BuildingType[] = ['conyard', 'refinery', 'barracks', 'bunker', 'factory', 'hitech', 'fab', 'tleilaxu', 'pad', 'turret'];

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
    // Corrino only (Atreides barracks don't level up).
    levelUp: {
      name: 'Imperial Barracks', short: 'Imperial Bks', cost: 1000, time: 40, requires: ['tleilaxu'],
      desc: 'Upgrades a Barracks. Unlocks Sardaukar and drop pods: new infantry land by pod at the rally point, anywhere you can see.',
    },
  },
  bunker: {
    name: 'Bunker', short: 'Bunker', cost: 400, buildTime: 10, hp: 1400, size: 2, requires: ['barracks'], garrison: 3,
    desc: 'Holds three infantry, who shoot from it and can\'t be hurt while inside. Right-click it with infantry selected; Unload on the command card lets them out.',
  },
  factory: {
    name: 'Factory', short: 'Factory', cost: 1000, buildTime: 14, hp: 1100, size: 3, requires: ['refinery', 'barracks'],
    desc: 'Builds vehicles. Each Factory adds a production line.',
    levelUp: { name: 'Factory Level 2', short: 'Factory Lv 2', cost: 1200, time: 40, desc: 'Upgrades a Factory. Unlocks Rocket Launchers, Weapons II and Armor II.' },
  },
  hitech: {
    name: 'Hi-Tech Factory', short: 'Hi-Tech', cost: 1200, buildTime: 16, hp: 1000, size: 3, requires: ['factory'],
    desc: 'Builds aircraft: the Carryall. Each one adds a production line.',
  },

  // ---- Corrino ----
  fab: {
    name: 'Fab', short: 'Fab', cost: 1100, buildTime: 15, hp: 1200, size: 3, requires: ['refinery', 'barracks'],
    desc: 'Builds vehicles and aircraft. Each Fab adds a production line.',
    levelUp: { name: 'Fab Level 2', short: 'Fab Lv 2', cost: 1200, time: 40, requires: ['tleilaxu'], desc: 'Upgrades a Fab. Unlocks Devastators.' },
  },
  tleilaxu: {
    name: 'Tleilaxu Research', short: 'Tleilaxu', cost: 1300, buildTime: 18, hp: 1000, size: 3, requires: ['fab'],
    desc: 'Tleilaxu biotech. Unlocks Sky Raiders, Soulcrushers, Devastators and Shields.',
  },
  pad: {
    name: 'Repair Pad', short: 'Repair Pad', cost: 700, buildTime: 12, hp: 900, size: 2, requires: ['fab'], pad: { slots: 2, rate: 25, range: 2.5 },
    desc: "Restores the health of units parked next to it, two at a time, for credits. Right-click it with units selected. Corrino units don't heal anywhere else.",
  },
  turret: {
    name: 'Auto Turret', short: 'Turret', cost: 350, buildTime: 9, hp: 700, size: 1, requires: ['barracks'],
    weapon: { range: 12, minRange: 0, damage: 12, bonus: { mechanical: 6, structure: -6 }, cooldown: 0.9, projectile: 'bullet', speed: 0, splash: 0 },
    desc: 'Small automatic gun emplacement. Shoots ground targets in range.',
  },
};

export const BUILDING_TAGS: Tag[] = ['structure'];

/** Display name for a requirement. */
export function reqName(r: Req): string {
  return r.endsWith('2') ? BUILDINGS[r.slice(0, -1) as BuildingType].levelUp!.name : BUILDINGS[r as BuildingType].name;
}
