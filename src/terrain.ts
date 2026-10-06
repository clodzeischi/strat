import * as THREE from 'three';
import { SPICE_MAX, TILE } from './config';
import { CLIFF, ROCK, SAND, SPICE, SURFACE_RES, type GameMap } from './map';
import { TO_SUN } from './shadows';

const COLORS = {
  [SAND]: new THREE.Color(0xd9b77a),
  [ROCK]: new THREE.Color(0x8f7d66),
  [CLIFF]: new THREE.Color(0x6b5646),
  [SPICE]: new THREE.Color(0xc8642a),
};
/** Steep ground (plateau edges, outcrop faces) shades toward this. */
const SLOPE = new THREE.Color(0x7a5238);

/**
 * Flat color of one tile, used for the minimap and as the base the ground mesh blends between.
 * With `ground`, spice tiles give plain sand: the ground shader paints the spice on top.
 */
export function tileColor(map: GameMap, cx: number, cz: number, out = new THREE.Color(), ground = false): THREE.Color {
  const i = map.idx(cx, cz);
  const t = map.tiles[i];
  if (t === SPICE && ground) {
    out.copy(COLORS[SAND]);
  } else if (t === SPICE) {
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
  /** Per grid vertex: share of spice tiles around it, and how rich that spice is (0..1). */
  spice: Float32Array;
  geo: THREE.BufferGeometry;
}

/** Spice look: light thin spice, deep rich spice, the darker rim along field edges, and the glint color. */
const SPICE_LOOK = {
  light: new THREE.Color(0xd8803c),
  deep: new THREE.Color(0xb4441c),
  rim: new THREE.Color(0x7a2a12),
  glint: new THREE.Color(0xfff2c8),
};

/**
 * Patches the ground's Lambert shader to paint spice per pixel: a crisp field edge (the 0.5 contour of the
 * spice share, wobbled by noise so it doesn't follow the tile grid), a dark rim inside it, grain, bare patches
 * that open up as a field is harvested, and the shimmer: tiny twinkling glints plus a slow drifting sheen.
 */
function addSpiceShader(material: THREE.MeshLambertMaterial, time: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: time,
      uSand: { value: COLORS[SAND] },
      uSpiceLight: { value: SPICE_LOOK.light },
      uSpiceDeep: { value: SPICE_LOOK.deep },
      uSpiceRim: { value: SPICE_LOOK.rim },
      uGlint: { value: SPICE_LOOK.glint },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 spice;
varying vec2 vSpice;
varying vec3 vGround;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSpice = spice;
vGround = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uSand, uSpiceLight, uSpiceDeep, uSpiceRim, uGlint;
varying vec2 vSpice;
varying vec3 vGround;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 gp = vGround.xz;
float amount = vSpice.y;
// Field edge: where the spice share crosses one half, pushed in and out by noise.
float edge = vSpice.x - 0.5 + (gNoise(gp * 0.9) * 0.6 + gNoise(gp * 2.6) * 0.4 - 0.5) * 0.5;
// Thinning: as a field is harvested, bare sand opens up in patches.
float cover = amount * 2.2 + 0.1 - gNoise(gp * 0.8 + 40.0);
float shape = min(edge, cover * 0.6);
float aa = fwidth(shape) + 1e-4;
float inside = smoothstep(-aa, aa, shape);
float grain = gNoise(gp * 7.0) * 0.6 + gNoise(gp * 13.0 + 7.0) * 0.4;
vec3 spiceCol = mix(uSpiceLight, uSpiceDeep, clamp(amount * 0.85 + (grain - 0.5) * 0.5, 0.0, 1.0));
spiceCol *= 0.84 + 0.3 * gNoise(gp * 5.0 + 19.0);
spiceCol = mix(spiceCol, uSpiceRim, (1.0 - smoothstep(0.0, 0.06, shape)) * 0.7);
// The vertex color is sand with dune shading baked in; scaling it keeps that shading on the spice.
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * spiceCol / uSand, inside);`)
      .replace('#include <opaque_fragment>', `{
  // Shimmer: one possible glint per small cell, each twinkling on its own clock, denser on rich spice.
  vec2 cp = gp * 2.2;
  vec2 cell = floor(cp);
  float h = gHash(cell);
  vec2 at = vec2(gHash(cell + 17.1), gHash(cell + 31.7)) * 0.7 + 0.15;
  float d = length(fract(cp) - at);
  float twinkle = pow(max(0.0, sin(uTime * (1.2 + h * 2.4) + h * 60.0)), 20.0);
  float size = max(0.07, fwidth(cp.x) * 1.2);
  float spark = (1.0 - smoothstep(size * 0.3, size, d)) * twinkle * step(h, 0.2 + 0.4 * amount);
  float sheen = smoothstep(0.62, 0.9, gNoise(gp * 0.3 + vec2(uTime * 0.22, uTime * 0.09))) * 0.1;
  outgoingLight += uGlint * (spark * 1.5 + sheen) * inside;
}
#include <opaque_fragment>`);
  };
}

/** Faces steeper than this (normal's y below it) are cliff faces and drawn faceted. */
const SHARP_NY = 0.8;
/**
 * Extra light baked into smooth ground per unit of sun-facing tilt. Under the high sun and strong sky light,
 * gentle dunes would otherwise barely shade at all.
 */
const RELIEF = 1.6;

/**
 * The ground: one continuous low-poly mesh over the map's surface, split into chunks.
 * Shading is selective: sand, spice and ramps are smooth, while rock, outcrops and cliff faces stay faceted.
 * Smooth normals only average smooth faces, so wherever the two meet (the lip of a cliff) the edge stays sharp.
 */
export class Terrain {
  readonly mesh = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly time = { value: 0 };
  private chunks: Chunk[] = [];
  private dirty = new Set<number>();
  private tmp = new THREE.Color();
  private acc = new THREE.Color();
  /** Per surface triangle (two per grid square, square-major): 1 if smooth-shaded. */
  private smooth: Uint8Array;
  /** Per surface triangle: y of its face normal (1 = flat). */
  private faceNy: Float32Array;
  /** Per surface vertex: normal averaged over the smooth faces around it. */
  private normals: Float32Array;

  constructor(private map: GameMap) {
    const V = map.surfaceSize;
    this.smooth = new Uint8Array((V - 1) * (V - 1) * 2);
    this.faceNy = new Float32Array((V - 1) * (V - 1) * 2);
    this.normals = new Float32Array(V * V * 3);
    this.classifyFaces();
    addSpiceShader(this.material, this.time);
    for (let cz0 = 0; cz0 < map.size; cz0 += CHUNK) {
      for (let cx0 = 0; cx0 < map.size; cx0 += CHUNK) this.buildChunk(cx0, cz0);
    }
  }

  /** Advances the spice shimmer (seconds). */
  animate(t: number): void {
    this.time.value = t;
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

  /** Decides which triangles are smooth and builds the smooth vertex normals from them. */
  private classifyFaces(): void {
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
          const f = (gj * (V - 1) + gi) * 2 + t;
          this.faceNy[f] = n.y / n.length();
          // The tile under the triangle's centroid decides its material.
          const cx = Math.floor((tri[0][0] + tri[1][0] + tri[2][0]) / 3 / SURFACE_RES);
          const cz = Math.floor((tri[0][1] + tri[1][1] + tri[2][1]) / 3 / SURFACE_RES);
          const k = map.idx(Math.min(cx, map.size - 1), Math.min(cz, map.size - 1));
          const soft = map.ramp[k] !== 0 || (map.tiles[k] !== ROCK && map.tiles[k] !== CLIFF);
          if (!soft || this.faceNy[f] < SHARP_NY) continue;
          this.smooth[f] = 1;
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
    // Separate vertices per triangle (no sharing), so every face gets its own flat color.
    const pos = new Float32Array((n - 1) * (n - 1) * 6 * 3);
    const nor = new Float32Array(pos.length);
    const face = new THREE.Vector3();
    const e = new THREE.Vector3();
    const origin = new THREE.Vector3();
    let p = 0;
    // Two triangles per grid square, split along the same diagonal `GameMap.surfaceAt` uses.
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const all = this.corners(cx0, cz0, i, j);
        for (let t = 0; t < 2; t++) {
          const p0 = p;
          for (const [a, b] of all.slice(t * 3, t * 3 + 3)) {
            const gi = cx0 * SURFACE_RES + a;
            const gj = cz0 * SURFACE_RES + b;
            pos[p] = gi * step;
            pos[p + 1] = map.surface[gj * V + gi];
            pos[p + 2] = gj * step;
            nor.set(this.normals.subarray((gj * V + gi) * 3, (gj * V + gi) * 3 + 3), p);
            p += 3;
          }
          if (this.smooth[this.faceIndex(cx0, cz0, i, j, t)]) continue;
          // Faceted: all three corners take the face normal.
          origin.fromArray(pos, p0);
          face.fromArray(pos, p0 + 3).sub(origin);
          face.cross(e.fromArray(pos, p0 + 6).sub(origin)).normalize();
          for (let k = 0; k < 3; k++) face.toArray(nor, p0 + k * 3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    geo.setAttribute('spice', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.computeBoundingSphere();
    const chunk: Chunk = { cx0, cz0, n, grid: new Float32Array(n * n * 3), spice: new Float32Array(n * n * 2), geo };
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

  /** Index of a chunk's grid-square triangle in the map-wide face arrays. */
  private faceIndex(cx0: number, cz0: number, i: number, j: number, t: number): number {
    const gi = cx0 * SURFACE_RES + i;
    const gj = cz0 * SURFACE_RES + j;
    return (gj * (this.map.surfaceSize - 1) + gi) * 2 + t;
  }

  /**
   * Colors the two triangles of one grid square. Smooth triangles blend their corner colors; faceted ones are
   * one color (the average of their corners plus a little jitter), shaded toward rock-face brown with steepness.
   */
  private paintSquare(chunk: Chunk, i: number, j: number): void {
    const { n, grid } = chunk;
    const col = chunk.geo.getAttribute('color') as THREE.BufferAttribute;
    const spice = chunk.geo.getAttribute('spice') as THREE.BufferAttribute;
    const all = this.corners(chunk.cx0, chunk.cz0, i, j).map(([a, b]) => (b * n + a) * 3);
    const tris = [all.slice(0, 3), all.slice(3, 6)];
    tris.forEach((corners, t) => {
      const face = (j * (n - 1) + i) * 2 + t;
      corners.forEach((c, k) => spice.setXY(face * 3 + k, chunk.spice[(c / 3) * 2], chunk.spice[(c / 3) * 2 + 1]));
      const f = this.faceIndex(chunk.cx0, chunk.cz0, i, j, t);
      if (this.smooth[f]) {
        const flat = TO_SUN.y;
        const all = this.corners(chunk.cx0, chunk.cz0, i, j).slice(t * 3, t * 3 + 3);
        corners.forEach((c, k) => {
          const [a, b] = all[k];
          const o = ((chunk.cz0 * SURFACE_RES + b) * this.map.surfaceSize + chunk.cx0 * SURFACE_RES + a) * 3;
          const lit = this.normals[o] * TO_SUN.x + this.normals[o + 1] * TO_SUN.y + this.normals[o + 2] * TO_SUN.z;
          const shade = Math.max(0.6, 1 + (lit - flat) * RELIEF);
          col.setXYZ(face * 3 + k, grid[c] * shade, grid[c + 1] * shade, grid[c + 2] * shade);
        });
        return;
      }
      const gi = chunk.cx0 * SURFACE_RES + i;
      const gj = chunk.cz0 * SURFACE_RES + j;
      const jitter = ((((gi * 73856093) ^ (gj * 19349663) ^ (t * 83492791)) & 0xff) / 255) * 0.07 + 0.965;
      this.acc.setRGB(
        (grid[corners[0]] + grid[corners[1]] + grid[corners[2]]) / 3,
        (grid[corners[0] + 1] + grid[corners[1] + 1] + grid[corners[2] + 1]) / 3,
        (grid[corners[0] + 2] + grid[corners[1] + 2] + grid[corners[2] + 2]) / 3,
      );
      const ny = this.faceNy[f];
      const slope = Math.sqrt(1 - ny * ny) / ny;
      this.acc.lerp(SLOPE, Math.min(0.85, Math.max(0, (slope - 0.12) * 2))).multiplyScalar(jitter);
      for (let k = 0; k < 3; k++) col.setXYZ(face * 3 + k, this.acc.r, this.acc.g, this.acc.b);
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

  /** A grid vertex blends the colors of the tiles around it, and records the spice around it for the shader. */
  private paintVertex(chunk: Chunk, i: number, j: number): void {
    const map = this.map;
    const step = TILE / SURFACE_RES;
    const gi = chunk.cx0 * SURFACE_RES + i;
    const gj = chunk.cz0 * SURFACE_RES + j;
    const x = gi * step;
    const z = gj * step;
    const o = TILE * 0.25;
    this.acc.setRGB(0, 0, 0);
    let w = 0;
    let share = 0;
    let rich = 0;
    for (const [dx, dz] of [[-o, -o], [o, -o], [-o, o], [o, o]]) {
      const cx = map.cellOf(x + dx);
      const cz = map.cellOf(z + dz);
      if (!map.inBounds(cx, cz)) continue;
      this.acc.add(tileColor(map, cx, cz, this.tmp, true));
      w++;
      const k = map.idx(cx, cz);
      if (map.tiles[k] === SPICE) {
        share++;
        rich += Math.min(1, map.spice[k] / SPICE_MAX);
      }
    }
    if (w) this.acc.multiplyScalar(1 / w);
    const v = j * chunk.n + i;
    chunk.grid.set([this.acc.r, this.acc.g, this.acc.b], v * 3);
    // Richness is averaged over the spice tiles only, so a field's edge is as rich as the tiles it bounds.
    chunk.spice[v * 2] = w ? share / w : 0;
    chunk.spice[v * 2 + 1] = share ? rich / share : 0;
  }
}
