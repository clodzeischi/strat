import * as THREE from 'three';

const canopyMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide });
const lineMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3e });
const canopyGeo = new THREE.SphereGeometry(0.85, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.32);
const apexGeo = new THREE.SphereGeometry(0.86, 10, 2, 0, Math.PI * 2, 0, Math.PI * 0.1);
const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 3);
const apexMats = new Map<number, THREE.MeshLambertMaterial>();

/**
 * Parachute canopy with rigging, hanging over a paratrooper standing at the origin; `scale` 1 suits a trooper,
 * bigger for vehicles. Shared geometry: don't dispose.
 */
export function makeParachute(color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  const top = 1.5; // canopy rim height above the trooper's feet
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = top - 0.85 * Math.cos(Math.PI * 0.32);
  canopy.castShadow = true;
  g.add(canopy);
  let apexMat = apexMats.get(color);
  if (!apexMat) apexMats.set(color, (apexMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })));
  const apex = new THREE.Mesh(apexGeo, apexMat);
  apex.position.copy(canopy.position);
  g.add(apex);
  const rim = 0.85 * Math.sin(Math.PI * 0.32);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const from = new THREE.Vector3(0, 0.75, 0);
    const to = new THREE.Vector3(Math.cos(a) * rim, top, Math.sin(a) * rim);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.copy(from).add(to).multiplyScalar(0.5);
    line.scale.y = from.distanceTo(to);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(line);
  }
  return g;
}
