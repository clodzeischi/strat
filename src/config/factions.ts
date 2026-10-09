import type { BuildingType, Faction, LevelUpType, UnitDef, UnitType, UpgradeType } from './types';
import { UNITS } from './units';

/** A button on the research card: a building's level-up, or upgrades in order (the first one not yet researched). */
export type ResearchSlot = { levelUp: LevelUpType } | { upgrades: UpgradeType[] };

export interface FactionDef {
  name: string;
  /** Command card layouts (8 slots each: the home row, then the bottom row). Also what the faction may use at all. */
  build: (BuildingType | null)[];
  train: (UnitType | null)[];
  research: (ResearchSlot | null)[];
  /** Units each player starts with, next to the Construction Yard. */
  start: UnitType[];
  /** Units and structures carry shields (UnitDef.shields, or SHARED_SHIELDS of health for shared types). */
  shields: boolean;
  /** Damaged structures can be repaired from their own command card (while a Construction Yard stands). */
  selfRepair: boolean;
  /** Shared units that differ for this faction (Corrino builds Harvesters at the Fab). */
  units?: Partial<Record<UnitType, Partial<UnitDef>>>;
  /** Structures may go on open sand, not just rock (Fremen). */
  buildOnSand?: boolean;
  /** Units and structures heal slowly on their own (Fremen; see FREMEN_REGEN). */
  regen?: boolean;
  /** No harvesters and refineries: income comes from Spice Camps that crews set up on the fields. */
  camps?: boolean;
}

export const FACTIONS: Record<Faction, FactionDef> = {
  atreides: {
    name: 'Atreides',
    build: ['refinery', 'barracks', 'factory', 'hitech', 'bunker', 'conyard', null, null],
    train: ['infantry', 'trike', 'tank', 'rocket', 'harvester', 'repair', 'carryall', null],
    research: [
      { levelUp: 'conyard' }, { levelUp: 'factory' }, { upgrades: ['weapons1', 'weapons2'] }, { upgrades: ['armor1', 'armor2'] },
      { upgrades: ['rockets'] }, { upgrades: ['nitro'] }, { upgrades: ['harvest'] }, null,
    ],
    start: ['trike', 'infantry', 'infantry', 'infantry'],
    shields: false,
    selfRepair: false,
  },
  corrino: {
    name: 'Corrino',
    build: ['refinery', 'barracks', 'fab', 'tleilaxu', 'turret', 'pad', 'conyard', null],
    train: ['trooper', 'sardaukar', 'razor', 'devastator', 'harvester', 'raider', 'artillery', null],
    research: [
      { levelUp: 'barracks' }, { levelUp: 'fab' }, { upgrades: ['cWeapons'] }, { upgrades: ['cArmor'] },
      { upgrades: ['cShields'] }, { upgrades: ['flame'] }, { upgrades: ['cHarvest'] }, null,
    ],
    start: ['razor', 'trooper', 'trooper'],
    shields: true,
    selfRepair: true,
    units: { harvester: { producer: 'fab', requires: ['fab', 'refinery'] } },
  },
  fremen: {
    name: 'Fremen',
    build: ['barracks', 'sietch', null, null, 'bunker', 'conyard', null, null],
    train: ['warrior', 'fedaykin', null, null, 'crew', null, null, null],
    research: [
      { levelUp: 'sietch' }, { upgrades: ['fWeapons'] }, { upgrades: ['fArmor'] }, { upgrades: ['ambush'] },
      { upgrades: ['stillsuit'] }, { upgrades: ['sandwalk'] }, { upgrades: ['fHarvest'] }, null,
    ],
    start: ['warrior', 'warrior', 'warrior', 'crew'],
    shields: false,
    selfRepair: false,
    buildOnSand: true,
    regen: true,
    camps: true,
  },
};

export const FACTION_LIST: Faction[] = ['atreides', 'corrino', 'fremen'];

/** Shields of shared units and of structures, for a faction with shields: this share of their health. */
export const SHARED_SHIELDS = 0.5;

const defCache = new Map<string, UnitDef>();

/** A unit's stats as this faction fields it. */
export function unitDef(faction: Faction, type: UnitType): UnitDef {
  const key = `${faction}:${type}`;
  let d = defCache.get(key);
  if (!d) {
    d = { ...UNITS[type], ...FACTIONS[faction].units?.[type] };
    defCache.set(key, d);
  }
  return d;
}

/** Shield points for one of this faction's units or structures (0 without shields). */
export function shieldsFor(faction: Faction, def: { hp: number; shields?: number }): number {
  if (!FACTIONS[faction].shields) return 0;
  return def.shields ?? Math.round(def.hp * SHARED_SHIELDS);
}

/** The research slots' upgrades and level-ups, for checking what a faction may research. */
export function factionUpgrades(faction: Faction): Set<UpgradeType> {
  return new Set(FACTIONS[faction].research.flatMap((s) => (s && 'upgrades' in s ? s.upgrades : [])));
}

export function factionLevelUps(faction: Faction): Set<LevelUpType> {
  return new Set(FACTIONS[faction].research.flatMap((s) => (s && 'levelUp' in s ? [s.levelUp] : [])));
}
