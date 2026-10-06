import * as THREE from 'three';

/** Laser sight beams: they fade out along their length via per-vertex alpha, additive so they read as light. */
export const laserMat = new THREE.MeshBasicMaterial({
  color: 0xff3a2a, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
/** The emitter dot at a laser's base. */
export const laserDotMat = new THREE.MeshBasicMaterial({ color: 0xff5a40, transparent: true, opacity: 0.9, depthWrite: false });
/** Nitro exhaust flames. */
export const flameMat = new THREE.MeshBasicMaterial({ color: 0x6cc8ff, transparent: true, opacity: 0.85, depthWrite: false });
