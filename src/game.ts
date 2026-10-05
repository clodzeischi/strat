import * as THREE from 'three';
import {
  ARMOR_BONUS, BUILDINGS, NITRO, PLAYER, PRODUCERS, QUEUE_MAX, START_CREDITS, TILE, UNITS, UPGRADES, WEAPONS_BONUS,
  type Producer,
  type BuildingType, type ProjectileKind, type Team,
  type WeaponDef, type UnitType, type UpgradeType,
} from './config';
import { Effects } from './effects';
import { Building, distTo, Unit, type Entity } from './entities';
import { GameMap, ROCK, SPICE, type Cell } from './map';
import { mat } from './models';
import { cellsAround, type Point } from './pathfinding';
import { Terrain } from './terrain';

export interface TeamState {
  team: Team;
  credits: number;
  upgrades: Set<UpgradeType>;
  /** The one structure being built at the Construction Yard. */
  building: { type: BuildingType; progress: number; ready: boolean } | null;
  /** One queue per producer type. The first N items build in parallel, N = buildings of that type. */
  queues: Record<Producer, { type: UnitType; progress: number }[]>;
  research: { type: UpgradeType; progress: number } | null;
  rally: Record<Producer, Point | null>;
  /** Round-robin counter so units leave from each building of a type in turn. */
  spawnTurn: Record<Producer, number>;
}

interface Projectile {
  kind: ProjectileKind;
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
}

const shellGeo = new THREE.IcosahedronGeometry(0.12, 0);
const rocketGeo = new THREE.ConeGeometry(0.12, 0.6, 5);
rocketGeo.rotateX(Math.PI / 2); // point along +Z so lookAt aims it

export class Game {
  readonly map = new GameMap(7);
  readonly terrain: Terrain;
  readonly effects: Effects;
  units: Unit[] = [];
  buildings: Building[] = [];
  teams: TeamState[];
  time = 0;
  winner: Team | null = null;
  /** Called with player-facing notifications. */
  onMessage: (text: string) => void = () => {};
  private nextId = 1;
  private projectiles: Projectile[] = [];
  private lastAlert = -100;
  private victoryTimer = 0;

  constructor(readonly scene: THREE.Scene, private camera: THREE.Camera) {
    this.terrain = new Terrain(this.map);
    scene.add(this.terrain.mesh);
    this.effects = new Effects(scene);
    this.teams = ([0, 1] as Team[]).map((team) => ({
      team, credits: START_CREDITS, upgrades: new Set<UpgradeType>(),
      building: null, queues: { barracks: [], factory: [] }, research: null,
      rally: { barracks: null, factory: null }, spawnTurn: { barracks: 0, factory: 0 },
    }));
    this.setupStart();
  }

  private setupStart(): void {
    this.map.bases.forEach((b, i) => {
      const team = i as Team;
      const yard = this.placeBuilding('conyard', team, b.cx - 1, b.cz - 1);
      const front = yard.frontCell();
      const towardCenter = { cx: front.cx + (team === 0 ? 3 : -3), cz: front.cz + (team === 0 ? -1 : 1) };
      const cells = cellsAround(this.map, towardCenter.cx, towardCenter.cz, 12);
      const start: UnitType[] = ['trike', 'infantry', 'infantry', 'infantry'];
      start.forEach((type, k) => {
        const c = cells[k * 2] ?? cells[0];
        this.spawnUnit(type, team, this.map.center(c.cx), this.map.center(c.cz), team === 0 ? -Math.PI / 4 : (Math.PI * 3) / 4);
      });
    });
  }

  // ---- Queries --------------------------------------------------------------

  has(team: Team, type: BuildingType): boolean {
    return this.buildings.some((b) => b.team === team && b.type === type && !b.dead);
  }

  count(team: Team, type: BuildingType | UnitType): number {
    let n = 0;
    for (const b of this.buildings) if (b.team === team && b.type === type && !b.dead) n++;
    for (const u of this.units) if (u.team === team && u.type === type && !u.dead) n++;
    return n;
  }

  requirementsMet(team: Team, reqs: BuildingType[]): boolean {
    return reqs.every((r) => this.has(team, r));
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
      if (e.team === team || e.dead) return;
      const d = distTo(e, x, z);
      if (d > range) return;
      let score = d + penalty;
      const w = seeker && this.weaponFor(seeker, e);
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
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  dockCell(refinery: Building): Cell {
    const f = refinery.frontCell();
    return this.map.nearestPassable(f.cx, f.cz) ?? f;
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
    for (let z = cz; z < cz + size; z++) {
      for (let x = cx; x < cx + size; x++) {
        if (!this.map.inBounds(x, z)) return false;
        const i = this.map.idx(x, z);
        if (this.map.tiles[i] !== ROCK || this.map.occupied[i] !== 0) return false;
      }
    }
    const x0 = cx * TILE;
    const z0 = cz * TILE;
    const x1 = (cx + size) * TILE;
    const z1 = (cz + size) * TILE;
    for (const u of this.units) {
      if (u.x + u.radius > x0 && u.x - u.radius < x1 && u.z + u.radius > z0 && u.z - u.radius < z1) return false;
    }
    // Must be close to one of our own buildings.
    return this.buildings.some((b) => {
      if (b.team !== team || b.dead) return false;
      const gapX = Math.max(b.cx - (cx + size), cx - (b.cx + b.size), 0);
      const gapZ = Math.max(b.cz - (cz + size), cz - (b.cz + b.size), 0);
      return Math.max(gapX, gapZ) <= 4;
    });
  }

  // ---- Spawning -------------------------------------------------------------

  spawnUnit(type: UnitType, team: Team, x: number, z: number, heading = 0): Unit {
    const u = new Unit(this.nextId++, team, type, x, z, heading);
    u.y = this.map.heightAt(x, z);
    u.syncVisual(this, 0);
    this.scene.add(u.root);
    this.units.push(u);
    return u;
  }

  placeBuilding(type: BuildingType, team: Team, cx: number, cz: number): Building {
    const b = new Building(this.nextId++, team, type, cx, cz, this.map.heightAt((cx + 0.5) * TILE, (cz + 0.5) * TILE));
    for (let z = cz; z < cz + b.size; z++) {
      for (let x = cx; x < cx + b.size; x++) this.map.occupied[this.map.idx(x, z)] = b.id;
    }
    this.scene.add(b.root);
    this.buildings.push(b);
    if (type === 'refinery') {
      const dock = this.dockCell(b);
      const h = this.spawnUnit('harvester', team, this.map.center(dock.cx), this.map.center(dock.cz), Math.PI / 2);
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
    const front = site.frontCell();
    const cell = this.map.nearestPassable(front.cx, front.cz) ?? front;
    const u = this.spawnUnit(type, team, this.map.center(cell.cx), this.map.center(cell.cz), Math.PI / 2);
    if (type === 'harvester') {
      u.commandHarvest(this, null);
      return;
    }
    const rally = ts.rally[producer];
    if (rally) {
      u.command(this, { kind: 'move', x: rally.x, z: rally.z });
    } else {
      const spots = cellsAround(this.map, front.cx, front.cz + 2, 10);
      const s = spots[Math.floor(Math.random() * spots.length)];
      if (s) u.command(this, { kind: 'move', x: this.map.center(s.cx), z: this.map.center(s.cz) });
    }
  }

  // ---- Production -----------------------------------------------------------

  /** Number of queue items that build at once for a producer type. */
  activeLines(team: Team, p: Producer): number {
    return this.count(team, p);
  }

  private notify(team: Team, text: string): void {
    if (team === PLAYER) this.onMessage(text);
  }

  startBuilding(team: Team, type: BuildingType): boolean {
    const ts = this.teams[team];
    if (ts.building || !this.canBuild(team, type)) return false;
    const cost = BUILDINGS[type].cost;
    if (ts.credits < cost) {
      this.notify(team, 'Insufficient funds.');
      return false;
    }
    ts.credits -= cost;
    ts.building = { type, progress: 0, ready: false };
    return true;
  }

  cancelBuilding(team: Team): void {
    const ts = this.teams[team];
    if (!ts.building) return;
    ts.credits += BUILDINGS[ts.building.type].cost;
    ts.building = null;
  }

  /** Places the finished structure. Returns false if the spot is invalid. */
  finishPlacement(team: Team, cx: number, cz: number): boolean {
    const ts = this.teams[team];
    if (!ts.building?.ready || !this.canPlace(ts.building.type, team, cx, cz)) return false;
    this.placeBuilding(ts.building.type, team, cx, cz);
    ts.building = null;
    return true;
  }

  queueUnit(team: Team, type: UnitType): boolean {
    const ts = this.teams[team];
    const queue = ts.queues[UNITS[type].producer];
    if (!this.canTrain(team, type)) return false;
    if (queue.length >= QUEUE_MAX) {
      this.notify(team, 'Production queue full.');
      return false;
    }
    const cost = UNITS[type].cost;
    if (ts.credits < cost) {
      this.notify(team, 'Insufficient funds.');
      return false;
    }
    ts.credits -= cost;
    queue.push({ type, progress: 0 });
    return true;
  }

  dequeueUnit(team: Team, type: UnitType): void {
    const q = this.teams[team].queues[UNITS[type].producer];
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].type === type) {
        q.splice(i, 1);
        this.teams[team].credits += UNITS[type].cost;
        return;
      }
    }
  }

  startResearch(team: Team, type: UpgradeType): boolean {
    const ts = this.teams[team];
    if (ts.research || !this.canResearch(team, type)) return false;
    const cost = UPGRADES[type].cost;
    if (ts.credits < cost) {
      this.notify(team, 'Insufficient funds.');
      return false;
    }
    ts.credits -= cost;
    ts.research = { type, progress: 0 };
    return true;
  }

  cancelResearch(team: Team): void {
    const ts = this.teams[team];
    if (!ts.research) return;
    ts.credits += UPGRADES[ts.research.type].cost;
    ts.research = null;
  }

  private updateProduction(ts: TeamState, dt: number): void {
    const b = ts.building;
    if (b && !b.ready && this.canBuild(ts.team, b.type)) {
      b.progress += dt / BUILDINGS[b.type].buildTime;
      if (b.progress >= 1) {
        b.progress = 1;
        b.ready = true;
        this.notify(ts.team, 'Construction complete. Click the card to place it.');
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
          this.notify(ts.team, `${UNITS[q.type].name} ready.`);
        }
      }
    }
    const r = ts.research;
    if (r && this.requirementsMet(ts.team, UPGRADES[r.type].requires)) {
      r.progress += dt / UPGRADES[r.type].time;
      if (r.progress >= 1) {
        ts.upgrades.add(r.type);
        ts.research = null;
        this.notify(ts.team, `Upgrade complete: ${UPGRADES[r.type].name}.`);
      }
    }
  }

  // ---- Combat ---------------------------------------------------------------

  /** The weapon a unit uses against this target: Infantry Rockets swap in against Armored. */
  weaponFor(u: Unit, target: Entity): WeaponDef | null {
    const anti = u.def.antiArmor;
    if (anti && target.tags.includes('armored') && this.teams[u.team].upgrades.has('rockets')) return anti;
    return u.def.weapon;
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
      kind: w.projectile, mesh, start: from, end: to, target, owner: u, t: 0,
      duration: Math.max(0.1, from.distanceTo(to) / w.speed), weapon: w, mult, trailTimer: 0,
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t = Math.min(1, p.t + dt / p.duration);
      if (!p.target.dead) p.end.copy(p.target.aimPoint());
      const arc = p.kind === 'rocket' ? 0.35 * p.start.distanceTo(p.end) : 0.4;
      const pos = new THREE.Vector3().lerpVectors(p.start, p.end, p.t);
      pos.y += arc * 4 * p.t * (1 - p.t);
      const dir = pos.clone().sub(p.mesh.position);
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
          const victims = [...this.units, ...this.buildings].filter(
            (e) => e.team !== p.owner.team && !e.dead && distTo(e, p.end.x, p.end.z) <= splash,
          );
          for (const v of victims) this.damage(v, p.weapon, p.mult, p.owner);
        } else if (!p.target.dead) {
          this.damage(p.target, p.weapon, p.mult, p.owner);
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  damage(target: Entity, w: WeaponDef, mult: number, attacker: Unit | null): void {
    if (target.dead) return;
    let dmg = weaponDamage(w, target) * mult;
    dmg *= 1 - ARMOR_BONUS * this.tier(target.team, 'armor');
    target.hp -= dmg;
    if (target instanceof Unit) target.onDamaged(attacker);
    const important = target instanceof Building || (target as Unit).type === 'harvester';
    if (target.team === PLAYER && important && this.time - this.lastAlert > 15) {
      this.lastAlert = this.time;
      this.onMessage(target instanceof Building ? 'Our base is under attack!' : 'Harvester under attack!');
    }
    if (target.hp <= 0) this.kill(target);
  }

  private kill(e: Entity): void {
    e.dead = true;
    e.setSelected(false);
    this.scene.remove(e.root);
    if (e instanceof Building) {
      for (let z = e.cz; z < e.cz + e.size; z++) {
        for (let x = e.cx; x < e.cx + e.size; x++) this.map.occupied[this.map.idx(x, z)] = 0;
      }
      for (let k = 0; k < 5; k++) {
        const p = new THREE.Vector3(e.x + (Math.random() - 0.5) * 4, e.y + 1 + Math.random(), e.z + (Math.random() - 0.5) * 4);
        this.effects.explosion(p, 1.5 + Math.random() * 1.5);
      }
      this.notify(e.team, `${e.name} destroyed.`);
    } else {
      this.effects.explosion(e.aimPoint(), (e as Unit).def.infantry ? 0.5 : 1.3);
    }
  }

  // ---- Simulation -----------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    for (const ts of this.teams) this.updateProduction(ts, dt);
    for (const u of this.units) if (!u.dead) u.update(this, dt);
    this.separate();
    for (const u of this.units) u.syncVisual(this, dt);
    this.updateProjectiles(dt);
    for (const b of this.buildings) if (b.spinner) b.spinner.rotation.y += dt * (b.type === 'factory' ? 1.5 : 0.25);
    this.effects.update(dt);
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);
    for (const u of this.units) u.updateBar(this.camera);
    for (const b of this.buildings) b.updateBar(this.camera);

    this.victoryTimer -= dt;
    if (this.winner === null && this.victoryTimer <= 0) {
      this.victoryTimer = 1;
      const alive = (t: Team) => this.units.some((u) => u.team === t) || this.buildings.some((b) => b.team === t);
      if (!alive(0)) this.winner = 1;
      else if (!alive(1)) this.winner = 0;
    }
  }

  /** Pushes overlapping units apart, never into blocked cells. */
  private separate(): void {
    const us = this.units;
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
          dx = Math.random() - 0.5;
          dz = Math.random() - 0.5;
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

  private nudge(u: Unit, dx: number, dz: number): void {
    const m = this.map;
    const inBlocked = !m.passable(m.cellOf(u.x), m.cellOf(u.z));
    if (inBlocked || m.passable(m.cellOf(u.x + dx), m.cellOf(u.z))) u.x += dx;
    if (inBlocked || m.passable(m.cellOf(u.x), m.cellOf(u.z + dz))) u.z += dz;
  }
}

/** Base damage plus the weapon's bonus for each of the target's tags, before upgrades. */
export function weaponDamage(w: WeaponDef, target: Entity): number {
  let dmg = w.damage;
  for (const t of target.tags) dmg += w.bonus[t] ?? 0;
  return Math.max(1, dmg);
}
