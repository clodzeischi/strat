import * as THREE from 'three';
import { DARK, PLATE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Death Commando: a runner with a satchel of explosives on the back and a lit fuse. */
export const commando: UnitBlueprint = {
  build(color) {
    const body = fremenFigure(color, 0x8a5a3a);
    const muzzle = new THREE.Object3D();
    for (const z of [-0.1, 0.1]) cyl(body, 0.09, 0.42, 0xb8402e, -0.24, 0.6, z, 7);
    box(body, 0.1, 0.36, 0.34, DARK, -0.2, 0.6, 0); // straps
    box(body, 0.05, 0.05, 0.05, 0xffd060, -0.24, 0.86, 0.1); // fuse
    muzzle.position.set(0.2, 0.5, 0);
    body.add(muzzle);
    body.scale.setScalar(1.25);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.4, 0.2, 0.38, PLATE, 0, 0.72, 0);
  },
};
