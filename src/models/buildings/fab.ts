import { mat } from '../../materials/lambert';
import * as THREE from 'three';
import { DARK, GOLD, LACQUER, METAL, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Fab: a domed imperial assembly hall with a landing deck for ornithopters; level 2 adds a heavy-armor bay. */
export const fab: BuildingBlueprint = {
  build(g, color) {
    box(g, 5.0, 1.6, 3.6, SANDSTONE, 0, 1.1, -0.7);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
    dome.position.set(-0.8, 1.9, -0.7);
    dome.castShadow = true;
    g.add(dome);
    box(g, 2.0, 0.15, 2.0, LACQUER, 1.5, 1.98, -0.9); // landing deck
    box(g, 1.8, 0.04, 0.1, GOLD, 1.5, 2.08, -0.9);
    box(g, 2.2, 1.3, 0.15, DARK, 0, 0.95, 1.12); // door
    box(g, 2.4, 0.15, 0.2, GOLD, 0, 1.7, 1.15);
    const beacon = new THREE.Group();
    beacon.position.set(-0.8, 3.5, -0.7);
    cyl(beacon, 0.06, 0.5, METAL, 0, 0, 0, 6);
    box(beacon, 0.6, 0.08, 0.08, GOLD, 0, 0.25, 0);
    g.add(beacon);
    return beacon;
  },

  levelKit(g, color) {
    box(g, 1.5, 1.3, 1.4, SANDSTONE, -2.0, 0.95, 1.8);
    box(g, 1.6, 0.2, 1.5, color, -2.0, 1.7, 1.8);
    box(g, 1.0, 0.8, 0.1, DARK, -2.0, 0.75, 2.52);
  },
};
