import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, PLATE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { UnitBlueprint } from '../types';
import { trackedArmor } from './tracked-armor';

const ease = (t: number) => t * t * (3 - 2 * t);
/** The part of the 0-1 dig-in that falls between a and b, eased. */
const span = (t: number, a: number, b: number) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

/**
 * Soulcrusher: a self-propelled howitzer on a turntable. Digging in, like StarCraft's siege tank: four stabilizer
 * legs swing down and plant their spades, the hull settles onto them, then the barrel runs out and climbs to its
 * firing angle. Packing up plays it backward.
 */
export const artillery: UnitBlueprint = {
  build(color) {
    const body = new THREE.Group();
    const muzzle = new THREE.Object3D();
    // Tracks stay on the ground; everything else rides on the hull, which settles when dug in.
    box(body, 2.1, 0.42, 0.4, DARK, 0, 0.24, 0.58);
    box(body, 2.1, 0.42, 0.4, DARK, 0, 0.24, -0.58);
    const hull = new THREE.Group();
    body.add(hull);
    box(hull, 2.0, 0.4, 1.2, shade(color, 0.6), 0, 0.62, 0);
    box(hull, 0.4, 0.3, 0.3, LACQUER, -0.8, 0.95, 0.3); // ammo hatch

    // Stabilizer legs at the four corners: hinged at the hull's edge, folded up along it when mobile.
    const legs: THREE.Group[] = [];
    for (const [x, side] of [[0.75, 1], [-0.75, 1], [0.75, -1], [-0.75, -1]]) {
      const hinge = new THREE.Group();
      hinge.position.set(x, 0.62, side * 0.62);
      const leg = box(hinge, 0.14, 0.7, 0.14, METAL, 0, -0.35, 0);
      leg.castShadow = true;
      box(hinge, 0.34, 0.06, 0.3, DARK, 0, -0.7, 0); // spade
      hinge.userData.side = side;
      hull.add(hinge);
      legs.push(hinge);
    }

    // Turntable turret: casemate and barrel. The barrel hinges at the casemate front.
    const turret = new THREE.Group();
    turret.position.set(-0.2, 0.82, 0);
    box(turret, 1.1, 0.6, 1.0, color, -0.15, 0.3, 0);
    box(turret, 1.12, 0.07, 1.02, GOLD, -0.15, 0.62, 0);
    const mount = new THREE.Group(); // elevation
    mount.position.set(0.4, 0.38, 0);
    const slide = new THREE.Group(); // recoil sleeve that runs out when deploying
    const barrel = cyl(slide, 0.1, 1.6, METAL, 0.8, 0, 0, 6);
    barrel.rotation.z = Math.PI / 2;
    cyl(slide, 0.14, 0.3, DARK, 0.15, 0, 0, 6).rotation.z = Math.PI / 2; // breech collar
    muzzle.position.set(1.65, 0, 0);
    slide.add(muzzle);
    mount.add(slide);
    turret.add(mount);
    hull.add(turret);

    const deploy = (t: number) => {
      const legsDown = span(t, 0, 0.45);
      const settle = span(t, 0.35, 0.6);
      const runOut = span(t, 0.5, 0.75);
      const raise = span(t, 0.65, 1);
      for (const hinge of legs) {
        // Folded: lying along the hull, pointing up and outward. Down: splayed out to the ground.
        const side = hinge.userData.side as number;
        hinge.rotation.x = side * THREE.MathUtils.lerp(-2.6, -0.45, legsDown);
      }
      hull.position.y = -0.14 * settle;
      slide.position.x = THREE.MathUtils.lerp(-0.35, 0.15, runOut);
      mount.rotation.z = THREE.MathUtils.lerp(0.12, 0.7, raise);
    };
    deploy(0);
    return { body, turret, muzzle, deploy };
  },

  kit(look, color, { body, turret }) {
    trackedArmor(body, look.armor, shade(color, 0.8), 2.15, 0.82);
    if (look.armor >= 1) box(turret, 0.1, 0.5, 0.9, PLATE, 0.42, 0.3, 0); // gun shield
    if (look.weapons >= 1) box(turret, 0.35, 0.3, 0.5, DARK, -0.8, 0.35, 0); // autoloader
  },
};
