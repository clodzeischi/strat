// AI behavior checks: defense sized to the attack, defenders returning home, economy recovery and surrender.
// The AI plays team 1 alone for a few minutes; the scenario then spawns attackers or destroys its buildings.
// Usage: npx tsx sim/ai-check.ts [seed]      DIFFICULTY=hard (or brutal) checks that difficulty.
import * as THREE from 'three';
import { profileFor } from '../src/game/ai';
import { BRUTAL_PROFILE, createAI } from '../src/game/brutal';
import { TILE, type Faction, type Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';
import { Building, type Entity, type Unit } from '../src/entities';

const SEED = Number(process.argv[2] ?? 7);
const AI_TEAM: Team = 1;
const PLAYER_TEAM: Team = 0;
const DIFFICULTY = (process.env.DIFFICULTY ?? 'normal') as Difficulty;
type Brain = { update(dt: number): void };
const PROFILE = DIFFICULTY === 'brutal' ? BRUTAL_PROFILE : profileFor(DIFFICULTY);

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

interface Setup { g: Game; ai: Brain; offers: number }

/** A game where only the AI plays, for `warmup` seconds. The player's base can't be destroyed and has no units. */
function setup(warmup = 420, waves = false, aiFaction: Faction = 'atreides'): Setup {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, SEED, ['atreides', aiFaction]);
  const ai: Brain = createAI(g, AI_TEAM, DIFFICULTY);
  const s: Setup = { g, ai, offers: 0 };
  g.onSurrenderOffer = () => s.offers++;
  for (const b of g.buildings) if (b.team === PLAYER_TEAM) Object.assign(b, { hp: 1e9, maxHp: 1e9 });
  for (const u of g.units) if (u.team === PLAYER_TEAM) kill(g, u);
  // No attacks or scouting runs of its own (Hard attacks whenever it's stronger, and the player here has no army), so
  // the army stays home.
  if (!waves) Object.assign(ai, { nextWaveTime: Infinity, nextRaidTime: Infinity, nextScoutTime: Infinity, profile: { ...PROFILE, initiative: 0 } });
  run(s, warmup);
  return s;
}

function run(s: Setup, seconds: number, until?: () => boolean): number {
  const end = s.g.time + seconds;
  while (s.g.time < end && s.g.winner === null) {
    s.g.update(0.05);
    s.ai.update(0.05);
    if (until?.()) break;
  }
  return s.g.time;
}

function kill(g: Game, e: Entity): void {
  e.hp = 0;
  (g as unknown as { kill(e: Entity, by: null): void }).kill(e, null);
}

const army = (g: Game, team: Team) => g.units.filter((u) => u.team === team && u.def.weapon && !u.carrier);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Where the AI's units gather at home. */
const rallyOf = (s: Setup) => (s.ai as unknown as { rally: { x: number; z: number } }).rally;
const conyard = (g: Game) => g.buildings.find((b) => b.team === AI_TEAM && b.type === 'conyard')!;

/** Spawns player units `tiles` away from `near`, on the side facing the map center, attack-moving onto it. */
function spawnAttackers(g: Game, type: Unit['type'], n: number, near: Entity, tiles: number): Unit[] {
  const mid = g.map.worldSize() / 2;
  const len = Math.hypot(mid - near.x, mid - near.z) || 1;
  const x = near.x + ((mid - near.x) / len) * tiles * TILE;
  const z = near.z + ((mid - near.z) / len) * tiles * TILE;
  const units: Unit[] = [];
  for (let k = 0; k < n; k++) {
    const c = g.map.nearestCell(g.map.cellOf(x) + (k % 3), g.map.cellOf(z) + Math.floor(k / 3), (cx, cz) => g.map.canEnter(cx, cz, 'vehicle'), 10)!;
    const u = g.spawnUnit(type, PLAYER_TEAM, g.map.center(c.cx), g.map.center(c.cz));
    u.command(g, near instanceof Building ? { kind: 'amove', x: near.x, z: near.z } : { kind: 'attack', target: near });
    units.push(u);
  }
  return units;
}

/**
 * Tracks which AI combat units the AI sends against the attack while it lasts (its defenders). Units that just shoot
 * at an attacker passing within sight of where they stand don't count.
 */
function responders(s: Setup, attackers: Unit[], seconds: number): { units: Set<Unit>; time: number } {
  const roles = (s.ai as unknown as { roles: Map<Unit, string> }).roles;
  const units = new Set<Unit>();
  let next = 0;
  const t0 = s.g.time;
  run(s, seconds, () => {
    if (s.g.time >= next) {
      next = s.g.time + 0.25;
      for (const u of army(s.g, AI_TEAM)) if (roles.get(u) === 'defend') units.add(u);
    }
    return attackers.every((a) => a.dead);
  });
  return { units, time: s.g.time - t0 };
}

/** Runs until a harvester is out on a field far from the base, and returns it. */
function farHarvester(s: Setup, tiles = 15): Unit | null {
  let found: Unit | null = null;
  run(s, 180, () => {
    const home = conyard(s.g);
    found = s.g.units.find((u) => u.team === AI_TEAM && u.type === 'harvester' && u.hstate === 'harvest' && dist(u, home) > tiles * TILE) ?? null;
    return found !== null;
  });
  return found;
}

console.log(`seed ${SEED}, ${DIFFICULTY}\n`);

// 1. A lone trike hunting a harvester draws a few defenders, not the whole army, and they go home afterwards.
{
  const s = setup();
  const harv = farHarvester(s)!;
  const total = army(s.g, AI_TEAM).length;
  const trike = spawnAttackers(s.g, 'trike', 1, harv, 6);
  const r = responders(s, trike, 90);
  check(trike[0].dead, 'trike harassing a harvester is killed', `${Math.round(r.time)}s`);
  check(r.units.size <= 4, 'only a few units respond to one trike', `${r.units.size} of ${total}`);
  run(s, 45);
  const strays = army(s.g, AI_TEAM).filter((u) => dist(u, rallyOf(s)) > 14 * TILE);
  check(strays.length === 0, 'defenders are back home 45s later', `${strays.length} still out`);
}

// 2. A real attack on the base draws everyone at home.
{
  const s = setup();
  const before = army(s.g, AI_TEAM);
  const tanks = spawnAttackers(s.g, 'tank', 6, conyard(s.g), 18);
  const r = responders(s, tanks, 120);
  check(r.units.size >= Math.min(before.length, 6), 'a six-tank attack on the base draws the army', `${r.units.size} of ${before.length} engaged`);
  run(s, 60);
  const home = conyard(s.g);
  if (home) {
    const strays = army(s.g, AI_TEAM).filter((u) => dist(u, rallyOf(s)) > 14 * TILE);
    check(strays.length === 0, 'after the attack, the defenders return', `${strays.length} still out`);
  }
}

// 2b. Kiting: a trike pokes the units at home, then backs off just out of reach, again and again. The defenders
// shouldn't follow it far from the base (they're leashed to the rally point).
{
  const s = setup();
  const rally = (s.ai as unknown as { rally: { x: number; z: number } }).rally;
  const home = conyard(s.g);
  const player = s.g.buildings.find((b) => b.team === PLAYER_TEAM)!;
  const kiter = spawnAttackers(s.g, 'trike', 1, home, 16)[0];
  Object.assign(kiter, { hp: 1e6, maxHp: 1e6 }); // it only needs to keep the bait going
  let farthest = 0;
  let next = 0;
  run(s, 120, () => {
    if (s.g.time >= next) {
      next = s.g.time + 0.5;
      const near = Math.min(...army(s.g, AI_TEAM).map((u) => dist(u, kiter)));
      // Within their reach: run toward our own base; well clear: come back for another poke.
      if (near < 10 * TILE) kiter.command(s.g, { kind: 'move', x: player.x, z: player.z });
      else if (near > 14 * TILE) kiter.command(s.g, { kind: 'amove', x: rally.x, z: rally.z });
      for (const u of army(s.g, AI_TEAM)) farthest = Math.max(farthest, dist(u, rally));
    }
    return false;
  });
  // The leash is 22 tiles from the rally point, plus however far a unit gets before the next think calls it back.
  check(farthest < 28 * TILE, 'a kiting trike can\'t drag the defenders far from the base', `farthest ${Math.round(farthest / TILE)} tiles from the rally point`);
}

// 3. Losing every harvester: income comes back before the army grows.
{
  const s = setup();
  for (const u of s.g.units.filter((u) => u.team === AI_TEAM && u.type === 'harvester')) kill(s.g, u);
  const credits = Math.round(s.g.teams[AI_TEAM].credits);
  const t0 = s.g.time;
  const spice0 = s.g.teams[AI_TEAM].stats.spiceHarvested;
  run(s, 60, () => s.g.count(AI_TEAM, 'harvester') >= 1);
  check(s.g.count(AI_TEAM, 'harvester') >= 1, 'all harvesters lost: the first is back within a minute', `${Math.round(s.g.time - t0)}s, had ${credits} credits`);
  run(s, 180, () => s.g.count(AI_TEAM, 'harvester') >= 2);
  check(s.g.count(AI_TEAM, 'harvester') >= 2, 'and the second within 4 minutes', `${Math.round(s.g.time - t0)}s`);
  run(s, 120);
  check(s.g.teams[AI_TEAM].stats.spiceHarvested - spice0 > 1000, 'and they are harvesting again', `${Math.round(s.g.teams[AI_TEAM].stats.spiceHarvested - spice0)} spice in 4 min`);
}

// 4. Losing the harvesters and the factory with 1300 credits: a new refinery (with its free harvester) is the
// one way back that's affordable (a factory plus a harvester costs 1800).
{
  const s = setup();
  for (const e of [...s.g.units, ...s.g.buildings]) {
    if (e.team === AI_TEAM && ((e as Unit).type === 'harvester' || (e as Building).type === 'factory')) kill(s.g, e);
  }
  s.g.teams[AI_TEAM].credits = 1300;
  const t0 = s.g.time;
  run(s, 90, () => s.g.count(AI_TEAM, 'harvester') >= 1);
  check(s.g.count(AI_TEAM, 'harvester') >= 1, 'harvesters and factory lost: a refinery brings a harvester back', `${Math.round(s.g.time - t0)}s`);
}

// 5. A healthy AI never offers to surrender.
{
  const s = setup(900, true);
  check(s.offers === 0, 'no surrender offer from a healthy AI over 15 minutes');
}

// 6. Production and income gone, facing a real army: offers to surrender once, and fights on if refused.
{
  const s = setup();
  for (const e of [...s.g.units, ...s.g.buildings]) {
    if (e.team !== AI_TEAM) continue;
    const t = (e as Unit | Building).type;
    if (t === 'conyard' || t === 'factory' || t === 'barracks' || t === 'refinery' || t === 'harvester') kill(s.g, e);
  }
  // The army was lost along with the base, bunkered infantry included.
  for (const u of s.g.units.filter((u) => u.team === AI_TEAM && u.def.weapon).slice(3)) kill(s.g, u);
  s.g.teams[AI_TEAM].credits = 300;
  // The army that did it is still there, in the AI's sight (it only knows what it sees). It holds its fire, so the
  // AI isn't wiped out before it gets to answer.
  const left = s.g.buildings.find((b) => b.team === AI_TEAM) ?? army(s.g, AI_TEAM)[0];
  for (const t of spawnAttackers(s.g, 'tank', 8, left, 8)) t.cooldown = 1e9;
  const t0 = s.g.time;
  run(s, 60, () => s.offers > 0);
  check(s.offers === 1, 'crippled AI offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s` : 'no offer');
  run(s, 120);
  check(s.offers === 1 && s.g.winner === null, 'turned down: no second offer, game goes on');
  s.g.acceptSurrender(AI_TEAM);
  check(s.g.winner === PLAYER_TEAM && s.g.surrendered === AI_TEAM, 'accepting ends the game as a win');
}

// 6b-6e. The reasons to give up, each on its own (see SURRENDER in ai.ts). The player's army is in the AI's sight,
// holding its fire, so it knows what it's up against and isn't wiped out before it can offer.
/** Kills the AI's things that `doomed` picks, keeps `armed` armed units, and parks `n` of the player's tanks by `near`. */
function wreck(s: Setup, doomed: (e: Unit | Building) => boolean, armed: number, n: number, near: () => Entity | undefined): void {
  const armies = new Set<Entity>(army(s.g, AI_TEAM));
  for (const e of [...s.g.units, ...s.g.buildings]) if (e.team === AI_TEAM && !armies.has(e) && doomed(e as Unit | Building)) kill(s.g, e);
  for (const u of army(s.g, AI_TEAM).slice(armed)) kill(s.g, u);
  const at = near() ?? army(s.g, AI_TEAM)[0];
  // Packed round the spot, 5-9 tiles out, so they're all in its sight.
  const m = s.g.map;
  const cells: { cx: number; cz: number }[] = [];
  for (let r = 5; r <= 9 && cells.length < n; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = m.cellOf(at.x) + dx;
      const cz = m.cellOf(at.z) + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && (dx + dz) % 2 === 0 && m.inBounds(cx, cz) && m.canEnter(cx, cz, 'vehicle')) cells.push({ cx, cz });
    }
  }
  for (const c of cells.slice(0, n)) {
    const t = s.g.spawnUnit('tank', PLAYER_TEAM, m.center(c.cx), m.center(c.cz));
    t.cooldown = 1e9;
    t.command(s.g, { kind: 'hold' });
  }
}

// Base razed, but a refinery and its harvesters still earning: income doesn't keep it in a lost game.
{
  const s = setup();
  wreck(s, (e) => ['conyard', 'factory', 'barracks', 'hitech', 'bunker', 'turret'].includes(e.type), 3, 8, () => s.g.buildings.find((b) => b.team === AI_TEAM && b.type === 'refinery'));
  const t0 = s.g.time;
  run(s, 90, () => s.offers > 0);
  check(s.offers === 1 && s.g.count(AI_TEAM, 'harvester') > 0, 'base razed, harvesters still working: offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s` : 'no offer');
}

// Fremen with the Sietch and everything that trains units gone, one Spice Camp left across the map.
{
  const s = setup(420, false, 'fremen');
  const camps = s.g.buildings.filter((b) => b.team === AI_TEAM && b.type === 'camp');
  wreck(s, (e) => e !== camps[camps.length - 1], 2, 8, () => camps[camps.length - 1]);
  const t0 = s.g.time;
  run(s, 90, () => s.offers > 0);
  check(s.offers === 1, 'Fremen down to a far Spice Camp: offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s, ${camps.length} camp(s) at the start` : 'no offer');
}

// Starved: the base stands, but no harvester, no refinery and no credits to buy either back.
{
  const s = setup();
  wreck(s, (e) => e.type === 'harvester' || e.type === 'refinery', 3, 8, () => conyard(s.g));
  s.g.teams[AI_TEAM].credits = 0;
  const t0 = s.g.time;
  run(s, 240, () => s.offers > 0);
  check(s.offers === 1 && s.g.hasHub(AI_TEAM), 'starved, base still standing: offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s` : 'no offer');
  // Turned down; then it loses its Construction Yard too, and asks again (two minutes after the first offer at the soonest).
  const t1 = s.g.time;
  kill(s.g, conyard(s.g));
  run(s, 180, () => s.offers > 1);
  check(s.offers === 2 && s.g.time - t1 >= 115, 'turned down, then the yard lost: offers again', s.offers > 1 ? `${Math.round(s.g.time - t1)}s after the first` : 'no second offer');
}

// Overwhelmed: a hub and a working refinery left, but up against many times its worth, an army it can't dent.
{
  const s = setup();
  wreck(s, (e) => !['conyard', 'refinery', 'harvester'].includes(e.type), 0, 70, () => conyard(s.g));
  for (const u of s.g.units) if (u.team === PLAYER_TEAM) Object.assign(u, { hp: 1e6, maxHp: 1e6 });
  const t0 = s.g.time;
  run(s, 150, () => s.offers > 0);
  check(s.offers === 1 && s.g.hasHub(AI_TEAM), 'overwhelmed with its economy running: offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s` : 'no offer');
}

// 7-8. Hard keeps its army alive: vehicles back from a fight get repaired at home (nobody leaves a fight for it),
// and an outmatched wave pulls back.
if (PROFILE.sustain.repairPer) {
  {
    const s = setup();
    const a = s.ai as unknown as { roles: Map<Unit, string>; rally: { x: number; z: number } };
    if (!s.g.count(AI_TEAM, 'repair')) s.g.spawnUnit('repair', AI_TEAM, a.rally.x, a.rally.z);
    // A tank back from defending, idle a few tiles from the rally point, and one still out on a wave.
    const near = s.g.map.nearestCell(s.g.map.cellOf(a.rally.x) + 5, s.g.map.cellOf(a.rally.z) + 5, (cx, cz) => s.g.map.canEnter(cx, cz, 'vehicle'), 10)!;
    const back = s.g.spawnUnit('tank', AI_TEAM, s.g.map.center(near.cx), s.g.map.center(near.cz));
    const mid = s.g.map.nearestCell(s.g.map.cellOf(s.g.map.worldSize() / 2), s.g.map.cellOf(s.g.map.worldSize() / 2), (cx, cz) => s.g.map.canEnter(cx, cz, 'vehicle'), 20)!;
    const out = s.g.spawnUnit('tank', AI_TEAM, s.g.map.center(mid.cx), s.g.map.center(mid.cz));
    back.hp = back.maxHp * 0.2;
    out.hp = out.maxHp * 0.2;
    // The one out on the field is part of a wave, attack-moving on the enemy base.
    a.roles.set(out, 'wave');
    const enemy = s.g.buildings.find((b) => b.team === PLAYER_TEAM)!;
    out.command(s.g, { kind: 'amove', x: enemy.x, z: enemy.z });
    const t0 = s.g.time;
    let left = false;
    run(s, 60, () => {
      left ||= a.roles.get(out) !== 'wave';
      return back.hp >= back.maxHp * 0.9;
    });
    check(back.hp >= back.maxHp * 0.9, 'a damaged tank back home gets repaired', `${Math.round((100 * back.hp) / back.maxHp)}% health after ${Math.round(s.g.time - t0)}s`);
    check(!left && out.order.kind !== 'move', 'a damaged tank on a wave stays in the fight');
  }
  {
    const s = setup();
    const a = s.ai as unknown as { roles: Map<Unit, string>; waves: { units: Set<Unit>; start: number; economy: boolean }[] };
    const player = s.g.buildings.find((b) => b.team === PLAYER_TEAM)!;
    for (let k = 0; k < 8; k++) s.g.spawnUnit('tank', PLAYER_TEAM, player.x + 6 + (k % 4) * 2, player.z + 6 + Math.floor(k / 4) * 2);
    const wave = new Set<Unit>();
    for (let k = 0; k < 3; k++) {
      const u = s.g.spawnUnit('tank', AI_TEAM, player.x + 30, player.z + 30 + k * 2);
      a.roles.set(u, 'wave');
      wave.add(u);
      u.command(s.g, { kind: 'amove', x: player.x, z: player.z });
    }
    a.waves.push({ units: wave, start: 3 * 400, economy: false });
    run(s, 15);
    const back = [...wave].filter((u) => !u.dead && a.roles.get(u) === 'home').length;
    check(back === [...wave].filter((u) => !u.dead).length && back > 0, 'a three-tank wave facing eight tanks pulls back', `${back} of 3 heading home`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
