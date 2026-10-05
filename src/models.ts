import * as THREE from 'three';
import { TILE, type BuildingType, type UnitType } from './config';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

const DARK = 0x3a3a3e;
const METAL = 0x8a8a86;
const SANDSTONE = 0xc9b48a;
const CONCRETE = 0x9c968a;

function shade(color: number, f: number): number {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent: THREE.Object3D, r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export interface UnitModel {
  body: THREE.Group;
  turret: THREE.Group | null;
  /** Local offset (in turret or body space) where projectiles spawn. */
  muzzle: THREE.Object3D;
}

/** Unit models face +X. */
export function makeUnitModel(type: UnitType, color: number): UnitModel {
  const body = new THREE.Group();
  let turret: THREE.Group | null = null;
  const muzzle = new THREE.Object3D();
  const dark = shade(color, 0.6);

  switch (type) {
    case 'harvester': {
      box(body, 2.2, 0.45, 0.4, DARK, 0, 0.25, 0.55);
      box(body, 2.2, 0.45, 0.4, DARK, 0, 0.25, -0.55);
      box(body, 2.1, 0.35, 1.2, METAL, 0, 0.6, 0);
      box(body, 0.7, 0.65, 1.2, color, 0.75, 1.05, 0);
      box(body, 0.1, 0.3, 0.9, 0x223344, 1.11, 1.15, 0);
      box(body, 1.3, 0.8, 1.25, 0xd08a3a, -0.35, 1.15, 0);
      box(body, 0.25, 0.3, 1.3, METAL, 1.15, 0.45, 0);
      muzzle.position.set(1, 1, 0);
      body.add(muzzle);
      break;
    }
    case 'infantry': {
      box(body, 0.32, 0.55, 0.32, color, 0, 0.5, 0);
      box(body, 0.3, 0.25, 0.3, dark, 0, 0.12, 0);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(0xd8b38a));
      head.position.set(0, 0.9, 0);
      head.castShadow = true;
      body.add(head);
      box(body, 0.5, 0.08, 0.08, DARK, 0.25, 0.6, 0.12);
      muzzle.position.set(0.5, 0.6, 0.12);
      body.add(muzzle);
      body.scale.setScalar(1.3);
      break;
    }
    case 'trike': {
      box(body, 1.3, 0.3, 0.55, color, 0, 0.45, 0);
      box(body, 0.4, 0.25, 0.4, dark, -0.2, 0.7, 0);
      for (const [x, z] of [[0.55, 0], [-0.5, 0.42], [-0.5, -0.42]]) {
        const w = cyl(body, 0.28, 0.2, DARK, x, 0.28, z, 7);
        w.rotation.x = Math.PI / 2;
      }
      box(body, 0.7, 0.1, 0.1, DARK, 0.45, 0.72, 0);
      muzzle.position.set(0.8, 0.72, 0);
      body.add(muzzle);
      break;
    }
    case 'tank': {
      box(body, 2.0, 0.45, 0.42, DARK, 0, 0.25, 0.55);
      box(body, 2.0, 0.45, 0.42, DARK, 0, 0.25, -0.55);
      box(body, 1.8, 0.4, 1.1, dark, 0, 0.6, 0);
      turret = new THREE.Group();
      turret.position.set(-0.1, 0.8, 0);
      box(turret, 0.9, 0.38, 0.85, color, 0, 0.19, 0);
      const barrel = cyl(turret, 0.08, 1.2, METAL, 0.95, 0.22, 0, 6);
      barrel.rotation.z = Math.PI / 2;
      muzzle.position.set(1.55, 0.22, 0);
      turret.add(muzzle);
      body.add(turret);
      break;
    }
    case 'rocket': {
      box(body, 1.8, 0.4, 0.38, DARK, 0, 0.22, 0.5);
      box(body, 1.8, 0.4, 0.38, DARK, 0, 0.22, -0.5);
      box(body, 1.7, 0.35, 1.0, dark, 0, 0.55, 0);
      box(body, 0.5, 0.4, 0.9, color, 0.6, 0.9, 0);
      turret = new THREE.Group();
      turret.position.set(-0.3, 0.75, 0);
      const pod = new THREE.Group();
      pod.rotation.z = 0.45;
      box(pod, 1.1, 0.45, 0.8, color, 0.2, 0.25, 0);
      for (const z of [-0.2, 0.2]) {
        for (const y of [0.15, 0.35]) {
          const tube = cyl(pod, 0.08, 0.2, DARK, 0.78, y, z, 6);
          tube.rotation.z = Math.PI / 2;
        }
      }
      turret.add(pod);
      muzzle.position.set(0.7, 0.7, 0);
      turret.add(muzzle);
      body.add(turret);
      break;
    }
  }
  return { body, turret, muzzle };
}

export interface BuildingModel {
  group: THREE.Group;
  /** Optional piece that spins slowly (crane, radar). */
  spinner: THREE.Object3D | null;
}

/** Buildings are centered on their footprint; front faces +Z. */
export function makeBuildingModel(type: BuildingType, color: number, size: number): BuildingModel {
  const g = new THREE.Group();
  const w = size * TILE - 0.3;
  let spinner: THREE.Object3D | null = null;
  box(g, w, 0.3, w, CONCRETE, 0, 0.15, 0);
  // Team-colored trim on the slab edge.
  box(g, w + 0.05, 0.12, 0.2, color, 0, 0.3, w / 2 - 0.1);

  switch (type) {
    case 'conyard': {
      box(g, 3.8, 1.6, 3.0, SANDSTONE, -0.6, 1.1, -0.9);
      box(g, 3.9, 0.25, 3.1, color, -0.6, 2.0, -0.9);
      box(g, 1.6, 1.0, 1.6, SANDSTONE, 1.5, 0.8, 1.2);
      const crane = new THREE.Group();
      crane.position.set(1.6, 0.3, -1.6);
      box(crane, 0.3, 4.0, 0.3, 0xe0b030, 0, 2.0, 0);
      box(crane, 3.4, 0.25, 0.25, 0xe0b030, 0.9, 3.9, 0);
      box(crane, 0.5, 0.4, 0.5, DARK, -0.7, 3.8, 0);
      box(crane, 0.05, 1.2, 0.05, DARK, 2.4, 3.2, 0);
      g.add(crane);
      spinner = crane;
      break;
    }
    case 'refinery': {
      box(g, 3.0, 1.5, 2.4, SANDSTONE, -1.0, 1.05, -1.2);
      box(g, 3.1, 0.2, 2.5, color, -1.0, 1.9, -1.2);
      cyl(g, 0.75, 2.4, METAL, 1.6, 1.5, -1.5, 10);
      cyl(g, 0.78, 0.2, color, 1.6, 2.75, -1.5, 10);
      cyl(g, 0.6, 1.8, METAL, 1.7, 1.2, 0.2, 10);
      cyl(g, 0.63, 0.2, color, 1.7, 2.15, 0.2, 10);
      box(g, 2.2, 0.1, 2.0, 0x55524c, -0.2, 0.36, 1.6); // dock pad
      box(g, 0.2, 0.9, 1.6, DARK, -1.4, 0.75, 1.5);
      break;
    }
    case 'barracks': {
      box(g, 3.0, 1.3, 2.2, SANDSTONE, 0, 0.95, -0.4);
      box(g, 3.1, 0.2, 2.3, color, 0, 1.7, -0.4);
      box(g, 0.9, 0.9, 0.12, DARK, 0, 0.75, 0.72); // door
      // Sandbag walls flanking the entrance.
      box(g, 0.9, 0.35, 0.4, 0xa89060, -1.2, 0.48, 1.2);
      box(g, 0.9, 0.35, 0.4, 0xa89060, 1.2, 0.48, 1.2);
      // Flag.
      box(g, 0.08, 2.0, 0.08, DARK, 1.3, 2.7, -1.3);
      box(g, 0.7, 0.4, 0.04, color, 1.65, 3.45, -1.3);
      break;
    }
    case 'factory': {
      box(g, 5.0, 1.8, 3.8, SANDSTONE, 0, 1.2, -0.6);
      const roofGeo = new THREE.CylinderGeometry(2.2, 2.2, 5.0, 3);
      roofGeo.rotateX(-Math.PI / 2); // triangle peak points up
      roofGeo.rotateY(Math.PI / 2); // prism runs along X
      roofGeo.scale(1, 0.5, 1);
      const roof = new THREE.Mesh(roofGeo, mat(color));
      roof.position.set(0, 2.65, -0.6);
      roof.castShadow = true;
      g.add(roof);
      box(g, 2.2, 1.4, 0.15, DARK, 0, 1.0, 1.32); // door
      box(g, 0.4, 2.6, 0.4, METAL, -2.0, 1.6, 1.2);
      const radar = new THREE.Group();
      radar.position.set(2.0, 3.0, -1.8);
      box(radar, 0.15, 0.8, 0.15, METAL, 0, -0.3, 0);
      box(radar, 0.1, 0.5, 1.0, METAL, 0, 0.15, 0);
      g.add(radar);
      spinner = radar;
      break;
    }
  }
  return { group: g, spinner };
}
