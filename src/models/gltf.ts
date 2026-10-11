import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BuildingType, Faction, UnitType } from '../config';
import { laser } from './parts';
import type { UnitModel, UpgradeLook } from './types';

/**
 * Blender-made models in src/public/models/ (see docs/model-spec.md), as `<kind>/<type>.<faction>`. Anything not
 * listed keeps its procedural model.
 */
const FILES = [
  'buildings/conyard.atreides', 'buildings/barracks.atreides', 'buildings/refinery.atreides', 'buildings/factory.atreides',
  'buildings/bunker.atreides', 'buildings/hitech.atreides',
  'units/harvester.atreides', 'units/harvester.corrino', 'units/trike.atreides', 'units/tank.atreides', 'units/rocket.atreides', 'units/repair.atreides', 'units/carryall.atreides',
];

const scenes = new Map<string, THREE.Object3D>();
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
        });
        scenes.set(f, gltf.scene);
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

/** A copy of a loaded model with team-colored parts, sharing geometry with every other copy. */
function cloneModel(key: string, color: number): THREE.Object3D | null {
  const src = scenes.get(key);
  if (!src) return null;
  const copy = src.clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = o.userData.team ? teamMat(color) : paletteMat!;
  });
  return copy;
}

export function cloneBuildingModel(type: BuildingType, faction: Faction, color: number): THREE.Object3D | null {
  return cloneModel(`buildings/${type}.${faction}`, color);
}

/**
 * A unit's Blender model, facing +X. Armor and weapon tiers are whole alternative parts (`armor0`-`armor2`,
 * `weapons0`-`weapons2`): exactly one of each set shows, the highest researched one the model has. One-step upgrades
 * (`up_rockets`, `up_nitro`, `up_harvest`) show once researched.
 * `laser` empties turn into fading laser-sight beams, shown with whatever part they belong to.
 */
export function cloneUnitModel(type: UnitType, faction: Faction, color: number): UnitModel | null {
  const model = cloneModel(`units/${type}.${faction}`, color);
  if (!model) return null;
  const body = new THREE.Group();
  body.add(model);
  // `laser` empties become the game's fading laser-sight beam, pointing forward (+X), `len` (custom property) long.
  const lasers: THREE.Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith('laser')) lasers.push(o); });
  for (const l of lasers) laser(l.parent!, l.position.x, l.position.y, l.position.z, l.userData.len ?? 1);
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
  const pick = (set: (THREE.Object3D[] | null)[], level: number) => {
    let shown = -1;
    for (let i = 0; i <= level; i++) if (set[i]) shown = i;
    set.forEach((parts, i) => parts?.forEach((o) => { o.visible = i === shown; }));
  };
  const showUpgrades = (look: UpgradeLook) => {
    pick(armor, look.armor);
    pick(weapons, look.weapons);
    for (const k of ['rockets', 'nitro', 'harvest'] as const) if (extras[k]) extras[k]!.visible = look[k];
  };
  showUpgrades({ weapons: 0, armor: 0, rockets: false, nitro: false, harvest: false });
  return { body, turret, muzzle, showUpgrades };
}
