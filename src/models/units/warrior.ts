import * as THREE from 'three';
import { DARK, PLATE } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Fremen Warrior: a robed fighter with a maula rifle and a crysknife at the belt. */
export const warrior: UnitBlueprint = {
  build(color) {
    const body = fremenFigure(color);
    const muzzle = new THREE.Object3D();
    box(body, 0.48, 0.07, 0.07, DARK, 0.24, 0.62, 0.13);
    box(body, 0.04, 0.16, 0.04, 0xe8e0c8, 0.1, 0.48, -0.19); // crysknife
    muzzle.position.set(0.48, 0.62, 0.13);
    body.add(muzzle);
    body.scale.setScalar(1.25);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.4, 0.2, 0.38, PLATE, 0, 0.72, 0); // scavenged chest plate
    if (look.weapons >= 1) box(body, 0.12, 0.07, 0.06, DARK, 0.2, 0.69, 0.13); // scope
  },
};
