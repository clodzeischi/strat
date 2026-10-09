// Shared game data types.

export type Team = 0 | 1;

/**
 * Atreides: today's roster (the Terran of the game). Corrino: slower, dearer, tougher, with shields (the Protoss).
 * Fremen: cheap, fast infantry that hide in the sand and live off spice camps (the Zerg).
 */
export type Faction = 'atreides' | 'corrino' | 'fremen';

export type UnitType =
  | 'harvester' | 'infantry' | 'trike' | 'tank' | 'rocket' | 'repair' | 'carryall'
  | 'trooper' | 'sardaukar' | 'razor' | 'devastator' | 'raider' | 'artillery'
  | 'warrior' | 'fedaykin' | 'commando' | 'crew' | 'worm';
export type BuildingType =
  | 'conyard' | 'refinery' | 'barracks' | 'bunker' | 'factory' | 'hitech' | 'fab' | 'tleilaxu' | 'pad' | 'turret'
  | 'sietch' | 'thumper' | 'camp';
/** Buildings that train units. Each one of a type adds a parallel production line for that type. */
export type Producer = 'barracks' | 'factory' | 'hitech' | 'fab' | 'thumper';
/** Buildings that can be upgraded to level 2 to unlock more tech. */
export type LevelUpType = 'conyard' | 'factory' | 'barracks' | 'fab' | 'sietch';
/** A tech requirement: a building, or a level-2 one. */
export type Req = BuildingType | `${LevelUpType}2`;
export type UpgradeType =
  | 'weapons1' | 'weapons2' | 'armor1' | 'armor2' | 'rockets' | 'nitro' | 'harvest'
  | 'cWeapons' | 'cArmor' | 'cShields' | 'cHarvest' | 'flame'
  | 'fWeapons' | 'fArmor' | 'fHarvest' | 'stillsuit' | 'sandwalk' | 'ambush';
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
  /** Shells aimed at the ground where the target stood when fired; anything that moves out of the blast is safe. */
  unguided?: boolean;
  /** Flamethrower: hits every enemy within range inside this half-angle (radians) around the aim. */
  cone?: number;
  /** Firing it blows the shooter up (Death Commandos): a blast of `splash` around itself, and it's gone. */
  suicide?: boolean;
  /** Passes straight through shields to health (sound: the Fedaykin's weirding modules). */
  pierce?: boolean;
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
  /** Main weapon only fires while standing still (the Devastator's big gun). */
  holdFire?: boolean;
  /** A second gun that fires on its own, also on the move (the Devastator's machine gun). */
  secondary?: WeaponDef;
  /** Can deploy (taking `time` seconds, and as long to pack up): it can't move, and fires `weapon` instead. */
  deploy?: { time: number; weapon: WeaponDef };
  /** Can self-destruct: blows up `delay` seconds after the order, hitting everything in the weapon's splash. */
  detonate?: { delay: number; weapon: WeaponDef };
  /** Can lock on to one enemy (aimed by the player): for `duration` s its shots home in on it; then `cooldown` s to recharge. */
  lockOn?: { duration: number; cooldown: number };
  /** Lays mines: one every `cooldown` s; an enemy on the ground within `trigger` sets one off. At most `max` per side. */
  mines?: { cooldown: number; trigger: number; max: number; weapon: WeaponDef };
  /** Fremen: digs into the sand when standing still on it, out of the enemy's sight (see HIDE in rules.ts). */
  hides?: boolean;
  /** Only travels on sand and spice (the Sandworm). */
  sandOnly?: boolean;
  /** At most this many per side, alive or in production. */
  limit?: number;
  /** Deploys into this structure where it stands (a Spice Crew into a Spice Camp), and the structure packs back into it. */
  camp?: BuildingType;
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
  /** Turns the spice within `radius` (world units) into credits, `rate` per second while there's enough of it (Spice Camp). */
  extract?: { rate: number; radius: number };
  /** Has to stand on open sand (the Thumper). */
  onSand?: boolean;
  /** Only comes from a unit deploying (not built at the Construction Yard). */
  deployed?: boolean;
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
