import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BuildingType, Faction } from '../config';

/**
 * Blender-made models in src/public/models/ (see docs/model-spec.md), as `<kind>/<type>.<faction>`. Anything not
 * listed keeps its procedural model.
 */
const FILES = ['buildings/conyard.atreides'];

const scenes = new Map<string, THREE.Object3D>();
let paletteMat: THREE.MeshLambertMaterial | null = null;
const teamMats = new Map<number, THREE.MeshLambertMaterial>();

/** Loads the shared palette and every listed model. Call once before the first building is made. */
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
export function cloneBuildingModel(type: BuildingType, faction: Faction, color: number): THREE.Object3D | null {
  const src = scenes.get(`buildings/${type}.${faction}`);
  if (!src) return null;
  const copy = src.clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = o.userData.team ? teamMat(color) : paletteMat!;
  });
  return copy;
}
