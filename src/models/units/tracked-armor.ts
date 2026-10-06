import type * as THREE from 'three';
import { PLATE } from '../../materials/palette';
import { box } from '../parts';

/**
 * Armor upgrades shared by the tracked combat vehicles: side skirts over the tracks (tier 1), then reactive
 * armor blocks along them (tier 2). `len` is the hull length, `side` the skirt's distance from the center line.
 */
export function trackedArmor(body: THREE.Group, armor: number, trim: number, len: number, side: number): void {
  if (armor >= 1) {
    box(body, len, 0.28, 0.06, trim, 0, 0.42, side);
    box(body, len, 0.28, 0.06, trim, 0, 0.42, -side);
  }
  if (armor >= 2) {
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      box(body, 0.3, 0.16, 0.08, PLATE, x, 0.62, side + 0.04);
      box(body, 0.3, 0.16, 0.08, PLATE, x, 0.62, -side - 0.04);
    }
  }
}
