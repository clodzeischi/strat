import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { GOLD, LACQUER, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Tleilaxu Research: a dark ziggurat lab with axolotl tanks glowing green beside it. */
export const tleilaxu: BuildingBlueprint = {
  build(g, color) {
    box(g, 4.2, 0.9, 4.2, SANDSTONE, 0, 0.75, -0.2);
    box(g, 3.2, 0.9, 3.2, LACQUER, 0, 1.65, -0.2);
    box(g, 2.0, 0.9, 2.0, color, 0, 2.55, -0.2);
    box(g, 2.04, 0.08, 2.04, GOLD, 0, 3.0, -0.2);
    const glow = mat(0x6cff9a);
    for (const [x, z] of [[2.0, 1.6], [-2.0, 1.6]]) {
      cyl(g, 0.38, 1.4, LACQUER, x, 1.0, z, 10);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), glow);
      tank.position.set(x, 1.1, z + 0.02);
      g.add(tank);
    }
    const spire = new THREE.Group();
    spire.position.set(0, 3.0, -0.2);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), glow);
    tip.position.y = 0.6;
    spire.add(tip);
    g.add(spire);
    return spire;
  },
};
