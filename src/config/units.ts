import type { UnitDef, UnitType } from './types';

export const UNIT_ORDER: UnitType[] = [
  'harvester', 'infantry', 'trike', 'tank', 'rocket', 'repair', 'carryall', 'trooper', 'sardaukar', 'razor', 'devastator', 'raider', 'artillery',
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
    name: 'Rocket Launcher', producer: 'factory', cost: 500, buildTime: 11, hp: 200, speed: 3.4, turnRate: 2.5, radius: 1.0, sight: 18,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['factory2'],
    weapon: { range: 17, minRange: 6, damage: 40, bonus: { biological: 35, structure: 35, air: 25 }, cooldown: 2.8, projectile: 'rocket', speed: 15, splash: 2.5, air: true },
    lift: 6,
    desc: 'Long-range artillery. Devastating vs infantry and buildings, and shoots down aircraft. Fragile and can\'t fire up close.',
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
    weapon: { range: 7, minRange: 0, damage: 9, bonus: { armored: 14, structure: -3 }, cooldown: 0.7, projectile: 'rocket', speed: 20, splash: 0 },
    desc: 'Imperial levy raised from the beaten Harkonnen. Shoulder rockets: strong vs vehicles, and beats trikes by numbers. Weak vs Rocket Launchers.',
  },
  sardaukar: {
    name: 'Sardaukar', producer: 'barracks', cost: 300, buildTime: 9, hp: 220, shields: 120, speed: 2.6, turnRate: 12, radius: 0.5, sight: 10,
    turret: false, infantry: true, tags: ['biological', 'light'], requires: ['barracks2'],
    weapon: { range: 4.5, minRange: 0, damage: 12, bonus: { biological: 24, air: 12, structure: -4 }, cooldown: 0.75, projectile: 'bullet', speed: 0, splash: 0, air: true },
    desc: "The Emperor's elite. Close-quarters fighters: tear through infantry and shoot down aircraft. Weak vs trikes and Rocket Launchers.",
  },
  razor: {
    name: 'Razor', producer: 'fab', cost: 250, buildTime: 7, hp: 200, shields: 100, speed: 6, turnRate: 5, radius: 0.85, sight: 11,
    turret: false, infantry: false, tags: ['mechanical', 'light'], requires: ['fab'],
    weapon: { range: 4, minRange: 0, damage: 5, bonus: { biological: 9, armored: -3, structure: -2 }, cooldown: 0.25, projectile: 'bullet', speed: 0, splash: 0 },
    desc: 'Dune buggy with a flamethrower. Burns infantry. Weak vs tanks.',
  },
  devastator: {
    name: 'Devastator', producer: 'fab', cost: 900, buildTime: 16, hp: 900, shields: 400, speed: 2.4, turnRate: 1.6, radius: 1.4, sight: 12,
    turret: true, infantry: false, tags: ['mechanical', 'armored'], requires: ['tleilaxu', 'fab2'],
    weapon: { range: 10, minRange: 0, damage: 35, bonus: { armored: 65, biological: -15 }, cooldown: 2, projectile: 'shell', speed: 28, splash: 0 },
    desc: 'Slow heavy tank. Crushes armor. Weak vs aircraft and Rocket Launchers.',
  },
  raider: {
    name: 'Sky Raider', producer: 'fab', cost: 500, buildTime: 11, hp: 260, shields: 120, speed: 9, turnRate: 3, radius: 1.0, sight: 14,
    turret: false, infantry: false, tags: ['mechanical', 'air'], requires: ['tleilaxu'], air: true,
    weapon: { range: 8, minRange: 0, damage: 12, bonus: { armored: 24, structure: -4 }, cooldown: 1.2, projectile: 'rocket', speed: 22, splash: 0 },
    desc: 'Light ornithopter for scouting and raids. Rockets strong vs armor. Weak vs anti-air.',
  },
  artillery: {
    name: 'Artillery', producer: 'fab', cost: 650, buildTime: 13, hp: 260, shields: 140, speed: 2.8, turnRate: 2, radius: 1.1, sight: 12,
    turret: false, infantry: false, tags: ['mechanical', 'armored'], requires: ['tleilaxu'],
    weapon: { range: 8, minRange: 0, damage: 14, bonus: { structure: 12 }, cooldown: 1.5, projectile: 'shell', speed: 26, splash: 0 },
    desc: "Self-propelled howitzer. Can't fire on the move. Brutal on buildings. Weak vs tanks.",
  },
};
