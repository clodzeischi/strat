import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { trackedArmor } from './tracked-armor';

/** Artillery: a self-propelled howitzer, long barrel raised over a boxy casemate. */
export const artillery: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 2.1, 0.42, 0.4, DARK, 0, 0.24, 0.58);
    box(body, 2.1, 0.42, 0.4, DARK, 0, 0.24, -0.58);
    box(body, 2.0, 0.4, 1.2, shade(color, 0.6), 0, 0.62, 0);
    box(body, 1.1, 0.6, 1.0, color, -0.35, 1.1, 0); // casemate
    box(body, 1.12, 0.07, 1.02, GOLD, -0.35, 1.42, 0);
    box(body, 0.4, 0.3, 0.3, LACQUER, -0.8, 1.55, 0.3); // ammo hatch
    const barrel = cyl(body, 0.1, 2.0, METAL, 0.85, 1.45, 0, 6);
    barrel.rotation.z = Math.PI / 2 - 0.3;
    muzzle.position.set(1.8, 1.75, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    trackedArmor(body, look.armor, shade(color, 0.8), 2.15, 0.82);
    if (look.armor >= 1) box(body, 0.1, 0.5, 0.9, PLATE, 0.22, 1.1, 0);
    if (look.weapons >= 1) cyl(body, 0.15, 0.25, DARK, 1.72, 1.72, 0, 6).rotation.z = Math.PI / 2 - 0.3;
  },
};
