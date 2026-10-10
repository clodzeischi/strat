import * as THREE from 'three';
import { FireLights } from './fire-lights';
import { ParticlePool } from './particle-pool';
import { TracerPool } from './tracer-pool';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Short-lived visual effects, drawn from pools. They don't affect gameplay. */
export class Effects {
  private glow: ParticlePool;
  private smoke: ParticlePool;
  private debris: ParticlePool;
  private tracers: TracerPool;
  private lights: FireLights;
  /** Whether the player can see a spot: effects in the fog of war aren't shown (they'd give away what's there). */
  visibleAt: (x: number, z: number) => boolean = () => true;
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
    if (!this.visibleAt(p.x, p.z)) return;
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
    if (!this.visibleAt(p.x, p.z)) return;
    this.glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.07, size: [size, size * 0.6], color: [0xfff0a0, 0xffa040] });
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3): void {
    if (!this.visibleAt(a.x, a.z) && !this.visibleAt(b.x, b.z)) return;
    this.tracers.spawn(a, b);
  }

  /** A small rising puff: rocket trails, harvester spice spray. */
  puff(p: THREE.Vector3, color: number): void {
    if (!this.visibleAt(p.x, p.z)) return;
    this.smoke.spawn({
      x: p.x, y: p.y, z: p.z, vx: rand(-0.5, 0.5), vy: 1.2, vz: rand(-0.5, 0.5),
      life: 0.8, size: [0.2, 0.6], color: [color, color], alpha: [0.7, 0],
    });
  }

  /** A little dust kicked up behind a vehicle on sand: it hangs low and drifts. */
  trail(p: THREE.Vector3, color: number, size = 1): void {
    if (!this.visibleAt(p.x, p.z)) return;
    this.smoke.spawn({
      x: p.x + rand(-0.15, 0.15) * size, y: p.y + 0.1, z: p.z + rand(-0.15, 0.15) * size,
      vx: rand(-0.4, 0.4), vy: rand(0.2, 0.6), vz: rand(-0.4, 0.4), drag: 1.2,
      life: rand(0.8, 1.3), size: [0.2 * size, rand(0.6, 0.9) * size], color: [color, color], alpha: [0.45, 0],
    });
  }

  /** Dust blown outward along the ground by an aircraft's downwash; `size` scales the cloud. */
  dust(p: THREE.Vector3, color: number, size = 1): void {
    if (!this.visibleAt(p.x, p.z)) return;
    const yaw = rand(0, Math.PI * 2);
    const r = rand(0.3, 2.2) * size;
    const speed = rand(2.5, 7);
    this.smoke.spawn({
      x: p.x + Math.cos(yaw) * r, y: p.y + 0.15, z: p.z + Math.sin(yaw) * r,
      vx: Math.cos(yaw) * speed, vy: rand(0.3, 1.2), vz: Math.sin(yaw) * speed, drag: 1.6,
      life: rand(1, 1.9), size: [0.35 * size, rand(1, 1.7) * size], color: [color, color], alpha: [0.7, 0],
    });
  }

  /** Command feedback ring on the ground. */
  marker(p: THREE.Vector3, color: number): void {
    let ring = this.rings.find((r) => r.life <= 0);
    if (!ring) {
      const geo = new THREE.RingGeometry(0.7, 0.95, 20);
      geo.rotateX(-Math.PI / 2);
      // Drawn over the ground, so a ring on a slope isn't half buried in it.
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      ring = { mesh, life: 0 };
      this.rings.push(ring);
    }
    ring.life = 0.5;
    ring.mesh.visible = true;
    ring.mesh.position.set(p.x, p.y + 0.15, p.z);
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
