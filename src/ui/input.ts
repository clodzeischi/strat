import * as THREE from 'three';
import type { RTSCamera } from '../render/camera';
import { BUILDINGS, PRODUCERS, TILE, type BuildingType, type Producer, type Team, type UnitType } from '../config';
import { Building, BUILDING_TURN, Carryall, diamondScale, repairable, Unit, type Entity } from '../entities';
import type { Command } from '../game/commands';
import type { Game } from '../game/game';
import { keyLabel } from './keys';
import { PlacementGrid } from './placement';
import { RallyLines } from '../render/rally-lines';

const EDGE = 12; // px from the screen edge that triggers scrolling
const PAN_SPEED = 45;

/**
 * Which kind of unit leads a mixed selection, highest first: its abilities are the ones the command card shows
 * (Tab moves on to the next kind). Roughly the tech tier, so the rarest, most specialised unit comes first.
 */
const TIER: Record<UnitType, number> = { carryall: 6, rocket: 5, repair: 4, tank: 3, trike: 2, infantry: 1, harvester: 0 };

/** One kind of thing in the selection: a unit type or a building type. */
export interface Subgroup {
  key: string;
  name: string;
  members: Entity[];
}

const isProducer = (e: Entity): e is Building => e instanceof Building && PRODUCERS.includes(e.type as Producer);

/** Mouse and keyboard: camera control, selection, commands and building placement. */
export class Input {
  selection: Entity[] = [];
  placing: BuildingType | null = null;
  attackMode = false;
  /** Waiting for a click on where the selected Carryalls should drop their load. */
  dropMode = false;
  /** Waiting for a click on the selected production buildings' new rally point. */
  rallyMode = false;
  paused = false;
  /** Clicks and hotkeys issued, for APM on the end screen. */
  actions = 0;
  /** Called when Esc has nothing else to cancel (opens the in-game menu). */
  onMenu: () => void = () => {};
  /** Sends a command for this player to the game (through the lockstep, which applies it on the next tick it can). */
  issue: (cmd: Command) => void = () => {};
  /** Whether ` pauses: only against the computer. */
  pausable = true;
  /** Called whenever the selection changes (the command card follows it). */
  onSelect: () => void = () => {};

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
  /** Rally points of the selected production buildings. */
  private rallyLines: RallyLines;
  /** The subgroup whose abilities the command card shows (Tab cycles it). */
  private primary: string | null = null;

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
    this.rallyLines = new RallyLines(game.scene, game.map);

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseenter', () => (this.mouse.inside = true));
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Edge scrolling uses the whole window, so the screen edges work even under the HUD.
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

  /** The team this screen plays. */
  get team(): Team {
    return this.game.localTeam;
  }

  beginPlacement(type: BuildingType): void {
    this.disarm();
    this.placing = type;
  }

  /** Drops any armed click mode (attack-move, drop, rally, placement). */
  private disarm(): void {
    this.placing = null;
    this.attackMode = false;
    this.dropMode = false;
    this.rallyMode = false;
  }

  private get armed(): boolean {
    return !!this.placing || this.attackMode || this.dropMode || this.rallyMode;
  }

  // ---- Subgroups ----------------------------------------------------------------

  /** The selection split by kind, the highest tier first (buildings after units). */
  subgroups(): Subgroup[] {
    const by = new Map<string, Subgroup>();
    for (const e of this.selection) {
      const key = e instanceof Unit ? e.type : (e as Building).type;
      const g = by.get(key) ?? { key, name: e.name, members: [] };
      g.members.push(e);
      by.set(key, g);
    }
    const rank = (g: Subgroup) => {
      const e = g.members[0];
      return e instanceof Unit ? TIER[e.type] : -1;
    };
    return [...by.values()].sort((a, b) => rank(b) - rank(a));
  }

  /** The subgroup the command card is showing. */
  active(): Subgroup | null {
    const groups = this.subgroups();
    return groups.find((g) => g.key === this.primary) ?? groups[0] ?? null;
  }

  /** Tab: the next kind in the selection takes over the command card. */
  cycleSubgroup(): void {
    const groups = this.subgroups();
    if (groups.length < 2) return;
    const i = groups.findIndex((g) => g.key === this.active()?.key);
    this.primary = groups[(i + 1) % groups.length].key;
    this.disarm();
    this.onSelect();
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
      if (u.carrier || !this.game.shown(u)) continue;
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
    const b = id ? this.game.buildings.find((b) => b.id === id) : undefined;
    return b?.known ? b : null;
  }

  private setSelection(list: Entity[]): void {
    for (const e of this.selection) e.setSelected(false);
    this.selection = list;
    for (const e of list) e.setSelected(true);
    // A new selection leads with its highest tier; one shrinking (units dying) keeps its current lead if it can.
    if (!this.subgroups().some((g) => g.key === this.primary)) this.primary = null;
    if (this.rallyMode && !this.ownProducers().length) this.rallyMode = false;
    this.onSelect();
  }

  /** Starts a fresh selection (the lead goes back to its highest tier). */
  private select(list: Entity[]): void {
    this.primary = null;
    this.setSelection(list);
  }

  ownUnits(): Unit[] {
    return this.selection.filter((e): e is Unit => e instanceof Unit && e.team === this.team && !e.dead);
  }

  private ownCarryalls(): Carryall[] {
    return this.ownUnits().filter((u): u is Carryall => u instanceof Carryall);
  }

  /** Own selected buildings. */
  ownBuildings(): Building[] {
    return this.selection.filter((b): b is Building => b instanceof Building && b.team === this.team && !b.dead);
  }

  ownProducers(): Building[] {
    return this.ownBuildings().filter(isProducer);
  }

  /** Own selected bunkers with someone inside. */
  private loadedBunkers(): Building[] {
    return this.ownBuildings().filter((b) => b.occupants.length > 0);
  }

  ownBunkers(): Building[] {
    return this.ownBuildings().filter((b) => !!b.def.garrison);
  }

  // ---- Unit commands (from the command card) ------------------------------------

  canAttackMove(): boolean {
    return this.ownUnits().some((u) => u.def.weapon);
  }

  /** Arms attack-move: the next left click picks the target or spot. */
  attackMove(): void {
    if (!this.canAttackMove()) return;
    this.disarm();
    this.attackMode = true;
  }

  canStop(): boolean {
    return this.ownUnits().length > 0;
  }

  stop(): void {
    if (this.canStop()) this.issue({ c: 'stop', units: this.ownUnits().map((u) => u.id) });
  }

  canDrop(): boolean {
    return this.ownCarryalls().some((c) => c.load.length);
  }

  /** Arms drop: the next left click is where the selected Carryalls set down their load. */
  drop(): void {
    if (!this.canDrop()) return;
    this.disarm();
    this.dropMode = true;
  }

  // ---- Building commands (from the command card) --------------------------------

  /** Arms rally: the next left click (on the view or the minimap) sets the selected producers' rally point. */
  rally(): void {
    if (!this.ownProducers().length) return;
    this.disarm();
    this.rallyMode = true;
  }

  private setRally(x: number, z: number): void {
    const producers = this.ownProducers();
    if (!producers.length) return;
    this.issue({ c: 'rally', buildings: producers.map((b) => b.id), x, z });
    this.game.effects.marker(new THREE.Vector3(x, this.game.map.surfaceAt(x, z), z), 0x7cff7c);
  }

  canSalvage(): boolean {
    return this.ownBunkers().some((b) => b.salvage === null);
  }

  /** Salvage progress of the selected bunkers (the furthest along), or null when none is being salvaged. */
  salvageProgress(): number | null {
    const p = this.ownBunkers().map((b) => b.salvage).filter((v): v is number => v !== null);
    return p.length ? Math.max(...p) : null;
  }

  salvage(): void {
    const list = this.ownBunkers().filter((b) => b.salvage === null);
    if (list.length) this.issue({ c: 'salvage', buildings: list.map((b) => b.id) });
  }

  cancelSalvage(): void {
    const list = this.ownBunkers().filter((b) => b.salvage !== null);
    if (list.length) this.issue({ c: 'cancelSalvage', buildings: list.map((b) => b.id) });
  }

  canUnload(): boolean {
    return this.loadedBunkers().length > 0;
  }

  unload(): void {
    const bunkers = this.loadedBunkers();
    if (bunkers.length) this.issue({ c: 'unload', buildings: bunkers.map((b) => b.id) });
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
    if (this.dragStart && !this.armed) {
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
      if (this.armed) this.disarm();
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
      if (this.game.canPlace(this.placing, this.team, c.cx, c.cz)) {
        this.issue({ c: 'place', cx: c.cx, cz: c.cz });
        this.placing = null;
      } else this.game.onMessage('Cannot build there. Structures go on rock, near your base.');
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
    if (this.rallyMode) {
      this.rallyMode = false;
      const g = this.groundPoint(p.x, p.y);
      if (g) this.setRally(g.x, g.z);
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
      if (u.team !== this.team || u.carrier) return false;
      const s = this.toScreen(u.x, u.y + 0.5, u.z);
      return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
    });
    if (add) this.setSelection([...new Set([...this.ownUnits(), ...hits])]);
    else this.select(hits);
  }

  private clickSelect(x: number, y: number, add: boolean): void {
    const e = this.pick(x, y);
    const now = performance.now();
    if (e && e.team === this.team && this.lastClick.id === e.id && now - this.lastClick.time < 350) {
      // Double click: every own unit (or building) of this type on screen.
      const onScreen = (o: Entity) => this.toScreen(o.x, o.y, o.z).visible;
      const same = e instanceof Unit
        ? this.game.units.filter((u) => u.team === this.team && u.type === e.type && !u.carrier && onScreen(u))
        : this.game.buildings.filter((b) => b.team === this.team && b.type === (e as Building).type && onScreen(b));
      this.select(same);
      this.lastClick.id = -1;
      return;
    }
    this.lastClick = { time: now, id: e?.id ?? -1 };
    if (!e) {
      if (!add) this.select([]);
      return;
    }
    if (add && e instanceof Unit && e.team === this.team) {
      const own = this.ownUnits();
      this.setSelection(own.includes(e) ? own.filter((u) => u !== e) : [...own, e]);
    } else {
      this.select([e]);
    }
  }

  /** Right click (or A + left click when `attackMove`): sends a `go` command, and marks the spot right away. */
  private commandAt(x: number, y: number, attackMove = false): void {
    const point = this.groundPoint(x, y);
    if (!point) return;
    this.orderAt(point, this.pick(x, y), attackMove);
  }

  /** A right click's order at a ground point (and on whatever was clicked there): units go, producers rally. */
  private orderAt(point: THREE.Vector3, target: Entity | null, attackMove: boolean): void {
    const g = this.game;
    const team = this.team;
    const units = this.ownUnits();
    if (units.length === 0) {
      this.setRally(point.x, point.z);
      return;
    }
    this.issue({ c: 'go', units: units.map((u) => u.id), x: point.x, z: point.z, target: target?.id ?? null, attack: attackMove });
    if (target && target.team !== team) g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0xff5040);
    else if (target && target.hp < target.maxHp && repairable(target) && units.some((u) => u.def.repair)) {
      g.effects.marker(new THREE.Vector3(target.x, target.y, target.z), 0xffd27a);
    } else if (target && (target instanceof Carryall || target instanceof Building || units.some((u) => u instanceof Carryall))) {
      g.effects.marker(new THREE.Vector3(target.x, g.map.surfaceAt(target.x, target.z), target.z), 0x7cff7c);
    } else g.effects.marker(point, attackMove ? 0xff9040 : 0x7cff7c);
  }

  /** Left click in drop mode: every selected loaded Carryall drops at the spot. */
  private dropAt(x: number, y: number): void {
    const point = this.groundPoint(x, y);
    if (point) this.dropAtPoint(point);
  }

  private dropAtPoint(point: THREE.Vector3): void {
    const loaded = this.ownCarryalls().filter((c) => c.load.length);
    if (!loaded.length) return;
    this.issue({ c: 'drop', units: loaded.map((c) => c.id), x: point.x, z: point.z });
    this.game.effects.marker(point, 0xffb040);
  }

  /**
   * A click on the minimap at world (x, z). Right: the selection's order there (move, or rally for buildings). Left:
   * finishes an armed attack-move, drop or rally there. Returns false for a plain left click (the camera jumps).
   */
  minimapClick(x: number, z: number, button: number): boolean {
    const point = new THREE.Vector3(x, this.game.map.surfaceAt(x, z), z);
    if (button === 2) {
      this.actions++;
      if (this.armed) this.disarm();
      else this.orderAt(point, null, false);
      return true;
    }
    if (button !== 0) return false;
    if (this.attackMode) this.orderAt(point, null, true);
    else if (this.dropMode) this.dropAtPoint(point);
    else if (this.rallyMode) this.setRally(x, z);
    else return false;
    this.actions++;
    this.disarm();
    return true;
  }

  private carryallInfo(c: Carryall): string {
    if (c.task.kind === 'ferry') return `   Ferrying a Harvester${c.load.length ? ' (lifting)' : ''}`;
    if (c.load.length === 0) return '   Empty. Right-click a unit to pick it up';
    const counts = new Map<string, number>();
    for (const u of c.load) counts.set(u.name, (counts.get(u.name) ?? 0) + 1);
    return `   Cargo: ${[...counts].map(([n, k]) => `${k}× ${n}`).join(', ')}   ${keyLabel('KeyD')}: drop`;
  }

  // ---- Keyboard ---------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    const g = this.game;
    if (/^[0-9 ]$/.test(k)) this.actions++;
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        this.groups.set(k, this.ownUnits().length ? this.ownUnits() : this.ownBuildings());
        g.onMessage(`Group ${k} set.`);
      } else {
        const list = (this.groups.get(k) ?? []).filter((u) => !u.dead);
        this.select(list);
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
        if (this.armed) this.disarm();
        else this.onMenu();
        break;
      case 'tab':
        e.preventDefault();
        if (!e.repeat) this.cycleSubgroup();
        break;
      // Hotkeys stay on the left hand (as in Stormgate): the command card's grid (ui/command-card.ts), Space base,
      // ` pause. The right hand is on the mouse; the camera pans with the arrows, screen edges or middle-drag.
      case ' ': {
        e.preventDefault();
        const home = g.buildings.find((b) => b.team === this.team && b.type === 'conyard') ?? g.buildings.find((b) => b.team === this.team);
        if (home) this.cam.lookAt(home.x, home.z);
        break;
      }
      case '`':
        if (this.pausable) this.paused = !this.paused;
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

    const gone = (e: Entity) => e.dead || (e instanceof Unit && (!!e.carrier || !this.game.shown(e)));
    if (this.selection.some(gone)) this.setSelection(this.selection.filter((e) => !gone(e)));
    if (this.dropMode && !this.ownCarryalls().some((c) => c.load.length)) this.dropMode = false;
    if (this.rallyMode && !this.ownProducers().length) this.rallyMode = false;
    if (this.placing && !this.game.teams[this.team].building?.ready) this.placing = null;

    this.updateGhost();
    this.rallyLines.update(this.ownProducers());
    this.updateCursor();
    this.updateInfo();
  }

  private updateGhost(): void {
    const type = this.placing;
    const p = type && this.mouse.inside ? this.groundPoint(this.mouse.x, this.mouse.y) : null;
    if (!type || !p) {
      this.ghost.visible = false;
      this.grid.update(null, this.team, 0, 0);
      return;
    }
    const size = BUILDINGS[type].size;
    const c = this.placementCell(p, type);
    this.grid.update(type, this.team, c.cx, c.cz);
    this.ghost.visible = true;
    // Turned like the buildings themselves, over the square tiles of the placement grid.
    const k = diamondScale(size) * (size * TILE - 0.3);
    this.ghost.scale.set(k, 1.2, k);
    this.ghost.rotation.y = BUILDING_TURN;
    const x = (c.cx + size / 2) * TILE;
    const z = (c.cz + size / 2) * TILE;
    this.ghost.position.set(x, this.game.map.surfaceAt(x, z) + 0.6, z);
    this.ghostMat.color.setHex(this.game.canPlace(type, this.team, c.cx, c.cz) ? 0x40ff60 : 0xff4030);
  }

  private updateCursor(): void {
    let cursor = 'default';
    if (this.grab) cursor = 'grabbing';
    else if (this.placing) cursor = 'cell';
    else if (this.attackMode || this.dropMode || this.rallyMode) cursor = 'crosshair';
    else if (this.mouse.inside && this.ownUnits().length) {
      const t = this.pick(this.mouse.x, this.mouse.y);
      if (t && t.team !== this.team) cursor = 'crosshair';
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
    else if (this.rallyMode) text = 'Rally point: left-click a spot, on the map or the minimap.';
    else if (sel.length === 1) {
      const e = sel[0];
      text = `${e.name}  ${Math.ceil(e.hp)} / ${e.maxHp}`;
      if (e instanceof Unit && e.type === 'harvester') text += `   Spice: ${Math.floor(e.cargo)}`;
      if (isProducer(e) && e.team === this.team) text += '   Right-click to set a rally point';
      if (e instanceof Building && e.salvage !== null) text += `   Salvaging ${Math.floor(e.salvage * 100)}%`;
      if (e instanceof Carryall && e.team === this.team) text += this.carryallInfo(e);
      if (e instanceof Unit && e.def.repair && e.team === this.team) text += '   Right-click a damaged vehicle or building to repair it';
      if (e instanceof Building && e.def.garrison) text += `   Infantry inside: ${e.occupants.length} / ${e.def.garrison}${e.team === this.team && e.occupants.length ? `   ${keyLabel('KeyF')} to unload` : ''}`;
    } else if (sel.length > 1) {
      // Every kind in the selection, the one leading the command card marked; Tab hands the card to the next.
      const groups = this.subgroups();
      const lead = this.active()?.key;
      const html = groups.map((g) => `<span class="${g.key === lead ? 'lead' : ''}">${g.members.length}× ${g.name}</span>`).join('   ');
      const hint = groups.length > 1 ? '   <span class="hint">Tab: next kind</span>' : '';
      this.setInfo(html + hint, true);
      return;
    }
    if (this.paused) text = 'PAUSED (` to resume)';
    this.setInfo(text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), !!text);
  }

  private shownInfo = '';

  private setInfo(html: string, show: boolean): void {
    if (this.paused) {
      html = 'PAUSED (` to resume)';
      show = true;
    }
    if (html !== this.shownInfo) {
      this.shownInfo = html;
      this.infoEl.innerHTML = html;
    }
    this.infoEl.style.display = show ? 'block' : 'none';
  }
}
