import * as THREE from 'three';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { flameMat } from '../../materials/upgrade-fx';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

export const SEAT_OFF = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
export const SEAT_ON = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
/** Seat lights on the spine, one per infantry space, named `seat0`..`seat5`; the troop pod is named `pod`. */
export const SEATS = 6;

/** Where lifted vehicles hang, below the hull (body space). */
export const CARRYALL_HOOK_Y = -0.95;

/** Heavy-lift aircraft: a long hull on two cross beams with four engine pods and cargo clamps underneath. */
export const carryall: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    box(body, 3.2, 0.45, 0.85, METAL, 0, 0, 0);
    box(body, 2.4, 0.08, 0.32, color, -0.2, 0.26, 0); // team stripe along the spine
    box(body, 0.7, 0.38, 0.7, shade(METAL, 0.85), 1.75, 0.05, 0);
    box(body, 0.12, 0.22, 0.6, 0x223344, 2.1, 0.1, 0); // canopy glass
    box(body, 0.55, 0.55, 0.08, color, -1.5, 0.45, 0); // tail fin
    for (const x of [0.85, -0.85]) {
      box(body, 0.3, 0.14, 3.1, PLATE, x, 0.05, 0); // cross beam
      for (const z of [-1.55, 1.55]) {
        const pod = cyl(body, 0.27, 0.95, DARK, x, 0.05, z, 8);
        pod.rotation.z = Math.PI / 2;
        box(body, 0.5, 0.1, 0.4, color, x + 0.1, 0.33, z);
        const glow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), flameMat);
        glow.rotation.z = Math.PI / 2; // tip points backward (-X)
        glow.position.set(x - 0.68, 0.05, z);
        body.add(glow);
      }
    }
    // Cargo clamps.
    for (const x of [0.7, -0.7]) {
      box(body, 0.12, 0.5, 0.12, DARK, x, -0.45, 0.35);
      box(body, 0.12, 0.5, 0.12, DARK, x, -0.45, -0.35);
    }
    // Seat lights along the spine, lit one per trooper aboard.
    for (let k = 0; k < SEATS; k++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), SEAT_OFF);
      seat.name = `seat${k}`;
      seat.position.set(0.85 - k * 0.34, 0.33, 0);
      body.add(seat);
    }
    // Troop pod slung between the clamps, wider than the hull so it shows from above; shown with infantry aboard.
    const pod = new THREE.Group();
    pod.name = 'pod';
    pod.visible = false;
    box(pod, 1.5, 0.5, 1.2, shade(METAL, 0.8), 0, -0.48, 0);
    box(pod, 1.55, 0.1, 1.25, color, 0, -0.26, 0);
    for (const z of [-0.61, 0.61]) for (const x of [-0.45, 0, 0.45]) box(pod, 0.22, 0.14, 0.03, 0x223344, x, -0.45, z);
    body.add(pod);
    muzzle.position.set(0, CARRYALL_HOOK_Y, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    if (look.armor >= 1) box(body, 1.6, 0.12, 0.95, shade(color, 0.8), 0.2, -0.27, 0); // belly plate
    if (look.armor >= 2) box(body, 0.12, 0.3, 0.75, PLATE, 2.12, -0.12, 0); // nose guard
  },
};
