import { DARK, SANDSTONE } from '../../materials/palette';
import { box } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Bunker: a low, thick-walled blockhouse with firing slits, sandbags and a team-colored roof band. */
export const bunker: BuildingBlueprint = {
  build(g, color) {
    box(g, 2.9, 1.0, 2.9, SANDSTONE, 0, 0.8, 0);
    box(g, 3.1, 0.25, 3.1, SANDSTONE, 0, 1.42, 0);
    box(g, 2.6, 0.12, 2.6, color, 0, 1.6, 0);
    // Firing slits on every side.
    for (const [x, z, w, d] of [[0, 1.46, 1.8, 0.08], [0, -1.46, 1.8, 0.08], [1.46, 0, 0.08, 1.8], [-1.46, 0, 0.08, 1.8]]) {
      box(g, w, 0.16, d, DARK, x, 1.05, z);
    }
    // Door and sandbags in front.
    box(g, 0.7, 0.6, 0.1, DARK, 0, 0.6, 1.47);
    box(g, 0.8, 0.3, 0.35, 0xa89060, -1.0, 0.45, 1.75);
    box(g, 0.8, 0.3, 0.35, 0xa89060, 1.0, 0.45, 1.75);
    return null;
  },
};
