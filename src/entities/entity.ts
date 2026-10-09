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
  /** Shields (Corrino): soak up damage before health and recover on their own. */
  shields: number;
  dead = false;
  /** Game time this last took damage. */
  lastHurt = -Infinity;
  selected = false;
  x = 0;
  z = 0;
  y = 0;
  readonly root = new THREE.Group();
  /** Health bar (hidden by the fog of war along with the rest when out of sight). */
  readonly bar = new THREE.Group();
  private barFg: THREE.Mesh;
  /** Shield bar, a thin blue strip above the health bar (only with shields). */
  private shieldFg: THREE.Mesh | null = null;
  private ring: THREE.Mesh;

  constructor(
    readonly id: number, readonly team: Team, readonly maxHp: number, readonly maxShields: number,
    barWidth: number, barHeight: number, ringRadius: number,
  ) {
    this.hp = maxHp;
    this.shields = maxShields;
    const bg = new THREE.Mesh(barGeo, barBgMat);
    bg.scale.set(barWidth + 0.12, 0.3, 1);
    bg.position.set(-barWidth / 2 - 0.06, 0, 0);
    bg.renderOrder = 998;
    this.barFg = new THREE.Mesh(barGeo, barMats.good);
    this.barFg.scale.set(barWidth, 0.18, 1);
    this.barFg.position.set(-barWidth / 2, 0, 0.001);
    this.barFg.renderOrder = 999;
    this.bar.add(bg, this.barFg);
    if (maxShields > 0) {
      const sbg = new THREE.Mesh(barGeo, barBgMat);
      sbg.scale.set(barWidth + 0.12, 0.2, 1);
      sbg.position.set(-barWidth / 2 - 0.06, 0.25, 0);
      sbg.renderOrder = 998;
      this.shieldFg = new THREE.Mesh(barGeo, barMats.shield);
      this.shieldFg.scale.set(barWidth, 0.1, 1);
      this.shieldFg.position.set(-barWidth / 2, 0.25, 0.001);
      this.shieldFg.renderOrder = 999;
      this.bar.add(sbg, this.shieldFg);
    }
    this.bar.position.y = barHeight;
    this.bar.visible = false; // shown by updateBar once the game runs
    this.bar.userData.width = barWidth;
    this.root.add(this.bar);

    // More segments for bigger rings (buildings) so they stay round.
    const ringGeo = new THREE.RingGeometry(ringRadius - 0.15, ringRadius, Math.max(24, Math.round(ringRadius * 8)));
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
    const sfrac = this.maxShields > 0 ? Math.max(0, this.shields / this.maxShields) : 1;
    this.bar.visible = this.selected || frac < 0.999 || sfrac < 0.999;
    if (!this.bar.visible) return;
    this.bar.quaternion.copy(camera.quaternion);
    this.barFg.scale.x = this.bar.userData.width * frac;
    if (this.shieldFg) {
      this.shieldFg.visible = sfrac > 0;
      this.shieldFg.scale.x = Math.max(1e-3, this.bar.userData.width * sfrac);
    }
    this.barFg.material = frac > 0.6 ? barMats.good : frac > 0.3 ? barMats.mid : barMats.bad;
  }

  /** World position at roughly the entity's middle height, for aiming. */
  aimPoint(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + (this.kind === 'building' ? 1.2 : 0.6), this.z);
  }
}
