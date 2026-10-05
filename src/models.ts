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

// ---- Upgrade visuals ---------------------------------------------------------

/** Which researched upgrades a unit should show. */
export interface UpgradeLook {
  weapons: number; // 0-2
  armor: number; // 0-2
  rockets: boolean;
  nitro: boolean;
  harvest: boolean;
}

// Beams fade out along their length via per-vertex alpha; additive so they read as light.
const laserMat = new THREE.MeshBasicMaterial({
  color: 0xff3a2a, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const laserDotMat = new THREE.MeshBasicMaterial({ color: 0xff5a40, transparent: true, opacity: 0.9, depthWrite: false });
const flameMat = new THREE.MeshBasicMaterial({ color: 0x6cc8ff, transparent: true, opacity: 0.85, depthWrite: false });
const OLIVE = 0x5d6234;
const PLATE = 0x6c6a64;

/** Short glowing beam pointing along +X from (x, y, z), fading to nothing at its tip. */
function laser(parent: THREE.Object3D, x: number, y: number, z: number, len: number, thick = 0.025): void {
  const geo = new THREE.BoxGeometry(len, thick, thick);
  const pos = geo.attributes.position;
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / len + 0.5; // 0 at the emitter, 1 at the tip
    rgba.set([1, 1, 1, 0.9 * (1 - t)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  const m = new THREE.Mesh(geo, laserMat);
  m.position.set(x + len / 2, y, z);
  parent.add(m);
  const dot = new THREE.Mesh(new THREE.BoxGeometry(thick * 2, thick * 2, thick * 2), laserDotMat);
  dot.position.set(x, y, z);
  parent.add(dot);
}

/**
 * Extra parts showing a unit's upgrades: armor plating, weapon accessories and laser sights,
 * rocket tubes, nitro exhausts and bigger hoppers. `turret` parts follow the turret's rotation.
 */
export function makeUpgradeKit(type: UnitType, look: UpgradeLook, color: number): { body: THREE.Group; turret: THREE.Group } {
  const body = new THREE.Group();
  const turret = new THREE.Group();
  const { weapons, armor } = look;
  const trim = shade(color, 0.8);

  switch (type) {
    case 'infantry': {
      if (look.rockets) {
        // Launch tube slung diagonally across the back.
        const tube = cyl(body, 0.07, 0.75, OLIVE, -0.2, 0.62, 0, 7);
        tube.rotation.x = 0.9;
        cyl(body, 0.08, 0.06, DARK, -0.2, 0.62 + Math.cos(0.9) * 0.36, Math.sin(0.9) * 0.36, 7).rotation.x = 0.9;
      }
      if (armor >= 1) {
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(OLIVE));
        helmet.position.set(0, 0.92, 0);
        helmet.castShadow = true;
        body.add(helmet);
      }
      if (armor >= 2) {
        box(body, 0.36, 0.3, 0.36, PLATE, 0, 0.62, 0); // flak vest
        box(body, 0.14, 0.08, 0.42, PLATE, 0, 0.8, 0); // shoulder pads
      }
      if (weapons >= 1) box(body, 0.12, 0.07, 0.06, DARK, 0.22, 0.67, 0.12); // scope
      if (weapons >= 2) laser(body, 0.52, 0.6, 0.12, 0.45, 0.02);
      break;
    }
    case 'trike': {
      if (armor >= 1) box(body, 0.12, 0.3, 0.5, PLATE, 0.62, 0.55, 0); // front fairing
      if (armor >= 2) {
        box(body, 0.9, 0.22, 0.06, trim, -0.05, 0.45, 0.31);
        box(body, 0.9, 0.22, 0.06, trim, -0.05, 0.45, -0.31);
      }
      if (weapons >= 1) box(body, 0.6, 0.08, 0.08, DARK, 0.42, 0.72, 0.14); // second gun
      if (weapons >= 2) laser(body, 0.8, 0.82, 0.07, 0.7);
      if (look.nitro) {
        for (const z of [-0.16, 0.16]) {
          const pipe = cyl(body, 0.06, 0.35, METAL, -0.75, 0.55, z, 6);
          pipe.rotation.z = Math.PI / 2;
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), flameMat);
          flame.rotation.z = Math.PI / 2; // tip points backward (-X)
          flame.position.set(-1.1, 0.55, z);
          body.add(flame);
        }
      }
      break;
    }
    case 'tank':
    case 'rocket': {
      const tank = type === 'tank';
      const len = tank ? 2.05 : 1.85;
      const side = tank ? 0.78 : 0.71;
      if (armor >= 1) {
        // Side skirts over the tracks.
        box(body, len, 0.28, 0.06, trim, 0, 0.42, side);
        box(body, len, 0.28, 0.06, trim, 0, 0.42, -side);
      }
      if (armor >= 2) {
        // Reactive armor blocks.
        for (const x of [-0.6, -0.2, 0.2, 0.6]) {
          box(body, 0.3, 0.16, 0.08, PLATE, x, 0.62, side + 0.04);
          box(body, 0.3, 0.16, 0.08, PLATE, x, 0.62, -side - 0.04);
        }
        if (tank) box(turret, 0.12, 0.34, 0.8, PLATE, 0.5, 0.19, 0);
        else box(body, 0.1, 0.3, 0.8, PLATE, 0.87, 0.9, 0);
      }
      if (tank) {
        if (weapons >= 1) cyl(turret, 0.12, 0.22, DARK, 1.45, 0.22, 0, 6).rotation.z = Math.PI / 2; // muzzle brake
        if (weapons >= 2) {
          box(turret, 0.25, 0.1, 0.1, DARK, 0.3, 0.42, 0.28); // laser rangefinder
          laser(turret, 0.43, 0.42, 0.28, 0.9);
        }
      } else {
        if (weapons >= 1) box(turret, 0.5, 0.18, 0.5, DARK, -0.2, 0.25, 0); // ammo hopper
        if (weapons >= 2) {
          const dish = cyl(turret, 0.22, 0.04, METAL, -0.45, 0.95, 0, 10); // targeting dish
          dish.rotation.z = 0.4;
          laser(turret, 0.2, 0.75, 0.42, 0.9);
        }
      }
      break;
    }
    case 'harvester': {
      if (look.harvest) {
        // Taller hopper with a ribbed extension.
        box(body, 1.35, 0.35, 1.3, 0xb87430, -0.35, 1.72, 0);
        for (const x of [-0.85, -0.35, 0.15]) box(body, 0.08, 0.38, 1.34, DARK, x, 1.72, 0);
        cyl(body, 0.08, 0.6, DARK, 0.95, 1.65, 0.4, 6); // exhaust stack
      }
      if (armor >= 1) {
        box(body, 2.25, 0.28, 0.06, trim, 0, 0.42, 0.78);
        box(body, 2.25, 0.28, 0.06, trim, 0, 0.42, -0.78);
      }
      if (armor >= 2) box(body, 0.12, 0.45, 1.1, PLATE, 1.17, 1.05, 0); // cab grille
      break;
    }
  }
  return { body, turret };
}

/** Extra structure added when a building reaches level 2. */
export function makeLevelKit(type: BuildingType, color: number): THREE.Group {
  const g = new THREE.Group();
  if (type === 'conyard') {
    // Command tower with antenna and beacon.
    box(g, 1.4, 2.6, 1.4, SANDSTONE, -1.9, 1.6, 1.4);
    box(g, 1.5, 0.25, 1.5, color, -1.9, 2.95, 1.4);
    box(g, 0.08, 1.4, 0.08, DARK, -1.9, 3.75, 1.4);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5040 }));
    beacon.position.set(-1.9, 4.5, 1.4);
    g.add(beacon);
  } else if (type === 'factory') {
    // Second assembly hall and smokestacks.
    box(g, 1.4, 1.2, 1.2, SANDSTONE, 2.0, 0.9, 1.9);
    box(g, 1.5, 0.2, 1.3, color, 2.0, 1.6, 1.9);
    cyl(g, 0.25, 2.4, METAL, -1.2, 3.2, -1.9, 8);
    cyl(g, 0.25, 2.0, METAL, -0.5, 3.0, -1.9, 8);
    cyl(g, 0.28, 0.15, color, -1.2, 4.4, -1.9, 8);
  }
  return g;
}

/** Frees the geometry of a generated part group (materials are shared). */
export function disposeParts(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
