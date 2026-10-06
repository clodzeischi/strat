import { DARK, METAL, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Refinery: processing hall, two silos and the harvester dock pad in front. */
export const refinery: BuildingBlueprint = {
  build(g, color) {
    box(g, 3.0, 1.5, 2.4, SANDSTONE, -1.0, 1.05, -1.2);
    box(g, 3.1, 0.2, 2.5, color, -1.0, 1.9, -1.2);
    cyl(g, 0.75, 2.4, METAL, 1.6, 1.5, -1.5, 10);
    cyl(g, 0.78, 0.2, color, 1.6, 2.75, -1.5, 10);
    cyl(g, 0.6, 1.8, METAL, 1.7, 1.2, 0.2, 10);
    cyl(g, 0.63, 0.2, color, 1.7, 2.15, 0.2, 10);
    box(g, 2.2, 0.1, 2.0, 0x55524c, -0.2, 0.36, 1.6); // dock pad
    box(g, 0.2, 0.9, 1.6, DARK, -1.4, 0.75, 1.5);
    return null;
  },
};
