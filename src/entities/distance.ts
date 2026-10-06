import { TILE } from '../config';
import { Building } from './building';
import type { Entity } from './entity';

/** Edge-to-point distance: footprint edge for buildings, hull edge for units. */
export function distTo(e: Entity, x: number, z: number): number {
  if (e instanceof Building) {
    const half = (e.size * TILE) / 2;
    const dx = Math.max(Math.abs(x - e.x) - half, 0);
    const dz = Math.max(Math.abs(z - e.z) - half, 0);
    return Math.hypot(dx, dz);
  }
  return Math.max(0, Math.hypot(e.x - x, e.z - z) - e.radius);
}
