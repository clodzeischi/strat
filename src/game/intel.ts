import type { BuildingType, Team, UnitType } from '../config';
import type { Unit } from '../entities';
import type { Game } from './game';
import { hypot } from './hypot';

/** Searching divides the map into squares this many tiles across. */
const REGION = 8;

/** A unit not seen for this long (seconds) has no known position any more: it could be anywhere by now. */
const PLACE_MEMORY = 60;
/** A unit not seen for this long is dropped from the estimate of the enemy army altogether. */
const ARMY_MEMORY = 180;

/** What an AI remembers of one enemy unit or structure: where it was and how strong, when last seen. */
export interface Sighting {
  id: number;
  team: Team;
  type: UnitType | BuildingType;
  x: number;
  z: number;
  /** Fighting strength when last seen (cost scaled by health; 0 for unarmed units and structures). */
  power: number;
  /** Game time it was last seen. */
  seen: number;
  harvester: boolean;
  /** Whether we still have an idea where it is (a unit seen recently whose last spot hasn't been seen empty). */
  placed: boolean;
}

/**
 * An AI's picture of the enemy, built only from what its side has actually seen through the fog of war: units
 * where they were last spotted (forgotten after a minute, or as soon as their last spot is in view and they're not
 * there), and structures until their spot is seen empty. The AI plans from this, never from the game's full state,
 * so a player who stays out of sight is unknown to it until it scouts.
 */
export class Intel {
  readonly units = new Map<number, Sighting>();
  readonly buildings = new Map<number, Sighting>();
  /** Seen enemy infantry since they researched Infantry Rockets (the launchers show on their backs). */
  enemyRockets = false;
  /** Per search region (REGION tiles square): game time its middle was last in sight. */
  private regionSeen: Float64Array;
  private regions: number;

  constructor(private game: Game, private team: Team) {
    this.regions = Math.ceil(game.map.size / REGION);
    this.regionSeen = new Float64Array(this.regions * this.regions).fill(-Infinity);
  }

  /** Records what's in sight now and forgets what's been shown to be gone. */
  update(): void {
    const g = this.game;
    const t = g.time;
    for (const u of g.units) {
      if (u.team === this.team || u.dead || u.carrier || !g.sees(this.team, u)) continue;
      this.units.set(u.id, {
        id: u.id, team: u.team, type: u.type, x: u.x, z: u.z, seen: t, harvester: u.type === 'harvester', placed: true,
        power: u.def.weapon ? u.def.cost * (u.hp / u.maxHp) : 0,
      });
      if (u.def.infantry && g.teams[u.team].upgrades.has('rockets')) this.enemyRockets = true;
    }
    for (const b of g.buildings) {
      if (b.team === this.team || b.dead || !g.sees(this.team, b)) continue;
      this.buildings.set(b.id, { id: b.id, team: b.team, type: b.type, x: b.x, z: b.z, seen: t, harvester: false, placed: true, power: 0 });
      this.lastBaseSeen = t;
    }
    const v = g.vision;
    for (const [id, s] of this.units) {
      if (s.seen === t) continue;
      // Seen dying: gone. Otherwise a unit out of sight still counts toward the enemy army for a while, but its
      // position is only trusted until its last spot is in view again, or for a minute.
      if (g.witnessedDeath(this.team, id) || t - s.seen > ARMY_MEMORY) this.units.delete(id);
      else if (s.placed && (t - s.seen > PLACE_MEMORY || v.seesAt(this.team, s.x, s.z))) s.placed = false;
    }
    for (let rz = 0; rz < this.regions; rz++) {
      for (let rx = 0; rx < this.regions; rx++) {
        const m = g.map;
        const cx = Math.min(m.size - 1, rx * REGION + REGION / 2);
        const cz = Math.min(m.size - 1, rz * REGION + REGION / 2);
        if (v.seesAt(this.team, m.center(cx), m.center(cz))) this.regionSeen[rz * this.regions + rx] = t;
      }
    }
    // A structure's spot in view without it: destroyed.
    for (const [id, s] of this.buildings) if (s.seen < t && v.seesAt(this.team, s.x, s.z)) this.buildings.delete(id);
  }

  /** Game time we last had an enemy structure in sight. */
  lastBaseSeen = -Infinity;

  /** The live unit behind a sighting, if it's still in view (to give it as an attack target). */
  visibleUnit(s: Sighting): Unit | null {
    const u = this.game.units.find((u) => u.id === s.id);
    return u && !u.dead && this.game.sees(this.team, u) ? u : null;
  }

  /** Enemy army strength we know of (units seen within the last minute). */
  armyPower(): number {
    let p = 0;
    for (const s of this.units.values()) p += s.power;
    return p;
  }

  /** Known enemy fighting strength within `radius` (world units) of a point. */
  powerAround(x: number, z: number, radius: number): number {
    let p = 0;
    for (const s of this.units.values()) if (s.placed && hypot(s.x - x, s.z - z) < radius) p += s.power;
    return p;
  }

  /** Units whose whereabouts we know (seen within the last minute). */
  placedUnits(): Sighting[] {
    return [...this.units.values()].filter((s) => s.placed);
  }

  /**
   * Where the enemy base is, as far as we know: its construction yard, or the middle of the structures we've seen;
   * with none seen, the mirror image of our own start (maps are point-symmetric, which any player can work out).
   */
  enemyBase(): { x: number; z: number } {
    const known = [...this.buildings.values()];
    const yard = known.find((s) => s.type === 'conyard');
    if (yard) return { x: yard.x, z: yard.z };
    if (known.length) return { x: known.reduce((a, s) => a + s.x, 0) / known.length, z: known.reduce((a, s) => a + s.z, 0) / known.length };
    const m = this.game.map;
    const start = m.bases[(1 - this.team) as Team] ?? m.bases[0];
    return { x: m.center(start.cx), z: m.center(start.cz) };
  }

  /**
   * Where to look for an enemy we've lost track of: the middle of the map region gone longest without a look, ties
   * (never seen) going to the one nearest the enemy's side of the map. Only regions with ground a vehicle can reach.
   */
  searchSpot(): { x: number; z: number } {
    const m = this.game.map;
    const guess = this.enemyBase();
    let best: { x: number; z: number } | null = null;
    let bestKey = Infinity;
    for (let rz = 0; rz < this.regions; rz++) {
      for (let rx = 0; rx < this.regions; rx++) {
        const cell = m.nearestCell(Math.min(m.size - 1, rx * REGION + REGION / 2), Math.min(m.size - 1, rz * REGION + REGION / 2), (x, z) => m.canEnter(x, z, 'vehicle'), REGION / 2);
        if (!cell) continue;
        const x = m.center(cell.cx);
        const z = m.center(cell.cz);
        const seen = this.regionSeen[rz * this.regions + rx];
        // Older looks first (in steps of 30 s), then nearer the enemy start.
        const key = (seen === -Infinity ? -1e6 : Math.floor(seen / 30) * 1e4) + hypot(x - guess.x, z - guess.z);
        if (key < bestKey) {
          bestKey = key;
          best = { x, z };
        }
      }
    }
    return best ?? guess;
  }

  /** Whether we know of any enemy structure. */
  get baseKnown(): boolean {
    return this.buildings.size > 0;
  }

  /** Remembered structures of a type. */
  structures(type: BuildingType): Sighting[] {
    return [...this.buildings.values()].filter((s) => s.type === type);
  }
}
