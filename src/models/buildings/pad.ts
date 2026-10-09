import { DARK, GOLD, LACQUER, METAL } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Repair Pad: a flat deck with corner lights and a crane arm reaching over it. */
export const pad: BuildingBlueprint = {
  build(g, color) {
    box(g, 3.3, 0.2, 3.3, LACQUER, 0, 0.4, 0);
    box(g, 2.6, 0.04, 0.12, GOLD, 0, 0.52, 0);
    box(g, 0.12, 0.04, 2.6, GOLD, 0, 0.52, 0);
    for (const [x, z] of [[1.45, 1.45], [-1.45, 1.45], [1.45, -1.45], [-1.45, -1.45]]) box(g, 0.2, 0.2, 0.2, color, x, 0.6, z);
    cyl(g, 0.15, 2.2, METAL, -1.4, 1.5, -1.4, 6);
    const arm = box(g, 2.0, 0.15, 0.15, METAL, -0.5, 2.55, -1.4);
    arm.rotation.y = -Math.PI / 4;
    box(g, 0.3, 0.3, 0.3, DARK, -0.1, 2.3, -0.9);
    return null;
  },
};
