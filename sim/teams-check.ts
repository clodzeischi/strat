// Checks 2v2: four computer players, teams 0 and 2 against 1 and 3, on Medium and Large maps. Every team gets its
// own spawn spot; allies never damage each other; allies see what each other sees; a side offers to surrender only
// once every one of its computer players has given up (or is gone); and the game ends with one side the winner.
// Usage: npx tsx sim/teams-check.ts
import * as THREE from 'three';
import { createAI } from '../src/game/brutal';
import { FACTIONS, type Faction, type MapSize, type Team } from '../src/config';
import { Game } from '../src/game/game';

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
}

const games: [MapSize, number, Faction[]][] = [
  [96, 21, ['atreides', 'corrino', 'fremen', 'atreides']],
  [128, 22, ['corrino', 'fremen', 'atreides', 'corrino']],
];
for (const [size, seed, factions] of games) {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), size, seed, factions);
  const label = `${size} map, seed ${seed}`;
  check(g.teams.map((t) => t.side).join() === '0,1,0,1', `${label}: teams alternate sides`);
  const spots = new Set(g.map.bases.map((b) => `${b.cx},${b.cz}`));
  check(g.map.bases.length === 4 && spots.size === 4, `${label}: four teams at four different spots`);
  check(g.teams.every((t) => g.buildings.some((b) => b.team === t.team && b.type === FACTIONS[t.faction].hub)), `${label}: a hub for every team`);

  let friendly = 0;
  const dmg = g.damage.bind(g);
  (g as { damage: Game['damage'] }).damage = (t, w, mult, by) => {
    if (by && by.team !== t.team && g.allied(by.team, t.team)) friendly++;
    dmg(t, w, mult, by);
  };
  const offers: Team[] = [];
  g.onSurrenderOffer = (t) => offers.push(t);
  const ais = g.teams.map((t) => createAI(g, t.team, 'hard'));
  let sharedSight = true;
  while (g.winner === null && g.time < 40 * 60) {
    g.update(0.05);
    for (const a of ais) a.update(0.05);
    // An ally's unit is always in view, and what one ally sees the other does too.
    if (g.ticks % 200 === 0) {
      for (const u of g.units) if (!u.dead && !u.carrier && !g.sees(((u.team + 2) % 4) as Team, u)) sharedSight = false;
      for (const t of [0, 1] as Team[]) {
        const a = g.vision.visible[t];
        const b = g.vision.visible[t + 2];
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) sharedSight = false;
      }
    }
    // Surrender offers only once the whole side has given up: each ally out of the game or beaten too.
    for (const t of offers.splice(0)) {
      const together = g.teamsOn(g.sideOf(t)).every((a) => g.out(a) || g.beaten.has(a));
      check(together, `${label}: team ${t} offers to surrender only with its whole side beaten`);
      if (together) g.acceptSurrender(t);
    }
  }
  check(friendly === 0, `${label}: allies never hurt each other (${friendly} hits)`);
  check(sharedSight, `${label}: allies share their sight`);
  const lost = g.winner === null ? -1 : 1 - g.winner;
  const beaten = g.teams.filter((t) => t.side === lost).every((t) => g.surrendered !== null || (!g.units.some((u) => u.team === t.team) && !g.buildings.some((b) => b.team === t.team)));
  check(g.winner !== null && beaten, `${label}: side ${g.winner} wins at ${Math.round(g.time / 60)} min, the other side beaten`);
}
console.log(failures ? `\n${failures} failed` : '\nall ok');
process.exit(failures ? 1 : 0);
