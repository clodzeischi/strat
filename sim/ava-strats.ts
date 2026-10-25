// Atreides build orders for the mirror balance pass (docs/balance-atreides.md): each is Brutal (micro, mending,
// Carryall operations) playing a fixed plan instead of picking counters, so a round robin between them shows whether
// one plan beats everything. 'std' is stock Brutal, which counters what it sees.
import { BRUTAL_OPTIONS, BRUTAL_PROFILE, BrutalAI, type BrutalOptions } from '../src/game/brutal';
import type { AIProfile } from '../src/game/ai';
import type { Team, UnitType } from '../src/config';
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
  // Stock Brutal that never builds Carryalls: what its usual (late) Carryalls are worth.
  nocarry: { profile: BRUTAL_PROFILE, opts: { carryalls: 0 } },
};

export function makeStrat(g: Game, team: Team, name: string): BrutalAI {
  const s = STRATS[name] ?? EXTRA[name];
  if (!s) throw new Error(`no strategy ${name}`);
  const ai = new BrutalAI(g, team, s.profile, { ...BRUTAL_OPTIONS, ...s.opts });
  if (s.firstWave !== undefined) (ai as unknown as { nextWaveTime: number }).nextWaveTime = s.firstWave;
  return ai;
}
