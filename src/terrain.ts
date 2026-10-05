import * as THREE from 'three';
import { SPICE_MAX, TILE } from './config';
import { CLIFF, ROCK, SAND, SPICE, type GameMap } from './map';

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
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    for (let cz = 0; cz < map.size; cz++) {
      for (let cx = 0; cx < map.size; cx++) this.refreshTile(cx, cz);
    }
  }

  refreshTile(cx: number, cz: number): void {
    const i = this.map.idx(cx, cz);
    const h = this.map.heights[i];
    const depth = h + 1;
    this.tmp.makeScale(TILE, depth, TILE).setPosition((cx + 0.5) * TILE, h, (cz + 0.5) * TILE);
    this.mesh.setMatrixAt(i, this.tmp);
    this.mesh.setColorAt(i, tileColor(this.map, cx, cz, this.color));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
