// Checks the faction hub and building levels: Fremen start with a Sietch and no Construction Yard, the Sietch builds
// their structures and goes up three levels, a second Sietch starts at level 1 and keeps the tech when the first one
// falls, no hub means no building; Atreides and Corrino keep their yards and two levels.
// Usage: npx tsx sim/sietch-check.ts
import * as THREE from 'three';
import { Game } from '../src/game/game';
import { applyCommand } from '../src/game/commands';
import { BUILDINGS, UNITS, levelDef, type BuildingType, type Team } from '../src/config';
import type { Building } from '../src/entities';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 7, ['fremen', 'atreides']);
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) g.update(0.05);
};
const F: Team = 0;
const A: Team = 1;
const kill = (b: Building) => {
  while (!b.dead) g.damage(b, UNITS.tank.weapon!, 1000, null);
  run(1);
};

function place(team: Team, type: BuildingType): Building {
  const hub = g.buildings.find((b) => b.team === team && !b.dead)!;
  for (let r = 3; r < 24; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.canPlace(type, team, hub.cx + dx, hub.cz + dz)) return g.placeBuilding(type, team, hub.cx + dx, hub.cz + dz);
    }
  }
  throw new Error(`no room for ${type}`);
}

// ---- The hub ----
const fremen = g.buildings.filter((b) => b.team === F);
check(fremen.length === 1 && fremen[0].type === 'sietch' && fremen[0].level === 1, 'Fremen start with a level-1 Sietch');
check(!g.has(F, 'conyard') && !g.canBuild(F, 'conyard'), 'Fremen have no Construction Yard and cannot build one');
check(g.has(A, 'conyard') && !g.has(A, 'sietch'), 'Atreides start with a Construction Yard');
check(g.hasHub(F) && g.canBuild(F, 'barracks'), 'the Sietch builds Fremen structures');
check(g.canBuild(F, 'sietch'), 'Fremen can build another Sietch');

// ---- Three levels ----
g.teams[F].credits = 100000;
const main = fremen[0];
check(!g.canLevelUp(F, 'sietch'), 'the Great Sietch needs a Barracks');
place(F, 'barracks');
check(g.canLevelUp(F, 'sietch') && !g.meets(F, 'sietch2'), 'level 2 is open, not yet met');
const before = g.teams[F].credits;
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
check(g.teams[F].levelUps.sietch?.level === 2 && before - g.teams[F].credits === levelDef('sietch', 2).cost, 'going to level 2 costs its price');
applyCommand(g, F, { c: 'cancelLevelUp', type: 'sietch' });
check(g.teams[F].credits === before && !g.teams[F].levelUps.sietch, 'cancelling refunds it');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(levelDef('sietch', 2).time + 1);
check(main.level === 2 && g.meets(F, 'sietch2') && !g.meets(F, 'sietch3') && main.name === 'Great Sietch', 'the Sietch becomes the Great Sietch');
check(g.canLevelUp(F, 'sietch'), 'and can go on to level 3');
const mid = g.teams[F].credits;
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
check(g.teams[F].levelUps.sietch?.level === 3 && mid - g.teams[F].credits === levelDef('sietch', 3).cost, 'going to level 3 costs its own price');
run(levelDef('sietch', 3).time + 1);
check(main.level === 3 && g.meets(F, 'sietch3') && main.name === levelDef('sietch', 3).name, 'the Sietch reaches level 3');
check(!g.canLevelUp(F, 'sietch'), 'and no further');

// ---- A second Sietch: a spare hub at level 1 ----
const spare = place(F, 'sietch');
check(spare.level === 1 && g.meets(F, 'sietch3'), 'a new Sietch starts at level 1; the team keeps level 3');
check(!g.canLevelUp(F, 'sietch'), 'while level 3 stands, the spare has nothing to level up to');
kill(main);
check(main.dead && g.hasHub(F) && g.canBuild(F, 'barracks') && !g.meets(F, 'sietch2'), 'the first Sietch falls: the spare still builds, the tech is gone');
check(g.canLevelUp(F, 'sietch'), 'and the spare can climb again');
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
run(levelDef('sietch', 2).time + 1);
check(spare.level === 2 && g.meets(F, 'sietch2'), 'the spare becomes the Great Sietch');

// ---- A level-up dies with its building ----
applyCommand(g, F, { c: 'levelUp', type: 'sietch' });
const bks = g.buildings.find((b) => b.team === F && b.type === 'barracks')!;
kill(spare);
check(!g.teams[F].levelUps.sietch && !g.hasHub(F), 'losing the Sietch mid-upgrade loses the upgrade');
check(!g.canBuild(F, 'barracks') && !g.canBuild(F, 'sietch'), 'with no Sietch, Fremen cannot build');
check(!bks.dead && g.canTrain(F, 'warrior'), 'the Barracks still trains');

// ---- The others keep two levels ----
g.teams[A].credits = 100000;
check(BUILDINGS.conyard.levels!.length === 1 && g.canLevelUp(A, 'conyard'), 'Atreides yard has one level-up');
applyCommand(g, A, { c: 'levelUp', type: 'conyard' });
run(levelDef('conyard', 2).time + 1);
check(g.meets(A, 'conyard2') && !g.canLevelUp(A, 'conyard'), 'HQ Level 2 is the top');

// ---- Corrino self-repair goes by the hub ----
const c = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), 64, 3, ['corrino', 'fremen']);
const yard = c.buildings.find((b) => b.team === 0 && b.type === 'conyard')!;
yard.hp -= 100;
check(c.canSelfRepair(yard), 'Corrino structures repair themselves while a yard stands');

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
