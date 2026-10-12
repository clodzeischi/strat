import type * as THREE from 'three';

export interface UnitModel {
  body: THREE.Group;
  turret: THREE.Object3D | null;
  /** Local offset (in turret or body space) where projectiles spawn. */
  muzzle: THREE.Object3D;
  /** Units that deploy: poses the model from 0 (mobile) to 1 (dug in). Drawing only. */
  deploy?: (t: number) => void;
  /** Blender models: shows the parts for these upgrades (instead of building an upgrade kit). */
  showUpgrades?: (look: UpgradeLook) => void;
  /** Animated (skinned) models: plays their actions. Drawing only. */
  anim?: UnitAnimator;
}

/** The looping actions of an animated unit. */
export type AnimState = 'idle' | 'walk' | 'shoot';

export interface UnitAnimator {
  /** Plays a looping action (`rate` scales its speed); `fired` restarts `shoot` so each shot gets its kick. */
  set(state: AnimState, fired: boolean, rate?: number): void;
  /** Advances the animation by a drawn frame. */
  update(dt: number): void;
  /** Starts the death action; returns its length in seconds (0 without one). */
  die(): number;
}

/** Extra parts showing upgrades; `turret` parts follow the turret's rotation. */
export interface UpgradeKit {
  body: THREE.Group;
  turret: THREE.Group;
}

/** Which researched upgrades a unit should show. */
export interface UpgradeLook {
  weapons: number; // 0-2
  armor: number; // 0-2
  rockets: boolean;
  nitro: boolean;
  harvest: boolean;
}

/** One unit's model: built facing +X, plus the parts its upgrades add. */
export interface UnitBlueprint {
  build(color: number): UnitModel;
  kit(look: UpgradeLook, color: number, parts: UpgradeKit): void;
}

export interface BuildingModel {
  group: THREE.Group;
  /** Optional piece that spins slowly (crane, radar). */
  spinner: THREE.Object3D | null;
  /** Level-2 structure, hidden until the upgrade (Blender models only; procedural ones add a level kit). */
  level2: THREE.Object3D | null;
  /** Smokestack tops (`smoke` empties) that belch black smoke. */
  smoke: THREE.Object3D[];
  /** Where a gun emplacement's shots start (`muzzle` empty on the spinner), if the model has one. */
  muzzle: THREE.Object3D | null;
  /** A Blender model, drawn as it is: already turned, on a slab square to the map. Procedural ones get turned. */
  dropIn: boolean;
}

/**
 * One building's model, built on the shared concrete slab (centered on the footprint, front facing +Z).
 * `build` adds the structure and returns its spinning piece, if any; `levelKit` adds the level-2 structure.
 */
export interface BuildingBlueprint {
  /** Stands on the bare ground, with no concrete slab (Fremen camps out in the desert). */
  bare?: boolean;
  build(g: THREE.Group, color: number): THREE.Object3D | null;
  levelKit?(g: THREE.Group, color: number): void;
}
