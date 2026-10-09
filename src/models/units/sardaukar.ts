import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, GOLD, LACQUER, METAL } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';

/** Sardaukar: the Emperor's elite in dark armor with a gold-trimmed helmet, carbine and blade. */
export const sardaukar: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 0.4, 0.6, 0.38, LACQUER, 0, 0.52, 0);
    box(body, 0.42, 0.12, 0.4, color, 0, 0.7, 0); // sash
    box(body, 0.36, 0.25, 0.36, DARK, 0, 0.12, 0);
    const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(LACQUER));
    helmet.position.set(0, 0.95, 0);
    helmet.castShadow = true;
    body.add(helmet);
    box(body, 0.06, 0.08, 0.3, GOLD, 0.15, 0.97, 0); // visor
    box(body, 0.4, 0.08, 0.08, DARK, 0.25, 0.6, 0.15); // carbine
    box(body, 0.45, 0.04, 0.06, METAL, 0.25, 0.45, -0.22); // blade
    muzzle.position.set(0.45, 0.6, 0.15);
    body.add(muzzle);
    body.scale.setScalar(1.4);
    return { body, turret: null, muzzle };
  },

  kit(look, _color, { body }) {
    if (look.armor >= 1) box(body, 0.16, 0.1, 0.5, GOLD, 0, 0.84, 0); // pauldrons
    if (look.weapons >= 1) box(body, 0.12, 0.07, 0.06, GOLD, 0.2, 0.67, 0.15);
  },
};
