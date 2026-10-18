import { DARK, ROBE, SANDSTONE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Sietch: a rock outcrop hollowed into a stronghold, a dark cave mouth at the front and banners on top. */
export const sietch: BuildingBlueprint = {
  // A mountain brings its own rock base; a concrete slab under it would look wrong (Blender model too).
  bare: true,
  build(g, color) {
    const rock = shade(SANDSTONE, 0.78);
    box(g, 4.4, 1.5, 3.6, rock, 0, 0.75, -0.5); // bare: reaches down to the sand
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

  /** Great Sietch: a second outcrop with its own cave mouth and banner. Sietch III: a higher crag with a watch post. (Placeholders.) */
  levelKit(g, color, level) {
    if (level === 3) {
      const rock = shade(SANDSTONE, 0.7);
      box(g, 1.6, 1.4, 1.4, rock, -0.9, 3.0, -0.9);
      box(g, 1.0, 0.9, 0.9, shade(rock, 1.1), -0.9, 4.1, -0.9);
      box(g, 0.08, 1.2, 0.08, DARK, -0.9, 5.1, -0.9);
      box(g, 0.7, 0.4, 0.04, color, -0.53, 5.5, -0.9);
      return;
    }
    const rock = shade(SANDSTONE, 0.84);
    box(g, 1.5, 1.6, 1.8, rock, -1.6, 1.1, 0.4);
    box(g, 1.0, 0.6, 1.2, shade(rock, 0.9), -1.6, 2.2, 0.2);
    box(g, 0.7, 0.7, 0.12, DARK, -1.6, 0.7, 1.32); // second cave mouth
    box(g, 0.08, 1.0, 0.08, DARK, -1.9, 2.9, 0.2);
    box(g, 0.5, 0.3, 0.04, color, -1.63, 3.25, 0.2);
  },
};
