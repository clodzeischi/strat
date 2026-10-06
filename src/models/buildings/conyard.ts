import * as THREE from 'three';
import { DARK, SANDSTONE } from '../../materials/palette';
import { box } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Construction Yard: main hall, side block and a turning crane; level 2 adds a command tower. */
export const conyard: BuildingBlueprint = {
  build(g, color) {
    box(g, 3.8, 1.6, 3.0, SANDSTONE, -0.6, 1.1, -0.9);
    box(g, 3.9, 0.25, 3.1, color, -0.6, 2.0, -0.9);
    box(g, 1.6, 1.0, 1.6, SANDSTONE, 1.5, 0.8, 1.2);
    const crane = new THREE.Group();
    crane.position.set(1.6, 0.3, -1.6);
    box(crane, 0.3, 4.0, 0.3, 0xe0b030, 0, 2.0, 0);
    box(crane, 3.4, 0.25, 0.25, 0xe0b030, 0.9, 3.9, 0);
    box(crane, 0.5, 0.4, 0.5, DARK, -0.7, 3.8, 0);
    box(crane, 0.05, 1.2, 0.05, DARK, 2.4, 3.2, 0);
    g.add(crane);
    return crane;
  },

  levelKit(g, color) {
    // Command tower with antenna and beacon.
    box(g, 1.4, 2.6, 1.4, SANDSTONE, -1.9, 1.6, 1.4);
    box(g, 1.5, 0.25, 1.5, color, -1.9, 2.95, 1.4);
    box(g, 0.08, 1.4, 0.08, DARK, -1.9, 3.75, 1.4);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5040 }));
    beacon.position.set(-1.9, 4.5, 1.4);
    g.add(beacon);
  },
};
