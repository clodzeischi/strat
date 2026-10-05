import * as THREE from 'three';

/** Everything a particle needs at spawn; anything left out uses the defaults in `ParticlePool.spawn`. */
interface ParticleSpec {
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

/**
 * Lets an instanced particle cast a shadow as thick as it is opaque. The shadow pass ignores transparency,
 * so instead each shadow pixel is kept with probability equal to the particle's opacity (a dithered
 * shadow); the shadow map's filtering smooths the noise into a soft, partial shadow.
 */
function ditheredShadow<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float instanceAlpha;\nvarying float vInstanceAlpha;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = 'varying float vInstanceAlpha;\n' + shader.fragmentShader.replace('void main() {',
      'void main() {\n  if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > vInstanceAlpha) discard;');
  };
  return material;
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/**
 * A fixed-size pool of particles drawn as one InstancedMesh: one draw call however many are alive,
 * and nothing allocated per particle. Particles live in flat arrays; dead ones swap with the last live one.
 */
class ParticlePool {
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
    // Per-instance opacity: three.js has per-instance color but not alpha, so patch it into the shader.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float instanceAlpha;\nvarying float vInstanceAlpha;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
      shader.fragmentShader = 'varying float vInstanceAlpha;\n' +
        shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );');
    };
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

/** Tracer lines, all in one LineSegments; they fade by darkening, which under additive blending is fading out. */
class TracerPool {
  readonly lines: THREE.LineSegments;
  private count = 0;
  private age: Float32Array;
  private ends: Float32Array;
  private readonly color = new THREE.Color(0xffe08a);
  private static readonly LIFE = 0.08;

  constructor(scene: THREE.Scene, private capacity: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.age = new Float32Array(capacity);
    this.ends = new Float32Array(capacity * 6);
  }

  spawn(a: THREE.Vector3, b: THREE.Vector3): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.age[i] = 0;
    this.ends.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  }

  update(dt: number): void {
    const geo = this.lines.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= TracerPool.LIFE) {
        const last = --this.count;
        this.age[i] = this.age[last];
        this.ends.copyWithin(i * 6, last * 6, last * 6 + 6);
        continue;
      }
      const f = 1 - this.age[i] / TracerPool.LIFE;
      (pos.array as Float32Array).set(this.ends.subarray(i * 6, i * 6 + 6), i * 6);
      for (let v = 0; v < 2; v++) (col.array as Float32Array).set([this.color.r * f, this.color.g * f, this.color.b * f], i * 6 + v * 3);
      i++;
    }
    geo.setDrawRange(0, this.count * 2);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Whether fire lights cast shadows. Each shadowed point light renders nearby shadow casters six more times a frame. */
export const FIRE_LIGHT_SHADOWS = false;

/**
 * A fixed set of point lights handed out to explosions. The count never changes: three.js recompiles every
 * lit shader when the number of lights changes, which would stutter mid-fight. Idle lights sit at zero intensity.
 */
class FireLights {
  private static readonly COUNT = 4;
  private lights: { light: THREE.PointLight; age: number; life: number; peak: number }[] = [];

  constructor(scene: THREE.Scene) {
    for (let k = 0; k < FireLights.COUNT; k++) {
      const light = new THREE.PointLight(0xff8a30, 0, 1, 2);
      if (FIRE_LIGHT_SHADOWS) {
        light.castShadow = true;
        light.shadow.mapSize.set(256, 256);
        light.shadow.camera.near = 0.1;
        light.shadow.bias = -0.002;
      }
      scene.add(light);
      this.lights.push({ light, age: 1, life: 0, peak: 0 });
    }
  }

  /** Lights up an explosion: takes an idle light, or the one closest to burning out. */
  flare(p: THREE.Vector3, size: number): void {
    const slot = this.lights.reduce((best, l) => (l.life - l.age < best.life - best.age ? l : best));
    slot.age = 0;
    slot.life = 0.25 + size * 0.15;
    slot.peak = 25 * size * size;
    slot.light.position.set(p.x, p.y + 0.8 + size * 0.3, p.z);
    slot.light.distance = 5 + size * 4;
    if (FIRE_LIGHT_SHADOWS) slot.light.shadow.camera.far = slot.light.distance;
  }

  update(dt: number): void {
    for (const l of this.lights) {
      l.age += dt;
      const t = l.life > 0 ? Math.min(1, l.age / l.life) : 1;
      // Quick flash, then a flickering fade.
      l.light.intensity = t >= 1 ? 0 : l.peak * (1 - t) * (1 - t) * (0.85 + Math.random() * 0.3);
    }
  }
}

/** Short-lived visual effects, drawn from pools. They don't affect gameplay. */
export class Effects {
  private glow: ParticlePool;
  private smoke: ParticlePool;
  private debris: ParticlePool;
  private tracers: TracerPool;
  private lights: FireLights;
  /** Command feedback rings, reused. */
  private rings: { mesh: THREE.Mesh; life: number }[] = [];

  constructor(private scene: THREE.Scene) {
    this.glow = new ParticlePool(scene, new THREE.IcosahedronGeometry(1, 0), 2048, true);
    // Fire glows and casts no shadow; smoke and debris are solid stuff in the air and do.
    this.smoke = new ParticlePool(scene, new THREE.IcosahedronGeometry(1, 0), 2048, false, true);
    this.debris = new ParticlePool(scene, new THREE.TetrahedronGeometry(1, 0), 768, false, true);
    this.lights = new FireLights(scene);
    this.tracers = new TracerPool(scene, 512);
  }

  /** Fireball, sparks, flying debris and a column of dark smoke; `size` scales all of it. */
  explosion(p: THREE.Vector3, size: number): void {
    this.glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.35, size: [size * 0.4, size * 1.3], color: [0xffa040, 0x701800], alpha: [1, 0] });
    this.lights.flare(p, size);
    for (let k = 0; k < 3 + size * 3; k++) {
      this.glow.spawn({
        x: p.x, y: p.y, z: p.z, vx: rand(-3, 3) * size, vy: rand(0.5, 3) * size, vz: rand(-3, 3) * size, drag: 4,
        life: rand(0.3, 0.5), size: [size * rand(0.3, 0.5), size * 0.1], color: [0xd06010, 0x501000],
      });
    }
    for (let k = 0; k < 4 + size * 6; k++) {
      const speed = rand(6, 14);
      const yaw = rand(0, Math.PI * 2);
      this.glow.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(yaw) * speed, vy: rand(3, 9), vz: Math.sin(yaw) * speed, gravity: 20, drag: 1.5,
        life: rand(0.3, 0.6), size: [0.08, 0.03], color: [0xffe080, 0xff6020],
      });
    }
    for (let k = 0; k < 2 + size * 3; k++) {
      const yaw = rand(0, Math.PI * 2);
      const speed = rand(2, 6);
      this.debris.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(yaw) * speed, vy: rand(4, 9), vz: Math.sin(yaw) * speed, gravity: 22,
        life: rand(0.6, 1), size: [rand(0.1, 0.2) * Math.min(size, 2), 0.05], color: [0x2a2420, 0x2a2420], alpha: [1, 0.6],
      });
    }
    for (let k = 0; k < 2 + size * 2; k++) {
      this.smoke.spawn({
        x: p.x + rand(-0.4, 0.4) * size, y: p.y + 0.2, z: p.z + rand(-0.4, 0.4) * size, vx: rand(-0.4, 0.4), vy: rand(1, 2) * size, vz: rand(-0.4, 0.4), drag: 0.8,
        life: rand(1.2, 2.2), size: [size * 0.4, size * rand(1.2, 1.8)], color: [0x3a322c, 0x6a625a], alpha: [0.65, 0],
      });
    }
  }

  /** Muzzle flash. */
  flash(p: THREE.Vector3, size = 0.25): void {
    this.glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.07, size: [size, size * 0.6], color: [0xfff0a0, 0xffa040] });
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3): void {
    this.tracers.spawn(a, b);
  }

  /** A small rising puff: rocket trails, harvester spice spray. */
  puff(p: THREE.Vector3, color: number): void {
    this.smoke.spawn({
      x: p.x, y: p.y, z: p.z, vx: rand(-0.5, 0.5), vy: 1.2, vz: rand(-0.5, 0.5),
      life: 0.8, size: [0.2, 0.6], color: [color, color], alpha: [0.7, 0],
    });
  }

  /** Command feedback ring on the ground. */
  marker(p: THREE.Vector3, color: number): void {
    let ring = this.rings.find((r) => r.life <= 0);
    if (!ring) {
      const geo = new THREE.RingGeometry(0.7, 0.95, 20);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      this.scene.add(mesh);
      ring = { mesh, life: 0 };
      this.rings.push(ring);
    }
    ring.life = 0.5;
    ring.mesh.visible = true;
    ring.mesh.position.set(p.x, p.y + 0.1, p.z);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    this.tracers.update(dt);
    this.lights.update(dt);
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / 0.5;
      r.mesh.visible = r.life > 0;
      r.mesh.scale.setScalar(1.4 - t);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
  }
}
