import * as THREE from 'three';
import type { RTSCamera } from '../render/camera';
import { CAMP_FULL, CAMP_UPGRADE, HARVEST_UPGRADE, HARVESTER, TEAM_CSS, TILE } from '../config';
import { Building, Unit, type Entity } from '../entities';
import type { Game } from '../game/game';
import { hypot } from '../game/hypot';
import { SPICE } from '../map';
import { tileColor } from '../materials/ground';

/** Screen sizes the HUD is laid out for at 1x; bigger screens scale it up (to at most MAX_SCALE). */
const BASE = { w: 1440, h: 860 };
const MAX_SCALE = 2;

/** The HUD around the view: credits along the top, the minimap bottom right, and messages. */
export class Hud {
  private creditsEl: HTMLElement;
  private shownCredits = -1;
  private incomeTip: HTMLElement;
  private incomeHover = false;
  private incomeTimer = 0;
  /** Spice harvested so far, sampled every second of game time: the last minute's real income. */
  private samples: { t: number; v: number }[] = [];
  private idleBtn: HTMLElement;
  private idleCount: HTMLElement;
  private idleTimer = 0;
  /** Harvesters and Spice Crews with nothing to do, and Spice Camps run dry. */
  private idle: Entity[] = [];
  private idleSet = new Set<Entity>();
  private shownIdle = -1;
  /** Clicking the idle worker button: the next one (or, with `all`, every one) gets selected. */
  onIdle: (list: Entity[], all: boolean) => void = () => {};
  private minimap: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private terrainImg: HTMLCanvasElement;
  private terrainVersion = -1;
  /** Fog of war over the minimap, one pixel per tile, drawn scaled up. */
  private fogImg: HTMLCanvasElement;
  private minimapTimer = 0;
  private messages: HTMLElement;
  /**
   * A click on the minimap at world (x, z) with a mouse button, offered to the controls first (orders, rally points,
   * armed attack-moves). Returning false means it wasn't one, and a left click moves the camera.
   */
  onClick: (x: number, z: number, button: number) => boolean = () => false;

  constructor(private game: Game, private cam: RTSCamera) {
    this.creditsEl = document.getElementById('credits')!;
    this.messages = document.getElementById('messages')!;
    this.incomeTip = document.getElementById('income-tip')!;
    const credits = document.getElementById('credits-box')!;
    credits.addEventListener('mouseenter', () => {
      this.incomeHover = true;
      this.incomeTimer = 0;
    });
    credits.addEventListener('mouseleave', () => {
      this.incomeHover = false;
      this.incomeTip.hidden = true;
    });
    this.idleBtn = document.getElementById('idle-btn')!;
    this.idleCount = this.idleBtn.querySelector('b')!;
    this.idleBtn.addEventListener('click', (e) => this.onIdle(this.idle, e.shiftKey || e.ctrlKey || e.metaKey));
    const scale = () => {
      const k = Math.min(MAX_SCALE, Math.max(1, Math.min(window.innerWidth / BASE.w, window.innerHeight / BASE.h)));
      document.documentElement.style.setProperty('--ui', k.toFixed(3));
    };
    scale();
    window.addEventListener('resize', scale);
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.mctx = this.minimap.getContext('2d')!;
    this.terrainImg = document.createElement('canvas');
    this.terrainImg.width = game.map.size;
    this.terrainImg.height = game.map.size;
    this.fogImg = document.createElement('canvas');
    this.fogImg.width = game.map.size;
    this.fogImg.height = game.map.size;
    this.setupMinimapInput();
  }

  showMessage(text: string): void {
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = text;
    this.messages.appendChild(el);
    while (this.messages.children.length > 4) this.messages.firstChild!.remove();
    setTimeout(() => el.classList.add('fade'), 3500);
    setTimeout(() => el.remove(), 4200);
  }

  update(dt: number): void {
    const credits = Math.floor(this.game.teams[this.game.localTeam].credits);
    if (credits !== this.shownCredits) {
      this.shownCredits = credits;
      this.creditsEl.textContent = credits.toString();
    }
    this.sampleIncome();
    this.incomeTimer -= dt;
    if (this.incomeHover && this.incomeTimer <= 0) {
      this.incomeTimer = 0.5;
      this.drawIncome();
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = 0.25;
      this.findIdle();
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.1;
      this.drawMinimap();
    }
  }

  // ---- Income and idle workers ------------------------------------------------------

  private sampleIncome(): void {
    const g = this.game;
    const v = g.teams[g.localTeam].stats.spiceHarvested;
    const last = this.samples[this.samples.length - 1];
    if (last && last.t > g.time) this.samples = []; // a new game
    if (last && g.time - last.t < 1) return;
    this.samples.push({ t: g.time, v });
    while (this.samples.length > 62) this.samples.shift();
  }

  /**
   * Credits per minute the economy should bring in right now: each working harvester at the pace of its last round
   * trip (before its first one, worked out from the distance it drives), each Spice Camp at its rate for the spice
   * left in reach. Also the counts, for the tooltip.
   */
  income(): { perMin: number; harvesters: number; camps: number; crews: number; lastMin: number | null } {
    const g = this.game;
    const team = g.localTeam;
    const up = g.tier(team, 'harvest');
    const capacity = HARVESTER.capacity * (up ? HARVEST_UPGRADE.capacity : 1);
    let rate = 0;
    let harvesters = 0;
    let crews = 0;
    for (const u of g.units) {
      if (u.team !== team || u.dead) continue;
      if (u.def.camp) crews++;
      if (u.type !== 'harvester' || u.order.kind !== 'harvest') continue;
      harvesters++;
      if (u.tripRate > 0) {
        rate += u.tripRate;
        continue;
      }
      const from = u.spiceCell ? { x: g.map.center(u.spiceCell.cx), z: g.map.center(u.spiceCell.cz) } : u;
      const ref = g.nearestBuilding(team, 'refinery', from.x, from.z);
      if (!ref) continue;
      const drive = (2 * hypot(ref.x - from.x, ref.z - from.z) * 1.3) / u.speed(g);
      rate += capacity / (capacity / HARVESTER.rate + drive + capacity / HARVESTER.unloadRate + 4);
    }
    let camps = 0;
    for (const b of g.buildings) {
      const ex = b.def.extract;
      if (b.team !== team || b.dead || !ex || b.dry) continue;
      camps++;
      let n = 0;
      for (const i of b.reach) if (g.map.tiles[i] === SPICE) n++;
      rate += ex.rate * Math.min(1, n / CAMP_FULL) * (1 + CAMP_UPGRADE * up);
    }
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const span = first && last ? last.t - first.t : 0;
    const lastMin = span >= 10 ? ((last.v - first.v) / span) * 60 : null;
    return { perMin: rate * 60, harvesters, camps, crews, lastMin };
  }

  private drawIncome(): void {
    const inc = this.income();
    const fremen = inc.camps > 0 || (inc.harvesters === 0 && inc.crews > 0);
    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
    const workers = fremen ? `${plural(inc.camps, 'Spice Camp')} working` : `${plural(inc.harvesters, 'Harvester')} working`;
    const idle = this.idle.length ? `<div class="warn">${this.idleText()}</div>` : '';
    const real = inc.lastMin === null ? '' : `<div class="muted">Harvested in the last minute: ${Math.round(inc.lastMin)}</div>`;
    this.incomeTip.innerHTML = `<div class="big">≈ ${Math.round(inc.perMin)} credits / min</div><div>${workers}</div>${idle}${real}`;
    this.incomeTip.hidden = false;
  }

  private idleText(): string {
    const n = (f: (e: Entity) => boolean) => this.idle.filter(f).length;
    const parts: string[] = [];
    const h = n((e) => e instanceof Unit && e.type === 'harvester');
    const c = n((e) => e instanceof Unit && !!e.def.camp);
    const d = n((e) => e instanceof Building);
    if (h) parts.push(`${h} Harvester${h > 1 ? 's' : ''}`);
    if (c) parts.push(`${c} Spice Crew${c > 1 ? 's' : ''}`);
    if (d) parts.push(`${d} dry Spice Camp${d > 1 ? 's' : ''}`);
    return `Idle: ${parts.join(', ')}`;
  }

  private findIdle(): void {
    const g = this.game;
    const team = g.localTeam;
    this.idle = [
      ...g.units.filter((u) => u.team === team && !u.dead && !u.carrier && !u.falling && u.order.kind === 'idle' && !u.queue.length
        && (u.type === 'harvester' || !!u.def.camp)),
      ...g.buildings.filter((b) => b.team === team && !b.dead && !!b.def.extract && b.dry),
    ];
    this.idleSet = new Set(this.idle);
    if (this.idle.length !== this.shownIdle) {
      this.shownIdle = this.idle.length;
      this.idleBtn.hidden = this.idle.length === 0;
      this.idleCount.textContent = `${this.idle.length}`;
      this.idleBtn.title = `${this.idleText()}. Click: select the next one. Shift-click: select them all.`;
    }
  }

  // ---- Minimap -------------------------------------------------------------------

  private setupMinimapInput(): void {
    let down = false;
    const world = (e: MouseEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const size = this.game.map.worldSize();
      const clamp = (v: number) => Math.min(size - 0.01, Math.max(0, v));
      return { x: clamp(((e.clientX - r.left) / r.width) * size), z: clamp(((e.clientY - r.top) / r.height) * size) };
    };
    const move = (e: MouseEvent) => {
      const p = world(e);
      this.cam.lookAt(p.x, p.z);
    };
    this.minimap.addEventListener('mousedown', (e) => {
      const p = world(e);
      if (this.onClick(p.x, p.z, e.button) || e.button !== 0) return;
      down = true;
      move(e);
    });
    window.addEventListener('mousemove', (e) => down && move(e));
    window.addEventListener('mouseup', () => (down = false));
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Darkens what the player can't see, like the ground in the view. */
  private drawFog(ctx: CanvasRenderingContext2D, W: number): void {
    const g = this.game;
    if (g.revealAll) return;
    const N = g.map.size;
    const fctx = this.fogImg.getContext('2d')!;
    const img = fctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) img.data[i * 4 + 3] = Math.round((1 - g.terrain.fogAt(i)) * 255 * 0.9);
    fctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogImg, 0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
  }

  private drawMinimap(): void {
    const g = this.game;
    const map = g.map;
    const N = map.size;
    if (map.version !== this.terrainVersion) {
      this.terrainVersion = map.version;
      const tctx = this.terrainImg.getContext('2d')!;
      const img = tctx.createImageData(N, N);
      const col = new THREE.Color();
      for (let cz = 0; cz < N; cz++) {
        for (let cx = 0; cx < N; cx++) {
          tileColor(map, cx, cz, col);
          const o = (cz * N + cx) * 4;
          img.data[o] = col.r * 255;
          img.data[o + 1] = col.g * 255;
          img.data[o + 2] = col.b * 255;
          img.data[o + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
    }
    const ctx = this.mctx;
    const W = this.minimap.width;
    const s = W / N; // px per tile
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainImg, 0, 0, W, W);
    this.drawFog(ctx, W);

    const px1 = W / 240; // the dots were sized for a 240 px minimap
    const flash = Math.floor(performance.now() / 400) % 2 === 0;
    for (const b of g.buildings) {
      if (!b.known) continue;
      ctx.fillStyle = flash && this.idleSet.has(b) ? '#ffe040' : TEAM_CSS[b.team];
      ctx.fillRect(b.cx * s, b.cz * s, b.size * s, b.size * s);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = px1;
      ctx.strokeRect(b.cx * s + 0.5 * px1, b.cz * s + 0.5 * px1, b.size * s - px1, b.size * s - px1);
    }
    for (const u of g.units) {
      if (u.carrier || !g.shown(u)) continue;
      const idle = this.idleSet.has(u);
      ctx.fillStyle = idle && flash ? '#ffe040' : u.selected ? '#ffffff' : TEAM_CSS[u.team];
      const px = (u.x / TILE) * s;
      const pz = (u.z / TILE) * s;
      const r = (idle ? 2.5 : 1.5) * px1;
      ctx.fillRect(px - r, pz - r, 2 * r, 2 * r);
    }

    // Camera footprint: where the four screen corners hit the ground.
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pts: THREE.Vector3[] = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), this.cam.camera);
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) pts.push(p);
    }
    if (pts.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = px1;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (p.x / TILE) * s;
        const y = (p.z / TILE) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
}
