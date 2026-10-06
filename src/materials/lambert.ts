import * as THREE from 'three';

const cache = new Map<number, THREE.MeshLambertMaterial>();

/** Shared flat-shaded material per color, so every model part of one color uses the same material. */
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    cache.set(color, m);
  }
  return m;
}
