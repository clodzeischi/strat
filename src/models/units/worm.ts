import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, TOOTH, WORM_HIDE, shade } from '../../materials/palette';
import { box } from '../parts';
import type { UnitBlueprint } from '../types';
import { fremenFigure } from './fremen-figure';

/**
 * Sandworm: a ringed body arching out of the sand, its round maw full of teeth facing +X, with a Fremen rider and a
 * team banner on its back. Half of it is below ground level, as if it swims through the dunes.
 */
export const worm: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const hide = mat(WORM_HIDE);
    const ring = mat(shade(WORM_HIDE, 0.75));
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const r = 1.05 - t * 0.55;
      const x = 1.1 - i * 0.75;
      // Half buried: an arch just behind the head, the rest sinking into the sand toward the tail.
      const y = -0.15 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.45 - t * 0.7;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.72, 12), i % 2 ? ring : hide);
      seg.rotation.z = Math.PI / 2;
      seg.position.set(x, y, 0);
      seg.castShadow = true;
      body.add(seg);
    }
    // The maw: a dark disc ringed by teeth.
    const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 14), mat(0x4a1810));
    maw.rotation.z = Math.PI / 2;
    maw.position.set(1.49, 0.25, 0);
    body.add(maw);
    const teeth = mat(TOOTH);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), teeth);
      tooth.position.set(1.5, 0.25 + Math.sin(a) * 0.7, Math.cos(a) * 0.7);
      tooth.rotation.set(a + Math.PI / 2, 0, 0);
      tooth.rotateX(0);
      body.add(tooth);
    }
    // Rider with maker hooks, and the banner.
    const rider = fremenFigure(color);
    rider.scale.setScalar(0.9);
    rider.position.set(0.2, 1.75, 0);
    body.add(rider);
    box(body, 0.04, 1.0, 0.04, DARK, -0.3, 2.1, -0.25);
    box(body, 0.04, 0.3, 0.5, color, -0.3, 2.45, -0.02);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(1.6, 0.4, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit() {},
};
