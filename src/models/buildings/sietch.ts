import { DARK, ROBE, SANDSTONE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Sietch: a rock outcrop hollowed into a stronghold, a dark cave mouth at the front and banners on top. */
export const sietch: BuildingBlueprint = {
  build(g, color) {
    const rock = shade(SANDSTONE, 0.78);
    box(g, 4.4, 1.2, 3.6, rock, 0, 0.9, -0.5);
    box(g, 3.2, 1.0, 2.8, shade(rock, 0.9), -0.4, 1.9, -0.8);
    box(g, 1.8, 0.8, 1.6, rock, 0.6, 2.7, -1.0);
    box(g, 1.4, 1.0, 0.2, DARK, 0, 0.8, 1.28); // cave mouth
    box(g, 1.7, 0.2, 0.3, ROBE, 0, 1.4, 1.3); // door hanging
    box(g, 0.08, 1.4, 0.08, DARK, 1.4, 3.3, -1.2);
    box(g, 0.6, 0.35, 0.04, color, 1.72, 3.8, -1.2);
    box(g, 0.08, 1.0, 0.08, DARK, -1.6, 2.9, -0.4);
    box(g, 0.5, 0.3, 0.04, color, -1.33, 3.25, -0.4);
    cyl(g, 0.3, 0.5, ROBE, 1.6, 0.55, 1.2, 8); // water jars
    cyl(g, 0.25, 0.4, ROBE, 1.95, 0.5, 0.8, 8);
    return null;
  },

  /** Great Sietch: a windtrap tower beside the rock, catching water from the air. */
  levelKit(g, color) {
    cyl(g, 0.45, 3.0, SANDSTONE, -1.6, 1.8, 1.0, 8);
    for (let k = 0; k < 4; k++) box(g, 0.95, 0.12, 0.95, k % 2 ? DARK : color, -1.6, 0.9 + k * 0.7, 1.0);
    cyl(g, 0.6, 0.2, DARK, -1.6, 3.35, 1.0, 8);
  },
};
