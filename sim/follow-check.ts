// Checks following: units right-clicked onto one of ours follow it (and fight near it), rally points set on a unit go
// with it and send new units after it, Sardaukar pods land on it, and the rally point resets once the unit dies.
// Usage: npx tsx sim/follow-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, TILE, UNITS, type BuildingType, type Team } from '../src/config';
import type { Building, Unit } from '../src/entities';
import { hypot } from '../src/game/hypot';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['corrino', 'atreides']);
// All on one level, so following is checked on open ground rather than through whichever ramps the map has.
g.map.level.fill(0);
g.map.ramp.fill(0);
const run = (seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds; t += 0.05) {
    g.update(0.05);
    each?.();
  }
};
const C: Team = 0;
function place(team: Team, type: BuildingType): Building {
  const yard = g.buildings.find((b) => b.team === team && b.type === 'conyard')!;
  for (let r = 3; r < 14; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.canPlace(type, team, yard.cx + dx, yard.cz + dz)) return g.placeBuilding(type, team, yard.cx + dx, yard.cz + dz);
    }
  }
  throw new Error(`no room for ${type}`);
}
const dist = (a: Unit, b: Unit) => hypot(a.x - b.x, a.z - b.z);
const yard = g.buildings.find((b) => b.team === C && b.type === 'conyard')!;
const open = (dx: number, dz: number) => {
  const c = g.map.nearestCell(g.map.cellOf(yard.x + dx * TILE), g.map.cellOf(yard.z + dz * TILE), (cx, cz) => g.map.canEnter(cx, cz, 'vehicle'), 12)!;
  return { x: g.map.center(c.cx), z: g.map.center(c.cz) };
};

// Right-click on one of ours: the others follow it as it moves.
const p0 = open(8, 8);
const lead = g.spawnUnit('trooper', C, p0.x, p0.z, 0);
const followers = [0, 1, 2].map((i) => g.spawnUnit('trooper', C, p0.x - (2 + i) * TILE, p0.z, 0));
applyCommand(g, C, { c: 'go', units: [lead.id, ...followers.map((u) => u.id)], x: lead.x, z: lead.z, target: lead.id, attack: false });
check(followers.every((u) => u.order.kind === 'follow') && lead.order.kind !== 'follow', 'right-clicking our own unit makes the others follow it');
const far = open(8, -8);
applyCommand(g, C, { c: 'go', units: [lead.id], x: far.x, z: far.z, target: null, attack: false });
let maxGap = 0;
run(25, () => (maxGap = Math.max(maxGap, ...followers.map((u) => dist(u, lead)))));
check(followers.every((u) => dist(u, lead) < 4 * TILE && u.order.kind === 'follow'), `followers keep up and stay with it (now ${followers.map((u) => (dist(u, lead) / TILE).toFixed(1)).join(', ')} tiles; at most ${(maxGap / TILE).toFixed(1)})`);

// Rally point on a unit: it goes with the unit, new units follow it; Sardaukar pods come down on it.
g.teams[C].credits = 100000;
const barracks = place(C, 'barracks');
place(C, 'tleilaxu');
applyCommand(g, C, { c: 'rally', buildings: [barracks.id], x: 0, z: 0, target: lead.id });
check(barracks.rallyUnit === lead && !barracks.rallyDefault, 'a rally point can be set on a unit');
applyCommand(g, C, { c: 'train', type: 'trooper' });
run(UNITS.trooper.buildTime + 1);
const made = g.units.filter((u) => u.team === C && u.type === 'trooper' && u.id > followers[2].id);
check(made.length === 1 && made[0].order.kind === 'follow' && (made[0].order as { target: Unit }).target === lead, 'a new unit from that building follows the unit');
check(hypot(barracks.rally!.x - lead.x, barracks.rally!.z - lead.z) < 0.01, 'the rally point is where the unit is');
run(25);
check(dist(made[0], lead) < 4 * TILE, `and gets to it (${(dist(made[0], lead) / TILE).toFixed(1)} tiles)`);

applyCommand(g, C, { c: 'levelUp', type: 'barracks' });
run(BUILDINGS.barracks.levels![0].time + 1);
applyCommand(g, C, { c: 'train', type: 'sardaukar' });
run(UNITS.sardaukar.buildTime + 3);
const sard = g.units.find((u) => u.team === C && u.type === 'sardaukar');
check(!!sard && dist(sard, lead) < 6 * TILE && sard.order.kind === 'follow', `Sardaukar drop in by pod on the unit and follow it (${sard ? (dist(sard, lead) / TILE).toFixed(1) : '-'} tiles)`);

// The unit dies: followers stop, the rally point resets.
lead.hp = 0;
(g as unknown as { kill(e: Unit, by: null): void }).kill(lead, null);
run(1);
check(barracks.rallyUnit === null && barracks.rallyDefault, 'once the unit dies, the rally point goes back to the default');
check(followers.every((u) => u.order.kind === 'idle'), 'and its followers stop following');
applyCommand(g, C, { c: 'train', type: 'trooper' });
run(UNITS.trooper.buildTime + 1);
const after = g.units.filter((u) => u.team === C && u.type === 'trooper').at(-1)!;
check(after.order.kind !== 'follow', 'new units go to the default rally point');

console.log(failures ? `\n${failures} failed` : '\nall ok');
process.exit(failures ? 1 : 0);
