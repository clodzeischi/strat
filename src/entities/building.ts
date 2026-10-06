import type * as THREE from 'three';
import { BUILDING_TAGS, BUILDINGS, TEAM_COLORS, TILE, type BuildingDef, type BuildingType, type Team } from '../config';
import type { Cell } from '../map';
import { makeBuildingModel, makeLevelKit } from '../models';
import { Entity } from './entity';
import type { Unit } from './unit';

/** Which side a building's door (unit exit, harvester dock) is on. Models are built facing south (+z). */
export type Facing = 'south' | 'east' | 'north' | 'west';
const FACING_ANGLE: Record<Facing, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

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

  constructor(id: number, team: Team, readonly type: BuildingType, readonly cx: number, readonly cz: number, groundY: number, readonly facing: Facing = 'south') {
    const def = BUILDINGS[type];
    super(id, team, def.hp, def.size * TILE * 0.8, 4.8, (def.size * TILE) / 2 + 0.1, true);
    this.def = def;
    this.size = def.size;
    this.radius = (def.size * TILE) / 2;
    this.x = (cx + def.size / 2) * TILE;
    this.z = (cz + def.size / 2) * TILE;
    this.y = groundY;
    const model = makeBuildingModel(type, TEAM_COLORS[team], def.size);
    this.spinner = model.spinner;
    model.group.rotation.y = FACING_ANGLE[facing];
    this.root.add(model.group);
    this.root.position.set(this.x, this.y, this.z);
  }

  /** Free places for infantry, 0 for buildings that don't hold any. */
  get room(): number {
    return (this.def.garrison ?? 0) - this.occupants.length;
  }

  get name(): string {
    return this.level >= 2 && this.def.levelUp ? this.def.levelUp.name : this.def.name;
  }

  setLevel(level: number): void {
    this.level = level;
    if (level < 2) return;
    const kit = makeLevelKit(this.type, TEAM_COLORS[this.team]);
    kit.rotation.y = FACING_ANGLE[this.facing];
    this.root.add(kit);
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
