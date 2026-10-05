import * as THREE from 'three';

/** Classic Dune-style camera: fixed angle and height looking north, pans only. */
export class RTSCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private readonly pitch = 0.95;
  private readonly dist = 42;

  constructor(private worldSize: number) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
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
