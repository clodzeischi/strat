import * as THREE from 'three';

/** Health bars over units and buildings: a dark backing and a fill colored by remaining health. */
export const barGeo = new THREE.PlaneGeometry(1, 1);
barGeo.translate(0.5, 0, 0); // anchor on the left edge so scale.x shrinks toward the left
export const barBgMat = new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.8 });
export const barMats = {
  good: new THREE.MeshBasicMaterial({ color: 0x4cd04c, depthTest: false, transparent: true }),
  mid: new THREE.MeshBasicMaterial({ color: 0xe0c030, depthTest: false, transparent: true }),
  bad: new THREE.MeshBasicMaterial({ color: 0xe03a2a, depthTest: false, transparent: true }),
};
export const ringMats = [
  new THREE.MeshBasicMaterial({ color: 0x7cff7c, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0xff6a5a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
];
