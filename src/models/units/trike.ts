import * as THREE from 'three';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { flameMat } from '../../materials/upgrade-fx';
import { box, cyl, laser } from '../parts';
import type { UnitBlueprint } from '../types';

/** Three-wheeled raider with a machine gun. */
export const trike: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 1.3, 0.3, 0.55, color, 0, 0.45, 0);
    box(body, 0.4, 0.25, 0.4, shade(color, 0.6), -0.2, 0.7, 0);
    for (const [x, z] of [[0.55, 0], [-0.5, 0.42], [-0.5, -0.42]]) {
      const w = cyl(body, 0.28, 0.2, DARK, x, 0.28, z, 7);
      w.rotation.x = Math.PI / 2;
    }
    box(body, 0.7, 0.1, 0.1, DARK, 0.45, 0.72, 0);
    muzzle.position.set(0.8, 0.72, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    const trim = shade(color, 0.8);
    if (look.armor >= 1) box(body, 0.12, 0.3, 0.5, PLATE, 0.62, 0.55, 0); // front fairing
    if (look.armor >= 2) {
      box(body, 0.9, 0.22, 0.06, trim, -0.05, 0.45, 0.31);
      box(body, 0.9, 0.22, 0.06, trim, -0.05, 0.45, -0.31);
    }
    if (look.weapons >= 1) box(body, 0.6, 0.08, 0.08, DARK, 0.42, 0.72, 0.14); // second gun
    if (look.weapons >= 2) laser(body, 0.8, 0.82, 0.07, 0.7);
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
  },
};
