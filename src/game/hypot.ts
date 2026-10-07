/**
 * Distance helper for simulation code, in place of Math.hypot: browsers are allowed to round Math.hypot differently
 * in the last digit, which would make lockstep players drift apart, while a square root is exact everywhere.
 */
export function hypot(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
