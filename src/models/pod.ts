import * as THREE from 'three';
import { mat } from '../materials/lambert';
import { GOLD, LACQUER } from '../materials/palette';

const shellGeo = new THREE.CylinderGeometry(0.55, 0.42, 1.6, 8);
const noseGeo = new THREE.ConeGeometry(0.42, 0.6, 8);
const bandGeo = new THREE.CylinderGeometry(0.57, 0.57, 0.14, 8);
const flameGeo = new THREE.ConeGeometry(0.35, 1.4, 8);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.8 });

/**
 * Corrino drop pod around an infantryman standing at the origin: a dark capsule, nose down, with a team band and a
 * retro-rocket flame underneath. Shared geometry: don't dispose.
 */
export function makePod(color: number): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(shellGeo, mat(LACQUER));
  shell.position.y = 0.95;
  shell.castShadow = true;
  const nose = new THREE.Mesh(noseGeo, mat(LACQUER));
  nose.rotation.x = Math.PI;
  nose.position.y = -0.15 + 0.3;
  const band = new THREE.Mesh(bandGeo, mat(color));
  band.position.y = 1.4;
  const trim = new THREE.Mesh(bandGeo, mat(GOLD));
  trim.scale.set(0.9, 0.6, 0.9);
  trim.position.y = 1.78;
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -0.85;
  g.add(shell, nose, band, trim, flame);
  return g;
}
