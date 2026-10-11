import * as THREE from 'three';
import { BUILDINGS, FACTIONS, TEAM_COLORS, type Faction, type Team, type UnitType } from '../config';
import { hasBuildingModel, hasUnitModel, makeBuildingModel, makeUnitModel, type UpgradeLook } from '../models';
import { TO_SUN } from '../render/shadows';
import { setModelIcons, type IconKey } from './icons';

/** Rendered size in px: twice the card's 38 px slot, so icons stay sharp on high-DPI screens. */
const SIZE = 80;
/** Three-quarter view: lower than the game camera so small icons read from the side. Units face +X (right). */
const ELEVATION = THREE.MathUtils.degToRad(35);
const AZIMUTH = THREE.MathUtils.degToRad(30);
const BASE: UpgradeLook = { weapons: 0, armor: 0, rockets: false, nitro: false, harvest: false };

/** One-step upgrades shown as the unit wearing them; `azimuth` turns the view (the rocket tube is on the back). */
const UPGRADE_SHOTS: Partial<Record<IconKey, { unit: UnitType; look: Partial<UpgradeLook>; azimuth?: number }>> = {
  rockets: { unit: 'infantry', look: { rockets: true }, azimuth: THREE.MathUtils.degToRad(-125) },
  nitro: { unit: 'trike', look: { nitro: true } },
  harvest: { unit: 'harvester', look: { harvest: true } },
};

interface Shot {
  key: IconKey;
  make: () => THREE.Object3D;
  azimuth?: number;
}

/**
 * Card icons for everything the local player's faction has a Blender model for, rendered from those models in the
 * player's team color. Anything without a model keeps its drawn icon. Call once the models have loaded.
 */
export function renderModelIcons(faction: Faction, team: Team): void {
  const color = TEAM_COLORS[team];
  const f = FACTIONS[faction];
  const unit = (type: UnitType, look: Partial<UpgradeLook> = {}) => () => {
    const m = makeUnitModel(type, faction, color);
    m.showUpgrades?.({ ...BASE, ...look });
    m.anim?.update(0); // pose skinned models (idle) instead of their bind pose
    return m.body;
  };
  const shots: Shot[] = [];
  for (const t of f.train) if (t && hasUnitModel(t, faction)) shots.push({ key: t, make: unit(t) });
  for (const t of f.build) {
    if (t && hasBuildingModel(t, faction)) shots.push({ key: t, make: () => makeBuildingModel(t, faction, color, BUILDINGS[t].size).group });
  }
  for (const slot of f.research) {
    if (!slot) continue;
    if ('levelUp' in slot) {
      const t = slot.levelUp;
      if (!hasBuildingModel(t, faction)) continue;
      shots.push({
        key: `${t}2` as IconKey,
        make: () => {
          const m = makeBuildingModel(t, faction, color, BUILDINGS[t].size);
          if (m.level2) m.level2.visible = true;
          return m.group;
        },
      });
    } else {
      for (const u of slot.upgrades) {
        const s = UPGRADE_SHOTS[u];
        if (s && f.train.includes(s.unit) && hasUnitModel(s.unit, faction)) shots.push({ key: u, make: unit(s.unit, s.look), azimuth: s.azimuth });
      }
    }
  }
  if (!shots.length) return;

  // A throwaway renderer, so the game's own keeps its state; same lights and color handling as the game.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a48, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.position.copy(TO_SUN);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera();
  const urls = new Map<IconKey, string>();
  for (const s of shots) {
    const obj = s.make();
    scene.add(obj);
    frame(camera, obj, s.azimuth ?? AZIMUTH);
    renderer.render(scene, camera);
    urls.set(s.key, canvas.toDataURL('image/png'));
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  setModelIcons(urls);
}

const v = new THREE.Vector3();

/** Points the camera at the object from the icon angle and fits its visible parts snugly into the square. */
function frame(camera: THREE.OrthographicCamera, obj: THREE.Object3D, azimuth: number): void {
  obj.updateMatrixWorld(true);
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(azimuth) * Math.cos(ELEVATION));
  camera.position.copy(dir).multiplyScalar(50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  // Extents in view space of what will actually draw (hidden upgrade tiers and lasers don't count; skinning does).
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  obj.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
    }
  });
  const half = Math.max(max.x - min.x, max.y - min.y) / 2 * 1.08;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  camera.left = cx - half;
  camera.right = cx + half;
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.near = 1;
  camera.far = 100;
  camera.updateProjectionMatrix();
}
