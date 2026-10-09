import * as THREE from 'three';
import {
  BUILDINGS, CARRYALL, HARVEST_UPGRADE, HARVESTER, NITRO, REPAIR_COST, TEAM_COLORS, TILE, shieldsFor, unitDef,
  type Faction, type Tag, type Team, type UnitDef, type UnitType,
} from '../config';
import type { Game } from '../game/game';
import { findPath, type Point } from '../game/pathfinding';
import { SPICE, type Cell, type MoveClass } from '../map';
import { disposeParts, makeParachute, makeUnitModel, makeUpgradeKit } from '../models';
import { Building } from './building';
import { distTo } from './distance';
import { Entity } from './entity';
import { hypot } from '../game/hypot';

/** Steepest a vehicle leans to follow the ground, so cliff-foot slopes don't stand it on end. */
const MAX_TILT = THREE.MathUtils.degToRad(25);
const UP = new THREE.Vector3(0, 1, 0);
const tmpNormal = new THREE.Vector3();
const tilt = new THREE.Quaternion();
const yaw = new THREE.Quaternion();

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; z: number }
  | { kind: 'amove'; x: number; z: number }
  | { kind: 'attack'; target: Entity }
  | { kind: 'harvest' }
  | { kind: 'repair'; target: Entity }
  | { kind: 'enter'; target: Building };

/** Combat aircraft (the Sky Raider) fly this high over the ground. */
const AIR_HEIGHT = CARRYALL.altitude - 2;

/** Paratroopers come down at this speed; vehicles on their bigger canopies a little slower. */
const FALL_SPEED = { foot: 2.2, vehicle: 1.7 };

/** Whether a repair vehicle can mend this: structures and anything mechanical, not infantry. */
export function repairable(e: Entity): boolean {
  return e instanceof Building || !(e as Unit).def.infantry;
}

type HarvestState = 'seek' | 'toSpice' | 'harvest' | 'toRefinery' | 'unload';

/** A harvester's spot at a refinery: a cell along one of its sides, and the way out from the wall. */
export interface Dock {
  ref: Building;
  cell: Cell;
  out: { dx: number; dz: number };
}

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
  /** The Carryall this unit is riding in, if any: it's off the map until dropped. */
  /** The Carryall carrying this unit, or the bunker it's in. */
  carrier: Unit | Building | null = null;
  /** Paratrooper on the way down: drifts toward the landing cell under its parachute. */
  falling: { x: number; z: number; chute: THREE.Object3D } | null = null;
  protected body: THREE.Group;
  private turret: THREE.Group | null;
  /** Parts showing researched upgrades, rebuilt when the team's upgrades change. */
  private kit: { key: string; body: THREE.Group; turret: THREE.Group } | null = null;
  private muzzle: THREE.Object3D;
  /** Seconds until the weapon can fire again (also counted down by a bunker the unit is in). */
  cooldown = 0;
  private scanTimer = 0;
  /** Turreted units: what the turret shoots at while the hull does something else (driving, chasing). */
  private sideTarget: Entity | null = null;
  private sideScanTimer = 0;
  /** Vehicles: smoothed ground normal the hull leans to. */
  private groundUp = new THREE.Vector3(0, 1, 0);
  private repathTimer = 0;
  private sparkTimer = 0;
  private chasing = false;
  private progressTimer = 0;
  private lastX = 0;
  private lastZ = 0;
  /** Drawn pose at the previous and the latest tick; frames draw the unit in between (see Game.frame). */
  private pose = { from: new THREE.Vector3(), to: new THREE.Vector3(), qFrom: new THREE.Quaternion(), qTo: new THREE.Quaternion(), fresh: true };

  // Harvester state.
  cargo = 0;
  hstate: HarvestState = 'seek';
  spiceCell: Cell | null = null;
  refinery: Building | null = null;
  /** Where at the refinery this trip unloads, picked on the way back. */
  dock: Dock | null = null;
  /** Unloading: 0 turning its back to the wall, 1 backing in, 2 parked against it. */
  private dockPhase = 0;
  private lastSpice: Cell | null = null;
  private puffTimer = 0;

  constructor(id: number, team: Team, readonly type: UnitType, x: number, z: number, heading = 0, readonly faction: Faction = 'atreides') {
    const def = unitDef(faction, type);
    super(id, team, def.hp, shieldsFor(faction, def), Math.max(1.2, def.radius * 1.8), def.infantry ? 1.6 : 2.0, def.radius + 0.25);
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

  /** Spreads units' target scans over time, so a batch built together doesn't scan on the same tick. */
  stagger(random: () => number): void {
    this.scanTimer = random() * 0.5;
    this.sideScanTimer = random() * 0.3;
  }

  /** Start of a simulation step: the scene object goes back to where the last step left it. */
  beginTick(): void {
    if (this.pose.fresh) return;
    this.root.position.copy(this.pose.to);
    this.body.quaternion.copy(this.pose.qTo);
    this.pose.from.copy(this.pose.to);
    this.pose.qFrom.copy(this.pose.qTo);
  }

  /** End of a simulation step: remember the pose it left the scene object in. */
  endTick(): void {
    const p = this.pose;
    p.to.copy(this.root.position);
    p.qTo.copy(this.body.quaternion);
    if (p.fresh) {
      p.from.copy(p.to);
      p.qFrom.copy(p.qTo);
      p.fresh = false;
    }
  }

  /** Draws the unit `alpha` of the way from the previous tick's pose to the latest one. */
  interpolate(alpha: number): void {
    const p = this.pose;
    if (p.fresh) return;
    this.root.position.lerpVectors(p.from, p.to, alpha);
    this.body.quaternion.slerpQuaternions(p.qFrom, p.qTo, alpha);
  }

  get tags(): readonly Tag[] {
    return this.def.tags;
  }

  speed(game: Game): number {
    const ups = game.teams[this.team].upgrades;
    if (this.type === 'harvester' && game.tier(this.team, 'harvest')) return this.def.speed * HARVEST_UPGRADE.speed;
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
    if (order.kind === 'enter') this.setPath(game, order.target.x, order.target.z);
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
    this.dock = null;
    this.setDockPath(game);
  }

  /** Called after a Carryall sets this unit down: pick up whatever it was doing from the new spot. */
  resumeAfterDrop(game: Game): void {
    this.path = [];
    this.target = null;
    this.chasing = false;
    const o = this.order;
    if (o.kind === 'move' || o.kind === 'amove') this.setPath(game, o.x, o.z);
    else if (o.kind === 'harvest') {
      if (this.hstate === 'toSpice' && this.spiceCell) this.setPath(game, game.map.center(this.spiceCell.cx), game.map.center(this.spiceCell.cz));
      else if (this.hstate === 'toRefinery') this.setDockPath(game);
    }
  }

  /** A harvester's current destination while it's driving to spice or back to a refinery, else null. */
  travelGoal(game: Game): Point | null {
    if (this.order.kind !== 'harvest') return null;
    if (this.hstate === 'toSpice' && this.spiceCell) return { x: game.map.center(this.spiceCell.cx), z: game.map.center(this.spiceCell.cz) };
    if (this.hstate === 'toRefinery') {
      if (!this.refinery || this.refinery.dead) this.refinery = game.nearestBuilding(this.team, 'refinery', this.x, this.z);
      const dock = this.dockAt(game);
      if (!dock) return null;
      return { x: game.map.center(dock.cell.cx), z: game.map.center(dock.cell.cz) };
    }
    return null;
  }

  /** Harvester under fire: abandon the field and head home to the refinery. Returns false if it's already there. */
  retreat(game: Game): boolean {
    if (this.order.kind !== 'harvest' || this.hstate === 'unload') return false;
    const ref = game.nearestBuilding(this.team, 'refinery', this.x, this.z);
    if (!ref || hypot(ref.x - this.x, ref.z - this.z) < 8 * TILE) return false;
    this.hstate = 'toRefinery';
    this.refinery = ref;
    this.dock = null;
    this.path = [];
    return true;
  }

  /** Jumps from an aircraft at (x, y, z) and comes down by parachute on the nearest open cell. */
  startFall(game: Game, x: number, y: number, z: number): void {
    const m = game.map;
    const cell = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, this.moveClass), 16) ?? { cx: m.cellOf(x), cz: m.cellOf(z) };
    const chute = makeParachute(TEAM_COLORS[this.team], this.def.infantry ? 1 : 1.9);
    this.root.add(chute);
    this.root.visible = true;
    this.falling = { x: m.center(cell.cx) + (game.random() - 0.5) * 0.8, z: m.center(cell.cz) + (game.random() - 0.5) * 0.8, chute };
    this.x = x;
    this.z = z;
    this.y = y;
    this.order = { kind: 'idle' };
    this.path = [];
    this.target = null;
  }

  updateFall(game: Game, dt: number): void {
    const f = this.falling!;
    const dx = f.x - this.x;
    const dz = f.z - this.z;
    const d = hypot(dx, dz);
    const step = Math.min(d, 1.6 * dt);
    if (d > 1e-3) {
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
    }
    this.y -= FALL_SPEED[this.moveClass] * dt;
    const ground = game.map.surfaceAt(this.x, this.z);
    if (this.y <= ground) {
      this.y = ground;
      this.x = f.x;
      this.z = f.z;
      this.root.remove(f.chute);
      this.falling = null;
    }
  }

  /** Hangs under a Carryall: follows it, level with its heading. */
  hangAt(x: number, y: number, z: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.turretHeading = heading;
    this.groundUp.set(0, 1, 0);
    this.root.position.set(x, y, z);
    this.body.quaternion.setFromAxisAngle(UP, -heading);
    if (this.turret) this.turret.rotation.y = 0;
  }

  onDamaged(attacker: Entity | null): void {
    if (!attacker || attacker.dead || !this.def.weapon) return;
    if (this.order.kind === 'idle' && !this.target) this.target = attacker;
  }

  setPath(game: Game, x: number, z: number): void {
    // Aircraft fly straight over everything, staying over the map.
    const edge = game.map.worldSize() - TILE;
    this.path = this.def.air
      ? [{ x: THREE.MathUtils.clamp(x, TILE, edge), z: THREE.MathUtils.clamp(z, TILE, edge) }]
      : findPath(game.map, this.x, this.z, x, z, this.moveClass);
    this.progressTimer = 0;
    this.lastX = this.x;
    this.lastZ = this.z;
  }

  // ---- Update ---------------------------------------------------------------

  update(game: Game, dt: number): void {
    this.cooldown -= dt;
    this.scanTimer -= dt;
    this.sideScanTimer -= dt;
    const weapon = this.def.weapon;

    // Pick or drop the current target.
    if (this.order.kind === 'attack') {
      const t = this.order.target;
      if (t.dead || !game.weaponFor(this, t)) {
        this.order = { kind: 'idle' };
        this.target = null;
        this.path = [];
      } else if (!game.sees(this.team, t)) {
        // Lost in the fog: go to where it was last seen, fighting on the way.
        this.command(game, { kind: 'amove', x: t.x, z: t.z });
      } else {
        this.target = this.order.target;
      }
    } else if (weapon && (this.order.kind === 'idle' || this.order.kind === 'amove')) {
      // Also dropped if it can't be hit at all (an aircraft that shot at a unit without anti-air).
      const t = this.target;
      if (t && (t.dead || !game.sees(this.team, t) || distTo(t, this.x, this.z) > this.def.sight * 1.3 || !game.weaponFor(this, t))) {
        this.target = null;
        if (this.order.kind === 'idle') this.path = [];
      }
      if (!this.target && this.scanTimer <= 0) {
        this.scanTimer = 0.4 + game.random() * 0.2;
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
          // With a Carryall assigned, wait for the lift instead of setting off on a long drive.
          if (!game.ferryFor(this)?.wantsToLift(game, this)) this.updateHarvester(game, dt);
          break;
        case 'repair':
          this.updateRepair(game, this.order.target, dt);
          break;
        case 'enter': {
          // Walk to the bunker and get in, if there's still room when we arrive.
          const b = this.order.target;
          if (b.dead || b.room <= 0 || b.team !== this.team) {
            this.order = { kind: 'idle' };
            this.path = [];
          } else if (distTo(b, this.x, this.z) < TILE * 0.75) game.enterBunker(this, b);
          else if (this.followPath(game, dt)) this.setPath(game, b.x, b.z);
          break;
        }
        case 'idle':
          if (this.def.repair && this.scanTimer <= 0) {
            this.scanTimer = 0.8 + game.random() * 0.4;
            const job = game.damagedFriend(this, this.def.sight);
            if (job) this.command(game, { kind: 'repair', target: job });
          }
          break;
        case 'attack':
          break;
      }
    }

    if (this.turret && weapon && !aiming) aiming = this.fireOnTheMove(game, dt);
    if (this.turret && !aiming) this.turretHeading = this.rotateToward(this.turretHeading, this.heading, 3 * dt);
    this.checkStuck(game, dt);
  }

  /**
   * Turreted units fire while the hull is busy: driving on a move order, chasing a target that's out of range,
   * or backing away from one inside minimum range. The turret takes the current target when it's in range,
   * otherwise the best enemy within reach. Returns true while the turret is aiming.
   */
  private fireOnTheMove(game: Game, dt: number): boolean {
    const inReach = (e: Entity | null): e is Entity => {
      if (!e || e.dead || !game.sees(this.team, e)) return false;
      const w = game.weaponFor(this, e);
      if (!w) return false;
      const d = distTo(e, this.x, this.z);
      return d >= w.minRange && d <= game.rangeFor(this, w, e);
    };
    if (inReach(this.target)) this.sideTarget = this.target;
    else if (!inReach(this.sideTarget)) {
      this.sideTarget = null;
      if (this.sideScanTimer <= 0) {
        this.sideScanTimer = 0.3 + game.random() * 0.1;
        // A little past nominal range, since shooting down from high ground reaches further.
        const found = game.nearestEnemy(this.team, this.x, this.z, this.def.weapon!.range * 1.1, this);
        if (inReach(found)) this.sideTarget = found;
      }
    }
    const target = this.sideTarget;
    if (!target) return false;
    const angle = Math.atan2(target.z - this.z, target.x - this.x);
    this.turretHeading = this.rotateToward(this.turretHeading, angle, 4 * dt);
    if (Math.abs(wrapAngle(angle - this.turretHeading)) < 0.12 && this.cooldown <= 0) {
      const w = game.weaponFor(this, target)!;
      game.fire(this, target, w);
      this.cooldown = game.cooldownFor(this, w) * (0.9 + game.random() * 0.2);
    }
    return true;
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
        this.cooldown = game.cooldownFor(this, w) * (0.9 + game.random() * 0.2);
      }
      return true;
    }
    this.chasing = true;
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.repathTimer = 1 + game.random() * 0.3;
      this.setPath(game, target.x, target.z);
    }
    this.followPath(game, dt);
    return false;
  }

  /** Drives up to a damaged friendly unit or structure and mends it, paying as it goes. */
  private updateRepair(game: Game, target: Entity, dt: number): void {
    const rep = this.def.repair!;
    if (target.dead || target.hp >= target.maxHp || (target instanceof Unit && (target.carrier || target.falling))) {
      this.order = { kind: 'idle' };
      this.path = [];
      return;
    }
    const d = distTo(target, this.x, this.z);
    if (d > rep.range) {
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.path.length === 0) {
        this.repathTimer = 1;
        this.setPath(game, target.x, target.z);
      }
      this.followPath(game, dt);
      return;
    }
    this.path = [];
    this.heading = this.rotateToward(this.heading, Math.atan2(target.z - this.z, target.x - this.x), this.def.turnRate * dt);
    const price = target instanceof Unit ? target.def.cost : BUILDINGS[(target as Building).type].cost;
    const hp = Math.min(rep.rate * dt, target.maxHp - target.hp);
    if (!game.pay(this.team, (hp / target.maxHp) * price * REPAIR_COST)) return;
    target.hp += hp;
    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.12 + Math.random() * 0.1;
      const p = target.aimPoint();
      const spread = target instanceof Building ? target.radius * 0.7 : target.radius * 0.6;
      p.x += (Math.random() - 0.5) * spread;
      p.z += (Math.random() - 0.5) * spread;
      p.y += (Math.random() - 0.3) * 0.5;
      game.effects.flash(p, 0.12);
      if (Math.random() < 0.4) game.effects.puff(p, 0xffd27a);
    }
  }

  /** Steps along the path. Returns true once the path is finished (or empty). */
  private followPath(game: Game, dt: number): boolean {
    if (this.path.length === 0) return true;
    const wp = this.path[0];
    const dx = wp.x - this.x;
    const dz = wp.z - this.z;
    const d = hypot(dx, dz);
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
      if (!this.def.air && !game.canMove(this, nx, nz)) {
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
    const moved = hypot(this.x - this.lastX, this.z - this.lastZ);
    if (moved < this.speed(game) * 0.25) {
      const goal = this.path[this.path.length - 1];
      if (hypot(goal.x - this.x, goal.z - this.z) < TILE * 2.5) this.path = [];
      else this.setPath(game, goal.x, goal.z);
    }
    this.progressTimer = 0;
    this.lastX = this.x;
    this.lastZ = this.z;
  }

  protected rotateToward(current: number, desired: number, maxStep: number): number {
    const diff = wrapAngle(desired - current);
    if (Math.abs(diff) <= maxStep) return desired;
    return wrapAngle(current + Math.sign(diff) * maxStep);
  }

  /** This trip's dock at the current refinery, picked the first time it's asked for. */
  private dockAt(game: Game): Dock | null {
    if (!this.refinery) return null;
    if (this.dock?.ref !== this.refinery) this.dock = { ref: this.refinery, ...game.dockFor(this, this.refinery) };
    return this.dock;
  }

  private setDockPath(game: Game): void {
    const dock = this.dockAt(game);
    if (!dock) return;
    this.dockPhase = 0;
    this.setPath(game, game.map.center(dock.cell.cx), game.map.center(dock.cell.cz));
  }

  private updateHarvester(game: Game, dt: number): void {
    const map = game.map;
    const team = game.teams[this.team];
    const capacity = HARVESTER.capacity * (game.tier(this.team, 'harvest') ? HARVEST_UPGRADE.capacity : 1);

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
        if (hypot(map.center(c.cx) - this.x, map.center(c.cz) - this.z) > TILE * 1.2) {
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
          const dock = this.dockAt(game)!;
          if (hypot(map.center(dock.cell.cx) - this.x, map.center(dock.cell.cz) - this.z) < TILE * 1.3) {
            this.hstate = 'unload';
            this.dockPhase = 0;
          } else this.setDockPath(game);
        }
        break;
      }
      case 'unload': {
        if (!this.refinery || this.refinery.dead) {
          this.hstate = 'toRefinery';
          this.refinery = null;
          break;
        }
        // Backs in: turns its rear to the wall, then reverses up to it. Purely for the look: the spice flows from the
        // moment it arrives, as it did when harvesters just turned on the spot.
        const dock = this.dockAt(game)!;
        if (this.dockPhase === 0) {
          const face = Math.atan2(dock.out.dz, dock.out.dx);
          this.heading = this.rotateToward(this.heading, face, this.def.turnRate * dt);
          if (Math.abs(wrapAngle(face - this.heading)) < 0.05) this.dockPhase = 1;
        } else if (this.dockPhase === 1) {
          // The spot against the wall: the dock cell's center, pulled toward the refinery.
          const tx = map.center(dock.cell.cx) - dock.out.dx * TILE * 0.3;
          const tz = map.center(dock.cell.cz) - dock.out.dz * TILE * 0.3;
          const dx = tx - this.x;
          const dz = tz - this.z;
          const d = hypot(dx, dz);
          const step = this.speed(game) * 0.4 * dt;
          if (d <= step) {
            this.x = tx;
            this.z = tz;
            this.dockPhase = 2;
          } else {
            this.x += (dx / d) * step;
            this.z += (dz / d) * step;
          }
        }
        const amount = Math.min(this.cargo, HARVESTER.unloadRate * dt);
        this.cargo -= amount;
        team.credits += amount;
        team.stats.spiceHarvested += amount;
        if (this.cargo <= 0.01) {
          this.cargo = 0;
          this.hstate = 'seek';
          this.dock = null;
        }
        break;
      }
    }
  }

  protected refreshKit(game: Game): void {
    const ts = game.teams[this.team];
    const look = {
      weapons: game.tier(this.team, 'weapons'),
      armor: game.tier(this.team, 'armor'),
      rockets: ts.upgrades.has('rockets'),
      nitro: ts.upgrades.has('nitro'),
      harvest: game.tier(this.team, 'harvest') > 0,
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
    if (!this.falling) {
      const groundY = game.map.surfaceAt(this.x, this.z) + (this.def.air ? AIR_HEIGHT : 0);
      this.y += (groundY - this.y) * Math.min(1, dt * (this.def.air ? 3 : 10));
    }
    this.root.position.set(this.x, this.y, this.z);
    if (this.falling || this.def.air) {
      this.body.rotation.set(0, -this.heading, Math.sin(game.time * 2.3 + this.id) * 0.08);
    } else if (this.def.infantry) {
      this.body.rotation.set(0, -this.heading, 0);
    } else {
      // Vehicles lean with the ground under their hull (sampled across it, so single facets don't jolt them).
      const m = game.map;
      const r = Math.max(0.6, this.radius);
      const n = tmpNormal.set(
        m.surfaceAt(this.x - r, this.z) - m.surfaceAt(this.x + r, this.z),
        2 * r,
        m.surfaceAt(this.x, this.z - r) - m.surfaceAt(this.x, this.z + r),
      ).normalize();
      if (n.y < Math.cos(MAX_TILT)) {
        const flat = hypot(n.x, n.z);
        const s = Math.sin(MAX_TILT) / flat;
        n.set(n.x * s, Math.cos(MAX_TILT), n.z * s);
      }
      this.groundUp.lerp(n, Math.min(1, dt * 8)).normalize();
      tilt.setFromUnitVectors(UP, this.groundUp);
      yaw.setFromAxisAngle(UP, -this.heading);
      this.body.quaternion.multiplyQuaternions(tilt, yaw);
    }
    if (this.turret) this.turret.rotation.y = -(this.turretHeading - this.heading);
  }
}
