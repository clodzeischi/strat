import type * as THREE from 'three';

export interface UnitModel {
  body: THREE.Group;
  turret: THREE.Object3D | null;
  /** Local offset (in turret or body space) where projectiles spawn. */
  muzzle: THREE.Object3D;
  /** A remote weapon station on the turret that aims the secondary gun on its own (origin on its axis, facing +X). */
  crow?: THREE.Object3D;
  /** Where the secondary gun's shots start (on the `crow`). */
  muzzle2?: THREE.Object3D;
  /** Wasp-winged aircraft: wings hinged at their roots (origin on the hinge), which the game beats while hovering. */
  wings?: THREE.Object3D[];
  /** Jet nozzles (empties pointing back) that glow in fast flight. */
  jets?: THREE.Object3D[];
  /** Units that deploy: poses the model from 0 (mobile) to 1 (dug in). Drawing only. */
  deploy?: (t: number) => void;
  /** Units that deploy: where shots start once dug in, if not at `muzzle` (a Fremen Mortar's tube, not his pistol). */
  muzzleDeploy?: THREE.Object3D;
  /** Units that deploy: where their spades bite into the ground, and how far into the deploy (0-1) they do. */
  plant?: { at: number; spades: THREE.Object3D[] };
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
  /**
   * Units that deploy: how far set up (0 mobile, 1 set up). In between, the `deploy` action is held at that point;
   * set up, `idle` and `shoot` play as `idle_set` and `shoot_set` (the end of `deploy` if there's no `idle_set`).
   */
  deploy(t: number): void;
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
  /** Level-2 and level-3 structures, hidden until the upgrade. */
  level2: THREE.Object3D | null;
  level3: THREE.Object3D | null;
  /** Smokestack tops (`smoke` empties) that belch black smoke. */
  smoke: THREE.Object3D[];
  /** Where a gun emplacement's shots start (`muzzle` empty on the spinner), if the model has one. */
  muzzle: THREE.Object3D | null;
}
