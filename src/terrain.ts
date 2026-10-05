import * as THREE from 'three';
import { SPICE_MAX, TILE } from './config';
import { CLIFF, ROCK, SAND, SPICE, type GameMap } from './map';

const tilt = new THREE.Matrix4();

const COLORS = {
  [SAND]: new THREE.Color(0xd9b77a),
  [ROCK]: new THREE.Color(0x8f7d66),
  [CLIFF]: new THREE.Color(0x6b5646),
  [SPICE]: new THREE.Color(0xc8642a),
};

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
  // Small deterministic per-tile variation so the ground isn't flat color.
  const v = ((cx * 73856093) ^ (cz * 19349663)) & 0xff;
  out.multiplyScalar(0.94 + (v / 255) * 0.1);
  return out;
}

/** The ground: one instanced box per tile. */
export class Terrain {
  readonly mesh: THREE.InstancedMesh;
  private tmp = new THREE.Matrix4();
  private color = new THREE.Color();

  constructor(private map: GameMap) {
    const n = map.size * map.size;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, -0.5, 0); // top face at y = 0
    // Darker sides so every step in the ground (plateau edges, rock, cliffs) reads at a glance.
    const normals = geo.getAttribute('normal');
    const shade = new Float32Array(normals.count * 3);
    for (let v = 0; v < normals.count; v++) shade.fill(normals.getY(v) > 0.5 ? 1 : 0.62, v * 3, v * 3 + 3);
    geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const material = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    for (let cz = 0; cz < map.size; cz++) {
      for (let cx = 0; cx < map.size; cx++) this.refreshTile(cx, cz);
    }
  }

  refreshTile(cx: number, cz: number): void {
    const i = this.map.idx(cx, cz);
    if (this.map.ramp[i]) {
      this.rampMatrix(cx, cz);
    } else {
      const h = this.map.heights[i];
      this.tmp.makeScale(TILE, h + 1, TILE).setPosition((cx + 0.5) * TILE, h, (cz + 0.5) * TILE);
    }
    this.mesh.setMatrixAt(i, this.tmp);
    this.mesh.setColorAt(i, tileColor(this.map, cx, cz, this.color));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A ramp tile is the usual box tilted so its top runs from the low neighbour up to the high one. */
  private rampMatrix(cx: number, cz: number): void {
    const { lo, hi, dir } = this.map.rampEnds(cx, cz);
    const rise = hi - lo;
    const angle = Math.atan2(rise, TILE);
    const length = Math.hypot(TILE, rise);
    const depth = (lo + hi) / 2 + 1;
    if (dir[0]) {
      this.tmp.makeRotationZ(dir[0] * angle).multiply(tilt.makeScale(length, depth, TILE));
    } else {
      this.tmp.makeRotationX(-dir[1] * angle).multiply(tilt.makeScale(TILE, depth, length));
    }
    this.tmp.setPosition((cx + 0.5) * TILE, (lo + hi) / 2, (cz + 0.5) * TILE);
  }
}
