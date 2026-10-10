import type { UnitDef, UnitType } from './types';

export const UNIT_ORDER: UnitType[] = [
  'harvester', 'infantry', 'trike', 'tank', 'rocket', 'repair', 'carryall', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery',
  'warrior', 'fedaykin', 'crew', 'glider', 'mortar',
];

export const UNITS: Record<UnitType, UnitDef> = {
  harvester: {
    name: 'Harvester', producer: 'factory', cost: 800, buildTime: 10, hp: 600, speed: 3, turnRate: 3, radius: 1.1, sight: 8,
    turret: false, infantry: false, tags: ['mechanical', 'light'], weapon: null, requires: ['factory', 'refinery'], lift: 6,
    desc: 'Collects spice and brings it to a Refinery.',
  },
  infantry: {
    name: 'Infantry', producer: 'barracks', cost: 90, buildTime: 4.5, hp: 70, speed: 2.4, turnRate: 12, radius: 0.45, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks'],
    weapon: { range: 6, minRange: 0, damage: 5, bonus: { biological: 5, armored: -4, structure: -3 }, cooldown: 0.6, projectile: 'bullet', speed: 0, splash: 0, air: true, sound: 'light_mg' },
    antiArmor: { range: 8, minRange: 0, damage: 6, bonus: { armored: 22, structure: -2 }, cooldown: 1.5, projectile: 'rocket', speed: 18, splash: 0, air: true, sound: 'launch_small' },
    lift: 1,
    desc: 'Cheap rifle squad. Strong vs infantry. With Infantry Rockets, devastating vs armor. Can shoot at aircraft.',
  },
  trike: {
    name: 'Trike', producer: 'factory', cost: 150, buildTime: 5, hp: 140, speed: 7.5, turnRate: 6, radius: 0.8, sight: 12,
    turret: false, infantry: false, tags: ['mechanical', 'light'], requires: ['factory'],
    weapon: { range: 7, minRange: 0, damage: 4, bonus: { biological: 4, armored: -3, structure: -2 }, cooldown: 0.3, projectile: 'bullet', speed: 0, splash: 0, sound: 'heavy_mg' },
    lift: 3,
    desc: 'Fast raider with a machine gun. Strong vs infantry, good for harassing harvesters.',
  },
  tank: {
    name: 'Tank', producer: 'factory', cost: 400, buildTime: 9, hp: 450, speed: 3.8, turnRate: 2.5, radius: 1.1, sight: 13,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory'],
    weapon: { range: 10, minRange: 0, damage: 18, bonus: { mechanical: 22, biological: -6 }, cooldown: 1.4, projectile: 'shell', speed: 32, splash: 0, sound: 'single_shot' },
    lift: 6,
    desc: 'Main battle tank. Crushes vehicles, decent vs buildings, weak vs infantry.',
  },
  rocket: {
    name: 'MLRS', producer: 'factory', cost: 500, buildTime: 11, hp: 200, speed: 3.4, turnRate: 2.5, radius: 1.0, sight: 18,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory2'],
    weapon: { range: 17, minRange: 6, damage: 40, bonus: { biological: 35, structure: 35, air: 25 }, cooldown: 2.8, projectile: 'rocket', speed: 15, splash: 2.5, air: true, unguided: true, sound: 'launch_large' },
    lockOn: { duration: 8, cooldown: 20 },
    lift: 6,
    desc: 'Long-range rocket artillery. Devastating vs infantry and buildings, and shoots down aircraft. Rockets fly at where the target was, so moving units can dodge them; Lock On (D) makes them home in on one target for a while. Fragile and can\'t fire up close.',
  },
  repair: {
    name: 'Repair Vehicle', producer: 'factory', cost: 450, buildTime: 8, hp: 300, speed: 4.2, turnRate: 3.5, radius: 0.9, sight: 10,
    turret: false, infantry: false, tags: ['mechanical', 'light'], weapon: null, requires: ['factory'], lift: 6,
    repair: { rate: 30, range: 2.5 },
    desc: 'Repairs vehicles, aircraft and buildings for credits. Right-click something damaged; repairs anything nearby when idle.',
  },
  carryall: {
    name: 'Carryall', producer: 'hitech', cost: 700, buildTime: 12, hp: 380, speed: 9, turnRate: 2.2, radius: 1.4, sight: 12,
    turret: false, infantry: false, tags: ['mechanical', 'air'], weapon: null, requires: ['hitech'], air: true,
    desc: 'Airlifts a heavy vehicle, two trikes or six infantry. Right-click a unit to pick it up, D to drop. Assigned to a harvester, it ferries it between spice and refinery.',
  },

  // ---- Corrino: health alone beats the Atreides counterpart's, and shields come on top ----
  trooper: {
    name: 'Harkonnen Trooper', producer: 'barracks', cost: 100, buildTime: 5, hp: 100, shields: 60, speed: 2.1, turnRate: 12, radius: 0.45, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks'],
    weapon: { range: 9, minRange: 0, damage: 8, bonus: { armored: 14, structure: -3 }, cooldown: 0.7, projectile: 'rocket', speed: 20, splash: 0, sound: 'launch_small' },
    desc: 'Imperial levy raised from the beaten Harkonnen. Shoulder rockets: strong vs vehicles, and beats trikes by numbers. Weak vs MLRS.',
  },
  sardaukar: {
    name: 'Sardaukar', producer: 'barracks', cost: 300, buildTime: 9, hp: 220, shields: 120, speed: 2.6, turnRate: 12, radius: 0.5, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks2'],
    weapon: { range: 4.5, minRange: 0, damage: 12, bonus: { biological: 24, air: 12, structure: -4 }, cooldown: 0.75, projectile: 'bullet', speed: 0, splash: 0, air: true, sound: 'coax_mg' },
    desc: "The Emperor's elite. Close-quarters fighters: tear through infantry and shoot down aircraft. Weak vs trikes and MLRS.",
  },
  razor: {
    name: 'Razor', producer: 'fab', cost: 250, buildTime: 7, hp: 200, shields: 100, speed: 6, turnRate: 5, radius: 0.85, sight: 11,
    turret: false, infantry: false, tags: ['mechanical', 'light'], requires: ['fab'],
    weapon: { range: 4, minRange: 0, damage: 4, bonus: { biological: 8, armored: -2, structure: -2 }, cooldown: 0.3, projectile: 'bullet', speed: 0, splash: 0, cone: 0.35 },
    desc: 'Dune buggy with a flamethrower that burns everything in front of it. Shreds infantry. Weak vs tanks.',
  },
  devastator: {
    name: 'Devastator', producer: 'fab', cost: 900, buildTime: 16, hp: 900, shields: 400, speed: 2.4, turnRate: 1.6, radius: 1.4, sight: 12,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['tleilaxu', 'fab2'],
    weapon: { range: 10, minRange: 0, damage: 35, bonus: { armored: 65, biological: -15 }, cooldown: 2, projectile: 'shell', speed: 28, splash: 0, sound: 'heavy_laser' },
    holdFire: true,
    secondary: { range: 5, minRange: 0, damage: 4, bonus: { biological: 6, armored: -3, structure: -3 }, cooldown: 0.2, projectile: 'bullet', speed: 0, splash: 0, sound: 'devastator_coax' },
    detonate: { delay: 2.5, weapon: { range: 0, minRange: 0, damage: 500, bonus: { structure: 300 }, cooldown: 0, projectile: 'shell', speed: 0, splash: 9 } },
    desc: "Slow heavy tank. Crushes armor; its machine gun cuts down infantry up close, even on the move, but the main gun only fires standing still. Can self-destruct in a huge blast. Weak vs aircraft and MLRS.",
  },
  raider: {
    name: 'Sky Raider', producer: 'fab', cost: 500, buildTime: 11, hp: 260, shields: 120, speed: 9, turnRate: 3, radius: 1.0, sight: 14,
    turret: false, infantry: false, tags: ['mechanical', 'air'], requires: ['tleilaxu'], air: true,
    weapon: { range: 5, minRange: 0, damage: 12, bonus: { armored: 24, structure: -4 }, cooldown: 1.2, projectile: 'rocket', speed: 22, splash: 0, sound: 'sky_raider_fire' },
    mines: {
      cooldown: 15, trigger: 2.2, max: 12,
      weapon: { range: 0, minRange: 0, damage: 30, bonus: { biological: 90, armored: -10 }, cooldown: 0, projectile: 'shell', speed: 0, splash: 4 },
    },
    desc: 'Light ornithopter for scouting and raids. Rockets strong vs armor. Lays mines that wreck infantry and wear down harvesters. Weak vs anti-air.',
  },
  artillery: {
    name: 'Soulcrusher', producer: 'fab', cost: 650, buildTime: 13, hp: 260, shields: 140, speed: 2.8, turnRate: 2, radius: 1.1, sight: 12,
    turret: true, holdFire: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['tleilaxu'],
    weapon: { range: 8, minRange: 0, damage: 14, bonus: { structure: 12 }, cooldown: 1.5, projectile: 'shell', speed: 26, splash: 0, sound: 'single_shot' },
    deploy: {
      time: 3,
      weapon: { range: 26, minRange: 8, damage: 60, bonus: { structure: 120, biological: 20 }, cooldown: 4.5, projectile: 'shell', speed: 13, splash: 3, unguided: true, sound: 'launch_large' },
    },
    desc: "Self-propelled howitzer with a short gun, and can't fire on the move. Deployed, it shells anything your side can see at long range; the shells are slow and fall where the target was. Brutal on buildings and defenses. Weak vs tanks.",
  },

  // ---- Fremen: cheap, fast infantry that dig into the sand (`hides`), and call wild Sandworms with Thumpers ----
  warrior: {
    name: 'Fremen Warrior', producer: 'barracks', cost: 80, buildTime: 3.5, hp: 70, speed: 3, turnRate: 12, radius: 0.45, sight: 11,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks'], hides: true, thumper: true,
    weapon: { range: 4.5, minRange: 0, damage: 5, bonus: { biological: 5, armored: -4, structure: -2 }, cooldown: 0.55, projectile: 'bullet', speed: 0, splash: 0, air: true, sound: 'light_mg' },
    desc: 'Cheap, fast desert fighter with a maula pistol and a crysknife. Strong vs infantry, can shoot at aircraft. Weak vs vehicles and flamers. With a Sietch, plants Thumpers that call a Sandworm.',
  },
  fedaykin: {
    name: 'Fedaykin', producer: 'barracks', cost: 200, buildTime: 7, hp: 230, speed: 3, turnRate: 12, radius: 0.5, sight: 11,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['sietch'], hides: true, thumper: true,
    weapon: { range: 7, minRange: 0, damage: 10, bonus: { mechanical: 20, armored: 4, structure: 6, biological: -3 }, cooldown: 1, projectile: 'bullet', speed: 0, splash: 0, air: true, pierce: true, sound: 'small_laser' },
    desc: 'Elite fighters with weirding modules: sonic weapons that tear vehicles apart and pass straight through shields. Strong vs vehicles and structures, can shoot at aircraft. Weak vs infantry. Plants Thumpers that call a Sandworm.',
  },
  crew: {
    name: 'Spice Crew', producer: 'barracks', cost: 450, buildTime: 12, hp: 120, speed: 2.6, turnRate: 12, radius: 0.45, sight: 9,
    turret: false, infantry: true, tags: ['biological', 'light'], weapon: null, requires: ['barracks'], hides: true, camp: 'camp',
    desc: 'Unarmed spice hunters. Walk them onto a spice field and Set Up Camp (D): the Spice Camp turns the spice around it into credits. Pack it up again when the spice runs out.',
  },
  mortar: {
    name: 'Fremen Mortar', producer: 'barracks', cost: 250, buildTime: 9, hp: 120, speed: 2.8, turnRate: 12, radius: 0.5, sight: 12,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['sietch2'], hides: true,
    weapon: { range: 4.5, minRange: 0, damage: 5, bonus: { biological: 3, armored: -4, structure: -3 }, cooldown: 0.8, projectile: 'bullet', speed: 0, splash: 0, sound: 'light_mg' },
    deploy: {
      time: 1.5,
      weapon: { range: 12, minRange: 4, damage: 24, bonus: { mechanical: 16, structure: 30, biological: -10 }, cooldown: 1.4, projectile: 'rocket', speed: 16, splash: 1.5, sound: 'launch_small' },
    },
    desc: 'A Fremen with a heavy rocket mortar on his back and a pistol in his belt. On the move he barely fights; set up (D, 1.5 s), he lobs guided rockets at anything your side can see out to 12: strong vs vehicles and structures. Can\'t fire up close, and in the sand he digs in like any Fremen.',
  },
  glider: {
    name: 'Wind Glider', producer: 'barracks', cost: 100, buildTime: 6, hp: 60, speed: 10, turnRate: 2.2, radius: 0.9, sight: 16,
    turret: false, infantry: false, tags: ['light', 'air'], weapon: null, requires: ['sietch'], air: true, glides: { orbit: 8 },
    desc: 'A Fremen rider on a cloth wing, riding the desert winds. The fastest thing in the sky and sees far, but unarmed and frail. It can\'t hover: with nowhere to go, it circles.',
  },
};
