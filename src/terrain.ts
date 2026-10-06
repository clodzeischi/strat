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
/** Cliff walls (painted by the shader). */
const WALL_COLOR = new THREE.Color(0x76533b);

/**
 * Flat color of one tile, used for the minimap and as the base the ground mesh blends between.
 * With `ground`, spice tiles give plain sand and outcrops plain rock: the ground shader paints those on top.
 */
export function tileColor(map: GameMap, cx: number, cz: number, out = new THREE.Color(), ground = false): THREE.Color {
  const i = map.idx(cx, cz);
  const t = map.tiles[i];
  if (t === SPICE && ground) {
    out.copy(COLORS[SAND]);
  } else if (t === CLIFF && ground) {
    out.copy(COLORS[ROCK]); // the shader paints outcrops brown over a sprawl
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
  /** Per grid vertex: spice share, spice richness (0..1), sand share (incl. spice), outcrop share. */
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
      uRock: { value: COLORS[ROCK] },
      uOutcrop: { value: COLORS[CLIFF] },
      uWall: { value: WALL_COLOR },
      uSpiceLight: { value: SPICE_LOOK.light },
      uSpiceDeep: { value: SPICE_LOOK.deep },
      uSpiceRim: { value: SPICE_LOOK.rim },
      uGlint: { value: SPICE_LOOK.glint },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 spice;
attribute float wall;
varying vec4 vSpice;
varying float vWall;
varying vec3 vGround;
varying vec3 vGroundN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSpice = spice;
vWall = wall;
vGroundN = mat3(modelMatrix) * objectNormal;
vGround = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uSand, uRock, uOutcrop, uWall, uSpiceLight, uSpiceDeep, uSpiceRim, uGlint;
varying vec4 vSpice;
varying float vWall;
varying vec3 vGround;
varying vec3 vGroundN;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 gp = vGround.xz;
float amount = vSpice.y;
// Rock/sand boundary: like the spice edge, a crisp noisy contour instead of the vertex colors' tile-wide fade.
// The vertex color is (roughly) rock and sand blended by the sand share; rescaling it to pure rock or pure sand
// on either side of the contour keeps the shading baked into it.
float sandEdge = vSpice.z - 0.5 + (gNoise(gp * 1.1 + 90.0) * 0.6 + gNoise(gp * 3.0) * 0.4 - 0.5) * 0.45;
float sandAa = fwidth(sandEdge) + 1e-4;
float sandShare = smoothstep(-sandAa, sandAa, sandEdge);
vec3 blended = mix(uRock, uSand, vSpice.z);
diffuseColor.rgb *= mix(uRock, uSand, sandShare) / blended;
// Outcrops: brown, fading out gradually over their sprawling base into whatever surrounds them, sand or rock.
float oc = smoothstep(0.12, 0.7, vSpice.w + (gNoise(gp * 1.4 + 5.0) - 0.5) * 0.3);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uOutcrop / mix(uRock, uSand, sandShare), oc);
// Sand: fine grain and wind ripples. Ripples run across the wind and wander a little; they fade out when
// they'd be thinner than a few pixels, so they never flicker.
float ripple = dot(gp, vec2(0.8, 0.6)) * 2.6 + gNoise(gp * 0.45) * 2.5;
float rippleFade = 1.0 - smoothstep(0.25, 0.6, fwidth(ripple));
float wave = fract(ripple);
float rippleShade = (smoothstep(0.0, 0.75, wave) - smoothstep(0.75, 1.0, wave) - 0.5) * 0.07 * rippleFade;
float sandGrain = (gNoise(gp * 14.0) - 0.5) * 0.06;
// Rock: blotchy color, and faint layers that follow height so outcrop faces read as stratified stone.
float mottle = (gNoise(gp * 1.3 + 70.0) * 0.6 + gNoise(gp * 4.1) * 0.4 - 0.5) * 0.16;
float strata = (sin(vGround.y * 7.0 + gNoise(gp * 0.7) * 3.0) * 0.5) * 0.06;
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
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * spiceCol / uSand, inside);
// Sand and rock detail last, kept off the spice (it has its own grain).
diffuseColor.rgb *= 1.0 + mix((mottle + strata) * (1.0 + oc), rippleShade + sandGrain, sandShare * (1.0 - oc)) * (1.0 - inside);
// Cliff walls: their own brown with a crisp, slightly noisy edge onto the ground above and below (never a blend
// with it), layered, streaked and cracked. Streaks run along the wall, so they use whichever horizontal axis the
// wall faces across. Outcrops keep their own soft look.
vec3 wn = normalize(vGroundN);
float wallEdge = vWall - 0.45 + (gNoise(gp * 2.2 + 11.0) * 0.6 + gNoise(gp * 6.0) * 0.4 - 0.5) * 0.3;
float wallAa = fwidth(wallEdge) + 1e-4;
float wallMask = smoothstep(-wallAa, wallAa, wallEdge) * (1.0 - smoothstep(0.2, 0.45, vSpice.w));
if (wallMask > 0.0) {
  float along = abs(wn.x) > abs(wn.z) ? vGround.z : vGround.x;
  float layers = sin(vGround.y * 10.0 + gNoise(vec2(along * 0.5, vGround.y * 2.0)) * 4.0) * 0.5 + 0.5;
  float streaks = gNoise(vec2(along * 3.5, vGround.y * 0.6)) * 0.65 + gNoise(vec2(along * 9.0, vGround.y * 1.5)) * 0.35;
  // Cracks: thin lines where a noise stretched tall crosses one half, so they run mostly up and down.
  float crackN = gNoise(vec2(along * 2.2, vGround.y * 0.35) + 30.0);
  float crack = (1.0 - smoothstep(0.0, 0.03 + fwidth(crackN), abs(crackN - 0.5))) * step(0.55, gNoise(vec2(along * 0.7, 3.0)));
  float wall = 1.0 + (layers - 0.5) * 0.14 + (streaks - 0.5) * 0.3;
  diffuseColor.rgb = mix(diffuseColor.rgb, uWall * wall * (1.0 - crack * 0.4), wallMask);
}`)
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

/**
 * Extra light baked into smooth ground per unit of sun-facing tilt. Under the high sun and strong sky light,
 * gentle dunes would otherwise barely shade at all.
 */
const RELIEF = 1.6;

/**
 * The ground: one continuous smooth-shaded mesh over the map's surface, split into chunks. Materials (sand, rock,
 * spice, outcrops, cliff walls) are painted per pixel by the ground shader from per-vertex shares.
 */
export class Terrain {
  readonly mesh = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly time = { value: 0 };
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
