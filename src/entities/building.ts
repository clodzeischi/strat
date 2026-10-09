import * as THREE from 'three';
import { BUILDING_TAGS, BUILDINGS, TEAM_COLORS, TILE, type BuildingDef, type BuildingType, type Team } from '../config';
import type { Cell } from '../map';
import type { Point } from '../game/pathfinding';
import { makeBuildingModel, makeLevelKit } from '../models';
import { Entity } from './entity';
import type { Unit } from './unit';

/** Which side a building's door (unit exit, harvester dock) is on. Models are built facing south (+z). */
export type Facing = 'south' | 'east' | 'north' | 'west';
const FACING_ANGLE: Record<Facing, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

/**
 * Buildings are drawn turned 45 degrees, the way StarCraft's look on its diagonal grid, though they occupy the
 * square, camera-aligned tiles of their footprint. Purely cosmetic: the model is shrunk to the diamond that fits
 * inside the footprint, so nothing pokes into the tiles around it.
 */
export const BUILDING_TURN = Math.PI / 4;

/** Scale (across the ground) that fits a building's turned slab inside its square footprint. */
export function diamondScale(size: number): number {
  const slab = size * TILE - 0.3;
  return (size * TILE) / (slab * Math.SQRT2);
}

/** Seconds a structure takes to salvage, and the share of its price that comes back. */
export const SALVAGE = { time: 5, refund: 0.75 };

/**
 * The side facing the point (x, z), in world units, from a building centered at (bx, bz). Exact diagonals pick the
 * east-west side, so two buildings placed point-symmetrically always face opposite ways.
 */
export function facingToward(bx: number, bz: number, x: number, z: number): Facing {
  const dx = x - bx;
  const dz = z - bz;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'east' : 'west';
  return dz >= 0 ? 'south' : 'north';
}

export class Building extends Entity {
  readonly kind = 'building';
  readonly tags = BUILDING_TAGS;
  readonly def: BuildingDef;
  readonly radius: number;
  readonly size: number;
  readonly spinner: THREE.Object3D | null;
  level = 1;
  /** Infantry inside (bunkers). */
  occupants: Unit[] = [];
  /** Drawing only: the local player has seen it, so it stays on their screen in the fog (as last seen). */
  known = false;
  /** Producers: where new units go. Starts a few tiles out of the door; the player moves it. */
  rally: Point | null = null;
  /** Whether the rally point is still the default one (new units then spread around it instead of stacking). */
  rallyDefault = true;
  /** Being salvaged: 0 to 1, after which it's removed and part of its price refunded. */
  salvage: number | null = null;
  /** Turned and scaled holder of the model, so level-2 parts line up with it. */
  private model = new THREE.Group();

  constructor(id: number, team: Team, readonly type: BuildingType, readonly cx: number, readonly cz: number, groundY: number, readonly facing: Facing = 'south') {
    const def = BUILDINGS[type];
    super(id, team, def.hp, def.size * TILE * 0.8, 4.8, (def.size * TILE) / 2 + 0.1);
    this.def = def;
    this.size = def.size;
    this.radius = (def.size * TILE) / 2;
    this.x = (cx + def.size / 2) * TILE;
    this.z = (cz + def.size / 2) * TILE;
    this.y = groundY;
    const model = makeBuildingModel(type, TEAM_COLORS[team], def.size);
    this.spinner = model.spinner;
    const k = diamondScale(def.size);
    this.model.scale.set(k, 1, k);
    this.model.rotation.y = FACING_ANGLE[facing] + BUILDING_TURN;
    this.model.add(model.group);
    this.root.add(this.model);
    this.root.position.set(this.x, this.y, this.z);
  }

  /** Free places for infantry, 0 for buildings that don't hold any (or are being salvaged). */
  get room(): number {
    if (this.salvage !== null) return 0;
    return (this.def.garrison ?? 0) - this.occupants.length;
  }

  get name(): string {
    return this.level >= 2 && this.def.levelUp ? this.def.levelUp.name : this.def.name;
  }

  setLevel(level: number): void {
    this.level = level;
    if (level < 2) return;
    this.model.add(makeLevelKit(this.type, TEAM_COLORS[this.team]));
  }

  /** One step out of the door, in cells. */
  doorStep(): { dx: number; dz: number } {
    return { south: { dx: 0, dz: 1 }, north: { dx: 0, dz: -1 }, east: { dx: 1, dz: 0 }, west: { dx: -1, dz: 0 } }[this.facing];
  }

  /** Heading (as units use it) of something leaving through the door. */
  doorHeading(): number {
    const d = this.doorStep();
    return Math.atan2(d.dz, d.dx);
  }

  /** The ring of cells around the footprint, sides first (no corners), then the corners. */
  perimeter(): { cell: Cell; out: { dx: number; dz: number } }[] {
    const sides: { cell: Cell; out: { dx: number; dz: number } }[] = [];
    const corners: { cell: Cell; out: { dx: number; dz: number } }[] = [];
    const { cx, cz, size: s } = this;
    for (let i = 0; i < s; i++) {
      sides.push({ cell: { cx: cx + i, cz: cz + s }, out: { dx: 0, dz: 1 } });
      sides.push({ cell: { cx: cx + i, cz: cz - 1 }, out: { dx: 0, dz: -1 } });
      sides.push({ cell: { cx: cx + s, cz: cz + i }, out: { dx: 1, dz: 0 } });
      sides.push({ cell: { cx: cx - 1, cz: cz + i }, out: { dx: -1, dz: 0 } });
    }
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      corners.push({ cell: { cx: dx > 0 ? cx + s : cx - 1, cz: dz > 0 ? cz + s : cz - 1 }, out: { dx, dz } });
    }
    return [...sides, ...corners];
  }

  /**
   * Cell in front of the door, where units exit and harvesters dock. Opposite sides use mirrored offsets, so the
   * front cells of two point-symmetric buildings are point-symmetric too.
   */
  frontCell(): Cell {
    const h = Math.floor(this.size / 2);
    const s = this.size;
    switch (this.facing) {
      case 'south': return { cx: this.cx + h, cz: this.cz + s };
      case 'north': return { cx: this.cx + s - 1 - h, cz: this.cz - 1 };
      case 'east': return { cx: this.cx + s, cz: this.cz + h };
      case 'west': return { cx: this.cx - 1, cz: this.cz + s - 1 - h };
    }
  }
}
