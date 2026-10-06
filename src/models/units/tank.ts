import * as THREE from 'three';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl, laser } from '../parts';
import type { UnitBlueprint } from '../types';
import { trackedArmor } from './tracked-armor';

/** Main battle tank with a rotating turret. */
export const tank: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 2.0, 0.45, 0.42, DARK, 0, 0.25, 0.55);
    box(body, 2.0, 0.45, 0.42, DARK, 0, 0.25, -0.55);
    box(body, 1.8, 0.4, 1.1, shade(color, 0.6), 0, 0.6, 0);
    const turret = new THREE.Group();
    turret.position.set(-0.1, 0.8, 0);
    box(turret, 0.9, 0.38, 0.85, color, 0, 0.19, 0);
    const barrel = cyl(turret, 0.08, 1.2, METAL, 0.95, 0.22, 0, 6);
    barrel.rotation.z = Math.PI / 2;
    muzzle.position.set(1.55, 0.22, 0);
    turret.add(muzzle);
    body.add(turret);
    return { body, turret, muzzle };
  },

  kit(look, color, { body, turret }) {
    trackedArmor(body, look.armor, shade(color, 0.8), 2.05, 0.78);
    if (look.armor >= 2) box(turret, 0.12, 0.34, 0.8, PLATE, 0.5, 0.19, 0);
    if (look.weapons >= 1) cyl(turret, 0.12, 0.22, DARK, 1.45, 0.22, 0, 6).rotation.z = Math.PI / 2; // muzzle brake
    if (look.weapons >= 2) {
      box(turret, 0.25, 0.1, 0.1, DARK, 0.3, 0.42, 0.28); // laser rangefinder
      laser(turret, 0.43, 0.42, 0.28, 0.9);
    }
  },
};
