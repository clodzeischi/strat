import { SPICE_MAX, TILE } from './config';

export const SAND = 0;
export const ROCK = 1;
export const CLIFF = 2;
export const SPICE = 3;

/** Ramp kinds, stored per cell in `GameMap.ramp` (0 = not a ramp). */
export const NARROW = 1; // infantry only
export const NORMAL = 2; // vehicles in single file
export const LARGE = 3; // several vehicles side by side
export const RAMP_WIDTH: Record<number, number> = { [NARROW]: 1, [NORMAL]: 2, [LARGE]: 5 };

/** How high the high ground sits above the low ground: a low rise, not a wall, so units below can still shoot up. */
export const HIGH_Y = 1.1;

/** Infantry can use narrow ramps; vehicles can't. */
export type MoveClass = 'foot' | 'vehicle';

/** The four uphill directions a ramp can face, indexed by `GameMap.rampDir`. */
const DIR4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
  tiles: Uint8Array;
  spice: Float32Array;
  heights: Float32Array;
  /** 0 = low ground, 1 = high ground. Units only cross between levels on ramp cells. */
  level: Uint8Array;
  /** Ramp kind per cell (NARROW / NORMAL / LARGE), 0 if not a ramp. */
  ramp: Uint8Array;
  /** Uphill direction of each ramp cell, an index into DIR4. */
  rampDir: Uint8Array;
  /** Building id occupying each cell, 0 if free. */
  occupied: Int32Array;
  /** Base centers for team 0 and team 1. */
  bases: Cell[];
  /** Incremented whenever spice tiles change, so the minimap knows to redraw. */
  version = 0;

  /** `size` is tiles per side. */
  constructor(readonly size = 64, seed = 7) {
    const N = size;
    this.tiles = new Uint8Array(N * N);
    this.spice = new Float32Array(N * N);
    this.heights = new Float32Array(N * N);
    this.level = new Uint8Array(N * N);
    this.ramp = new Uint8Array(N * N);
    this.rampDir = new Uint8Array(N * N);
    this.occupied = new Int32Array(N * N);
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

  /** Cell is passable and open to this movement class (vehicles can't use narrow ramps). */
  canEnter(cx: number, cz: number, cls: MoveClass): boolean {
    return this.passable(cx, cz) && !(cls === 'vehicle' && this.ramp[this.idx(cx, cz)] === NARROW);
  }

  /** Whether two orthogonal neighbours are joined: same level, or one of them is a ramp. */
  private linked(a: number, b: number): boolean {
    return this.level[a] === this.level[b] || this.ramp[a] !== 0 || this.ramp[b] !== 0;
  }

  /** Whether a unit of this class can step from a cell to an adjacent one (diagonals may not cut corners). */
  canStep(ax: number, az: number, bx: number, bz: number, cls: MoveClass): boolean {
    if (!this.canEnter(bx, bz, cls)) return false;
    const a = this.idx(ax, az);
    const b = this.idx(bx, bz);
    if (ax === bx || az === bz) return this.linked(a, b);
    if (!this.canEnter(bx, az, cls) || !this.canEnter(ax, bz, cls)) return false;
    const c1 = this.idx(bx, az);
    const c2 = this.idx(ax, bz);
    return this.linked(a, c1) && this.linked(c1, b) && this.linked(a, c2) && this.linked(c2, b);
  }

  /** 0 on low ground, 1 on high ground, 0.5 on a ramp (which counts as neither for range bonuses). */
  levelAt(x: number, z: number): number {
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    if (!this.inBounds(cx, cz)) return 0;
    const i = this.idx(cx, cz);
    return this.ramp[i] ? 0.5 : this.level[i];
  }

  /** Ground heights at the bottom and top of a ramp cell. */
  rampEnds(cx: number, cz: number): { lo: number; hi: number; dir: [number, number] } {
    const dir = DIR4[this.rampDir[this.idx(cx, cz)]];
    const at = (x: number, z: number) => (this.inBounds(x, z) ? this.heights[this.idx(x, z)] : 0);
    return { lo: at(cx - dir[0], cz - dir[1]), hi: at(cx + dir[0], cz + dir[1]), dir };
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
    const i = this.idx(cx, cz);
    if (!this.ramp[i]) return this.heights[i];
    // Slope smoothly from the low end of the ramp to the high end.
    const { lo, hi, dir } = this.rampEnds(cx, cz);
    const fx = x / TILE - cx;
    const fz = z / TILE - cz;
    const t = dir[0] ? (dir[0] > 0 ? fx : 1 - fx) : dir[1] > 0 ? fz : 1 - fz;
    return lo + (hi - lo) * t;
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
      this.heights[i] = this.level[i] * HIGH_Y;
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
    const e = new Array<number>(total);
    const baseDist = new Array<number>(total);
    this.level.fill(0);
    this.ramp.fill(0);
    this.spice.fill(0);

    // Point-symmetric noise so both bases get the same terrain.
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const mx = N - 1 - cx;
        const mz = N - 1 - cz;
        const i = this.idx(cx, cz);
        h[i] = (fbm(cx / 7, cz / 7, seed) + fbm(mx / 7, mz / 7, seed)) / 2;
        s[i] = (fbm(cx / 5 + 50, cz / 5 + 50, seed + 9) + fbm(mx / 5 + 50, mz / 5 + 50, seed + 9)) / 2;
        e[i] = (fbm(cx / 11 + 100, cz / 11 + 100, seed + 21) + fbm(mx / 11 + 100, mz / 11 + 100, seed + 21)) / 2;
        baseDist[i] = Math.min(...this.bases.map((b) => Math.hypot(cx - b.cx, cz - b.cz)));
      }
    }

    // High ground: the top third of the elevation noise. Each base sits on one flat level.
    const highT = percentile(e, 0.33);
    for (let i = 0; i < total; i++) this.level[i] = e[i] > highT ? 1 : 0;
    for (const b of this.bases) {
      const lvl = this.level[this.idx(b.cx, b.cz)];
      for (let i = 0; i < total; i++) {
        if (Math.hypot((i % N) - b.cx, ((i / N) | 0) - b.cz) < 10) this.level[i] = lvl;
      }
    }
    this.removeSmallRegions(24);

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

    this.placeRamps(seed);

    // Connectivity: vehicles must be able to drive between the bases. Cells nobody can reach become
    // cliffs; spice that only infantry can reach (behind narrow ramps) is removed, since harvesters can't get to it.
    const start = this.bases[0];
    const byVehicle = this.flood(start.cx, start.cz, 'vehicle');
    if (!byVehicle[this.idx(this.bases[1].cx, this.bases[1].cz)]) return false;
    const byFoot = this.flood(start.cx, start.cz, 'foot');
    for (let i = 0; i < total; i++) {
      if (!byFoot[i] && this.tiles[i] !== CLIFF) {
        this.tiles[i] = CLIFF;
        this.ramp[i] = 0;
      }
      if (!byVehicle[i] && this.tiles[i] === SPICE) this.tiles[i] = SAND;
      if (this.tiles[i] !== SPICE) this.spice[i] = 0;
    }

    for (let i = 0; i < total; i++) {
      const t = this.tiles[i];
      const detail = t === ROCK ? 0.3 : t === CLIFF ? 1.6 + hash(i, 3, seed) * 1.4 : t === SPICE ? 0.06 : 0;
      this.heights[i] = this.ramp[i] ? HIGH_Y / 2 : this.level[i] * HIGH_Y + detail;
    }
    return true;
  }

  /** Cells reachable from a start cell for a movement class. */
  private flood(cx: number, cz: number, cls: MoveClass): Uint8Array {
    const N = this.size;
    const seen = new Uint8Array(N * N);
    const start = this.idx(cx, cz);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x0 = i % N;
      const z0 = (i / N) | 0;
      for (const [dx, dz] of DIR4) {
        const x = x0 + dx;
        const z = z0 + dz;
        if (!this.inBounds(x, z)) continue;
        const j = this.idx(x, z);
        if (seen[j] || !this.canStep(x0, z0, x, z, cls)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return seen;
  }

  /** Connected regions of one level (4-neighbour), as a label per cell and the cells of each label. */
  private regions(match: (i: number) => boolean): { label: Int32Array; cells: number[][] } {
    const N = this.size;
    const label = new Int32Array(N * N).fill(-1);
    const cells: number[][] = [];
    for (let s0 = 0; s0 < N * N; s0++) {
      if (label[s0] !== -1 || !match(s0)) continue;
      const id = cells.length;
      const list = [s0];
      label[s0] = id;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        for (const [dx, dz] of DIR4) {
          const x = (i % N) + dx;
          const z = ((i / N) | 0) + dz;
          if (!this.inBounds(x, z)) continue;
          const j = this.idx(x, z);
          if (label[j] === -1 && this.level[j] === this.level[i] && match(j)) {
            label[j] = id;
            list.push(j);
          }
        }
      }
      cells.push(list);
    }
    return { label, cells };
  }

  /** Flattens plateaus and fills pits smaller than `min` cells, so every level change is worth a ramp. */
  private removeSmallRegions(min: number): void {
    for (const lvl of [1, 0]) {
      const { cells } = this.regions((i) => this.level[i] === lvl);
      for (const list of cells) if (list.length < min) for (const i of list) this.level[i] = 1 - lvl;
    }
  }

  /**
   * Carves ramps into the edges of every plateau, in mirrored pairs so both sides get the same ones.
   * Ramps are spread around each plateau's edge; the first one always takes vehicles.
   */
  private placeRamps(seed: number): void {
    const N = this.size;
    const open = (i: number) => this.tiles[i] !== CLIFF;
    const mirror = (i: number) => this.idx(N - 1 - (i % N), N - 1 - ((i / N) | 0));
    const opposite = [1, 0, 3, 2];
    const { label, cells: plateaus } = this.regions((i) => this.level[i] === 1 && open(i));
    const placed: number[] = [];
    const near = (i: number, j: number, r: number) =>
      Math.max(Math.abs((i % N) - (j % N)), Math.abs(((i / N) | 0) - ((j / N) | 0))) <= r;

    // Edge cells: open high ground with open low ground next to it, in direction `down`.
    const edges = (plateau: number[]) => {
      const out: { i: number; down: number }[] = [];
      for (const i of plateau) {
        for (let d = 0; d < 4; d++) {
          const x = (i % N) + DIR4[d][0];
          const z = ((i / N) | 0) + DIR4[d][1];
          if (this.inBounds(x, z) && this.level[this.idx(x, z)] === 0 && open(this.idx(x, z))) out.push({ i, down: d });
        }
      }
      return out;
    };

    /** Flattens a strip across the edge into a clean slope: two rows of high ground, the ramp row, two rows of low ground. */
    const carve = (center: number, down: number, kind: number): boolean => {
      const width = RAMP_WIDTH[kind];
      const [dx, dz] = DIR4[down];
      const [px, pz] = dx ? [0, 1] : [1, 0]; // along the edge
      const x0 = center % N;
      const z0 = (center / N) | 0;
      const strip: { c: number; row: number }[] = []; // row -2..-1 high, 0 ramp, 1..2 low
      const from = -Math.floor((width - 1) / 2);
      for (let k = from; k < from + width; k++) {
        for (let row = -2; row <= 2; row++) {
          const x = x0 + px * k + dx * row;
          const z = z0 + pz * k + dz * row;
          if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) return false;
          strip.push({ c: this.idx(x, z), row });
        }
      }
      const cells = strip.map((s) => s.c);
      if (cells.some((c) => placed.some((p) => near(c, p, 5)) || cells.some((m) => near(c, mirror(m), 5)))) return false;
      for (const [copy, dir] of [[strip, down], [strip.map((s) => ({ c: mirror(s.c), row: s.row })), opposite[down]]] as const) {
        for (const { c, row } of copy) {
          if (this.tiles[c] === CLIFF) this.tiles[c] = row < 0 ? ROCK : SAND;
          this.level[c] = row <= 0 ? 1 : 0;
          if (row === 0) {
            this.ramp[c] = kind;
            this.rampDir[c] = opposite[dir]; // uphill points away from the low side
            if (this.tiles[c] === SPICE) this.tiles[c] = SAND;
          }
          placed.push(c);
        }
      }
      return true;
    };

    plateaus.forEach((plateau, id) => {
      const twin = label[mirror(plateau[0])];
      if (twin < id && twin !== -1) return; // its mirror twin already got (mirrored) ramps
      const self = twin === id; // a center plateau gets every ramp twice, once per side
      const edge = edges(plateau);
      if (!edge.length) return;
      // Walk the edge in angle order around the plateau's middle, so picks spread out.
      const mx = plateau.reduce((s, i) => s + (i % N), 0) / plateau.length;
      const mz = plateau.reduce((s, i) => s + ((i / N) | 0), 0) / plateau.length;
      edge.sort((a, b) => Math.atan2(((a.i / N) | 0) - mz, (a.i % N) - mx) - Math.atan2(((b.i / N) | 0) - mz, (b.i % N) - mx));
      const want = Math.max(1, Math.min(6, Math.round(edge.length / (self ? 40 : 20))));
      let made = 0;
      for (let k = 0; k < want; k++) {
        const first = made === 0;
        const roll = hash(plateau[0], 7 + k, seed);
        const kind = first || roll < 0.5 ? LARGE : roll < 0.8 ? NORMAL : NARROW;
        // Try spots around this ramp's share of the edge until one carves cleanly.
        const startAt = Math.floor(((k + hash(plateau[0], 31 + k, seed)) / want) * edge.length);
        for (let t = 0; t < edge.length; t += 3) {
          const e = edge[(startAt + t) % edge.length];
          if (carve(e.i, e.down, kind) || (first && carve(e.i, e.down, NORMAL))) {
            made++;
            break;
          }
        }
      }
      // No usable edge: flatten the plateau instead of leaving it sealed off.
      if (!made) for (const i of plateau) this.level[i] = this.level[mirror(i)] = 0;
    });
  }
}
