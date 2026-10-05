import * as THREE from 'three';
import {
  BUILDING_TAGS, BUILDINGS, HARVEST_UPGRADE, HARVESTER, NITRO, TEAM_COLORS, TILE, UNITS,
  type BuildingDef, type BuildingType, type Tag, type Team, type UnitDef, type UnitType,
} from './config';
import type { Game } from './game';
import { SPICE, type Cell, type MoveClass } from './map';
import { disposeParts, makeBuildingModel, makeLevelKit, makeUnitModel, makeUpgradeKit } from './models';
import { findPath, type Point } from './pathfinding';

const barGeo = new THREE.PlaneGeometry(1, 1);
barGeo.translate(0.5, 0, 0); // anchor on the left edge so scale.x shrinks toward the left
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.8 });
const barMats = {
  good: new THREE.MeshBasicMaterial({ color: 0x4cd04c, depthTest: false, transparent: true }),
  mid: new THREE.MeshBasicMaterial({ color: 0xe0c030, depthTest: false, transparent: true }),
  bad: new THREE.MeshBasicMaterial({ color: 0xe03a2a, depthTest: false, transparent: true }),
};
const ringMats = [
  new THREE.MeshBasicMaterial({ color: 0x7cff7c, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0xff6a5a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
];

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export abstract class Entity {
  abstract readonly kind: 'unit' | 'building';
  abstract readonly radius: number;
  abstract readonly name: string;
  abstract readonly tags: readonly Tag[];
  hp: number;
  dead = false;
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

export class Building extends Entity {
  readonly kind = 'building';
  readonly tags = BUILDING_TAGS;
  readonly def: BuildingDef;
  readonly radius: number;
  readonly size: number;
  readonly spinner: THREE.Object3D | null;
  level = 1;

  constructor(id: number, team: Team, readonly type: BuildingType, readonly cx: number, readonly cz: number, groundY: number) {
    const def = BUILDINGS[type];
    super(id, team, def.hp, def.size * TILE * 0.8, 4.8, (def.size * TILE) / 2 + 0.1, true);
    this.def = def;
    this.size = def.size;
    this.radius = (def.size * TILE) / 2;
    this.x = (cx + def.size / 2) * TILE;
    this.z = (cz + def.size / 2) * TILE;
    this.y = groundY;
    const model = makeBuildingModel(type, TEAM_COLORS[team], def.size);
    this.spinner = model.spinner;
    this.root.add(model.group);
    this.root.position.set(this.x, this.y, this.z);
  }

  get name(): string {
    return this.level >= 2 && this.def.levelUp ? this.def.levelUp.name : this.def.name;
  }

  setLevel(level: number): void {
    this.level = level;
    if (level >= 2) this.root.add(makeLevelKit(this.type, TEAM_COLORS[this.team]));
  }

  /** Cell in front of the building where units exit / harvesters dock. */
  frontCell(): Cell {
    return { cx: this.cx + Math.floor(this.size / 2), cz: this.cz + this.size };
  }
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; z: number }
  | { kind: 'amove'; x: number; z: number }
  | { kind: 'attack'; target: Entity }
  | { kind: 'harvest' };

type HarvestState = 'seek' | 'toSpice' | 'harvest' | 'toRefinery' | 'unload';

export class Unit extends Entity {
  readonly kind = 'unit';
  readonly def: UnitDef;
  readonly radius: number;
  readonly moveClass: MoveClass;
  heading: number;
  turretHeading: number;
  order: Order = { kind: 'idle' };
  /** Enemy units and structures destroyed by this unit. */
  kills = 0;
  target: Entity | null = null;
  path: Point[] = [];
  private body: THREE.Group;
  private turret: THREE.Group | null;
  /** Parts showing researched upgrades, rebuilt when the team's upgrades change. */
  private kit: { key: string; body: THREE.Group; turret: THREE.Group } | null = null;
  private muzzle: THREE.Object3D;
  private cooldown = 0;
  private scanTimer = Math.random() * 0.5;
  private repathTimer = 0;
  private chasing = false;
  private progressTimer = 0;
  private lastX = 0;
  private lastZ = 0;

  // Harvester state.
  cargo = 0;
  hstate: HarvestState = 'seek';
  spiceCell: Cell | null = null;
  refinery: Building | null = null;
  private lastSpice: Cell | null = null;
  private puffTimer = 0;

  constructor(id: number, team: Team, readonly type: UnitType, x: number, z: number, heading = 0) {
    const def = UNITS[type];
    super(id, team, def.hp, Math.max(1.2, def.radius * 1.8), def.infantry ? 1.6 : 2.0, def.radius + 0.25, false);
    this.def = def;
    this.radius = def.radius;
    this.moveClass = def.infantry ? 'foot' : 'vehicle';
    this.x = x;
    this.z = z;
    this.lastX = x;
    this.lastZ = z;
    this.heading = heading;
    this.turretHeading = heading;
    const model = makeUnitModel(type, TEAM_COLORS[team]);
    this.body = model.body;
    this.turret = model.turret;
    this.muzzle = model.muzzle;
    this.root.add(this.body);
  }

  get name(): string {
    return this.def.name;
  }

  get tags(): readonly Tag[] {
    return this.def.tags;
  }

  speed(game: Game): number {
    const ups = game.teams[this.team].upgrades;
    if (this.type === 'harvester' && ups.has('harvest')) return this.def.speed * HARVEST_UPGRADE.speed;
    if (this.type === 'trike' && ups.has('nitro')) return this.def.speed * NITRO.speed;
    return this.def.speed;
  }

  muzzleWorld(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(new THREE.Vector3());
  }

  // ---- Orders ---------------------------------------------------------------

  command(game: Game, order: Order): void {
    this.order = order;
    this.target = null;
    this.chasing = false;
    this.path = [];
    if (order.kind === 'move' || order.kind === 'amove') this.setPath(game, order.x, order.z);
  }

  commandHarvest(game: Game, cell: Cell | null): void {
    this.command(game, { kind: 'harvest' });
    if (cell && game.map.tile(cell.cx, cell.cz) === SPICE) {
      this.spiceCell = cell;
      this.hstate = 'toSpice';
      this.setPath(game, game.map.center(cell.cx), game.map.center(cell.cz));
    } else {
      this.hstate = this.cargo > 0 ? 'toRefinery' : 'seek';
      this.refinery = null;
    }
  }

  commandReturn(game: Game, refinery: Building): void {
    this.command(game, { kind: 'harvest' });
    this.hstate = 'toRefinery';
    this.refinery = refinery;
    this.setDockPath(game);
  }

  onDamaged(attacker: Unit | null): void {
    if (!attacker || attacker.dead || !this.def.weapon) return;
    if (this.order.kind === 'idle' && !this.target) this.target = attacker;
  }

  setPath(game: Game, x: number, z: number): void {
    this.path = findPath(game.map, this.x, this.z, x, z, this.moveClass);
    this.progressTimer = 0;
    this.lastX = this.x;
    this.lastZ = this.z;
  }

  // ---- Update ---------------------------------------------------------------

  update(game: Game, dt: number): void {
    this.cooldown -= dt;
    this.scanTimer -= dt;
    const weapon = this.def.weapon;

    // Pick or drop the current target.
    if (this.order.kind === 'attack') {
      if (this.order.target.dead) {
        this.order = { kind: 'idle' };
        this.target = null;
        this.path = [];
      } else {
        this.target = this.order.target;
      }
    } else if (weapon && (this.order.kind === 'idle' || this.order.kind === 'amove')) {
      if (this.target && (this.target.dead || distTo(this.target, this.x, this.z) > this.def.sight * 1.3)) {
        this.target = null;
        if (this.order.kind === 'idle') this.path = [];
      }
      if (!this.target && this.scanTimer <= 0) {
        this.scanTimer = 0.4 + Math.random() * 0.2;
        this.target = game.nearestEnemy(this.team, this.x, this.z, this.def.sight, this);
      }
    } else {
      this.target = null;
    }

    let aiming = false;
    if (this.target && weapon) {
      aiming = this.engage(game, this.target, dt);
    } else {
      switch (this.order.kind) {
        case 'move':
        case 'amove':
          if (this.chasing) {
            this.chasing = false;
            this.setPath(game, this.order.x, this.order.z);
          }
          if (this.followPath(game, dt)) this.order = { kind: 'idle' };
          break;
        case 'harvest':
          this.updateHarvester(game, dt);
          break;
        case 'idle':
        case 'attack':
          break;
      }
    }

    if (this.turret && !aiming) this.turretHeading = this.rotateToward(this.turretHeading, this.heading, 3 * dt);
    this.checkStuck(game, dt);
  }

  /** Moves into range of the target and fires. Returns true while the turret is aiming at it. */
  private engage(game: Game, target: Entity, dt: number): boolean {
    const w = game.weaponFor(this, target)!;
    const d = distTo(target, this.x, this.z);
    const angle = Math.atan2(target.z - this.z, target.x - this.x);
    if (d < w.minRange) {
      // Too close to fire: back away from the target to open the distance.
      this.chasing = true;
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.path.length === 0) {
        this.repathTimer = 0.6;
        const away = w.minRange + TILE * 1.5;
        this.setPath(game, target.x - Math.cos(angle) * (d + away), target.z - Math.sin(angle) * (d + away));
      }
      this.followPath(game, dt);
      return false;
    }
    if (d <= game.rangeFor(this, w, target)) {
      this.path = [];
      let aligned: boolean;
      if (this.turret) {
        this.turretHeading = this.rotateToward(this.turretHeading, angle, 4 * dt);
        aligned = Math.abs(wrapAngle(angle - this.turretHeading)) < 0.12;
      } else {
        this.heading = this.rotateToward(this.heading, angle, this.def.turnRate * dt);
        aligned = Math.abs(wrapAngle(angle - this.heading)) < 0.2;
      }
      if (aligned && this.cooldown <= 0) {
        game.fire(this, target, w);
        this.cooldown = game.cooldownFor(this, w) * (0.9 + Math.random() * 0.2);
      }
      return true;
    }
    this.chasing = true;
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.repathTimer = 1 + Math.random() * 0.3;
      this.setPath(game, target.x, target.z);
    }
    this.followPath(game, dt);
    return false;
  }

  /** Steps along the path. Returns true once the path is finished (or empty). */
  private followPath(game: Game, dt: number): boolean {
    if (this.path.length === 0) return true;
    const wp = this.path[0];
    const dx = wp.x - this.x;
    const dz = wp.z - this.z;
    const d = Math.hypot(dx, dz);
    const last = this.path.length === 1;
    if (d < (last ? 0.3 : 0.9)) {
      this.path.shift();
      return this.path.length === 0;
    }
    const desired = Math.atan2(dz, dx);
    this.heading = this.rotateToward(this.heading, desired, this.def.turnRate * dt);
    const diff = Math.abs(wrapAngle(desired - this.heading));
    const align = this.def.infantry ? 1 : Math.max(0, Math.cos(diff));
    if (diff < 1.3 || this.def.infantry) {
      const step = Math.min(d, this.speed(game) * dt * align);
      const nx = this.x + (dx / d) * step;
      const nz = this.z + (dz / d) * step;
      if (!game.canMove(this, nx, nz)) {
        // Pushed off the planned line and now facing a level edge: plan again from here.
        const goal = this.path[this.path.length - 1];
        this.setPath(game, goal.x, goal.z);
        return false;
      }
      this.x = nx;
      this.z = nz;
    }
    return false;
  }

  /** If a moving unit hasn't made progress for a while, repath or give up when close. */
  private checkStuck(game: Game, dt: number): void {
    if (this.path.length === 0) {
      this.progressTimer = 0;
      this.lastX = this.x;
      this.lastZ = this.z;
      return;
    }
    this.progressTimer += dt;
    if (this.progressTimer < 1.2) return;
    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
    if (moved < this.speed(game) * 0.25) {
      const goal = this.path[this.path.length - 1];
      if (Math.hypot(goal.x - this.x, goal.z - this.z) < TILE * 2.5) this.path = [];
      else this.setPath(game, goal.x, goal.z);
    }
    this.progressTimer = 0;
    this.lastX = this.x;
    this.lastZ = this.z;
  }

  private rotateToward(current: number, desired: number, maxStep: number): number {
    const diff = wrapAngle(desired - current);
    if (Math.abs(diff) <= maxStep) return desired;
    return wrapAngle(current + Math.sign(diff) * maxStep);
  }

  private setDockPath(game: Game): void {
    if (!this.refinery) return;
    const dock = game.dockCell(this.refinery);
    this.setPath(game, game.map.center(dock.cx), game.map.center(dock.cz));
  }

  private updateHarvester(game: Game, dt: number): void {
    const map = game.map;
    const team = game.teams[this.team];
    const capacity = HARVESTER.capacity * (team.upgrades.has('harvest') ? HARVEST_UPGRADE.capacity : 1);

    switch (this.hstate) {
      case 'seek': {
        if (this.cargo >= capacity) {
          this.hstate = 'toRefinery';
          this.refinery = null;
          break;
        }
        const from = this.lastSpice ?? { cx: map.cellOf(this.x), cz: map.cellOf(this.z) };
        const cell = game.findSpice(from.cx, from.cz, this);
        if (!cell) {
          if (this.cargo > 0) {
            this.hstate = 'toRefinery';
            this.refinery = null;
          } else {
            this.order = { kind: 'idle' };
          }
          break;
        }
        this.spiceCell = cell;
        this.hstate = 'toSpice';
        this.setPath(game, map.center(cell.cx), map.center(cell.cz));
        break;
      }
      case 'toSpice': {
        const c = this.spiceCell;
        if (!c || map.tile(c.cx, c.cz) !== SPICE) {
          this.hstate = 'seek';
          break;
        }
        if (this.followPath(game, dt)) this.hstate = 'harvest';
        break;
      }
      case 'harvest': {
        const c = this.spiceCell;
        if (!c || map.tile(c.cx, c.cz) !== SPICE) {
          if (c) this.lastSpice = c;
          this.hstate = 'seek';
          break;
        }
        if (Math.hypot(map.center(c.cx) - this.x, map.center(c.cz) - this.z) > TILE * 1.2) {
          this.hstate = 'toSpice';
          this.setPath(game, map.center(c.cx), map.center(c.cz));
          break;
        }
        this.lastSpice = c;
        this.cargo += map.takeSpice(c.cx, c.cz, HARVESTER.rate * dt);
        game.terrain.refreshTile(c.cx, c.cz);
        this.heading += Math.sin(game.time * 1.5) * dt * 0.5;
        this.puffTimer -= dt;
        if (this.puffTimer <= 0) {
          this.puffTimer = 0.25;
          const p = new THREE.Vector3(this.x + Math.cos(this.heading) * 1.2, this.y + 0.3, this.z + Math.sin(this.heading) * 1.2);
          game.effects.puff(p, 0xd88a3a);
        }
        if (this.cargo >= capacity) {
          this.hstate = 'toRefinery';
          this.refinery = null;
        }
        break;
      }
      case 'toRefinery': {
        if (!this.refinery || this.refinery.dead) {
          this.refinery = game.nearestBuilding(this.team, 'refinery', this.x, this.z);
          if (!this.refinery) break; // wait until a refinery exists
          this.setDockPath(game);
        }
        if (this.followPath(game, dt)) {
          const dock = game.dockCell(this.refinery);
          if (Math.hypot(map.center(dock.cx) - this.x, map.center(dock.cz) - this.z) < TILE * 1.3) this.hstate = 'unload';
          else this.setDockPath(game);
        }
        break;
      }
      case 'unload': {
        if (!this.refinery || this.refinery.dead) {
          this.hstate = 'toRefinery';
          this.refinery = null;
          break;
        }
        const face = Math.atan2(this.refinery.z - this.z, this.refinery.x - this.x) + Math.PI;
        this.heading = this.rotateToward(this.heading, face, this.def.turnRate * dt);
        const amount = Math.min(this.cargo, HARVESTER.unloadRate * dt);
        this.cargo -= amount;
        team.credits += amount;
        team.stats.spiceHarvested += amount;
        if (this.cargo <= 0.01) {
          this.cargo = 0;
          this.hstate = 'seek';
        }
        break;
      }
    }
  }

  private refreshKit(game: Game): void {
    const ts = game.teams[this.team];
    const look = {
      weapons: game.tier(this.team, 'weapons'),
      armor: game.tier(this.team, 'armor'),
      rockets: ts.upgrades.has('rockets'),
      nitro: ts.upgrades.has('nitro'),
      harvest: ts.upgrades.has('harvest'),
    };
    const key = `${look.weapons}${look.armor}${+look.rockets}${+look.nitro}${+look.harvest}`;
    if (this.kit?.key === key) return;
    if (this.kit) {
      this.kit.body.removeFromParent();
      this.kit.turret.removeFromParent();
      disposeParts(this.kit.body);
      disposeParts(this.kit.turret);
    }
    const parts = makeUpgradeKit(this.type, look, TEAM_COLORS[this.team]);
    this.body.add(parts.body);
    (this.turret ?? this.body).add(parts.turret);
    this.kit = { key, ...parts };
  }

  syncVisual(game: Game, dt: number): void {
    this.refreshKit(game);
    const groundY = game.map.surfaceAt(this.x, this.z);
    this.y += (groundY - this.y) * Math.min(1, dt * 10);
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.y = -this.heading;
    if (this.turret) this.turret.rotation.y = -(this.turretHeading - this.heading);
  }
}

/** Edge-to-point distance: footprint edge for buildings, hull edge for units. */
export function distTo(e: Entity, x: number, z: number): number {
  if (e instanceof Building) {
    const half = (e.size * TILE) / 2;
    const dx = Math.max(Math.abs(x - e.x) - half, 0);
    const dz = Math.max(Math.abs(z - e.z) - half, 0);
    return Math.hypot(dx, dz);
  }
  return Math.max(0, Math.hypot(e.x - x, e.z - z) - e.radius);
}
