import { BUILDINGS, TILE, UNITS, type BuildingType, type Team, type UnitType, type UpgradeType } from './config';
import { Building, type Unit } from './entities';
import type { Game } from './game';
import type { Cell } from './map';

/** A simple scripted opponent: builds an economy, trains a mixed army, attacks in waves. */
export class AI {
  private thinkTimer = 2;
  private waveSize = 5;
  private nextWaveTime = 150;
  /** Unit we're saving up for, so expensive units still get built. */
  private nextUnit: UnitType | null = null;

  constructor(private game: Game, private team: Team) {}

  update(dt: number): void {
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 1;
    this.manageConstruction();
    this.manageProduction();
    this.manageResearch();
    this.manageArmy();
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
    const factories = g.count(this.team, 'factory');
    let want: BuildingType | null = null;
    if (refineries === 0) want = 'refinery';
    else if (factories === 0) want = 'factory';
    else if (refineries < 2 && ts.credits > 1600) want = 'refinery';
    else if (g.count(this.team, 'conyard') < 2 && ts.credits > 4000) want = 'conyard';
    if (want && ts.credits >= BUILDINGS[want].cost) g.startBuilding(this.team, want);
  }

  private manageProduction(): void {
    const g = this.game;
    const ts = this.ts;
    if (!g.has(this.team, 'factory') || ts.unitQueue.length >= 2) return;
    const harvesters = g.count(this.team, 'harvester') + ts.unitQueue.filter((q) => q.type === 'harvester').length;
    const refineries = g.count(this.team, 'refinery');
    // Keep money aside for a second refinery early on.
    const reserve = refineries < 2 ? 800 : 0;
    if (harvesters < refineries) {
      if (ts.credits >= UNITS.harvester.cost) g.queueUnit(this.team, 'harvester');
      return;
    }
    if (!this.nextUnit) {
      const pool: UnitType[] = ['infantry', 'infantry', 'trike', 'trike', 'tank', 'tank', 'tank', 'rocket', 'rocket'];
      this.nextUnit = pool[Math.floor(Math.random() * pool.length)];
    }
    if (ts.credits - UNITS[this.nextUnit].cost >= reserve && g.queueUnit(this.team, this.nextUnit)) this.nextUnit = null;
  }

  private manageResearch(): void {
    const g = this.game;
    if (this.ts.research || this.ts.credits < 1800) return;
    const order: UpgradeType[] = ['weapons', 'armor', 'harvest'];
    const next = order.find((u) => g.canResearch(this.team, u));
    if (next) g.startResearch(this.team, next);
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
