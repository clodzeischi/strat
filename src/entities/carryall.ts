import * as THREE from 'three';
import { CARRYALL, TILE, type Team } from '../config';
import type { Game } from '../game/game';
import type { Point } from '../game/pathfinding';
import { SAND, SPICE } from '../map';
import { CARRYALL_HOOK_Y, NACELLES, SEAT_OFF, SEAT_ON, SEATS } from '../models';
import { Unit, type Order } from './unit';
import { hypot } from '../game/hypot';

/** How far below the hook a hanging vehicle's wheels are. */
const HANG_DEPTH = 1.35;
/** Lowest the hull comes over the ground when picking up or setting down: a vehicle's height under the hook. */
const LOW = -CARRYALL_HOOK_Y + HANG_DEPTH;

type Task =
  | { kind: 'orbit'; x: number; z: number }
  | { kind: 'move'; x: number; z: number }
  | { kind: 'pickup'; units: Unit[] }
  /** After a touch-and-go: straight ahead at full speed, climbing, then on to `then`. */
  | { kind: 'climb'; x: number; z: number; then: Task }
  /** Heavy cargo: a touch-and-go at the drop point. Infantry and trikes: a fly-by parachute drop, then out past the point. */
  | { kind: 'drop'; x: number; z: number; back: Point; heavy: boolean; exit: Point | null; phase: 'in' | 'out' }
  /**
   * Assigned to a harvester: lifts it whenever it starts a long trip and sets it down at the far end. `rescue`:
   * the harvester came under fire and is waiting to be flown home whatever the distance.
   */
  | { kind: 'ferry'; harvester: Unit; goal: Point | null; rescue: boolean };

/** Light enough to parachute: infantry and trikes jump on a fly-by; anything heavier needs a touchdown. */
const parachutes = (u: Unit) => (u.def.lift ?? CARRYALL.capacity) < CARRYALL.capacity;

/** Flight targets stay this far inside the map edge, so nothing ever asks the Carryall to fly off the map. */
const EDGE = 3 * TILE;
/** How far a Carryall climbs out straight ahead after touching down. */
const CLIMB_OUT = 9 * TILE;

/** Downwash dust per ground type: color, puffs per second at the lowest pass, cloud size. */
const DUST = {
  sand: { color: 0xe2c896, rate: 110, size: 1.3 },
  spice: { color: 0xc4532a, rate: 110, size: 1.3 },
  rock: { color: 0x7a6450, rate: 10, size: 0.7 },
};
/** Downwash reaches the ground from this high above it. */
const DUST_HEIGHT = 5;

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
  private pitch = 0;
  private shownTroops = 0;
  private dustDebt = 0;
  /** Engine nacelle angle: 0 pointing forward (cruise), PI/2 straight up (hover). */
  private tilt = Math.PI / 2;

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
      this.task = { kind: 'ferry', harvester: first, goal: null, rescue: false };
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
    // Everyone gathers at their middle, so one pass picks up the lot (two trikes side by side under the hook).
    for (const u of taken) u.command(game, { kind: 'move', x: cx, z: cz });
    this.task = { kind: 'pickup', units: taken };
    return taken;
  }

  /** Drops the load at a point, then flies back to where it was when ordered. */
  orderDrop(game: Game, x: number, z: number): boolean {
    if (this.load.length === 0) return false;
    const heavy = !this.load.every(parachutes);
    const back = { x: this.x, z: this.z };
    const m = game.map;
    if (heavy) {
      const c = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, 'vehicle'), 20);
      if (!c) return false;
      this.task = { kind: 'drop', x: m.center(c.cx), z: m.center(c.cz), back, heavy, exit: null, phase: 'in' };
    } else {
      // Keep flying past the drop point along the approach line before turning home.
      const d = hypot(x - this.x, z - this.z) || 1;
      const exit = this.inside(game, x + ((x - this.x) / d) * 14, z + ((z - this.z) / d) * 14);
      this.task = { kind: 'drop', x, z, back, heavy, exit, phase: 'in' };
    }
    this.lastDropD = Infinity;
    return true;
  }

  /** Whether the harvester it ferries should stop and wait: a lift is coming for its long trip or its rescue. */
  wantsToLift(game: Game, h: Unit): boolean {
    const t = this.task;
    if (t.kind !== 'ferry' || t.harvester !== h || this.load.length) return false;
    if (t.rescue) return true;
    const goal = h.travelGoal(game);
    return !!goal && hypot(goal.x - h.x, goal.z - h.z) > CARRYALL.ferryMin * TILE;
  }

  /** The ferried harvester is under fire: it heads for home, and waits there for this Carryall to fly it out. */
  rescue(game: Game, h: Unit): void {
    const t = this.task;
    if (t.kind !== 'ferry' || t.harvester !== h || t.rescue || h.carrier || this.load.length) return;
    if (h.retreat(game)) t.rescue = true;
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
      case 'move': {
        const p = this.inside(game, t.x, t.z);
        if (this.fly(game, p.x, p.z, dt, { stop: true }) < CARRYALL.orbit) this.task = { kind: 'orbit', x: p.x, z: p.z };
        break;
      }
      case 'pickup':
        this.updatePickup(game, t, dt);
        break;
      case 'climb':
        if (this.fly(game, t.x, t.z, dt, {}) < 3) this.task = t.then;
        break;
      case 'drop':
        this.updateDrop(game, t, dt);
        break;
      case 'ferry':
        this.updateFerry(game, t, dt);
        break;
    }
    this.kickDust(game, dt);
  }

  /** Low over the ground, the downwash raises dust: thick over sand, red over spice, a little over rock. */
  private kickDust(game: Game, dt: number): void {
    const m = game.map;
    const ground = m.surfaceAt(this.x, this.z);
    const strength = 1 - (this.y - ground - LOW + 0.5) / DUST_HEIGHT;
    if (strength <= 0) {
      this.dustDebt = 0;
      return;
    }
    const cx = m.cellOf(this.x);
    const cz = m.cellOf(this.z);
    if (!m.inBounds(cx, cz)) return;
    const tile = m.tile(cx, cz);
    const look = tile === SAND ? DUST.sand : tile === SPICE ? DUST.spice : DUST.rock;
    this.dustDebt += look.rate * Math.min(1, strength) * dt;
    const p = new THREE.Vector3(this.x, ground, this.z);
    for (; this.dustDebt >= 1; this.dustDebt--) game.effects.dust(p, look.color, look.size * (0.6 + 0.4 * strength));
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
    const far = hypot(this.x - x, this.z - z) > CARRYALL.orbit * 2;
    const p = this.inside(game, far ? x : x + Math.cos(a + 0.7) * CARRYALL.orbit, far ? z : z + Math.sin(a + 0.7) * CARRYALL.orbit);
    this.fly(game, p.x, p.z, dt, { cruise: this.def.speed * (far ? 1 : 0.45) });
  }

  /**
   * Infantry: hovers low over them while they climb in. Vehicles: a touch-and-go on the nearest one, taking every
   * waiting vehicle under the hull at the moment it touches down, then climbing out straight ahead (and coming
   * round again if anyone was missed).
   */
  private updatePickup(game: Game, t: Extract<Task, { kind: 'pickup' }>, dt: number): void {
    t.units = t.units.filter((u) => !u.dead && !u.carrier && u.team === this.team && this.used + u.def.lift! <= CARRYALL.capacity);
    if (t.units.length === 0) {
      this.task = { kind: 'orbit', x: this.x, z: this.z };
      return;
    }
    const vehicles = t.units.filter((u) => !u.def.infantry);
    if (vehicles.length) {
      const next = vehicles.reduce((a, b) => (hypot(a.x - this.x, a.z - this.z) <= hypot(b.x - this.x, b.z - this.z) ? a : b));
      // Wait above them while they're still driving over to gather.
      if (vehicles.some((u) => u.order.kind === 'move')) {
        this.orbit(game, next.x, next.z, dt);
        return;
      }
      if (!this.touchAndGo(game, next.x, next.z, dt)) return;
      for (const u of vehicles) if (hypot(u.x - this.x, u.z - this.z) < 2.4 && this.fits(u)) this.take(game, u);
      const left = t.units.filter((u) => !u.carrier && this.fits(u));
      this.climbOut(game, left.length ? { kind: 'pickup', units: left } : { kind: 'orbit', x: this.x, z: this.z });
      return;
    }
    const cx = t.units.reduce((s, u) => s + u.x, 0) / t.units.length;
    const cz = t.units.reduce((s, u) => s + u.z, 0) / t.units.length;
    const ground = game.map.surfaceAt(cx, cz);
    const near = hypot(cx - this.x, cz - this.z) < 2;
    this.fly(game, cx, cz, dt, { stop: true, alt: near ? ground + LOW : undefined });
    if (this.y > ground + LOW + 0.6) return;
    for (const u of t.units) {
      if (hypot(u.x - this.x, u.z - this.z) < 3.2 && this.fits(u)) this.take(game, u);
    }
  }

  /** Climbs out straight ahead after a touchdown, then carries on with `then`. */
  private climbOut(game: Game, then: Task): void {
    const p = this.inside(game, this.x + Math.cos(this.heading) * CLIMB_OUT, this.z + Math.sin(this.heading) * CLIMB_OUT);
    this.task = { kind: 'climb', x: p.x, z: p.z, then };
  }

  /** A point moved inside the map's flyable area. */
  private inside(game: Game, x: number, z: number): Point {
    const size = game.map.worldSize();
    return { x: THREE.MathUtils.clamp(x, EDGE, size - EDGE), z: THREE.MathUtils.clamp(z, EDGE, size - EDGE) };
  }

  private updateDrop(game: Game, t: Extract<Task, { kind: 'drop' }>, dt: number): void {
    if (this.load.length === 0 && t.heavy) {
      this.task = { kind: 'move', x: t.back.x, z: t.back.z };
      return;
    }
    if (t.heavy) {
      if (this.touchAndGo(game, t.x, t.z, dt)) {
        this.setDown(game);
        this.climbOut(game, { kind: 'move', x: t.back.x, z: t.back.z });
      }
      return;
    }
    // Fly-by: straight over the point at full speed, troopers jumping one after another around it.
    const toPoint = hypot(t.x - this.x, t.z - this.z);
    if (t.phase === 'in') {
      this.fly(game, t.x, t.z, dt, {});
      if (toPoint < 1.5 || (toPoint < 5 && toPoint > this.lastDropD)) t.phase = 'out';
      this.lastDropD = toPoint;
    } else if (this.fly(game, t.exit!.x, t.exit!.z, dt, {}) < 3 && this.load.length === 0) {
      this.task = { kind: 'move', x: t.back.x, z: t.back.z };
      return;
    }
    this.dropTimer -= dt;
    if (this.load.length && this.dropTimer <= 0 && (t.phase === 'out' || toPoint < 5)) {
      // Vehicles drop off the hook first, then the troopers jump.
      const i = this.load.findIndex((u) => !u.def.infantry);
      const u = this.load.splice(i >= 0 ? i : 0, 1)[0];
      this.dropTimer = u.def.infantry ? 0.2 : 0.45;
      u.carrier = null;
      if (u.def.infantry) {
        const side = (this.load.length % 2 ? 1 : -1) * 0.6;
        u.startFall(game, this.x - Math.sin(this.heading) * side, this.y - 0.6, this.z + Math.cos(this.heading) * side);
      } else {
        u.startFall(game, u.x, u.y, u.z); // from where it hangs
      }
      game.onDrop(this, u);
    }
    if (t.phase === 'out' && this.load.length === 0 && hypot(t.exit!.x - this.x, t.exit!.z - this.z) < 3) {
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
        t.rescue = false;
        this.climbOut(game, t);
      }
      return;
    }
    const goal = h.travelGoal(game);
    if (goal && this.wantsToLift(game, h)) {
      // Swoop down on the harvester as it drives.
      const ground = game.map.surfaceAt(h.x, h.z);
      const near = hypot(h.x - this.x, h.z - this.z) < 2.5;
      this.fly(game, h.x, h.z, dt, { stop: true, alt: near ? ground + LOW : undefined, chase: h.speed(game) });
      if (near && this.y < ground + LOW + 0.6 && hypot(h.x - this.x, h.z - this.z) < 1.6) {
        this.take(game, h);
        t.goal = goal;
      }
      return;
    }
    this.orbit(game, h.x, h.z, dt);
  }

  /**
   * A fast touch-and-go: dives in over the last stretch, slowing only to half speed, touches down for an instant
   * over the point and returns true at that moment (the caller then climbs out straight ahead). A Carryall low and
   * slow over enemy infantry doesn't last.
   */
  private touchAndGo(game: Game, x: number, z: number, dt: number): boolean {
    const d = hypot(x - this.x, z - this.z);
    const ground = game.map.surfaceAt(x, z) + LOW;
    const alt = ground + (CARRYALL.altitude - ground) * smoothstep((d - 1.5) / 11);
    const cruise = this.def.speed * THREE.MathUtils.lerp(0.5, 1, smoothstep((d - 2) / 14));
    this.fly(game, x, z, dt, { cruise, alt, climb: 7 });
    const low = this.y < ground + 0.6;
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
  private fly(game: Game, tx: number, tz: number, dt: number, o: { cruise?: number; stop?: boolean; alt?: number; chase?: number; climb?: number }): number {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = hypot(dx, dz);
    const cruise = o.cruise ?? this.def.speed;
    const want = o.stop ? Math.min(cruise, Math.max(o.chase ?? 0, d * 1.1)) : cruise;
    const accel = THREE.MathUtils.clamp(want - this.speedNow, -10 * dt, 6 * dt);
    this.speedNow += accel;
    // Nose up while braking, slightly down while speeding up.
    const pitchWant = dt > 0 ? THREE.MathUtils.clamp((-accel / dt) * 0.07, -0.08, 0.3) : 0;
    this.pitch += (pitchWant - this.pitch) * Math.min(1, dt * 3);
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
    const climb = o.climb ?? 4;
    this.y += THREE.MathUtils.clamp(alt - this.y, -climb * dt, climb * dt);
    return d;
  }

  syncVisual(game: Game, dt: number): void {
    this.refreshKit(game);
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.set(this.bank, -this.heading, this.pitch, 'YXZ');
    // Nacelles stand up to hover and swing forward as it picks up speed.
    const tiltWant = (Math.PI / 2) * THREE.MathUtils.clamp(1 - this.speedNow / (this.def.speed * 0.75), 0, 1);
    this.tilt += (tiltWant - this.tilt) * Math.min(1, dt * 3);
    for (const name of NACELLES) this.body.getObjectByName(name)!.rotation.z = this.tilt;
    // Infantry aboard: the troop pod shows and one seat light per trooper comes on.
    const troops = this.load.filter((u) => u.def.infantry).length;
    if (troops !== this.shownTroops) {
      this.shownTroops = troops;
      this.body.getObjectByName('pod')!.visible = troops > 0;
      for (let k = 0; k < SEATS; k++) (this.body.getObjectByName(`seat${k}`) as THREE.Mesh).material = k < troops ? SEAT_ON : SEAT_OFF;
    }
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
