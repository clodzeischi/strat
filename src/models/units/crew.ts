import * as THREE from 'three';
import { DARK, METAL } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Spice Crew: a spice hunter with a rolled stilltent and a sampling probe on the back. */
export const crew: UnitBlueprint = {
  build(color) {
    const body = fremenFigure(color, 0xb08a5a);
    const muzzle = new THREE.Object3D();
    const roll = cyl(body, 0.13, 0.42, 0xd88a3a, -0.24, 0.72, 0, 8);
    roll.rotation.x = Math.PI / 2;
    const probe = cyl(body, 0.03, 0.9, METAL, -0.22, 0.9, 0.12, 5);
    probe.rotation.z = 0.25;
    box(body, 0.12, 0.12, 0.12, DARK, -0.12, 1.32, 0.12);
    muzzle.position.set(0.2, 0.6, 0);
    body.add(muzzle);
    body.scale.setScalar(1.25);
    return { body, turret: null, muzzle };
  },

  kit() {},
};
