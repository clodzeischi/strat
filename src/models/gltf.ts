import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { UNITS, type BuildingType, type Faction, type UnitType } from '../config';
import { laser } from './parts';
import type { AnimState, UnitAnimator, UnitModel, UpgradeLook } from './types';

/**
 * Blender-made models in src/public/models/ (see docs/model-spec.md), as `<kind>/<type>.<faction>`. Anything not
 * listed keeps its procedural model.
 */
const FILES = [
  'buildings/conyard.atreides', 'buildings/barracks.atreides', 'buildings/refinery.atreides', 'buildings/factory.atreides',
  'buildings/bunker.atreides', 'buildings/hitech.atreides',
  'buildings/conyard.corrino', 'buildings/refinery.corrino', 'buildings/barracks.corrino', 'buildings/fab.corrino', 'buildings/tleilaxu.corrino', 'buildings/pad.corrino', 'buildings/turret.corrino',
  'buildings/sietch.fremen', 'buildings/barracks.fremen', 'buildings/perch.fremen', 'buildings/bunker.fremen', 'buildings/camp.fremen',
  'units/harvester.atreides', 'units/harvester.corrino', 'units/razor.corrino', 'units/artillery.corrino', 'units/devastator.corrino', 'units/raider.corrino', 'units/trike.atreides', 'units/tank.atreides', 'units/rocket.atreides', 'units/repair.atreides', 'units/carryall.atreides',
  'units/infantry.atreides', 'units/trooper.corrino', 'units/sardaukar.corrino',
];

const scenes = new Map<string, THREE.Object3D>();
/** Infantry are modelled ~0.75 m tall (docs/model-spec.md) and drawn this much bigger, so they read on screen. */
const INFANTRY_SCALE = 1.6;
/** Animated (skinned) models' actions by name: `idle`, `walk`, `shoot`, `die`. */
const clips = new Map<string, THREE.AnimationClip[]>();
let paletteMat: THREE.MeshLambertMaterial | null = null;
const teamMats = new Map<number, THREE.MeshLambertMaterial>();

/** Loads the shared palette and every listed model. Call once before the first building or unit is made. */
export async function loadModels(): Promise<void> {
  const palette = await new THREE.TextureLoader().loadAsync('models/palette.png');
  palette.colorSpace = THREE.SRGBColorSpace;
  palette.magFilter = palette.minFilter = THREE.NearestFilter;
  palette.generateMipmaps = false;
  palette.flipY = false; // glTF UVs
  paletteMat = new THREE.MeshLambertMaterial({ map: palette, flatShading: true });
  // Shadows come from back faces by default, and models have their undersides deleted: cast from both sides.
  paletteMat.shadowSide = THREE.DoubleSide;
  const loader = new GLTFLoader();
  await Promise.all(
    FILES.map(async (f) => {
      try {
        const gltf = await loader.loadAsync(`models/${f}.glb`);
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          // Exported without normals; flat shading doesn't need them, but shadows' normal bias does.
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          o.userData.team = (o.material as THREE.Material).name === 'team';
          o.castShadow = true;
          o.receiveShadow = true;
          // Skinned parts move far from their rest pose (lying down when dying): cull them by a generous sphere.
          if (o instanceof THREE.SkinnedMesh) o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.9);
        });
        scenes.set(f, gltf.scene);
        if (gltf.animations.length) clips.set(f, gltf.animations);
      } catch (e) {
        console.warn(`model ${f} failed to load, using the procedural one`, e);
      }
    }),
  );
}

function teamMat(color: number): THREE.MeshLambertMaterial {
  let m = teamMats.get(color);
  if (!m) {
    m = paletteMat!.clone();
    m.color.setHex(color);
    teamMats.set(color, m);
  }
  return m;
}

/** Whether this building has a Blender model, which is drawn as it is: already turned, no squash. */
export function hasBuildingModel(type: BuildingType, faction: Faction): boolean {
  return scenes.has(`buildings/${type}.${faction}`);
}

/** Whether this unit has a Blender model. */
export function hasUnitModel(type: UnitType, faction: Faction): boolean {
  return scenes.has(`units/${type}.${faction}`);
}

/** A copy of a loaded model with team-colored parts, sharing geometry with every other copy. */
function cloneModel(key: string, color: number): THREE.Object3D | null {
  const src = scenes.get(key);
  if (!src) return null;
  // Skinned meshes need their own skeleton per copy; plain models share everything but transforms.
  const copy = clips.has(key) ? cloneSkinned(src) : src.clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = o.userData.team ? teamMat(color) : paletteMat!;
  });
  return copy;
}

export function cloneBuildingModel(type: BuildingType, faction: Faction, color: number): THREE.Object3D | null {
  return cloneModel(`buildings/${type}.${faction}`, color);
}

/**
 * A unit's Blender model, facing +X. Armor and weapon tiers (`armor0`-`armor2`, `weapons0`-`weapons2`) are whole
 * alternative parts on vehicles: exactly one of each set shows, the highest researched one the model has. On infantry
 * they're add-ons: every tier up to the researched one shows on top of `body`. One-step upgrades (`up_rockets`,
 * `up_nitro`, `up_harvest`) show once researched.
 * `laser` empties turn into fading laser-sight beams, shown with whatever part they belong to.
 */
export function cloneUnitModel(type: UnitType, faction: Faction, color: number): UnitModel | null {
  const model = cloneModel(`units/${type}.${faction}`, color);
  if (!model) return null;
  const body = new THREE.Group();
  const scale = UNITS[type].infantry ? INFANTRY_SCALE : 1;
  model.scale.setScalar(scale);
  body.add(model);
  // `laser` empties become the game's fading laser-sight beam along the empty's +X, `len` (custom property) long.
  // One hung on a bone (infantry) names the part it shows with in its `part` property.
  const lasers: THREE.Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith('laser')) lasers.push(o); });
  // Beams keep their length and thickness on scaled-up infantry.
  for (const l of lasers) laser(l, 0, 0, 0, (l.userData.len ?? 1) / scale, 0.025 / scale);
  const laserParts = lasers.filter((l) => l.userData.part).map((l) => ({ l, part: model.getObjectByName(l.userData.part) }));
  const turret = model.getObjectByName('turret') ?? null;
  const muzzle = model.getObjectByName('muzzle') ?? new THREE.Object3D();
  if (!muzzle.parent) (turret ?? body).add(muzzle);
  // A tier can be split across hull and turret (`armor1` on the hull, `armor1_turret` turning with the turret).
  const tiers = (prefix: string) => [0, 1, 2].map((i) => {
    const re = new RegExp(`^${prefix}${i}(_[a-z]+)?$`);
    const parts: THREE.Object3D[] = [];
    model.traverse((o) => { if (re.test(o.name)) parts.push(o); });
    return parts.length ? parts : null;
  });
  const armor = tiers('armor');
  const weapons = tiers('weapons');
  const extras = { rockets: model.getObjectByName('up_rockets'), nitro: model.getObjectByName('up_nitro'), harvest: model.getObjectByName('up_harvest') };
  const additive = UNITS[type].infantry;
  const pick = (set: (THREE.Object3D[] | null)[], level: number) => {
    let shown = -1;
    for (let i = 0; i <= level; i++) if (set[i]) shown = i;
    set.forEach((parts, i) => parts?.forEach((o) => { o.visible = additive ? i <= level : i === shown; }));
  };
  const showUpgrades = (look: UpgradeLook) => {
    pick(armor, look.armor);
    pick(weapons, look.weapons);
    for (const k of ['rockets', 'nitro', 'harvest'] as const) if (extras[k]) extras[k]!.visible = look[k];
    for (const { l, part } of laserParts) l.visible = part?.visible ?? true;
  };
  showUpgrades({ weapons: 0, armor: 0, rockets: false, nitro: false, harvest: false });
  const all = clips.get(`units/${type}.${faction}`) ?? [];
  const deployClip = all.find((c) => c.name === 'deploy');
  const actions = all.filter((c) => c !== deployClip);
  return {
    body, turret, muzzle, showUpgrades,
    crow: model.getObjectByName('crow') ?? undefined,
    muzzle2: model.getObjectByName('muzzle2') ?? undefined,
    wings: named(model, 'wing_'),
    jets: named(model, 'jet_'),
    anim: actions.length ? animator(model, actions) : undefined,
    deploy: deployClip ? deployPose(model, deployClip) : undefined,
    plant: deployClip ? plantOf(model) : undefined,
  };
}

/** The model's objects whose names start with `prefix`, in name order; undefined if there are none. */
function named(model: THREE.Object3D, prefix: string): THREE.Object3D[] | undefined {
  const found: THREE.Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith(prefix)) found.push(o); });
  return found.length ? found.sort((a, b) => a.name.localeCompare(b.name)) : undefined;
}

/** The `spade` empties on a deploying model's legs, and when they touch down (`plant` on `body`, 0-1). */
function plantOf(model: THREE.Object3D): UnitModel['plant'] {
  const spades: THREE.Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith('spade')) spades.push(o); });
  const at = model.getObjectByName('body')?.userData.plant;
  return spades.length && typeof at === 'number' ? { at, spades } : undefined;
}

/** A `deploy` action played as a slider: 0 is its first frame (mobile), 1 its last (dug in). */
function deployPose(model: THREE.Object3D, clip: THREE.AnimationClip): (t: number) => void {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  action.paused = true;
  let last = -1;
  const pose = (t: number) => {
    if (t === last) return;
    last = t;
    action.time = THREE.MathUtils.clamp(t, 0, 1) * clip.duration;
    mixer.update(0);
  };
  pose(0);
  return pose;
}

/** Plays a skinned model's actions: one looping state at a time, cross-faded, and a one-off death. */
function animator(model: THREE.Object3D, list: THREE.AnimationClip[]): UnitAnimator {
  const mixer = new THREE.AnimationMixer(model);
  const act = (name: string) => {
    const clip = list.find((c) => c.name === name);
    return clip ? mixer.clipAction(clip) : null;
  };
  const loops: Record<AnimState, THREE.AnimationAction | null> = { idle: act('idle'), walk: act('walk'), shoot: act('shoot') };
  const death = act('die');
  if (death) {
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
  }
  let state: AnimState = 'idle';
  let current = loops.idle;
  let dead = false;
  current?.play();
  // Spread the idles so a squad doesn't breathe in step.
  if (current) current.time = Math.random() * current.getClip().duration;
  return {
    set(next, fired, rate = 1) {
      const a = loops[next];
      // Once dying, nothing fades the death back out.
      if (!a || dead) return;
      a.timeScale = rate;
      if (next === state && !(fired && next === 'shoot')) return;
      a.reset().play();
      if (current && current !== a) current.crossFadeTo(a, 0.12, false);
      state = next;
      current = a;
    },
    update(dt) {
      mixer.update(dt);
    },
    die() {
      if (!death) return 0;
      dead = true;
      death.reset().play();
      if (current) current.crossFadeTo(death, 0.08, false);
      current = death;
      return death.getClip().duration;
    },
  };
}
