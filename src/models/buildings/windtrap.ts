import { DARK, ROBE, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Windtrap (Fremen): a banded tower that wrings water from the air, with a glider launch rail beside it. */
export const windtrap: BuildingBlueprint = {
  build(g, color) {
    cyl(g, 0.55, 3.4, SANDSTONE, -0.5, 1.9, -0.3, 8);
    for (let k = 0; k < 4; k++) box(g, 1.15, 0.14, 1.15, k % 2 ? DARK : color, -0.5, 0.9 + k * 0.8, -0.3);
    cyl(g, 0.75, 0.22, DARK, -0.5, 3.7, -0.3, 8);
    cyl(g, 0.35, 0.5, ROBE, 0.9, 0.55, 0.9, 8); // cistern
    // Launch rail: a ramp of poles and cloth sloping up to the side.
    box(g, 0.08, 1.5, 0.08, DARK, 1.2, 1.05, -1.0);
    box(g, 0.08, 0.8, 0.08, DARK, 1.2, 0.7, 0.2);
    box(g, 0.5, 0.06, 1.5, ROBE, 1.2, 1.4, -0.4);
    return null;
  },
};
