// Alternative Fremen makeups, for comparing in AI-vs-AI games without touching the game's own numbers. Each variant
// patches the config tables in place before any game is made (unit stats are cached per faction on first use).
// Pick one with FREMEN_VARIANT=<name> for sim/faction-match.ts (and anything that imports this first).
import { AMBUSH, BUILDINGS, FACTIONS, HIDE, SAND_SPEED, THUMPER, UNITS, UPGRADES, WORM } from '../src/config';

export const VARIANTS: Record<string, { desc: string; apply: () => void }> = {
  /** As built. */
  swarm: { desc: 'As built: cheap Warriors and Fedaykin; Thumpers from the Sietch call wild Sandworms.', apply: () => {} },

  /** Without parts of the kit, to see what each is worth. */
  noworm: { desc: 'No Thumpers (worms never come).', apply: () => { THUMPER.cooldown = 1e9; THUMPER.cost = 1e9; } },
  nomortar: { desc: 'No Fremen Mortars.', apply: () => { FACTIONS.fremen.train = FACTIONS.fremen.train.map((t) => (t === 'mortar' ? null : t)); } },

  /** Balance candidates. */
  w90: { desc: 'Warriors 90 credits (not 80).', apply: () => { UNITS.warrior.cost = 90; } },
  sietch: { desc: 'Great Sietch 1500 credits, 60 s (not 1200, 40).', apply: () => { Object.assign(BUILDINGS.sietch.levelUp!, { cost: 1500, time: 60 }); } },
  camp9: { desc: 'Spice Camps 9/s (not 10).', apply: () => { BUILDINGS.camp.extract!.rate = 9; } },
  upg: { desc: 'Fremen Weapons and Armor +1 1200 credits, 40 s (not 800, 30).', apply: () => { for (const u of [UPGRADES.fWeapons, UPGRADES.fArmor]) Object.assign(u, { cost: 1200, time: 40 }); } },
  combo: { desc: 'Spice Camps 9/s, Thumpers 250 every 60 s.', apply: () => { BUILDINGS.camp.extract!.rate = 9; Object.assign(THUMPER, { cost: 250, cooldown: 60 }); } },
  combo85: { desc: 'Spice Camps 8.5/s, Thumpers 250 every 60 s.', apply: () => { BUILDINGS.camp.extract!.rate = 8.5; Object.assign(THUMPER, { cost: 250, cooldown: 60 }); } },
  drum60: { desc: 'Thumpers 250 credits every 60 s (not 200 every 45).', apply: () => { Object.assign(THUMPER, { cost: 250, cooldown: 60 }); } },

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

  /** More worms: Thumpers cheaper and twice as often, the worm hunting a wider ground for longer. */
  drums: {
    desc: 'Drums: Thumpers 100 credits every 25 s (not 200 every 45), worms hunt within 20 for 25 s (not 15 for 20).',
    apply: () => {
      Object.assign(THUMPER, { cost: 100, cooldown: 25 });
      Object.assign(WORM, { range: 20, hunt: 25 });
    },
  },

  /** Fewer, better fighters: tougher Warriors, Fedaykin from the start, faster on sand. */
  host: {
    desc: 'Fedaykin host: Warriors 110 credits / 100 HP (not 80 / 70), Fedaykin need only a Barracks, sand bonus +35% (not +20%).',
    apply: () => {
      Object.assign(UNITS.warrior, { cost: 110, hp: 100 });
      UNITS.fedaykin.requires = ['barracks'];
      SAND_SPEED.base = 0.35;
    },
  },
};

const name = process.env.FREMEN_VARIANT;
if (name) {
  const v = VARIANTS[name];
  if (!v) throw new Error(`unknown FREMEN_VARIANT ${name}: ${Object.keys(VARIANTS).join(', ')}`);
  v.apply();
}
