import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { trackedArmor } from './tracked-armor';

/** Devastator: a wide, heavy tank with twin barrels and a reactor glowing at the back. */
export const devastator: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 2.6, 0.55, 0.55, DARK, 0, 0.3, 0.75);
    box(body, 2.6, 0.55, 0.55, DARK, 0, 0.3, -0.75);
    box(body, 2.4, 0.5, 1.5, shade(color, 0.55), 0, 0.75, 0);
    box(body, 0.6, 0.4, 0.9, LACQUER, -0.95, 1.15, 0);
    box(body, 0.2, 0.2, 0.5, 0x7cf0ff, -1.26, 1.15, 0); // reactor glow
    const turret = new THREE.Group();
    turret.position.set(0.1, 1.0, 0);
    box(turret, 1.3, 0.5, 1.2, color, 0, 0.25, 0);
    box(turret, 1.32, 0.08, 1.22, GOLD, 0, 0.5, 0);
    for (const z of [-0.2, 0.2]) {
      const barrel = cyl(turret, 0.09, 1.5, METAL, 1.35, 0.28, z, 6);
      barrel.rotation.z = Math.PI / 2;
    }
    muzzle.position.set(2.1, 0.28, 0);
    turret.add(muzzle);
    body.add(turret);
    return { body, turret, muzzle };
  },

  kit(look, color, { body, turret }) {
    trackedArmor(body, look.armor, shade(color, 0.8), 2.65, 1.06);
    if (look.armor >= 1) box(turret, 0.12, 0.44, 1.1, PLATE, 0.7, 0.25, 0);
    if (look.weapons >= 1) box(turret, 0.5, 0.16, 0.16, DARK, 0.3, 0.6, 0.35); // coaxial gun
  },
};
