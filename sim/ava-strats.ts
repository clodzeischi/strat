// Atreides build orders for the mirror balance pass (docs/balance-atreides.md): each is Brutal (micro, mending,
// Carryall operations) playing a fixed plan instead of picking counters, so a round robin between them shows whether
// one plan beats everything. 'std' is stock Brutal, which counters what it sees.
import { BRUTAL_OPTIONS, BRUTAL_PROFILE, BrutalAI, type BrutalOptions } from '../src/game/brutal';
import { AI, HARD_PROFILE, power, type AIProfile } from '../src/game/ai';
import { TILE, type Team, type UnitType } from '../src/config';
import type { Unit } from '../src/entities';
import { hypot } from '../src/game/hypot';
import type { Game } from '../src/game/game';

const mix = (m: Partial<Record<UnitType, number>>) => ({ ...BRUTAL_PROFILE.mix, infantry: 0.1, trike: 0.1, tank: 0.1, rocket: 0.1, ...m });
/** A fixed plan: its own unit mix, barely bent by what the enemy fields. */
const plan = (p: Partial<AIProfile>): AIProfile => ({ ...BRUTAL_PROFILE, counterFocus: 1, ...p });
const ALL = ['weapons1', 'armor1', 'weapons2', 'armor2', 'harvest'] as const;

export interface Strat {
  profile: AIProfile;
  opts?: Partial<BrutalOptions>;
  /** First wave not before this game time (seconds). */
  firstWave?: number;
  /** A trike death squad that hunts harvesters (see SquadAI): from Nitro on, or from this game time without it. */
  squad?: { nitro: boolean; from?: number };
}

/**
 * Brutal plus a trike death squad, scripted for the sims: from the moment Nitro is in (or a set time), six trikes leave
 * the AI's hands and do nothing but hunt harvesters. They drive to the least guarded harvester known, shoot every
 * harvester they see, go straight on to the next, and only turn for home when the guard around them outweighs them;
 * down to three, they go home and wait to be topped up to six. Counters land in `stats` (squad*).
 */
class SquadAI extends BrutalAI {
  private squad = new Set<Unit>();
  private regroup = true;
  private squadTimer = 0;
  constructor(game: Game, team: Team, profile: AIProfile, opts: BrutalOptions, private readonly squadOpts: NonNullable<Strat['squad']>) {
    super(game, team, profile, opts);
    Object.assign(this.stats, { squadKills: 0, squadLost: 0, squadOut: 0, squadStart: 0 });
  }

  update(dt: number): void {
    super.update(dt);
    if ((this.squadTimer -= dt) > 0) return;
    this.squadTimer = 0.5;
    const g = this.game;
    const st = this.stats as unknown as Record<string, number>;
    const on = this.squadOpts.nitro ? g.teams[this.team].upgrades.has('nitro') : g.time >= (this.squadOpts.from ?? 375);
    if (!on) return;
    if (!st.squadStart) st.squadStart = Math.round(g.time);
    for (const u of [...this.squad]) if (u.dead) {
      this.squad.delete(u);
      st.squadLost++;
    }
    const rally = this.rally;
    if (!rally) return;
    // Top up from the trikes at home.
    if (this.squad.size < 6) {
      for (const [u, r] of this.roles) {
        if (this.squad.size >= 6) break;
        if (u.dead || u.carrier || u.type !== 'trike' || r !== 'home') continue;
        this.roles.set(u, 'drop'); // out of every other job the AI has
        this.squad.add(u);
        u.command(g, { kind: 'move', x: rally.x, z: rally.z });
      }
    }
    const units = [...this.squad];
    if (!units.length) return;
    const c = this.centroid(this.squad);
    const strength = units.reduce((s, u) => s + power(u), 0);
    if (this.regroup) {
      if (this.squad.size >= 6 && units.every((u) => hypot(u.x - rally.x, u.z - rally.z) < 8 * TILE)) this.regroup = false;
      else {
        for (const u of units) if (u.order.kind === 'idle' && hypot(u.x - rally.x, u.z - rally.z) > 4 * TILE) u.command(g, { kind: 'move', x: rally.x, z: rally.z });
        return;
      }
    }
    st.squadOut += 0.5;
    // Outgunned, or worn down: home.
    if (this.squad.size <= 3 || this.guardAround(c, 9) > strength * 0.8) {
      this.regroup = true;
      for (const u of units) u.command(g, { kind: 'move', x: rally.x, z: rally.z });
      return;
    }
    // A harvester in sight: everyone on it.
    let prey: Unit | null = null;
    let best = 14 * TILE;
    for (const e of g.units) {
      if (e.team === this.team || e.dead || e.carrier || e.type !== 'harvester' || !g.sees(this.team, e)) continue;
      const d = hypot(e.x - c.x, e.z - c.z);
      if (d < best) {
        best = d;
        prey = e;
      }
    }
    if (prey) {
      for (const u of units) if (u.order.kind !== 'attack' || u.order.target !== prey) u.command(g, { kind: 'attack', target: prey });
      return;
    }
    // Else to the least guarded harvester we know of, driving past everything else.
    const goal = this.pickHarvester(c, strength) ?? this.intel.enemyBase();
    for (const u of units) {
      const o = u.order;
      if (o.kind === 'attack' && !o.target.dead) continue;
      if (o.kind !== 'move' || hypot(o.x - goal.x, o.z - goal.z) > 4 * TILE) u.command(g, { kind: 'move', x: goal.x, z: goal.z });
    }
  }
}

export const STRATS: Record<string, Strat> = {
  std: { profile: BRUTAL_PROFILE },
  // Barracks first, infantry, early pressure, no tech.
  rush: {
    profile: plan({ opening: ['barracks', 'barracks', 'refinery', 'factory'], harvesters: 3, extraRefinery: 'never', techArmy: 40, mix: mix({ infantry: 3, trike: 0.4 }), initiative: 1 }),
    opts: { carryalls: 0 }, firstWave: 100,
  },
  // Infantry core that gets Infantry Rockets early (HQ Level 2 first).
  bio: { profile: plan({ mix: mix({ infantry: 3, tank: 0.4, rocket: 0.4 }), techArmy: 6, kit: { levels: ['conyard'], research: ['rockets', 'weapons1', 'armor1', 'harvest', 'weapons2', 'armor2'] } }) },
  // Tanks with some trikes, Weapons and Armor, no Factory Level 2 rush.
  mech: { profile: plan({ mix: mix({ tank: 3, trike: 0.6 }), kit: { levels: ['conyard'], research: ['weapons1', 'armor1', 'harvest', 'weapons2', 'armor2'] } }) },
  // Trikes everywhere: Nitro first, big raids, constant pressure on harvesters.
  trike: {
    profile: plan({ mix: mix({ trike: 3, tank: 0.6, infantry: 0.4 }), raids: { trikes: 6, start: 110, interval: 30, hunt: true }, kit: { levels: ['conyard'], research: ['nitro', 'weapons1', 'armor1', 'harvest', 'weapons2', 'armor2'] } }),
  },
  // Factory Level 2 as early as possible, MLRS and tanks.
  tech: { profile: plan({ techArmy: 3, mix: mix({ rocket: 3, tank: 1.5 }), kit: { levels: ['factory', 'conyard'], research: [...ALL] } }) },
  // Bunkers, everything researched, no attacks before 14:00, then the big army.
  turtle: {
    profile: plan({ bunkers: 3, techArmy: 4, initiative: 0, raids: { ...BRUTAL_PROFILE.raids, start: Infinity }, mix: mix({ tank: 2, rocket: 2, infantry: 0.6 }), kit: { levels: ['factory', 'conyard'], research: ['weapons1', 'armor1', 'rockets', 'harvest', 'weapons2', 'armor2', 'nitro'] } }),
    opts: { carryalls: 0, flank: false }, firstWave: 840,
  },
};

/** Not in the round robin: stock Brutal without its micro (kiting, focus fire), to see what control is worth. */
export const EXTRA: Record<string, Strat> = {
  nomicro: { profile: BRUTAL_PROFILE, opts: { micro: false } },
  // Stock Brutal that goes for the economy: HQ Level 2 first and Harvesting before anything else.
  eco: { profile: { ...BRUTAL_PROFILE, kit: { levels: ['conyard', 'factory'], research: ['harvest', 'rockets', 'weapons1', 'armor1', 'nitro', 'weapons2', 'armor2'] } } },
  // Stock Brutal with an early Hi-Tech Factory, so its two Carryalls ferry harvesters from the first minutes.
  air: { profile: BRUTAL_PROFILE, opts: { hitechAt: 150, hitechAtLarge: 150, hitechArmy: 0, hitechLead: 0, hitechSpare: 0 } },
  airnf: { profile: BRUTAL_PROFILE, opts: { hitechAt: 150, hitechAtLarge: 150, hitechArmy: 0, hitechLead: 0, hitechSpare: 0, ferry: false } },
  air5: { profile: BRUTAL_PROFILE, opts: { hitechAt: 300, hitechAtLarge: 300, hitechArmy: 6, hitechLead: 1, hitechSpare: 200 } },
  air7: { profile: BRUTAL_PROFILE, opts: { hitechAt: 420, hitechAtLarge: 420, hitechArmy: 8, hitechLead: 1, hitechSpare: 200 } },
  nolift: { profile: BRUTAL_PROFILE, opts: { lift: false } },
  // Stock Brutal plus a death squad: Trike Nitro first, then six trikes kept out of the waves that do nothing but hunt
  // harvesters, every 15 s whenever six are home. 'trikesquad': the same without Nitro.
  deathsquad: { squad: { nitro: true }, profile: { ...BRUTAL_PROFILE, mix: { ...BRUTAL_PROFILE.mix, trike: (BRUTAL_PROFILE.mix.trike ?? 0) + 1 }, kit: { research: ['nitro', 'harvest', 'rockets', 'weapons1', 'armor1', 'weapons2', 'armor2'] } } },
  // The same squad without Nitro, sent out at the time Nitro usually comes in (6:15).
  slowsquad: { squad: { nitro: false, from: 375 }, profile: { ...BRUTAL_PROFILE, mix: { ...BRUTAL_PROFILE.mix, trike: (BRUTAL_PROFILE.mix.trike ?? 0) + 1 }, kit: { research: ['harvest', 'rockets', 'weapons1', 'armor1', 'weapons2', 'armor2'] } } },
  nitrosquad: { profile: { ...BRUTAL_PROFILE, mix: { ...BRUTAL_PROFILE.mix, trike: (BRUTAL_PROFILE.mix.trike ?? 0) + 1 }, raids: { trikes: 6, start: 0, interval: 15, hunt: true }, kit: { research: ['nitro', 'harvest', 'rockets', 'weapons1', 'armor1', 'weapons2', 'armor2'] } } },
  trikesquad: { profile: { ...BRUTAL_PROFILE, mix: { ...BRUTAL_PROFILE.mix, trike: (BRUTAL_PROFILE.mix.trike ?? 0) + 1 }, raids: { trikes: 6, start: 0, interval: 15, hunt: true }, kit: { research: ['harvest', 'rockets', 'weapons1', 'armor1', 'weapons2', 'armor2'] } } },
  // Stock Brutal that never builds Carryalls: what its usual (late) Carryalls are worth.
  nocarry: { profile: BRUTAL_PROFILE, opts: { carryalls: 0 } },
};

export function makeStrat(g: Game, team: Team, name: string): AI {
  if (name === 'hard') return new AI(g, team, HARD_PROFILE);
  const s = STRATS[name] ?? EXTRA[name];
  if (!s) throw new Error(`no strategy ${name}`);
  const opts = { ...BRUTAL_OPTIONS, ...s.opts };
  const ai = s.squad ? new SquadAI(g, team, s.profile, opts, s.squad) : new BrutalAI(g, team, s.profile, opts);
  if (s.firstWave !== undefined) (ai as unknown as { nextWaveTime: number }).nextWaveTime = s.firstWave;
  return ai;
}
