import * as THREE from 'three';
import type { Unit } from '../entities';
import type { GameMap } from '../map';

const MAX_SEGMENTS = 6000;
const LIFT = 0.3;
/** World units per piece of a leg, so it follows the dunes instead of cutting through them. */
const STEP = 2;
const MOVE = new THREE.Color(0x7cff7c);
const ATTACK = new THREE.Color(0xff9040);

/** The selected units' queued orders (Shift+click): a line from each unit through its waypoints. */
export class WaypointLines {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_SEGMENTS * 6);
  private col = new Float32Array(MAX_SEGMENTS * 6);
  private lines: THREE.LineSegments;

  constructor(scene: THREE.Scene, private map: GameMap) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthTest: false });
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.renderOrder = 997;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(units: Unit[]): void {
    let n = 0;
    const leg = (x0: number, z0: number, x1: number, z1: number, c: THREE.Color) => {
      const k = Math.min(16, Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / STEP)));
      for (let i = 0; i < k && n < MAX_SEGMENTS; i++, n++) {
        for (let e = 0; e < 2; e++) {
          const t = (i + e) / k;
          const x = x0 + (x1 - x0) * t;
          const z = z0 + (z1 - z0) * t;
          const o = n * 6 + e * 3;
          this.pos[o] = x;
          this.pos[o + 1] = this.map.surfaceAt(x, z) + LIFT;
          this.pos[o + 2] = z;
          this.col[o] = c.r;
          this.col[o + 1] = c.g;
          this.col[o + 2] = c.b;
        }
      }
    };
    for (const u of units) {
      if (!u.queue.length) continue;
      let x = u.x;
      let z = u.z;
      const to = (x1: number, z1: number, c: THREE.Color) => {
        leg(x, z, x1, z1, c);
        x = x1;
        z = z1;
      };
      const o = u.order;
      if (o.kind === 'move' || o.kind === 'amove') to(o.x, o.z, o.kind === 'move' ? MOVE : ATTACK);
      else if (o.kind === 'attack' && !o.target.dead) to(o.target.x, o.target.z, ATTACK);
      for (const q of u.queue) {
        if (q.kind === 'move' || q.kind === 'amove') to(q.x, q.z, q.kind === 'move' ? MOVE : ATTACK);
        else if (q.kind === 'attack' && !q.target.dead) to(q.target.x, q.target.z, ATTACK);
      }
    }
    this.geo.setDrawRange(0, n * 2);
    this.lines.visible = n > 0;
    if (n > 0) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }
}
