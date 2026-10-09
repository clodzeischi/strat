import * as THREE from 'three';
import { DARK, METAL, ROBE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Thumper: a spring-loaded stake on a tripod, drumming on the sand (its piston is the "spinner", bobbed by the game). */
export const thumper: BuildingBlueprint = {
  build(g, color) {
    for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const leg = cyl(g, 0.05, 1.6, ROBE, Math.cos(a) * 0.4, 1.0, Math.sin(a) * 0.4, 5);
      leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    }
    box(g, 0.3, 0.12, 0.3, color, 0, 1.75, 0);
    const piston = new THREE.Group();
    piston.position.y = 0.95;
    piston.userData.y0 = 0.95;
    cyl(piston, 0.09, 1.2, METAL, 0, 0, 0, 6);
    cyl(piston, 0.18, 0.2, DARK, 0, -0.55, 0, 8);
    g.add(piston);
    return piston;
  },
};
