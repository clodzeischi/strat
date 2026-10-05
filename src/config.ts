// All game data lives here. Distances are in world units; one map tile is TILE world units.

export const TILE = 2;
export const MAP_SIZE = 64; // tiles per side

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;
export const TEAM_COLORS = [0x3d7be0, 0xd8402f];
export const TEAM_CSS = ['#3d7be0', '#d8402f'];

export const START_CREDITS = 2500;

export type UnitType = 'harvester' | 'infantry' | 'trike' | 'tank' | 'rocket';
export type BuildingType = 'conyard' | 'refinery' | 'barracks' | 'factory';
/** Buildings that train units. Each one of a type adds a parallel production line for that type. */
export type Producer = 'barracks' | 'factory';
export const PRODUCERS: Producer[] = ['barracks', 'factory'];
export const QUEUE_MAX = 5; // per producer type
/** Buildings that can be upgraded to level 2 to unlock more tech. */
export type LevelUpType = 'conyard' | 'factory';
export const LEVEL_UP_ORDER: LevelUpType[] = ['conyard', 'factory'];
/** A tech requirement: a building, or a level-2 Construction Yard / Factory. */
export type Req = BuildingType | 'conyard2' | 'factory2';
export type UpgradeType = 'weapons1' | 'weapons2' | 'armor1' | 'armor2' | 'rockets' | 'nitro' | 'harvest';
/** StarCraft-style attributes. Weapons deal bonus (or reduced) damage against specific tags. */
export type Tag = 'biological' | 'mechanical' | 'light' | 'armored' | 'structure';
export type ProjectileKind = 'bullet' | 'shell' | 'rocket';

export interface WeaponDef {
  range: number;
  minRange: number; // can't fire at targets closer than this
  damage: number;
  bonus: Partial<Record<Tag, number>>; // added to damage per matching target tag
  cooldown: number; // seconds between shots
  projectile: ProjectileKind;
  speed: number; // projectile speed (ignored for bullets, which hit instantly)
  splash: number; // splash radius, 0 = single target
}

export interface UnitDef {
  name: string;
  producer: Producer;
  cost: number;
  buildTime: number;
  hp: number;
  speed: number;
  turnRate: number; // radians per second
  radius: number;
  sight: number;
  turret: boolean;
  infantry: boolean;
  tags: Tag[];
  weapon: WeaponDef | null;
  /** Used instead of `weapon` against Armored targets once the Infantry Rockets upgrade is done. */
  antiArmor?: WeaponDef;
  requires: Req[];
  desc: string;
}

export interface BuildingDef {
  name: string;
  short: string; // label on the build card
  cost: number;
  buildTime: number;
  hp: number;
  size: number; // footprint in tiles (square)
  requires: Req[];
  desc: string;
  levelUp?: { name: string; short: string; cost: number; time: number; desc: string };
}

export interface UpgradeDef {
  name: string;
  short: string; // label on the research card
  cost: number;
  time: number;
  requires: Req[];
  after?: UpgradeType; // previous tier that must be researched first
  desc: string;
}

export const UNIT_ORDER: UnitType[] = ['harvester', 'infantry', 'trike', 'tank', 'rocket'];
export const BUILDING_ORDER: BuildingType[] = ['conyard', 'refinery', 'barracks', 'factory'];
export const UPGRADE_ORDER: UpgradeType[] = ['weapons1', 'weapons2', 'armor1', 'armor2', 'rockets', 'nitro', 'harvest'];

export const UNITS: Record<UnitType, UnitDef> = {
  harvester: {
    name: 'Harvester', producer: 'factory', cost: 300, buildTime: 10, hp: 600, speed: 3, turnRate: 3, radius: 1.1, sight: 8,
    turret: false, infantry: false, tags: ['mechanical', 'light'], weapon: null, requires: ['factory', 'refinery'],
    desc: 'Collects spice and brings it to a Refinery.',
  },
  infantry: {
    name: 'Infantry', producer: 'barracks', cost: 60, buildTime: 3, hp: 70, speed: 2.4, turnRate: 12, radius: 0.45, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks'],
    weapon: { range: 6, minRange: 0, damage: 5, bonus: { biological: 5, armored: -4, structure: -3 }, cooldown: 0.6, projectile: 'bullet', speed: 0, splash: 0 },
    antiArmor: { range: 8, minRange: 0, damage: 6, bonus: { armored: 22, structure: -2 }, cooldown: 1.5, projectile: 'rocket', speed: 18, splash: 0 },
    desc: 'Cheap rifle squad. Strong vs infantry. With Infantry Rockets, devastating vs armor.',
  },
  trike: {
    name: 'Trike', producer: 'factory', cost: 150, buildTime: 5, hp: 140, speed: 7.5, turnRate: 6, radius: 0.8, sight: 12,
    turret: false, infantry: false, tags: ['mechanical', 'light'], requires: ['factory'],
    weapon: { range: 7, minRange: 0, damage: 4, bonus: { biological: 4, armored: -3, structure: -2 }, cooldown: 0.3, projectile: 'bullet', speed: 0, splash: 0 },
    desc: 'Fast raider with a machine gun. Strong vs infantry, good for harassing harvesters.',
  },
  tank: {
    name: 'Tank', producer: 'factory', cost: 400, buildTime: 9, hp: 450, speed: 3.8, turnRate: 2.5, radius: 1.1, sight: 13,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory'],
    weapon: { range: 10, minRange: 0, damage: 18, bonus: { mechanical: 22, biological: -6 }, cooldown: 1.4, projectile: 'shell', speed: 32, splash: 0 },
    desc: 'Main battle tank. Crushes vehicles, decent vs buildings, weak vs infantry.',
  },
  rocket: {
    name: 'Rocket Launcher', producer: 'factory', cost: 500, buildTime: 11, hp: 200, speed: 3.4, turnRate: 2.5, radius: 1.0, sight: 18,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory2'],
    weapon: { range: 17, minRange: 6, damage: 40, bonus: { biological: 35, structure: 35 }, cooldown: 2.8, projectile: 'rocket', speed: 15, splash: 2.5 },
    desc: 'Long-range artillery. Devastating vs infantry and buildings. Fragile and can\'t fire up close.',
  },
};

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

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons1: { name: 'Weapons I', short: 'Weapons I', cost: 700, time: 25, requires: ['factory'], desc: '+20% damage for all units.' },
  weapons2: { name: 'Weapons II', short: 'Weapons II', cost: 1200, time: 45, requires: ['factory2'], after: 'weapons1', desc: '+40% damage for all units (total).' },
  armor1: { name: 'Armor I', short: 'Armor I', cost: 700, time: 25, requires: ['factory'], desc: 'Units and buildings take 15% less damage.' },
  armor2: { name: 'Armor II', short: 'Armor II', cost: 1200, time: 45, requires: ['factory2'], after: 'armor1', desc: 'Units and buildings take 30% less damage (total).' },
  rockets: { name: 'Infantry Rockets', short: 'Inf. Rockets', cost: 600, time: 25, requires: ['conyard2', 'barracks'], desc: 'Infantry switch to rocket launchers against Armored targets.' },
  nitro: { name: 'Trike Nitro', short: 'Trike Nitro', cost: 500, time: 20, requires: ['factory'], desc: 'Trikes move 40% faster and fire 50% faster.' },
  harvest: { name: 'Harvesting', short: 'Harvesting', cost: 600, time: 20, requires: ['conyard2', 'refinery'], desc: 'Harvesters carry 20% more and move 20% faster.' },
};

/** Display name for a requirement. */
export function reqName(r: Req): string {
  if (r === 'conyard2') return BUILDINGS.conyard.levelUp!.name;
  if (r === 'factory2') return BUILDINGS.factory.levelUp!.name;
  return BUILDINGS[r].name;
}

/** Upgrade effects. */
export const WEAPONS_BONUS = 0.2; // damage per Weapons tier
export const ARMOR_BONUS = 0.15; // damage reduction per Armor tier
export const NITRO = { speed: 1.4, cooldown: 1 / 1.5 };
export const HARVEST_UPGRADE = { capacity: 1.2, speed: 1.2 };

export const BUILDING_TAGS: Tag[] = ['structure'];

export const HARVESTER = {
  capacity: 500,
  rate: 60, // spice per second while harvesting
  unloadRate: 250, // credits per second while unloading
};

export const SPICE_MAX = 500;
