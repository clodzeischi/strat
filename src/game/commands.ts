import { BUILDINGS, PRODUCERS, TILE, type BuildingType, type LevelUpType, type Producer, type Team, type UnitType, type UpgradeType } from '../config';
import { Building, Carryall, repairable, Unit, type Entity } from '../entities';
import { SPICE } from '../map';
import type { Game } from './game';
import { hypot } from './hypot';
import { cellsAround } from './pathfinding';

/**
 * Everything a player can tell the game, as plain data. The screen turns clicks and keys into commands; the
 * simulation applies them at a set tick on every machine (lockstep multiplayer), and a replay is just the list.
 * Units and buildings are named by id, places by world position.
 */
export type Command =
  /** Right click (or attack-move with `attack`): on a target, a place, or a unit's own Carryall, bunker or refinery. */
  | { c: 'go'; units: number[]; x: number; z: number; target: number | null; attack: boolean }
  | { c: 'drop'; units: number[]; x: number; z: number }
  | { c: 'stop'; units: number[] }
  | { c: 'unload'; buildings: number[] }
  | { c: 'rally'; buildings: number[]; x: number; z: number }
  | { c: 'salvage'; buildings: number[] }
  | { c: 'cancelSalvage'; buildings: number[] }
  /** Artillery sets up (`on`) or packs up. */
  | { c: 'deploy'; units: number[]; on: boolean }
  /** Devastators self-destruct. */
  | { c: 'detonate'; units: number[] }
  /** MLRS lock on to an enemy: they attack it with homing rockets for a while. */
  | { c: 'lock'; units: number[]; target: number }
  /** Sky Raiders lay a mine where they are. */
  | { c: 'mine'; units: number[] }
  /** Corrino: structures start (or stop) repairing themselves. */
  | { c: 'mend'; buildings: number[]; on: boolean }
  | { c: 'build'; type: BuildingType }
  | { c: 'cancelBuild' }
  | { c: 'place'; cx: number; cz: number }
  | { c: 'train'; type: UnitType }
  | { c: 'untrain'; type: UnitType }
  | { c: 'research'; type: UpgradeType }
  | { c: 'cancelResearch' }
  | { c: 'levelUp'; type: LevelUpType }
  | { c: 'cancelLevelUp'; type: LevelUpType }
  | { c: 'surrender' };

export function entityById(game: Game, id: number | null): Entity | null {
  if (id === null) return null;
  return game.units.find((u) => u.id === id) ?? game.buildings.find((b) => b.id === id) ?? null;
}

/** The listed units that belong to the team and can take orders (not dead, not riding in something). */
function own(game: Game, team: Team, ids: number[]): Unit[] {
  const set = new Set(ids);
  return game.units.filter((u) => set.has(u.id) && u.team === team && !u.dead && !u.carrier);
}

/** The listed buildings that belong to the team and still stand. */
function ownBuildings(game: Game, team: Team, ids: number[]): Building[] {
  const set = new Set(ids);
  return game.buildings.filter((b) => set.has(b.id) && b.team === team && !b.dead);
}

/** Applies one command for a team. Anything no longer valid (units gone, not enough credits) is skipped. */
export function applyCommand(game: Game, team: Team, cmd: Command): void {
  switch (cmd.c) {
    case 'go':
      return go(game, own(game, team, cmd.units), cmd.x, cmd.z, entityById(game, cmd.target), cmd.attack, team);
    case 'drop': {
      const loaded = own(game, team, cmd.units).filter((u): u is Carryall => u instanceof Carryall && u.load.length > 0);
      loaded.forEach((c, i) => {
        const a = (i / loaded.length) * Math.PI * 2;
        const r = loaded.length > 1 ? 2.5 : 0;
        c.orderDrop(game, cmd.x + Math.cos(a) * r, cmd.z + Math.sin(a) * r);
      });
      return;
    }
    case 'stop':
      for (const u of own(game, team, cmd.units)) u.command(game, { kind: 'idle' });
      return;
    case 'unload':
      for (const id of cmd.buildings) {
        const b = entityById(game, id);
        if (b instanceof Building && b.team === team) game.unloadBunker(b);
      }
      return;
    case 'rally':
      for (const b of ownBuildings(game, team, cmd.buildings)) if (PRODUCERS.includes(b.type as Producer)) game.setRally(b, cmd.x, cmd.z);
      return;
    case 'salvage':
      for (const b of ownBuildings(game, team, cmd.buildings)) game.startSalvage(b);
      return;
    case 'cancelSalvage':
      for (const b of ownBuildings(game, team, cmd.buildings)) game.cancelSalvage(b);
      return;
    case 'deploy':
      for (const u of own(game, team, cmd.units)) u.setDeployed(cmd.on);
      return;
    case 'detonate':
      for (const u of own(game, team, cmd.units)) game.startDetonation(u);
      return;
    case 'lock': {
      const t = entityById(game, cmd.target);
      if (t) for (const u of own(game, team, cmd.units)) game.lockOn(u, t);
      return;
    }
    case 'mine':
      for (const u of own(game, team, cmd.units)) game.layMine(u);
      return;
    case 'mend':
      for (const b of ownBuildings(game, team, cmd.buildings)) b.repairing = cmd.on && game.canSelfRepair(b);
      return;
    case 'build':
      if (!game.teams[team].building && game.canBuild(team, cmd.type)) game.startBuilding(team, cmd.type);
      return;
    case 'cancelBuild':
      return game.cancelBuilding(team);
    case 'place':
      if (!game.finishPlacement(team, cmd.cx, cmd.cz) && game.teams[team].building?.ready) {
        game.notifyTeam(team, `Cannot build ${BUILDINGS[game.teams[team].building!.type].name} there any more. Click its card to place it again.`);
      }
      return;
    case 'train':
      game.queueUnit(team, cmd.type);
      return;
    case 'untrain':
      return game.dequeueUnit(team, cmd.type);
    case 'research':
      if (!game.teams[team].research) game.startResearch(team, cmd.type);
      return;
    case 'cancelResearch':
      return game.cancelResearch(team);
    case 'levelUp':
      if (!game.teams[team].levelUps[cmd.type]) game.startLevelUp(team, cmd.type);
      return;
    case 'cancelLevelUp':
      return game.cancelLevelUp(team, cmd.type);
    case 'surrender':
      return game.acceptSurrender(team);
  }
}

/** Right click with units selected (see the `go` command). */
function go(game: Game, selected: Unit[], x: number, z: number, target: Entity | null, attack: boolean, team: Team): void {
  let units = selected;
  if (target?.dead) target = null;
  if (target && !game.sees(team, target)) {
    // Clicked on something the team can't see (any more): a structure is attacked where it stands (it can't have
    // moved); for a unit, the click is just a place to attack-move to.
    if (target instanceof Building) {
      x = target.x;
      z = target.z;
    }
    target = null;
    attack = true;
  }
  const carryalls = units.filter((u): u is Carryall => u instanceof Carryall);
  if (carryalls.length) {
    commandCarryalls(game, carryalls, target, x, z, team);
    units = units.filter((u) => !(u instanceof Carryall));
    if (units.length === 0) return;
  }
  if (target instanceof Carryall && target.team === team) {
    // Ground units right-clicking their own Carryall: it comes to pick them up.
    const taken = target.orderPickup(game, units);
    units = units.filter((u) => !taken.includes(u));
    if (units.length === 0) return;
  }
  if (target instanceof Building && target.team === team && target.def.garrison) {
    // Infantry right-clicking their own bunker: the nearest ones go in, as many as there's room for.
    const inf = units.filter((u) => u.def.infantry).sort((a, b) => hypot(a.x - target.x, a.z - target.z) - hypot(b.x - target.x, b.z - target.z));
    const going = inf.slice(0, Math.max(0, target.room));
    for (const u of going) u.command(game, { kind: 'enter', target });
    units = units.filter((u) => !going.includes(u));
    if (units.length === 0) return;
  }
  if (target && target.team === team && target.hp < target.maxHp && repairable(target)) {
    const mechs = units.filter((u) => u.def.repair && u !== target);
    for (const u of mechs) u.command(game, { kind: 'repair', target });
    units = units.filter((u) => !mechs.includes(u));
    if (units.length === 0) return;
  }
  if (target && target.team !== team) {
    const rest: Unit[] = [];
    for (const u of units) {
      if (game.weaponFor(u, target)) u.command(game, { kind: 'attack', target });
      else rest.push(u);
    }
    formationMove(game, rest, target.x, target.z, false);
    return;
  }
  if (target instanceof Building && target.type === 'refinery' && target.team === team) {
    const rest: Unit[] = [];
    for (const u of units) {
      if (u.type === 'harvester') u.commandReturn(game, target);
      else rest.push(u);
    }
    formationMove(game, rest, x, z, false);
    return;
  }
  const m = game.map;
  const cell = { cx: m.cellOf(x), cz: m.cellOf(z) };
  const onSpice = m.inBounds(cell.cx, cell.cz) && m.tile(cell.cx, cell.cz) === SPICE;
  const rest: Unit[] = [];
  for (const u of units) {
    if (onSpice && u.type === 'harvester') u.commandHarvest(game, cell);
    else rest.push(u);
  }
  formationMove(game, rest, x, z, attack);
}

/**
 * Right-click with Carryalls selected: on one of our liftable units, pick it up along with nearby units of the
 * same kind (a harvester becomes the Carryall's ferry assignment); anywhere else, fly there and circle.
 */
function commandCarryalls(game: Game, carryalls: Carryall[], target: Entity | null, x: number, z: number, team: Team): void {
  if (target instanceof Unit && target.team === team && target.def.lift !== undefined && !target.carrier) {
    const near = game.units
      .filter((u) => u.team === team && u.type === target.type && u !== target && !u.carrier && !u.falling && hypot(u.x - target.x, u.z - target.z) < 4 * TILE)
      .sort((a, b) => hypot(a.x - target.x, a.z - target.z) - hypot(b.x - target.x, b.z - target.z));
    let pool = target.type === 'harvester' ? [target] : [target, ...near];
    for (const c of carryalls) {
      if (pool.length === 0) break;
      const taken = c.orderPickup(game, pool);
      pool = pool.filter((u) => !taken.includes(u));
    }
    return;
  }
  // Spread several Carryalls around the point so they don't stack.
  carryalls.forEach((c, i) => {
    const a = (i / carryalls.length) * Math.PI * 2;
    const r = carryalls.length > 1 ? 3 : 0;
    c.command(game, { kind: 'move', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
  });
}

/** Each unit gets its own nearby cell so groups don't pile onto one point. */
function formationMove(game: Game, units: Unit[], x: number, z: number, attackMove: boolean): void {
  if (!units.length) return;
  const kind = attackMove ? 'amove' : 'move';
  if (units.length === 1) {
    units[0].command(game, { kind, x, z });
    return;
  }
  const cells = cellsAround(game.map, game.map.cellOf(x), game.map.cellOf(z), units.length);
  const sorted = [...units].sort((a, b) => hypot(a.x - x, a.z - z) - hypot(b.x - x, b.z - z));
  sorted.forEach((u, i) => {
    const c = cells[i];
    if (c) u.command(game, { kind, x: game.map.center(c.cx), z: game.map.center(c.cz) });
    else u.command(game, { kind, x, z });
  });
}
