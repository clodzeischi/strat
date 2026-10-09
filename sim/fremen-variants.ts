// Alternative Fremen makeups, for comparing in AI-vs-AI games without touching the game's own numbers. Each variant
// patches the config tables in place before any game is made (unit stats are cached per faction on first use).
// Pick one with FREMEN_VARIANT=<name> for sim/faction-match.ts (and anything that imports this first).
import { AMBUSH, BUILDINGS, FACTIONS, HIDE, SAND_SPEED, UNITS, UPGRADES } from '../src/config';

export const VARIANTS: Record<string, { desc: string; apply: () => void }> = {
  /** As built: the swarm, with Sandworms late. */
  swarm: { desc: 'As built: cheap Warriors, Fedaykin and Commandos; Sandworms after the Great Sietch.', apply: () => {} },

  /** Stealth first: dig in fast, harder to find, and every ambush hits much harder. Warriors a little cheaper and frailer. */
  ghosts: {
    desc: 'Desert ghosts: hide after 1.5 s (not 3), found only within 1.5 tiles (not 2), Ambush +100% (not +50%) and researchable from the Sietch; Warriors 70 credits / 60 HP (not 80 / 70).',
    apply: () => {
      HIDE.delay = 1.5;
      HIDE.detect = 1.5 * 2;
      AMBUSH.bonus = 1;
      Object.assign(UNITS.warrior, { cost: 70, hp: 60 });
      UPGRADES.ambush.requires = ['sietch'];
    },
  },

  /** Worms early and often: the Thumper needs only the Sietch, and worms are cheaper and smaller, three at a time. */
  riders: {
    desc: 'Worm riders: Thumper straight from the Sietch (no Great Sietch), Sandworms 900 credits / 1500 HP / smaller bite, up to 3; Fedaykin 240 credits.',
    apply: () => {
      BUILDINGS.thumper.requires = ['sietch'];
      Object.assign(UNITS.worm, { cost: 900, hp: 1500, limit: 3, buildTime: 20 });
      UNITS.worm.weapon = { ...UNITS.worm.weapon!, damage: 90, bonus: { mechanical: 90, structure: -60 } };
      UNITS.fedaykin.cost = 240;
    },
  },

  /** Fewer, better fighters: tougher Warriors, Fedaykin from the start, faster on sand; no Death Commandos. */
  host: {
    desc: 'Fedaykin host: Warriors 110 credits / 100 HP (not 80 / 70), Fedaykin need only a Barracks, sand bonus +35% (not +20%); no Death Commandos.',
    apply: () => {
      Object.assign(UNITS.warrior, { cost: 110, hp: 100 });
      UNITS.fedaykin.requires = ['barracks'];
      SAND_SPEED.base = 0.35;
      FACTIONS.fremen.train = FACTIONS.fremen.train.map((t) => (t === 'commando' ? null : t));
    },
  },
};

const name = process.env.FREMEN_VARIANT;
if (name) {
  const v = VARIANTS[name];
  if (!v) throw new Error(`unknown FREMEN_VARIANT ${name}: ${Object.keys(VARIANTS).join(', ')}`);
  v.apply();
}
