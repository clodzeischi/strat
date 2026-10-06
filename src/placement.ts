import * as THREE from 'three';
import { BUILDINGS, TILE, type BuildingType, type Team } from './config';
import type { Game } from './game';

/** Tiles of context shown around the footprint. */
const RING = 1;
/** Vertices per tile side, so tiles follow the ground's shape. */
const SUB = 3;
/** Gap between tiles, as a share of a tile, so the grid reads as separate squares. */
const INSET = 0.07;
/** Height above the ground, enough to clear its small bumps. */
const LIFT = 0.12;

const OK = new THREE.Color(0x46ff6a);
const BAD = new THREE.Color(0xff3a2a);
const FREE = new THREE.Color(0xffffff);
/** Opacity of the footprint and of the ring of context tiles around it. */
const ALPHA = [0.5, 0.26];

/**
 * StarCraft-style placement grid: the building's footprint, one square per tile, green where it can go and red where
 * it can't, plus a fainter ring of context tiles around it, white where the ground is buildable and red over
 * obstacles. Tiles are draped over the ground.
 */
export class PlacementGrid {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly maxTiles: number;

  constructor(private game: Game) {
    const maxSize = Math.max(...Object.values(BUILDINGS).map((b) => b.size)) + 2 * RING;
    this.maxTiles = maxSize * maxSize;
    const verts = this.maxTiles * (SUB + 1) * (SUB + 1);
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 4), 4));
    const index: number[] = [];
    for (let t = 0; t < this.maxTiles; t++) {
      const base = t * (SUB + 1) * (SUB + 1);
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          const a = base + j * (SUB + 1) + i;
          index.push(a, a + SUB + 1, a + 1, a + 1, a + SUB + 1, a + SUB + 2);
        }
      }
    }
    this.geo.setIndex(index);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false; // rebuilt in place every frame
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** Shows the grid for placing `type` with its footprint's corner at (cx, cz), or hides it with `type` null. */
  update(type: BuildingType | null, team: Team, cx: number, cz: number): void {
    this.mesh.visible = type !== null;
    if (!type) return;
    const g = this.game;
    const m = g.map;
    const size = BUILDINGS[type].size;
    const level = m.inBounds(cx, cz) ? m.level[m.idx(cx, cz)] : 0;
    const inRange = g.inBuildRange(type, team, cx, cz);
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geo.getAttribute('color') as THREE.BufferAttribute;
    let t = 0;
    for (let dz = -RING; dz < size + RING; dz++) {
      for (let dx = -RING; dx < size + RING; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        // 0 inside the footprint, 1 for the context ring.
        const ring = Math.max(0, -dx, dx - size + 1, -dz, dz - size + 1);
        const buildable = g.tileBuildable(x, z, level);
        const color = ring === 0 ? (buildable && inRange ? OK : BAD) : buildable ? FREE : BAD;
        const alpha = m.inBounds(x, z) ? ALPHA[ring] : 0;
        const base = t * (SUB + 1) * (SUB + 1);
        for (let j = 0; j <= SUB; j++) {
          for (let i = 0; i <= SUB; i++) {
            const wx = (x + INSET + ((1 - 2 * INSET) * i) / SUB) * TILE;
            const wz = (z + INSET + ((1 - 2 * INSET) * j) / SUB) * TILE;
            const v = base + j * (SUB + 1) + i;
            pos.setXYZ(v, wx, m.surfaceAt(wx, wz) + LIFT, wz);
            col.setXYZW(v, color.r, color.g, color.b, alpha);
          }
        }
        t++;
      }
    }
    // Unused tiles (smaller buildings) collapse out of sight.
    for (let v = t * (SUB + 1) * (SUB + 1); v < pos.count; v++) col.setW(v, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
