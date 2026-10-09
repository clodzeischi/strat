import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

/** Razor: four-wheeled dune buggy with a roll cage and a flamethrower nozzle up front. */
export const razor: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 1.5, 0.28, 0.8, shade(color, 0.8), 0, 0.45, 0);
    box(body, 0.5, 0.06, 0.82, LACQUER, -0.1, 0.62, 0);
    for (const [x, z] of [[0.5, 0.48], [0.5, -0.48], [-0.5, 0.48], [-0.5, -0.48]]) {
      const w = cyl(body, 0.26, 0.22, DARK, x, 0.26, z, 7);
      w.rotation.x = Math.PI / 2;
    }
    // Roll cage.
    for (const z of [-0.32, 0.32]) box(body, 0.06, 0.45, 0.06, METAL, -0.2, 0.85, z);
    box(body, 0.06, 0.06, 0.7, METAL, -0.2, 1.08, 0);
    // Fuel tank and nozzle.
    cyl(body, 0.16, 0.5, GOLD, -0.6, 0.72, 0, 8).rotation.z = Math.PI / 2;
    box(body, 0.55, 0.1, 0.1, DARK, 0.6, 0.66, 0);
    muzzle.position.set(0.9, 0.66, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.1, 0.26, 0.7, PLATE, 0.78, 0.48, 0); // ram plate
    if (look.weapons >= 1) cyl(body, 0.09, 0.15, GOLD, 0.88, 0.66, 0, 6).rotation.z = Math.PI / 2;
  },
};
