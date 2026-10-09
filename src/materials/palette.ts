import * as THREE from 'three';

/** Colors shared by the unit and building models. */
export const DARK = 0x3a3a3e;
export const METAL = 0x8a8a86;
export const SANDSTONE = 0xc9b48a;
export const CONCRETE = 0x9c968a;
export const OLIVE = 0x5d6234;
export const PLATE = 0x6c6a64;
/** Corrino trim: imperial gold, and the dark lacquer of their hulls. */
export const GOLD = 0xc8a040;
export const LACQUER = 0x2e2a30;

/** A color scaled brighter or darker. */
export function shade(color: number, f: number): number {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}
