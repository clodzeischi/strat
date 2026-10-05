import { MAP_SIZE, SPICE_MAX, TILE } from './config';

export const SAND = 0;
export const ROCK = 1;
export const CLIFF = 2;
export const SPICE = 3;

export interface Cell {
  cx: number;
  cz: number;
}

function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
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

function fbm(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2, y * 2, seed + 1) * 0.3 + valueNoise(x * 4, y * 4, seed + 2) * 0.1);
}

/** Value at which `fraction` of the values are above it. */
function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export class GameMap {
  readonly size = MAP_SIZE;
  tiles = new Uint8Array(MAP_SIZE * MAP_SIZE);
  spice = new Float32Array(MAP_SIZE * MAP_SIZE);
  heights = new Float32Array(MAP_SIZE * MAP_SIZE);
  /** Building id occupying each cell, 0 if free. */
  occupied = new Int32Array(MAP_SIZE * MAP_SIZE);
  /** Base centers for team 0 and team 1. */
  bases: Cell[];
  /** Incremented whenever spice tiles change, so the minimap knows to redraw. */
  version = 0;

  constructor(seed = 7) {
    const N = this.size;
    this.bases = [{ cx: 10, cz: N - 11 }, { cx: N - 11, cz: 10 }];
    for (let attempt = 0; attempt < 20; attempt++) {
      if (this.generate(seed + attempt * 101)) break;
    }
  }

  idx(cx: number, cz: number): number {
    return cz * this.size + cx;
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.size && cz < this.size;
  }

  tile(cx: number, cz: number): number {
    return this.tiles[this.idx(cx, cz)];
  }

  /** Terrain passable and not covered by a building. */
  passable(cx: number, cz: number): boolean {
    if (!this.inBounds(cx, cz)) return false;
    const i = this.idx(cx, cz);
    return this.tiles[i] !== CLIFF && this.occupied[i] === 0;
  }

  cellOf(x: number): number {
    return Math.floor(x / TILE);
  }

  center(c: number): number {
    return (c + 0.5) * TILE;
  }

  heightAt(x: number, z: number): number {
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    if (!this.inBounds(cx, cz)) return 0;
    return this.heights[this.idx(cx, cz)];
  }

  worldSize(): number {
    return this.size * TILE;
  }

  /** Removes `amount` spice from a tile; returns how much was actually taken. */
  takeSpice(cx: number, cz: number, amount: number): number {
    const i = this.idx(cx, cz);
    if (this.tiles[i] !== SPICE) return 0;
    const taken = Math.min(amount, this.spice[i]);
    this.spice[i] -= taken;
    if (this.spice[i] <= 0.5) {
      this.spice[i] = 0;
      this.tiles[i] = SAND;
      this.heights[i] = 0;
    }
    this.version++;
    return taken;
  }

  /** Nearest cell that passes `ok`, searching rings outwards; ties broken by distance to (fx, fz). */
  nearestCell(cx: number, cz: number, ok: (cx: number, cz: number) => boolean, maxR = 12, fx = cx, fz = cz): Cell | null {
    if (ok(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxR; r++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!ok(x, z)) continue;
          const d = (x - fx) ** 2 + (z - fz) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { cx: x, cz: z };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  nearestPassable(cx: number, cz: number, fx = cx, fz = cz): Cell | null {
    return this.nearestCell(cx, cz, (x, z) => this.passable(x, z), 16, fx, fz);
  }

  private generate(seed: number): boolean {
    const N = this.size;
    const total = N * N;
    const h = new Array<number>(total);
    const s = new Array<number>(total);
    const baseDist = new Array<number>(total);

    // Point-symmetric noise so both bases get the same terrain.
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const mx = N - 1 - cx;
        const mz = N - 1 - cz;
        const i = this.idx(cx, cz);
        h[i] = (fbm(cx / 7, cz / 7, seed) + fbm(mx / 7, mz / 7, seed)) / 2;
        s[i] = (fbm(cx / 5 + 50, cz / 5 + 50, seed + 9) + fbm(mx / 5 + 50, mz / 5 + 50, seed + 9)) / 2;
        baseDist[i] = Math.min(...this.bases.map((b) => Math.hypot(cx - b.cx, cz - b.cz)));
      }
    }

    const cliffT = percentile(h, 0.08);
    const rockT = percentile(h, 0.2);
    for (let i = 0; i < total; i++) {
      const wobble = (h[i] - 0.5) * 6;
      let t = SAND;
      if (baseDist[i] < 8.5 + wobble) t = ROCK;
      else if (h[i] > cliffT) t = CLIFF;
      else if (h[i] > rockT) t = ROCK;
      this.tiles[i] = t;
    }

    // Spice in sandy areas away from bases.
    const sandSpice: number[] = [];
    for (let i = 0; i < total; i++) if (this.tiles[i] === SAND && baseDist[i] > 12) sandSpice.push(s[i]);
    const spiceT = percentile(sandSpice, 0.22);
    for (let i = 0; i < total; i++) {
      if (this.tiles[i] === SAND && baseDist[i] > 12 && s[i] > spiceT) {
        this.tiles[i] = SPICE;
        this.spice[i] = Math.min(SPICE_MAX, 200 + (s[i] - spiceT) * 3000);
      }
    }

    // A guaranteed spice field near each base, toward the map center.
    for (const b of this.bases) {
      const dirX = Math.sign(N / 2 - b.cx);
      const dirZ = Math.sign(N / 2 - b.cz);
      const fx = b.cx + dirX * 12;
      const fz = b.cz + dirZ * 3;
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = fx + dx;
          const z = fz + dz;
          if (!this.inBounds(x, z) || dx * dx + dz * dz > 16) continue;
          const i = this.idx(x, z);
          if (baseDist[i] < 9) continue;
          this.tiles[i] = SPICE;
          this.spice[i] = SPICE_MAX * (1 - Math.hypot(dx, dz) / 6);
        }
      }
    }

    // Connectivity: base 1 must be reachable from base 0; unreachable pockets become cliffs.
    const seen = new Uint8Array(total);
    const start = this.idx(this.bases[0].cx, this.bases[0].cz);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const cx = i % N;
      const cz = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cx + dx;
        const z = cz + dz;
        if (!this.inBounds(x, z)) continue;
        const j = this.idx(x, z);
        if (seen[j] || this.tiles[j] === CLIFF) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (!seen[this.idx(this.bases[1].cx, this.bases[1].cz)]) return false;
    for (let i = 0; i < total; i++) {
      if (!seen[i] && this.tiles[i] !== CLIFF) {
        this.tiles[i] = CLIFF;
        this.spice[i] = 0;
      }
    }

    for (let i = 0; i < total; i++) {
      const t = this.tiles[i];
      this.heights[i] = t === ROCK ? 0.3 : t === CLIFF ? 1.6 + hash(i, 3, seed) * 1.4 : t === SPICE ? 0.06 : 0;
    }
    return true;
  }
}
