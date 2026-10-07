import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, PLATE, shade } from '../../materials/palette';
import { flameMat } from '../../materials/upgrade-fx';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';

export const SEAT_OFF = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
export const SEAT_ON = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
/** Seat lights on the spine, one per infantry space, named `seat0`..`seat5`; the troop pod is named `pod`. */
export const SEATS = 6;
/** The two wingtip engine nacelles, named `nacelle0` and `nacelle1`: rotation.z 0 points them forward, PI/2 up. */
export const NACELLES = ['nacelle0', 'nacelle1'];

/** Where lifted vehicles hang, below the hull (body space). */
export const CARRYALL_HOOK_Y = -0.95;

/**
 * Heavy-lift drone: a slender fuselage with a sensor ball under the nose (like an MQ-9), long straight wings, a V-tail,
 * tilting engine nacelles at the wingtips (like an Osprey, without the rotors) and cargo clamps underneath.
 */
export const carryall: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();

    // Fuselage along X, nose forward.
    const hull = cyl(body, 0.34, 3.4, METAL, 0, 0, 0, 10);
    hull.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(METAL));
    nose.scale.set(1.5, 1, 1);
    nose.position.set(1.7, 0, 0);
    nose.castShadow = true;
    body.add(nose);
    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 10), mat(METAL));
    tailCone.rotation.z = Math.PI / 2; // tip points backward (-X)
    tailCone.position.set(-2.1, 0, 0);
    tailCone.castShadow = true;
    body.add(tailCone);
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(DARK));
    sensor.position.set(1.55, -0.32, 0);
    body.add(sensor);
    box(body, 2.6, 0.06, 0.26, color, -0.2, 0.33, 0); // team stripe along the spine

    // Wings, straight and long, with team-colored tips.
    box(body, 0.62, 0.08, 4.2, PLATE, 0.15, 0.18, 0);
    for (const z of [-1.85, 1.85]) box(body, 0.64, 0.1, 0.5, color, 0.15, 0.19, z);

    // V-tail, plus a small fin underneath.
    for (const side of [-1, 1]) {
      const fin = box(body, 0.6, 0.85, 0.06, shade(METAL, 0.9), -1.95, 0.42, side * 0.28);
      fin.rotation.x = side * 0.75; // splayed outward
      box(fin, 0.62, 0.18, 0.08, color, 0, 0.32, 0);
    }
    box(body, 0.45, 0.35, 0.05, shade(METAL, 0.9), -1.95, -0.32, 0);

    // Tilting engine nacelles at the wingtips: an intake ring in team color and the exhaust glow behind.
    NACELLES.forEach((name, k) => {
      const n = new THREE.Group();
      n.name = name;
      n.position.set(0.15, 0.18, k ? 2.2 : -2.2);
      const pod = cyl(n, 0.24, 1.05, DARK, 0, 0, 0, 10);
      pod.rotation.z = Math.PI / 2;
      const ring = cyl(n, 0.27, 0.16, color, 0.5, 0, 0, 10);
      ring.rotation.z = Math.PI / 2;
      const glow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.45, 6), flameMat);
      glow.rotation.z = Math.PI / 2; // points out of the back of the nacelle
      glow.position.set(-0.72, 0, 0);
      n.add(glow);
      body.add(n);
    });

    // Cargo clamps.
    for (const x of [0.7, -0.7]) {
      box(body, 0.12, 0.5, 0.12, DARK, x, -0.45, 0.3);
      box(body, 0.12, 0.5, 0.12, DARK, x, -0.45, -0.3);
    }
    // Seat lights along the spine, lit one per trooper aboard.
    for (let k = 0; k < SEATS; k++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), SEAT_OFF);
      seat.name = `seat${k}`;
      seat.position.set(0.95 - k * 0.34, 0.37, 0);
      body.add(seat);
    }
    // Troop pod slung between the clamps, wider than the hull so it shows from above; shown with infantry aboard.
    const pod = new THREE.Group();
    pod.name = 'pod';
    pod.visible = false;
    box(pod, 1.5, 0.5, 1.2, shade(METAL, 0.8), 0, -0.55, 0);
    box(pod, 1.55, 0.1, 1.25, color, 0, -0.33, 0);
    for (const z of [-0.61, 0.61]) for (const x of [-0.45, 0, 0.45]) box(pod, 0.22, 0.14, 0.03, 0x223344, x, -0.52, z);
    body.add(pod);
    muzzle.position.set(0, CARRYALL_HOOK_Y, 0);
    body.add(muzzle);
    return { body, turret: null, muzzle };
  },

  kit(look, color, { body }) {
    if (look.armor >= 1) box(body, 1.6, 0.1, 0.7, shade(color, 0.8), 0.2, -0.36, 0); // belly plate
    if (look.armor >= 2) box(body, 0.3, 0.12, 4.3, PLATE, 0.42, 0.18, 0); // armored wing leading edge
  },
};
