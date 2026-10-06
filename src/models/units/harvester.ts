import * as THREE from 'three';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

/** Tracked spice harvester with a cab up front and an orange hopper behind. */
export const harvester: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 2.2, 0.45, 0.4, DARK, 0, 0.25, 0.55);
    box(body, 2.2, 0.45, 0.4, DARK, 0, 0.25, -0.55);
    box(body, 2.1, 0.35, 1.2, METAL, 0, 0.6, 0);
    box(body, 0.7, 0.65, 1.2, color, 0.75, 1.05, 0);
    box(body, 0.1, 0.3, 0.9, 0x223344, 1.11, 1.15, 0);
    box(body, 1.3, 0.8, 1.25, 0xd08a3a, -0.35, 1.15, 0);
    box(body, 0.25, 0.3, 1.3, METAL, 1.15, 0.45, 0);
    muzzle.position.set(1, 1, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    const trim = shade(color, 0.8);
    if (look.harvest) {
      // Taller hopper with a ribbed extension.
      box(body, 1.35, 0.35, 1.3, 0xb87430, -0.35, 1.72, 0);
      for (const x of [-0.85, -0.35, 0.15]) box(body, 0.08, 0.38, 1.34, DARK, x, 1.72, 0);
      cyl(body, 0.08, 0.6, DARK, 0.95, 1.65, 0.4, 6); // exhaust stack
    }
    if (look.armor >= 1) {
      box(body, 2.25, 0.28, 0.06, trim, 0, 0.42, 0.78);
      box(body, 2.25, 0.28, 0.06, trim, 0, 0.42, -0.78);
    }
    if (look.armor >= 2) box(body, 0.12, 0.45, 1.1, PLATE, 1.17, 1.05, 0); // cab grille
  },
};
