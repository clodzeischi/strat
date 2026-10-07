import * as THREE from 'three';
import { SPICE_MAX, TILE } from '../config';
import { SAND, SPICE, SURFACE_RES, type GameMap } from '../map';
import { tileColor } from '../materials/ground';
import { groundShader } from '../shaders/ground';
import { TO_SUN } from './shadows';

/** Tiles per side of one mesh chunk; chunks off screen are skipped when drawing. */
const CHUNK = 16;

interface Chunk {
  cx0: number;
  cz0: number;
  /** Vertices per side of this chunk's grid. */
  n: number;
  /** Blended color at each grid vertex; each triangle is drawn in the average of its three corners. */
  grid: Float32Array;
  /** Per grid vertex: spice share, spice richness (0..1), sand share (incl. spice), outcrop share. */
  spice: Float32Array;
  geo: THREE.BufferGeometry;
}

/**
 * Extra light baked into smooth ground per unit of sun-facing tilt. Under the high sun and strong sky light,
 * gentle dunes would otherwise barely shade at all.
 */
const RELIEF = 1.6;
/** Ground brightness under fog: seen before but not now, and never seen. */
export const FOG_EXPLORED = 0.5;
export const FOG_UNKNOWN = 0.12;

/**
 * The ground: one continuous smooth-shaded mesh over the map's surface, split into chunks. Materials (sand, rock,
 * spice, outcrops, cliff walls) are painted per pixel by the ground shader from per-vertex shares.
 */
export class Terrain {
  readonly mesh = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly time = { value: 0 };
  /** Fog of war over the ground, one texel per tile: 1 seen now, FOG_EXPLORED seen before, FOG_UNKNOWN never seen. */
  private readonly fogData: Uint8Array;
  private readonly fogShown: Float32Array;
  readonly fogTexture: THREE.DataTexture;
  private chunks: Chunk[] = [];
  private dirty = new Set<number>();
  private tmp = new THREE.Color();
  private acc = new THREE.Color();
  private k4 = [0, 0, 0, 0];
  private w4 = [0, 0, 0, 0];
  /** Per surface vertex: normal averaged over the faces around it. */
  private normals: Float32Array;

  constructor(private map: GameMap) {
    this.normals = new Float32Array(map.surfaceSize * map.surfaceSize * 3);
    this.computeNormals();
    const N = map.size;
    this.fogData = new Uint8Array(N * N).fill(255);
    this.fogShown = new Float32Array(N * N).fill(1);
    this.fogTexture = new THREE.DataTexture(this.fogData, N, N, THREE.RedFormat);
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.minFilter = THREE.LinearFilter;
    this.fogTexture.needsUpdate = true;
    groundShader(this.material, this.time, { value: this.fogTexture }, { value: N * TILE });
    for (let cz0 = 0; cz0 < map.size; cz0 += CHUNK) {
      for (let cx0 = 0; cx0 < map.size; cx0 += CHUNK) this.buildChunk(cx0, cz0);
    }
  }

  /** Advances the spice shimmer (seconds). */
  animate(t: number): void {
    this.time.value = t;
  }

  /**
   * Eases the drawn fog toward what the player sees now (`visible`, `explored`: one byte per tile), so it opens and
   * closes smoothly rather than in steps of a vision update. With `reveal`, everything is shown.
   */
  updateFog(visible: Uint8Array, explored: Uint8Array, reveal: boolean, dt: number): void {
    const k = Math.min(1, dt * 6);
    const shown = this.fogShown;
    const data = this.fogData;
    let changed = false;
    for (let i = 0; i < shown.length; i++) {
      const want = reveal || visible[i] ? 1 : explored[i] ? FOG_EXPLORED : FOG_UNKNOWN;
      const v = shown[i];
      if (v === want) continue;
      const next = Math.abs(want - v) < 0.01 ? want : v + (want - v) * k;
      shown[i] = next;
      const byte = Math.round(next * 255);
      if (data[i] !== byte) {
        data[i] = byte;
        changed = true;
      }
    }
    if (changed) this.fogTexture.needsUpdate = true;
  }

  /** How bright the fog leaves a tile (0-1), for the minimap. */
  fogAt(i: number): number {
    return this.fogShown[i];
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
    for (const k of touched) {
      (this.chunks[k].geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      (this.chunks[k].geo.getAttribute('spice') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.dirty.clear();
  }

  /** Smooth vertex normals: the area-weighted average of the faces around each surface vertex. */
  private computeNormals(): void {
    const map = this.map;
    const V = map.surfaceSize;
    const step = TILE / SURFACE_RES;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const at = (v: THREE.Vector3, [i, j]: [number, number]) => v.set(i * step, map.surface[j * V + i], j * step);
    for (let gj = 0; gj < V - 1; gj++) {
      for (let gi = 0; gi < V - 1; gi++) {
        const all = this.corners(0, 0, gi, gj);
        for (let t = 0; t < 2; t++) {
          const tri = all.slice(t * 3, t * 3 + 3);
          at(a, tri[0]);
          at(b, tri[1]);
          at(c, tri[2]);
          n.subVectors(b, a).cross(c.sub(a)); // area-weighted, upward for this winding
          for (const [i, j] of tri) {
            const o = (j * V + i) * 3;
            this.normals[o] += n.x;
            this.normals[o + 1] += n.y;
            this.normals[o + 2] += n.z;
          }
        }
      }
    }
    for (let o = 0; o < this.normals.length; o += 3) {
      n.fromArray(this.normals, o);
      (n.lengthSq() ? n.normalize() : n.set(0, 1, 0)).toArray(this.normals, o);
    }
  }

  private buildChunk(cx0: number, cz0: number): void {
    const map = this.map;
    const tiles = Math.min(CHUNK, map.size - cx0, map.size - cz0);
    const n = tiles * SURFACE_RES + 1; // grid vertices per side
    const V = map.surfaceSize;
    const step = TILE / SURFACE_RES;
    // Separate vertices per triangle (no sharing), as the color and share attributes are written per triangle.
    const pos = new Float32Array((n - 1) * (n - 1) * 6 * 3);
    const nor = new Float32Array(pos.length);
    const wall = new Float32Array(pos.length / 3);
    let p = 0;
    // Two triangles per grid square, split along the same diagonal `GameMap.surfaceAt` uses.
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const all = this.corners(cx0, cz0, i, j);
        for (let t = 0; t < 2; t++) {
          for (const [a, b] of all.slice(t * 3, t * 3 + 3)) {
            const gi = cx0 * SURFACE_RES + a;
            const gj = cz0 * SURFACE_RES + b;
            pos[p] = gi * step;
            pos[p + 1] = map.surface[gj * V + gi];
            pos[p + 2] = gj * step;
            nor.set(this.normals.subarray((gj * V + gi) * 3, (gj * V + gi) * 3 + 3), p);
            // Wall band: steepness, only near a level edge (not on dunes, ramps or outcrops). It fades over the
            // lip and foot, where normals average the wall with the flat ground, so the band slightly overhangs both.
            if (map.surfaceSide[gj * V + gi] >= 0) {
              const ny = this.normals[(gj * V + gi) * 3 + 1];
              wall[p / 3] = THREE.MathUtils.smoothstep(1 - ny, 0.08, 0.4);
            }
            p += 3;
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    geo.setAttribute('spice', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
    geo.setAttribute('wall', new THREE.BufferAttribute(wall, 1));
    geo.computeBoundingSphere();
    const chunk: Chunk = { cx0, cz0, n, grid: new Float32Array(n * n * 3), spice: new Float32Array(n * n * 4), geo };
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

  /** Writes the two triangles of one grid square: corner colors with baked sun relief, and the shader's shares. */
  private paintSquare(chunk: Chunk, i: number, j: number): void {
    const { n, grid } = chunk;
    const col = chunk.geo.getAttribute('color') as THREE.BufferAttribute;
    const spice = chunk.geo.getAttribute('spice') as THREE.BufferAttribute;
    const all = this.corners(chunk.cx0, chunk.cz0, i, j);
    const V = this.map.surfaceSize;
    for (let k = 0; k < 6; k++) {
      const [a, b] = all[k];
      const c = (b * n + a) * 3;
      const v = (b * n + a) * 4;
      const at = ((j * (n - 1) + i) * 2) * 3 + k; // triangle t = k / 3, corner k % 3
      const o = ((chunk.cz0 * SURFACE_RES + b) * V + chunk.cx0 * SURFACE_RES + a) * 3;
      const lit = this.normals[o] * TO_SUN.x + this.normals[o + 1] * TO_SUN.y + this.normals[o + 2] * TO_SUN.z;
      const shade = Math.max(0.6, 1 + (lit - TO_SUN.y) * RELIEF);
      col.setXYZ(at, grid[c] * shade, grid[c + 1] * shade, grid[c + 2] * shade);
      spice.setXYZW(at, chunk.spice[v], chunk.spice[v + 1], chunk.spice[v + 2], chunk.spice[v + 3]);
    }
  }

  /** Repaints one tile inside a chunk: its grid vertices, then every square touching them. */
  private paintTile(chunk: Chunk, cx: number, cz: number): void {
    const { n } = chunk;
    // A tile's color blends out to the neighbouring tile centers: half a tile past each of its edges.
    const half = SURFACE_RES / 2;
    const i0 = (cx - chunk.cx0) * SURFACE_RES - half;
    const j0 = (cz - chunk.cz0) * SURFACE_RES - half;
    const i1 = i0 + 2 * SURFACE_RES;
    const j1 = j0 + 2 * SURFACE_RES;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < n && j < n) this.paintVertex(chunk, i, j);
    }
    for (let j = j0 - 1; j <= j1; j++) {
      for (let i = i0 - 1; i <= i1; i++) if (i >= 0 && j >= 0 && i < n - 1 && j < n - 1) this.paintSquare(chunk, i, j);
    }
  }

  /**
   * A grid vertex blends the colors of the tiles around it (bilinear between tile centers, so blends span a tile
   * whatever the mesh resolution), and records the spice, sand and outcrop around it for the shader. On a cliff
   * wall only the tiles on the vertex's own side count, so the top keeps its material right up to the lip.
   */
  private paintVertex(chunk: Chunk, i: number, j: number): void {
    const map = this.map;
    const step = TILE / SURFACE_RES;
    const x = (chunk.cx0 * SURFACE_RES + i) * step;
    const z = (chunk.cz0 * SURFACE_RES + j) * step;
    map.centerWeights(x, z, this.k4, this.w4);
    const side = map.surfaceSide[(chunk.cz0 * SURFACE_RES + j) * map.surfaceSize + chunk.cx0 * SURFACE_RES + i];
    let outcrop = 0;
    let total = 0;
    for (let q = 0; q < 4; q++) {
      const k = this.k4[q];
      outcrop += map.outcropField[k] * this.w4[q];
      if (side >= 0 && map.level[k] !== side) this.w4[q] = 0;
      total += this.w4[q];
    }
    for (let q = 0; q < 4; q++) this.w4[q] /= total || 1;
    this.acc.setRGB(0, 0, 0);
    let share = 0;
    let rich = 0;
    let sand = 0;
    for (let q = 0; q < 4; q++) {
      const k = this.k4[q];
      const w = this.w4[q];
      this.acc.add(tileColor(map, k % map.size, (k / map.size) | 0, this.tmp, true).multiplyScalar(w));
      if (map.tiles[k] === SAND || map.tiles[k] === SPICE || map.ramp[k]) sand += w;
      if (map.tiles[k] === SPICE) {
        share += w;
        rich += Math.min(1, map.spice[k] / SPICE_MAX) * w;
      }
    }
    const v = j * chunk.n + i;
    chunk.grid.set([this.acc.r, this.acc.g, this.acc.b], v * 3);
    // Richness is averaged over the spice only, so a field's edge is as rich as the tiles it bounds.
    chunk.spice[v * 4] = share;
    chunk.spice[v * 4 + 1] = share > 0 ? rich / share : 0;
    chunk.spice[v * 4 + 2] = sand;
    chunk.spice[v * 4 + 3] = outcrop;
  }
}
