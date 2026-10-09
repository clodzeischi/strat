import type * as THREE from 'three';

export interface UnitModel {
  body: THREE.Group;
  turret: THREE.Group | null;
  /** Local offset (in turret or body space) where projectiles spawn. */
  muzzle: THREE.Object3D;
  /** Units that deploy: poses the model from 0 (mobile) to 1 (dug in). Drawing only. */
  deploy?: (t: number) => void;
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
