// Distances are in world units; one map tile is TILE world units.
import type { LevelUpType, Producer, Team } from './types';

export const TILE = 2;
/** Map sizes in tiles per side, chosen before each game. */
export const MAP_SIZES = [64, 96, 128] as const;
export type MapSize = (typeof MAP_SIZES)[number];
export const MAP_SIZE_NAMES: Record<MapSize, string> = { 64: 'Small', 96: 'Medium', 128: 'Large' };

export const PLAYER: Team = 0;
export const ENEMY: Team = 1;
export const TEAM_COLORS = [0x3d7be0, 0xd8402f];
export const TEAM_CSS = ['#3d7be0', '#d8402f'];

export const START_CREDITS = 2500;

export const PRODUCERS: Producer[] = ['barracks', 'factory'];
export const QUEUE_MAX = 5; // per producer type
export const LEVEL_UP_ORDER: LevelUpType[] = ['conyard', 'factory'];

/** Upgrade effects. */
export const WEAPONS_BONUS = 0.2; // damage per Weapons tier
export const ARMOR_BONUS = 0.15; // damage reduction per Armor tier
export const NITRO = { speed: 1.4, cooldown: 1 / 1.5 };
export const HARVEST_UPGRADE = { capacity: 1.2, speed: 1.2 };

/** Range bonus for shooting down from high ground, and penalty for shooting up at it. */
export const HIGH_GROUND_RANGE = 0.1;

export const HARVESTER = {
  capacity: 500,
  rate: 60, // spice per second while harvesting
  unloadRate: 250, // credits per second while unloading
};

export const SPICE_MAX = 500;
