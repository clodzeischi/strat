import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, GOLD, OLIVE, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

/** Harkonnen Trooper: a heavyset levy with a shoulder rocket launcher. */
export const trooper: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 0.36, 0.55, 0.36, shade(color, 0.75), 0, 0.5, 0);
    box(body, 0.34, 0.25, 0.34, DARK, 0, 0.12, 0);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(0xd8b38a));
    head.position.set(0, 0.9, 0);
    head.castShadow = true;
    body.add(head);
    box(body, 0.3, 0.12, 0.3, DARK, 0, 1.0, 0); // flat cap
    const tube = cyl(body, 0.08, 0.8, OLIVE, 0.1, 0.85, 0.2, 7);
    tube.rotation.z = Math.PI / 2;
    muzzle.position.set(0.5, 0.85, 0.2);
    body.add(muzzle);
    body.scale.setScalar(1.3);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.4, 0.3, 0.4, PLATE, 0, 0.62, 0); // breastplate
    if (look.weapons >= 1) box(body, 0.14, 0.12, 0.12, GOLD, -0.3, 0.85, 0.2); // reload pack
  },
};
