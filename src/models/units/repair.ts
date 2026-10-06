import * as THREE from 'three';
import { DARK, METAL, PLATE, SANDSTONE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

const BEACON = new THREE.MeshBasicMaterial({ color: 0xffa020 });

/** Six-wheeled repair truck: cab up front, a crane arm with a welding head over a flatbed of parts. */
export const repair: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 1.9, 0.25, 0.95, DARK, 0, 0.4, 0);
    for (const x of [0.6, -0.1, -0.7]) {
      for (const z of [-0.5, 0.5]) {
        const w = cyl(body, 0.26, 0.2, DARK, x, 0.27, z, 8);
        w.rotation.x = Math.PI / 2;
      }
    }
    box(body, 0.6, 0.55, 0.9, color, 0.62, 0.8, 0);
    box(body, 0.08, 0.25, 0.75, 0x223344, 0.93, 0.88, 0);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), BEACON);
    beacon.position.set(0.6, 1.13, 0);
    body.add(beacon);
    // Flatbed with crates of parts.
    box(body, 1.2, 0.1, 0.92, METAL, -0.35, 0.58, 0);
    box(body, 0.4, 0.3, 0.35, SANDSTONE, -0.7, 0.78, 0.22);
    box(body, 0.35, 0.25, 0.3, shade(SANDSTONE, 0.8), -0.75, 0.75, -0.25);
    // Crane: post, boom angled forward over the cab, welding head.
    cyl(body, 0.1, 0.5, METAL, -0.2, 0.88, 0, 6);
    const boom = box(body, 1.3, 0.1, 0.1, color, 0.3, 1.32, 0);
    boom.rotation.z = -0.35;
    box(body, 0.12, 0.25, 0.12, PLATE, 0.92, 1.0, 0);
    muzzle.position.set(0.95, 0.85, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    if (look.armor >= 1) {
      box(body, 1.8, 0.22, 0.06, shade(color, 0.8), -0.05, 0.42, 0.5);
      box(body, 1.8, 0.22, 0.06, shade(color, 0.8), -0.05, 0.42, -0.5);
    }
    if (look.armor >= 2) box(body, 0.1, 0.35, 0.85, PLATE, 0.98, 0.6, 0); // bumper
  },
};
