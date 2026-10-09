import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, PLATE, shade } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';

/** Sky Raider: a light ornithopter with two pairs of swept wings and a rocket pod under the nose. */
export const raider: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 1.8, 0.4, 0.5, shade(color, 0.8), 0, 0, 0);
    box(body, 0.5, 0.3, 0.45, 0x223344, 0.75, 0.15, 0); // canopy
    box(body, 0.9, 0.12, 0.2, LACQUER, -1.2, 0.05, 0); // tail
    box(body, 0.3, 0.4, 0.06, color, -1.5, 0.25, 0);
    // Wings, swept back.
    for (const side of [-1, 1]) {
      for (const x of [0.25, -0.35]) {
        const wing = box(body, 0.35, 0.04, 1.6, METAL, x, 0.2, side * 1.0);
        wing.rotation.y = side * 0.25;
      }
    }
    box(body, 0.6, 0.18, 0.22, DARK, 0.5, -0.28, 0); // rocket pod
    box(body, 0.1, 0.06, 0.24, GOLD, 0.82, -0.28, 0);
    muzzle.position.set(0.9, -0.28, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 1.0, 0.08, 0.55, PLATE, 0, -0.24, 0); // belly plate
    if (look.weapons >= 1) for (const z of [-0.35, 0.35]) box(body, 0.5, 0.12, 0.12, DARK, 0.35, 0.05, z);
  },
};
