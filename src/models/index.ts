import * as THREE from 'three';
import { TILE, type BuildingType, type UnitType } from '../config';
import { CONCRETE } from '../materials/palette';
import { barracks } from './buildings/barracks';
import { conyard } from './buildings/conyard';
import { factory } from './buildings/factory';
import { hitech } from './buildings/hitech';
import { refinery } from './buildings/refinery';
import { box } from './parts';
import type { BuildingBlueprint, BuildingModel, UnitBlueprint, UnitModel, UpgradeKit, UpgradeLook } from './types';
import { carryall } from './units/carryall';
import { harvester } from './units/harvester';
import { infantry } from './units/infantry';
import { repair } from './units/repair';
import { rocket } from './units/rocket';
import { tank } from './units/tank';
import { trike } from './units/trike';

export type { BuildingModel, UnitModel, UpgradeKit, UpgradeLook } from './types';
export { makeParachute } from './parachute';
export { CARRYALL_HOOK_Y, SEATS, SEAT_OFF, SEAT_ON } from './units/carryall';

const UNIT_MODELS: Record<UnitType, UnitBlueprint> = { harvester, infantry, trike, tank, rocket, repair, carryall };
const BUILDING_MODELS: Record<BuildingType, BuildingBlueprint> = { conyard, refinery, barracks, factory, hitech };

/** Unit models face +X. */
export function makeUnitModel(type: UnitType, color: number): UnitModel {
  return UNIT_MODELS[type].build(color);
}

/** Buildings are centered on their footprint, standing on a concrete slab with team trim; front faces +Z. */
export function makeBuildingModel(type: BuildingType, color: number, size: number): BuildingModel {
  const group = new THREE.Group();
  const w = size * TILE - 0.3;
  box(group, w, 0.3, w, CONCRETE, 0, 0.15, 0);
  // Team-colored trim on the slab edge.
  box(group, w + 0.05, 0.12, 0.2, color, 0, 0.3, w / 2 - 0.1);
  const spinner = BUILDING_MODELS[type].build(group, color);
  return { group, spinner };
}

/**
 * Extra parts showing a unit's upgrades: armor plating, weapon accessories and laser sights,
 * rocket tubes, nitro exhausts and bigger hoppers. `turret` parts follow the turret's rotation.
 */
export function makeUpgradeKit(type: UnitType, look: UpgradeLook, color: number): UpgradeKit {
  const parts = { body: new THREE.Group(), turret: new THREE.Group() };
  UNIT_MODELS[type].kit(look, color, parts);
  return parts;
}

/** Extra structure added when a building reaches level 2. */
export function makeLevelKit(type: BuildingType, color: number): THREE.Group {
  const g = new THREE.Group();
  BUILDING_MODELS[type].levelKit?.(g, color);
  return g;
}

/** Frees the geometry of a generated part group (materials are shared). */
export function disposeParts(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
