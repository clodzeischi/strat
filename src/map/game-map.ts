import { MAP_SPOTS, SPICE_FIELDS, TILE, type FieldKind, type MapSize } from '../config';
import { blur, fbm, hash, percentile, valueNoise } from './noise';
import { CLIFF, HIGH_Y, LARGE, NARROW, NORMAL, RAMP_WIDTH, ROCK, SAND, SPICE, SURFACE_RES, type Cell, type MoveClass } from './tiles';
import { hypot } from '../game/hypot';
import * as dm from '../game/dmath';

// Generator tuning.

/** Plateaus get one ramp per this many edge cells (edge cells count once per open side). */
const RAMP_EVERY = 6;
/** Minimum gap in tiles between two ramps' carved strips. */
const RAMP_GAP = 1;
/** Rock areas with at least this many rock tiles stand as raised shelves. */
const SHELF_MIN = 50;
/** One desert mesa per half this many map tiles (2 on the 64 map, 8 on the 128), in sets copied by symmetry. */
const MESA_AREA = 4000;
/** Share of a rock shelf's edge left as cliff, as a range: one unbroken stretch, the rest opened up by ramps. */
const SHELF_CLIFF = [0.3, 0.45];

/** Terrain noise feature size in tiles: bigger is calmer, fewer and larger formations. */
const TERRAIN_SCALE = 11;
/** Share of the map that's rock formations, and of that the outcrops (impassable) in their highest parts. */
const ROCK_SHARE = 0.09;
const CLIFF_SHARE = 0.03;
/** Rock formations smaller than this many tiles are cleared to sand. */
const FORMATION_MIN = 40;
/** Chance of a massif in the middle of the map, and its radius as a share of the map width. */
const MASSIF_CHANCE = 0.5;
const MASSIF_RADIUS = 0.085;
/** Home fields lie this many degrees off the line from the spot toward the middle. */
const HOME_SIDE = 28;

/** Tiles of open sand kept between two spice fields. */
const FIELD_GAP = 5;

/** Tiles kept between a base center and the map edge. */
const BASE_MARGIN = 10;
/** Radius in tiles of the rock a base stands on (before the outline's wobble). */
const BASE_RADIUS = 9.1;

/**
 * A symmetry of the square map about its middle: (x, z) offsets from the middle go to (xx x + xz z, zx x + zz z).
 * Rotations and mirror images only, so cells land exactly on cells.
 */
interface Sym {
  xx: number;
  xz: number;
  zx: number;
  zz: number;
}
const ROTATIONS: Sym[] = [
  { xx: 1, xz: 0, zx: 0, zz: 1 },
  { xx: 0, xz: -1, zx: 1, zz: 0 },
  { xx: -1, xz: 0, zx: 0, zz: -1 },
  { xx: 0, xz: 1, zx: -1, zz: 0 },
];
const MIRRORS: Sym[] = ROTATIONS.map((r) => ({ xx: r.xz, xz: r.xx, zx: r.zz, zz: r.zx }));
/**
 * The map's symmetries by spawn spot count, which spot 0 is carried to every other spot by: a half turn for 2, the
 * quarter turns for 4, and those plus mirror images for 8. Every spot sees the same terrain around it.
 */
const SYMMETRIES: Record<number, Sym[]> = {
  2: [ROTATIONS[0], ROTATIONS[2]],
  4: ROTATIONS,
  8: [...ROTATIONS, ...MIRRORS],
};

/** The sum of some numbers, added smallest first (the same however they came). */
function sumSorted(values: number[]): number {
  return values.sort((a, b) => a - b).reduce((t, v) => t + v, 0);
}

/** Spawn spots on a map of this size (MAP_SPOTS; other sizes, as sims may use, go by the nearest smaller one). */
function spotCount(size: number): number {
  return MAP_SPOTS[size as MapSize] ?? (size >= 128 ? 8 : size >= 96 ? 4 : 2);
}

/** The four uphill directions a ramp can face, indexed by `GameMap.rampDir`. */
const DIR4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
  /**
   * Smooth ground heights on a grid of SURFACE_RES vertices per tile, (size * SURFACE_RES + 1)^2 values.
   * Purely visual: gameplay still uses the per-tile levels. Built from the tile heights plus dune and rock noise.
   */
  surface: Float32Array;
  /**
   * Per surface vertex near a cliff wall: 1 if it belongs to the top of the wall, 0 to the foot, -1 elsewhere.
   * Ground colors on each side come only from that side's tiles, so a plateau's material runs right up to the lip.
   */
  surfaceSide: Int8Array = new Int8Array(0);
  /** Per tile, 0..1: how much outcrop is around (CLIFF tiles blurred over about two tiles). Outcrops sprawl by it. */
  outcropField: Float32Array = new Float32Array(0);
  /** Per surface grid square: 1 if split along (1,0)-(0,1), see `flipped`. */
  private flips: Uint8Array = new Uint8Array(0);
  /** Highest and lowest point of `surface`. */
  surfaceTop = 0;
  surfaceBottom = 0;
  /** Building id occupying each cell, 0 if free. */
  occupied: Int32Array;
  /** The spice fields as laid out (their spice runs out as it's harvested; the list stays). */
  fields: { cx: number; cz: number; kind: FieldKind }[] = [];
  /** Every spawn spot (a base plateau, with its home field), in symmetry order. */
  spots: Cell[];
  /** Base centers for team 0 and team 1: two of the spots, picked from the seed. */
  bases: Cell[];
  /** The map's symmetries (see SYMMETRIES): every spot looks the same. */
  private syms: Sym[];
  /** Incremented whenever spice tiles change, so the minimap knows to redraw. */
  version = 0;

  /** `size` is tiles per side. */
  constructor(readonly size = 64, readonly seed = 7) {
    const N = size;
    this.tiles = new Uint8Array(N * N);
    this.spice = new Float32Array(N * N);
    this.heights = new Float32Array(N * N);
    this.level = new Uint8Array(N * N);
    this.ramp = new Uint8Array(N * N);
    this.rampDir = new Uint8Array(N * N);
    this.occupied = new Int32Array(N * N);
    this.surface = new Float32Array((N * SURFACE_RES + 1) ** 2);
    this.syms = SYMMETRIES[spotCount(size)];
    this.spots = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      this.spots = this.pickSpots(seed + attempt * 101);
      if (this.generate(seed + attempt * 101)) break;
    }
    // Players start at two different spots at random: next door or across the map.
    const n = this.spots.length;
    const a = Math.floor(hash(5, 6, seed) * n);
    const b = (a + 1 + Math.floor(hash(7, 8, seed) * (n - 1))) % n;
    this.bases = [this.spots[a], this.spots[b]];
    this.buildSurface(seed);
  }

  /** Where a cell goes under a symmetry. */
  private image(cx: number, cz: number, s: Sym): Cell {
    const c = (this.size - 1) / 2;
    const x = cx - c;
    const z = cz - c;
    return { cx: Math.round(c + s.xx * x + s.xz * z), cz: Math.round(c + s.zx * x + s.zz * z) };
  }

  /** A cell index under every symmetry (itself first; repeats where a symmetry leaves it in place). */
  private orbit(i: number): number[] {
    const N = this.size;
    return this.syms.map((s) => {
      const c = this.image(i % N, (i / N) | 0, s);
      return this.idx(c.cx, c.cz);
    });
  }

  /**
   * Spawn spots from the seed: spot 0 at a random angle and distance from the middle, the others its images under
   * the map's symmetries. Kept far enough from the edges for the base plateau and spice field, and far enough from
   * each other: two spots run from about two thirds of the map width apart up to nearly corner to corner; with
   * eight, they ring the map, a little more than a plateau and field apart.
   */
  private pickSpots(seed: number): Cell[] {
    const N = this.size;
    const mid = (N - 1) / 2;
    const room = mid - BASE_MARGIN; // farthest a spot may sit from the middle along either axis
    const n = this.syms.length;
    // With eight, spot 0 sits 17-28 degrees off an axis, so it and its mirror image across the diagonal stay apart.
    const angle = n === 8 ? ((17 + hash(1, 2, seed) * 11) * Math.PI) / 180 : hash(1, 2, seed) * Math.PI * 2;
    const cos = dm.cos(angle);
    const sin = dm.sin(angle);
    const rMax = room / Math.max(Math.abs(cos), Math.abs(sin));
    const rMin = Math.min((n === 8 ? 0.36 : n === 4 ? 0.3 : 0.32) * N, rMax);
    const r = rMin + (rMax - rMin) * Math.sqrt(hash(3, 4, seed)); // leans toward far apart
    const cx = Math.round(mid + cos * r);
    const cz = Math.round(mid + sin * r);
    return this.syms.map((s) => this.image(cx, cz, s));
  }

  /** Vertices per side of the surface grid. */
  get surfaceSize(): number {
    return this.size * SURFACE_RES + 1;
  }

  /**
   * Which diagonal splits surface grid square (i, j). On slopes, the one joining the two closest heights, so walls
   * follow their contour instead of zigzagging; on flat ground, mixed per square so the mesh doesn't look striped.
   */
  flipped(i: number, j: number): boolean {
    return this.flips[j * (this.surfaceSize - 1) + i] === 1;
  }

  /**
   * Height of the smooth ground at a world point, matching the visual mesh exactly: each grid square
   * is split into two triangles along the diagonal `flipped` picks.
   */
  surfaceAt(x: number, z: number): number {
    const V = this.surfaceSize;
    const step = TILE / SURFACE_RES;
    const gx = Math.min(Math.max(x / step, 0), V - 1.001);
    const gz = Math.min(Math.max(z / step, 0), V - 1.001);
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const s = this.surface;
    const h00 = s[j * V + i];
    const h11 = s[(j + 1) * V + i + 1];
    if (this.flipped(i, j)) {
      // Split along (1,0)-(0,1).
      const h10 = s[j * V + i + 1];
      const h01 = s[(j + 1) * V + i];
      if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
      return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
    }
    if (fx >= fz) {
      const h10 = s[j * V + i + 1];
      return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    }
    const h01 = s[(j + 1) * V + i];
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  /**
   * Where a ray (origin o, direction d) first meets the ground surface, as a distance along the ray, or -1
   * if it misses the map. Marches in small steps from where the ray drops below the highest ground, then
   * refines the crossing by bisection.
   */
  raySurface(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    if (dy >= 0) return -1;
    const W = this.worldSize();
    let t = Math.max(0, (this.surfaceTop - oy) / dy);
    const end = (this.surfaceBottom - oy) / dy;
    const step = (TILE / SURFACE_RES) * 0.5;
    const above = (u: number) => oy + dy * u > this.surfaceAt(ox + dx * u, oz + dz * u);
    for (let prev = t; t <= end + step; prev = t, t += step) {
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (x < 0 || z < 0 || x > W || z > W || above(t)) continue;
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid)) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    return -1;
  }

  /** The four tile centers around a world point, as cell indices in `k` with bilinear weights in `w`. */
  centerWeights(x: number, z: number, k: number[], w: number[]): void {
    const N = this.size;
    const gx = Math.min(Math.max(x / TILE - 0.5, 0), N - 1);
    const gz = Math.min(Math.max(z / TILE - 0.5, 0), N - 1);
    const x0 = Math.min(Math.floor(gx), N - 2);
    const z0 = Math.min(Math.floor(gz), N - 2);
    const fx = gx - x0;
    const fz = gz - z0;
    k[0] = this.idx(x0, z0);
    w[0] = (1 - fx) * (1 - fz);
    k[1] = this.idx(x0 + 1, z0);
    w[1] = fx * (1 - fz);
    k[2] = this.idx(x0, z0 + 1);
    w[2] = (1 - fx) * fz;
    k[3] = this.idx(x0 + 1, z0 + 1);
    w[3] = fx * fz;
  }

  /**
   * Turns the stepped tile heights into ground. Heights blend smoothly between tile centers, so ramps become
   * gentle slopes and outcrops rounded peaks. Where high and low ground meet without a ramp, the wall instead
   * follows a smooth, noise-wobbled contour as a steep step about a unit wide: cliff lines curve instead of
   * tracing the tile grid. Open sand gets broad dunes that fade out near cliffs,
   * ramps and rock, and rocky outcrops get jagged.
   */
  private buildSurface(seed: number): void {
    const V = this.surfaceSize;
    const step = TILE / SURFACE_RES;
    const dunes = this.duneWeights();
    // Outcrops: their extra height (over the level they stand on), and a blurred copy that gives them a sprawling
    // skirt; the surface takes whichever is higher, so peaks keep their height and the base spreads out.
    const N = this.size;
    const excess = new Float32Array(N * N);
    const cliffs = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (this.tiles[k] !== CLIFF) continue;
      excess[k] = this.heights[k] - this.level[k] * HIGH_Y;
      cliffs[k] = 1;
    }
    const sprawl = blur(blur(excess, N), N);
    this.outcropField = blur(blur(cliffs, N), N);
    this.surfaceSide = new Int8Array(V * V).fill(-1);
    const k4 = [0, 0, 0, 0];
    const w4 = [0, 0, 0, 0];
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = i * step;
        const z = j * step;
        this.centerWeights(x, z, k4, w4);
        let h = 0;
        let high = 0; // blended level
        let top = -Infinity;
        let bottom = Infinity;
        let dune = 0;
        let cliff = 0;
        let soft = 0; // share of sand, spice and ramp around: smooth-shaded ground, no jitter
        let levels = 0; // bit 1: low ground nearby, bit 2: high ground nearby
        let ramp = false;
        let outcrop = false;
        let peak = 0;
        let skirt = 0;
        for (let q = 0; q < 4; q++) {
          const k = k4[q];
          const w = w4[q];
          h += (this.heights[k] - excess[k]) * w;
          peak += excess[k] * w;
          skirt += sprawl[k] * w;
          dune += dunes[k] * w;
          const t = this.tiles[k];
          if (t === CLIFF) {
            cliff += w;
            outcrop = true;
          }
          if (t === SAND || t === SPICE || this.ramp[k]) soft += w;
          high += this.level[k] * w;
          // All four tiles count here, even at zero weight, so neighbouring vertices agree on the rule.
          if (this.ramp[k]) ramp = true;
          else levels |= this.level[k] ? 2 : 1;
          if (this.level[k]) top = Math.max(top, this.heights[k]);
          else bottom = Math.min(bottom, this.heights[k]);
        }
        h += Math.max(peak, skirt * 1.6);
        if (levels === 3 && !ramp && !outcrop) {
          const wobble = (fbm(x / 3 + 700, z / 3 + 700, seed + 47) - 0.5) * 0.6;
          // A steep smooth step across the contour (about a unit wide) rather than a hard top/foot choice, so the
          // wall has a face and follows the curve without stair steps.
          const t = Math.min(1, Math.max(0, (high + wobble - 0.5) / 0.24 + 0.5));
          h = bottom + (top - bottom) * t * t * (3 - 2 * t);
          this.surfaceSide[j * V + i] = t > 0.5 ? 1 : 0;
        }
        if (dune > 0) {
          // Broad swells plus crested ridges running roughly east-west, like wind-built dunes.
          const swell = fbm(x / 40 + 300, z / 40 + 300, seed + 41) - 0.45;
          const ridge = 1 - Math.abs(2 * fbm(x / 30 + 500, z / 11 + 500, seed + 42) - 1);
          h += (swell * 1.6 + (ridge * ridge - 0.45) * 1.6) * dune;
        }
        // Rock jitter on a one-unit lattice whatever the mesh resolution, so facets keep their size.
        if (cliff > 0) h += valueNoise(x, z, seed + 43) * 0.9 * cliff;
        else h += (valueNoise(x, z, seed + 44) - 0.5) * 0.1 * (1 - soft); // rock stays a little uneven
        this.surface[j * V + i] = h;
      }
    }
    // Split each square along the diagonal that joins its two closest heights where it slopes; at random on flat ground.
    this.flips = new Uint8Array((V - 1) * (V - 1));
    const sf = this.surface;
    for (let j = 0; j < V - 1; j++) {
      for (let i = 0; i < V - 1; i++) {
        const d00 = Math.abs(sf[j * V + i] - sf[(j + 1) * V + i + 1]);
        const d10 = Math.abs(sf[j * V + i + 1] - sf[(j + 1) * V + i]);
        this.flips[j * (V - 1) + i] = Math.max(d00, d10) > 0.15 ? (d10 < d00 ? 1 : 0) : hash(i, j, 97) < 0.5 ? 1 : 0;
      }
    }
    this.surfaceTop = this.surface.reduce((a, b) => Math.max(a, b), -Infinity);
    this.surfaceBottom = this.surface.reduce((a, b) => Math.min(a, b), Infinity);
  }

  /**
   * Per tile, how much dune height it takes (0..1): full on open sand, fading to nothing within about three tiles
   * of anything that isn't plain sand or spice (rock, outcrops, ramps, plateau edges).
   */
  private duneWeights(): Float32Array {
    const N = this.size;
    const dist = new Float32Array(N * N).fill(1e9);
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const i = this.idx(cx, cz);
        const t = this.tiles[i];
        let open = (t === SAND || t === SPICE) && !this.ramp[i];
        for (const [dx, dz] of DIR4) {
          const x = cx + dx;
          const z = cz + dz;
          if (open && this.inBounds(x, z) && this.level[this.idx(x, z)] !== this.level[i]) open = false;
        }
        if (!open) dist[i] = 0;
      }
    }
    // Two-pass chamfer distance (1 straight, 1.4 diagonal).
    const relax = (cx: number, cz: number, dx: number, dz: number, cost: number) => {
      const x = cx + dx;
      const z = cz + dz;
      if (!this.inBounds(x, z)) return;
      const i = this.idx(cx, cz);
      dist[i] = Math.min(dist[i], dist[this.idx(x, z)] + cost);
    };
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        relax(cx, cz, -1, 0, 1); relax(cx, cz, 0, -1, 1); relax(cx, cz, -1, -1, 1.4); relax(cx, cz, 1, -1, 1.4);
      }
    }
    for (let cz = N - 1; cz >= 0; cz--) {
      for (let cx = N - 1; cx >= 0; cx--) {
        relax(cx, cz, 1, 0, 1); relax(cx, cz, 0, 1, 1); relax(cx, cz, 1, 1, 1.4); relax(cx, cz, -1, 1, 1.4);
      }
    }
    const w = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const t = Math.min(1, Math.max(0, (dist[i] - 0.5) / 2.5));
      w[i] = t * t * (3 - 2 * t);
    }
    return w;
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
    if (!this.passable(cx, cz)) return false;
    const i = this.idx(cx, cz);
    if (cls === 'worm') return (this.tiles[i] === SAND || this.tiles[i] === SPICE) && this.ramp[i] === 0;
    return !(cls === 'vehicle' && this.ramp[i] === NARROW);
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
    const mid = (this.size - 1) / 2;
    const len = hypot(mid - fx, mid - fz) || 1;
    const tx = (mid - fx) / len;
    const tz = (mid - fz) / len;
    for (let r = 1; r <= maxR; r++) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!ok(x, z)) continue;
          // Ties go to the cell nearer the map's middle, then to one side of the line from the search point to the
          // middle, so mirrored searches on a point-symmetric map pick mirrored cells instead of whichever the scan
          // order meets first.
          const across = (x - fx) * -tz + (z - fz) * tx;
          const d = (x - fx) ** 2 + (z - fz) ** 2 + ((x - mid) ** 2 + (z - mid) ** 2) * 1e-6 + across * 1e-9;
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

  /**
   * Whether a unit of this class standing on the cell can get anywhere: at least `min` cells reachable from it. False
   * in a pocket (a spur of high ground walled in by cliffs and a building), where a unit would be stuck for good.
   */
  roomy(cx: number, cz: number, cls: MoveClass, min = 200): boolean {
    if (!this.canEnter(cx, cz, cls)) return false;
    const N = this.size;
    const seen = new Set<number>([this.idx(cx, cz)]);
    const queue = [this.idx(cx, cz)];
    for (let k = 0; k < queue.length && seen.size < min; k++) {
      const i = queue[k];
      const x0 = i % N;
      const z0 = (i / N) | 0;
      for (const [dx, dz] of DIR4) {
        const x = x0 + dx;
        const z = z0 + dz;
        if (!this.inBounds(x, z)) continue;
        const j = this.idx(x, z);
        if (seen.has(j) || !this.canStep(x0, z0, x, z, cls)) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    return seen.size >= min;
  }

  nearestPassable(cx: number, cz: number, fx = cx, fz = cz): Cell | null {
    return this.nearestCell(cx, cz, (x, z) => this.passable(x, z), 16, fx, fz);
  }

  private generate(seed: number): boolean {
    const N = this.size;
    const total = N * N;
    const h = new Array<number>(total);
    const baseDist = new Array<number>(total);
    this.level.fill(0);
    this.ramp.fill(0);
    this.spice.fill(0);

    // Noise averaged over the map's symmetries, so every spot gets the same terrain.
    const G = this.syms.length;
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const i = this.idx(cx, cz);
        const hs: number[] = [];
        for (const sym of this.syms) {
          const { cx: x, cz: z } = this.image(cx, cz, sym);
          hs.push(fbm(x / TERRAIN_SCALE, z / TERRAIN_SCALE, seed));
        }
        // Summed in sorted order, so every image of a cell gets exactly the same value.
        h[i] = sumSorted(hs) / G;
        baseDist[i] = Math.min(...this.spots.map((b) => hypot(cx - b.cx, cz - b.cz)));
      }
    }

    // Each spot's home field: toward the middle and off to one side, its ground kept open sand (placeFields puts
    // the field itself in there, as close to the plateau as it fits).
    const mid = (N - 1) / 2;
    const b0 = this.spots[0];
    const toMid = dm.atan2(mid - b0.cz, mid - b0.cx) + (HOME_SIDE * Math.PI) / 180;
    const homeR = BASE_RADIUS + SPICE_FIELDS.L.radius + 4;
    const home0 = { cx: Math.round(b0.cx + dm.cos(toMid) * homeR), cz: Math.round(b0.cz + dm.sin(toMid) * homeR) };
    const homes = this.syms.map((sym) => this.image(home0.cx, home0.cz, sym));
    // Some maps get a massif in the middle: no way through, so attacks pick a side of it.
    const massif = hash(9, 9, seed) < MASSIF_CHANCE ? MASSIF_RADIUS * N : 0;

    // Open desert, with a few large rock formations (and outcrops in their highest parts).
    const cliffT = percentile(h, CLIFF_SHARE);
    const rockT = percentile(h, ROCK_SHARE);
    for (let i = 0; i < total; i++) {
      const x = i % N;
      const z = (i / N) | 0;
      const wobble = (h[i] - 0.5) * 6;
      const fromMid = hypot(x - mid, z - mid) + (h[i] - 0.5) * 8;
      const homeGround = homes.some((c) => hypot(x - c.cx, z - c.cz) < SPICE_FIELDS.L.radius + 5);
      let t = SAND;
      if (baseDist[i] < BASE_RADIUS + (homeGround ? Math.min(wobble, 0) : wobble)) t = ROCK;
      else if (homeGround) t = SAND;
      else if (massif && fromMid < massif) t = CLIFF;
      else if (massif && fromMid < massif + 1.5) t = ROCK;
      else if (h[i] > cliffT) t = CLIFF;
      else if (h[i] > rockT) t = ROCK;
      this.tiles[i] = t;
    }
    // Small formations go: rock and outcrops come in a few big pieces, not scattered about.
    for (const list of this.regions((i) => this.tiles[i] === ROCK || this.tiles[i] === CLIFF).cells) {
      if (list.length < FORMATION_MIN && list.every((i) => baseDist[i] >= BASE_RADIUS + 4)) for (const i of list) this.tiles[i] = SAND;
    }

    // High ground. Every sizeable rock area (with the outcrops in it) is a raised shelf, the bases' included;
    // placeRamps leaves a cliff along one stretch of each shelf's edge and opens the rest. The open desert only
    // gets a few small mesas: obstacles to move around, with a ramp for whoever wants the height.
    const { cells: rockAreas } = this.regions((i) => this.tiles[i] === ROCK || this.tiles[i] === CLIFF);
    for (const list of rockAreas) {
      if (list.filter((i) => this.tiles[i] === ROCK).length >= SHELF_MIN) for (const i of list) this.level[i] = 1;
    }
    this.placeMesas(seed, baseDist);
    this.removeSmallRegions(24);

    if (!this.placeFields(seed)) return false;

    this.placeRamps(seed);

    // Connectivity: vehicles must be able to drive between the bases. Cells nobody can reach become
    // cliffs; spice that only infantry can reach (behind narrow ramps) is removed, since harvesters can't get to it.
    const start = this.spots[0];
    const byVehicle = this.flood(start.cx, start.cz, 'vehicle');
    if (this.spots.some((b) => !byVehicle[this.idx(b.cx, b.cz)])) return false;
    const byFoot = this.flood(start.cx, start.cz, 'foot');
    for (let i = 0; i < total; i++) {
      if (!byFoot[i] && this.tiles[i] !== CLIFF) {
        this.tiles[i] = CLIFF;
        this.ramp[i] = 0;
      }
      if (!byVehicle[i] && this.tiles[i] === SPICE) this.tiles[i] = SAND;
      if (this.tiles[i] !== SPICE) this.spice[i] = 0;
    }

    // Keep at least a tile of sand between spice and rock, outcrops or a cliff edge, diagonals included: where
    // they touch, the ground's crisp edges run into each other and look wrong.
    const clash = (i: number, x: number, z: number) => {
      if (!this.inBounds(x, z)) return false;
      const j = this.idx(x, z);
      if (this.tiles[j] === ROCK || this.tiles[j] === CLIFF) return true;
      return this.level[j] !== this.level[i] && !this.ramp[i] && !this.ramp[j];
    };
    for (let i = 0; i < total; i++) {
      if (this.tiles[i] !== SPICE) continue;
      const x = i % N;
      const z = (i / N) | 0;
      let bad = false;
      for (let dz = -1; dz <= 1 && !bad; dz++) for (let dx = -1; dx <= 1 && !bad; dx++) if (dx || dz) bad = clash(i, x + dx, z + dz);
      if (bad) {
        this.tiles[i] = SAND;
        this.spice[i] = 0;
      }
    }

    for (let i = 0; i < total; i++) {
      const t = this.tiles[i];
      const detail = t === ROCK ? 0.3 : t === CLIFF ? 1.6 + hash(i, 3, seed) * 1.4 : t === SPICE ? 0.06 : 0;
      this.heights[i] = this.ramp[i] ? HIGH_Y / 2 : this.level[i] * HIGH_Y + detail;
    }
    return true;
  }

  /**
   * The spice fields: a large one by every spot (its home field, toward the middle and off to one side), then sets
   * of medium and small ones out in the desert, copied under the map's symmetries. Fields sit on open low sand,
   * clear of rock and plateau edges. False if a home field doesn't fit.
   */
  private placeFields(seed: number): boolean {
    const N = this.size;
    const total = N * N;
    // Chebyshev distance from each cell to the nearest one that isn't open low sand (capped): room for a field.
    const room = new Uint8Array(total).fill(255);
    const queue: number[] = [];
    for (let i = 0; i < total; i++) {
      const x = i % N;
      const z = (i / N) | 0;
      if (this.tiles[i] !== SAND || this.level[i] || x === 0 || z === 0 || x === N - 1 || z === N - 1) {
        room[i] = 0;
        queue.push(i);
      }
    }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      if (room[i] >= 12) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = (i % N) + dx;
          const z = ((i / N) | 0) + dz;
          if (!this.inBounds(x, z)) continue;
          const j = this.idx(x, z);
          if (room[j] > room[i] + 1) {
            room[j] = room[i] + 1;
            queue.push(j);
          }
        }
      }
    }
    const taken: { cx: number; cz: number; r: number }[] = [];
    // A field's cells around (cx, cz): a lumpy disc. Null if it doesn't fit, or is too near another field.
    const disc = (cx: number, cz: number, kind: FieldKind): { i: number; w: number }[] | null => {
      const r = SPICE_FIELDS[kind].radius;
      if (taken.some((t) => hypot(t.cx - cx, t.cz - cz) < t.r + r + FIELD_GAP)) return null;
      const out: { i: number; w: number }[] = [];
      const R = Math.ceil(r + 1);
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          const d = hypot(dx, dz);
          if (d > r + (fbm(x / 2 + 300, z / 2 + 300, seed + 71) - 0.5) * 1.6) continue;
          if (!this.inBounds(x, z) || room[this.idx(x, z)] < 3) return null;
          out.push({ i: this.idx(x, z), w: 1 - 0.55 * (d / (r + 1)) ** 2 }); // richest in the middle
        }
      }
      return out;
    };
    // Lays a field and its images, its spice shared out to the total; false if an image overlaps another.
    const lay = (cx: number, cz: number, kind: FieldKind): boolean => {
      const cells = disc(cx, cz, kind);
      if (!cells) return false;
      const r = SPICE_FIELDS[kind].radius;
      const centers = this.syms.map((sym) => this.image(cx, cz, sym));
      for (let a = 0; a < centers.length; a++) {
        for (let b = a + 1; b < centers.length; b++) if (hypot(centers[a].cx - centers[b].cx, centers[a].cz - centers[b].cz) < 2 * r + FIELD_GAP) return false;
      }
      const sum = cells.reduce((t, c) => t + c.w, 0);
      for (const { i, w } of cells) {
        for (const j of this.orbit(i)) {
          this.tiles[j] = SPICE;
          this.spice[j] = (SPICE_FIELDS[kind].spice * w) / sum;
        }
      }
      for (const c of centers) {
        taken.push({ cx: c.cx, cz: c.cz, r });
        this.fields.push({ cx: c.cx, cz: c.cz, kind });
      }
      return true;
    };
    this.fields = [];

    // Home field: toward the middle, off to one side, as close to the plateau as it fits.
    const b = this.spots[0];
    const mid = (N - 1) / 2;
    const toMid = dm.atan2(mid - b.cz, mid - b.cx);
    let home = false;
    const L = SPICE_FIELDS.L.radius;
    for (let d = BASE_RADIUS + L + 2; d <= BASE_RADIUS + L + 10 && !home; d++) {
      for (const off of [HOME_SIDE, HOME_SIDE + 12, HOME_SIDE - 12, HOME_SIDE + 24, HOME_SIDE - 24]) {
        const a = toMid + (off * Math.PI) / 180;
        if (lay(Math.round(b.cx + dm.cos(a) * d), Math.round(b.cz + dm.sin(a) * d), 'L')) {
          home = true;
          break;
        }
      }
    }
    if (!home) return false;

    // Out in the desert: medium fields toward the middle (contested), small ones anywhere away from the bases.
    for (const kind of ['M', 'S'] as const) {
      const def = SPICE_FIELDS[kind];
      let made = 0;
      for (let k = 0; k < 600 && made < def.sets; k++) {
        const cx = Math.floor(hash(k, kind === 'M' ? 81 : 82, seed) * N);
        const cz = Math.floor(hash(k, kind === 'M' ? 83 : 84, seed) * N);
        const fromSpot = Math.min(...this.spots.map((p) => hypot(p.cx - cx, p.cz - cz)));
        if (fromSpot < def.fromSpot) continue;
        // The first tries keep medium fields toward the middle; if none fits there, anywhere will do.
        if (kind === 'M' && k < 300 && hypot(cx - mid, cz - mid) > 0.36 * N) continue;
        if (lay(cx, cz, kind)) made++;
      }
    }
    return true;
  }

  /** A few small desert mesas, copied under the map's symmetries, on open low sand away from bases. */
  private placeMesas(seed: number, baseDist: number[]): void {
    const N = this.size;
    const sets = Math.max(1, Math.round((2 * N * N) / (MESA_AREA * this.syms.length)));
    let made = 0;
    for (let k = 0; k < sets * 40 && made < sets; k++) {
      const cx = Math.floor(hash(k, 11, seed) * N);
      const cz = Math.floor(hash(k, 12, seed) * N);
      const r = 2.8 + hash(k, 13, seed) * 1.8;
      // Far enough from its own images that they stay separate mesas.
      if (this.syms.slice(1).some((sym) => {
        const c = this.image(cx, cz, sym);
        return hypot(cx - c.cx, cz - c.cz) < 2 * (r + 4);
      })) continue;
      const cells: number[] = [];
      let ok = true;
      for (let dz = -8; dz <= 8 && ok; dz++) {
        for (let dx = -8; dx <= 8 && ok; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          const edge = r + (fbm(x / 2.5 + 200, z / 2.5 + 200, seed + 61) - 0.5) * 3; // lumpy outline
          const d = hypot(dx, dz);
          if (d > edge + 2) continue;
          // The mesa and a 2-tile margin around it: open low sand, inside the map, away from the bases.
          if (x < 3 || z < 3 || x >= N - 3 || z >= N - 3) ok = false;
          else {
            const i = this.idx(x, z);
            if (this.tiles[i] !== SAND || this.level[i] || baseDist[i] < 14) ok = false;
            else if (d <= edge) cells.push(i);
          }
        }
      }
      if (!ok || cells.length < 24) continue;
      for (const i of cells) for (const j of this.orbit(i)) this.level[j] = 1;
      made++;
    }
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
   * Carves ramps into the edges of every plateau, copied under the map's symmetries so every spot gets the same ones.
   * Rock shelves keep a cliff along one stretch of their edge (a flank only artillery can hit from below) and
   * the rest is opened with frequent, mostly wide ramps; single-file and infantry-only ones are the occasional
   * exception, and a shelf's first two always take vehicles. Desert mesas get one ramp.
   */
  private placeRamps(seed: number): void {
    const N = this.size;
    const open = (i: number) => this.tiles[i] !== CLIFF;
    const opposite = [1, 0, 3, 2];
    // A direction (index into DIR4) under a symmetry.
    const turn = (d: number, sym: Sym) => {
      const [dx, dz] = DIR4[d];
      const x = sym.xx * dx + sym.xz * dz;
      const z = sym.zx * dx + sym.zz * dz;
      return DIR4.findIndex(([a, b]) => a === x && b === z);
    };
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
      // The strip under every symmetry; a copy a symmetry leaves in place is carved once.
      const copies: { cells: { c: number; row: number }[]; dir: number }[] = [];
      const keys = new Set<string>();
      for (const sym of this.syms) {
        const cells = strip.map(({ c, row }) => {
          const m = this.image(c % N, (c / N) | 0, sym);
          return { c: this.idx(m.cx, m.cz), row };
        });
        const key = cells.map((x) => x.c).sort((a, b) => a - b).join();
        if (keys.has(key)) continue;
        keys.add(key);
        copies.push({ cells, dir: turn(down, sym) });
      }
      const all = copies.map((k) => k.cells.map((x) => x.c));
      for (let a = 0; a < all.length; a++) {
        if (all[a].some((c) => placed.some((p) => near(c, p, RAMP_GAP)))) return false;
        for (let b = a + 1; b < all.length; b++) if (all[a].some((c) => all[b].some((m) => near(c, m, RAMP_GAP)))) return false;
      }
      for (const { cells, dir } of copies) {
        for (const { c, row } of cells) {
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
      const images = this.orbit(plateau[0]).map((i) => label[i]);
      if (images.some((l) => l !== -1 && l < id)) return; // an image of it already got (copied) ramps
      // A plateau the symmetries carry onto itself (one in the middle) gets every ramp once per such symmetry.
      const self = images.filter((l) => l === id).length;
      const edge = edges(plateau);
      if (!edge.length) return;
      // Walk the edge in angle order around the plateau's middle, so picks spread out.
      const mx = plateau.reduce((s, i) => s + (i % N), 0) / plateau.length;
      const mz = plateau.reduce((s, i) => s + ((i / N) | 0), 0) / plateau.length;
      edge.sort((a, b) => dm.atan2(((a.i / N) | 0) - mz, (a.i % N) - mx) - dm.atan2(((b.i / N) | 0) - mz, (b.i % N) - mx));
      // Rock shelves keep one unbroken stretch of cliff and open the rest of their edge with ramps.
      // Desert mesas get a single ramp: they're mainly obstacles.
      const shelf = plateau.filter((i) => this.tiles[i] === ROCK).length > plateau.length / 2;
      let spots = edge;
      if (shelf) {
        const share = SHELF_CLIFF[0] + (SHELF_CLIFF[1] - SHELF_CLIFF[0]) * hash(plateau[0], 51, seed);
        const from = Math.floor(hash(plateau[0], 52, seed) * edge.length);
        const len = Math.floor(edge.length * share);
        spots = edge.filter((_, k) => (k - from + edge.length) % edge.length >= len);
      }
      const want = shelf ? Math.max(1, Math.min(40, Math.round(spots.length / (self * RAMP_EVERY)))) : 1;
      let made = 0;
      for (let k = 0; k < want; k++) {
        const first = made === 0;
        const roll = hash(plateau[0], 7 + k, seed);
        const kind = !shelf ? (roll < 0.7 ? LARGE : NORMAL) : made < 2 || roll < 0.8 ? LARGE : roll < 0.93 ? NORMAL : NARROW;
        // Try spots around this ramp's share of the edge until one carves cleanly.
        const startAt = Math.floor(((k + hash(plateau[0], 31 + k, seed)) / want) * spots.length);
        for (let t = 0; t < spots.length; t += 3) {
          const e = spots[(startAt + t) % spots.length];
          if (carve(e.i, e.down, kind) || (first && carve(e.i, e.down, NORMAL))) {
            made++;
            break;
          }
        }
      }
      // No usable edge: flatten the plateau instead of leaving it sealed off.
      if (!made) for (const i of plateau) for (const j of this.orbit(i)) this.level[j] = 0;
    });
  }
}
