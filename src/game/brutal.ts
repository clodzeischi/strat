import { BUILDINGS, TILE, UNITS, type Team, type UnitType } from '../config';
import { Carryall, distTo, type Unit } from '../entities';
import { AI, HARD_PROFILE, power, profileFor, type AIProfile, type Role, type Wave } from './ai';
import type { Difficulty, Game } from './game';
import { hypot } from './hypot';
import type { Sighting } from './intel';
import { Micro } from './micro';

/**
 * Brutal: Hard's economy and army planning, plus what a strong player does with their hands. Its units kite and
 * focus fire (`Micro`), badly hurt units leave the fight to heal and come back, waves march together, harvesters
 * run from raiders that would kill them, and Carryalls go to work: rocket launchers and paratroopers dropped on enemy
 * harvesters along routes clear of known anti-air, lifted out at the first sign of danger, with troopers jumping
 * early to draw the fire if their Carryall is hit on the way in. Waves split, so a flanking group hits the economy
 * while the main army attacks, and more trike raids keep the pressure on. Tuned with `sim/brutal.sh`; see
 * docs/PLAN.md.
 */
export const BRUTAL_PROFILE: AIProfile = {
  ...HARD_PROFILE,
  raids: { trikes: 4, start: 120, interval: 45, hunt: true },
  sustain: { repairPer: 5, maxRepair: 3, outmatched: 1.3 },
  // Gathers further out (the army at home stays out of the harvesters' way) and adds a second factory sooner.
  rallyOut: 10,
  more: { barracks: 1500, factory: 1200 },
};

/** Brutal's switches, so the sims can measure each one. */
export interface BrutalOptions {
  /** Kiting and focus fire. */
  micro: boolean;
  /** Pull units below this share of health out of fights (0: never). */
  mend: number;
  /** Harvesters under fire run for the refinery. */
  harvesterRetreat: boolean;
  /** Carryalls kept for operations (0: no Hi-Tech Factory). */
  carryalls: number;
  /** Rocket launcher (or tank) drops on enemy harvesters. */
  snipe: boolean;
  /** What a sniping drop prefers to carry. */
  sniper: 'rocket' | 'tank';
  /** Paratrooper strikes on enemy harvesters. */
  para: boolean;
  /** Troop strikes wait for a wave closing on the enemy base, so they open a second front. */
  paraWithWave: boolean;
  /** Carryalls with no operation ferry harvesters. */
  ferry: boolean;
  /** Waves march together, the fast units waiting for the slow ones until contact. */
  march: boolean;
  /** Waves split off a fast flanking group that goes for the economy. */
  flank: boolean;
  /** Seconds between thinks (Hard: 1). */
  think: number;
  /**
   * The Hi-Tech Factory waits for this game time (on Small and Medium maps; `hitechAtLarge` on Large ones, where air
   * pays off sooner), this many combat units, and an army this share of the enemy's.
   */
  hitechAt: number;
  hitechAtLarge: number;
  hitechArmy: number;
  hitechLead: number;
  /** Credits that must be left over after paying for it: air is a luxury, bought when there's money to spare. */
  hitechSpare: number;
}

export const BRUTAL_OPTIONS: BrutalOptions = {
  micro: true, mend: 0.35, harvesterRetreat: true, carryalls: 2, snipe: true, sniper: 'rocket', para: true, paraWithWave: false, ferry: true, march: true, flank: true, think: 0.5,
  hitechAt: 600, hitechAtLarge: 360, hitechArmy: 10, hitechLead: 1.2, hitechSpare: 400,
};

/** Fast loop for micro, retreats and Carryall operations (seconds). */
const FAST = 0.2;

type Point = { x: number; z: number };

/**
 * A Carryall operation. 'snipe': one rocket launcher (or tank) set down in range of an enemy harvester; 'para': a
 * squad of infantry dropped on one. Both go the same way: load at home, fly in on a route clear of known anti-air
 * (`via`), drop, fight, and get lifted out at the first sign of danger (or when there's nothing left to shoot), then
 * on to the next target or home.
 */
interface Op {
  kind: 'snipe' | 'para';
  c: Carryall;
  /** What it carries in: the shooter, or the troopers. */
  cargo: Unit[];
  phase: 'load' | 'wait' | 'approach' | 'drop' | 'ground' | 'extract' | 'home';
  /** Game time the current phase started. */
  since: number;
  /** Last time the cargo had something to shoot. */
  quiet: number;
  /** Where the cargo goes down, the harvester it's after, and the waypoint that keeps the flight clear of anti-air. */
  drop: Point | null;
  victim: Sighting | null;
  via: Point | null;
  /** The Carryall's health when it set out (troopers jump if it's hit on the way in). */
  hp0: number;
  /** Each unit that boarded, with its kill count when it did (dead ones included, for the tally). */
  kills: Map<Unit, number>;
}

/** Outcome counters for the sims. */
export interface BrutalStats {
  snipes: number;
  paras: number;
  /** Kills made by Carryall cargo while on an operation. */
  opKills: number;
  /** Credits' worth of cargo and Carryalls lost on operations. */
  opLosses: number;
  extractions: number;
  paraBails: number;
  carryallsLost: number;
  mends: number;
  kites: number;
  flanks: number;
}

export class BrutalAI extends AI {
  private micro: Micro;
  private fastTimer = 0;
  private ops = new Map<Carryall, Op>();
  private carryallIds = new Set<number>();
  private nextPara = 0;
  /** Waves already looked at for splitting. */
  private knownWaves = new Set<Wave>();
  /** Wave units waiting for the rest of their wave (see `marchWaves`). */
  private holding = new Set<Unit>();
  readonly stats: BrutalStats = { snipes: 0, paras: 0, opKills: 0, opLosses: 0, extractions: 0, paraBails: 0, carryallsLost: 0, mends: 0, kites: 0, flanks: 0 };

  constructor(game: Game, team: Team, profile: AIProfile = BRUTAL_PROFILE, readonly opts: BrutalOptions = BRUTAL_OPTIONS) {
    super(game, team, profile);
    this.micro = new Micro(game, team);
    this.thinkEvery = opts.think;
  }

  update(dt: number): void {
    super.update(dt);
    this.fastTimer -= dt;
    if (this.fastTimer > 0) return;
    this.fastTimer = FAST;
    const army = this.game.units.filter((u) => u.team === this.team && u.def.weapon && !u.carrier && !u.falling);
    if (this.opts.harvesterRetreat) this.runHarvesters();
    if (this.opts.mend) this.manageMend(army);
    if (this.opts.march) this.marchWaves();
    this.runOps();
    if (this.opts.micro) {
      const fighting: Role[] = ['wave', 'defend', 'raid', 'home'];
      // Cargo on the ground fights the same way (a rocket launcher outranges what usually guards a harvester).
      const dropped = new Set([...this.ops.values()].flatMap((o) => (o.phase === 'ground' ? o.cargo : [])));
      this.micro.update(army.filter((u) => fighting.includes(this.roles.get(u) ?? 'home') || dropped.has(u)));
      this.stats.kites = this.micro.kites;
    }
  }

  // ---- Production -------------------------------------------------------------

  protected chooseUnit(): UnitType {
    if (this.carryallWanted()) return 'carryall';
    return super.chooseUnit();
  }

  private carryallWanted(): boolean {
    const g = this.game;
    if (!this.opts.carryalls || !g.canTrain(this.team, 'carryall')) return false;
    const queued = this.ts.queues.hitech.filter((q) => q.type === 'carryall').length;
    return g.count(this.team, 'carryall') + queued < this.opts.carryalls;
  }

  /** The Hi-Tech Factory once the economy and a first army are in place. */
  protected manageConstruction(): void {
    const g = this.game;
    const ts = this.ts;
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon).length;
    if (this.opts.carryalls && this.openingDone && !ts.building && g.canBuild(this.team, 'hitech') && !g.has(this.team, 'hitech')
      && g.count(this.team, 'refinery') >= 2 && army >= this.opts.hitechArmy && g.time >= (g.map.size >= 128 ? this.opts.hitechAtLarge : this.opts.hitechAt)
      && ts.credits >= BUILDINGS.hitech.cost + this.opts.hitechSpare && this.ownPower() >= this.intel.armyPower() * this.opts.hitechLead
      && this.findSpot('hitech')) {
      g.startBuilding(this.team, 'hitech');
      return;
    }
    super.manageConstruction();
  }

  // ---- Army -------------------------------------------------------------------

  protected manageArmy(): void {
    super.manageArmy();
    if (this.opts.flank) this.splitWaves();
    this.startOps();
  }

  /**
   * A new wave of 8 or more splits: its fastest units, up to a third of its strength, go for an enemy harvester or
   * refinery away from the main target, so the defender has to answer in two places at once.
   */
  private splitWaves(): void {
    for (const w of this.waves) {
      if (this.knownWaves.has(w)) continue;
      this.knownWaves.add(w);
      if (w.units.size < 8) continue;
      const units = [...w.units];
      const main = units[0].order.kind === 'amove' ? { x: units[0].order.x, z: units[0].order.z } : null;
      if (!main) continue;
      let flank: Sighting | null = null;
      let far = 15 * TILE;
      for (const s of [...this.intel.buildings.values(), ...this.intel.placedUnits()]) {
        if (s.type !== 'refinery' && s.type !== 'harvester' && s.type !== 'camp') continue;
        const d = hypot(s.x - main.x, s.z - main.z);
        if (d > far) {
          far = d;
          flank = s;
        }
      }
      if (!flank) continue;
      const fast = units.filter((u) => ['trike', 'tank', 'razor'].includes(u.type)).sort((a, b) => b.def.speed - a.def.speed);
      const picked: Unit[] = [];
      let p = 0;
      for (const u of fast) {
        if (p >= w.start / 3) break;
        picked.push(u);
        p += power(u);
      }
      if (picked.length < 2) continue;
      for (const u of picked) {
        w.units.delete(u);
        u.command(this.game, { kind: 'amove', x: flank.x, z: flank.z });
      }
      w.start -= p;
      const side: Wave = { units: new Set(picked), start: p, economy: true };
      this.waves.push(side);
      this.knownWaves.add(side);
      this.stats.flanks++;
    }
    for (const w of this.knownWaves) if (!this.waves.includes(w)) this.knownWaves.delete(w);
  }

  /**
   * Waves march together: until they make contact, units that get well ahead of the slowest stop and wait for it,
   * so trikes don't arrive alone and tanks don't fight before the rocket launchers behind them are in range.
   */
  private marchWaves(): void {
    const g = this.game;
    for (const w of this.waves) {
      const units = [...w.units].filter((u) => !u.dead && !u.carrier && !u.falling);
      const free = units.filter((u) => !this.holding.has(u));
      // Where the wave is going: the attack-move most of its moving units have.
      const goal = free.map((u) => u.order).find((o): o is Extract<typeof o, { kind: 'amove' }> => o.kind === 'amove');
      const contact = units.some((u) => u.target || g.units.some((e) => e.team !== this.team && !e.dead && !e.carrier && e.def.weapon && g.sees(this.team, e) && hypot(e.x - u.x, e.z - u.z) < 12 * TILE));
      if (!goal || contact || units.length < 3) {
        for (const u of units) if (this.holding.has(u)) this.release(u, goal);
        continue;
      }
      const dist = (u: Unit) => hypot(goal.x - u.x, goal.z - u.z);
      // The rear is the slowest unit still on its way: one that's stuck (idle, and not told to wait) holds nobody up.
      const moving = units.filter((u) => this.holding.has(u) || u.path.length > 0);
      if (!moving.length) continue;
      const rear = Math.max(...moving.map(dist));
      for (const u of units) {
        const d = dist(u);
        if (!this.holding.has(u) && d < rear - 7 * TILE && d > 10 * TILE) {
          this.holding.add(u);
          this.micro.release(u);
          u.command(g, { kind: 'move', x: u.x, z: u.z });
        } else if (this.holding.has(u) && d >= rear - 3 * TILE) this.release(u, goal);
      }
    }
    for (const u of [...this.holding]) if (u.dead || this.roles.get(u) !== 'wave') this.holding.delete(u);
  }

  private release(u: Unit, goal: { x: number; z: number } | undefined): void {
    this.holding.delete(u);
    if (goal) u.command(this.game, { kind: 'amove', x: goal.x, z: goal.z });
  }

  protected waiting(u: Unit): boolean {
    return this.holding.has(u);
  }

  /**
   * Badly hurt units leave the fight: vehicles to a Repair Vehicle (or home, without one), infantry home to heal.
   * Once mended they rejoin the units at home, and the next wave.
   */
  private manageMend(army: Unit[]): void {
    const g = this.game;
    const rally = this.rally;
    if (!rally) return;
    for (const u of army) {
      const role = this.roles.get(u);
      const near = this.nearestMender(u);
      if (role === 'mend') {
        const healed = u.hp >= u.maxHp * 0.9;
        const home = hypot(u.x - rally.x, u.z - rally.z) < 6 * TILE;
        // A unit with nothing to mend it (and no healing of its own) only needed to get out alive.
        const selfHeals = u.def.infantry && !u.maxShields;
        if (healed || (!selfHeals && !near && home)) {
          this.sendHome(u);
          continue;
        }
        if (near && u.order.kind === 'idle' && hypot(near.x - u.x, near.z - u.z) > 3 * TILE) u.command(g, { kind: 'move', x: near.x, z: near.z });
        continue;
      }
      if (role !== 'wave' && role !== 'defend' && role !== 'raid' && role !== 'home') continue;
      if (u.hp >= u.maxHp * this.opts.mend || g.time - u.lastHurt > 2 || !this.canRotate(u, army)) continue;
      this.leaveGroups(u);
      this.micro.release(u);
      this.roles.set(u, 'mend');
      this.stats.mends++;
      const to = near ?? rally;
      u.command(g, { kind: 'move', x: to.x, z: to.z });
    }
  }

  /**
   * Whether a hurt unit can step out of the fight: nothing faster than it is after it (it would only be shot in the
   * back, without shooting back), and at least two friends are fighting nearby to take its place.
   */
  private canRotate(u: Unit, army: Unit[]): boolean {
    const g = this.game;
    for (const e of g.units) {
      if (e.team === this.team || e.dead || e.carrier || !e.def.weapon || !g.sees(this.team, e)) continue;
      const w = g.weaponFor(e, u);
      if (w && distTo(u, e.x, e.z) < g.rangeFor(e, w, u) + 4 * TILE && e.speed(g) > u.speed(g) * 1.1) return false;
    }
    let friends = 0;
    for (const f of army) if (f !== u && f.hp > f.maxHp * 0.5 && hypot(f.x - u.x, f.z - u.z) < 10 * TILE && ++friends >= 2) return true;
    return false;
  }

  /**
   * A harvester under fire that's losing (down a third of its health, with more enemy strength around it than ours)
   * heads home to the refinery instead of sitting there to be shot. A few stray shots don't stop it working.
   */
  private runHarvesters(): void {
    const g = this.game;
    for (const h of g.units) {
      if (h.team !== this.team || h.type !== 'harvester' || h.carrier || g.time - h.lastHurt > FAST * 2 || h.hp > h.maxHp * 0.67) continue;
      if (h.order.kind !== 'harvest' || (h.hstate !== 'harvest' && h.hstate !== 'toSpice')) continue;
      if (g.ferryFor(h)) continue; // its Carryall flies it out
      let theirs = 0;
      let ours = 0;
      for (const u of g.units) {
        if (u.dead || u.carrier || !u.def.weapon || hypot(u.x - h.x, u.z - h.z) > 12 * TILE) continue;
        if (u.team === this.team) ours += power(u);
        else if (g.sees(this.team, u)) theirs += power(u);
      }
      if (theirs > ours) h.retreat(g);
    }
  }

  // ---- Carryall operations ------------------------------------------------------

  private carryalls(): Carryall[] {
    return this.game.units.filter((u): u is Carryall => u instanceof Carryall && u.team === this.team && !u.dead);
  }

  /**
   * Idle Carryalls pick up a job: a sniping drop when there's a harvester to snipe and a launcher to do it (a second
   * idle Carryall joins in on the same harvester, so it goes down before help arrives), else a troop strike, else
   * ferrying a harvester or waiting behind the base.
   */
  private startOps(): void {
    const g = this.game;
    const alive = new Set(this.carryalls().map((c) => c.id));
    for (const id of this.carryallIds) {
      if (alive.has(id)) continue;
      this.stats.carryallsLost++;
    }
    this.carryallIds = alive;
    // Not while the base is under attack: the cargo is needed at home, and loading up in a fight gets it shot.
    const busy = this.defenses.some((d) => d.base);
    for (const c of this.carryalls()) {
      if (this.ops.has(c) || c.load.length) continue;
      if (busy) {
        if (c.task.kind !== 'ferry') this.toPark(c);
        continue;
      }
      const home = this.homeUnits();
      if (this.opts.snipe) {
        const fit = (t: UnitType) => home.find((u) => u.type === t && u.hp > u.maxHp * 0.8);
        const shooter = this.opts.sniper === 'tank' ? fit('tank') ?? fit('rocket') : fit('rocket') ?? fit('tank');
        const target = shooter && this.snipeTarget(c, shooter.type, 20);
        if (shooter && target) {
          this.launch(c, 'snipe', [shooter]);
          this.stats.snipes++;
          // A partner: another idle Carryall and launcher go for the same harvester.
          const partner = this.carryalls().find((o) => o !== c && !this.ops.has(o) && !o.load.length);
          const second = partner && this.homeUnits().find((u) => u !== shooter && (u.type === 'rocket' || u.type === 'tank') && u.hp > u.maxHp * 0.8);
          if (partner && second) {
            this.launch(partner, 'snipe', [second]);
            this.stats.snipes++;
          }
          continue;
        }
      }
      if (this.opts.para && g.time >= this.nextPara && (!this.opts.paraWithWave || this.waveClosing())) {
        const troops = home.filter((u) => u.type === 'infantry' && u.hp > u.maxHp * 0.8).slice(0, 6);
        if (troops.length >= 4 && this.paraTarget(c, troops.length * UNITS.infantry.cost)) {
          this.launch(c, 'para', troops);
          this.nextPara = g.time + 90;
          this.stats.paras++;
          continue;
        }
      }
      if (c.task.kind === 'ferry') continue;
      // Nothing else to do: ferry the harvester with the longest trips (it's flown home if attacked, too).
      if (this.opts.ferry && this.ferry(c)) continue;
      // Or wait behind the base, out of the way of attacks.
      this.toPark(c);
    }
  }

  private toPark(c: Carryall, now = false): void {
    const park = this.parkSpot();
    if (park && (now || c.task.kind === 'orbit') && (c.task.kind !== 'orbit' || hypot(c.task.x - park.x, c.task.z - park.z) > 4 * TILE)) c.command(this.game, { kind: 'move', x: park.x, z: park.z });
  }

  /** A harvester troopers of this strength could take on, reachable clear of anti-air. */
  private paraTarget(from: Point, strength: number): Sighting | null {
    const victim = this.pickHarvester(from, strength);
    return victim && this.route(from, victim) !== null ? victim : null;
  }

  /** Starts an operation: the cargo leaves its groups and boards. */
  private launch(c: Carryall, kind: Op['kind'], cargo: Unit[]): void {
    for (const u of cargo) {
      this.leaveGroups(u);
      this.micro.release(u);
      this.roles.set(u, 'drop');
    }
    c.orderPickup(this.game, cargo);
    const t = this.game.time;
    this.ops.set(c, { kind, c, cargo, phase: 'load', since: t, quiet: t, drop: null, victim: null, via: null, hp0: c.hp, kills: new Map(cargo.map((u) => [u, u.kills])) });
  }

  /** Assigns the Carryall to the unferried harvester working furthest from a refinery. */
  private ferry(c: Carryall): boolean {
    const g = this.game;
    let best: Unit | null = null;
    let far = 12 * TILE;
    for (const h of g.units) {
      if (h.team !== this.team || h.type !== 'harvester' || h.carrier || h.order.kind !== 'harvest' || g.ferryFor(h)) continue;
      const ref = g.nearestBuilding(this.team, 'refinery', h.x, h.z);
      const spot = h.spiceCell ? { x: g.map.center(h.spiceCell.cx), z: g.map.center(h.spiceCell.cz) } : h;
      const d = ref ? hypot(ref.x - spot.x, ref.z - spot.z) : 0;
      if (d > far) {
        far = d;
        best = h;
      }
    }
    return !!best && c.orderPickup(g, [best]).length > 0;
  }

  /** A wave of ours is on its way and within 30 tiles of the enemy base: the moment for a second front. */
  private waveClosing(): boolean {
    const base = this.intel.enemyBase();
    return this.waves.some((w) => w.units.size >= 5 && [...w.units].some((u) => hypot(u.x - base.x, u.z - base.z) < 30 * TILE));
  }

  private homeUnits(): Unit[] {
    return this.game.units.filter((u) => u.team === this.team && this.roles.get(u) === 'home' && !u.carrier && !u.falling && u.order.kind !== 'enter');
  }

  // ---- Flying clear of anti-air ---------------------------------------------------

  /**
   * Enemy anti-air we know of, as circles a Carryall should stay out of: infantry (rifles, and rockets once
   * researched), rocket launchers, and bunkers (which may hold infantry), each with a few tiles to spare.
   */
  private antiAir(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    const infantry = UNITS.infantry;
    const rifle = this.intel.enemyRockets ? Math.max(infantry.weapon!.range, infantry.antiArmor!.range) : infantry.weapon!.range;
    for (const s of this.intel.units.values()) {
      if (!s.placed) continue;
      if (s.type === 'infantry') out.push({ x: s.x, z: s.z, r: rifle + 3 * TILE });
      else if (s.type === 'rocket') out.push({ x: s.x, z: s.z, r: UNITS.rocket.weapon!.range + 2 * TILE });
      else if (s.type === 'sardaukar') out.push({ x: s.x, z: s.z, r: UNITS.sardaukar.weapon!.range + 3 * TILE });
    }
    for (const s of this.intel.buildings.values()) {
      if (s.type === 'bunker') out.push({ x: s.x, z: s.z, r: rifle + BUILDINGS.bunker.size * TILE + 3 * TILE });
    }
    return out;
  }

  /** Whether a straight flight from a to b stays clear of all the anti-air circles. */
  private clearFlight(a: Point, b: Point, aa: { x: number; z: number; r: number }[]): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const t of aa) {
      const k = Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.z - a.z) * dz) / len2));
      if (hypot(a.x + dx * k - t.x, a.z + dz * k - t.z) < t.r) return false;
    }
    return true;
  }

  /**
   * How to fly from a to b without passing over known anti-air: undefined if the straight line is clear, a waypoint
   * off to one side if that clears it, or null if there's no safe way (b itself is covered, say).
   */
  private route(a: Point, b: Point): Point | null | undefined {
    const aa = this.antiAir();
    if (this.clearFlight(a, b, aa)) return undefined;
    const size = this.game.map.worldSize();
    const len = hypot(b.x - a.x, b.z - a.z) || 1;
    const px = -(b.z - a.z) / len;
    const pz = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    for (const off of [12, 20, 28, 36]) {
      for (const side of [1, -1]) {
        const p = {
          x: Math.min(size - 4 * TILE, Math.max(4 * TILE, mx + px * off * TILE * side)),
          z: Math.min(size - 4 * TILE, Math.max(4 * TILE, mz + pz * off * TILE * side)),
        };
        if (this.clearFlight(a, p, aa) && this.clearFlight(p, b, aa)) return p;
      }
    }
    return null;
  }

  // ---- Running operations -----------------------------------------------------------

  private runOps(): void {
    for (const [c, op] of [...this.ops]) {
      const lost = op.cargo.filter((u) => u.dead);
      for (const u of lost) this.stats.opLosses += u.def.cost;
      op.cargo = op.cargo.filter((u) => !u.dead);
      if (c.dead) {
        this.stats.opLosses += c.def.cost;
        this.endOp(op);
        continue;
      }
      if (!op.cargo.length) {
        this.endOp(op);
        continue;
      }
      this.runOp(op);
    }
  }

  private endOp(op: Op): void {
    this.ops.delete(op.c);
    for (const [u, k] of op.kills) this.stats.opKills += u.kills - k;
    for (const u of op.cargo) if (!u.dead && !u.carrier && !u.falling && this.roles.get(u) === 'drop') this.sendHome(u);
    const park = this.parkSpot();
    if (!op.c.dead && park && !op.c.load.length) op.c.command(this.game, { kind: 'move', x: park.x, z: park.z });
  }

  private setPhase(op: Op, phase: Op['phase']): void {
    op.phase = phase;
    op.since = this.game.time;
  }

  private runOp(op: Op): void {
    const g = this.game;
    const { c } = op;
    const aboard = op.cargo.filter((u) => u.carrier === c);
    switch (op.phase) {
      case 'load':
        if (aboard.length === op.cargo.length || (aboard.length && c.task.kind !== 'pickup')) {
          // Anyone who didn't make it aboard goes back to the units at home.
          for (const u of op.cargo) if (u.carrier !== c) this.sendHome(u);
          op.cargo = aboard;
          op.hp0 = c.hp;
          this.plan(op);
        } else if (g.time - op.since > 40 || (!aboard.length && c.task.kind !== 'pickup') || op.cargo.some((u) => !u.carrier && g.time - u.lastHurt < 1)) {
          // Took too long, or the cargo came under fire while waiting: call it off.
          this.endOp(op);
        }
        break;
      case 'wait':
        this.plan(op);
        break;
      case 'approach':
        // Hit on the way in: troopers jump right here and draw the fire while the Carryall gets away; a launcher
        // turns back.
        if (c.hp < op.hp0 - 30) {
          if (op.kind === 'para') {
            this.stats.paraBails++;
            this.dropAt(op, { x: c.x + Math.cos(c.heading) * 3 * TILE, z: c.z + Math.sin(c.heading) * 3 * TILE });
          } else this.goHome(op);
          break;
        }
        if (!op.via || hypot(op.via.x - c.x, op.via.z - c.z) < 4 * TILE) this.dropAt(op, op.drop!);
        break;
      case 'drop':
        if (aboard.length || op.cargo.some((u) => u.falling)) {
          if (c.hp < op.hp0 - 30 && op.kind === 'snipe' && c.task.kind === 'drop') this.goHome(op);
          break;
        }
        // Down: the Carryall waits nearby, out of the way, ready to lift them out.
        this.setPhase(op, 'ground');
        op.quiet = g.time;
        this.hover(op);
        this.nextShot(op);
        break;
      case 'ground': {
        if (op.cargo.some((u) => u.target || u.order.kind === 'attack')) op.quiet = g.time;
        const hurt = op.cargo.reduce((s, u) => s + u.hp, 0) < op.cargo.reduce((s, u) => s + u.maxHp, 0) * 0.55;
        if (hurt || this.endangered(op.cargo, 3) || g.time - op.quiet > 8) {
          // The Carryall wouldn't make it: the cargo fights on, or drives home.
          if (c.hp < c.maxHp * 0.35) {
            this.endOp(op);
            break;
          }
          c.orderPickup(g, op.cargo);
          this.setPhase(op, 'extract');
          this.stats.extractions++;
          break;
        }
        for (const u of op.cargo) if (u.order.kind === 'idle' && !u.target) this.nextShot(op);
        break;
      }
      case 'extract':
        if (aboard.length === op.cargo.length || (aboard.length && c.task.kind !== 'pickup')) {
          for (const u of op.cargo) if (u.carrier !== c) this.leaveBehind(u);
          op.cargo = aboard;
          const healthy = c.hp > c.maxHp * 0.6 && op.cargo.every((u) => u.hp > u.maxHp * 0.6);
          if (healthy) this.plan(op);
          else this.goHome(op);
        } else if (g.time - op.since > 25 || c.task.kind !== 'pickup') {
          // Couldn't get them out: they're on their own.
          for (const u of op.cargo) if (u.carrier !== c) this.leaveBehind(u);
          op.cargo = aboard;
          if (aboard.length) this.goHome(op);
          else this.endOp(op);
        }
        break;
      case 'home':
        if (!aboard.length && !op.cargo.some((u) => u.falling)) this.endOp(op);
        break;
    }
  }

  /**
   * The next target for loaded cargo, and the way there: a harvester to snipe (or for troopers, one guarded by less
   * than half their strength), reached on a flight clear of anti-air. Nothing worth it: home.
   */
  private plan(op: Op): void {
    const c = op.c;
    let drop: Point | null = null;
    let victim: Sighting | null = null;
    if (op.kind === 'snipe') {
      const t = this.snipeTarget(c, op.cargo[0].type, 45);
      if (t) ({ drop, victim } = t);
    } else {
      victim = this.paraTarget(c, op.cargo.reduce((s, u) => s + power(u), 0));
      if (victim) drop = { x: victim.x, z: victim.z };
    }
    const via = drop ? this.route(c, drop) : null;
    if (!drop || via === null) {
      // Nothing right now: wait in the air a little for a target to turn up, then go home.
      if (op.phase !== 'wait') {
        this.setPhase(op, 'wait');
        this.toPark(c, true);
      } else if (this.game.time - op.since > 20) this.goHome(op);
      return;
    }
    op.drop = drop;
    op.victim = victim;
    op.via = via ?? null;
    op.hp0 = c.hp;
    this.setPhase(op, 'approach');
    if (op.via) c.command(this.game, { kind: 'move', x: op.via.x, z: op.via.z });
  }

  private dropAt(op: Op, p: Point): void {
    if (!op.c.orderDrop(this.game, p.x, p.z)) {
      this.goHome(op);
      return;
    }
    // Afterwards it flies back to where it was ordered, the waypoint clear of anti-air, or home if it bailed.
    const back = op.via ?? this.parkSpot();
    if (op.c.task.kind === 'drop' && back) op.c.task.back = back;
    this.setPhase(op, 'drop');
  }

  /** Back home with the cargo, set down at the rally point. */
  private goHome(op: Op): void {
    const rally = this.rally;
    if (!op.c.load.length || !rally || !op.c.orderDrop(this.game, rally.x, rally.z)) {
      this.endOp(op);
      return;
    }
    this.setPhase(op, 'home');
  }

  /** Cargo the Carryall couldn't lift out: troopers become a raid on the economy, a launcher drives home. */
  private leaveBehind(u: Unit): void {
    if (u.dead) return;
    if (u.def.infantry) {
      const w: Wave = { units: new Set([u]), start: power(u), economy: true };
      this.roles.set(u, 'wave');
      this.waves.push(w);
      this.knownWaves.add(w);
    } else this.sendHome(u);
  }

  /**
   * A known enemy harvester worth a sniping drop: seen lately, with little around it, and a drop spot within the
   * shooter's reach (away from their base) that a Carryall can get to clear of anti-air.
   */
  private snipeTarget(from: Point, type: UnitType, maxAge: number): { drop: Point; victim: Sighting } | null {
    const g = this.game;
    const m = g.map;
    const base = this.intel.enemyBase();
    const standoff = UNITS[type].weapon!.range - 4;
    let best: { drop: Point; victim: Sighting } | null = null;
    let bestScore = Infinity;
    for (const h of this.intel.placedUnits()) {
      if (!h.harvester || g.time - h.seen > maxAge) continue;
      // Away from their base, so help has further to come; a partner already on its way comes in from another side.
      let dx = h.x - base.x;
      let dz = h.z - base.z;
      if (hypot(dx, dz) < 1) {
        dx = from.x - h.x;
        dz = from.z - h.z;
      }
      const taken = [...this.ops.values()].some((o) => o.victim?.id === h.id);
      const turn = taken ? 0.8 : 0;
      const l = hypot(dx, dz) || 1;
      const ux = (dx * Math.cos(turn) - dz * Math.sin(turn)) / l;
      const uz = (dx * Math.sin(turn) + dz * Math.cos(turn)) / l;
      const cell = m.nearestCell(m.cellOf(h.x + ux * standoff), m.cellOf(h.z + uz * standoff), (cx, cz) => m.canEnter(cx, cz, 'vehicle'), 5);
      if (!cell) continue;
      const drop = { x: m.center(cell.cx), z: m.center(cell.cz) };
      const guard = this.guardAround(drop, 12) + this.guardAround(h, 10);
      if (guard > 400 || this.route(from, drop) === null) continue;
      const score = guard + hypot(h.x - from.x, h.z - from.z) * 2 - (taken ? 300 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { drop, victim: h };
      }
    }
    return best;
  }

  /**
   * Enemies that can hurt the cargo are coming for it (within their reach plus a few seconds of driving), and more
   * of them than it can handle: a rocket launcher doesn't run from two infantry it outranges.
   */
  private endangered(cargo: Unit[], margin: number): boolean {
    const g = this.game;
    let p = 0;
    for (const e of g.units) {
      if (e.team === this.team || e.dead || e.carrier || !e.def.weapon || !g.sees(this.team, e)) continue;
      const near = cargo.some((u) => {
        const w = g.weaponFor(e, u);
        return !!w && distTo(u, e.x, e.z) < g.rangeFor(e, w, u) + e.speed(g) * margin + 2;
      });
      if (near) p += power(e);
    }
    return p > cargo.reduce((s, u) => s + power(u), 0) * 0.6;
  }

  /** Where idle Carryalls wait: a few tiles behind the construction yard, away from the middle of the map. */
  private parkSpot(): Point | null {
    const home = this.home();
    if (!home) return null;
    const mid = this.game.map.worldSize() / 2;
    const len = hypot(home.x - mid, home.z - mid) || 1;
    const size = this.game.map.worldSize();
    const clamp = (v: number) => Math.min(size - 4 * TILE, Math.max(4 * TILE, v));
    return { x: clamp(home.x + ((home.x - mid) / len) * 6 * TILE), z: clamp(home.z + ((home.z - mid) / len) * 6 * TILE) };
  }

  /** The Carryall waits near its cargo, on the side away from the enemy base (or at its safe waypoint). */
  private hover(op: Op): void {
    const base = this.intel.enemyBase();
    const u = op.cargo[0];
    const len = hypot(u.x - base.x, u.z - base.z) || 1;
    let p = { x: u.x + ((u.x - base.x) / len) * 6 * TILE, z: u.z + ((u.z - base.z) / len) * 6 * TILE };
    if (!this.clearFlight(p, p, this.antiAir()) && op.via) p = op.via;
    op.c.command(this.game, { kind: 'move', x: p.x, z: p.z });
  }

  /** The cargo's next target: the nearest harvester in reach, else (for a launcher) a refinery in range. */
  private nextShot(op: Op): void {
    const u = op.cargo[0];
    const reach = 22 * TILE;
    const harvester = this.intel.placedUnits().filter((s) => s.harvester && hypot(s.x - u.x, s.z - u.z) < reach)
      .sort((a, b) => hypot(a.x - u.x, a.z - u.z) - hypot(b.x - u.x, b.z - u.z))[0];
    if (harvester) {
      for (const v of op.cargo) this.goAfter(v, harvester);
      return;
    }
    const refinery = [...this.intel.buildings.values()].find((s) => s.type === 'refinery' && hypot(s.x - u.x, s.z - u.z) < u.def.weapon!.range + 2 * TILE);
    const b = refinery && this.game.buildings.find((x) => x.id === refinery.id && !x.dead);
    if (b && this.game.sees(this.team, b)) for (const v of op.cargo) v.command(this.game, { kind: 'attack', target: b });
  }
}

/** The AI for a difficulty: Brutal is its own class, Normal and Hard differ only in their profile. */
export function createAI(game: Game, team: Team, difficulty: Difficulty): AI {
  return difficulty === 'brutal' ? new BrutalAI(game, team) : new AI(game, team, profileFor(difficulty));
}
