import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, PLATE, STILLSUIT } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Fedaykin: a death commando in a dark robe, a weirding module (sonic projector) on the forearm. */
export const fedaykin: UnitBlueprint = {
  build(color) {
    const body = fremenFigure(color, 0x5c4a3a);
    const muzzle = new THREE.Object3D();
    box(body, 0.34, 0.16, 0.16, STILLSUIT, 0.2, 0.6, 0.15);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.06, 8), mat(0x9ad8ff));
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.39, 0.6, 0.15);
    body.add(lens);
    box(body, 0.04, 0.3, 0.04, DARK, -0.1, 1.1, -0.1); // stilltent pole
    muzzle.position.set(0.42, 0.6, 0.15);
    body.add(muzzle);
    body.scale.setScalar(1.35);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.4, 0.2, 0.38, PLATE, 0, 0.72, 0);
    if (look.weapons >= 1) box(body, 0.1, 0.1, 0.18, 0x9ad8ff, 0.3, 0.7, 0.15); // tuned resonator
  },
};
