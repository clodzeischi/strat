import * as THREE from 'three';
import type { Building } from '../entities';
import type { GameMap } from '../map';

/** Points along each line, so it follows the dunes instead of cutting through them. */
const SEGMENTS = 24;
const LIFT = 0.25;
const COLOR = 0x7cff7c;

const lineMat = new THREE.LineDashedMaterial({ color: COLOR, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.9, depthTest: false });
const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6).translate(0, 1.3, 0);
const flagGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.6, 0, 1.5, 2.15, 0, 0, 1.7, 0], 3));
  g.computeVertexNormals();
  return g;
})();
const flagMat = new THREE.MeshBasicMaterial({ color: COLOR, side: THREE.DoubleSide, depthTest: false });
const poleMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, depthTest: false });

interface Marker {
  line: THREE.Line;
  flag: THREE.Group;
}

/** The selected production buildings' rally points: a dashed line from the building to a small flag. */
export class RallyLines {
  private pool: Marker[] = [];

  constructor(private scene: THREE.Scene, private map: GameMap) {}

  update(buildings: Building[]): void {
    while (this.pool.length < buildings.length) this.pool.push(this.make());
    this.pool.forEach((m, i) => {
      const b = buildings[i];
      const show = !!b?.rally;
      m.line.visible = show;
      m.flag.visible = show;
      if (!show) return;
      const r = b.rally!;
      const pos = m.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k <= SEGMENTS; k++) {
        const t = k / SEGMENTS;
        const x = b.x + (r.x - b.x) * t;
        const z = b.z + (r.z - b.z) * t;
        pos.setXYZ(k, x, this.map.surfaceAt(x, z) + LIFT, z);
      }
      pos.needsUpdate = true;
      m.line.computeLineDistances();
      m.line.geometry.computeBoundingSphere();
      m.flag.position.set(r.x, this.map.surfaceAt(r.x, r.z), r.z);
    });
  }

  private make(): Marker {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const line = new THREE.Line(geo, lineMat);
    line.renderOrder = 997;
    line.frustumCulled = false;
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    const cloth = new THREE.Mesh(flagGeo, flagMat);
    pole.renderOrder = cloth.renderOrder = 997;
    flag.add(pole, cloth);
    this.scene.add(line, flag);
    return { line, flag };
  }
}
