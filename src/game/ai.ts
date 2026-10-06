import { BUILDINGS, TILE, UNITS, UPGRADES, type BuildingType, type LevelUpType, type Producer, type Team, type UnitType, type UpgradeType } from '../config';
import { Building, type Entity, type Unit } from '../entities';
import type { Game } from './game';
import type { Cell } from '../map';

const RESEARCH_ORDER: UpgradeType[] = ['rockets', 'weapons1', 'armor1', 'nitro', 'harvest', 'weapons2', 'armor2'];

/** Economy and army knobs that differ between difficulties. Experimental: tuned with the sims in `sim/`. */
export interface AIProfile {
  /** Opening structures, built in this order before anything else. */
  opening: BuildingType[];
  /** Harvesters wanted: 'perRefinery' keeps one per refinery, a number is a total target. */
  harvesters: 'perRefinery' | number;
  /** When to add a second refinery: always, only after harvester losses or refinery damage, or never. */
  extraRefinery: 'always' | 'threat' | 'never';
  /** Total army (combat units) the AI wants before it starts spending on tech. */
  techArmy: number;
  /** Hold back unit spending until the next opening structure is affordable. */
  saveForOpening: boolean;
  /** Fewest working harvesters the AI accepts: below this, getting income back comes before army and tech. */
  minHarvesters: number;
  /** Credits kept aside once the base is up, so lost harvesters can be replaced. */
  fund: number;
  /** Defenders sent against an attack, as a multiple of the attackers' strength. */
  defenseMargin: number;
  /** Offers to surrender when it has lost its production and its income for good. */
  surrender: boolean;
}

export const NORMAL_PROFILE: AIProfile = {
  opening: ['refinery', 'barracks', 'factory'], harvesters: 'perRefinery', extraRefinery: 'always', techArmy: 8, saveForOpening: false,
  minHarvesters: 2, fund: UNITS.harvester.cost, defenseMargin: 1.5, surrender: true,
};

/** Rough fighting strength: what the unit cost, scaled by the health it has left. Unarmed units count for nothing. */
export function power(u: Unit): number {
  return u.def.weapon ? u.def.cost * (u.hp / u.maxHp) : 0;
}

/** Enemies this close to one of our buildings are attacking the base. */
const BASE_RADIUS = 14 * TILE;
/** Enemies this close to one of our harvesters are hunting it. */
const HARVESTER_RADIUS = 10 * TILE;
/** Intruders this close together count as one attack. */
const CLUSTER_RADIUS = 10 * TILE;
/** An attack that hasn't been seen for this long is over, and its defenders go home. */
const DEFENSE_TIMEOUT = 4;
/** A wave that has lost this share of its strength falls back instead of feeding units in one by one. */
const WAVE_RETREAT = 0.3;

type Role = 'home' | 'defend' | 'wave' | 'raid';

/** One attack on our base or harvesters, and the units sent to meet it. */
interface Defense {
  x: number;
  z: number;
  /** Combined strength of the attackers (see `power`). */
  power: number;
  /** True when it threatens buildings, not just harvesters out in the field. */
  base: boolean;
  lastSeen: number;
  units: Set<Unit>;
}

interface Wave {
  units: Set<Unit>;
  /** Strength when it set out. */
  start: number;
}

/**
 * A scripted opponent. Priorities, in order: keep an income (rebuild refineries and harvesters first), meet each
 * attack with enough force to beat it and bring the defenders home afterwards, then build counters to the enemy
 * army, raid and attack in waves. When its production and income are gone for good, it offers to surrender.
 */
export class AI {
  private thinkTimer = 2;
  private waveSize = 5;
  private nextWaveTime = 150;
  /** Unit we're saving up for, so expensive units still get built. */
  private nextUnit: UnitType | null = null;
  private nextRaidTime = 200;
  /** Tech path for this game: economy and anti-armor first, or heavy army first. */
  private readonly techOrder: LevelUpType[] = Math.random() < 0.5 ? ['conyard', 'factory'] : ['factory', 'conyard'];

  /** Game time of the last harvester or refinery loss / damage, for the 'threat' refinery rule. */
  private lastEconHit = -Infinity;
  private harvesterIds = new Set<number>();

  private roles = new Map<Unit, Role>();
  private defenses: Defense[] = [];
  private waves: Wave[] = [];
  private raiders = new Set<Unit>();
  /** Where idle units gather: just in front of the base, toward the middle of the map. */
  private rally: { x: number; z: number } | null = null;
  private rallyAnchor: Building | null = null;
  /** Once the opening is done, buildings missing from it are rebuilt before anything else is bought. */
  private openingDone = false;

  /** Consecutive thinks (seconds) the position has looked hopeless. */
  private hopelessFor = 0;
  surrenderOffered = false;

  constructor(private game: Game, private team: Team, private profile: AIProfile = NORMAL_PROFILE) {}

  /** The first opening structure we don't have yet (a type listed twice needs two of it). */
  private openingStep(): BuildingType | null {
    const opening = this.profile.opening;
    return opening.find((t, i) => this.game.count(this.team, t) < opening.slice(0, i + 1).filter((o) => o === t).length) ?? null;
  }

  private trackHarvesterLosses(): void {
    const alive = new Set(this.game.units.filter((u) => u.team === this.team && u.type === 'harvester').map((u) => u.id));
    for (const id of this.harvesterIds) if (!alive.has(id)) this.lastEconHit = this.game.time;
    this.harvesterIds = alive;
  }

  private wantRefineries(): number {
    if (this.profile.extraRefinery !== 'threat') return this.profile.extraRefinery === 'always' ? 2 : 1;
    const g = this.game;
    const damaged = g.buildings.some((b) => b.team === this.team && b.type === 'refinery' && b.hp < b.maxHp * 0.7);
    return damaged || g.time - this.lastEconHit < 120 ? 2 : 1;
  }

  private wantHarvesters(): number {
    const h = this.profile.harvesters;
    return h === 'perRefinery' ? this.game.count(this.team, 'refinery') : h;
  }

  /** Harvesters alive plus ones in the factory queue. */
  private harvesterCount(): number {
    return this.game.count(this.team, 'harvester') + this.ts.queues.factory.filter((q) => q.type === 'harvester').length;
  }

  /**
   * What the economy needs before anything else, or null when income is fine: a refinery when there is none,
   * else a harvester while there are fewer than `minHarvesters` (or than the profile wants, if that's fewer, as
   * early on). Without a factory to build one, a refinery is the cheaper way to get a harvester, since it comes
   * with one.
   */
  private econGoal(): { type: BuildingType | 'harvester'; cost: number } | null {
    const g = this.game;
    const refinery = { type: 'refinery' as const, cost: BUILDINGS.refinery.cost };
    if (!g.has(this.team, 'refinery')) return g.has(this.team, 'conyard') ? refinery : null;
    if (this.harvesterCount() >= Math.min(this.profile.minHarvesters, this.wantHarvesters())) return null;
    if (g.has(this.team, 'factory')) return { type: 'harvester', cost: UNITS.harvester.cost };
    return g.has(this.team, 'conyard') ? refinery : null;
  }

  /** A structure lost since the opening was finished: rebuilt before units, so production comes back. */
  private rebuildStep(): BuildingType | null {
    return this.openingDone ? this.openingStep() : null;
  }

  update(dt: number): void {
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 1;
    if (!this.openingStep()) this.openingDone = true;
    this.trackHarvesterLosses();
    this.manageConstruction();
    this.manageProduction();
    this.manageTech();
    this.manageArmy();
    this.considerSurrender();
  }

  /** Buys the next tech step once we can afford it. */
  private manageTech(): void {
    const goal = this.techGoal();
    if (!goal || this.ts.credits - goal.cost < this.fund()) return;
    if (goal.kind === 'level') this.game.startLevelUp(this.team, goal.type);
    else this.game.startResearch(this.team, goal.type);
  }

  /** The next tech step worth saving for: a level-up along our path (one at a time), else research. */
  private techGoal(): { kind: 'level'; type: LevelUpType; cost: number } | { kind: 'research'; type: UpgradeType; cost: number } | null {
    const g = this.game;
    const ts = this.ts;
    if (!g.has(this.team, 'factory') || g.count(this.team, 'refinery') < this.wantRefineries() || this.econGoal() || this.rebuildStep()) return null;
    if (!ts.levelUps.conyard && !ts.levelUps.factory) {
      const level = this.techOrder.find((t) => g.canLevelUp(this.team, t));
      if (level) return { kind: 'level', type: level, cost: BUILDINGS[level].levelUp!.cost };
    }
    if (!ts.research) {
      const research = RESEARCH_ORDER.find((u) => g.canResearch(this.team, u));
      if (research) return { kind: 'research', type: research, cost: UPGRADES[research].cost };
    }
    return null;
  }

  /** Credits kept back for replacing harvesters, once the base is up and while the economy is healthy. */
  private fund(): number {
    return this.openingDone && !this.econGoal() ? this.profile.fund : 0;
  }

  private get ts() {
    return this.game.teams[this.team];
  }

  private manageConstruction(): void {
    const g = this.game;
    const ts = this.ts;
    if (ts.building?.ready) {
      const spot = this.findSpot(ts.building.type);
      if (spot) g.finishPlacement(this.team, spot.cx, spot.cz);
      else g.cancelBuilding(this.team);
      return;
    }
    if (ts.building || !g.has(this.team, 'conyard')) return;

    const goal = this.econGoal();
    const refineries = g.count(this.team, 'refinery');
    const barracks = g.count(this.team, 'barracks');
    const factories = g.count(this.team, 'factory');
    let want: BuildingType | null = goal && goal.type !== 'harvester' ? goal.type : this.openingStep();
    if (want) {
      // getting income back, still in the opening, or rebuilding what the opening had
    } else if (refineries < this.wantRefineries()) want = 'refinery';
    else if (barracks < 2 && ts.credits > 1500) want = 'barracks';
    else if (factories < 2 && ts.credits > 2500) want = 'factory';
    else if (g.count(this.team, 'conyard') < 2 && ts.credits > 4000) want = 'conyard';
    if (want && ts.credits >= BUILDINGS[want].cost) g.startBuilding(this.team, want);
  }

  private manageProduction(): void {
    const g = this.game;
    const ts = this.ts;
    // Keep every production line busy plus one queued item, no more, so money isn't locked up.
    const full = (p: Producer) => ts.queues[p].length >= g.activeLines(this.team, p) + 1;
    const refineries = g.count(this.team, 'refinery');
    if (this.harvesterCount() < this.wantHarvesters() && g.canTrain(this.team, 'harvester')) {
      if (!full('factory') && ts.credits >= UNITS.harvester.cost) g.queueUnit(this.team, 'harvester');
      return;
    }
    // Money set aside, most urgent first: getting income back, rebuilding lost production, the opening (if the
    // profile saves for it), an early second refinery, or the next tech step once there's a decent army.
    // A harvester we can't build yet (no factory) is covered by the refinery or rebuild reserve.
    const goal = this.econGoal();
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon).length;
    const step = this.rebuildStep() ?? (this.profile.saveForOpening && !ts.building ? this.openingStep() : null);
    const reserve = goal ? goal.cost
      : step ? BUILDINGS[step].cost
      : refineries < this.wantRefineries() ? 800 : army >= this.profile.techArmy ? (this.techGoal()?.cost ?? 0) : 0;

    if (!this.nextUnit) this.nextUnit = this.pickCounter();
    const next = this.nextUnit;
    if (!g.canTrain(this.team, next) || full(UNITS[next].producer)) {
      this.nextUnit = null; // that line is busy or missing; pick again next think
      return;
    }
    if (ts.credits - UNITS[next].cost >= reserve + this.fund() && g.queueUnit(this.team, next)) this.nextUnit = null;
  }

  /** Weighted pick that leans toward whatever counters the enemy's current army. */
  private pickCounter(): UnitType {
    const g = this.game;
    const value: Record<UnitType, number> = { harvester: 0, infantry: 0, trike: 0, tank: 0, rocket: 0, repair: 0, carryall: 0 };
    for (const u of g.units) if (u.team !== this.team) value[u.type] += UNITS[u.type].cost / 500;
    const rockets = this.ts.upgrades.has('rockets') || this.ts.research?.type === 'rockets';
    const weights: [UnitType, number][] = [
      ['infantry', 1 + value.tank * (rockets ? 1.5 : 0.3) + value.rocket * (rockets ? 0.8 : 0)],
      ['trike', 0.5 + value.infantry * 0.5],
      ['tank', 1 + value.trike + value.rocket],
      ['rocket', 0.6 + value.infantry],
    ];
    const options = weights.filter(([t]) => g.requirementsMet(this.team, UNITS[t].requires));
    if (options.length === 0) return 'infantry';
    let r = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
    for (const [type, w] of options) {
      r -= w;
      if (r <= 0) return type;
    }
    return options[0][0];
  }

  // ---- Army -----------------------------------------------------------------

  private manageArmy(): void {
    const g = this.game;
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon && !u.carrier);
    for (const u of [...this.roles.keys()]) if (u.dead) this.roles.delete(u);
    for (const u of army) if (!this.roles.has(u)) this.roles.set(u, 'home');
    this.updateRally();

    this.manageDefense(army);
    const baseAttacked = this.defenses.some((d) => d.base);
    this.manageWaves(baseAttacked);
    this.manageRaids(army, baseAttacked);

    // Idle units at home gather at the rally point (new units, and anyone who wandered off chasing something).
    if (this.rally) {
      for (const u of army) {
        if (this.roles.get(u) !== 'home' || u.order.kind !== 'idle' || u.target) continue;
        if (Math.hypot(u.x - this.rally.x, u.z - this.rally.z) > 8 * TILE) this.sendHome(u);
      }
    }
  }

  private home(): Building | null {
    const g = this.game;
    return g.buildings.find((b) => b.team === this.team && b.type === 'conyard') ?? g.buildings.find((b) => b.team === this.team) ?? null;
  }

  private updateRally(): void {
    const anchor = this.home();
    if (anchor === this.rallyAnchor) return;
    this.rallyAnchor = anchor;
    if (!anchor) {
      this.rally = null;
      return;
    }
    // A few tiles out from the base toward the middle of the map, where attacks will come from.
    const map = this.game.map;
    const mid = map.worldSize() / 2;
    const len = Math.hypot(mid - anchor.x, mid - anchor.z) || 1;
    const out = 7 * TILE;
    const x = anchor.x + ((mid - anchor.x) / len) * out;
    const z = anchor.z + ((mid - anchor.z) / len) * out;
    const cell = map.nearestCell(map.cellOf(x), map.cellOf(z), (cx, cz) => map.canEnter(cx, cz, 'vehicle'), 8);
    this.rally = cell ? { x: map.center(cell.cx), z: map.center(cell.cz) } : { x: anchor.x, z: anchor.z };
  }

  private sendHome(u: Unit): void {
    this.roles.set(u, 'home');
    if (!this.rally) {
      u.command(this.game, { kind: 'idle' });
      return;
    }
    // Spread out a little so the group doesn't pile onto one cell.
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 3 * TILE;
    u.command(this.game, { kind: 'amove', x: this.rally.x + Math.cos(a) * r, z: this.rally.z + Math.sin(a) * r });
  }

  /** Enemy combat units near our buildings or harvesters, grouped into separate attacks. */
  private findThreats(): Omit<Defense, 'lastSeen' | 'units'>[] {
    const g = this.game;
    const buildings = g.buildings.filter((b) => b.team === this.team);
    const harvesters = g.units.filter((u) => u.team === this.team && u.type === 'harvester' && !u.carrier);
    const near = (e: Entity, list: Entity[], r: number) => list.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < r);
    const groups: { units: Unit[]; x: number; z: number; base: boolean }[] = [];
    for (const e of g.units) {
      if (e.team === this.team || e.dead || e.carrier || !e.def.weapon) continue;
      const base = near(e, buildings, BASE_RADIUS);
      if (!base && !near(e, harvesters, HARVESTER_RADIUS)) continue;
      let group = groups.find((c) => Math.hypot(c.x - e.x, c.z - e.z) < CLUSTER_RADIUS);
      if (!group) groups.push((group = { units: [], x: e.x, z: e.z, base: false }));
      group.units.push(e);
      group.base ||= base;
      group.x = group.units.reduce((s, u) => s + u.x, 0) / group.units.length;
      group.z = group.units.reduce((s, u) => s + u.z, 0) / group.units.length;
    }
    return groups.map((c) => ({ x: c.x, z: c.z, base: c.base, power: c.units.reduce((s, u) => s + power(u), 0) }));
  }

  /**
   * Meets each attack with about `defenseMargin` times its strength, nearest units first, so a lone trike draws a
   * couple of defenders rather than the whole army. A wave out in the field is only called back when the base itself
   * is attacked and the units at home aren't enough. Once an attack is over, its defenders return to the rally point.
   */
  private manageDefense(army: Unit[]): void {
    const g = this.game;
    const threats = this.findThreats();
    const seen = new Set<Defense>();
    for (const t of threats) {
      let d = this.defenses.find((d) => !seen.has(d) && Math.hypot(d.x - t.x, d.z - t.z) < 16 * TILE);
      if (!d) this.defenses.push((d = { ...t, lastSeen: g.time, units: new Set() }));
      Object.assign(d, t, { lastSeen: g.time });
      seen.add(d);
    }

    for (const d of [...this.defenses]) {
      for (const u of d.units) if (u.dead) d.units.delete(u);
      if (g.time - d.lastSeen > DEFENSE_TIMEOUT) {
        for (const u of d.units) this.sendHome(u);
        this.defenses.splice(this.defenses.indexOf(d), 1);
        continue;
      }
      if (!seen.has(d)) continue; // briefly out of sight: keep the defenders where they are

      let have = [...d.units].reduce((s, u) => s + power(u), 0);
      const need = d.power * this.profile.defenseMargin;
      if (have < need) {
        const dist = (u: Unit) => Math.hypot(u.x - d.x, u.z - d.z);
        const pool = army.filter((u) => this.roles.get(u) === 'home').sort((a, b) => dist(a) - dist(b));
        if (d.base) {
          const away = army.filter((u) => this.roles.get(u) === 'wave' || this.roles.get(u) === 'raid').sort((a, b) => dist(a) - dist(b));
          pool.push(...away);
        }
        for (const u of pool) {
          if (have >= need) break;
          this.leaveGroups(u);
          this.roles.set(u, 'defend');
          d.units.add(u);
          have += power(u);
          u.command(g, { kind: 'amove', x: d.x, z: d.z });
        }
      }
      // Defenders that got where they were sent and found nothing follow the attackers as they move.
      for (const u of d.units) {
        if (u.order.kind === 'idle' && !u.target && Math.hypot(u.x - d.x, u.z - d.z) > 4 * TILE) u.command(g, { kind: 'amove', x: d.x, z: d.z });
      }
    }
  }

  private leaveGroups(u: Unit): void {
    for (const w of this.waves) w.units.delete(u);
    this.raiders.delete(u);
  }

  private manageWaves(baseAttacked: boolean): void {
    const g = this.game;
    for (const w of [...this.waves]) {
      for (const u of w.units) if (u.dead) w.units.delete(u);
      const left = [...w.units].reduce((s, u) => s + power(u), 0);
      if (w.units.size === 0 || left < w.start * WAVE_RETREAT) {
        // Beaten: fall back and join the next wave instead of trickling in one by one.
        for (const u of w.units) this.sendHome(u);
        this.waves.splice(this.waves.indexOf(w), 1);
        continue;
      }
      // Reached its target and nothing left to shoot there: push on to the next one.
      const idle = [...w.units].filter((u) => u.order.kind === 'idle' && !u.target);
      if (idle.length) {
        const target = this.pickTarget(idle[0]);
        if (target) for (const u of idle) u.command(g, { kind: 'amove', x: target.x, z: target.z });
      }
    }

    if (baseAttacked || g.time < this.nextWaveTime) return;
    const ready = [...this.roles].filter(([u, r]) => r === 'home' && !u.dead && !u.carrier).map(([u]) => u);
    // A full-size wave, or a smaller one if it's been a long while, so the pressure keeps up after heavy losses.
    const overdue = g.time >= this.nextWaveTime + 90;
    if (ready.length < this.waveSize && !(overdue && ready.length >= Math.max(4, this.waveSize / 2))) return;
    const target = this.pickTarget(ready[0]);
    if (!target) return;
    const wave: Wave = { units: new Set(ready), start: ready.reduce((s, u) => s + power(u), 0) };
    for (const u of ready) {
      this.roles.set(u, 'wave');
      u.command(g, { kind: 'amove', x: target.x, z: target.z });
    }
    this.waves.push(wave);
    this.waveSize = Math.min(this.waveSize + 2, 16);
    this.nextWaveTime = g.time + 60;
  }

  /** A few idle trikes go after an enemy harvester, and come home once it's dead or out of reach. */
  private manageRaids(army: Unit[], baseAttacked: boolean): void {
    const g = this.game;
    for (const u of [...this.raiders]) {
      if (u.dead) this.raiders.delete(u);
      else if (u.order.kind !== 'attack') {
        this.raiders.delete(u);
        this.sendHome(u);
      }
    }
    if (baseAttacked || g.time < this.nextRaidTime) return;
    const trikes = army.filter((u) => u.type === 'trike' && this.roles.get(u) === 'home');
    if (trikes.length < 3) return;
    const victim = g.units.find((u) => u.team !== this.team && u.type === 'harvester' && !u.dead && !u.carrier);
    if (!victim) return;
    for (const u of trikes) {
      this.roles.set(u, 'raid');
      this.raiders.add(u);
      u.command(g, { kind: 'attack', target: victim });
    }
    this.nextRaidTime = g.time + 90;
  }

  private pickTarget(from: Unit): { x: number; z: number } | null {
    const g = this.game;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const e of [...g.buildings, ...g.units]) {
      if (e.team === this.team || (!(e instanceof Building) && (e as Unit).carrier)) continue;
      const d = Math.hypot(e.x - from.x, e.z - from.z) + (e instanceof Building ? 0 : 20);
      if (d < bestD) {
        bestD = d;
        best = { x: e.x, z: e.z };
      }
    }
    return best;
  }

  // ---- Surrender --------------------------------------------------------------

  /**
   * Lost for good: no income and no way to buy it back (a harvester needs a refinery and a factory, a refinery needs
   * a construction yard), or nothing left to build units with; and an army well short of the enemy's.
   */
  private hopeless(): boolean {
    const g = this.game;
    const t = this.team;
    const credits = this.ts.credits;
    const income = g.count(t, 'harvester') > 0 && g.has(t, 'refinery');
    const canBuyIncome = (g.has(t, 'refinery') && g.has(t, 'factory') && credits >= UNITS.harvester.cost)
      || (g.has(t, 'conyard') && credits >= BUILDINGS.refinery.cost);
    const canProduce = g.has(t, 'conyard') || g.has(t, 'barracks') || g.has(t, 'factory');
    if ((income || canBuyIncome) && canProduce) return false;
    const strength = (team: (u: Unit) => boolean) => g.units.filter(team).reduce((s, u) => s + power(u), 0);
    return strength((u) => u.team === t) < strength((u) => u.team !== t) * 0.5;
  }

  private considerSurrender(): void {
    if (!this.profile.surrender || this.surrenderOffered || this.game.winner !== null) return;
    this.hopelessFor = this.hopeless() ? this.hopelessFor + 1 : 0;
    if (this.hopelessFor < 15) return;
    this.surrenderOffered = true; // offered once; if it's turned down, fight on to the end
    this.game.offerSurrender(this.team);
  }

  /** Spiral out from our buildings for a valid spot, leaving a one-tile gap so paths stay open. */
  private findSpot(type: BuildingType): Cell | null {
    const g = this.game;
    const size = BUILDINGS[type].size;
    const anchor = this.home();
    if (!anchor) return null;
    const ok = (cx: number, cz: number) => {
      if (!g.canPlace(type, this.team, cx, cz)) return false;
      for (let z = cz - 1; z <= cz + size; z++) {
        for (let x = cx - 1; x <= cx + size; x++) {
          if (g.map.inBounds(x, z) && g.map.occupied[g.map.idx(x, z)] !== 0) return false;
        }
      }
      return true;
    };
    return g.map.nearestCell(anchor.cx, anchor.cz, ok, 10);
  }
}
