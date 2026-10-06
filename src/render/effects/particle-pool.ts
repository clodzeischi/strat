import * as THREE from 'three';
import { ditheredShadow } from '../../shaders/dithered-shadow';
import { instanceAlpha } from '../../shaders/instance-alpha';

/** Everything a particle needs at spawn; anything left out uses the defaults in `ParticlePool.spawn`. */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  /** Size at birth and death (scale of the unit-radius shape). */
  size: [number, number];
  /** Color at birth and death. */
  color: [number, number];
  /** Opacity at birth and death. */
  alpha?: [number, number];
  /** Downward acceleration (negative floats upward). */
  gravity?: number;
  /** Fraction of velocity lost per second. */
  drag?: number;
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/**
 * A fixed-size pool of particles drawn as one InstancedMesh: one draw call however many are alive,
 * and nothing allocated per particle. Particles live in flat arrays; dead ones swap with the last live one.
 */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly alpha: THREE.InstancedBufferAttribute;
  // Per-particle state, one slot per instance.
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array; // birth, death
  private col: Float32Array; // birth rgb, death rgb
  private fade: Float32Array; // birth, death opacity
  private grav: Float32Array;
  private drag: Float32Array;

  /** `additive` particles glow (fire); the others are drawn normally and, with `shadows`, cast shadows. */
  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, private capacity: number, additive: boolean, shadows = false) {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: !additive, // fog would brighten additive glow in the distance
    });
    instanceAlpha(material);
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instanceAlpha', this.alpha);
    this.mesh.frustumCulled = false; // particles are spread over the map; the bounds would always be stale
    if (shadows) {
      this.mesh.castShadow = true;
      this.mesh.customDepthMaterial = ditheredShadow(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      this.mesh.customDistanceMaterial = ditheredShadow(new THREE.MeshDistanceMaterial());
    }
    this.mesh.count = 0;
    this.mesh.renderOrder = additive ? 2 : 1;
    scene.add(this.mesh);

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity * 2);
    this.col = new Float32Array(capacity * 6);
    this.fade = new Float32Array(capacity * 2);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
  }

  /** Adds a particle; when the pool is full the new one is dropped (effects are cosmetic). */
  spawn(p: ParticleSpec): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx ?? 0, p.vy ?? 0, p.vz ?? 0], i * 3);
    this.age[i] = 0;
    this.life[i] = p.life;
    this.size.set(p.size, i * 2);
    tmpA.setHex(p.color[0]);
    tmpB.setHex(p.color[1]);
    this.col.set([tmpA.r, tmpA.g, tmpA.b, tmpB.r, tmpB.g, tmpB.b], i * 6);
    this.fade.set(p.alpha ?? [1, 0], i * 2);
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
  }

  update(dt: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const c = this.mesh.instanceColor!.array as Float32Array;
    const a = this.alpha.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.moveSlot(--this.count, i); // the last live particle takes this slot; process it next
        continue;
      }
      const t = this.age[i] / this.life[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] - this.grav[i] * dt) * k;
      this.vel[i * 3 + 2] *= k;
      const x = (this.pos[i * 3] += this.vel[i * 3] * dt);
      const y = (this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt);
      const z = (this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt);
      const s = this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * t;
      // Uniform scale plus translation, written straight into the instance matrix.
      m.set([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1], i * 16);
      for (let ch = 0; ch < 3; ch++) c[i * 3 + ch] = this.col[i * 6 + ch] + (this.col[i * 6 + 3 + ch] - this.col[i * 6 + ch]) * t;
      a[i] = this.fade[i * 2] + (this.fade[i * 2 + 1] - this.fade[i * 2]) * t;
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  private moveSlot(from: number, to: number): void {
    if (from === to) return;
    for (const [arr, n] of [[this.pos, 3], [this.vel, 3], [this.age, 1], [this.life, 1], [this.size, 2], [this.col, 6], [this.fade, 2], [this.grav, 1], [this.drag, 1]] as const) {
      arr.copyWithin(to * n, from * n, from * n + n);
    }
  }
}
