// Checks salvaging: any structure can be torn down for part of its price (bunkers for more), its cells free up
// again, and a side can't salvage its last hub, not even two at once.
// Usage: npx tsx sim/salvage-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, FACTIONS, type BuildingType, type Team } from '../src/config';
import { SALVAGE, type Building } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}
const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['atreides', 'fremen']);
const run = (s: number) => {
  for (let t = 0; t < s; t += 0.05) g.update(0.05);
};
function place(team: Team, type: BuildingType): Building {
  const yard = g.buildings.find((b) => b.team === team && b.type === FACTIONS[g.teams[team].faction].hub)!;
  for (let r = 3; r < 16; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.canPlace(type, team, yard.cx + dx, yard.cz + dz)) return g.placeBuilding(type, team, yard.cx + dx, yard.cz + dz);
    }
  }
  throw new Error(`no room for ${type}`);
}
const A: Team = 0;
const F: Team = 1;

const barracks = place(A, 'barracks');
let before = g.teams[A].credits;
applyCommand(g, A, { c: 'salvage', buildings: [barracks.id] });
run(SALVAGE.time + 0.5);
check(barracks.dead && !g.buildings.includes(barracks), 'a Barracks can be salvaged');
check(Math.abs(g.teams[A].credits - before - BUILDINGS.barracks.cost * SALVAGE.refund) < 1, `for ${SALVAGE.refund * 100}% of its price`);
check(g.canPlace('barracks', A, barracks.cx, barracks.cz), 'and its spot can be built on again');

const bunker = place(A, 'bunker');
before = g.teams[A].credits;
applyCommand(g, A, { c: 'salvage', buildings: [bunker.id] });
run(SALVAGE.time + 0.5);
check(Math.abs(g.teams[A].credits - before - BUILDINGS.bunker.cost * SALVAGE.bunker) < 1, `a bunker gives back ${SALVAGE.bunker * 100}%`);

const yard = g.buildings.find((b) => b.team === A && b.type === 'conyard')!;
applyCommand(g, A, { c: 'salvage', buildings: [yard.id] });
run(SALVAGE.time + 0.5);
check(!yard.dead && yard.salvage === null && !!g.salvageBlock(yard), 'the last Construction Yard cannot be salvaged');
const yard2 = place(A, 'conyard');
applyCommand(g, A, { c: 'salvage', buildings: [yard.id, yard2.id] });
run(SALVAGE.time + 0.5);
check(g.count(A, 'conyard') === 1, 'salvaging both of two yards at once leaves one');

const sietch = g.buildings.find((b) => b.team === F && b.type === 'sietch')!;
applyCommand(g, F, { c: 'salvage', buildings: [sietch.id] });
run(SALVAGE.time + 0.5);
check(!sietch.dead, 'nor can the last Sietch');

console.log(failures ? `\n${failures} failed` : '\nall ok');
process.exit(failures ? 1 : 0);
