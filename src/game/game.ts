import * as THREE from 'three';
import {
  ARMOR_BONUS, BUILDINGS, HIGH_GROUND_RANGE, INFANTRY_REGEN, LEVEL_UP_ORDER, NITRO, PLAYER, PRODUCERS, QUEUE_MAX, START_CREDITS, TILE, UNITS, UPGRADES, WEAPONS_BONUS,
  type LevelUpType, type MapSize, type Producer, type Req,
  type BuildingType, type ProjectileKind, type Team,
  type WeaponDef, type UnitType, type UpgradeType,
} from '../config';
import { Effects } from '../render/effects/effects';
import { Building, Carryall, distTo, facingToward, repairable, Unit, type Entity } from '../entities';
import { GameMap, ROCK, SPICE, type Cell } from '../map';
import { mat } from '../materials/lambert';
import { cellsAround, type Point } from './pathfinding';
import { Terrain } from '../render/terrain';
import { Hasher, mulberry32 } from './rng';
import { Vision, VISION_EVERY } from './vision';
import { hypot } from './hypot';

/** Running totals for the end-of-game screen. */
export interface TeamStats {
  unitsBuilt: number;
  unitsLost: number;
  unitsKilled: number;
  structuresBuilt: number;
  structuresLost: number;
  structuresDestroyed: number;
  spiceHarvested: number;
  creditsSpent: number;
}

export type Difficulty = 'normal' | 'hard' | 'brutal';

export interface TeamState {
  team: Team;
  stats: TeamStats;
  /** This team's unit with the most kills so far (may be dead). */
  hero: Unit | null;
  credits: number;
  upgrades: Set<UpgradeType>;
  /** The one structure being built at the Construction Yard. */
  building: { type: BuildingType; progress: number; ready: boolean } | null;
  /** One queue per producer type. The first N items build in parallel, N = buildings of that type. */
  queues: Record<Producer, { type: UnitType; progress: number }[]>;
  research: { type: UpgradeType; progress: number } | null;
  rally: Record<Producer, Point | null>;
  /** Building being upgraded to level 2, per upgradable type. */
  levelUps: Partial<Record<LevelUpType, { building: Building; progress: number }>>;
  /** Round-robin counter so units leave from each building of a type in turn. */
  spawnTurn: Record<Producer, number>;
}

/**
 * A shell or rocket in flight. The simulation only knows where it will land, on the ground grid (`x`, `z`, which
 * follow the target while it lives) and how far along it is (`t`); the flight time comes from the flat distance.
 * The 3D arc from the model's muzzle to the target's middle (`start`, `end`, `mesh`) is only for drawing.
 */
interface Projectile {
  kind: ProjectileKind;
  x: number;
  z: number;
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
  target: Entity;
  owner: Unit;
  t: number;
  duration: number;
  weapon: WeaponDef;
  /** Attacker's damage multiplier at the moment of firing (Weapons upgrade). */
  mult: number;
  trailTimer: number;
  /** Mesh positions at the last two ticks, for drawing in between. */
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const shellGeo = new THREE.IcosahedronGeometry(0.12, 0);
const rocketGeo = new THREE.ConeGeometry(0.12, 0.6, 5);
rocketGeo.rotateX(Math.PI / 2); // point along +Z so lookAt aims it

/** Splash damage to units other than the one aimed at, at the center of the blast (half that at its edge). */
export const SPLASH_SHARE = 0.5;

export class Game {
  readonly map: GameMap;
  readonly terrain: Terrain;
  readonly effects: Effects;
  /** Fog of war: what each team can see (game state; units only target what their team sees). */
  readonly vision: Vision;
  units: Unit[] = [];
  buildings: Building[] = [];
  teams: TeamState[];
  time = 0;
  winner: Team | null = null;
  /** The team that surrendered, when the game ended that way. */
  surrendered: Team | null = null;
  /** Called when a computer opponent offers to surrender; answer with `acceptSurrender` or ignore it to play on. */
  onSurrenderOffer: (team: Team) => void = () => {};
  difficulty: Difficulty = 'normal';
  /** Called with notifications for the local player. */
  onMessage: (text: string) => void = () => {};
  /** The team this screen plays (presentation only: whose messages and alerts show). */
  localTeam: Team = PLAYER;
  /** Drawing only: show the whole map, fog or not (single player with ?reveal, and after the game). */
  revealAll = false;
  /** Drawing only: enemy structures destroyed out of the local player's sight, still shown where they were last seen. */
  private ghosts: Building[] = [];
  /** Simulation steps run so far. */
  ticks = 0;
  /** The simulation's own random numbers (see rng.ts): same seed, same game. */
  readonly random: () => number;
  private nextId = 1;
  private projectiles: Projectile[] = [];
  private lastAlert = -100;
  private lastDropAlert = -100;
  private victoryTimer = 0;

  constructor(readonly scene: THREE.Scene, private camera: THREE.Camera, size: MapSize = 64, seed = 7) {
    this.map = new GameMap(size, seed);
    this.random = mulberry32(seed * 2654435761 + 12345);
    this.terrain = new Terrain(this.map);
    scene.add(this.terrain.mesh);
    this.effects = new Effects(scene);
    this.teams = ([0, 1] as Team[]).map((team) => ({
      team, credits: START_CREDITS, upgrades: new Set<UpgradeType>(), hero: null,
      stats: {
        unitsBuilt: 0, unitsLost: 0, unitsKilled: 0, structuresBuilt: 0, structuresLost: 0, structuresDestroyed: 0,
        spiceHarvested: 0, creditsSpent: 0,
      },
      building: null, queues: { barracks: [], factory: [], hitech: [] }, research: null,
      rally: { barracks: null, factory: null, hitech: null }, spawnTurn: { barracks: 0, factory: 0, hitech: 0 }, levelUps: {},
    }));
    this.vision = new Vision(this.map, this.teams.length);
    this.effects.visibleAt = (x, z) => this.revealAll || this.vision.seesAt(this.localTeam, x, z);
    this.setupStart();
    this.vision.update(this.units, this.buildings, 0);
  }

  private setupStart(): void {
    this.map.bases.forEach((b, i) => {
      const team = i as Team;
      const yard = this.placeBuilding('conyard', team, b.cx - 1, b.cz - 1);
      const front = yard.frontCell();
      // Starting units gather a few tiles from the yard, toward the middle of the map, facing it.
      const mid = (this.map.size - 1) / 2;
      const len = hypot(mid - b.cx, mid - b.cz) || 1;
      const ux = (mid - b.cx) / len;
      const uz = (mid - b.cz) / len;
      const towardCenter = { cx: front.cx + Math.round(ux * 3), cz: front.cz + Math.round(uz * 3) };
      const cells = cellsAround(this.map, towardCenter.cx, towardCenter.cz, 12);
      const start: UnitType[] = ['trike', 'infantry', 'infantry', 'infantry'];
      start.forEach((type, k) => {
        const c = cells[k * 2] ?? cells[0];
        this.spawnUnit(type, team, this.map.center(c.cx), this.map.center(c.cz), Math.atan2(uz, ux));
      });
    });
  }

  // ---- Queries --------------------------------------------------------------

  /** Whether a team can see an entity (its own always). */
  sees(team: Team, e: Entity): boolean {
    return this.vision.sees(team, e);
  }

  has(team: Team, type: BuildingType): boolean {
    return this.buildings.some((b) => b.team === team && b.type === type && !b.dead);
  }

  count(team: Team, type: BuildingType | UnitType): number {
    let n = 0;
    for (const b of this.buildings) if (b.team === team && b.type === type && !b.dead) n++;
    for (const u of this.units) if (u.team === team && u.type === type && !u.dead) n++;
    return n;
  }

  /** Whether a requirement is satisfied: the building exists (at level 2 for 'conyard2' / 'factory2'). */
  meets(team: Team, r: Req): boolean {
    if (r === 'conyard2' || r === 'factory2') {
      const type = r === 'conyard2' ? 'conyard' : 'factory';
      return this.buildings.some((b) => b.team === team && b.type === type && b.level >= 2 && !b.dead);
    }
    return this.has(team, r);
  }

  requirementsMet(team: Team, reqs: Req[]): boolean {
    return reqs.every((r) => this.meets(team, r));
  }

  /** A level-1 building of this type exists, nobody of that type is level 2, and none is mid-upgrade. */
  canLevelUp(team: Team, type: LevelUpType): boolean {
    return !this.teams[team].levelUps[type] && !this.meets(team, `${type}2`) && this.has(team, type);
  }

  canBuild(team: Team, type: BuildingType): boolean {
    return this.has(team, 'conyard') && this.requirementsMet(team, BUILDINGS[type].requires);
  }

  canTrain(team: Team, type: UnitType): boolean {
    return this.has(team, UNITS[type].producer) && this.requirementsMet(team, UNITS[type].requires);
  }

  canResearch(team: Team, type: UpgradeType): boolean {
    const d = UPGRADES[type];
    const ups = this.teams[team].upgrades;
    return !ups.has(type) && (!d.after || ups.has(d.after)) && this.requirementsMet(team, d.requires);
  }

  /** Researched tier (0-2) of a two-tier upgrade line. */
  tier(team: Team, line: 'weapons' | 'armor'): number {
    const ups = this.teams[team].upgrades;
    return ups.has(`${line}2`) ? 2 : ups.has(`${line}1`) ? 1 : 0;
  }

  /** Seconds between shots for this unit's weapon, after upgrades. */
  cooldownFor(u: Unit, w: WeaponDef): number {
    return w.cooldown * (u.type === 'trike' && this.teams[u.team].upgrades.has('nitro') ? NITRO.cooldown : 1);
  }

  /**
   * Best enemy within range of a point. When `seeker` is given, targets it counters are preferred
   * and ones inside its minimum range are avoided.
   */
  nearestEnemy(team: Team, x: number, z: number, range: number, seeker?: Unit): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    const consider = (e: Entity, penalty: number) => {
      if (e.team === team || e.dead || (e instanceof Unit && e.carrier) || !this.vision.sees(team, e)) return;
      const d = distTo(e, x, z);
      if (d > range) return;
      let score = d + penalty;
      const w = seeker && this.weaponFor(seeker, e);
      if (seeker && !w) return; // e.g. an aircraft and no anti-air weapon
      if (w) {
        const ratio = THREE.MathUtils.clamp(weaponDamage(w, e) / w.damage - 1, -1, 2);
        score -= ratio * 4;
        if (d < w.minRange) score += 30;
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    };
    for (const u of this.units) consider(u, u.def.weapon ? 0 : 3);
    for (const b of this.buildings) consider(b, 6);
    return best;
  }

  nearestBuilding(team: Team, type: BuildingType, x: number, z: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.team !== team || b.type !== type || b.dead) continue;
      const d = hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Where units leave a building and harvesters dock: the nearest open cell in front, on the building's level. */
  dockCell(b: Building): Cell {
    const f = b.frontCell();
    const m = this.map;
    const level = m.level[m.idx(b.cx, b.cz)];
    return m.nearestCell(f.cx, f.cz, (x, z) => m.canEnter(x, z, 'vehicle') && (m.ramp[m.idx(x, z)] !== 0 || m.level[m.idx(x, z)] === level), 16) ?? f;
  }

  /** Whether a unit may move from where it is to a nearby point without crossing a level edge or blocked cell. */
  canMove(u: Unit, x: number, z: number): boolean {
    const m = this.map;
    const fx = m.cellOf(u.x);
    const fz = m.cellOf(u.z);
    const tx = m.cellOf(x);
    const tz = m.cellOf(z);
    if (fx === tx && fz === tz) return true;
    if (!m.canEnter(fx, fz, u.moveClass)) return true; // already stuck somewhere blocked: let it walk out
    return m.inBounds(tx, tz) && Math.abs(tx - fx) <= 1 && Math.abs(tz - fz) <= 1 && m.canStep(fx, fz, tx, tz, u.moveClass);
  }

  /** Level an entity stands on: 0 low, 1 high, 0.5 on a ramp. */
  levelOf(e: Entity): number {
    return e instanceof Building ? this.map.level[this.map.idx(e.cx, e.cz)] : this.map.levelAt(e.x, e.z);
  }

  /** Weapon range after the high-ground modifier: longer shooting down, shorter shooting up. */
  rangeFor(u: Unit, w: WeaponDef, target: Entity): number {
    const diff = this.levelOf(u) - this.levelOf(target);
    return w.range * (diff >= 1 ? 1 + HIGH_GROUND_RANGE : diff <= -1 ? 1 - HIGH_GROUND_RANGE : 1);
  }

  findSpice(cx: number, cz: number, self: Unit): Cell | null {
    const claimed = new Set<number>();
    for (const u of this.units) {
      if (u !== self && u.team === self.team && u.spiceCell && (u.hstate === 'toSpice' || u.hstate === 'harvest')) {
        claimed.add(this.map.idx(u.spiceCell.cx, u.spiceCell.cz));
      }
    }
    const isSpice = (x: number, z: number) => this.map.inBounds(x, z) && this.map.tile(x, z) === SPICE;
    return (
      this.map.nearestCell(cx, cz, (x, z) => isSpice(x, z) && !claimed.has(this.map.idx(x, z)), 40) ??
      this.map.nearestCell(cx, cz, isSpice, 40)
    );
  }

  canPlace(type: BuildingType, team: Team, cx: number, cz: number): boolean {
    const size = BUILDINGS[type].size;
    const m = this.map;
    if (!m.inBounds(cx, cz)) return false;
    const level = m.level[m.idx(cx, cz)];
    for (let z = cz; z < cz + size; z++) {
      for (let x = cx; x < cx + size; x++) if (!this.tileBuildable(x, z, level)) return false;
    }
    return this.inBuildRange(type, team, cx, cz);
  }

  /**
   * Whether one tile could hold part of a building standing on `level`: rock, free, on that level (footprints are
   * flat), not a ramp or next to one (ramps stay clear), and no unit on it.
   */
  tileBuildable(cx: number, cz: number, level: number): boolean {
    const m = this.map;
    if (!m.inBounds(cx, cz)) return false;
    const i = m.idx(cx, cz);
    if (m.tiles[i] !== ROCK || m.occupied[i] !== 0 || m.level[i] !== level || m.ramp[i]) return false;
    for (let z = cz - 1; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) if (m.inBounds(x, z) && m.ramp[m.idx(x, z)]) return false;
    }
    const x0 = cx * TILE;
    const z0 = cz * TILE;
    const x1 = x0 + TILE;
    const z1 = z0 + TILE;
    return !this.units.some((u) => !u.def.air && !u.carrier && u.x + u.radius > x0 && u.x - u.radius < x1 && u.z + u.radius > z0 && u.z - u.radius < z1);
  }

  /** Whether a footprint at (cx, cz) is close enough to one of the team's own buildings. */
  inBuildRange(type: BuildingType, team: Team, cx: number, cz: number): boolean {
    const size = BUILDINGS[type].size;
    return this.buildings.some((b) => {
      if (b.team !== team || b.dead) return false;
      const gapX = Math.max(b.cx - (cx + size), cx - (b.cx + b.size), 0);
      const gapZ = Math.max(b.cz - (cz + size), cz - (b.cz + b.size), 0);
      return Math.max(gapX, gapZ) <= 4;
    });
  }

  // ---- Spawning -------------------------------------------------------------

  spawnUnit(type: UnitType, team: Team, x: number, z: number, heading = 0): Unit {
    const u = type === 'carryall' ? new Carryall(this.nextId++, team, x, z, heading) : new Unit(this.nextId++, team, type, x, z, heading);
    u.y = this.map.surfaceAt(x, z);
    u.stagger(this.random);
    u.syncVisual(this, 0);
    this.scene.add(u.root);
    this.units.push(u);
    return u;
  }

  placeBuilding(type: BuildingType, team: Team, cx: number, cz: number): Building {
    const size = BUILDINGS[type].size;
    const bx = (cx + size / 2) * TILE;
    const bz = (cz + size / 2) * TILE;
    // Doors face the middle of the map, so mirrored bases get mirrored exits and docks.
    const mid = this.map.worldSize() / 2;
    const b = new Building(this.nextId++, team, type, cx, cz, this.map.surfaceAt(bx, bz), facingToward(bx, bz, mid, mid));
    for (let z = cz; z < cz + b.size; z++) {
      for (let x = cx; x < cx + b.size; x++) this.map.occupied[this.map.idx(x, z)] = b.id;
    }
    this.scene.add(b.root);
    this.buildings.push(b);
    if (type === 'refinery') {
      const dock = this.dockCell(b);
      const h = this.spawnUnit('harvester', team, this.map.center(dock.cx), this.map.center(dock.cz), b.doorHeading());
      h.commandHarvest(this, null);
    }
    return b;
  }

  private spawnFromProducer(team: Team, type: UnitType): void {
    const producer = UNITS[type].producer;
    const sites = this.buildings.filter((b) => b.team === team && b.type === producer && !b.dead);
    if (sites.length === 0) return;
    const ts = this.teams[team];
    const site = sites[ts.spawnTurn[producer]++ % sites.length];
    ts.stats.unitsBuilt++;
    if (type === 'carryall') {
      // Lifts off the pad and holds over the rally point, or over its factory.
      const c = this.spawnUnit(type, team, site.x, site.z, -Math.PI / 2) as Carryall;
      c.y = site.y + 1;
      const r = ts.rally[producer];
      c.task = r ? { kind: 'move', x: r.x, z: r.z } : { kind: 'orbit', x: site.x, z: site.z };
      return;
    }
    const front = site.frontCell();
    const cell = this.dockCell(site);
    const u = this.spawnUnit(type, team, this.map.center(cell.cx), this.map.center(cell.cz), site.doorHeading());
    if (type === 'harvester') {
      u.commandHarvest(this, null);
      return;
    }
    const rally = ts.rally[producer];
    if (rally) {
      u.command(this, { kind: 'move', x: rally.x, z: rally.z });
    } else {
      const out = site.doorStep();
      const spots = cellsAround(this.map, front.cx + out.dx * 2, front.cz + out.dz * 2, 10);
      const s = spots[Math.floor(this.random() * spots.length)];
      if (s) u.command(this, { kind: 'move', x: this.map.center(s.cx), z: this.map.center(s.cz) });
    }
  }

  // ---- Production -----------------------------------------------------------

  /** Number of queue items that build at once for a producer type. */
  activeLines(team: Team, p: Producer): number {
    return this.count(team, p);
  }

  private spend(ts: TeamState, amount: number): void {
    ts.credits -= amount;
    ts.stats.creditsSpent += amount;
  }

  private refund(ts: TeamState, amount: number): void {
    ts.credits += amount;
    ts.stats.creditsSpent -= amount;
  }

  /** Spends credits if the team has them (repairs pay as they go). */
  pay(team: Team, amount: number): boolean {
    const ts = this.teams[team];
    if (ts.credits < amount) return false;
    this.spend(ts, amount);
    return true;
  }

  /** The most damaged own unit or structure a repair vehicle could fix within `range`, if any. */
  damagedFriend(mech: Unit, range: number): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    const consider = (e: Entity) => {
      if (e === mech || e.team !== mech.team || e.dead || e.hp >= e.maxHp || !repairable(e)) return;
      if (e instanceof Unit && (e.carrier || e.falling)) return;
      const d = distTo(e, mech.x, mech.z);
      if (d > range) return;
      const score = d + (e.hp / e.maxHp) * 10;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    };
    for (const u of this.units) consider(u);
    for (const b of this.buildings) consider(b);
    return best;
  }

  /** The Carryall assigned to ferry this harvester, if any. */
  ferryFor(h: Unit): Carryall | null {
    for (const u of this.units) {
      if (u instanceof Carryall && !u.dead && u.task.kind === 'ferry' && u.task.harvester === h) return u;
    }
    return null;
  }

  /** A Carryall just set down or dropped a unit: warn the other side if it landed near their base. */
  onDrop(carrier: Unit, u: Unit): void {
    for (const ts of this.teams) {
      if (ts.team === carrier.team || this.time - this.lastDropAlert < 12) continue;
      if (this.buildings.some((b) => b.team === ts.team && !b.dead && hypot(b.x - u.x, b.z - u.z) < 22 * TILE)) {
        if (ts.team === this.localTeam) this.lastDropAlert = this.time;
        this.notifyTeam(ts.team, 'Enemy airdrop detected!');
      }
    }
  }

  /** Shows a message, if the team is the one playing on this screen. */
  notifyTeam(team: Team, text: string): void {
    if (team === this.localTeam) this.onMessage(text);
  }

  startBuilding(team: Team, type: BuildingType): boolean {
    const ts = this.teams[team];
    if (ts.building || !this.canBuild(team, type)) return false;
    const cost = BUILDINGS[type].cost;
    if (ts.credits < cost) {
      this.notifyTeam(team, 'Insufficient funds.');
      return false;
    }
    this.spend(ts, cost);
    ts.building = { type, progress: 0, ready: false };
    return true;
  }

  cancelBuilding(team: Team): void {
    const ts = this.teams[team];
    if (!ts.building) return;
    this.refund(ts, BUILDINGS[ts.building.type].cost);
    ts.building = null;
  }

  /** Places the finished structure. Returns false if the spot is invalid. */
  finishPlacement(team: Team, cx: number, cz: number): boolean {
    const ts = this.teams[team];
    if (!ts.building?.ready || !this.canPlace(ts.building.type, team, cx, cz)) return false;
    this.placeBuilding(ts.building.type, team, cx, cz);
    ts.stats.structuresBuilt++;
    ts.building = null;
    return true;
  }

  queueUnit(team: Team, type: UnitType): boolean {
    const ts = this.teams[team];
    const queue = ts.queues[UNITS[type].producer];
    if (!this.canTrain(team, type)) return false;
    if (queue.length >= QUEUE_MAX) {
      this.notifyTeam(team, 'Production queue full.');
      return false;
    }
    const cost = UNITS[type].cost;
    if (ts.credits < cost) {
      this.notifyTeam(team, 'Insufficient funds.');
      return false;
    }
    this.spend(ts, cost);
    queue.push({ type, progress: 0 });
    return true;
  }

  dequeueUnit(team: Team, type: UnitType): void {
    const q = this.teams[team].queues[UNITS[type].producer];
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].type === type) {
        q.splice(i, 1);
        this.refund(this.teams[team], UNITS[type].cost);
        return;
      }
    }
  }

  startResearch(team: Team, type: UpgradeType): boolean {
    const ts = this.teams[team];
    if (ts.research || !this.canResearch(team, type)) return false;
    const cost = UPGRADES[type].cost;
    if (ts.credits < cost) {
      this.notifyTeam(team, 'Insufficient funds.');
      return false;
    }
    this.spend(ts, cost);
    ts.research = { type, progress: 0 };
    return true;
  }

  startLevelUp(team: Team, type: LevelUpType): boolean {
    const ts = this.teams[team];
    const building = this.buildings.find((b) => b.team === team && b.type === type && b.level < 2 && !b.dead);
    if (!building || !this.canLevelUp(team, type)) return false;
    const cost = BUILDINGS[type].levelUp!.cost;
    if (ts.credits < cost) {
      this.notifyTeam(team, 'Insufficient funds.');
      return false;
    }
    this.spend(ts, cost);
    ts.levelUps[type] = { building, progress: 0 };
    return true;
  }

  cancelLevelUp(team: Team, type: LevelUpType): void {
    const ts = this.teams[team];
    if (!ts.levelUps[type]) return;
    this.refund(ts, BUILDINGS[type].levelUp!.cost);
    delete ts.levelUps[type];
  }

  cancelResearch(team: Team): void {
    const ts = this.teams[team];
    if (!ts.research) return;
    this.refund(ts, UPGRADES[ts.research.type].cost);
    ts.research = null;
  }

  private updateProduction(ts: TeamState, dt: number): void {
    const b = ts.building;
    if (b && !b.ready && this.canBuild(ts.team, b.type)) {
      b.progress += dt / BUILDINGS[b.type].buildTime;
      if (b.progress >= 1) {
        b.progress = 1;
        b.ready = true;
        this.notifyTeam(ts.team, 'Construction complete. Click the card to place it.');
      }
    }
    for (const p of PRODUCERS) {
      const queue = ts.queues[p];
      const lines = this.activeLines(ts.team, p);
      for (let i = 0; i < queue.length && i < lines; i++) {
        const q = queue[i];
        if (!this.canTrain(ts.team, q.type)) continue;
        q.progress += dt / UNITS[q.type].buildTime;
        if (q.progress >= 1) {
          queue.splice(i--, 1);
          this.spawnFromProducer(ts.team, q.type);
          this.notifyTeam(ts.team, `${UNITS[q.type].name} ready.`);
        }
      }
    }
    for (const type of LEVEL_UP_ORDER) {
      const l = ts.levelUps[type];
      if (!l) continue;
      if (l.building.dead) {
        delete ts.levelUps[type]; // lost with the building
        continue;
      }
      const up = BUILDINGS[type].levelUp!;
      l.progress += dt / up.time;
      if (l.progress >= 1) {
        l.building.setLevel(2);
        delete ts.levelUps[type];
        this.notifyTeam(ts.team, `${up.name} complete.`);
      }
    }
    const r = ts.research;
    if (r && this.requirementsMet(ts.team, UPGRADES[r.type].requires)) {
      r.progress += dt / UPGRADES[r.type].time;
      if (r.progress >= 1) {
        ts.upgrades.add(r.type);
        ts.research = null;
        this.notifyTeam(ts.team, `Upgrade complete: ${UPGRADES[r.type].name}.`);
      }
    }
  }

  // ---- Combat ---------------------------------------------------------------

  /** The weapon a unit uses against this target: Infantry Rockets swap in against Armored. */
  weaponFor(u: Unit, target: Entity): WeaponDef | null {
    const anti = u.def.antiArmor;
    const w = anti && target.tags.includes('armored') && this.teams[u.team].upgrades.has('rockets') ? anti : u.def.weapon;
    if (w && target.tags.includes('air') && !w.air) return null;
    return w;
  }

  fire(u: Unit, target: Entity, w: WeaponDef): void {
    const mult = 1 + WEAPONS_BONUS * this.tier(u.team, 'weapons');
    const from = u.muzzleWorld();
    const to = target.aimPoint();
    this.effects.flash(from, w.projectile === 'bullet' ? 0.15 : 0.35);
    if (w.projectile === 'bullet') {
      to.x += (Math.random() - 0.5) * 0.5;
      to.z += (Math.random() - 0.5) * 0.5;
      this.effects.tracer(from, to);
      this.damage(target, w, mult, u);
      return;
    }
    const mesh = new THREE.Mesh(w.projectile === 'shell' ? shellGeo : rocketGeo, mat(w.projectile === 'shell' ? 0x403020 : 0xeeeeee));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: w.projectile, x: target.x, z: target.z, mesh, start: from, end: to, target, owner: u, t: 0,
      duration: Math.max(0.1, hypot(target.x - u.x, target.z - u.z) / w.speed), weapon: w, mult, trailTimer: 0, from: from.clone(), to: from.clone(),
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t = Math.min(1, p.t + dt / p.duration);
      if (!p.target.dead) {
        p.x = p.target.x;
        p.z = p.target.z;
        p.end.copy(p.target.aimPoint());
      }
      const arc = p.kind === 'rocket' ? 0.35 * p.start.distanceTo(p.end) : 0.4;
      const pos = new THREE.Vector3().lerpVectors(p.start, p.end, p.t);
      pos.y += arc * 4 * p.t * (1 - p.t);
      const dir = pos.clone().sub(p.to);
      p.mesh.position.copy(pos);
      if (dir.lengthSq() > 1e-6) p.mesh.lookAt(pos.clone().add(dir));
      if (p.kind === 'rocket') {
        p.trailTimer -= dt;
        if (p.trailTimer <= 0) {
          p.trailTimer = 0.04;
          this.effects.puff(pos, 0xbbbbbb);
        }
      }
      if (p.t >= 1) {
        const splash = p.weapon.splash;
        this.effects.explosion(p.end, splash > 0 ? 1.3 : p.kind === 'rocket' ? 0.8 : 0.6);
        if (splash > 0) {
          // The target takes the full hit; anything else in the blast takes half, fading toward the edge, so one
          // rocket into a tight group doesn't do full damage to every unit in it.
          const victims = [...this.units, ...this.buildings].filter(
            (e) => e.team !== p.owner.team && !e.dead && distTo(e, p.x, p.z) <= splash,
          );
          for (const v of victims) {
            const share = v === p.target ? 1 : SPLASH_SHARE * (1 - distTo(v, p.x, p.z) / splash / 2);
            this.damage(v, p.weapon, p.mult * share, p.owner);
          }
        } else if (!p.target.dead) {
          this.damage(p.target, p.weapon, p.mult, p.owner);
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  damage(target: Entity, w: WeaponDef, mult: number, attacker: Unit | null): void {
    if (target.dead || (target instanceof Unit && target.carrier)) return;
    target.lastHurt = this.time;
    // Whoever fires is seen by the side it hits for a moment, so units below a cliff can shoot back.
    if (attacker && attacker.team !== target.team) this.vision.reveal(target.team, attacker.x, attacker.z, this.ticks);
    let dmg = weaponDamage(w, target) * mult;
    dmg *= 1 - ARMOR_BONUS * this.tier(target.team, 'armor');
    target.hp -= dmg;
    if (target instanceof Unit) {
      target.onDamaged(attacker);
      // A harvester under fire calls its Carryall to fly it home.
      if (target.type === 'harvester') this.ferryFor(target)?.rescue(this, target);
    }
    const important = target instanceof Building || (target as Unit).type === 'harvester';
    if (target.team === this.localTeam && important && this.time - this.lastAlert > 15) {
      this.lastAlert = this.time;
      this.onMessage(target instanceof Building ? 'Our base is under attack!' : 'Harvester under attack!');
    }
    if (target.hp <= 0) this.kill(target, attacker);
  }

  private kill(e: Entity, attacker: Unit | null): void {
    e.dead = true;
    const victim = this.teams[e.team].stats;
    const killer = attacker && attacker.team !== e.team ? this.teams[attacker.team] : null;
    if (e instanceof Building) {
      victim.structuresLost++;
      if (killer) killer.stats.structuresDestroyed++;
    } else {
      victim.unitsLost++;
      if (killer) killer.stats.unitsKilled++;
    }
    if (killer && attacker) {
      attacker.kills++;
      if (!killer.hero || attacker.kills > killer.hero.kills) killer.hero = attacker;
    }
    e.setSelected(false);
    // The local player keeps seeing a structure they knew about until they look again.
    if (e instanceof Building && e.known && !this.shown(e)) this.ghosts.push(e);
    else this.scene.remove(e.root);
    if (e instanceof Building) {
      for (let z = e.cz; z < e.cz + e.size; z++) {
        for (let x = e.cx; x < e.cx + e.size; x++) this.map.occupied[this.map.idx(x, z)] = 0;
      }
      this.unloadBunker(e); // whoever was inside gets out
      for (let k = 0; k < 5; k++) {
        const p = new THREE.Vector3(e.x + (Math.random() - 0.5) * 4, e.y + 1 + Math.random(), e.z + (Math.random() - 0.5) * 4);
        this.effects.explosion(p, 1.5 + Math.random() * 1.5);
      }
      this.notifyTeam(e.team, `${e.name} destroyed.`);
    } else {
      this.effects.explosion(e.aimPoint(), (e as Unit).def.infantry ? 0.5 : 1.3);
    }
    if (e instanceof Carryall) {
      // Shot down: troopers bail out by parachute; vehicles go down with it.
      for (const p of e.releaseAll()) {
        if (p.def.infantry) p.startFall(this, e.x + (this.random() - 0.5) * 2, e.y - 0.5, e.z + (this.random() - 0.5) * 2);
        else {
          p.hp = 0;
          this.kill(p, attacker);
          this.effects.explosion(new THREE.Vector3(p.x, this.map.surfaceAt(p.x, p.z) + 0.5, p.z), 1.6);
        }
      }
      this.effects.explosion(new THREE.Vector3(e.x, this.map.surfaceAt(e.x, e.z) + 0.5, e.z), 1.8);
    }
  }

  // ---- Bunkers --------------------------------------------------------------

  /** Puts an infantry unit into its own team's bunker, if there's room. */
  enterBunker(u: Unit, b: Building): boolean {
    if (!u.def.infantry || u.team !== b.team || b.dead || b.room <= 0 || u.carrier) return false;
    u.carrier = b;
    u.path = [];
    u.target = null;
    u.order = { kind: 'idle' };
    u.setSelected(false);
    u.root.visible = false;
    // Shots come from the roof.
    u.x = b.x;
    u.z = b.z;
    u.root.position.set(b.x, b.y + 1.4, b.z);
    b.occupants.push(u);
    this.effects.puff(new THREE.Vector3(b.x, b.y + 0.5, b.z), 0xd8c49a);
    return true;
  }

  /** Everyone out, onto the cells in front of the door. */
  unloadBunker(b: Building): Unit[] {
    const out = b.occupants;
    b.occupants = [];
    if (!out.length) return out;
    const front = b.frontCell();
    const spots = cellsAround(this.map, front.cx, front.cz, out.length, 'foot');
    out.forEach((u, k) => {
      const c = spots[k] ?? front;
      u.carrier = null;
      u.x = this.map.center(c.cx);
      u.z = this.map.center(c.cz);
      u.root.visible = true;
      u.order = { kind: 'idle' };
    });
    return out;
  }

  /**
   * Infantry in a bunker shoot from it with their own weapons (rifles, or Infantry Rockets against armor), measuring
   * range from the bunker's walls.
   */
  private updateBunkers(dt: number): void {
    for (const b of this.buildings) {
      if (!b.occupants.length) continue;
      b.occupants = b.occupants.filter((u) => !u.dead);
      // Gap between the bunker's square walls and the target's edge.
      const gap = (t: Entity) => {
        if (t instanceof Building) {
          const reach = ((b.size + t.size) * TILE) / 2;
          return hypot(Math.max(0, Math.abs(t.x - b.x) - reach), Math.max(0, Math.abs(t.z - b.z) - reach));
        }
        return Math.max(0, distTo(b, t.x, t.z) - t.radius);
      };
      for (const u of b.occupants) {
        u.cooldown -= dt;
        if (u.cooldown > 0) continue;
        const reach = Math.max(u.def.weapon!.range, u.def.antiArmor?.range ?? 0) * 1.1;
        const t = u.target && !u.target.dead && this.vision.sees(b.team, u.target) && gap(u.target) <= reach ? u.target : this.nearestEnemy(b.team, b.x, b.z, reach + b.size * TILE, u);
        u.target = t;
        if (!t) continue;
        const w = this.weaponFor(u, t);
        if (!w || gap(t) > this.rangeFor(u, w, t)) continue;
        this.fire(u, t, w);
        u.cooldown = this.cooldownFor(u, w) * (0.9 + this.random() * 0.2);
      }
    }
  }

  offerSurrender(team: Team): void {
    if (this.winner === null) this.onSurrenderOffer(team);
  }

  acceptSurrender(team: Team): void {
    if (this.winner !== null) return;
    this.surrendered = team;
    this.winner = (1 - team) as Team;
  }

  // ---- Simulation -----------------------------------------------------------

  /**
   * One simulation step. Lockstep multiplayer runs this at a fixed rate (TICK) on every machine with the same
   * commands, so it must depend on nothing but the game state: no frame time, camera or Math.random.
   */
  update(dt: number): void {
    this.ticks++;
    // Frames draw units between ticks; put them back where the simulation left them (muzzles aim from there).
    for (const u of this.units) u.beginTick();
    this.time += dt;
    if ((this.ticks - 1) % VISION_EVERY === 0) this.vision.update(this.units, this.buildings, this.ticks);
    for (const ts of this.teams) this.updateProduction(ts, dt);
    // Alternate the order units act in, so neither side always gets the first shot in a tick.
    const order = this.ticks % 2 ? this.units : [...this.units].reverse();
    for (const u of order) {
      if (u.dead || u.carrier) continue;
      if (u.falling) u.updateFall(this, dt);
      else u.update(this, dt);
      if (u.def.infantry && u.hp < u.maxHp && this.time - u.lastHurt > INFANTRY_REGEN.delay) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * INFANTRY_REGEN.rate * dt);
      }
    }
    this.updateBunkers(dt);
    this.separate();
    for (const u of this.units) if (!u.carrier) u.syncVisual(this, dt);
    this.updateProjectiles(dt);
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);
    for (const u of this.units) u.endTick();
    for (const p of this.projectiles) {
      p.from.copy(p.to);
      p.to.copy(p.mesh.position);
    }

    this.victoryTimer -= dt;
    if (this.winner === null && this.victoryTimer <= 0) {
      this.victoryTimer = 1;
      const alive = (t: Team) => this.units.some((u) => u.team === t) || this.buildings.some((b) => b.team === t);
      if (!alive(0)) this.winner = 1;
      else if (!alive(1)) this.winner = 0;
    }
  }

  /**
   * Per drawn frame, outside the simulation: moves units and shots `alpha` (0-1) of the way from their last tick's
   * pose to this tick's, and runs effects, health bars and other purely visual things.
   */
  frame(dt: number, alpha: number): void {
    for (const u of this.units) u.interpolate(alpha);
    for (const p of this.projectiles) {
      p.mesh.position.lerpVectors(p.from, p.to, alpha);
      p.mesh.visible = this.revealAll || this.vision.seesAt(this.localTeam, p.mesh.position.x, p.mesh.position.z);
    }
    this.drawFog(dt);
    for (const b of this.buildings) if (b.spinner) b.spinner.rotation.y += dt * (b.type === 'factory' ? 1.5 : 0.25);
    this.effects.update(dt);
    this.terrain.flush();
    for (const u of this.units) if (u.root.visible) u.updateBar(this.camera);
    for (const b of this.buildings) if (this.shown(b)) b.updateBar(this.camera);
  }

  /** Whether the local player's screen shows an entity now: their own, or anything their side sees. */
  shown(e: Entity): boolean {
    if (this.revealAll || e.team === this.localTeam) return true;
    if (e instanceof Unit && e.carrier instanceof Unit) return this.shown(e.carrier);
    return this.vision.sees(this.localTeam, e);
  }

  /** Fog of war on the local player's screen: the ground, enemies out of sight, and last-seen structures. */
  private drawFog(dt: number): void {
    const local = this.localTeam;
    this.terrain.updateFog(this.vision.visible[local], this.vision.explored[local], this.revealAll, dt);
    for (const u of this.units) {
      // Infantry ride inside bunkers and Carryalls; vehicles hang under the Carryall.
      const aboard = u.carrier instanceof Building || (u.carrier !== null && u.def.infantry);
      u.root.visible = !aboard && this.shown(u);
    }
    for (const b of this.buildings) {
      if (this.shown(b)) b.known = true;
      else b.bar.visible = false;
      b.root.visible = b.known;
    }
    // A ghost of a destroyed structure goes once the player looks at the spot again.
    this.ghosts = this.ghosts.filter((b) => {
      const gone = this.revealAll || this.vision.sees(local, b);
      if (gone) this.scene.remove(b.root);
      return !gone;
    });
  }

  /** Checksum of the game state; lockstep players compare these to catch a desync early. */
  hash(): number {
    const h = new Hasher().int(this.ticks).int(this.nextId);
    for (const ts of this.teams) h.num(ts.credits).int(ts.upgrades.size);
    for (const u of this.units) h.int(u.id).num(u.x).num(u.z).num(u.y).num(u.hp).num(u.heading);
    for (const b of this.buildings) h.int(b.id).num(b.hp);
    for (const p of this.projectiles) h.num(p.t).num(p.x).num(p.z);
    return h.value;
  }

  /** Pushes overlapping units apart, never into blocked cells. */
  private separate(): void {
    const us = this.units.filter((u) => !u.def.air && !u.carrier && !u.falling);
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        const minD = a.radius + b.radius;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
        let d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        if (d2 < 1e-6) {
          dx = this.random() - 0.5;
          dz = this.random() - 0.5;
          d2 = dx * dx + dz * dz;
        }
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        const aMoving = a.path.length > 0;
        const bMoving = b.path.length > 0;
        const shareA = aMoving && !bMoving ? 0.2 : !aMoving && bMoving ? 0.8 : 0.5;
        this.nudge(a, -nx * push * 2 * shareA, -nz * push * 2 * shareA);
        this.nudge(b, nx * push * 2 * (1 - shareA), nz * push * 2 * (1 - shareA));
      }
    }
  }

  /** Moves a unit by a push, axis by axis, unless that would put it somewhere it can't walk (or off a level edge). */
  private nudge(u: Unit, dx: number, dz: number): void {
    const m = this.map;
    const step = (fx: number, fz: number, tx: number, tz: number) =>
      (fx === tx && fz === tz) || (m.inBounds(tx, tz) && m.canStep(fx, fz, tx, tz, u.moveClass));
    const cx = m.cellOf(u.x);
    const cz = m.cellOf(u.z);
    const inBlocked = !m.canEnter(cx, cz, u.moveClass);
    if (inBlocked || step(cx, cz, m.cellOf(u.x + dx), cz)) u.x += dx;
    const cx2 = m.cellOf(u.x);
    if (inBlocked || step(cx2, cz, cx2, m.cellOf(u.z + dz))) u.z += dz;
  }

}

/** Base damage plus the weapon's bonus for each of the target's tags, before upgrades. */
export function weaponDamage(w: WeaponDef, target: Entity): number {
  let dmg = w.damage;
  for (const t of target.tags) dmg += w.bonus[t] ?? 0;
  return Math.max(1, dmg);
}
