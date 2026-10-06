import * as THREE from 'three';

/** Tracer lines, all in one LineSegments; they fade by darkening, which under additive blending is fading out. */
export class TracerPool {
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
