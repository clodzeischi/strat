import * as THREE from 'three';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl, laser } from '../parts';
import type { UnitBlueprint } from '../types';
import { trackedArmor } from './tracked-armor';

/** Rocket launcher: tracked hull with a rotating, tilted launch pod. */
export const rocket: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 1.8, 0.4, 0.38, DARK, 0, 0.22, 0.5);
    box(body, 1.8, 0.4, 0.38, DARK, 0, 0.22, -0.5);
    box(body, 1.7, 0.35, 1.0, shade(color, 0.6), 0, 0.55, 0);
    box(body, 0.5, 0.4, 0.9, color, 0.6, 0.9, 0);
    const turret = new THREE.Group();
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
    return { body, turret, muzzle };
  },

  kit(look, color, { body, turret }) {
    trackedArmor(body, look.armor, shade(color, 0.8), 1.85, 0.71);
    if (look.armor >= 2) box(body, 0.1, 0.3, 0.8, PLATE, 0.87, 0.9, 0);
    if (look.weapons >= 1) box(turret, 0.5, 0.18, 0.5, DARK, -0.2, 0.25, 0); // ammo hopper
    if (look.weapons >= 2) {
      const dish = cyl(turret, 0.22, 0.04, METAL, -0.45, 0.95, 0, 10); // targeting dish
      dish.rotation.z = 0.4;
      laser(turret, 0.2, 0.75, 0.42, 0.9);
    }
  },
};
