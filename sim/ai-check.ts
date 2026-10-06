// AI behavior checks: defense sized to the attack, defenders returning home, economy recovery and surrender.
// The AI plays team 1 alone for a few minutes; the scenario then spawns attackers or destroys its buildings.
// Usage: npx tsx sim/ai-check.ts [seed]      DIFFICULTY=hard checks the Hard profile.
import * as THREE from 'three';
import { AI, profileFor } from '../src/game/ai';
import { TILE, type Team } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';
import { Building, type Entity, type Unit } from '../src/entities';

const SEED = Number(process.argv[2] ?? 7);
const AI_TEAM: Team = 1;
const PLAYER_TEAM: Team = 0;
const DIFFICULTY = (process.env.DIFFICULTY ?? 'normal') as Difficulty;
type Brain = { update(dt: number): void };

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

interface Setup { g: Game; ai: Brain; offers: number }

/** A game where only the AI plays, for `warmup` seconds. The player's base can't be destroyed and has no units. */
function setup(warmup = 420, waves = false): Setup {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, SEED);
  const ai: Brain = new AI(g, AI_TEAM, profileFor(DIFFICULTY));
  const s: Setup = { g, ai, offers: 0 };
  g.onSurrenderOffer = () => s.offers++;
  for (const b of g.buildings) if (b.team === PLAYER_TEAM) b.hp = b.maxHp = 1e9;
  for (const u of g.units) if (u.team === PLAYER_TEAM) kill(g, u);
  // No attacks of its own (Hard attacks whenever it's stronger, and the player here has no army), so the army stays home.
  if (!waves) Object.assign(ai, { nextWaveTime: Infinity, nextRaidTime: Infinity, profile: { ...profileFor(DIFFICULTY), initiative: 0 } });
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
 * Tracks which AI combat units respond while the attack lasts: ordered to move or attack toward an attacker, or
 * shooting at one.
 */
function responders(s: Setup, attackers: Unit[], seconds: number, r = 12 * TILE): { units: Set<Unit>; time: number } {
  const units = new Set<Unit>();
  let next = 0;
  const t0 = s.g.time;
  run(s, seconds, () => {
    if (s.g.time >= next) {
      next = s.g.time + 0.25;
      const live = attackers.filter((a) => !a.dead);
      for (const u of army(s.g, AI_TEAM)) {
        const o = u.order;
        const goal = o.kind === 'amove' || o.kind === 'move' ? o : o.kind === 'attack' ? o.target : null;
        if ((goal && live.some((a) => dist(a, goal) < r)) || (u.target && live.includes(u.target as Unit))) units.add(u);
      }
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
  const home = conyard(s.g);
  const strays = army(s.g, AI_TEAM).filter((u) => dist(u, home) > 16 * TILE);
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
    const strays = army(s.g, AI_TEAM).filter((u) => dist(u, home) > 16 * TILE);
    check(strays.length === 0, 'after the attack, the defenders return', `${strays.length} still out`);
  }
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
  for (const u of army(s.g, AI_TEAM).slice(3)) kill(s.g, u); // the army was lost along with the base
  s.g.teams[AI_TEAM].credits = 300;
  const player = s.g.buildings.find((b) => b.team === PLAYER_TEAM)!;
  for (let k = 0; k < 8; k++) s.g.spawnUnit('tank', PLAYER_TEAM, player.x + 6 + (k % 4) * 2, player.z + 6 + Math.floor(k / 4) * 2);
  const t0 = s.g.time;
  run(s, 60, () => s.offers > 0);
  check(s.offers === 1, 'crippled AI offers to surrender', s.offers ? `after ${Math.round(s.g.time - t0)}s` : 'no offer');
  run(s, 120);
  check(s.offers === 1 && s.g.winner === null, 'turned down: no second offer, game goes on');
  s.g.acceptSurrender(AI_TEAM);
  check(s.g.winner === PLAYER_TEAM && s.g.surrendered === AI_TEAM, 'accepting ends the game as a win');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
