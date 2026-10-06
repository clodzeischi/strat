import * as THREE from 'three';
import type { Tag, Team } from '../config';
import { barBgMat, barGeo, barMats, ringMats } from '../materials/overlays';

/** Something on the map with health, a team and a scene object: a unit or a building. */
export abstract class Entity {
  abstract readonly kind: 'unit' | 'building';
  abstract readonly radius: number;
  abstract readonly name: string;
  abstract readonly tags: readonly Tag[];
  hp: number;
  dead = false;
  /** Game time this last took damage. */
  lastHurt = -Infinity;
  selected = false;
  x = 0;
  z = 0;
  y = 0;
  readonly root = new THREE.Group();
  private bar = new THREE.Group();
  private barFg: THREE.Mesh;
  private ring: THREE.Mesh;

  constructor(readonly id: number, readonly team: Team, readonly maxHp: number, barWidth: number, barHeight: number, ringRadius: number, square: boolean) {
    this.hp = maxHp;
    const bg = new THREE.Mesh(barGeo, barBgMat);
    bg.scale.set(barWidth + 0.12, 0.3, 1);
    bg.position.set(-barWidth / 2 - 0.06, 0, 0);
    bg.renderOrder = 998;
    this.barFg = new THREE.Mesh(barGeo, barMats.good);
    this.barFg.scale.set(barWidth, 0.18, 1);
    this.barFg.position.set(-barWidth / 2, 0, 0.001);
    this.barFg.renderOrder = 999;
    this.bar.add(bg, this.barFg);
    this.bar.position.y = barHeight;
    this.bar.visible = false; // shown by updateBar once the game runs
    this.bar.userData.width = barWidth;
    this.root.add(this.bar);

    const seg = square ? 4 : 24;
    const outer = square ? ringRadius * Math.SQRT2 : ringRadius;
    const ringGeo = new THREE.RingGeometry(outer - 0.15, outer, seg);
    ringGeo.rotateZ(square ? Math.PI / 4 : 0);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, ringMats[team === 0 ? 0 : 1]);
    this.ring.position.y = 0.08;
    this.ring.visible = false;
    this.root.add(this.ring);
  }

  setSelected(v: boolean): void {
    this.selected = v;
    this.ring.visible = v;
  }

  updateBar(camera: THREE.Camera): void {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.bar.visible = this.selected || frac < 0.999;
    if (!this.bar.visible) return;
    this.bar.quaternion.copy(camera.quaternion);
    this.barFg.scale.x = this.bar.userData.width * frac;
    this.barFg.material = frac > 0.6 ? barMats.good : frac > 0.3 ? barMats.mid : barMats.bad;
  }

  /** World position at roughly the entity's middle height, for aiming. */
  aimPoint(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + (this.kind === 'building' ? 1.2 : 0.6), this.z);
  }
}
