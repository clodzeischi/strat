import * as THREE from 'three';
import { type BuildingType, type Faction, type UnitType } from '../config';
import { cloneBuildingModel, cloneUnitModel } from './gltf';
import type { BuildingModel, UnitBlueprint, UnitModel, UpgradeKit, UpgradeLook } from './types';
import { carryall } from './units/carryall';
import { harvester } from './units/harvester';
import { infantry } from './units/infantry';
import { repair } from './units/repair';
import { rocket } from './units/rocket';
import { tank } from './units/tank';
import { trike } from './units/trike';
import { artillery } from './units/artillery';
import { devastator } from './units/devastator';
import { raider } from './units/raider';
import { razor } from './units/razor';
import { sardaukar } from './units/sardaukar';
import { trooper } from './units/trooper';
import { crew } from './units/crew';
import { fedaykin } from './units/fedaykin';
import { sandrider } from './units/sandrider';
import { glider } from './units/glider';
import { mortar } from './units/mortar';
import { warrior } from './units/warrior';

export type { BuildingModel, UnitAnimator, UnitModel, UpgradeKit, UpgradeLook } from './types';
export { hasBuildingModel, hasUnitModel, loadModels } from './gltf';
export { makeParachute } from './parachute';
export { makePod } from './pod';
export { makeRiddenWorm, type RiddenWormModel } from './sandworm';
export { CARRYALL_HOOK_Y, NACELLES, SEATS, SEAT_OFF, SEAT_ON } from './units/carryall';

const UNIT_MODELS: Record<UnitType, UnitBlueprint> = {
  harvester, infantry, trike, tank, rocket, repair, carryall, trooper, sardaukar, razor, devastator, raider, artillery,
  warrior, fedaykin, crew, glider, mortar, sandrider,
};

/** Unit models face +X. A faction's Blender model replaces the procedural one when it has been loaded. */
export function makeUnitModel(type: UnitType, faction: Faction, color: number): UnitModel {
  return cloneUnitModel(type, faction, color) ?? UNIT_MODELS[type].build(color);
}

/**
 * A building's Blender model (docs/model-spec.md): centered on its footprint at ground level, already turned and sized,
 * so it is drawn as it is. Without a loaded model (headless sims and the server, or a file that failed to load) the
 * building is an empty node.
 */
export function makeBuildingModel(type: BuildingType, faction: Faction, color: number): BuildingModel {
  const group = new THREE.Group();
  const model = cloneBuildingModel(type, faction, color);
  if (!model) return { group, spinner: null, level2: null, level3: null, smoke: [], muzzle: null };
  group.add(model);
  const level2 = model.getObjectByName('level2') ?? null;
  const level3 = model.getObjectByName('level3') ?? null;
  if (level2) level2.visible = false;
  if (level3) level3.visible = false;
  const smoke: THREE.Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith('smoke')) smoke.push(o); });
  const muzzle = model.getObjectByName('muzzle') ?? null;
  const spinner = model.getObjectByName('spinner') ?? null;
  // A spinner the game moves up and down (the Thumper's weight) bobs from where the model puts it.
  if (spinner) spinner.userData.y0 ??= spinner.position.y;
  return { group, spinner, level2, level3, smoke, muzzle };
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

/** Frees the geometry of a generated part group (materials are shared). */
export function disposeParts(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
