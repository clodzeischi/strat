import type { UnitDef, UnitType } from './types';

export const UNIT_ORDER: UnitType[] = [
  'harvester', 'infantry', 'trike', 'tank', 'rocket', 'repair', 'carryall', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery',
  'warrior', 'fedaykin', 'commando', 'crew', 'worm',
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
    weapon: { range: 6, minRange: 0, damage: 5, bonus: { biological: 5, armored: -4, structure: -3 }, cooldown: 0.6, projectile: 'bullet', speed: 0, splash: 0, air: true },
    antiArmor: { range: 8, minRange: 0, damage: 6, bonus: { armored: 22, structure: -2 }, cooldown: 1.5, projectile: 'rocket', speed: 18, splash: 0, air: true },
    lift: 1,
    desc: 'Cheap rifle squad. Strong vs infantry. With Infantry Rockets, devastating vs armor. Can shoot at aircraft.',
  },
  trike: {
    name: 'Trike', producer: 'factory', cost: 150, buildTime: 5, hp: 140, speed: 7.5, turnRate: 6, radius: 0.8, sight: 12,
    turret: false, infantry: false, tags: ['mechanical', 'light'], requires: ['factory'],
    weapon: { range: 7, minRange: 0, damage: 4, bonus: { biological: 4, armored: -3, structure: -2 }, cooldown: 0.3, projectile: 'bullet', speed: 0, splash: 0 },
    lift: 3,
    desc: 'Fast raider with a machine gun. Strong vs infantry, good for harassing harvesters.',
  },
  tank: {
    name: 'Tank', producer: 'factory', cost: 400, buildTime: 9, hp: 450, speed: 3.8, turnRate: 2.5, radius: 1.1, sight: 13,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory'],
    weapon: { range: 10, minRange: 0, damage: 18, bonus: { mechanical: 22, biological: -6 }, cooldown: 1.4, projectile: 'shell', speed: 32, splash: 0 },
    lift: 6,
    desc: 'Main battle tank. Crushes vehicles, decent vs buildings, weak vs infantry.',
  },
  rocket: {
    name: 'MLRS', producer: 'factory', cost: 500, buildTime: 11, hp: 200, speed: 3.4, turnRate: 2.5, radius: 1.0, sight: 18,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory2'],
    weapon: { range: 17, minRange: 6, damage: 40, bonus: { biological: 35, structure: 35, air: 25 }, cooldown: 2.8, projectile: 'rocket', speed: 15, splash: 2.5, air: true, unguided: true },
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
    weapon: { range: 9, minRange: 0, damage: 8, bonus: { armored: 14, structure: -3 }, cooldown: 0.7, projectile: 'rocket', speed: 20, splash: 0 },
    desc: 'Imperial levy raised from the beaten Harkonnen. Shoulder rockets: strong vs vehicles, and beats trikes by numbers. Weak vs MLRS.',
  },
  sardaukar: {
    name: 'Sardaukar', producer: 'barracks', cost: 300, buildTime: 9, hp: 220, shields: 120, speed: 2.6, turnRate: 12, radius: 0.5, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks2'],
    weapon: { range: 4.5, minRange: 0, damage: 12, bonus: { biological: 24, air: 12, structure: -4 }, cooldown: 0.75, projectile: 'bullet', speed: 0, splash: 0, air: true },
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
    weapon: { range: 10, minRange: 0, damage: 35, bonus: { armored: 65, biological: -15 }, cooldown: 2, projectile: 'shell', speed: 28, splash: 0 },
    holdFire: true,
    secondary: { range: 5, minRange: 0, damage: 4, bonus: { biological: 6, armored: -3, structure: -3 }, cooldown: 0.2, projectile: 'bullet', speed: 0, splash: 0 },
    detonate: { delay: 2.5, weapon: { range: 0, minRange: 0, damage: 500, bonus: { structure: 300 }, cooldown: 0, projectile: 'shell', speed: 0, splash: 9 } },
    desc: "Slow heavy tank. Crushes armor; its machine gun cuts down infantry up close, even on the move, but the main gun only fires standing still. Can self-destruct in a huge blast. Weak vs aircraft and MLRS.",
  },
  raider: {
    name: 'Sky Raider', producer: 'fab', cost: 500, buildTime: 11, hp: 260, shields: 120, speed: 9, turnRate: 3, radius: 1.0, sight: 14,
    turret: false, infantry: false, tags: ['mechanical', 'air'], requires: ['tleilaxu'], air: true,
    weapon: { range: 5, minRange: 0, damage: 12, bonus: { armored: 24, structure: -4 }, cooldown: 1.2, projectile: 'rocket', speed: 22, splash: 0 },
    mines: {
      cooldown: 15, trigger: 2.2, max: 12,
      weapon: { range: 0, minRange: 0, damage: 30, bonus: { biological: 90, armored: -10 }, cooldown: 0, projectile: 'shell', speed: 0, splash: 4 },
    },
    desc: 'Light ornithopter for scouting and raids. Rockets strong vs armor. Lays mines that wreck infantry and wear down harvesters. Weak vs anti-air.',
  },
  artillery: {
    name: 'Soulcrusher', producer: 'fab', cost: 650, buildTime: 13, hp: 260, shields: 140, speed: 2.8, turnRate: 2, radius: 1.1, sight: 12,
    turret: true, holdFire: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['tleilaxu'],
    weapon: { range: 8, minRange: 0, damage: 14, bonus: { structure: 12 }, cooldown: 1.5, projectile: 'shell', speed: 26, splash: 0 },
    deploy: {
      time: 3,
      weapon: { range: 26, minRange: 8, damage: 60, bonus: { structure: 120, biological: 20 }, cooldown: 4.5, projectile: 'shell', speed: 13, splash: 3, unguided: true },
    },
    desc: "Self-propelled howitzer with a short gun, and can't fire on the move. Deployed, it shells anything your side can see at long range; the shells are slow and fall where the target was. Brutal on buildings and defenses. Weak vs tanks.",
  },

  // ---- Fremen: cheap, fast infantry that dig into the sand (`hides`); the Sandworm is the one big thing ----
  warrior: {
    name: 'Fremen Warrior', producer: 'barracks', cost: 75, buildTime: 3.5, hp: 70, speed: 3, turnRate: 12, radius: 0.45, sight: 11,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks'], hides: true,
    weapon: { range: 4.5, minRange: 0, damage: 5, bonus: { biological: 5, armored: -4, structure: -2 }, cooldown: 0.55, projectile: 'bullet', speed: 0, splash: 0, air: true },
    desc: 'Cheap, fast desert fighter with a maula pistol and a crysknife. Strong vs infantry, can shoot at aircraft. Weak vs vehicles and flamers.',
  },
  fedaykin: {
    name: 'Fedaykin', producer: 'barracks', cost: 200, buildTime: 7, hp: 230, speed: 3, turnRate: 12, radius: 0.5, sight: 11,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['sietch'], hides: true,
    weapon: { range: 7, minRange: 0, damage: 10, bonus: { mechanical: 20, armored: 4, structure: 6, biological: -3 }, cooldown: 1, projectile: 'bullet', speed: 0, splash: 0, air: true, pierce: true },
    desc: 'Elite fighters with weirding modules: sonic weapons that tear vehicles apart and pass straight through shields. Strong vs vehicles and structures, can shoot at aircraft. Weak vs infantry.',
  },
  commando: {
    name: 'Death Commando', producer: 'barracks', cost: 125, buildTime: 5, hp: 120, speed: 4, turnRate: 12, radius: 0.45, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['sietch'], hides: true,
    weapon: { range: 2.5, minRange: 0, damage: 60, bonus: { structure: 200, mechanical: 40 }, cooldown: 1, projectile: 'bullet', speed: 0, splash: 4, suicide: true },
    desc: 'Runs up to its target and blows itself up, wrecking everything around it. Devastating vs structures, defenses and packed armies. Has to get there first.',
  },
  crew: {
    name: 'Spice Crew', producer: 'barracks', cost: 400, buildTime: 9, hp: 120, speed: 2.6, turnRate: 12, radius: 0.45, sight: 9,
    turret: false, infantry: true, tags: ['biological', 'light'], weapon: null, requires: ['barracks'], hides: true, camp: 'camp',
    desc: 'Unarmed spice hunters. Walk them onto a spice field and Set Up Camp (D): the Spice Camp turns the spice around it into credits. Pack it up again when the spice runs out.',
  },
  worm: {
    name: 'Sandworm', producer: 'thumper', cost: 1500, buildTime: 30, hp: 2400, speed: 5, turnRate: 1.6, radius: 1.6, sight: 12,
    turret: false, infantry: false, tags: ['biological', 'armored'], requires: ['thumper'], sandOnly: true, limit: 2,
    weapon: { range: 3.4, minRange: 0, damage: 120, bonus: { mechanical: 120, structure: -80 }, cooldown: 2.2, projectile: 'bullet', speed: 0, splash: 2.5 },
    desc: 'Shai-Hulud, ridden by Fremen. Huge and fast, swallows whatever is in front of it, vehicles above all. Only travels on sand and spice: it can\'t follow anyone onto rock. At most two.',
  },
};
