// Deterministic noise and grid helpers for the map generator.

export function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2, y * 2, seed + 1) * 0.3 + valueNoise(x * 4, y * 4, seed + 2) * 0.1);
}

/** One pass of a 3x3 [1 2 1] blur over a square grid (edges clamped). */
export function blur(src: Float32Array, n: number): Float32Array {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const l = src[z * n + Math.max(0, x - 1)];
      const r = src[z * n + Math.min(n - 1, x + 1)];
      tmp[z * n + x] = (l + 2 * src[z * n + x] + r) / 4;
    }
  }
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const u = tmp[Math.max(0, z - 1) * n + x];
      const d = tmp[Math.min(n - 1, z + 1) * n + x];
      out[z * n + x] = (u + 2 * tmp[z * n + x] + d) / 4;
    }
  }
  return out;
}

/** Value at which `fraction` of the values are above it. */
export function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}
