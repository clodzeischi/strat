// Tile and ramp kinds, and the shape of the ground they make.

export const SAND = 0;
export const ROCK = 1;
export const CLIFF = 2;
export const SPICE = 3;

/** Ramp kinds, stored per cell in `GameMap.ramp` (0 = not a ramp). */
export const NARROW = 1; // infantry only
export const NORMAL = 2; // vehicles in single file
export const LARGE = 3; // several vehicles side by side
export const RAMP_WIDTH: Record<number, number> = { [NARROW]: 1, [NORMAL]: 2, [LARGE]: 8 };

/** How high the high ground sits above the low ground: a low rise, not a wall, so units below can still shoot up. */
export const HIGH_Y = 1.1;

/** Vertices per tile edge in the smooth ground surface (the visual mesh, and what units ride on). */
export const SURFACE_RES = 4;

/** Infantry can use narrow ramps; vehicles can't. Sandworms only go on sand and spice (no rock, no ramps). */
export type MoveClass = 'foot' | 'vehicle' | 'worm';

/** A map tile by column and row. */
export interface Cell {
  cx: number;
  cz: number;
}
