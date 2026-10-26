// Distances are in world units; one map tile is TILE world units.
import type { LevelUpType, Producer, Team, WeaponDef } from './types';

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

export const PRODUCERS: Producer[] = ['barracks', 'factory', 'hitech', 'fab', 'perch'];
export const QUEUE_MAX = 5; // per producer type
export const LEVEL_UP_ORDER: LevelUpType[] = ['conyard', 'factory', 'barracks', 'fab', 'sietch'];

/** Upgrade effects. */
/**
 * Damage (docs/damage-redesign.md): a hit is the weapon's damage plus its bonus against the target's tags plus its
 * upgrade step per Weapons level; shields take it first, less one per Shields level; what reaches health loses the
 * target's armor plus one per Armor level. Never less than MIN_HIT.
 */
export const MIN_HIT = 0.5;
/** Structures that don't set their own: armor. */
export const STRUCTURE = { armor: 5 };
/** A weapon's default Weapons upgrade step: this share of its damage per level, rounded, at least 1. */
export const WEAPON_STEP = { share: 0.2 };
/** Razor Flame Range upgrade: extra reach, in world units. */
export const FLAME_RANGE = 2;
export const NITRO = { speed: 1.5, cooldown: 1 / 1.5 };
export const HARVEST_UPGRADE = { capacity: 1.25, speed: 1.25, rate: 1.5 }; // rate: spice picked up per second

/** Range bonus for shooting down from high ground, and penalty for shooting up at it. */
export const HIGH_GROUND_RANGE = 0.1;

export const HARVESTER = {
  capacity: 500,
  rate: 38, // spice per second while harvesting
  unloadRate: 250, // credits per second while unloading
};

export const SPICE_MAX = 500;

/** Repairs cost this share of the unit's or building's price per full health bar. */
export const REPAIR_COST = 0.4;
/** Infantry heal this share of their health per second once they haven't been hit for INFANTRY_REGEN.delay seconds. */
export const INFANTRY_REGEN = { rate: 0.02, delay: 5 };
/** Shields start recovering once a unit or structure hasn't been hit for `delay` seconds, refilling in `full` seconds. */
export const SHIELD_REGEN = { delay: 7, full: 10 };
/** Corrino structures repairing themselves: health per second, paid as repairs are (REPAIR_COST). */
export const SELF_REPAIR_RATE = 12;

/**
 * Fremen hiding: a unit that `hides` and has stood still on sand or spice for `delay` s is out of the enemy's sight,
 * unless an enemy unit or structure is within `detect` (world units) of it. Firing or being hit brings it out.
 * Dug in, no Sandworm hears it. Told to Dig In, it goes under at once and holds its fire.
 */
export const HIDE = { delay: 3, detect: 2 * 2 };
/** Fremen infantry speed on sand and spice: the bonus, and the Sandwalk upgrade's on top. */
export const SAND_SPEED = { base: 0.2, sandwalk: 0.25 };
/** Ambush: units that strike out of hiding deal this much more damage for `time` seconds. */
export const AMBUSH = { bonus: 0.75, time: 4 };
/**
 * Fremen healing: a share of health per second once unhurt for `delay` s (Stillsuits: x`stillsuit`, after `quick` s).
 * Units dug into the sand heal x`buried`; near a High Perch, units and structures heal faster too (BuildingDef.heals).
 */
export const FREMEN_REGEN = { unit: 0.015, building: 0.006, delay: 6, stillsuit: 2, quick: 3, buried: 2 };
/**
 * Thumpers (Fremen Sandriders, with Sietch III): `cost` credits, then `cooldown` s before that rider can plant
 * another. A planted Thumper drums for `delay` s; then a wild Sandworm comes, unless the Thumper was destroyed.
 * Every `revealEvery` s its drumming gives it away to sides with anything within `hear` of it.
 */
export const THUMPER = { cost: 250, cooldown: 60, delay: 8, hear: 30, revealEvery: 1 };
/**
 * The wild Sandworm a Thumper calls: nobody's, and it can't be hurt. It surfaces where the Thumper stands (swallowing
 * it), then for `hunt` s goes after anything on sand or spice within `range` of that spot, moving or not, and
 * structures there: a bite every `biteEvery` s, everything within `bite` of it. It travels under the sand at `speed` and can't cross rock. Distances in world units.
 * Drawing: it shares the ridden worm's body, sunk deeper (`sink` of each piece's radius) so only the ridge of its back
 * shows; to bite, its first `rear` pieces burst up, the head `rearHeight` out of the sand.
 */
export const WORM = {
  range: 15, bite: 4, hunt: 20, biteEvery: 2.5, speed: 9, reach: 2.5,
  sink: 0.88, rear: 5, rearHeight: 4.5,
  weapon: { range: 0, minRange: 0, damage: 400, bonus: { mechanical: 400 }, step: 0, cooldown: 0, projectile: 'bullet', speed: 0, splash: 4, pierce: true } as WeaponDef,
};
/**
 * A Sandrider rides the worm its Thumper calls, if it's within `mount` when the worm comes, and keeps it until it lets it
 * go or is killed: the worm goes where the rider is sent, bites enemies within WORM.bite of its head (never its own
 * side), and with nowhere to go wanders an irregular loop about `wander` across, going after enemy prey within `hunt`
 * of it. Let go, it dives, leaves the rider on the sand, and that rider can't call again for `cooldown` s. Its rider
 * killed, the worm goes wild for WORM.hunt s. Drawing: `segments` rings `spacing` apart follow the head, sunk `sink` of their radius into
 * the sand so only their backs show; the rider stands on ring `seat`, about `lift` above the sand. Biting, the head
 * rears up out of the sand, the first `rear` pieces lifting with it.
 */
export const RIDE = { mount: 14, cooldown: 60, wander: 20, hunt: 16, segments: 10, spacing: 1.7, seat: 2, lift: 0.45, sink: 0.75, rear: 3 };
/** A Spice Camp works at full rate with this many spice tiles in reach, proportionally less with fewer. */
export const CAMP_FULL = 12;
/** Spice Mining: Spice Camps' extra rate. */
export const CAMP_UPGRADE = 0.25;
/** A Spice Crew told to set up camp off the spice walks to the nearest good spot within this many tiles (dry camps move on too). */
export const CAMP_SEARCH = 10;

export const CARRYALL = {
  capacity: 6, // lift space: infantry take 1, trikes 3, heavy vehicles 6
  altitude: 8, // cruising height above y = 0
  clearance: 4.2, // least height over the ground under and just ahead (climbs over cliffs with a vehicle hanging)
  orbit: 11, // radius of the holding circle
  ferryMin: 6, // tiles: harvester trips shorter than this aren't worth a lift
  rescueAt: 0.67, // a ferried harvester hit below this share of its health is flown out of the fight
};
