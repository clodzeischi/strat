import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, ROBE, shade } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/** Pale spice-cloth for the wing. */
const CLOTH = 0xe2d4b0;

/**
 * Wind Glider: a swept cloth wing on a light frame, wide and thin, with a Fremen rider lying along the keel and
 * holding the bar. Team-colored wingtips. Faces +X.
 */
export const glider: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    // The wing: a swept delta, nose at +X, trailing edge notched in the middle.
    const shape = new THREE.Shape();
    shape.moveTo(1.1, 0);
    shape.lineTo(-0.7, 1.9);
    shape.lineTo(-0.9, 1.75);
    shape.lineTo(-0.35, 0);
    shape.lineTo(-0.9, -1.75);
    shape.lineTo(-0.7, -1.9);
    shape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    // The shape is drawn in X/Y; lay it flat (Y becomes Z) and lift it over the rider.
    wingGeo.rotateX(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, mat(CLOTH));
    wing.position.y = 0.42;
    wing.castShadow = true;
    body.add(wing);
    // Ribs across the cloth, the keel, and the wingtips in team color.
    const rib = mat(shade(ROBE, 0.8));
    for (const side of [1, -1]) {
      const spar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.05), rib);
      spar.position.set(0.2, 0.47, side * 0.95);
      spar.rotation.y = side * 0.82;
      body.add(spar);
      box(body, 0.45, 0.05, 0.12, color, -0.72, 0.46, side * 1.78);
    }
    box(body, 2.0, 0.05, 0.06, METAL, 0.1, 0.4, 0);
    // The rider, lying prone under the keel, hands on the control bar.
    const rider = fremenFigure(color);
    rider.scale.setScalar(0.75);
    rider.rotation.z = -Math.PI / 2;
    rider.position.set(0.55, 0.1, 0);
    body.add(rider);
    box(body, 0.04, 0.32, 0.04, DARK, 0.5, 0.25, 0.22);
    box(body, 0.04, 0.32, 0.04, DARK, 0.5, 0.25, -0.22);
    box(body, 0.04, 0.04, 0.5, DARK, 0.5, 0.1, 0);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.8, 0.2, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit() {},
};
