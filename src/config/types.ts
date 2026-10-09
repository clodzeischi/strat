// Shared game data types.

export type Team = 0 | 1;

/** Atreides: today's roster (the Terran of the game). Corrino: slower, dearer, tougher, with shields. */
export type Faction = 'atreides' | 'corrino';

export type UnitType =
  | 'harvester' | 'infantry' | 'trike' | 'tank' | 'rocket' | 'repair' | 'carryall'
  | 'trooper' | 'sardaukar' | 'razor' | 'devastator' | 'raider' | 'artillery';
export type BuildingType = 'conyard' | 'refinery' | 'barracks' | 'bunker' | 'factory' | 'hitech' | 'fab' | 'tleilaxu' | 'pad' | 'turret';
/** Buildings that train units. Each one of a type adds a parallel production line for that type. */
export type Producer = 'barracks' | 'factory' | 'hitech' | 'fab';
/** Buildings that can be upgraded to level 2 to unlock more tech. */
export type LevelUpType = 'conyard' | 'factory' | 'barracks' | 'fab';
/** A tech requirement: a building, or a level-2 one. */
export type Req = BuildingType | `${LevelUpType}2`;
export type UpgradeType =
  | 'weapons1' | 'weapons2' | 'armor1' | 'armor2' | 'rockets' | 'nitro' | 'harvest'
  | 'cWeapons' | 'cArmor' | 'cShields' | 'cHarvest' | 'flame';
/** Upgrades that stack into a level: Weapons I and II, or Corrino's single Weapons +1. */
export type UpgradeLine = 'weapons' | 'armor' | 'shields' | 'harvest';
/** StarCraft-style attributes. Weapons deal bonus (or reduced) damage against specific tags. */
export type Tag = 'biological' | 'mechanical' | 'light' | 'armored' | 'structure' | 'air';
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
  /** Can hit aircraft. Weapons without it only hit ground targets. */
  air?: boolean;
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
  /** Flies: ignores terrain and can only be hit by anti-air weapons. */
  air?: boolean;
  /** Carryall space this unit takes (capacity CARRYALL.capacity); units without it can't be lifted. */
  lift?: number;
  /** Mends mechanical units and structures. */
  repair?: { rate: number; range: number };
  /** Corrino: shield points on top of health. They absorb damage first and recover on their own. */
  shields?: number;
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
  levelUp?: { name: string; short: string; cost: number; time: number; desc: string; requires?: Req[] };
  /** Infantry it can hold (a bunker); they shoot from it and can't be hit while inside. */
  garrison?: number;
  /** A gun of its own (Corrino's turret). */
  weapon?: WeaponDef;
  /** Mends its own side's units parked next to it (Corrino's Repair Pad): this many at a time, at `rate` HP/s each. */
  pad?: { slots: number; rate: number; range: number };
}

export interface UpgradeDef {
  name: string;
  short: string; // label on the research card
  cost: number;
  time: number;
  requires: Req[];
  after?: UpgradeType; // previous tier that must be researched first
  /** The level it adds to (weapons, armor, shields, harvesting). */
  line?: UpgradeLine;
  desc: string;
}
