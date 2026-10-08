import { ARMOR_BONUS, TILE, WEAPONS_BONUS, type Team } from '../config';
import { distTo, type Building, type Entity, type Order, type Unit } from '../entities';
import { weaponDamage, type Game } from './game';
import { hypot } from './hypot';

/** How much past an enemy's reach a kiting unit keeps, on top of what the enemy covers in this many seconds. */
const KITE_BUFFER = 1;
const KITE_LEAD = 0.4;
/** A kiting unit backs off this far at a time. */
const KITE_STEP = 3 * TILE;
/** Only kite enemies at most this much faster than us: anything quicker catches up anyway. */
const KITE_SPEED = 0.7;
/** A new focus target must be this much better than the current one, so turrets don't swing back and forth. */
const SWITCH = 1.3;

/**
 * Unit-level fighting for the Brutal AI, run several times a second over the units it's given:
 *  - Kiting: a turreted unit that outranges the enemies closing on it (tanks against infantry, rocket launchers
 *    against tanks) backs off while its turret keeps firing, so they never get their shots in.
 *  - Focus fire: units with several enemies in range shoot the one that dies to the fewest shots, dangerous ones
 *    first, and spread out once a target already has enough fire on it.
 * It only acts on what its side can see. Orders it replaces are put back once it lets go of a unit.
 */
export class Micro {
  /** Units it has taken over, with the order they had before (restored when it lets go). */
  private held = new Map<Unit, { prev: Order; mine: Order }>();
  kites = 0;

  constructor(private game: Game, private team: Team) {}

  /** Forget a unit: the AI is giving it a new order of its own. */
  release(u: Unit): void {
    this.held.delete(u);
  }

  update(units: Unit[]): void {
    const g = this.game;
    // Let go of units that are gone, or that the AI (or the unit itself) has given another order since.
    for (const [u, h] of [...this.held]) if (u.dead || u.carrier || !units.includes(u) || (u.order !== h.mine && u.order.kind !== 'idle')) this.held.delete(u);
    const enemies = g.units.filter((e) => e.team !== this.team && !e.dead && !e.carrier && !e.falling && g.sees(this.team, e));
    const threats = enemies.filter((e) => e.def.weapon);
    const bunkers = g.buildings.filter((b) => b.team !== this.team && !b.dead && b.occupants.length && g.sees(this.team, b));
    // Fire already committed to each enemy this round, so others spread out instead of overkilling it.
    const committed = new Map<Entity, number>();
    for (const u of units) {
      if (u.dead || u.carrier || u.falling || !u.def.weapon || u.def.air) continue;
      if (this.kite(u, threats, bunkers)) continue;
      this.focus(u, enemies, committed);
      // Nothing to do for it: hand back the order it had.
      if (this.held.has(u) && u.order.kind === 'idle' && !u.target) this.restore(u);
    }
  }

  /**
   * Backs a turreted unit away from enemies it outranges that are about to get in range (manned bunkers included).
   * True while kiting.
   */
  private kite(u: Unit, threats: Unit[], bunkers: Building[]): boolean {
    if (!u.def.turret) return false;
    const g = this.game;
    let fx = 0;
    let fz = 0;
    let danger = false;
    let calm = true;
    // d: how far the threat's shots have to reach to hit u; mine: how far u's reach it.
    const consider = (x: number, z: number, d: number, reach: number, mine: number | null, speed: number, margin: number) => {
      const zone = reach + KITE_BUFFER + speed * KITE_LEAD;
      if (d > zone + 3) return;
      // Only worth it against something we outrange and can keep away from.
      if (mine === null || mine <= reach + margin || speed * KITE_SPEED > u.speed(g)) return;
      if (d < zone + 1.5) calm = false;
      if (d >= zone) return;
      danger = true;
      const len = hypot(u.x - x, u.z - z) || 1;
      const w = 1 / Math.max(1, d);
      fx += ((u.x - x) / len) * w;
      fz += ((u.z - z) / len) * w;
    };
    for (const e of threats) {
      const we = g.weaponFor(e, u);
      if (!we) continue;
      const wu = g.weaponFor(u, e);
      consider(e.x, e.z, distTo(u, e.x, e.z), g.rangeFor(e, we, u), wu && g.rangeFor(u, wu, e), e.speed(g), 1);
    }
    // Bunker crews shoot from its walls at u's hull; u shoots at its walls from its center.
    for (const b of bunkers) {
      const wu = g.weaponFor(u, b);
      const wall = distTo(b, u.x, u.z);
      for (const o of b.occupants) {
        const wo = g.weaponFor(o, u);
        if (wo) consider(b.x, b.z, wall - u.radius, g.rangeFor(o, wo, u), wu && g.rangeFor(u, wu, b) - u.radius, 0, 0.5);
      }
    }
    const wasKiting = this.held.has(u) && u.order.kind === 'move';
    if (!danger) {
      // Hold off a moment longer before turning back in (hysteresis), then let the unit fight again.
      if (wasKiting && calm) this.restore(u);
      return wasKiting && !calm;
    }
    const len = hypot(fx, fz) || 1;
    const spot = this.openSpot(u, fx / len, fz / len);
    if (!spot) return false;
    // Already heading somewhere close enough: don't replan every round.
    if (wasKiting && u.path.length > 1 && u.order.kind === 'move' && hypot(u.order.x - spot.x, u.order.z - spot.z) < TILE * 1.5) return true;
    this.take(u, { kind: 'move', x: spot.x, z: spot.z });
    this.kites++;
    return true;
  }

  /** A walkable point a step away in roughly this direction (trying either side if straight back is blocked). */
  private openSpot(u: Unit, dx: number, dz: number): { x: number; z: number } | null {
    const m = this.game.map;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const x = u.x + (dx * c - dz * s) * KITE_STEP;
      const z = u.z + (dx * s + dz * c) * KITE_STEP;
      const cx = m.cellOf(x);
      const cz = m.cellOf(z);
      if (!m.inBounds(cx, cz) || !m.canEnter(cx, cz, u.moveClass)) continue;
      return { x, z };
    }
    return null;
  }

  /** Picks the best target in range: kills soonest, dangerous ones first, not already covered by others' fire. */
  private focus(u: Unit, enemies: Unit[], committed: Map<Entity, number>): void {
    const g = this.game;
    if (u.order.kind !== 'amove' && u.order.kind !== 'idle' && u.order.kind !== 'attack') return;
    let best: Unit | null = null;
    let bestScore = 0;
    let current = 0;
    for (const e of enemies) {
      const w = g.weaponFor(u, e);
      if (!w) continue;
      const d = distTo(e, u.x, u.z);
      if (d < w.minRange || d > g.rangeFor(u, w, e)) continue;
      const dmg = this.shot(u, e);
      const left = e.hp - (committed.get(e) ?? 0);
      // Enough fire on it already: someone else's job.
      const shots = left <= 0 ? 50 : Math.ceil(left / dmg);
      const value = e.def.weapon ? e.def.cost : e.type === 'harvester' ? e.def.cost * 0.6 : e.def.cost * 0.2;
      const score = value / shots;
      if (e === u.target) current = score;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return;
    const target = best !== u.target && bestScore > current * SWITCH ? best : (u.target as Unit | null) && current > 0 ? (u.target as Unit) : best;
    committed.set(target, (committed.get(target) ?? 0) + this.shot(u, target));
    if (u.target === target) return;
    this.take(u, { kind: 'attack', target });
  }

  /** Damage of one shot from u at e, after upgrades. */
  private shot(u: Unit, e: Entity): number {
    const g = this.game;
    const w = g.weaponFor(u, e)!;
    return weaponDamage(w, e) * (1 + WEAPONS_BONUS * g.tier(u.team, 'weapons')) * (1 - ARMOR_BONUS * g.tier(e.team, 'armor'));
  }

  private take(u: Unit, order: Order): void {
    const prev = this.held.get(u)?.prev ?? u.order;
    u.command(this.game, order);
    this.held.set(u, { prev, mine: u.order });
  }

  private restore(u: Unit): void {
    const o = this.held.get(u)!.prev;
    this.held.delete(u);
    if (o.kind === 'amove' || o.kind === 'move') u.command(this.game, o);
    // Only while it's in sight: the unit doesn't get to know where something in the fog went.
    else if (o.kind === 'attack' && !o.target.dead && this.game.sees(this.team, o.target)) u.command(this.game, o);
    else if (u.order.kind !== 'idle') u.command(this.game, { kind: 'idle' });
  }
}
