import * as THREE from 'three';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const CORNERS: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
/** Extra ground around the view, so things just off screen still cast their shadows into it. */
const MARGIN = 6;
/** The shadow square grows and shrinks in steps of this many world units, so its texel size rarely changes. */
const SIZE_STEP = 8;
/** Direction from the ground toward the sun. */
export const TO_SUN = new THREE.Vector3(-50, 90, 30).normalize();

/**
 * Keeps the sun's shadow map on the patch of ground the camera can see, instead of the whole map,
 * so shadow detail is the same on every map size. The patch moves in whole shadow-map texels, which
 * stops shadow edges shimmering while the camera pans.
 */
export class ViewShadows {
  /** The shadow camera's screen axes in world space (fixed, since the sun doesn't move). */
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private half = 0;
  private ray = new THREE.Raycaster();
  private points = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private center = new THREE.Vector3();

  constructor(private sun: THREE.DirectionalLight) {
    // Same orientation the shadow camera gets when it looks from the sun at its target.
    new THREE.Matrix4().lookAt(TO_SUN, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).extractBasis(this.right, this.up, new THREE.Vector3());
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
  }

  /** Fits the shadow square to what `camera` sees, out to `maxDist` (past the fog nothing needs shadows). */
  fit(camera: THREE.Camera, maxDist: number): void {
    camera.updateMatrixWorld(); // it may have moved since the last render
    // Where the four screen corners meet the ground; rays that miss or run past maxDist stop at maxDist.
    for (const [k, [x, y]] of CORNERS.entries()) {
      this.ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const p = this.points[k];
      const hit = this.ray.ray.intersectPlane(ground, p);
      if (!hit || p.distanceTo(this.ray.ray.origin) > maxDist) {
        this.ray.ray.at(maxDist, p);
        p.y = 0;
      }
    }
    const xs = this.points.map((p) => p.x);
    const zs = this.points.map((p) => p.z);
    this.center.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    const radius = Math.max(...this.points.map((p) => p.distanceTo(this.center))) + MARGIN;

    const half = Math.ceil(radius / SIZE_STEP) * SIZE_STEP;
    const cam = this.sun.shadow.camera;
    if (half !== this.half) {
      this.half = half;
      Object.assign(cam, { left: -half, right: half, top: half, bottom: -half });
      cam.updateProjectionMatrix();
    }

    // Snap the center to the shadow map's texel grid (in the sun's view), so edges don't crawl as it moves.
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    const lx = this.center.dot(this.right);
    const ly = this.center.dot(this.up);
    this.center.addScaledVector(this.right, Math.round(lx / texel) * texel - lx);
    this.center.addScaledVector(this.up, Math.round(ly / texel) * texel - ly);

    this.sun.target.position.copy(this.center);
    this.sun.position.copy(this.center).addScaledVector(TO_SUN, 150);
  }
}
