import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, OLIVE, PLATE, shade } from '../../materials/palette';
import { box, cyl, laser } from '../parts';
import type { UnitBlueprint } from '../types';

/** Rifleman. */
export const infantry: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 0.32, 0.55, 0.32, color, 0, 0.5, 0);
    box(body, 0.3, 0.25, 0.3, shade(color, 0.6), 0, 0.12, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(0xd8b38a));
    head.position.set(0, 0.9, 0);
    head.castShadow = true;
    body.add(head);
    box(body, 0.5, 0.08, 0.08, DARK, 0.25, 0.6, 0.12);
    muzzle.position.set(0.5, 0.6, 0.12);
    body.add(muzzle);
    body.scale.setScalar(1.3);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.rockets) {
      // Launch tube slung diagonally across the back.
      const tube = cyl(body, 0.07, 0.75, OLIVE, -0.2, 0.62, 0, 7);
      tube.rotation.x = 0.9;
      cyl(body, 0.08, 0.06, DARK, -0.2, 0.62 + Math.cos(0.9) * 0.36, Math.sin(0.9) * 0.36, 7).rotation.x = 0.9;
    }
    if (look.armor >= 1) {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(OLIVE));
      helmet.position.set(0, 0.92, 0);
      helmet.castShadow = true;
      body.add(helmet);
    }
    if (look.armor >= 2) {
      box(body, 0.36, 0.3, 0.36, PLATE, 0, 0.62, 0); // flak vest
      box(body, 0.14, 0.08, 0.42, PLATE, 0, 0.8, 0); // shoulder pads
    }
    if (look.weapons >= 1) box(body, 0.12, 0.07, 0.06, DARK, 0.22, 0.67, 0.12); // scope
    if (look.weapons >= 2) laser(body, 0.52, 0.6, 0.12, 0.45, 0.02);
  },
};
