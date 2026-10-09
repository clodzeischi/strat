// Checks the MLRS: rockets fly at where the target was (a moving target dodges), Lock On makes them home in on one
// target for a while and then recharges, and aircraft are hit regardless (homing). Usage: npx tsx sim/mlrs-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { UNITS, type Team } from '../src/config';
import type { Unit } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const A: Team = 0;
const C: Team = 1;
function arena() {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['atreides', 'corrino']);
  for (const u of [...g.units]) {
    u.hp = 0;
    (g as unknown as { kill(e: unknown, by: null): void }).kill(u, null);
  }
  g.update(0.05);
  const m = g.map;
  const at = (dx: number, dz: number) => {
    const c = m.nearestCell(Math.round(m.size / 2 + dx), Math.round(m.size / 2 + dz), (x, z) => m.canEnter(x, z, 'vehicle'), 20)!;
    return { x: m.center(c.cx), z: m.center(c.cz) };
  };
  const step = (s: number) => {
    for (let t = 0; t < s; t += 0.05) g.update(0.05);
  };
  return { g, at, step };
}

/** Rocket hits on a target crossing in front of an MLRS for a few seconds, with or without a lock. */
function crossing(lock: boolean, moving: boolean): number {
  const { g, at, step } = arena();
  const p = at(-4, 0);
  const mlrs = g.spawnUnit('rocket', A, p.x, p.z, 0);
  const s = at(3, -4);
  const target = g.spawnUnit('razor', C, s.x, s.z);
  target.hp = 1e6;
  target.order = { kind: 'idle' };
  let hits = 0;
  const dmg = g.damage.bind(g);
  (g as { damage: Game['damage'] }).damage = (t, w, mult, by) => {
    if (t === target && by === mlrs) hits++;
    dmg(t, w, mult, by);
  };
  step(0.5);
  if (lock) applyCommand(g, A, { c: 'lock', units: [mlrs.id], target: target.id });
  else mlrs.command(g, { kind: 'attack', target });
  // Drive back and forth across the MLRS's line of fire.
  const ends = [at(3, 4), at(3, -4)];
  let leg = 0;
  for (let t = 0; t < 8; t += 0.05) {
    if (moving && (target.order.kind === 'idle' || target.path.length === 0)) target.command(g, { kind: 'move', ...ends[leg++ % 2] });
    if (!moving) target.order = { kind: 'idle' };
    target.target = null; // it just drives; no shooting back
    step(0.05);
  }
  return hits;
}

const dodged = crossing(false, true);
const parked = crossing(false, false);
const locked = crossing(true, true);
check(dodged <= 1, `a Razor driving across dodges unguided rockets (${dodged} hits)`);
check(parked >= 2, `a parked one doesn't (${parked} hits)`);
check(locked >= 2, `locked on, rockets home in on the moving Razor (${locked} hits)`);

{
  const { g, at, step } = arena();
  const p = at(-4, 0);
  const mlrs = g.spawnUnit('rocket', A, p.x, p.z, 0);
  const s = at(3, 0);
  const t1 = g.spawnUnit('trooper', C, s.x, s.z);
  t1.hp = 1e6;
  step(0.5);
  applyCommand(g, A, { c: 'lock', units: [mlrs.id], target: t1.id });
  check(mlrs.lockTarget === t1 && mlrs.order.kind === 'attack', 'Lock On makes the MLRS attack its target');
  const until = mlrs.lockUntil;
  applyCommand(g, A, { c: 'lock', units: [mlrs.id], target: t1.id });
  check(mlrs.lockUntil === until, 'it has to recharge before locking on again');
  step(UNITS.rocket.lockOn!.cooldown + 0.1);
  applyCommand(g, A, { c: 'lock', units: [mlrs.id], target: t1.id });
  check(mlrs.lockUntil > until, 'and can once it has');
}
{
  const { g, at, step } = arena();
  const p = at(-4, 0);
  g.spawnUnit('rocket', A, p.x, p.z, 0);
  const s = at(2, -3);
  const raider: Unit = g.spawnUnit('raider', C, s.x, s.z);
  raider.hp = 1e6;
  const far = at(2, 4);
  raider.command(g, { kind: 'move', x: far.x, z: far.z });
  const hp = raider.hp + raider.shields;
  step(6);
  check(raider.hp + raider.shields < hp, 'rockets still home in on aircraft without a lock');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
