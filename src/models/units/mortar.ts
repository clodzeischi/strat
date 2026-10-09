import * as THREE from 'three';
import { DARK, METAL, ROBE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/**
 * Fremen Mortar: a robed Fremen with a long rocket tube slung across his back and a pistol. Set up, he kneels and
 * swings the tube onto a bipod in front of him, pointing up over the dunes. Faces +X.
 */
export const mortar: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const figure = fremenFigure(color, shade(ROBE, 0.9));
    body.add(figure);
    // The tube on its pivot (at the shoulder, mobile); the bipod folds against it.
    const tube = new THREE.Group();
    tube.position.set(-0.12, 0.72, 0.12);
    const barrel = cyl(tube, 0.09, 1.25, METAL, 0, 0, 0, 8);
    barrel.rotation.z = Math.PI / 2;
    cyl(tube, 0.12, 0.18, DARK, -0.6, 0, 0, 8).rotation.z = Math.PI / 2; // breech
    box(tube, 0.08, 0.06, 0.2, color, 0.1, 0.1, 0); // team band
    const legs = new THREE.Group();
    legs.position.set(0.35, 0, 0);
    for (const side of [1, -1]) {
      const leg = box(legs, 0.03, 0.5, 0.03, DARK, 0, -0.25, side * 0.08);
      leg.rotation.x = side * 0.3;
    }
    tube.add(legs);
    body.add(tube);
    // The pistol at his belt.
    box(body, 0.18, 0.05, 0.05, DARK, 0.2, 0.48, -0.2);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.62, 0, 0);
    tube.add(muzzle);
    // Mobile (0): slung across the back, nearly level. Set up (1): kneeling, the tube out in front, angled up,
    // the bipod legs down to the sand.
    const deploy = (t: number) => {
      const k = t * t * (3 - 2 * t);
      figure.position.y = -0.14 * k;
      figure.scale.y = 1 - 0.12 * k;
      tube.position.set(-0.12 + 0.42 * k, 0.72 - 0.22 * k, 0.12 * (1 - k));
      tube.rotation.z = 0.15 + 0.6 * k;
      legs.rotation.z = -1.2 * (1 - k) - 0.75 * k;
      legs.scale.y = 0.4 + 0.6 * k;
    };
    deploy(0);
    return { body, turret: null, muzzle, deploy };
  },

  kit() {},
};
