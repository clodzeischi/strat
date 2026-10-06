import * as THREE from 'three';
import { mat } from '../materials/lambert';
import { laserDotMat, laserMat } from '../materials/upgrade-fx';

/** Adds a box part to `parent`, centered at (x, y, z). */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Adds an upright cylinder part to `parent`, centered at (x, y, z). */
export function cyl(parent: THREE.Object3D, r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Short glowing beam pointing along +X from (x, y, z), fading to nothing at its tip. */
export function laser(parent: THREE.Object3D, x: number, y: number, z: number, len: number, thick = 0.025): void {
  const geo = new THREE.BoxGeometry(len, thick, thick);
  const pos = geo.attributes.position;
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / len + 0.5; // 0 at the emitter, 1 at the tip
    rgba.set([1, 1, 1, 0.9 * (1 - t)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  const m = new THREE.Mesh(geo, laserMat);
  m.position.set(x + len / 2, y, z);
  parent.add(m);
  const dot = new THREE.Mesh(new THREE.BoxGeometry(thick * 2, thick * 2, thick * 2), laserDotMat);
  dot.position.set(x, y, z);
  parent.add(dot);
}
