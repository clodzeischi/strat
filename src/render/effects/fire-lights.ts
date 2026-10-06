import * as THREE from 'three';

/** Whether fire lights cast shadows. Each shadowed point light renders nearby shadow casters six more times a frame. */
export const FIRE_LIGHT_SHADOWS = false;

/**
 * A fixed set of point lights handed out to explosions. The count never changes: three.js recompiles every
 * lit shader when the number of lights changes, which would stutter mid-fight. Idle lights sit at zero intensity.
 */
export class FireLights {
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
