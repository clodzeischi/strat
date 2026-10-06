import * as THREE from 'three';

/**
 * Classic Dune-style camera: fixed angle and height looking north, pans only. Steep and far back with a
 * narrow lens, so the view leans toward Dune II's near-overhead look while keeping some perspective.
 */
export class RTSCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private readonly pitch = 1.12;
  private readonly dist = 66;

  constructor(private worldSize: number) {
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 600);
    this.apply();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  lookAt(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.clamp();
    this.apply();
  }

  /** Pan in screen directions: right = +dx, up = +dy. */
  pan(dx: number, dy: number): void {
    this.target.x += dx;
    this.target.z -= dy;
    this.clamp();
  }

  /** Pan by a world-space offset on the ground. */
  move(dx: number, dz: number): void {
    this.target.x += dx;
    this.target.z += dz;
    this.clamp();
  }

  private clamp(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.worldSize);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.worldSize);
  }

  apply(): void {
    this.camera.position.set(
      this.target.x,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.pitch) * this.dist,
    );
    this.camera.lookAt(this.target);
  }
}
