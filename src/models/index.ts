import * as THREE from 'three';
import { TILE, type BuildingType, type Faction, type UnitType } from '../config';
import { CONCRETE } from '../materials/palette';
import { barracks } from './buildings/barracks';
import { bunker } from './buildings/bunker';
import { conyard } from './buildings/conyard';
import { factory } from './buildings/factory';
import { hitech } from './buildings/hitech';
import { windtrap } from './buildings/windtrap';
import { refinery } from './buildings/refinery';
import { fab } from './buildings/fab';
import { pad } from './buildings/pad';
import { tleilaxu } from './buildings/tleilaxu';
import { turret } from './buildings/turret';
import { camp } from './buildings/camp';
import { sietch } from './buildings/sietch';
import { thumper } from './buildings/thumper';
import { cloneBuildingModel, cloneUnitModel } from './gltf';
import { box } from './parts';
import type { BuildingBlueprint, BuildingModel, UnitBlueprint, UnitModel, UpgradeKit, UpgradeLook } from './types';
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
export { makeRiddenWorm, makeSandworm, WORM_DEPTH, type RiddenWormModel, type SandwormModel } from './sandworm';
export { CARRYALL_HOOK_Y, NACELLES, SEATS, SEAT_OFF, SEAT_ON } from './units/carryall';

const UNIT_MODELS: Record<UnitType, UnitBlueprint> = {
  harvester, infantry, trike, tank, rocket, repair, carryall, trooper, sardaukar, razor, devastator, raider, artillery,
  warrior, fedaykin, crew, glider, mortar, sandrider,
};
const BUILDING_MODELS: Record<BuildingType, BuildingBlueprint> = {
  conyard, refinery, barracks, bunker, factory, hitech, fab, tleilaxu, pad, turret, sietch, windtrap, thumper, camp,
};

/** Unit models face +X. A faction's Blender model replaces the procedural one when it has been loaded. */
export function makeUnitModel(type: UnitType, faction: Faction, color: number): UnitModel {
  return cloneUnitModel(type, faction, color) ?? UNIT_MODELS[type].build(color);
}

/**
 * Buildings are centered on their footprint, standing on a concrete slab; front faces +Z. Team color is on the
 * structure. A faction's Blender model replaces the procedural one when it has been loaded.
 */
export function makeBuildingModel(type: BuildingType, faction: Faction, color: number, size: number): BuildingModel {
  const group = new THREE.Group();
  const w = size * TILE - 0.3;
  const model = cloneBuildingModel(type, faction, color);
  // A Blender model that brings its own ground (a `bare` custom property on `body`) stands without a slab.
  const bare = model ? !!model.getObjectByName('body')?.userData.bare : BUILDING_MODELS[type].bare;
  if (!bare) box(group, w, 0.3, w, CONCRETE, 0, 0.15, 0);
  if (model) {
    group.add(model);
    const level2 = model.getObjectByName('level2') ?? null;
    const level3 = model.getObjectByName('level3') ?? null;
    if (level2) level2.visible = false;
    if (level3) level3.visible = false;
    const smoke: THREE.Object3D[] = [];
    model.traverse((o) => { if (o.name.startsWith('smoke')) smoke.push(o); });
    const muzzle = model.getObjectByName('muzzle') ?? null;
    return { group, spinner: model.getObjectByName('spinner') ?? null, level2, level3, smoke, muzzle, dropIn: true };
  }
  const spinner = BUILDING_MODELS[type].build(group, color);
  return { group, spinner, level2: null, level3: null, smoke: [], muzzle: null, dropIn: false };
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

/** Extra structure added when a building reaches a level (2, or 3 for the Sietch). */
export function makeLevelKit(type: BuildingType, color: number, level: number): THREE.Group {
  const g = new THREE.Group();
  BUILDING_MODELS[type].levelKit?.(g, color, level);
  return g;
}

/** Frees the geometry of a generated part group (materials are shared). */
export function disposeParts(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
