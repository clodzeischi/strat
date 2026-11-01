import { BUILDINGS, PRODUCERS, TILE, type BuildingType, type LevelUpType, type Producer, type Team, type UnitType, type UpgradeType } from '../config';
import { Building, Carryall, repairable, Unit, type Entity } from '../entities';
import { SPICE } from '../map';
import type { Game } from './game';
import { hypot } from './hypot';
import { cellsAround } from './pathfinding';
import * as dm from './dmath';

/**
 * Everything a player can tell the game, as plain data. The screen turns clicks and keys into commands; the
 * simulation applies them at a set tick on every machine (lockstep multiplayer), and a replay is just the list.
 * Units and buildings are named by id, places by world position.
 */
export type Command =
  /**
   * Right click (or attack-move with `attack`): on a target, a place, or a unit's own Carryall, bunker or refinery.
   * With `queue` (Shift), units already busy take it up after what they're doing.
   */
  | { c: 'go'; units: number[]; x: number; z: number; target: number | null; attack: boolean; queue?: boolean }
  | { c: 'drop'; units: number[]; x: number; z: number }
  | { c: 'stop'; units: number[] }
  /** Hold Position: stay put and shoot only what comes within reach. */
  | { c: 'hold'; units: number[] }
  /** Fremen Dig In: under the sand at once, holding fire. */
  | { c: 'dig'; units: number[] }
  /** Fremen: the nearest of these that can goes to (x, z) and plants a Thumper there. */
  | { c: 'thump'; units: number[]; x: number; z: number }
  /** Fremen: these Sandriders let their worms go. */
  | { c: 'release'; units: number[] }
  | { c: 'unload'; buildings: number[] }
  /** With `target` (one of the team's units), the rally point goes with that unit and new units follow it. */
  | { c: 'rally'; buildings: number[]; x: number; z: number; target?: number | null }
  | { c: 'salvage'; buildings: number[] }
  | { c: 'cancelSalvage'; buildings: number[] }
  /** Artillery sets up (`on`) or packs up; Spice Crews set up their camp. With `queue` (Shift), after their other orders. */
  | { c: 'deploy'; units: number[]; on: boolean; queue?: boolean }
  /** Fremen: the units go through the rite that makes `to` (Warriors into Fedaykin, say), where they stand. */
  | { c: 'rite'; units: number[]; to: UnitType }
  /** Spice Camps pack up into crews again. */
  | { c: 'pack'; buildings: number[] }
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
  | { c: 'surrender' }
  /** Accept the computer opponent's offer to surrender. */
  | { c: 'acceptSurrender' };

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
    case 'go': {
      let units = own(game, team, cmd.units);
      if (cmd.queue) {
        const later = units.filter(busy);
        queueGo(game, later, cmd.x, cmd.z, entityById(game, cmd.target), cmd.attack, team);
        units = units.filter((u) => !later.includes(u));
      } else for (const u of units) u.queue = [];
      return go(game, units, cmd.x, cmd.z, entityById(game, cmd.target), cmd.attack, team);
    }
    case 'drop': {
      const loaded = own(game, team, cmd.units).filter((u): u is Carryall => u instanceof Carryall && u.load.length > 0);
      loaded.forEach((c, i) => {
        const a = (i / loaded.length) * Math.PI * 2;
        const r = loaded.length > 1 ? 2.5 : 0;
        c.orderDrop(game, cmd.x + dm.cos(a) * r, cmd.z + dm.sin(a) * r);
      });
      return;
    }
    case 'stop':
      for (const u of own(game, team, cmd.units)) {
        game.cancelRite(u);
        u.queue = [];
        u.command(game, { kind: 'idle' });
      }
      return;
    case 'hold':
      for (const u of own(game, team, cmd.units)) {
        u.queue = [];
        if (u.def.weapon && !(u instanceof Carryall) && !u.def.air) u.command(game, { kind: 'hold' });
        else u.command(game, { kind: 'idle' });
      }
      return;
    case 'thump':
      game.orderThumper(team, own(game, team, cmd.units), cmd.x, cmd.z);
      return;
    case 'dig':
      for (const u of own(game, team, cmd.units)) game.digIn(u);
      return;
    case 'release':
      for (const u of own(game, team, cmd.units)) game.releaseWorm(u);
      return;
    case 'unload':
      for (const id of cmd.buildings) {
        const b = entityById(game, id);
        if (b instanceof Building && b.team === team) game.unloadBunker(b);
      }
      return;
    case 'rally': {
      const t = entityById(game, cmd.target ?? null);
      const lead = t instanceof Unit && t.team === team && !t.dead && !(t instanceof Carryall) ? t : null;
      for (const b of ownBuildings(game, team, cmd.buildings)) if (PRODUCERS.includes(b.type as Producer)) game.setRally(b, cmd.x, cmd.z, lead);
      return;
    }
    case 'salvage':
      for (const b of ownBuildings(game, team, cmd.buildings)) game.startSalvage(b);
      return;
    case 'cancelSalvage':
      for (const b of ownBuildings(game, team, cmd.buildings)) game.cancelSalvage(b);
      return;
    case 'deploy':
      for (const u of own(game, team, cmd.units)) {
        if (cmd.queue && cmd.on && busy(u)) u.queue.push({ kind: 'deploy' });
        else if (u.def.camp) {
          u.queue = [];
          game.setUpCamp(u);
        } else u.setDeployed(cmd.on);
      }
      return;
    case 'pack':
      for (const b of ownBuildings(game, team, cmd.buildings)) game.packCamp(b);
      return;
    case 'rite':
      for (const u of own(game, team, cmd.units)) if (!u.rite) game.startRite(u, cmd.to);
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
        game.notifyTeam(team, `Cannot build ${BUILDINGS[game.teams[team].building!.type].name} there any more. Click its card to place it again.`, 'cannot_build_there');
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
    case 'acceptSurrender':
      for (const t of game.surrenderOffers) if (game.hostile(t, team)) return game.acceptSurrender(t);
      return;
  }
}

/**
 * Whether a unit has something to do first, so a queued order waits (Carryalls run their own errands: never; units
 * holding position take a queued order straight away, as they would after Stop).
 */
function busy(u: Unit): boolean {
  return !(u instanceof Carryall) && ((u.order.kind !== 'idle' && u.order.kind !== 'hold') || u.queue.length > 0);
}

/**
 * Shift + right click for units already busy: the order joins the end of their queue. An enemy is attacked (by those
 * that can hit it; the rest walk to it); anywhere else is a move, or an attack-move, each unit to its own nearby cell.
 */
function queueGo(game: Game, units: Unit[], x: number, z: number, target: Entity | null, attack: boolean, team: Team): void {
  if (!units.length) return;
  if (target && (target.dead || game.allied(target.team, team) || !game.sees(team, target))) target = null;
  const rest: Unit[] = [];
  for (const u of units) {
    if (target && game.weaponFor(u, target)) u.queue.push({ kind: 'attack', target });
    else rest.push(u);
  }
  if (target) {
    x = target.x;
    z = target.z;
  }
  const kind = attack ? 'amove' : 'move';
  const spots = formationSpots(game, rest, x, z);
  rest.forEach((u, i) => u.queue.push({ kind, ...spots[i] }));
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
  // Attacking with a group: Repair Vehicles follow behind its longest-range unit rather than charge in.
  const armed = units.filter((u) => u.def.weapon);
  if ((attack || (target && game.hostile(target.team, team))) && armed.length) {
    const mechs = units.filter((u) => u.def.repair && !u.def.weapon);
    const goal = target ?? { x, z };
    for (const u of mechs) u.command(game, { kind: 'escort', group: [...armed], x: goal.x, z: goal.z });
    units = units.filter((u) => !mechs.includes(u));
    if (units.length === 0) return;
  }
  if (target instanceof Unit && target.team === team && !attack) {
    // Right-clicking one of our own units: follow it.
    for (const u of units) if (u !== target) u.command(game, { kind: 'follow', target });
    return;
  }
  if (target && game.hostile(target.team, team)) {
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
    c.command(game, { kind: 'move', x: x + dm.cos(a) * r, z: z + dm.sin(a) * r });
  });
}

/** Each unit gets its own nearby cell so groups don't pile onto one point. */
function formationMove(game: Game, units: Unit[], x: number, z: number, attackMove: boolean): void {
  const kind = attackMove ? 'amove' : 'move';
  const spots = formationSpots(game, units, x, z);
  units.forEach((u, i) => u.command(game, { kind, ...spots[i] }));
}

/** A group wider than this (m) gathers at the point instead of keeping its shape. */
const MAGIC_BOX = 24;

/**
 * Where each unit of a group move goes, in the order given. StarCraft's "magic box": clicked outside the box around
 * the group, every unit keeps its place relative to the others, so the group arrives in the shape it left in; clicked
 * inside it, or with the group spread wider than MAGIC_BOX, they gather on open cells around the point, the nearest
 * unit to the nearest cell. A unit whose kept place is blocked, on another level or taken joins the gathering.
 */
function formationSpots(game: Game, units: Unit[], x: number, z: number): { x: number; z: number }[] {
  const m = game.map;
  const spots: { x: number; z: number }[] = units.map(() => ({ x, z }));
  if (units.length <= 1) return spots;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sx = 0, sz = 0;
  for (const u of units) {
    minX = Math.min(minX, u.x); maxX = Math.max(maxX, u.x); minZ = Math.min(minZ, u.z); maxZ = Math.max(maxZ, u.z);
    sx += u.x; sz += u.z;
  }
  const inside = x >= minX - TILE && x <= maxX + TILE && z >= minZ - TILE && z <= maxZ + TILE;
  const spread = Math.max(maxX - minX, maxZ - minZ) > MAGIC_BOX;
  const used = new Set<number>();
  let gather = units.map((_, i) => i);
  const goal = { cx: m.cellOf(x), cz: m.cellOf(z) };
  if (!inside && !spread && m.inBounds(goal.cx, goal.cz)) {
    const cx = sx / units.length;
    const cz = sz / units.length;
    const level = m.level[m.idx(goal.cx, goal.cz)];
    gather = [];
    units.forEach((u, i) => {
      const tx = x + (u.x - cx);
      const tz = z + (u.z - cz);
      const c = { cx: m.cellOf(tx), cz: m.cellOf(tz) };
      const k = m.inBounds(c.cx, c.cz) ? m.idx(c.cx, c.cz) : -1;
      if (k >= 0 && m.canEnter(c.cx, c.cz, u.moveClass) && m.level[k] === level && !used.has(k)) {
        used.add(k);
        spots[i] = { x: tx, z: tz };
      } else gather.push(i);
    });
  }
  if (gather.length) {
    const cells = cellsAround(m, goal.cx, goal.cz, gather.length + used.size).filter((c) => !used.has(m.idx(c.cx, c.cz)));
    gather.sort((a, b) => hypot(units[a].x - x, units[a].z - z) - hypot(units[b].x - x, units[b].z - z));
    gather.forEach((i, n) => {
      const c = cells[n];
      if (c) spots[i] = { x: m.center(c.cx), z: m.center(c.cz) };
    });
  }
  return spots;
}
