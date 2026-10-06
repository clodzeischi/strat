import * as THREE from 'three';
import { CARRYALL, TILE, type Team } from '../config';
import type { Game } from '../game/game';
import type { Point } from '../game/pathfinding';
import { CARRYALL_HOOK_Y } from '../models';
import { Unit, type Order } from './unit';

/** How far below the hook a hanging vehicle's wheels are. */
const HANG_DEPTH = 1.35;
/** Lowest the hull comes over the ground when picking up or setting down: a vehicle's height under the hook. */
const LOW = -CARRYALL_HOOK_Y + HANG_DEPTH;

type Task =
  | { kind: 'orbit'; x: number; z: number }
  | { kind: 'move'; x: number; z: number }
  | { kind: 'pickup'; units: Unit[] }
  /** Heavy cargo: a touch-and-go at the drop point. Infantry only: a fly-by parachute drop, then out past the point. */
  | { kind: 'drop'; x: number; z: number; back: Point; heavy: boolean; exit: Point | null; phase: 'in' | 'out' }
  /** Assigned to a harvester: lifts it whenever it starts a long trip and sets it down at the far end. */
  | { kind: 'ferry'; harvester: Unit; goal: Point | null };

const smoothstep = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Heavy-lift aircraft. Flies over everything, carries units and drops them, or ferries one harvester. */
export class Carryall extends Unit {
  /** Units riding along, in load order. */
  load: Unit[] = [];
  task: Task;
  private speedNow = 0;
  private bank = 0;
  private dropTimer = 0;
  private lastDropD = Infinity;

  constructor(id: number, team: Team, x: number, z: number, heading = 0) {
    super(id, team, 'carryall', x, z, heading);
    this.task = { kind: 'orbit', x, z };
  }

  /** Lift space used by the current load. */
  get used(): number {
    return this.load.reduce((sum, u) => sum + (u.def.lift ?? CARRYALL.capacity), 0);
  }

  fits(u: Unit): boolean {
    return u.def.lift !== undefined && !u.carrier && !u.falling && !u.dead && u.team === this.team && this.used + u.def.lift <= CARRYALL.capacity;
  }

  /** Plain unit orders, as given by the shared command code: moves become flights, stop means hold here. */
  command(_game: Game, order: Order): void {
    this.order = { kind: 'idle' };
    this.path = [];
    this.target = null;
    if (order.kind === 'move' || order.kind === 'amove') this.task = { kind: 'move', x: order.x, z: order.z };
    else if (order.kind === 'attack') this.task = { kind: 'move', x: order.target.x, z: order.target.z };
    else this.task = { kind: 'orbit', x: this.x, z: this.z };
  }

  /**
   * Picks up as many of these units as fit, in order. Infantry walk to the pickup point; vehicles wait.
   * A harvester instead becomes this Carryall's assignment. Returns the units it took on.
   */
  orderPickup(game: Game, units: Unit[]): Unit[] {
    const first = units.find((u) => this.fits(u));
    if (first?.type === 'harvester' && this.load.length === 0) {
      this.task = { kind: 'ferry', harvester: first, goal: null };
      return [first];
    }
    const taken: Unit[] = [];
    let space = CARRYALL.capacity - this.used;
    for (const u of units) {
      if (u.type === 'harvester' || !this.fits(u) || u.def.lift! > space) continue;
      space -= u.def.lift!;
      taken.push(u);
    }
    if (taken.length === 0) return [];
    const cx = taken.reduce((s, u) => s + u.x, 0) / taken.length;
    const cz = taken.reduce((s, u) => s + u.z, 0) / taken.length;
    for (const u of taken) u.command(game, u.def.infantry ? { kind: 'move', x: cx, z: cz } : { kind: 'idle' });
    this.task = { kind: 'pickup', units: taken };
    return taken;
  }

  /** Drops the load at a point, then flies back to where it was when ordered. */
  orderDrop(game: Game, x: number, z: number): boolean {
    if (this.load.length === 0) return false;
    const heavy = this.load.some((u) => !u.def.infantry);
    const back = { x: this.x, z: this.z };
    const m = game.map;
    if (heavy) {
      const c = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, 'vehicle'), 20);
      if (!c) return false;
      this.task = { kind: 'drop', x: m.center(c.cx), z: m.center(c.cz), back, heavy, exit: null, phase: 'in' };
    } else {
      // Keep flying past the drop point along the approach line before turning home.
      const d = Math.hypot(x - this.x, z - this.z) || 1;
      const exit = { x: x + ((x - this.x) / d) * 14, z: z + ((z - this.z) / d) * 14 };
      this.task = { kind: 'drop', x, z, back, heavy, exit, phase: 'in' };
    }
    this.lastDropD = Infinity;
    return true;
  }

  /** Destroyed in the air: everyone aboard is released (the game decides their fate). */
  releaseAll(): Unit[] {
    const out = this.load;
    this.load = [];
    for (const u of out) u.carrier = null;
    return out;
  }

  // ---- Update ---------------------------------------------------------------

  update(game: Game, dt: number): void {
    const t = this.task;
    switch (t.kind) {
      case 'orbit':
        this.orbit(game, t.x, t.z, dt);
        break;
      case 'move':
        if (this.fly(game, t.x, t.z, dt, { stop: true }) < CARRYALL.orbit) this.task = { kind: 'orbit', x: t.x, z: t.z };
        break;
      case 'pickup':
        this.updatePickup(game, t, dt);
        break;
      case 'drop':
        this.updateDrop(game, t, dt);
        break;
      case 'ferry':
        this.updateFerry(game, t, dt);
        break;
    }
  }

  /** Circles a point; parks low over a repair vehicle that's working on it. */
  private orbit(game: Game, x: number, z: number, dt: number): void {
    const mech = game.units.find((u) => u.team === this.team && u.order.kind === 'repair' && u.order.target === this && !u.dead);
    if (mech) {
      const d = this.fly(game, mech.x, mech.z, dt, { stop: true, alt: game.map.surfaceAt(mech.x, mech.z) + 3.5 });
      if (d < 3) this.task = { kind: 'orbit', x: mech.x, z: mech.z };
      return;
    }
    const a = Math.atan2(this.z - z, this.x - x);
    const far = Math.hypot(this.x - x, this.z - z) > CARRYALL.orbit * 2;
    const tx = far ? x : x + Math.cos(a + 0.7) * CARRYALL.orbit;
    const tz = far ? z : z + Math.sin(a + 0.7) * CARRYALL.orbit;
    this.fly(game, tx, tz, dt, { cruise: this.def.speed * (far ? 1 : 0.45) });
  }

  private updatePickup(game: Game, t: Extract<Task, { kind: 'pickup' }>, dt: number): void {
    t.units = t.units.filter((u) => !u.dead && !u.carrier && u.team === this.team && this.used + u.def.lift! <= CARRYALL.capacity);
    if (t.units.length === 0) {
      this.task = { kind: 'orbit', x: this.x, z: this.z };
      return;
    }
    const cx = t.units.reduce((s, u) => s + u.x, 0) / t.units.length;
    const cz = t.units.reduce((s, u) => s + u.z, 0) / t.units.length;
    const ground = game.map.surfaceAt(cx, cz);
    const near = Math.hypot(cx - this.x, cz - this.z) < 2;
    this.fly(game, cx, cz, dt, { stop: true, alt: near ? ground + LOW : undefined });
    if (this.y > ground + LOW + 0.6) return;
    for (const u of t.units) {
      if (Math.hypot(u.x - this.x, u.z - this.z) < (u.def.infantry ? 3.2 : 1.6) && this.fits(u)) this.take(game, u);
    }
  }

  private updateDrop(game: Game, t: Extract<Task, { kind: 'drop' }>, dt: number): void {
    if (this.load.length === 0 && t.heavy) {
      this.task = { kind: 'move', x: t.back.x, z: t.back.z };
      return;
    }
    if (t.heavy) {
      if (this.touchAndGo(game, t.x, t.z, dt)) {
        this.setDown(game);
        this.task = { kind: 'move', x: t.back.x, z: t.back.z };
      }
      return;
    }
    // Fly-by: straight over the point at full speed, troopers jumping one after another around it.
    const toPoint = Math.hypot(t.x - this.x, t.z - this.z);
    if (t.phase === 'in') {
      this.fly(game, t.x, t.z, dt, {});
      if (toPoint < 1.5 || (toPoint < 5 && toPoint > this.lastDropD)) t.phase = 'out';
      this.lastDropD = toPoint;
    } else if (this.fly(game, t.exit!.x, t.exit!.z, dt, {}) < 3 && this.load.length === 0) {
      this.task = { kind: 'move', x: t.back.x, z: t.back.z };
      return;
    }
    this.dropTimer -= dt;
    if (this.load.length && this.dropTimer <= 0 && (t.phase === 'out' || toPoint < 4.5)) {
      this.dropTimer = 0.2;
      const u = this.load.shift()!;
      u.carrier = null;
      const side = (this.load.length % 2 ? 1 : -1) * 0.6;
      u.startFall(game, this.x - Math.sin(this.heading) * side, this.y - 0.6, this.z + Math.cos(this.heading) * side);
      game.onDrop(this, u);
    }
    if (t.phase === 'out' && this.load.length === 0 && Math.hypot(t.exit!.x - this.x, t.exit!.z - this.z) < 3) {
      this.task = { kind: 'move', x: t.back.x, z: t.back.z };
    }
  }

  private updateFerry(game: Game, t: Extract<Task, { kind: 'ferry' }>, dt: number): void {
    const h = t.harvester;
    if (h.dead) {
      if (this.load.includes(h)) this.load.splice(this.load.indexOf(h), 1);
      this.task = { kind: 'orbit', x: this.x, z: this.z };
      return;
    }
    if (h.carrier === this) {
      // Carrying: set it down at the end of its trip.
      const goal = t.goal ?? h.travelGoal(game);
      if (!goal) {
        t.goal = { x: this.x, z: this.z };
        return;
      }
      if (this.touchAndGo(game, goal.x, goal.z, dt)) {
        this.setDown(game);
        t.goal = null;
      }
      return;
    }
    const goal = h.travelGoal(game);
    if (goal && Math.hypot(goal.x - h.x, goal.z - h.z) > CARRYALL.ferryMin * TILE && this.load.length === 0) {
      // Swoop down on the harvester as it drives.
      const ground = game.map.surfaceAt(h.x, h.z);
      const near = Math.hypot(h.x - this.x, h.z - this.z) < 2.5;
      this.fly(game, h.x, h.z, dt, { stop: true, alt: near ? ground + LOW : undefined, chase: h.speed(game) });
      if (near && this.y < ground + LOW + 0.6 && Math.hypot(h.x - this.x, h.z - this.z) < 1.6) {
        this.take(game, h);
        t.goal = goal;
      }
      return;
    }
    this.orbit(game, h.x, h.z, dt);
  }

  /** Comes in low and slow over a point; returns true at the moment to let go. */
  private touchAndGo(game: Game, x: number, z: number, dt: number): boolean {
    const d = Math.hypot(x - this.x, z - this.z);
    const ground = game.map.surfaceAt(x, z) + LOW;
    const alt = ground + (CARRYALL.altitude - ground) * smoothstep((d - 2) / 12);
    const cruise = this.def.speed * THREE.MathUtils.lerp(0.3, 1, smoothstep(d / 16));
    this.fly(game, x, z, dt, { cruise, alt });
    const low = this.y < ground + 0.5;
    const passing = d < 2.5 && d > this.lastDropD;
    this.lastDropD = d;
    if (low && (d < 0.8 || passing)) {
      this.lastDropD = Infinity;
      return true;
    }
    return false;
  }

  private take(game: Game, u: Unit): void {
    u.carrier = this;
    u.path = [];
    u.target = null;
    if (u.type !== 'harvester') u.order = { kind: 'idle' };
    u.setSelected(false);
    u.root.visible = !u.def.infantry;
    this.lastDropD = Infinity;
    this.load.push(u);
    game.effects.puff(new THREE.Vector3(u.x, u.y + 0.3, u.z), 0xd8c49a);
  }

  /** Puts every passenger down on open ground under the hull. */
  private setDown(game: Game): void {
    const m = game.map;
    const out = this.load;
    this.load = [];
    out.forEach((u, i) => {
      const side = out.length > 1 ? (i - (out.length - 1) / 2) * 1.8 : 0;
      let x = this.x + Math.cos(this.heading) * side;
      let z = this.z + Math.sin(this.heading) * side;
      if (!m.canEnter(m.cellOf(x), m.cellOf(z), u.moveClass)) {
        const c = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, u.moveClass), 12);
        if (c) {
          x = m.center(c.cx);
          z = m.center(c.cz);
        }
      }
      u.carrier = null;
      u.x = x;
      u.z = z;
      u.y = m.surfaceAt(x, z);
      u.root.visible = true;
      u.resumeAfterDrop(game);
      game.effects.puff(new THREE.Vector3(x, u.y + 0.2, z), 0xd8c49a);
      game.onDrop(this, u);
    });
  }

  /**
   * Flies toward a point. Fast flight banks through turns; near the point with `stop`, it slows to a hover and
   * slides straight in. Returns the remaining horizontal distance.
   */
  private fly(game: Game, tx: number, tz: number, dt: number, o: { cruise?: number; stop?: boolean; alt?: number; chase?: number }): number {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const cruise = o.cruise ?? this.def.speed;
    const want = o.stop ? Math.min(cruise, Math.max(o.chase ?? 0, d * 1.1)) : cruise;
    this.speedNow += THREE.MathUtils.clamp(want - this.speedNow, -10 * dt, 6 * dt);
    const desired = Math.atan2(dz, dx);
    const slow = 1 - THREE.MathUtils.clamp(this.speedNow / cruise, 0, 1);
    const before = this.heading;
    if (d > 0.3) this.heading = this.rotateToward(this.heading, desired, this.def.turnRate * (1 + slow * 2) * dt);
    const turn = dt > 0 ? THREE.MathUtils.euclideanModulo(this.heading - before + Math.PI, Math.PI * 2) - Math.PI : 0;
    this.bank += (THREE.MathUtils.clamp((turn / Math.max(dt, 1e-4)) * 0.25, -0.5, 0.5) - this.bank) * Math.min(1, dt * 4);
    // Hovering slides straight at the point; cruising follows the nose.
    const hover = o.stop ? THREE.MathUtils.clamp(1 - this.speedNow / 3, 0, 1) : 0;
    const step = Math.min(this.speedNow * dt, o.stop ? d : Infinity);
    if (d > 1e-4) {
      this.x += (Math.cos(this.heading) * (1 - hover) + (dx / d) * hover) * step;
      this.z += (Math.sin(this.heading) * (1 - hover) + (dz / d) * hover) * step;
    }
    const size = game.map.worldSize();
    this.x = THREE.MathUtils.clamp(this.x, 0, size);
    this.z = THREE.MathUtils.clamp(this.z, 0, size);
    const alt = o.alt ?? CARRYALL.altitude;
    this.y += THREE.MathUtils.clamp(alt - this.y, -4 * dt, 4 * dt);
    return d;
  }

  syncVisual(game: Game, _dt: number): void {
    this.refreshKit(game);
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.set(this.bank, -this.heading, 0, 'YXZ');
    // Passengers: vehicles hang under the hook (two trikes side by side); infantry ride inside.
    const vehicles = this.load.filter((u) => !u.def.infantry);
    vehicles.forEach((u, i) => {
      const along = vehicles.length > 1 ? (i - 0.5) * 1.6 : 0;
      u.hangAt(this.x + Math.cos(this.heading) * along, this.y + CARRYALL_HOOK_Y - HANG_DEPTH, this.z + Math.sin(this.heading) * along, this.heading);
    });
    for (const u of this.load) {
      if (!u.def.infantry) continue;
      u.x = this.x;
      u.z = this.z;
      u.y = this.y;
    }
  }
}
