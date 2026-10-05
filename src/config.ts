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
export type BuildingType = 'conyard' | 'refinery' | 'factory';
export type UpgradeType = 'weapons' | 'armor' | 'harvest';
export type ProjectileKind = 'bullet' | 'shell' | 'rocket';

export interface WeaponDef {
  range: number;
  damage: number;
  cooldown: number; // seconds between shots
  projectile: ProjectileKind;
  speed: number; // projectile speed (ignored for bullets, which hit instantly)
  splash: number; // splash radius, 0 = single target
}

export interface UnitDef {
  name: string;
  cost: number;
  buildTime: number;
  hp: number;
  speed: number;
  turnRate: number; // radians per second
  radius: number;
  sight: number;
  turret: boolean;
  infantry: boolean;
  weapon: WeaponDef | null;
  requires: BuildingType[];
  desc: string;
}

export interface BuildingDef {
  name: string;
  cost: number;
  buildTime: number;
  hp: number;
  size: number; // footprint in tiles (square)
  requires: BuildingType[];
  desc: string;
}

export interface UpgradeDef {
  name: string;
  cost: number;
  time: number;
  requires: BuildingType[];
  desc: string;
}

export const UNIT_ORDER: UnitType[] = ['harvester', 'infantry', 'trike', 'tank', 'rocket'];
export const BUILDING_ORDER: BuildingType[] = ['conyard', 'refinery', 'factory'];
export const UPGRADE_ORDER: UpgradeType[] = ['weapons', 'armor', 'harvest'];

export const UNITS: Record<UnitType, UnitDef> = {
  harvester: {
    name: 'Harvester', cost: 300, buildTime: 10, hp: 600, speed: 3, turnRate: 3, radius: 1.1, sight: 8,
    turret: false, infantry: false, weapon: null, requires: ['factory', 'refinery'],
    desc: 'Collects spice and brings it to a Refinery.',
  },
  infantry: {
    name: 'Infantry', cost: 60, buildTime: 3, hp: 70, speed: 2.4, turnRate: 12, radius: 0.45, sight: 10,
    turret: false, infantry: true, requires: ['factory'],
    weapon: { range: 6, damage: 6, cooldown: 0.6, projectile: 'bullet', speed: 0, splash: 0 },
    desc: 'Cheap rifle squad. Good against infantry.',
  },
  trike: {
    name: 'Trike', cost: 150, buildTime: 5, hp: 140, speed: 7.5, turnRate: 6, radius: 0.8, sight: 12,
    turret: false, infantry: false, requires: ['factory'],
    weapon: { range: 7, damage: 7, cooldown: 0.3, projectile: 'bullet', speed: 0, splash: 0 },
    desc: 'Fast scout with a machine gun.',
  },
  tank: {
    name: 'Tank', cost: 400, buildTime: 9, hp: 450, speed: 3.8, turnRate: 2.5, radius: 1.1, sight: 13,
    turret: true, infantry: false, requires: ['factory'],
    weapon: { range: 10, damage: 40, cooldown: 1.4, projectile: 'shell', speed: 32, splash: 0 },
    desc: 'Armored main battle tank. Good against vehicles.',
  },
  rocket: {
    name: 'Rocket Launcher', cost: 500, buildTime: 11, hp: 200, speed: 3.4, turnRate: 2.5, radius: 1.0, sight: 18,
    turret: true, infantry: false, requires: ['factory'],
    weapon: { range: 17, damage: 55, cooldown: 2.8, projectile: 'rocket', speed: 15, splash: 2.5 },
    desc: 'Long-range artillery with splash damage. Fragile.',
  },
};

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  conyard: {
    name: 'Construction Yard', cost: 2500, buildTime: 25, hp: 1600, size: 3, requires: [],
    desc: 'Builds structures. Lose all of these and you cannot build.',
  },
  refinery: {
    name: 'Refinery', cost: 1200, buildTime: 14, hp: 1000, size: 3, requires: [],
    desc: 'Processes spice into credits. Comes with a free Harvester.',
  },
  factory: {
    name: 'Factory', cost: 1000, buildTime: 14, hp: 1100, size: 3, requires: ['refinery'],
    desc: 'Produces all units and researches upgrades.',
  },
};

export const UPGRADES: Record<UpgradeType, UpgradeDef> = {
  weapons: { name: 'Weapons', cost: 800, time: 25, requires: ['factory'], desc: '+30% damage for all units.' },
  armor: { name: 'Armor', cost: 800, time: 25, requires: ['factory'], desc: 'Units and buildings take 25% less damage.' },
  harvest: { name: 'Harvesting', cost: 600, time: 20, requires: ['factory', 'refinery'], desc: 'Harvesters carry 50% more and move 25% faster.' },
};

// Damage multipliers: projectile kind vs target class.
export const DAMAGE_MOD: Record<ProjectileKind, { infantry: number; vehicle: number; building: number }> = {
  bullet: { infantry: 1.0, vehicle: 0.45, building: 0.3 },
  shell: { infantry: 0.4, vehicle: 1.0, building: 0.8 },
  rocket: { infantry: 0.6, vehicle: 1.0, building: 1.2 },
};

export const HARVESTER = {
  capacity: 500,
  rate: 60, // spice per second while harvesting
  unloadRate: 250, // credits per second while unloading
};

export const SPICE_MAX = 500;
