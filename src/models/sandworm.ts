import * as THREE from 'three';
import { mat } from '../materials/lambert';
import { TOOTH, WORM_HIDE, shade } from '../materials/palette';

/** How far under the ground the worm's maw sits while it travels (the body is drawn this far down). */
export const WORM_DEPTH = 10;

export interface SandwormModel {
  /** Moves with the worm, at ground level. */
  root: THREE.Group;
  /** The ringed body with its maw on top, rearing up out of the sand (raise it to bite, lower it out of sight). */
  body: THREE.Group;
  /** The ridge of sand pushed up over the worm while it travels underground: wormsign. */
  ridge: THREE.Mesh;
}

/**
 * The wild Sandworm a Thumper calls: a ringed column with a round maw full of teeth at the top, which bursts up out
 * of the sand to swallow what's above it, and a long mound of sand that shows where it is while it travels below.
 * The body's top (the maw) is at y = 0 of `body`; it rests WORM_DEPTH down, out of sight.
 */
export function makeSandworm(): SandwormModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const hide = mat(WORM_HIDE);
  const ring = mat(shade(WORM_HIDE, 0.72));
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    // Widest just under the maw, the rings below narrowing a little.
    const r = 2.0 - i * 0.06;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.06, 1.2, 16), i % 2 ? ring : hide);
    seg.position.y = -0.6 - i * 1.15;
    seg.castShadow = true;
    body.add(seg);
  }
  // The maw: a dark throat ringed by teeth, two rows of them pointing in.
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.08, 18), mat(0x3a120c));
  throat.position.y = 0.02;
  body.add(throat);
  const teeth = mat(TOOTH);
  for (const [n, r, len] of [[18, 1.8, 0.75], [12, 1.15, 0.5]] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r < 1.5 ? 0.13 : 0);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.12, len, 4), teeth);
      tooth.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
      // Leaning in over the throat.
      tooth.lookAt(0, 0.25 + len, 0);
      tooth.rotateX(Math.PI / 2);
      body.add(tooth);
    }
  }
  // Three lips around the maw, peeled back.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.1), hide);
    lip.position.set(Math.cos(a) * 2.1, 0.35, Math.sin(a) * 2.1);
    lip.rotation.y = -a;
    lip.rotateZ(0.7);
    lip.castShadow = true;
    body.add(lip);
  }
  body.position.y = -WORM_DEPTH;
  body.visible = false;
  root.add(body);
  // Wormsign: a long low mound of sand, stretched along the way it's heading (+X).
  const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), mat(0xc9ad7a));
  ridge.scale.set(3.2, 0.55, 1.4);
  ridge.position.y = -0.15;
  ridge.receiveShadow = true;
  root.add(ridge);
  return { root, body, ridge };
}
