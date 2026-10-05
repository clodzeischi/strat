import * as THREE from 'three';
import type { RTSCamera } from './camera';
import {
  BUILDING_ORDER, BUILDINGS, LEVEL_UP_ORDER, PLAYER, TEAM_CSS, TILE, UNIT_ORDER, UNITS, UPGRADE_ORDER, UPGRADES,
  reqName, type BuildingType, type LevelUpType, type Req, type UnitType, type UpgradeType, type WeaponDef,
} from './config';
import type { Game } from './game';
import type { Input } from './input';
import { tileColor } from './terrain';

const C = 'currentColor';
const SAND = '#c9b48a';
const DARK = '#3a3a3e';
const METAL = '#8a8a86';

const STAR = `<polygon points="20,4 24,16 36,16 26,23 30,35 20,27 10,35 14,23 4,16 16,16" fill="#e0902a"/>`;
const SHIELD = `<path d="M20 4 L34 9 L32 24 Q28 32 20 36 Q12 32 8 24 L6 9 Z" fill="${METAL}"/><path d="M20 9 L29 12 L28 23 Q25 29 20 31 Z" fill="${C}"/>`;
/** Roman-numeral pips in the corner for tiered upgrades. */
const tierMark = (n: number) => Array.from({ length: n }, (_, i) => `<rect x="${30 - i * 5}" y="30" width="3" height="8" fill="#fff" stroke="${DARK}" stroke-width="0.8"/>`).join('');

const ICONS: Record<BuildingType | UnitType | UpgradeType, string> = {
  barracks: `<rect x="3" y="27" width="34" height="7" fill="#9c968a"/><rect x="6" y="15" width="28" height="13" fill="${SAND}"/><rect x="5" y="12" width="30" height="4" fill="${C}"/><rect x="16" y="20" width="8" height="8" fill="${DARK}"/><rect x="31" y="3" width="1.5" height="10" fill="${DARK}"/><rect x="32.5" y="3" width="6" height="4" fill="${C}"/><rect x="3" y="29" width="7" height="4" rx="2" fill="#a89060"/><rect x="30" y="29" width="7" height="4" rx="2" fill="#a89060"/>`,
  conyard: `<rect x="3" y="24" width="34" height="10" fill="#9c968a"/><rect x="6" y="14" width="18" height="11" fill="${SAND}"/><rect x="6" y="12" width="18" height="3" fill="${C}"/><rect x="28" y="5" width="2.5" height="20" fill="#e0b030"/><rect x="17" y="5" width="20" height="2.5" fill="#e0b030"/><rect x="35" y="7" width="1" height="8" fill="${DARK}"/>`,
  refinery: `<rect x="3" y="26" width="34" height="8" fill="#9c968a"/><rect x="5" y="15" width="16" height="12" fill="${SAND}"/><rect x="5" y="13" width="16" height="3" fill="${C}"/><rect x="24" y="8" width="8" height="19" fill="${METAL}"/><rect x="24" y="7" width="8" height="3" fill="${C}"/><rect x="33" y="14" width="5" height="13" fill="${METAL}"/>`,
  factory: `<rect x="2" y="26" width="36" height="8" fill="#9c968a"/><rect x="5" y="16" width="30" height="11" fill="${SAND}"/><polygon points="5,16 20,8 35,16" fill="${C}"/><rect x="14" y="19" width="12" height="8" fill="${DARK}"/>`,
  harvester: `<rect x="4" y="26" width="32" height="5" fill="${DARK}"/><rect x="5" y="20" width="30" height="6" fill="${METAL}"/><rect x="6" y="11" width="17" height="10" fill="#d08a3a"/><rect x="25" y="12" width="9" height="9" fill="${C}"/>`,
  infantry: `<circle cx="20" cy="9" r="4" fill="#d8b38a"/><rect x="15" y="13" width="10" height="13" fill="${C}"/><rect x="15" y="26" width="4" height="9" fill="${DARK}"/><rect x="21" y="26" width="4" height="9" fill="${DARK}"/><rect x="22" y="17" width="13" height="2" fill="${DARK}"/>`,
  trike: `<circle cx="9" cy="28" r="5" fill="${DARK}"/><circle cx="31" cy="28" r="5" fill="${DARK}"/><rect x="8" y="19" width="24" height="6" fill="${C}"/><rect x="12" y="14" width="8" height="5" fill="${DARK}"/><rect x="22" y="15" width="13" height="2" fill="${DARK}"/>`,
  tank: `<rect x="3" y="25" width="34" height="8" rx="3" fill="${DARK}"/><rect x="5" y="19" width="30" height="7" fill="${C}" opacity="0.7"/><rect x="11" y="12" width="14" height="8" fill="${C}"/><rect x="24" y="14.5" width="14" height="2.5" fill="${METAL}"/>`,
  rocket: `<rect x="3" y="27" width="34" height="7" rx="3" fill="${DARK}"/><rect x="5" y="21" width="30" height="7" fill="${C}" opacity="0.7"/><g transform="rotate(-25 18 18)"><rect x="8" y="12" width="20" height="8" fill="${C}"/><circle cx="28" cy="14" r="1.6" fill="${DARK}"/><circle cx="28" cy="18" r="1.6" fill="${DARK}"/></g>`,
  rockets: `<rect x="6" y="17" width="22" height="6" rx="1" fill="${METAL}"/><polygon points="28,15 36,20 28,25" fill="#e0902a"/><rect x="2" y="18" width="5" height="4" fill="${DARK}"/><rect x="12" y="23" width="3" height="8" fill="${DARK}"/><circle cx="20" cy="9" r="4" fill="#d8b38a"/>`,
  weapons1: STAR + tierMark(1),
  weapons2: STAR + tierMark(2),
  armor1: SHIELD + tierMark(1),
  armor2: SHIELD + tierMark(2),
  nitro: `<circle cx="9" cy="29" r="5" fill="${DARK}"/><circle cx="29" cy="29" r="5" fill="${DARK}"/><rect x="8" y="20" width="22" height="6" fill="${C}"/><polygon points="2,12 14,12 10,16 22,16 8,22 11,17 2,17" fill="#e0b030"/><rect x="24" y="16" width="12" height="2" fill="${DARK}"/>`,
  harvest: `<rect x="6" y="18" width="28" height="14" fill="#d08a3a"/><polygon points="20,4 30,16 24,16 24,22 16,22 16,16 10,16" fill="#7cff7c"/>`,
};

/** Green chevrons over the building icon mark a level-2 upgrade. */
const CHEVRON = `<polyline points="26,14 32,8 38,14" fill="none" stroke="#7cff7c" stroke-width="2.5"/><polyline points="26,20 32,14 38,20" fill="none" stroke="#7cff7c" stroke-width="2.5"/>`;
const ALL_ICONS = { ...ICONS, conyard2: ICONS.conyard + CHEVRON, factory2: ICONS.factory + CHEVRON };

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

function weaponLine(w: WeaponDef): string {
  const bonus = Object.entries(w.bonus).map(([t, v]) => `${v! > 0 ? '+' : ''}${v} vs ${cap(t)}`).join(', ');
  const range = w.minRange ? `${w.minRange / TILE}-${w.range / TILE}` : `${w.range / TILE}`;
  return `Damage ${w.damage}${bonus ? ` (${bonus})` : ''}  Range ${range} tiles`;
}

const reqList = (reqs: Req[]) => reqs.map(reqName).join(', ');

function icon(key: keyof typeof ALL_ICONS): string {
  return `<svg viewBox="0 0 40 40" style="color:${TEAM_CSS[PLAYER]}">${ALL_ICONS[key]}</svg>`;
}

interface Card {
  el: HTMLElement;
  wipe: HTMLElement;
  badge: HTMLElement;
  status: HTMLElement;
  cost: HTMLElement;
  state: string;
}

/** Dune 2000 style right bar: credits, radar, structures column and units column (upgrades at the bottom). */
export class Sidebar {
  private cards = new Map<string, Card>();
  private creditsEl: HTMLElement;
  private shownCredits = -1;
  private minimap: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private terrainImg: HTMLCanvasElement;
  private terrainVersion = -1;
  private minimapTimer = 0;
  private messages: HTMLElement;

  constructor(private game: Game, private input: Input, private cam: RTSCamera) {
    this.creditsEl = document.getElementById('credits')!;
    this.messages = document.getElementById('messages')!;
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.mctx = this.minimap.getContext('2d')!;
    this.terrainImg = document.createElement('canvas');
    this.terrainImg.width = game.map.size;
    this.terrainImg.height = game.map.size;

    const buildCol = document.getElementById('col-build')!;
    const unitCol = document.getElementById('col-units')!;
    const upgradeCol = document.getElementById('col-upgrades')!;
    for (const t of BUILDING_ORDER) buildCol.appendChild(this.makeCard(`b:${t}`, t, BUILDINGS[t].short, BUILDINGS[t].cost, this.tooltipBuilding(t)));
    for (const t of UNIT_ORDER) unitCol.appendChild(this.makeCard(`u:${t}`, t, UNITS[t].name, UNITS[t].cost, this.tooltipUnit(t)));
    for (const t of LEVEL_UP_ORDER) {
      const up = BUILDINGS[t].levelUp!;
      upgradeCol.appendChild(this.makeCard(`l:${t}`, `${t}2`, up.short, up.cost, `${up.name} ($${up.cost})\n${up.desc}\nRight-click to cancel.`));
    }
    for (const t of UPGRADE_ORDER) upgradeCol.appendChild(this.makeCard(`g:${t}`, t, UPGRADES[t].short, UPGRADES[t].cost, this.tooltipUpgrade(t)));

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

  // ---- Cards -------------------------------------------------------------------

  private makeCard(key: string, type: keyof typeof ALL_ICONS, name: string, cost: number, tip: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card';
    el.title = tip;
    el.innerHTML = `<div class="icon">${icon(type)}</div><div class="meta"><div class="name">${name}</div><div class="cost">$${cost}</div></div><div class="wipe"></div><div class="badge"></div><div class="status"></div>`;
    const card: Card = {
      el,
      wipe: el.querySelector('.wipe')!,
      badge: el.querySelector('.badge')!,
      status: el.querySelector('.status')!,
      cost: el.querySelector('.cost')!,
      state: '',
    };
    this.cards.set(key, card);
    el.addEventListener('click', () => this.onCardClick(key));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onCardRightClick(key);
    });
    return el;
  }

  private onCardClick(key: string): void {
    this.input.actions++;
    const [kind, type] = key.split(':');
    const g = this.game;
    const ts = g.teams[PLAYER];
    if (kind === 'b') {
      const t = type as BuildingType;
      if (ts.building) {
        if (ts.building.type === t && ts.building.ready) this.input.beginPlacement(t);
        else if (ts.building.type !== t) this.showMessage(`Already building ${BUILDINGS[ts.building.type].name}.`);
      } else if (g.canBuild(PLAYER, t)) {
        g.startBuilding(PLAYER, t);
      }
    } else if (kind === 'u') {
      g.queueUnit(PLAYER, type as UnitType);
    } else if (kind === 'g') {
      const t = type as UpgradeType;
      if (ts.research && ts.research.type !== t) this.showMessage(`Already researching ${UPGRADES[ts.research.type].name}.`);
      else if (!ts.research) g.startResearch(PLAYER, t);
    } else if (kind === 'l') {
      const t = type as LevelUpType;
      if (!ts.levelUps[t]) g.startLevelUp(PLAYER, t);
    }
  }

  private onCardRightClick(key: string): void {
    const [kind, type] = key.split(':');
    const g = this.game;
    const ts = g.teams[PLAYER];
    if (kind === 'b' && ts.building?.type === type) {
      g.cancelBuilding(PLAYER);
      this.input.placing = null;
    } else if (kind === 'u') {
      g.dequeueUnit(PLAYER, type as UnitType);
    } else if (kind === 'g' && ts.research?.type === type) {
      g.cancelResearch(PLAYER);
    } else if (kind === 'l') {
      g.cancelLevelUp(PLAYER, type as LevelUpType);
    }
  }

  private tooltipBuilding(t: BuildingType): string {
    const d = BUILDINGS[t];
    const req = d.requires.length ? `\nRequires: ${reqList(d.requires)}` : '';
    return `${d.name} ($${d.cost})\n${d.desc}\nHP ${d.hp}${req}\nRight-click to cancel.`;
  }

  private tooltipUnit(t: UnitType): string {
    const d = UNITS[t];
    const w = d.weapon ? `\n${weaponLine(d.weapon)}` : '';
    const anti = d.antiArmor ? `\nRockets (upgrade): ${weaponLine(d.antiArmor)}` : '';
    const req = `\nBuilt at: ${BUILDINGS[d.producer].name}`;
    return `${d.name} ($${d.cost})  [${d.tags.map(cap).join(', ')}]\n${d.desc}\nHP ${d.hp}  Speed ${d.speed}${w}${anti}${req}\nRight-click to remove from queue.`;
  }

  private tooltipUpgrade(t: UpgradeType): string {
    const d = UPGRADES[t];
    const after = d.after ? `, ${UPGRADES[d.after].name}` : '';
    return `${d.name} upgrade ($${d.cost})\n${d.desc}\nRequires: ${reqList(d.requires)}${after}`;
  }

  /** Hidden cards are ones not yet unlocked or already finished. */
  private setCard(key: string, opts: { hidden: boolean; disabled: boolean; progress: number | null; badge: string; status: string; extra: string; cost: number }): void {
    const c = this.cards.get(key)!;
    const ts = this.game.teams[PLAYER];
    const poor = ts.credits < opts.cost;
    const p = opts.progress === null ? -1 : Math.floor(opts.progress * 72);
    const state = `${opts.hidden}|${opts.disabled}|${p}|${opts.badge}|${opts.status}|${opts.extra}|${poor}`;
    if (state === c.state) return;
    c.state = state;
    c.el.className = `card${opts.disabled ? ' disabled' : ''}${opts.extra ? ` ${opts.extra}` : ''}`;
    c.el.style.display = opts.hidden ? 'none' : '';
    c.cost.classList.toggle('poor', poor);
    if (opts.progress === null) {
      c.wipe.style.display = 'none';
    } else {
      const deg = opts.progress * 360;
      c.wipe.style.display = 'block';
      c.wipe.style.background = `conic-gradient(transparent ${deg}deg, rgba(0,0,0,0.62) ${deg}deg)`;
    }
    c.badge.textContent = opts.badge;
    c.badge.style.display = opts.badge ? 'block' : 'none';
    c.status.textContent = opts.status;
    c.status.style.display = opts.status ? 'block' : 'none';
  }

  // ---- Per frame ---------------------------------------------------------------

  update(dt: number): void {
    const g = this.game;
    const ts = g.teams[PLAYER];
    const credits = Math.floor(ts.credits);
    if (credits !== this.shownCredits) {
      this.shownCredits = credits;
      this.creditsEl.textContent = credits.toString();
    }

    for (const t of BUILDING_ORDER) {
      const b = ts.building;
      const mine = b?.type === t;
      this.setCard(`b:${t}`, {
        hidden: !mine && !g.requirementsMet(PLAYER, BUILDINGS[t].requires),
        disabled: !g.canBuild(PLAYER, t) || (!!b && !mine),
        progress: mine && !b!.ready ? b!.progress : null,
        badge: '',
        status: mine && b!.ready ? (this.input.placing === t ? 'PLACING' : 'READY') : '',
        extra: mine && b!.ready ? 'ready' : '',
        cost: BUILDINGS[t].cost,
      });
    }
    for (const t of UNIT_ORDER) {
      const p = UNITS[t].producer;
      const queue = ts.queues[p];
      const lines = g.activeLines(PLAYER, p);
      const queued = queue.filter((q) => q.type === t).length;
      const building = queue.slice(0, lines).filter((q) => q.type === t);
      this.setCard(`u:${t}`, {
        hidden: !queued && !g.requirementsMet(PLAYER, UNITS[t].requires),
        disabled: !g.canTrain(PLAYER, t),
        progress: queued ? Math.max(0, ...building.map((q) => q.progress)) : null,
        badge: queued > 1 ? `${queued}` : '',
        status: '',
        extra: '',
        cost: UNITS[t].cost,
      });
    }
    for (const t of LEVEL_UP_ORDER) {
      const l = ts.levelUps[t];
      this.setCard(`l:${t}`, {
        hidden: !l && !g.canLevelUp(PLAYER, t),
        disabled: false,
        progress: l ? l.progress : null,
        badge: '',
        status: '',
        extra: '',
        cost: BUILDINGS[t].levelUp!.cost,
      });
    }
    for (const t of UPGRADE_ORDER) {
      const r = ts.research;
      const mine = r?.type === t;
      this.setCard(`g:${t}`, {
        hidden: !mine && !g.canResearch(PLAYER, t),
        disabled: !!r && !mine,
        progress: mine ? r!.progress : null,
        badge: '',
        status: '',
        extra: '',
        cost: UPGRADES[t].cost,
      });
    }

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.1;
      this.drawMinimap();
    }
  }

  // ---- Minimap -------------------------------------------------------------------

  private setupMinimapInput(): void {
    let down = false;
    const move = (e: MouseEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const world = this.game.map.worldSize();
      this.cam.lookAt(((e.clientX - r.left) / r.width) * world, ((e.clientY - r.top) / r.height) * world);
    };
    this.minimap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      down = true;
      move(e);
    });
    window.addEventListener('mousemove', (e) => down && move(e));
    window.addEventListener('mouseup', () => (down = false));
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
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

    for (const b of g.buildings) {
      ctx.fillStyle = TEAM_CSS[b.team];
      ctx.fillRect(b.cx * s, b.cz * s, b.size * s, b.size * s);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeRect(b.cx * s + 0.5, b.cz * s + 0.5, b.size * s - 1, b.size * s - 1);
    }
    for (const u of g.units) {
      ctx.fillStyle = u.selected ? '#ffffff' : TEAM_CSS[u.team];
      const px = (u.x / TILE) * s;
      const pz = (u.z / TILE) * s;
      ctx.fillRect(px - 1.5, pz - 1.5, 3, 3);
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
      ctx.lineWidth = 1;
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
