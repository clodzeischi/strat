import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, PLATE, ROBE } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Sandrider (placeholder): a Fedaykin with maker hooks across the back and a crysknife drawn. */
export const sandrider: UnitBlueprint = {
  build(color) {
    const body = fremenFigure(color, 0x4a3a2c);
    // Maker hooks: two long poles crossed on the back, hooked at the top.
    for (const s of [-1, 1]) {
      const pole = box(body, 0.04, 1.3, 0.04, DARK, -0.12, 0.95, s * 0.1);
      pole.rotation.x = s * 0.25;
      box(body, 0.12, 0.04, 0.04, METAL, -0.06, 1.58, s * 0.26);
    }
    box(body, 0.5, 0.06, 0.24, ROBE, -0.05, 0.98, 0); // rope coil
    // Crysknife: a milky curved blade in the right hand.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.03), mat(0xeae0c8));
    blade.position.set(0.3, 0.55, 0.15);
    blade.rotation.z = 0.3;
    body.add(blade);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.42, 0.6, 0.15);
    body.add(muzzle);
    body.scale.setScalar(1.35);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.4, 0.2, 0.38, PLATE, 0, 0.72, 0);
  },
};
