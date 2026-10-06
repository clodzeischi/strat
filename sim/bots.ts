// Scripted "player" opponents for testing the AI against the strategies a person would use, instead of only against
// itself. Each bot reuses the AI's economy and building code and overrides what it builds and how it uses its army.
import { AI, HARD_PROFILE, NORMAL_PROFILE, type AIProfile } from '../src/game/ai';
import { Carryall, type Unit } from '../src/entities';
import type { Team, UnitType } from '../src/config';
import type { Game } from '../src/game/game';

/** Bots never surrender, and keep Hard's economy unless they say otherwise. */
const BASE: AIProfile = { ...HARD_PROFILE, surrender: false, initiative: 0, raids: { ...NORMAL_PROFILE.raids, start: Infinity }, sustain: NORMAL_PROFILE.sustain };

abstract class Bot extends AI {
  /** Attackers that got where they were sent push on to the next building. */
  protected manageArmy(): void {
    super.manageArmy();
    for (const u of this.army()) if (this.roles.get(u) === 'wave' && u.order.kind === 'idle' && !u.target) this.attack([u]);
  }

  protected army(): Unit[] {
    return this.game.units.filter((u) => u.team === this.team && u.def.weapon && !u.carrier && !u.falling);
  }

  /** The nearest enemy building to a unit, or null when the enemy has none. */
  protected enemyBase(from: Unit): { x: number; z: number } | null {
    return this.pickTarget(from);
  }

  /** Sends the given units at the enemy base (attack-move), marked as a wave so the AI code leaves them alone. */
  protected attack(units: Unit[]): void {
    if (!units.length) return;
    const target = this.enemyBase(units[0]);
    if (!target) return;
    for (const u of units) {
      this.roles.set(u, 'wave');
      if (u.order.kind === 'idle' && !u.target) u.command(this.game, { kind: 'amove', x: target.x, z: target.z });
    }
  }
}

/** Barracks first, nothing but infantry, attacks from 1:30 and streams every new squad in. */
export class RushBot extends Bot {
  constructor(g: Game, team: Team) {
    super(g, team, { ...BASE, opening: ['barracks', 'barracks', 'refinery'], harvesters: 'perRefinery', extraRefinery: 'never', techArmy: Infinity, saveForOpening: false, fund: 0 });
    this.nextWaveTime = Infinity;
  }

  protected chooseUnit(): UnitType {
    return 'infantry';
  }

  protected manageArmy(): void {
    super.manageArmy();
    if (this.game.time < 90) return;
    const ready = this.army().filter((u) => this.roles.get(u) === 'home');
    if (ready.length >= 6 || [...this.roles.values()].some((r) => r === 'wave')) this.attack(ready);
  }
}

/** Builds up tanks and rocket launchers at home and defends; one all-in attack at 14:00. */
export class TurtleBot extends Bot {
  constructor(g: Game, team: Team) {
    super(g, team, { ...BASE, techArmy: 4 });
    this.nextWaveTime = Infinity;
  }

  protected chooseUnit(): UnitType {
    return this.game.canTrain(this.team, 'rocket') && Math.random() < 0.5 ? 'rocket' : 'tank';
  }

  protected manageArmy(): void {
    super.manageArmy();
    if (this.game.time >= 14 * 60) this.attack(this.army());
  }
}

/** Trike-heavy: four-trike hit-and-run raids on harvesters every 25 seconds, plus ordinary waves. */
export class HarassBot extends Bot {
  constructor(g: Game, team: Team) {
    super(g, team, { ...BASE, raids: { trikes: 4, start: 100, interval: 25, hunt: true } });
  }

  protected chooseUnit(): UnitType {
    return Math.random() < 0.6 ? 'trike' : super.chooseUnit();
  }
}

/** Rushes Factory Level 2, then masses rocket launchers (with a few tanks) and attacks at 12. */
export class RocketBot extends Bot {
  constructor(g: Game, team: Team) {
    super(g, team, { ...BASE, techArmy: 0 });
    this.nextWaveTime = Infinity;
  }

  protected chooseUnit(): UnitType {
    if (!this.game.canTrain(this.team, 'rocket')) return 'tank';
    return Math.random() < 0.75 ? 'rocket' : 'tank';
  }

  protected manageArmy(): void {
    super.manageArmy();
    const army = this.army();
    if (army.filter((u) => u.type === 'rocket').length >= 8 || [...this.roles.values()].some((r) => r === 'wave')) this.attack(army.filter((u) => this.roles.get(u) === 'home'));
  }
}

/** Gets a Hi-Tech Factory and two Carryalls, then drops six infantry at a time onto the enemy's refinery. */
export class DropBot extends Bot {
  constructor(g: Game, team: Team) {
    super(g, team, { ...BASE, opening: ['refinery', 'barracks', 'factory', 'hitech'] });
  }

  protected chooseUnit(): UnitType {
    if (this.game.canTrain(this.team, 'carryall') && this.game.count(this.team, 'carryall') + this.queued('carryall') < 2) return 'carryall';
    return this.game.has(this.team, 'hitech') && Math.random() < 0.6 ? 'infantry' : super.chooseUnit();
  }

  private queued(type: UnitType): number {
    return Object.values(this.ts.queues).flat().filter((q) => q.type === type).length;
  }

  protected manageArmy(): void {
    super.manageArmy();
    const g = this.game;
    for (const c of g.units) {
      if (c.team !== this.team || !(c instanceof Carryall) || c.dead) continue;
      const task = (c as unknown as { task: { kind: string } }).task.kind;
      if (c.used >= 6 && task !== 'drop') {
        const target = g.buildings.find((b) => b.team !== this.team && b.type === 'refinery') ?? g.buildings.find((b) => b.team !== this.team);
        if (target) c.orderDrop(g, target.x, target.z);
      } else if (c.used === 0 && task === 'orbit') {
        const squad = this.army().filter((u) => u.type === 'infantry' && this.roles.get(u) === 'home').slice(0, 6);
        if (squad.length === 6) {
          for (const u of squad) this.roles.set(u, 'wave');
          c.orderPickup(g, squad);
        }
      }
    }
  }
}

export const BOTS: Record<string, new (g: Game, team: Team) => AI> = {
  rush: RushBot,
  turtle: TurtleBot,
  harass: HarassBot,
  rockets: RocketBot,
  drop: DropBot,
};
