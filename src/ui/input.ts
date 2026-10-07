import * as THREE from 'three';
import type { RTSCamera } from '../render/camera';
import { BUILDINGS, PLAYER, PRODUCERS, TILE, type BuildingType, type Producer } from '../config';
import { Building, Carryall, repairable, Unit, type Entity } from '../entities';
import type { Game } from '../game/game';
import { SPICE } from '../map';
import { cellsAround } from '../game/pathfinding';
import { PlacementGrid } from './placement';

const EDGE = 12; // px from the screen edge that triggers scrolling
const PAN_SPEED = 45;

/** Mouse and keyboard: camera control, selection, commands and building placement. */
export class Input {
  selection: Entity[] = [];
  placing: BuildingType | null = null;
  attackMode = false;
  /** Waiting for a click on where the selected Carryalls should drop their load. */
  dropMode = false;
  paused = false;
  /** Clicks and hotkeys issued, for APM on the end screen. */
  actions = 0;
  /** Called when Esc has nothing else to cancel (opens the in-game menu). */
  onMenu: () => void = () => {};

  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, inside: false };
  /** Cursor in window coordinates, for edge scrolling. */
  private screen = { x: 0, y: 0, inside: false };
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private groups = new Map<string, Entity[]>();
  private lastClick = { time: 0, id: -1 };
  private lastGroupKey = { key: '', time: 0 };
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
  /** Middle-drag panning: the ground point grabbed, kept under the cursor on a plane at its height. */
  private grab: THREE.Vector3 | null = null;
  private grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ghost: THREE.Mesh;
  private ghostMat = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.3, depthWrite: false });
  /** Per-tile placement grid under the ghost. */
  private grid: PlacementGrid;

  constructor(
    private game: Game,
    private cam: RTSCamera,
    private canvas: HTMLCanvasElement,
    private boxEl: HTMLElement,
    private infoEl: HTMLElement,
  ) {
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat);
    this.ghost.visible = false;
    game.scene.add(this.ghost);
    this.grid = new PlacementGrid(game);
    game.scene.add(this.grid.mesh);

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseenter', () => (this.mouse.inside = true));
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Edge scrolling uses the whole window, so the right edge is the screen edge, past the sidebar.
    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) this.screen.inside = false;
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.grab = null;
    });
  }

  beginPlacement(type: BuildingType): void {
    this.placing = type;
    this.attackMode = false;
    this.dropMode = false;
  }

  // ---- Helpers ----------------------------------------------------------------

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private groundPoint(x: number, y: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, -(y / this.canvas.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    // The ground isn't flat (dunes, plateaus), so find where the ray actually meets it; off the map, fall back to y = 0.
    const t = this.game.map.raySurface(o.x, o.y, o.z, d.x, d.y, d.z);
    if (t >= 0) return this.raycaster.ray.at(t, new THREE.Vector3());
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  private toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.cam.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight,
      visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
    };
  }

  /** Entity under the cursor: units by screen distance, buildings by footprint. */
  private pick(x: number, y: number): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const u of this.game.units) {
      if (u.carrier) continue;
      const s = this.toScreen(u.x, u.y + 0.5, u.z);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < u.radius * 18 + 8 && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best) return best;
    const p = this.groundPoint(x, y);
    if (!p) return null;
    const m = this.game.map;
    const cx = m.cellOf(p.x);
    const cz = m.cellOf(p.z);
    if (!m.inBounds(cx, cz)) return null;
    const id = m.occupied[m.idx(cx, cz)];
    return id ? this.game.buildings.find((b) => b.id === id) ?? null : null;
  }

  private setSelection(list: Entity[]): void {
    for (const e of this.selection) e.setSelected(false);
    this.selection = list;
    for (const e of list) e.setSelected(true);
  }

  private ownUnits(): Unit[] {
    return this.selection.filter((e): e is Unit => e instanceof Unit && e.team === PLAYER && !e.dead);
  }

  private ownCarryalls(): Carryall[] {
    return this.ownUnits().filter((u): u is Carryall => u instanceof Carryall);
  }

  private placementCell(p: THREE.Vector3, type: BuildingType): { cx: number; cz: number } {
    const size = BUILDINGS[type].size;
    return { cx: Math.round(p.x / TILE - size / 2), cz: Math.round(p.z / TILE - size / 2) };
  }

  // ---- Mouse ------------------------------------------------------------------

  private onMouseDown(e: MouseEvent): void {
    const p = this.local(e);
    this.actions++;
    if (e.button === 0) {
      this.dragStart = p;
      this.dragging = false;
    }
    if (e.button === 1) {
      e.preventDefault(); // no browser autoscroll
      this.grab = this.groundPoint(p.x, p.y);
      if (this.grab) this.grabPlane.constant = -this.grab.y;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    this.screen = { x: e.clientX, y: e.clientY, inside: true };
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    if (this.grab) {
      // Move the camera so the grabbed point is back under the cursor.
      const ndc = new THREE.Vector2((p.x / this.canvas.clientWidth) * 2 - 1, -(p.y / this.canvas.clientHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.cam.camera);
      const hit = this.raycaster.ray.intersectPlane(this.grabPlane, new THREE.Vector3());
      if (hit) {
        this.cam.move(this.grab.x - hit.x, this.grab.z - hit.z);
        this.cam.apply();
      }
    }
    if (this.dragStart && !this.placing && !this.attackMode && !this.dropMode) {
      if (!this.dragging && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 6) this.dragging = true;
      if (this.dragging) {
        const x = Math.min(p.x, this.dragStart.x);
        const y = Math.min(p.y, this.dragStart.y);
        Object.assign(this.boxEl.style, {
          display: 'block', left: `${x}px`, top: `${y}px`,
          width: `${Math.abs(p.x - this.dragStart.x)}px`, height: `${Math.abs(p.y - this.dragStart.y)}px`,
        });
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    const p = this.local(e);
    if (e.button === 1) {
      this.grab = null;
      return;
    }
    if (e.button === 2) {
      if (e.target !== this.canvas) return;
      if (this.placing) this.placing = null;
      else if (this.attackMode) this.attackMode = false;
      else if (this.dropMode) this.dropMode = false;
      else this.commandAt(p.x, p.y);
      return;
    }
    if (e.button !== 0 || !this.dragStart) return;
    const start = this.dragStart;
    const wasDragging = this.dragging;
    this.dragStart = null;
    this.dragging = false;
    this.boxEl.style.display = 'none';

    if (this.placing) {
      const g = this.groundPoint(p.x, p.y);
      if (!g) return;
      const c = this.placementCell(g, this.placing);
      if (this.game.finishPlacement(PLAYER, c.cx, c.cz)) this.placing = null;
      else this.game.onMessage('Cannot build there. Structures go on rock, near your base.');
      return;
    }
    if (this.attackMode) {
      this.attackMode = false;
      this.commandAt(p.x, p.y, true);
      return;
    }
    if (this.dropMode) {
      this.dropMode = false;
      this.dropAt(p.x, p.y);
      return;
    }
    if (wasDragging) this.boxSelect(start, p, e.shiftKey);
    else this.clickSelect(p.x, p.y, e.shiftKey);
  }

  private boxSelect(a: { x: number; y: number }, b: { x: number; y: number }, add: boolean): void {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const hits = this.game.units.filter((u) => {
      if (u.team !== PLAYER || u.carrier) return false;
      const s = this.toScreen(u.x, u.y + 0.5, u.z);
      return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
    });
    if (add) this.setSelection([...new Set([...this.ownUnits(), ...hits])]);
    else if (hits.length) this.setSelection(hits);
    else this.setSelection([]);
  }

  private clickSelect(x: number, y: number, add: boolean): void {
    const e = this.pick(x, y);
    const now = performance.now();
    if (e && e instanceof Unit && e.team === PLAYER && this.lastClick.id === e.id && now - this.lastClick.time < 350) {
      // Double click: every own unit of this type on screen.
      const same = this.game.units.filter((u) => u.team === PLAYER && u.type === e.type && this.toScreen(u.x, u.y, u.z).visible);
      this.setSelection(same);
      this.lastClick.id = -1;
      return;
    }
    this.lastClick = { time: now, id: e?.id ?? -1 };
    if (!e) {
      if (!add) this.setSelection([]);
      return;
    }
    if (add && e instanceof Unit && e.team === PLAYER) {
      const own = this.ownUnits();
      this.setSelection(own.includes(e) ? own.filter((u) => u !== e) : [...own, e]);
    } else {
      this.setSelection([e]);
    }
  }

  /** Right click (or A + left click when `attackMove`). */
  private commandAt(x: number, y: number, attackMove = false): void {
    const g = this.game;
    let units = this.ownUnits();
    const point = this.groundPoint(x, y);
    if (!point) return;

    if (units.length === 0) {
      const b = this.selection[0];
      if (b instanceof Building && b.team === PLAYER && PRODUCERS.includes(b.type as Producer)) {
        g.teams[PLAYER].rally[b.type as Producer] = { x: point.x, z: point.z };
        g.effects.marker(point, 0x7cff7c);
        g.onMessage('Rally point set.');
      }
      return;
    }

    const target = this.pick(x, y);
    const carryalls = units.filter((u): u is Carryall => u instanceof Carryall);
    if (carryalls.length) {
      this.commandCarryalls(carryalls, target, point);
      units = units.filter((u) => !(u instanceof Carryall));
      if (units.length === 0) return;
    }
    if (target instanceof Carryall && target.team === PLAYER) {
      // Ground units right-clicking their own Carryall: it comes to pick them up.
      const taken = target.orderPickup(g, units);
      if (taken.length) {
        g.effects.marker(new THREE.Vector3(target.x, g.map.surfaceAt(target.x, target.z), target.z), 0x7cff7c);
        units = units.filter((u) => !taken.includes(u));
        if (units.length === 0) return;
      }
    }
    if (target instanceof Building && target.team === PLAYER && target.def.garrison) {
      // Infantry right-clicking their own bunker: the nearest ones go in, as many as there's room for.
      const inf = units.filter((u) => u.def.infantry).sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
      const going = inf.slice(0, Math.max(0, target.room));
      for (const u of going) u.command(g, { kind: 'enter', target });
      if (going.length) {
        g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0x7cff7c);
        units = units.filter((u) => !going.includes(u));
        if (units.length === 0) return;
      }
    }
    if (target && target.team === PLAYER && target.hp < target.maxHp && repairable(target)) {
      const mechs = units.filter((u) => u.def.repair && u !== target);
      for (const u of mechs) u.command(g, { kind: 'repair', target });
      if (mechs.length) {
        g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0xffd27a);
        units = units.filter((u) => !mechs.includes(u));
        if (units.length === 0) return;
      }
    }
    if (target && target.team !== PLAYER) {
      g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0xff5040);
      const rest: Unit[] = [];
      for (const u of units) {
        if (g.weaponFor(u, target)) u.command(g, { kind: 'attack', target });
        else rest.push(u);
      }
      this.formationMove(rest, target.x, target.z, false);
      return;
    }
    if (target instanceof Building && target.type === 'refinery') {
      const rest: Unit[] = [];
      for (const u of units) {
        if (u.type === 'harvester') u.commandReturn(g, target);
        else rest.push(u);
      }
      this.formationMove(rest, point.x, point.z, false);
      g.effects.marker(point, 0x7cff7c);
      return;
    }

    const m = g.map;
    const cell = { cx: m.cellOf(point.x), cz: m.cellOf(point.z) };
    const onSpice = m.inBounds(cell.cx, cell.cz) && m.tile(cell.cx, cell.cz) === SPICE;
    const rest: Unit[] = [];
    for (const u of units) {
      if (onSpice && u.type === 'harvester') u.commandHarvest(g, cell);
      else rest.push(u);
    }
    this.formationMove(rest, point.x, point.z, attackMove);
    g.effects.marker(point, attackMove ? 0xff9040 : 0x7cff7c);
  }

  /**
   * Right-click with Carryalls selected: on one of our liftable units, pick it up along with nearby units of the
   * same kind (a harvester becomes the Carryall's ferry assignment); anywhere else, fly there and circle.
   */
  private commandCarryalls(carryalls: Carryall[], target: Entity | null, point: THREE.Vector3): void {
    const g = this.game;
    if (target instanceof Unit && target.team === PLAYER && target.def.lift !== undefined && !target.carrier) {
      const near = g.units
        .filter((u) => u.team === PLAYER && u.type === target.type && u !== target && !u.carrier && !u.falling && Math.hypot(u.x - target.x, u.z - target.z) < 4 * TILE)
        .sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
      let pool = target.type === 'harvester' ? [target] : [target, ...near];
      for (const c of carryalls) {
        if (pool.length === 0) break;
        const taken = c.orderPickup(g, pool);
        pool = pool.filter((u) => !taken.includes(u));
      }
      g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0x7cff7c);
      return;
    }
    // Spread several Carryalls around the point so they don't stack.
    carryalls.forEach((c, i) => {
      const a = (i / carryalls.length) * Math.PI * 2;
      const r = carryalls.length > 1 ? 3 : 0;
      c.command(g, { kind: 'move', x: point.x + Math.cos(a) * r, z: point.z + Math.sin(a) * r });
    });
    g.effects.marker(point, 0x7cff7c);
  }

  /** Left click in drop mode: every selected loaded Carryall drops at the spot. */
  private dropAt(x: number, y: number): void {
    const g = this.game;
    const point = this.groundPoint(x, y);
    if (!point) return;
    const loaded = this.ownCarryalls().filter((c) => c.load.length);
    loaded.forEach((c, i) => {
      const a = (i / loaded.length) * Math.PI * 2;
      const r = loaded.length > 1 ? 2.5 : 0;
      c.orderDrop(g, point.x + Math.cos(a) * r, point.z + Math.sin(a) * r);
    });
    if (loaded.length) g.effects.marker(point, 0xffb040);
  }

  private carryallInfo(c: Carryall): string {
    if (c.task.kind === 'ferry') return `   Ferrying a Harvester${c.load.length ? ' (lifting)' : ''}`;
    if (c.load.length === 0) return '   Empty. Right-click a unit to pick it up';
    const counts = new Map<string, number>();
    for (const u of c.load) counts.set(u.name, (counts.get(u.name) ?? 0) + 1);
    return `   Cargo: ${[...counts].map(([n, k]) => `${k}× ${n}`).join(', ')}   E: drop`;
  }

  /** Each unit gets its own nearby cell so groups don't pile onto one point. */
  private formationMove(units: Unit[], x: number, z: number, attackMove: boolean): void {
    if (!units.length) return;
    const g = this.game;
    const kind = attackMove ? 'amove' : 'move';
    if (units.length === 1) {
      units[0].command(g, { kind, x, z });
      return;
    }
    const cells = cellsAround(g.map, g.map.cellOf(x), g.map.cellOf(z), units.length);
    const sorted = [...units].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    sorted.forEach((u, i) => {
      const c = cells[i];
      if (c) u.command(g, { kind, x: g.map.center(c.cx), z: g.map.center(c.cz) });
      else u.command(g, { kind, x, z });
    });
  }

  // ---- Keyboard ---------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    const g = this.game;
    if (/^[0-9asdf ]$/.test(k)) this.actions++;
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        this.groups.set(k, this.ownUnits());
        g.onMessage(`Group ${k} set.`);
      } else {
        const list = (this.groups.get(k) ?? []).filter((u) => !u.dead);
        this.setSelection(list);
        const now = performance.now();
        if (this.lastGroupKey.key === k && now - this.lastGroupKey.time < 400 && list.length) {
          this.cam.lookAt(list[0].x, list[0].z);
        }
        this.lastGroupKey = { key: k, time: now };
      }
      return;
    }
    switch (k) {
      case 'escape':
        if (this.placing) this.placing = null;
        else if (this.attackMode) this.attackMode = false;
        else if (this.dropMode) this.dropMode = false;
        else this.onMenu();
        break;
      // Hotkeys stay on the left hand (as in Stormgate): A attack-move, S stop, D drop, F unload, Space base,
      // ` pause. The right hand is on the mouse; the camera pans with the arrows, screen edges or middle-drag.
      case 'd':
        if (this.ownCarryalls().some((c) => c.load.length)) {
          this.dropMode = true;
          this.attackMode = false;
        }
        break;
      case 's':
        for (const u of this.ownUnits()) u.command(g, { kind: 'idle' });
        break;
      case 'f':
        for (const b of this.selection) if (b instanceof Building && b.team === PLAYER) g.unloadBunker(b);
        break;
      case 'a':
        if (this.ownUnits().some((u) => u.def.weapon)) {
          this.attackMode = true;
          this.dropMode = false;
        }
        break;
      case ' ': {
        e.preventDefault();
        const home = g.buildings.find((b) => b.team === PLAYER && b.type === 'conyard') ?? g.buildings.find((b) => b.team === PLAYER);
        if (home) this.cam.lookAt(home.x, home.z);
        break;
      }
      case '`':
        this.paused = !this.paused;
        break;
    }
  }

  // ---- Per frame --------------------------------------------------------------

  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('arrowup')) dy += 1;
    if (this.keys.has('arrowdown')) dy -= 1;
    if (this.screen.inside && !this.dragStart && !this.grab) {
      if (this.screen.x < EDGE) dx -= 1;
      if (this.screen.x > window.innerWidth - EDGE) dx += 1;
      if (this.screen.y < EDGE) dy += 1;
      if (this.screen.y > window.innerHeight - EDGE) dy -= 1;
    }
    if (dx || dy) this.cam.pan(Math.sign(dx) * PAN_SPEED * dt, Math.sign(dy) * PAN_SPEED * dt);
    this.cam.apply();

    const gone = (e: Entity) => e.dead || (e instanceof Unit && !!e.carrier);
    if (this.selection.some(gone)) this.setSelection(this.selection.filter((e) => !gone(e)));
    if (this.dropMode && !this.ownCarryalls().some((c) => c.load.length)) this.dropMode = false;
    if (this.placing && !this.game.teams[PLAYER].building?.ready) this.placing = null;

    this.updateGhost();
    this.updateCursor();
    this.updateInfo();
  }

  private updateGhost(): void {
    const type = this.placing;
    const p = type && this.mouse.inside ? this.groundPoint(this.mouse.x, this.mouse.y) : null;
    if (!type || !p) {
      this.ghost.visible = false;
      this.grid.update(null, PLAYER, 0, 0);
      return;
    }
    const size = BUILDINGS[type].size;
    const c = this.placementCell(p, type);
    this.grid.update(type, PLAYER, c.cx, c.cz);
    this.ghost.visible = true;
    this.ghost.scale.set(size * TILE, 1.2, size * TILE);
    const x = (c.cx + size / 2) * TILE;
    const z = (c.cz + size / 2) * TILE;
    this.ghost.position.set(x, this.game.map.surfaceAt(x, z) + 0.6, z);
    this.ghostMat.color.setHex(this.game.canPlace(type, PLAYER, c.cx, c.cz) ? 0x40ff60 : 0xff4030);
  }

  private updateCursor(): void {
    let cursor = 'default';
    if (this.grab) cursor = 'grabbing';
    else if (this.placing) cursor = 'cell';
    else if (this.attackMode || this.dropMode) cursor = 'crosshair';
    else if (this.mouse.inside && this.ownUnits().length) {
      const t = this.pick(this.mouse.x, this.mouse.y);
      if (t && t.team !== PLAYER) cursor = 'crosshair';
      else cursor = 'pointer';
    }
    this.canvas.style.cursor = cursor;
  }

  private updateInfo(): void {
    const sel = this.selection;
    let text = '';
    if (this.placing) text = `Placing ${BUILDINGS[this.placing].name}. Left-click to place, right-click to cancel.`;
    else if (this.attackMode) text = 'Attack-move: left-click a target or location.';
    else if (this.dropMode) text = 'Drop: left-click where to drop. Vehicles are set down; infantry jump on a fly-by.';
    else if (sel.length === 1) {
      const e = sel[0];
      text = `${e.name}  ${Math.ceil(e.hp)} / ${e.maxHp}`;
      if (e instanceof Unit && e.type === 'harvester') text += `   Spice: ${Math.floor(e.cargo)}`;
      if (e instanceof Building && PRODUCERS.includes(e.type as Producer) && e.team === PLAYER) text += '   Right-click to set a rally point';
      if (e instanceof Carryall && e.team === PLAYER) text += this.carryallInfo(e);
      if (e instanceof Unit && e.def.repair && e.team === PLAYER) text += '   Right-click a damaged vehicle or building to repair it';
      if (e instanceof Building && e.def.garrison) text += `   Infantry inside: ${e.occupants.length} / ${e.def.garrison}${e.team === PLAYER && e.occupants.length ? '   F to unload' : ''}`;
    } else if (sel.length > 1) {
      const counts = new Map<string, number>();
      for (const e of sel) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
      text = [...counts].map(([n, c]) => `${c}× ${n}`).join('   ');
    }
    if (this.paused) text = 'PAUSED (` to resume)';
    if (this.infoEl.textContent !== text) this.infoEl.textContent = text;
    this.infoEl.style.display = text ? 'block' : 'none';
  }
}
