import { BUILDINGS, TILE, UNITS, UPGRADES, type BuildingType, type LevelUpType, type Producer, type Team, type UnitType, type UpgradeType } from '../config';
import { Building, type Entity, type Unit } from '../entities';
import { weaponDamage, type Difficulty, type Game } from './game';
import { MATCHUP_TYPES, MATCHUPS, type Matchup } from './matchups';
import { Intel, type Sighting } from './intel';
import { SPICE, type Cell } from '../map';
import { hypot } from './hypot';

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
  /**
   * Trike raids on enemy harvesters: group size, first raid and time between raids (seconds). With `hunt`, raids pick
   * the least protected harvester, keep trikes in production for them, and pull back once half the group is lost.
   */
  raids: { trikes: number; start: number; interval: number; hunt: boolean };
  /**
   * Besides the wave timer, attack as soon as the army at home is this many times stronger than the enemy's whole
   * army (0: timer only). Such waves go for the enemy economy first.
   */
  initiative: number;
  /** A wave falls back once it's down to this share of its starting strength. */
  waveRetreat: number;
  /**
   * A wave only sets out when it's at least this share of the enemy's whole army; otherwise it keeps gathering.
   * The share it waits for shrinks the longer a wave has been due.
   */
  waveGate: number;
  /** How closely unit picks follow the best counter to the enemy army (see `counterWeights`; higher: more strictly). */
  counterFocus: number;
  /**
   * When the chosen unit's production line is busy, wait for it instead of filling free lines with whatever comes
   * up (cheap infantry from idle barracks would otherwise make up most of the army whatever it's up against).
   */
  goodLinesOnly: boolean;
  /** Bunkers it keeps at the front of its base, filled with infantry. */
  bunkers: number;
  /**
   * Keeping the army alive (all off at 0): one Repair Vehicle per `repairPer` combat vehicles, up to `maxRepair`.
   * They stay home: damaged vehicles come to them after a fight, nobody leaves one. A wave pulls back when the
   * enemies around it are `outmatched` times its strength.
   */
  sustain: { repairPer: number; maxRepair: number; outmatched: number };
  /** Scouting: when the first scout sets out, and how long between scouting runs (seconds). */
  scout: { first: number; interval: number };
  /** After its first look, the scout stays parked outside the enemy base, watching for the army moving out. */
  watch: boolean;
  /**
   * Fight control, `every` seconds (0: none): units in a fight pick targets together, the most dangerous enemy they
   * can kill soonest first and no overkill, and vehicles below `mend` of their health pull out to a Repair Vehicle.
   */
  micro: { every: number; mend: number };
}

export const NORMAL_PROFILE: AIProfile = {
  opening: ['refinery', 'barracks', 'factory'], harvesters: 'perRefinery', extraRefinery: 'always', techArmy: 8, saveForOpening: false,
  minHarvesters: 2, fund: UNITS.harvester.cost, defenseMargin: 1.5, surrender: true,
  raids: { trikes: 3, start: 200, interval: 90, hunt: false }, initiative: 0, waveRetreat: 0.3, waveGate: 0.6, counterFocus: 3, goodLinesOnly: false, bunkers: 1,
  sustain: { repairPer: 0, maxRepair: 0, outmatched: 0 }, scout: { first: 30, interval: 150 }, watch: false,
  micro: { every: 0, mend: 0 },
};

/**
 * Hard: twice Normal's harvesters with both refineries early, attacks whenever its army at home is clearly stronger
 * than the enemy's (going for the economy), harasses harvesters with hit-and-run trike raids, and keeps its army
 * alive: Repair Vehicles at home, badly hurt units pulled out to be mended, and waves that pull back when outmatched. Tuned with `MAPS=random sim/run.sh`; see docs/PLAN.md.
 */
export const HARD_PROFILE: AIProfile = {
  ...NORMAL_PROFILE, harvesters: 6, extraRefinery: 'always', saveForOpening: true,
  initiative: 1.2, waveRetreat: 0.5, waveGate: 0.9, counterFocus: 8, goodLinesOnly: true, bunkers: 2, raids: { trikes: 3, start: 150, interval: 60, hunt: true },
  sustain: { repairPer: 6, maxRepair: 3, outmatched: 1.3 }, scout: { first: 40, interval: 75 }, watch: true,
};

/**
 * Brutal: Hard's game plan with a player's hands. It sees no more than Hard (only what its side has seen); it fights
 * better: focus fire several times a second, and badly damaged vehicles pulled out to be repaired.
 */
export const BRUTAL_PROFILE: AIProfile = {
  ...HARD_PROFILE, micro: { every: 0.25, mend: 0.3 },
};

/** The AI profile for a difficulty. */
export function profileFor(difficulty: Difficulty): AIProfile {
  return difficulty === 'normal' ? NORMAL_PROFILE : difficulty === 'hard' ? HARD_PROFILE : BRUTAL_PROFILE;
}

/** Rough fighting strength: what the unit cost, scaled by the health it has left. Unarmed units count for nothing. */
export function power(u: Unit): number {
  return u.def.weapon ? u.def.cost * (u.hp / u.maxHp) : 0;
}

/** Combined-arms base preference for unit picks, before counters (see `counterWeights`). */
const BASE_MIX: Record<Matchup, number> = { infantry: 0.7, trike: 0.4, tank: 1, rocket: 1 };

/** Enemies this close to one of our buildings are attacking the base. */
const BASE_RADIUS = 14 * TILE;
/** Enemies this close to one of our harvesters are hunting it. */
const HARVESTER_RADIUS = 10 * TILE;
/** Intruders this close together count as one attack. */
const CLUSTER_RADIUS = 10 * TILE;
/** Units at home or defending never chase further than this from the rally point. */
const LEASH = 22 * TILE;
/** An attack that hasn't been seen for this long is over, and its defenders go home. */
const DEFENSE_TIMEOUT = 4;

/** 'garrison': on its way into one of our bunkers, or in it. 'mend': pulled out of a fight to be repaired. */
export type Role = 'home' | 'defend' | 'wave' | 'raid' | 'garrison' | 'scout' | 'mend';

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
  /** Goes for refineries and harvesters before anything else. */
  economy: boolean;
}

/**
 * A scripted opponent. It plays by the same rules as a person: everything it knows about the enemy comes from what
 * its side has seen (`Intel`), so it has to scout. Priorities, in order: keep an income (rebuild refineries and harvesters first), meet each
 * attack with enough force to beat it and bring the defenders home afterwards, then build counters to the enemy
 * army, raid and attack in waves. When its production and income are gone for good, it offers to surrender.
 */
export class AI {
  private thinkTimer = 2;
  private microTimer = 2;
  private waveSize = 5;
  protected nextWaveTime = 150;
  /** Unit we're saving up for, so expensive units still get built. */
  private nextUnit: UnitType | null = null;
  protected nextRaidTime: number;
  /** Tech path for this game: economy and anti-armor first, or heavy army first. */
  private readonly techOrder: LevelUpType[];

  /** Game time of the last harvester or refinery loss / damage, for the 'threat' refinery rule. */
  private lastEconHit = -Infinity;
  private harvesterIds = new Set<number>();

  protected roles = new Map<Unit, Role>();
  private defenses: Defense[] = [];
  /** An attack on the base is stronger than everything we could send against it (as of the last think). */
  private outgunned = false;
  private waves: Wave[] = [];
  private raiders = new Set<Unit>();
  /** Strength of the current raid when it set out. */
  private raidStart = 0;
  /** Where idle units gather: just in front of the base, toward the middle of the map. */
  protected rally: { x: number; z: number } | null = null;
  private rallyAnchor: Building | null = null;
  /** Consecutive thinks the enemy army has been well ahead of ours (see `trackStrength`). */
  private behindFor = 0;
  /** Building types there was no room for, and until when not to try them again. */
  private noRoom = new Map<BuildingType, number>();
  /** Once the opening is done, buildings missing from it are rebuilt before anything else is bought. */
  private openingDone = false;

  /** What we know of the enemy: only what our side has seen. */
  readonly intel: Intel;
  /** The unit out scouting, and the places it still has to look at. */
  private scout: Unit | null = null;
  private scoutRoute: { x: number; z: number }[] = [];
  /** The scout has had its look and is parked at a watch post (see `toWatchPost`). */
  private watching = false;
  private nextScoutTime: number;

  /** Consecutive thinks (seconds) the position has looked hopeless. */
  private hopelessFor = 0;
  /** When we last ran out of income with no way to buy it back (Infinity while the economy works). */
  private brokeSince = Infinity;
  surrenderOffered = false;

  constructor(protected game: Game, protected team: Team, protected profile: AIProfile = NORMAL_PROFILE) {
    this.nextRaidTime = profile.raids.start;
    this.nextScoutTime = profile.scout.first;
    this.intel = new Intel(game, team);
    this.techOrder = game.random() < 0.5 ? ['conyard', 'factory'] : ['factory', 'conyard'];
  }

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
    // Only once the opening is done: before that, the factory is on its way anyway.
    return this.openingDone && g.has(this.team, 'conyard') ? refinery : null;
  }

  /** A structure lost since the opening was finished: rebuilt before units, so production comes back. */
  private rebuildStep(): BuildingType | null {
    return this.openingDone ? this.openingStep() : null;
  }

  update(dt: number): void {
    if (this.profile.micro.every) {
      this.microTimer -= dt;
      if (this.microTimer <= 0) {
        this.microTimer += this.profile.micro.every;
        this.micro();
      }
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 1;
    if (!this.openingStep()) this.openingDone = true;
    this.intel.update();
    this.trackHarvesterLosses();
    this.trackStrength();
    this.manageConstruction();
    this.manageProduction();
    this.manageTech();
    this.manageArmy();
    this.considerSurrender();
  }

  /** Buys the next tech step once we can afford it. */
  private manageTech(): void {
    const goal = this.techGoal();
    if (!goal || this.rushed() || this.ts.credits - goal.cost < this.fund()) return;
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

  protected get ts() {
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
    const goal = this.econGoal();
    // Rushed: anything but a refinery, barracks or bunker under construction is called off (full refund) for units.
    const keepBuilding = ['barracks', 'refinery', 'bunker'];
    if (ts.building && this.rushed() && g.has(this.team, 'refinery') && !keepBuilding.includes(ts.building.type)) {
      g.cancelBuilding(this.team);
      return;
    }
    if (ts.building || !g.has(this.team, 'conyard')) return;

    if (this.rushed() && !goal && g.has(this.team, 'refinery')) {
      // A bunker first (the infantry we're making anyway hold out far better in it), then more barracks.
      if (g.has(this.team, 'barracks') && g.count(this.team, 'bunker') < 1 && ts.credits >= BUILDINGS.bunker.cost && this.findSpot('bunker')) {
        g.startBuilding(this.team, 'bunker');
        return;
      }
      if (g.count(this.team, 'barracks') < 3 && ts.credits >= BUILDINGS.barracks.cost && this.findSpot('barracks')) g.startBuilding(this.team, 'barracks');
      return;
    }
    const refineries = g.count(this.team, 'refinery');
    const barracks = g.count(this.team, 'barracks');
    const factories = g.count(this.team, 'factory');
    let want: BuildingType | null = goal && goal.type !== 'harvester' ? goal.type : this.openingStep();
    if (want) {
      // getting income back, still in the opening, or rebuilding what the opening had
    } else if (refineries < this.wantRefineries()) want = 'refinery';
    else if (g.count(this.team, 'bunker') < this.profile.bunkers && barracks > 0 && (ts.credits > 900 || this.behindFor > 0)) want = 'bunker';
    else if (barracks < 2 && ts.credits > 1500) want = 'barracks';
    else if (factories < 2 && ts.credits > 2500) want = 'factory';
    else if (g.count(this.team, 'conyard') < 2 && ts.credits > 4000) want = 'conyard';
    if (!want || ts.credits < BUILDINGS[want].cost || (this.noRoom.get(want) ?? -Infinity) > g.time) return;
    // Only start what there's room for: a cramped base would otherwise build, fail to place, refund and retry forever.
    if (this.findSpot(want)) g.startBuilding(this.team, want);
    else this.noRoom.set(want, g.time + 90);
  }

  private manageProduction(): void {
    const g = this.game;
    const ts = this.ts;
    // Keep every production line busy plus one queued item, no more, so money isn't locked up.
    const full = (p: Producer) => ts.queues[p].length >= g.activeLines(this.team, p) + 1;
    const refineries = g.count(this.team, 'refinery');
    const rushed = this.rushed();
    // More harvesters only while our army is holding its own; with a stronger enemy army about, units come first
    // (just the minimum, so income doesn't collapse).
    const holding = this.ownPower() >= this.intel.armyPower() * 0.8;
    const harvesterGoal = rushed ? 1 : holding ? this.wantHarvesters() : Math.min(this.wantHarvesters(), this.profile.minHarvesters);
    if (this.harvesterCount() < harvesterGoal && g.canTrain(this.team, 'harvester')) {
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
    // Falling well behind the enemy's army (an early rush, say): only getting income back still comes first.
    const behind = this.behindFor >= 5;

    // Savings don't stack (the fund covers a harvester, the reserve the next big purchase), and none of it matters
    // while the base is being overrun: then every credit goes into units.
    // Under pressure, spend now: the best counter that a free line can start and we can afford, down the list, so
    // idle barracks don't wait on a factory unit we can't pay for yet. The first bunker's price is kept aside.
    if (this.outgunned || rushed || behind) {
      const bunker = !g.has(this.team, 'bunker') && g.canBuild(this.team, 'bunker') ? BUILDINGS.bunker.cost : 0;
      const keepNow = this.outgunned ? 0 : bunker;
      const options = this.counterWeights().filter(([t]) => g.canTrain(this.team, t) && !full(UNITS[t].producer) && ts.credits - UNITS[t].cost >= keepNow);
      options.sort((a, b) => b[1] - a[1]);
      if (options.length) g.queueUnit(this.team, options[0][0]);
      this.nextUnit = null;
      return;
    }
    const keep = Math.max(reserve, this.fund());
    if (!this.nextUnit) this.nextUnit = this.chooseUnit();
    let next = this.nextUnit;
    if (!g.canTrain(this.team, next)) {
      this.nextUnit = null;
      return;
    }
    if (full(UNITS[next].producer)) {
      if (!this.profile.goodLinesOnly) {
        this.nextUnit = null; // that line is busy; pick again next think
        return;
      }
      // Wait for the line the best unit comes from, rather than filling a free line with a poor counter. With money
      // to spare, a free line may build something nearly as good.
      if (ts.credits - keep < 1500) return;
      const weights = this.counterWeights();
      const top = Math.max(...weights.map(([, w]) => w));
      const alt = weights.filter(([t, w]) => w >= top * 0.4 && g.canTrain(this.team, t) && !full(UNITS[t].producer)).sort((a, b) => b[1] - a[1])[0];
      if (!alt) return;
      next = alt[0];
    }
    if (ts.credits - UNITS[next].cost >= keep && g.queueUnit(this.team, next) && next === this.nextUnit) this.nextUnit = null;
  }

  /**
   * An early rush: in the first five minutes, the enemy's army is well ahead of ours (`trackStrength`), or scouting
   * says one is coming (`rushSuspected`). Until we catch up, only a refinery (if we have none), up to three
   * barracks and units get bought.
   */
  private rushed(): boolean {
    const g = this.game;
    if (g.time >= 300) return false;
    if (this.behindFor >= 5) return true;
    // Read from scouting: braced until our army clearly outweighs what we've seen of theirs.
    return this.rushSuspected() && this.ownPower() < Math.max(this.intel.armyPower(), 450) * 1.3;
  }

  /**
   * What a scout's look at the enemy base says about an early attack coming, as a player would read it: two
   * barracks before anything else, or a barracks and still no refinery a minute in.
   */
  private rushSuspected(): boolean {
    const barracks = this.intel.structures('barracks').length;
    const refineries = this.intel.structures('refinery').length;
    return barracks >= 2 || (barracks >= 1 && refineries === 0 && this.game.time > 60 && this.game.time - this.intel.lastBaseSeen < 60);
  }

  /**
   * Counts consecutive thinks with the enemy's army well ahead of ours: over 1.5x, and by at least 600 credits'
   * worth. Requiring a margin and a few seconds of it keeps one unit's difference early on (or a moment of trading
   * in a fight) from flipping the economy into emergency mode, which in an even game snowballs into a lead.
   */
  private trackStrength(): void {
    const mine = this.ownPower();
    const theirs = this.intel.armyPower();
    this.behindFor = mine * 1.5 < theirs && theirs - mine > 600 ? this.behindFor + 1 : 0;
  }

  /**
   * The enemy army's strength as an attacker would face it, as far as we know it: units within 20 tiles of their
   * own buildings count 1.5x, since they fight where they're set up, with their base around them and reinforcements
   * arriving; so do units we've lost track of (they're most likely at home).
   */
  private enemyDefense(): number {
    const known = [...this.intel.buildings.values()];
    let p = 0;
    for (const s of this.intel.units.values()) {
      const home = !s.placed || known.some((b) => hypot(b.x - s.x, b.z - s.z) < 20 * TILE);
      p += s.power * (home ? 1.5 : 1);
    }
    return p;
  }

  /** Combined strength of our army, infantry in bunkers included (not units riding in a Carryall). */
  private ownPower(): number {
    let p = 0;
    for (const u of this.game.units) if (u.team === this.team && (!u.carrier || u.carrier instanceof Building)) p += power(u);
    return p;
  }

  /** The next unit to save up for and build. */
  protected chooseUnit(): UnitType {
    return this.raidTrikeWanted() ? 'trike' : this.repairWanted() ? 'repair' : this.pickCounter();
  }

  /**
   * Unit types worth building against the enemy's current army, with how much. Each type is scored by how it fares
   * against the enemy's unit types in measured equal-cost duels (matchups.ts, from sim/matchups.ts), weighted by
   * their share of the enemy army's value. Bad matchups count double: a unit the enemy has a hard counter for dies
   * before it does its job, whatever else it would beat. Weights are exp(counterFocus x score), so Hard sticks
   * closer to the best counter than Normal, on top of a combined-arms base mix (tanks and rocket launchers at the
   * core), and a type that's already much of our army gets picked less. With no enemy army yet, the base mix.
   */
  private counterWeights(): [UnitType, number][] {
    const g = this.game;
    const options = (MATCHUP_TYPES as Matchup[]).filter((t) => g.requirementsMet(this.team, UNITS[t].requires));
    // The enemy army as we've seen it.
    const enemy = new Map<Matchup, number>();
    let total = 0;
    for (const s of this.intel.units.values()) {
      if (!(MATCHUP_TYPES as string[]).includes(s.type)) continue;
      const cost = UNITS[s.type as UnitType].cost;
      enemy.set(s.type as Matchup, (enemy.get(s.type as Matchup) ?? 0) + cost);
      total += cost;
    }
    const own = new Map<Matchup, number>();
    let ownTotal = 0;
    for (const u of g.units) {
      if (u.team !== this.team || !(MATCHUP_TYPES as UnitType[]).includes(u.type)) continue;
      own.set(u.type as Matchup, (own.get(u.type as Matchup) ?? 0) + u.def.cost);
      ownTotal += u.def.cost;
    }
    const base = (t: Matchup) => BASE_MIX[t] * (1 - (own.get(t) ?? 0) / Math.max(1, ownTotal)) ** 2;
    if (total === 0) return options.map((t) => [t, base(t)]);
    const key = `${g.teams[this.team].upgrades.has('rockets') ? 'R' : '-'}${this.intel.enemyRockets ? 'R' : '-'}`;
    return options.map((t) => {
      let score = 0;
      for (const [e, value] of enemy) {
        const r = MATCHUPS[key][t][e];
        score += (value / total) * (r < 0 ? 2 * r : r);
      }
      return [t, base(t) * Math.exp(this.profile.counterFocus * score)];
    });
  }

  /** Weighted pick that leans toward whatever counters the enemy's current army. */
  private pickCounter(): UnitType {
    const options = this.counterWeights();
    if (options.length === 0) return 'infantry';
    let r = this.game.random() * options.reduce((sum, [, w]) => sum + w, 0);
    for (const [type, w] of options) {
      r -= w;
      if (r <= 0) return type;
    }
    return options[0][0];
  }

  /** Hunting raiders keep enough trikes for the next raid, while there's a harvester worth raiding. */
  private raidTrikeWanted(): boolean {
    const r = this.profile.raids;
    if (!r.hunt || this.game.time < this.nextRaidTime - 20 || !this.game.canTrain(this.team, 'trike')) return false;
    const trikes = this.game.count(this.team, 'trike');
    const queued = this.ts.queues.factory.filter((q) => q.type === 'trike').length;
    return trikes + queued < r.trikes && !!this.rally && !!this.pickHarvester(this.rally, r.trikes * UNITS.trike.cost);
  }

  /** Short of Repair Vehicles for the size of the vehicle army. */
  private repairWanted(): boolean {
    const s = this.profile.sustain;
    if (!s.repairPer || !this.game.canTrain(this.team, 'repair')) return false;
    const vehicles = this.game.units.filter((u) => u.team === this.team && u.def.weapon && !u.def.infantry && !u.def.air).length;
    const want = Math.min(s.maxRepair, Math.round(vehicles / s.repairPer));
    const have = this.game.count(this.team, 'repair') + this.ts.queues.factory.filter((q) => q.type === 'repair').length;
    return have < want;
  }

  // ---- Army -----------------------------------------------------------------

  protected manageArmy(): void {
    const g = this.game;
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon && !u.carrier);
    for (const u of [...this.roles.keys()]) if (u.dead) this.roles.delete(u);
    for (const u of army) if (!this.roles.has(u)) this.roles.set(u, 'home');
    this.updateRally();

    this.manageRepairs(army);
    this.manageGarrisons(army);
    this.manageDefense(army);
    const baseAttacked = this.defenses.some((d) => d.base);
    this.manageWaves(baseAttacked);
    this.manageRaids(army, baseAttacked);
    this.manageScout(army, baseAttacked);

    // Leash: a unit at home or defending that has been drawn far out (chasing a kiting raider, say) comes straight
    // back with a plain move, which doesn't stop to fight, instead of an attack-move it would break off again.
    if (this.rally) {
      for (const u of army) {
        const role = this.roles.get(u);
        if ((role !== 'home' && role !== 'defend') || u.order.kind === 'move') continue;
        if (hypot(u.x - this.rally.x, u.z - this.rally.z) <= LEASH) continue;
        this.leaveGroups(u);
        this.roles.set(u, 'home');
        u.command(g, { kind: 'move', x: this.rally.x, z: this.rally.z });
      }
    }

    // Idle units at home gather at the rally point (new units, and anyone who wandered off chasing something).
    if (this.rally) {
      for (const u of army) {
        if (this.roles.get(u) !== 'home' || u.order.kind !== 'idle' || u.target) continue;
        if (hypot(u.x - this.rally.x, u.z - this.rally.z) > 8 * TILE) this.sendHome(u);
      }
    }
  }

  protected home(): Building | null {
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
    const len = hypot(mid - anchor.x, mid - anchor.z) || 1;
    const out = 7 * TILE;
    const x = anchor.x + ((mid - anchor.x) / len) * out;
    const z = anchor.z + ((mid - anchor.z) / len) * out;
    const cell = map.nearestCell(map.cellOf(x), map.cellOf(z), (cx, cz) => map.canEnter(cx, cz, 'vehicle'), 8);
    this.rally = cell ? { x: map.center(cell.cx), z: map.center(cell.cz) } : { x: anchor.x, z: anchor.z };
  }

  protected sendHome(u: Unit): void {
    this.roles.set(u, 'home');
    if (!this.rally) {
      u.command(this.game, { kind: 'idle' });
      return;
    }
    // Spread out a little so the group doesn't pile onto one cell.
    const a = this.game.random() * Math.PI * 2;
    const r = this.game.random() * 3 * TILE;
    u.command(this.game, { kind: 'amove', x: this.rally.x + Math.cos(a) * r, z: this.rally.z + Math.sin(a) * r });
  }

  /** Enemy combat units near our buildings or harvesters, grouped into separate attacks. */
  private findThreats(): Omit<Defense, 'lastSeen' | 'units'>[] {
    const g = this.game;
    const buildings = g.buildings.filter((b) => b.team === this.team);
    const harvesters = g.units.filter((u) => u.team === this.team && u.type === 'harvester' && !u.carrier);
    const near = (e: Entity, list: Entity[], r: number) => list.some((o) => hypot(o.x - e.x, o.z - e.z) < r);
    const groups: { units: Unit[]; x: number; z: number; base: boolean }[] = [];
    for (const e of g.units) {
      if (e.team === this.team || e.dead || e.carrier || !e.def.weapon || !g.sees(this.team, e)) continue;
      const base = near(e, buildings, BASE_RADIUS);
      if (!base && !near(e, harvesters, HARVESTER_RADIUS)) continue;
      let group = groups.find((c) => hypot(c.x - e.x, c.z - e.z) < CLUSTER_RADIUS);
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
      let d = this.defenses.find((d) => !seen.has(d) && hypot(d.x - t.x, d.z - t.z) < 16 * TILE);
      if (!d) this.defenses.push((d = { ...t, lastSeen: g.time, units: new Set() }));
      Object.assign(d, t, { lastSeen: g.time });
      seen.add(d);
    }

    this.outgunned = false;
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
        const dist = (u: Unit) => hypot(u.x - d.x, u.z - d.z);
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
      if (d.base && have < d.power) this.outgunned = true;
      // Defenders that got where they were sent and found nothing follow the attackers as they move.
      for (const u of d.units) {
        if (u.order.kind === 'idle' && !u.target && hypot(u.x - d.x, u.z - d.z) > 4 * TILE) u.command(g, { kind: 'amove', x: d.x, z: d.z });
      }
    }
  }

  /** Idle infantry at home fill our bunkers; ones that came out (bunker lost, or unloaded) rejoin the units at home. */
  private manageGarrisons(army: Unit[]): void {
    const g = this.game;
    for (const u of army) if (this.roles.get(u) === 'garrison' && u.order.kind !== 'enter') this.roles.set(u, 'home');
    for (const b of g.buildings) {
      if (b.team !== this.team || !b.def.garrison) continue;
      let room = b.room - army.filter((u) => u.order.kind === 'enter' && u.order.target === b).length;
      if (room <= 0) continue;
      const idle = army
        .filter((u) => u.def.infantry && this.roles.get(u) === 'home' && !u.target)
        .sort((p, q) => hypot(p.x - b.x, p.z - b.z) - hypot(q.x - b.x, q.z - b.z));
      for (const u of idle) {
        if (room-- <= 0) break;
        this.roles.set(u, 'garrison');
        u.command(g, { kind: 'enter', target: b });
      }
    }
  }

  private leaveGroups(u: Unit): void {
    for (const w of this.waves) w.units.delete(u);
    for (const d of this.defenses) d.units.delete(u);
    this.raiders.delete(u);
  }

  /**
   * Repair Vehicles wait at the rally point between jobs, and damaged vehicles that are home and idle (back from
   * defending, or from a wave that fell back) drive over to the nearest one. Nobody is pulled out of a fight.
   */
  private manageRepairs(army: Unit[]): void {
    if (!this.profile.sustain.repairPer) return;
    const g = this.game;
    const repairers = g.units.filter((u) => u.team === this.team && u.def.repair && !u.carrier);
    const rally = this.rally;
    if (!rally || !repairers.length) return;
    for (const r of repairers) {
      if (r.order.kind === 'idle' && hypot(r.x - rally.x, r.z - rally.z) > 5 * TILE) {
        r.command(g, { kind: 'move', x: rally.x + (this.game.random() - 0.5) * 2 * TILE, z: rally.z + (this.game.random() - 0.5) * 2 * TILE });
      }
    }
    for (const u of army) {
      if (u.def.infantry || u.hp >= u.maxHp * 0.95 || this.roles.get(u) !== 'home' || u.order.kind !== 'idle' || u.target) continue;
      let near = repairers[0];
      for (const r of repairers) if (hypot(r.x - u.x, r.z - u.z) < hypot(near.x - u.x, near.z - u.z)) near = r;
      if (hypot(near.x - u.x, near.z - u.z) > 3 * TILE) u.command(g, { kind: 'move', x: near.x, z: near.z });
    }
  }


  private manageWaves(baseAttacked: boolean): void {
    const g = this.game;
    for (const w of [...this.waves]) {
      for (const u of w.units) if (u.dead) w.units.delete(u);
      const left = [...w.units].reduce((s, u) => s + power(u), 0);
      if (w.units.size === 0 || left < w.start * this.profile.waveRetreat) {
        // Beaten: fall back and join the next wave instead of trickling in one by one.
        for (const u of w.units) this.sendHome(u);
        this.waves.splice(this.waves.indexOf(w), 1);
        continue;
      }
      // Outmatched where it stands (enemy strength around it well above its own): pull back to fight another day.
      const s = this.profile.sustain;
      if (s.outmatched && this.guardAround(this.centroid(w.units), 14) > left * s.outmatched) {
        for (const u of w.units) this.sendHome(u);
        this.waves.splice(this.waves.indexOf(w), 1);
        this.nextWaveTime = Math.max(this.nextWaveTime, g.time + 30); // regroup before going again
        continue;
      }
      // Reached its target and nothing left to shoot there: push on to the next one.
      const idle = [...w.units].filter((u) => u.order.kind === 'idle' && !u.target);
      if (idle.length) {
        const target = this.pickTarget(idle[0], w.economy);
        if (target) for (const u of idle) u.command(g, { kind: 'amove', x: target.x, z: target.z });
      }
    }

    if (baseAttacked) return;
    // Hunting raiders keep their trikes out of the waves.
    const hunt = this.profile.raids.hunt;
    const ready = [...this.roles].filter(([u, r]) => r === 'home' && !u.dead && !u.carrier && !(hunt && u.type === 'trike')).map(([u]) => u);
    const strength = ready.reduce((s, u) => s + power(u), 0);
    // Initiative: strong enough to win outright, so go now, whatever the timer says.
    const enemy = this.enemyDefense();
    // Only on recent scouting: an enemy we haven't looked at in a while may have built anything.
    const fresh = g.time - this.intel.lastBaseSeen < 90;
    const seize = this.profile.initiative > 0 && fresh && ready.length >= 4 && strength >= enemy * this.profile.initiative;
    if (!seize) {
      // The longer it's been since a wave was due, the less of an edge it waits for (down to half after five
      // minutes), so two evenly matched armies don't just stare at each other all game.
      const patience = Math.max(0.5, 1 - (g.time - this.nextWaveTime) / 600);
      if (g.time < this.nextWaveTime || strength < enemy * this.profile.waveGate * patience) return;
      // A full-size wave, or a smaller one if it's been a long while, so the pressure keeps up after heavy losses.
      const overdue = g.time >= this.nextWaveTime + 90;
      if (ready.length < this.waveSize && !(overdue && ready.length >= Math.max(4, this.waveSize / 2))) return;
    }
    const target = this.pickTarget(ready[0], seize);
    if (!target) return;
    const wave: Wave = { units: new Set(ready), start: strength, economy: seize };
    for (const u of ready) {
      this.roles.set(u, 'wave');
      u.command(g, { kind: 'amove', x: target.x, z: target.z });
    }
    this.waves.push(wave);
    this.waveSize = Math.min(this.waveSize + 2, 16);
    this.nextWaveTime = g.time + 60;
  }

  /**
   * A few idle trikes go after an enemy harvester and come home once it's dead or out of reach. Hunting raiders hit
   * and run: they only pick a harvester with little protection, move on to the next one after a kill, and run
   * home as soon as defenders close in or they've lost half their strength.
   */
  private manageRaids(army: Unit[], baseAttacked: boolean): void {
    const g = this.game;
    const r = this.profile.raids;
    for (const u of [...this.raiders]) if (u.dead) this.raiders.delete(u);
    const left = [...this.raiders].reduce((s, u) => s + power(u), 0);
    const beaten = r.hunt && this.raiders.size > 0 && (left < this.raidStart * 0.5 || this.guardAround(this.centroid(this.raiders), 9) > left * 0.6);
    // A raider is done when its attack is over, or it got to where the harvester was last seen and found nothing.
    const done = [...this.raiders].filter((u) => beaten || (u.order.kind !== 'attack' && u.order.kind !== 'amove'));
    if (r.hunt && !beaten && done.length && done.length === this.raiders.size) {
      // Kill made and the group is still healthy: on to the next harvester.
      const next = this.pickHarvester(done[0], left);
      if (next) {
        for (const u of done) this.goAfter(u, next);
        done.length = 0;
      }
    }
    for (const u of done) {
      this.raiders.delete(u);
      this.sendHome(u);
    }

    if (baseAttacked || g.time < this.nextRaidTime || this.raiders.size) return;
    const trikes = army.filter((u) => u.type === 'trike' && this.roles.get(u) === 'home');
    if (trikes.length < r.trikes) return;
    const victim = r.hunt ? this.pickHarvester(trikes[0], trikes.reduce((s, u) => s + power(u), 0)) : this.intel.placedUnits().find((s) => s.harvester) ?? null;
    if (!victim) return;
    for (const u of trikes) {
      this.roles.set(u, 'raid');
      this.raiders.add(u);
      this.goAfter(u, victim);
    }
    this.raidStart = trikes.reduce((s, u) => s + power(u), 0);
    this.nextRaidTime = g.time + r.interval;
  }

  /**
   * Scouting: every so often one fast, cheap unit from home (a trike if there is one, else infantry) drives out to
   * look at the enemy, first where the enemy base must be, then the spice field its harvesters work. It doesn't
   * stop to fight, and turns back once it's hurt. What it sees goes into `intel`.
   */
  private manageScout(army: Unit[], baseAttacked: boolean): void {
    const g = this.game;
    const s = this.scout;
    if (s && (s.dead || s.carrier || this.roles.get(s) !== 'scout')) this.endScout();
    else if (s) {
      if (this.watching) return;
      if (s.hp < s.maxHp * 0.5) {
        if (!this.toWatchPost()) this.endScout();
        return;
      }
      const goal = this.scoutRoute[0];
      if (goal && (hypot(s.x - goal.x, s.z - goal.z) < 4 * TILE || s.order.kind === 'idle')) {
        this.scoutRoute.shift();
        const next = this.scoutRoute[0];
        if (next) s.command(g, { kind: 'move', x: next.x, z: next.z });
        else if (!this.toWatchPost()) this.endScout();
      }
      return;
    }
    if (baseAttacked || this.rushed() || g.time < this.nextScoutTime) return;
    const candidates = army
      .filter((u) => this.roles.get(u) === 'home' && (u.type === 'trike' || u.type === 'infantry') && u.hp > u.maxHp * 0.7)
      .sort((a, b) => b.def.speed - a.def.speed);
    const scout = candidates[0];
    if (!scout) {
      this.nextScoutTime = g.time + 10;
      return;
    }
    const base = this.intel.enemyBase();
    const m = g.map;
    const spice = m.nearestCell(m.cellOf(base.x), m.cellOf(base.z), (x, z) => m.tile(x, z) === SPICE, 24);
    // The base first while we don't know where it is; once we do, the spice field (harvesters) on the way in.
    const field = spice ? { x: m.center(spice.cx), z: m.center(spice.cz) } : null;
    this.scoutRoute = this.intel.baseKnown && field ? [field, base] : field ? [base, field] : [base];
    // Later runs also look in on wherever we've gone longest without a look (a hidden expansion, say).
    if (this.intel.baseKnown) this.scoutRoute.push(this.intel.searchSpot());
    this.leaveGroups(scout);
    this.roles.set(scout, 'scout');
    this.scout = scout;
    scout.command(g, { kind: 'move', x: this.scoutRoute[0].x, z: this.scoutRoute[0].z });
  }

  /**
   * Hard: once the scout has had its look, it parks outside the enemy base on the way toward the middle of the map
   * (out of reach of the base's own sight), where an army heading out has to pass. Returns false if not watching.
   */
  private toWatchPost(): boolean {
    const s = this.scout;
    if (!this.profile.watch || !s || this.watching) return false;
    const m = this.game.map;
    const base = this.intel.enemyBase();
    const mid = m.worldSize() / 2;
    const len = hypot(mid - base.x, mid - base.z) || 1;
    const out = 16 * TILE;
    const x = base.x + ((mid - base.x) / len) * out;
    const z = base.z + ((mid - base.z) / len) * out;
    const cell = m.nearestCell(m.cellOf(x), m.cellOf(z), (cx, cz) => m.canEnter(cx, cz, 'vehicle'), 6);
    if (!cell) return false;
    this.watching = true;
    s.command(this.game, { kind: 'move', x: m.center(cell.cx), z: m.center(cell.cz) });
    return true;
  }

  private endScout(): void {
    const s = this.scout;
    this.scout = null;
    this.watching = false;
    this.scoutRoute = [];
    // The opening is when a look matters most (an early attack has to be seen coming): more often then.
    const t = this.game.time;
    this.nextScoutTime = t + this.profile.scout.interval * (t < 240 ? 0.5 : 1);
    if (s && !s.dead && this.roles.get(s) === 'scout') this.sendHome(s);
  }

  /** Attacks a sighted enemy if it's in view, else heads (attack-moving) to where it was last seen. */
  private goAfter(u: Unit, s: Sighting): void {
    const live = this.intel.visibleUnit(s);
    if (live) u.command(this.game, { kind: 'attack', target: live });
    else u.command(this.game, { kind: 'amove', x: s.x, z: s.z });
  }

  private centroid(units: Set<Unit>): { x: number; z: number } {
    let x = 0;
    let z = 0;
    for (const u of units) {
      x += u.x;
      z += u.z;
    }
    return { x: x / Math.max(1, units.size), z: z / Math.max(1, units.size) };
  }

  /** Known enemy fighting strength within `tiles` of a point. */
  private guardAround(p: { x: number; z: number }, tiles: number): number {
    return this.intel.powerAround(p.x, p.z, tiles * TILE);
  }

  /**
   * The enemy harvester with the least protection around it, nearer ones preferred; none if every one is guarded by
   * more than half of `strength`.
   */
  private pickHarvester(from: { x: number; z: number }, strength: number): Sighting | null {
    let best: Sighting | null = null;
    let bestScore = Infinity;
    for (const h of this.intel.placedUnits()) {
      if (!h.harvester) continue;
      const guard = this.guardAround(h, 12);
      if (guard > strength * 0.5) continue;
      const score = guard + hypot(h.x - from.x, h.z - from.z) * 5;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  /**
   * The nearest enemy structure we know of (or, a little less eagerly, a unit we know the whereabouts of); with
   * `economy`, refineries and harvesters come first. Knowing of nothing, where the enemy base must be.
   */
  protected pickTarget(from: Unit, economy = false): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    const consider = (s: Sighting, building: boolean) => {
      const econ = economy && (s.type === 'refinery' || s.type === 'harvester');
      const d = hypot(s.x - from.x, s.z - from.z) + (building ? 0 : 20) - (econ ? 40 : 0);
      if (d < bestD) {
        bestD = d;
        best = { x: s.x, z: s.z };
      }
    };
    for (const s of this.intel.buildings.values()) consider(s, true);
    for (const s of this.intel.placedUnits()) consider(s, false);
    if (best) return best;
    // Nothing known: where the base must be, unless we've looked there lately and found nothing; then search.
    const guess = this.intel.enemyBase();
    return this.game.vision.explored[this.team][this.game.map.idx(this.game.map.cellOf(guess.x), this.game.map.cellOf(guess.z))] ? this.intel.searchSpot() : guess;
  }

  // ---- Fight control (Brutal) -------------------------------------------------------

  /**
   * Target picking for every unit in a fight, done together: each takes the visible enemy in its reach worth the
   * most to kill now, its damage per second against it times what the enemy is worth (its price; half for unarmed
   * ones like harvesters, which raiders want most) over the health it has left after what allies already aimed at it
   * will do in the next second and a half. So shots go where they finish someone, the same way a player focuses
   * fire, and nobody wastes a volley on a unit about to die. A unit keeps its target unless another is clearly
   * better, so it doesn't twitch between two. Vehicles too hurt to keep fighting pull out to be repaired.
   */
  private micro(): void {
    const g = this.game;
    const enemies = g.units.filter((e) => e.team !== this.team && !e.dead && !e.carrier && g.sees(this.team, e));
    this.manageMending(enemies);
    if (!enemies.length) return;
    const aimed = new Map<Unit, number>();
    const army = g.units.filter((u) => u.team === this.team && u.def.weapon && !u.dead && !u.carrier && !u.falling);
    for (const u of army) {
      const role = this.roles.get(u);
      if (role !== 'wave' && role !== 'defend' && role !== 'raid' && role !== 'home') continue;
      if (u.order.kind === 'move' || u.order.kind === 'enter') continue; // on its way somewhere on purpose
      let best: Unit | null = null;
      let bestScore = 0;
      let current = 0;
      for (const e of enemies) {
        const w = g.weaponFor(u, e);
        if (!w) continue;
        const d = hypot(e.x - u.x, e.z - u.z);
        if (d < w.minRange || d > g.rangeFor(u, w, e) + TILE) continue;
        const dps = weaponDamage(w, e) / g.cooldownFor(u, w);
        const left = e.hp - (aimed.get(e) ?? 0);
        if (left <= 0) continue;
        const worth = e.def.weapon ? e.def.cost : e.def.cost * (role === 'raid' ? 3 : 0.5);
        const score = (dps * worth) / Math.max(left, e.maxHp * 0.1);
        if (e === u.target) current = score;
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (!best) continue;
      // Stay on the current target unless the best is clearly better.
      const pick = current > 0 && current >= bestScore * 0.75 ? (u.target as Unit) : best;
      const w = g.weaponFor(u, pick)!;
      aimed.set(pick, (aimed.get(pick) ?? 0) + (weaponDamage(w, pick) / g.cooldownFor(u, w)) * 1.5);
      if (u.target === pick && u.order.kind === 'attack') continue;
      u.command(g, { kind: 'attack', target: pick });
    }
  }

  /**
   * Vehicles in a fight below `micro.mend` of their health drive back to the nearest Repair Vehicle (a plain move:
   * they don't stop to fight), and rejoin the units at home once mended. Without Repair Vehicles, nobody leaves.
   */
  private manageMending(enemies: Unit[]): void {
    const g = this.game;
    const repairers = g.units.filter((u) => u.team === this.team && u.def.repair && !u.dead && !u.carrier);
    for (const [u, role] of this.roles) {
      if (u.dead) continue;
      if (role === 'mend') {
        if (u.hp >= u.maxHp * 0.9 || !repairers.length) this.sendHome(u);
        else if (u.order.kind === 'idle' && !u.target) {
          const near = this.nearest(repairers, u);
          if (hypot(near.x - u.x, near.z - u.z) > 3 * TILE) u.command(g, { kind: 'move', x: near.x, z: near.z });
        }
        continue;
      }
      if (!repairers.length || u.def.infantry || u.def.air || u.def.repair || !u.def.weapon || u.carrier) continue;
      if ((role !== 'wave' && role !== 'defend' && role !== 'home') || u.hp >= u.maxHp * this.profile.micro.mend) continue;
      // Only out of a fight: a unit hurt earlier and sitting at home is manageRepairs' job.
      if (!enemies.some((e) => e.def.weapon && hypot(e.x - u.x, e.z - u.z) < u.def.sight)) continue;
      const near = this.nearest(repairers, u);
      this.leaveGroups(u);
      this.roles.set(u, 'mend');
      u.command(g, { kind: 'move', x: near.x, z: near.z });
    }
  }

  private nearest<T extends Entity>(list: T[], from: { x: number; z: number }): T {
    let best = list[0];
    for (const e of list) if (hypot(e.x - from.x, e.z - from.z) < hypot(best.x - from.x, best.z - from.z)) best = e;
    return best;
  }

  // ---- Surrender --------------------------------------------------------------

  /**
   * Lost for good: no income and no way to buy it back (a harvester needs a refinery and a factory, a refinery needs
   * a construction yard), or nothing left to build units with; and an army well short of the enemy's as far as we
   * know it, or, three minutes on, too small to win the game with anyway (a few infantry holding a bunker).
   */
  private hopeless(): boolean {
    const g = this.game;
    const t = this.team;
    const credits = this.ts.credits;
    const income = g.count(t, 'harvester') > 0 && g.has(t, 'refinery');
    const canBuyIncome = (g.has(t, 'refinery') && g.has(t, 'factory') && credits >= UNITS.harvester.cost)
      || (g.has(t, 'conyard') && credits >= BUILDINGS.refinery.cost);
    const canProduce = g.has(t, 'conyard') || g.has(t, 'barracks') || g.has(t, 'factory');
    if ((income || canBuyIncome) && canProduce) {
      this.brokeSince = Infinity;
      return false;
    }
    this.brokeSince = Math.min(this.brokeSince, g.time);
    const own = this.ownPower();
    return own < this.intel.armyPower() * 0.5 || (g.time - this.brokeSince > 180 && own < 1500);
  }

  private considerSurrender(): void {
    if (!this.profile.surrender || this.surrenderOffered || this.game.winner !== null) return;
    this.hopelessFor = this.hopeless() ? this.hopelessFor + 1 : 0;
    if (this.hopelessFor < 15) return;
    this.surrenderOffered = true; // offered once; if it's turned down, fight on to the end
    this.game.offerSurrender(this.team);
  }

  /**
   * A valid spot near the base, leaving a one-tile gap so paths stay open: the closest to the construction yard (a
   * refinery: to the nearest spice), ties going toward the middle of the map. Positions are compared in the base's
   * own frame (toward the middle, and across), so two mirrored bases pick mirrored spots.
   */
  private findSpot(type: BuildingType): Cell | null {
    const g = this.game;
    const size = BUILDINGS[type].size;
    const anchor = this.home();
    if (!anchor) return null;
    let goal = { x: anchor.cx + anchor.size / 2, z: anchor.cz + anchor.size / 2 };
    if (type === 'refinery') {
      const spice = g.map.nearestCell(anchor.cx + 1, anchor.cz + 1, (x, z) => g.map.tile(x, z) === SPICE, 20);
      if (spice) goal = { x: spice.cx + 0.5, z: spice.cz + 0.5 };
    }
    // Bunkers go at the front of the base, where the rally point is and attacks come from.
    if (type === 'bunker' && this.rally) goal = { x: this.rally.x / TILE, z: this.rally.z / TILE };
    const ok = (cx: number, cz: number) => {
      if (!g.canPlace(type, this.team, cx, cz)) return false;
      for (let z = cz - 1; z <= cz + size; z++) {
        for (let x = cx - 1; x <= cx + size; x++) {
          if (g.map.inBounds(x, z) && g.map.occupied[g.map.idx(x, z)] !== 0) return false;
        }
      }
      return true;
    };
    return this.bestSpot(type, anchor, goal, ok) ?? this.bestSpot(type, anchor, goal, (cx, cz) => g.canPlace(type, this.team, cx, cz));
  }

  /** The valid spot (by `ok`) nearest `goal`; see `findSpot`. */
  private bestSpot(type: BuildingType, anchor: Building, goal: { x: number; z: number }, ok: (cx: number, cz: number) => boolean): Cell | null {
    const g = this.game;
    const size = BUILDINGS[type].size;
    const ax = anchor.cx + anchor.size / 2;
    const az = anchor.cz + anchor.size / 2;
    const mid = g.map.size / 2;
    const len = hypot(mid - ax, mid - az) || 1;
    const tx = (mid - ax) / len;
    const tz = (mid - az) / len;
    let best: Cell | null = null;
    let bestKey: number[] = [];
    const R = 12;
    for (let cz = anchor.cz - R; cz <= anchor.cz + R; cz++) {
      for (let cx = anchor.cx - R; cx <= anchor.cx + R; cx++) {
        const x = cx + size / 2;
        const z = cz + size / 2;
        // Rounded so mirrored spots tie exactly despite floating point, then broken in the base's frame.
        const d = Math.round(hypot(x - goal.x, z - goal.z) * 1000);
        const along = Math.round(((x - ax) * tx + (z - az) * tz) * 1000);
        const across = Math.round(((x - ax) * -tz + (z - az) * tx) * 1000);
        const key = [d, -along, across];
        if (best && !(key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2]))))) continue;
        if (!g.map.inBounds(cx, cz) || !ok(cx, cz)) continue;
        best = { cx, cz };
        bestKey = key;
      }
    }
    return best;
  }
}
