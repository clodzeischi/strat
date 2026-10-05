import { BUILDINGS, TILE, UNITS, UPGRADES, type BuildingType, type LevelUpType, type Producer, type Team, type UnitType, type UpgradeType } from './config';
import { Building, type Unit } from './entities';
import type { Game } from './game';
import type { Cell } from './map';

const RESEARCH_ORDER: UpgradeType[] = ['rockets', 'weapons1', 'armor1', 'nitro', 'harvest', 'weapons2', 'armor2'];

/** A simple scripted opponent: builds an economy, trains counters to the enemy army, raids and attacks in waves. */
export class AI {
  private thinkTimer = 2;
  private waveSize = 5;
  private nextWaveTime = 150;
  /** Unit we're saving up for, so expensive units still get built. */
  private nextUnit: UnitType | null = null;
  private nextRaidTime = 200;
  /** Tech path for this game: economy and anti-armor first, or heavy army first. */
  private readonly techOrder: LevelUpType[] = Math.random() < 0.5 ? ['conyard', 'factory'] : ['factory', 'conyard'];

  constructor(private game: Game, private team: Team) {}

  update(dt: number): void {
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 1;
    this.manageConstruction();
    this.manageProduction();
    this.manageTech();
    this.manageArmy();
  }

  /** Buys the next tech step once we can afford it. */
  private manageTech(): void {
    const goal = this.techGoal();
    if (!goal || this.ts.credits < goal.cost) return;
    if (goal.kind === 'level') this.game.startLevelUp(this.team, goal.type);
    else this.game.startResearch(this.team, goal.type);
  }

  /** The next tech step worth saving for: a level-up along our path (one at a time), else research. */
  private techGoal(): { kind: 'level'; type: LevelUpType; cost: number } | { kind: 'research'; type: UpgradeType; cost: number } | null {
    const g = this.game;
    const ts = this.ts;
    if (!g.has(this.team, 'factory') || g.count(this.team, 'refinery') < 2) return null;
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

    const refineries = g.count(this.team, 'refinery');
    const barracks = g.count(this.team, 'barracks');
    const factories = g.count(this.team, 'factory');
    let want: BuildingType | null = null;
    if (refineries === 0) want = 'refinery';
    else if (barracks === 0) want = 'barracks';
    else if (factories === 0) want = 'factory';
    else if (refineries < 2) want = 'refinery';
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
    const harvesters = g.count(this.team, 'harvester') + ts.queues.factory.filter((q) => q.type === 'harvester').length;
    const refineries = g.count(this.team, 'refinery');
    // Keep money aside for a second refinery early on; later, once there's a decent army, save for the next tech step.
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon).length;
    const reserve = refineries < 2 ? 800 : army >= 8 ? (this.techGoal()?.cost ?? 0) : 0;
    if (harvesters < refineries && g.canTrain(this.team, 'harvester')) {
      if (!full('factory') && ts.credits >= UNITS.harvester.cost) g.queueUnit(this.team, 'harvester');
      return;
    }
    if (!this.nextUnit) this.nextUnit = this.pickCounter();
    const next = this.nextUnit;
    if (!g.canTrain(this.team, next) || full(UNITS[next].producer)) {
      this.nextUnit = null; // that line is busy or missing; pick again next think
      return;
    }
    if (ts.credits - UNITS[next].cost >= reserve && g.queueUnit(this.team, next)) this.nextUnit = null;
  }

  /** Weighted pick that leans toward whatever counters the enemy's current army. */
  private pickCounter(): UnitType {
    const g = this.game;
    const value: Record<UnitType, number> = { harvester: 0, infantry: 0, trike: 0, tank: 0, rocket: 0 };
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

  private manageArmy(): void {
    const g = this.game;
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon);
    const home = g.buildings.find((b) => b.team === this.team && b.type === 'conyard') ?? g.buildings.find((b) => b.team === this.team);

    // Defend: enemies near our base pull idle units back.
    if (home) {
      const intruder = g.nearestEnemy(this.team, home.x, home.z, 16 * TILE);
      if (intruder && !(intruder instanceof Building)) {
        for (const u of army) {
          if (u.order.kind === 'idle' || u.order.kind === 'move') u.command(g, { kind: 'amove', x: intruder.x, z: intruder.z });
        }
        return;
      }
    }

    // Raid: a few idle trikes go after an enemy harvester.
    const trikes = army.filter((u) => u.type === 'trike' && u.order.kind === 'idle');
    if (trikes.length >= 3 && g.time >= this.nextRaidTime) {
      const victim = g.units.find((u) => u.team !== this.team && u.type === 'harvester' && !u.dead);
      if (victim) {
        for (const u of trikes) u.command(g, { kind: 'attack', target: victim });
        this.nextRaidTime = g.time + 90;
      }
    }

    const idle = army.filter((u) => u.order.kind === 'idle');
    if (idle.length >= this.waveSize && g.time >= this.nextWaveTime) {
      const target = this.pickTarget(idle[0]);
      if (target) {
        for (const u of idle) u.command(g, { kind: 'amove', x: target.x, z: target.z });
        this.waveSize = Math.min(this.waveSize + 2, 16);
        this.nextWaveTime = g.time + 60;
      }
    }
  }

  private pickTarget(from: Unit): { x: number; z: number } | null {
    const g = this.game;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const e of [...g.buildings, ...g.units]) {
      if (e.team === this.team) continue;
      const d = Math.hypot(e.x - from.x, e.z - from.z) + (e instanceof Building ? 0 : 20);
      if (d < bestD) {
        bestD = d;
        best = { x: e.x, z: e.z };
      }
    }
    return best;
  }

  /** Spiral out from our buildings for a valid spot, leaving a one-tile gap so paths stay open. */
  private findSpot(type: BuildingType): Cell | null {
    const g = this.game;
    const size = BUILDINGS[type].size;
    const anchor = g.buildings.find((b) => b.team === this.team && b.type === 'conyard') ?? g.buildings.find((b) => b.team === this.team);
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
