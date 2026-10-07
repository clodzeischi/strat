// The AI plays fair under fog of war: it knows only what its side has seen, so it scouts to find the enemy.
// Usage: npx tsx sim/ai-fog-check.ts [difficulty] [seed]
import * as THREE from 'three';
import { AI, profileFor } from '../src/game/ai';
import type { Team, UnitType } from '../src/config';
import { Game, type Difficulty } from '../src/game/game';

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const difficulty = (process.argv[2] ?? 'normal') as Difficulty;
const seed = Number(process.argv[3] ?? 1003);
const AI_TEAM: Team = 1;
const PLAYER: Team = 0;
console.log(`seed ${seed}, ${difficulty}`);

function setup() {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, seed);
  const ai = new AI(g, AI_TEAM, profileFor(difficulty));
  const step = (seconds: number, until?: () => boolean) => {
    const end = g.time + seconds;
    while (g.time < end && !until?.()) {
      ai.update(0.05);
      g.update(0.05);
    }
  };
  return { g, ai, step };
}

function spawnNear(g: Game, type: UnitType, team: Team, cx: number, cz: number, n: number): void {
  const m = g.map;
  for (let k = 0; k < n; k++) {
    const c = m.nearestCell(cx + (k % 4), cz + Math.floor(k / 4), (x, z) => m.canEnter(x, z, 'vehicle') && !m.occupied[m.idx(x, z)], 10)!;
    g.spawnUnit(type, team, m.center(c.cx), m.center(c.cz));
  }
}

// At the start it knows nothing of the enemy, and sends a scout that finds the base.
{
  const { g, ai, step } = setup();
  step(1);
  check(!ai.intel.baseKnown && ai.intel.units.size === 0, 'at the start the AI knows nothing about the enemy');
  step(120, () => ai.intel.baseKnown);
  check(ai.intel.baseKnown, 'its scout finds the enemy base', `after ${Math.round(g.time)} s`);
  const yard = g.buildings.find((b) => b.team === PLAYER && b.type === 'conyard')!;
  const guess = ai.intel.enemyBase();
  check(Math.hypot(guess.x - yard.x, guess.z - yard.z) < 6, 'and knows where it is');
}

// An army hidden in the player's base doesn't exist for the AI until it's seen.
{
  const { g, ai, step } = setup();
  const yard = g.buildings.find((b) => b.team === PLAYER && b.type === 'conyard')!;
  spawnNear(g, 'tank', PLAYER, yard.cx - 3, yard.cz - 3, 12);
  step(5);
  const hidden = g.units.filter((u) => u.team === PLAYER && u.type === 'tank').length;
  check(ai.intel.armyPower() === 0 && ![...ai.intel.units.values()].some((s) => s.type === 'tank'), `12 tanks parked out of sight in the player's base go unnoticed`, `${hidden} tanks`);
  // Its picks follow what it has seen (nothing yet): it hasn't started massing anti-tank counters.
  step(240, () => [...ai.intel.units.values()].some((s) => s.type === 'tank'));
  check([...ai.intel.units.values()].some((s) => s.type === 'tank'), 'scouting turns them up', `at ${Math.round(g.time)} s, known enemy army ${Math.round(ai.intel.armyPower())}`);
}

// A remembered unit's last spot seen empty: the AI no longer knows where it is (but still counts it).
{
  const { g, ai, step } = setup();
  const home = g.buildings.find((b) => b.team === AI_TEAM && b.type === 'conyard')!;
  spawnNear(g, 'trike', PLAYER, home.cx + 4, home.cz + 4, 1);
  const trike = g.units.find((u) => u.team === PLAYER && u.type === 'trike' && Math.hypot(u.x - home.x, u.z - home.z) < 20)!;
  trike.cooldown = 1e9;
  step(2);
  const seen = ai.intel.units.get(trike.id);
  check(!!seen?.placed, 'a trike driving into the AI base is spotted');
  // Teleport it away out of sight.
  const far = g.buildings.find((b) => b.team === PLAYER && b.type === 'conyard')!;
  trike.x = far.x;
  trike.z = far.z + 6;
  step(2);
  const after = ai.intel.units.get(trike.id);
  check(!!after && !after.placed, 'once it has gone, the AI knows it\'s out there but not where');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
