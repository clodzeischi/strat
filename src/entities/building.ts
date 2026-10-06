import type * as THREE from 'three';
import { BUILDING_TAGS, BUILDINGS, TEAM_COLORS, TILE, type BuildingDef, type BuildingType, type Team } from '../config';
import type { Cell } from '../map';
import { makeBuildingModel, makeLevelKit } from '../models';
import { Entity } from './entity';

export class Building extends Entity {
  readonly kind = 'building';
  readonly tags = BUILDING_TAGS;
  readonly def: BuildingDef;
  readonly radius: number;
  readonly size: number;
  readonly spinner: THREE.Object3D | null;
  level = 1;

  constructor(id: number, team: Team, readonly type: BuildingType, readonly cx: number, readonly cz: number, groundY: number) {
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
    this.root.add(model.group);
    this.root.position.set(this.x, this.y, this.z);
  }

  get name(): string {
    return this.level >= 2 && this.def.levelUp ? this.def.levelUp.name : this.def.name;
  }

  setLevel(level: number): void {
    this.level = level;
    if (level >= 2) this.root.add(makeLevelKit(this.type, TEAM_COLORS[this.team]));
  }

  /** Cell in front of the building where units exit / harvesters dock. */
  frontCell(): Cell {
    return { cx: this.cx + Math.floor(this.size / 2), cz: this.cz + this.size };
  }
}
