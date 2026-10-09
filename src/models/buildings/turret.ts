import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Auto Turret: a squat plinth with a gun head that tracks its target (the head is the "spinner"). */
export const turret: BuildingBlueprint = {
  build(g, color) {
    box(g, 1.3, 0.6, 1.3, SANDSTONE, 0, 0.55, 0);
    cyl(g, 0.45, 0.3, LACQUER, 0, 1.0, 0, 8);
    const head = new THREE.Group();
    head.position.set(0, 1.25, 0);
    box(head, 0.7, 0.4, 0.6, color, 0, 0, 0);
    box(head, 0.72, 0.06, 0.62, GOLD, 0, 0.2, 0);
    for (const z of [-0.12, 0.12]) {
      const barrel = cyl(head, 0.05, 0.7, METAL, 0.65, 0, z, 6);
      barrel.rotation.z = Math.PI / 2;
    }
    box(head, 0.2, 0.2, 0.2, DARK, -0.4, 0, 0);
    g.add(head);
    return head;
  },
};
