// Alternative Fremen makeups, for comparing in AI-vs-AI games without touching the game's own numbers. Each variant
// patches the config tables in place before any game is made (unit stats are cached per faction on first use).
// Pick one with FREMEN_VARIANT=<name> for sim/faction-match.ts (and anything that imports this first).
import { AMBUSH, BUILDINGS, FACTIONS, HIDE, RIDE, SAND_SPEED, THUMPER, UNITS, UPGRADES, WORM } from '../src/config';
import { KITS } from '../src/game/ai';

export const VARIANTS: Record<string, { desc: string; apply: () => void }> = {
  /** As built. */
  swarm: { desc: 'As built: cheap Warriors and Fedaykin; Thumpers from the Sietch call wild Sandworms.', apply: () => {} },

  /** Without parts of the kit, to see what each is worth. */
  noworm: { desc: 'No Thumpers (worms never come).', apply: () => { THUMPER.cooldown = 1e9; THUMPER.cost = 1e9; } },
  nomortar: { desc: 'No Fremen Mortars.', apply: () => { FACTIONS.fremen.train = FACTIONS.fremen.train.map((t) => (t === 'mortar' ? null : t)); } },

  /** Sietch redesign: the third level and its research cut, or no High Perch healing. */
  nol3: { desc: 'No Sietch III (so no Weapons/Armor +2; Ambush back at the Great Sietch).', apply: () => { BUILDINGS.sietch.levels!.length = 1; UPGRADES.ambush.requires = ['sietch2']; } },
  nowt: { desc: 'No High Perch (Gliders from the Barracks again).', apply: () => { FACTIONS.fremen.build = FACTIONS.fremen.build.map((t) => (t === 'perch' ? null : t)); UNITS.glider.producer = 'barracks'; UNITS.glider.requires = ['barracks']; } },

  /** Sietch redesign balance: the Sandrider sooner, rides worth more, cheaper rites. */
  s3early: { desc: 'Sietch III 1000 / 35 s (not 1500 / 45); the AI goes for it with techArmy (not twice).', apply: () => { Object.assign(BUILDINGS.sietch.levels![1], { cost: 1000, time: 35 }); KITS.fremen.topLevelArmy = 1; } },
  rider: { desc: 'Sandrider rite 150 / 8 s (not 300 / 12); the AI keeps 3.', apply: () => { Object.assign(UNITS.sandrider.rite!, { cost: 150, time: 8 }); KITS.fremen.rider!.max = 3; } },
  ride: { desc: 'Rides 60 s (not 40), rest 40 s (not 60).', apply: () => { Object.assign(RIDE, { time: 60, cooldown: 40 }); } },
  rites: { desc: 'Fedaykin rite 90 / 5 s, Mortar 130 / 7 s (not 140 / 8, 190 / 10).', apply: () => { Object.assign(UNITS.fedaykin.rite!, { cost: 90, time: 5 }); Object.assign(UNITS.mortar.rite!, { cost: 130, time: 7 }); } },
  drum: { desc: 'Thumpers 300 HP, drum 5 s (not 150, 8).', apply: () => { BUILDINGS.thumper.hp = 300; THUMPER.delay = 5; } },
  all2: { desc: 'all + drum.', apply: () => { for (const v of ['all', 'drum']) VARIANTS[v].apply(); } },
  fedbio: { desc: 'Fedaykin no longer weak vs infantry (biological -3 -> 0).', apply: () => { UNITS.fedaykin.weapon!.bonus.biological = 0; } },
  rs: { desc: 'rites + s3early.', apply: () => { for (const v of ['rites', 's3early']) VARIANTS[v].apply(); } },
  rsd: { desc: 'rites + s3early + drum.', apply: () => { for (const v of ['rites', 's3early', 'drum']) VARIANTS[v].apply(); } },
  rsf: { desc: 'rites + s3early + fedbio.', apply: () => { for (const v of ['rites', 's3early', 'fedbio']) VARIANTS[v].apply(); } },
  worms: { desc: 's3early + rider + ride.', apply: () => { for (const v of ['s3early', 'rider', 'ride']) VARIANTS[v].apply(); } },
  all: { desc: 's3early + rider + ride + rites.', apply: () => { for (const v of ['s3early', 'rider', 'ride', 'rites']) VARIANTS[v].apply(); } },

  /** Balance candidates. */
  w90: { desc: 'Warriors 90 credits (not 80).', apply: () => { UNITS.warrior.cost = 90; } },
  sietch: { desc: 'Great Sietch 1500 credits, 60 s (not 1200, 40).', apply: () => { Object.assign(BUILDINGS.sietch.levels![0], { cost: 1500, time: 60 }); } },
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
