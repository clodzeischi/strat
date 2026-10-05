import * as THREE from 'three';
import { SPICE_MAX, TILE } from './config';
import { CLIFF, ROCK, SAND, SPICE, SURFACE_RES, type GameMap } from './map';

const COLORS = {
  [SAND]: new THREE.Color(0xd9b77a),
  [ROCK]: new THREE.Color(0x8f7d66),
  [CLIFF]: new THREE.Color(0x6b5646),
  [SPICE]: new THREE.Color(0xc8642a),
};
/** Steep ground (plateau edges, outcrop faces) shades toward this. */
const SLOPE = new THREE.Color(0x7a5238);

/** Flat color of one tile, used for the minimap and as the base the ground mesh blends between. */
export function tileColor(map: GameMap, cx: number, cz: number, out = new THREE.Color()): THREE.Color {
  const i = map.idx(cx, cz);
  const t = map.tiles[i];
  if (t === SPICE) {
    const f = Math.min(1, map.spice[i] / SPICE_MAX);
    out.copy(COLORS[SAND]).lerp(COLORS[SPICE], 0.35 + f * 0.65);
  } else {
    out.copy(COLORS[t as keyof typeof COLORS]);
  }
  // High ground is a touch lighter so plateaus read at a glance (on the minimap too).
  if (map.level[i] === 1 && !map.ramp[i]) out.multiplyScalar(1.08);
  return out;
}

/** Tiles per side of one mesh chunk; chunks off screen are skipped when drawing. */
const CHUNK = 16;

interface Chunk {
  cx0: number;
  cz0: number;
  /** Vertices per side of this chunk's grid. */
  n: number;
  /** Blended color at each grid vertex; each triangle is drawn in the average of its three corners. */
  grid: Float32Array;
  geo: THREE.BufferGeometry;
}

/**
 * The ground: one continuous low-poly mesh over the map's smooth surface, split into chunks.
 * Flat-shaded faces with vertex colors blended from the tiles around each vertex.
 */
export class Terrain {
  readonly mesh = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private chunks: Chunk[] = [];
  private dirty = new Set<number>();
  private tmp = new THREE.Color();
  private acc = new THREE.Color();

  constructor(private map: GameMap) {
    for (let cz0 = 0; cz0 < map.size; cz0 += CHUNK) {
      for (let cx0 = 0; cx0 < map.size; cx0 += CHUNK) this.buildChunk(cx0, cz0);
    }
  }

  /** Marks a tile for repainting (its spice changed). Applied by `flush`, at most once per frame. */
  refreshTile(cx: number, cz: number): void {
    this.dirty.add(this.map.idx(cx, cz));
  }

  /** Repaints dirty tiles and uploads the changed colors. */
  flush(): void {
    if (!this.dirty.size) return;
    const touched = new Set<number>();
    for (const i of this.dirty) {
      const cx = i % this.map.size;
      const cz = (i / this.map.size) | 0;
      for (const [k, chunk] of this.chunks.entries()) {
        // A tile's color reaches the vertices on its edges, which may sit in the neighbouring chunk.
        if (cx + 1 < chunk.cx0 || cz + 1 < chunk.cz0 || cx > chunk.cx0 + CHUNK || cz > chunk.cz0 + CHUNK) continue;
        this.paintTile(chunk, cx, cz);
        touched.add(k);
      }
    }
    for (const k of touched) (this.chunks[k].geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.dirty.clear();
  }

  private buildChunk(cx0: number, cz0: number): void {
    const map = this.map;
    const tiles = Math.min(CHUNK, map.size - cx0, map.size - cz0);
    const n = tiles * SURFACE_RES + 1; // grid vertices per side
    const V = map.surfaceSize;
    const step = TILE / SURFACE_RES;
    // Separate vertices per triangle (no sharing), so every face gets its own flat color.
    const pos = new Float32Array((n - 1) * (n - 1) * 6 * 3);
    let p = 0;
    const put = (i: number, j: number) => {
      const gi = cx0 * SURFACE_RES + i;
      const gj = cz0 * SURFACE_RES + j;
      pos[p++] = gi * step;
      pos[p++] = map.surface[gj * V + gi];
      pos[p++] = gj * step;
    };
    // Two triangles per grid square, split along the same diagonal `GameMap.surfaceAt` uses.
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        for (const [a, b] of this.corners(cx0, cz0, i, j)) put(a, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const chunk: Chunk = { cx0, cz0, n, grid: new Float32Array(n * n * 3), geo };
    this.chunks.push(chunk);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.paintVertex(chunk, i, j);
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) this.paintSquare(chunk, i, j);

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.mesh.add(mesh);
  }

  /** The six corners (two triangles, upward-facing winding) of grid square (i, j) in a chunk, as local grid coordinates. */
  private corners(cx0: number, cz0: number, i: number, j: number): [number, number][] {
    if (this.map.flipped(cx0 * SURFACE_RES + i, cz0 * SURFACE_RES + j)) {
      return [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
    }
    return [[i, j], [i + 1, j + 1], [i + 1, j], [i, j], [i, j + 1], [i + 1, j + 1]];
  }

  /** Colors the two triangles of one grid square, each in the average of its corners plus a little jitter. */
  private paintSquare(chunk: Chunk, i: number, j: number): void {
    const { n, grid } = chunk;
    const col = chunk.geo.getAttribute('color') as THREE.BufferAttribute;
    const all = this.corners(chunk.cx0, chunk.cz0, i, j).map(([a, b]) => (b * n + a) * 3);
    const tris = [all.slice(0, 3), all.slice(3, 6)];
    tris.forEach((corners, t) => {
      const face = (j * (n - 1) + i) * 2 + t;
      const gi = chunk.cx0 * SURFACE_RES + i;
      const gj = chunk.cz0 * SURFACE_RES + j;
      const jitter = ((((gi * 73856093) ^ (gj * 19349663) ^ (t * 83492791)) & 0xff) / 255) * 0.07 + 0.965;
      const r = ((grid[corners[0]] + grid[corners[1]] + grid[corners[2]]) / 3) * jitter;
      const g = ((grid[corners[0] + 1] + grid[corners[1] + 1] + grid[corners[2] + 1]) / 3) * jitter;
      const b = ((grid[corners[0] + 2] + grid[corners[1] + 2] + grid[corners[2] + 2]) / 3) * jitter;
      for (let k = 0; k < 3; k++) col.setXYZ(face * 3 + k, r, g, b);
    });
  }

  /** Repaints one tile inside a chunk: its grid vertices, then every square touching them. */
  private paintTile(chunk: Chunk, cx: number, cz: number): void {
    const { n } = chunk;
    const i0 = (cx - chunk.cx0) * SURFACE_RES;
    const j0 = (cz - chunk.cz0) * SURFACE_RES;
    for (let j = j0; j <= j0 + SURFACE_RES; j++) {
      for (let i = i0; i <= i0 + SURFACE_RES; i++) if (i >= 0 && j >= 0 && i < n && j < n) this.paintVertex(chunk, i, j);
    }
    for (let j = j0 - 1; j <= j0 + SURFACE_RES; j++) {
      for (let i = i0 - 1; i <= i0 + SURFACE_RES; i++) if (i >= 0 && j >= 0 && i < n - 1 && j < n - 1) this.paintSquare(chunk, i, j);
    }
  }

  /** A grid vertex blends the colors of the tiles around it and shades toward rock-face brown with steepness. */
  private paintVertex(chunk: Chunk, i: number, j: number): void {
    const map = this.map;
    const V = map.surfaceSize;
    const step = TILE / SURFACE_RES;
    const gi = chunk.cx0 * SURFACE_RES + i;
    const gj = chunk.cz0 * SURFACE_RES + j;
    const x = gi * step;
    const z = gj * step;
    const o = TILE * 0.25;
    this.acc.setRGB(0, 0, 0);
    let w = 0;
    for (const [dx, dz] of [[-o, -o], [o, -o], [-o, o], [o, o]]) {
      const cx = map.cellOf(x + dx);
      const cz = map.cellOf(z + dz);
      if (!map.inBounds(cx, cz)) continue;
      this.acc.add(tileColor(map, cx, cz, this.tmp));
      w++;
    }
    if (w) this.acc.multiplyScalar(1 / w);

    const h = (a: number, b: number) => map.surface[Math.min(Math.max(b, 0), V - 1) * V + Math.min(Math.max(a, 0), V - 1)];
    const slope = Math.hypot(h(gi + 1, gj) - h(gi - 1, gj), h(gi, gj + 1) - h(gi, gj - 1)) / (2 * step);
    this.acc.lerp(SLOPE, Math.min(0.85, Math.max(0, (slope - 0.12) * 2)));
    chunk.grid.set([this.acc.r, this.acc.g, this.acc.b], (j * chunk.n + i) * 3);
  }
}
