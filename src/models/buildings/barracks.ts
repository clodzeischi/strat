import { DARK, SANDSTONE } from '../../materials/palette';
import { box } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Barracks: low hall with sandbag walls by the door and a team flag. */
export const barracks: BuildingBlueprint = {
  build(g, color) {
    box(g, 3.0, 1.3, 2.2, SANDSTONE, 0, 0.95, -0.4);
    box(g, 3.1, 0.2, 2.3, color, 0, 1.7, -0.4);
    box(g, 0.9, 0.9, 0.12, DARK, 0, 0.75, 0.72); // door
    // Sandbag walls flanking the entrance.
    box(g, 0.9, 0.35, 0.4, 0xa89060, -1.2, 0.48, 1.2);
    box(g, 0.9, 0.35, 0.4, 0xa89060, 1.2, 0.48, 1.2);
    // Flag.
    box(g, 0.08, 2.0, 0.08, DARK, 1.3, 2.7, -1.3);
    box(g, 0.7, 0.4, 0.04, color, 1.65, 3.45, -1.3);
    return null;
  },
};
